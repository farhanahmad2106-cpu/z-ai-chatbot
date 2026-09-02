# 7. Persistent Agent Knowledge Base (Memory / RAG)

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 7.1 NVIDIA API Key Pool Management

### Key Inventory
| Env Variable | Status | Rate Limit | Notes |
|---|---|---|---|
| `NVIDIA_API_KEY` | Active | ~100 req/min | Legacy primary key |
| `NVIDIA_API_KEY_1` | Active | ~100 req/min | Pool key 1 |
| `NVIDIA_API_KEY_2` | Active | ~100 req/min | Pool key 2 |
| `NVIDIA_API_KEY_3` | Active | ~100 req/min | Pool key 3 |
| `NVIDIA_API_KEY_4` | Active | ~100 req/min | Pool key 4 |
| `NVIDIA_API_KEY_5` | Active | ~100 req/min | Pool key 5 |

### Rotation Strategy
```python
def get_nvidia_keys() -> List[str]:
    """Deduplicates and returns all configured NVIDIA keys."""
    keys = []
    for key_name in ["NVIDIA_API_KEY", "NVIDIA_API_KEY_1", ..., "NVIDIA_API_KEY_5"]:
        val = os.getenv(key_name)
        if val and val not in keys:
            keys.append(val)
    return keys

# Usage: iterate keys, break on first success, catch 429 to continue
```

### 429 Handling Pattern
- On HTTP 429 from NVIDIA: log the key index, immediately try next key.
- If all 5 keys return 429: fall through to Gemini tier.
- Never sleep/retry on 429 — latency budget does not permit blocking waits.

---

## 7.2 LocalStorage Cache Key Registry

| Key | Component | TTL | Format |
|---|---|---|---|
| `z_sehealth_cached_search_foods` | Search.tsx | Until next successful API response | `JSON.stringify(FoodItem[])` |
| `z_sehealth_cached_user_stats` | UserStatsContext.tsx | Until next successful API response | `JSON.stringify({streak, stats})` |
| `z_sehealth_quote_history` | LandingLoadingOverlay.tsx | Permanent (cooldown tracking) | `JSON.stringify({[quoteId]: {count, lastShown}})` |
| `unauthenticatedScanCount` | Scan.tsx | Permanent (reset on login) | `string` (integer as string) |
| `recentlyViewedFoods` | Search.tsx | Permanent | `JSON.stringify(FoodItem[])` (max 15) |

---

## 7.3 Known Edge Cases & Resolutions

### EC-01: Tesseract Windows Binary Path
**Problem:** `pytesseract` on Windows cannot find `tesseract.exe` without explicit path configuration.
**Resolution:** In `ocr_engine.py`, conditionally set:
```python
import os
if os.name == 'nt':
    import pytesseract
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
```
**Impact:** Must NOT be applied on Linux/Render deployments (use `apt-get install tesseract-ocr`).

### EC-02: Windows Unicode Console Crash
**Problem:** `print()` statements containing non-ASCII characters (Hindi, Tamil) crash on Windows due to `charmap` codec limitation.
**Resolution:** Wrap all debug prints with `ascii()`: `print(f"Response: {ascii(content[:200])}...")`
**Files Affected:** All `try_ollama_*` and `try_nvidia_*` functions in `main.py`.

### EC-03: Firebase Auth Clock Skew
**Problem:** `verify_id_token()` rejects valid tokens when server clock is > 5 minutes out of sync.
**Resolution:** Ensure NTP sync on deployment servers. On local dev, accept 30-second leeway via Firebase Admin SDK configuration.

### EC-04: React 18 StrictMode Double-Mount
**Problem:** `useEffect` fires twice in development, causing SWR cache to double-fetch.
**Resolution:** Cache write logic must be idempotent — always overwrite, never append. Guard with `useRef` flag:
```tsx
const hasRun = useRef(false);
useEffect(() => {
  if (hasRun.current) return;
  hasRun.current = true;
  // ... fetch logic
}, []);
```

### EC-05: Gemini Client Module-Level Crash
**Problem:** Instantiating `genai.Client()` at module level when `GEMINI_API_KEY` is missing throws `ValueError`, crashing the entire FastAPI startup.
**Resolution:** Guard initialization: `client = None; if GEMINI_API_KEY: client = genai.Client(...)`. All downstream functions check `if not client: return None`.

---

## 7.4 Token Optimization Strategies

### LLM Prompt Templates (Minimize Token Usage)
- Search fallback: ~120 tokens input → ~200 tokens output.
- Scan vision: ~50 tokens prompt + image → ~300 tokens output.
- OCR structuring: ~150 tokens (raw text + schema instruction) → ~200 tokens output.
- Translation: ~80 tokens (list + language) → ~80 tokens output.

### Cost Minimization Hierarchy
1. **Ollama (Free)**: Zero cost, unlimited local usage. Primary for development.
2. **NVIDIA NIM (Free Tier)**: 1000 API calls/day free across keys. Secondary.
3. **Gemini Flash (Free Tier)**: 15 req/min free. Tertiary fallback only.
4. **Sarvam AI (Paid)**: Reserved strictly for Elite tier subscribers (₹998/month).
