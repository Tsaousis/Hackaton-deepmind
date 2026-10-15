import type { AIProvider } from '../config/GameConfig';
import { askModel } from './askModel';
import type { InterpretContext, WordInterpreter } from './WordInterpreter';

// Asks Gemini which allowed token a free-form word means. The response schema
// is constrained to the allowed list (+ NONE), and the result is re-validated
// here. It never produces code; on any error it returns null and the game
// carries on with the local dictionary.
export class GeminiWordInterpreter implements WordInterpreter {
  lastNote = '';

  constructor(private provider: AIProvider, private timeoutMs = 8000) {}

  async interpretWord(input: string, allowed: string[], context?: InterpretContext): Promise<string | null> {
    this.lastNote = '';
    try {
      const text = await askModel(this.provider, {
        kind: 'classify', word: input, allowed,
        sentence: context?.sentence ?? '', current: context?.current ?? '',
      }, this.timeoutMs);
      const parsed = JSON.parse(text) as { token?: string; note?: string };
      const token = String(parsed.token ?? '').toUpperCase();
      if (!allowed.includes(token)) return null;
      this.lastNote = String(parsed.note ?? '').slice(0, 60);
      return token;
    } catch (e) {
      console.warn('Gemini interpreter failed', e);
      return null;
    }
  }
}
