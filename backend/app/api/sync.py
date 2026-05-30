# Z-AI Chatbot — LAN Sync REST API Router
from __future__ import annotations
import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_session
from app.database.connection import get_db
from app.database.models import AppMetadata, SyncDevice
from app.services.sync_engine import sync_engine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/sync", tags=["sync"])

class DiscoveredPeerResponse(BaseModel):
    device_id: str
    device_name: str
    platform: str
    ip: str
    port: int

@router.post("/discovery/start", status_code=status.HTTP_204_NO_CONTENT)
async def start_sync_discovery(_session: Annotated[dict, Depends(get_current_session)]):
    sync_engine.start_discovery()

@router.post("/discovery/stop", status_code=status.HTTP_204_NO_CONTENT)
async def stop_sync_discovery(_session: Annotated[dict, Depends(get_current_session)]):
    sync_engine.stop_discovery()

@router.get("/peers", response_model=list[DiscoveredPeerResponse])
async def list_discovered_peers(_session: Annotated[dict, Depends(get_current_session)]):
    return sync_engine.get_discovered_peers()
