import { PROXY_ENDPOINT, type AIProvider } from '../config/GameConfig';
import { GEMINI_ENDPOINT, buildGeminiBody, geminiText, type InterpretRequest } from './geminiRequest';

/**
 * Sends one interpretation request and returns the model's JSON text.
 * With a pasted key the browser talks to Gemini directly; on the hosted site
 * it goes through /api/interpret, which holds the key. Throws on any failure.
 */
export class TransientError extends Error {}

export async function askModel(provider: AIProvider, req: InterpretRequest, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  // The proxy gives Gemini 9 s itself; leave room for that plus the network.
  const timer = setTimeout(() => ctrl.abort(), provider.name === 'Proxy' ? Math.max(timeoutMs, 12000) : timeoutMs);
  try {
    if (provider.name === 'Proxy') {
      const res = await fetch(PROXY_ENDPOINT, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new TransientError(`proxy HTTP ${res.status}`);
      const data = (await res.json()) as { text?: string };
      return data.text || '{}';
    }
    const res = await fetch(`${GEMINI_ENDPOINT}/${provider.model}:generateContent`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.key },
      body: JSON.stringify(buildGeminiBody(req)),
    });
    if (!res.ok) throw new TransientError(`Gemini HTTP ${res.status} ${await res.text().catch(() => '')}`);
    return geminiText(await res.json());
  } catch (e) {
    if (e instanceof TransientError) throw e;
    throw new TransientError(String(e));
  } finally {
    clearTimeout(timer);
  }
}
