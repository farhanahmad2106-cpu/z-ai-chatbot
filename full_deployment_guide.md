# Z-AI Chatbot — Full-Stack Production Deployment Guide
**Version:** 1.0.0 | **Last Updated:** 2026-05-30  
**Stack:** React Native (Expo 56) · FastAPI · Convex · Android Studio · Google Play Store

---

> [!IMPORTANT]
> Follow phases in order. Each phase has a **Validation Checkpoint** — do not advance until it passes.
> All PowerShell commands assume your working directory is the project root unless stated otherwise.
>
> **Project Root:** `c:\Farhan Ahmad\Code Languages\Mr. Z\Anti Gravity\AI Chatbot`

---

## Phase Overview

```
Phase 1 → GitHub Repository Setup          (Version Control Foundation)
Phase 2 → Convex Backend Integration       (Cloud Sync Database Layer)
Phase 3 → Android Studio Build Pipeline    (Signed APK / AAB Production Build)
Phase 4 → Google Play Store Submission     (Publishing & Post-Launch)
```

---

# PHASE 1 — GitHub Repository Setup

## 1.1 Pre-Flight: Harden `.gitignore`

The current `.gitignore` is missing critical entries. Update it now before the first commit.

**File:** [`.gitignore`](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/.gitignore)

```gitignore
# ── Dependencies ──────────────────────────────────────────────────────────────
node_modules/
admin-dashboard/node_modules/
admin-android/node_modules/

# ── Expo / React Native ───────────────────────────────────────────────────────
.expo/
dist/
web-build/
expo-env.d.ts
/android/
/ios/

# ── Metro ─────────────────────────────────────────────────────────────────────
.metro-health-check*

# ── Environment & Secrets ─────────────────────────────────────────────────────
.env
.env.local
.env.*.local
.env.production

# ── Python Backend ────────────────────────────────────────────────────────────
backend/venv/
venv/
.venv/
__pycache__/
*.pyc
*.pyo
*.pyd
backend/.pytest_cache/
backend/htmlcov/
backend/.coverage

# ── Database & Sensitive Data ─────────────────────────────────────────────────
data/db/
data/models/
data/backups/
*.db
*.db-shm
*.db-wal
*.salt

# ── Android Signing ───────────────────────────────────────────────────────────
*.jks
*.keystore
*.p8
*.p12
*.key
*.mobileprovision
*.pem
release.keystore
upload-keystore.jks

# ── Build Outputs ─────────────────────────────────────────────────────────────
*.apk
*.aab
build/
android/app/build/

# ── EAS / Expo ────────────────────────────────────────────────────────────────
.easignore

# ── TypeScript ────────────────────────────────────────────────────────────────
*.tsbuildinfo

# ── Debug Logs ────────────────────────────────────────────────────────────────
npm-debug.*
yarn-debug.*
yarn-error.*

# ── macOS ─────────────────────────────────────────────────────────────────────
.DS_Store

# ── Native ────────────────────────────────────────────────────────────────────
*.orig.*

# ── Convex ────────────────────────────────────────────────────────────────────
.convex/
convex/_generated/
```

## 1.2 Initialize & Push to GitHub

```powershell
# 1. Initialize git if not already done
cd "c:\Farhan Ahmad\Code Languages\Mr. Z\Anti Gravity\AI Chatbot"
git init

# 2. Set default branch to main
git branch -M main

# 3. Stage all tracked files
git add .

# 4. Verify nothing sensitive is staged
git status
# Confirm: .env, data/, *.db, *.jks, *.salt are NOT listed

# 5. First commit
git commit -m "feat: initial production-ready commit v1.0.0"

# 6. Connect remote (replace with your actual GitHub repo URL)
git remote add origin https://github.com/YOUR_USERNAME/z-ai-chatbot.git

# 7. Push
git push -u origin main
```

## 1.3 Repository Structure Setup

Create the following files in the repository root:

### `README.md`

```markdown
# Z-AI Chatbot

> Quietly Intelligent. Entirely Yours.

A privacy-first, offline-first AI chat assistant for Android.
All conversations are encrypted locally. No data ever leaves your device.

## Architecture

| Component        | Technology               | Purpose                        |
|:-----------------|:-------------------------|:-------------------------------|
| Mobile App       | React Native (Expo 56)   | Android user interface         |
| Local Backend    | FastAPI (Python 3.12)    | Local AI inference + SQLCipher |
| Cloud Sync       | Convex                   | Optional encrypted backup sync |
| Admin Dashboard  | Next.js → Vercel         | Internal tooling only          |

## Quick Start

### Backend
```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

### Mobile App
```powershell
npm install
npx expo start --android
```

## License
MIT — see LICENSE
```

### Branching Strategy

```powershell
# Create and push standard branches
git checkout -b develop
git push -u origin develop

git checkout -b release/v1.0.0
git push -u origin release/v1.0.0

