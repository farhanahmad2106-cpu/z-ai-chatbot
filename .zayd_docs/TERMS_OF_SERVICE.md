# Terms of Service & Medical Disclaimer — Z-SeHealth

**Document Title:** Terms of Service & Medical Disclaimer
**Version:** 1.0
**Effective Date:** Effective upon publication
**Last Updated:** September 2026
**Owner / Contact:** Z-SeHealth Development & Compliance Team — support.zsehealth@gmail.com
**Scope:** All users of the Z-SeHealth web application at https://z-sehealth.vercel.app and any associated services.

---

## 1. Agreement

By accessing, registering for, or using Z-SeHealth ("the Application," "the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you must not use the Application.

These Terms constitute a legally binding agreement between you and the Z-SeHealth development team. Z-SeHealth is a student-developed academic digital health project operated by its development team, with its operational base in West Bengal, India.

These Terms should be read together with the [Privacy Policy](/legal/privacy), [Refund & Cancellation Policy](/legal/refunds), and [Cookie & Local Storage Policy](/legal/cookies).

---

## 2. Eligibility

Z-SeHealth is intended for users aged 18 years or older.

By using the Application, you represent and warrant that you are at least 18 years of age. If you are under 18, you must not create an account or use the Application.

---

## 3. Nature of Service

Z-SeHealth is an **informational food-label analysis application**. The Application uses artificial intelligence (AI) and optical character recognition (OCR) technology to:

- Analyse photographs of food and medicine packaging labels
- Extract ingredient lists, additive codes (such as INS numbers), allergen information, and nutritional data from label images
- Generate informational safety scores based on a proprietary heuristic scoring algorithm
- Provide nutritional information and macro estimation for searched or scanned food items
- Enable meal logging and daily nutritional tracking
- Translate ingredient names into Indian regional languages

The Application is designed to assist users in understanding food labels. It does not replace professional judgment, regulatory analysis, or clinical advice.

---

## 4. Medical Disclaimer

> **⚠️ IMPORTANT: Z-SeHealth is NOT a medical device, diagnostic tool, clinical decision-support system, registered dietitian, physician, or substitute for professional medical advice.**

The information provided by Z-SeHealth, including safety scores, ingredient analysis, allergen flags, additive risk classifications, and nutritional data, is **informational and educational only**.

### 4.1 OCR and AI Limitations

The Application's analysis is subject to significant technical limitations, including but not limited to:

- **OCR errors:** Text recognition may fail due to image quality, camera angle, focus, lighting, glare, reflective packaging surfaces, wrinkled or folded labels, low contrast, stylised fonts, damaged packaging, or multi-language text
- **AI errors:** Artificial intelligence models may misidentify, misclassify, omit, or hallucinate ingredients, additive codes, nutritional values, or allergens
- **Incomplete labels:** The photograph may not capture all sides of the packaging; ingredient information on non-visible portions will not be analysed
- **Reformulated products:** Manufacturers may reformulate products, change ingredient lists, or update packaging at any time without notice to Z-SeHealth. The analysis reflects only the content visible in the scanned image at the time of scanning
- **Outdated information:** AI-generated food data from search queries may not reflect the most current formulation of a product
- **False positives and false negatives:** The Application may incorrectly flag safe ingredients as risky, or fail to flag genuinely risky ingredients

### 4.2 No Guarantee of Accuracy

Z-SeHealth does not guarantee the accuracy, completeness, timeliness, or reliability of any information provided through the Application. All information is provided on an "as-is" and "as-available" basis.

---

## 5. Safety Score Disclaimer

Z-SeHealth generates a numerical "Safety Score" for analysed food items. This score is calculated using a proprietary heuristic algorithm and is an **informational indicator only**.

### 5.1 How the Score Works

The Safety Score is computed as:

```
Safety Score = 100 − Nutritional Penalties − Additive Penalties − Medical Profile Penalty
```

The score ranges from 0 to 100 and is presented in indicative tiers:

| Score Range | Indicative Label | Meaning |
|---|---|---|
| 70–100 | Higher Indicative Score | Fewer identified concerns based on available data |
| 40–69 | Moderate Indicative Score | Some identified concerns; review recommended |
| Below 40 | Lower Indicative Score | Multiple identified concerns; careful review advised |

Where the user has configured a health profile (Medical Vault), additional penalties may apply:

- Certain health condition mismatches may reduce the score
- Severe allergen matches may substantially reduce the score

### 5.2 What the Score Is NOT

- The Safety Score is **not a clinical risk assessment** and has not been validated through clinical trials, peer-reviewed research, or regulatory review
- The Safety Score is **not based on FSSAI-approved scoring methodology** unless and until such a methodology is adopted and the Application's algorithm is independently verified to conform to it
- The Safety Score does **not guarantee** that a food product is "safe" or "dangerous" in any medical, regulatory, or absolute sense
- The labels "Higher Indicative Score," "Moderate Indicative Score," and "Lower Indicative Score" are **informational classifications** and do not constitute medical or safety certifications

### 5.3 User Responsibility

Users must exercise independent judgment regarding food safety. The Safety Score should be used as one of many inputs, alongside the physical packaging, manufacturer information, regulatory notices, and professional advice.

---

## 6. Allergy Disclaimer

> **⚠️ CRITICAL WARNING FOR USERS WITH FOOD ALLERGIES**

Z-SeHealth's allergen detection is **not a reliable substitute for reading the physical product label and consulting a qualified medical professional**.

### 6.1 Risk of Severe Allergic Reactions

For users with severe or potentially life-threatening allergies, including but not limited to:

- **Peanuts and tree nuts**
- **Dairy and lactose**
- **Gluten (coeliac disease)**
- **Soy**
- **Shellfish and fish**
- **Eggs**
- **Sesame**
- **Mustard**

**You MUST NOT rely solely on Z-SeHealth's allergen detection.** The Application may:

- Fail to detect allergens present on the label due to OCR errors, image quality issues, or AI limitations
- Fail to detect cross-contamination warnings (e.g., "may contain traces of...")
- Fail to identify allergens listed under alternative or regional names
- Not detect allergens added during reformulation after the database entry was created

### 6.2 Anaphylaxis Risk

**For users at risk of anaphylaxis:** Always independently verify every ingredient by reading the physical packaging, checking the manufacturer's allergen declaration, and consulting your allergist or physician before consuming any product. **Z-SeHealth cannot guarantee the absence of any allergen.**

### 6.3 No Liability for Allergic Reactions

Z-SeHealth shall not be liable for any allergic reaction, anaphylaxis, injury, or health consequence resulting from reliance on the Application's allergen detection or safety scoring. See Section 18 (Limitation of Liability) for further details.

---

## 7. No Medical Advice

Nothing in the Application constitutes medical advice, diagnosis, treatment recommendation, or professional health consultation. Z-SeHealth does not establish a doctor-patient, dietitian-client, or any other professional-client relationship with users.

If you have a medical condition, food allergy, or dietary restriction that affects your health, consult a qualified healthcare professional before making dietary decisions.

---

## 8. No Emergency Use

Z-SeHealth is **not designed for emergency use**. Do not use the Application to determine whether a food is safe to consume in an emergency or time-critical situation. In case of a suspected allergic reaction or medical emergency, contact emergency medical services immediately.

---

## 9. User Accounts

### 9.1 Account Creation

You may create an account using Google OAuth sign-in or email and password registration through Firebase Authentication.

### 9.2 Account Security

You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify Z-SeHealth immediately at support.zsehealth@gmail.com if you become aware of any unauthorised use of your account.

### 9.3 Account Accuracy

You agree to provide accurate, current, and complete information when creating your account and to update your information to keep it accurate.

### 9.4 Account Deletion

You may request deletion of your account through the Application's settings page or by contacting support.zsehealth@gmail.com. Account deletion will result in the removal of your personal data as described in the Privacy Policy.

---

## 10. Acceptable Use

You agree not to:

1. Upload malicious files, malware, viruses, or harmful code through the image upload feature or any other input
2. Engage in abusive automation, including excessive automated API requests, scraping, or bot-driven usage that exceeds normal human use patterns
3. Manipulate scan quotas, create multiple accounts to circumvent usage limits, or exploit promotional offers fraudulently
4. Share, sell, or transfer account credentials to third parties
5. Commit payment fraud, including initiating chargebacks for services legitimately consumed, using stolen payment instruments, or manipulating the payment system
6. Attempt to reverse-engineer, decompile, or disassemble the Application's scoring algorithms, AI prompts, or backend logic, except to the extent that such restriction is prohibited by applicable law
7. Circumvent, disable, or interfere with security-related features, scan quota enforcement, or access control mechanisms
8. Attack, probe, or exploit Z-SeHealth's APIs, servers, or infrastructure, including denial-of-service attacks, SQL injection, cross-site scripting, or other security attacks
9. Attempt to gain unauthorised access to administrative features, other users' accounts, or backend systems
10. Attempt to extract, reconstruct, or disclose system prompts, API keys, provider credentials, or internal configuration
11. Use the Application for any purpose that is unlawful, harmful, or prohibited by these Terms
12. Upload images that contain content unrelated to food or medicine labels for the purpose of abusing the AI analysis system

---

## 11. Free Scan Quota

All users receive a free tier with **20 scans per month**. The monthly scan counter resets on the 1st day of each calendar month (UTC). Unused scans do not carry over to the next month.

---

## 12. Paid Plans

Z-SeHealth offers the following paid subscription plans, processed through Razorpay:

| Plan | Price (₹/month) | Scans/Month | AI Engine |
|---|---|---|---|
| **Z-Starter** | ₹366 | 80 | NVIDIA LLaMA + Gemini |
| **Z-Pro** | ₹732 | 200 | NVIDIA Advanced + Gemini Pro |
| **Z-Elite** | ₹998 | 500 | Sarvam AI + NVIDIA |

### 12.1 Subscription Terms

- All paid plans are monthly subscriptions with a 12-month total count period
- Subscriptions are processed through Razorpay; by subscribing, you also agree to Razorpay's terms and conditions
- Subscription activation occurs upon successful payment confirmation via Razorpay webhook
- Scan quotas reset monthly upon successful renewal charge
- GST may apply as per applicable law

### 12.2 Cancellation

You may cancel your subscription at any time. Upon cancellation:

- Your premium access continues until the end of the current billing period
- Your tier reverts to the free tier after the billing period ends
- No further charges will be made after cancellation

See the [Refund & Cancellation Policy](/legal/refunds) for detailed refund and cancellation terms.

---

## 13. Intellectual Property

### 13.1 Application IP

The Application's source code, user interface designs, branding, logos, scoring methodology, database schemas, documentation, and proprietary algorithms are the intellectual property of the Z-SeHealth development team and are protected under applicable intellectual property laws.

### 13.2 User-Submitted Content

When you upload a food label image for analysis, you retain ownership of the original photograph. By uploading content for analysis and crowdsourced food database contribution, you grant Z-SeHealth a non-exclusive, royalty-free, worldwide licence to process, analyse, and use the extracted data (ingredient lists, nutritional values, additive codes) for the purpose of operating and improving the food database, subject to the Privacy Policy.

### 13.3 Food Database

The Z-SeHealth food database includes data from multiple sources, including AI-generated content, crowdsourced scans verified by moderators, and seeded reference data. Individual food entries in the database are not claimed as proprietary to any single user.

---

## 14. AI Limitations

The Application relies on third-party AI models (Sarvam AI, NVIDIA NIM, Google Gemini) for image analysis, OCR, food identification, macro estimation, and translation. These AI models:

- May produce inaccurate, incomplete, or fabricated ("hallucinated") results
- May not recognise all languages, fonts, or label formats
- May perform differently depending on image quality, lighting, and label condition
- Are subject to the availability, performance, and terms of service of their respective providers
- May be updated, changed, or discontinued by their providers without notice to Z-SeHealth

Z-SeHealth does not guarantee the accuracy, reliability, or continuous availability of any AI model or provider.

---

## 15. Availability

Z-SeHealth is provided on an "as-is" and "as-available" basis. We do not guarantee:

- Uninterrupted or error-free service
- That the Application will be available at all times
- That AI providers will be continuously accessible
- That the Application will be free of bugs, vulnerabilities, or defects
- Specific response times, latency, or performance levels

Scheduled or unscheduled maintenance, provider outages, infrastructure failures, or force majeure events may result in temporary or extended unavailability.

---

## 16. Third-Party Services

Z-SeHealth integrates with third-party services including Firebase (Google), Razorpay, Sarvam AI, NVIDIA NIM, Google Gemini, MongoDB Atlas, and Vercel. Your use of Z-SeHealth may be subject to the terms and conditions of these third-party services. Z-SeHealth is not responsible for the acts, omissions, availability, or terms of any third-party service.

---

## 17. Suspension and Termination

Z-SeHealth reserves the right to suspend or terminate your account, with or without notice, if:

- You violate these Terms of Service or the Acceptable Use provisions
- You engage in fraudulent, abusive, or harmful conduct
- Your use poses a security risk to the Application or other users
- Required by applicable law or a court order
- The Application is discontinued

Upon termination, your right to use the Application ceases immediately. Provisions that by their nature should survive termination (including disclaimers, limitation of liability, intellectual property, governing law, and dispute resolution) shall survive.

---

## 18. Limitation of Liability

### 18.1 General Limitation

To the maximum extent permitted by applicable law, the Z-SeHealth development team, its founders (Farhan Ahmad, Surya Das, Aditya Swarnakar, Armaan Sharma), contributors, and affiliates shall not be liable for:

- Any indirect, incidental, special, consequential, or punitive damages
- Loss of profits, revenue, data, goodwill, or business opportunities
- Any damages arising from reliance on the Application's safety scores, allergen detection, ingredient analysis, nutritional data, or AI-generated content
- Any allergic reaction, illness, injury, or health consequence resulting from dietary decisions made in reliance on the Application
- Any damages resulting from unauthorised access to or alteration of your data
- Any damages resulting from the unavailability, malfunction, or discontinuation of the Application or any third-party service

### 18.2 Aggregate Liability Cap

In no event shall Z-SeHealth's total aggregate liability for all claims arising out of or relating to these Terms or your use of the Application exceed the amount you have paid to Z-SeHealth in the twelve (12) months preceding the event giving rise to liability, or ₹1,000 (Indian Rupees One Thousand), whichever is greater.

### 18.3 Preservation of Mandatory Rights

Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited under Indian law, including but not limited to:

- Liability for fraud or fraudulent misrepresentation
- Liability arising from gross negligence or wilful misconduct
- Any mandatory liability imposed by the Consumer Protection Act, 2019 or rules made thereunder
- Any mandatory rights or remedies available under the DPDP Act, 2023
- Any other liability that cannot be excluded by agreement under applicable Indian law

---

## 19. Indemnification

You agree to indemnify and hold harmless the Z-SeHealth development team, its founders, contributors, and affiliates from and against any reasonable claims, losses, damages, liabilities, and expenses (including reasonable legal fees) arising out of or relating to:

- Your violation of these Terms
- Your misuse of the Application
- Your violation of any third party's rights
- Content you upload to the Application
- False or misleading information you provide to Z-SeHealth

This indemnification obligation does not extend to losses caused by Z-SeHealth's own negligence, wilful misconduct, or breach of its obligations under applicable law.

---

## 20. Governing Law and Jurisdiction

These Terms are governed by and construed in accordance with the laws of India.

Any disputes arising out of or in connection with these Terms or the use of the Application shall be subject to the exclusive jurisdiction of the courts at **Kolkata, West Bengal, India**, provided that this jurisdiction clause is subject to:

- Mandatory statutory jurisdiction rules that may apply (including consumer forum jurisdiction under the Consumer Protection Act, 2019)
- Any jurisdiction designated by applicable data protection law
- The right of either party to seek interim or injunctive relief in any court of competent jurisdiction

---

## 21. Severability

If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable, or if modification is not possible, it shall be deemed severed from these Terms.

---

## 22. Entire Agreement

These Terms, together with the Privacy Policy, Refund & Cancellation Policy, Cookie & Local Storage Policy, and any other policies referenced herein, constitute the entire agreement between you and Z-SeHealth regarding your use of the Application, superseding any prior agreements or understandings.

No waiver of any provision of these Terms shall be effective unless in writing. Failure to enforce any provision shall not constitute a waiver of that provision.

---

## 23. Contact

For questions, concerns, or notices regarding these Terms of Service:

**Z-SeHealth Development & Compliance Team**
Email: support.zsehealth@gmail.com
Secondary contact: farhanahmad2106@gmail.com

**Lead Developer / Super Admin:** Farhan Ahmad
**Co-Founders / Core Team:** Surya Das, Aditya Swarnakar, Armaan Sharma

---

*These Terms of Service were drafted as part of the Z-SeHealth compliance framework. They do not constitute legal advice. Independent legal review is recommended before deployment.*
