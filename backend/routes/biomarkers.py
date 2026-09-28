import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Header

from schemas.biomarkers import BiometricSyncPayload
from services.metabolic_service import recalculate_daily_targets

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/user/biometrics",
    tags=["Biometrics"]
)


@router.post("/sync")
async def sync_biometrics(
    payload: BiometricSyncPayload,
    authorization: Optional[str] = Header(None)
):
    """
    POST /api/user/biometrics/sync
    Ingests wearable/manual biometric data, enforces DPDP consent,
    and recalculates daily nutritional targets via Mifflin-St Jeor.
    """
    import sys
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod is None:
        raise HTTPException(status_code=503, detail="Application not initialized")

    # --- Auth: Firebase UID from token, never from payload ---
    uid = await main_mod.get_current_user_id(authorization)

    users_col = main_mod.users_collection
    bio_col = main_mod.db["user_biometrics"]

    user = await users_col.find_one({"uid": uid})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    # --- DPDP Consent Gate ---
    consent = user.get("health_vault_consent", {})
    if consent.get("status") != "granted" or str(consent.get("version")) != "1.0":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "CONSENT_REQUIRED", "message": "Biometric data consent is required."}
        )

    # --- Future date rejection ---
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if payload.recorded_date > today_str:
        raise HTTPException(status_code=422, detail="recorded_date cannot be in the future.")

    # --- Source priority: apple_healthkit > google_health_connect > manual ---
    source_priority = {
        "apple_healthkit": 3,
        "google_health_connect": 2,
        "manual": 1
    }

    existing = await bio_col.find_one({
        "uid": uid,
        "recorded_date": payload.recorded_date
    })

    if existing:
        existing_source = existing.get("source", "manual")
        if source_priority[payload.source] < source_priority.get(existing_source, 1):
            return {
                "success": True,
                "recorded_date": payload.recorded_date,
                "source": existing_source,
                "biometrics": {
                    "step_count": existing.get("step_count"),
                    "active_energy_burned_kcal": existing.get("active_energy_burned_kcal"),
                    "resting_heart_rate_bpm": existing.get("resting_heart_rate_bpm")
                },
                "message": "Ignored lower-priority source payload."
            }

    now_ts = datetime.now(timezone.utc).isoformat()

    biometric_doc = {
        "uid": uid,
        "recorded_date": payload.recorded_date,
        "source": payload.source,
        "step_count": payload.step_count,
        "active_energy_burned_kcal": payload.active_energy_burned_kcal,
        "resting_heart_rate_bpm": payload.resting_heart_rate_bpm,
        "updated_at": now_ts
    }

    # Atomic Upsert — idempotent on (uid, recorded_date)
    await bio_col.update_one(
        {"uid": uid, "recorded_date": payload.recorded_date},
        {
            "$set": biometric_doc,
            "$setOnInsert": {"created_at": now_ts}
        },
        upsert=True
    )

    # Metabolic Recalculation
    daily_targets = recalculate_daily_targets(user, biometric_doc)

    # Persist adjusted targets if the sync is for today
    if payload.recorded_date == today_str:
        await users_col.update_one(
            {"uid": uid},
            {"$set": {"daily_goals": daily_targets}}
        )

    return {
        "success": True,
        "recorded_date": payload.recorded_date,
        "source": payload.source,
        "biometrics": {
            "step_count": payload.step_count,
            "active_energy_burned_kcal": payload.active_energy_burned_kcal,
            "resting_heart_rate_bpm": payload.resting_heart_rate_bpm
        },
        "daily_targets": daily_targets
    }
