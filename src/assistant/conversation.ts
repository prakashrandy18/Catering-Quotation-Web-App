/**
 * The API conversation (in memory, per event, for this page session) and the turn loop:
 * user turn → Claude → tool calls validated by the executor → cards. Claude never
 * mutates the store; cards wait for the user's tap and their tool_result is sent with
 * the next user turn.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { DISH_LIBRARY } from '@/data/dishLibrary';
import { useAppStore } from '@/store/useAppStore';
import { newId } from '@/lib/id';
import { buildEventSnapshot } from './context';
import { buildRequest, type CreateMessage } from './client';
import { addsMeal, ChoiceSchema, formatZodError, ProposalSchema, type Choice, type Op } from './ops';
import { simulate } from './preview';
import type { NameContext, SpellingChoice, SpellingQuestion } from './spelling';

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type ToolResultParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;
type ToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;

/** Start a fresh API conversation after this many user turns. */
export const MAX_USER_TURNS = 8;
/** At most this many API calls per user turn (tool error → fix → retry). */
export const MAX_ROUNDS = 4;

interface PendingResult {
  content: string;
  is_error?: boolean;
}

interface Conversation {
  id: string;
  model: string;
  endpoint: string;
  /** append-only; assistant turns are stored exactly as returned (thinking blocks included) */
  messages: MessageParam[];
  userTurns: number;
  /** tool_use ids of the last assistant message → result (null = waiting for the user's tap) */
  pending: { order: string[]; results: Record<string, PendingResult | null> } | null;
  /** short notes for Claude added to the next user turn (e.g. "user tapped Undo") */
  notes: string[];
}

const conversations = new Map<string, Conversation>();

export function resetConversation(eventId: string): void {
  conversations.delete(eventId);
}

export function resetAllConversations(): void {
  conversations.clear();
}

/** Is this card's tool call still waiting for the user's decision? */
export function isLive(eventId: string, convId: string, toolUseId: string): boolean {
  const c = conversations.get(eventId);
  return !!c && c.id === convId && !!c.pending && toolUseId in c.pending.results && c.pending.results[toolUseId] === null;
}

/** Record what the user decided; it is sent as the tool_result with the next user turn. */
export function settle(eventId: string, convId: string, toolUseId: string, content: string): void {
  if (!isLive(eventId, convId, toolUseId)) return;
  conversations.get(eventId)!.pending!.results[toolUseId] = { content };
}

export function addNote(eventId: string, note: string): void {
  conversations.get(eventId)?.notes.push(note);
}

export function nameContext(choices: Record<string, SpellingChoice> = {}, pinned?: SpellingQuestion[]): NameContext {
  const s = useAppStore.getState();
  return { library: [...DISH_LIBRARY, ...s.customDishes], memory: s.meta.spellingMemory, choices, pinned };
}

/* ------------------------------------------------------------------ */

export type TurnOutput =
  | { type: 'text'; text: string }
  | { type: 'proposal'; toolUseId: string; summary: string; ops: Op[]; spelling: SpellingQuestion[]; isNewMeal: boolean }
  | { type: 'choice'; toolUseId: string; question: string; options: Choice['options'] };

export interface TurnOutcome {
  convId: string;
  outputs: TurnOutput[];
  /** a new API conversation was started (older cards can no longer be answered) */
  fresh: boolean;
  /** tool_use ids whose results were sent with this turn (their cards are now closed) */
  consumed: string[];
}

export interface TurnOptions {
  model: string;
  /** what credentials are used; a change starts a fresh conversation */
  endpoint: string;
  send: CreateMessage;
  signal?: AbortSignal;
}

const NOT_ANSWERED = 'The user did not answer this and wrote a new message instead. Nothing was changed.';
const NOT_SHOWN =
  'Not shown to the user, because another tool call in the same message had an error. Send all the changes again in one corrected propose_changes call.';

/**
 * One user turn. Works on a copy of the conversation and commits it only when the turn
 * finished, so a failed or cancelled request leaves everything as it was (Try again resends).
 * Throws SDK errors for the caller to map with friendlyError().
 */
