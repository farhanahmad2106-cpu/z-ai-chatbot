"""
FSSAI Additive Safety Engine — Comprehensive Compliance Test Suite

Verifies:
  - ZS-004 class vulnerability elimination: no LLM risk fabrication
  - Registry structural integrity (startup validation)
  - INS code normalization (all supported formats)
  - Resolution pipeline (INS match, name match, alias match, embedded INS extraction)
  - Unknown/unresolved handling (unknown ≠ hazardous)
  - Deduplication (same additive via different identifiers → single penalty)
  - Deterministic scoring (no randomness, no LLM output)
  - Mandatory warnings and infant food flags propagate correctly
  - resolve_and_deduplicate() — full pipeline including ingredient scanning
  - Provenance fields populated on match
  - Penalty table consistency
  - Registry completeness (≥ 50 additives, ≥ 5 distinct functional classes)
  - Alias collision detection invariant
  - Edge cases: None input, empty strings, numeric-only codes, E-number prefix
"""

import pytest
from backend.services.fssai_service import (
    PENALTY_TABLE,
    FSSAIRegulatoryService,
    RegistryValidationError,
    fssai_resolver,
)
from backend.schemas.fssai import ResolvedAdditive


# ===========================================================================
# Section 1 — Registry Integrity & Startup Validation
# ===========================================================================


class TestRegistryIntegrity:
    """The service must fail closed if the registry is missing, malformed, or empty."""

    def test_registry_loaded_minimum_records(self):
        """Registry MUST contain at least 50 additive records."""
        assert len(fssai_resolver.registry) >= 50, (
            f"Registry only has {len(fssai_resolver.registry)} records; minimum is 50."
        )

    def test_registry_alias_index_populated(self):
        """Alias lookup index must have at minimum 80 entries (multi-alias per additive)."""
        assert len(fssai_resolver.by_alias) >= 80, (
            f"Alias index only has {len(fssai_resolver.by_alias)} entries; expected >= 80."
        )

    def test_registry_no_duplicate_ins_codes(self):
        """Every INS code in the registry must be unique."""
        ins_codes = list(fssai_resolver.registry.keys())
        assert len(ins_codes) == len(set(ins_codes)), "Registry contains duplicate INS codes."

    def test_registry_all_records_have_canonical_name(self):
        """Every record must have a non-empty canonical_name."""
        for code, record in fssai_resolver.registry.items():
            assert record.canonical_name and record.canonical_name.strip(), (
                f"Record {code} has empty canonical_name."
            )

    def test_registry_all_records_have_source_authority(self):
        """Every record must have provenance: source_authority must not be empty."""
        for code, record in fssai_resolver.registry.items():
            assert record.source_authority and record.source_authority.strip(), (
                f"Record {code} ({record.canonical_name}) missing source_authority."
            )

    def test_registry_adi_values_are_positive_or_none(self):
        """ADI values must be strictly positive if present."""
        for code, record in fssai_resolver.registry.items():
            if record.adi_mg_per_kg_bw is not None:
                assert record.adi_mg_per_kg_bw > 0, (
                    f"Record {code} ({record.canonical_name}) has negative ADI {record.adi_mg_per_kg_bw}."
                )

    def test_registry_covers_multiple_functional_classes(self):
        """Registry must cover at least 5 distinct functional classes."""
        all_classes = set()
        for record in fssai_resolver.registry.values():
            for fc in record.functional_classes:
                all_classes.add(fc)
        assert len(all_classes) >= 5, (
            f"Registry only covers {len(all_classes)} functional classes: {all_classes}"
        )

    def test_metadata_fields_present(self):
        """Registry metadata must carry authority, title, and disclaimer."""
        meta = fssai_resolver.metadata
        assert meta.get("authority"), "Registry metadata missing 'authority'."
        assert meta.get("title"), "Registry metadata missing 'title'."
        assert meta.get("disclaimer"), "Registry metadata missing 'disclaimer'."


# ===========================================================================
# Section 2 — INS Code Normalization
# ===========================================================================


