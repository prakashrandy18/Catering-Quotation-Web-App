/**
 * What the chat UI calls: send a message, cancel, and the card buttons
 * (Yes / No / spelling / choice / Undo). The only place that changes the event
 * on Claude's behalf — always after the user's tap, always as ONE history entry.
 */
import { create } from 'zustand';
import { useAppStore } from '@/store/useAppStore';
import { toast } from '@/store/toast';
import { DISH_LIBRARY } from '@/data/dishLibrary';
import type { AssistantSettings } from '@/types';
import { friendlyError, hasCredentials, messageSender, type CreateMessage } from './client';
import { addNote, isLive, nameContext, resetConversation, runTurn, settle } from './conversation';
import { applyOps } from './ops';
import { describeChange, simulate } from './preview';
import type { AssistantMessage, ChatCard, ChoiceCard, ProposalCard } from './chatTypes';
import type { SpellingChoice } from './spelling';

/* ------------------------------------------------------------------ */
/* Runtime (not persisted): who is waiting for Claude                    */
/* ------------------------------------------------------------------ */

interface RuntimeState {
  busy: Record<string, boolean>;
  setBusy: (eventId: string, busy: boolean) => void;
}
export const useChatRuntime = create<RuntimeState>((set) => ({
  busy: {},
  setBusy: (eventId, busy) => set((s) => ({ busy: { ...s.busy, [eventId]: busy } })),
}));

const controllers = new Map<string, AbortController>();

/** Tests can swap the network layer. */
let senderFactory: (s: AssistantSettings) => CreateMessage = messageSender;
export function setSenderFactory(f: ((s: AssistantSettings) => CreateMessage) | null): void {
  senderFactory = f ?? messageSender;
}

/* ------------------------------------------------------------------ */
/* Chat message helpers                                                 */
/* ------------------------------------------------------------------ */

export function chatMessages(eventId: string): AssistantMessage[] {
  return (useAppStore.getState().chats[eventId] ?? []) as AssistantMessage[];
}

function addMessage(eventId: string, msg: Omit<AssistantMessage, 'id' | 'at'>): string {
  const input: Omit<AssistantMessage, 'id' | 'at'> = msg;
  return useAppStore.getState().addChatMessage(eventId, input);
}

function patchCard<T extends ChatCard>(eventId: string, msgId: string, patch: Partial<T>, extra?: Partial<AssistantMessage>): void {
  const msg = chatMessages(eventId).find((m) => m.id === msgId);
  if (!msg?.card) return;
  const next: Partial<AssistantMessage> = { ...extra, card: { ...msg.card, ...patch } as ChatCard };
  useAppStore.getState().updateChatMessage(eventId, msgId, next);
}

function findCard<K extends ChatCard['kind']>(eventId: string, msgId: string, kind: K): Extract<ChatCard, { kind: K }> | null {
  const card = chatMessages(eventId).find((m) => m.id === msgId)?.card;
  return card && card.kind === kind ? (card as Extract<ChatCard, { kind: K }>) : null;
}

/** Cards from an answered / ended tool call can no longer be used. */
function closeCards(eventId: string, toolUseIds: string[] | 'all'): void {
  for (const m of chatMessages(eventId)) {
    const c = m.card;
    if (!c || (c.kind !== 'proposal' && c.kind !== 'choice') || c.status !== 'pending') continue;
    if (toolUseIds !== 'all' && !toolUseIds.includes(c.toolUseId)) continue;
    patchCard(eventId, m.id, { status: 'expired' });
  }
}

/* ------------------------------------------------------------------ */
/* Sending                                                              */
/* ------------------------------------------------------------------ */

export type SendResult = 'sent' | 'offline' | 'no-key' | 'busy' | 'empty' | 'failed';

export async function sendMessage(eventId: string, rawText: string, opts: { retryOf?: string } = {}): Promise<SendResult> {
  const text = rawText.trim();
  if (!text) return 'empty';
  const settings = useAppStore.getState().assistant;
  if (!hasCredentials(settings)) return 'no-key';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  const runtime = useChatRuntime.getState();
  if (runtime.busy[eventId]) return 'busy';

  if (opts.retryOf) patchCard(eventId, opts.retryOf, { resolved: true });
  else addMessage(eventId, { role: 'user', text });

  const controller = new AbortController();
  controllers.set(eventId, controller);
  runtime.setBusy(eventId, true);
  try {
    const outcome = await runTurn(eventId, text, {
      model: settings.model || 'claude-sonnet-5-5',
      endpoint: settings.proxyUrl.trim() ? `proxy:${settings.proxyUrl.trim()}` : 'key',
      send: senderFactory(settings),
      signal: controller.signal,
    });
    closeCards(eventId, outcome.fresh ? 'all' : outcome.consumed);
    for (const o of outcome.outputs) {
      if (o.type === 'text') addMessage(eventId, { role: 'assistant', text: o.text });
      else if (o.type === 'proposal') {
        const card: ProposalCard = {
          kind: 'proposal',
          convId: outcome.convId,
          toolUseId: o.toolUseId,
          status: 'pending',
          summary: o.summary,
          ops: o.ops,
          spelling: o.spelling,
          choices: {},
          isNewMeal: o.isNewMeal,
        };
        addMessage(eventId, { role: 'assistant', text: o.summary, card });
      } else {
        const card: ChoiceCard = { kind: 'choice', convId: outcome.convId, toolUseId: o.toolUseId, status: 'pending', question: o.question, options: o.options };
        addMessage(eventId, { role: 'assistant', text: o.question, card });
      }
    }
    return 'sent';
  } catch (err) {
    const fe = friendlyError(err);
    if (fe.reset) resetConversation(eventId);
    addMessage(eventId, {
      role: 'assistant',
      text: fe.message,
      card: { kind: 'error', errorKind: fe.kind, retryText: text, settings: fe.settings },
    });
    return 'failed';
  } finally {
    controllers.delete(eventId);
    useChatRuntime.getState().setBusy(eventId, false);
  }
}

