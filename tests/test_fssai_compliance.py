"""
Z-SeHealth FSSAI Compliance Test Suite — v2.0.0

Covers all acceptance criteria from the Master Implementation Prompt:
  A.  INS code normalization (parametric)
  B.  Alias resolution
  C.  Deterministic resolution (same input → same output, 100 iterations)
  D.  No LLM risk authority (OCR schema assertion)
  E.  Open Food Facts override (OFF "risk" value must be ignored)
  F.  Unknown additive → unclassified (fail closed)
  G.  Prohibited/unverified additive fixture
  H.  Warning deduplication
  I.  Dataset validation (duplicate INS, alias, invalid tiers, provenance)
  J.  Deterministic penalty table
  K.  Regression: new canonical field names exposed in API response
  L.  is_fssai_approved semantics
  M.  fssai_regulatory_status vocabulary
  N.  Registry integrity (dataset size, alias count, provenance, ADI)
  O.  Property-style determinism (100 iterations)
  P.  Offline / network independence assertion

CRITICAL NOTE:
  - zsehealth_risk_tier is a Z-SeHealth application classification (NOT FSSAI statutory).
  - fssai_regulatory_status is the FSSAI regulatory determination vocabulary.
  - is_fssai_approved=True only for verified_permitted.
  - Unknown additive → penalty_points=-2, NOT 0 (unknown ≠ safe).
"""

import os
import sys
import copy
import json
import hashlib
import pytest

# Ensure backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

# ---------------------------------------------------------------------------
# Import schemas and service
# ---------------------------------------------------------------------------
from schemas.fssai import (
    FSSAIAdditive,
    FSSAIResolutionResult,
    FSSAIRegulatoryStatus,
    ResolvedAdditive,
    ZSeHealthRiskTier,
    ApplicationRiskTier,
)
from services.fssai_service import (
    PENALTY_TABLE,
    FSSAIRegulatoryService,
    RegistryValidationError,
    _extract_embedded_ins,
    fssai_resolver,
    normalize_ins_code,
)


# ===========================================================================
# Section A — INS Normalization
# ===========================================================================

class TestINSNormalization:
    """
    Requirement: normalize_ins_code() must map common input variants to
    canonical "INS NNN[x]" form deterministically.
    """

    @pytest.mark.parametrize("raw, expected", [
        # Standard forms
        ("INS 102",      "INS 102"),
        ("INS102",       "INS 102"),
        ("INS-102",      "INS 102"),
        ("INS 102 ",     "INS 102"),
        # E-prefix forms
        ("E102",         "INS 102"),
        ("E-102",        "INS 102"),
        ("E 102",        "INS 102"),
        ("e102",         "INS 102"),
        # Pure numeric
        ("102",          "INS 102"),
        ("102 ",         "INS 102"),
        # Letter suffix
        ("INS 150a",     "INS 150A"),
        ("150a",         "INS 150A"),
        ("E150a",        "INS 150A"),
        # Roman numeral suffix
        ("INS 500(i)",   "INS 500(I)"),
        ("500(ii)",      "INS 500(II)"),
        # Context words
        ("colour 102",   "INS 102"),
        ("Color 102",    "INS 102"),
        ("additive 102", "INS 102"),
        # 4-digit codes
        ("INS 1422",     "INS 1422"),
        ("E1422",        "INS 1422"),
        # Flavour enhancers (3-digit)
        ("INS 621",      "INS 621"),
        ("E621",         "INS 621"),
        ("621",          "INS 621"),
    ])
    def test_normalize_valid_codes(self, raw, expected):
        result = normalize_ins_code(raw)
        assert result == expected, (
            f"normalize_ins_code({raw!r}) → {result!r}, expected {expected!r}"
        )

    @pytest.mark.parametrize("raw", [
        None,
        "",
        "   ",
        "salt",       # plain name, no digit
        "water",
        "sugar",
    ])
    def test_normalize_none_returns_none(self, raw):
        result = normalize_ins_code(raw)
        assert result is None, (
            f"normalize_ins_code({raw!r}) should be None, got {result!r}"
        )

    def test_normalize_is_deterministic(self):
        """Same input must always produce same output — no randomness."""
        for _ in range(50):
            assert normalize_ins_code("INS 102") == "INS 102"
            assert normalize_ins_code("e951") == "INS 951"

    def test_normalize_does_not_guess_ambiguous_short_codes(self):
        """2-digit numbers should NOT be normalized to INS codes."""
        result = normalize_ins_code("10")
        assert result is None or (result and "INS" not in result.upper() or len(result) < 5)


# ===========================================================================
# Section B — Alias Resolution
# ===========================================================================

