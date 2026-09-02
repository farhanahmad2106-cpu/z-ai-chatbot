# 2. System Architecture — Z-SeHealth + Z-AI Chatbot

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 2.1 Macro-Architecture Overview

The system is composed of three deployment tiers communicating over HTTPS and WebSocket:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EDGE CLIENT LAYER                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │ React Web (Vite) │  │ React Native     │  │ Next.js Admin        │  │
│  │ z-sehealth.app   │  │ Expo Mobile App  │  │ Dashboard            │  │
│  │ SWR + localStorage│ │ llama.cpp GGUF   │  │ X-Admin-Key header   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────────┘  │
└───────────┼──────────────────────┼──────────────────────┼───────────────┘
            │ HTTPS                │ HTTPS/WS             │ HTTPS
┌───────────▼──────────────────────▼──────────────────────▼───────────────┐
│                     BACKEND SERVICE LAYER                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    FastAPI (Python 3.11)                          │   │
│  │  ┌────────────┐  ┌─────────────┐  ┌──────────────┐              │   │
│  │  │ /api/scan/* │  │ /api/foods  │  │ /api/user/*  │              │   │
│  │  │ OCR Engine  │  │ Search+AI   │  │ Auth+Stats   │              │   │
│  │  └─────┬──────┘  └──────┬──────┘  └──────┬───────┘              │   │
│  │        │                │                 │                       │   │
│  │  ┌─────▼────────────────▼─────────────────▼──────────┐           │   │
│  │  │          Multi-LLM Failover Router                 │           │   │
│  │  │  Tier 1: Ollama/Sarvam → Tier 2: NVIDIA (5 keys)  │           │   │
│  │  │  → Tier 3: Gemini Flash/2.0                        │           │   │
│  │  └───────────────────────────────────────────────────┘           │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└───────────┬──────────────────────┬──────────────────────┬───────────────┘
            │                      │                      │
┌───────────▼──────────┐ ┌────────▼────────┐ ┌───────────▼───────────────┐
│ MongoDB Atlas        │ │ Firebase Auth   │ │ Convex Serverless Cloud   │
│ Collections:         │ │ Google OAuth    │ │ conversations, messages    │
│ foods, users         │ │ Email/Password  │ │ Real-time sync             │
└──────────────────────┘ └─────────────────┘ └───────────────────────────┘
```

---

## 2.2 Multi-LLM Failover Router — Detailed Architecture

### Routing Strategy
The router implements a cascading failover pattern. Each tier is attempted sequentially. On success, the result is returned immediately. On failure (timeout, 429, 5xx, malformed response), execution falls through to the next tier.

```mermaid
flowchart TD
    A[Incoming Request] --> B{User Tier?}
    B -->|Elite ₹998| C[Sarvam AI Vision]
    B -->|Pro ₹732| D[NVIDIA NIM Pool]
    B -->|Starter ₹366| D
    B -->|Free ₹0| E[Gemini Flash]
    
    C -->|Success| Z[Return Result]
    C -->|Failure| D
    D -->|Key 1| F{Success?}
    F -->|Yes| Z
    F -->|No/429| G[Key 2]
    G -->|Success| Z
    G -->|No/429| H[Key 3]
    H -->|Success| Z
    H -->|No/429| I[Key 4]
    I -->|Success| Z
    I -->|No/429| J[Key 5]
    J -->|Success| Z
    J -->|No| E
    E -->|Success| Z
    E -->|Failure| K[Hardcoded Fallback JSON]
```

### NVIDIA Key Pool Configuration
```python
# Environment: NVIDIA_API_KEY, NVIDIA_API_KEY_1 through NVIDIA_API_KEY_5
# get_nvidia_keys() deduplicates and returns List[str]
# Each key has independent rate limits (~100 req/min)
# Total pool capacity: ~500 req/min sustained
```

---

## 2.3 OCR-to-Safety-Score Pipeline

```mermaid
sequenceDiagram
    participant U as User (Camera)
    participant FE as React Frontend
    participant API as FastAPI Backend
    participant PP as Image Preprocessor
    participant OCR as OCR Engine (Tesseract)
    participant LLM as LLM Structuring Router
    participant INS as INS Code Normalizer
    participant HV as Health Vault (MongoDB)
    participant SE as Safety Score Engine

    U->>FE: Capture back-of-pack photo
    FE->>FE: compressImageForAnalysis(base64, 800px, 0.7)
    FE->>API: POST /api/scan/ingredients {image: base64}
    API->>PP: Decode base64 → numpy array
    PP->>PP: cv2.cvtColor(BGR→GRAY)
    PP->>PP: cv2.GaussianBlur(5,5)
    PP->>PP: cv2.adaptiveThreshold(GAUSSIAN_C, 11, 2)
    PP-->>API: Cleaned binary image buffer
    API->>OCR: pytesseract.image_to_string(buffer)
    OCR-->>API: Raw text: "Refined Wheat Flour (Maida), INS 627..."
    API->>LLM: Route raw text to LLM for JSON structuring
    LLM-->>API: {ingredients: [...], additives: [...], allergens: [...], estimated_macros: {...}}
    API->>INS: Normalize INS codes → human names + risk tiers
    INS-->>API: [{code: "INS 627", name: "Disodium Guanylate", risk: "moderate"}]
    API->>HV: Fetch user health_profile + preferences
    HV-->>API: {conditions: ["Hypertension"], allergies: ["Peanuts"]}
    API->>SE: compute_safety_score(structured_data, user_profile)
    SE-->>API: {score: 35, tier: "dangerous", conflicts: ["Sodium: 1200mg vs Hypertension"]}
    API-->>FE: Full AnalysisResponse JSON
    FE-->>U: Render Safety Dashboard with score ring, warnings, ingredient pills
```

---

## 2.4 Convex Cloud Sync Architecture (Z-AI Chatbot)

```mermaid
graph LR
    subgraph Mobile["React Native Expo"]
        A[Chat UI] --> B[useMutation: sendMessage]
        A --> C[useQuery: getMessages]
        D[llama.cpp Engine] --> E[Local GGUF Response]
    end
    
    subgraph Convex["Convex Serverless"]
        F[conversations table]
        G[messages table]
        H[Mutation: createMessage]
        I[Query: listMessages]
    end
    
    subgraph Admin["Next.js Admin Dashboard"]
        J[Feature Flags Manager]
        K[Telemetry Viewer]
        L[User Analytics]
    end
    
    B -->|WebSocket| H
    H --> G
    I -->|Real-time subscription| C
    J -->|X-Admin-Key| F
    K -->|Read telemetry| G
```

---

## 2.5 Open Food Facts Proxy

```python
# Flow: User searches → MongoDB first → OFF API enrichment → AI fallback
# 1. Query local MongoDB foods collection
# 2. If no results, query Open Food Facts API with barcode/name
# 3. If OFF returns data, inject FSSAI-specific metadata:
#    - Map OFF additives to INS risk classifications
#    - Apply Indian dietary context (vegetarian markers, Jain restrictions)
# 4. Cache enriched result in MongoDB for future queries
# 5. If OFF also fails, trigger the multi-LLM AI fallback chain
```
