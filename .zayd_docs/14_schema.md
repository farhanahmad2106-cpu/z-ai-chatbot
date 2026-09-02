# 14. Consolidated Data Schemas

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 14.1 TypeScript Interfaces (Frontend)

```typescript
// === Core Data Types ===

export interface FoodItem {
  _id: string;
  name: string;
  brand: string;
  safety_score: number;
  status: 'Safe' | 'Moderate' | 'Dangerous';
  ingredients: IngredientDetail[];
  warnings: string[];
  source?: 'ai_fallback' | 'database' | 'off_proxy';
}

export interface IngredientDetail {
  name: string;
  safety: 'Safe' | 'Moderate' | 'Dangerous';
  description: string;
}

export interface UserStats {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  last_updated: string;  // ISO date string "YYYY-MM-DD"
}

export interface UserStatsResponse {
  streak: number;
  stats: UserStats;
}

// === Analysis Types ===

export interface AnalysisResponse {
  name: string;
  safety_score: number;
  ingredients: IngredientDetail[];
  warnings: string[];
  has_ingredients?: boolean;
  error_message?: string;
}

export interface OCRAnalysisResponse {
  ingredients: string[];
  additives: string[];
  allergens: string[];
  estimated_macros: MacroEstimate;
}

export interface MacroEstimate {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// === User Profile Types ===

export interface HealthProfile {
  age: number | null;
  gender: string | null;
  height: number | null;
  weight: number | null;
}

export interface UserPreferences {
  diet: 'None' | 'Vegetarian' | 'Vegan' | 'Keto' | 'Halal' | 'Jain' | 'Gluten-Free';
  allergies: string[];
}

export interface UserSettings {
  notificationsEnabled: boolean;
  darkMode: boolean;
  language: string;
}

export interface UserProfileResponse {
  health_profile: HealthProfile;
  preferences: UserPreferences;
  settings: UserSettings;
}

// === Subscription Types ===

export interface SubscriptionStatus {
  plan: 'free' | 'starter' | 'pro' | 'elite';
  status: 'active' | 'pending' | 'cancelled' | 'expired';
  scans_used: number;
  scan_limit: number;
  reset_date: string;
}

// === Quote Engine Types ===

export interface QuoteRecord {
  [quoteId: string]: {
    count: number;
    lastShown: number;  // Unix timestamp ms
  };
}

// === Scan Mode ===

export type ScanMode = 'food' | 'ingredients';
```

---

## 14.2 Pydantic Models (Backend)

```python
from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Dict
from enum import Enum

# === Enums ===

class SafetyLevel(str, Enum):
    SAFE = "Safe"
    MODERATE = "Moderate"
    DANGEROUS = "Dangerous"

class RiskTier(str, Enum):
    HIGH = "high"
    MODERATE = "moderate"
    LOW = "low"

class SubscriptionPlan(str, Enum):
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"
    ELITE = "elite"

# === Request Models ===

class ScanRequest(BaseModel):
    image: str  # Base64-encoded image data

class TokenRequest(BaseModel):
    token: str  # Firebase ID token

class MealLogRequest(BaseModel):
    name: str
    ingredients: List[dict]

class TranslateRequest(BaseModel):
    text_items: List[str]
    target_language: str = "Hindi"

class ProfileUpdateRequest(BaseModel):
    health_profile: Optional[dict] = None
    preferences: Optional[dict] = None
    settings: Optional[dict] = None

class SubscriptionCreateRequest(BaseModel):
    plan: SubscriptionPlan

# === Response Models ===

class IngredientDetail(BaseModel):
    name: str
    safety: SafetyLevel
    description: str

class AnalysisResponse(BaseModel):
    name: str
    safety_score: int
    ingredients: List[IngredientDetail]
    warnings: List[str]
    has_ingredients: bool = True
    error_message: Optional[str] = None

class ParsedIngredients(BaseModel):
    """Schema for OCR-extracted and LLM-structured ingredient data."""
    ingredients: List[str]
    additives: List[str]
    allergens: List[str]
    estimated_macros: Dict[str, int]  # {calories, protein, carbs, fat}

class INSCodeEntry(BaseModel):
    """A normalized INS additive code with human-readable metadata."""
    code: str          # e.g., "INS 627"
    name: str          # e.g., "Disodium Guanylate"
    risk: RiskTier     # high / moderate / low
    description: str   # e.g., "Flavor enhancer, often paired with MSG"

class SafetyScoreResult(BaseModel):
    score: int                        # 0-100
    tier: str                         # "safe" | "moderate" | "dangerous"
    nutritional_penalties: List[str]  # ["Sugar 22g: -8 pts"]
    additive_penalties: List[str]     # ["INS 102 Tartrazine (high risk): -12 pts"]
    medical_conflicts: List[str]      # ["Diabetes vs Sugar 22g: -35 pts"]
    bonuses: List[str]                # ["Fiber 5g: +3 pts"]

class MacroEstimation(BaseModel):
    calories: int
    protein: int
    carbs: int
    fat: int
```

---

## 14.3 MongoDB Document Schemas

### `users` Collection
```json
{
  "_id": "ObjectId",
  "uid": "firebase_uid_string",
  "email": "user@email.com",
  "name": "Display Name",
  "picture": "https://photo.url/avatar.jpg",
  "last_login_date": "2026-09-03",
  "streak": 5,
  "stats": {
    "calories": 1200,
    "protein": 45,
    "carbs": 130,
    "fat": 40,
    "last_updated": "2026-09-03"
  },
  "health_profile": {
    "age": 25,
    "gender": "Male",
    "height": 175,
    "weight": 70
  },
  "preferences": {
    "diet": "None",
    "allergies": ["Peanuts", "Gluten"]
  },
  "settings": {
    "notificationsEnabled": true,
    "darkMode": true,
    "language": "English"
  },
  "tier": "free",
  "subscription": {
    "plan": "free",
    "razorpay_subscription_id": null,
    "razorpay_plan_id": null,
    "status": "active",
    "start_date": "2026-09-03",
    "end_date": null,
    "auto_renew": false
  },
  "usage": {
    "scans_used_this_month": 12,
    "scan_limit": 20,
    "reset_date": "2026-10-01"
  }
}
```

### `foods` Collection
```json
{
  "_id": "ObjectId",
  "name": "Paneer Butter Masala",
  "brand": "Homemade",
  "safety_score": 82,
  "status": "Safe",
  "ingredients": [
    {"name": "Paneer", "safety": "Safe", "description": "Fresh Indian cottage cheese"},
    {"name": "Butter", "safety": "Moderate", "description": "High in saturated fats"},
    {"name": "Tomato Puree", "safety": "Safe", "description": "Natural base sauce"}
  ],
  "warnings": ["Contains dairy"],
  "source": "ai_fallback"
}
```

---

## 14.4 Convex Schemas (Z-AI Chatbot)

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    title: v.string(),
    userId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    modelId: v.string(),
    isArchived: v.boolean(),
  }).index("by_user", ["userId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    createdAt: v.number(),
    tokenCount: v.optional(v.number()),
    modelId: v.optional(v.string()),
    latencyMs: v.optional(v.number()),
  }).index("by_conversation", ["conversationId"]),
});
```
