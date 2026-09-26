# Z-SeHealth — RULES.md
> **Last Updated:** 2026-07-30 | This file governs all development decisions for the Z-SeHealth project. Every agent and developer must read this before making any changes.

---

## 1. 📦 Tech Stack (Source of Truth)

### Frontend
| Concern | Technology | Notes |
|---|---|---|
| Framework | **React 19 + Vite** | Do NOT switch to Next.js unless explicitly approved |
| Language | **TypeScript (TSX)** | Strict mode — never use `any` if avoidable |
| Styling | **Tailwind CSS v4** | Via `@import "tailwindcss"` in `index.css`. No inline style tags |
| Icons | **Lucide React** | Only source for icons. Do NOT add FontAwesome or Heroicons |
| HTTP Client | **Fetch API** (native) | No Axios. Use native fetch for all API calls |
| State | **React Context API** | No Redux, no Zustand unless explicitly approved |
| Fonts | **Manrope** (body) + **Outfit** (headings) | Loaded via Google Fonts. Do NOT add other fonts |
| Auth | **Firebase Auth** (client) | via `firebase.ts` and `AuthContext.tsx` |
| Routing | **Tab-based state** in `App.tsx` | No React Router. Navigation via `setActiveTab()` |

### Backend
| Concern | Technology | Notes |
|---|---|---|
| Framework | **FastAPI** | All routes in `main.py` or under `backend/routes/` |
| Language | **Python 3.11+** | Use async/await for all DB and HTTP calls |
| Database | **MongoDB Atlas** via `motor` | Async motor driver. Collections: `foods`, `users` |
| Auth (Server) | **Firebase Admin SDK** | Token verification via `firebase_admin.auth.verify_id_token()` |
| HTTP Client | **httpx** | Async HTTP. Use `async with httpx.AsyncClient(timeout=X)` |
| AI - Primary | **Gemini 2.0 Flash** (`google-genai`) | For fallback/free tier |
| AI - Secondary | **NVIDIA API** (LLaMA models) | Multi-key rotation via `.env` |
| AI - Tertiary | **Ollama** (local) | Only used as local dev primary, not production priority |
| AI - Elite | **Sarvam AI** (planned) | Reserved for ₹998 Elite tier in Freemium model |
| Config | **python-dotenv** | All secrets from `.env`. Never hardcode |
| Validation | **Pydantic v2** | Use `BaseModel` for all request bodies |

---

## 2. 🚫 What to AVOID

### Frontend
- ❌ Do NOT use `any` type in TypeScript without a comment explaining why
- ❌ Do NOT use inline `style={{}}` attributes — use Tailwind classes only
- ❌ Do NOT use `alert()` or `confirm()` in new code — use toast/modal UI components
- ❌ Do NOT import from external CSS libraries (Bootstrap, Material UI, Chakra UI, etc.)
- ❌ Do NOT hardcode the API URL — always import `API_BASE` from `../config`
- ❌ Do NOT add `console.log()` in production code paths — only `console.error()` for real errors
- ❌ Do NOT create React Router routes — use tab-based navigation via `setActiveTab()` in `App.tsx`
- ❌ Do NOT duplicate `API_BASE` — centralized in `frontend/src/config.ts`
- ❌ Do NOT add new Google Fonts — only Manrope and Outfit are used

### Backend
- ❌ Do NOT use the synchronous `requests` library — always use async `httpx`
- ❌ Do NOT store secrets or API keys directly in code — always use `os.getenv()`
- ❌ Do NOT use synchronous PyMongo blocking calls — use async `motor` driver
- ❌ Do NOT skip Firebase token verification on any protected route
- ❌ Do NOT return raw Python exceptions to the client — wrap in `HTTPException`
- ❌ Do NOT call AI APIs without an explicit timeout
- ❌ Do NOT skip the AI fallback chain — every AI call must have a fallback
- ❌ Do NOT insert untrusted AI output directly into the DB without structure validation

---

## 3. 🤖 AI Model Boundaries & Fallback Chain

