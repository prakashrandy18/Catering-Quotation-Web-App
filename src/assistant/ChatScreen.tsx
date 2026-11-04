import clsx from 'clsx';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import type { EventOutletContext } from '@/components/EventLayout';
import { buttonClass } from '@/components/ui/Button';
import { IconMic, IconSend, IconStop } from '@/components/ui/icons';
import { hasCredentials } from './client';
import { cancelRequest, sendMessage, startNewChat, useChatRuntime } from './actions';
import { ChoiceCardView, ErrorCardView, ProposalCardView, SetupCard } from './cards';
import { useSpeech } from './speech';
import type { AssistantMessage } from './chatTypes';

const EMPTY: AssistantMessage[] = [];

const STARTERS: { label: string; text: string }[] = [
  { label: 'Remove a dish', text: 'Remove ' },
  { label: 'Add a dish', text: 'Add ' },
  { label: 'Change people', text: 'Change people for ' },
  { label: 'Change price', text: 'Change price per plate for ' },
  { label: '+ New meal', text: 'New meal on Day 1: ' },
];

const EXAMPLES = [
  'Viratha tiffin la vada curry remove pannu, poori masala kilangu add pannu',
  'Brunch 120 per aakku, ₹260 ilaikku',
  'Muhurtham lunch ku aprom puthu meal: Vilayadal snacks, 3.30pm, 200 per',
];

function isTouch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

