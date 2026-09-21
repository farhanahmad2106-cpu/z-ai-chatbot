from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional
import datetime

# Reuse authentication dependency from main app logic 
# (assuming it's accessible or we redefine/import the same logic)
from schemas.meal_plan import GeneratePlanRequest, SwapMealRequest, MealPlanResponse, MealPlanItem
from services.meal_planner.planner import generate_meal_plan, swap_meal
import sys

def get_users_collection():
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "users_collection"):
        return main_mod.users_collection
    return None

async def get_current_user_id(authorization: Optional[str] = Header(None)) -> str:
    main_mod = sys.modules.get("main") or sys.modules.get("backend.main")
    if main_mod and hasattr(main_mod, "get_current_user_id"):
        return await main_mod.get_current_user_id(authorization)
    raise HTTPException(status_code=401, detail="Authentication dependency not ready")

router = APIRouter(prefix="/api/meals", tags=["meals"])

@router.post("/generate-plan", response_model=MealPlanResponse)
async def generate_plan(request: GeneratePlanRequest, uid: str = Depends(get_current_user_id)):
    users_col = get_users_collection()
    user = await users_col.find_one({"uid": uid}) if users_col else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    health_profile = user.get("health_profile", {})
    preferences = user.get("preferences", {})
    
    # We take target calories from the request which can be overridden, 
    # but normally the frontend should pass the `daily_goals.calories`
    target_cals = request.target_calories
    if target_cals <= 0:
        raise HTTPException(status_code=422, detail="Invalid calorie target")
        
    plan = generate_meal_plan(target_cals, request.meal_types, health_profile, preferences)
    
    if len(plan["meals"]) == 0:
        raise HTTPException(status_code=409, detail="Cannot fulfill plan constraints safely.")
        
    plan["generated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    plan["data_disclaimer"] = "Meal suggestions are informational and are not a substitute for individualized medical or dietary advice. If you have a medical condition, food allergy, or clinically prescribed diet, verify dietary changes with your healthcare professional."
    
    return plan

@router.post("/swap", response_model=MealPlanItem)
async def swap(request: SwapMealRequest, uid: str = Depends(get_current_user_id)):
    users_col = get_users_collection()
    user = await users_col.find_one({"uid": uid}) if users_col else None
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    health_profile = user.get("health_profile", {})
    preferences = user.get("preferences", {})
    
    new_meal = swap_meal(
        current_meal_id=request.current_meal_id,
        meal_type=request.meal_type,
        target_calories=request.target_calories,
        health_vault=health_profile,
        preferences=preferences
    )
    
    if not new_meal:
        raise HTTPException(status_code=409, detail="No compatible alternative was found for this meal.")
        
    return new_meal
