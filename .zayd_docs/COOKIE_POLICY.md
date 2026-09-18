# Cookie & Local Storage Policy — Z-SeHealth

**Document Title:** Cookie & Local Storage Policy
**Version:** 1.0
**Effective Date:** Effective upon publication
**Last Updated:** September 2026
**Owner / Contact:** Z-SeHealth Development & Compliance Team — support.zsehealth@gmail.com
**Scope:** All users of the Z-SeHealth web application at https://z-sehealth.vercel.app.

---

## 1. Cookies

### 1.1 What Are Cookies?

Cookies are small text files placed on your device by a website's server. They are stored by your browser and sent back to the server with subsequent requests.

### 1.2 Cookies Set by Z-SeHealth

The Z-SeHealth application code does not directly set HTTP cookies for application functionality. The Application primarily uses browser LocalStorage (described in Section 2) for client-side data persistence.

### 1.3 Third-Party Cookies and Infrastructure Cookies

However, the following third-party services integrated with or hosting Z-SeHealth may set cookies:

| Service | Type | Purpose |
|---|---|---|
| **Firebase Authentication (Google)** | First-party / Third-party | Firebase may set cookies or use browser storage mechanisms (IndexedDB, localStorage, sessionStorage) for authentication session persistence and CSRF protection |
| **Vercel** | Infrastructure | Vercel's hosting infrastructure may set cookies for load balancing, analytics, bot protection, or other infrastructure purposes as described in Vercel's privacy policy |
| **Razorpay** | Third-party | When the Razorpay checkout modal is opened for payment processing, Razorpay may set cookies for session management, fraud prevention, and payment processing |
| **Google Fonts** | Third-party | The Application loads Manrope and Outfit fonts from Google Fonts, which may result in Google setting cookies or collecting request metadata as described in Google's privacy policy |

### 1.4 First-Party vs Third-Party Distinction

- **First-party cookies** are set by the domain you are visiting (z-sehealth.vercel.app)
- **Third-party cookies** are set by domains other than the one you are visiting (e.g., google.com, razorpay.com)

Z-SeHealth does not use cookies for third-party advertising or behavioural tracking. No advertising network cookies or tracking pixels are intentionally deployed by Z-SeHealth.

> **Note:** The absence of intentional advertising trackers has been assessed based on the application's current codebase. Third-party services (Vercel, Firebase, Google Fonts) may independently set cookies or collect data as described in their respective privacy policies.

---

## 2. LocalStorage

### 2.1 What Is LocalStorage?

LocalStorage is a browser-native web storage API that allows web applications to store key-value pairs persistently on the user's device. **LocalStorage is not a cookie.** Unlike cookies:

- LocalStorage data is not automatically sent to the server with HTTP requests
- LocalStorage has a larger storage capacity (typically 5–10 MB per origin)
- LocalStorage data persists until explicitly cleared by the user or the application

### 2.2 LocalStorage Keys Used by Z-SeHealth

The following LocalStorage keys are used by Z-SeHealth. All data stored in LocalStorage remains exclusively on your device and is never transmitted to Z-SeHealth's servers.

#### `z_sehealth_cached_search_foods`

- **Purpose:** Caches food search results to reduce redundant API calls and improve perceived loading speed
- **Content:** Serialised JSON containing the most recent food search response data
- **Sensitivity:** Low — contains food database information (names, safety scores, ingredients) that is otherwise publicly queryable
- **Behaviour:** Updated each time a food search is performed. Read on subsequent searches to display cached results while fresh data loads from the server

#### `z_sehealth_cached_user_stats`

- **Purpose:** Caches the user's daily macro statistics (calories, protein, carbs, fat) for faster dashboard rendering
- **Content:** Serialised JSON of the user's current daily nutritional statistics
- **Sensitivity:** Medium — contains personalised nutritional tracking data
- **Behaviour:** Updated after each successful API response from `/api/user/stats` and after meal logging

#### `z_sehealth_cached_user_streak`

- **Purpose:** Caches the user's login streak count for instant display in the navbar
- **Content:** Serialised integer representing consecutive daily login count
- **Sensitivity:** Low
- **Behaviour:** Updated after each successful stats API response

#### `z_sehealth_quote_history`

- **Purpose:** Tracks which motivational quotes have been displayed and controls the rotation schedule
- **Content:** JSON map of quote IDs to display records, including:
  - `displayCount` — number of times the quote has been shown
  - `lastShownTimestamp` — Unix timestamp (milliseconds) of the last display
  - `isSaved` — whether the user has saved/bookmarked the quote

##### Quote Rotation Formula

The quote cooldown formula implemented in `quoteEngine.ts` is:

**Cooldown Duration = 3 × i days**

where `i` is the number of times the quote has been displayed:

| Display Count (i) | Cooldown Before Next Eligible Display |
|---|---|
| 1st display | 3 days |
| 2nd display | 6 days |
| 3rd display | 9 days |
| nth display | 3n days |

If all quotes are on cooldown, the system selects the quote that was shown longest ago.

- **Sensitivity:** Low — contains only quote display metadata, not personal health data

#### `recentSearchedFoods`

- **Purpose:** Stores the list of recently viewed food items for the "Recently Viewed" carousel in the Search tab
- **Content:** JSON array of up to 15 recently clicked food item objects
- **Sensitivity:** Low — contains food item metadata
- **Behaviour:** Updated each time a user clicks on a food search result

#### `unauthenticatedScanCount`

