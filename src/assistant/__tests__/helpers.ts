import { vi } from 'vitest';
import { useAppStore } from '@/store/useAppStore';
import type { CateringEvent, Session } from '@/types';
import { resetAllConversations } from '../conversation';

export function resetStore(apiKey = 'sk-ant-test'): CateringEvent {
  localStorage.clear();
  useAppStore.getState().resetToSample();
  useAppStore.getState().updateAssistant({ apiKey, model: 'claude-sonnet-5-5', proxyUrl: '' });
  resetAllConversations();
  return useAppStore.getState().events[0];
}

export function currentEvent(): CateringEvent {
  return useAppStore.getState().events[0];
}

export function meal(e: CateringEvent, name: string): Session {
  const s = e.days.flatMap((d) => d.sessions).find((x) => x.name === name);
  if (!s) throw new Error(`no meal ${name}`);
  return s;
}

export function apiMessage(content: unknown[], stop_reason = 'tool_use') {
  return {
    id: 'msg_' + Math.random().toString(36).slice(2),
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'request-id': 'req_test' } });
}

/** Stub global fetch with queued responses; returns the mock (calls hold the request bodies). */
export function mockFetch(...responses: (() => Response)[]) {
  const queue = [...responses];
  const fn = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    void _input;
    void _init;
    const next = queue.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Parsed JSON body of the n-th fetch call. */
export function requestBody(fn: ReturnType<typeof mockFetch>, n: number): Record<string, unknown> {
  const init = fn.mock.calls[n]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body ?? '{}'));
}
