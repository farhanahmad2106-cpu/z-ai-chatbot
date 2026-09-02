# 13. End-to-End App Flow (appFlow)

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 13.1 Master Navigation Flow

```mermaid
graph TD
    A[App Launch] --> B{localStorage has cached data?}
    B -->|Yes| C[Instant SWR Hydration<br/>Render cached foods & stats<br/>0ms render]
    B -->|No| D[Show Loading Overlay<br/>Dynamic Quote Engine<br/>8s/15s rotation]
    
    C --> E[Background API Revalidation<br/>Sync badge: 'Refreshing...']
    D --> F[Fetch initial data from API]
    E --> G[Home: Tab Navigation]
    F --> G
    
    G --> H[🏠 Dashboard Tab]
    G --> I[🔍 Search Tab]
    G --> J[📷 Scan Tab]
    G --> K[👤 Profile Tab]
    G --> L[⚙️ Settings Tab]
    G --> M[💳 Pricing Tab]
```

---

## 13.2 Dashboard Flow

```mermaid
graph TD
    H[Dashboard Tab] --> H1[Daily Macro Rings<br/>Calories · Protein · Carbs · Fat]
    H --> H2[Login Streak Counter<br/>🔥 N-Day Streak]
    H --> H3[Quick Scan Camera<br/>Live viewfinder]
    H --> H4[Usage Indicator<br/>N/20 scans used]
    H --> H5[Subscription Badge<br/>Free/Starter/Pro/Elite]
    
    H3 -->|Capture photo| H6[Navigate to Scan tab<br/>with pre-loaded image]
    H4 -->|Limit reached| H7[UpgradeModal<br/>Show pricing options]
```

---

## 13.3 Search Flow

```mermaid
graph TD
    I[Search Tab] --> I1[Render cached results<br/>or DEFAULT_FALLBACK_FOODS]
    I1 --> I2[User types query]
    I2 --> I3[GET /api/foods?search=query]
    I3 --> I4{Results found?}
    I4 -->|Yes| I5[Render food grid<br/>1/2/3 column responsive]
    I4 -->|No DB results| I6[AI Fallback Chain<br/>Ollama → NVIDIA → Gemini]
    I6 --> I7{Is food item?}
    I7 -->|Yes| I8[Generate + cache + display]
    I7 -->|No| I9[Show 'Not a food item' error]
    
    I5 --> I10[User clicks food card]
    I10 --> I11[Show ingredient details<br/>Safety pills: Safe/Moderate/Dangerous]
    I11 --> I12[Options: Translate · Log Meal]
    
    I5 --> I13[Multi-select mode]
    I13 --> I14[Floating counter bar<br/>+ − controls]
    I14 --> I15[Tick button: Confirm]
    I15 --> I16[POST /api/user/log_meal<br/>for each selected item]
    I16 --> I17[Success toast notification]
```

---

## 13.4 Camera OCR Scan Flow

```mermaid
graph TD
    J[Scan Tab] --> J0[Mode Toggle:<br/>🍽️ Scan Food vs 📋 Scan Label]
    
    J0 -->|Scan Food| J1[Start Camera]
    J0 -->|Scan Label| J2[Start Camera<br/>+ Viewfinder overlay]
    
    J1 --> J3[Capture Photo]
    J2 --> J3
    
    J3 --> J4[Image Preview]
    J4 --> J5[Click 'Analyze Ingredients']
    J5 --> J6[compressImage 800px, 0.7 quality]
    J6 --> J7{Scan Mode?}
    
    J7 -->|Food| J8[POST /api/scan<br/>Vision AI analysis]
    J7 -->|Label| J9[POST /api/scan/ingredients<br/>OCR extraction + LLM structuring]
    
    J8 --> J10{has_ingredients?}
    J10 -->|false| J11[Show 'Detection Failed' banner<br/>Clear & Try Again button]
    J10 -->|true| J12[Render Food Results<br/>Name · Score · Ingredients · Warnings]
    
    J9 --> J13[Render OCR Results Dashboard<br/>Macros grid · Allergens · Additives · Ingredients pills]
    
    J12 --> J14[Allergen Conflict Check<br/>vs user preferences.allergies]
    J14 --> J15{Conflict detected?}
    J15 -->|Yes| J16[⚠️ ALLERGY CONFLICT WARNING<br/>Pulsing red banner]
    J15 -->|No| J17[Safe to consume indicator]
```

---

## 13.5 Health Profile Vault Flow

```mermaid
graph TD
    K[Profile Tab] --> K1[Display health_profile<br/>Age · Gender · Height · Weight]
    K --> K2[Display preferences<br/>Diet type · Allergies list]
    K --> K3[Subscription Badge]
    
    K1 --> K4[Click 'Edit Health Profile']
    K4 --> K5[Toggle input fields<br/>Age, Gender, Height, Weight]
    K5 --> K6[Save]
    K6 --> K7[POST /api/user/profile<br/>{health_profile: {...}}]
    
    K2 --> K8[Click 'Configure Dietary Preferences']
    K8 --> K9[DietaryPreferencesModal<br/>Diet: Vegetarian/Vegan/Keto/Halal<br/>Allergies: Peanuts/Soy/Gluten/Dairy/+Custom]
    K9 --> K10[Save]
    K10 --> K7
```

---

## 13.6 Razorpay Subscription Upgrade Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Razorpay
    participant MongoDB

    User->>Frontend: Click "Upgrade to Pro" on PricingPage
    Frontend->>Backend: POST /api/subscription/create {plan: "pro"}
    Backend->>Razorpay: razorpay.subscription.create({plan_id, customer_notify: 1})
    Razorpay-->>Backend: {subscription_id, status: "created"}
    Backend-->>Frontend: {subscription_id}
    Frontend->>Frontend: Open Razorpay Checkout modal
    User->>Razorpay: Complete UPI/Card payment
    Razorpay-->>Frontend: {razorpay_payment_id, razorpay_subscription_id, razorpay_signature}
    Frontend->>Frontend: Show PaymentStatus (success screen)
    
    Note over Razorpay,Backend: Async webhook callback
    Razorpay->>Backend: POST /api/webhooks/razorpay {event: "subscription.activated"}
    Backend->>Backend: Verify HMAC-SHA256 signature
    Backend->>MongoDB: Update user: tier="pro", subscription.status="active"
    MongoDB-->>Backend: OK
    
    Frontend->>Backend: GET /api/subscription/status
    Backend-->>Frontend: {plan: "pro", status: "active", scan_limit: 500}
```
