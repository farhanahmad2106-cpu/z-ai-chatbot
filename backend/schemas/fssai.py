"""
FSSAI Additive Regulatory Schemas — Pydantic v2

CRITICAL ARCHITECTURAL DISTINCTION
====================================
FSSAI REGULATORY STATUS ≠ Z-SEHEALTH RISK TIER

- `regulatory_status` / `fssai_regulatory_status` reflects the standing of the
  additive under the Food Safety and Standards (Food Products Standards and Food
  Additives) Regulations, 2011 and applicable FSSAI amendments.

- `zsehealth_risk_tier` is Z-SeHealth's own application-level heuristic
  classification. It is NOT an official FSSAI statutory risk score.

- `penalty_points` are Z-SeHealth deterministic scoring rules.
  They are NOT FSSAI statutory penalties.

- Unknown additives are "unclassified" (penalty_points = -2).
  Unknown does NOT mean safe. Unknown does NOT mean hazardous.

- The engine must never claim that FSSAI officially classifies additives as
  "safe", "moderate", "high", "restricted", or "hazardous". Those terms belong
  to Z-SeHealth's scoring vocabulary, not FSSAI's statutory vocabulary.

PROVENANCE REQUIREMENT
=========================
Every record must trace to:
  - source_document (FSSAI regulation, amendment, schedule)
  - source_authority = "FSSAI"
  - verified = True only when authoritative evidence exists

RESOLUTION MODEL (3 layers)
==============================
  REGULATORY LAYER:   What does the applicable FSSAI rule say?
  APPLICATION LAYER:  How does Z-SeHealth score this additive?
  CLINICAL LAYER:     Does this conflict with the user's health profile?
"""

from pydantic import BaseModel, Field
from typing import Dict, Any, List, Literal, Optional


# ---------------------------------------------------------------------------
# FSSAI Regulatory Status Vocabulary
# ---------------------------------------------------------------------------
# These are the permissible regulatory determinations the engine can make.
# They deliberately do NOT use "safe" / "unsafe" because those are not
# FSSAI statutory terms.

FSSAIRegulatoryStatus = Literal[
    "verified_permitted",      # Authoritative evidence: additive is permitted (may be conditional)
    "verified_restricted",     # Authoritative evidence: use is restricted to specific categories/levels
    "verified_prohibited",     # Authoritative evidence: additive is prohibited in applicable context
    "context_dependent",       # Regulatory status varies by food category, use level, or population
    "not_verified",            # Dataset record exists but provenance is not fully confirmed
    "unknown",                 # Additive could not be resolved in local registry at all
]

# ---------------------------------------------------------------------------
# Z-SeHealth Application Risk Tier
# ---------------------------------------------------------------------------
# These are Z-SeHealth's internal scoring categories.
# They must NEVER be presented as FSSAI statutory risk classifications.

ZSeHealthRiskTier = Literal[
    "safe",          # Z-SeHealth: minimal concern at typical exposure levels
    "moderate",      # Z-SeHealth: moderate concern, worth noting
    "high",          # Z-SeHealth: elevated concern, flag clearly
    "restricted",    # Z-SeHealth: use is limited/restricted by regulation or concern
    "hazardous",     # Z-SeHealth: strong concern, explicitly flagged
    "unclassified",  # Z-SeHealth: additive not in registry — cannot be scored
]

# Legacy alias — used in some existing code paths; maps directly to ZSeHealthRiskTier
ApplicationRiskTier = ZSeHealthRiskTier


# ---------------------------------------------------------------------------
# Master Registry Record (loaded from fssai_master_additives.json)
# ---------------------------------------------------------------------------

