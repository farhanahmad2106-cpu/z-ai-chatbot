# Privacy Policy — Z-SeHealth

**Document Title:** Privacy Policy
**Version:** 1.0
**Effective Date:** Effective upon publication
**Last Updated:** September 2026
**Owner / Contact:** Z-SeHealth Development & Compliance Team — support.zsehealth@gmail.com
**Scope:** All users of the Z-SeHealth web application at https://z-sehealth.vercel.app and any associated services.

---

# Verified Assumptions & Corrections

Before drafting, the following factual and legal verifications were performed:

1. **DPDP Act 2023 Implementation Status:** The Digital Personal Data Protection Act, 2023 received Presidential assent on 11 August 2023. As of the date of drafting (September 2026), the Act's commencement, subordinate rules, and the establishment of the Data Protection Board are referenced based on publicly available Government of India notifications. Where specific rules have not been notified or their applicability to this category of entity is uncertain, the policy uses conservative language and identifies implementation obligations.

2. **Entity Status:** Z-SeHealth is described as a student-developed academic digital health project. No evidence of incorporation as a company, LLP, or other registered entity has been provided. No CIN, GSTIN, PAN, DPO appointment, or regulatory registration has been verified.

3. **"Significant Data Fiduciary" Status:** No determination has been made or notified classifying Z-SeHealth as a Significant Data Fiduciary under the DPDP Act. This policy does not claim such status.

4. **AI Provider Retention Policies:** The prompt correctly identifies that claims of "zero retention" or specific deletion periods by third-party AI providers (Sarvam AI, NVIDIA NIM, Google Gemini) cannot be guaranteed by Z-SeHealth. This policy distinguishes Z-SeHealth's intended retention from provider-side processing and retention.

5. **MongoDB Atlas Encryption:** MongoDB Atlas provides encryption at rest using the storage engine's native encryption and TLS for data in transit as standard platform features. This policy references these as platform-provided controls rather than claiming bespoke encryption implementations.

6. **Free Tier Quota:** The codebase confirms 20 scans per month for the free tier (verified in `quota_check.py`, `webhooks.py`, and `PricingPage.tsx`). The prompt states "20 lifetime scans," but the actual implementation uses monthly quotas with reset logic. This policy uses the technically accurate monthly interpretation.

7. **Health Data Sensitivity:** Indian law does not yet use a single uniform statutory definition of "Sensitive Personal Data" under the DPDP Act 2023 in the same manner as the 2011 SPDI Rules. This policy treats health-related data as high-risk personal data requiring enhanced protections regardless of the precise statutory classification.

8. **Firebase Authentication Persistence:** Firebase Authentication SDK uses IndexedDB by default in modern browsers for persistent session storage, but may fall back to localStorage or other mechanisms depending on browser capabilities and SDK configuration. This policy does not guarantee a single persistence mechanism.

9. **Cross-Border Data Transfer:** Google Cloud (Firebase, Gemini), NVIDIA NIM, and potentially Sarvam AI may process data on infrastructure located outside India. This policy discloses this possibility rather than claiming India-only processing.

10. **Razorpay Payment Handling:** Razorpay is a PCI-DSS compliant payment aggregator. Z-SeHealth does not directly handle, process, or store card numbers, CVV, UPI PINs, or net banking credentials. The codebase confirms that Z-SeHealth stores only Razorpay subscription IDs, plan IDs, payment status, and transaction timestamps.

---

## 1. Introduction

Z-SeHealth ("we," "us," "our," or "the Application") is a student-developed academic digital health project that provides AI-powered food label analysis, ingredient safety scoring, nutritional information, and related informational services. The Application is developed and operated by its development team as part of the PRAGATI-2026 / YUKTI Portal academic innovation programme, with its operational base in West Bengal, India.

This Privacy Policy explains how we collect, use, store, share, and protect your personal data when you use Z-SeHealth. We are committed to handling your personal data responsibly and transparently.

**This Privacy Policy constitutes a compliance framework. The existence of this document does not in itself establish full regulatory compliance; it identifies processing activities, user rights, and implementation obligations.**

---

## 2. Scope

This Privacy Policy applies to:

- All users who access Z-SeHealth via the web application at https://z-sehealth.vercel.app
- All data collected through the Application's frontend, backend APIs, authentication systems, AI/OCR processing pipeline, and payment processing
- Data stored in browser local storage on the user's device
- Data transmitted to and processed by third-party service providers as described herein

