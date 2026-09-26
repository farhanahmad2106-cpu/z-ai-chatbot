import pytest
from backend.services.fssai_service import fssai_resolver

def test_resolve_known_additive():
    # INS 102 (Tartrazine)
    res = fssai_resolver.resolve_additive_safety("INS 102", "Tartrazine")
    assert res.matched is True
    assert res.match_method == "ins_code"
    assert res.regulatory_status == "permitted"
    assert res.application_risk_tier == "moderate"

def test_resolve_alias():
    res = fssai_resolver.resolve_additive_safety(None, "Yellow 6")
    assert res.matched is True
    assert res.match_method == "alias"
    assert res.canonical_name == "Sunset Yellow FCF"

def test_resolve_unknown_additive():
    res = fssai_resolver.resolve_additive_safety("INS 9999", "Unknown Fake Additive")
    assert res.matched is False
    assert res.match_method == "unmatched"
    assert res.regulatory_status == "requires_review"

def test_safety_score_deduction():
    # INS 250 (High risk), INS 102 (Moderate risk)
    additives = [
        fssai_resolver.resolve_additive_safety("INS 250", None),
        fssai_resolver.resolve_additive_safety("INS 102", None)
    ]
    score = fssai_resolver.calculate_food_safety_score(additives, [])
    # 100 - 18 (high risk) - 5 (moderate risk) = 77
    assert score == 77
