import { create } from 'zustand';
import { TelemetrySnapshot, subscribeToMetrics } from '../services/MetricsService';

interface TelemetryState {
  metrics: TelemetrySnapshot | null;
  isActive: boolean;
  error: string | null;
  abortFeed: (() => void) | null;
  startTelemetryFeed: () => void;
  stopTelemetryFeed: () => void;
}

export const useTelemetryStore = create<TelemetryState>((set, get) => ({
  metrics: null,
  isActive: false,
  error: null,
  abortFeed: null,

  startTelemetryFeed: () => {
    if (get().isActive) return;
    set({ isActive: true, error: null });

    const abort = subscribeToMetrics(
      (data) => {
        set({ metrics: data, error: null });
      },
      (err) => {
        set({ error: err });
      }
    );

    set({ abortFeed: abort });
  },

  stopTelemetryFeed: () => {
    const { abortFeed } = get();
    if (abortFeed) {
      abortFeed();
    }
    set({ metrics: null, isActive: false, abortFeed: null });
  }
}));
