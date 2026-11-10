import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCsp, SECURITY_HEADERS } from '../src/whiteice/csp.js';
import { LICENSE_FILES, MANIFEST_NAME } from '../tools/vite-plugins.js';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const skip = existsSync(path.join(dist, MANIFEST_NAME)) ? false : 'dist/ not built (run npm run build)';
const read = (rel, encoding) => readFileSync(path.join(dist, ...rel.split('/')), encoding);
const PAGES = ['shodan.html', 'index.html'];

function listFiles(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), rel) : [rel];
  });
}

test('built pages carry the WHITE ICE policy before any script', { skip }, () => {
  for (const page of PAGES) {
    const html = read(page, 'utf8');
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html);
    assert.ok(csp, `${page}: CSP meta missing`);
    assert.equal(csp[1].replace(/&amp;/g, '&'), buildCsp(), `${page}: CSP drifted from csp.js`);
    assert.match(html, /^<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta http-equiv="Content-Security-Policy"/i, `${page}: CSP must follow the charset`);
    assert.match(html, /<meta name="referrer" content="no-referrer">/, page);
    const firstScript = html.search(/<script\b/i);
    if (firstScript !== -1) assert.ok(csp.index < firstScript, `${page}: script before CSP`);
  }
});

test('built pages contain no inline script, style or event handlers', { skip }, () => {
  for (const page of PAGES) {
    const html = read(page, 'utf8');
    assert.doesNotMatch(html, /<style\b/i, `${page}: <style> needs 'unsafe-inline'`);
    for (const [tag] of html.matchAll(/<[a-z][^>]*>/gi)) {
      assert.doesNotMatch(tag, /\sstyle\s*=/i, `${page}: inline style in ${tag.slice(0, 80)}`);
      assert.doesNotMatch(tag, /\son[a-z]+\s*=/i, `${page}: inline handler in ${tag.slice(0, 80)}`);
      assert.doesNotMatch(tag, /(?:src|href)\s*=\s*"\/(?!\/)/i, `${page}: root-absolute URL breaks sub-folder hosting: ${tag.slice(0, 80)}`);
      assert.doesNotMatch(tag, /(?:src|href)\s*=\s*"\s*javascript:/i, `${page}: javascript: URL`);
    }
    for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
      assert.ok(/\ssrc="\.\//.test(tag) || /type="application\/ld\+json"/.test(tag), `${page}: inline script ${tag}`);
    }
  }
  const shodan = read('shodan.html', 'utf8');
  assert.match(shodan, /<script type="module" crossorigin src="\.\/assets\/shodan-[\w-]+\.js"><\/script>/);
  assert.match(shodan, /<meta name="shodan:embedded-image" content="data:image\/png;base64,[A-Za-z0-9+/]+=*">/);
  assert.doesNotMatch(shodan, /@vite\/client|<!--SHODAN:/);
  assert.match(read('index.html', 'utf8'), /<meta http-equiv="refresh" content="0; url=shodan\.html">/);
});

test('the integrity manifest hashes every shipped file and nothing else', { skip }, () => {
  const manifest = JSON.parse(read(MANIFEST_NAME, 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.algorithm, 'SHA-256');
  assert.equal(manifest.entry, 'shodan.html');
  assert.equal(manifest.csp, buildCsp({ header: true }));
  assert.match(manifest.csp, /frame-ancestors 'none'/);
  assert.deepEqual(manifest.headers, SECURITY_HEADERS);
  const shipped = listFiles(dist).filter((rel) => rel !== MANIFEST_NAME).sort();
  assert.deepEqual(Object.keys(manifest.files).sort(), shipped);
  for (const rel of shipped) {
    const data = read(rel);
    const entry = manifest.files[rel];
    assert.equal(entry.size, data.length, `${rel}: size`);
    assert.equal(entry.sha256, createHash('sha256').update(data).digest('hex'), `${rel}: hash`);
  }
  assert.equal(shipped.some((rel) => rel.endsWith('.map')), false, 'source maps must not ship');
  for (const required of ['shodan.html', 'index.html', 'shodan.json', 'monologues.xml', 'voice-packs/amy/en_US-amy-medium.onnx', 'voice-packs/amy/LICENSE-CC-BY-SA-4.0.txt']) {
    assert.ok(shipped.includes(required), `missing ${required}`);
  }
});

test('every build ships the current licence notices', { skip }, () => {
  for (const [shipped, source] of Object.entries(LICENSE_FILES)) {
    assert.equal(read(shipped, 'utf8'), readFileSync(new URL(`../${source}`, import.meta.url), 'utf8'), `${shipped} is stale`);
  }
  assert.match(read('licenses/GPL-3.0.txt', 'utf8'), /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
});