# Return to main for production work
git checkout main
```

**Branch rules to set on GitHub (Settings → Branches):**
- `main` → Require PR, require 1 review, no direct push
- `develop` → Integration branch for features
- `release/*` → Release candidates only

## 1.4 GitHub Secrets Configuration

Go to: **GitHub Repo → Settings → Secrets and variables → Actions**

Add the following repository secrets (used by CI/CD in Phase 3):

| Secret Name | Value |
|:---|:---|
| `EXPO_TOKEN` | Your EAS token (`npx eas-cli whoami` after login) |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded `.jks` file (generated in Phase 3) |
| `ANDROID_KEY_ALIAS` | Your key alias (e.g., `z-ai-release`) |
| `ANDROID_KEY_PASSWORD` | Keystore password |
| `ANDROID_STORE_PASSWORD` | Store password |
| `CONVEX_DEPLOY_KEY` | From Convex dashboard (generated in Phase 2) |

## 1.5 Add GitHub Actions CI Workflow

**File:** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    name: TypeScript Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit

  backend-check:
    name: Backend Import Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - name: Install dependencies
        run: |
          cd backend
          pip install -r requirements.txt
      - name: Verify all imports
        run: |
          cd backend
          python -c "
          from app.api.auth import router
          from app.api.chat import router as cr
          from app.api.metrics import router as mr
          from app.services.inference import inference_manager, LLAMA_AVAILABLE
          print('All backend imports OK')
          print(f'llama_cpp available: {LLAMA_AVAILABLE}')
          "
```

---

### ✅ Phase 1 Checkpoint

```powershell
# Run all checks before proceeding
git log --oneline -5            # Confirm commits exist
git remote -v                   # Confirm remote is set
git status                      # Confirm working tree is clean
npx tsc --noEmit                # Zero TypeScript errors
```

Expected: Clean working tree, remote set, zero TS errors.

---

# PHASE 2 — Convex Backend Integration

> [!NOTE]
> Convex serves as the **optional cloud sync layer** for Z-AI Chatbot.
> The local FastAPI backend handles AI inference and encrypted local storage.
> Convex handles encrypted conversation backup and cross-device sync.
> Users who never enable sync will never touch Convex — it is entirely opt-in.

## 2.1 Install Convex

```powershell
# Install Convex client in the React Native app
npm install convex

# Install Convex CLI globally
npm install -g convex

# Verify install
npx convex --version
```

## 2.2 Initialize Convex Project

```powershell
# From project root
npx convex dev

# This will:
# 1. Open browser for Convex login
# 2. Create a new Convex project named "z-ai-chatbot"
# 3. Generate convex/ directory with boilerplate
# 4. Add CONVEX_URL to .env.local automatically
```

After initialization, your project root will contain:
```
convex/
├── _generated/      ← Auto-generated (gitignored)
├── schema.ts        ← Database schema (you write this)
├── auth.config.ts   ← Auth configuration
├── conversations.ts ← API functions
├── messages.ts      ← API functions
└── sync.ts          ← Sync functions
```

## 2.3 Define the Database Schema

**File:** `convex/schema.ts`

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Z-AI Chatbot — Convex Cloud Sync Schema
 *
 * This schema mirrors the local SQLCipher schema but stores only
 * ENCRYPTED blobs — Convex never sees plaintext conversation content.
 * The encryption key is derived from the user's PIN and never transmitted.
 *
 * All content fields are AES-256-GCM encrypted on-device before upload.
 */
