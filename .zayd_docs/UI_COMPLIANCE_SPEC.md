# UI Compliance Specification — Z-SeHealth

**Document Title:** UI Compliance Specification
**Version:** 1.0
**Effective Date:** Effective upon publication
**Last Updated:** September 2026
**Owner / Contact:** Z-SeHealth Development & Compliance Team — support.zsehealth@gmail.com
**Scope:** Implementation specification for legal, privacy, consent, and accessibility compliance in the Z-SeHealth frontend.

---

## 1. Scanner Disclaimer

### Location

`Scan.tsx` — Display immediately below the scan result area, visible whenever analysis results are shown.

### Exact Copy

```
⚠️ AI analysis is indicative only. OCR and AI models may misread, omit, or misidentify ingredients. 
Always inspect the physical packaging and allergen declaration for severe allergies. 
This is not medical advice. Consult a healthcare professional for allergy-related decisions.
```

### Implementation Notes

- Display in a visually distinct container: `bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4`
- Text: `text-xs text-amber-300/90 leading-relaxed`
- Include an `AlertTriangle` icon from Lucide React
- This disclaimer must be visible without scrolling when analysis results are displayed
- Must not be dismissible or hideable by the user

---

## 2. Health Vault Consent Modal

### Trigger

Display before the user's health profile data is saved for the first time. Must be shown as an explicit consent gate — health data must not be collected or saved until consent is given.

### Title

```
Health Profile Data Consent
```

### Body

```
Z-SeHealth uses your health information to personalise food safety scores 
and flag ingredients that may conflict with your medical conditions or allergies.
```

### Data Categories

```
The following information will be stored:
• Age, gender, height, weight
• Medical conditions (e.g., diabetes, hypertension, cardiovascular conditions)
• Allergies (e.g., peanut, dairy, gluten, soy)
• Dietary preferences (e.g., Vegetarian, Vegan, Keto, Halal)
• Health goals and activity level
```

### Purpose

```
Purpose: To personalise food safety scores based on your health profile and to flag 
potentially contraindicated ingredients. Health data is used for scoring 
calculations performed by the Z-SeHealth backend.
```

### Retention

```
Your health data is retained until you delete it via your profile settings or 
request account deletion. You may update or delete your health profile at any time.
```

### Third-Party Processing Disclosure

```
Your health profile data is NOT transmitted to external AI providers (Sarvam AI, 
NVIDIA, Google Gemini). It is used only by Z-SeHealth's internal scoring engine 
to personalise your results.
```

### Withdrawal / Deletion

```
You may withdraw consent and delete your health data at any time through the 
"Edit Health Profile" section in your Profile. Deletion removes health data from 
your user record. Previously generated scores are not retroactively recalculated.
```

### Checkbox (Explicit Opt-In)

```jsx
<label className="flex items-start gap-3 cursor-pointer">
  <input
    type="checkbox"
    checked={healthConsentGiven}
    onChange={(e) => setHealthConsentGiven(e.target.checked)}
    className="mt-1 w-4 h-4 accent-emerald-500"
    id="health-vault-consent-checkbox"
    aria-label="Consent to health data processing"
  />
  <span className="text-sm text-gray-300 leading-relaxed">
    I understand that Z-SeHealth evaluates food ingredients algorithmically and 
    does not replace medical consultation. I consent to the storage and processing 
    of my health profile data for the purposes described above.
  </span>
</label>
```

**The checkbox MUST NOT be pre-checked.** The "Save" button must be disabled until the checkbox is checked.

### Modal Implementation

```jsx
<div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-100 flex items-center justify-center p-4">
  <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-4xl p-7 space-y-5">
    {/* Title */}
    <h2 className="text-xl font-bold font-outfit text-white tracking-tight">
      Health Profile Data Consent
    </h2>
    {/* Body, categories, purpose, retention, third-party, withdrawal */}
    {/* ... content as specified above ... */}
    {/* Checkbox */}
    {/* ... checkbox as specified above ... */}
    {/* Buttons */}
    <div className="flex gap-3">
      <button onClick={onCancel} className="flex-1 py-3 rounded-2xl bg-slate-800 text-gray-400 
        font-semibold hover:bg-slate-700 transition-all active:scale-95">
        Cancel
      </button>
      <button 
        onClick={onSave} 
        disabled={!healthConsentGiven}
        className="flex-1 py-3 rounded-2xl bg-emerald-500 text-black font-bold 
          hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-40 
          disabled:cursor-not-allowed"
        id="health-vault-save-btn"
      >
        Save Health Profile
      </button>
    </div>
  </div>
</div>
```

