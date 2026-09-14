import os
import json
import base64
import asyncio
import httpx
from typing import Dict, Any
from google import genai
from google.genai import types
from schemas.scan import OCRAnalysisResponse
from fastapi import HTTPException

# Configure standard prompts
SYSTEM_PROMPT = """You are an expert food technologist and data extraction system.
CRITICAL RULE: First, determine if the provided image contains food packaging, a nutrition label, or an ingredient list. 
If the image does NOT contain any text related to food ingredients or nutrition (e.g., it is a picture of a human, scenery, or random objects), you MUST return empty arrays for ingredients, additives, and allergens, and 0 for all nutrition fields. Do NOT hallucinate ingredients or extract random text as food ingredients.

If it IS a valid food label:
Extract all ingredients strictly from the text, identify INS/E-number additives, and flag common allergens from the OCR text. Only extract what is explicitly written on the label.

Output MUST be valid JSON matching the OCRAnalysisResponse schema exactly:
{
  "product_name": "string",
  "brand": "string",
  "raw_ocr_text": "string (full OCR text read)",
  "parsed_ingredients": ["ing1", "ing2", ...],
  "detected_ins_additives": [{"code": "INS 627", "name": "Disodium guanylate", "risk": "low|moderate|high"}, ...],
  "flagged_allergens": ["allergen1", ...],
  "nutrition_per_100g": {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "sodium": 0.0, "sugar": 0.0},
  "estimated_macros": {"calories": 0.0, "protein": 0.0, "carbs": 0.0, "fat": 0.0, "sodium": 0.0, "sugar": 0.0},
  "requires_user_review": true
}
"""

async def extract_and_analyze(image_bytes: bytes, mime_type: str) -> OCRAnalysisResponse:
    """
    Multi-Tier Vision/OCR Extraction Routing:
    1. Primary: Sarvam AI Vision (or Local Edge Model)
    2. Secondary: NVIDIA NIM Pool
    3. Tertiary: Google Gemini Cloud
    """
    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    
    # Tier 1: Try Sarvam AI / Edge (Simulated / Placeholder for actual client call)
    try:
        res = await _call_sarvam_vision(base64_image, mime_type)
        if res: return _parse_llm_json(res)
    except Exception as e:
        print(f"Tier 1 Sarvam/Edge failed: {e}")

    # Tier 2: Try Google Gemini Cloud API (Primary active cloud vision model)
    try:
        res = await _call_gemini(image_bytes, mime_type)
        if res: return _parse_llm_json(res)
    except Exception as e:
        print(f"Tier 2 Gemini failed: {e}")

    # Tier 3: Try NVIDIA NIM Pool
    try:
        res = await _call_nvidia_nim(base64_image, mime_type)
        if res: return _parse_llm_json(res)
    except Exception as e:
        print(f"Tier 3 NVIDIA NIM failed: {e}")


    raise HTTPException(status_code=500, detail="All OCR parsing tiers failed. Please try again.")

async def _call_sarvam_vision(base64_image: str, mime_type: str) -> str:
    """Primary: Sarvam AI Vision"""
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise ValueError("SARVAM_API_KEY missing")
    
    # Example integration code for Sarvam vision API
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.sarvam.ai/v1/vision/analyze",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "image": f"data:{mime_type};base64,{base64_image}",
                "prompt": SYSTEM_PROMPT
            },
            timeout=10.0
        )
        response.raise_for_status()
        return response.json().get("text", "")

async def _call_nvidia_nim(base64_image: str, mime_type: str) -> str:
    """Secondary: NVIDIA NIM API"""
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise ValueError("NVIDIA_API_KEY missing")
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://integrate.api.nvidia.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "nvidia/neva-22b",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": SYSTEM_PROMPT},
                            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_image}"}}
                        ]
                    }
                ],
                "max_tokens": 1024
            },
            timeout=3.0
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]


async def _call_gemini(image_bytes: bytes, mime_type: str) -> str:
    """Tertiary: Gemini Cloud API via google-genai Client"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY missing")
        
    client = genai.Client(api_key=api_key)
    part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
    
    loop = asyncio.get_running_loop()
    def _run_gen():
        return client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[SYSTEM_PROMPT, part],
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
    resp = await loop.run_in_executor(None, _run_gen)
    return resp.text or ""

def _parse_llm_json(raw_text: str) -> OCRAnalysisResponse:
    """Cleans up markdown ticks and parses the LLM output into the Pydantic schema."""
    cleaned = raw_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
        
    try:
        data = json.loads(cleaned.strip())
        if not data.get("estimated_macros") and data.get("nutrition_per_100g"):
            data["estimated_macros"] = data["nutrition_per_100g"]
        elif not data.get("nutrition_per_100g") and data.get("estimated_macros"):
            data["nutrition_per_100g"] = data["estimated_macros"]
        return OCRAnalysisResponse(**data)
    except Exception as e:
        raise ValueError(f"Failed to parse LLM JSON response: {e}")

