"""
FSSAI Additive Registry Schemas — Pydantic v2

NOTE: These schemas define Z-SeHealth's *application-level* risk model.
- `regulatory_status` reflects the additive's standing under FSSAI regulations.
- `application_risk_tier` is Z-SeHealth's heuristic classification, NOT an official FSSAI score.
- `requires_review` indicates the system could not conclusively resolve the additive.
- Unknown ≠ Hazardous. Unresolved additives are "unclassified", not "hazardous".
"""
from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any


RegulatoryStatus = Literal[
    "permitted",
    "restricted",
    "prohibited",
    "unverified",
    "requires_review",
    "unknown",
]

ApplicationRiskTier = Literal[
    "safe",
    "moderate",
    "high",
    "restricted",
    "hazardous",
    "unclassified",
]


class FSSAIAdditive(BaseModel):
    """Authoritative registry record. Loaded from fssai_master_additives.json."""
    ins_code: str
    canonical_name: str
    aliases: List[str] = Field(default_factory=list)
    functional_classes: List[str] = Field(default_factory=list)

    regulatory_status: RegulatoryStatus

    application_risk_tier: ApplicationRiskTier

    risk_description: str

    adi_mg_per_kg_bw: Optional[float] = None
    adi_unit: Optional[str] = "mg/kg bw/day"

    mandatory_warning: Optional[str] = None

    food_category_restrictions: List[str] = Field(default_factory=list)
    prohibited_food_categories: List[str] = Field(default_factory=list)

    banned_in_infant_foods: bool = False

    schedule_reference: Optional[str] = None

    # Provenance
    source_authority: str
    source_document: str
    source_version_or_date: Optional[str] = None
    source_url: Optional[str] = None

    verification_status: Literal[
        "verified",
        "partially_verified",
        "requires_review",
        "unverified",
    ]

    last_verified_at: Optional[str] = None


class ResolvedAdditive(BaseModel):
    """
    Result of resolving a raw additive input against the FSSAI registry.

    This is what the API returns. The `application_risk_tier` is a Z-SeHealth
    heuristic tier, NOT an official FSSAI safety score.
    """
    input_code: Optional[str] = None
    input_name: Optional[str] = None

    normalized_ins_code: Optional[str] = None
    canonical_name: Optional[str] = None

    matched: bool
    match_method: Literal[
        "ins_code",
        "alias",
        "canonical_name",
        "unmatched",
    ]

    regulatory_status: RegulatoryStatus
    application_risk_tier: ApplicationRiskTier

    functional_classes: List[str] = Field(default_factory=list)

    adi_mg_per_kg_bw: Optional[float] = None
    mandatory_warning: Optional[str] = None

    warnings: List[str] = Field(default_factory=list)

    requires_review: bool = False

    provenance: Dict[str, Any] = Field(default_factory=dict)
