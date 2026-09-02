# 1. Product Requirements Document (PRD) — Z-SeHealth

> **Version:** 1.0 | **Date:** 2026-09-03 | **Author:** Z-SeHealth Architecture Team

---

## 1.1 Problem Statement

### The Global Food App Gap in India
The Indian packaged food market (valued at $78B+ USD, projected $120B by 2028) is flooded with ultra-processed items containing undisclosed or obfuscated additives. Three systemic failures of existing global platforms create an urgent unmet need:

**Failure 1 — Western Database Bias**
Apps like Yuka, MyFitnessPal, and Open Food Facts index < 2% of Indian regional brands. Products from Haldiram's, MDH, Patanjali, Amul, ITC, Parle, Britannia, and 500+ regional namkeen/mithai/ready-to-eat manufacturers are absent or contain incomplete data. Users scanning a packet of "Haldiram's Bhujia Sev" on Yuka receive zero results.

**Failure 2 — Hidden Chemical Names & INS Code Obfuscation**
Indian FSSAI-compliant labels print additives as INS (International Numbering System) codes rather than human-readable names. Example label fragment:
```
Ingredients: Refined Wheat Flour (Maida), Edible Vegetable Oil (Palmolein),
Iodised Salt, Flavour Enhancers (INS 627, INS 631, INS 635),
Acidity Regulator (INS 500(ii)), Colour (INS 102, INS 110).
```
Without a normalization engine, users cannot determine that:
- INS 627 = Disodium Guanylate (Moderate risk — flavor enhancer)
- INS 102 = Tartrazine (High risk — synthetic yellow dye, banned in Norway/Austria)
- INS 110 = Sunset Yellow FCF (High risk — linked to hyperactivity in children)

**Failure 3 — Vernacular Labeling & Language Barrier**
~60% of Indian consumers are more comfortable in regional languages. Labels often mix English with Hindi/Tamil/Telugu script. No existing app provides OCR that handles Devanagari or Dravidian scripts on food labels, nor translates ingredient safety analysis into the user's native language.

---

## 1.2 Product Vision
Z-SeHealth (Z-Secured Health & Food Analyzer) is an AI-powered health intelligence system that:
1. Performs instant back-of-pack OCR decoding of Indian food labels.
2. Normalizes INS codes and chemical names into a searchable safety database.
3. Computes a 0–100 FSSAI-aligned Safety Score personalized against an encrypted medical health vault.
4. Communicates results in 22+ Indian languages.

---

## 1.3 User Personas

### Persona 1: Priya — The Cautious Mother
| Attribute | Value |
|---|---|
| Age | 34 |
| Location | Pune, Maharashtra |
| Health Vault | Children: Ages 4 & 7 |
| Primary Concern | Synthetic food dyes (Tartrazine/INS 102, Sunset Yellow/INS 110) in children's snacks |
| Language | Marathi primary, Hindi secondary, English limited |
| Usage Pattern | Scans 3–5 packaged snacks per grocery trip (weekly) |
| Acceptance Gate | Must see red/green safety flags within 3 seconds |

### Persona 2: Rahul — The Condition-Managed Professional
| Attribute | Value |
|---|---|
| Age | 45 |
| Location | Delhi NCR |
| Health Vault | Hypertension (Stage 2), Pre-Diabetic (HbA1c 6.2) |
| Primary Concern | Hidden sodium (>600mg/serving) and refined sugar (>10g) in ready-to-eat meals |
| Language | Hindi primary, English fluent |
| Usage Pattern | Scans every new packaged food before purchase |
| Acceptance Gate | Must receive explicit medical conflict warnings against his health vault |

### Persona 3: Anil — The Fitness Tracker
| Attribute | Value |
|---|---|
| Age | 22 |
| Location | Bangalore |
| Health Vault | Lactose intolerance, Whey allergy |
| Primary Concern | Hidden maltodextrin filler in protein bars, heavy metal contamination |
| Language | English primary, Kannada secondary |
| Usage Pattern | Logs 5+ meals daily, scans every supplement |
| Acceptance Gate | Must see per-ingredient safety classification and macro accuracy within ±10% |

---

## 1.4 User Stories