### Verified Production AI Vision / OCR Fallback Order (`backend/services/ocr_service.py`)
```
1. Sarvam AI Vision (or local edge model)
2. NVIDIA NIM 5-Key Pool — 60s SLA (multi-key rotation across NVIDIA_API_KEY[_1..5], 429 backoff, fast fail on 401/403)
3. Google Gemini Flash fallback (when NVIDIA pool is exhausted or fails)
```
*Note: The vision/OCR pipeline is strictly bounded by `OCR_GLOBAL_TIMEOUT_SECONDS = 60.0`. Ollama is not in the production vision/OCR path.*

### Future Tier-Based AI Routing (Freemium — Planned)
```
Elite  (₹998): 1. Sarvam AI Vision  → 2. NVIDIA Advanced   → 3. Gemini 2.0 Flash
Pro    (₹732): 1. NVIDIA Advanced   → 2. Gemini Pro         → 3. Gemini Flash
Starter(₹366): 1. NVIDIA LLaMA      → 2. Gemini Flash
Free   (₹0):   1. Gemini Flash only (20 scans/month limit enforced)
```

### AI Coding & Fallback Rules
- Every AI function MUST be wrapped in `try/except` and return `None` (or fallback) on failure
- Every AI call MUST have an explicit `timeout` — never leave open-ended connections
  - Vision calls → `timeout=60.0` (with 10.0s connect timeout)
  - Text/translation calls → `timeout=30.0`
- JSON responses from AI MUST always pass through structured validation helpers (`_parse_llm_json` or `clean_json_response`)
- Never trust raw AI output without schema/structure validation (check for required keys)
- If ALL AI models fail, return safe closed fallback with review flags (`requires_user_review: true`) or raise controlled HTTPException
- NVIDIA keys must be rotated across the verified key pool (`_get_nvidia_keys()`) with exponential backoff on HTTP 429 (capped at 5s) and immediate failover on non-retryable statuses (400, 401, 403, 404, 422)
- Provider credentials must be loaded exclusively from environment variables (`.env`) and never logged or exposed to clients

---

## 4. 🛡️ Error Handling Rules

### Backend Pattern
```python
# ✅ CORRECT — Wrap each AI call individually, continue to next on failure
try:
    result = await try_ollama_scan(image_data, prompt)
    if result:
        return result
except Exception as e:
    print(f"Ollama scan failed: {e}")

# ✅ CORRECT — Raise HTTPException for client-facing errors
raise HTTPException(status_code=401, detail="Invalid or expired token")
raise HTTPException(status_code=429, detail="Monthly scan quota exceeded. Please upgrade.")

# ❌ WRONG — Never expose raw exceptions to clients
raise Exception("Something broke internally")
```

### Frontend Pattern
```tsx
// ✅ CORRECT — Always handle fetch errors with user-facing state
try {
  const response = await fetch(`${API_BASE}/api/foods`);
  if (!response.ok) throw new Error(`Status ${response.status}`);
  const data = await response.json();
  setFoods(data);
} catch (err) {
  console.error("Food fetch failed:", err);
  setSearchError("Failed to load. Please try again.");
}

// ❌ WRONG — Never leave unhandled promises
fetch(`${API_BASE}/api/foods`).then(r => r.json()); // Missing .catch()
```

### User-Facing Error Messages (Tone)
- ✅ "No results found. Try a different food name."
- ✅ "Failed to connect. Please check your internet and try again."
- ✅ "Monthly limit reached. Upgrade to continue scanning."
- ❌ "Error 500: Internal Server Error" — never show raw errors
- ❌ "NVIDIA API returned 429" — never show API internals

---

## 5. 🎨 Styling & Design Rules

### Color Palette (Strict — Do NOT deviate)
| Role | Tailwind Class | Usage |
|---|---|---|
| Page Background | `bg-slate-950` | Every page root div |
| Card/Surface | `bg-slate-900` | Cards, modals, dropdowns |
| Subtle Border | `border-slate-800` | Default borders |
| Highlight Border | `border-slate-700` | Hover state borders |
| Primary Accent | `text-emerald-400`, `bg-emerald-500` | Buttons, active states |
| Danger | `text-rose-400`, `bg-rose-500/10` | Errors, warnings, destructive actions |
| Warning/Streak | `text-amber-400`, `bg-amber-500/10` | Streak counter, cautions |
| Muted/Subtext | `text-gray-400`, `text-gray-500` | Labels, secondary text |