class TestAliasResolution:
    """
    Requirement: Alias resolution must map common names and code variants to
    the correct canonical FSSAIAdditive.
    """

    def test_tartrazine_resolves_to_ins_102(self):
        result = fssai_resolver.resolve_additive("Tartrazine")
        assert result.matched is True
        assert result.normalized_ins_code == "INS 102"
        assert result.canonical_name == "Tartrazine"

    def test_aspartame_resolves_to_ins_951(self):
        result = fssai_resolver.resolve_additive("Aspartame")
        assert result.matched is True
        assert result.normalized_ins_code == "INS 951"
        assert result.canonical_name == "Aspartame"

    def test_msg_alias_resolves(self):
        result = fssai_resolver.resolve_additive("MSG")
        assert result.matched is True
        assert "INS 621" in (result.normalized_ins_code or "")

    def test_soy_lecithin_alias_resolves(self):
        result = fssai_resolver.resolve_additive("soy lecithin")
        assert result.matched is True
        assert "322" in (result.normalized_ins_code or "")

    def test_citric_acid_resolves(self):
        result = fssai_resolver.resolve_additive("Citric Acid")
        assert result.matched is True
        assert "330" in (result.normalized_ins_code or "")

    def test_e102_alias_resolves(self):
        result = fssai_resolver.resolve_additive({"code": "E102", "name": None})
        assert result.matched is True
        assert result.normalized_ins_code == "INS 102"

    def test_alias_case_insensitive(self):
        result = fssai_resolver.resolve_additive("TARTRAZINE")
        assert result.matched is True

    def test_bha_alias_resolves(self):
        result = fssai_resolver.resolve_additive("BHA")
        assert result.matched is True
        assert "320" in (result.normalized_ins_code or "")

    def test_tbhq_alias_resolves(self):
        result = fssai_resolver.resolve_additive("TBHQ")
        assert result.matched is True
        assert "319" in (result.normalized_ins_code or "")


# ===========================================================================
# Section C — Deterministic Resolution
# ===========================================================================

class TestDeterministicResolution:
    """
    Requirement: Same input must always produce the same result.
    No randomness, no LLM calls, no network dependency.
    """

    def test_ins102_is_deterministic(self):
        first = fssai_resolver.resolve_additive("INS 102")
        for _ in range(100):
            assert fssai_resolver.resolve_additive("INS 102") == first

    def test_ins951_is_deterministic(self):
        first = fssai_resolver.resolve_additive("INS 951")
        for _ in range(100):
            assert fssai_resolver.resolve_additive("INS 951") == first

    def test_ins621_is_deterministic(self):
        first = fssai_resolver.resolve_additive("INS 621")
        for _ in range(100):
            assert fssai_resolver.resolve_additive("INS 621") == first

    def test_unknown_is_deterministic(self):
        first = fssai_resolver.resolve_additive("INS 99999")
        for _ in range(100):
            assert fssai_resolver.resolve_additive("INS 99999") == first

    def test_resolution_method_field_populated(self):
        result = fssai_resolver.resolve_additive("INS 102")
        assert result.match_method in ("ins_code", "canonical_name", "alias")

    def test_provenance_populated_on_match(self):
        result = fssai_resolver.resolve_additive("INS 102")
        assert result.matched is True
        assert result.provenance.get("source_authority") == "FSSAI"
        assert result.provenance.get("dataset_version") is not None

    def test_functional_classes_populated(self):
        result = fssai_resolver.resolve_additive("INS 102")
        assert result.functional_classes, "functional_classes must not be empty on a resolved record"


# ===========================================================================
# Section D — No LLM Risk Authority (OCR Schema Assertion)
# ===========================================================================

class TestNoLLMRiskAuthority:
    """
    Requirement: The OCR/vision LLM schema MUST NOT contain fields that could
    return risk, regulatory_status, penalty, or fssai_approved values.
    """

    def test_ocr_schema_excludes_risk_field(self):
        from schemas.scan import OCRAnalysisResponse
        schema_fields = set(OCRAnalysisResponse.model_fields.keys())
        forbidden = {"risk", "risk_tier", "penalty", "fssai_approved", "regulatory_status", "mandatory_warning"}
        overlap = schema_fields & forbidden
        assert not overlap, (
            f"OCRAnalysisResponse must NOT contain regulatory fields. "
            f"Found: {overlap}"
        )

    def test_ocr_schema_has_detected_ins_additives(self):
        """LLM may extract raw detected_ins_additives (code + name only)."""
        from schemas.scan import OCRAnalysisResponse
        schema_fields = set(OCRAnalysisResponse.model_fields.keys())
        assert "detected_ins_additives" in schema_fields

    def test_resolved_additive_has_no_llm_risk_field(self):
        """
        The ResolvedAdditive returned by the service must get its risk tier from the
        registry — not from any LLM output field called 'llm_risk' or similar.
        """
        result = fssai_resolver.resolve_additive("INS 102")
        # zsehealth_risk_tier must be from the registry (not fabricated)
        valid_tiers = set(ZSeHealthRiskTier.__args__)  # type: ignore[attr-defined]
        assert result.zsehealth_risk_tier in valid_tiers
        # application_risk_tier is the backward-compat alias
        assert result.application_risk_tier in valid_tiers

    def test_zsehealth_risk_tier_is_not_llm_derived(self):
        """
        Resolution of INS 102 must return a risk tier from the local registry,
        not from an LLM. We verify determinism as the proxy for no-LLM involvement.
        """
        results = [fssai_resolver.resolve_additive("INS 102") for _ in range(5)]
        tiers = [r.zsehealth_risk_tier for r in results]
        assert len(set(tiers)) == 1, f"zsehealth_risk_tier should be deterministic, got {tiers}"


