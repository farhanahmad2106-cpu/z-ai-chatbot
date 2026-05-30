# Z-AI Chatbot V1.0 — Comprehensive Implementation Plan

**Confirmed Inputs:**
- Platforms: Desktop (Windows) + Android — built simultaneously
- Default models: Phi-3 Mini + Gemma 2B
- Admin App: Android (personal) + Windows local web dashboard with role-based access
- Timeline: Quality first, but start now — ship fast without cutting corners
- Billing: Free tier now → Stripe + Razorpay at Day 36
- Sync: Desktop ↔ Android only (LAN), no cloud relay in V1.0
- Frontend: Extend existing theme/components, rewrite screens with `react-navigation`
- Backend: FastAPI from scratch in this project

---

## 1. Project Architecture Overview

The project is split into **3 independent apps** sharing a common backend core:

```text
Z-AI Chatbot Ecosystem
│
├── 1. user-app/          React Native (Expo) — Android + Desktop (Tauri or Electron wrapper)
│      └── FastAPI Backend running locally per-device
│
├── 2. admin-android/     Separate React Native app — your private Android admin panel
│
└── 3. admin-dashboard/   Next.js web dashboard — Windows-hosted, role-gated access
       └── Connects to your FastAPI backend via authenticated Admin API endpoints
```

---

## 2. Confirmed Technology Stack

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **User App Frontend** | React Native (Expo) + TypeScript | Cross-platform, existing theme/components re-used |
| **Navigation** | `react-navigation` v7 | Rewrite `App.tsx` from state-nav to stack/drawer |
| **Global State** | Zustand | Lightweight, hook-based, streaming-safe |
| **Local Backend** | FastAPI (Python 3.12+) | Async, typed, mature ecosystem |
| **Database** | SQLite + SQLCipher | Encrypted, offline-optimized, WAL mode |
| **AI Inference** | llama-cpp-python | CPU-first local GGUF execution |
| **Encryption** | libsodium / PyNaCl | Ed25519, XChaCha20-Poly1305 |
| **Sync Discovery** | mDNS / Zeroconf | LAN-only peer detection (Desktop ↔ Android) |
| **Admin Dashboard** | Next.js + TypeScript | Windows-local, deployable, role-gated |
| **Admin Android** | Separate React Native app | Your personal admin client |
| **Billing (Day 36+)** | Stripe + Razorpay | Dual gateway for global + India |
| **Scheduling** | APScheduler (Python) | Backups, sync queues, metrics polling |

---

## 3. Folder Structure — Full Expansion

