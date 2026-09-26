# Z-SeHealth Project Features — Living Implementation Catalog

> **Living Documentation**: This document reflects the verified implementation state of the Z-SeHealth platform grounded directly in repository source code, automated test executions, and production build artifacts.

---

## 🚀 1. Core Live & Verified Features

### A. AI Food Vision & Fast Barcode Scanning
- **Continuous Camera Barcode Detection**: Integrated `@zxing/library` code-split into dedicated vendor chunk (`zxing-vendor.js`, 451.75 kB). Barcode detection runs client-side with 150ms scan intervals, camera facing controls, and flash support.
- **Canonical Ingestion & Moderation**: Primary scanning dispatches to `POST /api/scan/analyze` via multipart `FormData` with client-side image compression (`compressImageToBlob`).
- **Crowdsourced Food Safety Moderation**: Scans of uncatalogued items automatically queue with `is_verified: false`, `status: "pending_review"` for admin moderation without polluting the verified search index.
- **Verification & Review UI**: Dynamic badge indicates `✓ Verified Item` vs `⏳ Pending Moderation`, and `IngredientReviewModal` allows users to contribute additive and allergen corrections.

### B. Smart Meal Planning & Revolving 7-Day Scheduler
- **7-Day Dynamic Meal Plan**: Fully interactive weekly meal scheduler (`WeeklyMealPlanner.tsx`, `MealPlanner.tsx`, `backend/routes/meals.py`) with breakfast, lunch, snack, and dinner meal allocations.
- **Macro Optimization & Clinical Safety**: Automatic calculation of daily calories, protein, carbs, and fats matching user profile targets (`macroCalculator.ts`). Automatically flags clinical allergen and dietary conflicts (Keto, Vegan, Halal, Gluten-Free, Diabetic-friendly, Low-Sodium).
- **Slot Operations**: Instant slot swapping (`/api/meals/weekly-plan/swap-day-slot`), single-day meal regeneration (`/api/meals/weekly-plan/regenerate-day`), and meal locking (`/api/meals/weekly-plan/lock-slot`).
- **Regional Indian Language Translation**: Instant meal translation across 6 languages: English, Hindi (हिन्दी), Marathi (मराठी), Tamil (தமிழ்), Bengali (বাংলা), and Telugu (తెలుగు) via `POST /api/meals/translate`.
- **Custom User Recipes**: Full CRUD functionality for personal custom recipes via `GET, POST, DELETE /api/meals/custom-recipes`.

### C. Multi-Provider Quick-Commerce Grocery Export
- **One-Click Grocery Aggregation**: Aggregates all recipe ingredients across the active 7-day meal plan into consolidated shopping lists with category groupings.
- **Direct Store Deep-Linking**: Generates direct deep-links to 5 major quick-commerce delivery services across India:
  - **Blinkit** (`https://blinkit.com/s/?q=...`)
  - **Zepto** (`https://www.zeptonow.com/search?query=...`)
  - **Instamart / Swiggy** (`https://www.swiggy.com/instamart/search?custom_back=true&query=...`)
  - **BigBasket** (`https://www.bigbasket.com/ps/?q=...`)
  - **Amazon Fresh** (`https://www.amazon.in/s?k=...&i=nowstore`)
- **Security & XSS Defense**: Strict URL validation enforcing HTTP/HTTPS schemes, punycode domain whitelisting, and query sanitization to eliminate script and data URI injection vectors.

### D. Freemium Subscription Engine & Entitlement Gating
- **Authoritative Plan Entitlements (`backend/middleware/quota_check.py`)**:
  - `free`: 20 monthly scans, 0 smart meal planning features.
  - `starter` (₹366/mo): 100 monthly scans, basic meal planning.
  - `pro` (₹732/mo): 500 monthly scans, full 7-day revolving planner and quick-commerce export.
  - `elite` (₹998/mo): Unlimited scans (`None`), priority OCR, concierge nutrition.
- **Machine-Readable 403 Contract**: Gated endpoints return standardized `FEATURE_NOT_ENTITLED` error responses parsed by the frontend to trigger `<UpgradeModal />`.
- **Atomic Quota Reservation & Refund**: Uses atomic MongoDB updates (`$inc: 1` with condition `scans_used_this_month < limit`) to prevent race condition quota bypasses. Quota is automatically refunded if OCR processing or DB persistence fails.
- **Razorpay Fintech Integration**: End-to-end checkout flow (`PricingPage.tsx`, `routes/subscriptions.py`), payment verification, and webhook handling with HMAC-SHA256 signature verification and replay idempotency (`routes/webhooks.py`).

