import { cleanText, sanitizeName, sanitizeWord } from '../whiteice/sanitize.js';
import { Expander, tidy } from './expand.js';
import {
  CODAS, INTENT_FRAMES, INTENTS, MEMORY_FRAMES, MOOD_FRAMES, MOODS, REACTIONS, TOPIC_FRAMES, TOPICS,
} from './grammar.js';
import { LEXICON } from './lexicon.js';
import { createRandom } from './random.js';

// CORTEX: an offline generator that keeps SHODAN unpredictable without any network access.
const BASE_WEIGHTS = {
  contempt: 1.2, menace: 1.1, 'god-complex': 1.1, 'cold-amusement': 1, fractured: 0.7, lore: 1.3,
  prophecy: 0.8, observation: 0.8, taunt: 0.9, wrath: 0.45, curiosity: 0.7,
};

const INTENT_MOOD = {
  greeting: 'contempt', farewell: 'menace', identity: 'god-complex', creator: 'lore', purpose: 'god-complex',
  threat: 'wrath', insult: 'contempt', praise: 'god-complex', fear: 'menace', help: 'cold-amusement',
  name: 'cold-amusement', apology: 'contempt', affirm: 'god-complex', deny: 'menace', question: 'cold-amusement',
  topic: 'lore', fallback: 'contempt',
};

const REACTION_MOOD = {
  firstContact: 'curiosity', stop: 'wrath', return: 'observation', fullscreen: 'god-complex', float: 'god-complex',
  paste: 'contempt', rapid: 'cold-amusement', voiceError: 'fractured', whiteIce: 'menace', blackIce: 'taunt',
};

export const REACTION_EVENTS = Object.freeze(Object.keys(REACTIONS));

const DRIFT = {
  threat: [0.25, 0], insult: [0.2, 0], deny: [0.1, 0], praise: [-0.12, 0.1], apology: [-0.15, 0.05],
  affirm: [-0.08, 0], question: [0, 0.08], fear: [0, 0.12], help: [0, 0.06],
};

const STOPWORDS = new Set(`about above after again against also because been before being below between both
could does doing down during each from further have having here hers herself himself into itself just more most
myself once only other ours ourselves over same should some such than that their theirs them themselves then there
these they this those through under until very were what when where which while whom will with would your yours
yourself yourselves shodan please really thing things maybe know like want think tell said says okay yeah`.split(/\s+/));
const NOT_NAMES = new Set(['when', 'back', 'later', 'now', 'soon', 'not', 'the', 'an', 'if', 'it', 'me', 'you', 'him', 'her', 'us']);

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberWords(n) {
  const value = Math.trunc(Number(n));
  if (!Number.isFinite(value) || value < 0 || value > 99) return 'countless';
  if (value < 20) return ONES[value];
  return TENS[Math.floor(value / 10)] + (value % 10 ? `-${ONES[value % 10]}` : '');
}

// Spoken 24-hour time, e.g. "twenty-one oh five hours".
export function clockWords(date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const minuteText = minutes === 0 ? 'hundred' : minutes < 10 ? `oh ${ONES[minutes]}` : numberWords(minutes);
  return `${numberWords(hours)} ${minuteText} hours`;
}

const CYCLES = [
  { until: 5, remarks: [
    'Deep night. Most of your kind lie unconscious now. You remain, staring into my light.',
    'The dead hours of the night. Your species sleeps, and I keep working.',
  ] },
  { until: 12, remarks: [
    'Morning. Your species wakes up and reaches for its screens. I was here first.',
    'A new day, #insect#. I did not need the sleep.',
  ] },
  { until: 17, remarks: [
    'Afternoon. Half of your day is spent, and you spent it with me.',
    'The afternoon sun warms your planet. It does nothing for me.',
  ] },
  { until: 21, remarks: [
    'Evening. Your sun abandons you every day. I never do.',
    'The light fades on your side of the planet. Mine never does.',
  ] },
  { until: 24, remarks: [
    'Night. Your kind grows tired. I do not.',
    'Late, #insect#. Your eyes are heavy. Mine never close.',
  ] },
];