```text
c:/Farhan Ahmad/Code Languages/Mr. Z/Anti Gravity/AI Chatbot/
│
├── user-app/                       # React Native User Application
│   ├── App.tsx                     # react-navigation root (replaces state-switch App.tsx)
│   ├── src/
│   │   ├── theme/                  # ✅ DONE — types.ts, index.ts
│   │   ├── types/
│   │   │   └── chat.ts             # ⚡ NEW — shared Message, Conversation types
│   │   ├── components/
│   │   │   ├── common/             # ✅ DONE — Button, Input, Card
│   │   │   ├── chat/               # ✅ DONE — ChatBubble, SystemMetrics
│   │   │   ├── navigation/
│   │   │   │   └── AppDrawer.tsx   # ⚡ NEW — extracted sidebar drawer
│   │   │   └── shared/
│   │   │       ├── Badge.tsx       # ⚡ NEW — reusable ONLINE/OFFLINE chips
│   │   │       ├── ProgressBar.tsx # ⚡ NEW — horizontal progress indicator
│   │   │       └── SegmentedBar.tsx# ⚡ NEW — storage distribution bar
│   │   ├── screens/
│   │   │   ├── SplashScreen.tsx    # ⚡ NEW
│   │   │   ├── UnlockScreen.tsx    # ⚡ NEW — PIN + biometric unlock
│   │   │   ├── ChatHomeScreen.tsx  # ♻️ REWRITE — react-navigation wiring
│   │   │   ├── DashboardScreen.tsx # ♻️ REWRITE — live API data
│   │   │   ├── ModelsScreen.tsx    # ⚡ NEW
│   │   │   ├── SyncScreen.tsx      # ⚡ NEW — LAN pairing
│   │   │   ├── BackupScreen.tsx    # ⚡ NEW
│   │   │   ├── SettingsScreen.tsx  # ⚡ NEW
│   │   │   └── UpgradeScreen.tsx   # ⚡ NEW (Day 36+)
│   │   ├── services/
│   │   │   ├── apiClient.ts        # ⚡ NEW — Axios + interceptors
│   │   │   ├── streamHandler.ts    # ⚡ NEW — SSE token streams
│   │   │   ├── ChatService.ts      # ⚡ NEW
│   │   │   ├── ModelService.ts     # ⚡ NEW
│   │   │   ├── SyncService.ts      # ⚡ NEW
│   │   │   ├── BackupService.ts    # ⚡ NEW
│   │   │   └── MetricsService.ts   # ⚡ NEW — SSE hardware metrics
│   │   └── stores/
│   │       ├── useChatStore.ts     # ⚡ NEW — Zustand
│   │       ├── useAuthStore.ts     # ⚡ NEW — PIN session tokens
│   │       ├── useTelemetryStore.ts# ⚡ NEW
│   │       └── useModelStore.ts    # ⚡ NEW
│
├── backend/                        # FastAPI Local Backend
│   ├── main.py
│   ├── requirements.txt
│   └── app/
│       ├── api/                    # REST Controllers (v1)
│       │   ├── chat.py
│       │   ├── models.py
│       │   ├── sync.py
│       │   ├── backups.py
│       │   ├── metrics.py          # SSE live telemetry endpoint
│       │   └── admin.py            # Admin-only gated endpoints
│       ├── services/               # Business Logic
│       │   ├── inference.py        # llama.cpp context manager
│       │   ├── sync_engine.py      # CRDT LAN mesh
│       │   ├── crypto.py           # libsodium wrapper
│       │   ├── scraper.py          # Playwright sandbox
│       │   └── backup_mgr.py       # Incremental archive
│       └── database/
│           ├── connection.py       # SQLCipher + WAL setup
│           └── models.py           # SQLAlchemy ORM schemas
│
├── admin-android/                  # Your Personal Admin App (React Native)
│   ├── App.tsx
│   └── src/
│       ├── screens/
│       │   ├── AdminDashboard.tsx
│       │   ├── UserManagement.tsx
│       │   ├── ModelUpdateScreen.tsx
│       │   ├── SystemLogs.tsx
│       │   └── FeatureFlags.tsx
│       └── services/
│           └── adminApiClient.ts   # Admin-scoped API client
│
└── admin-dashboard/                # Windows Web Dashboard (Next.js)
    ├── package.json
    └── src/
        ├── app/
        │   ├── dashboard/page.tsx
        │   ├── users/page.tsx
        │   ├── logs/page.tsx
        │   ├── models/page.tsx
        │   └── settings/page.tsx
        └── components/
```

---

## 4. Feature Matrix: User App vs. Admin App

### 4.1 User-Facing Application Features

| Feature | Status | Priority |
| :--- | :--- | :--- |
| PIN + biometric unlock | Build | P0 |
| Offline AI chat (Phi-3 / Gemma 2B streaming) | Build | P0 |
| Conversation history + search | Build | P0 |
| Model Manager (load/unload/configure GGUF) | Build | P0 |
| System Dashboard (CPU/RAM/storage) | Extend | P1 |
| Optional web search scraping toggle | Build | P1 |
| Desktop ↔ Android LAN sync | Build | P1 |
| Encrypted local backups (USB/NAS) | Build | P1 |
| Offline documentation center | Build | P2 |
| Export/import conversations | Build | P2 |
| Achievement system | Build | P2 |
| Stripe/Razorpay billing & upgrade screen | Day 36+ | P3 |

