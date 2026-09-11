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

### Current AI Fallback Order (Free Tier — All Users)
```
Scan:       1. Ollama (local) → 2. NVIDIA (multi-key) → 3. Gemini 2.0 Flash
Search:     1. Ollama          → 2. NVIDIA             → 3. Gemini 2.0 Flash
Translate:  1. Ollama          → 2. NVIDIA             → 3. Gemini 2.0 Flash
Macros:     1. Ollama          → 2. NVIDIA             → 3. Gemini 2.0 Flash
```

### Future Tier-Based AI Routing (Freemium — Planned)
```
Elite  (₹998): 1. Sarvam AI Vision  → 2. NVIDIA Advanced   → 3. Gemini 2.0 Flash
Pro    (₹732): 1. NVIDIA Advanced   → 2. Gemini Pro         → 3. Gemini Flash
Starter(₹366): 1. NVIDIA LLaMA      → 2. Gemini Flash
Free   (₹0):   1. Gemini Flash only (20 scans/month limit enforced)
```

### AI Coding Rules
- Every AI function MUST be wrapped in `try/except` and return `None` on failure
- Every AI call MUST have an explicit `timeout` — never leave open-ended connections
  - Vision calls → `timeout=60.0`
  - Text/translation calls → `timeout=30.0`
- JSON responses from AI MUST always pass through `clean_json_response()` helper in `main.py`
- Never trust raw AI output without basic structure validation (check for required keys)
- If ALL AI models fail, return a safe hardcoded fallback (e.g., `{"calories": 250, ...}`)
- NVIDIA keys must be rotated via `get_nvidia_keys()` — never call a single key directly

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
