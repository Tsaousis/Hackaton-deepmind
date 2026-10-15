// Builds the Gemini `generateContent` bodies for both interpreters. Shared by
// the browser (when the player pasted their own key) and by api/interpret.ts
// (the hosted proxy that holds the site's key), so the prompts live in one place.

import { SPEC_JSON_SCHEMA } from './MechanicSpec';

export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

/** What the browser sends to the proxy; the proxy builds the prompt itself. */
export interface InterpretRequest {
  kind: 'classify' | 'creative';
  word: string;
  sentence: string;
  current: string;
  /** Tokens the answer may be (classify only). */
  allowed: string[];
}

const CLASSIFY_SYSTEM =
  'You are the physics of a tiny puzzle world. Its rules are sentences, and the player replaced one word. ' +
  'Decide which of the allowed tokens the new word most plausibly means in that sentence (synonyms, slang, ' +
  'other languages, metaphors and typos all count). If nothing is a reasonable fit, answer NONE. ' +
  'Also give a note of at most 8 words, playful, explaining the interpretation.';

const CREATIVE_SYSTEM = [
  'You are the physics of a tiny grid puzzle world. Its laws are sentences like "YOU DIE ON RED" or',
  '"GUARD CHASES YOU", and the player has just replaced one word with a word of their own.',
  'Invent what that word means as a machine-readable spec.',
  '',
  'The world: a grid of floor, walls, red tiles, blue tiles, pressure plates, doors, keys and an exit.',
  'One player, some guards, one action per turn. A tile spec runs when someone steps on the tile;',
  'a motion spec decides how a guard moves each turn.',
  '',
  'Be literal and physical, and keep the word\'s everyday meaning: "melt" makes a tile deadly,',
  '"teleport" moves you elsewhere, "shy" makes a guard avoid you, "shadow" makes one trail you,',
  '"ghost" lets you walk through walls. If the word has no physical reading at all, return both',
  'tile and motion as null.',
].join(' ');

export function buildGeminiBody(req: InterpretRequest): unknown {
  const user = `Sentence: ${req.sentence || '___'}\nOld word: ${req.current || '?'}\nNew word: "${req.word}"`;
  if (req.kind === 'classify') {
    return {
      systemInstruction: { parts: [{ text: CLASSIFY_SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: `${user}\nAllowed: ${req.allowed.join(', ')}` }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            token: { type: 'STRING', enum: [...req.allowed, 'NONE'] },
            note: { type: 'STRING' },
          },
          required: ['token', 'note'],
          propertyOrdering: ['token', 'note'],
        },
      },
    };
  }
  // Gemini's schema dialect differs from JSON Schema, so the shape travels in
  // the prompt instead; `parseSpec` is the real gatekeeper either way.
  return {
    systemInstruction: { parts: [{ text: `${CREATIVE_SYSTEM}\n\nAnswer with JSON of this shape:\n${JSON.stringify(SPEC_JSON_SCHEMA)}` }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' },
  };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** The JSON text of the first candidate, or "{}". */
export function geminiText(data: unknown): string {
  const d = data as GeminiResponse;
  return d.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || '{}';
}

/** Cheap input validation shared by the proxy and the browser. */
export function validRequest(body: unknown): body is InterpretRequest {
  if (typeof body !== 'object' || body === null) return false;
  const req = body as Partial<InterpretRequest>;
  return (
    (req.kind === 'classify' || req.kind === 'creative') &&
    typeof req.word === 'string' && req.word.length > 0 && req.word.length <= 32 &&
    typeof req.sentence === 'string' && req.sentence.length <= 200 &&
    typeof req.current === 'string' && req.current.length <= 32 &&
    Array.isArray(req.allowed) && req.allowed.length <= 64 &&
    (req.allowed as unknown[]).every((t) => typeof t === 'string' && /^[A-Z_]{1,24}$/.test(t))
  );
}
