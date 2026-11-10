export const PIPER_WORKER = 'vendor/piper-tts/tts-worker-3lf-RAqG.js';
export const FALLBACK_SCRIPT = 'mespeak-bundle.js';

// Talks to the bundled Piper worker. The worker keeps the Amy model loaded between
// transmissions; it is only torn down when a synthesis is still running and must be cancelled.
export class PiperClient {
  constructor({ scriptUrl, onStatus = () => {} } = {}) {
    this.scriptUrl = scriptUrl;
    this.onStatus = onStatus;
    this.worker = null;
    this.nextId = 0;
    this.jobs = new Map();
  }

  get busy() {
    return this.jobs.size > 0;
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(this.scriptUrl(PIPER_WORKER), { type: 'module' });
    this.worker = worker;
    worker.onmessage = (event) => {
      const data = event.data || {};
      const job = this.jobs.get(data.requestId);
      if (data.type === 'progress') {
        const progress = data.progress || {};
        const pct = progress.total ? Math.min(100, Math.round((100 * progress.loaded) / progress.total)) : 0;
        if (job) this.onStatus(`Loading bundled Mimic 3 Amy voice… ${pct}%`);
        return;
      }
      if (data.type === 'status') {
        if (job) this.onStatus(String(data.message ?? '').slice(0, 200));
        return;
      }
      if (!job) return;
      this.jobs.delete(data.requestId);
      if (data.type === 'result' && data.audio instanceof ArrayBuffer) job.resolve(data.audio);
      else job.reject(new Error(String(data.message || 'Piper Amy synthesis failed.').slice(0, 200)));
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || 'Local Piper worker failed.');
      for (const job of this.jobs.values()) job.reject(error);
      this.jobs.clear();
      try {
        worker.terminate();
      } catch {
        /* already gone */
      }
      if (this.worker === worker) this.worker = null;
    };
    return worker;
  }

  request(text) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.jobs.set(id, { resolve, reject });
      try {
        this.ensureWorker().postMessage({ type: 'speak', requestId: id, text, baseUrl: new URL('./', document.baseURI).href });
      } catch (error) {
        this.jobs.delete(id);
        reject(error);
      }
    });
  }

  // The worker tracks one request id at a time, so an unfinished synthesis cannot be
  // abandoned safely; terminate the worker instead and let the next request reload it.
  cancel() {
    if (!this.jobs.size) return;
    const error = new DOMException('Transmission cancelled.', 'AbortError');
    for (const job of this.jobs.values()) job.reject(error);
    this.jobs.clear();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        /* already gone */
      }
      this.worker = null;
    }
  }
}

let fallbackPromise = null;

// The eSpeak fallback is large, so it is only fetched when the neural voice is unavailable.
export function loadFallbackVoice(scriptUrl) {
  if (window.bundledTTS) return Promise.resolve(window.bundledTTS);
  if (!fallbackPromise) {
    fallbackPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = scriptUrl(FALLBACK_SCRIPT);
      script.async = true;
      script.onload = () => (window.bundledTTS ? resolve(window.bundledTTS) : reject(new Error('Fallback voice not loaded')));
      script.onerror = () => reject(new Error('Fallback voice not loaded'));
      document.head.append(script);
    }).catch((error) => {
      fallbackPromise = null;
      throw error;
    });
  }
  return fallbackPromise;
}
