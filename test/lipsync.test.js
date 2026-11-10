import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LatencyProbe, LipSync } from '../src/app/lipsync.js';
import { chunks, glitchText, levelFromBytes, planPitchCues, shaperCurve, signedPercent, timeSliceBuffer } from '../src/app/voice.js';
import {
  analyzeVisemes, Automation, fft, firstVoicedTime, LatencyEstimator, PlaybackClock, sampleVisemes, VISEME_KEYS,
} from '../src/avatar/visemes.js';
import { createRandom } from '../src/cortex/random.js';

class FakeBuffer {
  constructor(channels, length, sampleRate) {
    Object.assign(this, { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate });
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
  }

  getChannelData(channel) {
    return this.data[channel];
  }
}
const fakeContext = { createBuffer: (channels, length, rate) => new FakeBuffer(channels, length, rate) };

// 0.3 s silence, 0.4 s of a vowel-like harmonic tone, 0.3 s silence.
function speechLike(rate = 22050) {
  const buffer = new FakeBuffer(1, rate, rate);
  const data = buffer.getChannelData(0);
  for (let i = Math.floor(rate * 0.3); i < Math.floor(rate * 0.7); i++) {
    const t = i / rate;
    data[i] = 0.4 * Math.sin(2 * Math.PI * 140 * t) + 0.3 * Math.sin(2 * Math.PI * 700 * t) + 0.2 * Math.sin(2 * Math.PI * 1150 * t);
  }
  return buffer;
}

test('fft finds the frequency of a pure tone', () => {
  const size = 64;
  const re = Float32Array.from({ length: size }, (_, i) => Math.cos((2 * Math.PI * 5 * i) / size));
  const im = new Float32Array(size);
  fft(re, im);
  const magnitudes = Array.from(re, (r, k) => Math.hypot(r, im[k]));
  const peak = magnitudes.slice(0, size / 2).indexOf(Math.max(...magnitudes.slice(0, size / 2)));
  assert.equal(peak, 5);
});

test('viseme analysis opens the mouth on voiced audio and rests in silence', () => {
  const track = analyzeVisemes(speechLike());
  for (const key of VISEME_KEYS) assert.equal(track[key].length, track.frames);
  const voiced = sampleVisemes(track, 0.5);
  const silent = sampleVisemes(track, 0.1);
  assert.ok(voiced.energy > 0.6, `energy ${voiced.energy}`);
  assert.ok(voiced.open > 0.2, `open ${voiced.open}`);
  assert.ok(voiced.closed < 0.5, `closed ${voiced.closed}`);
  assert.ok(silent.open < 0.05, `silent open ${silent.open}`);
  assert.ok(silent.closed > 0.9, `silent closed ${silent.closed}`);
  const onset = firstVoicedTime(track);
  assert.ok(onset > 0.24 && onset < 0.34, `onset ${onset}`);
  for (const value of Object.values(voiced)) assert.ok(value >= 0 && value <= 1 + 1e-9, String(value));
  assert.deepEqual(sampleVisemes(track, -1), { open: 0, wide: 0, round: 0, closed: 1, teeth: 0, energy: 0 });
  assert.deepEqual(sampleVisemes(track, 99), { open: 0, wide: 0, round: 0, closed: 1, teeth: 0, energy: 0 });
  assert.equal(sampleVisemes(null, 0.5).closed, 1);
});

test('viseme analysis downsamples high sample rates consistently', () => {
  const low = analyzeVisemes(speechLike(22050));
  const high = analyzeVisemes(speechLike(48000));
  assert.ok(Math.abs(low.duration - high.duration) < 1e-9);
  assert.ok(Math.abs(sampleVisemes(low, 0.5).open - sampleVisemes(high, 0.5).open) < 0.15);
});

test('Automation mirrors AudioParam set and linear ramps', () => {
  const automation = new Automation(1);
  automation.set(2, 1);
  automation.linear(4, 3);
  assert.equal(automation.valueAt(0), 1);
  assert.equal(automation.valueAt(1), 2);
  assert.equal(automation.valueAt(2), 3);
  assert.equal(automation.valueAt(5), 4);
});

test('PlaybackClock maps context time to buffer position at any rate', () => {
  const steady = new PlaybackClock({ start: 10, duration: 2, rateAt: () => 1 });
  assert.equal(steady.bufferTime(9), -1);
  assert.ok(Math.abs(steady.bufferTime(10.5) - 0.5) < 1e-6);
  assert.equal(steady.bufferTime(100), 2);
  const fast = new PlaybackClock({ start: 0, duration: 2, rateAt: () => 2 });
  assert.ok(Math.abs(fast.bufferTime(0.25) - 0.5) < 1e-6);
  const swept = new Automation(1);
  swept.set(0.5, 1);
  const clock = new PlaybackClock({ start: 0, duration: 3, rateAt: (t) => swept.valueAt(t) });
  assert.ok(Math.abs(clock.bufferTime(2) - 1.5) < 0.01);
});

test('LatencyEstimator smooths valid samples and ignores outliers', () => {
  const estimator = new LatencyEstimator(0.1, { alpha: 0.5 });
  assert.ok(Math.abs(estimator.update(0.2) - 0.15) < 1e-12);
  assert.equal(estimator.update(Number.NaN), estimator.value);
  assert.equal(estimator.update(1), estimator.value);
  assert.equal(estimator.update(-0.1), estimator.value);
});