export default function ChatScreen() {
  const { event } = useOutletContext<EventOutletContext>();
  const eventId = event.id;
  const messages = useAppStore((s) => (s.chats[eventId] as AssistantMessage[] | undefined) ?? EMPTY);
  const settings = useAppStore((s) => s.assistant);
  const busy = useChatRuntime((s) => !!s.busy[eventId]);
  const ready = hasCredentials(settings);

  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(() => params.get('draft') ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const speechBase = useRef('');

  // ?draft= pre-fills the box once (from "Change by talking" links); drop it from the URL afterwards.
  useEffect(() => {
    if (params.has('draft')) {
      const next = new URLSearchParams(params);
      next.delete('draft');
      setParams(next, { replace: true });
    }
  }, []);

  const speech = useSpeech(settings.voiceLang, (spoken) => {
    const base = speechBase.current;
    setText(base ? `${base} ${spoken}` : spoken);
  });

  // auto-grow the message box
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [text]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, busy]);

  const send = async (value = text) => {
    const t = value.trim();
    if (!t || busy) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setNotice('No internet. You can still edit the Menu.');
      return;
    }
    setNotice(null);
    if (speech.listening) speech.stop();
    setText('');
    const r = await sendMessage(eventId, t);
    if (r === 'offline' || r === 'no-key' || r === 'busy') {
      setText(t);
      if (r === 'offline') setNotice('No internet. You can still edit the Menu.');
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    if (isTouch()) return; // phone keyboards: Enter = new line, tap Send to send
    e.preventDefault();
    void send();
  };

  const fill = (starter: string) => {
    setText((cur) => (cur.trim() ? `${cur.trim()} ${starter}` : starter));
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  const toggleMic = () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    speechBase.current = text.trim();
    speech.start();
  };

  const micTip =
    speech.status === 'unsupported'
      ? 'Voice typing is not available in this browser. Use the mic key on your keyboard.'
      : speech.status === 'denied'
        ? 'The microphone is blocked. Allow it in the browser, or use the mic key on your keyboard.'
        : speech.status === 'no-speech'
          ? 'I did not hear anything. Tap Speak and try again.'
          : speech.status === 'error'
            ? 'Voice typing stopped. Try again, or use the mic key on your keyboard.'
            : null;

  return (
    <div className="flex min-h-[calc(100dvh-61px-80px-env(safe-area-inset-bottom))] flex-col md:min-h-[calc(100dvh-61px-24px)]">
      <div className="flex items-center gap-2 px-4 pt-3">
        <h1 className="flex-1 font-display text-lg font-semibold">Ask Claude</h1>
        {messages.length > 0 && (
          <button type="button" className={buttonClass('ghost', 'md', 'min-h-[44px] px-3 text-[15px]')} onClick={() => startNewChat(eventId)} disabled={busy}>
            Start a new chat
          </button>
        )}
      </div>

      <div role="log" aria-live="polite" aria-label="Chat with Claude" className="flex flex-1 flex-col gap-4 px-4 py-4">
        {!ready && <SetupCard />}

        {ready && (
          <div className="max-w-[92%] text-base leading-relaxed">
            Vanakkam! Tell me what to change — in English or Tamil. You can also tap the mic and speak. I will show you the change first; nothing changes until you tap <strong>Yes</strong>.
          </div>
        )}

        {ready && messages.length === 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[15px] font-semibold text-ink-muted">Try saying:</p>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="min-h-[48px] rounded-2xl border border-paper-strong bg-white px-4 py-2 text-left text-[15px] leading-snug hover:bg-paper-sunk" onClick={() => fill(ex)}>
                “{ex}”
              </button>
            ))}
          </div>
        )}

        {messages.map((m) => (
          <MessageView key={m.id} eventId={eventId} m={m} busy={busy} />
        ))}

        {busy && (
          <div className="flex items-center gap-3" role="status">
            <span className="flex items-center gap-1.5 text-base text-ink-muted">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-brand" aria-hidden="true" />
              Thinking…
            </span>
            <button type="button" className={buttonClass('secondary', 'md', 'min-h-[44px] px-4')} onClick={() => cancelRequest(eventId)}>
              <IconStop size={16} /> Cancel
            </button>
          </div>
        )}
        {/* keeps the newest message clear of the sticky message box and the tab bar */}
        <div ref={endRef} className="scroll-mb-[230px] md:scroll-mb-[170px]" />
      </div>

      {ready && (
        <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 border-t border-paper-line bg-paper/95 px-3 pb-3 pt-2 backdrop-blur md:bottom-0">
          <div className="-mx-3 mb-2 flex gap-2 overflow-x-auto px-3 pb-1" aria-label="Quick actions" role="group">
            {STARTERS.map((s) => (
              <button
                key={s.label}
                type="button"
                className="min-h-[44px] shrink-0 whitespace-nowrap rounded-full border border-paper-strong bg-white px-4 text-[15px] font-medium hover:bg-paper-sunk"
                onClick={() => fill(s.text)}
              >
                {s.label}
              </button>
            ))}
            <Link to="../pdf?v=client" className="flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border border-paper-strong bg-white px-4 text-[15px] font-medium no-underline hover:bg-paper-sunk">
              Client PDF
            </Link>
            <Link to="../pdf?v=chef" className="flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border border-paper-strong bg-white px-4 text-[15px] font-medium no-underline hover:bg-paper-sunk">
              Chef PDF
            </Link>
          </div>

          {notice && (
            <p role="status" className="mb-2 rounded-xl bg-warn-soft px-3 py-2 text-[15px] font-medium text-warn">
              {notice}{' '}
              <Link to="../menu" className="font-semibold text-warn underline">
                Open Menu
              </Link>
            </p>
          )}
          {micTip && (
            <p role="status" className="mb-2 text-[15px] text-ink-muted">
              {micTip}
            </p>
          )}

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <button
              type="button"
              onClick={toggleMic}
              aria-label={speech.listening ? 'Stop listening' : 'Speak'}
              aria-pressed={speech.listening}
              className={clsx(
                'flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border',
                speech.listening ? 'animate-pulse border-brand bg-brand text-white' : 'border-paper-strong bg-white text-ink hover:bg-paper-sunk',
              )}
            >
              {speech.listening ? <IconStop /> : <IconMic />}
            </button>
            <label htmlFor="chat-input" className="sr-only-text">
              Message Claude
            </label>
            <textarea
              id="chat-input"
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={speech.listening ? 'Listening… speak now' : 'Message Claude'}
              enterKeyHint="enter"
              autoComplete="off"
              className="block max-h-[180px] min-h-[52px] flex-1 resize-none rounded-2xl border border-paper-strong bg-white px-4 py-3 text-base leading-snug text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <button type="submit" disabled={!text.trim() || busy} className={buttonClass('primary', 'md', 'h-[52px] shrink-0 px-4')}>
              <IconSend size={18} /> Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MessageView({ eventId, m, busy }: { eventId: string; m: AssistantMessage; busy: boolean }) {
  if (m.role === 'user') {
    return (
      <div className="max-w-[85%] self-end whitespace-pre-wrap break-words rounded-[18px] rounded-br-[4px] bg-brand px-4 py-3 text-base leading-snug text-white">
        {m.text}
      </div>
    );
  }
  const card = m.card;
  if (card?.kind === 'proposal') return <ProposalCardView eventId={eventId} msgId={m.id} card={card} disabled={busy} />;
  if (card?.kind === 'choice') return <ChoiceCardView eventId={eventId} msgId={m.id} card={card} disabled={busy} />;
  if (card?.kind === 'error') return <ErrorCardView eventId={eventId} msgId={m.id} text={m.text} card={card} disabled={busy} />;
  return <div className="max-w-[92%] whitespace-pre-wrap break-words text-base leading-relaxed">{m.text}</div>;
}