---

## 3. Health Vault UX Requirements

1. **Consent before collection:** The Health Vault consent modal must be displayed before any health data is saved to the server. The save API call must not be made until consent is given.
2. **Clear purpose:** Each data category must have an explained purpose visible to the user.
3. **No bundled consent:** Health data consent must be separate from general Terms of Service acceptance. Users must be able to use the Application without providing health data.
4. **Ability to delete:** A clearly visible "Delete Health Profile" button must be available in the Profile settings.
5. **Ability to modify:** Users must be able to edit all health profile fields at any time.
6. **Accessible modal:**
   - Modal must trap focus (Tab key cycles within the modal)
   - Escape key must close the modal
   - Modal must have `role="dialog"` and `aria-modal="true"`
   - The modal title must be referenced via `aria-labelledby`
7. **Keyboard navigation:** All interactive elements (checkbox, buttons) must be keyboard-accessible and focusable via Tab
8. **Screen-reader labels:** The consent checkbox and all buttons must have descriptive `aria-label` attributes or associated `<label>` elements

---

## 4. Razorpay Checkout Consent

### Location

Display immediately above the "Upgrade to Z-Starter/Z-Pro/Z-Elite" button in `PricingPage.tsx`, and within any upgrade modal.

### Exact Microcopy

```
By proceeding, you are purchasing a digital subscription service. Payment is processed 
securely by Razorpay. Refund and cancellation terms apply — see our Refund Policy. 
The food safety score is an informational indicator and is not medical advice.
```

### Implementation

```jsx
<p className="text-[11px] text-gray-500 leading-relaxed text-center max-w-sm mx-auto mb-3">
  By proceeding, you are purchasing a digital subscription service. Payment is 
  processed securely by{' '}
  <a href="https://razorpay.com" target="_blank" rel="noopener noreferrer" 
     className="text-gray-400 underline hover:text-white transition-colors">
    Razorpay
  </a>
  . Refund and cancellation terms apply — see our{' '}
  <a href="/legal/refunds" className="text-gray-400 underline hover:text-white transition-colors">
    Refund Policy
  </a>
  . The food safety score is an informational indicator and is not medical advice.
</p>
```

### Rules

- Must be visible without scrolling when the purchase button is in view
- Must not imply that clicking the button waives statutory consumer rights
- Must not state "non-refundable" without qualification

---

## 5. Ingredient Review / Crowdsourcing Notice

### Location

`IngredientReviewModal.tsx` — Display within the review modal when users confirm scanned ingredient data for crowdsourced database contribution.

### Exact Notice

```
Your reviewed ingredient data will be submitted for moderation review. Submissions 
are associated with your account for moderation purposes. A moderator will verify the 
data before it becomes visible in the public food database. Until approved, submitted 
items are marked as unverified (is_verified: false) and are not visible to other users.
```

### Data Flow Explanation

```
Submission Flow:
1. Your reviewed data is saved with status: "pending_review" and is_verified: false
2. An administrator reviews the submission against the original OCR output
3. Upon approval, the item is marked is_verified: true and becomes searchable
4. Rejected items are archived and not published
```

### Implementation Notes

- Display in an `Info`-icon container: `bg-slate-800/50 border border-slate-700 rounded-2xl p-4`
- Text: `text-xs text-gray-400 leading-relaxed`
- Do not call the submitted data "anonymized" — the submission is associated with the user's account for moderation purposes

---

## 6. Accessibility

### 6.1 Target Standard

**WCAG 2.1 Level AA** is the target accessibility standard for Z-SeHealth.

### 6.2 Colour Contrast Verification

Z-SeHealth uses a dark theme. The following contrast ratios have been calculated:

| Text Colour | Background | Contrast Ratio | WCAG AA (Normal Text) | WCAG AA (Large Text) |
|---|---|---|---|---|
| `#34d399` (emerald-400) on `#020617` (slate-950) | Dark background | **9.06:1** | ✅ Pass | ✅ Pass |
| `#94a3b8` (slate-400) on `#020617` (slate-950) | Dark background | **7.05:1** | ✅ Pass | ✅ Pass |
| `#34d399` (emerald-400) on `#0f172a` (slate-900) | Card background | **7.63:1** | ✅ Pass | ✅ Pass |
| `#94a3b8` (slate-400) on `#0f172a` (slate-900) | Card background | **5.94:1** | ✅ Pass | ✅ Pass |
| `#9ca3af` (gray-400) on `#020617` (slate-950) | Dark background | **6.81:1** | ✅ Pass | ✅ Pass |
| `#6b7280` (gray-500) on `#020617` (slate-950) | Dark background | **4.36:1** | ❌ Fail (normal) | ✅ Pass (large) |
| `#6b7280` (gray-500) on `#0f172a` (slate-900) | Card background | **3.67:1** | ❌ Fail | ✅ Pass (large) |
| White `#ffffff` on `#020617` (slate-950) | Dark background | **19.24:1** | ✅ Pass | ✅ Pass |

### 6.3 Compliant Text Combinations

**For body text (normal size, < 18pt / < 14pt bold):**
- ✅ `text-emerald-400` on `bg-slate-950` or `bg-slate-900`
- ✅ `text-gray-400` / `text-slate-400` on `bg-slate-950` or `bg-slate-900`
- ✅ `text-white` on any dark background
- ⚠️ `text-gray-500` — use only for large text (≥ 18pt or ≥ 14pt bold), decorative elements, or non-essential labels. **Do not use for critical information at normal text sizes.**

### 6.4 Remediation Required

- Replace `text-gray-500` with `text-gray-400` for any informational text at normal (< 18pt) sizes that conveys meaningful content
- Overline labels using `text-[10px] font-black uppercase tracking-widest text-gray-500` are technically large text equivalent due to bold weight at 10px, but are at the threshold. Consider upgrading to `text-gray-400` for safety.

### 6.5 Keyboard Accessibility

All interactive elements must be:

- Focusable via `Tab` key
- Activatable via `Enter` or `Space` key
- Navigable in a logical order matching the visual layout

### 6.6 Focus Visibility

All focusable elements must have a visible focus indicator:

```css
:focus-visible {
  outline: 2px solid #34d399; /* emerald-400 */
  outline-offset: 2px;
}
```

Tailwind implementation: `focus-visible:outline-2 focus-visible:outline-emerald-400 focus-visible:outline-offset-2`

### 6.7 Semantic Headings

- Each page must have exactly one `<h1>` element
- Heading hierarchy must be sequential (`h1` → `h2` → `h3`) without skipping levels
- Headings must use the `font-outfit` family as per the design system

### 6.8 Form Labels

Every form input must have an associated `<label>` element or `aria-label` attribute:

```jsx
<label htmlFor="age-input" className="text-sm text-gray-400">Age</label>
<input id="age-input" type="number" ... />
```

### 6.9 ARIA Usage