This Privacy Policy does not apply to third-party websites, applications, or services linked from or integrated with Z-SeHealth, each of which is governed by its own privacy policy.

---

## 3. Definitions

For the purposes of this Privacy Policy:

- **"User" / "Data Principal"**: Any individual who accesses or uses Z-SeHealth and whose personal data is processed by the Application. Under the Digital Personal Data Protection Act, 2023 ("DPDP Act"), this corresponds to a "Data Principal."

- **"Personal Data"**: Any data about an individual who is identifiable by or in relation to such data, as defined under the DPDP Act, 2023. This includes Account Data, Health Data, Uploaded Content, and Transaction Data as described below.

- **"Processing"**: Any operation or set of operations performed on personal data, including collection, storage, use, analysis, disclosure, transmission, and erasure.

- **"Consent"**: A free, specific, informed, unconditional, and unambiguous indication of the Data Principal's wishes, signifying agreement to the processing of their personal data for specified purposes.

- **"Data Fiduciary"**: The entity that determines the purpose and means of processing personal data. For the purposes of this Application, the Z-SeHealth development team acts in this capacity.

- **"Data Processor"**: Any entity that processes personal data on behalf of the Data Fiduciary, including third-party AI providers, cloud infrastructure providers, and payment processors.

- **"Health Data"**: Personal data relating to the physical or mental health of a Data Principal, including health conditions, allergies, dietary restrictions, and food-related medical preferences as entered by the user.

- **"Account Data"**: Information associated with a user's account, including name, email address, Firebase user identifier, and authentication metadata.

- **"Uploaded Content"**: Food label photographs, OCR-derived text, ingredient lists, additive codes, allergen information, nutritional data, and food macros generated from user-uploaded images.

---

## 4. Information We Collect

### 4.1 Account Information

When you create an account or sign in, we collect:

- Display name
- Email address
- Firebase user identifier (UID)
- Profile photograph URL (if provided via Google OAuth or user upload)
- Authentication method (Google OAuth or email/password)
- Login timestamps and login streak data

### 4.2 Authentication Information

Firebase Authentication manages your sign-in credentials. **Z-SeHealth does not store your Google account password or your email/password credentials.** Firebase handles credential verification, and Z-SeHealth receives only a verified identity token containing your UID, email, and display name.

### 4.3 Health Information (User-Provided)

If you choose to complete your health profile, we collect:

- Age, gender, height, weight
- Blood type, target weight, target sleep hours (optional)
- Medical conditions (e.g., diabetes status, hypertension status, cardiovascular conditions)
- Dietary preferences (e.g., Vegetarian, Vegan, Keto, Halal, Gluten-Free)
- Allergen information (e.g., peanut, dairy, gluten, soy allergies)
- Health goals (e.g., weight loss, muscle gain, maintenance)
- Activity level
- Daily target water intake

**Health data is treated as high-risk personal data and is subject to enhanced protections as described in Section 7.**

### 4.4 Uploaded Images and OCR Data

When you use the food scanning feature, we process:

- Photographs of food labels or packaging (JPEG, PNG, or WEBP format, maximum 5 MB)
- OCR-derived raw text extracted from the image
- Parsed ingredient lists
- Detected INS/E-number additive codes and associated risk classifications
- Flagged allergens
- Nutritional values per 100g (if readable from the label)
- Estimated macronutrient values

### 4.5 Food Analysis Results

- Safety scores generated by the Application's scoring algorithm
- Safety classifications (e.g., higher indicative score, moderate indicative score, lower indicative score)
- AI-generated food information from search queries when the food is not in the database

### 4.6 Transaction Information

If you purchase a paid subscription, we store:

- Razorpay subscription identifier
- Plan identifier (Starter, Pro, or Elite)
- Subscription status (pending, active, cancelled, completed)
- Subscription start date and end date
- Auto-renewal status
- Payment event timestamps

**Z-SeHealth does not store your card number, CVV, UPI PIN, net banking password, or any payment credentials.** All payment credential processing is handled directly by Razorpay, a PCI-DSS compliant payment aggregator.

### 4.7 Technical and Security Logs

The backend records operational logs in the `system_logs` MongoDB collection, including:

- Timestamps
- Log level (INFO, WARNING, ERROR, CRASH)
- Service identifier (e.g., AI_Router, OCR_Service)
- Error messages and technical details (e.g., AI model failover events, rate limit responses)

