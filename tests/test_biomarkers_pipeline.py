import pytest
from unittest.mock import AsyncMock, patch, MagicMock, PropertyMock
from fastapi.testclient import TestClient
from backend.main import app, get_current_user_id
from datetime import datetime, timezone, timedelta

client = TestClient(app)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def get_valid_payload():
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return {
        "source": "apple_healthkit",
        "recorded_date": today_str,
        "step_count": 8500,
        "active_energy_burned_kcal": 620,
        "resting_heart_rate_bpm": 61,
        "uid": "malicious_uid"  # injected — must never be used
    }


def get_valid_user():
    return {
        "uid": "test_user_uid",
        "health_vault_consent": {
            "status": "granted",
            "version": "1.0"
        },
        "health_profile": {
            "weight": 70,
            "height": 175,
            "age": 30,
            "gender": "Male",
            "healthGoal": "Healthy Lifestyle",
            "medicalConditions": ""
        }
    }


@pytest.fixture(autouse=True)
def _cleanup_overrides():
    """Ensure dependency_overrides are clean before and after each test."""
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def mock_auth():
    """Override the main.py get_current_user_id for routes defined in main.py."""
    app.dependency_overrides[get_current_user_id] = lambda: "test_user_uid"
    yield "test_user_uid"


@pytest.fixture
def bio_mocks(mock_auth):
    """
    Patch main-module globals that the biomarkers route accesses at request
    time via sys.modules (users_collection, db["user_biometrics"],
    get_current_user_id).
    """
    users_mock = AsyncMock()
    bio_mock = AsyncMock()

    # Mock db so db["user_biometrics"] returns bio_mock
    db_mock = MagicMock()
    db_mock.__getitem__ = MagicMock(return_value=bio_mock)

    with patch("backend.main.get_current_user_id", new=AsyncMock(return_value="test_user_uid")), \
         patch("backend.main.users_collection", users_mock), \
         patch("backend.main.db", db_mock):
        yield users_mock, bio_mock


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_unauthenticated_request():
    """No Authorization header → 401."""
    response = client.post("/api/user/biometrics/sync", json=get_valid_payload())
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_missing_consent(bio_mocks):
    users_mock, _ = bio_mocks
    user = get_valid_user()
    user["health_vault_consent"] = {}
    users_mock.find_one = AsyncMock(return_value=user)

    response = client.post(
        "/api/user/biometrics/sync",
        json=get_valid_payload(),
        headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "CONSENT_REQUIRED"


@pytest.mark.asyncio
async def test_wrong_consent_version(bio_mocks):
    users_mock, _ = bio_mocks
    user = get_valid_user()
    user["health_vault_consent"]["version"] = "0.9"
    users_mock.find_one = AsyncMock(return_value=user)

    response = client.post(
        "/api/user/biometrics/sync",
        json=get_valid_payload(),
        headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_consent_withdrawn(bio_mocks):
    users_mock, _ = bio_mocks
    user = get_valid_user()
    user["health_vault_consent"]["status"] = "withdrawn"
    users_mock.find_one = AsyncMock(return_value=user)

    response = client.post(
        "/api/user/biometrics/sync",
        json=get_valid_payload(),
        headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_validation_errors(bio_mocks):
    users_mock, _ = bio_mocks
    users_mock.find_one = AsyncMock(return_value=get_valid_user())

    payload = get_valid_payload()

    # invalid step count — negative
    payload["step_count"] = -1
    assert client.post("/api/user/biometrics/sync", json=payload,
                       headers={"Authorization": "Bearer fake"}).status_code == 422

    # invalid step count — too high
    payload["step_count"] = 100001
    assert client.post("/api/user/biometrics/sync", json=payload,
                       headers={"Authorization": "Bearer fake"}).status_code == 422
    payload["step_count"] = 8500

    # invalid active energy — negative
    payload["active_energy_burned_kcal"] = -1
    assert client.post("/api/user/biometrics/sync", json=payload,
                       headers={"Authorization": "Bearer fake"}).status_code == 422
    payload["active_energy_burned_kcal"] = 620

    # invalid resting heart rate — too low / too high
    payload["resting_heart_rate_bpm"] = 29
    assert client.post("/api/user/biometrics/sync", json=payload,
                       headers={"Authorization": "Bearer fake"}).status_code == 422

    payload["resting_heart_rate_bpm"] = 221
    assert client.post("/api/user/biometrics/sync", json=payload,
                       headers={"Authorization": "Bearer fake"}).status_code == 422
    payload["resting_heart_rate_bpm"] = 60

    # malformed date
    payload["recorded_date"] = "01-01-2026"
    assert client.post("/api/user/biometrics/sync", json=payload,
                       headers={"Authorization": "Bearer fake"}).status_code == 422

    # invalid source
    payload["recorded_date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    payload["source"] = "invalid_source"
    assert client.post("/api/user/biometrics/sync", json=payload,
                       headers={"Authorization": "Bearer fake"}).status_code == 422


@pytest.mark.asyncio
async def test_future_date_rejected(bio_mocks):
    users_mock, _ = bio_mocks
    users_mock.find_one = AsyncMock(return_value=get_valid_user())

    payload = get_valid_payload()
    future = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d")
    payload["recorded_date"] = future

    response = client.post(
        "/api/user/biometrics/sync",
        json=payload,
        headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 422
    assert "future" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_authorization_isolation(bio_mocks):
    """The authenticated UID must be used — never the payload 'uid'."""
    users_mock, bio_mock = bio_mocks
    users_mock.find_one = AsyncMock(return_value=get_valid_user())
    bio_mock.find_one = AsyncMock(return_value=None)

    payload = get_valid_payload()
    response = client.post(
        "/api/user/biometrics/sync",
        json=payload,
        headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 200

    # Validate update_one was called with the authenticated UID, not the injected one
    bio_mock.update_one.assert_called_once()
    args = bio_mock.update_one.call_args[0]
    assert args[0]["uid"] == "test_user_uid"
    assert args[1]["$set"]["uid"] == "test_user_uid"


@pytest.mark.asyncio
async def test_idempotency_and_source_conflict(bio_mocks):
    """Manual sync must not overwrite an existing google_health_connect record."""
    users_mock, bio_mock = bio_mocks
    users_mock.find_one = AsyncMock(return_value=get_valid_user())

    bio_mock.find_one = AsyncMock(return_value={
        "source": "google_health_connect",
        "step_count": 5000,
        "active_energy_burned_kcal": 300,
        "resting_heart_rate_bpm": 65
    })

    payload = get_valid_payload()
    payload["source"] = "manual"
    response = client.post(
        "/api/user/biometrics/sync",
        json=payload,
        headers={"Authorization": "Bearer fake"}
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Ignored lower-priority source payload."
    assert response.json()["source"] == "google_health_connect"
    assert response.json()["biometrics"]["step_count"] == 5000


@pytest.mark.asyncio
async def test_metabolic_calculations(bio_mocks):
    """
    BMR for Male 30yo 70 kg 175 cm:
      10*70 + 6.25*175 - 5*30 + 5 = 1648.75
    TDEE (sedentary 1.2) = 1978.5
    Activity adj = 620 * 0.85 = 527
    Target = 1978.5 + 527 = 2505.5 → round → 2506
    """
    users_mock, bio_mock = bio_mocks
    users_mock.find_one = AsyncMock(return_value=get_valid_user())
    bio_mock.find_one = AsyncMock(return_value=None)

    response = client.post(
        "/api/user/biometrics/sync",
        json=get_valid_payload(),
        headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 200
    targets = response.json()["daily_targets"]
    assert targets["calories"] == 2506

    # active energy 620 > 600 → 1.6 g/kg × 70 = 112 g
    assert targets["protein"] == 112
    assert targets["fat"] >= 0
    assert targets["carbs"] >= 0


@pytest.mark.asyncio
async def test_clinical_caps(bio_mocks):
    users_mock, bio_mock = bio_mocks
    user = get_valid_user()
    user["health_profile"]["medicalConditions"] = "Diabetes, Hypertension"
    users_mock.find_one = AsyncMock(return_value=user)
    bio_mock.find_one = AsyncMock(return_value=None)

    response = client.post(
        "/api/user/biometrics/sync",
        json=get_valid_payload(),
        headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 200
    targets = response.json()["daily_targets"]
    assert targets["added_sugar_per_meal_cap_g"] == 5
    assert targets["sodium_per_meal_cap_mg"] == 499


@pytest.mark.asyncio
async def test_missing_profile_data(bio_mocks):
    """When health_profile is incomplete, return default goals safely."""
    users_mock, bio_mock = bio_mocks
    user = get_valid_user()
    user["health_profile"]["weight"] = None
    users_mock.find_one = AsyncMock(return_value=user)
    bio_mock.find_one = AsyncMock(return_value=None)

    response = client.post(
        "/api/user/biometrics/sync",
        json=get_valid_payload(),
        headers={"Authorization": "Bearer fake"}
    )
    assert response.status_code == 200
    targets = response.json()["daily_targets"]
    assert targets["source"] == "default"


@pytest.mark.asyncio
async def test_stats_integration(mock_auth):
    """GET /api/user/stats must surface updated daily_goals."""
    user = get_valid_user()
    user["daily_goals"] = {"calories": 2506, "source": "biometrics_recalculated"}
    user["stats"] = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0,
                     "last_updated": datetime.now(timezone.utc).strftime("%Y-%m-%d")}

    with patch("backend.main.users_collection") as users_mock:
        users_mock.find_one = AsyncMock(return_value=user)
        response = client.get("/api/user/stats", headers={"Authorization": "Bearer fake"})

    assert response.status_code == 200
    assert response.json()["daily_goals"]["calories"] == 2506