export function cancelRequest(eventId: string): void {
  controllers.get(eventId)?.abort();
}

export function startNewChat(eventId: string): void {
  cancelRequest(eventId);
  resetConversation(eventId);
  useAppStore.getState().clearChat(eventId);
}

/* ------------------------------------------------------------------ */
/* Card buttons                                                         */
/* ------------------------------------------------------------------ */

/** The live preview of a pending card (recomputed from the current menu + spelling choices). */
export function previewFor(eventId: string, card: ProposalCard) {
  const event = useAppStore.getState().events.find((e) => e.id === eventId);
  if (!event) return null;
  return simulate(event, card.ops, nameContext(card.choices, card.spelling));
}

export function setSpellingChoice(eventId: string, msgId: string, questionKey: string, choice: SpellingChoice): void {
  const card = findCard(eventId, msgId, 'proposal');
  if (!card) return;
  const q = card.spelling.find((x) => x.key === questionKey);
  if (!q) return;
  patchCard<ProposalCard>(eventId, msgId, { choices: { ...card.choices, [questionKey]: choice } });
  const store = useAppStore.getState();
  store.rememberSpelling(q.key, choice === 'typed' ? q.typed : q.suggestion);
  if (choice === 'typed') {
    const known = [...DISH_LIBRARY, ...store.customDishes].some((d) => d.name.toLowerCase() === q.typed.toLowerCase());
    if (!known) store.addCustomDish({ name: q.typed, category: 'Others' });
  }
}

export function confirmProposal(eventId: string, msgId: string): boolean {
  const card = findCard(eventId, msgId, 'proposal');
  const store = useAppStore.getState();
  const before = store.events.find((e) => e.id === eventId);
  if (!card || card.status !== 'pending' || !before) return false;
  if (!isLive(eventId, card.convId, card.toolUseId)) {
    patchCard<ProposalCard>(eventId, msgId, { status: 'expired' });
    return false;
  }
  const names = nameContext(card.choices, card.spelling);
  const sim = simulate(before, card.ops, names);
  if (!sim.ok) {
    toast({ text: 'The menu changed since Claude suggested this. Please ask again.', tone: 'warning' });
    settle(eventId, card.convId, card.toolUseId, `The user tapped "Yes", but it could not be applied because the menu had changed: ${sim.errors.join(' ')} Nothing was changed.`);
    patchCard<ProposalCard>(eventId, msgId, { status: 'expired' });
    return false;
  }
  const historyId = store.transact(eventId, { by: 'claude', summary: sim.preview.summary, detail: sim.preview.detail }, (d) => {
    const r = applyOps(d, card.ops, names);
    if (r.errors.length) throw new Error(r.errors.join('; '));
  });
  const after = useAppStore.getState().events.find((e) => e.id === eventId);
  if (!historyId || !after) return false;
  const preview = describeChange(before, after);
  const changes = preview.sections.flatMap((s) => [
    ...s.removed.map((t) => ({ sign: '-' as const, text: t, where: s.title })),
    ...s.added.map((t) => ({ sign: '+' as const, text: t, where: s.title })),
    ...s.changes.map((t) => ({ sign: '~' as const, text: t, where: s.title })),
  ]);
  settle(eventId, card.convId, card.toolUseId, `The user tapped "Yes" and it was applied as one change: ${preview.summary}. ${preview.detail}. ${preview.totalLine}.`);
  patchCard<ProposalCard>(eventId, msgId, { status: 'applied', historyId, preview, dayId: preview.dayId }, { historyId, changes });
  return true;
}

export function declineProposal(eventId: string, msgId: string): void {
  const card = findCard(eventId, msgId, 'proposal');
  if (!card || card.status !== 'pending') return;
  const sim = previewFor(eventId, card);
  settle(eventId, card.convId, card.toolUseId, 'The user tapped "No, change it". Nothing was changed. Wait for what they say next.');
  patchCard<ProposalCard>(eventId, msgId, { status: 'declined', preview: sim && sim.ok ? sim.preview : undefined });
}

/** True when undoing this entry would also undo later changes (the UI warns first). */
export function undoRevertsLater(eventId: string, historyId: string): boolean {
  const latest = useAppStore.getState().history.find((h) => h.eventId === eventId);
  return !!latest && latest.id !== historyId;
}

export function undoProposal(eventId: string, msgId: string): boolean {
  const card = findCard(eventId, msgId, 'proposal');
  if (!card || card.status !== 'applied' || !card.historyId) return false;
  const undone = useAppStore.getState().undo(card.historyId);
  if (!undone) return false;
  addNote(eventId, `The user tapped Undo on "${card.preview?.summary ?? card.summary}"; that change was reverted.`);
  patchCard<ProposalCard>(eventId, msgId, { status: 'undone' });
  return true;
}

export async function pickChoice(eventId: string, msgId: string, index: number): Promise<SendResult> {
  const card = findCard(eventId, msgId, 'choice');
  const option = card?.options[index];
  if (!card || !option) return 'failed';
  settle(eventId, card.convId, card.toolUseId, `The user picked "${option.label}" (value: ${option.value}).`);
  patchCard<ChoiceCard>(eventId, msgId, { status: 'answered', picked: option.label });
  return sendMessage(eventId, option.label);
}
