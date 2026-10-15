import { PROXY_ENDPOINT, type AIProvider } from '../config/GameConfig';
import { GEMINI_ENDPOINT, buildGeminiBody, geminiText, type InterpretRequest } from './geminiRequest';

/**
 * Sends one interpretation request and returns the model's JSON text.
 * With a pasted key the browser talks to Gemini directly; on the hosted site
 * it goes through /api/interpret, which holds the key. Throws on any failure.
 */
export async function askModel(provider: AIProvider, req: InterpretRequest, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    if (provider.name === 'Proxy') {
      const res = await fetch(PROXY_ENDPOINT, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`proxy HTTP ${res.status}`);
      const data = (await res.json()) as { text?: string };
      return data.text || '{}';
    }
    const res = await fetch(`${GEMINI_ENDPOINT}/${provider.model}:generateContent`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': provider.key },
      body: JSON.stringify(buildGeminiBody(req)),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status} ${await res.text().catch(() => '')}`);
    return geminiText(await res.json());
  } finally {
    clearTimeout(timer);
  }
}