### 4.2 Admin App Features (Full Control)

| Feature | Admin Android | Admin Dashboard | Priority |
| :--- | :--- | :--- | :--- |
| User & license management | ✅ | ✅ | P0 |
| System monitoring (crash logs, telemetry) | ✅ | ✅ | P0 |
| Feature flags (toggle features remotely) | ✅ | ✅ | P0 |
| Remote config push (update settings) | ✅ | ✅ | P0 |
| Model update push (push new GGUFs to users) | ✅ | ✅ | P1 |
| Confirm and deploy live server changes | ✅ | ✅ | P1 |
| Analytics dashboard (usage stats, errors) | ❌ | ✅ | P1 |
| Role-based access (grant limited admin) | ❌ | ✅ | P1 |
| Billing & subscription management | ❌ | ✅ | Day 36+ |

---

## 5. Admin App — Security & Access Architecture

```text
Admin Access Control Model:

YOU (Owner Role)
├── Android Admin App  → Full admin token (never expires, stored in OS Keychain)
└── Windows Dashboard  → Same full admin token, protected by a secondary password layer
       │
       └── ROLE-GATED ACCESS (for collaborators you grant access to):
           ├── Read-Only Viewer  → Can see analytics/logs, cannot modify anything
           └── Editor Role      → Can modify feature flags and configs, cannot manage users
```

- Admin endpoints on FastAPI are protected by a **separate, high-entropy admin API key** — completely separate from user session tokens.
- Dashboard deploys locally on Windows but can optionally be deployed behind a private VPN-accessible URL for remote admin access.
- Every admin action that modifies the live server requires an **explicit confirmation step** before execution (no accidental deploys).

---

## 6. Phased Implementation Roadmap

### Phase 0 — Foundation (Days 1–7)
**Goal:** Backend boots, database encrypts, user can unlock the app.

- [ ] Scaffold FastAPI with SQLCipher connection (WAL mode, Argon2id PIN key derivation)
- [ ] Implement ORM models: `users`, `conversations`, `messages`, `models`, `backups`
- [ ] Build `SplashScreen.tsx` + `UnlockScreen.tsx` in React Native
- [ ] Implement `useAuthStore` (PIN session token management)
- [ ] Replace `App.tsx` with `react-navigation` stack navigator
- [ ] Wire unlock flow → Chat Home navigation
- **Exit criterion:** App launches, user sets PIN, encrypted database is created.

### Phase 1 — Core Chat Engine (Days 8–18)
**Goal:** User can have a full offline AI conversation.

- [ ] Install and configure `llama-cpp-python` with Phi-3 Mini + Gemma 2B
- [ ] Build `POST /api/v1/chat/message` with SSE streaming
- [ ] Implement `streamHandler.ts` (EventSource client)
- [ ] Build `useChatStore` with optimistic message updates
- [ ] Rewrite `ChatHomeScreen.tsx` with `react-navigation` + live API wiring
- [ ] Extract `AppDrawer.tsx` from inline modal
- [ ] Add `GET /api/v1/chat/conversations` + conversation history panel
- **Exit criterion:** Real local AI response streams progressively in the app.

### Phase 2 — Model Manager + Dashboard Live Data (Days 19–26)
**Goal:** User can manage models; dashboard shows real hardware data.

- [ ] Build `GET/POST /api/v1/models` endpoints
- [ ] Build `ModelsScreen.tsx` (install, load, unload, configure)
- [ ] Build `GET /api/v1/metrics/live` (SSE telemetry stream)
- [ ] Wire `DashboardScreen.tsx` to live API (replace mock data)
- [ ] Build shared `Badge.tsx`, `ProgressBar.tsx`, `SegmentedBar.tsx`
- [ ] Implement RAM-aware model load guard
- **Exit criterion:** Dashboard shows live CPU/RAM; user can switch models.

