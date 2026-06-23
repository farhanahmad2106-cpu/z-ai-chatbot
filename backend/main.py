"""
Z-AI Chatbot — FastAPI Application Entry Point
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import ORJSONResponse

from app.core.config import get_settings, DATA_DIR, MODELS_DIR, BACKUPS_DIR, DB_DIR

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if get_settings().debug else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan (startup / shutdown)
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifecycle manager.
    Creates required data directories on first launch.
    Does NOT unlock the database — that happens via /api/v1/auth/unlock.
    """
    settings = get_settings()

    # Ensure all data directories exist
    for directory in [DATA_DIR, MODELS_DIR, BACKUPS_DIR, DB_DIR]:
        directory.mkdir(parents=True, exist_ok=True)
        logger.info("Data directory ready: %s", directory)

    logger.info(
        "Z-AI Chatbot Backend v%s starting on %s:%s",
        settings.app_version,
        settings.host,
        settings.port,
    )

    yield  # ← app is running

    # Shutdown: lock the database to clear the key from memory
    from app.database.connection import db_manager
    if db_manager.is_unlocked:
        db_manager.lock()
        logger.info("Database locked on shutdown")

    logger.info("Z-AI Chatbot Backend stopped")


# ─────────────────────────────────────────────────────────────────────────────
# Application Factory
# ─────────────────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Local-first encrypted AI assistant backend",
        default_response_class=ORJSONResponse,
        lifespan=lifespan,
        docs_url="/docs" if settings.debug else None,   # Disable Swagger in production
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
    )

    # ── Security Middleware ────────────────────────────────────────────────────
    # Allow local network connections (mobile app)
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["*"],
    )

    # Combine default allowed origins with any extra CORS origins from environment
    origins = list(settings.allowed_origins)
    if settings.extra_cors_origins:
        extra_origins = [o.strip() for o in settings.extra_cors_origins.split(",") if o.strip()]
        origins.extend(extra_origins)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ────────────────────────────────────────────────────────────────
    from app.api.auth import router as auth_router
    app.include_router(auth_router)

    # Phase 1+ routers (registered when implemented)
    from app.api.chat import router as chat_router
    app.include_router(chat_router)
    from app.api.models_api import router as models_router
    app.include_router(models_router)
    from app.api.metrics import router as metrics_router
    app.include_router(metrics_router)
    from app.api.sync import router as sync_router
    app.include_router(sync_router)
    from app.api.backups import router as backups_router
    app.include_router(backups_router)
    from app.api.admin import router as admin_router
    app.include_router(admin_router)
    from app.api.billing import router as billing_router
    app.include_router(billing_router)

    # ── Health Check ──────────────────────────────────────────────────────────
    @app.get("/health", tags=["system"], summary="Backend health probe")
    async def health() -> dict:
        from app.database.connection import db_manager
        return {
            "status": "ok",
            "version": settings.app_version,
            "db_unlocked": db_manager.is_unlocked,
        }

    return app


app = create_app()


# ─────────────────────────────────────────────────────────────────────────────
# Dev entrypoint
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug,
        log_level="debug" if settings.debug else "info",
    )