- **Purpose:** Tracks scan usage for users who have not yet logged in, to enforce the free-tier limit before authentication
- **Content:** Integer count of scans performed
- **Sensitivity:** Low
- **Behaviour:** Incremented each time an unauthenticated scan is performed

---

## 3. SessionStorage

SessionStorage is similar to LocalStorage but is scoped to a single browser tab and is cleared when the tab is closed. Z-SeHealth may use SessionStorage for temporary state management during a browsing session. SessionStorage data is never transmitted to the server.

---

## 4. Authentication Storage

Firebase Authentication uses browser storage mechanisms for session persistence. The specific mechanism depends on the Firebase SDK version and configuration:

- **IndexedDB** is the default persistence mechanism in modern browsers for Firebase Authentication v9+ (modular SDK)
- **localStorage** may be used as a fallback in browsers that do not support IndexedDB or where IndexedDB is restricted
- **sessionStorage** or in-memory persistence may be used depending on Firebase configuration

Firebase authentication persistence stores:

- Authentication tokens (ID tokens, refresh tokens)
- User metadata (UID, email, display name)
- Authentication state

These tokens are managed by the Firebase SDK and are used to maintain your signed-in session. Z-SeHealth does not directly manipulate Firebase's authentication storage.

**Z-SeHealth does not store your password** in any browser storage mechanism. Passwords are handled exclusively by Firebase Authentication.

---

## 5. Tracking

Z-SeHealth does not use:

- Third-party advertising cookies or tracking pixels
- Behavioural tracking for advertising purposes
- Cross-site tracking technologies
- Fingerprinting techniques

This assessment is based on the current application codebase. Third-party services integrated with Z-SeHealth (Firebase, Vercel, Google Fonts) may independently collect usage data as described in their respective privacy policies.

---

## 6. Vercel and Infrastructure

Z-SeHealth's frontend is hosted on Vercel's platform. Vercel may:

- Collect HTTP request metadata (IP addresses, user agent strings, request timestamps) as part of its hosting infrastructure
- Set infrastructure-level cookies for routing, load balancing, or security purposes
- Provide analytics data to Z-SeHealth about aggregate traffic patterns

For details on Vercel's data practices, refer to Vercel's Privacy Policy at https://vercel.com/legal/privacy-policy.

---

## 7. How to Clear Browser Storage

You can clear LocalStorage, cookies, and other site data at any time. Here are instructions for major browsers:

### Google Chrome / Chromium-based Browsers (Edge, Brave, Opera)

1. Click the **three-dot menu** (⋮) → **Settings**
2. Navigate to **Privacy and security** → **Clear browsing data**
3. Select the **Advanced** tab
4. Check **Cookies and other site data** (this also clears LocalStorage)
5. Optionally, select a time range
6. Click **Clear data**

**To clear only Z-SeHealth data:**
1. Navigate to `chrome://settings/content/all` (or Settings → Privacy → Site Settings → View permissions and data stored across sites)
2. Search for `z-sehealth.vercel.app`
3. Click the site entry → **Clear data**

### Mozilla Firefox

1. Click the **hamburger menu** (☰) → **Settings**
2. Navigate to **Privacy & Security**
3. Under **Cookies and Site Data**, click **Manage Data**
4. Search for `z-sehealth.vercel.app`
5. Select the entry and click **Remove Selected**

### Safari (macOS / iOS)

1. Go to **Safari** → **Preferences** (macOS) or **Settings** → **Safari** (iOS)
2. Navigate to **Privacy** → **Manage Website Data**
3. Search for `z-sehealth.vercel.app`
4. Select and click **Remove**

### Microsoft Edge

1. Click the **three-dot menu** (⋯) → **Settings**
2. Navigate to **Privacy, search, and services** → **Clear browsing data**
3. Click **Choose what to clear**
4. Check **Cookies and other site data**
5. Click **Clear now**

### Mobile Browsers (General)

- **Chrome (Android):** Menu → Settings → Privacy → Clear browsing data → Cookies and site data
- **Safari (iOS):** Settings → Safari → Clear History and Website Data
- **Firefox (Mobile):** Menu → Settings → Delete browsing data

---

## 8. Consequences of Clearing Storage

Clearing Z-SeHealth's browser storage will result in the following effects:

| Effect | Description |
|---|---|
| **Cached search data cleared** | Previously cached food search results will be removed. The next search will fetch fresh data from the server. |
| **Cached stats cleared** | Dashboard macro statistics will be re-fetched from the server on next load instead of displaying instantly from cache. |
| **Streak cache cleared** | Login streak display will be re-fetched from the server. The actual streak value on the server is not affected. |
| **Quote history reset** | All motivational quote display counts and cooldowns will be reset. Previously seen quotes may appear sooner than expected. Saved/bookmarked quotes will be lost from the local record. |
| **Recently viewed items cleared** | The "Recently Viewed" carousel in the Search tab will be empty until you view new food items. |
| **Unauthenticated scan count reset** | If you were using the app without logging in, your local scan counter will reset. |
| **Authentication session ended** | If Firebase authentication storage is cleared, you will be signed out and will need to log in again. |
| **No server-side data loss** | Clearing browser storage does **not** delete your account, health profile, meal logs, subscription, or any data stored on Z-SeHealth's servers. |

---

*This Cookie & Local Storage Policy was drafted as part of the Z-SeHealth compliance framework. It does not constitute legal advice. Independent legal review is recommended before deployment.*
