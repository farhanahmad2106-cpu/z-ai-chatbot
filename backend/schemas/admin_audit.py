"""
Pydantic Schemas for Z-SeHealth Multi-Admin Activity Audit Dashboard.
Enforces strict type safety for immutable audit records, action types,
target resource classifications, and paginated responses.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field

AuditActionType = Literal[
    "FOOD_APPROVED",
    "FOOD_REJECTED",
    "USER_QUOTA_RESET",
    "USER_BANNED",
    "USER_UNBANNED",
    "ADMIN_INVITED",
    "ADMIN_PERMISSIONS_UPDATED",
    "ADMIN_REVOKED",
    "SUBSCRIPTION_REFUNDED",
]

AuditResourceType = Literal[
    "food",
    "user",
    "admin",
    "subscription",
]


class AdminAuditEvent(BaseModel):
    event_id: str = Field(description="Unique immutable identifier for this audit event")
    schema_version: int = Field(default=1, description="Audit event schema version for backward compatibility")
    action: AuditActionType = Field(description="The privileged administrative action performed")
    actor_id: Optional[str] = Field(default=None, description="Stable user/admin ID of the actor")
    actor_email: Optional[str] = Field(default=None, description="Email of the authenticated administrator")
    admin_email: str = Field(description="Email address of the authenticated administrator (canonical/backwards-compat)")
    target_resource_id: str = Field(description="Unique identifier of the target resource mutated")
    target_resource_type: AuditResourceType = Field(description="Classification of target resource")
    details: Dict[str, Any] = Field(default_factory=dict, description="Structured non-sensitive mutation metadata")
    ip_address: Optional[str] = Field(default=None, description="IP address of the administrator if available")
    request_id: Optional[str] = Field(default=None, description="Correlation request ID")
    timestamp: datetime = Field(description="Timezone-aware UTC timestamp of the audit event")
    event_hash: Optional[str] = Field(default=None, description="Cryptographic SHA-256 hash of immutable event payload for tamper evidence")


class AdminAuditListResponse(BaseModel):
    items: List[AdminAuditEvent] = Field(description="List of chronological audit events matching query filters")
    total: int = Field(description="Total count of audit events matching query filters")
    skip: int = Field(description="Pagination offset")
    limit: int = Field(description="Pagination limit")
    has_more: bool = Field(default=False, description="Flag indicating if more records exist beyond the current page")
