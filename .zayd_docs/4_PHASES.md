# 4. Multi-Stage Engineering Roadmap

> **Version:** 1.0 | **Date:** 2026-09-03

---

## Phase 1: Foundation & Instant Caching (TRL-3) — ✅ COMPLETED
**Duration:** Weeks 1–4 | **Status:** Shipped

### Deliverables
- [x] React + Vite + TypeScript + Tailwind CSS v4 frontend scaffold
- [x] FastAPI backend with Motor async MongoDB driver
- [x] Firebase Auth (Google OAuth + Email/Password)
- [x] `localStorage` SWR hydration for 0ms Search page loads
- [x] `DEFAULT_FALLBACK_FOODS` — 18+ regional Indian foods pre-populated
- [x] Non-blocking background API revalidation with sync badges
- [x] Tab-based navigation (Dashboard, Search, Scan, Profile, Settings)
- [x] Food search with AI fallback chain (Ollama → NVIDIA → Gemini)
- [x] Daily macro logging with AI-estimated nutrition
- [x] 1,000-item Indian food database auto-seeder

---

## Phase 2: Core Analysis Engine (TRL-4) — ✅ COMPLETED
**Duration:** Weeks 5–8 | **Status:** Shipped

### Deliverables
- [x] Multi-model vision AI scan (Ollama → NVIDIA Vision → Gemini)
- [x] Non-food image detection (`has_ingredients: false`)
- [x] Language translation engine (50+ Indian languages)
- [x] Multiple NVIDIA API key rotation (5-key pool)
- [x] Configurable AI models via `.env` (`NVIDIA_VISION_MODEL`, `NVIDIA_TEXT_MODEL`)
- [x] Site performance optimization (2-5 min → <1s instant load)
- [x] Windows Unicode crash fix for regional language logging

---

## Phase 3: Monetization & Personalization — ✅ COMPLETED
**Duration:** Weeks 9–12 | **Status:** Shipped

### Deliverables
- [x] Freemium tier system (Free/Starter/Pro/Elite)
- [x] Razorpay subscription integration (₹366/₹732/₹998)
- [x] Scan quota middleware with monthly reset
- [x] Tier-based AI routing (`ai_router.py`)
- [x] Sarvam AI client for Elite tier (`sarvam_client.py`)
- [x] PricingPage, UpgradeModal, UsageIndicator, SubscriptionBadge components
- [x] Razorpay webhook with HMAC-SHA256 verification
- [x] Health profile editor (age, gender, height, weight)
- [x] Dietary preference + allergy configuration

---

## Phase 4: Back-of-Pack OCR Engine — 🔨 IN PROGRESS
**Duration:** Weeks 13–16 | **Status:** Active Sprint

### Deliverables
- [x] OpenCV image preprocessing (Grayscale, Gaussian Blur, Adaptive Threshold)
- [x] pytesseract integration for raw text extraction
- [x] `POST /api/scan/ingredients` endpoint
- [x] Gemini Flash structuring with NVIDIA fallback
- [x] Frontend scan mode toggle (Food vs. Ingredients Label)
- [x] Dashed viewfinder overlay for label alignment
- [x] OCR results dashboard (macros, allergens, additives, ingredients)
- [ ] INS code normalization engine (300+ code mapping database)
- [ ] FSSAI Safety Score computation engine
- [ ] Medical vault cross-referencing during scan

---

## Phase 5: Vernacular Voice & Regional Language OCR — 🔮 PLANNED
**Duration:** Weeks 17–22

### Deliverables
- [ ] Sarvam AI Speech-to-Text for Hindi/Tamil/Telugu/Bengali
- [ ] Voice-based food query ("Yeh kya hai?" → scan result)
- [ ] Devanagari/Tamil script OCR on food labels
- [ ] Audio safety feedback (TTS warning playback)
- [ ] Multi-language Safety Score report generation

---

## Phase 6: Z-AI Chatbot & Edge Computing — 🔮 PLANNED
**Duration:** Weeks 23–30

### Deliverables
- [ ] React Native Expo mobile app with `llama.cpp` GGUF engine
- [ ] CPU/RAM/SSD real-time telemetry (`useTelemetryStore`)
- [ ] SQLCipher encrypted offline chat storage
- [ ] Convex real-time sync for conversations/messages
- [ ] Next.js Admin Dashboard with feature flag management
- [ ] Remote model deployment and version management

---

## Phase 7: Enterprise & Compliance — 🔮 PLANNED
**Duration:** Weeks 31–40

### Deliverables
- [ ] DPDP Act (Digital Personal Data Protection) full compliance audit
- [ ] FSSAI API integration for real-time regulatory updates
- [ ] Wearable sync (Google Fit, Apple Health)
- [ ] Community challenges and social features
- [ ] Smart meal planning with grocery list generation
- [ ] Barcode scanner integration with Open Food Facts
