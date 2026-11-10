import { analyzeVisemes, Automation, PlaybackClock } from '../avatar/visemes.js';
import { chunks, glitchText, planPitchCues, timeSliceBuffer } from './voice.js';

const BLOCKED_AUDIO = 'Audio is blocked. Open this page in a regular browser tab and click SYNTHESIZE.';

/**
 * The SHODAN transmission pipeline: chunking, word-fragment glitches, Piper (or eSpeak)
 * synthesis, digital stutters, the DSP graph, audio-clock pitch sweeps with matching
 * static, and the viseme track that drives the avatar.
 *
 * hooks: onStart, onActive, onStatus, onLog, onAudioStarted, onComplete, onFail, onInterrupt, onFallback
 */
export class Speaker {
  constructor({ audio, piper, loadFallback, lipSync, settings, hooks = {}, random = Math.random }) {
    Object.assign(this, { audio, piper, loadFallback, lipSync, settings, hooks, random });
    this.generation = 0;
    this.active = false;
    this.meta = null;
    this.graph = null;
    this.source = null;
    this.finishTimer = null;
    this.piperReady = false;
    this.glitchIntensity = 35;
  }

  emit(name, ...args) {
    try {
      this.hooks[name]?.(...args);
    } catch (error) {
      console.error(error);
    }
  }

  level() {
    return this.graph ? this.graph.level() : 0;
  }

  setActive(on, meta = this.meta) {
    this.active = on;
    this.meta = on ? meta : null;
    this.emit('onActive', on, meta);
  }

  // Silently ends whatever is playing; returns the meta of the interrupted transmission.
  stop() {
    this.generation++;
    clearTimeout(this.finishTimer);
    this.piper.cancel();
    if (this.source) {
      try {
        this.source.stop();
      } catch {
        /* not started */
      }
      this.source = null;
    }
    if (this.graph) {
      this.graph.dispose();
      this.graph = null;
    }
    this.audio.stopBursts();
    this.lipSync.end();
    const interrupted = this.active ? this.meta : null;
    if (interrupted) {
      this.setActive(false, interrupted);
      this.emit('onInterrupt', interrupted);
    }
    return interrupted;
  }

  synthesize(part, usingPiper, tilt) {
    if (usingPiper) return this.piper.request(part);
    return this.loadFallback().then(
      (tts) => {
        const wav = tts.speak(part, { rawdata: true, pitch: Math.round(50 + tilt * 0.16), speed: 170, amplitude: 100 });
        if (!wav || !wav.byteLength) throw new Error('Empty audio');
        return wav;
      },
    ).catch((error) => {
      if (error?.name === 'AbortError') throw error;
      throw Object.assign(new Error(`Fallback synthesis failed: ${error.message}`), { prefixed: true });
    });
  }

