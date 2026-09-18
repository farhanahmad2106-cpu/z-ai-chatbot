import os
import pytest
os.environ["RAZORPAY_KEY_ID"] = "rzp_test_dummy_123"
os.environ["RAZORPAY_KEY_SECRET"] = "dummy_secret_123"

from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

@pytest.fixture
def mock_collections():
    mock_transactions = AsyncMock()
    mock_users = AsyncMock()
    mock_admins = AsyncMock()
    
    with patch("routes.admin._get_transactions_collection", return_value=mock_transactions), \
         patch("routes.admin._get_users_collection", return_value=mock_users), \
         patch("routes.admin._get_admins_collection", return_value=mock_admins), \
         patch("routes.admin.log_system_event", new=AsyncMock()), \
         patch("backend.routes.admin._get_transactions_collection", return_value=mock_transactions), \
         patch("backend.routes.admin._get_users_collection", return_value=mock_users), \
         patch("backend.routes.admin._get_admins_collection", return_value=mock_admins), \
         patch("backend.routes.admin.log_system_event", new=AsyncMock()):
        yield mock_transactions, mock_users, mock_admins

@pytest.fixture
def mock_admin_auth(mock_collections):
    _, _, mock_admins = mock_collections
    mock_admins.find_one.return_value = {
        "_id": "mock_admin_id_001",
        "email": "farhanahmad2106@gmail.com",
        "is_super_admin": True,
        "permissions": {"canManageAdmins": True}
    }
    return {"Authorization": "Bearer test_super_admin"}

@pytest.fixture
def mock_normal_admin_auth(mock_collections):
    _, _, mock_admins = mock_collections
    mock_admins.find_one.return_value = {
        "_id": "mock_admin_id_002",
        "email": "normal@zsehealth.internal",
        "is_super_admin": False,
        "permissions": {"canManageAdmins": False}
    }
    with patch("routes.admin.firebase_auth.verify_id_token", return_value={"uid": "normal_uid", "email": "normal@zsehealth.internal"}), \
         patch("backend.routes.admin.firebase_auth.verify_id_token", return_value={"uid": "normal_uid", "email": "normal@zsehealth.internal"}):
        yield {"Authorization": "Bearer mock_normal_token"}

@pytest.fixture
def mock_razorpay():
    with patch("routes.admin.razorpay.Client") as mock_client_class_1, \
         patch("backend.routes.admin.razorpay.Client") as mock_client_class_2:
        mock_instance = MagicMock()
        mock_client_class_1.return_value = mock_instance
        mock_client_class_2.return_value = mock_instance
        yield mock_instance

def test_missing_auth():
    response = client.post("/api/admin/subscriptions/refund", json={
        "payment_id": "pay_123",
        "reason": "customer_request"
    })
    assert response.status_code == 401

def test_unauthorized_admin(mock_normal_admin_auth):
    response = client.post("/api/admin/subscriptions/refund", json={
        "payment_id": "pay_123",
        "reason": "customer_request"
    }, headers=mock_normal_admin_auth)
    assert response.status_code == 403

def test_missing_validation_fields(mock_admin_auth):
    # Missing payment_id
    response = client.post("/api/admin/subscriptions/refund", json={
        "reason": "customer_request"
    }, headers=mock_admin_auth)
    assert response.status_code == 422
    
    # Missing reason
    response = client.post("/api/admin/subscriptions/refund", json={
        "payment_id": "pay_123"
    }, headers=mock_admin_auth)
    assert response.status_code == 422

def test_unknown_payment(mock_admin_auth, mock_collections):
    mock_transactions, _, _ = mock_collections
    mock_transactions.find_one.return_value = None
    
    response = client.post("/api/admin/subscriptions/refund", json={
        "payment_id": "pay_invalid",
        "reason": "customer_request"
    }, headers=mock_admin_auth)
    assert response.status_code == 404

def test_full_refund_success(mock_admin_auth, mock_collections, mock_razorpay):
    mock_transactions, mock_users, _ = mock_collections
    
    mock_transactions.find_one.return_value = {
        "_id": "tx_123",
        "payment_id": "pay_123",
        "amount": 10000,
        "subscription_id": "sub_123",
        "refunds": []
    }
    mock_users.find_one.return_value = {
        "_id": "user_123",
        "subscription": {
            "razorpay_subscription_id": "sub_123",
            "status": "active"
        }
    }
    
    mock_razorpay.payment.refund.return_value = {"id": "rfnd_123", "status": "processed"}
    
    response = client.post("/api/admin/subscriptions/refund", json={
        "payment_id": "pay_123",
        "reason": "customer_request"
    }, headers=mock_admin_auth)
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["refund_id"] == "rfnd_123"
    assert data["user_downgraded"] is True
    
    mock_razorpay.payment.refund.assert_called_once_with("pay_123", {"notes": {"reason": "customer_request"}})
    mock_users.update_one.assert_called_once()
    mock_transactions.update_one.assert_called_once()

def test_partial_refund_success(mock_admin_auth, mock_collections, mock_razorpay):
    mock_transactions, mock_users, _ = mock_collections
    
    mock_transactions.find_one.return_value = {
        "_id": "tx_123",
        "payment_id": "pay_123",
        "amount": 10000,
        "subscription_id": "sub_123",
        "refunds": []
    }
    mock_razorpay.payment.refund.return_value = {"id": "rfnd_123", "status": "processed"}
    
    response = client.post("/api/admin/subscriptions/refund", json={
        "payment_id": "pay_123",
        "amount": 4000,
        "reason": "customer_request"
    }, headers=mock_admin_auth)
    
    assert response.status_code == 200
    data = response.json()
    assert data["user_downgraded"] is False
    
    mock_razorpay.payment.refund.assert_called_once_with("pay_123", {"notes": {"reason": "customer_request"}, "amount": 4000})
    mock_users.update_one.assert_not_called()

def test_refund_amount_exceeds(mock_admin_auth, mock_collections):
    mock_transactions, _, _ = mock_collections
    mock_transactions.find_one.return_value = {
        "_id": "tx_123",
        "payment_id": "pay_123",
        "amount": 10000,
        "refunds": [{"amount": 7000}]
    }
    
    response = client.post("/api/admin/subscriptions/refund", json={
        "payment_id": "pay_123",
        "amount": 4000,
        "reason": "customer_request"
    }, headers=mock_admin_auth)
    
    assert response.status_code == 400
    assert "exceeds remaining refundable amount" in response.json()["detail"]

def test_razorpay_failure(mock_admin_auth, mock_collections, mock_razorpay):
    mock_transactions, mock_users, _ = mock_collections
    
    mock_transactions.find_one.return_value = {
        "_id": "tx_123",
        "payment_id": "pay_123",
        "amount": 10000,
        "refunds": []
    }
    
    mock_razorpay.payment.refund.side_effect = Exception("Gateway Timeout")
    
    response = client.post("/api/admin/subscriptions/refund", json={
        "payment_id": "pay_123",
        "reason": "customer_request"
    }, headers=mock_admin_auth)
    
    assert response.status_code == 502
    assert response.json()["detail"] == "Refund failed at gateway"
    mock_transactions.update_one.assert_not_called()
    mock_users.update_one.assert_not_called()
