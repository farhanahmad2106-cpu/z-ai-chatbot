# backend/test_meal_planner.py
import pytest
from services.meal_planner.conflict_analyzer import analyze_meal_conflict
from services.meal_planner.planner import generate_meal_plan

def test_no_conflicts():
    meal = {
        "ingredients": ["rice", "moong dal"],
        "allergen_tags": [],
        "dietary_tags": ["vegetarian", "vegan"],
        "calories": 300,
        "added_sugar_g": 0,
        "sodium_mg": 200
    }
    hv = {"medicalConditions": ""}
    pref = {"allergies": [], "diet": "None"}
    
    res = analyze_meal_conflict(meal, hv, pref)
    assert res["is_safe"] is True
    assert res["conflict_severity"] == "none"

def test_allergen_critical():
    meal = {
        "ingredients": ["peanuts", "jaggery"],
        "allergen_tags": ["peanuts"],
        "dietary_tags": ["vegetarian"],
    }
    hv = {"medicalConditions": ""}
    pref = {"allergies": ["peanuts"], "diet": "None"}
    
    res = analyze_meal_conflict(meal, hv, pref)
    assert res["is_safe"] is False
    assert res["conflict_severity"] == "critical"
    assert "Contains allergen: peanuts" in res["warning_reasons"]

def test_diabetes_moderate():
    meal = {
        "ingredients": ["sugar", "wheat"],
        "allergen_tags": [],
        "dietary_tags": [],
        "added_sugar_g": 10,
        "sodium_mg": 100
    }
    hv = {"medicalConditions": "diabetes"}
    pref = {"allergies": [], "diet": "None"}
    
    res = analyze_meal_conflict(meal, hv, pref)
    # 10g sugar > 5g limit for diabetes
    assert res["is_safe"] is True
    assert res["conflict_severity"] == "moderate"

def test_dietary_vegan_fails_on_dairy():
    meal = {
        "ingredients": ["paneer", "spinach"],
        "allergen_tags": ["dairy"],
        "dietary_tags": ["vegetarian"],
    }
    hv = {"medicalConditions": ""}
    pref = {"allergies": [], "diet": "vegan"}
    
    res = analyze_meal_conflict(meal, hv, pref)
    assert res["is_safe"] is False
    assert res["conflict_severity"] == "critical"

def test_hypertension_critical():
    meal = {
        "ingredients": ["salt", "potato"],
        "allergen_tags": [],
        "dietary_tags": [],
        "sodium_mg": 900
    }
    hv = {"medicalConditions": "hypertension"}
    pref = {"allergies": [], "diet": "None"}
    
    res = analyze_meal_conflict(meal, hv, pref)
    assert res["is_safe"] is False
    assert res["conflict_severity"] == "critical"
    
def test_generate_meal_plan():
    # Provide a simple safe profile
    hv = {"medicalConditions": ""}
    pref = {"allergies": [], "diet": "None"}
    
    plan = generate_meal_plan(2000, ["breakfast", "lunch", "snack", "dinner"], hv, pref)
    
    assert plan["target_calories"] == 2000
    assert len(plan["meals"]) > 0
    assert plan["daily_totals"]["calories"] > 0