export default defineSchema({
  // ── Sync Devices ─────────────────────────────────────────────────────────
  sync_devices: defineTable({
    device_id: v.string(),          // Local UUID
    device_name: v.string(),        // Human-readable name
    platform: v.union(
      v.literal("android"),
      v.literal("desktop")
    ),
    public_key_hex: v.string(),     // Ed25519 public key for handshake
    last_seen_at: v.number(),       // Unix timestamp
    is_trusted: v.boolean(),
    owner_token: v.string(),        // Opaque owner identifier (hashed)
  })
    .index("by_device_id", ["device_id"])
    .index("by_owner", ["owner_token"]),

  // ── Encrypted Conversation Backups ────────────────────────────────────────
  conversation_backups: defineTable({
    device_id: v.string(),
    conversation_id: v.string(),    // Local SQLite UUID
    encrypted_title: v.string(),    // AES-256-GCM encrypted
    encrypted_model_id: v.optional(v.string()),
    message_count: v.number(),
    token_count: v.number(),
    is_archived: v.boolean(),
    is_starred: v.boolean(),
    sync_version: v.number(),       // Optimistic concurrency control
    created_at: v.number(),         // Unix timestamp
    updated_at: v.number(),
    owner_token: v.string(),
  })
    .index("by_device_conversation", ["device_id", "conversation_id"])
    .index("by_owner_updated", ["owner_token", "updated_at"])
    .index("by_owner", ["owner_token"]),

  // ── Encrypted Message Backups ─────────────────────────────────────────────
  message_backups: defineTable({
    device_id: v.string(),
    message_id: v.string(),         // Local SQLite UUID
    conversation_id: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    encrypted_content: v.string(),  // AES-256-GCM encrypted
    token_count: v.number(),
    is_error: v.boolean(),
    created_at: v.number(),
    owner_token: v.string(),
  })
    .index("by_conversation", ["conversation_id"])
    .index("by_device_message", ["device_id", "message_id"])
    .index("by_owner", ["owner_token"]),

  // ── Sync Audit Log ────────────────────────────────────────────────────────
  sync_events: defineTable({
    device_id: v.string(),
    event_type: v.union(
      v.literal("push"),
      v.literal("pull"),
      v.literal("conflict"),
      v.literal("error")
    ),
    items_affected: v.number(),
    owner_token: v.string(),
    timestamp: v.number(),
    error_message: v.optional(v.string()),
  })
    .index("by_owner_timestamp", ["owner_token", "timestamp"]),
});
```

## 2.4 Implement Convex API Functions

**File:** `convex/conversations.ts`

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// ── Push a conversation backup to Convex ──────────────────────────────────────
export const pushConversation = mutation({
  args: {
    device_id: v.string(),
    conversation_id: v.string(),
    encrypted_title: v.string(),
    encrypted_model_id: v.optional(v.string()),
    message_count: v.number(),
    token_count: v.number(),
    is_archived: v.boolean(),
    is_starred: v.boolean(),
    sync_version: v.number(),
    created_at: v.number(),
    updated_at: v.number(),
    owner_token: v.string(),
  },
  handler: async (ctx, args) => {
    // Check for existing backup (upsert pattern)
    const existing = await ctx.db
      .query("conversation_backups")
      .withIndex("by_device_conversation", (q) =>
        q.eq("device_id", args.device_id).eq("conversation_id", args.conversation_id)
      )
      .first();

    if (existing) {
      // Optimistic concurrency: reject stale writes
      if (args.sync_version < existing.sync_version) {
        throw new Error(`CONFLICT: Local version ${args.sync_version} < server version ${existing.sync_version}`);
      }
      return await ctx.db.patch(existing._id, {
        ...args,
        sync_version: existing.sync_version + 1,
      });
    }

    return await ctx.db.insert("conversation_backups", args);
  },
});

// ── Pull conversations for a device ──────────────────────────────────────────
export const pullConversations = query({
  args: {
    owner_token: v.string(),
    since_timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("conversation_backups")
      .withIndex("by_owner_updated", (q) => q.eq("owner_token", args.owner_token));

    const results = await q.collect();

    if (args.since_timestamp) {
      return results.filter((r) => r.updated_at > args.since_timestamp!);
    }
    return results;
  },
});

// ── Delete a conversation backup ──────────────────────────────────────────────
export const deleteConversation = mutation({
  args: {
    device_id: v.string(),
    conversation_id: v.string(),
    owner_token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("conversation_backups")
      .withIndex("by_device_conversation", (q) =>
        q.eq("device_id", args.device_id).eq("conversation_id", args.conversation_id)
      )
      .first();

    if (!existing) return null;
    if (existing.owner_token !== args.owner_token) {
      throw new Error("FORBIDDEN: owner_token mismatch");
    }

    // Also delete associated messages
    const messages = await ctx.db
      .query("message_backups")
      .withIndex("by_conversation", (q) => q.eq("conversation_id", args.conversation_id))
      .collect();

    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    return await ctx.db.delete(existing._id);
  },
});
```

