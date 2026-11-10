// Lip-sync analysis. Runs once per synthesized chunk on the final (stuttered) buffer, so the
// mouth follows exactly what is heard, including the repeated "glitch" slices.
const fftCache = new Map();

function fftTables(size) {
  let tables = fftCache.get(size);
  if (tables) return tables;
  const bits = Math.log2(size);
  const reverse = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >>> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
  }
  const cos = new Float32Array(size / 2);
  const sin = new Float32Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / size);
    sin[i] = -Math.sin((2 * Math.PI * i) / size);
  }
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  tables = { reverse, cos, sin, window };
  fftCache.set(size, tables);
  return tables;
}

// In-place iterative radix-2 FFT.
export function fft(re, im) {
  const size = re.length;
  const { reverse, cos, sin } = fftTables(size);
  for (let i = 0; i < size; i++) {
    const j = reverse[i];
    if (j > i) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const half = length >>> 1;
    const step = size / length;
    for (let start = 0; start < size; start += length) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sin[k * step];
        const a = start + k;
        const b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

function mixDown(buffer, factor) {
  const channels = buffer.numberOfChannels || 1;
  const length = Math.floor(buffer.length / factor);
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      let sum = 0;
      const offset = i * factor;
      for (let k = 0; k < factor; k++) sum += data[offset + k];
      out[i] += sum / factor / channels;
    }
  }
  return out;
}

function percentile(values, p) {
  const sorted = Array.from(values).filter((v) => v > 1e-6).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}

function smooth(values, attack, release) {
  let state = 0;
  for (let i = 0; i < values.length; i++) {
    const target = values[i];
    state += (target - state) * (target > state ? attack : release);
    values[i] = state;
  }
  return values;
}

export const VISEME_KEYS = Object.freeze(['open', 'wide', 'round', 'closed', 'teeth', 'energy']);

export function analyzeVisemes(buffer, { hop = 0.01, anticipation = 0.02 } = {}) {
  const factor = Math.max(1, Math.round(buffer.sampleRate / 24000));
  const rate = buffer.sampleRate / factor;
  const signal = mixDown(buffer, factor);
  const size = rate > 16000 ? 512 : 256;
  const { window } = fftTables(size);
  const hopSamples = Math.max(1, Math.round(rate * hop));
  const frames = Math.max(1, Math.ceil(signal.length / hopSamples));
  const binHz = rate / size;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const rms = new Float32Array(frames);
  const zcr = new Float32Array(frames);
  const lowRatio = new Float32Array(frames);
  const highRatio = new Float32Array(frames);
  const f1 = new Float32Array(frames);
  const f2 = new Float32Array(frames);
  const band = (hz) => Math.min(size / 2, Math.max(1, Math.round(hz / binHz)));
  const [lowA, lowB, midB, highB] = [band(150), band(900), band(2600), band(Math.min(8000, rate / 2 - binHz))];
  const [f1A, f1B, f2A, f2B] = [band(250), band(1000), band(900), band(2800)];

  for (let frame = 0; frame < frames; frame++) {
    const start = frame * hopSamples - size / 2;
    let energy = 0;
    let crossings = 0;
    let previous = 0;
    for (let i = 0; i < size; i++) {
      const index = start + i;
      const sample = index >= 0 && index < signal.length ? signal[index] : 0;
      energy += sample * sample;
      if (i && (sample >= 0) !== (previous >= 0)) crossings += 1;
      previous = sample;
      re[i] = sample * window[i];
      im[i] = 0;
    }
    rms[frame] = Math.sqrt(energy / size);
    zcr[frame] = crossings / size;
    fft(re, im);
    let low = 0;
    let mid = 0;
    let high = 0;
    let f1Sum = 0;
    let f1Weight = 0;
    let f2Sum = 0;
    let f2Weight = 0;
    for (let k = lowA; k < highB; k++) {
      const power = re[k] * re[k] + im[k] * im[k];
      if (k < lowB) low += power;
      else if (k < midB) mid += power;
      else high += power;
      if (k >= f1A && k < f1B) {
        f1Sum += power * k;
        f1Weight += power;
      }
      if (k >= f2A && k < f2B) {
        f2Sum += power * k;
        f2Weight += power;
      }
    }
    const total = low + mid + high || 1e-12;
    lowRatio[frame] = low / total;
    highRatio[frame] = high / total;
    f1[frame] = f1Weight ? (f1Sum / f1Weight) * binHz : 500;
    f2[frame] = f2Weight ? (f2Sum / f2Weight) * binHz : 1500;
  }

  const reference = 20 * Math.log10(percentile(rms, 0.95) + 1e-9);
  const zcrReference = Math.max(0.05, percentile(zcr, 0.9));
  const track = { hop, anticipation, frames, duration: buffer.length / buffer.sampleRate };
  for (const key of VISEME_KEYS) track[key] = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const db = 20 * Math.log10(rms[i] + 1e-9);
    const energy = clamp01((db - (reference - 36)) / 36);
    const voiced = clamp01((lowRatio[i] - 0.15) / 0.45);
    const fricative = clamp01((highRatio[i] - 0.22) / 0.45) * clamp01(zcr[i] / zcrReference);
    const height = voiced > 0.2 ? clamp01((f1[i] - 280) / 520) : 0.4;
    track.energy[i] = energy;
    track.open[i] = energy ** 0.8 * (0.3 + 0.7 * height) * (1 - 0.6 * fricative);
    track.wide[i] = energy * voiced * clamp01((f2[i] - 1400) / 900);
    track.round[i] = energy * voiced * clamp01((1350 - f2[i]) / 600) * clamp01((650 - f1[i]) / 350);
    track.teeth[i] = fricative * clamp01(energy * 2.5);
  }
  smooth(track.open, 0.55, 0.28);
  smooth(track.wide, 0.3, 0.3);
  smooth(track.round, 0.3, 0.3);
  smooth(track.teeth, 0.45, 0.35);
  smooth(track.energy, 0.6, 0.25);
  for (let i = 0; i < frames; i++) track.closed[i] = 1 - clamp01(track.open[i] * 3);
  return track;
}

