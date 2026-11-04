/**
 * Optional Vercel proxy for the in-app Claude assistant (see docs/CLAUDE_ASSISTANT.md).
 *
 * The app's Anthropic SDK posts to `{proxyUrl}/v1/messages`; vercel.json rewrites
 * `/api/claude/*` here. This function adds the server's key (ANTHROPIC_API_KEY) so no key
 * is stored on the phone, and limits what can be sent:
 *   - only browsers from ALLOWED_ORIGIN (comma-separated) or, when unset, this same site
 *   - only the app's model ids, max_tokens clamped, only custom (client) tools
 * Not part of the Vite app build (tsconfig.node.json only).
 */
export const config = { runtime: 'edge' };

const UPSTREAM = 'https://api.anthropic.com/v1/messages';
const DEFAULT_VERSION = '2026-10-21';
const MODELS = new Set(['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5']);
const BETAS = new Set(['server-side-fallback-2026-07-01']);
const MAX_TOKENS = 4096;
const MAX_BODY_BYTES = 400_000;
const FIELDS = ['model', 'max_tokens', 'system', 'messages', 'tools', 'tool_choice', 'output_config', 'cache_control', 'thinking', 'fallbacks', 'metadata'];

type Json = Record<string, unknown>;

function originAllowed(req: Request): string | false {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  const list = (process.env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (list.length) return list.includes('*') || list.includes(origin) ? origin : false;
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host;
    return new URL(origin).host === host ? origin : false;
  } catch {
    return false;
  }
}

function cors(origin: string | false): Record<string, string> {
  if (!origin) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function apiError(status: number, type: string, message: string, origin: string | false): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin) },
  });
}

export default async function handler(req: Request): Promise<Response> {
  const origin = originAllowed(req);

  if (req.method === 'OPTIONS') return new Response(null, { status: origin ? 204 : 403, headers: cors(origin) });
  if (req.method === 'GET') return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', ...cors(origin) } });
  if (req.method !== 'POST') return apiError(405, 'invalid_request_error', 'Use POST.', origin);

  if (!origin) return apiError(403, 'permission_error', 'This site is not allowed to use the proxy (check ALLOWED_ORIGIN).', false);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return apiError(500, 'api_error', 'The proxy has no ANTHROPIC_API_KEY set.', origin);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return apiError(413, 'request_too_large', 'Request is too large.', origin);
  let body: Json;
  try {
    body = JSON.parse(raw) as Json;
  } catch {
    return apiError(400, 'invalid_request_error', 'Body must be JSON.', origin);
  }
  if (typeof body.model !== 'string' || !MODELS.has(body.model)) return apiError(400, 'invalid_request_error', 'This model is not allowed by the proxy.', origin);
  if (Array.isArray(body.tools) && body.tools.some((t) => !!t && typeof t === 'object' && 'type' in t && (t as Json).type !== 'custom')) {
    return apiError(400, 'invalid_request_error', 'Only the app\'s own tools are allowed by the proxy.', origin);
  }

  const clean: Json = {};
  for (const f of FIELDS) if (body[f] !== undefined) clean[f] = body[f];
  const asked = Number(body.max_tokens);
  clean.max_tokens = Math.max(1, Math.min(Number.isFinite(asked) ? Math.floor(asked) : 1024, MAX_TOKENS));

  const version = req.headers.get('anthropic-version');
  const betas = (req.headers.get('anthropic-beta') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((b) => BETAS.has(b));
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': version && /^\d{4}-\d{2}-\d{2}$/.test(version) ? version : DEFAULT_VERSION,
  };
  if (betas.length) headers['anthropic-beta'] = betas.join(',');
  if (!betas.includes('server-side-fallback-2026-07-01')) delete clean.fallbacks;

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM, { method: 'POST', headers, body: JSON.stringify(clean) });
  } catch {
    return apiError(502, 'api_error', 'Could not reach Anthropic.', origin);
  }
  const out: Record<string, string> = { 'content-type': upstream.headers.get('content-type') ?? 'application/json', ...cors(origin) };
  for (const h of ['request-id', 'retry-after']) {
    const v = upstream.headers.get(h);
    if (v) out[h] = v;
  }
  return new Response(await upstream.text(), { status: upstream.status, headers: out });
}
