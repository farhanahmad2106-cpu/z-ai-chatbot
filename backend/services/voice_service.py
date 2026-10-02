import os
import io
import base64
import httpx
from typing import Optional
from mutagen import File
from schemas.voice import STTResponse, IndicLocale

class VoiceService:
    def __init__(self):
        self.api_key = os.getenv("SARVAM_API_KEY")
        self.stt_model = os.getenv("SARVAM_STT_MODEL", "saaras:v3")
        self.tts_model = os.getenv("SARVAM_TTS_MODEL", "bulbul:v3")

    def _get_audio_duration(self, audio_bytes: bytes) -> float:
        try:
            file_obj = io.BytesIO(audio_bytes)
            audio = File(file_obj)
            if audio is not None and audio.info is not None:
                return audio.info.length
        except Exception:
            pass
        raise ValueError("Could not determine audio duration or unsupported format.")

    async def transcribe_stream(
        self,
        audio_bytes: bytes,
        filename: str,
        language_code: Optional[str]
    ) -> STTResponse:
        if not self.api_key:
            return {"error": "VOICE_UNAVAILABLE", "fallback_to_text": True}
        
        try:
            duration = self._get_audio_duration(audio_bytes)
            if duration > 30.0:
                raise ValueError("Audio duration exceeds 30 seconds.")
        except ValueError as e:
            if "duration exceeds" in str(e):
                raise
            else:
                raise ValueError(str(e))

        url = "https://api.sarvam.ai/speech-to-text-translate"
        headers = {
            "api-subscription-key": self.api_key
        }
        
        # We need to construct a multipart form data
        files = {
            "file": (filename, io.BytesIO(audio_bytes), "audio/wav")
        }
        data = {
            "model": self.stt_model
        }
        # In current Sarvam API, there might not be a language_code parameter for STT if it auto-detects,
        # but if we pass it, we should ensure it's allowed.
        if language_code:
            data["language_code"] = language_code

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, headers=headers, data=data, files=files)
                response.raise_for_status()
                result = response.json()
                
                transcript = result.get("transcript", "")
                if not transcript:
                    # check if the response structure is different
                    pass

                return STTResponse(
                    transcript=transcript,
                    language_code=language_code or "hi-IN",
                    confidence_score=None,
                    duration_seconds=duration
                )
        except (httpx.RequestError, httpx.HTTPStatusError):
            return {"error": "VOICE_UNAVAILABLE", "fallback_to_text": True}

    async def synthesize_stream(
        self,
        text: str,
        language_code: str,
        speaker: str
    ) -> bytes:
        if not self.api_key:
            raise ValueError("SARVAM_API_KEY missing")

        url = "https://api.sarvam.ai/text-to-speech"
        headers = {
            "api-subscription-key": self.api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "text": text,
            "target_language_code": language_code,
            "speaker": speaker,
            "model": self.tts_model,
            "output_audio_codec": "wav"
        }
        
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
                audios = data.get("audios", [])
                if not audios:
                    raise ValueError("No audio returned from Sarvam")
                
                audio_base64 = audios[0]
                audio_bytes = base64.b64decode(audio_base64)
                return audio_bytes
        except httpx.HTTPStatusError as e:
            raise Exception(f"Voice provider error: {e.response.status_code}")
        except httpx.RequestError:
            raise Exception("Voice provider unavailable")
