# 3. Autonomous Agent Development Rules

> **Version:** 1.0 | **Date:** 2026-09-03
> These rules are immutable constraints for all human and AI agents working on Z-SeHealth.

---

## Rule 1 — TypeScript Strict Mode (Frontend)
- `strict: true` in `tsconfig.json`. No `any` types without an explicit `// @ts-expect-error` comment explaining why.
- Every API response must be typed with a matching interface (e.g., `AnalysisResponse`, `UserStats`).
- All component props must use explicit interface definitions, never inline object types.

## Rule 2 — Pydantic v2 Validation (Backend)
- Every FastAPI request body MUST use a `BaseModel` subclass, never raw `dict`.
- Response models should use `model_config = ConfigDict(strict=True)` where possible.
- AI-generated JSON MUST pass through `clean_json_response()` then validate against the Pydantic model before database insertion.

## Rule 3 — Zero Screen-Blocking Loaders
- The UI must NEVER show a blank screen or full-page spinner.
- Pattern: Render cached data from `localStorage` synchronously on mount → show subtle background sync indicator → replace with fresh data when API responds.
- The `Search.tsx` component must always render `DEFAULT_FALLBACK_FOODS` (18+ items) if both cache and API are empty.

## Rule 4 — Mandatory SWR Hydration Keys
| Key | Component | Data |
|---|---|---|
| `z_sehealth_cached_search_foods` | Search.tsx | Last food search results |
| `z_sehealth_cached_user_stats` | UserStatsContext.tsx | Daily macro stats + streak |
| `z_sehealth_quote_history` | LandingLoadingOverlay.tsx | Quote cooldown records |

## Rule 5 — Health Vault Encryption
- Medical conditions (Diabetes, Hypertension, etc.) and allergy lists stored in MongoDB `users.health_profile` MUST be encrypted at rest using AES-256-GCM.
- Encryption key sourced from `HEALTH_VAULT_KEY` environment variable, never hardcoded.
- Decryption occurs in-memory on the backend only; decrypted data never persists in logs or cache.

## Rule 6 — AI Failover Chain (Non-Negotiable)
```
Every AI call → try/except → return None on failure → fallthrough to next tier
Never: Single point of failure. Never: Unhandled AI exception reaching the client.
Always: Explicit timeout (Vision: 60s, Text: 30s).
Always: Hardcoded fallback JSON as absolute last resort.
```

## Rule 7 — Privacy & Data Isolation
- No PII (name, email, medical conditions) may be included in prompts sent to third-party LLMs.
- Only raw extracted ingredient text (anonymous) is forwarded to NVIDIA/Gemini.
- User context for scoring is applied locally in the Safety Score Engine, never transmitted.

## Rule 8 — Git Workflow
- Branch: `main` (single developer workflow).
- Commit format: `type: description` where type ∈ {`feat`, `fix`, `style`, `refactor`, `chore`, `docs`}.
- Pre-commit gates: `npm run build` (frontend), `python -m py_compile backend/main.py` (backend).
- Never commit broken builds, `.env` files, or `firebase-admin-key.json`.

## Rule 9 — Component Architecture
- One default export per component file.
- Components > 300 lines must be decomposed.
- All modals: `fixed inset-0 bg-black/90 backdrop-blur-xl z-50`.
- All buttons: `active:scale-95 transition-all cursor-pointer`.
- No `document.getElementById()` — use `useRef`.

## Rule 10 — Responsive Design
- Mobile-first: base styles for 375px, `md:` for 768px, `lg:` for 1440px.
- Food grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.
- Bottom padding on scrollable pages: `pb-32` minimum.