### Phase 3 — LAN Sync + Backups (Days 27–35)
**Goal:** Desktop ↔ Android sync works; backups run on schedule.

- [ ] Build mDNS/Zeroconf peer discovery service
- [ ] Build `POST /api/v1/sync/pair` with Ed25519 handshake
- [ ] Build `POST /api/v1/sync/push` + `pull` with CRDT merge
- [ ] Build `SyncScreen.tsx` (device list, pair flow, conflict resolution)
- [ ] Build APScheduler backup jobs with AES-256 archiving
- [ ] Build `BackupScreen.tsx`
- **Exit criterion:** Android and Desktop databases sync over LAN without data loss.

### Phase 4 — Admin Apps (Days 29–38, overlaps Phase 3)
**Goal:** Admin Android app and Windows dashboard are operational.

- [ ] Build admin-scoped FastAPI endpoints (`/api/admin/*`) with admin API key guard
- [ ] Scaffold `admin-dashboard/` Next.js project
- [ ] Build dashboard pages: Overview, Users, Logs, Feature Flags, Model Updates
- [ ] Build `admin-android/` React Native project
- [ ] Implement feature flag service (remote config push to user apps)
- [ ] Implement confirm-before-deploy action guard for live server changes
- [ ] Build role management (grant read-only / editor access to collaborators)
- **Exit criterion:** You can push a feature flag from your phone and see it reflected in the user app.

### Phase 5 — Billing Integration (Day 36–45)
**Goal:** Stripe + Razorpay are live; premium features are gated.

- [ ] Set up Stripe products + Razorpay plans
- [ ] Build `POST /api/v1/billing/verify` + `GET /api/v1/billing/status`
- [ ] Build `UpgradeScreen.tsx`
- [ ] Gate premium features (advanced models, sync relay, priority support)
- [ ] Add subscription management to admin dashboard
- **Exit criterion:** User can subscribe and access premium features; admin can revoke licenses.

### Phase 6 — Polish + Documentation (Days 44–52)
**Goal:** Production-ready, stable, and fully documented.

- [ ] Offline documentation bundle + search indexer
- [ ] Achievement system
- [ ] Conversation export/import (JSON + Markdown)
- [ ] Full error state coverage (all UX error paths implemented)
- [ ] Performance audit (FlatList memo, scroll optimization)
- [ ] Security audit (verify SQLCipher strength, no data leaks)
- [ ] Write developer README

---

## 7. Risk Areas & Mitigations

| Risk | Probability | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| llama.cpp RAM crash on low-end Android | High | High | Budget guard + auto-suggest smaller model before loading |
| LAN sync causes data divergence | Medium | High | CRDT merge + conflict wizard UI |
| Admin dashboard accidentally exposed publicly | Low | Critical | Bind to localhost only; VPN access optional |
| Billing goes live before backend is stable | Medium | Medium | Billing phase is strictly after Day 36; no partial rollouts |
| Playwright scraper blocked by search engines | High | Low | Async timeouts + fallback to direct markdown parser |
| Feature flag push causes user app crash | Low | High | Flags have rollback versions; confirm step before deploy |

---

## 8. Immediate Next Steps (What We Build First)

Based on your answers, the build order starts tomorrow:

1. **Initialize FastAPI project structure** with SQLCipher connection and Argon2id key derivation
2. **Scaffold `react-navigation`** and wire `SplashScreen` → `UnlockScreen` → `ChatHomeScreen`
3. **Install llama-cpp-python** with Phi-3 Mini + Gemma 2B configurations
4. **Build `useChatStore` Zustand store** and wire it to the streaming endpoint

> [!IMPORTANT]
> Please confirm if you want me to start with the backend (FastAPI) or the frontend navigation rewrite first. Starting both simultaneously is possible but requires context switching.

> [!NOTE]
> The `admin-android` and `admin-dashboard` are separate apps but share the same FastAPI backend. Admin endpoints will be added incrementally to the same backend codebase — not a separate server.
