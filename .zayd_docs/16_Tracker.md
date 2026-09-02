# 16. Autonomous Agent Project Execution Tracker

> **Version:** 1.0 | **Date:** 2026-09-03
> **Format:** Machine-parseable state machine for autonomous agents.

---

## Legend & Status Codes
- `[ ] TODO` : Unclaimed atomic task ticket.
- `[/] IN_PROGRESS` : Currently locked and being executed by an agent.
- `[X] COMPLETED` : Implemented, unit-tested, and verified against acceptance gates.
- `[!] BLOCKED` : Blocked by dependency, rate limit, or external input.

## Execution Rules for Agents
1. When claiming a task, change `[ ]` to `[/]` and populate `Owner: <Agent_ID>`.
2. Do not mark `[X]` until the specific command listed under `Verify:` passes with exit code 0.
3. Keep task tickets atomic: One file modification or endpoint verification per ticket.
4. After completing a task, update `MEMORY.md` with the file modified and timestamp.
5. If a task is blocked, change to `[!]` and add `Blocked_By: <reason>` on same line.

---

## Sprint Workstreams

### Workstream 1: Back-of-Pack OCR & Ingredient Parser Pipeline

- [X] `TSK-OCR-01` | Create OpenCV preprocessing pipeline (grayscale, blur, adaptive threshold) | File: `backend/services/ocr_engine.py` | Verify: `python -c "from services.ocr_engine import extract_text_from_image; print('OK')"` | Owner: Antigravity | Completed: 2026-09-02
- [X] `TSK-OCR-02` | Integrate pytesseract for raw text extraction | File: `backend/services/ocr_engine.py` | Verify: `python -c "import pytesseract; print(pytesseract.get_tesseract_version())"` | Owner: Antigravity | Completed: 2026-09-02
- [X] `TSK-OCR-03` | Create POST /api/scan/ingredients endpoint | File: `backend/main.py` | Verify: `python -m py_compile backend/main.py` | Owner: Antigravity | Completed: 2026-09-02
- [X] `TSK-OCR-04` | Wire Gemini Flash as primary LLM structuring engine for OCR | File: `backend/main.py` | Verify: `python -m py_compile backend/main.py` | Owner: Antigravity | Completed: 2026-09-02
- [X] `TSK-OCR-05` | Add scan mode toggle (Food vs. Ingredients Label) in frontend | File: `frontend/src/components/Scan.tsx` | Verify: `npx tsc --noEmit` | Owner: Antigravity | Completed: 2026-09-02
- [X] `TSK-OCR-06` | Build viewfinder dashed overlay for label alignment | File: `frontend/src/components/Scan.tsx` | Verify: `npx tsc --noEmit` | Owner: Antigravity | Completed: 2026-09-02
- [X] `TSK-OCR-07` | Render OCR results dashboard (macros grid, allergens, additives, ingredients pills) | File: `frontend/src/components/Scan.tsx` | Verify: `npm run build` | Owner: Antigravity | Completed: 2026-09-02
- [X] `TSK-OCR-08` | Add defensive Array.isArray() checks for all .map() calls on API response fields | File: `frontend/src/components/Scan.tsx` | Verify: `npx tsc --noEmit` | Owner: Antigravity | Completed: 2026-09-02

- [ ] `TSK-OCR-09` | Build INS code normalization database (300+ FSSAI codes) | File: `backend/services/ingredient_parser.py` | Verify: `pytest tests/test_ins_parser.py`
- [ ] `TSK-OCR-10` | Implement extract_ins_codes() regex function | File: `backend/services/ingredient_parser.py` | Verify: `pytest tests/test_ins_parser.py -k test_extract`
- [ ] `TSK-OCR-11` | Implement normalize_ingredients() full pipeline function | File: `backend/services/ingredient_parser.py` | Verify: `pytest tests/test_ins_parser.py -k test_normalize`
- [ ] `TSK-OCR-12` | Build Safety Score computation engine | File: `backend/services/safety_engine.py` | Verify: `pytest tests/test_safety_score.py`
- [ ] `TSK-OCR-13` | Wire safety engine into /api/scan/ingredients route | File: `backend/main.py` | Verify: `curl -X POST -H "Content-Type: application/json" -d '{"image":"test"}' http://localhost:8000/api/scan/ingredients`
- [ ] `TSK-OCR-14` | Add medical vault cross-reference during OCR scan (fetch user health_profile) | File: `backend/main.py` | Verify: `python -m py_compile backend/main.py`
- [ ] `TSK-OCR-15` | Add Safety Score ring + tier badge to OCR results dashboard | File: `frontend/src/components/Scan.tsx` | Verify: `npm run build`
- [ ] `TSK-OCR-16` | Add medical conflict warning banner to OCR results | File: `frontend/src/components/Scan.tsx` | Verify: `npm run build`
- [ ] `TSK-OCR-17` | Add penalty breakdown accordion to OCR results | File: `frontend/src/components/Scan.tsx` | Verify: `npm run build`