### Animation Rules
- All appearing elements must use: `animate-in fade-in duration-300`
- Slide-up (floating bars): `slide-in-from-bottom-5`
- Slide-down (dropdowns, toast): `slide-in-from-top-4`
- Buttons must always have: `active:scale-95 transition-all`
- Hover effects on cards: `hover:border-slate-700 transition-all`

### Component Shape Language
- Page cards: `rounded-4xl` with `p-7`
- Buttons: `rounded-2xl` or `rounded-full` for pill shapes
- Modals: `rounded-4xl` with `max-w-lg`
- Input fields: `rounded-3xl`
- Tags/Badges: `rounded-full`

### Typography Rules
- Page title (H1): `text-4xl font-bold font-outfit tracking-tight`
- Section title (H2): `text-xl font-bold tracking-tight`
- Card title (H3): `text-2xl font-bold leading-tight`
- Overline/Labels: `text-[10px] font-black uppercase tracking-widest text-gray-500`
- Body text: `text-sm text-gray-400 leading-relaxed`

---

## 6. 🔐 Security Rules

### Cryptographic Keys & Mobile Signing Policy (ZS-002)
- **NEVER** commit signing credentials or private keys:
  - Keystores / Certificates: `*.keystore`, `*.jks`, `*.p12`, `*.pfx`, `release.keystore`, `debug.keystore`
  - Private key files: `*.key`, `*.pem`
  - Provisioning profiles: `*.mobileprovision`
- **Store Securely**: Production signing credentials must reside in CI/CD secret managers (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, or EAS Credentials). Never embed plaintext passwords in `build.gradle` or configuration files.
- **Incident Response Policy (Compromised Signing Credential)**:
  1. Treat the exposed credential as immediately **COMPROMISED**.
  2. Remove from Git tracking and purge from complete repository history using `git-filter-repo`.
  3. Rotate/reset the credential using the appropriate distribution-platform procedure (e.g., Google Play Console Upload Key Reset or EAS Credentials rotation).
  4. Update CI/CD secret stores and verify the old key is decommissioned.
  5. Enforce `.gitignore` and run the `tests/test_secret_leak_guard.py` regression suite.
  6. Invalidate build artifacts, cache references, and notify collaborators to re-clone rewritten history.

### General Security
- **NEVER** commit `.env` — it is in `.gitignore`. Use `.env.example` for templates
- **NEVER** expose backend secrets (`RAZORPAY_KEY_SECRET`, `SARVAM_API_KEY`, `GEMINI_API_KEY`) to the frontend
- Frontend only uses `VITE_` prefixed env variables (Vite exposes these safely)
- All protected API routes MUST use the `Depends(get_current_user_id)` dependency
- Razorpay webhook endpoints MUST verify HMAC signature before processing any event
- Firebase ID tokens expire every 1 hour — always call `await currentUser.getIdToken()` fresh (never cache the raw token string)
- `firebase-admin-key.json` must NEVER be committed — use the `FIREBASE_CREDENTIALS` env var in production

---

## 7. 📁 File & Folder Structure (Convention)

### Frontend
```
frontend/src/
  components/         ← Page-level components (one file per page/tab)
    auth/             ← Auth-specific UI (LoginModal.tsx)
  context/            ← React Context providers
    AuthContext.tsx       ← Firebase auth state
    UserStatsContext.tsx  ← Calories, streak, logMeal, logMultipleMeals
    UserProfileContext.tsx ← Health profile, settings, preferences
  config.ts           ← API_BASE and app-wide constants (single source of truth)
  firebase.ts         ← Firebase app + auth initialization
  App.tsx             ← Root app, sticky navbar, tab navigation
  index.css           ← Tailwind v4 import + CSS variables + custom utilities
```

