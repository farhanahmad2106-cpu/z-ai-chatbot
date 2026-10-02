from typing import Optional
from fastapi import APIRouter, UploadFile, File, Header, Depends, HTTPException, status, Form
from fastapi.responses import StreamingResponse
import io
import os
import logging
from routes.scan import get_current_user_id
from schemas.voice import TTSRequest, STTResponse, IndicLocale
from services.voice_service import VoiceService

router = APIRouter()
voice_service = VoiceService()

ALLOWED_MIME_TYPES = {
    "audio/wav",
    "audio/webm",
    "audio/mpeg",
    "audio/mp4",
    "audio/ogg",
    "audio/x-m4a"
}
MAX_AUDIO_SIZE = 10 * 1024 * 1024

from typing import Union

@router.post("/transcribe", response_model=Union[STTResponse, dict], response_model_exclude_none=True)
async def transcribe(
    audio: UploadFile = File(...),
    language_code: IndicLocale = Form(default="hi-IN"),
    authorization: Optional[str] = Header(None),
    auth_uid: str = Depends(get_current_user_id)
):
    if audio.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Unsupported audio format."
        )

    audio_bytes = await audio.read()
    if len(audio_bytes) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Audio size exceeds the 10MiB limit."
        )

    try:
        # Determine duration and validate limits using VoiceService
        duration = voice_service._get_audio_duration(audio_bytes)
        if duration > 30.0:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Audio duration exceeds 30 seconds."
            )
            
        result = await voice_service.transcribe_stream(
            audio_bytes=audio_bytes,
            filename=audio.filename or "audio.wav",
            language_code=language_code
        )
        
        if isinstance(result, dict) and result.get("error"):
            # Fallback structure
            return result
            
        # Logging requirement
        logging.info(f"VOICE_STT success locale={result.language_code} duration_seconds={result.duration_seconds:.2f}")
        
        return result
        
    except ValueError as e:
        if "duration" in str(e).lower() or "unsupported" in str(e).lower():
            # Usually happens if mutagen cannot read the file or 30s limit hit
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e)
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred processing the audio."
        )
    except HTTPException:
        raise
    except Exception as e:
        # Avoid leaking exception payload with transcript
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

@router.post("/synthesize")
async def synthesize(
    request: TTSRequest,
    authorization: Optional[str] = Header(None),
    auth_uid: str = Depends(get_current_user_id)
):
    try:
        audio_bytes = await voice_service.synthesize_stream(
            text=request.text,
            language_code=request.language_code,
            speaker=request.speaker
        )
        
        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/wav"
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e)
        )
    except Exception as e:
        # Sanitized error for TTS provider failures
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to synthesize speech."
        )
