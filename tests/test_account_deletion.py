import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app
import firebase_admin.auth as firebase_auth

client = TestClient(app)

@pytest.fixture
def mock_collections():
    mock_users = AsyncMock()
    mock_foods = AsyncMock()
    
    with patch("backend.main.users_collection", mock_users), \
         patch("backend.main.foods_collection", mock_foods):
        yield mock_users, mock_foods

@pytest.fixture
def mock_auth():
    from backend.main import get_current_user_id
    app.dependency_overrides[get_current_user_id] = lambda: "test_uid_123"
    yield
    app.dependency_overrides = {}

@pytest.fixture
def mock_firebase_auth():
    with patch("backend.main.firebase_auth") as mock_fb:
        mock_fb.UserNotFoundError = firebase_auth.UserNotFoundError
        yield mock_fb

def test_missing_auth():
    # Calling without mock_auth should trigger 401 based on get_current_user_id implementation
    from backend.main import get_current_user_id
    app.dependency_overrides = {}
    response = client.delete("/api/user/account")
    assert response.status_code == 401

def test_successful_deletion(mock_collections, mock_auth, mock_firebase_auth):
    mock_users, mock_foods = mock_collections
    
    # Mock finding the user
    mock_users.find_one.return_value = {"uid": "test_uid_123", "email": "test@example.com"}
    mock_users.delete_one.return_value.deleted_count = 1
    
    response = client.delete("/api/user/account")
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["account_data_deleted"] is True
    assert data["health_vault_deleted"] is True
    assert data["crowdsourced_records_anonymized"] is True
    assert data["firebase_account_deleted"] is True
    
    # Verify foods anonymization
    mock_foods.update_many.assert_called_once_with(
        {"$or": [{"submitted_by": "test_uid_123"}, {"submitted_by": "test@example.com"}]},
        {"$set": {"submitted_by": "ANONYMIZED_USER"}}
    )
    
    # Verify user deletion
    mock_users.delete_one.assert_called_once_with({"uid": "test_uid_123"})
    
    # Verify firebase deletion
    mock_firebase_auth.delete_user.assert_called_once_with("test_uid_123")

def test_user_not_found(mock_collections, mock_auth):
    mock_users, _ = mock_collections
    mock_users.find_one.return_value = None
    
    response = client.delete("/api/user/account")
    assert response.status_code == 404
    assert response.json()["detail"] == "User not found"

def test_firebase_deletion_failure(mock_collections, mock_auth, mock_firebase_auth):
    mock_users, _ = mock_collections
    mock_users.find_one.return_value = {"uid": "test_uid_123"}
    mock_users.delete_one.return_value.deleted_count = 1
    
    # Simulate firebase error
    mock_firebase_auth.delete_user.side_effect = Exception("Firebase connection error")
    
    response = client.delete("/api/user/account")
    assert response.status_code == 200
    data = response.json()
    assert data["firebase_account_deleted"] is False
    assert data["firebase_account_deletion_status"] == "failed"

def test_firebase_already_deleted(mock_collections, mock_auth, mock_firebase_auth):
    mock_users, _ = mock_collections
    mock_users.find_one.return_value = {"uid": "test_uid_123"}
    mock_users.delete_one.return_value.deleted_count = 1
    
    # Simulate firebase user not found
    mock_firebase_auth.UserNotFoundError = firebase_auth.UserNotFoundError
    mock_firebase_auth.delete_user.side_effect = firebase_auth.UserNotFoundError("User not found")
    
    response = client.delete("/api/user/account")
    assert response.status_code == 200
    data = response.json()
    assert data["firebase_account_deleted"] is True
    assert data["firebase_account_deletion_status"] == "completed"