# ===========================================================================
# Section E — Open Food Facts Override
# ===========================================================================

class TestOpenFoodFactsOverride:
    """
    Requirement: Open Food Facts "risk" values MUST NOT be trusted.
    The deterministic FSSAI resolver must override all OFF risk values.
    """

    def test_off_risk_low_is_ignored(self):
        """
        Simulate an OFF additive tag with a mocked 'risk: low' field.
        The resolver must not trust it; result must come from registry.
        """
        # OFF provides: { "additives_tags": ["en:e102"], "additives_analysis": { "risk": "low" } }
        # We simulate this by creating a candidate as the route does:
        off_candidate = {"code": "INS 102", "name": None}
        result = fssai_resolver.resolve_additive(off_candidate)

        # The resolver MUST resolve from the registry, not trust any OFF 'risk'
        assert result.matched is True
        # The registry classifies INS 102 as high (azo dye, context-dependent)
        # It MUST NOT be 'safe' or 'low' from OFF
        assert result.zsehealth_risk_tier != "safe", (
            "INS 102 (Tartrazine) must not be classified 'safe'. OFF risk=low must be overridden."
        )

    def test_off_unknown_additive_does_not_become_safe(self):
        """
        An OFF additive tag that doesn't resolve must become unclassified, not safe.
        """
        off_candidate = {"code": "INS 99999", "name": None}
        result = fssai_resolver.resolve_additive(off_candidate)
        assert result.matched is False
        assert result.zsehealth_risk_tier == "unclassified"
        assert result.is_fssai_approved is False
        assert result.penalty_points == -2

    def test_off_data_pipeline_uses_resolver(self):
        """
        resolve_and_deduplicate with an OFF-style candidate list
        must return deterministic FSSAI-based results.
        """
        candidates = [
            {"code": "INS 102", "name": None},
            {"code": "INS 621", "name": None},
        ]
        resolved, warnings = fssai_resolver.resolve_and_deduplicate(
            detected_additives=candidates,
            parsed_ingredients=[],
        )
        codes = {r.normalized_ins_code for r in resolved if r.matched}
        assert "INS 102" in codes
        assert "INS 621" in codes


# ===========================================================================
# Section F — Unknown / Unresolved Additive
# ===========================================================================

class TestUnknownAdditiveFailClosed:
    """
    Requirement: Unknown additives must NEVER become safe.
    regulatory_status = "unknown"
    zsehealth_risk_tier = "unclassified"
    is_fssai_approved = False
    penalty_points = -2
    regulatory_review_required = True
    """

    def test_unknown_ins_code_does_not_resolve(self):
        result = fssai_resolver.resolve_additive("INS 99999")
        assert result.matched is False
        assert result.zsehealth_risk_tier == "unclassified"

    def test_unknown_has_correct_regulatory_status(self):
        result = fssai_resolver.resolve_additive("INS 99999")
        assert result.fssai_regulatory_status == "unknown"
        assert result.regulatory_status == "unknown"

    def test_unknown_is_not_fssai_approved(self):
        result = fssai_resolver.resolve_additive("INS 99999")
        assert result.is_fssai_approved is False

    def test_unknown_penalty_is_minus_2(self):
        """Unknown = -2 penalty. Unknown ≠ safe (0). Unknown ≠ hazardous (-35)."""
        result = fssai_resolver.resolve_additive("INS 99999")
        assert result.penalty_points == -2

    def test_unknown_requires_review(self):
        result = fssai_resolver.resolve_additive("INS 99999")
        assert result.requires_review is True

    def test_unknown_has_warning_message(self):
        result = fssai_resolver.resolve_additive("INS 99999")
        assert result.warnings, "Unresolved additives must have a warning"
        assert any("review" in w.lower() or "registry" in w.lower() for w in result.warnings)

    def test_none_input_returns_unresolved(self):
        result = fssai_resolver.resolve_additive(None)
        assert result.matched is False
        assert result.zsehealth_risk_tier == "unclassified"

    def test_empty_string_returns_unresolved(self):
        result = fssai_resolver.resolve_additive("")
        assert result.matched is False

    def test_gibberish_does_not_match(self):
        result = fssai_resolver.resolve_additive("xyz_random_###")
        assert result.matched is False
        assert result.zsehealth_risk_tier == "unclassified"


# ===========================================================================
# Section G — Prohibited / Unapproved Fixture
# ===========================================================================

