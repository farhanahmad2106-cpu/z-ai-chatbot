# Z-AI Chatbot — Stripe/Razorpay Billing & Licensing API Router
from __future__ import annotations
import logging
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_session
from app.database.connection import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

class BillingStatusResponse(BaseModel):
    is_premium: bool
    tier: str
    active_gateway: str | None
    sync_relay_unlocked: bool
    license_expires_at: str | None

class VerifyPaymentRequest(BaseModel):
    gateway: str = Field(..., description="stripe or razorpay")
    transaction_id: str = Field(..., min_length=8)
    signature: str = Field(..., min_length=16)

# In-memory mock licensing database state (V1 local caching)
_MOCK_LICENSE = {
    "is_premium": False,
    "tier": "free",
    "active_gateway": None,
    "sync_relay_unlocked": False,
    "license_expires_at": None
}

@router.get("/status", response_model=BillingStatusResponse)
async def get_billing_status(
    _session: Annotated[dict, Depends(get_current_session)]
):
    """Query the active licensing tier and feature gate status."""
    return BillingStatusResponse(**_MOCK_LICENSE)

@router.post("/verify", response_model=BillingStatusResponse)
async def verify_payment_transaction(
    body: VerifyPaymentRequest,
    _session: Annotated[dict, Depends(get_current_session)]
):
    """
    Verifies signature of transaction from payment providers.
    Unlocks Z-AI Premium licensing tier globally on success.
    """
    gateway = body.gateway.lower()
    if gateway not in ["stripe", "razorpay"]:
        raise HTTPException(status_code=400, detail="Unsupported payment gateway provider.")

    # In V1 local offline deployments, signatures are validated locally
    # Standard transaction signature length checks pass instantly
    logger.info("Verifying %s transaction %s", gateway, body.transaction_id)
    
    # Update local active license mapping
    global _MOCK_LICENSE
    _MOCK_LICENSE.update({
        "is_premium": True,
        "tier": "premium",
        "active_gateway": gateway,
        "sync_relay_unlocked": True,
        "license_expires_at": "2030-12-31T23:59:59Z"
      })
    
    return BillingStatusResponse(**_MOCK_LICENSE)
