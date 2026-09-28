import { create } from 'zustand';

export interface DeviceTelemetry {
  batteryLevel: number | null;
  isCharging: boolean | null;
  memoryPressure: "normal" | "warning" | "critical" | "unknown";
  inferenceEngine: "remote" | "local" | "hybrid" | "unavailable";
  network: "online" | "offline" | "unknown";
  lastUpdatedAt: string | null;
}

interface TelemetryState extends DeviceTelemetry {
  updateTelemetry: (data: Partial<DeviceTelemetry>) => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  batteryLevel: null,
  isCharging: null,
  memoryPressure: "unknown",
  inferenceEngine: "unavailable",
  network: "unknown",
  lastUpdatedAt: null,
  updateTelemetry: (data) => set((state) => ({ ...state, ...data, lastUpdatedAt: new Date().toISOString() })),
}));
