import type { AppData } from '@/store/useAppStore';
import { useAppStore } from '@/store/useAppStore';

export const BACKUP_APP_ID = 'catering-quote-app';

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  version: 1;
  exportedAt: string;
  data: Omit<AppData, 'assistant'> & { assistant?: undefined };
}

/** Everything except the Claude API key (never put secrets in a backup file). */
export function buildBackup(): BackupFile {
  const s = useAppStore.getState();
  return {
    app: BACKUP_APP_ID,
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      events: s.events,
      history: s.history,
      chats: s.chats,
      brand: s.brand,
      customDishes: s.customDishes,
      meta: s.meta,
    },
  };
}

export function backupFile(): File {
  const json = JSON.stringify(buildBackup());
  const stamp = new Date().toISOString().slice(0, 10);
  return new File([json], `catering-backup-${stamp}.json`, { type: 'application/json' });
}

export class BackupError extends Error {}

/** Validates and applies a backup. Returns number of events restored. */
export function restoreBackup(text: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a backup file.');
  }
  const b = parsed as Partial<BackupFile>;
  if (!b || b.app !== BACKUP_APP_ID || !b.data || !Array.isArray(b.data.events)) {
    throw new BackupError('This file is not a backup from this app.');
  }
  const d = b.data;
  const cur = useAppStore.getState();
  cur.replaceAll({
    events: d.events,
    history: Array.isArray(d.history) ? d.history : [],
    chats: d.chats ?? {},
    brand: { ...cur.brand, ...(d.brand ?? {}) },
    customDishes: Array.isArray(d.customDishes) ? d.customDishes : [],
    meta: { ...cur.meta, ...(d.meta ?? {}) },
  });
  return d.events.length;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
