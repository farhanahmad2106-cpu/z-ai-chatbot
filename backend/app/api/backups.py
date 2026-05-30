# Z-AI Chatbot — Backup REST API Router
from __future__ import annotations
import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_session
from app.database.connection import get_db
from app.database.models import AppMetadata, Backup
from app.services.backup_mgr import backup_mgr, BackupError
from app.core.security import verify_pin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/backups", tags=["backups"])

class BackupResponse(BaseModel):
    id: str
    filename: str
    size_bytes: int
    checksum_sha256: str
    backup_type: str
    conversation_count: int
    message_count: int
    is_verified: bool
    created_at: str
    class Config:
        from_attributes = True

class BackupActionRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=12)

@router.get("", response_model=list[BackupResponse])
async def list_backups(
    _session: Annotated[dict, Depends(get_current_session)],
    db: Session = Depends(get_db)
):
    return backup_mgr.list_backups()

@router.post("/create", response_model=BackupResponse, status_code=status.HTTP_201_CREATED)
async def create_backup(
    body: BackupActionRequest,
    _session: Annotated[dict, Depends(get_current_session)],
    db: Session = Depends(get_db)
):
    meta = db.query(AppMetadata).filter_by(id=1).first()
    if not meta or not verify_pin(meta.pin_hash, body.pin):
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    try:
        return backup_mgr.create_backup(pin=body.pin, backup_type="manual")
    except BackupError as err:
        raise HTTPException(status_code=500, detail=str(err))

@router.post("/{filename}/verify")
async def verify_backup_archive(
    filename: str,
    body: BackupActionRequest,
    _session: Annotated[dict, Depends(get_current_session)],
    db: Session = Depends(get_db)
):
    meta = db.query(AppMetadata).filter_by(id=1).first()
    if not meta or not verify_pin(meta.pin_hash, body.pin):
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    valid = backup_mgr.verify_backup(filename=filename, pin=body.pin)
    return {"filename": filename, "is_valid": valid}

@router.post("/{filename}/restore")
async def restore_backup_archive(
    filename: str,
    body: BackupActionRequest,
    _session: Annotated[dict, Depends(get_current_session)],
    db: Session = Depends(get_db)
):
    meta = db.query(AppMetadata).filter_by(id=1).first()
    if not meta or not verify_pin(meta.pin_hash, body.pin):
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    try:
        backup_mgr.restore_backup(filename=filename, pin=body.pin)
        return {"status": "success", "message": "Database restored successfully"}
    except BackupError as err:
        raise HTTPException(status_code=500, detail=str(err))
