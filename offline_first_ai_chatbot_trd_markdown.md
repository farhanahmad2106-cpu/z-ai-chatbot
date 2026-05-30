# Technical Requirement Document (TRD)
## Z-AI Chatbot V1.0

### Based On
`ai_chatbot_prd_markdown.md`

---

# 1. Technical Overview

## Objective

This Technical Requirement Document (TRD) translates the Product Requirements Document (PRD) into an actionable engineering blueprint for backend, infrastructure, database, synchronization, and platform architecture teams.

The system must provide:
- Fully offline AI conversations
- Secure local-first architecture
- Cross-platform synchronization
- Lightweight performance
- Encrypted local storage
- Minimal cloud dependency
- Support for low-end hardware

The design prioritizes:
- Proven technologies
- Maintainability
- Predictable scalability
- Operational simplicity
- Long-term stability

---

# 2. System Architecture Overview

## 2.1 High-Level Architecture

```text
+------------------------------------------------------+
|                  Frontend Layer                      |
|------------------------------------------------------|
| Desktop UI (Qt/PySide6)                              |
| Android UI (Kivy/BeeWare)                            |
| Local State Management                               |
| Notification Layer                                   |
| Local Documentation Renderer                         |
+--------------------------|---------------------------+
                           |
                           v
+------------------------------------------------------+
|                  Local Backend Core                  |
|------------------------------------------------------|
| FastAPI Service Layer                                |
| AI Inference Manager                                 |
| Synchronization Engine                               |
| Authentication Service                               |
| Encryption Manager                                   |
| Backup Manager                                       |
| Analytics Engine                                     |
| Billing Manager                                      |
| Notification Scheduler                               |
+--------------------------|---------------------------+
                           |
                           v
+------------------------------------------------------+
|                 Local Infrastructure                 |
|------------------------------------------------------|
| SQLite + SQLCipher                                   |
| llama.cpp Runtime                                    |
| Local File Storage                                   |
| CRDT Sync Storage                                    |
| Local Documentation Index                            |
+--------------------------|---------------------------+
                           |
                           v
+------------------------------------------------------+
|            Optional External Connectivity            |
|------------------------------------------------------|
| Google Search Scraper                                |
| Stripe/Razorpay APIs                                 |
| Optional Relay Sync Server                           |
+------------------------------------------------------+
```

---

## 2.2 Architectural Principles

| Principle | Technical Interpretation |
|---|---|
| Offline First | Core functionality cannot depend on network access |
| Local Ownership | User data remains device-local by default |
| Modular Services | Each subsystem independently maintainable |
| Resource Efficiency | Optimized for RAM and CPU constraints |
| Minimal Cloud Usage | External services optional and isolated |
| Secure-by-Default | Encryption integrated into all data paths |

---

## 2.3 Architecture Justification

### Why Local-First?
The PRD prioritizes privacy, offline usage, and user ownership. Local-first architecture ensures:
- Faster performance
- Reduced operational costs
- Better privacy guarantees
- Offline resilience

### Why FastAPI?
FastAPI offers:
- Mature Python ecosystem
- Async support
- Excellent developer productivity
- Lightweight deployment
- Strong typing support

### Why SQLite + SQLCipher?
Chosen because:
- Extremely lightweight
- Excellent offline reliability
- Minimal operational overhead
- Strong encrypted storage support

---

# 3. Frontend Responsibilities

## 3.1 Frontend Responsibilities

The frontend layer is responsible for presentation, interaction, and lightweight client-side state handling.

### Responsibilities

#### UI Rendering
- Chat interface
- Dashboard visualizations
- Settings pages
- Documentation renderer
- Backup/sync status screens

#### State Management
- UI state
- Temporary conversation state
- Theme settings
- Local cache state

#### User Interactions
- Form handling
- Local validation
- File selection
- Device pairing UI
- Notification display

#### Local System Integrations
- Biometric prompts
- File system access
- Native OS notifications
- Theme adaptation

#### Streaming Handling
- Render streaming AI responses
- Partial message updates
- Real-time sync indicators

---

## 3.2 What Frontend Must NOT Handle

| Responsibility | Owner |
|---|---|
| Business logic | Backend |
| Encryption implementation | Backend |
| Authentication token generation | Backend |
| Billing validation | Backend |
| CRDT merge logic | Backend |
| AI inference orchestration | Backend |
| Database write coordination | Backend |
| Synchronization conflict resolution | Backend |

---

# 4. Backend Responsibilities

