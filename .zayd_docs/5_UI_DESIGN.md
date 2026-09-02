# 5. Design System Specifications

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 5.1 Brutalist Dark Theme — Design Tokens

### Color System
| Token Name | Tailwind Class | Hex | Usage |
|---|---|---|---|
| `--bg-base` | `bg-slate-950` | `#020617` | Page background, root container |
| `--bg-surface` | `bg-slate-900` | `#0f172a` | Cards, containers, sections |
| `--bg-elevated` | `bg-slate-800` | `#1e293b` | Hover states, active pills, input backgrounds |
| `--border-subtle` | `border-slate-800` | `#1e293b` | Default container borders |
| `--border-hover` | `border-slate-700` | `#334155` | Hover-state borders, focus rings |
| `--accent-safe` | `text-emerald-400` | `#34d399` | Safe scores, success states, primary CTA |
| `--accent-safe-bg` | `bg-emerald-500/10` | — | Safe score badge backgrounds |
| `--accent-warn` | `text-amber-400` | `#fbbf24` | Moderate scores, streak counters |
| `--accent-warn-bg` | `bg-amber-500/10` | — | Warning badge backgrounds |
| `--accent-danger` | `text-rose-400` | `#fb7185` | Dangerous scores, error states, allergen flags |
| `--accent-danger-bg` | `bg-rose-500/10` | — | Danger badge backgrounds |
| `--text-primary` | `text-white` | `#ffffff` | Headings, primary content |
| `--text-secondary` | `text-gray-400` | `#9ca3af` | Body text, descriptions |
| `--text-muted` | `text-gray-500` | `#6b7280` | Labels, timestamps, overlines |

### Typography Scale
| Element | Classes | Font |
|---|---|---|
| Page Title (H1) | `text-4xl font-bold font-outfit tracking-tight` | Outfit |
| Section Title (H2) | `text-xl font-bold tracking-tight` | Outfit |
| Card Title (H3) | `text-2xl font-bold leading-tight` | Outfit |
| Overline / Label | `text-[10px] font-black uppercase tracking-widest text-gray-500` | Manrope |
| Body Text | `text-sm text-gray-400 leading-relaxed` | Manrope |
| Button Text | `text-xs font-bold` or `text-sm font-bold` | Manrope |

### Border Radius Scale
| Element | Class |
|---|---|
| Page cards / major containers | `rounded-3xl` |
| Buttons | `rounded-xl` or `rounded-2xl` |
| Modals | `rounded-3xl` with `max-w-lg` |
| Input fields | `rounded-xl` |
| Tags / Badges / Pills | `rounded-full` |

---

## 5.2 Glassmorphic Modal System
```css
/* Modal Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.90);
  backdrop-filter: blur(24px);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Modal Content */
.modal-content {
  background: #0f172a;  /* bg-slate-900 */
  border: 1px solid rgba(51, 65, 85, 0.5);  /* border-slate-700/50 */
  border-radius: 1.5rem;  /* rounded-3xl */
  max-width: 32rem;  /* max-w-lg */
  width: 100%;
  padding: 2rem;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}
```

---

## 5.3 Dynamic Quote Progress Bar — Animation Mathematics

### Timer Logic
```
IF quote.length <= 60 AND !quote.includes(',') AND !quote.includes(';'):
    DURATION = 8000ms  (8 seconds)
ELSE:
    DURATION = 15000ms (15 seconds)
```

### CSS Keyframes (Synchronized)
```css
@keyframes progressFill-8s {
  from { width: 0%; }
  to { width: 100%; }
}

@keyframes progressFill-15s {
  from { width: 0%; }
  to { width: 100%; }
}

.progress-bar-short {
  animation: progressFill-8s 8s linear forwards;
}

.progress-bar-long {
  animation: progressFill-15s 15s linear forwards;
}
```

### Cooldown Engine Formula
```
D(i) = 3 × i days = 3 × i × 86,400,000 ms

Where i = number of times the quote has been shown.

Storage key: z_sehealth_quote_history
Storage format: { [quoteId: string]: { count: number, lastShown: number } }

A quote is eligible if:
  Date.now() - record.lastShown >= D(record.count)
```

---

## 5.4 OCR Viewfinder Overlay Specification

### Camera Active State (Ingredients Mode)
```
┌──────────────────────────────────┐
│          <video> element          │
│                                  │
│    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐     │
│    │                       │     │
│    │  Align text within    │     │
│    │       frame           │     │
│    │                       │     │
│    └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘     │
│                                  │
└──────────────────────────────────┘
```

CSS Implementation:
```css
/* Outer overlay: dims everything outside the target zone */
.viewfinder-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  padding: 1rem;
}

/* Inner dashed box: the OCR target zone */
.viewfinder-target {
  width: 100%;
  max-width: 90%;
  height: 8rem;
  border: 2px dashed #34d399;  /* border-emerald-500 */
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(52, 211, 153, 0.1);  /* bg-emerald-500/10 */
}

/* Guide text */
.viewfinder-label {
  color: #34d399;
  font-weight: bold;
  font-size: 0.75rem;
  background: rgba(15, 23, 42, 0.8);
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
}
```

---

## 5.5 Mobile Telemetry HUD (Z-AI Chatbot)
```
┌──────────────────────────────────┐
│  CPU: ████████░░ 78%   45°C      │
│  RAM: ██████░░░░ 1.2/2.0 GB      │
│  GPU: ███░░░░░░░ 34%   38°C      │
│  Model: qwen-1.5b-q4_k_m.gguf   │
│  Tokens/s: 12.4 | Ctx: 2048     │
└──────────────────────────────────┘
```

Each meter is a CSS progress bar with real-time percentage width updates from `useTelemetryStore` polling at 2-second intervals.