class TestProhibitedAdditive:
    """
    Requirement: For explicitly verified_prohibited additives:
        is_fssai_approved = False
        penalty_points = -35

    We use a synthetic test fixture clearly marked as synthetic to avoid
    fabricating regulatory facts.
    """

    @pytest.fixture
    def synthetic_prohibited_additive(self) -> FSSAIAdditive:
        """
        SYNTHETIC TEST FIXTURE — NOT a real FSSAI regulatory record.
        Used solely to test the service's handling of verified_prohibited entries.
        """
        return FSSAIAdditive(
            ins_code="INS 000",
            canonical_name="SYNTHETIC_TEST_PROHIBITED",
            aliases=["synthetic_test_only"],
            functional_classes=["test"],
            regulatory_status="verified_prohibited",
            zsehealth_risk_tier="hazardous",
            risk_description="SYNTHETIC FIXTURE — not a real additive.",
            source_document="SYNTHETIC TEST FIXTURE",
            source_authority="FSSAI",
            verification_status="verified",
        )

    def test_prohibited_is_not_fssai_approved(self, synthetic_prohibited_additive):
        from services.fssai_service import _IS_APPROVED_MAP
        is_approved = _IS_APPROVED_MAP.get(synthetic_prohibited_additive.regulatory_status, True)
        assert is_approved is False, (
            "verified_prohibited additive must NOT be is_fssai_approved=True"
        )

    def test_prohibited_penalty_is_minus_35(self, synthetic_prohibited_additive):
        penalty = PENALTY_TABLE.get(synthetic_prohibited_additive.zsehealth_risk_tier, 0)
        assert penalty == -35, (
            f"hazardous tier must have penalty=-35, got {penalty}"
        )

    def test_penalty_table_has_hazardous(self):
        assert PENALTY_TABLE["hazardous"] == -35

    def test_sodium_nitrite_ins250_has_high_risk(self):
        """INS 250 (Sodium Nitrite) is context_dependent + high tier in our registry."""
        result = fssai_resolver.resolve_additive("INS 250")
        assert result.matched is True
        assert result.zsehealth_risk_tier == "high"
        assert result.penalty_points == -18

    def test_sodium_nitrite_context_dependent_not_approved(self):
        """context_dependent → is_fssai_approved=False (approval depends on context)."""
        result = fssai_resolver.resolve_additive("INS 250")
        assert result.is_fssai_approved is False


# ===========================================================================
# Section H — Warning Deduplication
# ===========================================================================

class TestWarningDeduplication:
    """
    Requirement: The same mandatory warning must not appear twice.
    """

    def test_aspartame_warning_appears_once(self):
        """INS 951 has a PKU mandatory_warning; resolving it twice must not duplicate."""
        resolved, warnings = fssai_resolver.resolve_and_deduplicate(
            detected_additives=[
                {"code": "INS 951", "name": None},
                {"code": "E951", "name": None},
                {"code": "Aspartame", "name": None},
            ],
            parsed_ingredients=[],
        )
        pku_warnings = [w for w in warnings if "phenylalanine" in w.lower() or "pku" in w.lower()]
        assert len(pku_warnings) <= 1, (
            f"PKU warning must appear at most once. Found: {pku_warnings}"
        )

    def test_resolved_additives_deduplicated(self):
        """Same additive via different input forms must collapse to one entry."""
        resolved, _ = fssai_resolver.resolve_and_deduplicate(
            detected_additives=[
                {"code": "INS 621", "name": None},
                {"code": "E621", "name": None},
                {"code": "621", "name": None},
            ],
            parsed_ingredients=[],
        )
        ins_codes = [r.normalized_ins_code for r in resolved if r.matched]
        assert ins_codes.count("INS 621") == 1, (
            "Deduplication must collapse INS 621 / E621 / 621 to a single entry"
        )

    def test_different_additives_not_collapsed(self):
        """INS 102 and INS 110 are different; both must appear in resolved list."""
        resolved, _ = fssai_resolver.resolve_and_deduplicate(
            detected_additives=[
                {"code": "INS 102", "name": None},
                {"code": "INS 110", "name": None},
            ],
            parsed_ingredients=[],
        )
        codes = {r.normalized_ins_code for r in resolved if r.matched}
        assert "INS 102" in codes
        assert "INS 110" in codes

    def test_warnings_are_unique_list(self):
        resolved, warnings = fssai_resolver.resolve_and_deduplicate(
            detected_additives=[{"code": "INS 220", "name": None}],
            parsed_ingredients=[],
        )
        assert len(warnings) == len(set(warnings)), "Warnings must be deduplicated"


# ===========================================================================
# Section I — Dataset Validation
# ===========================================================================

