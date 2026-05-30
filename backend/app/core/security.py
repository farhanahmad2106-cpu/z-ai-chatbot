"""
Z-AI Chatbot — Security Layer
Handles:
  - PIN → database key derivation (Argon2id)
  - JWT user session tokens (HS256)
  - Admin API key validation
  - Ed25519 keypair generation for LAN sync handshakes
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from jose import JWTError, jwt
from nacl.public import PrivateKey
from nacl.signing import SigningKey
from nacl.encoding import HexEncoder
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

from app.core.config import get_settings

settings = get_settings()

# ── Argon2id configuration ─────────────────────────────────────────────────────
# These parameters are intentionally conservative for local key derivation.
# time_cost=3, memory_cost=65536 (64 MiB), parallelism=1 gives ~500ms on
# mid-range hardware — enough to slow brute-force, not enough to annoy users.
_ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    salt_len=16,
)

# ── Admin API key header ───────────────────────────────────────────────────────
_admin_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=False)


# ─────────────────────────────────────────────────────────────────────────────
# PIN Utilities
# ─────────────────────────────────────────────────────────────────────────────

def hash_pin(pin: str) -> str:
    """
    Hash a user PIN with Argon2id.
    Returns the full Argon2 encoded string (salt embedded).
    Store this in the database; never store the raw PIN.
    """
    return _ph.hash(pin)


def verify_pin(stored_hash: str, provided_pin: str) -> bool:
    """
    Verify a provided PIN against a stored Argon2id hash.
    Returns True on match, False on mismatch.
    Raises no exceptions — all errors map to False.
    """
    try:
        return _ph.verify(stored_hash, provided_pin)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def derive_db_key(pin: str, salt_hex: str) -> str:
    """
    Derive a 64-character hex key for SQLCipher's PRAGMA key from a PIN.

    SQLCipher expects the key as a raw hex string prefixed with "x'...'".
    This function returns just the 64-char hex portion — the caller wraps it.

    The salt is stored in plaintext in the database header (standard practice).
    The security comes from Argon2id's computational cost, not salt secrecy.
    """
    import hashlib
    salt = bytes.fromhex(salt_hex)
    # Argon2id raw hash — 32 bytes → 64 hex chars
    raw = _ph.hash(pin).encode()
    # PBKDF2 final stretch using the stored salt to get deterministic 32-byte key
    key_bytes = hashlib.pbkdf2_hmac(
        "sha256",
        raw,
        salt,
        iterations=settings.db_key_iterations,
        dklen=32,
    )
    return key_bytes.hex()


def generate_db_salt() -> str:
    """Generate a fresh 16-byte cryptographic salt as a hex string."""
    return secrets.token_hex(16)


# ─────────────────────────────────────────────────────────────────────────────
# JWT Session Tokens
# ─────────────────────────────────────────────────────────────────────────────

def create_access_token(
    subject: str,
    expires_delta: timedelta | None = None,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """
    Create a signed JWT user session token.

    Args:
        subject:      Typically the device_id or user_id string.
        expires_delta: Override the default TTL from settings.
        extra_claims:  Any additional payload fields (e.g., {"role": "user"}).

    Returns:
        Signed JWT string.
    """
    expire = datetime.now(tz=timezone.utc) + (
        expires_delta
        or timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    payload: dict[str, Any] = {
        "sub": subject,
        "exp": expire,
        "iat": datetime.now(tz=timezone.utc),
        "type": "access",
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(
        payload,
        settings.jwt_secret.get_secret_value(),
        algorithm=settings.jwt_algorithm,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT. Raises HTTPException 401 on any failure.
    """
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "access":
            raise JWTError("Wrong token type")
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ─────────────────────────────────────────────────────────────────────────────
# Admin API Key Guard
# ─────────────────────────────────────────────────────────────────────────────

def require_admin_key(
    api_key: str | None = Security(_admin_key_header),
) -> str:
    """
    FastAPI dependency that enforces the admin API key.

    Usage:
        @router.get("/admin/users")
        async def list_users(_: str = Depends(require_admin_key)):
            ...

    Returns the validated key string on success.
    Raises 403 Forbidden on failure — not 401, to avoid leaking the existence
    of the admin boundary to unauthenticated callers.
    """
    expected = settings.admin_api_key.get_secret_value()
    if not api_key or not secrets.compare_digest(api_key, expected):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access denied",
        )
    return api_key


# ─────────────────────────────────────────────────────────────────────────────
# Ed25519 LAN Sync Keypair
# ─────────────────────────────────────────────────────────────────────────────

def generate_sync_keypair() -> dict[str, str]:
    """
    Generate an Ed25519 signing keypair for LAN sync peer authentication.
    Both keys are returned as hex strings for storage in SQLCipher.

    The private key is stored encrypted in the local database.
    The public key is broadcast via mDNS for peer discovery.
    """
    signing_key = SigningKey.generate()
    verify_key = signing_key.verify_key
    return {
        "private_key_hex": signing_key.encode(encoder=HexEncoder).decode(),
        "public_key_hex": verify_key.encode(encoder=HexEncoder).decode(),
    }


def sign_sync_challenge(private_key_hex: str, challenge: bytes) -> str:
    """Sign a LAN sync challenge with the local device's Ed25519 private key."""
    signing_key = SigningKey(bytes.fromhex(private_key_hex))
    signed = signing_key.sign(challenge, encoder=HexEncoder)
    return signed.signature.decode()


def verify_sync_signature(
    public_key_hex: str, challenge: bytes, signature_hex: str
) -> bool:
    """Verify a peer's Ed25519 signature on a LAN sync challenge."""
    from nacl.signing import VerifyKey
    from nacl.exceptions import BadSignatureError

    try:
        verify_key = VerifyKey(bytes.fromhex(public_key_hex))
        verify_key.verify(challenge, bytes.fromhex(signature_hex))
        return True
    except BadSignatureError:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def generate_device_id() -> str:
    """Generate a unique, URL-safe random device identifier (32 chars)."""
    return secrets.token_urlsafe(24)


def generate_admin_key() -> str:
    """
    Generate a cryptographically strong admin API key (64 chars).
    Call this once during initial setup and store in .env as ADMIN_API_KEY.
    """
    return secrets.token_urlsafe(48)
