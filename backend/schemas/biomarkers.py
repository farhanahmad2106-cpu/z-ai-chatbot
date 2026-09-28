from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional
from datetime import date
import re

class BiometricSyncPayload(BaseModel):
    source: Literal["apple_healthkit", "google_health_connect", "manual"] = Field(
        ..., description="The source of the biometric data."
    )
    recorded_date: str = Field(
        ..., description="The user-local calendar date in YYYY-MM-DD format."
    )
    step_count: int = Field(
        ..., ge=0, le=100000, description="Daily step count."
    )
    active_energy_burned_kcal: int = Field(
        ..., ge=0, le=10000, description="Active energy burned in kcal."
    )
    resting_heart_rate_bpm: int = Field(
        ..., ge=30, le=220, description="Resting heart rate in BPM."
    )

    @field_validator("recorded_date")
    def validate_date_format(cls, v):
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("recorded_date must be in YYYY-MM-DD format.")
        try:
            # Enforce valid calendar date
            parsed_date = date.fromisoformat(v)
            # Future dates beyond a reasonable tolerance (e.g. 1 day, for timezone diffs) are rejected
            # We will handle future date more strictly in the route/service if needed, but basic calendar valid is here.
        except ValueError:
            raise ValueError("recorded_date must be a valid calendar date.")
        return v
