# Z-AI Chatbot: Project Update & Deployment Guide

This comprehensive guide is based on your current project structure and the detailed `full_deployment_guide.md` and `proguard-rules.pro` files. Follow these steps in order to take your React Native + Convex + FastAPI application from local testing to a live Google Play Store release.

## 1. Project Structure Review

Based on the [full_deployment_guide.md](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/full_deployment_guide.md) and [proguard-rules.pro](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/android/app/proguard-rules.pro), the architecture is robust and relies on the following key components:

*   **Frontend**: React Native (Expo 56)
*   **Backend**: Local Python FastAPI (Port 8765)
*   **Cloud Sync**: Convex (Opt-in cloud synchronization)
*   **Database/Encryption**: SQLCipher for local storage
*   **Build Pipeline**: EAS (Expo Application Services)

> [!NOTE]
> The `proguard-rules.pro` file correctly includes exceptions for SQLCipher, Reanimated, Gesture Handler, Hermes, OkHttp, and Convex. This prevents class-stripping crashes in production Android builds (`ClassNotFoundException`).

---

## 2. Convex Database Setup & Local Testing

Convex serves as the cloud synchronization layer for encrypted conversation backups. Ensure it functions properly before generating a production build.

### A. Initialization & Setup
1.  Verify Convex is installed globally and locally.
2.  Run `npx convex dev` in your project root to start the Convex local dev server. This command will auto-update your `.env.local` with the `CONVEX_URL`.
3.  Ensure the `EXPO_PUBLIC_CONVEX_URL` variable is properly set in your terminal environment and `.env.local` file.
4.  Ensure [convex/schema.ts](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/convex/schema.ts) has been successfully pushed.

### B. Connection Verification
Run the following Convex CLI functions to test the connection and database functionality:

```powershell
# 1. Test Device Registration
npx convex run sync:registerDevice '{
  "device_id": "test-device-001",
  "device_name": "Test Android",
  "platform": "android",
  "public_key_hex": "abcdef1234",
  "owner_token": "test-owner-hash"
}'

# 2. Test Device Retrieval
npx convex run sync:getTrustedDevices '{"owner_token": "test-owner-hash"}'

# 3. Test Conversation Push
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
```
> [!IMPORTANT]
> Verify that the Convex Dashboard shows the test data populating in `sync_devices` and `conversation_backups` tables. Clean up test data manually from the dashboard afterwards.

---

## 3. Android Application Deployment Preparation

Before building the Android Application Bundle (AAB), ensure the local environment is prepped and all code dependencies are met.

1.  **Generate Native Files**: Run `npx expo prebuild --clean --platform android` to generate the `/android` directory.
2.  **Verify ProGuard Rules**: Ensure that [android/app/proguard-rules.pro](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/android/app/proguard-rules.pro) contains the necessary configurations to prevent stripping of Convex, Reanimated, and SQLCipher.
3.  **Generate Release Keystore**:
    ```powershell
    keytool -genkey -v -keystore release.keystore -alias z-ai-release -keyalg RSA -keysize 4096 -validity 10000 -storepass YOUR_STORE_PASSWORD -keypass YOUR_KEY_PASSWORD
    ```
4.  **Set EAS Environment Variables**: 
    Ensure EAS has the Convex URL by running:
    `eas env:create preview --name EXPO_PUBLIC_CONVEX_URL --value YOUR_CONVEX_URL --type string`
5.  **Local Backend Configuration**:
    Ensure `host: str = Field(default="0.0.0.0")` is hardcoded in [backend/app/core/config.py](file:///c:/Farhan%20Ahmad/Code%20Languages/Mr.%20Z/Anti%20Gravity/AI%20Chatbot/backend/app/core/config.py) so the phone can reach the local Python API.

---

## 4. Google Play Store Submission Checklist

Follow this checklist strictly to ensure the app complies with Google's requirements and is successfully listed.

### App Bundle & Code
- [ ] `app.json` has `version` bumped (e.g., `1.0.0`).
- [ ] `app.json` has Android `versionCode` bumped (e.g., `1`).
- [ ] Production AAB built successfully using `eas build --platform android --profile production`.
- [ ] AAB size is under 200 MB (verified via Bundletool).
- [ ] `release.keystore` is backed up safely off-machine.

### Store Listing & Metadata
- [ ] **Short Description** (Max 80 chars) written.
- [ ] **Long Description** (Max 4000 chars) highlighting offline AI and privacy written.
- [ ] **Screenshots** (2-8) uploaded for phone form factor.
- [ ] **Feature Graphic** (1024x500 px) uploaded.
- [ ] **Privacy Policy** HTML file uploaded to Vercel/GitHub Pages and linked in the console.

### Console Configuration
- [ ] **Content Rating** questionnaire completed (Expected: Everyone).
- [ ] **App Access** set to "All functionality is available without special access".
- [ ] **App Signing** configured to "Use Google-managed key", with `upload_cert.pem` uploaded.

---

## 5. File Verification Checklist

Before pushing code or generating the final build, cross-reference these files in the project root:

- [ ] `.gitignore`: Confirmed that `release.keystore`, `.env`, `data/db/`, and `convex/_generated/` are explicitly ignored.
- [ ] `app.json`: `android.permissions` array includes INTERNET, and `expo.extra.convexUrl` is present.
- [ ] `eas.json`: Contains `preview` (apk) and `production` (app-bundle) profiles.
- [ ] `android/app/proguard-rules.pro`: Includes `dev.convex.**` and `net.sqlcipher.**`.
- [ ] `convex/schema.ts`: Defines `sync_devices`, `conversation_backups`, `message_backups`, and `sync_events`.
- [ ] `src/services/baseUrl.ts`: Local backend IP is set correctly for testing (or reverted to production defaults if routing dynamically).
- [ ] `backend/app/core/config.py`: Host is `0.0.0.0` for local testing.

---

## 6. Execution Sequence

To prevent blockers, perform the deployment steps in this exact chronological order:

1.  **Local Testing**: 
    - Start the FastAPI backend via `uv run --python 3.12 main.py`.
    - Start Expo Go via `npx expo start --clear`.
    - Test the physical Android device connection and AI Inference.
2.  **Convex Verification**:
    - Run Convex tests using `npx convex run`.
    - Verify data appears in the Convex Dashboard.
3.  **App Bundling (APK & AAB)**:
    - Generate Keystore.
    - Run `eas build --platform android --profile preview` to test an APK locally.
    - Run `eas build --platform android --profile production` to generate the final `.aab`.
4.  **Play Store Preparation**:
    - Create App Listing, answer Content Rating questionnaire, and upload Privacy Policy.
    - Upload `.aab` to Internal Testing track.
    - Test via Play Store, then promote to Production (10% staged rollout recommended).
