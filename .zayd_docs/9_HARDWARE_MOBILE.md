# 9. Edge Hardware & Mobile Runtime Spec

> **Version:** 1.0 | **Date:** 2026-09-03

---

## 9.1 React Native Expo Configuration

### Target Platforms
| Platform | Min Version | Architecture |
|---|---|---|
| Android | API 24 (Android 7.0) | ARM64-v8a, x86_64 (emulator) |
| iOS | 15.0 | ARM64 (A12+ chip) |

### Key Dependencies
| Package | Version | Purpose |
|---|---|---|
| `expo` | ~51.x | Core framework |
| `expo-camera` | ~15.x | Camera access for food scanning |
| `expo-file-system` | ~17.x | Local GGUF model storage |
| `expo-av` | ~14.x | Audio recording for voice interface |
| `react-native-llama` | ~0.3.x | `llama.cpp` bindings for GGUF inference |
| `expo-sqlite` | ~14.x | SQLCipher encrypted local storage |
| `zustand` | ~4.5.x | State management for telemetry store |

### Build Configuration (`app.json`)
```json
{
  "expo": {
    "name": "Z-AI Chat",
    "slug": "z-ai-chat",
    "version": "1.0.0",
    "orientation": "portrait",
    "android": {
      "permissions": ["CAMERA", "RECORD_AUDIO", "READ_EXTERNAL_STORAGE"],
      "package": "com.zsehealth.aichat"
    },
    "ios": {
      "bundleIdentifier": "com.zsehealth.aichat",
      "infoPlist": {
        "NSCameraUsageDescription": "Scan food labels for safety analysis",
        "NSMicrophoneUsageDescription": "Voice commands for hands-free food logging"
      }
    }
  }
}
```

---

## 9.2 Local GGUF Model Specifications

### Model Selection Criteria
Models must satisfy ALL constraints:
1. File size < 2.0 GB (to fit in mobile storage + RAM budget)
2. Quantization: `Q4_K_M` minimum (balances quality vs. size)
3. Context window ≥ 2048 tokens (sufficient for ingredient parsing)
4. Inference speed ≥ 8 tokens/second on Snapdragon 778G

### Approved Models
| Model | Quantization | File Size | Context | Tokens/s (SD778G) |
|---|---|---|---|---|
| Qwen2.5-1.5B | Q4_K_M | 1.1 GB | 4096 | ~14 t/s |
| Llama-3.2-1B | Q4_K_M | 0.8 GB | 2048 | ~18 t/s |
| Gemma-2-2B | Q4_K_M | 1.6 GB | 2048 | ~10 t/s |
| Phi-3-mini-3.8B | Q4_K_M | 2.3 GB | ❌ Exceeds limit | — |

### Memory Budget
```
Available RAM (mid-tier Android): ~3.5 GB
OS + Background Services:         ~1.5 GB
React Native Runtime:             ~0.3 GB
GGUF Model (loaded):              ~1.2 GB (Q4_K_M, 1.5B params)
Inference Working Memory:         ~0.3 GB
Safety Margin:                    ~0.2 GB
─────────────────────────────────────────
Total:                            ~3.5 GB ✓
```

---

## 9.3 CPU Core Utilization Tracking

### Telemetry Store (`useTelemetryStore`)
```typescript
interface TelemetryState {
  cpuUsage: number;        // 0-100%
  ramUsedMB: number;       // Current RAM in MB
  ramTotalMB: number;      // Total device RAM
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
  modelLoaded: string;     // e.g., "qwen-1.5b-q4_k_m.gguf"
  tokensPerSecond: number; // Real-time inference speed
  contextLength: number;   // Current context window usage
  batteryLevel: number;    // 0-100%
  isCharging: boolean;
}

// Polling interval: 2000ms
// Data source: expo-device + react-native-device-info
```

### Thermal Throttling Response
| Thermal State | Action |
|---|---|
| `nominal` | Full inference speed |
| `fair` | Reduce context window to 1024 |
| `serious` | Pause inference, show "Device is warm" warning |
| `critical` | Unload model, force cooldown period |

---

## 9.4 Camera Viewfinder Specifications

### Aspect Ratios
| Mode | Aspect Ratio | Resolution | Purpose |
|---|---|---|---|
| Food Scan | 16:9 | 1280×720 | Standard video preview |
| Label OCR | 4:3 | 1024×768 | Optimized for text-dense packaging |

### Image Compression Pipeline
```
Capture (Camera) → Raw frame (1280×720)
                 → Canvas resize (max 800px longest edge)
                 → JPEG compression (quality: 0.7)
                 → Base64 encoding
                 → ~80-150 KB payload (vs. ~2MB raw)
```

### Compression Function
```typescript
async function compressImageForAnalysis(
  base64Data: string,
  maxDimension: number = 800,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64Data);
      }
    };
    img.onerror = () => resolve(base64Data);
    img.src = base64Data;
  });
}
```