export async function runTurn(eventId: string, text: string, opts: TurnOptions): Promise<TurnOutcome> {
  const event = useAppStore.getState().events.find((e) => e.id === eventId);
  if (!event) throw new Error('Event not found');

  const old = conversations.get(eventId);
  const reuse = !!old && old.model === opts.model && old.endpoint === opts.endpoint && old.userTurns < MAX_USER_TURNS;
  const conv: Conversation = reuse
    ? { ...old!, messages: [...old!.messages] }
    : { id: newId('cv'), model: opts.model, endpoint: opts.endpoint, messages: [], userTurns: 0, pending: null, notes: [] };

  const content: ContentBlockParam[] = [];
  const consumed: string[] = [];
  if (reuse && conv.pending) {
    for (const id of conv.pending.order) {
      const r = conv.pending.results[id] ?? { content: NOT_ANSWERED };
      content.push({ type: 'tool_result', tool_use_id: id, content: r.content, ...(r.is_error ? { is_error: true } : {}) });
      consumed.push(id);
    }
  } else if (old?.pending) consumed.push(...old.pending.order);

  const notes = reuse ? conv.notes : [];
  const saved = useAppStore.getState().customDishes;
  const extra = [
    ...notes.map((n) => `Note: ${n}`),
    saved.length ? `SAVED DISHES (also exact spellings): ${saved.map((d) => d.name).join('; ')}` : '',
  ].filter(Boolean);
  content.push({ type: 'text', text: `<event>\n${buildEventSnapshot(event)}\n</event>${extra.length ? '\n' + extra.join('\n') : ''}` });
  content.push({ type: 'text', text });
  const working: MessageParam[] = [...conv.messages, { role: 'user', content }];

  const outputs: TurnOutput[] = [];
  const commit = (pending: Conversation['pending']) => {
    conversations.set(eventId, { ...conv, messages: working, userTurns: conv.userTurns + 1, pending, notes: [] });
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await opts.send(buildRequest(opts.model, working), opts.signal);
    working.push({ role: 'assistant', content: res.content as ContentBlockParam[] });

    if (res.stop_reason === 'refusal') {
      conversations.delete(eventId);
      outputs.push({ type: 'text', text: "Sorry, I can't help with that one. You can still edit the Menu by hand." });
      return { convId: conv.id, outputs, fresh: !reuse, consumed };
    }
    if (res.stop_reason === 'max_tokens') {
      conversations.delete(eventId);
      outputs.push({ type: 'text', text: 'That was too much for one message. Please ask for a few changes at a time.' });
      return { convId: conv.id, outputs, fresh: !reuse, consumed };
    }

    const roundOut: TurnOutput[] = [];
    for (const b of res.content) if (b.type === 'text' && b.text.trim()) roundOut.push({ type: 'text', text: b.text.trim() });

    const uses = res.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (uses.length === 0) {
      outputs.push(...roundOut);
      commit(null);
      return { convId: conv.id, outputs, fresh: !reuse, consumed };
    }

    const results: Record<string, PendingResult | null> = {};
    const cards: TurnOutput[] = [];
    let anyError = false;
    const current = useAppStore.getState().events.find((e) => e.id === eventId) ?? event;
    for (const tu of uses) {
      if (tu.name === 'propose_changes') {
        const parsed = ProposalSchema.safeParse(tu.input);
        if (!parsed.success) {
          results[tu.id] = { content: `Invalid input: ${formatZodError(parsed.error)}`, is_error: true };
          anyError = true;
          continue;
        }
        const sim = simulate(current, parsed.data.operations, nameContext());
        if (!sim.ok) {
          results[tu.id] = { content: `Nothing was shown to the user. Fix these and call propose_changes again:\n${sim.errors.join('\n')}`, is_error: true };
          anyError = true;
          continue;
        }
        results[tu.id] = null;
        cards.push({
          type: 'proposal',
          toolUseId: tu.id,
          summary: parsed.data.summary,
          ops: parsed.data.operations,
          spelling: sim.spelling,
          isNewMeal: addsMeal(parsed.data.operations),
        });
      } else if (tu.name === 'ask_choice') {
        const parsed = ChoiceSchema.safeParse(tu.input);
        if (!parsed.success) {
          results[tu.id] = { content: `Invalid input: ${formatZodError(parsed.error)}`, is_error: true };
          anyError = true;
          continue;
        }
        results[tu.id] = null;
        cards.push({ type: 'choice', toolUseId: tu.id, question: parsed.data.question, options: parsed.data.options });
      } else {
        results[tu.id] = { content: `Unknown tool "${tu.name}". Use propose_changes or ask_choice.`, is_error: true };
        anyError = true;
      }
    }

    const lastRound = round === MAX_ROUNDS - 1;
    if (anyError && !lastRound) {
      // Let Claude fix it before the user sees anything.
      const back: ToolResultParam[] = uses.map((tu) => {
        const r = results[tu.id];
        return r ? { type: 'tool_result', tool_use_id: tu.id, content: r.content, is_error: true } : { type: 'tool_result', tool_use_id: tu.id, content: NOT_SHOWN };
      });
      working.push({ role: 'user', content: back });
      continue;
    }

    outputs.push(...roundOut);
    if (anyError) {
      // Out of retries: show only the valid cards; the error results go with the next turn.
      if (cards.length === 0) outputs.push({ type: 'text', text: 'Sorry, I could not work that out. Please say it another way, or change it on the Menu tab.' });
    }
    outputs.push(...cards);
    commit({ order: uses.map((u) => u.id), results });
    return { convId: conv.id, outputs, fresh: !reuse, consumed };
  }
  // unreachable: the last round always returns
  throw new Error('turn loop ended');
}