- Use ARIA attributes only where native HTML semantics are insufficient
- Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="modal-title-id"`
- Loading states: `aria-busy="true"` on the container being loaded
- Toasts/alerts: `role="alert"` for error toasts, `role="status"` for info toasts

### 6.10 Error Messaging

- Error messages must be programmatically associated with the relevant input via `aria-describedby`
- Error messages must use `role="alert"` to announce to screen readers
- Error states must not rely solely on colour (use icons, text, and border changes)

### 6.11 Reduced Motion

Respect the user's motion preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 6.12 Touch Targets

All interactive elements (buttons, links, checkboxes) must have a minimum touch target size of **44 × 44 CSS pixels** as recommended by WCAG 2.1 Success Criterion 2.5.5 (AAA) / 2.5.8 (AA in WCAG 2.2). Where the visual element is smaller, ensure sufficient spacing or padding to meet the minimum target area.

### 6.13 Image Alternative Text

- All meaningful images must have descriptive `alt` text
- Decorative images must have `alt=""` or use `aria-hidden="true"`
- Uploaded food label photographs displayed in the scanner should have `alt="Uploaded food label photograph"`

### 6.14 Modal Focus Trapping

All modals must trap focus:

- When a modal opens, focus moves to the first focusable element within the modal
- `Tab` and `Shift+Tab` cycle through focusable elements within the modal only
- Pressing `Escape` closes the modal and returns focus to the trigger element
- Background content must have `aria-hidden="true"` and `inert` attribute when a modal is open

### 6.15 Form Validation

- Validation errors must be announced to screen readers via `aria-live="assertive"` or `role="alert"`
- Invalid fields must have `aria-invalid="true"`
- Error descriptions must be linked via `aria-describedby`
- Validation must not rely solely on colour to indicate errors (use icons + text)

---

## 7. Legal Footer

### Routes to Create

The following routes must be created in the Application for the legal documents:

| Route | Document |
|---|---|
| `/legal/privacy` | Privacy Policy |
| `/legal/terms` | Terms of Service & Medical Disclaimer |
| `/legal/refunds` | Refund & Cancellation Policy |
| `/legal/cookies` | Cookie & Local Storage Policy |

> **Note:** These routes do not currently exist in the Application. They must be implemented by the development team. Since Z-SeHealth uses tab-based navigation via `setActiveTab()` in `App.tsx` rather than React Router, these may be implemented as tab states or as standalone static pages served from the deployment.

### Exact Footer JSX

```jsx
<footer className="w-full border-t border-slate-800 bg-slate-950 py-6 px-4">
  <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
    <p className="text-xs text-gray-500">
      © {new Date().getFullYear()} Z-SeHealth. All rights reserved.
    </p>
    <nav className="flex flex-wrap items-center gap-4" aria-label="Legal documents">
      <a href="/legal/privacy" className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline">
        Privacy Policy
      </a>
      <a href="/legal/terms" className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline">
        Terms of Service
      </a>
      <a href="/legal/refunds" className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline">
        Refund Policy
      </a>
      <a href="/legal/cookies" className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline">
        Cookies & Storage
      </a>
    </nav>
  </div>
</footer>
```

### Placement

- Place at the bottom of the main application layout in `App.tsx`
- The footer must be visible on all pages/tabs
- Footer links must use `text-gray-500` (acceptable for small/large text context at the footer level as decorative navigation, but consider `text-gray-400` for improved accessibility)

---

## 8. Consent Auditability

### What to Log

For legally meaningful consent, the following must be logged server-side:

| Field | Description |
|---|---|
| `consent_type` | Type of consent (e.g., `"health_vault"`, `"terms_acceptance"`, `"marketing"`) |
| `timestamp` | ISO 8601 UTC timestamp of when consent was given |
| `policy_version` | Version identifier of the policy/terms accepted (e.g., `"privacy_v1.0"`, `"terms_v1.0"`) |
| `user_id` | Firebase UID of the consenting user |
| `action` | `"granted"` or `"withdrawn"` |
| `withdrawal_timestamp` | ISO 8601 UTC timestamp of consent withdrawal, if applicable |
| `consent_mechanism` | How consent was obtained (e.g., `"health_vault_modal_checkbox"`, `"registration_acceptance"`) |

### Suggested MongoDB Collection

```json
{
  "_id": "ObjectId",
  "uid": "firebase_uid",
  "consent_type": "health_vault",
  "action": "granted",
  "timestamp": "2026-09-17T00:00:00Z",
  "policy_version": "privacy_v1.0",
  "consent_mechanism": "health_vault_modal_checkbox",
  "withdrawal_timestamp": null
}
```

### Implementation Note

Consent logging is not currently implemented in the Z-SeHealth backend. This is identified as an implementation obligation in the Implementation Gap Register. Until implemented, the Application should at minimum record the `health_vault_consent` flag and timestamp in the user document.

---

## 9. Policy Versioning

Every legal document must include the following metadata in its header:

| Field | Example |
|---|---|
| **Effective Date** | `Effective upon publication` (until a specific date is established) |
| **Version** | `1.0` |
| **Last Updated** | `September 2026` |

When a legal document is updated:

1. Increment the version number (e.g., `1.0` → `1.1` for minor changes, `1.0` → `2.0` for material changes)
2. Update the "Last Updated" date
3. Record the policy version in the consent audit log for new consents
4. For material changes, notify users through the Application interface before the changes take effect

---

*This UI Compliance Specification was drafted as part of the Z-SeHealth compliance framework. It is an implementation specification for the development team, not a public-facing legal document. Independent legal and accessibility review is recommended before deployment.*
