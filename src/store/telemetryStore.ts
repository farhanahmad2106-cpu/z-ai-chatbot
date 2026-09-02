import { create } from 'zustand';

export interface OtaErrorRecord {
  timestamp: number;
  message: string;
  stack?: string;
  code?: string;
}

export interface TelemetryState {
  cpuUsage: number;        // 0-100%
  ramUsedMB: number;       // Current RAM in MB
  ramTotalMB: number;      // Total device RAM
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
  modelLoaded: string;     // e.g., "qwen-1.5b-q4_k_m.gguf"
  tokensPerSecond: number; // Real-time inference speed
  contextLength: number;   // Current context window usage
  batteryLevel: number;    // 0-100%
  isCharging: boolean;
  otaErrors: OtaErrorRecord[];
  
  // Actions
  setThermalState: (state: 'nominal' | 'fair' | 'serious' | 'critical') => void;
  updateHardwareMetrics: (metrics: Partial<TelemetryState>) => void;
  logOtaError: (error: unknown) => void;
  clearOtaErrors: () => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  cpuUsage: 0,
  ramUsedMB: 0,
  ramTotalMB: 4096,
  thermalState: 'nominal',
  modelLoaded: 'none',
  tokensPerSecond: 0,
  contextLength: 0,
  batteryLevel: 100,
  isCharging: false,
  otaErrors: [],

  setThermalState: (thermalState) => set({ thermalState }),
  updateHardwareMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
  logOtaError: (error: unknown) => {
    const errorRecord: OtaErrorRecord = {
      timestamp: Date.now(),
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    // Safe console logging without breaking runtime
    console.error('[Telemetry][OTA Error]:', errorRecord.message);
    set((state) => ({
      otaErrors: [errorRecord, ...state.otaErrors.slice(0, 19)], // Retain last 20 errors
    }));
  },
  clearOtaErrors: () => set({ otaErrors: [] }),
}));
