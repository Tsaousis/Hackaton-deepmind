// Global tuning + palette.

export const DEBUG_MODE = false;

export const TILE = 56;

export const COLORS = {
  bg: 0x101d27,
  floor: 0x253740,
  floorAlt: 0x293c45,
  wall: 0x172a34,
  wallTop: 0x4b6064,
  red: 0xde6256,
  redDark: 0xa8323a,
  blue: 0x3e7bfa,
  exit: 0x8fcbb3,
  plate: 0xe0b94f,
  plateDown: 0x9c7f2e,
  door: 0x8b5cf6,
  key: 0xd6b575,
  player: 0xf0e6cd,
  guard: 0xff8c42,
  hidden: 0x8f8aa3,
  heal: 0x7dffb3,
  ice: 0x9fdcff,
};

// ---------- AI word interpreter ----------
// Three ways to reach Gemini, in order of preference:
//  1. a key the player pasted on the title screen (kept in this browser's localStorage);
//  2. VITE_GEMINI_API_KEY from .env.local, read ONLY in dev so it is never baked into a build;
//  3. the hosted proxy (api/interpret.ts), which holds the site's key on the server.
export const PROXY_ENDPOINT = '/api/interpret';
export const GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) || 'gemini-3.8-flash';

const KEY_STORE = 'oneword_gemini_key';
export function geminiKey(): string {
  let stored = '';
  try { stored = localStorage.getItem(KEY_STORE) ?? ''; } catch { /* storage blocked */ }
  return stored || (import.meta.env.DEV ? (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) : undefined) || '';
}

let proxyAvailable = false;
/** Asks the server once whether /api/interpret exists; false on a plain static host. */
export async function detectProxy(timeoutMs = 2000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(PROXY_ENDPOINT, { method: 'GET', signal: ctrl.signal });
    proxyAvailable = res.ok && (await res.json().catch(() => null))?.ok === true;
  } catch {
    proxyAvailable = false;
  } finally {
    clearTimeout(timer);
  }
  return proxyAvailable;
}

/** Creative mode: verb slots accept any word the model can turn into a mechanic. */
export function creativeMode(): boolean {
  try { return localStorage.getItem('oneword_creative') === '1'; } catch { return false; }
}
export function setCreativeMode(on: boolean) {
  try { localStorage.setItem('oneword_creative', on ? '1' : '0'); } catch { /* storage blocked */ }
}

export type AIProvider = { name: 'Gemini' | 'Proxy'; key: string; model: string };
export function aiProvider(): AIProvider | null {
  const g = geminiKey();
  if (g) return { name: 'Gemini', key: g, model: GEMINI_MODEL };
  if (proxyAvailable) return { name: 'Proxy', key: '', model: GEMINI_MODEL };
  return null;
}
/** Store a pasted Gemini key. Empty clears it. */
export function setAIKey(key: string) {
  try {
    if (!key) localStorage.removeItem(KEY_STORE);
    else localStorage.setItem(KEY_STORE, key);
  } catch { /* storage blocked */ }
}