  speak(input, meta = { kind: 'user' }) {
    const text = String(input ?? '').trim();
    if (!text) return false;
    this.stop();
    const context = this.audio.init();
    if (!context) {
      this.emit('onFail', meta, 'Web Audio unavailable. Try Chrome, Edge, Firefox, or Safari.', { silent: true });
      return false;
    }
    const run = ++this.generation;
    const settings = this.settings();
    const random = this.random;
    const parts = chunks(text, settings.chunkCharacters || 110);
    const { smooth, tilt } = settings;
    const tiltNorm = tilt / 50;
    const phaseAmount = settings.phase / 100;
    const basePitch = 2 ** ((tilt * 0.06) / 12) * (1 + (random() - 0.5) * 0.025);
    const baseRate = 0.78 + random() * 0.08;
    const gi = smooth ? 12 + random() * 12 : 22 + random() * 32;
    this.glitchIntensity = gi;
    const usingPiper = this.piperReady;
    const glitched = parts.map((part) => glitchText(part, gi, random));
    const pending = new Map();
    let index = 0;
    let started = false;

    this.emit('onStart', { meta, text, usingPiper, smooth, tilt, phase: Math.round(phaseAmount * 100) });
    this.setActive(true, meta);

    const take = (i) => {
      if (!pending.has(i)) pending.set(i, this.synthesize(glitched[i], usingPiper, tilt));
      const promise = pending.get(i);
      pending.delete(i);
      return promise;
    };
    // The next chunk is synthesized while this one plays, so chunks follow without a gap.
    const prefetch = (i) => {
      if (!usingPiper || i >= glitched.length || pending.has(i) || run !== this.generation) return;
      const promise = this.synthesize(glitched[i], usingPiper, tilt);
      promise.catch(() => {});
      pending.set(i, promise);
    };
    const fail = (message) => {
      if (run !== this.generation) return;
      this.audio.stopBursts();
      this.lipSync.end();
      this.graph = null;
      this.setActive(false, meta);
      this.emit('onFail', meta, message);
    };

    const next = () => {
      if (run !== this.generation) return;
      if (index >= glitched.length) {
        this.audio.stopBursts();
        this.lipSync.end();
        this.graph = null;
        this.setActive(false, meta);
        this.emit('onComplete', meta);
        return;
      }
      const current = index++;
      const pitch = basePitch + (random() - 0.5) * 0.06;
      const rate = baseRate + (random() - 0.5) * 0.04;
      Promise.all([take(current), context.state === 'suspended' ? context.resume() : null, this.audio.ensurePitchModule()])
        .then(async ([wav, , hasPitch]) => {
          const decoded = await context.decodeAudioData(wav.slice(0));
          return { ...timeSliceBuffer(context, decoded, gi, random), hasPitch };
        })
        .then(({ buffer, stutters, hasPitch }) => {
          if (run !== this.generation) return;
          if (context.state !== 'running') {
            fail(BLOCKED_AUDIO);
            return;
          }
          prefetch(index);
          let track = null;
          try {
            track = analyzeVisemes(buffer);
          } catch {
            track = null;
          }
          const graph = this.audio.buildGraph(buffer, { pitch, rate, hasPitch, smooth, tiltNorm, phaseAmount, glitchIntensity: gi });
          if (!graph.hasPitch) this.emit('onStatus', 'Independent pitch unavailable in this browser; using speed-linked pitch fallback.');
          this.graph = graph;
          this.source = graph.source;

          // Sustained bends use the same audio-clock timestamps as visual glitches and static.
          const start = context.currentTime + 0.06;
          const estimated = buffer.duration / rate;
          const { pitchParam, normal } = graph;
          const automation = new Automation(normal);
          pitchParam.setValueAtTime(normal, start);
          automation.set(normal, start);
          const delay = graph.hasPitch ? this.lipSync.latency.value : 0;
          const cues = [];
          for (const cue of planPitchCues(estimated, random)) {
            const when = start + cue.at;
            const end = when + cue.duration;
            const bent = normal * cue.factor;
            pitchParam.setValueAtTime(normal, when);
            pitchParam.linearRampToValueAtTime(bent, when + 0.25);
            pitchParam.setValueAtTime(bent, end - 0.27);
            pitchParam.linearRampToValueAtTime(normal, end);
            automation.set(normal, when);
            automation.linear(bent, when + 0.25);
            automation.set(bent, end - 0.27);
            automation.linear(normal, end);
            cues.push({ start: when, end });
            // The worklet delays the voice, so the static waits for the bend to be audible.
            this.audio.burstAt(gi * (smooth ? 0.35 : 1), when + delay, 0.11);
          }
          const clock = new PlaybackClock({
            start,
            duration: buffer.duration,
            rateAt: graph.hasPitch ? () => rate : (time) => automation.valueAt(time),
          });
          this.lipSync.begin({ track, clock, cues, stutters, hasPitch: graph.hasPitch });

          graph.source.onended = () => {
            if (this.source === graph.source) this.source = null;
            // The worklet buffers audio; allow its final samples to drain before disconnecting.
            this.finishTimer = setTimeout(() => {
              graph.dispose();
              if (this.graph === graph) this.graph = null;
              if (run === this.generation) {
                this.audio.stopBursts();
                this.lipSync.end();
                next();
              }
            }, graph.hasPitch ? 400 : 50);
          };
          graph.source.start(start);
          if (!started) {
            started = true;
            this.emit('onAudioStarted', meta);
          }
        })
        .catch((error) => {
          if (error?.name === 'AbortError' || run !== this.generation) return;
          if (usingPiper) {
            this.piperReady = false;
            this.emit('onFallback', error.message, meta);
            this.speak(text, meta);
            return;
          }
          fail(error.prefixed ? error.message : `Synthesis failed: ${error.message}`);
        });
    };
    next();
    return true;
  }
}
