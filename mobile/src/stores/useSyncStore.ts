import { create } from 'zustand';

interface SyncState {
  pendingEvents: any[];
  addEvent: (event: any) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingEvents: [],
  addEvent: (event) => set((state) => ({ pendingEvents: [...state.pendingEvents, event] })),
}));