const REST = Object.freeze({ open: 0, wide: 0, round: 0, closed: 1, teeth: 0, energy: 0 });

export function sampleVisemes(track, time, out = {}) {
  if (!track || !(time >= 0)) return Object.assign(out, REST);
  const position = (time + track.anticipation) / track.hop;
  if (position >= track.frames - 1) return Object.assign(out, REST);
  const index = Math.floor(position);
  const t = position - index;
  for (const key of VISEME_KEYS) out[key] = track[key][index] * (1 - t) + track[key][index + 1] * t;
  return out;
}

export function firstVoicedTime(track, threshold = 0.2) {
  if (!track) return -1;
  for (let i = 0; i < track.frames; i++) if (track.energy[i] >= threshold) return i * track.hop;
  return -1;
}

// Mirrors the AudioParam automation used for pitch glitches so the visual clock can follow
// the buffer position when pitch is linked to playback speed.
export class Automation {
  constructor(initial) {
    this.events = [{ time: -Infinity, value: initial, type: 'set' }];
  }

  set(value, time) {
    this.insert({ time, value, type: 'set' });
  }

  linear(value, time) {
    this.insert({ time, value, type: 'linear' });
  }

  insert(event) {
    this.events.push(event);
    this.events.sort((a, b) => a.time - b.time);
  }

  valueAt(time) {
    const events = this.events;
    let previous = events[0];
    for (let i = 1; i < events.length; i++) {
      const event = events[i];
      if (event.time > time) {
        if (event.type === 'linear' && Number.isFinite(previous.time) && event.time > previous.time) {
          const t = (time - previous.time) / (event.time - previous.time);
          return previous.value + (event.value - previous.value) * Math.min(1, Math.max(0, t));
        }
        return previous.value;
      }
      previous = event;
    }
    return previous.value;
  }
}

// Maps AudioContext time to a position inside the source buffer.
export class PlaybackClock {
  constructor({ start, duration, rateAt, step = 0.005 }) {
    this.start = start;
    this.duration = duration;
    this.step = step;
    const positions = [0];
    let position = 0;
    let time = start;
    const limit = start + duration * 4 + 2;
    while (position < duration && time < limit) {
      const rate = Math.max(0.05, rateAt(time + step / 2));
      position += rate * step;
      time += step;
      positions.push(position);
    }
    this.positions = Float64Array.from(positions);
    this.end = start + (positions.length - 1) * step;
  }

  bufferTime(contextTime) {
    if (contextTime < this.start) return -1;
    const offset = (contextTime - this.start) / this.step;
    const index = Math.floor(offset);
    if (index >= this.positions.length - 1) return this.duration;
    const t = offset - index;
    return Math.min(this.duration, this.positions[index] * (1 - t) + this.positions[index + 1] * t);
  }
}

// Exponential moving average of the measured audio-graph latency (worklet buffering).
export class LatencyEstimator {
  constructor(initial = 0.09, { min = 0, max = 0.45, alpha = 0.35 } = {}) {
    this.value = initial;
    this.min = min;
    this.max = max;
    this.alpha = alpha;
  }

  update(sample) {
    if (!Number.isFinite(sample) || sample < this.min || sample > this.max) return this.value;
    this.value += (sample - this.value) * this.alpha;
    return this.value;
  }
}
