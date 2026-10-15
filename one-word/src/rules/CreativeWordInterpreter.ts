import type { AIProvider } from '../config/GameConfig';
import { TransientError, askModel } from './askModel';
import { parseSpec, type MechanicSpec } from './MechanicSpec';
import { registry as sharedRegistry, type MechanicRegistry } from './MechanicRegistry';
import type { InterpretContext } from './WordInterpreter';

// The creative half of the game: instead of picking one of twelve verbs, the
// model *invents* the verb. It answers with a `MechanicSpec` — pure data,
// clamped and validated here before the simulation ever sees it. Nothing is
// compiled, nothing is evaluated: an implausible answer becomes a boring tile
// or is thrown away, never a crash and never code.
//
// Every accepted word is cached and registered, so "gravity" means the same
// thing for the rest of the session, and the sim stays deterministic.

export class CreativeWordInterpreter {
  lastNote = '';

  constructor(
    private provider: AIProvider,
    private timeoutMs = 8000,
    private registry: MechanicRegistry = sharedRegistry,
  ) {}

  /** Words already given a meaning this session, keyed by the typed word. */
  private cache = new Map<string, MechanicSpec | null>();

  /**
   * Invent (or recall) the mechanic a typed word means and register it.
   * Returns the token now in the registry, or null if the world can't read the word.
   */
  async invent(word: string, context?: InterpretContext): Promise<string | null> {
    this.lastNote = '';
    const key = word.toLowerCase();
    if (this.cache.has(key)) {
      const hit = this.cache.get(key)!;
      this.lastNote = hit?.note ?? '';
      return hit?.token ?? null;
    }
    const spec = await this.request(word, context);
    if (spec === undefined) return null;
    this.cache.set(key, spec);
    if (!spec) return null;
    this.registry.register(spec);
    this.lastNote = spec.note ?? '';
    return spec.token;
  }

  /** null = the world cannot read the word (cached); undefined = request failed, try again later. */
  private async request(word: string, context?: InterpretContext): Promise<MechanicSpec | null | undefined> {
    try {
      const text = await askModel(this.provider, {
        kind: 'creative', word, allowed: [],
        sentence: context?.sentence ?? '', current: context?.current ?? '',
      }, this.timeoutMs);
      const raw = JSON.parse(text);
      // The word the player typed names the mechanic, whatever the model calls it.
      const token = /^[a-zA-Z]{2,16}$/.test(word) ? word.toUpperCase() : String(raw.token ?? '');
      // A word must not quietly redefine a mechanic the game already ships with.
      if (this.registry.has(token) && !this.registry.get(token)?.dynamic) return null;
      const spec = parseSpec(token, raw);
      return spec ? { ...spec, dynamic: true } : null;
    } catch (e) {
      console.warn('creative interpreter failed', e);
      return e instanceof TransientError ? undefined : null;
    }
  }
}
