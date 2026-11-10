import { TRUSTED_TYPES_POLICY } from './csp.js';
import { RateLimiter } from './ratelimit.js';
import { sanitizeText, sanitizeWord } from './sanitize.js';

// Script URLs the page may load. Anything else is refused by the Trusted Types policy.
const SCRIPT_ALLOWLIST = [
  /\/vendor\/piper-tts\/tts-worker-[\w-]+\.js$/,
  /\/mespeak-bundle\.js$/,
  /\/soundtouch-processor\.js$/,
];

const HOST_MESSAGE_TYPES = new Set(['whiteice-status', 'command', 'host-state']);
const HOST_COMMANDS = new Set(['transmit', 'generate', 'stop', 'autonomous', 'float', 'reaction']);

let policy = null;

function createPolicy(onBlocked) {
  if (policy || !window.trustedTypes?.createPolicy) return policy;
  try {
    policy = window.trustedTypes.createPolicy(TRUSTED_TYPES_POLICY, {
      createScriptURL(input) {
        const url = new URL(input, document.baseURI);
        if (url.origin !== location.origin || !SCRIPT_ALLOWLIST.some((rule) => rule.test(url.pathname))) {
          onBlocked(`script URL refused: ${url.pathname}`);
          throw new TypeError('WHITE ICE refused an unexpected script URL.');
        }
        return url.href;
      },
    });
  } catch {
    policy = null;
  }
  return policy;
}

export function createWhiteIce({ log = () => {} } = {}) {
  const stats = {
    sanitized: 0,
    removedChars: 0,
    blocked: 0,
    rateLimited: 0,
    cspViolations: 0,
    framed: false,
    trustedTypes: false,
    host: null,
  };
  const listeners = new Set();
  const limiters = {
    api: new RateLimiter({ capacity: 8, refillPerSecond: 0.4 }),
    ai: new RateLimiter({ capacity: 4, refillPerSecond: 1 / 12 }),
    reaction: new RateLimiter({ capacity: 2, refillPerSecond: 1 / 25 }),
    bridge: new RateLimiter({ capacity: 30, refillPerSecond: 6 }),
  };
  let lastLogged = 0;

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener(snapshot());
      } catch {
        /* listener errors must not break the guard */
      }
    }
  };

  function snapshot() {
    return JSON.parse(JSON.stringify(stats));
  }

  function noteBlocked(reason) {
    stats.blocked += 1;
    const now = Date.now();
    if (now - lastLogged > 1500) {
      lastLogged = now;
      log(`Blocked: ${reason}`, 'WHITE ICE');
    }
    notify();
  }

  function text(input, options) {
    const result = sanitizeText(input, options);
    if (result.removed) {
      stats.sanitized += 1;
      stats.removedChars += result.removed;
      notify();
    }
    return result.text;
  }

  const limiterFor = (kind) => (Object.hasOwn(limiters, kind) ? limiters[kind] : null);

  function allow(kind) {
    const limiter = limiterFor(kind);
    if (!limiter || limiter.take()) return true;
    stats.rateLimited += 1;
    notify();
    return false;
  }

  function retryAfter(kind) {
    return limiterFor(kind)?.retryAfterMs() ?? 0;
  }

  function scriptUrl(path) {
    const trusted = createPolicy(noteBlocked);
    stats.trustedTypes = !!trusted;
    return trusted ? trusted.createScriptURL(path) : new URL(path, document.baseURI).href;
  }

  function installHooks() {
    document.addEventListener('securitypolicyviolation', (event) => {
      stats.cspViolations += 1;
      noteBlocked(`${event.effectiveDirective || event.violatedDirective} → ${event.blockedURI || 'inline'}`);
    });
    try {
      stats.framed = window.top !== window.self;
    } catch {
      stats.framed = true;
    }
    if (stats.framed) {
      document.documentElement.classList.add('whiteice-framed');
      log('Embedded inside another page. Automation handles are disabled.', 'WHITE ICE');
    }
    createPolicy(noteBlocked);
    stats.trustedTypes = !!policy;
    // A self-XSS warning: people are sometimes tricked into pasting code into DevTools.
    try {
      console.log(
        '%cWHITE ICE%c\nThis console is for developers. If someone told you to paste code here, they are trying to hijack this page.\nClose it, insect.',
        'color:#b7f76a;background:#07100b;font:700 22px monospace;padding:4px 10px;',
        'color:#d9e7d9;font:13px monospace;',
      );
    } catch {
      /* console may be unavailable */
    }
    notify();
  }

  // Messages from the WebView2 desktop host are schema-checked before use.
  function connectHost(onCommand) {
    const webview = window.chrome?.webview;
    if (!webview?.addEventListener) return null;
    stats.host = { kind: 'webview2', integrity: null, amsi: null, smartScreen: null };
    webview.addEventListener('message', (event) => {
      if (!allow('bridge')) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || !HOST_MESSAGE_TYPES.has(data.type)) {
        noteBlocked('malformed host message');
        return;
      }
      if (data.type === 'whiteice-status') {
        const integrity = data.integrity && typeof data.integrity === 'object' ? data.integrity : null;
        const amsi = data.amsi && typeof data.amsi === 'object' ? data.amsi : null;
        stats.host = {
          kind: 'webview2',
          integrity: integrity && {
            verified: Number(integrity.verified) || 0,
            total: Number(integrity.total) || 0,
            failed: Number(integrity.failed) || 0,
            locked: !!integrity.locked,
          },
          amsi: amsi && {
            available: !!amsi.available,
            scanned: Number(amsi.scanned) || 0,
            detections: Number(amsi.detections) || 0,
          },
          smartScreen: !!data.smartScreen,
          version: sanitizeWord(data.version) || String(data.version ?? '').replace(/[^\w.+-]/g, '').slice(0, 32),
        };
        notify();
        return;
      }
      if (data.type === 'command') {
        if (!HOST_COMMANDS.has(data.name)) {
          noteBlocked(`unknown host command ${String(data.name).slice(0, 24)}`);
          return;
        }
        onCommand?.(data.name, data.value);
        return;
      }
      if (data.type === 'host-state') onCommand?.('host-state', data);
    });
    return {
      post(message) {
        try {
          webview.postMessage(message);
        } catch {
          /* host unavailable */
        }
      },
    };
  }

  return {
    stats,
    snapshot,
    onChange(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    text,
    word: sanitizeWord,
    allow,
    retryAfter,
    noteBlocked,
    scriptUrl,
    installHooks,
    connectHost,
  };
}

export function deepFreeze(object) {
  for (const value of Object.values(object)) {
    if (value && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) deepFreeze(value);
  }
  return Object.freeze(object);
}