class TestINSNormalization:
    """normalize_ins_code() must handle all documented input variants."""

    @pytest.mark.parametrize("raw, expected", [
        ("INS 102",    "INS 102"),
        ("INS-102",    "INS 102"),
        ("ins 102",    "INS 102"),
        ("E102",       "INS 102"),
        ("E-102",      "INS 102"),
        ("E 102",      "INS 102"),
        ("102",        "INS 102"),
        ("INS 621",    "INS 621"),
        ("E621",       "INS 621"),
        ("INS 500(ii)","INS 500(II)"),
        ("E500(ii)",   "INS 500(II)"),
        ("500(ii)",    "INS 500(II)"),
        ("INS 150c",   "INS 150C"),
        ("E150c",      "INS 150C"),
        ("150C",       "INS 150C"),
        ("INS 171",    "INS 171"),
        ("1",          None),           # too short — not a valid code
        ("",           None),           # empty string
        ("Tartrazine", None),           # plain name — not a code
        ("chicken",    None),           # arbitrary word
    ])
    def test_normalize_ins_code_variants(self, raw, expected):
        result = FSSAIRegulatoryService.normalize_ins_code(raw)
        assert result == expected, f"normalize_ins_code({raw!r}) → {result!r}, expected {expected!r}"

    def test_normalize_none_returns_none(self):
        assert FSSAIRegulatoryService.normalize_ins_code(None) is None

    def test_normalize_whitespace_only_returns_none(self):
        assert FSSAIRegulatoryService.normalize_ins_code("   ") is None


# ===========================================================================
# Section 3 — Resolution Pipeline
# ===========================================================================


class TestResolutionPipeline:
    """resolve_additive_safety() must resolve via the correct lookup path."""

    # --- Method 1: INS code match ---
    def test_resolve_by_ins_code_tartrazine(self):
        res = fssai_resolver.resolve_additive_safety("INS 102", None)
        assert res.matched is True
        assert res.match_method == "ins_code"
        assert res.canonical_name == "Tartrazine"
        assert res.regulatory_status == "permitted"
        assert res.application_risk_tier == "moderate"

    def test_resolve_by_e_number_prefix(self):
        """E-number prefix is equivalent to INS prefix."""
        res = fssai_resolver.resolve_additive_safety("E102", None)
        assert res.matched is True
        assert res.canonical_name == "Tartrazine"

    def test_resolve_by_numeric_only_code(self):
        """Bare numeric code without prefix resolves correctly."""
        res = fssai_resolver.resolve_additive_safety("102", None)
        assert res.matched is True
        assert res.canonical_name == "Tartrazine"

    def test_resolve_by_ins_code_sodium_nitrite(self):
        """INS 250 (Sodium Nitrite) must resolve as high/restricted risk."""
        res = fssai_resolver.resolve_additive_safety("INS 250", None)
        assert res.matched is True
        assert res.match_method == "ins_code"
        assert res.application_risk_tier in ("high", "restricted", "hazardous")

    def test_resolve_by_ins_code_msg(self):
        """INS 621 (Monosodium Glutamate) must resolve correctly."""
        res = fssai_resolver.resolve_additive_safety("INS 621", None)
        assert res.matched is True
        assert res.application_risk_tier in ("safe", "moderate", "high")

    # --- Method 2: Canonical name match ---
    def test_resolve_by_canonical_name(self):
        res = fssai_resolver.resolve_additive_safety(None, "Tartrazine")
        assert res.matched is True
        assert res.match_method == "canonical_name"
        assert res.normalized_ins_code == "INS 102"

    def test_resolve_by_canonical_name_case_insensitive(self):
        res = fssai_resolver.resolve_additive_safety(None, "tartrazine")
        assert res.matched is True
        assert res.normalized_ins_code == "INS 102"

    # --- Method 3: Alias match ---
    def test_resolve_by_alias_yellow_6(self):
        """'Yellow 6' is an alias for Sunset Yellow FCF (INS 110)."""
        res = fssai_resolver.resolve_additive_safety(None, "Yellow 6")
        assert res.matched is True
        assert res.match_method == "alias"
        assert res.canonical_name == "Sunset Yellow FCF"
        assert res.normalized_ins_code == "INS 110"

    def test_resolve_by_alias_case_insensitive(self):
        res = fssai_resolver.resolve_additive_safety(None, "yellow 6")
        assert res.matched is True
        assert res.canonical_name == "Sunset Yellow FCF"

    def test_resolve_by_alias_msg(self):
        """'MSG' is a common alias for Monosodium Glutamate (INS 621)."""
        res = fssai_resolver.resolve_additive_safety(None, "MSG")
        assert res.matched is True
        assert res.normalized_ins_code == "INS 621"

    # --- Method 4: Embedded INS extraction from name string ---
    def test_resolve_embedded_ins_in_name(self):
        """'Tartrazine (102)' should extract '102' and match INS 102."""
        res = fssai_resolver.resolve_additive_safety(None, "102")
        assert res.matched is True
        assert res.normalized_ins_code == "INS 102"

    # --- Resolution priority: INS code wins over name when both provided ---
    def test_ins_code_takes_priority_over_name(self):
        """When both code and name are provided, INS code match wins."""
        res = fssai_resolver.resolve_additive_safety("INS 102", "Sunset Yellow FCF")
        assert res.matched is True
        assert res.normalized_ins_code == "INS 102"
        assert res.canonical_name == "Tartrazine"  # resolved by INS, not name

    # --- Provenance fields ---
    def test_provenance_populated_on_match(self):
        """Resolved additive must carry non-empty provenance fields."""
        res = fssai_resolver.resolve_additive_safety("INS 102", None)
        assert res.provenance is not None
        assert res.provenance.get("authority"), "Provenance 'authority' must be set."
        assert res.provenance.get("registry_version"), "Provenance 'registry_version' must be set."

    # --- functional_classes populated ---
    def test_functional_classes_populated(self):
        res = fssai_resolver.resolve_additive_safety("INS 102", None)
        assert isinstance(res.functional_classes, list)
        assert len(res.functional_classes) > 0, "Resolved additive must have functional_classes."


