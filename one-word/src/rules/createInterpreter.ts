import { aiProvider } from '../config/GameConfig';
import { GeminiWordInterpreter } from './GeminiWordInterpreter';
import type { WordInterpreter } from './WordInterpreter';

/** The AI interpreter if a key or the hosted proxy is available, or null (dictionary only). */
export function createInterpreter(): WordInterpreter | null {
  const p = aiProvider();
  return p ? new GeminiWordInterpreter(p) : null;
}
