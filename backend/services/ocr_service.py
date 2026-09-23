import os
import sys
import json
import base64
import asyncio
import httpx
from typing import Dict, Any, Optional, List

from services.image_preprocessor import preprocess_for_ocr

try:
    from google import genai  # type: ignore
    from google.genai import types  # type: ignore
except ImportError:
    try:
        import google.genai as genai  # type: ignore
        from google.genai import types  # type: ignore
    except ImportError:
        genai = None  # type: ignore
        types = None  # type: ignore

from schemas.scan import OCRAnalysisResponse
from fastapi import HTTPException

# Configure standard prompts
SYSTEM_PROMPT = """You are an expert food technologist, pharmacist, and data extraction system.
CRITICAL RULE: First, determine if the provided image contains food packaging, a nutrition label, a medicine blister pack/bottle, or an ingredient list. 
If the image does NOT contain any text related to food/medicine ingredients or nutrition (e.g., it is a picture of a human, scenery, or random objects), you MUST return empty arrays for ingredients, additives, and allergens, and 0 for all nutrition fields. Do NOT hallucinate ingredients or extract random text as ingredients.

CRITICAL RULE 2: You MUST ONLY extract actual consumable ingredients (food ingredients, active ingredients, inactive ingredients, additives, excipients). You MUST NEVER include visual descriptions of the image, the packaging, or the person holding it as ingredients. Do NOT include phrases like "The Image Shows A Hand", "Blister Pack", "Silver Foil", "Rectangular Shape", "QR Code", "Warning Label", etc. in the parsed_ingredients or detected_ins_additives arrays. Only include the actual chemical or food names listed on the label.

If it IS a valid food or medicine label:
The image may contain small Indian consumer-product sachets, medicine blister packs, mouth fresheners, candy packets, spice/masala pouches, or other compact packaging. Ingredients and additive information may be printed in very small fonts on reflective, glossy, wrinkled, curved, or partially occluded surfaces.

Carefully inspect all available text. When characters are partially obscured, use surrounding visible characters and context to reconstruct text only when the reconstruction is strongly supported by the image. Identify additive/INS codes such as INS 954, INS 950, INS 150d, and INS 330 when visibly present. Preserve exact additive codes without normalizing them.

Do not hallucinate missing ingredients, quantities, additive numbers, product claims, or nutritional information. If text cannot be reliably read, mark it as uncertain or unreadable rather than inventing it.
Preserve the distinction between text that is clearly visible and text that has been inferred from context.

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
    # Preprocess image for OCR (contrast/sharpening/orientation)
    if mime_type in ["image/jpeg", "image/png", "image/webp"]:
        image_bytes = preprocess_for_ocr(image_bytes)
        # Force mime_type to JPEG since preprocessor outputs JPEG
        mime_type = "image/jpeg"
        
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

NVIDIA_VISION_TIMEOUT = httpx.Timeout(timeout=60.0, connect=10.0)
NON_RETRYABLE_STATUS = {400, 401, 403, 404, 422}

def _get_nvidia_keys() -> List[str]:
    """Retrieves unique, sanitized NVIDIA NIM API keys from main module or environment."""
    main_mod = sys.modules.get("backend.main") or sys.modules.get("main") or sys.modules.get("__main__")
    if main_mod and hasattr(main_mod, "get_nvidia_keys"):
        try:
            raw_keys = main_mod.get_nvidia_keys()
        except Exception:
            raw_keys = []
    else:
        raw_keys = []
        for key_name in ["NVIDIA_API_KEY", "NVIDIA_API_KEY_1", "NVIDIA_API_KEY_2", "NVIDIA_API_KEY_3", "NVIDIA_API_KEY_4", "NVIDIA_API_KEY_5"]:
            val = os.getenv(key_name)
            if val:
                raw_keys.append(val)

    unique_keys: List[str] = []
    for k in raw_keys:
        if k and isinstance(k, str):
            clean_k = k.strip()
            if clean_k and clean_k not in unique_keys:
                unique_keys.append(clean_k)
    return unique_keys

async def _call_nvidia_nim(base64_image: str, mime_type: str) -> str:
    """Secondary: NVIDIA NIM API with 60s timeout and bounded key rotation on HTTP 429."""
    keys = _get_nvidia_keys()
    if not keys:
        raise ValueError("NVIDIA_API_KEY missing or empty")

    url = "https://integrate.api.nvidia.com/v1/chat/completions"
    payload = {
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
    }

    last_error: Optional[Exception] = None

    for idx, key in enumerate(keys):
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }
        try:
            async with httpx.AsyncClient(timeout=NVIDIA_VISION_TIMEOUT) as client:
                response = await client.post(url, headers=headers, json=payload)

                if response.status_code == 200:
                    data = response.json()
                    return data["choices"][0]["message"]["content"]

                if response.status_code == 429:
                    # Rate-limited: check Retry-After boundedly, then rotate to next key
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        try:
                            sleep_duration = min(float(retry_after), 5.0)
                            if sleep_duration > 0:
                                await asyncio.sleep(sleep_duration)
                        except (ValueError, TypeError):
                            pass

                    print(f"[NVIDIA Vision] HTTP 429 rate limit on key index {idx+1}/{len(keys)}. Rotating to next key.")
                    last_error = RuntimeError(f"NVIDIA key {idx+1} rate-limited (HTTP 429)")
                    continue

                if response.status_code in NON_RETRYABLE_STATUS:
                    # Permanent client/auth error: do NOT rotate credentials blindly
                    print(f"[NVIDIA Vision] Permanent HTTP {response.status_code} error on key index {idx+1}. Failing immediately.")
                    raise RuntimeError(f"NVIDIA API returned non-retryable status {response.status_code}")

                # 5xx server errors: log safely and try next key
                print(f"[NVIDIA Vision] Server error HTTP {response.status_code} on key index {idx+1}. Attempting next available key.")
                last_error = RuntimeError(f"NVIDIA API server error {response.status_code}")

        except (httpx.TimeoutException, httpx.TransportError) as net_err:
            print(f"[NVIDIA Vision] Network/Timeout error on key index {idx+1}: {type(net_err).__name__}")
            last_error = net_err
            continue

    raise RuntimeError(f"All {len(keys)} NVIDIA API keys exhausted or failed: {last_error}")


async def _call_gemini(image_bytes: bytes, mime_type: str) -> str:
    """Tertiary: Gemini Cloud API (SDK + REST Fallback)"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY missing")
        
    # Method 1: Try google.genai SDK if available
    if genai is not None and types is not None:
        try:
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
            if resp and resp.text:
                return resp.text
        except Exception as sdk_err:
            print(f"[OCR Service] Gemini SDK call failed, trying REST fallback: {sdk_err}")

    # Method 2: High-reliability direct REST API fallback (Zero external SDK requirement)
    base64_data = base64.b64encode(image_bytes).decode("utf-8")
    for model_name in ["gemini-2.5-flash", "gemini-1.5-flash"]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64_data
                            }
                        },
                        {
                            "text": SYSTEM_PROMPT
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "response_mime_type": "application/json"
            }
        }
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            return parts[0]["text"]
                else:
                    print(f"[OCR Service] Gemini REST ({model_name}) HTTP {resp.status_code}: {resp.text[:150]}")
        except Exception as rest_err:
            print(f"[OCR Service] Gemini REST ({model_name}) error: {rest_err}")

    raise RuntimeError("Both Gemini SDK and REST fallback failed.")

def _parse_llm_json(raw_text: str) -> OCRAnalysisResponse:
    """
    Robust bounded substring JSON parser with schema validation.
    Extracts the first outermost JSON object {...} across conversational prose,
    markdown code fences, and whitespace variations. Never uses eval().
    """
    if not raw_text or not isinstance(raw_text, str):
        raise ValueError("Invalid or empty raw text for JSON parsing")

    start = raw_text.find("{")
    end = raw_text.rfind("}")

    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in response")

    candidate = raw_text[start : end + 1]

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError as jde:
        raise ValueError(f"Failed to decode JSON object: {jde}")

    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON root to be a dictionary, got {type(data).__name__}")

    # Reconcile estimated_macros and nutrition_per_100g
    if not data.get("estimated_macros") and data.get("nutrition_per_100g"):
        data["estimated_macros"] = data["nutrition_per_100g"]
    elif not data.get("nutrition_per_100g") and data.get("estimated_macros"):
        data["nutrition_per_100g"] = data["estimated_macros"]

    try:
        return OCRAnalysisResponse(**data)
    except Exception as ve:
        raise ValueError(f"JSON data failed schema validation: {ve}")