These logs are used for system administration, debugging, and security monitoring. They may incidentally contain user-related identifiers in the context of error traces.

### 4.8 Local Browser Storage

Certain data is stored exclusively on your device's browser and is never transmitted to our servers:

- `z_sehealth_cached_search_foods` — cached food search results for performance
- `z_sehealth_cached_user_stats` — cached daily macro statistics
- `z_sehealth_cached_user_streak` — cached login streak data
- `z_sehealth_quote_history` — motivational quote display history and preferences
- `recentSearchedFoods` — recently viewed food items
- `unauthenticatedScanCount` — scan counter for unauthenticated users

---

## 5. How We Use Your Information

We process your personal data for the following purposes:

| Purpose | Data Categories Used |
|---|---|
| **Account creation and authentication** | Account Data, Authentication metadata |
| **Providing food label analysis** | Uploaded Content, OCR Data, Health Data (for personalised scoring) |
| **Generating safety scores** | Parsed ingredients, additive codes, user health profile |
| **Personalising results based on health conditions** | Health Data (medical conditions, allergies) |
| **Meal logging and nutritional tracking** | Food analysis results, daily macro statistics |
| **Processing subscription payments** | Transaction Data (via Razorpay) |
| **Enforcing scan quotas** | Usage counters, subscription tier |
| **Food database moderation** | Uploaded Content (for crowdsourced food item review by administrators) |
| **System administration and debugging** | Technical logs, error traces |
| **Ingredient translation** | Parsed ingredient lists (transmitted to AI providers for translation) |
| **Improving service quality** | Aggregated, non-identifying usage patterns |
| **Caching for performance** | Local browser storage (client-side only) |

---

## 6. Legal Basis and Consent

### 6.1 Consent Under the DPDP Act, 2023

Where applicable under the DPDP Act, 2023, and any rules notified thereunder, processing of your personal data is based on your informed consent, obtained at the time of account creation, health profile configuration, or use of specific features.

Consent is obtained through:

- Acceptance of this Privacy Policy and Terms of Service during account creation
- Explicit opt-in before collecting health profile data (Health Vault consent)
- Active use of features that require data processing (e.g., uploading a food label photograph for scanning)

### 6.2 Other Lawful Grounds

To the extent that the DPDP Act or other applicable law recognises lawful grounds for processing beyond consent (such as legitimate uses, compliance with legal obligations, or performance of obligations under law), we may process certain data on those grounds. For example:

- Technical and security logs may be maintained as part of our legitimate operational need to ensure platform security and stability
- Transaction records may be retained to comply with applicable financial record-keeping requirements

### 6.3 Withdrawal of Consent

You may withdraw your consent at any time by:

- Deleting your health profile data through the Application's profile settings
- Requesting account deletion via the Application's settings page or by contacting support.zsehealth@gmail.com
- Ceasing to use the Application

Withdrawal of consent does not affect the lawfulness of processing carried out prior to withdrawal. Certain data may be retained after consent withdrawal where required by law or legitimate operational necessity, as described in the Data Retention section.

---

## 7. Health Data — Enhanced Protections

Health-related personal data (medical conditions, allergies, dietary restrictions, and related health preferences) is treated as high-risk personal data requiring enhanced protections:

### 7.1 Collection

Health data is collected only when you voluntarily choose to configure your health profile. No health data is collected without your active input.

### 7.2 Purpose Limitation

Health data is used solely for:

- Personalising food safety scores based on your medical conditions and allergies
- Flagging ingredients that may be contraindicated for your reported health conditions
- Adjusting nutritional recommendations based on your health goals

### 7.3 Storage

Health data is stored in your user document within the MongoDB Atlas `users` collection. MongoDB Atlas provides encryption at rest as a standard platform feature and uses TLS for data in transit.

### 7.4 Access Control

Health data is accessible only to:

- You, through the Application interface
- The backend system, for automated scoring and personalisation
- Authorised administrators, for user support purposes, subject to RBAC (role-based access control) restrictions

### 7.5 Deletion

You may delete your health profile data at any time through the Application's profile settings. Deletion of health profile data removes the health profile fields from your user record. Note that deletion from the primary database does not guarantee immediate deletion from database backups, the retention period of which depends on the MongoDB Atlas backup configuration.

### 7.6 Processing Limitations

Health data is not:

- Shared with third-party AI providers (health profile data is used for scoring calculations performed by the Z-SeHealth backend, not transmitted to external AI services for the purpose of health profiling)
- Used for advertising or marketing purposes
- Sold or rented to third parties

---

## 8. AI/OCR Data Flow

### 8.1 How Image Analysis Works

When you upload a food label photograph, the following data flow occurs:

1. **Your browser** transmits the image to the Z-SeHealth backend via `POST /api/scan/analyze` (multipart/form-data, maximum 5 MB)
2. **The Z-SeHealth backend** may preprocess the image (EXIF orientation correction, contrast adjustment, sharpening) using the local image preprocessing pipeline
3. **The image is transmitted to one or more AI/OCR providers** in a tiered fallback sequence for text extraction and analysis
4. **The AI provider returns** extracted text, parsed ingredient lists, and nutritional data
5. **The Z-SeHealth backend** applies safety scoring, allergen flagging, and additive risk classification
6. **The result is returned** to your browser

### 8.2 AI Providers and Data Processing

The following third-party AI providers may process your uploaded food label images:

#### Sarvam AI (Primary — Elite Tier)

- **Purpose:** Indic-language OCR and food label parsing
- **Data transmitted:** Base64-encoded image data and processing prompt
- **Z-SeHealth retention:** Z-SeHealth does not permanently store the uploaded image on its servers after processing is complete, subject to the implementation limitations noted in the Implementation Gap Register
- **Provider retention:** Sarvam AI's data retention and processing policies are governed by its own terms of service and privacy policy. Z-SeHealth cannot independently verify or guarantee Sarvam AI's internal data handling, logging, or retention practices.

#### NVIDIA NIM (Secondary)

- **Model:** `nvidia/neva-22b` and related vision models
- **Purpose:** Vision-based food label analysis
- **Data transmitted:** Base64-encoded image data and processing prompt via NVIDIA's API endpoints
- **Provider retention:** NVIDIA's data retention and processing policies are governed by NVIDIA's terms of service, API agreements, and privacy policy. Z-SeHealth cannot independently verify or guarantee NVIDIA's internal data handling or logging practices.

#### Google Gemini (Tertiary)

- **Models:** `gemini-2.5-flash` and/or `gemini-1.5-flash`
- **Purpose:** Vision-based food label OCR and text extraction
- **Data transmitted:** Base64-encoded image data and processing prompt via Google's Generative AI API
- **Provider retention:** Google's data retention, processing, and model training policies for the Gemini API are governed by Google's applicable API Terms of Service, Data Processing terms, and Privacy Policy. Z-SeHealth cannot independently verify or guarantee Google's internal data handling practices.

### 8.3 Important Distinction

Z-SeHealth's stated policy is to process images transiently and not to retain uploaded images permanently on its own servers after the analysis response has been generated. However:

- **Z-SeHealth cannot control or guarantee** how third-party AI providers handle, log, cache, or retain the image data and prompts transmitted to them
- **Provider-side logging** of API requests (including image data) may occur as part of the provider's standard operational practices
- **Provider contractual commitments** regarding data use, retention, and model training vary by provider and are subject to the provider's current terms, which may change

Users should review the privacy policies of Sarvam AI, NVIDIA, and Google for information about their data handling practices.

---

## 9. International and Cross-Border Data Processing

Z-SeHealth's backend infrastructure and third-party services may process data on servers located outside India:

- **Firebase (Google Cloud):** Authentication services may use Google's global cloud infrastructure
- **MongoDB Atlas:** Database hosting region depends on the cluster configuration selected by Z-SeHealth
- **Google Gemini API:** Processed on Google's global AI infrastructure
- **NVIDIA NIM API:** Processed on NVIDIA's cloud infrastructure
- **Vercel:** Frontend hosting uses Vercel's global CDN and edge network

**Z-SeHealth does not guarantee that your data will be processed exclusively within India.** Where personal data is transferred outside India, such transfers are subject to the applicable provisions of the DPDP Act, 2023 and any rules or notifications issued thereunder regarding cross-border data transfer, including any restrictions on transfer to jurisdictions not approved by the Central Government, to the extent such restrictions have been notified and are in effect.

---

## 10. Storage and Security

### 10.1 Database Security

User data is stored in MongoDB Atlas. The following security controls are provided by the MongoDB Atlas platform:

- Encryption at rest (provided as a standard MongoDB Atlas feature)
- TLS encryption for data in transit between the application and the database
- Network access controls and IP allowlisting as configured by the development team
- Authentication requirements for database access

