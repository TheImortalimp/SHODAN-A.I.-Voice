import { LatencyEstimator, sampleVisemes } from '../avatar/visemes.js';

// AudioContext time of the sample reaching the speakers right now.
export function heardTime(context) {
  if (!context) return 0;
  try {
    const stamp = context.getOutputTimestamp?.();
    if (stamp && stamp.contextTime > 0 && stamp.performanceTime > 0) {
      const time = stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
      if (Number.isFinite(time)) return Math.min(context.currentTime, time);
    }
  } catch {
    /* fall through to the reported latency */
  }
  return context.currentTime - (context.outputLatency || context.baseLatency || 0);
}

export function energyAt(track, time) {
  if (!track || !(time >= 0)) return NaN;
  const index = Math.round(time / track.hop);
  return index < track.frames ? track.energy[index] : NaN;
}

/**
 * Measures how long the pitch worklet delays the voice by correlating the output meter
 * (sampled at render time) against the energy the viseme track predicts for each lag.
 */
export class LatencyProbe {
  constructor({ maxLag = 0.45, step = 0.01, span = 6, minSamples = 40, minCorrelation = 0.5 } = {}) {
    Object.assign(this, { maxLag, step, span, minSamples, minCorrelation });
    this.reset();
  }

  reset() {
    this.times = [];
    this.levels = [];
  }

  push(time, level) {
    if (!Number.isFinite(time) || !Number.isFinite(level)) return;
    if (this.times.length && time <= this.times[this.times.length - 1]) return;
    this.times.push(time);
    this.levels.push(level);
    while (this.times.length && time - this.times[0] > this.span) {
      this.times.shift();
      this.levels.shift();
    }
  }

  // expected(renderTime) returns the predicted level for audio emitted at that time, or NaN.
  estimate(expected) {
    if (this.times.length < this.minSamples) return null;
    let best = null;
    const steps = Math.round(this.maxLag / this.step);
    for (let s = 0; s <= steps; s++) {
      const lag = s * this.step;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (let i = 0; i < this.times.length; i++) {
        const y = expected(this.times[i] - lag);
        if (!Number.isFinite(y)) continue;
        const x = this.levels[i];
        n++;
        sx += x;
        sy += y;
        sxx += x * x;
        syy += y * y;
        sxy += x * y;
      }
      if (n < this.minSamples) continue;
      const vx = sxx - (sx * sx) / n;
      const vy = syy - (sy * sy) / n;
      if (vx <= 1e-9 || vy <= 1e-9) continue;
      const r = (sxy - (sx * sy) / n) / Math.sqrt(vx * vy);
      if (!best || r > best.correlation) best = { lag, correlation: r };
    }
    return best && best.correlation >= this.minCorrelation ? best : null;
  }
}

// Follows the current chunk on the audio clock and reports what the avatar should show.
export class LipSync {
  constructor({ latency = new LatencyEstimator(0.09), probe = new LatencyProbe(), probeInterval = 0.5 } = {}) {
    this.latency = latency;
    this.probe = probe;
    this.probeInterval = probeInterval;
    this.current = null;
    this.out = {};
    this.lastProbe = 0;
  }

  begin({ track, clock, cues = [], stutters = [], hasPitch = false }) {
    this.current = { track, clock, cues, stutters, hasPitch };
    this.probe.reset();
    this.lastProbe = 0;
  }

  end() {
    this.current = null;
  }

  // Latency added by the pitch worklet; cues and static are shifted by it as well.
  get delay() {
    return this.current?.hasPitch ? this.latency.value : 0;
  }

  sample(context, level = 0) {
    const current = this.current;
    if (!current || !context) return null;
    const delay = current.hasPitch ? this.latency.value : 0;
    const time = heardTime(context) - delay;
    const position = current.clock.bufferTime(time);
    const visemes = current.track ? sampleVisemes(current.track, position, this.out) : null;
    const cue = current.cues.some((c) => time >= c.start && time < c.end);
    const stutter = position >= 0 && current.stutters.some((s) => position >= s.start && position < s.end);
    if (current.hasPitch && current.track) {
      const render = context.currentTime;
      this.probe.push(render, level);
      if (render - this.lastProbe >= this.probeInterval) {
        this.lastProbe = render;
        const found = this.probe.estimate((t) => energyAt(current.track, current.clock.bufferTime(t)));
        if (found) this.latency.update(found.lag);
      }
    }
    return { visemes, cue, stutter, position, delay };
  }
}
