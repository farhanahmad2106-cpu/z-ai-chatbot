# Implementation Gap Register — Z-SeHealth

**Document Title:** Implementation Gap Register
**Version:** 1.0
**Effective Date:** September 2026
**Owner / Contact:** Z-SeHealth Development & Compliance Team — support.zsehealth@gmail.com
**Purpose:** Identifies every technical, legal, and operational control that the legal/compliance documents depend upon but that cannot be confirmed as implemented from the current codebase and supplied architecture.

---

## Priority Legend

| Priority | Meaning |
|---|---|
| 🔴 **Critical** | Must be resolved before accepting real user data or payments in production |
| 🟡 **High** | Should be resolved before public launch; poses meaningful compliance or security risk |
| 🟢 **Medium** | Should be resolved for full compliance; manageable risk in the interim |
| ⚪ **Low** | Best practice improvement; not an immediate compliance blocker |

---

## 1. Privacy & Data Protection

| # | Gap | Priority | Description | Legal Document Dependency |
|---|---|---|---|---|
| P-01 | **Data Deletion Implementation** | 🔴 Critical | The Privacy Policy promises account and health data deletion. The Application has a "Delete Account" modal in `Settings.tsx`, but the backend implementation of a complete data deletion endpoint (removing user record, health profile, usage data, meal logs, and crowdsourced food submissions from MongoDB) has not been verified. | Privacy Policy §13.3, §14 |
| P-02 | **Backup Retention & Deletion** | 🟡 High | MongoDB Atlas may retain deleted data in automated backups. The backup retention period and whether user data can be purged from backups is unknown. The Privacy Policy discloses this limitation but does not specify a concrete backup retention period. | Privacy Policy §11, §13.3 |
| P-03 | **AI Provider Data Retention Contracts** | 🟡 High | The Privacy Policy correctly distinguishes Z-SeHealth retention from provider retention. However, no evidence of data processing agreements (DPAs) or contractual data retention terms with Sarvam AI, NVIDIA, or Google Gemini has been provided. These are necessary to establish contractual guarantees about provider-side data handling. | Privacy Policy §8 |
| P-04 | **Cross-Border Transfer Mechanism** | 🟡 High | Data is transmitted to AI providers whose infrastructure may be located outside India. The DPDP Act 2023 provisions on cross-border transfer (and any Government notifications restricting transfers to specific jurisdictions) must be monitored. No specific transfer mechanism (e.g., adequacy determination, contractual clauses) has been identified. | Privacy Policy §9 |
| P-05 | **Consent Logging** | 🟡 High | No consent audit log collection exists in the current MongoDB schema. The UI Compliance Spec specifies a consent logging schema, but this is not yet implemented. Consent records are necessary for demonstrating lawful processing under the DPDP Act. | Privacy Policy §6, UI Compliance Spec §8 |
| P-06 | **Data Access Request Mechanism** | 🟢 Medium | The Privacy Policy grants data access rights. No automated mechanism exists for users to export or download a copy of their personal data. Currently, users would need to email support. | Privacy Policy §13.1 |
| P-07 | **Incident Response Plan** | 🟡 High | The Privacy Policy commits to breach notification. No formal documented incident response plan, communication templates, or escalation procedures exist. | Privacy Policy §17 |
| P-08 | **Image Retention Verification** | 🟡 High | The Privacy Policy states that uploaded images are "intended to be processed transiently." The backend code processes images in memory and passes them to AI providers, but whether any server-side logging, temporary file storage, or error-case retention of uploaded images occurs has not been exhaustively verified. | Privacy Policy §8, §11 |
| P-09 | **System Log Data Minimisation** | 🟢 Medium | `system_logs` collection may contain user-identifying information in error traces. No log scrubbing or data minimisation policy is implemented. No retention period or automatic purging is configured. | Privacy Policy §4.7, §11 |

---

## 2. Authentication & Access Control

