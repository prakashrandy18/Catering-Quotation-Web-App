/**
 * Claude API client for the browser (key saved on this phone) or through the optional
 * proxy (`assistant.proxyUrl`, key kept on the server). Also maps SDK errors to the
 * short messages shown in the chat.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AssistantSettings } from '@/types';
import { SYSTEM_PROMPT } from './prompt';
import { TOOLS } from './tools';

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type ApiMessage = Anthropic.Beta.Messages.BetaMessage;

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Exact model ids (see docs/CLAUDE_ASSISTANT.md). */
export const MODEL_OPTIONS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet — recommended' },
  { id: 'claude-haiku-5-5', label: 'Haiku — cheaper and faster' },
  { id: 'claude-opus-5-5', label: 'Opus — most capable' },
] as const;

export const REQUEST_TIMEOUT_MS = 30_000;
export const MAX_TOKENS = 4096;

export function hasCredentials(s: Pick<AssistantSettings, 'apiKey' | 'proxyUrl'>): boolean {
  return !!(s.apiKey.trim() || s.proxyUrl.trim());
}

/** "/api/claude" → "https://this-site/api/claude" (the SDK then posts to …/v1/messages). */
export function resolveProxyUrl(proxyUrl: string): string {
  const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
  return new URL(proxyUrl.trim(), base).href.replace(/\/+$/, '');
}

export function makeClient(s: AssistantSettings): Anthropic {
  const proxy = s.proxyUrl.trim();
  return new Anthropic({
    // With a proxy the server adds the real key; the SDK still needs some value.
    apiKey: proxy ? 'proxy' : s.apiKey.trim(),
    baseURL: proxy ? resolveProxyUrl(proxy) : undefined,
    dangerouslyAllowBrowser: true,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 1,
    // Resolve fetch at call time so tests / the service worker see the current global.
    fetch: (input, init) => globalThis.fetch(input, init),
  });
}

/** Effort is supported on the current model families; skip it for anything unknown. */
function supportsEffort(model: string): boolean {
  return /claude-(opus|sonnet|haiku)-5|claude-fable/.test(model);
}

/** Server-side refusal fallback ("default" routing) — Claude API, Sonnet 5.5 / Opus 5.5 only. */
function supportsFallback(model: string): boolean {
  return model === 'claude-sonnet-5-5' || model === 'claude-opus-5-5';
}

export function buildRequest(model: string, messages: MessageParam[]): CreateParams {
  const params: CreateParams = {
    model,
    max_tokens: MAX_TOKENS,
    // Static system prompt + tools are cached; the conversation prefix is cached by the top-level breakpoint.
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    tools: TOOLS,
    tool_choice: { type: 'auto' },
    cache_control: { type: 'ephemeral' },
    messages,
  };
  // Thinking is left at the model default (adaptive); low effort keeps chat replies quick and cheap.
  if (supportsEffort(model)) params.output_config = { effort: 'low' };
  if (supportsFallback(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  return params;
}

export type CreateMessage = (params: CreateParams, signal?: AbortSignal) => Promise<ApiMessage>;

export function messageSender(s: AssistantSettings): CreateMessage {
  const client = makeClient(s);
  return (params, signal) => client.beta.messages.create(params, { signal, timeout: REQUEST_TIMEOUT_MS });
}

/* ------------------------------------------------------------------ */
/* Errors                                                               */
/* ------------------------------------------------------------------ */

export type ErrorKind = 'cancelled' | 'auth' | 'busy' | 'timeout' | 'network' | 'model' | 'bad-request' | 'unknown';

export interface FriendlyError {
  kind: ErrorKind;
  message: string;
  /** show a link to Settings */
  settings?: boolean;
  /** the API conversation should start fresh */
  reset?: boolean;
}

/** Most specific first (APIConnectionError extends APIError in the TS SDK). */
export function friendlyError(err: unknown): FriendlyError {
  if (err instanceof Anthropic.APIUserAbortError || (err instanceof Error && err.name === 'AbortError')) {
    return { kind: 'cancelled', message: 'Stopped. Nothing was changed.' };
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { kind: 'auth', message: 'The Claude key was not accepted — check Settings.', settings: true };
  }
  if (err instanceof Anthropic.RateLimitError) return { kind: 'busy', message: 'Claude is busy, try again in a minute.' };
  if (err instanceof Anthropic.NotFoundError) {
    return { kind: 'model', message: 'This Claude model is not available. Pick another model in Settings.', settings: true, reset: true };
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.warn('Claude request rejected', err.requestID ?? '', err.message);
    return { kind: 'bad-request', message: 'Claude could not read that request. Please try again.', reset: true };
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { kind: 'timeout', message: 'Claude took too long to answer.' };
  if (err instanceof Anthropic.APIConnectionError) return { kind: 'network', message: 'Could not reach Claude. Check the internet and try again.' };
  if (err instanceof Anthropic.InternalServerError || (err instanceof Anthropic.APIError && err.status === 529)) {
    return { kind: 'busy', message: 'Claude is busy, try again in a minute.' };
  }
  if (err instanceof Anthropic.APIError) return { kind: 'unknown', message: 'Something went wrong talking to Claude. Please try again.' };
  console.warn('Claude assistant error', err);
  return { kind: 'unknown', message: 'Something went wrong. Please try again.' };
}

/** Tiny request for the Settings "Test connection" button. */
export async function testConnection(s: AssistantSettings): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!hasCredentials(s)) return { ok: false, message: 'Add a Claude key first.' };
  try {
    const res = await makeClient(s).messages.create({
      model: s.model || DEFAULT_MODEL,
      max_tokens: 64,
      messages: [{ role: 'user', content: 'Reply with the word OK.' }],
      ...(supportsEffort(s.model) ? { output_config: { effort: 'low' as const } } : {}),
    });
    void res;
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyError(err).message };
  }
}