---

### Workstream 2: Frontend Performance & Caching Refinement

- [X] `TSK-FE-01` | Instant 0ms SWR caching on Search page with fallback DB | File: `frontend/src/components/Search.tsx` | Verify: Built cleanly | Owner: — | Completed: 2026-07-30
- [X] `TSK-FE-02` | Dynamic quote rotation timer (8s short vs 15s long) & CSS sync | File: `frontend/src/components/LandingLoadingOverlay.tsx` | Verify: Built cleanly | Owner: — | Completed: 2026-07-30
- [X] `TSK-FE-03` | Non-blocking background API revalidation with sync badges | File: `frontend/src/components/Search.tsx` | Verify: Built cleanly | Owner: — | Completed: 2026-07-30
- [ ] `TSK-FE-04` | Editable ingredient verification drawer post-OCR scan | File: `frontend/src/components/IngredientReviewModal.tsx` | Verify: `npm run build`
- [ ] `TSK-FE-05` | Toast notification system (replace remaining alert() calls) | File: `frontend/src/components/Toast.tsx` | Verify: `npm run build`
- [ ] `TSK-FE-06` | Add scan history page (last 20 scans stored in localStorage) | File: `frontend/src/components/ScanHistory.tsx` | Verify: `npm run build`

---

### Workstream 3: Monetization & Subscription

- [X] `TSK-PAY-01` | Freemium tier MongoDB schema (tier, subscription, usage fields) | File: `backend/main.py` | Verify: py_compile | Owner: — | Completed: 2026-07-30
- [X] `TSK-PAY-02` | Razorpay subscription create/cancel endpoints | File: `backend/routes/subscriptions.py` | Verify: py_compile | Owner: — | Completed: 2026-07-30
- [X] `TSK-PAY-03` | Razorpay webhook with HMAC-SHA256 verification | File: `backend/routes/webhooks.py` | Verify: py_compile | Owner: — | Completed: 2026-07-30
- [X] `TSK-PAY-04` | Scan quota middleware (monthly reset-on-read) | File: `backend/middleware/quota_check.py` | Verify: py_compile | Owner: — | Completed: 2026-07-30
- [X] `TSK-PAY-05` | PricingPage.tsx with 4-tier card UI | File: `frontend/src/components/PricingPage.tsx` | Verify: build | Owner: — | Completed: 2026-07-30
- [X] `TSK-PAY-06` | UpgradeModal.tsx triggered on quota limit | File: `frontend/src/components/UpgradeModal.tsx` | Verify: build | Owner: — | Completed: 2026-07-30

---

### Workstream 4: Profile, Settings & Auth

- [X] `TSK-AUTH-01` | Firebase Google OAuth + Email/Password auth | File: `frontend/src/context/AuthContext.tsx` | Verify: build | Owner: — | Completed: 2026-06-25
- [X] `TSK-AUTH-02` | Firebase Admin token verification on backend | File: `backend/main.py` | Verify: py_compile | Owner: — | Completed: 2026-06-25
- [X] `TSK-AUTH-03` | Health profile editor (age, gender, height, weight) | File: `frontend/src/components/Profile.tsx` | Verify: build | Owner: — | Completed: 2026-08-01
- [X] `TSK-AUTH-04` | Dietary preferences + allergy configuration modal | File: `frontend/src/components/Profile.tsx` | Verify: build | Owner: — | Completed: 2026-08-01
- [X] `TSK-AUTH-05` | Profile photo edit modal (avatar, upload, URL) | File: `frontend/src/components/Profile.tsx` | Verify: build | Owner: — | Completed: 2026-08-01
- [X] `TSK-AUTH-06` | Settings page interactive sidebar tabs | File: `frontend/src/components/Settings.tsx` | Verify: build | Owner: — | Completed: 2026-08-01

