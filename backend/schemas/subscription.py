from typing import Optional, Union
from pydantic import BaseModel, Field
from enum import Enum

class RefundReasonEnum(str, Enum):
    duplicate_charge = "duplicate_charge"
    customer_request = "customer_request"
    disputed_transaction = "disputed_transaction"
    unused_quota_cancellation = "unused_quota_cancellation"

class RefundRequest(BaseModel):
    payment_id: str = Field(..., min_length=1, description="Razorpay Payment ID")
    amount: Optional[int] = Field(None, gt=0, description="Amount in paise. If omitted, performs a full refund.")
    reason: Union[RefundReasonEnum, str] = Field(..., description="Reason for the refund")