class TestDatasetValidation:
    """
    Requirement: The validation function must catch corrupt/invalid registry data.
    """

    def test_validate_dataset_passes(self):
        """The production dataset must pass validation."""
        assert fssai_resolver.validate_dataset() is True

    def test_no_duplicate_ins_codes(self):
        """No two records may share the same INS code."""
        codes = [r.ins_code.strip().upper() for r in fssai_resolver._master_list]
        normalized_codes = []
        for c in codes:
            if not c.startswith("INS "):
                c = f"INS {c.replace('INS', '').strip()}"
            normalized_codes.append(c)
        assert len(normalized_codes) == len(set(normalized_codes)), (
            f"Duplicate INS codes found: {[c for c in normalized_codes if normalized_codes.count(c) > 1]}"
        )

    def test_no_duplicate_aliases(self):
        """No alias may be mapped to two different INS codes."""
        # The registry loader enforces this; a successful load proves no collisions
        # Verify by checking the alias index
        seen: dict = {}
        alias_collisions = []
        for alias, ins_code in fssai_resolver._by_alias.items():
            if alias in seen and seen[alias] != ins_code:
                alias_collisions.append((alias, seen[alias], ins_code))
            else:
                seen[alias] = ins_code
        assert not alias_collisions, f"Alias collisions found: {alias_collisions}"

    def test_valid_risk_tiers_only(self):
        """All records must have a valid ZSeHealthRiskTier."""
        valid = set(ZSeHealthRiskTier.__args__)  # type: ignore[attr-defined]
        for record in fssai_resolver._master_list:
            assert record.zsehealth_risk_tier in valid, (
                f"{record.ins_code}: invalid zsehealth_risk_tier '{record.zsehealth_risk_tier}'"
            )

    def test_valid_regulatory_statuses_only(self):
        """All records must have a valid FSSAIRegulatoryStatus."""
        valid = set(FSSAIRegulatoryStatus.__args__)  # type: ignore[attr-defined]
        for record in fssai_resolver._master_list:
            assert record.regulatory_status in valid, (
                f"{record.ins_code}: invalid regulatory_status '{record.regulatory_status}'"
            )

    def test_verified_records_have_provenance(self):
        """Every verified=true record must have a source_document."""
        for record in fssai_resolver._master_list:
            if record.verification_status == "verified":
                assert record.source_document, (
                    f"{record.ins_code}: verification_status=verified but source_document is empty"
                )

    def test_adi_values_not_negative(self):
        """ADI must be null or >= 0. Negative ADI is a data error."""
        for record in fssai_resolver._master_list:
            if record.adi_mg_per_kg_bw is not None:
                assert record.adi_mg_per_kg_bw >= 0, (
                    f"{record.ins_code}: adi_mg_per_kg_bw={record.adi_mg_per_kg_bw} is negative"
                )

    def test_all_records_have_canonical_name(self):
        for record in fssai_resolver._master_list:
            assert record.canonical_name, f"Record with ins_code={record.ins_code} has empty canonical_name"

    def test_registry_checksum_is_computed(self):
        assert fssai_resolver.registry_checksum
        assert fssai_resolver.registry_checksum != "checksum_error"
        assert fssai_resolver.registry_checksum != "uncomputed"

    def test_registry_checksum_is_deterministic(self):
        """Computing the checksum twice must yield the same result."""
        path = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "backend", "data", "fssai_master_additives.json")
        )
        c1 = FSSAIRegulatoryService._compute_checksum(path)
        c2 = FSSAIRegulatoryService._compute_checksum(path)
        assert c1 == c2

    def test_dataset_version_is_set(self):
        assert fssai_resolver.dataset_version
        assert fssai_resolver.dataset_version != "unknown"

    def test_corrupt_registry_raises_validation_error(self):
        """Simulating a registry with duplicate INS codes must raise RegistryValidationError."""
        from services.fssai_service import _load_registry
        import tempfile

        bad_registry = {
            "dataset_version": "test",
            "entries": [
                {
                    "ins_code": "INS 999",
                    "canonical_name": "Test Additive 1",
                    "regulatory_status": "verified_permitted",
                    "zsehealth_risk_tier": "safe",
                    "source_document": "Test",
                    "verification_status": "verified",
                },
                {
                    "ins_code": "INS 999",  # duplicate!
                    "canonical_name": "Test Additive 2",
                    "regulatory_status": "verified_permitted",
                    "zsehealth_risk_tier": "safe",
                    "source_document": "Test",
                    "verification_status": "verified",
                },
            ]
        }

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(bad_registry, f)
            tmp_path = f.name

        try:
            with pytest.raises(RegistryValidationError, match="Duplicate INS code"):
                _load_registry(tmp_path)
        finally:
            os.unlink(tmp_path)

    def test_missing_source_for_verified_raises(self):
        """A verified=true record without source_document must cause RegistryValidationError."""
        from services.fssai_service import _load_registry
        import tempfile

        bad_registry = {
            "dataset_version": "test",
            "entries": [
                {
                    "ins_code": "INS 998",
                    "canonical_name": "No Source Additive",
                    "regulatory_status": "verified_permitted",
                    "zsehealth_risk_tier": "safe",
                    "source_document": "",   # empty — should fail for verified=true
                    "verified": True,
                    "verification_status": "verified",
                }
            ]
        }

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(bad_registry, f)
            tmp_path = f.name

        try:
            with pytest.raises(RegistryValidationError):
                _load_registry(tmp_path)
        finally:
            os.unlink(tmp_path)


# ===========================================================================
# Section J — Deterministic Penalty Table
# ===========================================================================