### 10.2 Application Security

- **Authentication:** Firebase Authentication with Google OAuth and email/password sign-in, with server-side token verification via Firebase Admin SDK
- **API Protection:** Protected endpoints require valid Firebase ID tokens verified on each request
- **Payment Security:** Razorpay webhook events are verified via HMAC-SHA256 signature verification before any entitlement changes are processed
- **Secrets Management:** API keys and credentials are stored as environment variables and are not embedded in the application code or exposed to the frontend
- **CORS:** Cross-origin resource sharing is configured to restrict API access to authorised origins

### 10.3 Limitations

Z-SeHealth is an academic project under active development. The security measures described above represent the current implementation. They have not been independently audited by a third-party security assessor. Users should be aware that no system can guarantee absolute security.

---

## 11. Data Retention

| Data Category | Retention Policy |
|---|---|
| **Account Data** | Retained for the duration of the user's account. Deleted upon account deletion request, subject to backup retention. |
| **Health Profile Data** | Retained until the user deletes the data or deletes their account. |
| **Uploaded Images** | Intended to be processed transiently and not retained permanently on Z-SeHealth servers. Retention by third-party AI providers is governed by their respective policies. |
| **OCR/Analysis Results** | Crowdsourced food data (with `requires_moderation: true`) is stored in the `foods` collection for moderation review. Approved items remain in the database. Rejected items are archived or deleted. |
| **Transaction Data** | Retained for the duration required by applicable financial record-keeping requirements and for dispute resolution purposes. |
| **Technical/Security Logs** | Retained in the `system_logs` collection. No fixed retention period is currently implemented; retention is governed by operational necessity. |
| **Local Browser Storage** | Retained on the user's device until manually cleared by the user. Not transmitted to or controlled by Z-SeHealth servers. |

Where no specific retention period is stated, data is retained until the governing purpose for its collection has been fulfilled, the user requests deletion, or applicable law requires deletion.

---

## 12. Local Storage

Z-SeHealth uses browser LocalStorage for client-side caching and performance optimisation. **This data remains exclusively on your device and is never transmitted to Z-SeHealth's servers.**

| LocalStorage Key | Purpose | Content |
|---|---|---|
| `z_sehealth_cached_search_foods` | Cache food search results to reduce API calls | Serialised food search response data |
| `z_sehealth_cached_user_stats` | Cache daily macro statistics | Serialised daily nutrition statistics |
| `z_sehealth_cached_user_streak` | Cache login streak count | Serialised streak number |
| `z_sehealth_quote_history` | Track motivational quote display rotation | Quote display counts and timestamps |
| `recentSearchedFoods` | Recently viewed food items carousel | Array of recently clicked food items (up to 15) |
| `unauthenticatedScanCount` | Track scan usage before login | Integer scan count |

LocalStorage is not a cookie. It is a browser-native key-value storage mechanism. See the Cookie & Local Storage Policy for further details.

---

## 13. Your Rights as a Data Principal

Subject to the applicable provisions of the DPDP Act, 2023, the IT Act, 2000 and rules made thereunder, and other applicable law, you have the following rights:

### 13.1 Right to Access

You have the right to obtain confirmation of whether your personal data is being processed and to access such data. You may view your account data, health profile, and usage statistics through the Application interface.

### 13.2 Right to Correction

You have the right to correct inaccurate or incomplete personal data. You may update your profile information, health data, and preferences through the Application's profile and settings pages.

### 13.3 Right to Erasure

You have the right to request the erasure of your personal data. You may:

- Delete your health profile data via the Application's profile settings
- Request full account deletion via the Application's settings page or by contacting support.zsehealth@gmail.com

Upon receiving a valid deletion request, Z-SeHealth will delete your user record from the primary database. Please note that:

- Deletion from database backups may not be immediate and depends on the backup retention cycle
- Data that has been anonymised or aggregated and can no longer be associated with you may be retained
- Certain data may be retained where required by applicable law

### 13.4 Right to Withdraw Consent

You may withdraw your consent to data processing at any time, as described in Section 6.3.

### 13.5 Right to Grievance Redressal

You have the right to register a grievance regarding the processing of your personal data. See Section 16 for contact information.

### 13.6 Right to Nominate

To the extent provided under the DPDP Act, 2023, you may have the right to nominate another individual to exercise your rights on your behalf in certain circumstances, including in the event of your death or incapacity.

