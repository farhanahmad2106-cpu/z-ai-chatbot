"""
Pydantic Schemas for Z-SeHealth Admin Operations & RBAC Governance.
Enforces strict type safety for admin models, granular capability permissions,
user management actions, food moderation, and telemetry logs.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class AdminPermissions(BaseModel):
    canManageAdmins: bool = Field(default=False, description="Super Admin only capability to manage admin roster")
    canManageUsers: bool = Field(default=True, description="Capability to inspect users, toggle bans, and reset scan quota")
    canApproveFoods: bool = Field(default=True, description="Capability to approve or reject crowdsourced food entries")
    canTriggerOTA: bool = Field(default=False, description="Capability to trigger GitHub Actions EAS OTA hotfixes")
    canViewRevenue: bool = Field(default=False, description="Capability to view financial metrics and billing ledgers")
    canViewLogs: bool = Field(default=True, description="Capability to inspect system_logs and telemetry streams")


class AdminUserResponse(BaseModel):
    id: str = Field(description="MongoDB Document ID / unique identifier")
    uid: Optional[str] = Field(default=None, description="Firebase Auth UID")
    email: str = Field(description="Admin user email address")
    name: str = Field(default="", description="Admin display name")
    is_super_admin: bool = Field(default=False, description="Master super admin indicator")
    permissions: AdminPermissions = Field(default_factory=AdminPermissions)
    created_at: str = Field(description="ISO-8601 creation timestamp")
    last_login: Optional[str] = Field(default=None, description="ISO-8601 last login timestamp")
    is_active: bool = Field(default=True, description="Active status indicator")


class AdminVerifyRequest(BaseModel):
    token: Optional[str] = Field(default=None, description="Optional Firebase ID Token in body if not in Authorization header")


class AdminInviteRequest(BaseModel):
    email: str = Field(min_length=5, description="Invited admin email address")
    name: str = Field(min_length=2, max_length=100, description="Admin full name")
    permissions: AdminPermissions = Field(default_factory=AdminPermissions)


class AdminPermissionUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, description="Updated display name")
    permissions: Optional[AdminPermissions] = Field(default=None, description="Updated permission capabilities")
    is_active: Optional[bool] = Field(default=None, description="Active status toggle")


class CrowdsourcedFoodReview(BaseModel):
    action: str = Field(description="'approve' or 'reject'")
    rejection_reason: Optional[str] = Field(default=None, description="Explanation if rejected")
    updated_data: Optional[Dict[str, Any]] = Field(default=None, description="Optional edited food fields upon approval")


class SystemLogEntry(BaseModel):
    id: Optional[str] = None
    timestamp: str
    level: str = Field(description="CRASH, ERROR, WARNING, FAILOVER, or INFO")
    service: str = Field(description="Backend service or endpoint name")
    message: str
    details: Optional[Dict[str, Any]] = None


class OtaDispatchRequest(BaseModel):
    channel: str = Field(default="production", description="Target EAS release channel: 'production' | 'staging'")
    message: str = Field(min_length=3, description="Hotfix or release description notes")
    action: str = Field(default="publish", description="'publish' or 'rollback'")


class UserResetQuotaResponse(BaseModel):
    success: bool
    user_id: str
    previous_scans: int
    new_scans: int = 0
    message: str


class UserToggleBanResponse(BaseModel):
    success: bool
    user_id: str
    is_banned: bool
    message: str