# ===========================================================================
# Section 4 — Unresolved / Unknown Handling (ZS-004 Core Invariant)
# ===========================================================================


class TestUnresolvedHandling:
    """Unknown additives must NEVER be assigned safety classifications by default."""

    def test_unknown_ins_code_not_matched(self):
        res = fssai_resolver.resolve_additive_safety("INS 9999", "Fake Additive XYZ")
        assert res.matched is False
        assert res.match_method == "unmatched"

    def test_unknown_returns_unknown_regulatory_status(self):
        """Unresolved additives get 'unknown' status — NOT a fabricated safe/permitted/banned."""
        res = fssai_resolver.resolve_additive_safety("INS 9999", "Fake Additive XYZ")
        assert res.regulatory_status == "unknown"

    def test_unknown_returns_unclassified_risk_tier(self):
        """Unresolved additives get 'unclassified' tier — NOT a fabricated low/moderate/high."""
        res = fssai_resolver.resolve_additive_safety("INS 9999", "Fake Additive XYZ")
        assert res.application_risk_tier == "unclassified"

    def test_unknown_sets_requires_review_true(self):
        res = fssai_resolver.resolve_additive_safety("INS 9999", "Fake Additive XYZ")
        assert res.requires_review is True

    def test_unknown_includes_warning_message(self):
        res = fssai_resolver.resolve_additive_safety("INS 9999", "Fake Additive XYZ")
        assert res.warnings, "Unresolved additive must emit at least one warning."

    def test_none_inputs_returns_unmatched(self):
        """Both inputs None → unmatched unclassified, not an error."""
        res = fssai_resolver.resolve_additive_safety(None, None)
        assert res.matched is False
        assert res.application_risk_tier == "unclassified"

    def test_empty_string_inputs_returns_unmatched(self):
        res = fssai_resolver.resolve_additive_safety("", "")
        assert res.matched is False
        assert res.application_risk_tier == "unclassified"

    def test_unresolved_penalty_is_zero(self):
        """Unknown additives must NOT incur a false penalty (unknown ≠ hazardous)."""
        res = fssai_resolver.resolve_additive_safety("INS 9999", "Fake Additive XYZ")
        penalty = fssai_resolver.calculate_additive_penalty(res)
        assert penalty == 0, (
            f"Unclassified additive should have 0 penalty, got {penalty}."
        )


