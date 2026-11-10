// Pure transmission helpers ported from the original pipeline. Randomness is injectable so
// tests can pin every branch; live code passes the default Math.random.

export function chunks(text, max) {
  const words = text.trim().split(/\s+/);
  const result = [];
  let current = '';
  for (let word of words) {
    while (word.length > max) {
      if (current) {
        result.push(current);
        current = '';
      }
      result.push(word.slice(0, max));
      word = word.slice(max);
    }
    if (!word) continue;
    const next = current ? `${current} ${word}` : word;
    if (next.length > max) {
      result.push(current);
      current = word;
    } else current = next;
    if (/[.!?;:]$/.test(word) && current.length > 30) {
      result.push(current);
      current = '';
    }
  }
  if (current) result.push(current);
  return result;
}

// Restarted word fragments ("pa-pathetic", "ins… insect") that the voice then stumbles over.
export function glitchText(text, amount, random = Math.random) {
  const chance = Math.min(0.42, 0.07 + amount / 160);
  return text.replace(/\b[A-Za-z][A-Za-z'-]{3,}\b/g, (word) => {
    if (random() > chance) return word;
    const cut = 1 + Math.floor(random() * Math.min(4, word.length - 1));
    const fragment = word.slice(0, cut);
    const mode = random();
    if (mode < 0.5) return `${fragment}-${word}`;
    if (mode < 0.82) return `${fragment}… ${word}`;
    return `${word}—${fragment}${word.slice(cut)}`;
  });
}

/**
 * Repeats short audio slices to create digital stutters.
 * Returns the new buffer and the stutter ranges in output-buffer seconds, so the avatar can
 * jolt exactly when a repeated slice is heard.
 */
export function timeSliceBuffer(context, buffer, amount, random = Math.random) {
  if (buffer.duration < 0.65 || amount < 8) return { buffer, stutters: [] };
  const rate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  const eventCount = Math.max(1, Math.min(7, Math.floor(buffer.duration * (0.16 + amount / 75))));
  const events = [];
  let attempts = 0;
  while (events.length < eventCount && attempts++ < eventCount * 8) {
    const length = Math.floor(rate * (0.045 + random() * 0.055));
    const start = Math.floor(rate * (0.2 + random() * Math.max(0.05, buffer.duration - 0.45)));
    const repeats = random() < 0.68 ? 1 : 2;
    if (start + length >= buffer.length) continue;
    if (events.some((e) => start < e.start + e.length + rate * 0.08 && start + length > e.start - rate * 0.08)) continue;
    events.push({ start, length, repeats });
  }
  if (!events.length) return { buffer, stutters: [] };
  events.sort((a, b) => a.start - b.start);
  const total = buffer.length + events.reduce((n, e) => n + e.length * e.repeats, 0);
  const result = context.createBuffer(channels, total, rate);
  const input = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  const output = Array.from({ length: channels }, (_, c) => result.getChannelData(c));
  let read = 0;
  let write = 0;
  const copy = (from, to, count, repeat = false) => {
    for (let c = 0; c < channels; c++) {
      const src = input[c];
      const dst = output[c];
      for (let i = 0; i < count; i++) {
        let gain = 1;
        if (repeat) {
          const fade = Math.min(Math.floor(rate * 0.004), Math.floor(count / 4));
          if (fade > 0) gain = Math.min(1, (i + 1) / fade, (count - i) / fade);
        }
        dst[to + i] = src[from + i] * gain;
      }
    }
  };
  const stutters = [];
  for (const e of events) {
    const end = e.start + e.length;
    if (e.start < read) continue;
    copy(read, write, e.start - read);
    write += e.start - read;
    copy(e.start, write, e.length);
    write += e.length;
    read = end;
    const from = write;
    for (let n = 0; n < e.repeats; n++) {
      copy(e.start, write, e.length, true);
      write += e.length;
    }
    stutters.push({ start: from / rate, end: write / rate });
  }
  copy(read, write, buffer.length - read);
  return { buffer: result, stutters };
}

// Wide pitch sweeps, alternating up and down, scheduled on the audio clock.
export function planPitchCues(estimated, random = Math.random) {
  const cues = [];
  let at = 0.7 + random() * 0.28;
  let index = 0;
  while (at < estimated - 0.9) {
    const duration = Math.min(1.2 + random() * 0.35, estimated - at - 0.22);
    cues.push({ at, duration, factor: index % 2 === 0 ? 1.4 : 0.72 });
    at += duration + 1.0 + random() * 0.45;
    index++;
  }
  return cues;
}

export function shaperCurve(amount, size = 2048) {
  const curve = new Float32Array(size);
  const k = 1 + amount * 12;
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

// RMS of 8-bit time-domain samples, scaled like the original meter.
export function levelFromBytes(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const v of samples) sum += (v - 128) * (v - 128);
  return Math.min(1, Math.sqrt(sum / samples.length) / 18);
}

export function signedPercent(value) {
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number}%`;
}
