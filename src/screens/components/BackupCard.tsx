import clsx from 'clsx';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Sheet';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { relativeDays } from '@/lib/format';
import { shareOrDownload } from '@/lib/fileShare';
import { backupFile, BACKUP_APP_ID, restoreBackup } from '@/lib/backup';
import { readFileText } from './ui';

const WEEK_MS = 7 * 86_400_000;

/** "Your events are saved on this phone only" + Save backup / Restore backup. */
export function BackupCard({ className }: { className?: string }) {
  const lastBackupAt = useAppStore((s) => s.meta.lastBackupAt);
  const markBackupDone = useAppStore((s) => s.markBackupDone);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stale = !lastBackupAt || Date.now() - lastBackupAt > WEEK_MS;

  const save = async () => {
    setBusy(true);
    try {
      const result = await shareOrDownload(backupFile(), { title: 'Catering backup' });
      if (result === 'cancelled') return;
      markBackupDone();
      toast({
        text: result === 'shared' ? 'Backup saved. Keep the file somewhere safe.' : 'Backup downloaded to this phone.',
        tone: 'success',
      });
    } catch {
      toast({ text: 'Could not save the backup. Please try again.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const onPick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      const text = await readFileText(file);
      const parsed = JSON.parse(text) as { app?: string };
      if (parsed?.app !== BACKUP_APP_ID) throw new Error('not ours');
      setPending(text);
    } catch {
      toast({ text: 'This is not a backup file from this app.', tone: 'error' });
    }
  };

  const restore = () => {
    const text = pending;
    setPending(null);
    if (text == null) return;
    try {
      const n = restoreBackup(text);
      toast({ text: `Restored ${n} ${n === 1 ? 'event' : 'events'} from your backup.`, tone: 'success' });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Could not restore this file.', tone: 'error' });
    }
  };

  return (
    <section
      aria-label="Backup"
      className={clsx(
        'rounded-[20px] border p-4',
        stale ? 'border-[#EBCB8B] bg-warn-soft' : 'border-paper-line bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]',
        className,
      )}
    >
      <p className="font-display text-base font-semibold">Your events are saved on this phone only.</p>
      <p className={clsx('mt-1 text-[15px]', stale ? 'font-medium text-warn' : 'text-ink-muted')} data-testid="last-backup">
        Last backup: {relativeDays(lastBackupAt)}
        {stale && lastBackupAt ? '. Please save a new backup.' : ''}
        {!lastBackupAt ? '. Save one now so nothing is lost.' : ''}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="primary" className="px-2" onClick={save} disabled={busy}>
          Save backup
        </Button>
        <Button variant="secondary" className="px-2" onClick={() => fileRef.current?.click()}>
          Restore backup
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="sr-only-text"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="restore-file"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <ConfirmDialog
        open={pending !== null}
        title="Restore this backup?"
        message="This replaces the events on this phone with the ones in the backup file."
        confirmLabel="Yes, restore"
        danger
        onConfirm={restore}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
