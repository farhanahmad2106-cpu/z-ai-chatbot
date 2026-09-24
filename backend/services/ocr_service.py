import os
import sys
import json
import base64
import asyncio
import time
import logging
import re
import httpx
from typing import Dict, Any, Optional, List

logger = logging.getLogger("ocr_service")

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

OCR_GLOBAL_TIMEOUT_SECONDS = 60.0
NVIDIA_VISION_TIMEOUT = httpx.Timeout(timeout=60.0, connect=10.0)
NON_RETRYABLE_STATUS = {400, 401, 403, 404, 422}

async def extract_and_analyze(image_bytes: bytes, mime_type: str) -> OCRAnalysisResponse:
    """
    Multi-Tier Vision/OCR Extraction Routing with Bounded Global Operation Deadline:
    1. Primary: Sarvam AI Vision (or Local Edge Model)
    2. Secondary: NVIDIA NIM Pool (Multi-key rotation, 429 backoff, fast fail on 401/403)
    3. Tertiary: Google Gemini Cloud API (Fallback when NVIDIA exhausted or fails)
    Total end-to-end operation is strictly bounded by OCR_GLOBAL_TIMEOUT_SECONDS (60s).
    """
    # Preprocess image for OCR (contrast/sharpening/orientation)
    if mime_type in ["image/jpeg", "image/png", "image/webp"]:
        image_bytes = preprocess_for_ocr(image_bytes)
        # Force mime_type to JPEG since preprocessor outputs JPEG
        mime_type = "image/jpeg"
        
    base64_image = base64.b64encode(image_bytes).decode("utf-8")
    deadline = time.monotonic() + OCR_GLOBAL_TIMEOUT_SECONDS
    op_start = time.monotonic()
    
    # Tier 1: Try Sarvam AI / Edge (if configured)
    try:
        if time.monotonic() < deadline:
            res = await _call_sarvam_vision(base64_image, mime_type)
            if res:
                logger.info("[OCR] Tier 1 Sarvam succeeded in %.2fs", time.monotonic() - op_start)
                return _parse_llm_json(res)
    except Exception as e:
        logger.warning("[OCR] Tier 1 Sarvam/Edge unavailable or failed: %s", str(e))

    # Tier 2: Try NVIDIA NIM Pool (Primary food image analysis tier)
    try:
        if time.monotonic() < deadline:
            res = await _call_nvidia_nim(base64_image, mime_type, deadline=deadline)
            if res:
                logger.info("[OCR] Tier 2 NVIDIA NIM succeeded in %.2fs", time.monotonic() - op_start)
                return _parse_llm_json(res)
        else:
            logger.warning("[OCR] Global deadline expired before Tier 2 NVIDIA NIM attempt")
    except Exception as e:
        logger.warning("[OCR] Tier 2 NVIDIA NIM failed: %s. Initiating Tier 3 Gemini fallback.", str(e))

    # Tier 3: Try Google Gemini Cloud API (Fallback tier)
    try:
        if time.monotonic() < deadline:
            res = await _call_gemini(image_bytes, mime_type, deadline=deadline)
            if res:
                logger.info("[OCR] Tier 3 Gemini fallback succeeded in %.2fs", time.monotonic() - op_start)
                return _parse_llm_json(res)
        else:
            logger.warning("[OCR] Global deadline expired before Tier 3 Gemini fallback")
    except Exception as e:
        logger.error("[OCR] Tier 3 Gemini fallback failed: %s", str(e))

    raise HTTPException(status_code=500, detail="All OCR parsing tiers failed. Please try again.")

async def _call_sarvam_vision(base64_image: str, mime_type: str) -> str:
    """Primary: Sarvam AI Vision"""
    api_key = os.getenv("SARVAM_API_KEY")
    if not api_key:
        raise ValueError("SARVAM_API_KEY missing")

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