## 4.1 Backend Ownership

The backend is the authoritative owner of:
- Business logic
- Security enforcement
- Synchronization logic
- AI orchestration
- Persistence coordination

---

## 4.2 Core Backend Services

### AI Inference Service

#### Responsibilities
- Model lifecycle management
- Inference scheduling
- Memory optimization
- Prompt preprocessing
- Context management

---

### Synchronization Service

#### Responsibilities
- CRDT operations
- Device pairing
- Sync queues
- Conflict resolution
- Retry scheduling

---

### Authentication Service

#### Responsibilities
- Session creation
- Token generation
- Key derivation
- Device trust management

---

### Encryption Manager

#### Responsibilities
- Key storage abstraction
- Payload encryption/decryption
- Secure wipe operations
- Backup encryption

---

### Backup Manager

#### Responsibilities
- Snapshot generation
- Incremental backup tracking
- Restore verification
- Compression

---

### Billing Service

#### Responsibilities
- License validation
- Subscription state
- Payment verification
- Grace-period management

---

### Analytics Service

#### Responsibilities
- Local metrics aggregation
- Performance logging
- Crash reporting
- Usage summaries

---

# 5. Database Schema Proposal

## 5.1 Database Selection

### Primary Database
SQLite + SQLCipher

### Reasoning
- Lightweight
- Offline optimized
- Strong local encryption support
- Low maintenance

---

## 5.2 Core Tables

### users

```sql
users (
    id UUID PRIMARY KEY,
    device_name TEXT,
    created_at TIMESTAMP,
    biometric_enabled BOOLEAN,
    language TEXT,
    theme TEXT
)
```

---

### conversations

```sql
conversations (
    id UUID PRIMARY KEY,
    title TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    archived BOOLEAN
)
```

Indexes:

```sql
INDEX updated_at_idx(updated_at)
```

---

### messages

```sql
messages (
    id UUID PRIMARY KEY,
    conversation_id UUID,
    role TEXT,
    content TEXT,
    created_at TIMESTAMP,
    sync_version INTEGER
)
```

Indexes:

```sql
INDEX conversation_id_idx(conversation_id)
INDEX created_at_idx(created_at)
```

---

### models

```sql
models (
    id UUID PRIMARY KEY,
    model_name TEXT,
    model_path TEXT,
    quantization TEXT,
    size_mb INTEGER,
    installed BOOLEAN
)
```

---

### sync_devices

```sql
sync_devices (
    id UUID PRIMARY KEY,
    device_name TEXT,
    public_key TEXT,
    trusted BOOLEAN,
    last_seen TIMESTAMP
)
```

---

### sync_operations

```sql
sync_operations (
    id UUID PRIMARY KEY,
    operation_type TEXT,
    payload_hash TEXT,
    status TEXT,
    retry_count INTEGER,
    created_at TIMESTAMP
)
```

---

### backups

```sql
backups (
    id UUID PRIMARY KEY,
    path TEXT,
    size_mb INTEGER,
    created_at TIMESTAMP,
    verified BOOLEAN
)
```

---

### achievements

```sql
achievements (
    id UUID PRIMARY KEY,
    achievement_type TEXT,
    progress INTEGER,
    unlocked BOOLEAN
)
```

---

### app_metrics

```sql
app_metrics (
    id UUID PRIMARY KEY,
    cpu_usage REAL,
    ram_usage REAL,
    response_time_ms INTEGER,
    created_at TIMESTAMP
)
```

---

# 6. API Structure

## 6.1 API Style

### Selected Style
REST API

### Reasoning
REST was selected because it:
- Reduces complexity
- Simplifies debugging
- Works well offline
- Is easier to maintain long-term

---

## 6.2 API Versioning Strategy

```text
/api/v1/
```

---

## 6.3 Core API Endpoints

### Chat APIs

#### POST /api/v1/chat/message

Request:

```json
{
  "conversation_id": "uuid",
  "message": "Hello AI"
}
```

Response:

```json
{
  "message_id": "uuid",
  "stream": true
}
```

---

#### GET /api/v1/chat/conversations

Response:

```json
[
  {
    "id": "uuid",
    "title": "Research Notes"
  }
]
```

---

### Model APIs

- GET /api/v1/models
- POST /api/v1/models/load
- POST /api/v1/models/unload

---

### Sync APIs

- POST /api/v1/sync/pair
- POST /api/v1/sync/push
- POST /api/v1/sync/pull

---

