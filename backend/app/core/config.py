"""
Z-AI Chatbot — Core Application Settings
Loaded from environment variables and .env file at startup.
"""

from __future__ import annotations

from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, SecretStr


# Resolve project root (two levels up from this file)
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = DATA_DIR / "models"
BACKUPS_DIR = DATA_DIR / "backups"
DB_DIR = DATA_DIR / "db"


class Settings(BaseSettings):
    """Application configuration — values sourced from .env or OS environment."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App Identity ───────────────────────────────────────────────────────────
    app_name: str = Field(default="Z-AI Chatbot", description="Human-readable app name")
    app_version: str = Field(default="1.0.0")
    debug: bool = Field(default=False, description="Enable debug mode — never True in prod")

    # ── Server ─────────────────────────────────────────────────────────────────
    host: str = Field(default="127.0.0.1", description="Bind address — localhost only by default")
    port: int = Field(default=8765, description="FastAPI port")
    allowed_origins: list[str] = Field(
        default=[
            "http://localhost:8765",
            "http://127.0.0.1:8765",
            "http://10.0.2.2:8765",  # Android emulator → host machine alias
        ],
        description="CORS allowed origins for desktop WebView and Android emulator",
    )

    # ── Database ───────────────────────────────────────────────────────────────
    db_path: Path = Field(
        default=DB_DIR / "z_chat.db",
        description="Absolute path to the SQLCipher database file",
    )
    db_key_iterations: int = Field(
        default=256000,
        description="Argon2id iterations for PIN→database key derivation",
    )

    # ── Security ───────────────────────────────────────────────────────────────
    jwt_secret: SecretStr = Field(
        default=SecretStr("CHANGE_ME_BEFORE_PRODUCTION_32_CHARS"),
        description="HS256 secret for user session JWTs — override in .env",
    )
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_token_expire_minutes: int = Field(
        default=1440,
        description="User session token TTL (24 hours by default)",
    )

    # Admin API key — completely separate from user tokens
    admin_api_key: SecretStr = Field(
        default=SecretStr("CHANGE_ME_ADMIN_KEY_64_CHARS"),
        description="High-entropy admin API key — override in .env immediately",
    )

    # ── AI Inference ───────────────────────────────────────────────────────────
    models_dir: Path = Field(
        default=MODELS_DIR,
        description="Directory where GGUF model files are stored",
    )
    default_model: str = Field(
        default="phi-3-mini-4k-instruct-q4.gguf",
        description="Model filename to load on first boot",
    )
    fallback_model: str = Field(
        default="gemma-2b-it-q4_k_m.gguf",
        description="Fallback model for low-RAM devices",
    )
    model_context_length: int = Field(default=4096)
    model_max_tokens: int = Field(default=2048)
    model_temperature: float = Field(default=0.7)
    model_threads: int = Field(default=4, description="CPU threads for llama.cpp")

    # ── Telemetry ──────────────────────────────────────────────────────────────
    metrics_poll_interval_seconds: float = Field(
        default=2.0,
        description="How often to sample CPU/RAM for the live telemetry SSE stream",
    )

    # ── LAN Sync ───────────────────────────────────────────────────────────────
    sync_service_name: str = Field(default="_zchat._tcp.local.")
    sync_port: int = Field(default=8766, description="Dedicated port for LAN sync handshakes")

    # ── Backups ────────────────────────────────────────────────────────────────
    backups_dir: Path = Field(default=BACKUPS_DIR)
    backup_schedule_cron: str = Field(
        default="0 3 * * *",
        description="Daily at 03:00 — APScheduler cron expression",
    )
    backup_retention_days: int = Field(default=30)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton Settings instance. Cached for performance."""
    return Settings()
