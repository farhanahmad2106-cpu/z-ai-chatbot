# Z-SeHealth — MEMORY.md
> **⚠️ MUST BE UPDATED after every session or feature change.**
> This file is the living memory of the project — its current state, what's done, what's in progress, and what's next.
> **Last Updated:** 2026-09-18 (Session: Razorpay Webhook Security Remediation)

---

## 🗓️ Last Session Summary
**Date:** 2026-09-18
**Work Done — Razorpay Webhook Security Remediation:**
- **Strict Signature Verification (`backend/routes/webhooks.py`)**:
  - Removed `if not secret` insecure fallback bypass. Throws 500 if `RAZORPAY_WEBHOOK_SECRET` is missing.
  - Signature `x-razorpay-signature` is now verified against the raw request body bytes.
  - Missing or invalid signatures immediately throw 400.
- **Atomic Idempotency (`backend/routes/webhooks.py`)**:
  - Added atomic `insert_one` against the `transactions` collection using `X-Razorpay-Event-Id`.
  - Catches `pymongo.errors.DuplicateKeyError` to prevent double-crediting user tiers or quotas during duplicate/concurrent webhook delivery.
- **Test Suite (`tests/test_webhooks.py`)**:
  - Created a test suite testing 7 required security scenarios (valid, forged, missing sig, missing secret, duplicate, concurrent duplicate, raw body validation).
  - All tests passed.

---

## 🗓️ Previous Session Summary
**Date:** 2026-09-17
**Work Done — Legal Compliance Document Suite (`.zayd_docs/`):**
- **Generated 6 production-grade legal/compliance documents** after thorough codebase verification:
  1. `PRIVACY_POLICY.md` — 20-section Privacy Policy under DPDP Act 2023, IT Act 2000 framework with verified data flows, LocalStorage inventory, AI provider disclosures, and health data protections
  2. `TERMS_OF_SERVICE.md` — 23-section Terms of Service with medical disclaimer, allergy warnings, safety score disclaimer, acceptable use policy, verified pricing (₹366/₹732/₹998), and Indian law jurisdiction
  3. `REFUND_POLICY.md` — 13-section Refund & Cancellation Policy with verified Razorpay subscription flow, webhook failure handling, and proper distinction between Z-SeHealth policies vs statutory requirements
  4. `COOKIE_POLICY.md` — 8-section Cookie & Local Storage Policy with complete LocalStorage key inventory verified from codebase, quote rotation formula (3×i days), Firebase authentication storage explanation
  5. `UI_COMPLIANCE_SPEC.md` — 9-section frontend implementation spec with exact JSX copy for scanner disclaimer, Health Vault consent modal, Razorpay checkout consent, legal footer, WCAG 2.1 AA colour contrast ratios calculated, and consent audit schema
  6. `IMPLEMENTATION_GAP_REGISTER.md` — 39 identified implementation gaps across 8 categories (Privacy, Auth, Payments, AI, Frontend, Backend, Legal Delivery, Accessibility) with priority ratings (3 Critical, 14 High, 19 Medium, 3 Low)
- **Codebase verification performed before drafting:**
  - Verified pricing from `PricingPage.tsx` and `subscriptions.py` (Starter ₹366/80 scans, Pro ₹732/200 scans, Elite ₹998/500 scans)
  - Verified scan quota logic in `quota_check.py` (monthly reset, not lifetime)
  - Verified Razorpay webhook HMAC verification in `webhooks.py`
  - Verified all LocalStorage keys from `Search.tsx`, `UserStatsContext.tsx`, `quoteEngine.ts`, `Scan.tsx`
  - Verified AI fallback chain from `ai_router.py` and `ocr_service.py`
  - Verified health profile fields from `Profile.tsx` and MongoDB `users` schema

---

## 🗓️ Last Session Summary
**Date:** 2026-09-16
**Work Done — OCR Optimization for Small Packaging:**
- **Frontend Camera UI & Scaling (`frontend/src/components/Scan.tsx`)**:
  - Implemented WebRTC hardware zoom capability detection using `track.getCapabilities()`.
  - Added a brutalist dark-mode zoom pill bar allowing `1x`, `1.5x`, and `2x Macro` zoom.
  - Implemented Canvas Digital Crop fallback for devices that don't support hardware zoom.
  - Added a high-contrast scanning reticle and distance guidance text to the viewfinder.
  - Added a secondary "High-Res Camera" file input fallback to invoke the native OS camera interface.
- **Backend Image Preprocessing (`backend/services/image_preprocessor.py`)**:
  - Created a new `Pillow`-based preprocessing pipeline to optimize images for OCR before sending to Vision models.
  - Fixes EXIF orientation, applies a 20% contrast boost for reflective packaging, and uses a mild unsharp mask to clarify tiny text.
  - Implemented safe degradation; if preprocessing fails, it silently falls back to the original image bytes.
- **Vision Model Prompt Hardening (`backend/services/ocr_service.py`)**:
  - Updated `SYSTEM_PROMPT` to explicitly handle small Indian consumer-product sachets and foil packets.
  - Added strict anti-hallucination instructions to prevent inventing ingredients when text is obscured.
  - Directed the model to precisely extract and preserve INS additive codes without normalization.
- **Build Verification**:
  - `npm --prefix frontend run build` completed successfully (0 errors).
  - Python compilation on `backend/routes/scan.py`, `backend/services/ocr_service.py`, and `backend/services/image_preprocessor.py` passed cleanly.

## 🗓️ Previous Session Summary
**Date:** 2026-09-14
**Work Done — End-to-End Verification & Hardening of Crowdsourced Food Moderation Pipeline:**
- **Hardening OCR Service & IDE Language Server Compatibility (`backend/services/ocr_service.py`)**:
  - Implemented safe dual-mode import with `# type: ignore` for `google.genai` and `google.genai.types` to eradicate IDE type-checker/Pylance missing import errors.
  - Added direct HTTP REST API fallback with `httpx` to `_call_gemini`, ensuring vision OCR functions seamlessly even if `google-genai` package is unavailable in the execution environment.
  - Added `.vscode/settings.json` with `python.analysis.extraPaths` for seamless IDE resolution of local packages and `backend/`.
  - Re-verified complete pipeline via `tests/test_food_moderation_e2e.py` (100% PASS).