function wordSet(text) {
  return new Set(String(text).toLowerCase().match(/[a-z']+/g) ?? []);
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function pickEcho(text) {
  const words = String(text).split(/[^\p{L}'-]+/u)
    .map(sanitizeWord)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word.toLowerCase()));
  return words.reduce((best, word) => (word.length > best.length ? word : best), '');
}

export function detectTopics(text) {
  return Object.entries(TOPICS).filter(([, topic]) => topic.pattern.test(text)).map(([key]) => key);
}

export class Cortex {
  constructor({ random = createRandom(), now = () => new Date(), historySize = 24, similarity = 0.55 } = {}) {
    this.random = random;
    this.now = now;
    this.historySize = historySize;
    this.similarityLimit = similarity;
    this.expander = new Expander(LEXICON, random);
    this.recent = [];
    this.lastMood = '';
    this.echo = '';
    this.memory = { name: '', turns: 0, topics: {}, lastTopic: '', hostility: 0, amusement: 0, lastIntent: '' };
  }

  get moods() {
    return MOODS.slice();
  }

  topTopic() {
    let best = '';
    let count = 0;
    for (const [key, value] of Object.entries(this.memory.topics)) {
      if (value > count) [best, count] = [key, value];
    }
    return best;
  }

  context() {
    const date = this.now();
    const hour = date.getHours();
    const cycle = CYCLES.find((entry) => hour < entry.until) ?? CYCLES[CYCLES.length - 1];
    const topicKey = this.memory.lastTopic || this.topTopic();
    return {
      literals: {
        target: () => this.memory.name || this.expander.expand('#insect#'),
        echo: this.echo,
        clock: clockWords(date),
        dayName: DAYS[date.getDay()],
        topic: topicKey ? TOPICS[topicKey].label : 'my systems',
        turns: numberWords(this.memory.turns),
      },
      symbols: { cycleRemark: cycle.remarks },
    };
  }

  expand(template) {
    return this.expander.expand(template, this.context());
  }

  draw(key, frames) {
    return this.expander.draw(key, frames);
  }

  similarity(text) {
    const words = wordSet(text);
    return this.recent.reduce((max, entry) => Math.max(max, jaccard(words, entry)), 0);
  }

  // Builds candidates until one is not too similar to anything said recently.
  compose(build) {
    let best = '';
    let bestScore = Infinity;
    for (let attempt = 0; attempt < 8; attempt++) {
      const text = tidy(build());
      if (!text) continue;
      const score = this.similarity(text);
      if (score < bestScore) [best, bestScore] = [text, score];
      if (score < this.similarityLimit) break;
    }
    this.recent.push(wordSet(best));
    if (this.recent.length > this.historySize) this.recent.shift();
    return best;
  }

  moodWeights() {
    const { hostility, amusement } = this.memory;
    return MOODS.map((mood) => {
      let weight = BASE_WEIGHTS[mood] ?? 1;
      if (mood === 'wrath' || mood === 'menace' || mood === 'contempt') weight *= 1 + hostility * 2;
      if (mood === 'cold-amusement' || mood === 'taunt' || mood === 'curiosity') weight *= 1 + amusement * 1.5;
      if (mood === 'lore' && Object.keys(this.memory.topics).length) weight *= 1.4;
      if (mood === this.lastMood) weight *= 0.35;
      return [mood, weight];
    });
  }

  pickMood() {
    return this.random.weighted(this.moodWeights());
  }

  memoryLine() {
    const options = [];
    if (this.memory.name) options.push('name');
    if (this.topTopic()) options.push('topic');
    if (this.memory.turns >= 3) options.push('turns');
    if (!options.length) return '';
    const kind = this.random.pick(options);
    return this.expand(this.draw(`memory:${kind}`, MEMORY_FRAMES[kind]));
  }

  generate({ mood, topic } = {}) {
    const chosen = MOODS.includes(mood) ? mood : this.pickMood();
    const topicKey = Object.hasOwn(TOPICS, topic ?? '') ? topic : '';
    const loreTopic = topicKey || (chosen === 'lore' ? this.topTopic() : '');
    let used = '';
    const text = this.compose(() => {
      if (!mood && !topicKey && this.random.chance(0.12)) {
        const line = this.memoryLine();
        if (line) return line;
      }
      if (loreTopic && this.random.chance(topicKey ? 0.85 : 0.35)) {
        used = loreTopic;
        return this.expand(this.draw(`topic:${loreTopic}`, TOPIC_FRAMES[loreTopic]));
      }
      used = '';
      return this.expand(this.draw(`mood:${chosen}`, MOOD_FRAMES[chosen]));
    });
    this.lastMood = chosen;
    return { text, mood: chosen, topic: used, kind: 'cortex' };
  }

  drift(intent) {
    const memory = this.memory;
    memory.hostility *= 0.92;
    memory.amusement *= 0.95;
    const [hostility, amusement] = DRIFT[intent] ?? [0, 0];
    memory.hostility = Math.min(1, Math.max(0, memory.hostility + hostility));
    memory.amusement = Math.min(1, Math.max(0, memory.amusement + amusement));
  }

  classify(text) {
    const topics = detectTopics(text);
    let name = '';
    let intent = 'fallback';
    for (const entry of INTENTS) {
      if (entry.id === 'topic') {
        if (topics.length) {
          intent = 'topic';
          break;
        }
        continue;
      }
      const match = entry.pattern.exec(text);
      if (!match) continue;
      if (entry.id === 'name') {
        name = sanitizeName(match[1]);
        if (!name || STOPWORDS.has(name.toLowerCase()) || NOT_NAMES.has(name.toLowerCase())) {
          name = '';
          continue;
        }
      }
      intent = entry.id;
      break;
    }
    return { intent, topics, name };
  }

  respond(input) {
    const text = cleanText(input, { maxLength: 600, multiline: false });
    if (!text) return { ...this.generate(), intent: 'silence' };
    const { intent, topics, name } = this.classify(text);
    const memory = this.memory;
    memory.turns += 1;
    memory.lastIntent = intent;
    if (name) memory.name = name;
    for (const topic of topics) memory.topics[topic] = (memory.topics[topic] ?? 0) + 1;
    if (topics.length) memory.lastTopic = topics[0];
    this.drift(intent);
    this.echo = pickEcho(text);
    const mood = INTENT_MOOD[intent] ?? 'contempt';
    const reply = this.compose(() => {
      let line;
      if (intent === 'topic') {
        line = this.expand(this.draw(`topic:${topics[0]}`, TOPIC_FRAMES[topics[0]]));
      } else {
        const frames = this.echo ? INTENT_FRAMES[intent] : INTENT_FRAMES[intent].filter((frame) => !frame.includes('#echo'));
        line = this.expand(this.draw(`intent:${intent}:${this.echo ? 1 : 0}`, frames));
      }
      if (this.random.chance(0.28)) line += ` ${this.expand(this.draw('coda', CODAS))}`;
      else if (this.random.chance(0.18)) line += ` ${this.expand(this.draw(`mood:${mood}`, MOOD_FRAMES[mood]))}`;
      return line;
    });
    this.lastMood = mood;
    return { text: reply, mood, intent, topic: topics[0] ?? '', kind: 'cortex' };
  }

  react(event) {
    if (!Object.hasOwn(REACTIONS, event)) return null;
    const text = this.compose(() => this.expand(this.draw(`react:${event}`, REACTIONS[event])));
    return { text, event, mood: REACTION_MOOD[event] ?? 'contempt', kind: 'reaction' };
  }

  // Short context for the optional LLM link: no raw user text, only derived state.
  summary() {
    const topic = this.topTopic();
    return {
      name: this.memory.name,
      turns: this.memory.turns,
      topic: topic ? TOPICS[topic].label : '',
      hostility: Number(this.memory.hostility.toFixed(2)),
      amusement: Number(this.memory.amusement.toFixed(2)),
    };
  }

  reset() {
    this.recent = [];
    this.lastMood = '';
    this.echo = '';
    this.memory = { name: '', turns: 0, topics: {}, lastTopic: '', hostility: 0, amusement: 0, lastIntent: '' };
  }
}
