// Schema-checked config merge. Unknown keys (including __proto__/constructor) are ignored,
// numbers are clamped and type mismatches fall back to the current value.
export const CONFIG_SCHEMA = Object.freeze({
  defaults: {
    autoSpeak: 'boolean',
    autoSpeakDelayMs: [200, 10000],
    idleEnabled: 'boolean',
    idleDelayMs: [5000, 3600000],
    idleRepeatMs: [5000, 3600000],
    externalQuoteChance: [0, 1],
    generatedIdleChance: [0, 1],
    smoothVoice: 'boolean',
    phaseDepth: [-100, 100],
    autoClear: 'boolean',
    characterTilt: [-50, 50],
    visualGlitch: [0, 100],
    autonomousMinMs: [10000, 3600000],
    autonomousMaxMs: [10000, 3600000],
    reactions: 'boolean',
  },
  limits: {
    maxCharacters: [100, 20000],
    chunkCharacters: [40, 400],
  },
});

function coerce(rule, value, fallback) {
  if (rule === 'boolean') return typeof value === 'boolean' ? value : fallback;
  if (Array.isArray(rule)) {
    const number = typeof value === 'number' ? value : Number.NaN;
    if (!Number.isFinite(number)) return fallback;
    return Math.min(rule[1], Math.max(rule[0], number));
  }
  return fallback;
}

export function mergeConfig(current, incoming, schema = CONFIG_SCHEMA) {
  const result = {};
  for (const section of Object.keys(schema)) {
    const base = { ...(current?.[section] ?? {}) };
    const source = incoming && typeof incoming === 'object' && Object.hasOwn(incoming, section) ? incoming[section] : null;
    if (source && typeof source === 'object') {
      for (const [key, rule] of Object.entries(schema[section])) {
        if (Object.hasOwn(source, key)) base[key] = coerce(rule, source[key], base[key]);
      }
    }
    result[section] = base;
  }
  return result;
}