- **Pipeline Architecture & Grounding**:
  - Validated full-lifecycle crowdsourced scan ingestion via `POST /api/scan/analyze` with multi-tier vision OCR (`gemini-2.5-flash`).
  - Enforced strict pre-approval status isolation: scanned uncataloged packaged food items persist into MongoDB Atlas `foods` collection with `is_verified: False`, `requires_moderation: True`, `status: 'pending_review'`, and are completely hidden from public `/api/foods` and `/api/search/food` queries without triggering AI hallucination fallback duplicates.
  - Hardened `backend/routes/admin.py`:
    - Synchronized document properties (`product_name` and `name`, INS additives arrays, allergens, estimated macros) for seamless presentation in `FoodModerationTab.tsx`.
    - `POST /api/admin/foods/{id}/approve` transitions document state to `is_verified: True`, `status: 'Safe'`, `requires_moderation: False`, and populates audit trails `reviewed_by` and `approved_at`.
  - Added public search alias `GET /api/search/food` mapping to `get_foods`.
  - Upgraded model routing to `gemini-2.5-flash` in `ocr_service.py` and `main.py` using `google.genai` SDK for fast sub-5s response latency.
- **End-to-End Test Suite Execution (`tests/test_food_moderation_e2e.py`)**:
  - Test Image Fixture: Generated high-fidelity packaging fixture `tests/fixtures/unlisted_local_snack.jpg` ("Bhikharam Chandmal Bhujia" containing palm oil, gram flour, salt, red chilli, cloves, INS 330, INS 627, INS 631, and INS 319).
  - Step 1: Scan Ingestion (`POST /api/scan/analyze`) -> **PASS** (HTTP 200, structured parsing with 11 ingredients, 4 INS additives, estimated macros).
  - Step 1.4: Pre-Approval Isolation (`GET /api/foods?search=Bhikharam` & `/api/search/food?q=Bhikharam`) -> **PASS** (0 results, confirmed hidden from public catalog).
  - Step 2: Database Layer Verification (MongoDB Atlas `foods` collection) -> **PASS** (`is_verified: False`, `submitted_by: 'test_user'`, `raw_ocr_text`: 659 chars, `detected_ins_additives`: 4, `requires_moderation: True`).
  - Step 3: Admin Operations Queue Inspection (`GET /api/admin/foods/pending`) -> **PASS** (Item identified with raw OCR preview, INS additive chips, allergen tags, and macronutrient metrics).
  - Step 4: Approval API Execution (`POST /api/admin/foods/{id}/approve`) -> **PASS** (HTTP 200, record updated to `is_verified: True`, `reviewed_by: 'farhanahmad2106@gmail.com'`, `approved_at` timestamp recorded).
  - Step 4.4: Post-Approval Global Visibility (`GET /api/foods?search=Bhikharam` & `/api/search/food?q=Bhikharam`) -> **PASS** (Item immediately queryable with safety score 88 and complete macro breakdown).
- **Build Verification**:
  - `npm --prefix frontend run build` -> Passed cleanly (1810 modules transformed, 6.29s).
  - Python compilation on all backend services -> Passed cleanly (0 errors).

- **Deprecation of Standalone Next.js App**: Safely purged the legacy `admin-dashboard/` Next.js directory. Consolidated all administrative views natively into the React 19 + Vite frontend (`frontend/src/`) and FastAPI backend (`backend/`).
- **Backend Schemas & RBAC (`backend/schemas/admin.py` & `backend/routes/admin.py`)**:
  - Engineered granular RBAC models (`AdminPermissions`, `AdminUserResponse`, `AdminInviteRequest`, `CrowdsourcedFoodReview`, `SystemLogEntry`, `OtaDispatchRequest`).
  - Implemented `get_current_admin` security dependency with automatic bootstrap for Master Super Admin (`Farhan Ahmad` / `farhanahmad2106@gmail.com`).
  - Added endpoints:
    - `POST /api/admin/auth/verify`: Verifies Firebase session against MongoDB Atlas `admins` collection.
    - `GET /api/admin/team` & `POST /api/admin/team/invite`: Super Admin team management.
    - `PATCH /api/admin/team/{admin_id}` & `DELETE /api/admin/team/{admin_id}`: Manage permissions & revoke access (guarded against Super Admin self-demotion).
    - `GET /api/admin/foods/pending`, `POST /api/admin/foods/{food_id}/approve`, `POST /api/admin/foods/{food_id}/reject`: Crowdsourced food safety moderation.
    - `GET /api/admin/users`, `POST /api/admin/users/{user_id}/reset-quota`, `POST /api/admin/users/{user_id}/toggle-ban`: User governance.
    - `GET /api/admin/logs`: Monospace system telemetry & exception viewer stream.
    - `GET /api/admin/analytics/overview`: Aggregated MRR, users, and food catalog stats.
    - `GET /api/admin/ota/releases` & `POST /api/admin/ota/dispatch`: EAS OTA hotfix releases & GitHub Actions dispatch.
- **Frontend Architecture & Brutalist UI (`frontend/src/`)**:
  - Built `AdminAuthContext.tsx` handling token verification and granular permission flags.
  - Built `AdminRouteGuard.tsx` presenting a high-tech brutalist 403 Forbidden screen to unauthorized callers.
  - Integrated `/admin` URL synchronization and route switcher into `App.tsx` and `ProfileDropdown.tsx`.
  - Built modular Admin Hub tabs in `frontend/src/components/admin/`:
    - `AdminDashboard.tsx`: Primary shell with Super Admin badge, telemetry indicator, and tab navigation.
    - `tabs/OverviewTab.tsx`: Real-time KPI cards (Users, Scans, Pending Moderation, MRR) and tier distribution bar.
    - `tabs/FoodModerationTab.tsx`: Side-by-side OCR review and single-click global database approval.
    - `tabs/UserManagementTab.tsx`: Paginated, searchable user table with scan quota progress bars, instant quota reset, and account ban toggles.
    - `tabs/AdminTeamTab.tsx` (*Super Admin Exclusive*): Invite new admins, assign capability checkboxes, view last logins, and revoke access.
    - `tabs/SystemLogsTab.tsx`: Monospace, color-coded error viewer with log level filters, grep search, and structured JSON payload inspection modal.
    - `tabs/AdminOtaManager.tsx`: Channel switcher, release inspector, and instant OTA remote hotfix trigger via GitHub Actions.