### Backend
```
backend/
  main.py             ← Primary FastAPI app + all routes (monolith for now)
  routes/             ← Future: modular route files per feature
  services/           ← Future: AI service clients (sarvam, ai_router)
  middleware/         ← Future: quota enforcement, rate limiting
  models.py           ← Pydantic models and shared schemas
  db.py               ← Database connection helpers
  seed_1000.py        ← One-time DB seeder script
  requirements.txt    ← Pinned Python dependencies (always pin versions)
  .env                ← Local secrets (never commit)
  .env.example        ← Template showing required keys (safe to commit)
```

---

## 8. 🔁 Git & Commit Rules

- **Repository:** `https://github.com/farhanahmad2106-cpu/Z-SeHealth` (Always push to the `z-sehealth` remote, never `origin` unless explicitly instructed)
- **Branch:** `main` (single developer — always push to main)
- **Commit message format:** `type: short clear description`

| Type | When to use |
|---|---|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `style:` | CSS/UI only change, no logic change |
| `refactor:` | Code restructure, same behaviour |
| `chore:` | Config, dependency, tooling update |
| `docs:` | Documentation file update |

- ✅ Always run `npm --prefix frontend run build` before committing frontend changes
- ✅ Always run `python -m py_compile backend/main.py` before committing backend changes
- ✅ Push to GitHub after every meaningful feature is complete and verified
- ❌ Never commit broken builds or TypeScript errors

---

## 9. 🧩 Component & Context Rules

- Every component file exports a **single default export** function
- Components should NOT call APIs directly — delegate to Context methods or service functions
- Components over ~300 lines should be refactored into sub-components
- All modal overlays: `fixed inset-0 bg-black/90 backdrop-blur-xl z-100 flex items-center justify-center`
- Never manipulate DOM directly with `document.getElementById()` — use React `useRef`
- Every async operation in a component MUST manage at minimum: `loading`, `error`, and `data` states
- Floating fixed elements must have a defined `z-index` (use `z-40` for UI chrome, `z-50` for overlays)

---

## 10. 📱 Responsive Design Rules

- **Mobile-first**: write base styles for mobile, add `md:` and `lg:` prefixes for larger screens
- Navbar: collapses profile section to icon-only on `< md`
- Food grid: always `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- Fixed floating elements (bottom bar, tick button): positioned `right-6` with responsive top values
- Target breakpoints: **375px** (iPhone SE), **768px** (tablet), **1440px** (desktop)
- Bottom padding on scrollable pages: `pb-32` or `pb-36` to avoid content hidden behind fixed bars

---

## 11. 🛡️ Security & Reliability Invariants (P1 Security Mandates)

### Scan API & Quota Enforcement
- **Canonical Scan Route:** `POST /api/scan/analyze` MUST require valid Firebase token authentication via `get_current_user_id`. Never trust client-provided user IDs.
- **Fail-Closed Quotas:** Quota reservation (`reserve_scan_quota`) succeeds ONLY if MongoDB atomically performs the increment (`matched_count > 0`). `matched_count == 0`, unacknowledged writes, or database errors MUST strictly fail closed (`return False`). Never fall back to `True`.
- **Legacy Scan Retirement:** Legacy scan endpoints (`POST /api/scan` and `POST /api/scan/ingredients`) are permanently retired (HTTP 410 Gone) and must NEVER execute OCR, database mutations, or quota checks.

### Input Sanitization & Outbound Safety
- **Food Search ReDoS Defense:** All food search queries (`GET /api/foods`, `GET /api/search/food`) MUST enforce a maximum length of 200 characters (reject >200 with HTTP 400), strip whitespace, and escape all metacharacters via `re.escape(search)`. Empty search queries must NOT generate `$regex` filters, preserving indexed collection performance.
- **Barcode Validation & External Request Safety:** Barcodes (`GET /api/barcode/{barcode}`, `GET /api/foods/barcode/{barcode}`) MUST match `^[0-9A-Za-z_-]{6,24}$` (reject invalid with HTTP 422). Outbound requests to Open Food Facts must use fixed hostnames (`https://world.openfoodfacts.org/api/v2/product/{quoted_barcode}.json`), URL-encode the path component with `quote(normalized_barcode, safe="")`, and enforce strict request timeouts.
