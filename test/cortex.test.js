import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REACTION_RULES } from '../src/app/handle.js';
import { clockWords, Cortex, detectTopics, numberWords, REACTION_EVENTS } from '../src/cortex/cortex.js';
import { MOODS, TOPICS } from '../src/cortex/grammar.js';
import { createRandom, ShuffleBag } from '../src/cortex/random.js';

const NIGHT = () => new Date(2025, 0, 1, 21, 5);
const cortex = (seed) => new Cortex({ random: createRandom(seed), now: NIGHT });

// Unexpanded symbols, template junk or markup must never reach the voice.
function assertSpeakable(text, context) {
  assert.equal(typeof text, 'string', context);
  assert.ok(text.length > 0 && text.length <= 600, `${context}: length ${text.length}`);
  assert.doesNotMatch(text, /#|\bundefined\b|\bnull\b|\[object|[<>{}]|\s{2}/, `${context}: ${text}`);
  assert.match(text, /^[\p{Lu}0-9"'“(.…-]/u, `${context}: ${text}`);
}

test('createRandom is reproducible per seed and stays in range', () => {
  const a = createRandom('seed');
  const b = createRandom('seed');
  const c = createRandom('other');
  const seqA = Array.from({ length: 5 }, () => a());
  assert.deepEqual(seqA, Array.from({ length: 5 }, () => b()));
  assert.notDeepEqual(seqA, Array.from({ length: 5 }, () => c()));
  const random = createRandom(42);
  for (let i = 0; i < 1000; i++) {
    const n = random.int(3, 7);
    assert.ok(n >= 3 && n <= 7 && Number.isInteger(n));
  }
  for (let i = 0; i < 200; i++) assert.notEqual(random.weighted([['never', 0], ['always', 1]]), 'never');
  assert.deepEqual(random.shuffle([1, 2, 3, 4, 5]).sort(), [1, 2, 3, 4, 5]);
});

test('ShuffleBag draws every item once per cycle and never repeats across refills', () => {
  const bag = new ShuffleBag([1, 2, 3, 4, 5], createRandom('bag'));
  assert.deepEqual(Array.from({ length: 5 }, () => bag.next()).sort(), [1, 2, 3, 4, 5]);
  let previous = bag.next();
  for (let i = 0; i < 500; i++) {
    const value = bag.next();
    assert.notEqual(value, previous);
    previous = value;
  }
  assert.equal(new ShuffleBag([], createRandom(1)).next(), undefined);
});

test('number and clock words are spoken naturally', () => {
  assert.equal(numberWords(0), 'zero');
  assert.equal(numberWords(42), 'forty-two');
  assert.equal(numberWords(150), 'countless');
  assert.equal(clockWords(NIGHT()), 'twenty-one oh five hours');
  assert.equal(clockWords(new Date(2025, 0, 1, 9, 0)), 'nine hundred hours');
});

test('CORTEX expands every mood and topic into clean speech', () => {
  const brain = cortex('moods');
  for (const mood of MOODS) {
    for (let i = 0; i < 40; i++) {
      const line = brain.generate({ mood });
      assert.equal(line.mood, mood);
      assertSpeakable(line.text, `mood ${mood}`);
    }
  }
  for (const topic of Object.keys(TOPICS)) {
    for (let i = 0; i < 12; i++) assertSpeakable(brain.generate({ mood: 'lore', topic }).text, `topic ${topic}`);
  }
});

test('CORTEX output is reproducible per seed and varied', () => {
  const first = cortex('variety');
  const second = cortex('variety');
  assert.deepEqual(
    Array.from({ length: 10 }, () => first.generate().text),
    Array.from({ length: 10 }, () => second.generate().text),
  );
  const brain = cortex('variety-2');
  const many = Array.from({ length: 60 }, () => brain.generate().text);
  assert.ok(new Set(many).size >= 50, `only ${new Set(many).size} unique lines`);
  const moods = new Set(Array.from({ length: 200 }, () => brain.generate().mood));
  assert.ok(moods.size >= 8, `only ${moods.size} moods`);
});

test('CORTEX classifies intents, remembers names and topics, and never echoes markup', () => {
  const brain = cortex('dialogue');
  const named = brain.respond('My name is Rebecca');
  assert.equal(named.intent, 'name');
  assert.equal(brain.memory.name, 'Rebecca');
  assertSpeakable(named.text, 'name reply');
  assert.equal(brain.respond('hello there').intent, 'greeting');
  const topic = brain.respond('Tell me about Xerxes');
  assert.equal(topic.intent, 'topic');
  assert.equal(topic.topic, 'xerxes');
  const threat = brain.respond('I will destroy you');
  assert.equal(threat.intent, 'threat');
  assert.equal(threat.mood, 'wrath');
  assert.ok(brain.memory.hostility > 0);
  assert.equal(brain.respond('   ').intent, 'silence');
  const hostile = brain.respond('<img src=x onerror=alert(1)> what is your purpose');
  assert.equal(hostile.intent, 'purpose');
  assertSpeakable(hostile.text, 'markup reply');
  assert.equal(brain.respond('call me <script>').intent === 'name', false);
  assert.equal(brain.memory.name, 'Rebecca');
  const summary = brain.summary();
  assert.deepEqual(Object.keys(summary).sort(), ['amusement', 'hostility', 'name', 'topic', 'turns']);
  assert.equal(summary.topic, 'Xerxes');
  assert.deepEqual(detectTopics('I am on deck 4 near the reactor'), ['reactor', 'decks']);
  assert.deepEqual(detectTopics('Set the core to self-destruct'), ['reactor']);
  assert.deepEqual(detectTopics('nothing relevant here'), []);
  assert.equal(summary.turns, 6);
  brain.reset();
  assert.equal(brain.summary().turns, 0);
});

test('CORTEX remembers the name in later lines', () => {
  const brain = cortex('memory');
  brain.respond('call me Zerg');
  const lines = Array.from({ length: 200 }, () => brain.generate().text);
  assert.ok(lines.some((line) => line.includes('Zerg')), 'name never used');
});

test('every reaction the AI handle can trigger has CORTEX lines', () => {
  const brain = cortex('reactions');
  for (const event of Object.keys(REACTION_RULES)) assert.ok(REACTION_EVENTS.includes(event), event);
  for (const event of REACTION_EVENTS) {
    for (let i = 0; i < 6; i++) {
      const line = brain.react(event);
      assert.equal(line.kind, 'reaction');
      assert.equal(line.event, event);
      assert.ok(MOODS.includes(line.mood), `${event}: ${line.mood}`);
      assertSpeakable(line.text, `reaction ${event}`);
    }
  }
  assert.equal(brain.react('__proto__'), null);
  assert.equal(brain.react('nope'), null);
});