class FSSAIAdditive(BaseModel):
    """
    Authoritative registry record for a single food additive.

    Field naming:
      - regulatory_status uses the new FSSAIRegulatoryStatus vocabulary.
      - zsehealth_risk_tier is Z-SeHealth's application-level classification.
      - application_risk_tier is an alias for backward compatibility inside the
        service layer only; it maps to zsehealth_risk_tier.
      - "verified" / verification_status indicates data provenance confidence.

    IMPORTANT: The presence of an INS code does NOT by itself prove that the
    additive is FSSAI-approved in all contexts. is_context_dependent must be
    consulted before claiming universal approval.
    """
    ins_code: str
    canonical_name: str
    aliases: List[str] = Field(default_factory=list)
    functional_classes: List[str] = Field(default_factory=list)

    # Primary regulatory determination (FSSAI vocabulary)
    regulatory_status: FSSAIRegulatoryStatus

    # Z-SeHealth application-level classification (NOT FSSAI statutory)
    zsehealth_risk_tier: ZSeHealthRiskTier

    # Legacy field alias — populated from zsehealth_risk_tier during load
    # for backward compatibility with existing service code
    application_risk_tier: ZSeHealthRiskTier = "unclassified"

    # Human-readable description of the risk rationale
    risk_description: str = ""

    # ADI (mg/kg body weight/day). None if not established or not sourced from FSSAI.
    # IMPORTANT: Only FSSAI/JECFA-sourced values should be populated. Do NOT infer.
    adi_mg_per_kg_bw: Optional[float] = None

    # Mandatory regulatory warning text (verbatim from regulation where applicable)
    mandatory_warning: Optional[str] = None

    # Regulatory conditions under which use is permitted or restricted
    regulatory_conditions: List[str] = Field(default_factory=list)

    # Food categories where use is PROHIBITED — evidence-backed only
    prohibited_food_categories: List[str] = Field(default_factory=list)

    # Food categories where use is PERMITTED (may be conditional)
    permitted_food_categories: List[str] = Field(default_factory=list)

    # FSSAI schedule/regulation reference string
    fssai_schedule_reference: Optional[str] = None

    # Provenance
    source_authority: str = "FSSAI"
    source_document: str
    source_amendment: Optional[str] = None
    source_version_or_date: Optional[str] = None
    effective_from: Optional[str] = None

    # Verification confidence:
    #   "verified"           — sourced and confirmed from FSSAI regulation
    #   "partially_verified" — INS code confirmed, some details not fully sourced
    #   "requires_review"    — needs regulatory review
    #   "unverified"         — not sourced from authoritative document
    verification_status: Literal[
        "verified",
        "partially_verified",
        "requires_review",
        "unverified",
    ] = "unverified"

    last_verified_at: Optional[str] = None

    def model_post_init(self, __context: Any) -> None:
        """Synchronize application_risk_tier from zsehealth_risk_tier for backward compat."""
        if self.application_risk_tier == "unclassified" and self.zsehealth_risk_tier != "unclassified":
            object.__setattr__(self, "application_risk_tier", self.zsehealth_risk_tier)

    model_config = {"frozen": False}


# ---------------------------------------------------------------------------
# Resolved Additive (API Response Object)
# ---------------------------------------------------------------------------

class ResolvedAdditive(BaseModel):
    """
    Result of resolving a raw additive input against the local FSSAI registry.

    IMPORTANT CONTRACT:
      - `fssai_regulatory_status` reflects what the regulation says.
      - `zsehealth_risk_tier` reflects Z-SeHealth's application scoring.
      - `is_fssai_approved` is False for context_dependent, not_verified, and unknown.
        It is True only for verified_permitted (with caveats documented in regulatory_conditions).
      - `penalty_points` is Z-SeHealth's deterministic scoring contribution.
      - `risk` is a backward-compat alias for `zsehealth_risk_tier` (for frontend consumers).
    """
    # Raw and normalized input
    input_code: Optional[str] = None
    input_name: Optional[str] = None
    normalized_ins_code: Optional[str] = None
    canonical_name: Optional[str] = None

    # Resolution outcome
    matched: bool
    match_method: Literal[
        "ins_code",
        "canonical_name",
        "alias",
        "unmatched",
    ]

    # FSSAI regulatory determination (vocabulary: FSSAIRegulatoryStatus)
    fssai_regulatory_status: FSSAIRegulatoryStatus

    # Legacy field for backward compatibility — same semantics as fssai_regulatory_status
    # The new field name is clearer; this alias is kept so existing code doesn't break.
    regulatory_status: FSSAIRegulatoryStatus

    # Z-SeHealth application risk tier (NOT FSSAI statutory classification)
    zsehealth_risk_tier: ZSeHealthRiskTier

    # Legacy alias — matches zsehealth_risk_tier
    # Kept for backward compatibility with existing scan.py / frontend consumers
    application_risk_tier: ZSeHealthRiskTier

    # Whether Z-SeHealth considers this FSSAI-approved for general use.
    # True ONLY for verified_permitted. Context_dependent and not_verified → False.
    is_fssai_approved: bool

    # Z-SeHealth deterministic penalty contribution (NOT FSSAI statutory penalty)
    penalty_points: int

    # Rich regulatory metadata
    functional_classes: List[str] = Field(default_factory=list)
    adi_mg_per_kg_bw: Optional[float] = None
    mandatory_warning: Optional[str] = None
    regulatory_conditions: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)

    # Whether human regulatory review is recommended
    requires_review: bool = False

    # Provenance chain
    provenance: Dict[str, Any] = Field(default_factory=dict)

    @property
    def risk(self) -> str:
        """
        Backward-compat property for frontend consumers that read `.risk`.
        Returns the Z-SeHealth risk tier string.
        This is a Z-SeHealth application classification, NOT an FSSAI statutory value.
        """
        return self.zsehealth_risk_tier


# ---------------------------------------------------------------------------
# FSSAI Resolution Result (aggregated scan result)
# ---------------------------------------------------------------------------

class FSSAIResolutionResult(BaseModel):
    """
    Aggregated result of resolving all additives in a single scan.

    IMPORTANT: `additive_penalty` and `mandatory_warnings` are Z-SeHealth's
    application-level determinations, not FSSAI statutory findings.
    """
    resolved_additives: List[ResolvedAdditive] = Field(default_factory=list)
    additive_penalty: int = 0
    mandatory_warnings: List[str] = Field(default_factory=list)
    unresolved_additives: List[str] = Field(default_factory=list)
    regulatory_review_required: bool = False
    dataset_version: Optional[str] = None