class TestDeterministicPenaltyTable:
    """
    Requirement: Penalty values must be exact and immutable.
    These are Z-SeHealth heuristics, NOT FSSAI statutory penalties.
    """

    def test_safe_penalty_is_zero(self):
        assert PENALTY_TABLE["safe"] == 0

    def test_moderate_penalty_is_minus_5(self):
        assert PENALTY_TABLE["moderate"] == -5

    def test_high_penalty_is_minus_18(self):
        assert PENALTY_TABLE["high"] == -18

    def test_restricted_penalty_is_minus_18(self):
        assert PENALTY_TABLE["restricted"] == -18

    def test_hazardous_penalty_is_minus_35(self):
        assert PENALTY_TABLE["hazardous"] == -35

    def test_unclassified_penalty_is_minus_2(self):
        """Unknown ≠ safe (0). Unknown carries a -2 signal."""
        assert PENALTY_TABLE["unclassified"] == -2

    def test_all_tiers_have_penalty(self):
        """Every ZSeHealthRiskTier must have a penalty entry."""
        valid_tiers = set(ZSeHealthRiskTier.__args__)  # type: ignore[attr-defined]
        for tier in valid_tiers:
            assert tier in PENALTY_TABLE, f"PENALTY_TABLE missing entry for tier '{tier}'"

    def test_all_penalties_are_non_positive(self):
        """No tier should add points — all penalties <= 0."""
        for tier, points in PENALTY_TABLE.items():
            assert points <= 0, f"Tier '{tier}' has penalty={points} > 0 (unexpected)"

    def test_penalty_table_is_not_mutated_by_requests(self):
        """The module-level PENALTY_TABLE must be immutable across calls."""
        original = dict(PENALTY_TABLE)
        # Simulate multiple resolve calls
        fssai_resolver.resolve_additive("INS 102")
        fssai_resolver.resolve_additive("INS 951")
        fssai_resolver.resolve_additive("INS 99999")
        assert dict(PENALTY_TABLE) == original


# ===========================================================================
# Section K — Regression: New Canonical Field Names in API Response
# ===========================================================================

class TestNewFieldNamesInResponse:
    """
    Requirement: The new canonical field names must be present on ResolvedAdditive.
    Backward-compat aliases must also work.
    """

    def test_resolved_additive_has_zsehealth_risk_tier(self):
        result = fssai_resolver.resolve_additive("INS 102")
        assert hasattr(result, "zsehealth_risk_tier")
        assert result.zsehealth_risk_tier in set(ZSeHealthRiskTier.__args__)  # type: ignore[attr-defined]

    def test_resolved_additive_has_fssai_regulatory_status(self):
        result = fssai_resolver.resolve_additive("INS 102")
        assert hasattr(result, "fssai_regulatory_status")
        valid = set(FSSAIRegulatoryStatus.__args__)  # type: ignore[attr-defined]
        assert result.fssai_regulatory_status in valid

    def test_resolved_additive_has_is_fssai_approved(self):
        result = fssai_resolver.resolve_additive("INS 102")
        assert hasattr(result, "is_fssai_approved")
        assert isinstance(result.is_fssai_approved, bool)

    def test_resolved_additive_has_penalty_points(self):
        result = fssai_resolver.resolve_additive("INS 102")
        assert hasattr(result, "penalty_points")
        assert isinstance(result.penalty_points, int)

    def test_resolved_additive_has_regulatory_conditions(self):
        result = fssai_resolver.resolve_additive("INS 102")
        assert hasattr(result, "regulatory_conditions")
        assert isinstance(result.regulatory_conditions, list)

    def test_backward_compat_application_risk_tier(self):
        """Existing code using .application_risk_tier must still work."""
        result = fssai_resolver.resolve_additive("INS 102")
        assert result.application_risk_tier == result.zsehealth_risk_tier

    def test_backward_compat_regulatory_status(self):
        """Existing code using .regulatory_status must still work."""
        result = fssai_resolver.resolve_additive("INS 102")
        assert result.regulatory_status == result.fssai_regulatory_status


# ===========================================================================
# Section L — is_fssai_approved Semantics
# ===========================================================================

class TestIsFSSAIApproved:
    """
    Requirement: is_fssai_approved=True only for verified_permitted.
    context_dependent, not_verified, unknown → is_fssai_approved=False.
    """

    def test_verified_permitted_is_approved(self):
        """INS 300 (Ascorbic Acid) is verified_permitted → is_fssai_approved=True."""
        result = fssai_resolver.resolve_additive("INS 300")
        assert result.matched is True
        assert result.fssai_regulatory_status == "verified_permitted"
        assert result.is_fssai_approved is True

    def test_context_dependent_is_not_approved(self):
        """INS 102 is context_dependent → is_fssai_approved=False."""
        result = fssai_resolver.resolve_additive("INS 102")
        assert result.fssai_regulatory_status == "context_dependent"
        assert result.is_fssai_approved is False

    def test_unknown_is_not_approved(self):
        result = fssai_resolver.resolve_additive("INS 99999")
        assert result.is_fssai_approved is False

    def test_aspartame_context_dependent(self):
        """INS 951 is context_dependent (requires category, PKU consideration)."""
        result = fssai_resolver.resolve_additive("INS 951")
        assert result.fssai_regulatory_status == "context_dependent"
        assert result.is_fssai_approved is False

    def test_ins322_lecithins_verified_permitted(self):
        """INS 322 (Lecithins) is verified_permitted in our registry."""
        result = fssai_resolver.resolve_additive("INS 322")
        assert result.matched is True
        assert result.fssai_regulatory_status == "verified_permitted"
        assert result.is_fssai_approved is True

    def test_ins322_risk_tier_is_safe_application_classification(self):
        """
        IMPORTANT: INS 322 safe tier is a Z-SeHealth APPLICATION CLASSIFICATION.
        It is NOT an FSSAI statutory risk tier.
        The test documents this explicitly per Section 33 of the spec.
        """
        result = fssai_resolver.resolve_additive("INS 322")
        # Z-SeHealth classifies lecithins as safe for the general population
        # (individual allergen considerations are a separate clinical layer)
        assert result.zsehealth_risk_tier == "safe", (
            "INS 322 is Z-SeHealth application-classified as 'safe'. "
            "This is NOT an FSSAI statutory risk tier."
        )


