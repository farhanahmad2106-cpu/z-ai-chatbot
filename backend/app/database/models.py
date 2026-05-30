"""
Z-AI Chatbot — SQLAlchemy ORM Models
All tables are encrypted at rest via SQLCipher.
Timestamps are stored as UTC ISO strings for cross-platform compatibility.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


def _utcnow() -> str:
    """Return the current UTC time as an ISO 8601 string."""
    return datetime.now(tz=timezone.utc).isoformat()


def _new_uuid() -> str:
    """Generate a new UUID4 as a string."""
    return str(uuid.uuid4())


# ─────────────────────────────────────────────────────────────────────────────
# AppMetadata  (single-row config table, seeded on first boot)
# ─────────────────────────────────────────────────────────────────────────────

class AppMetadata(Base):
    """
    Singleton table (always exactly one row).
    Stores the PIN hash, database salt, device identity, and schema version.
    """
    __tablename__ = "app_metadata"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    device_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    pin_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    db_salt_hex: Mapped[str] = mapped_column(String(32), nullable=False)
    app_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    sync_public_key_hex: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    sync_private_key_hex: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    is_first_launch: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), default=_utcnow, onupdate=_utcnow, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# Conversations
# ─────────────────────────────────────────────────────────────────────────────

class Conversation(Base):
    """A named chat session. Contains many Messages."""
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="New Chat")
    model_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("models.id", ondelete="SET NULL"), nullable=True
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), default=_utcnow, onupdate=_utcnow, nullable=False)

    # Relationships
    messages: Mapped[list[Message]] = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at"
    )
    model: Mapped[Optional[AIModel]] = relationship("AIModel", back_populates="conversations")


# ─────────────────────────────────────────────────────────────────────────────
# Messages
# ─────────────────────────────────────────────────────────────────────────────

class Message(Base):
    """A single turn in a conversation (user or assistant)."""
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    conversation_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "user" | "assistant" | "system"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_error: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Tool call metadata (for future agentic features)
    tool_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tool_args: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string

    created_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False, index=True)

    # Relationships
    conversation: Mapped[Conversation] = relationship("Conversation", back_populates="messages")


# ─────────────────────────────────────────────────────────────────────────────
# AI Models
# ─────────────────────────────────────────────────────────────────────────────

class AIModel(Base):
    """A locally installed GGUF model."""
    __tablename__ = "models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    filename: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    family: Mapped[str] = mapped_column(String(100), nullable=False)  # "phi" | "gemma" | "mistral" etc.
    parameter_count: Mapped[str] = mapped_column(String(20), nullable=False)  # "3B", "7B"
    quantization: Mapped[str] = mapped_column(String(20), nullable=False)  # "Q4_K_M", "Q8_0"
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    context_length: Mapped[int] = mapped_column(Integer, nullable=False, default=4096)
    ram_required_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=2048)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_loaded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    sha256_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    installed_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), default=_utcnow, onupdate=_utcnow, nullable=False)

    # Relationships
    conversations: Mapped[list[Conversation]] = relationship("Conversation", back_populates="model")


# ─────────────────────────────────────────────────────────────────────────────
# Backups
# ─────────────────────────────────────────────────────────────────────────────

class Backup(Base):
    """Record of each encrypted backup archive."""
    __tablename__ = "backups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    filename: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    backup_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="auto"
    )  # "auto" | "manual" | "pre_sync"
    conversation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# LAN Sync — Paired Devices
# ─────────────────────────────────────────────────────────────────────────────

class SyncDevice(Base):
    """A trusted peer device that has completed the LAN sync pairing handshake."""
    __tablename__ = "sync_devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    device_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    device_name: Mapped[str] = mapped_column(String(255), nullable=False)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)  # "android" | "desktop"
    public_key_hex: Mapped[str] = mapped_column(String(128), nullable=False)
    last_seen_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    last_sync_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    is_trusted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    paired_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False)


class SyncOperation(Base):
    """CRDT operation log for conflict-free sync merging."""
    __tablename__ = "sync_operations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    operation_type: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # "insert" | "update" | "delete"
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)
    record_id: Mapped[str] = mapped_column(String(36), nullable=False)
    payload: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    vector_clock: Mapped[str] = mapped_column(Text, nullable=False)  # JSON
    device_id: Mapped[str] = mapped_column(String(64), nullable=False)
    is_applied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("table_name", "record_id", "vector_clock", name="uq_sync_op"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Feature Flags (remote config from admin)
# ─────────────────────────────────────────────────────────────────────────────

class FeatureFlag(Base):
    """
    Remote feature flag received from the admin app.
    Persisted locally so the app works offline even after a flag push.
    """
    __tablename__ = "feature_flags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    flag_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    flag_value: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pushed_by: Mapped[str] = mapped_column(String(64), nullable=False, default="admin")
    created_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), default=_utcnow, onupdate=_utcnow, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# Achievements
# ─────────────────────────────────────────────────────────────────────────────

class Achievement(Base):
    """User achievement — unlocked by milestones (100 messages, first sync, etc.)."""
    __tablename__ = "achievements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    achievement_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    icon: Mapped[str] = mapped_column(String(50), nullable=False, default="🏆")
    is_unlocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    unlocked_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False)


# ─────────────────────────────────────────────────────────────────────────────
# Telemetry Snapshots (stored for admin analytics)
# ─────────────────────────────────────────────────────────────────────────────

class TelemetrySnapshot(Base):
    """Periodic hardware telemetry snapshots stored for admin dashboard analytics."""
    __tablename__ = "telemetry_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_uuid)
    cpu_percent: Mapped[float] = mapped_column(Float, nullable=False)
    ram_percent: Mapped[float] = mapped_column(Float, nullable=False)
    ram_used_mb: Mapped[int] = mapped_column(Integer, nullable=False)
    ram_total_mb: Mapped[int] = mapped_column(Integer, nullable=False)
    disk_used_gb: Mapped[float] = mapped_column(Float, nullable=False)
    disk_total_gb: Mapped[float] = mapped_column(Float, nullable=False)
    model_loaded: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    recorded_at: Mapped[str] = mapped_column(String(40), default=_utcnow, nullable=False, index=True)