| # | Gap | Priority | Description | Legal Document Dependency |
|---|---|---|---|---|
| A-01 | **Account Deletion Backend** | 🔴 Critical | The Settings page has a "Delete Account" modal, but the backend endpoint for complete account deletion (deleting from `users` collection, revoking Firebase Auth account, cleaning up `admins` entries if applicable, and cleaning up associated data) has not been verified in the codebase. | Terms of Service §9.4, Privacy Policy §13.3 |
| A-02 | **Firebase Session Persistence Configuration** | 🟢 Medium | The Cookie Policy describes Firebase's default persistence behaviour. The actual Firebase configuration in `firebase.ts` should be verified to confirm which persistence mode is active (local, session, or none). | Cookie Policy §4 |
| A-03 | **Admin Privilege Separation** | 🟢 Medium | Admin RBAC is implemented via `get_current_admin` dependency and granular permission flags. However, the separation between admin data access and regular user data access should be audited to ensure administrators cannot access user health data beyond what is necessary for support. | Privacy Policy §7.4 |
| A-04 | **Token Replay Protection** | 🟢 Medium | Firebase ID tokens are verified server-side, but no additional replay or reuse protection (e.g., token jti tracking or one-time-use enforcement) is implemented beyond Firebase's built-in token expiry (1 hour). | Terms of Service §10 |

---

## 3. Payments & Subscriptions

