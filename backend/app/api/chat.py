# Z-AI Chatbot — Chat API Router
from __future__ import annotations
import json
import logging
import asyncio
from typing import Annotated, Generator
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from app.api.auth import get_current_session
from app.core.config import get_settings, MODELS_DIR
from app.database.connection import get_db
from app.database.models import Conversation, Message, AIModel
from app.services.inference import inference_manager, InferenceError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

class ConversationResponse(BaseModel):
    id: str
    title: str
    model_id: str | None
    is_archived: bool
    is_starred: bool
    system_prompt: str | None
    message_count: int
    created_at: str
    updated_at: str
    class Config:
        from_attributes = True

class ConversationCreate(BaseModel):
    title: str = Field(default="New Chat", max_length=255)
    model_id: str | None = None
    system_prompt: str | None = Field(default="You are Z-AI, a secure local-first AI assistant.")

class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    token_count: int
    is_error: bool
    tool_name: str | None
    tool_args: str | None
    created_at: str
    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    conversation_id: str
    content: str = Field(..., min_length=1)

def _format_prompt(messages: list[Message], model_family: str, system_prompt: str | None) -> str:
    sys_prompt = system_prompt or "You are Z-AI, a secure local-first AI assistant."
    family = model_family.lower()
    if "phi" in family:
        prompt = f"<|system|>\n{sys_prompt}<|end|>\n"
        for msg in messages:
            if msg.role == "user":
                prompt += f"<|user|>\n{msg.content}<|end|>\n"
            elif msg.role == "assistant":
                prompt += f"<|assistant|>\n{msg.content}<|end|>\n"
        prompt += "<|assistant|>\n"
        return prompt
    elif "gemma" in family:
        prompt = f"<start_of_turn>system\n{sys_prompt}<end_of_turn>\n"
        for msg in messages:
            if msg.role == "user":
                prompt += f"<start_of_turn>user\n{msg.content}<end_of_turn>\n"
            elif msg.role == "assistant":
                prompt += f"<start_of_turn>model\n{msg.content}<end_of_turn>\n"
        prompt += "<start_of_turn>model\n"
        return prompt
    else:
        prompt = f"<|im_start|>system\n{sys_prompt}<|im_end|>\n"
        for msg in messages:
            prompt += f"<|im_start|>{msg.role}\n{msg.content}<|im_end|>\n"
        prompt += "<|im_start|>assistant\n"
        return prompt

@router.get("/conversations", response_model=list[ConversationResponse])
async def list_conversations(_session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    return db.query(Conversation).order_by(Conversation.updated_at.desc()).all()

@router.post("/conversations", response_model=ConversationResponse, status_code=status.HTTP_201_CREATED)
async def create_conversation(body: ConversationCreate, _session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    if body.model_id:
        model = db.query(AIModel).filter_by(id=body.model_id).first()
        if not model: raise HTTPException(status_code=404, detail="Selected AIModel not found")
    new_conv = Conversation(title=body.title, model_id=body.model_id, system_prompt=body.system_prompt)
    db.add(new_conv)
    db.commit()
    db.refresh(new_conv)
    return new_conv

@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(conversation_id: str, _session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter_by(id=conversation_id).first()
    if not conv: raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conv)
    db.commit()

@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(conversation_id: str, _session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter_by(id=conversation_id).first()
    if not conv: raise HTTPException(status_code=404, detail="Conversation not found")
    return conv.messages

@router.post("/message")
async def send_message(body: MessageCreate, _session: Annotated[dict, Depends(get_current_session)], db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter_by(id=body.conversation_id).first()
    if not conv: raise HTTPException(status_code=404, detail="Conversation not found")
    selected_model = None
    if conv.model_id: selected_model = db.query(AIModel).filter_by(id=conv.model_id).first()
    if not selected_model: selected_model = db.query(AIModel).filter_by(is_default=True).first()
    if not selected_model: selected_model = db.query(AIModel).first()
    if not selected_model: raise HTTPException(status_code=400, detail="No AI Models configured.")
    model_file_path = MODELS_DIR / selected_model.filename
    if not model_file_path.exists():
        raise HTTPException(status_code=400, detail=f"Model file '{selected_model.filename}' is not downloaded.")
    user_msg = Message(conversation_id=conv.id, role="user", content=body.content)
    db.add(user_msg)
    conv.message_count += 1
    db.commit()
    db.refresh(user_msg)
    history = db.query(Message).filter_by(conversation_id=conv.id).order_by(Message.created_at.asc()).all()
    formatted_prompt = _format_prompt(history, selected_model.family, conv.system_prompt)
    async def sse_generator():
        try:
            await asyncio.to_thread(
                inference_manager.load_model,
                model_id=selected_model.id,
                filename=selected_model.filename,
                context_length=selected_model.context_length,
                ram_required_mb=selected_model.ram_required_mb,
            )
        except InferenceError as err:
            yield {"event": "error", "data": json.dumps({"error": str(err)})}
            return
        assistant_chunks = []
        try:
            generator = inference_manager.generate_stream(prompt=formatted_prompt)
            while True:
                chunk = await asyncio.to_thread(next, generator, None)
                if chunk is None: break
                assistant_chunks.append(chunk)
                yield {"event": "token", "data": json.dumps({"token": chunk})}
                await asyncio.sleep(0.01)
            full_reply = "".join(assistant_chunks)
            # Rough token count estimation (1 token ≈ 4 chars) for metrics display
            estimated_tokens = max(1, len(full_reply) // 4)
            with get_db() as new_db:
                target_conv = new_db.query(Conversation).filter_by(id=conv.id).first()
                if target_conv:
                    asst_msg = Message(
                        conversation_id=target_conv.id,
                        role="assistant",
                        content=full_reply,
                        token_count=estimated_tokens,
                    )
                    new_db.add(asst_msg)
                    target_conv.message_count += 1
                    target_conv.token_count = (target_conv.token_count or 0) + estimated_tokens
                    target_conv.model_id = selected_model.id
                    new_db.commit()
            yield {"event": "done", "data": "[DONE]"}
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"error": str(e)})}
    return EventSourceResponse(sse_generator())