**File:** `convex/messages.ts`

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const pushMessages = mutation({
  args: {
    messages: v.array(v.object({
      device_id: v.string(),
      message_id: v.string(),
      conversation_id: v.string(),
      role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
      encrypted_content: v.string(),
      token_count: v.number(),
      is_error: v.boolean(),
      created_at: v.number(),
      owner_token: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const msg of args.messages) {
      const existing = await ctx.db
        .query("message_backups")
        .withIndex("by_device_message", (q) =>
          q.eq("device_id", msg.device_id).eq("message_id", msg.message_id)
        )
        .first();

      if (!existing) {
        const id = await ctx.db.insert("message_backups", msg);
        results.push(id);
      }
    }
    return results;
  },
});

export const pullMessages = query({
  args: {
    conversation_id: v.string(),
    owner_token: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("message_backups")
      .withIndex("by_conversation", (q) => q.eq("conversation_id", args.conversation_id))
      .collect();

    // Verify ownership
    return messages.filter((m) => m.owner_token === args.owner_token);
  },
});
```

**File:** `convex/sync.ts`

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Register this device with Convex
export const registerDevice = mutation({
  args: {
    device_id: v.string(),
    device_name: v.string(),
    platform: v.union(v.literal("android"), v.literal("desktop")),
    public_key_hex: v.string(),
    owner_token: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sync_devices")
      .withIndex("by_device_id", (q) => q.eq("device_id", args.device_id))
      .first();

    if (existing) {
      return await ctx.db.patch(existing._id, {
        last_seen_at: Date.now(),
        device_name: args.device_name,
        public_key_hex: args.public_key_hex,
      });
    }

    return await ctx.db.insert("sync_devices", {
      ...args,
      last_seen_at: Date.now(),
      is_trusted: false,
    });
  },
});

// Get all trusted devices for this owner
export const getTrustedDevices = query({
  args: { owner_token: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sync_devices")
      .withIndex("by_owner", (q) => q.eq("owner_token", args.owner_token))
      .filter((q) => q.eq(q.field("is_trusted"), true))
      .collect();
  },
});

// Log a sync event
export const logSyncEvent = mutation({
  args: {
    device_id: v.string(),
    event_type: v.union(
      v.literal("push"),
      v.literal("pull"),
      v.literal("conflict"),
      v.literal("error")
    ),
    items_affected: v.number(),
    owner_token: v.string(),
    error_message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sync_events", {
      ...args,
      timestamp: Date.now(),
    });
  },
});
```

## 2.5 Add Convex Provider to React Native App

**File:** `convex/convex.ts`

```typescript
// Convex client configuration for Z-AI Chatbot
// CONVEX_URL is automatically set by `npx convex dev`
export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL!;
```

Update **`App.tsx`** to wrap the NavigationContainer with ConvexProvider:

```tsx
// Add to imports at top of App.tsx
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { CONVEX_URL } from "./convex/convex";

const convex = new ConvexReactClient(CONVEX_URL);

// Wrap NavigationContainer:
export default function App(): React.JSX.Element {
  return (
    <ConvexProvider client={convex}>
      <NavigationContainer>
        <StatusBar
          barStyle="light-content"
          backgroundColor={theme.colors.background}
          translucent={false}
        />
        <RootNavigator />
      </NavigationContainer>
    </ConvexProvider>
  );
}
```

Update **`.env.local`** (never commit this):

```env
EXPO_PUBLIC_CONVEX_URL=https://YOUR_CONVEX_DEPLOYMENT.convex.cloud
```

## 2.6 Add Convex URL to `app.json`

```json
{
  "expo": {
    "extra": {
      "convexUrl": "https://YOUR_CONVEX_DEPLOYMENT.convex.cloud"
    }
  }
}
```

## 2.7 Deploy Schema to Convex

```powershell
# Deploy schema to development environment
npx convex dev

# Verify schema deployed
npx convex dashboard
# Opens browser → check Tables tab for: sync_devices, conversation_backups, message_backups, sync_events

# Deploy to production
npx convex deploy --prod
```

## 2.8 Test All Convex Operations

```powershell
# Run the Convex function runner to test each mutation/query
npx convex run sync:registerDevice '{
  "device_id": "test-device-001",
  "device_name": "Test Android",
  "platform": "android",
  "public_key_hex": "abcdef1234",
  "owner_token": "test-owner-hash"
}'

# Expected output: document ID string like "jd7abcXYZ..."

# Test query
npx convex run sync:getTrustedDevices '{"owner_token": "test-owner-hash"}'
# Expected: [] (device not trusted yet)

# Test conversation push
npx convex run conversations:pushConversation '{
  "device_id": "test-device-001",
  "conversation_id": "conv-local-uuid-001",
  "encrypted_title": "AES_ENCRYPTED_BASE64_BLOB",
  "message_count": 5,
  "token_count": 340,
  "is_archived": false,
  "is_starred": false,
  "sync_version": 1,
  "created_at": 1748605200000,
  "updated_at": 1748605200000,
  "owner_token": "test-owner-hash"
}'

# Test pull
npx convex run conversations:pullConversations '{"owner_token": "test-owner-hash"}'
# Expected: array with 1 conversation

# Cleanup test data via Convex Dashboard → Data → Delete rows
```

---

### ✅ Phase 2 Checkpoint

| Check | Command | Expected |
|:---|:---|:---|
| Schema deployed | `npx convex dashboard` | All 4 tables visible |
| Functions deployed | `npx convex run sync:getTrustedDevices '{"owner_token":"x"}'` | Returns `[]` |
| Env var set | `echo $env:EXPO_PUBLIC_CONVEX_URL` | Non-empty URL |
| TypeScript clean | `npx tsc --noEmit` | Zero errors |

---

# PHASE 3 — Android Studio Build Pipeline

## 3.1 Install Required Tools

```powershell
# Install EAS CLI
npm install -g eas-cli

# Verify
eas --version

# Login to Expo account
eas login
# Enter your expo.dev email and password

# Verify login
eas whoami
```

## 3.2 Create `eas.json` Build Configuration

**File:** `eas.json` (project root)

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "promptToConfigurePushNotifications": false
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleDebug"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "APP_ENV": "preview"
      }
    },
    "production": {
      "distribution": "store",
      "android": {
        "buildType": "app-bundle",
        "gradleCommand": ":app:bundleRelease"
      },
      "env": {
        "APP_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "internal"
      }
    }
  }
}
```

## 3.3 Generate Android Signing Keystore

> [!CAUTION]
> The keystore is your app's permanent identity on the Play Store.
> **Losing it means you can never update your app.**
> Store it in a password manager AND back it up to an encrypted drive immediately.

```powershell
# Generate keystore (requires Java/JDK on PATH)
# Android Studio installs JDK at: C:\Program Files\Android\Android Studio\jbr\bin\

