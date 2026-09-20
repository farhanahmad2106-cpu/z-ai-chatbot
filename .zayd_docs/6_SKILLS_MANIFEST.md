# 6. Machine-Readable Agent Skills Manifest

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 6.1 Build & Development Commands

| Skill ID | Command | Working Directory | Purpose | Expected Exit Code |
|---|---|---|---|---|
| `BUILD_FE` | `npm run build` | `frontend/` | TypeScript compilation + Vite production bundle | 0 |
| `DEV_FE` | `npm run dev` | `frontend/` | Start Vite dev server (port 5173) | Daemon |
| `DEV_BE` | `uvicorn main:app --reload` | `backend/` | Start FastAPI dev server (port 8000) | Daemon |
| `CHECK_PY` | `python -m py_compile backend/main.py` | `.` | Syntax-check backend entry point | 0 |
| `CHECK_TS` | `npx tsc --noEmit` | `frontend/` | Full TypeScript type check without emit | 0 |
| `TEST_BE` | `python -m pytest` | `backend/` | Run all backend pytest suites | 0 |
| `INSTALL_FE` | `npm install` | `frontend/` | Install frontend dependencies | 0 |
| `INSTALL_BE` | `pip install -r requirements.txt` | `backend/` | Install backend dependencies | 0 |
| `CONVEX_DEV` | `npx convex dev` | `.` | Sync Convex schemas to serverless cloud | Daemon |

## 6.2 Git Operations

| Skill ID | Command | Purpose |
|---|---|---|
| `GIT_STATUS` | `git status` | Check working tree state |
| `GIT_ADD` | `git add .` | Stage all changes |
| `GIT_COMMIT` | `git commit -m "type: description"` | Commit with conventional format |
| `GIT_PUSH` | `git push z-sehealth HEAD:main` | Push to GitHub remote |

## 6.3 Parsing & Validation Skills

| Skill ID | Input | Output | Implementation |
|---|---|---|---|
| `PARSE_JSON` | Raw AI text response | `dict` or `None` | `clean_json_response()` in `backend/main.py` — strips markdown fences, extracts JSON from code blocks, handles malformed brackets |
| `PARSE_INS` | Raw ingredient string containing INS codes | List of `{code, name, risk_tier}` | `backend/services/ingredient_parser.py` — regex extraction `INS\s*\d+` → lookup in INS database |
| `VALIDATE_SCORE` | `ParsedIngredients` + `UserProfile` | `SafetyScoreResult` | `backend/services/safety_engine.py` — mathematical formula application |

## 6.4 API Client Skills

| Skill ID | Endpoint | Method | Auth | Payload |
|---|---|---|---|---|
| `API_SCAN` | `/api/scan` | POST | Optional Bearer | `{image: base64}` |
| `API_SCAN_OCR` | `/api/scan/ingredients` | POST | Optional Bearer | `{image: base64}` |
| `API_SEARCH` | `/api/foods?search=` | GET | None | Query param |
| `API_TRANSLATE` | `/api/translate` | POST | None | `{text_items: [], target_language: str}` |
| `API_STATS` | `/api/user/stats` | GET | Bearer | None |
| `API_LOG_MEAL` | `/api/user/log_meal` | POST | Bearer | `{name: str, ingredients: []}` |
| `API_PROFILE_GET` | `/api/user/profile` | GET | Bearer | None |
| `API_PROFILE_SET` | `/api/user/profile` | POST | Bearer | `{health_profile: {}, preferences: {}}` |

## 6.5 File Modification Permissions

| Scope | Permitted Extensions | Restricted Files |
|---|---|---|
| Frontend | `.ts`, `.tsx`, `.css`, `.html` | `firebase.ts` (read-only unless auth changes) |
| Backend | `.py`, `.txt`, `.json` | `.env`, `firebase-admin-key.json` (NEVER modify) |
| Config | `.md`, `.yaml`, `.json` | `package-lock.json` (auto-generated) |
| Documentation | `.md` | None |

### 27. Touchless Spatial Vision & Gesture Control (`skills/gesture_control.py`, `ui/gesture_pip.py`)
- **Engine**: Google MediaPipe Hands (`model_complexity=0`, strictly CPU-bound, 0 MB GPU VRAM).
- **Activation Boundary**: Upper 40% camera frame (typing-safe region).
- **Gesture Mappings**:
  - 👍 `Thumbs-Up` (held 1.5s): Toggle Gesture Tracking & PIP Overlay.
  - ☝️ `Index Finger Pointing`: Air Mouse Cursor (EMA smoothing, Win32 `SetCursorPos`).
  - 🤏 `Index-Thumb Pinch (<30px)`: Left Click & Drag / Voice Input Trigger.
  - ✋ `Open Palm Lateral Wave`: Dismiss Caption Bar / Minimize HUD.
  - ✊ `Closed Fist`: Toggle Privacy Mute.
  - 🤫 `Index to Face ("Shh")`: Immediate Emergency Task Abort (`abort_active_task`).
- **Hotkeys**: `Ctrl + Shift + W` (Global Toggle).
- **Fast-Path Triggers**:
  - `r"^(?:turn\s+(?:on|off)|enable|disable|toggle)\s+(?:gesture\s+control|air\s+mouse|camera\s+preview)$"`