---

### Workstream 5: Backend Stability & Performance

- [X] `TSK-PERF-01` | Non-blocking async DB init (asyncio.create_task) | File: `backend/main.py` | Verify: py_compile | Owner: — | Completed: 2026-08-01
- [X] `TSK-PERF-02` | Motor client 3000ms server selection timeout | File: `backend/main.py` | Verify: py_compile | Owner: — | Completed: 2026-08-01
- [X] `TSK-PERF-03` | Font preconnect optimization | File: `frontend/index.html` | Verify: build | Owner: — | Completed: 2026-08-01
- [X] `TSK-PERF-04` | Fix Windows Unicode crash (ascii() in print) | File: `backend/main.py` | Verify: py_compile | Owner: — | Completed: 2026-08-28
- [X] `TSK-PERF-05` | Fix Gemini Client module-level crash (lazy init) | File: `backend/main.py` | Verify: py_compile | Owner: — | Completed: 2026-08-28
- [ ] `TSK-PERF-06` | Split main.py monolith into routes/ modules | File: `backend/routes/*.py` | Verify: `python -c "from main import app; print('OK')"`

---

### Workstream 6: Testing Infrastructure

- [ ] `TSK-TEST-01` | Create pytest configuration and test directory structure | File: `backend/tests/__init__.py`, `backend/pytest.ini` | Verify: `pytest --collect-only`
- [ ] `TSK-TEST-02` | Write Safety Score unit tests (20 edge cases) | File: `backend/tests/test_safety_score.py` | Verify: `pytest tests/test_safety_score.py`
- [ ] `TSK-TEST-03` | Write INS parser unit tests | File: `backend/tests/test_ins_parser.py` | Verify: `pytest tests/test_ins_parser.py`
- [ ] `TSK-TEST-04` | Write AI failover simulation tests | File: `backend/tests/test_failover.py` | Verify: `pytest tests/test_failover.py`
- [ ] `TSK-TEST-05` | Add Vitest frontend configuration | File: `frontend/vitest.config.ts` | Verify: `npm test`
- [ ] `TSK-TEST-06` | Write SWR cache invalidation tests | File: `frontend/tests/cache.test.ts` | Verify: `npm test`

---

### Workstream 7: Vernacular Voice & Regional Language (Phase 5 — PLANNED)

- [ ] `TSK-VOICE-01` | Integrate Sarvam AI STT client | File: `backend/services/sarvam_client.py` | Verify: `pytest tests/test_sarvam_stt.py`
- [ ] `TSK-VOICE-02` | Build NLU intent classifier for Hindi voice queries | File: `backend/services/nlu_processor.py` | Verify: `pytest tests/test_nlu.py`
- [ ] `TSK-VOICE-03` | Integrate Sarvam AI TTS client for audio responses | File: `backend/services/sarvam_client.py` | Verify: `pytest tests/test_sarvam_tts.py`
- [ ] `TSK-VOICE-04` | Add voice button to Scan tab with recording UI | File: `frontend/src/components/Scan.tsx` | Verify: `npm run build`

---

### Workstream 8: Z-AI Chatbot & Edge Computing (Phase 6 — PLANNED)

- [ ] `TSK-CHAT-01` | Initialize React Native Expo project | File: `mobile/` | Verify: `npx expo start --no-dev --minify`
- [ ] `TSK-CHAT-02` | Integrate llama.cpp GGUF model loader | File: `mobile/services/llm_engine.ts` | Verify: Model loads without OOM
- [ ] `TSK-CHAT-03` | Build useTelemetryStore (CPU/RAM/Thermal polling) | File: `mobile/stores/telemetryStore.ts` | Verify: Telemetry renders in HUD
- [ ] `TSK-CHAT-04` | Wire Convex real-time sync for conversations | File: `convex/conversations.ts` | Verify: `npx convex dev`
- [ ] `TSK-CHAT-05` | Build Next.js Admin Dashboard with feature flags | File: `admin-dashboard/` | Verify: `npm run build`

---

## Summary Statistics

| Status | Count |
|---|---|
| ✅ Completed | 24 |
| 🔲 TODO | 26 |
| ⏳ In Progress | 0 |
| 🚫 Blocked | 0 |
| **Total Tickets** | **50** |
