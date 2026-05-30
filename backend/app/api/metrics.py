# Z-AI Chatbot — Hardware Metrics Stream Router
from __future__ import annotations
import json
import logging
import asyncio
import psutil
from typing import Annotated
from fastapi import APIRouter, Depends
from sse_starlette.sse import EventSourceResponse
from app.api.auth import get_current_session
from app.core.config import get_settings
from app.services.inference import inference_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])

@router.get("/live", summary="Get a live hardware telemetry SSE stream")
async def live_metrics(_session: Annotated[dict, Depends(get_current_session)]):
    async def metrics_generator():
        while True:
            try:
                cpu = psutil.cpu_percent(interval=None)
                ram = psutil.virtual_memory()
                disk = psutil.disk_usage('/')
                
                payload = {
                    "cpu_percent": cpu,
                    "ram_percent": ram.percent,
                    "ram_used_mb": int(ram.used / (1024 * 1024)),
                    "ram_total_mb": int(ram.total / (1024 * 1024)),
                    "disk_used_gb": round(disk.used / (1024 * 1024 * 1024), 2),
                    "disk_total_gb": round(disk.total / (1024 * 1024 * 1024), 2),
                    "model_loaded": inference_manager.loaded_model_id
                }
                yield {"event": "metrics", "data": json.dumps(payload)}
            except Exception as e:
                logger.error("Error reading hardware metrics: %s", e)
                yield {"event": "error", "data": json.dumps({"error": str(e)})}
            
            await asyncio.sleep(2.0)
            
    return EventSourceResponse(metrics_generator())
