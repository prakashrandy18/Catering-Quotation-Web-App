import clsx from 'clsx';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEvent } from '@/store/useAppStore';
import { buttonClass } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Sheet';
import { IconCheck, IconSparkle, IconUndo, IconWarning } from '@/components/ui/icons';
import { isLive } from './conversation';
import {
  confirmProposal,
  declineProposal,
  pickChoice,
  previewFor,
  sendMessage,
  setSpellingChoice,
  undoProposal,
  undoRevertsLater,
} from './actions';
import type { ChoiceCard, ErrorCard, ProposalCard } from './chatTypes';
import type { PreviewData, PreviewSection } from './preview';
import type { SpellingQuestion } from './spelling';

/* ------------------------------------------------------------------ */
/* Preview body                                                         */
/* ------------------------------------------------------------------ */

function DishList({ label, items, tone }: { label: string; items: string[]; tone: 'removed' | 'added' }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1">
      <div className={clsx('text-[15px] font-semibold', tone === 'removed' ? 'text-danger' : 'text-brand')}>{label}</div>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((t, i) => (
          <li
            key={`${t}-${i}`}
            className={clsx(
              'rounded-full px-3 py-1 text-[15px]',
              tone === 'removed' ? 'bg-danger-soft text-ink line-through decoration-danger/70' : 'bg-brand-soft text-ink',
            )}
          >
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ s, spellingNames }: { s: PreviewSection; spellingNames: Set<string> }) {
  if (s.kind === 'new-meal' && s.newMeal) {
    const m = s.newMeal;
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-display text-[17px] font-semibold leading-snug">
              <span aria-hidden="true">{m.icon} </span>
              {m.name}
            </div>
            <div className="text-sm text-ink-muted">{[s.title.split(' · ')[0], m.dateLine].filter(Boolean).join(' · ')}</div>
          </div>
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[13px] font-semibold text-brand">New</span>
        </div>
        <div className="rounded-xl bg-paper-sunk px-3 py-2 text-[15px]">{m.priceLine}</div>
        {m.dishes.length > 0 ? (
          <ul aria-label="Dishes" className="flex flex-wrap gap-1.5">
            {m.dishes.map((d, i) => (
              <li
                key={`${d}-${i}`}
                className={clsx('rounded-full px-3 py-1 text-[15px]', spellingNames.has(d.toLowerCase()) ? 'bg-warn-soft font-semibold text-warn' : 'bg-paper-sunk')}
              >
                {d}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[15px] text-ink-muted">No dishes yet.</p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="font-display text-[16px] font-semibold leading-snug">{s.title}</div>
      <DishList label="Removed:" items={s.removed} tone="removed" />
      <DishList label="Added:" items={s.added} tone="added" />
      {s.changes.length > 0 && (
        <ul className="flex flex-col gap-1">
          {s.changes.map((c, i) => (
            <li key={i} className="text-[15px] font-medium">
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PreviewBody({ preview, spelling }: { preview: PreviewData; spelling: SpellingQuestion[] }) {
  const names = useMemo(() => new Set(spelling.flatMap((q) => [q.typed.toLowerCase(), q.suggestion.toLowerCase()])), [spelling]);
  return (
    <div className="flex flex-col gap-3">
      {preview.sections.map((s, i) => (
        <div key={i} className={clsx(i > 0 && 'border-t border-paper-line pt-3')}>
          <Section s={s} spellingNames={names} />
        </div>
      ))}
      <div className="rounded-xl bg-paper-sunk px-3 py-2 text-[15px] font-semibold" data-testid="proposal-total">
        {preview.totalLine}
      </div>
    </div>
  );
}

function SpellingAsk({ q, choice, onPick }: { q: SpellingQuestion; choice: 'suggestion' | 'typed'; onPick: (c: 'suggestion' | 'typed') => void }) {
  const btn = (active: boolean) =>
    clsx(
      'min-h-[48px] flex-1 rounded-xl px-3 text-[15px] font-semibold text-ink',
      active ? 'border-2 border-brand bg-brand-tint' : 'border border-paper-strong bg-white',
    );
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-[#F1D9A6] bg-[#FFF8EA] p-3">
      <p className="text-[15px] leading-snug">
        You said <strong>{q.typed}</strong>. Did you mean <strong>{q.suggestion}</strong>?
      </p>
      <div className="flex gap-2">
        <button type="button" className={btn(choice === 'suggestion')} aria-pressed={choice === 'suggestion'} onClick={() => onPick('suggestion')}>
          Yes, {q.suggestion}
        </button>
        <button type="button" className={btn(choice === 'typed')} aria-pressed={choice === 'typed'} onClick={() => onPick('typed')}>
          Keep as typed
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Proposal card                                                        */
/* ------------------------------------------------------------------ */

export function ProposalCardView({ eventId, msgId, card, disabled }: { eventId: string; msgId: string; card: ProposalCard; disabled?: boolean }) {
  const event = useEvent(eventId);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const live = card.status === 'pending' && isLive(eventId, card.convId, card.toolUseId);
  const status = card.status === 'pending' && !live ? 'expired' : card.status;

  const sim = useMemo(() => (card.status === 'pending' && event ? previewFor(eventId, card) : null), [event, eventId, card]);
  const preview: PreviewData | undefined = card.preview ?? (sim && sim.ok ? sim.preview : undefined);
  const spelling = sim && sim.ok ? sim.spelling : card.spelling;

  const doUndo = () => {
    setConfirmUndo(false);
    undoProposal(eventId, msgId);
  };

  return (
    <div
      className={clsx('flex flex-col gap-3 rounded-[18px] border-2 bg-white p-4', status === 'pending' ? 'border-brand' : 'border-paper-line')}
      role="group"
      aria-label={card.isNewMeal ? 'New meal from Claude' : 'Change from Claude'}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
        <IconSparkle size={16} />
        <span className="min-w-0 flex-1">{card.summary || 'Suggested change'}</span>
      </div>

      {preview ? (
        <PreviewBody preview={preview} spelling={card.spelling} />
      ) : (
        <p className="text-[15px] text-ink-muted">This change no longer fits the menu. Please ask again.</p>
      )}

      {status === 'pending' && spelling.length > 0 && (
        <div className="flex flex-col gap-2">
          {spelling.map((q) => (
            <SpellingAsk key={q.key} q={q} choice={card.choices[q.key] ?? 'suggestion'} onPick={(c) => setSpellingChoice(eventId, msgId, q.key, c)} />
          ))}
        </div>
      )}

      {status === 'pending' && preview && (
        <div className="flex gap-2">
          <button type="button" disabled={disabled} className={buttonClass('secondary', 'md', 'flex-1')} onClick={() => declineProposal(eventId, msgId)}>
            No, change it
          </button>
          <button type="button" disabled={disabled} className={buttonClass('primary', 'md', 'flex-[1.3]')} onClick={() => confirmProposal(eventId, msgId)}>
            {card.isNewMeal ? 'Yes, add it' : 'Yes, do it'}
          </button>
        </div>
      )}

      {status === 'applied' && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold text-brand" role="status">
            <IconCheck size={18} /> Done. The menu is updated.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass('secondary', 'md', 'flex-1')}
              onClick={() => (card.historyId && undoRevertsLater(eventId, card.historyId) ? setConfirmUndo(true) : doUndo())}
            >
              <IconUndo size={18} /> Undo
            </button>
            <Link to={`../menu${card.dayId ? `?day=${encodeURIComponent(card.dayId)}` : ''}`} className={buttonClass('secondary', 'md', 'flex-1 no-underline')}>
              Show in menu
            </Link>
          </div>
        </div>
      )}
      {status === 'undone' && <p className="text-[15px] font-medium text-ink-muted">Undone. The menu is back as it was.</p>}
      {status === 'declined' && <p className="text-[15px] font-medium text-ink-muted">Not changed. Tell me what to change.</p>}
      {status === 'expired' && <p className="text-[15px] font-medium text-ink-muted">This suggestion has expired. Nothing was changed — ask again if you still want it.</p>}

      <ConfirmDialog
        open={confirmUndo}
        title="Undo this change?"
        message="You made other changes after this one. Undo will also undo those later changes."
        confirmLabel="Undo all"
        danger
        onConfirm={doUndo}
        onCancel={() => setConfirmUndo(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Choice / error / setup                                               */
/* ------------------------------------------------------------------ */

export function ChoiceCardView({ eventId, msgId, card, disabled }: { eventId: string; msgId: string; card: ChoiceCard; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5" role="group" aria-label={card.question}>
      <p className="text-base leading-relaxed">{card.question}</p>
      {card.status === 'answered' ? (
        <p className="flex items-center gap-1.5 text-[15px] font-semibold text-brand">
          <IconCheck size={18} /> {card.picked}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {card.options.map((o, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              className={buttonClass('secondary', 'md', 'w-full justify-start text-left')}
              onClick={() => void pickChoice(eventId, msgId, i)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ErrorCardView({ eventId, msgId, text, card, disabled }: { eventId: string; msgId: string; text: string; card: ErrorCard; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-danger/40 bg-danger-soft p-3" role="alert">
      <p className="flex items-start gap-2 text-base font-medium">
        <IconWarning size={20} className="mt-0.5 shrink-0 text-danger" />
        <span>{text}</span>
      </p>
      {!card.resolved && (
        <div className="flex flex-wrap gap-2">
          {card.retryText && card.errorKind !== 'auth' && (
            <button type="button" disabled={disabled} className={buttonClass('primary', 'md')} onClick={() => void sendMessage(eventId, card.retryText!, { retryOf: msgId })}>
              Try again
            </button>
          )}
          {card.settings && (
            <Link to="/settings" className={buttonClass('secondary', 'md', 'no-underline')}>
              Open Settings
            </Link>
          )}
          {card.retryText && card.errorKind === 'auth' && (
            <button type="button" disabled={disabled} className={buttonClass('secondary', 'md')} onClick={() => void sendMessage(eventId, card.retryText!, { retryOf: msgId })}>
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function SetupCard() {
  return (
    <section aria-labelledby="claude-setup-title" className="flex flex-col gap-3 rounded-[18px] border border-paper-line bg-white p-4">
      <h2 id="claude-setup-title" className="font-display text-lg font-semibold">
        Claude is not set up on this phone yet
      </h2>
      <p className="text-base leading-relaxed text-ink">
        To chat with Claude, a Claude key must be added once on this phone: <strong>Settings → Claude assistant → paste the key</strong>. Ask the person who set up this app if you don&apos;t have one.
      </p>
      <p className="text-[15px] text-ink-muted">You can still change everything by hand in the Menu tab.</p>
      <div className="flex flex-wrap gap-2">
        <Link to="/settings" className={buttonClass('primary', 'md', 'no-underline')}>
          Open Settings
        </Link>
        <Link to="../menu" className={buttonClass('secondary', 'md', 'no-underline')}>
          Go to Menu
        </Link>
      </div>
    </section>
  );
}