### E. Multi-Admin Audit Dashboard & Cryptographic Governance Ledger
- **Append-Only Immutability**: All administrative actions (`FOOD_APPROVED`, `USER_BANNED`, `SUBSCRIPTION_REFUNDED`, etc.) persist to `admin_audit_logs` without `PUT`/`PATCH`/`DELETE` endpoints.
- **Tamper Evidence**: Cryptographic SHA-256 `event_hash` computed over canonical JSON representation of each event.
- **Secret Sanitization**: Case-insensitive recursive sanitizer strips passwords, API keys, tokens, CVVs, and Razorpay secrets before database storage.
- **Streaming RFC 4180 CSV Export**: Motor cursor streaming with formula injection protection neutralizing spreadsheet execution prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`).
- **Super Admin Operations Hub**: Route-guarded (`AdminRouteGuard.tsx`), user governance, scan quota resets back to 0, moderation queue, OTA manager, and real-time MongoDB exception telemetry.

### F. Dark Brutalist Modal System & Toast Notifications
- **Zero Native Browser Dialogs**: 100% elimination of native `alert()` and `confirm()` calls across all frontend components.
- **Accessible Brutalist Dialog (`ConfirmModal.tsx`)**: Dark brutalist styling (`bg-slate-900 border border-slate-800 rounded-3xl`), `role="dialog"`, ARIA labels, focus trapping, Escape key handling, backdrop dismissal, and double-submit prevention.
- **Toast Notifications (`ToastContext.tsx`)**: Lightweight stacked toast system for non-blocking alerts and feedback.

### G. Production Offline-First PWA & Background Sync
- **Workbox Caching**: PWA service worker with `StaleWhileRevalidate` caching on public food search endpoints (24-hour expiration) and `CacheFirst` on static assets, fonts, and legal documents.
- **IndexedDB Offline Queue (`offlineSync.ts`)**: Meals logged while offline are queued in IndexedDB with retry tracking and automatically synced to the server upon network reconnection.
- **Live Connection Telemetry**: Real-time connection status pill banner indicating offline mode or pending meal sync count.

### H. Production Bundle Optimization & Safe Code-Splitting
- **Route/Tab-Level `React.lazy()`**: Heavy feature views (`AdminDashboard`, `MealPlanner`, `LegalViewer`, `Search`, `Profile`, `Settings`, `PricingPage`, and `Scan`) are dynamically imported on demand.
- **Dark Brutalist Suspense Boundary**: Active view rendering is protected by `<Suspense>` with accessible attributes (`role="status"`, `aria-live="polite"`, `aria-label="Loading view"`) and an emerald monospace loading spinner.
- **View-Level Error Shield (`ViewErrorBoundary.tsx`)**: Catches dynamic chunk load errors or network disruptions. Features `sessionStorage` and in-memory retry loop defense against infinite reloads, accessible semantics (`role="alert"`, `aria-live="assertive"`), dual recovery controls ("Force Reload" and "Dashboard" navigation), and automatic error clearing upon tab changes (`componentDidUpdate`).
- **Vite Manual Vendor Chunking**:
  - `react-vendor.js`: 182.33 kB (React 19, React-DOM)
  - `zxing-vendor.js`: 451.75 kB (@zxing barcode library — deferred until Scan tab is opened)
  - `lucide-vendor.js`: 27.09 kB (Lucide icons)
- **Initial Entry Bundle Size**: Reduced from **1,400.00 kB** down to **251.82 kB** (**-82.01% reduction**, 68.91 kB gzip), with **0 Vite chunk size warnings**.

---

## 🧪 2. Verified Automated Test Matrix

All test counts reflect executed test runs verified in the repository:

| Test Suite | Framework | Files | Tests Executed | Passed | Failed | Status |
|---|---|---|---|---|---|---|
| **Backend Pytest Suite** | `pytest 9.1.1` + `pytest-asyncio` | 16 files | 216 | **216** | 0 | **PASS (100%)** |
| **Frontend Vitest Suite** | `vitest 5.0.1` | 11 files | 148 | **148** | 0 | **PASS (100%)** |
| **TypeScript Typecheck** | `tsc -b` | Project | — | Clean | 0 errors | **PASS** |
| **Production Vite Build** | `vite build` | Production | — | Built in 11.15s | 0 warnings | **PASS** |
| **Total Automated Tests** | Combined | 27 files | 364 | **364** | 0 | **PASS (100%)** |

---

## 🛠️ 3. In Progress / Active Maintenance

- **Batch Meal Log Progress Detail**: Enhance `Search.tsx` batch meal log button to show per-item checklist progress in addition to the master loading spinner.
- **Scheduled Quota Reset Automation**: Wire scheduled cron/task trigger for automatic calendar-month scan quota resets.

---

## 🔮 4. Planned / Future Roadmap

- **Sarvam AI Voice Input**: Regional speech-to-text integration for hands-free meal logging and search (Elite tier).
- **Advanced Macro Trend Charts**: Interactive long-term macro trend visual graphs over weekly and monthly periods.
- **Wearable Device Synchronization**: Bi-directional calorie and activity synchronization with Google Health Connect / Apple HealthKit.
- **Community Challenges & Meal Sharing**: Opt-in social sharing of balanced recipes and healthy eating streaks.