| # | Gap | Priority | Description | Legal Document Dependency |
|---|---|---|---|---|
| R-01 | **Refund Processing Endpoint** | 🟡 High | The Refund Policy describes a refund process, but no backend endpoint for initiating Razorpay refunds (via Razorpay's Refund API) has been identified in the codebase. Refunds would currently need to be processed manually via the Razorpay Dashboard. | Refund Policy §3, §9, §10 |
| R-02 | **Transaction Logging** | 🟡 High | The webhook handler processes payment events and updates user records, but does not appear to write to a dedicated `transactions` collection for audit trail purposes. The MEMORY.md references a `transactions` collection, but the webhook code updates the `users` collection directly. | Refund Policy §11, Privacy Policy §4.6 |
| R-03 | **Webhook Replay Protection** | 🟢 Medium | The webhook handler verifies HMAC-SHA256 signatures but does not implement idempotency or replay protection (e.g., tracking processed webhook event IDs to prevent duplicate processing). | Refund Policy §8 |
| R-04 | **Webhook Secret in Production** | 🔴 Critical | The `_verify_razorpay_signature` function has a fallback that allows webhooks without signature verification if `RAZORPAY_WEBHOOK_SECRET` is not set (returns `True` with a warning). This fallback MUST be removed or disabled in production. | Terms of Service §10, Refund Policy §3 |
| R-05 | **Subscription Entitlement Reconciliation** | 🟢 Medium | No periodic reconciliation process exists to verify that user entitlements in MongoDB match the actual Razorpay subscription status. If webhook events are missed, user entitlements could become out of sync. | Refund Policy §7, §8 |
| R-06 | **GST/Tax Compliance** | 🟢 Medium | The pricing page mentions "GST may apply." Actual GST registration, invoicing, and tax compliance obligations have not been assessed. | Terms of Service §12.1 |

---

## 4. AI & OCR Pipeline

| # | Gap | Priority | Description | Legal Document Dependency |
|---|---|---|---|---|
| AI-01 | **Provider Data Use/Training Policies** | 🟡 High | The AI providers (Sarvam AI, NVIDIA NIM, Google Gemini) may use API request data for model training or improvement. The specific opt-out status and contractual terms for each provider have not been verified. Google's Gemini API paid tier has different data use policies than the free tier — the actual tier in use should be confirmed. | Privacy Policy §8 |
| AI-02 | **Provider Regional Processing** | 🟢 Medium | The geographic location of processing infrastructure for each AI provider has not been verified. This affects cross-border data transfer obligations. | Privacy Policy §9 |
| AI-03 | **API Logging and Prompt Storage** | 🟢 Medium | Whether AI providers log, cache, or store the prompts and images sent via their APIs (and for how long) is governed by each provider's terms and may vary. This should be reviewed for each provider. | Privacy Policy §8.3 |
| AI-04 | **Image Data in Error Logs** | 🟢 Medium | If an AI API call fails, the error handling code prints error messages that may include partial response data. It has not been verified whether full image data or prompts are included in server-side error logs. | Privacy Policy §4.7 |

---

## 5. Frontend Security

| # | Gap | Priority | Description | Legal Document Dependency |
|---|---|---|---|---|
| F-01 | **Content Security Policy (CSP)** | 🟡 High | No Content Security Policy headers have been identified in the Vercel deployment configuration or HTML meta tags. CSP headers would mitigate XSS risks. | Terms of Service §10 |
| F-02 | **LocalStorage Sensitive Data** | 🟢 Medium | `z_sehealth_cached_user_stats` contains personalised nutritional data in LocalStorage. While this is not highly sensitive, it is accessible to any JavaScript running on the same origin. XSS would expose this data. CSP (F-01) would mitigate this risk. | Cookie Policy §2.2, Privacy Policy §12 |
| F-03 | **HTTPS Enforcement** | 🟢 Medium | Vercel enforces HTTPS by default for `.vercel.app` domains. If a custom domain is used in the future, HTTPS enforcement (including HSTS headers) must be verified. | Privacy Policy §10 |
| F-04 | **Upload Validation** | 🟢 Medium | The frontend accepts JPEG, PNG, and WEBP uploads with a stated maximum of 5 MB. Server-side validation of file type (MIME type verification, magic byte checking), file size enforcement, and protection against malicious file uploads should be verified in `backend/routes/scan.py`. | Terms of Service §10 |
| F-05 | **CORS Configuration Audit** | 🟢 Medium | CORS is configured for localhost and `*.vercel.app` wildcard. The wildcard pattern should be reviewed to ensure it does not inadvertently permit requests from unintended origins. | Privacy Policy §10.2 |

---

## 6. Backend Security

| # | Gap | Priority | Description | Legal Document Dependency |
|---|---|---|---|---|
| B-01 | **Rate Limiting** | 🟡 High | No API rate limiting has been identified beyond the scan quota enforcement. Endpoints like `/api/scan/analyze`, `/api/translate`, and `/api/foods` could be vulnerable to abuse without rate limiting. | Terms of Service §10, §15 |
| B-02 | **File Upload Validation** | 🟡 High | Server-side validation of uploaded files (MIME type verification, file size enforcement, magic byte checking) should be verified. The backend uses `multipart/form-data` processing but the exact validation logic has not been exhaustively reviewed. | Terms of Service §10 |
| B-03 | **Malware Scanning** | ⚪ Low | No malware scanning of uploaded images has been identified. Given that uploads are limited to image files and are immediately processed by AI APIs rather than stored or served, the risk is lower, but this is a defence-in-depth consideration. | Terms of Service §10 |
| B-04 | **Secrets Management** | 🟢 Medium | Secrets are managed via environment variables (`.env` files). No secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault, Google Secret Manager) is used. Environment variables are the minimum acceptable approach but may be vulnerable to exposure in logs, process listings, or container metadata. | Privacy Policy §10.2 |
| B-05 | **Database Access Controls** | 🟢 Medium | MongoDB Atlas network access controls (IP allowlisting, VPC peering) and database user permissions should be reviewed to ensure least-privilege access. | Privacy Policy §10.1 |
| B-06 | **Request Size Limits** | 🟢 Medium | FastAPI/Uvicorn default request size limits should be verified to ensure they align with the stated 5 MB upload maximum and prevent denial-of-service via oversized requests. | Terms of Service §10 |
| B-07 | **Auth on Public Endpoints** | 🟢 Medium | Several endpoints (`/api/foods`, `/api/translate`, `/api/scan`, `/api/auth/sync`) do not require authentication. This is by design for the food search and auth sync endpoints, but the translate and scan endpoints should be reviewed for potential abuse. | Terms of Service §10 |

---

## 7. Legal Document Delivery

