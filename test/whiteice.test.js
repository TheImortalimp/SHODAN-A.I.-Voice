import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeConfig } from '../src/whiteice/config.js';
import { buildCsp, cspDirectives, LOOPBACK_CONNECT_SOURCES } from '../src/whiteice/csp.js';
import { joinEndpoint, validateEndpoint } from '../src/whiteice/endpoint.js';
import { createWhiteIce } from '../src/whiteice/index.js';
import { Cooldowns, RateLimiter } from '../src/whiteice/ratelimit.js';
import { sanitizeName, sanitizeText, sanitizeWord } from '../src/whiteice/sanitize.js';

test('sanitizeText strips control, bidi, invisible and tag characters and counts them', () => {
  const result = sanitizeText('a\u0000b\u202Ec\u200Bd\u{E0041}e');
  assert.equal(result.text, 'abcde');
  assert.equal(result.removed, 4);
  assert.equal(result.changed, true);
});

test('sanitizeText normalises compatibility characters and whitespace', () => {
  assert.equal(sanitizeText('ｆｕｌｌ\u00A0width').text, 'full width');
  assert.equal(sanitizeText('a\n\n\n\nb   c').text, 'a\n\nb c');
  assert.equal(sanitizeText('a\r\n\r\nb\tc', { multiline: false }).text, 'a b c');
  assert.equal(sanitizeText(null).text, '');
});

test('sanitizeText truncates without splitting a surrogate pair', () => {
  const result = sanitizeText('ab😀', { maxLength: 3 });
  assert.equal(result.text, 'ab');
  assert.equal(result.truncated, true);
});

test('sanitizeWord and sanitizeName only keep plain words', () => {
  assert.equal(sanitizeWord('Rebecca'), 'Rebecca');
  assert.equal(sanitizeWord("D'Arcy"), "D'Arcy");
  assert.equal(sanitizeWord('<script>'), '');
  assert.equal(sanitizeWord('ab'), '');
  assert.equal(sanitizeName('Rebecca Lansing'), 'Rebecca Lansing');
  assert.equal(sanitizeName('Bob <img>'), 'Bob');
  assert.equal(sanitizeName('{{}}'), '');
});

test('RateLimiter refills over time and reports the wait', () => {
  let now = 0;
  const limiter = new RateLimiter({ capacity: 2, refillPerSecond: 1, now: () => now });
  assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), true);
  assert.equal(limiter.take(), false);
  assert.equal(limiter.retryAfterMs(), 1000);
  now = 500;
  assert.equal(limiter.take(), false);
  now = 1000;
  assert.equal(limiter.take(), true);
  assert.throws(() => new RateLimiter({ capacity: 0, refillPerSecond: 1 }), RangeError);
});

test('Cooldowns block a key until its cooldown passes', () => {
  let now = 0;
  const cooldowns = new Cooldowns(() => now);
  assert.equal(cooldowns.ready('x'), true);
  assert.equal(cooldowns.tryArm('x', 100), true);
  assert.equal(cooldowns.ready('x'), false);
  assert.equal(cooldowns.tryArm('x', 100), false);
  now = 100;
  assert.equal(cooldowns.ready('x'), true);
  cooldowns.arm('y', Infinity);
  now = 1e12;
  assert.equal(cooldowns.ready('y'), false);
});

test('mergeConfig clamps numbers, rejects wrong types and ignores unknown keys', () => {
  const base = mergeConfig({ defaults: { autoSpeak: false, idleDelayMs: 60000 }, limits: { maxCharacters: 5000 } }, null);
  const hostile = JSON.parse(
    '{"defaults":{"__proto__":{"polluted":1},"autoSpeak":"yes","idleDelayMs":1,"visualGlitch":500,"phaseDepth":"7","evil":1},"limits":{"maxCharacters":1e9}}',
  );
  const merged = mergeConfig(base, hostile);
  assert.equal(merged.defaults.autoSpeak, false);
  assert.equal(merged.defaults.idleDelayMs, 5000);
  assert.equal(merged.defaults.visualGlitch, 100);
  assert.equal(Object.hasOwn(merged.defaults, 'phaseDepth'), true);
  assert.equal(merged.defaults.phaseDepth, undefined);
  assert.equal(Object.hasOwn(merged.defaults, 'evil'), false);
  assert.equal(merged.limits.maxCharacters, 20000);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(merged.defaults), Object.prototype);
  // The input objects are never mutated.
  assert.equal(base.defaults.idleDelayMs, 60000);
});