$env:PATH += ";C:\Program Files\Android\Android Studio\jbr\bin"

keytool -genkey -v `
  -keystore release.keystore `
  -alias z-ai-release `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000 `
  -storepass YOUR_STORE_PASSWORD `
  -keypass YOUR_KEY_PASSWORD `
  -dname "CN=Z-AI Chatbot, OU=Mobile, O=Your Company Name, L=Your City, ST=Your State, C=PK"

# Verify keystore was created
keytool -list -v -keystore release.keystore -storepass YOUR_STORE_PASSWORD

# Expected output: Certificate fingerprints (SHA-256) and validity dates

# IMMEDIATELY back up — encode to base64 for GitHub Secrets
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Out-File -FilePath release_keystore_b64.txt
# Upload release_keystore_b64.txt to GitHub Secrets as ANDROID_KEYSTORE_BASE64
# Then DELETE release_keystore_b64.txt from disk
Remove-Item release_keystore_b64.txt
```

Store keystore credentials in `.env` (already gitignored):

```env
ANDROID_KEY_ALIAS=z-ai-release
ANDROID_KEY_PASSWORD=YOUR_KEY_PASSWORD
ANDROID_STORE_PASSWORD=YOUR_STORE_PASSWORD
```

## 3.4 Run EAS Prebuild

```powershell
cd "c:\Farhan Ahmad\Code Languages\Mr. Z\Anti Gravity\AI Chatbot"

# Clean prebuild generates native android/ directory
npx expo prebuild --clean --platform android

# This generates:
#   android/                         ← Native Android project
#   android/app/build.gradle         ← Gradle build config
#   android/app/src/main/            ← Native source
#   android/gradle.properties        ← Gradle properties
```

## 3.5 Configure ProGuard Rules

**File:** `android/app/proguard-rules.pro`

```proguard
# ── SQLCipher ─────────────────────────────────────────────────────────────────
-keep class net.sqlcipher.** { *; }
-keep class net.sqlcipher.database.** { *; }

# ── React Native Reanimated ───────────────────────────────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }

# ── React Native Gesture Handler ─────────────────────────────────────────────
-keep class com.swmansion.gesturehandler.** { *; }
-dontwarn com.swmansion.gesturehandler.**

# ── Hermes JS Engine ──────────────────────────────────────────────────────────
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ── OkHttp (Network) ─────────────────────────────────────────────────────────
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# ── Convex ────────────────────────────────────────────────────────────────────
-keep class dev.convex.** { *; }

# ── General React Native ──────────────────────────────────────────────────────
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
```

## 3.6 Build Development APK (Test First)

```powershell
# Build locally (no EAS servers needed — requires Android SDK)
npx expo run:android --variant release

# OR build with EAS (cloud build — no local SDK needed)
eas build --platform android --profile preview

# Monitor build progress
# EAS will output a URL like: https://expo.dev/accounts/YOUR_USERNAME/projects/z-ai-chatbot/builds/BUILD_ID
```

## 3.7 Test on Emulator

```powershell
# Start Android Virtual Device (AVD)
# Android Studio → Device Manager → Play button on your AVD
# OR from command line:
$env:PATH += ";C:\Users\$env:USERNAME\AppData\Local\Android\Sdk\emulator"
emulator -avd "Pixel_8_API_35" -no-snapshot-load

# Install preview APK on emulator
adb install .\build-*.apk

# Stream logs filtered to Z-AI
adb logcat -s ReactNativeJS:V AndroidRuntime:E

# Test complete navigation flow:
# 1. App opens → SplashScreen shows (brand animation)
# 2. Backend health check → "RETRY CONNECTION" button appears (backend not running on emulator)
# 3. Navigate: Splash → Setup → PIN entry → ChatHome
# 4. Drawer opens with swipe gesture
# 5. Dashboard screen loads
# 6. Models screen loads
```

## 3.8 Test on Physical Android Device

```powershell
# Enable USB Debugging on device:
# Settings → About Phone → tap Build Number 7 times
# Settings → Developer Options → USB Debugging → ON

# Verify device connected
adb devices
# Expected: "DEVICE_SERIAL_NUMBER   device"