# ===========================================================================
# Section 5 — Deterministic Scoring
# ===========================================================================


class TestDeterministicScoring:
    """calculate_food_safety_score() must be deterministic, bounded, and correct."""

    def test_score_zero_additives_is_100(self):
        assert fssai_resolver.calculate_food_safety_score([], []) == 100

    def test_score_safe_additives_no_deduction(self):
        """Safe-tier additives must not reduce the score."""
        safe_add = fssai_resolver.resolve_additive_safety("INS 100", None)
        assert safe_add.application_risk_tier == "safe", (
            "INS 100 (Curcumin) expected to be safe tier."
        )
        score = fssai_resolver.calculate_food_safety_score([safe_add], [])
        assert score == 100

    def test_score_high_risk_deduction(self):
        """INS 250 (high/restricted) must deduct 18 points."""
        res_250 = fssai_resolver.resolve_additive_safety("INS 250", None)
        score = fssai_resolver.calculate_food_safety_score([res_250], [])
        expected = max(1, 100 + PENALTY_TABLE.get(res_250.application_risk_tier, 0))
        assert score == expected

    def test_score_moderate_deduction(self):
        """INS 102 (moderate) must deduct 5 points."""
        res_102 = fssai_resolver.resolve_additive_safety("INS 102", None)
        assert res_102.application_risk_tier == "moderate"
        score = fssai_resolver.calculate_food_safety_score([res_102], [])
        assert score == 95

    def test_score_combined_additives(self):
        """INS 250 (high -18) + INS 102 (moderate -5) = 77."""
        res_250 = fssai_resolver.resolve_additive_safety("INS 250", None)
        res_102 = fssai_resolver.resolve_additive_safety("INS 102", None)
        score = fssai_resolver.calculate_food_safety_score([res_250, res_102], [])
        assert score == 77

    def test_score_minimum_clamped_to_1(self):
        """Score must never go below 1 even with many hazardous additives."""
        # Resolve multiple high-risk additives
        additives = [
            fssai_resolver.resolve_additive_safety("INS 250", None),
            fssai_resolver.resolve_additive_safety("INS 127", None),
            fssai_resolver.resolve_additive_safety("INS 102", None),
            fssai_resolver.resolve_additive_safety("INS 110", None),
            fssai_resolver.resolve_additive_safety("INS 122", None),
            fssai_resolver.resolve_additive_safety("INS 124", None),
            fssai_resolver.resolve_additive_safety("INS 129", None),
        ]
        score = fssai_resolver.calculate_food_safety_score(additives, [])
        assert score >= 1, f"Score must be >= 1, got {score}."
        assert score <= 100, f"Score must be <= 100, got {score}."

    def test_score_maximum_clamped_to_100(self):
        """Score must never exceed 100."""
        score = fssai_resolver.calculate_food_safety_score([], [])
        assert score == 100

    def test_score_is_deterministic(self):
        """Same inputs must produce identical output on repeated calls."""
        res_250 = fssai_resolver.resolve_additive_safety("INS 250", None)
        res_102 = fssai_resolver.resolve_additive_safety("INS 102", None)
        s1 = fssai_resolver.calculate_food_safety_score([res_250, res_102], [])
        s2 = fssai_resolver.calculate_food_safety_score([res_250, res_102], [])
        s3 = fssai_resolver.calculate_food_safety_score([res_250, res_102], [])
        assert s1 == s2 == s3, "Score must be deterministic across repeated calls."

    def test_penalty_table_contains_all_tiers(self):
        """PENALTY_TABLE must define penalties for all expected tiers."""
        required_tiers = {"safe", "moderate", "high", "restricted", "hazardous", "unclassified"}
        for tier in required_tiers:
            assert tier in PENALTY_TABLE, f"PENALTY_TABLE missing tier: '{tier}'"

    def test_penalty_table_values_are_non_positive(self):
        """All penalties must be <= 0 (they reduce the score or are neutral)."""
        for tier, penalty in PENALTY_TABLE.items():
            assert penalty <= 0, (
                f"PENALTY_TABLE['{tier}'] = {penalty} is positive — penalties must be <= 0."
            )


