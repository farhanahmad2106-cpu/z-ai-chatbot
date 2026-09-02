from pydantic import BaseModel
from typing import List, Dict

class ParsedIngredients(BaseModel):
    ingredients: List[str]
    additives: List[str]
    allergens: List[str]
    estimated_macros: Dict[str, float]