# Install directly
adb -s DEVICE_SERIAL_NUMBER install .\build-*.apk

# For testing with local backend on same WiFi network:
# Find your PC's LAN IP
ipconfig | findstr IPv4
# e.g., 192.168.1.105

# Temporarily update baseUrl.ts for physical device testing:
# return 'http://192.168.1.105:8765';  // Your PC's LAN IP
# Start backend with: python main.py --host 0.0.0.0
```

## 3.9 Build Production AAB

```powershell
# Build production Android App Bundle for Play Store
eas build --platform android --profile production

# This will:
# 1. Bundle JavaScript with Metro
# 2. Run Gradle assembleRelease
# 3. Sign with your keystore
# 4. Upload .aab to EAS servers
# 5. Provide download URL

# Download the .aab file
# OR use EAS Submit directly (Phase 4)
```

## 3.10 Validate AAB with Bundletool

```powershell
# Download bundletool: https://github.com/google/bundletool/releases
# Save as bundletool.jar in project root

# Generate APK set from AAB (simulates Play Store delivery)
java -jar bundletool.jar build-apks `
  --bundle=.\app-release.aab `
  --output=.\app-release.apks `
  --ks=.\release.keystore `
  --ks-key-alias=z-ai-release `
  --ks-pass=pass:YOUR_STORE_PASSWORD `
  --key-pass=pass:YOUR_KEY_PASSWORD

# Install on connected device
java -jar bundletool.jar install-apks --apks=.\app-release.apks

# Check size of the AAB (Play Store limit: 200 MB)
(Get-Item .\app-release.aab).length / 1MB
# Target: under 50 MB for v1.0.0 (before LLM model files)
```

---

### ✅ Phase 3 Checkpoint

| Check | Pass Criteria |
|:---|:---|
| EAS build completes | Exit code 0, no Gradle errors |
| APK installs on emulator | `adb install` succeeds |
| Splash screen shows | Brand animation plays, retry button appears if backend offline |
| Drawer opens | Swipe gesture works, all 6 menu items visible |
| AAB under 200 MB | `bundletool` generates APK set without errors |
| ProGuard not stripping | App launches without `ClassNotFoundException` |

---

# PHASE 4 — Google Play Store Submission

## 4.1 Create Google Play Developer Account

1. Go to [play.google.com/console](https://play.google.com/console)
2. Pay one-time $25 USD registration fee
3. Complete identity verification (can take 1–3 days)
4. Accept Developer Distribution Agreement

## 4.2 Create New App Listing

**Play Console → All Apps → Create App**

| Field | Value |
|:---|:---|
| App name | `Z-AI Chatbot` |
| Default language | `English (United States)` |
| App or game | `App` |
| Free or paid | `Free` |
| Declarations | Check both boxes |

## 4.3 Write the Store Listing Content

### Short Description (80 chars max)
```
Private AI chat. Runs offline. Your data never leaves your device.
```

### Full Description (4000 chars max)
```
Z-AI Chatbot is a privacy-first, offline-first AI assistant for Android.

🔒 COMPLETE PRIVACY
Every conversation is encrypted with military-grade AES-256 encryption. Your PIN is the only key. Not even we can read your chats.

🌐 WORKS WITHOUT INTERNET
Z-AI runs entirely on your device using compact local AI models (Phi-3 Mini, Gemma 2B). No API calls, no subscriptions, no cloud dependency.

⚡ FAST & LIGHTWEIGHT
Optimized for mid-range Android devices. Full AI responses in seconds using CPU inference.

✨ KEY FEATURES
• Encrypted local storage powered by SQLCipher
• Multiple local AI model support (Phi-3, Gemma, Mistral)
• Conversation history with search
• Optional encrypted backup to your own devices via LAN sync
• Dark mode UI with Brutalist design language
• Zero telemetry — no tracking, no analytics, no ads

🔐 SECURITY ARCHITECTURE
• PIN → Argon2id key derivation (64 MiB RAM cost)
• SQLCipher AES-256-CBC database encryption
• JWT session tokens for local backend authentication
• Ed25519 keypairs for device-to-device sync authentication

📱 REQUIREMENTS
• Android 7.0+ (API 24+)
• 3 GB RAM minimum (4+ GB recommended for Phi-3 Mini)
• 4 GB storage (for app + one AI model)

Z-AI Chatbot — Quietly Intelligent. Entirely Yours.
```

### What's New (Release Notes)
```
v1.0.0 — Initial Release