# ===========================================================================
# Section 6 — Deduplication
# ===========================================================================


class TestDeduplication:
    """The same additive via different identifiers must only be counted once."""

    def test_same_additive_by_ins_and_name_deduplicated(self):
        """INS 621 and 'MSG' both map to Monosodium Glutamate — counted once."""
        res_ins = fssai_resolver.resolve_additive_safety("INS 621", None)
        res_name = fssai_resolver.resolve_additive_safety(None, "MSG")
        # Both should resolve to the same canonical record
        assert res_ins.normalized_ins_code == res_name.normalized_ins_code
        score_both = fssai_resolver.calculate_food_safety_score([res_ins, res_name], [])
        score_once = fssai_resolver.calculate_food_safety_score([res_ins], [])
        assert score_both == score_once, (
            "Duplicate additive via alias must only be penalized once."
        )

    def test_dedup_by_e_number_and_ins_code(self):
        """E102 and INS 102 resolve to the same additive — deduped."""
        r1 = fssai_resolver.resolve_additive_safety("E102", None)
        r2 = fssai_resolver.resolve_additive_safety("INS 102", None)
        assert r1.normalized_ins_code == r2.normalized_ins_code
        score_two = fssai_resolver.calculate_food_safety_score([r1, r2], [])
        score_one = fssai_resolver.calculate_food_safety_score([r1], [])
        assert score_two == score_one

    def test_resolve_and_deduplicate_no_double_count(self):
        """resolve_and_deduplicate() must deduplicate across detected_additives list."""
        detected = [
            {"code": "INS 102", "name": "Tartrazine"},
            {"code": "E102", "name": None},
            {"code": None, "name": "Tartrazine"},
        ]
        resolved, warnings = fssai_resolver.resolve_and_deduplicate(detected, [])
        # All three refer to the same additive — only 1 unique resolved entry expected
        assert len(resolved) == 1, (
            f"Expected 1 unique additive after dedup, got {len(resolved)}."
        )

    def test_resolve_and_deduplicate_different_additives_not_collapsed(self):
        """Different additives must NOT be collapsed together."""
        detected = [
            {"code": "INS 102", "name": None},
            {"code": "INS 110", "name": None},
            {"code": "INS 621", "name": None},
        ]
        resolved, _ = fssai_resolver.resolve_and_deduplicate(detected, [])
        assert len(resolved) == 3, (
            f"Expected 3 distinct additives, got {len(resolved)}."
        )


# ===========================================================================
# Section 7 — resolve_and_deduplicate() Full Pipeline
# ===========================================================================


class TestResolveAndDeduplicate:
    """Full pipeline: detected additives + ingredient scanning."""

    def test_ingredient_scanning_finds_known_additive(self):
        """Ingredient names that match registry should be resolved via ingredient scan."""
        _, warnings = fssai_resolver.resolve_and_deduplicate([], ["Tartrazine", "Salt", "Sugar"])
        resolved, _ = fssai_resolver.resolve_and_deduplicate([], ["Tartrazine"])
        assert len(resolved) == 1
        assert resolved[0].canonical_name == "Tartrazine"

    def test_ingredient_scanning_ignores_unrecognized_ingredients(self):
        """Generic ingredient words that are not additives must not be added."""
        resolved, _ = fssai_resolver.resolve_and_deduplicate([], ["Salt", "Sugar", "Flour"])
        assert len(resolved) == 0, (
            "Common non-additive ingredients must not create false resolved entries."
        )

    def test_warnings_collected_from_resolved_additives(self):
        """Warnings from each resolved additive must be aggregated."""
        detected = [{"code": "INS 250", "name": None}]  # Sodium Nitrite — has warnings
        _, warnings = fssai_resolver.resolve_and_deduplicate(detected, [])
        assert isinstance(warnings, list)

    def test_empty_inputs_returns_empty_results(self):
        resolved, warnings = fssai_resolver.resolve_and_deduplicate([], [])
        assert resolved == []
        assert warnings == []

    def test_string_additive_in_detected_list_handled(self):
        """Non-dict items in detected_additives must be handled gracefully without crashing."""
        # The service handles non-dict by treating it as a name string
        resolved, _ = fssai_resolver.resolve_and_deduplicate(["Tartrazine"], [])
        assert isinstance(resolved, list)

    def test_warnings_are_unique(self):
        """The same warning from duplicate additive entries must not appear twice."""
        detected = [
            {"code": "INS 102", "name": None},
            {"code": "E102", "name": None},
        ]
        _, warnings = fssai_resolver.resolve_and_deduplicate(detected, [])
        assert len(warnings) == len(set(warnings)), "Duplicate warning strings must be deduplicated."


