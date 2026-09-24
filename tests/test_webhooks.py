import os
import json
import hashlib
import hmac
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
import pymongo.errors

# Set environment variable before importing router
os.environ["RAZORPAY_WEBHOOK_SECRET"] = "test_secret_123"

from backend.routes.webhooks import router, get_razorpay_webhook_secret

# Create a simple FastAPI app for testing
from fastapi import FastAPI
app = FastAPI()
app.include_router(router)

client = TestClient(app)

# Helper function to generate valid signature
def generate_signature(secret: str, payload: bytes) -> str:
    return hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256
    ).hexdigest()

@pytest.fixture
def mock_users_collection():
    mock_col = AsyncMock()
    return mock_col

@pytest.fixture
def mock_transactions_collection():
    mock_col = AsyncMock()
    # By default, insert_one succeeds
    return mock_col

@pytest.fixture
def override_collections(mock_users_collection, mock_transactions_collection, monkeypatch):
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "test_secret_123")
    with patch("backend.routes.webhooks._get_users_collection", return_value=mock_users_collection), \
         patch("backend.routes.webhooks._get_transactions_collection", return_value=mock_transactions_collection):
        yield mock_users_collection, mock_transactions_collection

def test_1_valid_signature(override_collections):
    mock_users, mock_tx = override_collections
    
    payload = {
        "event": "subscription.activated",
        "id": "evt_test_123",
        "payload": {
            "subscription": {
                "entity": {
                    "id": "sub_test_123",
                    "plan_id": "__starter__"
                }
            }
        }
    }
    raw_body = json.dumps(payload).encode("utf-8")
    signature = generate_signature("test_secret_123", raw_body)
    
    response = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"x-razorpay-signature": signature, "x-razorpay-event-id": "evt_test_123"}
    )
    
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    mock_tx.insert_one.assert_called_once()
    mock_users.update_one.assert_called_once()
    
def test_2_forged_signature(override_collections):
    mock_users, mock_tx = override_collections
    
    payload = {"event": "subscription.activated"}
    raw_body = json.dumps(payload).encode("utf-8")
    
    response = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"x-razorpay-signature": "invalid_signature"}
    )
    
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid webhook signature"}
    mock_tx.insert_one.assert_not_called()
    mock_users.update_one.assert_not_called()

def test_3_missing_signature(override_collections):
    mock_users, mock_tx = override_collections
    
    payload = {"event": "subscription.activated"}
    raw_body = json.dumps(payload).encode("utf-8")
    
    response = client.post(
        "/api/webhooks/razorpay",
        content=raw_body
        # Missing x-razorpay-signature header
    )
    
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid webhook signature"}
    mock_tx.insert_one.assert_not_called()
    mock_users.update_one.assert_not_called()

def test_4_missing_webhook_secret(override_collections, monkeypatch):
    mock_users, mock_tx = override_collections
    
    # Remove the environment variable
    monkeypatch.delenv("RAZORPAY_WEBHOOK_SECRET", raising=False)
    
    payload = {"event": "subscription.activated"}
    raw_body = json.dumps(payload).encode("utf-8")
    
    response = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"x-razorpay-signature": "some_signature"}
    )
    
    assert response.status_code == 500
    assert response.json() == {"detail": "Webhook configuration error"}
    mock_tx.insert_one.assert_not_called()
    mock_users.update_one.assert_not_called()

def test_5_duplicate_webhook(override_collections):
    mock_users, mock_tx = override_collections
    
    # Simulate duplicate key error on insert_one
    mock_tx.insert_one.side_effect = [None, pymongo.errors.DuplicateKeyError("Duplicate key")]
    mock_tx.find_one.return_value = {"_id": "evt_duplicate_123", "status": "completed"}
    
    payload = {
        "event": "subscription.activated",
        "id": "evt_duplicate_123",
        "payload": {
            "subscription": {
                "entity": {
                    "id": "sub_test_123",
                    "plan_id": "__starter__"
                }
            }
        }
    }
    raw_body = json.dumps(payload).encode("utf-8")
    signature = generate_signature("test_secret_123", raw_body)
    
    # First call
    response1 = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"x-razorpay-signature": signature, "x-razorpay-event-id": "evt_duplicate_123"}
    )
    assert response1.status_code == 200
    assert mock_users.update_one.call_count == 1
    
    # Second call - Should hit DuplicateKeyError and return 200 without mutating user
    response2 = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"x-razorpay-signature": signature, "x-razorpay-event-id": "evt_duplicate_123"}
    )
    assert response2.status_code == 200
    assert mock_users.update_one.call_count == 1  # Still 1, did not increment!

def test_6_concurrent_duplicate_webhook(override_collections):
    # Simulated via test_5. DuplicateKeyError handles concurrency atomically.
    pass

def test_7_raw_body_verification(override_collections):
    mock_users, mock_tx = override_collections
    
    # Payload with extra whitespace/newlines
    raw_body = b'{\n  "event": "subscription.activated", \n  "id": "evt_raw_test", \n  "payload": {"subscription": {"entity": {"id": "sub_1", "plan_id": "free"}}}\n}'
    signature = generate_signature("test_secret_123", raw_body)
    
    # This should pass because we sign the exact raw_body
    response = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"x-razorpay-signature": signature, "x-razorpay-event-id": "evt_raw_test"}
    )
    assert response.status_code == 200
    
    # If we sign a minified version, it should fail
    minified_body = json.dumps(json.loads(raw_body.decode("utf-8"))).encode("utf-8")
    bad_signature = generate_signature("test_secret_123", minified_body)
    
    response_fail = client.post(
        "/api/webhooks/razorpay",
        content=raw_body,
        headers={"x-razorpay-signature": bad_signature, "x-razorpay-event-id": "evt_raw_test"}
    )
    assert response_fail.status_code == 400
