import re
from fastapi import APIRouter, HTTPException, Query, status
from db import foods_collection

router = APIRouter()

MAX_FOOD_SEARCH_LENGTH = 200

# 1. Get all foods (This is what is currently returning 200 OK)
# foods.py - Refined Route
@router.get("/foods")
def get_foods(search: str = Query(None)): # Make search optional
    if search:
        search_clean = search.strip()
        if len(search_clean) > MAX_FOOD_SEARCH_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Search query exceeds maximum length of {MAX_FOOD_SEARCH_LENGTH} characters."
            )
        escaped = re.escape(search_clean)
        # Fuzzy search using regex
        results = list(foods_collection.find(
            {"name": {"$regex": escaped, "$options": "i"}}, 
            {"_id": 1, "name": 1, "brand": 1, "safety_score": 1, "ingredients": 1}
        ))
    else:
        # Return initial list (limited to 50 for performance)
        results = list(foods_collection.find({}, {}).limit(50))
    
    # Convert MongoDB ObjectId to string so JSON can handle it
    for item in results:
        item["_id"] = str(item["_id"])
    return results