// Vercel serverless function: the hosted game's door to Gemini.
// The browser never sees the key (GEMINI_API_KEY, a Vercel env var); the
// prompts are built server-side from a small validated request, and each
// IP and the whole site are rate-limited. Best-effort limits (per warm
// instance), enough to keep a hobby bill bounded.

import { DEFAULT_GEMINI_MODEL, GEMINI_ENDPOINT, buildGeminiBody, geminiText, validRequest, type InterpretRequest } from '../src/rules/geminiRequest';

const PER_MINUTE = Number(process.env.RATE_PER_MINUTE ?? 20);
const PER_DAY = Number(process.env.RATE_PER_DAY ?? 3000);

const minute = new Map<string, { n: number; at: number }>();
let day = { n: 0, at: 0 };

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
}

function limited(ip: string): boolean {
  const now = Date.now();
  if (now - day.at > 86_400_000) day = { n: 0, at: now };
  if (++day.n > PER_DAY) return true;
  const m = minute.get(ip);
  if (!m || now - m.at > 60_000) { minute.set(ip, { n: 1, at: now }); return false; }
  if (minute.size > 5000) minute.clear();
  return ++m.n > PER_MINUTE;
}

export default async function handler(req: Request): Promise<Response> {
  const key = process.env.GEMINI_API_KEY;
  if (req.method === 'GET') return json({ ok: !!key });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!key) return json({ error: 'no key configured' }, 503);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (limited(ip)) return json({ error: 'rate limited' }, 429, { 'Retry-After': '60' });

  let body: InterpretRequest;
  try { body = (await req.json()) as InterpretRequest; } catch { return json({ error: 'invalid JSON' }, 400); }
  if (!validRequest(body)) return json({ error: 'invalid request' }, 400);

  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(buildGeminiBody(body)),
    });
    if (!res.ok) {
      console.warn('Gemini HTTP', res.status, await res.text().catch(() => ''));
      return json({ error: 'upstream error' }, 502);
    }
    return json({ text: geminiText(await res.json()) });
  } catch (e) {
    console.warn('Gemini request failed', e);
    return json({ error: 'upstream timeout' }, 504);
  } finally {
    clearTimeout(timer);
  }
}