| ID | As a... | I want to... | So that... | Priority |
|---|---|---|---|---|
| US-01 | User | Scan a back-of-pack label with my camera | I instantly decode all INS codes and see additive risks | P0 |
| US-02 | Hypertensive user | See sodium-specific warnings cross-referenced with my profile | I avoid dangerous products my doctor warned about | P0 |
| US-03 | Free-tier user | Search common Indian foods with zero network delay | I get instant results even on poor 2G/3G connections | P0 |
| US-04 | Pro-tier user | Get detailed macro breakdowns saved to my profile | I track my long-term dietary patterns | P1 |
| US-05 | Non-English user | Read ingredient safety analysis in my regional language | I understand what I'm eating without English fluency | P1 |
| US-06 | Parent | Flag specific allergens (Peanuts, Soy, Gluten) in my vault | The app screams at me before I feed my child something dangerous | P0 |
| US-07 | Fitness user | Compare safety scores of competing protein bars | I choose the cleanest product on the shelf | P2 |

---

## 1.5 Acceptance Criteria

| ID | Criterion | Metric | Verification |
|---|---|---|---|
| AC-01 | OCR Text Extraction Accuracy | ≥ 92% character accuracy on standard glossy Indian packaging under 200-500 lux lighting | Mock OCR test suite with 10 real label images |
| AC-02 | INS Code Normalization | 100% of INS codes in the FSSAI registry (300+ codes) must resolve to human-readable names and risk classifications | Unit test: `pytest tests/test_ins_parser.py` |
| AC-03 | Cached Search Latency | < 50ms for `localStorage` SWR-hydrated queries | Chrome DevTools Performance audit |
| AC-04 | Full OCR Pipeline Latency | < 3.5s end-to-end (capture → preprocess → OCR → structure → score → render) | Integration test with timer assertions |
| AC-05 | Health Vault Encryption | AES-256-GCM authenticated encryption for all stored medical conditions | Security audit of MongoDB write path |
| AC-06 | Offline Resilience | 18+ pre-populated regional Indian foods available with zero network | Kill network in DevTools, verify Search tab renders |
| AC-07 | Safety Score Formula | Matches the mathematical specification exactly (see §1.6) | `pytest tests/test_safety_score.py` with 20 edge cases |

---

## 1.6 FSSAI Metric Targets & Safety Score Specification

### Formula
```
Safety_Score = Base(100) − Σ(Nutritional_Penalties) − Σ(Additive_Penalties) − Medical_Profile_Penalty
```

### Nutritional Penalties (per 100g/ml, based on FSSAI HFSS thresholds)
| Nutrient | Threshold | Penalty |
|---|---|---|
| Added Sugar | 10g – 15g | -5 pts |
| Added Sugar | 15g – 22.5g | -8 pts |
| Added Sugar | > 22.5g | -12 pts |
| Sodium | 500mg – 900mg | -5 pts |
| Sodium | 900mg – 1500mg | -8 pts |
| Sodium | > 1500mg | -10 pts |
| Saturated Fat | 5g – 10g | -4 pts |
| Saturated Fat | > 10g | -8 pts |
| Trans Fat (Industrial) | > 0.5g | -8 pts |
| Refined Carbs (Maida base) | Primary ingredient | -5 pts |
| **Bonus**: Fiber ≥ 3g | — | +3 pts |
| **Bonus**: Protein ≥ 8g | — | +5 pts |

### Additive Penalties
| Risk Tier | Examples | Penalty per occurrence |
|---|---|---|
| High Risk | INS 102 (Tartrazine), INS 110 (Sunset Yellow), INS 951 (Aspartame), Potassium Bromate | -10 to -15 pts |
| Moderate Risk | INS 621 (MSG), INS 627, INS 631, INS 635, TBHQ, BHA (INS 320), BHT (INS 321), Carrageenan (INS 407) | -5 to -8 pts |
| Low Risk | INS 322 (Lecithin), INS 500 (Sodium Bicarbonate), INS 330 (Citric Acid), INS 440 (Pectin) | -1 to -3 pts |

### Medical Profile Penalties
| Condition | Trigger | Penalty |
|---|---|---|
| Diabetes | Sugar > 15g or Maltodextrin present | -25 to -40 pts |
| Hypertension | Sodium > 600mg | -25 to -40 pts |
| Allergen Match (Severe) | Peanuts, Soy, Gluten, Dairy when flagged | Override to score < 20 |

### Score Tier Classification
| Range | Classification | UI Treatment |
|---|---|---|
| 70 – 100 | Safe / Perfect | Emerald badge, green ring |
| 40 – 69 | Moderate / Caution | Amber badge, yellow ring |
| 0 – 39 | Dangerous | Rose badge, red ring, pulsing alert |
