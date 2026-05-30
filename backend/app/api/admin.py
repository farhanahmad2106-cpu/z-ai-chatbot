# Z-AI Chatbot — Admin Management API Router
from __future__ import annotations
import json
import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import require_admin_key
from app.database.connection import get_db
from app.database.models import FeatureFlag, Conversation, Message

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

class FeatureFlagResponse(BaseModel):
    id: str
    flag_key: str
    flag_value: str
    is_enabled: bool
    description: str | None
    pushed_by: str
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True

class FeatureFlagCreate(BaseModel):
    flag_key: str = Field(..., min_length=1, max_length=100)
    flag_value: str = Field(default="true")
    is_enabled: bool = True
    description: str | None = None

class SystemSummaryResponse(BaseModel):
    total_conversations: int
    total_messages: int
    active_flags: int
    system_status: str

# ─────────────────────────────────────────────────────────────────────────────
# Endpoints (All strictly locked behind require_admin_key)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=SystemSummaryResponse)
async def get_system_summary(
    _admin: Annotated[str, Depends(require_admin_key)],
    db: Session = Depends(get_db)
):
    """Get system summary metrics for the Admin Dashboard."""
    convs = db.query(Conversation).count()
    msgs = db.query(Message).count()
    flags = db.query(FeatureFlag).filter_by(is_enabled=True).count()
    return SystemSummaryResponse(
        total_conversations=convs,
        total_messages=msgs,
        active_flags=flags,
        system_status="ONLINE"
    )

@router.get("/feature-flags", response_model=list[FeatureFlagResponse])
async def list_feature_flags(
    _admin: Annotated[str, Depends(require_admin_key)],
    db: Session = Depends(get_db)
):
    """List all registered remote config feature flags."""
    return db.query(FeatureFlag).all()

@router.post("/feature-flags", response_model=FeatureFlagResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_feature_flag(
    body: FeatureFlagCreate,
    _admin: Annotated[str, Depends(require_admin_key)],
    db: Session = Depends(get_db)
):
    """Push or update a remote config feature flag."""
    flag = db.query(FeatureFlag).filter_by(flag_key=body.flag_key).first()
    if flag:
        # Update existing
        flag.flag_value = body.flag_value
        flag.is_enabled = body.is_enabled
        if body.description:
            flag.description = body.description
    else:
        # Create new
        flag = FeatureFlag(
            flag_key=body.flag_key,
            flag_value=body.flag_value,
            is_enabled=body.is_enabled,
            description=body.description,
            pushed_by="admin"
        )
        db.add(flag)
    db.commit()
    db.refresh(flag)
    return flag

@router.post("/feature-flags/{flag_key}/toggle", response_model=FeatureFlagResponse)
async def toggle_feature_flag(
    flag_key: str,
    _admin: Annotated[str, Depends(require_admin_key)],
    db: Session = Depends(get_db)
):
    """Instantly enable/disable a feature flag."""
    flag = db.query(FeatureFlag).filter_by(flag_key=flag_key).first()
    if not flag:
        raise HTTPException(status_code=404, detail="Feature flag not found")
    
    flag.is_enabled = not flag.is_enabled
    db.commit()
    db.refresh(flag)
    return flag

@router.get("/diagnostics/logs")
async def list_diagnostic_logs(
    _admin: Annotated[str, Depends(require_admin_key)]
):
    """Mock server warnings and diagnostic crash files logs."""
    return [
        {"timestamp": "2026-05-29T21:30:12", "level": "WARNING", "message": "Inference memory buffer reached 82% capacity."},
        {"timestamp": "2026-05-29T21:32:04", "level": "INFO", "message": "Database compaction successful. WAL journal pruned."},
        {"timestamp": "2026-05-29T21:35:45", "level": "INFO", "message": " mDNS discovery handshake successfully verified peer Android-App."}
    ]
