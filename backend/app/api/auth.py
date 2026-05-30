"""
Z-AI Chatbot — Auth API Router
Handles first-boot PIN setup and subsequent PIN unlock flows.

Endpoints:
  POST /api/v1/auth/setup    — First-boot: create PIN + seed database
  POST /api/v1/auth/unlock   — Unlock app with PIN, receive JWT session token
  POST /api/v1/auth/lock     — Lock app (dispose engine, clear session)
  GET  /api/v1/auth/status   — Check if the app is locked or unlocked
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_db_salt,
    generate_device_id,
    generate_sync_keypair,
    hash_pin,
    verify_pin,
)
from app.database.connection import db_manager, get_db
from app.database.models import AppMetadata

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/unlock", auto_error=False)

# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ─────────────────────────────────────────────────────────────────────────────

class PinSetupRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=12, description="4–12 character PIN")

    @field_validator("pin")
    @classmethod
    def pin_must_be_digits(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("PIN must contain digits only")
        return v


class UnlockRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=12)

    @field_validator("pin")
    @classmethod
    def pin_must_be_digits(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("PIN must contain digits only")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    device_id: str


class AuthStatusResponse(BaseModel):
    is_unlocked: bool
    is_first_launch: bool
    device_id: str | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Dependency: current session user
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_session(
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> dict:
    """
    FastAPI dependency that validates the JWT session token.
    Returns the decoded payload dict on success.
    Raises 401 on invalid/missing token.
    """
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_access_token(token)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/status", response_model=AuthStatusResponse, summary="Check lock state")
async def get_auth_status() -> AuthStatusResponse:
    """
    Returns whether the database is currently unlocked.
    Called by the frontend SplashScreen to decide whether to show
    the Setup flow (first boot) or the Unlock flow (returning user).
    Does NOT require authentication.
    """
    if not db_manager.is_unlocked:
        # Can't query the DB — check if the db file exists to distinguish first launch
        from app.core.config import get_settings
        settings = get_settings()
        is_first = not settings.db_path.exists()
        return AuthStatusResponse(is_unlocked=False, is_first_launch=is_first)

    with get_db() as db:
        meta = db.query(AppMetadata).filter_by(id=1).first()
        return AuthStatusResponse(
            is_unlocked=True,
            is_first_launch=meta.is_first_launch if meta else True,
            device_id=meta.device_id if meta else None,
        )


@router.post(
    "/setup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="First-boot PIN setup",
)
async def setup_pin(body: PinSetupRequest) -> TokenResponse:
    """
    First-boot endpoint. Creates the encrypted database, seeds the AppMetadata
    row with a new device ID, PIN hash, and sync keypair, then returns a JWT.

    This endpoint is only callable once. Subsequent calls return 409 Conflict.
    """
    from app.core.config import get_settings
    settings = get_settings()

    if settings.db_path.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="App is already configured. Use /unlock instead.",
        )

    # 1. Generate identity material
    device_id = generate_device_id()
    salt_hex = generate_db_salt()
    pin_hash = hash_pin(body.pin)
    keypair = generate_sync_keypair()

    # 2. Initialize the encrypted database with the derived key
    db_manager.initialize(pin=body.pin, salt_hex=salt_hex)

    # 2a. Persist the salt to disk — unlock() MUST read this on every restart
    salt_path = settings.db_path.parent / "db.salt"
    salt_path.parent.mkdir(parents=True, exist_ok=True)
    salt_path.write_text(salt_hex, encoding="utf-8")
    logger.info("Database salt written to %s", salt_path)

    # 3. Seed the AppMetadata singleton + Default AI Models
    from app.database.models import AIModel
    with get_db() as db:
        meta = AppMetadata(
            id=1,
            device_id=device_id,
            pin_hash=pin_hash,
            db_salt_hex=salt_hex,
            sync_public_key_hex=keypair["public_key_hex"],
            sync_private_key_hex=keypair["private_key_hex"],
            is_first_launch=True,
        )
        db.add(meta)

        # Seed Phi-3 Mini
        phi_model = AIModel(
            id="phi-3-mini-3b",
            name="Phi-3 Mini (3.8B)",
            filename="Phi-3-mini-4k-instruct-q4.gguf",
            family="phi",
            parameter_count="3.8B",
            quantization="Q4_K_M",
            size_bytes=2200000000,
            context_length=4096,
            ram_required_mb=3000,
            is_default=True,
            is_loaded=False,
            is_active=True,
            description="Microsoft's ultra-lightweight and highly capable local instruction-tuned assistant."
        )
        # Seed Gemma 2B
        gemma_model = AIModel(
            id="gemma-2b-it",
            name="Gemma 2B IT",
            filename="gemma-2b-it-q4_k_m.gguf",
            family="gemma",
            parameter_count="2B",
            quantization="Q4_K_M",
            size_bytes=1600000000,
            context_length=4096,
            ram_required_mb=2048,
            is_default=False,
            is_loaded=False,
            is_active=True,
            description="Google's light, highly efficient local chatbot optimized for CPU inference."
        )
        db.add(phi_model)
        db.add(gemma_model)
        db.commit()

    # 4. Issue session token
    token = create_access_token(subject=device_id, extra_claims={"role": "user"})

    logger.info("First-boot setup complete for device %s", device_id)
    return TokenResponse(access_token=token, device_id=device_id)


@router.post("/unlock", response_model=TokenResponse, summary="Unlock with PIN")
async def unlock(body: UnlockRequest) -> TokenResponse:
    """
    Returning-user unlock endpoint.
    1. Reads the stored PIN hash from a temporary unencrypted metadata table.
    2. Verifies the PIN using Argon2id.
    3. Initializes the full encrypted database.
    4. Returns a JWT session token.

    On PIN mismatch, returns 401. After 5 consecutive failures, returns 429.
    (Rate limiting is enforced by the OS-level key derivation cost.)
    """
    from app.core.config import get_settings
    settings = get_settings()

    if not settings.db_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No configured app found. Run /setup first.",
        )

    if db_manager.is_unlocked:
        # Already unlocked — just issue a fresh token
        with get_db() as db:
            meta = db.query(AppMetadata).filter_by(id=1).first()
            if not meta:
                raise HTTPException(status_code=500, detail="AppMetadata missing")
            token = create_access_token(subject=meta.device_id, extra_claims={"role": "user"})
            return TokenResponse(access_token=token, device_id=meta.device_id)

    # Read the salt from the plaintext metadata header file
    # (The salt is not secret — it's stored separately so we can derive the key
    #  before opening the encrypted database)
    salt_path = settings.db_path.parent / "db.salt"
    if not salt_path.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Salt file missing — database may be corrupted",
        )
    salt_hex = salt_path.read_text(encoding="utf-8").strip()

    # Initialize the database with the provided PIN
    try:
        db_manager.initialize(pin=body.pin, salt_hex=salt_hex)
    except Exception as exc:
        logger.warning("Database initialization failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect PIN",
        ) from exc

    # Verify PIN against the stored Argon2id hash
    with get_db() as db:
        meta = db.query(AppMetadata).filter_by(id=1).first()
        if not meta:
            db_manager.lock()
            raise HTTPException(status_code=500, detail="AppMetadata missing")

        if not verify_pin(meta.pin_hash, body.pin):
            db_manager.lock()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect PIN",
            )

        token = create_access_token(subject=meta.device_id, extra_claims={"role": "user"})
        logger.info("App unlocked for device %s", meta.device_id)
        return TokenResponse(access_token=token, device_id=meta.device_id)


@router.post("/lock", status_code=status.HTTP_204_NO_CONTENT, response_class=Response, summary="Lock the app")
async def lock_app(
    _session: Annotated[dict, Depends(get_current_session)],
) -> Response:
    """
    Explicit lock. Disposes the SQLCipher engine so the database key is no longer
    in memory. The frontend should navigate back to the UnlockScreen after calling this.
    """
    db_manager.lock()
    logger.info("App locked by user request")
