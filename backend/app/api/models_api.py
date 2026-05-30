# Z-AI Chatbot — Models API Router
from __future__ import annotations
import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api.auth import get_current_session
from app.core.config import get_settings, MODELS_DIR
from app.database.connection import get_db
from app.database.models import AIModel
from app.services.inference import inference_manager, InferenceError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/models", tags=["models"])

class ModelResponse(BaseModel):
    id: str
    name: str
    filename: str
    family: str
    parameter_count: str
    quantization: str
    size_bytes: int
    context_length: int
    ram_required_mb: int
    is_default: bool
    is_loaded: bool
    is_active: bool
    description: str | None
    installed_at: str | None
    class Config:
        from_attributes = True

@router.get("", response_model=list[ModelResponse])
async def list_models(_session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    models = db.query(AIModel).filter_by(is_active=True).all()
    for m in models:
        path = MODELS_DIR / m.filename
        if path.exists():
            if m.installed_at is None:
                m.installed_at = m.created_at
        else:
            m.installed_at = None
    db.commit()
    return models

@router.post("/{model_id}/load", response_model=ModelResponse)
async def load_model(model_id: str, _session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    model = db.query(AIModel).filter_by(id=model_id).first()
    if not model: raise HTTPException(status_code=404, detail="Model not found")
    path = MODELS_DIR / model.filename
    if not path.exists(): raise HTTPException(status_code=400, detail="Model file is not downloaded locally.")
    try:
        inference_manager.load_model(model_id=model.id, filename=model.filename, context_length=model.context_length)
    except InferenceError as err:
        raise HTTPException(status_code=500, detail=str(err))
    
    db.query(AIModel).update({AIModel.is_loaded: False})
    model.is_loaded = True
    db.commit()
    db.refresh(model)
    return model

@router.post("/{model_id}/unload", response_model=ModelResponse)
async def unload_model(model_id: str, _session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    model = db.query(AIModel).filter_by(id=model_id).first()
    if not model: raise HTTPException(status_code=404, detail="Model not found")
    inference_manager.unload_model()
    model.is_loaded = False
    db.commit()
    db.refresh(model)
    return model

@router.post("/{model_id}/default", response_model=ModelResponse)
async def set_default_model(model_id: str, _session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    model = db.query(AIModel).filter_by(id=model_id).first()
    if not model: raise HTTPException(status_code=404, detail="Model not found")
    db.query(AIModel).update({AIModel.is_default: False})
    model.is_default = True
    db.commit()
    db.refresh(model)
    return model
