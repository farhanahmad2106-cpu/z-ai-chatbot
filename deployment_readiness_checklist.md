# Z-AI Chatbot — Production Deployment Readiness Checklist
**Version:** 1.0.0 | **Targets:** Android Studio (EAS Build) + Vercel (Admin Dashboard)

> [!IMPORTANT]
> This checklist is scoped to the **Z-AI Chatbot V1.0 ecosystem** and its three sub-apps:
> 1. **User App** — React Native (Expo 56) → Android APK/AAB
> 2. **Backend** — FastAPI (Python 3.12+) → Local device service
> 3. **Admin Dashboard** — Next.js → Vercel deployment
>
> Work through each section in order. Mark items `[x]` as you verify them.

---

## Legend
| Symbol | Meaning |
|:---|:---|
| `[ ]` | Unchecked — needs verification |
| `[x]` | Verified and passing |
| `[!]` | Blocking issue found — must fix before deploy |
| `[~]` | Deferred (Phase 2+ feature, not in V1.0 scope) |

---

## 📁 Section 1 — Navigation & Routing

### 1.1 React Native App — Route Integrity

- `[ ]` **Root Stack Navigator covers all 4 routes**
  - Verify `App.tsx` declares: `Splash`, `Setup`, `Unlock`, `Main`
  - File: [`App.tsx`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/App.tsx#L116-L119)
  - **Check:** No screen is registered in the drawer but missing from the import list at the top of `App.tsx`.

- `[ ]` **Drawer Navigator covers all active screens**
  - Verify `MainDrawerNavigator` in `App.tsx` includes: `ChatHome`, `Dashboard`, `Models`, `Sync`, `Backup`, `Upgrade`
  - File: [`App.tsx`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/App.tsx#L83-L98)
  - ⚠️ `SettingsScreen` is commented out — confirm this is intentional for V1.0.

- `[ ]` **`SplashScreen` routing covers all 3 branches**
  - File: [`SplashScreen.tsx`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI Chatbot/src/screens/SplashScreen.tsx#L92-L98)
  - Must route to: `Main` (if already unlocked), `Setup` (first launch), `Unlock` (returning user).
  - **Check:** The `TODO: Show inline error with retry button` at line 103 is unimplemented. Add a minimal error state before shipping to avoid a blank screen if the backend is unreachable on first install.

- `[ ]` **`Settings` route is either implemented or gracefully absent**
  - `MainDrawerParamList` in [`chat.ts`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/src/types/chat.ts#L210-L218) declares a `Settings` route.
  - `SettingsScreen` import in `App.tsx` is commented out.
  - **Action:** Either uncomment + implement `SettingsScreen.tsx`, or remove `Settings` from `MainDrawerParamList` to avoid TypeScript type errors.

- `[ ]` **`ChatHome` accepts optional `conversationId` param**
  - `MainDrawerParamList.ChatHome` is typed as `{ conversationId?: string } | undefined`.
  - Verify `ChatHomeScreen.tsx` reads this param correctly via `useRoute()` and handles the `undefined` case without crashing.

- `[ ]` **No orphaned screens exist**
  - Run: `grep -r "from '../screens/" src/` and confirm every imported screen is registered in a navigator.

- `[ ]` **Back gesture / hardware back button behavior is correct**
  - `predictiveBackGestureEnabled: false` is already set in [`app.json`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/app.json#L19)
  - Verify the `Unlock → Main` transition uses `navigation.replace()` (not `navigate()`), so back button does not return the user to the unlock screen.

### 1.2 Admin Dashboard — Next.js Route Integrity

- `[ ]` **All Next.js pages are reachable from the root layout**
  - Check `admin-dashboard/src/app/` directory for any `page.tsx` files inside subdirectories that lack a parent `layout.tsx` linking them.
  - Current state: Only `page.tsx` exists at root level — add planned sub-routes (`/dashboard`, `/users`, `/logs`, `/models`) per the implementation plan.

- `[ ]` **404 and error pages exist**
  - Add `not-found.tsx` and `error.tsx` to `admin-dashboard/src/app/` to prevent default Next.js error pages showing in production.

- `[ ]` **All internal links use `next/link`**
  - No `<a href>` raw anchor tags for internal navigation — must use `<Link>` from `next/link` for proper client-side routing.

---

## 🖼️ Section 2 — Assets & Resources

### 2.1 Expo / React Native App Assets

- `[ ]` **All required app icons are present and correctly sized**
  - Verify all files in [`/assets`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/assets) exist:
    - `icon.png` — ✅ Present (393 KB — verify it is 1024×1024px)
    - `android-icon-foreground.png` — ✅ Present (78 KB — must be 1024×1024px)
    - `android-icon-background.png` — ✅ Present (17 KB)
    - `android-icon-monochrome.png` — ✅ Present (4 KB — for Android 13+ themed icons)
    - `favicon.png` — ✅ Present
    - `splash-icon.png` — ✅ Present (17 KB)

- `[ ]` **`splash-icon.png` is referenced in `app.json`**
  - Current `app.json` does NOT have a `"splash"` key configured.
  - **Action:** Add the splash screen configuration to `app.json`:
    ```json
    "splash": {
      "image": "./assets/splash-icon.png",
      "resizeMode": "contain",
      "backgroundColor": "#16181F"
    }
    ```
  - **Troubleshoot:** If the splash is white on first launch, the `backgroundColor` hex must match `theme.colors.background` in your theme.

- `[ ]` **Adaptive icon `backgroundColor` matches brand**
  - In `app.json`, `android.adaptiveIcon.backgroundColor` is `"#E6F4FE"` (light blue).
  - Verify this matches your brand identity — your theme uses `#16181F` (dark) as background. This may need updating.

- `[ ]` **Custom fonts (Hanken Grotesk + JetBrains Mono) are loaded via `expo-font`**
  - Currently, your theme in `SplashScreen.tsx` and screens references `theme.typography.fontFamily.bold`, etc.
  - **Check:** Is `expo-font` installed and is `useFonts()` called in `App.tsx` before rendering navigation?
  - **Critical:** Without `expo-font` loading, React Native falls back to system fonts silently — the Brutalist design aesthetic depends on these typefaces.
  - **Fix:** Install `expo-font` and add:
    ```tsx
    const [fontsLoaded] = useFonts({
      'HankenGrotesk-Regular': require('./assets/fonts/HankenGrotesk-Regular.ttf'),
      'HankenGrotesk-Bold': require('./assets/fonts/HankenGrotesk-Bold.ttf'),
      'JetBrainsMono-Regular': require('./assets/fonts/JetBrainsMono-Regular.ttf'),
    });
    if (!fontsLoaded) return null; // Hold render until fonts ready
    ```

- `[ ]` **No asset paths use absolute `/` references**
  - React Native requires `require('./assets/...')` — never `'/assets/...'`.

### 2.2 Admin Dashboard Assets

- `[ ]` **Favicon exists at `admin-dashboard/src/app/favicon.ico`** — ✅ Present
- `[ ]` **Global stylesheet `globals.css` imports fonts via `@import` or `<link>`**
  - Check `admin-dashboard/src/app/globals.css` for Google Fonts imports.
- `[ ]` **All images use `next/image` component** — prevents broken images in production build.
- `[ ]` **No hardcoded `localhost` URLs in frontend fetch calls**
  - Search: `grep -r "localhost" admin-dashboard/src/` — replace with environment variable references.

---

## ⚙️ Section 3 — Configuration & Environment Setup

### 3.1 Backend `.env` Configuration

- `[ ]` **`.env` file exists at project root (copied from `.env.example`)**
  - Template: [`.env.example`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/.env.example)
  - **Never commit `.env` to Git** — verify `.gitignore` includes `.env`.

- `[ ]` **`JWT_SECRET` is changed from the default placeholder**
  - Default in `.env.example`: `CHANGE_ME_BEFORE_PRODUCTION_CHANGE_ME_BEFORE_PRODUCTION_32`
  - **Generate:** `python -c "import secrets; print(secrets.token_urlsafe(48))"`
  - Set `DEBUG=false` in production.

- `[ ]` **`ADMIN_API_KEY` is changed from default and is high-entropy**
  - Minimum 64 characters. Generate using:
    `python -c "from app.core.security import generate_admin_key; print(generate_admin_key())"`

- `[ ]` **`DEBUG=false` in production `.env`**
  - When `DEBUG=true`, Swagger UI (`/docs`), ReDoc (`/redoc`), and OpenAPI schema (`/openapi.json`) are publicly accessible. This MUST be `false` before any real-world deployment.

- `[ ]` **All required env vars are present**
  ```
  APP_NAME, APP_VERSION, DEBUG, HOST, PORT,
  JWT_SECRET, ADMIN_API_KEY,
  DEFAULT_MODEL, FALLBACK_MODEL,
  MODEL_CONTEXT_LENGTH, MODEL_MAX_TOKENS, MODEL_TEMPERATURE, MODEL_THREADS,
  METRICS_POLL_INTERVAL_SECONDS,
  BACKUP_SCHEDULE_CRON, BACKUP_RETENTION_DAYS
  ```

- `[ ]` **`data/` directory structure is pre-created or created on first boot**
  - Directories: `data/db/`, `data/models/`, `data/backups/`
  - Verify `main.py` lifespan manager creates these: ✅ Lines 43–45 in `main.py` do this.

### 3.2 React Native App — API Client Configuration

- `[ ]` **`apiClient.ts` uses Android emulator proxy address in dev**
  - File: [`apiClient.ts`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/src/services/apiClient.ts#L4-L9)
  - In `__DEV__` + Android: uses `http://10.0.2.2:8765` ✅
  - In production builds: uses `http://127.0.0.1:8765` ✅
  - **Action:** For physical Android device testing (not emulator), add another branch:
    ```ts
    if (__DEV__ && Platform.OS === 'android') {
      // Emulator: 10.0.2.2 | Physical device: replace with your PC's LAN IP
      return 'http://10.0.2.2:8765'; 
    }
    ```

- `[ ]` **`SplashScreen.tsx` BACKEND_URL hardcode matches `apiClient.ts`**
  - `SplashScreen.tsx` line 29: `const BACKEND_URL = 'http://127.0.0.1:8765'`
  - `apiClient.ts` production URL: `'http://127.0.0.1:8765'`
  - ✅ Both match port `8765`. However, `SplashScreen.tsx` does NOT use the Platform check from `apiClient.ts`. **Fix:** Refactor `SplashScreen` to import a shared `getBaseUrl()` utility instead of hardcoding.

- `[ ]` **`streamHandler.ts` base URL matches `apiClient.ts`**
  - File: [`streamHandler.ts`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/src/services/streamHandler.ts)
  - Check the SSE URL uses the same `getBaseUrl()` helper — hardcoded URLs will break on emulator/device.

- `[ ]` **Backend CORS `allowed_origins` covers the app's origin**
  - File: [`config.py`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/backend/app/core/config.py#L41-L44)
  - Currently allows `http://localhost:*` and `http://127.0.0.1:*`.
  - For the Android emulator, add `http://10.0.2.2:*` to the allowed origins list.

### 3.3 Admin Dashboard — Vercel Environment Variables

- `[ ]` **All `NEXT_PUBLIC_*` variables are set in Vercel project settings**
  - The admin dashboard must know the backend URL. Add to Vercel:
    ```
    NEXT_PUBLIC_BACKEND_URL=https://your-backend-or-tunnel-url
    NEXT_PUBLIC_ADMIN_API_KEY=your-high-entropy-admin-key
    ```
  - ⚠️ Do NOT prefix sensitive variables with `NEXT_PUBLIC_` — they become visible in client bundles. Admin API key should only be used server-side.

- `[ ]` **`next.config.mjs` has no production-breaking settings**
  - File: `admin-dashboard/next.config.mjs`
  - Check for `output: 'export'` — this disables API routes and SSR, which may break dynamic admin features.

- `[ ]` **No `console.log` with sensitive data in admin dashboard pages**

---

## 🔌 Section 4 — Backend & API Verification

### 4.1 FastAPI Backend Health

- `[ ]` **Backend starts without errors**
  ```powershell
  cd "c:\Farhan Ahmad\Code Languages\Mr. Z\Anti Gravity\AI Chatbot\backend"
  .\venv\Scripts\Activate.ps1
  python main.py
  ```
  - Expected output: `Z-AI Chatbot Backend v1.0.0 starting on 127.0.0.1:8765`
  - No `ImportError` or `ModuleNotFoundError` on startup.

- `[ ]` **Health endpoint responds correctly**
  ```powershell
  Invoke-WebRequest -Uri "http://127.0.0.1:8765/health" | ConvertFrom-Json
  ```
  - Expected: `{ "status": "ok", "version": "1.0.0", "db_unlocked": false }`

- `[ ]` **All API routers import successfully**
  - Routers registered in `main.py`: `auth`, `chat`, `models_api`, `metrics`, `sync`, `backups`, `admin`, `billing`
  - Check for any missing file that would cause an `ImportError` on startup.

- `[ ]` **`pysqlcipher3` / `sqlcipher3` is correctly installed in the venv**
  - This is the most likely failure point. The `requirements.txt` comments note it must be installed separately.
  - **Test:** `python -c "import pysqlcipher3; print('OK')"`
  - **Troubleshoot:** If this fails, the database will NEVER open regardless of PIN correctness.

- `[ ]` **`llama-cpp-python` is commented out — confirm this is intentional**
  - Line in `requirements.txt`: `# llama-cpp-python==0.3.23`
  - File: [`inference.py`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/backend/app/services/inference.py#L15) imports `from llama_cpp import Llama`
  - **Action:** Either uncomment and install `llama-cpp-python`, or wrap the import in a `try/except ImportError` and return a graceful `503` if no model is available. Without this, the backend will crash on any chat request.

- `[ ]` **Auth flow end-to-end works**
  1. `POST /api/v1/auth/setup` with `{"pin": "1234"}` → returns `access_token`
  2. `GET /api/v1/auth/status` → returns `{"is_unlocked": true}`
  3. `POST /api/v1/auth/lock` → returns `204`
  4. `POST /api/v1/auth/unlock` with PIN → returns new `access_token`

- `[ ]` **Salt file (`data/db/db.salt`) is written on first setup**
  - The unlock endpoint reads from `settings.db_path.parent / "db.salt"` (line 247 of `auth.py`).
  - **Check:** The `setup_pin()` function must write this file. If it doesn't, every restart will fail to unlock.
  - **Action:** Verify `setup_pin()` in `auth.py` writes the salt file after `db_manager.initialize()`.

- `[ ]` **All placeholder endpoints return proper stubs (not 500 errors)**
  - Check `billing.py`, `sync.py`, `backups.py` — these may be skeletal. Any `NotImplementedError` in a registered route will crash that specific request.

- `[ ]` **`TrustedHostMiddleware` is not blocking the admin dashboard**
  - Currently allows only `localhost`, `127.0.0.1`, `::1`
  - If the admin dashboard is deployed to Vercel and calls the backend, the backend will reject those requests.
  - **Design Decision:** The backend is strictly local-only by design. The admin dashboard must be hosted locally or behind a VPN to reach it.

### 4.2 API Contract Consistency

- `[ ]` **Frontend `Message` type matches backend `MessageResponse` schema**
  - Frontend: [`chat.ts`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/src/types/chat.ts#L53-L63) — has `token_count`, `is_error`, `tool_name`, `tool_args`
  - Backend: [`chat.py`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/backend/app/api/chat.py#L39-L46) `MessageResponse` — only has `id`, `conversation_id`, `role`, `content`, `created_at`
  - ⚠️ **Mismatch Found:** Frontend expects `token_count` and `is_error` but backend doesn't serialize them. Fix `MessageResponse` in `chat.py` or update the frontend type.

- `[ ]` **`streamHandler.ts` SSE event names match backend**
  - Backend emits events: `"token"`, `"error"`, `"done"` with `data: "[DONE]"`
  - Frontend `streamHandler.ts` must listen for `"token"` event and parse `payload.token`
  - Verify the event name in `EventSource.addEventListener()` matches exactly.

---

## 📱 Section 5 — Platform-Specific Requirements

### 5.1 Android (EAS Build / Android Studio)

- `[ ]` **`app.json` has required Android fields for store release**
  - Add to `app.json`:
    ```json
    "android": {
      "package": "com.yourname.zaichatbot",
      "versionCode": 1,
      "compileSdkVersion": 35,
      "targetSdkVersion": 35,
      "minSdkVersion": 24,
      "permissions": [
        "android.permission.INTERNET",
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT"
      ]
    }
    ```

- `[ ]` **`userInterfaceStyle` is set to `"dark"` (not `"light"` as currently configured)**
  - File: [`app.json`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/app.json#L8)
  - Current value: `"light"` — **your app uses a dark theme**. This must be `"dark"` or `"automatic"`.
  - If left as `"light"`, Android system UI elements (status bar, nav bar) may appear with light backgrounds, clashing with your dark UI.

- `[ ]` **StatusBar configuration matches theme**
  - In `App.tsx` line 130-133: `barStyle="light-content"` and `backgroundColor={theme.colors.background}` ✅
  - Verify `theme.colors.background` resolves to the correct dark hex value at build time.

- `[ ]` **All required permissions are declared (not just used)**
  - Internet permission is required for the backend HTTP calls.
  - Biometric permission is required for `UnlockScreen.tsx` if biometric auth is implemented.

- `[ ]` **`expo-local-authentication` is installed for biometric unlock**
  - `UnlockScreen.tsx` likely references biometric features per the PRD.
  - Run: `npx expo install expo-local-authentication`

- `[ ]` **`react-native-gesture-handler` is initialized at the root**
  - Required for `@react-navigation/drawer` to work.
  - Add to the top of `index.ts`: `import 'react-native-gesture-handler';`
  - File: [`index.ts`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/index.ts)

- `[ ]` **`react-native-reanimated` Babel plugin is configured**
  - Required for drawer animations.
  - Add `'react-native-reanimated/plugin'` to `babel.config.js` plugins array (must be last).

- `[ ]` **Build and run on physical Android device or emulator**
  ```powershell
  cd "c:\Farhan Ahmad\Code Languages\Mr. Z\Anti Gravity\AI Chatbot"
  npx expo run:android
  ```
  - Check Metro bundler for any red-screen errors.
  - Open Android Studio → Logcat → Filter by `Z-AI` to see native logs.

- `[ ]` **Generate production AAB for Play Store**
  ```powershell
  npx eas build --platform android --profile production
  ```
  - Requires `eas.json` config file and EAS CLI: `npm install -g eas-cli`
  - Or use Android Studio directly: `Build → Generate Signed Bundle/APK`

- `[ ]` **ProGuard / R8 rules don't strip required classes**
  - SQLCipher, Reanimated, and Gesture Handler often need ProGuard exclusions.
  - Add a `proguard-rules.pro` if building via Android Studio.

### 5.2 Vercel (Admin Dashboard)

- `[ ]` **Build succeeds locally before deploying**
  ```powershell
  cd "c:\Farhan Ahmad\Code Languages\Mr. Z\Anti Gravity\AI Chatbot\admin-dashboard"
  npm run build
  ```
  - Zero TypeScript errors and no broken imports in the build output.

- `[ ]` **`vercel.json` is configured (if needed)**
  - Not required for basic Next.js deploys, but useful for custom headers/redirects.
  - Add security headers:
    ```json
    {
      "headers": [
        {
          "source": "/(.*)",
          "headers": [
            { "key": "X-Frame-Options", "value": "DENY" },
            { "key": "X-Content-Type-Options", "value": "nosniff" },
            { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
          ]
        }
      ]
    }
    ```

- `[ ]` **Admin dashboard is password-protected**
  - The admin dashboard contains sensitive controls. At minimum, add Vercel's built-in Password Protection (Pro plan) or implement authentication middleware in `middleware.ts`.

- `[ ]` **All environment variables are set in Vercel Dashboard**
  - Project Settings → Environment Variables → Add all `NEXT_PUBLIC_*` and server-side keys.

- `[ ]` **`next.config.mjs` does not have `output: 'export'`**
  - Static export disables API routes and SSR — incompatible with admin features.

---

## 🔐 Section 6 — Security Configuration

- `[ ]` **No API keys or secrets exist in committed source files**
  ```powershell
  git grep -r "CHANGE_ME" .
  git grep -r "sk_live_" .
  git grep -r "secret" --and --not "SecretStr" .
  ```

- `[ ]` **`.gitignore` covers all sensitive files**
  - Must include: `.env`, `data/`, `*.db`, `*.db-shm`, `*.db-wal`, `*.salt`

- `[ ]` **`DEBUG=false` is confirmed in the production `.env`**

- `[ ]` **Admin API key is separate from JWT secret** — ✅ by design in `config.py`

- `[ ]` **`TrustedHostMiddleware` in FastAPI is active** — ✅ configured in `main.py`

- `[ ]` **JWT tokens have a reasonable TTL**
  - Default: 1440 minutes (24 hours). Acceptable for local-only use. Confirm in `config.py`.

- `[ ]` **HTTPS is enforced if admin dashboard is publicly accessible**
  - Vercel provides HTTPS by default ✅
  - Verify no mixed content (HTTP backend calls from HTTPS admin dashboard).

---

## ✅ Section 7 — Final Pre-Deployment Validation

### 7.1 TypeScript & Build Checks

- `[ ]` **Zero TypeScript errors across user app**
  ```powershell
  cd "c:\Farhan Ahmad\Code Languages\Mr. Z\Anti Gravity\AI Chatbot"
  npx tsc --noEmit
  ```

- `[ ]` **Zero TypeScript errors in admin dashboard**
  ```powershell
  cd "c:\Farhan Ahmad\Code Languages\Mr. Z\Anti Gravity\AI Chatbot\admin-dashboard"
  npx tsc --noEmit
  ```

- `[ ]` **Expo prebuild runs without errors**
  ```powershell
  npx expo prebuild --clean
  ```

- `[ ]` **Python backend passes import verification**
  ```powershell
  cd backend
  .\venv\Scripts\Activate.ps1
  python -c "from app.api.chat import router; from app.api.auth import router; print('All imports OK')"
  ```

### 7.2 Console & Log Review

- `[ ]` **No `console.error` or `console.warn` in production paths**
  - Exception: `SplashScreen.tsx` line 102 has a `console.error` — this is acceptable for dev but should route to a crash reporter in production.

- `[ ]` **FastAPI logs show no warnings on startup**
  - Watch for: `UserWarning`, `DeprecationWarning`, `SQLAlchemy` version warnings.

- `[ ]` **Android Logcat shows no `E/ReactNativeJS` errors during normal navigation**

### 7.3 Responsive Design (Admin Dashboard)

- `[ ]` **Admin dashboard is usable on 1280px, 1440px, and 1920px widths**
- `[ ]` **Admin dashboard is not required to work on mobile** (by design — admin-only tool)
- `[ ]` **No horizontal overflow on any page**

### 7.4 Performance Checks

- `[ ]` **`FlatList` in `ChatHomeScreen.tsx` uses `useCallback` for `renderItem`**
  - Prevents GC pressure during 24fps token streaming (noted in the code review report).

- `[ ]` **Zustand stores have no memory leaks (event listeners cleaned up)**
  - `useTelemetryStore.ts` likely has an `EventSource` or `setInterval` — confirm cleanup in `useEffect` return.

- `[ ]` **Backend `/api/v1/metrics/live` SSE stream closes properly on client disconnect**
  - FastAPI SSE streams that don't handle disconnects will keep threads alive indefinitely.

- `[ ]` **`llama-cpp-python` model RAM budget guard is active**
  - Per `inference.py`: the `load_model()` method currently does NOT check available RAM before loading.
  - **Add before production:** Check `psutil.virtual_memory().available` against `model.ram_required_mb` before calling `Llama()`.

### 7.5 Deployment Execution Order

> [!IMPORTANT]
> Follow this exact order to avoid dependency failures.

```
STEP 1: Backend Preparation
  1a. [ ] Generate and set .env secrets (JWT_SECRET, ADMIN_API_KEY)
  1b. [ ] Verify pysqlcipher3 is installed in venv
  1c. [ ] Install llama-cpp-python if Phase 1 chat is live
  1d. [ ] Start backend: python main.py
  1e. [ ] Verify /health endpoint responds

STEP 2: React Native User App (Android)
  2a. [ ] Fix all TypeScript errors: npx tsc --noEmit
  2b. [ ] Add 'react-native-gesture-handler' import to index.ts
  2c. [ ] Add Reanimated Babel plugin to babel.config.js
  2d. [ ] Run on emulator: npx expo run:android
  2e. [ ] Test full navigation flow: Splash → Setup → ChatHome
  2f. [ ] Generate release build via EAS or Android Studio

STEP 3: Admin Dashboard (Vercel)
  3a. [ ] npm run build — must complete with zero errors
  3b. [ ] Set all env vars in Vercel project settings
  3c. [ ] Deploy: vercel --prod
  3d. [ ] Verify all pages load behind authentication
```

---

## 🔧 Troubleshooting Reference

| Issue | Likely Cause | Fix |
|:---|:---|:---|
| Blank white screen on Android launch | `userInterfaceStyle: "light"` in `app.json` with dark theme | Change to `"dark"` in `app.json` |
| App stuck on SplashScreen | Backend not running or unreachable | Start FastAPI backend first; add error state to `SplashScreen.tsx` |
| `DatabaseManager.get_session()` raises `RuntimeError` | PIN unlock not called before API requests | Ensure `/auth/unlock` completes before any other API calls |
| Drawer doesn't open / gesture not working | Missing `react-native-gesture-handler` root import | Add `import 'react-native-gesture-handler'` as first line of `index.ts` |
| Reanimated crash on startup | Missing Babel plugin | Add `'react-native-reanimated/plugin'` to `babel.config.js` |
| `pysqlcipher3` `ImportError` | Not installed in venv | Run backend setup script or install manually |
| `llama_cpp ImportError` on backend start | Package not installed | `pip install llama-cpp-python` or wrap import in `try/except` |
| SSE stream token events not received | Event name mismatch | Backend emits `"token"` event — frontend must listen for `"token"`, not `"message"` |
| Admin dashboard blank on Vercel | Missing `NEXT_PUBLIC_*` env vars | Set all required vars in Vercel project settings |
| `401 Unauthorized` on all API calls | JWT token not sent or expired | Check `apiClient.ts` injects `Authorization: Bearer <token>` header |
| Salt file missing on unlock | `setup_pin()` didn't write `db.salt` | Add `salt_path.write_text(salt_hex)` to the setup endpoint after `db_manager.initialize()` |
| Android emulator can't reach backend | Wrong loopback address | Use `10.0.2.2:8765` for Android emulator (not `127.0.0.1`) |
| Fonts rendering as system default | `expo-font` not installed or `useFonts()` not called | Install `expo-font` and call `useFonts()` in `App.tsx` before returning the navigator |
| ProGuard stripping SQLCipher classes | Release build minification | Add SQLCipher ProGuard rules to `proguard-rules.pro` |