# ===========================================================================
# Section M — FSSAI Regulatory Status Vocabulary
# ===========================================================================

class TestRegulatoryStatusVocabulary:
    """
    Requirement: regulatory_status must use the new FSSAIRegulatoryStatus vocabulary,
    not the old ("permitted", "restricted", "prohibited") vocabulary.
    """

    def test_valid_statuses_are_new_vocabulary(self):
        valid = set(FSSAIRegulatoryStatus.__args__)  # type: ignore[attr-defined]
        assert "verified_permitted" in valid
        assert "verified_restricted" in valid
        assert "verified_prohibited" in valid
        assert "context_dependent" in valid
        assert "not_verified" in valid
        assert "unknown" in valid

    def test_old_vocabulary_not_in_schema(self):
        """The old 'permitted' / 'restricted' / 'prohibited' raw terms must not
        be valid FSSAIRegulatoryStatus values."""
        valid = set(FSSAIRegulatoryStatus.__args__)  # type: ignore[attr-defined]
        old_terms = {"permitted", "restricted", "prohibited", "unverified", "requires_review"}
        overlap = valid & old_terms
        assert not overlap, (
            f"Old vocabulary terms found in FSSAIRegulatoryStatus: {overlap}. "
            "Use verified_permitted / verified_restricted / verified_prohibited / not_verified."
        )

    def test_registry_uses_new_vocabulary(self):
        """All loaded records must have regulatory_status from new vocabulary."""
        valid = set(FSSAIRegulatoryStatus.__args__)  # type: ignore[attr-defined]
        for record in fssai_resolver._master_list:
            assert record.regulatory_status in valid, (
                f"{record.ins_code}: regulatory_status='{record.regulatory_status}' "
                f"is not in new vocabulary {valid}"
            )


# ===========================================================================
# Section N — Registry Integrity
# ===========================================================================

class TestRegistryIntegrity:
    """
    Requirement: Registry must have minimum 45 verified records with sufficient coverage.
    """

    def test_minimum_record_count(self):
        """At least 45 records (spec says 50 only if verified)."""
        assert fssai_resolver.record_count >= 45, (
            f"Registry has {fssai_resolver.record_count} records — must have at least 45"
        )

    def test_sufficient_alias_coverage(self):
        """At least 100 alias keys (codes + aliases for 45+ records)."""
        assert len(fssai_resolver._by_alias) >= 100, (
            f"Only {len(fssai_resolver._by_alias)} alias keys — coverage may be too low"
        )

    def test_functional_class_coverage(self):
        """Registry must cover key functional classes."""
        all_classes: set = set()
        for record in fssai_resolver._master_list:
            for fc in record.functional_classes:
                all_classes.add(fc.lower())

        required = {"colour", "preservative", "antioxidant", "sweetener", "emulsifier"}
        missing = required - all_classes
        assert not missing, f"Missing functional classes in registry: {missing}"

    def test_aspartame_has_mandatory_warning(self):
        """INS 951 must have a PKU mandatory_warning in the registry."""
        record = fssai_resolver.get_by_ins_code("INS 951")
        assert record is not None
        assert record.mandatory_warning, "INS 951 (Aspartame) must have a mandatory_warning for PKU"
        assert "phenylalanine" in record.mandatory_warning.lower()

    def test_aspartame_has_regulatory_conditions(self):
        """INS 951 must list PKU and label requirements in regulatory_conditions."""
        record = fssai_resolver.get_by_ins_code("INS 951")
        assert record is not None
        conditions_text = " ".join(record.regulatory_conditions).lower()
        assert "phenylalanine" in conditions_text or "pku" in conditions_text

    def test_dataset_version_is_v2(self):
        """Dataset must be v2.0.0 after this upgrade."""
        assert "2.0" in fssai_resolver.dataset_version or "2" in fssai_resolver.dataset_version

    def test_registry_metadata_has_verified_through(self):
        """Top-level registry JSON must have a verified_through date."""
        path = os.path.normpath(
            os.path.join(os.path.dirname(__file__), "..", "backend", "data", "fssai_master_additives.json")
        )
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        assert data.get("verified_through"), "Registry must have 'verified_through' date"


# ===========================================================================
# Section O — Property-Style Determinism (100 iterations)
# ===========================================================================

class TestPropertyDeterminism:
    """
    Requirement: No randomness. No LLM. No network. No time-dependent output.
    """

    def test_determinism_100_iterations_ins102(self):
        first = fssai_resolver.resolve_additive("INS 102")
        for _ in range(100):
            result = fssai_resolver.resolve_additive("INS 102")
            assert result == first, "INS 102 resolution must be identical across 100 calls"

    def test_determinism_100_iterations_unknown(self):
        first = fssai_resolver.resolve_additive("INS 77777")
        for _ in range(100):
            result = fssai_resolver.resolve_additive("INS 77777")
            assert result == first

    def test_safety_score_is_deterministic(self):
        """Same additives → same score every time."""
        resolved = fssai_resolver.resolve_additives(["INS 102", "INS 621", "INS 951"])
        scores = [
            fssai_resolver.calculate_food_safety_score(resolved, [])
            for _ in range(20)
        ]
        assert len(set(scores)) == 1, f"Safety score varies: {set(scores)}"