• Offline AI chat with Phi-3 Mini (3.8B) and Gemma 2B
• AES-256 encrypted conversation storage
• 6-digit PIN protection with Argon2id key derivation
• Real-time hardware telemetry dashboard
• Model manager for installing and switching AI models
• LAN sync foundation (Phase 2)
```

## 4.4 Prepare Required Screenshots

Google Play requires screenshots for each device category.

**Required sizes:**
| Category | Dimensions | Count |
|:---|:---|:---|
| Phone | 1080×1920 px minimum | 2–8 screenshots |
| 7" Tablet (optional) | 1200×1920 px | 1–8 screenshots |
| 10" Tablet (optional) | 1600×2560 px | 1–8 screenshots |
| Feature Graphic | 1024×500 px | 1 (required) |

**Capture screenshots via ADB:**
```powershell
# Take screenshot on connected device
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png .\screenshots\

# Recommended screens to capture:
# 1. SplashScreen — brand animation
# 2. SetupScreen — PIN creation pad
# 3. ChatHome — active conversation with AI response
# 4. ChatHome — empty state "Secure Offline AI"
# 5. Dashboard — hardware telemetry gauges
# 6. Models screen — model list with Phi-3 and Gemma
# 7. Drawer open — showing all navigation items
# 8. Backup screen
```

## 4.5 Create Privacy Policy

> [!IMPORTANT]
> Google Play **requires** a privacy policy for all apps.
> Apps that collect ANY data (even device ID for sync) must have one.

Host this on GitHub Pages or Vercel. Create `privacy-policy.html`:

**File:** `admin-dashboard/public/privacy-policy.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Z-AI Chatbot — Privacy Policy</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #1a1a2e; }
    h1 { color: #0f3460; }
    h2 { color: #16213e; border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
  </style>
</head>
<body>
  <h1>Z-AI Chatbot Privacy Policy</h1>
  <p><strong>Last Updated:</strong> May 30, 2026</p>

  <h2>1. Overview</h2>
  <p>Z-AI Chatbot ("the App") is designed with privacy as its foundation. The App operates entirely offline and stores all data locally on your device using AES-256 encryption.</p>

  <h2>2. Data We Do NOT Collect</h2>
  <ul>
    <li>Conversation content — never transmitted anywhere</li>
    <li>Your PIN or encryption keys — never leave your device</li>
    <li>Usage analytics or telemetry</li>
    <li>Personal identification information</li>
    <li>Location data</li>
    <li>Contacts or media</li>
  </ul>

  <h2>3. Data Stored Locally</h2>
  <p>All data is stored on your device in an AES-256 encrypted database:</p>
  <ul>
    <li>Conversation history (encrypted)</li>
    <li>AI model files (downloaded by you)</li>
    <li>App configuration preferences</li>
  </ul>

  <h2>4. Optional Cloud Sync</h2>
  <p>If you choose to enable LAN Sync or Cloud Backup, only encrypted blobs are transmitted. The encryption key is derived from your PIN and never transmitted. The App uses Convex (convex.dev) as its sync infrastructure when this feature is enabled.</p>

  <h2>5. Internet Permission</h2>
  <p>The App requests INTERNET permission solely for: (1) optional encrypted cloud sync, (2) downloading AI model files you explicitly request, and (3) communication between the app and the local backend service running on the same device.</p>

  <h2>6. Data Deletion</h2>
  <p>Uninstalling the App deletes all locally stored data. For cloud sync data, use the Backup screen's "Delete Cloud Data" option before uninstalling.</p>

  <h2>7. Contact</h2>
  <p>For privacy questions: <a href="mailto:privacy@yourdomain.com">privacy@yourdomain.com</a></p>
</body>
</html>
```

Deploy to Vercel, then add the URL to the Play Console listing.

## 4.6 Complete Content Rating

**Play Console → App Content → Content Rating**

1. Click **Start questionnaire**
2. Category: **Utility**
3. Answer all questions:
   - Violence: **No**
   - Sexual content: **No**
   - Language: **No**
   - Controlled substances: **No**
   - User-generated content: **Yes** (chat messages, encrypted)
   - Social features: **No** (LAN sync is device-to-device, not social)
4. Click **Calculate rating** → Expected: **Everyone**
5. Click **Apply rating**

## 4.7 Configure App Access

**Play Console → App Content → App Access**

Select: **All functionality is available without special access**

(The PIN lock is a local security feature, not a paywall or restricted-access system.)

## 4.8 Set Up Google Play App Signing

> [!IMPORTANT]
> Google Play App Signing is MANDATORY for new apps.
> Google will re-sign your AAB with their key.
> You provide the Upload Key (your keystore from Phase 3).

**Play Console → Setup → App signing**

1. Select **"Use Google-managed key"** (recommended)
2. Upload your upload certificate:

```powershell
# Export upload certificate
keytool -export -rfc `
  -keystore release.keystore `
  -alias z-ai-release `
  -file upload_cert.pem `
  -storepass YOUR_STORE_PASSWORD

# Upload upload_cert.pem to Play Console → App signing → Upload key certificate
```

## 4.9 Create Internal Testing Release

```powershell
# Submit via EAS (fastest path)
eas submit --platform android --profile production

# OR manually via Play Console:
# Play Console → Testing → Internal testing → Create new release → Upload .aab
```

**Play Console → Internal testing:**
1. Click **Create new release**
2. Upload your `.aab` file
3. Add release notes (from 4.3)
4. Click **Review release** → **Start rollout to Internal testing**
5. Add test email addresses (up to 100 testers)

**Test install via Play Store:**
- Testers receive email with opt-in link
- Install from Play Store (not sideload)
- Test all navigation flows on real hardware

## 4.10 Promote to Production

After internal + closed testing passes:

**Play Console → Production → Create new release**

1. Confirm release notes
2. Set rollout percentage: **10%** (staged rollout — safe for first release)
3. Click **Review release** → **Start rollout to Production**

Google review takes **1–3 business days** for first-time submissions.

---

### ✅ Phase 4 Checkpoint

| Item | Status |
|:---|:---|
| Store listing complete (title, description, screenshots) | `[ ]` |
| Feature graphic uploaded (1024×500 px) | `[ ]` |
| Privacy policy URL added to listing | `[ ]` |
| Content rating completed (target: Everyone) | `[ ]` |
| App signing configured with upload key | `[ ]` |
| AAB uploaded to Internal testing track | `[ ]` |
| At least 1 internal tester installed and tested | `[ ]` |
| No policy violations flagged by Play Console | `[ ]` |

---

# Post-Launch Maintenance

## Versioning Protocol

Every release requires two version bumps:

**`app.json`:**
```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 2
    }
  }
}
```

- `version` → Semantic version (shown to users)
- `versionCode` → Integer, incremented by 1 each release (Play Store requirement)

## Release Flow

```powershell
# 1. Bump versions in app.json
# 2. Commit version bump
git add app.json
git commit -m "chore: bump version to 1.0.1 (versionCode 2)"
git tag v1.0.1
git push origin main --tags

