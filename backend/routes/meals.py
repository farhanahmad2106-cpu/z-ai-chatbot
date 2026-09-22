from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import datetime
import sys

from schemas.meal_plan import (
    GeneratePlanRequest,
    SwapMealRequest,
    MealPlanResponse,
    MealPlanItem,
    WeeklyPlanResponse,
    WeeklyPlanRequest,
    SwapDaySlotRequest,
    GroceryListResponse,
    InfeasiblePlanError,
    MealTranslationRequest,
    MealTranslationResponse,
    SUPPORTED_MEAL_LANGUAGES
)
from services.meal_planner.planner import generate_meal_plan, swap_meal
from services.meal_planner.weekly_planner import (
    generate_weekly_plan,
    swap_day_slot_in_plan,
    InfeasiblePlanException
)
from services.meal_planner.grocery_generator import generate_grocery_list_from_plan
from services.meal_planner.meal_translator import translate_meals

def get_users_collection():
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "users_collection"):
        return main_mod.users_collection
    return None

def get_weekly_plans_collection():
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "weekly_plans_collection"):
        return main_mod.weekly_plans_collection
    return None

def get_meal_translations_collection():
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "meal_translations_collection"):
        return main_mod.meal_translations_collection
    return None

def get_custom_meals_collection():
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "custom_meals_collection"):
        return main_mod.custom_meals_collection
    return None

async def fetch_user_eligible_custom_meals(uid: str) -> List[Dict[str, Any]]:
    col = get_custom_meals_collection()
    if col is None:
        return []
    try:
        cursor = col.find({
            "user_id": uid,
            "deleted_at": None,
            "include_in_planner": True,
            "planner_eligible": True
        })
        return await cursor.to_list(length=100)
    except Exception as e:
        print(f"[Meals] Warning: Failed to fetch custom meals: {e}")
        return []



async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "get_current_user_id"):
        return await main_mod.get_current_user_id(authorization)
    raise HTTPException(status_code=401, detail="Authentication dependency not ready")

router = APIRouter(prefix="/api/meals", tags=["meals"])

# --- EXISTING SINGLE-DAY PLANNER (100% BACKWARD COMPATIBLE) ---

@router.post("/generate-plan", response_model=MealPlanResponse)
async def generate_plan(request: GeneratePlanRequest, uid: str = Depends(get_current_user_id)):
    users_col = get_users_collection()
    user = await users_col.find_one({"uid": uid}) if users_col is not None else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    health_profile = user.get("health_profile", {})
    preferences = user.get("preferences", {})
    
    target_cals = request.target_calories
    if target_cals <= 0:
        raise HTTPException(status_code=422, detail="Invalid calorie target")
        
    custom_meals = await fetch_user_eligible_custom_meals(uid)
    plan = generate_meal_plan(target_cals, request.meal_types, health_profile, preferences, custom_meals=custom_meals)
    
    if len(plan["meals"]) == 0:
        raise HTTPException(status_code=409, detail="Cannot fulfill plan constraints safely.")
        
    plan["generated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    plan["data_disclaimer"] = "Meal suggestions are informational and are not a substitute for individualized medical or dietary advice. If you have a medical condition, food allergy, or clinically prescribed diet, verify dietary changes with your healthcare professional."
    
    return plan

@router.post("/swap", response_model=MealPlanItem)
async def swap(request: SwapMealRequest, uid: str = Depends(get_current_user_id)):
    users_col = get_users_collection()
    user = await users_col.find_one({"uid": uid}) if users_col is not None else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

        
    health_profile = user.get("health_profile", {})
    preferences = user.get("preferences", {})
    
    custom_meals = await fetch_user_eligible_custom_meals(uid)
    new_meal = swap_meal(
        current_meal_id=request.current_meal_id,
        meal_type=request.meal_type,
        target_calories=request.target_calories,
        health_vault=health_profile,
        preferences=preferences,
        custom_meals=custom_meals
    )
    
    if not new_meal:
        raise HTTPException(status_code=409, detail="No compatible alternative was found for this meal.")
        
    return new_meal


# --- 7-DAY REVOLVING PLANNER ENDPOINTS ---

@router.post("/weekly-plan", response_model=WeeklyPlanResponse)
async def get_or_create_weekly_plan(
    request: WeeklyPlanRequest,
    uid: str = Depends(get_current_user_id)
):
    users_col = get_users_collection()
    user = await users_col.find_one({"uid": uid}) if users_col else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    health_profile = user.get("health_profile", {})
    preferences = user.get("preferences", {})

    target_calories = request.target_calories
    if not target_calories:
        daily_goals = user.get("daily_goals", {})
        target_calories = float(daily_goals.get("calories", 2000))
    
    if target_calories <= 0:
        raise HTTPException(status_code=422, detail="Target calories must be greater than 0")

    today = datetime.date.today()
    start_date = today - datetime.timedelta(days=today.weekday())
    week_id = f"{start_date.isocalendar()[0]}-W{start_date.isocalendar()[1]:02d}"

    weekly_plans_col = get_weekly_plans_collection()

    # If active plan exists and force_regenerate is False, return it
    if weekly_plans_col and not request.force_regenerate:
        existing_plan = await weekly_plans_col.find_one({
            "user_id": uid,
            "week_id": week_id,
            "status": "active"
        })
        if existing_plan:
            existing_plan.pop("_id", None)
            return existing_plan

    # Generate new weekly plan
    try:
        custom_meals = await fetch_user_eligible_custom_meals(uid)
        new_plan = generate_weekly_plan(
            user_id=uid,
            target_calories=target_calories,
            health_vault=health_profile,
            preferences=preferences,
            start_date=start_date,
            custom_meals=custom_meals
        )
    except InfeasiblePlanException as e:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "error_code": "WEEKLY_PLAN_INFEASIBLE",
                "message": e.message,
                "constraint": e.constraint,
                "day": e.day,
                "slot": e.slot
            }
        )

    # Persist in MongoDB
    if weekly_plans_col is not None:
        # Archive prior plans for this user and week
        await weekly_plans_col.update_many(
            {"user_id": uid, "week_id": week_id},
            {"$set": {"status": "archived", "is_active": False}}
        )
        plan_to_save = dict(new_plan)
        await weekly_plans_col.insert_one(plan_to_save)
        plan_to_save.pop("_id", None)

    return new_plan