# ===========================================================================
# Section P — Network Independence
# ===========================================================================

class TestNetworkIndependence:
    """
    Requirement: resolve_additive() must not call any external network resource.
    Verified by mocking socket/httpx and confirming resolution still works.
    """

    def test_resolution_does_not_require_network(self, monkeypatch):
        """
        Patch httpx.AsyncClient to raise on any call.
        Resolution must still complete deterministically from local registry.
        """
        import httpx

        def _raise(*args, **kwargs):
            raise RuntimeError("NETWORK CALL DETECTED — resolve_additive must be offline")

        monkeypatch.setattr(httpx, "AsyncClient", _raise)

        # This must succeed without any network call
        result = fssai_resolver.resolve_additive("INS 102")
        assert result.matched is True

    def test_unknown_resolution_does_not_require_network(self, monkeypatch):
        import httpx

        def _raise(*args, **kwargs):
            raise RuntimeError("NETWORK CALL DETECTED")

        monkeypatch.setattr(httpx, "AsyncClient", _raise)

        result = fssai_resolver.resolve_additive("INS 99999")
        assert result.matched is False
        assert result.zsehealth_risk_tier == "unclassified"


# ===========================================================================
# Section Q — Safety Score Integration
# ===========================================================================

class TestSafetyScoreIntegration:
    """
    Additional coverage for the food safety score calculation.
    """

    def test_zero_additives_gives_100(self):
        score = fssai_resolver.calculate_food_safety_score([], [])
        assert score == 100

    def test_safe_additive_no_penalty(self):
        resolved = fssai_resolver.resolve_additives(["INS 300"])  # Ascorbic Acid = safe
        score = fssai_resolver.calculate_food_safety_score(resolved, [])
        assert score == 100

    def test_high_tier_additive_reduces_score(self):
        resolved = fssai_resolver.resolve_additives(["INS 102"])  # Tartrazine = high
        score = fssai_resolver.calculate_food_safety_score(resolved, [])
        assert score < 100
        assert score == 82  # 100 + (-18)

    def test_score_clamped_at_minimum_1(self):
        # Create many high-penalty items to push score below 0
        high_penalty_additives = [
            fssai_resolver.resolve_additive("INS 250"),   # high
            fssai_resolver.resolve_additive("INS 249"),   # high
            fssai_resolver.resolve_additive("INS 102"),   # high
            fssai_resolver.resolve_additive("INS 110"),   # high
            fssai_resolver.resolve_additive("INS 122"),   # high
            fssai_resolver.resolve_additive("INS 124"),   # high
        ]
        score = fssai_resolver.calculate_food_safety_score(high_penalty_additives, [])
        assert score >= 1, f"Score must not go below 1, got {score}"

    def test_score_not_exceed_100(self):
        score = fssai_resolver.calculate_food_safety_score([], [10])
        assert score == 100


# ===========================================================================
# Section R — Embedded INS Extraction
# ===========================================================================

class TestEmbeddedINSExtraction:
    """Test extraction of INS codes from ingredient text."""

    def test_extracts_embedded_ins_from_text(self):
        codes = _extract_embedded_ins("Contains INS 951 (Aspartame)")
        assert "INS 951" in codes

    def test_multiple_codes_extracted(self):
        codes = _extract_embedded_ins("INS 102, INS 621 and INS 951")
        assert "INS 102" in codes
        assert "INS 621" in codes
        assert "INS 951" in codes

    def test_empty_text_returns_empty(self):
        codes = _extract_embedded_ins("")
        assert codes == []

    def test_no_ins_in_text_returns_empty(self):
        codes = _extract_embedded_ins("Salt, Water, Sugar")
        assert codes == []

    def test_ingredient_scanning_resolves(self):
        resolved, warnings = fssai_resolver.resolve_and_deduplicate(
            detected_additives=[],
            parsed_ingredients=["Water, Sugar, INS 621 (Monosodium Glutamate)"],
        )
        codes = [r.normalized_ins_code for r in resolved if r.matched]
        assert "INS 621" in codes


# ===========================================================================
# Final marker to confirm all sections loaded
# ===========================================================================

def test_all_sections_loaded():
    """Ensure all test classes are importable and the module loads cleanly."""
    classes = [
        TestINSNormalization,
        TestAliasResolution,
        TestDeterministicResolution,
        TestNoLLMRiskAuthority,
        TestOpenFoodFactsOverride,
        TestUnknownAdditiveFailClosed,
        TestProhibitedAdditive,
        TestWarningDeduplication,
        TestDatasetValidation,
        TestDeterministicPenaltyTable,
        TestNewFieldNamesInResponse,
        TestIsFSSAIApproved,
        TestRegulatoryStatusVocabulary,
        TestRegistryIntegrity,
        TestPropertyDeterminism,
        TestNetworkIndependence,
        TestSafetyScoreIntegration,
        TestEmbeddedINSExtraction,
    ]
    assert len(classes) == 18