# 3. Build production AAB
eas build --platform android --profile production

# 4. Submit to internal testing first
eas submit --platform android --profile production

# 5. Promote to production via Play Console after testing
```

## Monitoring Crashes

```powershell
# Check for ANR (App Not Responding) and crash reports:
# Play Console → Android vitals → Crashes & ANRs

# View Logcat for debugging user-reported issues
adb logcat -s ReactNativeJS:E AndroidRuntime:F | tee crash_log.txt
```

## Backend Update Checklist

When updating the FastAPI backend bundled with the app:
- `[ ]` Test migration with existing database (do NOT wipe user data)
- `[ ]` Increment `APP_VERSION` in `.env`
- `[ ]` Run schema migrations with Alembic if models changed
- `[ ]` Test `db.salt` → `unlock()` flow still works after migration

---

# Master Troubleshooting Reference

| Issue | Phase | Cause | Fix |
|:---|:---|:---|:---|
| `git push` rejected | 1 | Branch protection on `main` | Push to `develop` branch, open PR |
| Convex schema deploy fails | 2 | TypeScript errors in schema | Run `npx tsc --noEmit` in project root |
| `npx convex run` returns 404 | 2 | Wrong function path | Use `module:functionName` format |
| `eas build` fails: Gradle error | 3 | Missing Android SDK | Install Android Studio + SDK 35 |
| `keytool` not found | 3 | JDK not on PATH | Add `C:\Program Files\Android\Android Studio\jbr\bin` to PATH |
| AAB over 200 MB | 3 | LLM model bundled in APK | Use runtime model download, never bundle `.gguf` files in APK |
| ProGuard crash: `ClassNotFoundException` | 3 | ProGuard stripping class | Add `-keep class CLASSNAME { *; }` to `proguard-rules.pro` |
| Play Console rejects AAB | 4 | Wrong signing key | Re-sign with upload keystore, not the App Signing key |
| "Your APK or Android App Bundle needs to be signed" | 4 | EAS didn't sign properly | Check `eas.json` has `"distribution": "store"` |
| Policy violation: Permissions | 4 | Undeclared permission usage | Declare all permissions in `app.json` `android.permissions` |
| Privacy policy URL rejected | 4 | URL not publicly accessible | Deploy to Vercel prod, test with incognito browser |
| Content rating: "Unable to apply" | 4 | Questionnaire incomplete | Re-run questionnaire, answer ALL questions |
| Internal tester can't install | 4 | Not opted in to test track | Send tester the opt-in URL from Play Console |
| Production review rejected | 4 | Policy violation | Read rejection email carefully, fix and resubmit |
| Crash after Play Store install | 4 | ProGuard stripped a class | See ProGuard fix above |
| `versionCode` conflict | 4 | Submitted same code twice | Increment `versionCode` by 1 in `app.json` |
| `EXPO_PUBLIC_CONVEX_URL` undefined | 2+3 | Missing env var in EAS build | Add to EAS secrets: `eas secret:create --name EXPO_PUBLIC_CONVEX_URL --value YOUR_URL` |
