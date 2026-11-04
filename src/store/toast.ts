import { create } from 'zustand';
import { newId } from '@/lib/id';

export interface Toast {
  id: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'default' | 'success' | 'warning' | 'error';
  /** ms, default 7000 */
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  show: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (t) => {
    const id = newId('t');
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    const ms = t.duration ?? 7000;
    if (ms > 0) setTimeout(() => get().dismiss(id), ms);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

/** Imperative helper usable outside React. */
export const toast = (t: Omit<Toast, 'id'>) => useToastStore.getState().show(t);