@router.post("/weekly-plan/swap-day-slot", response_model=WeeklyPlanResponse)
async def swap_slot_in_weekly_plan(
    request: SwapDaySlotRequest,
    uid: str = Depends(get_current_user_id)
):
    users_col = get_users_collection()
    user = await users_col.find_one({"uid": uid}) if users_col is not None else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    health_profile = user.get("health_profile", {})
    preferences = user.get("preferences", {})

    weekly_plans_col = get_weekly_plans_collection()
    if weekly_plans_col is None:
        raise HTTPException(status_code=500, detail="Database connection not available")

    # Find the target plan and verify user ownership
    active_plan = await weekly_plans_col.find_one({"plan_id": request.plan_id, "user_id": uid})
    if not active_plan:
        # Fallback: check currently active plan for user
        active_plan = await weekly_plans_col.find_one({"user_id": uid, "status": "active"})
        if not active_plan:
            raise HTTPException(status_code=404, detail="Active weekly plan not found or access denied")

    active_plan.pop("_id", None)

    custom_meals = await fetch_user_eligible_custom_meals(uid)
    success, updated_plan, error_msg = swap_day_slot_in_plan(
        plan=active_plan,
        day=request.day,
        slot=request.slot,
        replacement_meal_id=request.replacement_meal_id,
        health_vault=health_profile,
        preferences=preferences,
        custom_meals=custom_meals
    )


    if not success:
        raise HTTPException(
            status_code=422,
            detail={
                "success": False,
                "error_code": "WEEKLY_SWAP_REJECTED",
                "message": error_msg or "Cannot swap slot with requested alternative.",
                "day": request.day,
                "slot": request.slot
            }
        )

    # Persist the updated plan back to MongoDB
    await weekly_plans_col.update_one(
        {"plan_id": active_plan["plan_id"], "user_id": uid},
        {"$set": {"days": updated_plan["days"], "summary_nutrition": updated_plan["summary_nutrition"]}}
    )
    updated_plan.pop("_id", None)
    return updated_plan

# --- SMART GROCERY LIST ENDPOINT ---

@router.post("/grocery-list", response_model=GroceryListResponse)
async def get_grocery_list(uid: str = Depends(get_current_user_id)):
    weekly_plans_col = get_weekly_plans_collection()
    if weekly_plans_col is None:
        raise HTTPException(status_code=500, detail="Database connection not available")

    # Retrieve user's active plan
    active_plan = await weekly_plans_col.find_one({"user_id": uid, "status": "active"})
    if not active_plan:
        raise HTTPException(status_code=404, detail="No active weekly meal plan found for user. Generate a 7-day plan first.")

    # Strict ownership boundary check
    if active_plan.get("user_id") != uid:
        raise HTTPException(status_code=403, detail="Forbidden: You cannot access another user's grocery list.")

    active_plan.pop("_id", None)
    grocery_list = generate_grocery_list_from_plan(active_plan)
    return grocery_list

# --- INDIC MEAL PLAN LOCALIZATION ENDPOINT ---

@router.post("/translate-plan", response_model=MealTranslationResponse)
async def translate_meal_plan(
    request: MealTranslationRequest,
    uid: str = Depends(get_current_user_id)
):
    if request.language not in SUPPORTED_MEAL_LANGUAGES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported language code '{request.language}'. Supported languages: {list(SUPPORTED_MEAL_LANGUAGES.keys())}"
        )

    users_col = get_users_collection()
    user = await users_col.find_one({"uid": uid}) if users_col else None
    user_tier = user.get("tier", "free") if user else "free"

    translations_col = get_meal_translations_collection()

    try:
        response = await translate_meals(
            meals=request.meals,
            language=request.language,
            translations_col=translations_col,
            user_tier=user_tier
        )
        return response
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        print(f"[MealsRoute] Translation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to process meal translations")

