import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MONOLOGUE_LIMITS, parseMonologues } from '../src/cortex/monologues.js';

const xml = readFileSync(new URL('../public/monologues.xml', import.meta.url), 'utf8');
const wrap = (body) => `<?xml version="1.0"?><aiMonologues>${body}</aiMonologues>`;

test('the bundled monologues parse cleanly', () => {
  const quotes = parseMonologues(xml);
  assert.ok(quotes.length >= 60, `only ${quotes.length} quotes`);
  for (const quote of quotes) {
    assert.ok(quote.text.length > 10 && quote.text.length <= MONOLOGUE_LIMITS.maxChars, quote.text);
    assert.match(quote.mood, /^[a-z-]+$/);
    assert.doesNotMatch(quote.text, /[<>]|\s{2}/);
  }
  const game = quotes.filter((quote) => quote.source !== 'user');
  assert.ok(game.length >= 2);
  for (const quote of game) assert.match(quote.url, /^https:\/\//);
  assert.equal(new Set(quotes.map((quote) => quote.text)).size, quotes.length, 'duplicate monologue');
});

test('the parser refuses DTDs, entity declarations and a missing root', () => {
  assert.throws(() => parseMonologues('<!DOCTYPE x [<!ENTITY a "b">]><aiMonologues></aiMonologues>'), /DTD/);
  assert.throws(() => parseMonologues('<quotes><quote>hi</quote></quotes>'), /root/);
  assert.throws(() => parseMonologues(42), TypeError);
  assert.throws(() => parseMonologues(wrap('x'.repeat(MONOLOGUE_LIMITS.maxBytes))), RangeError);
});

test('the parser drops nested markup and unsafe URLs but keeps CDATA and entities as text', () => {
  const quotes = parseMonologues(wrap(`
    <quote mood="x">Hi <b>there</b></quote>
    <quote mood="Menace" url="javascript:alert(1)">Plain line &amp; more &#x41;&#66; &bogus;</quote>
    <quote><![CDATA[a < b & c]]></quote>
    <!-- <quote>commented out</quote> -->
    <quote source="System Shock" url="https://example.com/a">  spaced
      out  </quote>
  `));
  assert.deepEqual(quotes, [
    { text: 'Plain line & more AB &bogus;', mood: 'menace', source: 'user', url: '' },
    { text: 'a < b & c', mood: 'unknown', source: 'user', url: '' },
    { text: 'spaced out', mood: 'unknown', source: 'System Shock', url: 'https://example.com/a' },
  ]);
});

test('the parser caps the number of quotes', () => {
  const body = Array.from({ length: 20 }, (_, i) => `<quote>line ${i}</quote>`).join('');
  assert.equal(parseMonologues(wrap(body), { ...MONOLOGUE_LIMITS, maxQuotes: 5 }).length, 5);
});
