/** Registers public/sw.js (offline app shell) in production builds only. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* offline support is best-effort */
    });
  });
}

/** Captured `beforeinstallprompt` event for the "Add to home screen" banner. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
}
export function getInstallPrompt(): InstallPromptEvent | null {
  return deferred;
}
export function onInstallPromptChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export function clearInstallPrompt(): void {
  deferred = null;
  listeners.forEach((l) => l());
}