async def _call_nvidia_nim(base64_image: str, mime_type: str, deadline: Optional[float] = None) -> str:
    """
    Secondary: NVIDIA NIM API with bounded key rotation on HTTP 429,
    immediate failover on 401/403/non-retryable client errors, and monotonic deadline budgeting.
    Credentials are never logged or exposed.
    """
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
        now = time.monotonic()
        if deadline is not None and now >= deadline:
            logger.warning("[NVIDIA Vision] OCR global deadline exceeded before key index %d", idx + 1)
            raise TimeoutError("NVIDIA OCR global deadline exceeded")

        remaining = (deadline - now) if deadline is not None else 60.0
        attempt_timeout = httpx.Timeout(
            timeout=min(60.0, max(1.0, remaining)),
            connect=min(10.0, max(1.0, remaining))
        )

        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }
        attempt_start = time.monotonic()

        try:
            async with httpx.AsyncClient(timeout=attempt_timeout) as client:
                response = await client.post(url, headers=headers, json=payload)
                elapsed = time.monotonic() - attempt_start
                status_class = f"{response.status_code // 100}xx"

                logger.info(
                    "[OCR] provider=nvidia attempt_count=%d key_index=%d status_class=%s duration=%.2fs fallback_used=false",
                    idx + 1, idx + 1, status_class, elapsed
                )

                if response.status_code == 200:
                    data = response.json()
                    return data["choices"][0]["message"]["content"]

                if response.status_code == 429:
                    # Rate-limited: parse Retry-After capped at 5.0 seconds
                    retry_after = response.headers.get("Retry-After")
                    sleep_duration = 0.0
                    if retry_after:
                        try:
                            sleep_duration = min(float(retry_after), 5.0)
                        except (ValueError, TypeError):
                            sleep_duration = 1.0
                    else:
                        sleep_duration = 1.0

                    if deadline is not None and (time.monotonic() + sleep_duration >= deadline):
                        logger.warning(
                            "[NVIDIA Vision] Insufficient budget left (sleep=%.1fs) before deadline. Skipping sleep and rotating key.",
                            sleep_duration
                        )
                    elif sleep_duration > 0:
                        await asyncio.sleep(sleep_duration)

                    logger.warning("[NVIDIA Vision] HTTP 429 rate limit on key index %d/%d. Rotating to next key.", idx + 1, len(keys))
                    last_error = RuntimeError(f"NVIDIA key index {idx+1} rate-limited (HTTP 429)")
                    continue

                if response.status_code in NON_RETRYABLE_STATUS:
                    # Permanent client/auth error: do NOT rotate credentials blindly; fail fast to trigger fallback
                    logger.error(
                        "[NVIDIA Vision] Permanent HTTP %d client error on key index %d. Failing immediately to trigger fallback.",
                        response.status_code, idx + 1
                    )
                    raise RuntimeError(f"NVIDIA API returned non-retryable status {response.status_code}")

                # 5xx server errors: log safely and try next key
                logger.warning("[NVIDIA Vision] Server error HTTP %d on key index %d. Attempting next available key.", response.status_code, idx + 1)
                last_error = RuntimeError(f"NVIDIA API server error {response.status_code}")

        except httpx.TimeoutException as net_err:
            elapsed = time.monotonic() - attempt_start
            logger.warning("[NVIDIA Vision] Request timeout after %.2fs on key index %d", elapsed, idx + 1)
            last_error = net_err
            continue
        except httpx.TransportError as net_err:
            elapsed = time.monotonic() - attempt_start
            logger.warning("[NVIDIA Vision] Transport error on key index %d: %s", idx + 1, type(net_err).__name__)
            last_error = net_err
            continue

    raise RuntimeError(f"All {len(keys)} NVIDIA API keys exhausted or failed: {last_error}")


async def _call_gemini(image_bytes: bytes, mime_type: str, deadline: Optional[float] = None) -> str:
    """
    Tertiary: Gemini Cloud API (SDK + REST Fallback) with deadline bounding.
    Credentials and auth headers are never logged or exposed.
    """
    if deadline is not None and time.monotonic() >= deadline:
        raise TimeoutError("OCR operation deadline exceeded before Gemini fallback")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY missing")

    remaining = (deadline - time.monotonic()) if deadline is not None else 30.0
    gemini_timeout = min(30.0, max(1.0, remaining))

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
            resp = await asyncio.wait_for(loop.run_in_executor(None, _run_gen), timeout=gemini_timeout)
            if resp and resp.text:
                return resp.text
        except Exception as sdk_err:
            logger.warning("[OCR Service] Gemini SDK call failed, trying REST fallback: %s", str(sdk_err))

    # Method 2: High-reliability direct REST API fallback (Zero external SDK requirement)
    base64_data = base64.b64encode(image_bytes).decode("utf-8")
    for model_name in ["gemini-2.5-flash", "gemini-1.5-flash"]:
        if deadline is not None and time.monotonic() >= deadline:
            break

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
            cur_remaining = (deadline - time.monotonic()) if deadline is not None else 30.0
            call_timeout = min(gemini_timeout, max(1.0, cur_remaining))
            async with httpx.AsyncClient(timeout=call_timeout) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            return parts[0]["text"]
                else:
                    logger.warning("[OCR Service] Gemini REST (%s) HTTP %d returned error", model_name, resp.status_code)
        except Exception as rest_err:
            logger.warning("[OCR Service] Gemini REST (%s) error: %s", model_name, str(rest_err))

    raise RuntimeError("Both Gemini SDK and REST fallback failed.")


def _extract_outermost_json(raw_text: str) -> str:
    """
    Extracts the outermost JSON object {...} substring from raw model output.
    Handles markdown fences, conversational preambles, trailing text, nested braces,
    and braces inside quoted/escaped strings using a deterministic tokenizer/scanner.
    Never uses eval().
    """
    text = raw_text.strip()

    # 1. Fast path: text is already pure JSON
    if text.startswith("{") and text.endswith("}"):
        try:
            json.loads(text)
            return text
        except json.JSONDecodeError:
            pass

    # 2. Markdown code fence extraction: ```json ... ``` or ``` ... ```
    fence_pattern = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)
    match = fence_pattern.search(text)
    if match:
        candidate = match.group(1).strip()
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    # 3. State-machine scanner: find first '{', track string quotes & escape sequences
    start_idx = text.find("{")
    if start_idx == -1:
        raise ValueError("No opening brace '{' found in response")

    brace_depth = 0
    in_string = False
    escape = False
    end_idx = -1

    for i in range(start_idx, len(text)):
        ch = text[i]

        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
                if brace_depth == 0:
                    end_idx = i
                    break

    if end_idx != -1 and brace_depth == 0:
        candidate = text[start_idx : end_idx + 1]
        return candidate

    # Fallback to last '}' if state machine did not balance
    last_brace = text.rfind("}")
    if last_brace > start_idx:
        return text[start_idx : last_brace + 1]

    raise ValueError("No balanced JSON object found in response")


def _parse_llm_json(raw_text: str) -> OCRAnalysisResponse:
    """
    Robust bounded substring JSON parser with schema validation.
    Extracts the outermost JSON object {...} across conversational prose,
    markdown code fences, nested objects, and whitespace variations. Never uses eval().
    """
    if not raw_text or not isinstance(raw_text, str):
        raise ValueError("Invalid or empty raw text for JSON parsing")

    candidate = _extract_outermost_json(raw_text)

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