- **Build & Syntax Verification**:
  - `npm --prefix frontend run build` passed cleanly with 0 errors (1810 modules transformed, 20.54s).
  - `py_compile` on `backend/schemas/admin.py`, `backend/routes/admin.py`, and `backend/main.py` passed cleanly with 0 errors.

## 🗓️ Previous Session Summary
**Date:** 2026-09-12
**Work Done — Health Profile Validation:**
- **Mandatory Field Validation**: Added logic to `handleSaveHealth` in `Profile.tsx` to prevent users from saving their health profile if they have not filled out all mandatory fields (Age, Gender, Height, Weight, Activity Level, Health Goal, Daily Target Water).
- **Error Toast UI**: Updated the `ToastContext` to support a new `type='error'` variant (red styling with an `AlertCircle` icon).
- **Validation Feedback**: The validation check now triggers the new error toast saying "Please fill all mandatory fields." if the user tries to save with incomplete data.
- **Visual Validation Animation**: When validation fails, all mandatory fields visually shake. Empty mandatory fields are highlighted with a red outline, while filled fields are highlighted with a green outline to guide the user visually.

## 🗓️ Previous Session Summary
**Date:** 2026-09-12
**Work Done — Profile Dropdown Update:**
- **Updated Profile Dropdown UI**: Removed "Dashboard Overview" from the user account dropdown menu in `ProfileDropdown.tsx`.
- **Added Search & Scan**: Replaced it with "Search Food" and "Food Scanner" options directly accessible from the dropdown using proper Lucide React icons.
- **Fixed Build Error**: Removed unused `LayoutDashboard` import.

## 🗓️ Previous Session Summary
**Date:** 2026-09-11
**Work Done — Health Profile Enhancement:**
- **Editable Health Profile Overview**: Added new optional fields for users (Blood Type, Target Weight, Target Sleep, and Medical Conditions) to make the profile more comprehensive.
- **Mandatory Indicators**: Added red asterisks (*) to all mandatory fields in the Health Profile editing modal to improve user clarity.
- **Dynamic Display**: Updated the Health Profile Overview card to dynamically display the newly added optional metrics if the user has provided them.

## 🗓️ Previous Session Summary
**Date:** 2026-09-11
**Work Done — End-to-End QA Regression Testing Against Production:**

### 🧪 Production Deployment QA Verification ✅
- **Executed Test Suite A (Non-Food Rejection)**: Tested non-food images (dark camera frames, person/portrait images) against the production scan pipeline. All negative tests PASSED — backend correctly returns `{"has_ingredients": false}` and frontend displays "Detection Failed" error panel without hallucinating ingredients.
- **Verified Mock Fallback Purge**: Confirmed "Cheese & Dairy Solids" and "Enriched Flour" hardcoded fallback payloads are fully removed from the production codebase.
- **Verified Explicit Error Contract**: Backend `POST /api/scan` returns `{"has_ingredients": false, "error_message": "..."}` when all AI tiers fail or non-food is detected. Backend `POST /api/scan/analyze` raises `HTTPException(500)` on complete OCR failure.
- **Verified Frontend Error Handling**: `Scan.tsx` correctly checks `data.has_ingredients === false` and triggers `setScanError()` instead of `setAnalysisResult()`, preventing IngredientReviewModal from rendering with hallucinated data.
- **Verified No Storage Pollution**: Non-food rejections do NOT write to localStorage or SWR cache.
- **Discovered Edge Case D-02**: The `has_ingredients: false` check only applies in `scanMode === 'food'`. The `/api/scan/ingredients` OCR pipeline does not have a domain validation gate — non-food images may produce garbled raw text fallback.
- **Test B1 (Positive Control)**: INCONCLUSIVE — browser automation could not simulate clean file upload due to camera viewfinder taking precedence. Requires manual re-test on physical device.

---

## 🗓️ Previous Session Summary
**Date:** 2026-09-03
**Work Done — Back-of-Pack OCR & Ingredient Review UI:**

### 🚀 Back-of-Pack OCR Pipeline (Backend) ✅
- **Configured `backend/schemas/scan.py`**: Created `OCRAnalysisResponse` Pydantic model.
- **Implemented `backend/services/ocr_service.py`**: Engineered a multi-tier fallback OCR service using Sarvam/Edge, NVIDIA NIM (`nvidia/neva-22b`), and Gemini Cloud.
- **Added `backend/routes/scan.py`**: Developed `POST /api/scan/analyze` route for processing image uploads, wired into `main.py`.

### 🖥️ Interactive Ingredient Review Drawer (Frontend) ✅
- **Built `frontend/src/components/IngredientReviewModal.tsx`**: Engineered a glassmorphic React drawer following the brutalist dark-mode design system. Maps the parsed OCR response into interactive inputs, visually tracking INS additive risks (high/moderate/low) and flagged allergens.

---

## 🗓️ Last Session Summary
**Date:** 2026-09-03
**Work Done — Over-The-Air (OTA) Update Delivery System (React Native Expo + EAS):**

### 🚀 Production Over-The-Air (OTA) Delivery Engine ✅
- **Configured `app.json` & `eas.json`**:
  - Implemented `expo-updates` with strict `"runtimeVersion": { "policy": "appVersion" }` lock to prevent native mismatch crashes.
  - Set `fallbackToCacheTimeout: 3000` to prevent blocked cold boots in low-connectivity/offline edge environments.
  - Defined EAS channel matrix (`development`, `preview` [staging], `production`) with channel-targeted update routing.
