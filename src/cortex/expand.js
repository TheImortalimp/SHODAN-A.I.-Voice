import { ShuffleBag } from './random.js';

// #symbol# or #symbol.mod.mod#; {a|b} inline choice; [optional] text.
const SYMBOL = /#([A-Za-z][\w]*)((?:\.[a-z]+)*)#/g;
const CHOICE = /\{([^{}]*)\}/;
const OPTIONAL = /\[([^[\]]*)\]/;

export function withArticle(phrase) {
  const text = String(phrase).trim();
  const first = text.split(/\s+/)[0] || '';
  const letters = first.replace(/[^A-Za-z]/g, '');
  let an;
  if (letters.length > 1 && letters === letters.toUpperCase()) an = /^[AEFHILMNORSX]/.test(letters);
  else an = /^(?:[aeiou]|hour|honest|honou?r|heir)/i.test(first) && !/^(?:uni|use|usu|uti|ure|eu|one|once|ubiq)/i.test(first);
  return `${an ? 'an' : 'a'} ${text}`;
}

const MODIFIERS = {
  cap: (value) => value.charAt(0).toUpperCase() + value.slice(1),
  a: withArticle,
  lower: (value) => value.toLowerCase(),
};

// Normalises spacing and capitalisation after expansion. Ellipses keep a lowercase continuation.
export function tidy(text) {
  let out = String(text)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/,\s*([.!?])/g, '$1')
    .replace(/([!?])\./g, '$1')
    .trim();
  out = out.replace(/(^|[^.][.!?]\s+)(\p{Ll})/gu, (match, lead, letter) => lead + letter.toUpperCase());
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (out && !/[.!?…]$/.test(out)) out += '.';
  return out;
}

export class Expander {
  constructor(lexicon, random, { maxDepth = 8 } = {}) {
    this.lexicon = lexicon;
    this.random = random;
    this.maxDepth = maxDepth;
    this.bags = new Map();
  }

  draw(key, items) {
    let bag = this.bags.get(key);
    if (!bag || bag.items !== items) {
      bag = new ShuffleBag(items, this.random);
      this.bags.set(key, bag);
    }
    return bag.next();
  }

  // literals are inserted as-is (never re-expanded, so user words cannot inject syntax);
  // symbols are extra per-call symbol lists that are expanded like lexicon entries.
  expand(template, { literals = {}, symbols = {} } = {}, depth = 0) {
    let text = String(template ?? '');
    if (depth > this.maxDepth) return text.replace(SYMBOL, '');
    for (let guard = 0; guard < 64 && CHOICE.test(text); guard++) {
      text = text.replace(CHOICE, (_, body) => this.random.pick(body.split('|')));
    }
    for (let guard = 0; guard < 64 && OPTIONAL.test(text); guard++) {
      text = text.replace(OPTIONAL, (_, body) => (this.random() < 0.45 ? body : ''));
    }
    return text.replace(SYMBOL, (match, name, mods) => {
      let value = '';
      if (Object.hasOwn(literals, name)) {
        const literal = typeof literals[name] === 'function' ? literals[name]() : literals[name];
        value = literal == null ? '' : String(literal);
      } else if (Object.hasOwn(symbols, name) && symbols[name]?.length) {
        value = this.expand(this.draw(`runtime:${name}`, symbols[name]), { literals, symbols }, depth + 1);
      } else if (Object.hasOwn(this.lexicon, name)) {
        value = this.expand(this.draw(name, this.lexicon[name]), { literals, symbols }, depth + 1);
      }
      for (const mod of mods.split('.')) {
        if (mod && Object.hasOwn(MODIFIERS, mod)) value = MODIFIERS[mod](value);
      }
      return value;
    });
  }
}