test('validateEndpoint only accepts loopback http(s) endpoints', () => {
  assert.deepEqual(validateEndpoint('http://localhost:11434/v1/'), { ok: true, url: 'http://localhost:11434/v1', host: 'localhost' });
  assert.equal(validateEndpoint('https://127.0.0.1:8080').url, 'https://127.0.0.1:8080');
  assert.equal(validateEndpoint('http://LOCALHOST:1234/v1').ok, true);
  const refusals = {
    'http://example.com/v1': /loopback/,
    'http://localhost.evil.com/v1': /loopback/,
    'http://192.168.1.10:11434/v1': /loopback/,
    'http://user:pass@localhost/v1': /Credentials/,
    'http://localhost/v1?x=1': /Query strings/,
    'http://localhost/v1#frag': /Query strings/,
    'ftp://localhost/': /http/,
    'javascript:alert(1)': /http/,
    'not a url': /valid URL/,
  };
  for (const [input, reason] of Object.entries(refusals)) {
    const result = validateEndpoint(input);
    assert.equal(result.ok, false, input);
    assert.match(result.reason, reason, input);
  }
  assert.equal(joinEndpoint('http://localhost:11434/v1/', '/models'), 'http://localhost:11434/v1/models');
});

test('the content security policy allows no inline script, eval or remote hosts', () => {
  const meta = buildCsp();
  const header = buildCsp({ header: true });
  assert.match(meta, /script-src 'self' 'wasm-unsafe-eval'(;|$)/);
  assert.match(meta, /require-trusted-types-for 'script'/);
  assert.match(meta, /trusted-types shodan/);
  for (const [name, sources] of Object.entries(cspDirectives({ header: true }))) {
    for (const source of sources) {
      assert.ok(!["'unsafe-inline'", "'unsafe-eval'", '*', 'http:', 'https:', 'data:'].includes(source) || (name === 'img-src' && source === 'data:'), `${name} ${source}`);
      if (/^https?:/.test(source)) assert.ok(LOOPBACK_CONNECT_SOURCES.includes(source), `${name} ${source}`);
    }
  }
  assert.doesNotMatch(meta, /frame-ancestors/);
  assert.match(header, /frame-ancestors 'none'/);
  for (const source of cspDirectives()['connect-src']) {
    assert.ok(source === "'self'" || LOOPBACK_CONNECT_SOURCES.includes(source), source);
  }
});

test('the WHITE ICE core rate-limits known channels and ignores inherited keys', () => {
  const ice = createWhiteIce();
  assert.equal(ice.allow('__proto__'), true);
  assert.equal(ice.allow('constructor'), true);
  assert.equal(ice.retryAfter('toString'), 0);
  for (let i = 0; i < 4; i++) assert.equal(ice.allow('ai'), true);
  assert.equal(ice.allow('ai'), false);
  assert.ok(ice.retryAfter('ai') > 0);
  assert.equal(ice.snapshot().rateLimited, 1);
  assert.equal(ice.text('a\u202Eb\u200Bc'), 'abc');
  assert.equal(ice.snapshot().sanitized, 1);
  assert.equal(ice.snapshot().removedChars, 2);
  const seen = [];
  const off = ice.onChange((stats) => seen.push(stats.blocked));
  ice.noteBlocked('test');
  off();
  ice.noteBlocked('test');
  assert.deepEqual(seen, [0, 1]);
});

test('the desktop bridge only accepts well-formed host messages', () => {
  let handler = null;
  const posted = [];
  const webview = {
    addEventListener: (type, fn) => {
      if (type === 'message') handler = fn;
    },
    postMessage: (message) => posted.push(message),
  };
  globalThis.window = { chrome: { webview } };
  try {
    const ice = createWhiteIce();
    const commands = [];
    const host = ice.connectHost((name, value) => commands.push([name, value]));
    assert.ok(host && handler);
    host.post({ type: 'ready' });
    assert.deepEqual(posted, [{ type: 'ready' }]);
    handler({ data: 'transmit' });
    handler({ data: { type: 'eval', code: 'alert(1)' } });
    handler({ data: { type: 'command', name: '__proto__' } });
    assert.equal(ice.snapshot().blocked, 3);
    handler({ data: { type: 'command', name: 'transmit', value: 'Look at you.' } });
    handler({ data: { type: 'host-state', float: true, compact: true } });
    assert.deepEqual(commands, [['transmit', 'Look at you.'], ['host-state', { type: 'host-state', float: true, compact: true }]]);
    handler({
      data: {
        type: 'whiteice-status',
        integrity: { verified: '48', total: 48, failed: 'x', locked: 1 },
        amsi: { available: true, scanned: 12, detections: 0 },
        smartScreen: 'yes',
        version: '5.0.0<script>',
      },
    });
    assert.deepEqual(ice.snapshot().host, {
      kind: 'webview2',
      integrity: { verified: 48, total: 48, failed: 0, locked: true },
      amsi: { available: true, scanned: 12, detections: 0 },
      smartScreen: true,
      version: '5.0.0script',
    });
    for (let i = 0; i < 40; i++) handler({ data: { type: 'command', name: 'stop' } });
    assert.ok(commands.length < 2 + 40, 'bridge flood is rate limited');
    assert.ok(ice.snapshot().rateLimited > 0);
  } finally {
    delete globalThis.window;
  }
  globalThis.window = {};
  try {
    assert.equal(createWhiteIce().connectHost(() => {}), null, 'no host outside WebView2');
  } finally {
    delete globalThis.window;
  }
});