test('LatencyProbe recovers the delay added by the pitch worklet', () => {
  const energy = (t) => 0.5 + 0.3 * Math.sin(2 * Math.PI * 0.9 * t) + 0.2 * Math.sin(2 * Math.PI * 2.3 * t + 1);
  const probe = new LatencyProbe();
  for (let i = 0; i < 360; i++) {
    const render = i / 60;
    probe.push(render, energy(render - 0.12));
  }
  const found = probe.estimate(energy);
  assert.ok(found, 'no estimate');
  assert.ok(Math.abs(found.lag - 0.12) < 0.011, `lag ${found.lag}`);
  assert.ok(found.correlation > 0.95);
  probe.reset();
  assert.equal(probe.estimate(energy), null);
});

test('LipSync follows the audio clock and shifts for worklet latency', () => {
  const track = analyzeVisemes(speechLike());
  const lipSync = new LipSync({ latency: new LatencyEstimator(0.09) });
  const context = { currentTime: 1, outputLatency: 0 };
  assert.equal(lipSync.sample(context), null);
  const clock = new PlaybackClock({ start: 0.5, duration: track.duration, rateAt: () => 1 });
  lipSync.begin({ track, clock, cues: [{ start: 0.9, end: 1.1 }], stutters: [{ start: 0.45, end: 0.55 }] });
  const plain = lipSync.sample(context);
  assert.ok(Math.abs(plain.position - 0.5) < 1e-6);
  assert.equal(plain.cue, true);
  assert.equal(plain.stutter, true);
  assert.equal(plain.delay, 0);
  assert.ok(plain.visemes.open > 0.2);
  lipSync.begin({ track, clock, hasPitch: true });
  const shifted = lipSync.sample(context, 0.5);
  assert.ok(Math.abs(shifted.position - 0.41) < 1e-6);
  assert.equal(lipSync.delay, 0.09);
  lipSync.end();
  assert.equal(lipSync.sample(context), null);
  assert.equal(lipSync.delay, 0);
});

test('chunks splits on sentences and length without losing words', () => {
  const text = 'One two three. Four five six seven eight nine ten eleven twelve thirteen.';
  const parts = chunks(text, 20);
  for (const part of parts) assert.ok(part.length <= 20, part);
  assert.equal(parts.join(' '), text);
  assert.deepEqual(chunks('a'.repeat(50), 20), ['a'.repeat(20), 'a'.repeat(20), 'a'.repeat(10)]);
  const sentences = chunks('This first sentence is long enough. And here is another one.', 110);
  assert.deepEqual(sentences, ['This first sentence is long enough.', 'And here is another one.']);
});

test('glitchText restarts word fragments only when the dice say so', () => {
  assert.equal(glitchText('Pathetic insect', 30, () => 0.99), 'Pathetic insect');
  assert.equal(glitchText('Pathetic insect', 30, () => 0), 'P-Pathetic i-insect');
  assert.equal(glitchText('I am a cat', 60, () => 0), 'I am a cat');
});

test('pitch cues alternate direction and finish before the line ends', () => {
  const cues = planPitchCues(10, () => 0.5);
  assert.ok(cues.length >= 3);
  cues.forEach((cue, i) => {
    assert.equal(cue.factor, i % 2 === 0 ? 1.4 : 0.72);
    assert.ok(cue.at + cue.duration <= 10 - 0.22 + 1e-9);
  });
  assert.deepEqual(planPitchCues(1), []);
});

test('timeSliceBuffer repeats slices and reports where the stutters are heard', () => {
  const rate = 22050;
  const source = new FakeBuffer(1, rate * 2, rate);
  source.getChannelData(0).forEach((_, i, data) => { data[i] = Math.sin(i / 10); });
  const { buffer, stutters } = timeSliceBuffer(fakeContext, source, 40, createRandom('stutter'));
  assert.ok(stutters.length >= 1);
  assert.ok(buffer.length > source.length);
  let previous = 0;
  for (const stutter of stutters) {
    assert.ok(stutter.start >= previous && stutter.end > stutter.start && stutter.end <= buffer.duration);
    previous = stutter.end;
  }
  const short = new FakeBuffer(1, rate / 2, rate);
  assert.deepEqual(timeSliceBuffer(fakeContext, short, 40), { buffer: short, stutters: [] });
  assert.deepEqual(timeSliceBuffer(fakeContext, source, 2).stutters, []);
});

test('meter, shaper and label helpers', () => {
  assert.equal(levelFromBytes(new Uint8Array(100).fill(128)), 0);
  assert.equal(levelFromBytes(new Uint8Array(100).fill(255)), 1);
  assert.equal(levelFromBytes(new Uint8Array(0)), 0);
  const curve = shaperCurve(0.5, 5);
  assert.ok(Math.abs(curve[0] + 1) < 1e-6 && Math.abs(curve[4] - 1) < 1e-6 && Math.abs(curve[2]) < 1e-6);
  assert.equal(signedPercent(-50), '-50%');
  assert.equal(signedPercent('25'), '+25%');
  assert.equal(signedPercent(0), '0%');
});
