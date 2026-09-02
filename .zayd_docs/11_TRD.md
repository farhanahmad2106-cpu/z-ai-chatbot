# 11. Technical Requirements Document (TRD)

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 11.1 Latency Budgets

| Operation | Target | Hard Limit | Measurement Point |
|---|---|---|---|
| SWR-cached search render | < 10ms | 50ms | `performance.now()` around `localStorage.getItem` → `setFoods()` |
| Uncached MongoDB search | < 300ms | 500ms | FastAPI request duration header |
| AI fallback food generation | < 2.0s | 4.0s | Total across Ollama → NVIDIA → Gemini chain |
| OCR text extraction (local) | < 800ms | 1.5s | `pytesseract.image_to_string()` wall clock |
| LLM JSON structuring (cloud) | < 1.5s | 2.5s | Single LLM call to Gemini Flash |
| Full OCR pipeline (capture → result) | < 3.0s | 5.0s | Frontend timer from `analyzeImage()` start to `setAnalysisResult()` |
| Translation batch (10 items) | < 1.5s | 3.0s | Single LLM call duration |
| Firebase token verification | < 100ms | 200ms | `verify_id_token()` execution |
| Page initial load (SWR hydrated) | 0ms | 50ms | DOMContentLoaded → first meaningful paint |
| Razorpay checkout open | < 500ms | 1.0s | Button click to Razorpay modal appearance |

---

## 11.2 Security Standards

### DPDP Act Compliance (Digital Personal Data Protection Act of India)
| Requirement | Implementation |
|---|---|
| Lawful purpose for data collection | Consent obtained at registration; health data collected only for personalized safety scoring |
| Data minimization | Only name, email, and health conditions stored; no Aadhaar, PAN, or government IDs |
| Storage limitation | User data deletable via Settings > Delete Account; MongoDB TTL indexes on orphaned records |
| Data principal rights | Export profile as JSON via API; deletion cascades across all collections |
| Cross-border transfer | MongoDB Atlas region: `ap-south-1` (Mumbai). No health data leaves Indian jurisdiction |

### Encryption Standards
| Data Category | Encryption | Key Management |
|---|---|---|
| Health vault (conditions, allergies) | AES-256-GCM authenticated encryption | `HEALTH_VAULT_KEY` env var, rotatable |
| Firebase ID tokens | RSA-256 (Google-managed) | Auto-rotated by Firebase |
| Database connection | TLS 1.2+ (MongoDB Atlas enforced) | Atlas-managed certificates |
| API transport | HTTPS (TLS 1.3 preferred) | Vercel/Render auto-provisioned certs |
| Razorpay webhooks | HMAC-SHA256 signature verification | `RAZORPAY_WEBHOOK_SECRET` env var |

### Authentication Matrix
| Endpoint | Auth Required | Method | Token Source |
|---|---|---|---|
| `GET /api/foods` | No | — | — |
| `POST /api/translate` | No | — | — |
| `POST /api/scan` | Optional | Bearer JWT | `currentUser.getIdToken()` |
| `POST /api/scan/ingredients` | Optional | Bearer JWT | `currentUser.getIdToken()` |
| `POST /api/auth/sync` | No (token in body) | Body `{token}` | Firebase ID token |
| `GET /api/user/stats` | **Yes** | Bearer JWT | `Depends(get_current_user_id)` |
| `POST /api/user/log_meal` | **Yes** | Bearer JWT | `Depends(get_current_user_id)` |
| `GET /api/user/profile` | **Yes** | Bearer JWT | `Depends(get_current_user_id)` |
| `POST /api/user/profile` | **Yes** | Bearer JWT | `Depends(get_current_user_id)` |
| `POST /api/webhooks/razorpay` | HMAC-SHA256 | `X-Razorpay-Signature` header | Webhook secret |

---

## 11.3 Scalability Requirements

### Backend Concurrency
```
Workers = (2 × CPU_CORES) + 1
Example (Render 2-core): 5 Uvicorn workers
Example (4-core prod): 9 Uvicorn workers

Command: gunicorn main:app -w 5 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### Database Scaling
| Collection | Current Size | Index Strategy | Sharding Plan |
|---|---|---|---|
| `foods` | ~1,000 docs | `{name: 1}` text index | Not needed until > 100K docs |
| `users` | ~50 docs | `{uid: 1}` unique index | Not needed until > 50K users |

### CDN & Static Assets
- Frontend: Vercel Edge Network (automatic CDN, ~50 global PoPs)
- Font loading: Google Fonts CDN with `preconnect` hints
- Image compression: Client-side JPEG 0.7 quality, max 800px

### Rate Limiting Strategy
| Tier | Scans/Month | API Calls/Min | AI Model Access |
|---|---|---|---|
| Free | 20 | 30 | Gemini Flash only |
| Starter (₹366) | 100 | 60 | NVIDIA + Gemini |
| Pro (₹732) | 500 | 120 | NVIDIA + Gemini Pro |
| Elite (₹998) | Unlimited | 300 | Sarvam + NVIDIA + Gemini |

---

## 11.4 Availability Targets

| Component | Target Uptime | Recovery Strategy |
|---|---|---|
| Frontend (Vercel) | 99.9% | Global edge CDN with auto-failover |
| Backend (Render) | 99.5% | Health check endpoint `/`, auto-restart on crash |
| MongoDB Atlas | 99.95% | Replica set with automatic failover |
| Firebase Auth | 99.95% | Google-managed SLA |
| AI Services | Best-effort | Multi-tier failover guarantees at least one provider responds |
