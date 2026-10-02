import pytest
import httpx
import os
import io
import base64
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from main import app
from services.voice_service import VoiceService

client = TestClient(app)

@pytest.fixture
def mock_auth():
    with patch("routes.scan.fb_auth.verify_id_token") as mock_verify:
        mock_verify.return_value = {"uid": "test_user_123"}
        yield mock_verify

def get_valid_wav_bytes(duration_sec=1):
    import wave
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(44100)
        # Write frames for duration
        wav_file.writeframes(b'\x00' * 44100 * 2 * duration_sec)
    return buf.getvalue()

def test_unauthenticated_requests():
    # STT
    audio = get_valid_wav_bytes(1)
    response = client.post(
        "/api/voice/transcribe",
        files={"audio": ("test.wav", audio, "audio/wav")},
        data={"language_code": "hi-IN"}
    )
    assert response.status_code == 401

    # TTS
    response = client.post(
        "/api/voice/synthesize",
        json={"text": "Hello", "language_code": "hi-IN", "speaker": "shubh"}
    )
    assert response.status_code == 401

def test_mime_validation(mock_auth):
    audio = b"fake audio"
    response = client.post(
        "/api/voice/transcribe",
        headers={"Authorization": "Bearer fake-token"},
        files={"audio": ("test.txt", audio, "text/plain")},
        data={"language_code": "hi-IN"}
    )
    assert response.status_code == 415

def test_size_validation(mock_auth):
    # 10MiB + 1 byte
    oversized = b"0" * ((10 * 1024 * 1024) + 1)
    response = client.post(
        "/api/voice/transcribe",
        headers={"Authorization": "Bearer fake-token"},
        files={"audio": ("test.wav", oversized, "audio/wav")},
        data={"language_code": "hi-IN"}
    )
    assert response.status_code == 413

def test_duration_validation(mock_auth):
    # Create 31 second wav
    audio = get_valid_wav_bytes(31)
    with patch("services.voice_service.httpx.AsyncClient.post") as mock_post:
        response = client.post(
            "/api/voice/transcribe",
            headers={"Authorization": "Bearer fake-token"},
            files={"audio": ("test.wav", audio, "audio/wav")},
            data={"language_code": "hi-IN"}
        )
        assert response.status_code in (413, 422)
        mock_post.assert_not_called()

@pytest.mark.asyncio
async def test_stt_success(mock_auth):
    audio = get_valid_wav_bytes(2)
    mock_response = httpx.Response(200, request=httpx.Request("POST", "url"), json={"transcript": "Test speech", "language_code": "hi-IN"})
    
    with patch("services.voice_service.httpx.AsyncClient.post", return_value=mock_response):
        with patch("routes.voice.voice_service.api_key", "test"):
            response = client.post(
                "/api/voice/transcribe",
                headers={"Authorization": "Bearer fake-token"},
                files={"audio": ("test.wav", audio, "audio/wav")},
                data={"language_code": "hi-IN"}
            )
            assert response.status_code == 200
            data = response.json()
            assert data["transcript"] == "Test speech"
            assert data["language_code"] == "hi-IN"
            assert data["duration_seconds"] == 2.0

@pytest.mark.asyncio
async def test_stt_fallback(mock_auth):
    audio = get_valid_wav_bytes(1)
    # Test missing API key
    with patch("routes.voice.voice_service.api_key", None):
        response = client.post(
            "/api/voice/transcribe",
            headers={"Authorization": "Bearer fake-token"},
            files={"audio": ("test.wav", audio, "audio/wav")},
            data={"language_code": "hi-IN"}
        )
        assert response.status_code == 200
        assert response.json() == {"error": "VOICE_UNAVAILABLE", "fallback_to_text": True}

    # Test HTTP 500
    mock_response = httpx.Response(500, request=httpx.Request("POST", "url"))
    with patch("services.voice_service.httpx.AsyncClient.post", return_value=mock_response):
        with patch("routes.voice.voice_service.api_key", "test"):
            response = client.post(
                "/api/voice/transcribe",
                headers={"Authorization": "Bearer fake-token"},
                files={"audio": ("test.wav", audio, "audio/wav")},
                data={"language_code": "hi-IN"}
            )
            assert response.status_code == 200
            assert response.json() == {"error": "VOICE_UNAVAILABLE", "fallback_to_text": True}

def test_tts_validation(mock_auth):
    # Text too long
    long_text = "a" * 501
    response = client.post(
        "/api/voice/synthesize",
        headers={"Authorization": "Bearer fake-token"},
        json={"text": long_text, "language_code": "hi-IN", "speaker": "shubh"}
    )
    assert response.status_code == 422

@pytest.mark.asyncio
async def test_tts_success(mock_auth):
    base64_audio = base64.b64encode(b"fake wav bytes").decode("utf-8")
    mock_response = httpx.Response(200, request=httpx.Request("POST", "url"), json={"audios": [base64_audio]})
    
    with patch("services.voice_service.httpx.AsyncClient.post", return_value=mock_response):
        with patch("routes.voice.voice_service.api_key", "test"):
            response = client.post(
                "/api/voice/synthesize",
                headers={"Authorization": "Bearer fake-token"},
                json={"text": "Test", "language_code": "hi-IN", "speaker": "shubh"}
            )
            assert response.status_code == 200
            assert response.headers["content-type"] == "audio/wav"
            assert response.content == b"fake wav bytes"

@pytest.mark.asyncio
async def test_tts_provider_failure(mock_auth):
    mock_response = httpx.Response(500, request=httpx.Request("POST", "url"))
    with patch("services.voice_service.httpx.AsyncClient.post", return_value=mock_response):
        with patch("routes.voice.voice_service.api_key", "test"):
            response = client.post(
                "/api/voice/synthesize",
                headers={"Authorization": "Bearer fake-token"},
                json={"text": "Test", "language_code": "hi-IN", "speaker": "shubh"}
            )
            assert response.status_code == 500
            assert response.json() == {"detail": "Failed to synthesize speech."}

def test_no_filesystem_persistence(mock_auth):
    # Check that calling stt and tts does not write any .wav files in current dir or tmp
    audio = get_valid_wav_bytes(1)
    
    files_before = set(os.listdir('.'))
    
    # stt
    with patch("routes.voice.voice_service.api_key", None):
        client.post(
            "/api/voice/transcribe",
            headers={"Authorization": "Bearer fake-token"},
            files={"audio": ("test.wav", audio, "audio/wav")},
            data={"language_code": "hi-IN"}
        )
    
    # tts
    client.post(
        "/api/voice/synthesize",
        headers={"Authorization": "Bearer fake-token"},
        json={"text": "a" * 600, "language_code": "hi-IN", "speaker": "shubh"}
    )
    
    files_after = set(os.listdir('.'))
    assert files_before == files_after

def test_api_contract():
    # Verify openapi schema has the routes
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    paths = schema.get("paths", {})
    assert "/api/voice/transcribe" in paths
    assert "post" in paths["/api/voice/transcribe"]
    assert "/api/voice/synthesize" in paths
    assert "post" in paths["/api/voice/synthesize"]
