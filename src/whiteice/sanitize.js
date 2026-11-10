// WHITE ICE text guards. Everything that can reach speech synthesis, the log, the AI link
// or the desktop bridge passes through here first.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const INVISIBLE = /[\u00AD\u034F\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200D\u2060-\u2064\u206A-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]/g;
// Unicode tag characters can smuggle invisible instructions into AI prompts.
const TAGS = /[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;

function strip(text, pattern) {
  let removed = 0;
  const out = text.replace(pattern, (match) => {
    removed += [...match].length;
    return '';
  });
  return [out, removed];
}

function safeSlice(text, max) {
  if (text.length <= max) return text;
  let end = max;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

export function sanitizeText(input, { maxLength = 5000, multiline = true } = {}) {
  const original = input == null ? '' : String(input);
  let text = original.normalize('NFKC').replace(/\r\n?/g, '\n');
  let removed = 0;
  for (const pattern of [CONTROL, BIDI, INVISIBLE, TAGS]) {
    let count;
    [text, count] = strip(text, pattern);
    removed += count;
  }
  text = multiline
    ? text.replace(/[ \t\f\v\u00A0\u2000-\u200A\u202F\u205F\u3000]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n')
    : text.replace(/\s+/g, ' ');
  text = text.trim();
  const truncated = text.length > maxLength;
  if (truncated) text = safeSlice(text, maxLength).trimEnd();
  return { text, removed, truncated, changed: text !== original };
}

export function cleanText(input, options) {
  return sanitizeText(input, options).text;
}

const WORD = /^\p{L}[\p{L}'-]{1,22}\p{L}$/u;

// Single words the AI may echo back (names, topics). Anything else is dropped.
export function sanitizeWord(input) {
  const word = cleanText(input, { maxLength: 40, multiline: false });
  return WORD.test(word) ? word : '';
}

export function sanitizeName(input) {
  const parts = cleanText(input, { maxLength: 60, multiline: false })
    .split(' ')
    .map(sanitizeWord)
    .filter(Boolean)
    .slice(0, 2);
  const name = parts.join(' ');
  return name.length >= 2 && name.length <= 32 ? name : '';
}
