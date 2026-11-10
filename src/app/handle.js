import { TOPICS } from '../cortex/grammar.js';
import { Cooldowns } from '../whiteice/ratelimit.js';

export const HANDLE_STORAGE_KEY = 'shodan.handle.v1';
export const HANDLE_DEFAULTS = Object.freeze({ converse: false, autonomous: false, reactions: true, mood: 'random', topic: '', visual: 60 });

// When and how often SHODAN comments on what the user does.
export const REACTION_RULES = Object.freeze({
  firstContact: { cooldown: Infinity, chance: 0.5, delay: 900 },
  stop: { cooldown: 45000, chance: 0.3, delay: 700 },
  return: { cooldown: 60000, chance: 0.85, delay: 700 },
  fullscreen: { cooldown: 90000, chance: 0.6, delay: 900 },
  float: { cooldown: 90000, chance: 0.6, delay: 1100 },
  paste: { cooldown: 60000, chance: 0.35, delay: 900 },
  rapid: { cooldown: 60000, chance: 1, delay: 250, interrupt: true },
  voiceError: { cooldown: Infinity, chance: 1, delay: 1200, whenIdle: 30000 },
  whiteIce: { cooldown: 120000, chance: 1, delay: 600, whenIdle: 20000 },
});

export function loadHandleSettings(storage, moods) {
  try {
    const raw = JSON.parse(storage?.getItem(HANDLE_STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...HANDLE_DEFAULTS };
    const visual = Number(raw.visual);
    return {
      converse: raw.converse === true,
      autonomous: raw.autonomous === true,
      reactions: raw.reactions !== false,
      mood: moods.includes(raw.mood) ? raw.mood : 'random',
      topic: typeof raw.topic === 'string' && Object.hasOwn(TOPICS, raw.topic) ? raw.topic : '',
      visual: Number.isFinite(visual) ? Math.min(100, Math.max(0, Math.round(visual / 5) * 5)) : HANDLE_DEFAULTS.visual,
    };
  } catch {
    return { ...HANDLE_DEFAULTS };
  }
}

export function saveHandleSettings(storage, settings) {
  try {
    storage?.setItem(HANDLE_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage may be unavailable */
  }
}

/**
 * The AI handle: decides what SHODAN says when nobody scripted it. CORTEX always works
 * offline; the optional neural link is tried first when enabled and falls back on any error.
 *
 * hooks: speak(line, meta), isBusy(kind, rule), selection() → { mood, topic },
 *        onLinkError(error), onLinkThrottled(ms)
 */
export class AiHandle {
  constructor({ cortex, llm, whiteIce, random = Math.random, config = () => ({}), hooks = {} }) {
    Object.assign(this, { cortex, llm, whiteIce, random, config, hooks });
    this.cooldowns = new Cooldowns();
    this.autonomous = false;
    this.reactions = true;
    this.timer = null;
    this.nextAt = 0;
    this.ticket = 0;
    this.composing = false;
  }

  get engine() {
    return this.llm.enabled ? 'llm' : 'cortex';
  }

  emit(name, ...args) {
    try {
      return this.hooks[name]?.(...args);
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  async viaLink(request) {
    // One request at a time: while the link is busy CORTEX answers instead.
    if (!this.llm.enabled || this.llm.inFlight) return '';
    if (!this.whiteIce.allow('ai')) {
      this.emit('onLinkThrottled', this.whiteIce.retryAfter('ai'));
      return '';
    }
    try {
      return this.whiteIce.text(await request(), { maxLength: 600, multiline: false });
    } catch (error) {
      this.emit('onLinkError', error);
      return '';
    }
  }

  // An unprompted line. "random" (or anything unknown) lets CORTEX pick the mood.
  async compose({ mood = '', topic = '' } = {}) {
    const chosen = this.cortex.moods.includes(mood) ? mood : '';
    const focus = typeof topic === 'string' && Object.hasOwn(TOPICS, topic) ? topic : '';
    if (this.llm.enabled) {
      const steer = chosen || this.cortex.pickMood();
      const text = await this.viaLink(() =>
        this.llm.generate({ mood: steer, topic: focus ? TOPICS[focus].label : '', memory: this.cortex.summary() }),
      );
      if (text) return { text, mood: steer, topic: focus, engine: 'llm' };
    }
    const line = this.cortex.generate({ mood: chosen || undefined, topic: focus || undefined });
    return { text: line.text, mood: line.mood, topic: line.topic, engine: 'cortex' };
  }

  // A reply to the user. CORTEX always reads the input so its memory stays current.
  async reply(input) {
    const local = this.cortex.respond(input);
    const text = await this.viaLink(() => this.llm.respond(input, { mood: local.mood, memory: this.cortex.summary() }));
    if (text) return { ...local, text, engine: 'llm' };
    return { ...local, engine: 'cortex' };
  }

  setAutonomous(on) {
    this.autonomous = !!on;
    if (this.autonomous) this.schedule();
    else {
      clearTimeout(this.timer);
      this.timer = null;
      this.nextAt = 0;
      this.ticket++;
    }
  }

  // Rescheduling also invalidates a line that is still being composed for the old slot.
  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = null;
    const ticket = ++this.ticket;
    if (!this.autonomous) return;
    const config = this.config();
    const min = Math.max(5000, Number(config.autonomousMinMs) || 25000);
    const max = Math.max(min, Number(config.autonomousMaxMs) || 90000);
    const delay = ms ?? min + this.random() * (max - min);
    this.nextAt = Date.now() + delay;
    this.timer = setTimeout(() => this.tick(ticket), delay);
  }

  async tick(ticket = this.ticket) {
    this.timer = null;
    if (!this.autonomous || ticket !== this.ticket) return;
    if (this.composing || this.emit('isBusy', 'autonomous')) {
      this.schedule(5000);
      return;
    }
    this.composing = true;
    let line;
    try {
      line = await this.compose(this.emit('selection') ?? {});
    } finally {
      this.composing = false;
    }
    if (!this.autonomous || ticket !== this.ticket) return;
    if (this.emit('isBusy', 'autonomous')) {
      this.schedule(5000);
      return;
    }
    // A finished transmission reschedules; one that never starts must do so here.
    if (!this.emit('speak', line, { kind: 'autonomous' })) this.schedule();
  }

  // Every finished transmission restarts the countdown, so she interjects during lulls.
  transmissionEnded() {
    if (this.autonomous) this.schedule();
  }

  react(event, overrides = {}) {
    const base = Object.hasOwn(REACTION_RULES, event) ? REACTION_RULES[event] : null;
    if (!base || !this.reactions) return false;
    const rule = { ...base, ...overrides };
    if (!this.cooldowns.ready(event) || this.random() >= rule.chance) return false;
    const deadline = Date.now() + (rule.whenIdle ?? 0);
    const fire = () => {
      if (!this.reactions || !this.cooldowns.ready(event)) return;
      if (this.emit('isBusy', 'reaction', rule)) {
        if (rule.whenIdle && Date.now() < deadline) setTimeout(fire, 1000);
        return;
      }
      if (!this.whiteIce.allow('reaction')) return;
      const line = this.cortex.react(event);
      if (!line) return;
      this.cooldowns.arm(event, rule.cooldown);
      this.emit('speak', { text: line.text, mood: line.mood, topic: '', engine: 'cortex' }, { kind: 'reaction', event, interrupt: !!rule.interrupt });
    };
    setTimeout(fire, rule.delay);
    return true;
  }
}