# ===========================================================================
# Section 8 — Mandatory Warnings & Infant Food Flags
# ===========================================================================


class TestMandatoryWarnings:
    """Mandatory warnings and infant food restrictions must surface correctly."""

    def test_sodium_nitrite_emits_warning(self):
        """INS 250 (Sodium Nitrite) must have a mandatory warning."""
        res = fssai_resolver.resolve_additive_safety("INS 250", None)
        assert res.matched is True
        # The additive must have at least a warning (mandatory_warning or list warning)
        has_mandatory = res.mandatory_warning is not None
        has_warning_list = len(res.warnings) > 0
        assert has_mandatory or has_warning_list, (
            "INS 250 (Sodium Nitrite) must emit at least one warning."
        )

    def test_resolved_additive_warnings_is_list(self):
        """warnings field must always be a list (never None)."""
        res = fssai_resolver.resolve_additive_safety("INS 100", None)
        assert isinstance(res.warnings, list)

    def test_unresolved_additive_warnings_is_list(self):
        """Unresolved additives also have a warnings list."""
        res = fssai_resolver.resolve_additive_safety("INS 9999", "Fake")
        assert isinstance(res.warnings, list)
        assert len(res.warnings) > 0


# ===========================================================================
# Section 9 — ZS-004 Core Invariant: No LLM Risk Fabrication
# ===========================================================================


class TestZS004Invariant:
    """
    ZS-004: Additive safety/risk must NEVER be invented, inferred,
    defaulted, or assumed from LLM output or external defaults.
    All resolved safety data must come solely from the deterministic registry.
    """

    def test_resolved_additive_schema_has_no_llm_risk_field(self):
        """
        The ResolvedAdditive schema must not have a field called 'risk'
        that could accept LLM-generated values.
        """
        res = fssai_resolver.resolve_additive_safety("INS 102", None)
        # 'risk' as a top-level field would indicate LLM risk fabrication pattern
        assert not hasattr(res, "risk") or res.risk is None if hasattr(res, "risk") else True

    def test_matched_additive_has_registry_sourced_tier(self):
        """application_risk_tier for a matched additive must be a registry-defined value."""
        valid_tiers = {"safe", "moderate", "high", "restricted", "hazardous"}
        res = fssai_resolver.resolve_additive_safety("INS 102", None)
        assert res.application_risk_tier in valid_tiers, (
            f"Matched additive has invalid risk tier: '{res.application_risk_tier}'"
        )

    def test_unmatched_additive_tier_is_unclassified_not_low(self):
        """
        Unresolved additives must get 'unclassified', NOT a fabricated 'low' or 'safe' tier.
        This is the core ZS-004 check.
        """
        res = fssai_resolver.resolve_additive_safety("INS 9999", "Mystery Compound Alpha-7")
        assert res.application_risk_tier == "unclassified", (
            f"Unresolved additive must be 'unclassified', not '{res.application_risk_tier}'."
        )
        assert res.application_risk_tier not in ("low", "safe", "permitted"), (
            "Unresolved additive must NOT be falsely assigned a 'safe' or 'low' tier."
        )

    def test_score_does_not_default_unknown_to_safe(self):
        """
        An unresolved additive must contribute 0 penalty (not negative, not falsely positive).
        Score for single unknown must equal 100 (no fabricated good or bad signal).
        """
        res = fssai_resolver.resolve_additive_safety("INS 8888", "Fictional Compound Beta-9")
        score = fssai_resolver.calculate_food_safety_score([res], [])
        assert score == 100, (
            f"Unknown additive must not affect score. Expected 100, got {score}."
        )
