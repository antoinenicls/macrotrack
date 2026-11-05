import { create } from 'zustand';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
  action?: { label: string; onPress: () => void };
  durationMs: number;
}

interface UIState {
  toasts: Toast[];
  toast: (msg: string, kind?: Toast['kind'], opts?: { action?: Toast['action']; durationMs?: number }) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

export const useUIStore = create<UIState>((set, get) => ({
  toasts: [],
  toast(message, kind = 'info', opts = {}) {
    const id = toastSeq++;
    const durationMs = opts.durationMs ?? (opts.action ? 5000 : 3200);
    set({ toasts: [...get().toasts, { id, kind, message, action: opts.action, durationMs }] });
    setTimeout(() => get().dismissToast(id), durationMs);
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  }
}));