---

## 14. Health Vault Data Deletion

When you delete your Health Vault (health profile) data:

- Your medical conditions, allergies, dietary preferences, and related health data are removed from your user record in the MongoDB database
- Future food safety scores will no longer be personalised based on your health conditions — the generic scoring algorithm will apply
- Previously generated safety scores that were personalised using your health data are not retroactively recalculated
- Deletion of Health Vault data is distinct from clearing your browser's local storage cache; both may need to be performed separately

---

## 15. Children's Data

**Z-SeHealth is intended for users aged 18 years or older.** We do not knowingly collect personal data from individuals under the age of 18.

If we become aware that we have inadvertently collected personal data from a person under 18 years of age, we will take reasonable steps to delete such data promptly.

If you are a parent or guardian and believe that a child under 18 has provided personal data to Z-SeHealth, please contact us at support.zsehealth@gmail.com.

---

## 16. Grievance Redressal

If you have any questions, concerns, or complaints about our processing of your personal data, or if you wish to exercise any of your rights as a Data Principal, please contact:

**Z-SeHealth Development & Compliance Team**
Email: support.zsehealth@gmail.com
Secondary contact: farhanahmad2106@gmail.com

We will endeavour to acknowledge your communication within a reasonable time and to resolve your concern as promptly as practicable.

To the extent required under the DPDP Act, 2023 or rules made thereunder, Z-SeHealth will appoint a grievance officer or data protection contact as and when such obligation is notified and applicable to the present category of entity. Until such time, the contact above serves as the primary grievance and privacy contact.

---

## 17. Data Breach and Security Incident Handling

In the event of a personal data breach that is likely to cause harm to Data Principals:

- Z-SeHealth will take immediate steps to contain and mitigate the breach
- Affected users will be notified where required by applicable law or where Z-SeHealth considers notification appropriate in the circumstances
- The Data Protection Board of India (or such authority as may be established under the DPDP Act) will be notified as and when such notification obligations are in effect and applicable
- A record of the breach, the response measures taken, and the outcome will be maintained

Z-SeHealth does not currently have a formal, documented incident-response plan. The development of such a plan is identified as an implementation obligation in the Implementation Gap Register.

---

## 18. Third-Party Services

Z-SeHealth uses the following third-party services, each of which has its own privacy policy:

| Service | Purpose | Data Shared |
|---|---|---|
| **Firebase (Google)** | User authentication (Google OAuth and email/password) | Email, name, UID, authentication tokens |
| **Google Cloud / Gemini API** | AI-powered food label OCR and text extraction | Uploaded food label images, processing prompts |
| **NVIDIA NIM API** | AI-powered food label vision analysis | Uploaded food label images, processing prompts |
| **Sarvam AI** | Indic-language OCR and parsing (Elite tier) | Uploaded food label images, processing prompts |
| **MongoDB Atlas** | Database hosting for user data, food data, logs, and transactions | All server-side stored data as described in this policy |
| **Razorpay** | Payment processing for subscription purchases | Subscription metadata; Razorpay handles all payment credentials directly |
| **Vercel** | Frontend application hosting and CDN | HTTP request metadata, IP addresses, browser information (as per Vercel's infrastructure) |

We encourage you to review the privacy policies of these third-party services. Z-SeHealth is not responsible for the privacy practices of third-party services.

---

## 19. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes in our practices, legal requirements, or Application features. When we make material changes:

- The updated Privacy Policy will be published within the Application
- The "Last Updated" date at the top of this document will be revised
- Where practicable and where the change is material, we will endeavour to notify users through the Application interface

Your continued use of Z-SeHealth after any changes to this Privacy Policy constitutes your acceptance of the updated policy, to the extent permitted by applicable law.

---

## 20. Contact

For any questions, requests, or concerns regarding this Privacy Policy or our data practices:

**Z-SeHealth Development & Compliance Team**
Email: support.zsehealth@gmail.com
Secondary contact: farhanahmad2106@gmail.com

**Lead Developer / Super Admin:**
Farhan Ahmad

**Co-Founders / Core Team:**
Surya Das, Aditya Swarnakar, Armaan Sharma

---

*This Privacy Policy was drafted as part of the Z-SeHealth compliance framework. It identifies processing activities, rights, and obligations but does not constitute legal advice or a guarantee of regulatory compliance. Independent legal review is recommended before deployment.*