### Backup APIs

- POST /api/v1/backups/create
- POST /api/v1/backups/restore

---

### Settings APIs

- GET /api/v1/settings
- PUT /api/v1/settings

---

### Billing APIs

- POST /api/v1/billing/verify
- GET /api/v1/billing/status

---

## 6.4 Error Handling Standard

```json
{
  "error": {
    "code": "SYNC_CONFLICT",
    "message": "Conflict detected during synchronization"
  }
}
```

---

# 7. Authentication Strategy

## 7.1 Authentication Model

### Primary Authentication
- Biometric unlock
- PIN/password
- Session tokens

---

## 7.2 Authorization Model

| Role | Permissions |
|---|---|
| User | Full local access |
| Trusted Device | Sync participation |

---

## 7.3 Session Strategy

### Selected Approach
JWT access tokens stored locally.

### Token Lifetime
- Short-lived access token
- Long-lived refresh token

---

## 7.4 Encryption Key Strategy

### Key Storage
- OS keychain when available
- Encrypted fallback storage

### Key Derivation
Argon2id

---

# 8. Third-Party Dependencies

## 8.1 Required Libraries

| Dependency | Purpose |
|---|---|
| FastAPI | Backend framework |
| llama.cpp | Local inference |
| SQLCipher | Encrypted database |
| libsodium | Cryptography |
| Playwright | Web scraping |
| APScheduler | Background jobs |
| PySide6 | Desktop UI |
| Stripe SDK | Billing |
| Razorpay SDK | Regional payments |

---

## 8.2 Build vs Buy Decisions

### Billing
Buy using Stripe and Razorpay because payment compliance is complex.

### Synchronization
Build internally to preserve privacy requirements.

### Analytics
Build locally because telemetry is disabled by default.

---

## 8.3 Vendor Lock-In Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| Stripe | Medium | Abstract billing provider |
| Playwright | Low | Replaceable scraper layer |
| llama.cpp | Low | Open-source ecosystem |

---

# 9. Scalability Considerations

## 9.1 Expected Scale

Version 1 assumptions:
- Primarily single-user local deployments
- Limited concurrent operations
- Small-to-medium local databases

---

## 9.2 Scaling Strategy

### Horizontal Scaling
Only required for optional relay services.

### Database Optimization
- Indexed lookups
- WAL mode enabled
- Incremental writes
- Background compaction

### Memory Optimization
- Dynamic model unloading
- Quantized inference
- Streamed responses

### Caching Strategy
Use lightweight SQLite memory cache.

### Sync Throughput Optimization
- Incremental sync
- Delta synchronization
- Compressed payloads

---

## 9.3 Future Scaling Path

| Area | Upgrade Path |
|---|---|
| Database | PostgreSQL |
| Sync Relay | Kubernetes |
| Analytics | Distributed pipeline |
| AI Runtime | GPU inference servers |

---

# 10. Deployment Strategy

## Desktop Packaging
- PyInstaller
- Briefcase

---

## Android Packaging
- Buildozer
- BeeWare toolchain

---

## Update Strategy
Signed delta updates.

---

# 11. Operational Requirements

## Logging
- Structured logs
- Rotation support
- Local-only storage

---

## Monitoring
- CPU usage
- RAM usage
- Sync latency
- Inference time

---

## Crash Recovery
- Automatic recovery
- Transaction-safe writes
- Corruption detection

---

# 12. Deferred Features (Not in V1)

To avoid overengineering, the following are deferred:

- Plugin marketplace
- Distributed cloud inference
- Collaborative workspaces
- Advanced enterprise RBAC
- Full vector database search
- Voice assistant mode
- Image generation

---

# 13. Final Technical Recommendations

| Layer | Recommendation |
|---|---|
| Backend | FastAPI |
| AI Runtime | llama.cpp |
| Database | SQLite + SQLCipher |
| Sync Engine | CRDT |
| Encryption | libsodium |
| Desktop UI | PySide6 |
| Android | Kivy/BeeWare |

---

# 14. Conclusion

The proposed technical architecture delivers a secure, scalable, and maintainable offline-first AI platform aligned with the PRD requirements. The design intentionally prioritizes simplicity, reliability, and long-term maintainability over unnecessary complexity.

The architecture:
- Minimizes operational burden
- Preserves user privacy
- Supports low-end devices
- Enables future extensibility
- Avoids premature scaling complexity

This approach ensures the platform can reach production stability quickly while retaining flexibility for future expansion.

