// Strict, dependency-free parser for monologues.xml. Used at build time (to embed an offline
// snapshot) and at runtime (to pick up edits) so DOMParser and its HTML sinks are never needed.
export const MONOLOGUE_LIMITS = Object.freeze({ maxBytes: 256 * 1024, maxQuotes: 500, maxChars: 600 });

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (match, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      const valid = Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : '';
    }
    const key = body.toLowerCase();
    return Object.hasOwn(NAMED, key) ? NAMED[key] : match;
  });
}

function parseAttributes(source) {
  const attributes = {};
  const pattern = /([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(source))) {
    const name = match[1].toLowerCase();
    if (!Object.hasOwn(attributes, name)) attributes[name] = decodeEntities(match[2] ?? match[3] ?? '');
  }
  return attributes;
}

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

function clean(text, max) {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function parseMonologues(xml, limits = MONOLOGUE_LIMITS) {
  if (typeof xml !== 'string') throw new TypeError('Monologue XML must be text.');
  if (xml.length > limits.maxBytes) throw new RangeError('Monologue XML is too large.');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Monologue XML may not declare a DTD or entities.');
  const body = xml.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<aiMonologues\b[^>]*>[\s\S]*<\/aiMonologues>/.test(body)) throw new Error('Missing <aiMonologues> root.');
  const quotes = [];
  const pattern = /<quote\b([^>]*)>([\s\S]*?)<\/quote>/g;
  let match;
  while ((match = pattern.exec(body)) && quotes.length < limits.maxQuotes) {
    const attributes = parseAttributes(match[1]);
    const raw = match[2].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, data) => data.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    if (/</.test(raw)) continue;
    const text = clean(decodeEntities(raw), limits.maxChars);
    if (!text) continue;
    quotes.push({
      text,
      mood: clean(attributes.mood ?? '', 40).toLowerCase() || 'unknown',
      source: clean(attributes.source ?? '', 80) || 'user',
      url: safeUrl(attributes.url),
    });
  }
  return quotes;
}
