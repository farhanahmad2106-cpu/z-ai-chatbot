from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Dict, Any

class FSSAIAdditive(BaseModel):
    ins_code: str
    canonical_name: str
    aliases: List[str] = Field(default_factory=list)
    functional_classes: List[str] = Field(default_factory=list)

    regulatory_status: Literal[
        "permitted",
        "restricted",
        "prohibited",
        "unverified",
        "requires_review"
    ]

    application_risk_tier: Literal[
        "safe",
        "moderate",
        "high",
        "restricted",
        "hazardous",
        "unclassified"
    ]

    risk_description: str

    adi_mg_per_kg_bw: Optional[float] = None
    adi_unit: Optional[str] = "mg/kg bw/day"

    mandatory_warning: Optional[str] = None

    food_category_restrictions: List[str] = Field(default_factory=list)
    prohibited_food_categories: List[str] = Field(default_factory=list)

    banned_in_infant_foods: bool = False

    schedule_reference: Optional[str] = None

    source_authority: str
    source_document: str
    source_version_or_date: Optional[str] = None
    source_url: Optional[str] = None

    verification_status: Literal[
        "verified",
        "partially_verified",
        "requires_review",
        "unverified"
    ]

    last_verified_at: Optional[str] = None

class ResolvedAdditive(BaseModel):
    input_code: Optional[str] = None
    input_name: Optional[str] = None

    normalized_ins_code: Optional[str] = None
    canonical_name: Optional[str] = None

    matched: bool
    match_method: Literal[
        "ins_code",
        "alias",
        "canonical_name",
        "unmatched"
    ]

    regulatory_status: str
    application_risk_tier: str

    functional_classes: List[str] = Field(default_factory=list)

    adi_mg_per_kg_bw: Optional[float] = None
    mandatory_warning: Optional[str] = None

    warnings: List[str] = Field(default_factory=list)

    requires_review: bool = False

    provenance: Dict[str, Any] = Field(default_factory=dict)