- **Client-side Lifecycle Engine (`src/services/updateManager.ts` & `src/store/telemetryStore.ts`)**:
  - Engineered `useUpdateManager()` hook with automatic `__DEV__` bypass and background bundle downloading via `Updates.checkForUpdateAsync()` and `Updates.fetchUpdateAsync()`.
  - Implemented error logging to local `useTelemetryStore` without crashing active user sessions.
  - Built unobtrusive floating toast UI in `App.tsx` offering instant reload (`Updates.reloadAsync()`) or graceful deferred reload on next cold launch.
- **Admin Remote Control & Webhook Integration (`admin-dashboard/app/api/ota/route.ts` & `OtaManager.tsx`)**:
  - Next.js 14 Route Handler protected by `X-Admin-Key` header verification against `ADMIN_SECRET` to inspect live EAS releases and trigger remote workflow dispatches.
  - Brutalist dark theme admin management component for release queries and instant hotfix deployment.
- **CI/CD Automated Deployment (`.github/workflows/ota-deploy.yml`)**:
  - GitHub Actions pipeline publishing `eas update --auto --channel production` on push to `main` filtered strictly to JS, CSS, and asset files.

---

## 🗓️ Previous Session Summary
**Date:** 2026-09-03
**Work Done — Complete 16-File Technical Specification Framework & Agent Execution Tracker:**

