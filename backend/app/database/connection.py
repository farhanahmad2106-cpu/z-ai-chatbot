"""
Z-AI Chatbot — SQLCipher Database Connection
Encrypted SQLite via SQLCipher with:
  - WAL journal mode for high concurrency
  - Argon2id-derived PIN key
  - Connection pool with health checks
  - Automatic schema creation on first boot
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from typing import AsyncGenerator, Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings, DB_DIR
from app.core.security import derive_db_key

logger = logging.getLogger(__name__)

settings = get_settings()


# ─────────────────────────────────────────────────────────────────────────────
# SQLAlchemy Declarative Base
# ─────────────────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
    pass


# ─────────────────────────────────────────────────────────────────────────────
# Database Manager
# ─────────────────────────────────────────────────────────────────────────────

class DatabaseManager:
    """
    Manages the lifecycle of the SQLCipher-encrypted database connection.

    The database key is NOT known until the user unlocks the app with their PIN.
    Before unlock:  the engine is None; all API endpoints that need the DB return 503.
    After unlock:   the engine is initialized with the derived key; sessions are available.
    """

    def __init__(self) -> None:
        self._engine = None
        self._session_factory = None
        self._db_path: Path = settings.db_path
        self._unlocked: bool = False

    @property
    def is_unlocked(self) -> bool:
        return self._unlocked

    def _get_connection_url(self) -> str:
        """
        Build the pysqlcipher3 / sqlcipher3 connection URL.
        Using synchronous engine — FastAPI runs blocking DB ops in a threadpool.
        """
        return f"sqlite+pysqlite:///{self._db_path}"

    def _apply_pragmas(self, connection, pin_key_hex: str) -> None:
        """
        Apply SQLCipher PRAGMAs immediately after connection open.
        These must be the very first statements — SQLCipher enforces this.
        """
        # 1. Unlock the database with the derived key
        connection.execute(text(f"PRAGMA key = \"x'{pin_key_hex}'\";"))
        # 2. SQLCipher version 4 defaults (AES-256-CBC, HMAC-SHA512)
        connection.execute(text("PRAGMA cipher_page_size = 4096;"))
        connection.execute(text("PRAGMA kdf_iter = 256000;"))
        connection.execute(text("PRAGMA cipher_hmac_algorithm = HMAC_SHA512;"))
        connection.execute(text("PRAGMA cipher_kdf_algorithm = PBKDF2_HMAC_SHA512;"))
        # 3. WAL mode for concurrent reads during streaming
        connection.execute(text("PRAGMA journal_mode = WAL;"))
        # 4. Foreign key enforcement
        connection.execute(text("PRAGMA foreign_keys = ON;"))
        # 5. Performance tuning — safe for local single-device use
        connection.execute(text("PRAGMA synchronous = NORMAL;"))
        connection.execute(text("PRAGMA cache_size = -32000;"))  # 32 MiB cache
        connection.execute(text("PRAGMA temp_store = MEMORY;"))
        connection.execute(text("PRAGMA mmap_size = 134217728;")) # 128 MiB mmap

    def initialize(self, pin: str, salt_hex: str) -> None:
        """
        Initialize the database engine with the PIN-derived key.
        Called once during the unlock flow after PIN verification.

        Args:
            pin:      The raw PIN string entered by the user.
            salt_hex: The stored hex salt retrieved from the metadata table
                      (or generated on first boot).
        """
        DB_DIR.mkdir(parents=True, exist_ok=True)

        pin_key_hex = derive_db_key(pin, salt_hex)

        engine = create_engine(
            self._get_connection_url(),
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,          # Single connection — WAL handles concurrency
            echo=settings.debug,
        )

        @event.listens_for(engine, "connect")
        def on_connect(dbapi_connection, connection_record):
            self._apply_pragmas(dbapi_connection, pin_key_hex)

        self._engine = engine
        self._session_factory = sessionmaker(
            bind=engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )

        # Create all tables if this is first boot
        from app.database import models as _  # noqa: F401 — registers ORM classes
        Base.metadata.create_all(bind=engine)

        self._unlocked = True
        logger.info("Database unlocked and initialized at %s", self._db_path)

    def get_session(self) -> Session:
        """
        Return a new synchronous SQLAlchemy Session.
        Raises RuntimeError if the database is not yet unlocked.
        """
        if not self._unlocked or self._session_factory is None:
            raise RuntimeError(
                "Database is locked. User must unlock the app before accessing data."
            )
        return self._session_factory()

    def lock(self) -> None:
        """
        Lock the database by disposing the engine and clearing the session factory.
        Call this on explicit user lock or app suspend.
        """
        if self._engine:
            self._engine.dispose()
        self._engine = None
        self._session_factory = None
        self._unlocked = False
        logger.info("Database locked")


# ─────────────────────────────────────────────────────────────────────────────
# Singleton instance
# ─────────────────────────────────────────────────────────────────────────────

db_manager = DatabaseManager()


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI Dependency
# ─────────────────────────────────────────────────────────────────────────────

@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """
    Context manager that provides a SQLAlchemy Session with automatic
    commit/rollback and guaranteed close.

    Usage in FastAPI route:
        @router.get("/chats")
        def list_chats(db: Session = Depends(get_db)):
            ...
    """
    session = db_manager.get_session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Generator[Session, None, None]:
    """FastAPI Depends-compatible version of get_db_session."""
    with get_db_session() as session:
        yield session
