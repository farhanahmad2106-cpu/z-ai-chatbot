from fastapi import APIRouter, Depends, HTTPException, Header
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import sys

try:
    from schemas.custom_meal import (
        CustomMealCreateRequest,
        CustomMealResponse,
        MacroNutrients,
        AnalyzedIngredientDetail
    )
    from services.recipe_analyzer import analyze_custom_recipe
except ImportError:
    from backend.schemas.custom_meal import (
        CustomMealCreateRequest,
        CustomMealResponse,
        MacroNutrients,
        AnalyzedIngredientDetail
    )
    from backend.services.recipe_analyzer import analyze_custom_recipe


def get_users_collection():
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "users_collection"):
        return main_mod.users_collection
    return None

def get_custom_meals_collection():
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "custom_meals_collection"):
        return main_mod.custom_meals_collection
    return None

async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "get_current_user_id"):
        return await main_mod.get_current_user_id(authorization)
    raise HTTPException(status_code=401, detail="Authentication dependency not ready")

router = APIRouter(prefix="/api/meals/custom", tags=["custom_meals"])

@router.post("", response_model=CustomMealResponse)
async def create_custom_meal(
    request: CustomMealCreateRequest,
    uid: str = Depends(get_current_user_id)
):
    users_col = get_users_collection()
    custom_meals_col = get_custom_meals_collection()
    if custom_meals_col is None:
        raise HTTPException(status_code=503, detail="Database service unavailable")

    # Load User & Health Vault Profile
    health_vault: Dict[str, Any] = {}
    preferences: Dict[str, Any] = {}
    user_doc = None
    if users_col is not None:
        user_doc = await users_col.find_one({"$or": [{"uid": uid}, {"id": uid}]})
        if user_doc:
            health_vault = user_doc.get("healthProfile") or user_doc.get("health_profile") or {}
            preferences = user_doc.get("preferences") or {}

    try:
        analysis = await analyze_custom_recipe(request, health_vault, preferences)
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to analyze custom recipe: {str(e)}")

    meal_id = f"custom_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "_id": meal_id,
        "id": meal_id,
        "user_id": uid,
        "name": analysis["name"],
        "meal_type": analysis["meal_type"],
        "servings": analysis["servings"],
        "cooking_method": analysis["cooking_method"],
        "total_nutrition": analysis["total_nutrition"].model_dump(),
        "per_serving_nutrition": analysis["per_serving_nutrition"].model_dump(),
        "ingredients": [i.model_dump() for i in analysis["ingredients"]],
        "safety_score": analysis["safety_score"],
        "safety_tier": analysis["safety_tier"],
        "detected_allergens": analysis["detected_allergens"],
        "clinical_conflicts": analysis["clinical_conflicts"],
        "warnings": analysis["warnings"],
        "planner_eligible": analysis["planner_eligible"],
        "include_in_planner": request.include_in_planner,
        "nutrition_provenance": analysis["nutrition_provenance"],
        "created_at": now_iso,
        "deleted_at": None
    }

    await custom_meals_col.insert_one(doc)

    # Optional today's meal logging - Atomic $inc concurrency safe
    if request.log_to_today and users_col is not None and user_doc:
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        per_serv = analysis["per_serving_nutrition"]
        cal_inc = round(float(per_serv.calories), 1)
        prot_inc = round(float(per_serv.protein_g), 1)
        carbs_inc = round(float(per_serv.carbs_g), 1)
        fat_inc = round(float(per_serv.fat_g), 1)

        # 1. Try atomic increment if stats already initialized for today
        res = await users_col.update_one(
            {"_id": user_doc["_id"], "stats.last_updated": today_str},
            {
                "$inc": {
                    "stats.calories": cal_inc,
                    "stats.protein": prot_inc,
                    "stats.carbs": carbs_inc,
                    "stats.fat": fat_inc,
                }
            }
        )

        # 2. If stats were not initialized for today, atomically initialize
        if res.matched_count == 0:
            reset_res = await users_col.update_one(
                {"_id": user_doc["_id"], "stats.last_updated": {"$ne": today_str}},
                {
                    "$set": {
                        "stats": {
                            "calories": cal_inc,
                            "protein": prot_inc,
                            "carbs": carbs_inc,
                            "fat": fat_inc,
                            "last_updated": today_str,
                        }
                    }
                }
            )
            # If another concurrent request initialized today in the interim, increment
            if reset_res.matched_count == 0:
                await users_col.update_one(
                    {"_id": user_doc["_id"], "stats.last_updated": today_str},
                    {
                        "$inc": {
                            "stats.calories": cal_inc,
                            "stats.protein": prot_inc,
                            "stats.carbs": carbs_inc,
                            "stats.fat": fat_inc,
                        }
                    }
                )

    return CustomMealResponse(**doc)

@router.get("", response_model=List[CustomMealResponse])
async def get_user_custom_meals(uid: str = Depends(get_current_user_id)):
    custom_meals_col = get_custom_meals_collection()
    if custom_meals_col is None:
        raise HTTPException(status_code=503, detail="Database service unavailable")

    cursor = custom_meals_col.find(
        {"user_id": uid, "deleted_at": None}
    ).sort("created_at", -1)
    
    meals = []
    async for doc in cursor:
        doc["id"] = str(doc.get("_id", doc.get("id")))
        meals.append(CustomMealResponse(**doc))

    return meals

@router.delete("/{meal_id}")
async def delete_custom_meal(
    meal_id: str,
    uid: str = Depends(get_current_user_id)
):
    custom_meals_col = get_custom_meals_collection()
    if custom_meals_col is None:
        raise HTTPException(status_code=503, detail="Database service unavailable")

    meal = await custom_meals_col.find_one({"_id": meal_id})
    if not meal or meal.get("deleted_at") is not None:
        raise HTTPException(status_code=404, detail="Recipe not found")

    if meal.get("user_id") != uid:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this recipe")

    await custom_meals_col.update_one(
        {"_id": meal_id},
        {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}}
    )

    return {
        "status": "success",
        "message": "Recipe deleted successfully",
        "meal_id": meal_id
    }
