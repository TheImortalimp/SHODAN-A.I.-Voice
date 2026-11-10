import { levelFromBytes, shaperCurve } from './voice.js';

const PHASE_CENTERS = [390, 760, 1480, 2860];
const PHASE_SWEEPS = [85, 155, 300, 500];
const PHASE_HZ = 4.32;

// Owns the AudioContext, the SoundTouch worklet module and the static bursts that land on
// pitch-glitch cues. The voice graph itself is the original SHODAN chain.
export class AudioEngine {
  constructor({ scriptUrl, random = Math.random } = {}) {
    this.scriptUrl = scriptUrl;
    this.random = random;
    this.context = null;
    this.noise = null;
    this.pitchModule = null;
    this.bursts = new Set();
  }

  init() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return null;
      if (!this.context) {
        const context = new Context();
        const noise = context.createBuffer(1, Math.floor(context.sampleRate * 0.16), context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.context = context;
        this.noise = noise;
      }
      if (this.context.state === 'suspended') this.context.resume().catch(() => {});
      return this.context;
    } catch {
      return null;
    }
  }

  // SoundTouch adjusts pitch independently of the source tempo on supported browsers.
  ensurePitchModule() {
    const context = this.context;
    if (!context?.audioWorklet || !window.AudioWorkletNode) return Promise.resolve(false);
    if (!this.pitchModule) {
      this.pitchModule = Promise.resolve()
        .then(() => context.audioWorklet.addModule(this.scriptUrl('soundtouch-processor.js')))
        .then(() => true)
        .catch(() => false);
    }
    return this.pitchModule;
  }

  // Short band-passed static, scheduled on the audio clock exactly where a pitch glitch lands.
  burstAt(amount, when, duration) {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.noise) return;
    try {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = this.noise;
      source.loop = true;
      filter.type = 'bandpass';
      filter.frequency.value = 1300 + this.random() * 2400;
      filter.Q.value = 2 + this.random() * 3;
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime((0.012 * amount) / 35, when + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      this.bursts.add(source);
      source.onended = () => {
        this.bursts.delete(source);
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      source.start(when);
      source.stop(when + duration + 0.005);
    } catch {
      /* static is decorative */
    }
  }

  stopBursts() {
    for (const node of this.bursts) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
    }
    this.bursts.clear();
  }

  /**
   * Builds the SHODAN voice chain for one chunk: optional SoundTouch pitch worklet, smooth
   * voice cleanup, four modulated all-pass phase stages, dry path, distorted echo and meter.
   */
  buildGraph(buffer, { pitch, rate, hasPitch, smooth, tiltNorm, phaseAmount, glitchIntensity }) {
    const context = this.context;
    const source = context.createBufferSource();
    const dry = context.createGain();
    const output = context.createGain();
    const filter = context.createBiquadFilter();
    const shape = context.createWaveShaper();
    const delay = context.createDelay();
    const echo = context.createGain();
    const meter = context.createAnalyser();
    const amount = glitchIntensity / 60;
    source.buffer = buffer;
    dry.gain.value = smooth ? 0.96 : 1 - amount * 0.22;
    output.gain.value = smooth ? 0.78 : 0.8;
    filter.type = 'bandpass';
    filter.frequency.value = 1550;
    filter.Q.value = 0.5;
    shape.curve = shaperCurve(amount);
    delay.delayTime.value = 0.038;
    echo.gain.value = amount * (smooth ? 0.045 : 0.2);
    meter.fftSize = 256;

    let pitchNode = null;
    let voiceInput = source;
    if (hasPitch) {
      try {
        pitchNode = new AudioWorkletNode(context, 'soundtouch-processor', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        source.playbackRate.value = rate;
        pitchNode.parameters.get('playbackRate').value = rate;
        source.connect(pitchNode);
        voiceInput = pitchNode;
      } catch {
        pitchNode = null;
        hasPitch = false;
      }
    }

    // Gentle vocal cleanup applies to the actual speech before the dry and effects paths.
    const voiceFilters = [];
    let processed = voiceInput;
    if (smooth) {
      const hp = context.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 95;
      hp.Q.value = 0.7;
      const mud = context.createBiquadFilter();
      mud.type = 'peaking';
      mud.frequency.value = 330;
      mud.Q.value = 0.8;
      mud.gain.value = -1.1 - tiltNorm * 1.5;
      const presence = context.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 2600 + tiltNorm * 500;
      presence.Q.value = 0.7;
      presence.gain.value = 0.3 + tiltNorm * 1.8;
      const harsh = context.createBiquadFilter();
      harsh.type = 'peaking';
      harsh.frequency.value = 5800;
      harsh.Q.value = 0.8;
      harsh.gain.value = -2.8 + tiltNorm * 0.8;
      const lowpass = context.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 8500;
      lowpass.Q.value = 0.65;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 2.5;
      compressor.attack.value = 0.012;
      compressor.release.value = 0.18;
      voiceFilters.push(hp, mud, presence, harsh, lowpass, compressor);
      for (const node of voiceFilters) {
        processed.connect(node);
        processed = node;
      }
    }

    const phaseStages = [];
    const phaseOscillators = [];
    const phaseNodes = [];
    let phaseInput = processed;
    const period = 1 / PHASE_HZ;
    for (let i = 0; i < PHASE_CENTERS.length; i++) {
      const allpass = context.createBiquadFilter();
      allpass.type = 'allpass';
      allpass.frequency.setValueAtTime(PHASE_CENTERS[i], context.currentTime);
      allpass.Q.value = 1.05;
      phaseInput.connect(allpass);
      phaseInput = allpass;
      phaseStages.push(allpass);
      const lfo = context.createOscillator();
      const depth = context.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = PHASE_HZ;
      depth.gain.value = PHASE_SWEEPS[i] * phaseAmount;
      lfo.connect(depth);
      depth.connect(allpass.frequency);
      lfo.start(context.currentTime, (period * i) / 4);
      phaseOscillators.push(lfo);
      phaseNodes.push(depth);
    }
    const phaseWet = context.createGain();
    phaseWet.gain.setTargetAtTime(0.48 * Math.abs(phaseAmount), context.currentTime, 0.12);
    phaseInput.connect(phaseWet);
    phaseWet.connect(output);
    processed.connect(dry);
    dry.connect(output);
    processed.connect(filter);
    filter.connect(shape);
    shape.connect(delay);
    delay.connect(echo);
    echo.connect(output);
    output.connect(meter);
    meter.connect(context.destination);

    let disposed = false;
    const samples = new Uint8Array(meter.fftSize);
    return {
      source,
      pitchNode,
      hasPitch,
      meter,
      pitchParam: hasPitch ? pitchNode.parameters.get('pitch') : source.playbackRate,
      normal: hasPitch ? pitch : pitch * rate,
      level() {
        if (disposed) return 0;
        meter.getByteTimeDomainData(samples);
        return levelFromBytes(samples);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const oscillator of phaseOscillators) {
          try {
            oscillator.stop();
          } catch {
            /* not started */
          }
        }
        for (const node of [source, pitchNode, ...voiceFilters, ...phaseStages, ...phaseNodes, phaseWet, dry, filter, shape, delay, echo, output, meter]) {
          if (!node) continue;
          try {
            node.disconnect();
          } catch {
            /* already disconnected */
          }
        }
      },
    };
  }
}
