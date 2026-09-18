import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from backend.main import app, get_current_user_id

client = TestClient(app)

@pytest.fixture
def mock_auth():
    app.dependency_overrides[get_current_user_id] = lambda: "test_user_consent_123"
    yield "test_user_consent_123"
    app.dependency_overrides.pop(get_current_user_id, None)

@pytest.mark.asyncio
async def test_consent_grant_and_audit(mock_auth):
    fake_user = {
        "uid": "test_user_consent_123",
        "email": "consent@test.com",
        "health_vault_consent": None
    }
    
    with patch("backend.main.users_collection") as mock_users, \
         patch("backend.main.consents_collection") as mock_consents:
        
        mock_users.find_one = AsyncMock(return_value=fake_user)
        mock_users.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
        mock_consents.insert_one = AsyncMock(return_value=MagicMock(inserted_id="c123"))
        
        payload = {
            "consent_type": "health_vault",
            "version": "1.0",
            "action": "granted",
            "mechanism": "health_vault_modal_checkbox"
        }
        
        response = client.post(
            "/api/user/consent",
            json=payload,
            headers={"Authorization": "Bearer fake_token"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["consent"]["status"] == "granted"
        assert data["consent"]["version"] == "1.0"
        assert "timestamp" in data["consent"]
        
        # Verify audit insertion
        mock_consents.insert_one.assert_called_once()
        inserted_audit = mock_consents.insert_one.call_args[0][0]
        assert inserted_audit["uid"] == "test_user_consent_123"
        assert inserted_audit["policy_version"] == "1.0"
        assert inserted_audit["action"] == "granted"

@pytest.mark.asyncio
async def test_profile_update_sensitive_blocks_without_consent(mock_auth):
    # User has NO consent
    fake_user = {
        "uid": "test_user_consent_123",
        "health_vault_consent": None
    }
    
    with patch("backend.main.users_collection") as mock_users:
        mock_users.find_one = AsyncMock(return_value=fake_user)
        
        # Attempt to save medical conditions
        response = client.post(
            "/api/user/profile",
            json={"health_profile": {"medicalConditions": "Diabetes, Hypertension"}},
            headers={"Authorization": "Bearer fake_token"}
        )
        assert response.status_code == 403
        assert "consent" in response.json()["detail"].lower()
        
        # Attempt to save severe allergies
        response_allergy = client.post(
            "/api/user/profile",
            json={"preferences": {"allergies": ["Peanuts", "Shellfish"]}},
            headers={"Authorization": "Bearer fake_token"}
        )
        assert response_allergy.status_code == 403
        assert "consent" in response_allergy.json()["detail"].lower()

@pytest.mark.asyncio
async def test_profile_update_non_sensitive_allowed_without_consent(mock_auth):
    # User has NO consent, but updates only age/weight/diet
    fake_user = {
        "uid": "test_user_consent_123",
        "health_vault_consent": None
    }
    
    with patch("backend.main.users_collection") as mock_users:
        mock_users.find_one = AsyncMock(return_value=fake_user)
        mock_users.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
        
        response = client.post(
            "/api/user/profile",
            json={
                "health_profile": {"age": 28, "height": 175, "weight": 70, "medicalConditions": ""},
                "preferences": {"diet": "Vegetarian", "allergies": []},
                "settings": {"darkMode": True}
            },
            headers={"Authorization": "Bearer fake_token"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"

@pytest.mark.asyncio
async def test_profile_update_sensitive_allowed_with_valid_consent(mock_auth):
    # User HAS valid 1.0 consent
    fake_user = {
        "uid": "test_user_consent_123",
        "health_vault_consent": {
            "status": "granted",
            "version": "1.0",
            "timestamp": "2026-09-18T10:00:00Z"
        }
    }
    
    with patch("backend.main.users_collection") as mock_users:
        mock_users.find_one = AsyncMock(return_value=fake_user)
        mock_users.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
        
        response = client.post(
            "/api/user/profile",
            json={
                "health_profile": {"medicalConditions": "Diabetes, Hypertension"},
                "preferences": {"allergies": ["Peanuts"]}
            },
            headers={"Authorization": "Bearer fake_token"}
        )
        assert response.status_code == 200
        assert response.json()["status"] == "success"

@pytest.mark.asyncio
async def test_health_profile_deletion_and_withdrawal(mock_auth):
    fake_user = {
        "uid": "test_user_consent_123",
        "health_vault_consent": {
            "status": "granted",
            "version": "1.0"
        }
    }
    
    with patch("backend.main.users_collection") as mock_users, \
         patch("backend.main.consents_collection") as mock_consents:
        
        mock_users.find_one = AsyncMock(return_value=fake_user)
        mock_users.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
        mock_consents.insert_one = AsyncMock(return_value=MagicMock(inserted_id="c124"))
        
        response = client.delete(
            "/api/user/health-profile",
            headers={"Authorization": "Bearer fake_token"}
        )
        assert response.status_code == 200
        assert "withdrawn" in response.json()["message"].lower()
        
        # Verify withdrawal audit entry
        mock_consents.insert_one.assert_called_once()
        audit_call = mock_consents.insert_one.call_args[0][0]
        assert audit_call["action"] == "withdrawn"