### 📚 Full Architecture & Agent Spec Suite Generated (`.zayd_docs/`) ✅
- Created the master 16-file technical specification framework and agent execution state tracker in `.zayd_docs`:
  1. `1_PRD.md` — Product Requirements Document (Western database bias, hidden chemical names, personas, acceptance criteria, FSSAI metric targets).
  2. `2_ARCHITECTURE.md` — Complete macro-architecture (Edge client layer, FastAPI service, multi-LLM failover router, OFF proxy, Convex Cloud sync, Mermaid diagrams).
  3. `3_RULES.md` — Autonomous agent development laws (Strict TS, Pydantic v2, SWR hydration, AES-256 health vault encryption, git workflow).
  4. `4_PHASES.md` — Multi-stage engineering roadmap from TRL-3/4 to full edge deployment and enterprise compliance.
  5. `5_UI_DESIGN.md` — Design system specifications (Brutalist dark theme, glassmorphic modals, dynamic quote progress bar animation keyframes, viewfinder brackets, telemetry HUD).
  6. `6_SKILLS_MANIFEST.md` — Machine-readable agent capabilities catalog with exact scripts, commands, parsers, and API clients.
  7. `7_MEMORY_RAG.md` — Persistent agent knowledge base (5-key NVIDIA pool, rate limit handling, cache registry, known edge cases).
  8. `8_AUDIO_PIPELINE.md` — Vernacular voice interface architecture (Sarvam AI STT/TTS pipeline, NLU intents, audio specifications).
  9. `9_HARDWARE_MOBILE.md` — Edge hardware and mobile runtime spec (React Native Expo, GGUF model memory footprints, telemetry meters, camera viewfinder).
  10. `10_TESTING_DEBUG.md` — Automated testing and validation suites (Safety score unit tests, mock OCR payloads for Maggi/Haldiram's, failover simulations).
  11. `11_TRD.md` — Technical Requirements Document (Latency budgets, DPDP compliance, AES-256 encryption, scalability).
  12. `Tech-Spec.md` / `12_Tech-Spec.md` — Detailed technical specifications (Dependencies, API contracts, auth flows).
  13. `appFlow.md` / `13_appFlow.md` — End-to-end user navigation and data flow Mermaid diagrams.
  14. `schema.md` / `14_schema.md` — Consolidated data schemas (TypeScript interfaces, Pydantic models, MongoDB collections, Convex schemas).
  15. `implementationPlan.md` / `15_implementationPlan.md` — Detailed step-by-step engineering plan for Back-of-Pack OCR & INS normalization engine.
  16. `Tracker.md` / `16_Tracker.md` — Autonomous Agent State Machine & Progress Tracker with 50 atomic tickets across 8 workstreams.

---

## 🗓️ Previous Session Summary
**Date:** 2026-08-28
**Work Done — Fix Language Translator & Console Encoding Crashes:**

### 🛠️ Language Translator & Startup Crash Fixes ✅
- **Fixed FastAPI Module-level Initialization Crash**: Discovered that when `GEMINI_API_KEY` was missing from local environments, the module-level instantiation of `genai.Client()` would immediately throw a `ValueError` on startup, crashing the entire backend. Shifted `genai.Client` initialization to be lazy/conditional, and guarded all downstream Gemini API calls (`try_gemini_translate`, `try_gemini_fallback_food`, `try_gemini_scan`, `try_gemini_estimate_macros`) to prevent runtime errors when the key is absent.
- **Fixed Windows Unicode standard-out prints**: Identified that when the backend logs translated strings or vision labels containing non-ASCII characters (e.g., regional Indian language text) in standard-out prints, Python on Windows raises a `UnicodeEncodeError: 'charmap' codec can't encode characters`. This error was captured by the service-level `try-except` blocks, causing translate functions to silently return `None` and fail.
- **Applied `ascii()` Encoding Escape**: Updated the log print statements inside `try_ollama_translate`, `try_nvidia_translate`, `try_ollama_scan`, and `try_nvidia_scan` to use the built-in `ascii()` function, ensuring console output stays strictly ASCII-safe and preventing codec exceptions.
- **Verified Success**: Tested the local translation flow successfully using a script within the FastAPI virtual environment, achieving error-free Indian language translations through Ollama fallbacks.

---

## 🗓️ Previous Session Summary
**Date:** 2026-08-01
**Work Done — Site Startup Performance Optimization (2-5 Min Delay to <1 Sec Instant Load):**

### ⚡ Site Performance & Load Time Optimization ✅
- **Identified 2–5 Minute Delay Bottlenecks**:
  1. **MongoDB Atlas Cold Startup Blocking**: FastAPI `startup_event()` was running `await foods_collection.count_documents({})` and running synchronous 1,000-item seeding over cold TLS database connection, blocking FastAPI from accepting HTTP requests for minutes.
  2. **Sequential API Request Chaining**: Frontend triggered user stats and subscription status in sequential waterfall HTTP calls.
  3. **Unoptimized Font Preconnecting**: Missing `fonts.googleapis.com` preconnect links paused initial browser rendering.
- **Applied Fixes**:
  1. **Non-Blocking Background DB Init (`main.py`)**: Moved database count & seeding checks into an asynchronous background task (`asyncio.create_task()`), enabling FastAPI to start up **instantly in < 50ms**. Added 3000ms server selection timeouts to Motor client.
  2. **Parallel Frontend Requests (`UserStatsContext.tsx`)**: Parallelized user stats & subscription requests using `Promise.all()`.
  3. **Font Preconnect Optimization (`index.html`)**: Added preconnect hints to eliminate rendering blocking.
- **Build & Push**: Verified build (3.29s, 0 errors). Committed (`8a22342`) and pushed directly to `origin/main`.

### Account Dropdown ("A/c Tab") & Profile Button Fixes ✅
- **Account Dropdown Persistence**: Updated `ProfileDropdown.tsx` so clicking options inside the dropdown menu (Dashboard Overview, Personal Details, Membership & Plan, App Settings, Help & Support) navigates to the respective views without hiding the Account Tab. The Account Tab now toggles exclusively when clicking the Account tab profile button.
- **Edit Health Profile Button Fix**: Cleaned up duplicated component markup in `Profile.tsx` (reduced file length from 569 lines to 442 clean lines), fixing state binding so clicking "Edit Health Profile" instantly toggles the Age, Gender, Height, and Weight input fields.
- **Profile Photo Edit Button**: Created `EditPhotoModal` in `Profile.tsx` supporting preset avatar selection, local file upload, or custom image URL input. Synchronized with Firebase `updateProfile` and backend sync.
- **Dietary Preferences "Configure" Button**: Created `DietaryPreferencesModal` in `Profile.tsx` allowing selection of primary diet types (Vegetarian, Vegan, Keto, Halal, etc.), allergy toggle tags, and custom allergy inputs.
- **Settings Page Buttons**:
  - Connected Display Name save button to Firebase & backend sync.
  - Connected "Change Password" button to Firebase `sendPasswordResetEmail`.
  - Added interactive sidebar navigation tabs (`Account`, `Notifications`, `Privacy`, `Devices`).
  - Added interactive Language selection modal.
  - Added Delete Account confirmation modal.

---

## 🗓️ Previous Session Summary
**Date:** 2026-07-30
**Work Done — Freemium Model (Phase 1–4 Implementation):**

### Phase 1 — Database Layer ✅
- Updated `/api/auth/sync` in `main.py` to create new users with full freemium schema: `tier`, `subscription`, `usage`
- Added backward-compatible migration: existing users get freemium fields on next login if `tier` field is missing

### Phase 2 — Backend Services & Routes ✅
- Created `backend/middleware/__init__.py` + `backend/middleware/quota_check.py` (scan quota enforcement, Option-B monthly reset-on-read)
- Created `backend/services/__init__.py` + `backend/services/sarvam_client.py` (Sarvam AI for Elite tier — key stored in .env, never called by agent)
- Created `backend/services/ai_router.py` (tier-based AI routing: Elite→Sarvam+NVIDIA+Gemini, Pro→NVIDIA+Gemini, Starter→NVIDIA+Gemini, Free→NVIDIA+Gemini)
- Created `backend/routes/subscriptions.py` (GET /plans, GET /status, POST /create, POST /cancel)
- Created `backend/routes/webhooks.py` (POST /api/webhooks/razorpay with HMAC-SHA256 verification)
- Updated `backend/main.py`: router registration, quota middleware wired into /api/scan, new scan endpoint with tier-based routing

### Phase 3 — Payment Setup & Bug Fixes ✅
- **Render Deployment Fix**: Fixed `NameError: name 'RAZORPAY_PLAN_IDS' is not defined` in `subscriptions.py` by replacing top-level dictionary references with `None` defaults (dynamically injected in `/plans` route) and restored `router = APIRouter(...)` in `webhooks.py`.
- **Import Order Fix**: `main.py` now calls `load_dotenv()` before route imports.
- Verified backend import via `python -c "import main; print('OK')"` — passes cleanly with 0 errors.
- Configured local environment files (`backend/.env` and `frontend/.env.local`) with live Razorpay Key ID (`rzp_test_TJnCHL1p8iDlzM`), Razorpay Secret, Webhook Secret, Subscription Plan IDs (`plan_TJnZj0mYVfrW7N`, `plan_TJncvgHhDOKAaA`, `plan_TJneBOM7B71JUl`), and Sarvam AI Key.
- Sanitized `backend/.env.example` and created `frontend/.env.example` templates for safe version control.



### Phase 4 — Frontend ✅
- Created `frontend/src/components/PricingPage.tsx` (4-tier card UI with Razorpay checkout integration)
- Created `UpgradeModal.tsx` (quota limit popup with upgrade options)
- Created `UsageIndicator.tsx` (scan bar for Dashboard — compact + full variants)
- Created `SubscriptionBadge.tsx` (tier badge for Profile + Dashboard)
- Created `PaymentStatus.tsx` (success/failure screen with copyable UPI receipt + contact support)
- Updated `UserStatsContext.tsx` (tier, scansUsed, scanLimit, upgradePlan, refreshSubscription, showUpgradeModal)
- Updated `App.tsx` (pricing tab, PaymentStatus overlay, payment event listeners)
- Updated `Dashboard.tsx` (UpgradeModal + UsageIndicator + SubscriptionBadge integration)
- Updated `Profile.tsx` (SubscriptionBadge integration)

**Build:** ✅ `npm run build` passed — 1793 modules, 0 TypeScript errors
**Backend syntax:** ✅ All 6 new Python files pass `py_compile`

---

## ✅ Completed Features

### Core Infrastructure
- [x] **Project Bootstrap** — React 19 + Vite + TypeScript frontend with Tailwind CSS v4
- [x] **FastAPI Backend** — Python backend with async architecture
- [x] **MongoDB Integration** — `motor` async driver connected to MongoDB Atlas (`Z-sehealth` DB)
- [x] **Firebase Authentication** — Google sign-in + email/password auth on the frontend
- [x] **Firebase Admin SDK** — Backend token verification on all protected routes
- [x] **CORS Setup** — Configured for localhost + `*.vercel.app` wildcard

### Authentication & User System
- [x] **Login Modal** — `LoginModal.tsx` — Google and email/password sign-in
- [x] **Auth Context** — `AuthContext.tsx` — Firebase user state management
- [x] **User Sync** — `POST /api/auth/sync` — Syncs Firebase user to MongoDB on login
- [x] **Login Streak** — Streak counter incremented on consecutive daily logins

### Dashboard
- [x] **Dashboard UI** — `Dashboard.tsx` — Daily macro rings, streak display, recent meal log
- [x] **User Stats Context** — `UserStatsContext.tsx` — Fetches and manages daily stats (calories, protein, carbs, fat)
- [x] **Quick Scan Camera** — Camera container on Dashboard that captures photo and navigates to Scan tab with image pre-loaded
- [x] **Streak Display** — Shown in navbar (desktop) and Dashboard

### Search Tab
- [x] **Food Search** — `Search.tsx` — Searches MongoDB `foods` collection by name
- [x] **AI Fallback** — When DB returns no results, triggers Ollama → NVIDIA → Gemini AI chain to generate food data
- [x] **Non-Food Detection** — AI returns `{"error": "..."}` for non-food queries, displayed as a user-friendly error
- [x] **Recently Viewed** — LocalStorage-persisted carousel of last 15 clicked food items
- [x] **Show More Pagination** — `visibleCount` state controls how many grid cards are shown (18 at a time)
- [x] **Multiple Log Meal Selection** — Multi-select food cards with:
  - Emerald border highlight + `X Selected` badge on selected cards
  - Per-card `−` / `Selected (N)` / `+` controls
  - Bottom-right floating counter bar (slide-up animation) with `−`, count, `+`, and clear `X`
  - Top-right Tick confirmation button (below navbar, `top-32 md:top-28`) with total count badge
  - `logMultipleMeals()` batch API call on confirmation
  - Success toast notification on completion
- [x] **Language Translator Modal** — Translates all ingredient names/descriptions to 50+ Indian languages
- [x] **Language Search** — Search filter inside the translator modal
- [x] **Options Modal** — Per-food-item options popup (translator + "Coming Soon" stubs)

### Scan Tab
- [x] **Scan Page** — `Scan.tsx` — Camera capture or image upload
- [x] **AI Image Analysis** — Sends image to Ollama → NVIDIA Vision → Gemini vision fallback chain
- [x] **Non-Food Image Detection** — Returns `has_ingredients: false` for non-food images
- [x] **Log Meal from Scan** — Scan results include a "Log Meal" button

### Profile & Settings
- [x] **Profile Page** — `Profile.tsx` — Edit health profile (age, gender, height, weight)
- [x] **Preferences** — Diet type and allergy settings
- [x] **Settings Page** — `Settings.tsx` — Notifications, dark mode, language preference toggle
- [x] **User Profile Context** — `UserProfileContext.tsx` — Fetches/saves user profile and settings

### Backend AI System
- [x] **Multi-model Fallback Chain** — Ollama → NVIDIA (multi-key) → Gemini for: scan, search, translate, macros
- [x] **Multiple NVIDIA API Keys** — Rotates through `NVIDIA_API_KEY` through `NVIDIA_API_KEY_5`
- [x] **Configurable AI Models** — `NVIDIA_VISION_MODEL` and `NVIDIA_TEXT_MODEL` via `.env`
- [x] **Macro Estimation** — `POST /api/user/log_meal` estimates nutrition macros via AI + updates daily stats
- [x] **Translation API** — `POST /api/translate` batch-translates ingredient lists
- [x] **Food Seeding** — Auto-seeds DB with 1,000 Indian food items on first startup

### Config & DevOps
- [x] **Centralized API_BASE** — `frontend/src/config.ts` — Single source of truth for API URL (trailing slash stripped)
- [x] **Environment Variable Templates** — `.env.example` documents all required keys
- [x] **GitHub Repository** — `https://github.com/farhanahmad2106-cpu/Z-SeHealth` — main branch

---

## 🔨 Currently Active / In-Progress

> Update this section whenever starting new work. Mark as done when merged.

| Status | Feature | File(s) | Notes |
|---|---|---|---|
| ✅ Done | RULES.md + MEMORY.md | `RULES.md`, `MEMORY.md` | Created this session |
| 💤 Paused | Freemium Subscription Model | Multiple files (TBD) | Detailed footprint saved — not yet started |

---

## 📂 Key Files Reference

| File | Purpose | Last Modified |
|---|---|---|
| `frontend/src/App.tsx` | Root app, sticky navbar, tab-based routing + `/admin` route guard | **2026-09-14** |
| `frontend/src/config.ts` | `API_BASE` constant (single source of truth) | 2026-07-30 |
| `frontend/src/firebase.ts` | Firebase app + Auth initialization | 2026-06-25 |
| `frontend/src/index.css` | Tailwind v4 import, CSS variables, custom utilities | 2026-06-25 |
| `frontend/src/components/Dashboard.tsx` | Dashboard UI + quick scan camera | 2026-07-30 |
| `frontend/src/components/Search.tsx` | Search + multi-meal selection | 2026-07-30 |
| `frontend/src/components/Scan.tsx` | AI food scanning | 2026-07-30 |
| `frontend/src/components/Profile.tsx` | Health profile editing | 2026-06-25 |
| `frontend/src/components/Settings.tsx` | App settings | 2026-06-25 |
| `frontend/src/components/auth/LoginModal.tsx` | Firebase login UI | 2026-06-25 |
| `frontend/src/components/ProfileDropdown.tsx` | User dropdown menu + Admin Operations link | **2026-09-14** |
| `frontend/src/context/AuthContext.tsx` | Firebase auth state | 2026-06-25 |
| `frontend/src/context/AdminAuthContext.tsx` | Admin RBAC state & token verification | **2026-09-14** |
| `frontend/src/components/admin/AdminRouteGuard.tsx` | Brutalist 403 access control screen | **2026-09-14** |
| `frontend/src/components/admin/AdminDashboard.tsx` | Admin master shell & active tab controller | **2026-09-14** |
| `frontend/src/components/admin/tabs/OverviewTab.tsx` | Real-time platform KPIs & MRR analytics | **2026-09-14** |
| `frontend/src/components/admin/tabs/FoodModerationTab.tsx` | Crowdsourced OCR review & global approval | **2026-09-14** |
| `frontend/src/components/admin/tabs/UserManagementTab.tsx` | User table, scan quota resets & ban toggles | **2026-09-14** |
| `frontend/src/components/admin/tabs/AdminTeamTab.tsx` | Super Admin team invite, permissions & revoke | **2026-09-14** |
| `frontend/src/components/admin/tabs/SystemLogsTab.tsx` | Monospace structured exception stream viewer | **2026-09-14** |
| `frontend/src/components/admin/tabs/AdminOtaManager.tsx` | EAS update inspector & GitHub Actions hotfixes | **2026-09-14** |
| `backend/main.py` | FastAPI app, router registrations, and collections | **2026-09-14** |
| `backend/schemas/scan.py` | OCR analysis response models and macronutrient schemas | **2026-09-14** |
| `backend/services/ocr_service.py` | Multi-tier vision OCR pipeline (Gemini 2.5 Flash, NVIDIA, Sarvam) | **2026-09-14** |
| `backend/routes/scan.py` | Multipart image ingestion & isolated unverified food queuing | **2026-09-14** |
| `backend/schemas/admin.py` | Admin RBAC & governance Pydantic schemas | **2026-09-14** |
| `backend/routes/admin.py` | Protected admin endpoints with RBAC dependency | **2026-09-14** |

| `backend/requirements.txt` | Python dependencies (pinned) | 2026-07-30 |
| `backend/seed_1000.py` | 1000 Indian food DB seeder | 2026-06-25 |
| `backend/mock_foods.json` | Fallback food data (local) | 2026-06-25 |
| `backend/.env` | Local secrets (NOT committed) | — |
| `backend/.env.example` | Secret key template | 2026-07-30 |
| `RULES.md` | Development rules and conventions | 2026-07-30 |
| `MEMORY.md` | This file — project state | **2026-09-14** |
| `Z-SeHealth_project_features.md` | Feature list and roadmap | **2026-09-14** |
| `app.json` | Expo updates config & runtimeVersion policy | 2026-09-03 |
| `eas.json` | EAS build and channel matrix (dev/preview/prod) | 2026-09-03 |
| `src/services/updateManager.ts` | OTA update listener, downloader & lifecycle hook | 2026-09-03 |
| `src/store/telemetryStore.ts` | Hardware metrics & OTA error logging store | 2026-09-03 |
| `App.tsx` | Mobile root integration with OTA toast UI | 2026-09-03 |
| `.github/workflows/ota-deploy.yml` | GitHub Actions automated OTA deploy pipeline | 2026-09-03 |

---

## 📡 API Endpoints Reference

| Method | Endpoint | Auth Required | Purpose |
|---|---|---|---|
| `GET` | `/api/foods?search=` | ❌ | Search food items (DB + AI fallback, verified only) |
| `POST` | `/api/translate` | ❌ | Batch translate ingredient text |
| `POST` | `/api/scan` | ❌ | Analyze food image via AI vision |
| `POST` | `/api/auth/sync` | ❌ | Sync Firebase user to MongoDB |
| `GET` | `/api/user/stats` | ✅ | Get daily macro stats + streak |
| `POST` | `/api/user/log_meal` | ✅ | Log a meal + estimate macros via AI |
| `GET` | `/api/user/profile` | ✅ | Get user health profile + settings |
| `POST` | `/api/user/profile` | ✅ | Save user health profile + settings |
| `POST` | `/api/admin/auth/verify` | 🛡️ Admin | Verify admin session & load RBAC permissions |
| `GET` | `/api/admin/team` | 👑 Super Admin | List all team moderators & admins |
| `POST` | `/api/admin/team/invite` | 👑 Super Admin | Invite new administrator or moderator |
| `PATCH` | `/api/admin/team/{admin_id}` | 👑 Super Admin | Update admin permissions / active state |
| `DELETE` | `/api/admin/team/{admin_id}` | 👑 Super Admin | Revoke & remove administrator |
| `GET` | `/api/admin/foods/pending` | 🛡️ Mod | Fetch unverified crowdsourced scans |
| `POST` | `/api/admin/foods/{food_id}/approve` | 🛡️ Mod | Approve food item to global DB |
| `POST` | `/api/admin/foods/{food_id}/reject` | 🛡️ Mod | Reject / archive invalid OCR extraction |
| `GET` | `/api/admin/users` | 🛡️ Mod | Paginated users list with tier & quotas |
| `POST` | `/api/admin/users/{user_id}/reset-quota` | 🛡️ Mod | Reset user scan counter to 0/20 |
| `POST` | `/api/admin/users/{user_id}/toggle-ban` | 🛡️ Mod | Toggle account suspension / ban |
| `GET` | `/api/admin/logs` | 🛡️ Mod | Query system telemetry & exception stream |
| `GET` | `/api/admin/analytics/overview` | 🛡️ Admin | Real-time KPIs, active subs & estimated MRR |
| `GET` | `/api/admin/ota/releases` | 🛡️ Mod | Query active EAS update releases |
| `POST` | `/api/admin/ota/dispatch` | 🛡️ Mod | Dispatch GitHub Actions OTA hotfix build |

---

## 🗃️ MongoDB Collections

### `admins` collection (RBAC Isolated)
```json
{
  "_id": "ObjectId",
  "email": "farhanahmad2106@gmail.com",
  "name": "Farhan Ahmad",
  "uid": "firebase_uid",
  "is_super_admin": true,
  "is_active": true,
  "permissions": {
    "canManageAdmins": true,
    "canManageUsers": true,
    "canApproveFoods": true,
    "canTriggerOTA": true,
    "canViewRevenue": true,
    "canViewLogs": true
  },
  "created_at": "2026-09-14T00:00:00Z",
  "last_login": "2026-09-14T12:00:00Z"
}
```

### `system_logs` collection (Telemetry & Exceptions)
```json
{
  "_id": "ObjectId",
  "timestamp": "2026-09-14T12:00:00Z",
  "level": "ERROR",
  "service": "AI_Router",
  "message": "NVIDIA API rate limited (429), failing over to Gemini Flash",
  "details": {
    "model": "meta/llama-3.1-8b-instruct",
    "fallback_attempt": 2
  }
}
```

### `users` collection
```json
{
  "uid": "firebase_uid",
  "email": "user@email.com",
  "name": "Display Name",
  "picture": "https://...",
  "last_login_date": "2026-07-30",
  "streak": 5,
  "stats": {
    "calories": 1200,
    "protein": 45,
    "carbs": 130,
    "fat": 40,
    "last_updated": "2026-07-30"
  },
  "health_profile": {
    "age": 25,
    "gender": "Male",
    "height": 175,
    "weight": 70
  },
  "preferences": {
    "diet": "None",
    "allergies": []
  },
  "settings": {
    "notificationsEnabled": true,
    "darkMode": true,
    "language": "English"
  }
}
```

### `foods` collection
```json
{
  "_id": "ObjectId",
  "name": "Paneer Butter Masala",
  "brand": "Homemade",
  "safety_score": 82,
  "status": "Safe",
  "ingredients": [
    { "name": "Paneer", "safety": "Safe", "description": "Fresh Indian cottage cheese" }
  ],
  "warnings": [],
  "source": "ai_fallback"  // optional — present for AI-generated entries
}
```

---

## 🛣️ Planned Features (Roadmap)

### 🔴 HIGH PRIORITY — Freemium Model
- [ ] MongoDB schema update (`tier`, `subscription`, `usage` fields on `users`)
- [ ] Razorpay subscription plans (₹366 / ₹732 / ₹998)
- [ ] `POST /api/subscription/create` + `GET /api/subscription/status`
- [ ] `POST /api/webhooks/razorpay` with HMAC verification
- [ ] Scan quota middleware (`check_scan_quota`)
- [ ] Tier-based AI routing (`ai_router.py`)
- [ ] Sarvam AI integration (`services/sarvam_client.py`)
- [ ] Frontend `PricingPage.tsx`
- [ ] Frontend `UpgradeModal.tsx` (triggered on quota limit)
- [ ] Frontend `UsageIndicator.tsx` (scan bar on Dashboard)
- [ ] Monthly scan counter reset (cron / scheduler)

### 🟡 MEDIUM PRIORITY
- [ ] **Smart Meal Planning** — Weekly meal plans + grocery lists
- [ ] **Dietary Restriction Filters** — Auto-flag Keto/Vegan/Halal/Gluten-Free conflicts
- [ ] **Advanced Analytics & Charts** — Macro trend graphs over weeks/months
- [ ] **Barcode Scanner** — Scan packaged food barcodes via open food database

### 🟢 FUTURE IDEAS
- [ ] **Wearable Integration** — Google Fit / Apple Health sync
- [ ] **Community Challenges** — Share meals, join health challenges
- [ ] **Voice Input** — Sarvam AI speech-to-text for hands-free food logging (Elite tier)
- [ ] **Explain Briefly** — AI explains what each ingredient does (Options modal stub)
- [ ] **Manufacturer Details** — Show brand/manufacturer info (Options modal stub)
- [ ] **Suggest From This Brand** — Recommend healthier alternatives from same brand

---

## ⚙️ Environment Variables Required

### Backend (`backend/.env`)
```env
MONGODB_URI=mongodb+srv://...
GEMINI_API_KEY=...
NVIDIA_API_KEY=...
NVIDIA_API_KEY_1=...
NVIDIA_API_KEY_2=...
NVIDIA_API_KEY_3=...
NVIDIA_API_KEY_4=...
NVIDIA_API_KEY_5=...
NVIDIA_VISION_MODEL=meta/llama-3.2-11b-vision-instruct
NVIDIA_TEXT_MODEL=meta/llama-3.1-8b-instruct
FIREBASE_CREDENTIALS={"type":"service_account",...}
# --- PLANNED (Freemium) ---
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
RAZORPAY_PLAN_ID_STARTER=
RAZORPAY_PLAN_ID_PRO=
RAZORPAY_PLAN_ID_ELITE=
SARVAM_API_KEY=
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=https://your-backend-url.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
# --- PLANNED (Freemium) ---
VITE_RAZORPAY_KEY_ID=
```

---

## 🐛 Known Issues / Technical Debt

| Issue | Severity | File | Notes |
|---|---|---|---|
| `alert()` still used in `UserStatsContext.tsx` (single meal log) | Low | `UserStatsContext.tsx` | Replace with toast in future cleanup |
| No loading state on batch meal log (Tick button) | Low | `Search.tsx` | Spinner shows but no per-item progress |
| `main.py` is a monolith (830+ lines) | Medium | `backend/main.py` | Should be split into `routes/` when Freemium is built |
| No unit tests anywhere | Medium | Entire project | Add pytest (backend) + Vitest (frontend) in future |
| Notifications scheduled with `setTimeout` (not persistent) | Low | `UserStatsContext.tsx` | Use a proper push notification service eventually |

---

## 📝 Update Checklist (Run After Every Session)

After completing any work, update this file with:
- [ ] New "Last Session Summary" block at the top
- [ ] Move any completed items from "Planned" to "Completed"
- [ ] Update "Last Modified" dates in Key Files Reference
- [ ] Add any new API endpoints to the reference table
- [ ] Update MongoDB schema if new fields were added
- [ ] Add any new known issues discovered
- [ ] Update "Currently Active" table