| # | Gap | Priority | Description | Legal Document Dependency |
|---|---|---|---|---|
| L-01 | **Legal Page Routes** | 🟡 High | The legal documents (Privacy Policy, Terms of Service, Refund Policy, Cookie Policy) need to be accessible within the Application. Routes (`/legal/privacy`, `/legal/terms`, `/legal/refunds`, `/legal/cookies`) do not currently exist. Z-SeHealth uses tab-based navigation, so these may need to be implemented as new tab states or standalone pages. | UI Compliance Spec §7 |
| L-02 | **Legal Footer Integration** | 🟡 High | The legal footer specified in the UI Compliance Spec must be added to `App.tsx` to provide persistent links to all legal documents. | UI Compliance Spec §7 |
| L-03 | **Terms Acceptance Flow** | 🟡 High | No explicit Terms of Service acceptance flow exists at account registration. Users should be required to acknowledge the Terms and Privacy Policy before creating an account. | Terms of Service §1, Privacy Policy §6 |
| L-04 | **Health Vault Consent Modal** | 🟡 High | The Health Vault consent modal specified in the UI Compliance Spec must be implemented in `Profile.tsx` before health data is collected. The current implementation does not include an explicit consent gate. | UI Compliance Spec §2, Privacy Policy §6, §7 |
| L-05 | **Scanner Disclaimer** | 🟢 Medium | The scanner disclaimer specified in the UI Compliance Spec must be added to `Scan.tsx`. | UI Compliance Spec §1 |
| L-06 | **Checkout Consent Microcopy** | 🟢 Medium | The Razorpay checkout consent microcopy must be added to `PricingPage.tsx`. | UI Compliance Spec §4 |

---

## 8. Accessibility

| # | Gap | Priority | Description | Legal Document Dependency |
|---|---|---|---|---|
| AC-01 | **Focus Trapping in Modals** | 🟢 Medium | Multiple modals exist (login, health profile, translator, ingredient review, upgrade, delete account). Focus trapping to prevent tabbing out of open modals has not been verified for all modals. | UI Compliance Spec §6.14 |
| AC-02 | **Reduced Motion Support** | 🟢 Medium | The Application uses CSS animations (`animate-in`, `fade-in`, `slide-in-from-bottom`). A `prefers-reduced-motion` media query override has not been verified in the CSS. | UI Compliance Spec §6.11 |
| AC-03 | **ARIA Attributes Audit** | 🟢 Medium | Comprehensive ARIA attribute usage (dialog roles, live regions, form validation) has not been verified across all components. | UI Compliance Spec §6.9 |
| AC-04 | **Heading Hierarchy Audit** | ⚪ Low | Each page/tab should have a single `h1` and proper heading hierarchy. This has not been verified across all tab views. | UI Compliance Spec §6.7 |
| AC-05 | **Contrast Remediation** | 🟢 Medium | `text-gray-500` fails WCAG AA for normal-sized text on dark backgrounds. Several instances of `text-gray-500` are used for informational labels in the codebase. These should be upgraded to `text-gray-400` where the text conveys meaningful content. | UI Compliance Spec §6.2, §6.4 |
| AC-06 | **Touch Target Sizes** | ⚪ Low | Minimum 44×44px touch targets have not been verified for all interactive elements, particularly small buttons and inline controls. | UI Compliance Spec §6.12 |

---

## Summary Statistics

| Priority | Count |
|---|---|
| 🔴 Critical | 3 |
| 🟡 High | 14 |
| 🟢 Medium | 19 |
| ⚪ Low | 3 |
| **Total** | **39** |

---

## Recommended Implementation Order

### Phase 1 — Critical (Before Production)

1. **R-04:** Remove webhook signature bypass in production
2. **P-01 / A-01:** Implement complete account deletion backend endpoint
3. **R-01:** Implement Razorpay refund processing endpoint or manual workflow

### Phase 2 — High Priority (Before Public Launch)

4. **L-01 / L-02:** Create legal page routes and footer
5. **L-03:** Implement Terms acceptance flow at registration
6. **L-04:** Implement Health Vault consent modal
7. **P-05:** Implement consent audit logging
8. **P-07:** Draft incident response plan
9. **R-02:** Implement transaction audit logging
10. **F-01:** Configure Content Security Policy headers
11. **B-01:** Implement API rate limiting

### Phase 3 — Medium Priority (Ongoing Compliance)

12. All remaining 🟢 Medium items

### Phase 4 — Best Practice

13. All remaining ⚪ Low items

---

*This Implementation Gap Register was drafted as part of the Z-SeHealth compliance framework. It identifies implementation obligations and should be treated as a living document, updated as gaps are resolved or new gaps are identified. Independent security and legal review is recommended.*
