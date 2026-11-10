import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AiHandle, HANDLE_DEFAULTS, HANDLE_STORAGE_KEY, loadHandleSettings, REACTION_RULES, saveHandleSettings,
} from '../src/app/handle.js';
import { Cortex } from '../src/cortex/cortex.js';
import { MOODS, TOPICS } from '../src/cortex/grammar.js';
import { createRandom } from '../src/cortex/random.js';
import { Cooldowns } from '../src/whiteice/ratelimit.js';
import { cleanText } from '../src/whiteice/sanitize.js';

// setImmediate is left unmocked so pending promise chains can settle between timer ticks.
const flush = () => new Promise((resolve) => setImmediate(resolve));

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)) };
}

function setup({ random = () => 0.5, llm = {}, allow = () => true, config = {}, busy = () => false, speak = () => true } = {}) {
  const spoken = [];
  const errors = [];
  const throttled = [];
  const link = { enabled: false, inFlight: null, generate: async () => 'Link line.', respond: async () => 'Link reply.', ...llm };
  const handle = new AiHandle({
    cortex: new Cortex({ random: createRandom('handle') }),
    llm: link,
    whiteIce: { allow, retryAfter: () => 4000, text: (value, options) => cleanText(value, options) },
    random,
    config: () => config,
    hooks: {
      speak: (line, meta) => {
        spoken.push({ line, meta });
        return speak(line, meta);
      },
      isBusy: (...args) => busy(...args),
      selection: () => ({ mood: 'random', topic: '' }),
      onLinkError: (error) => errors.push(error),
      onLinkThrottled: (ms) => throttled.push(ms),
    },
  });
  handle.cooldowns = new Cooldowns(() => Date.now());
  return { handle, link, spoken, errors, throttled };
}

test('handle settings load defensively and round-trip', () => {
  assert.deepEqual(loadHandleSettings(memoryStorage(), MOODS), HANDLE_DEFAULTS);
  assert.deepEqual(loadHandleSettings(null, MOODS), HANDLE_DEFAULTS);
  assert.deepEqual(loadHandleSettings(memoryStorage({ [HANDLE_STORAGE_KEY]: '{bad' }), MOODS), HANDLE_DEFAULTS);
  const tampered = memoryStorage({
    [HANDLE_STORAGE_KEY]: JSON.stringify({ converse: 'yes', autonomous: true, reactions: 0, mood: 'evil', topic: '__proto__', visual: 62 }),
  });
  assert.deepEqual(loadHandleSettings(tampered, MOODS), { converse: false, autonomous: true, reactions: true, mood: 'random', topic: '', visual: 60 });
  const storage = memoryStorage();
  const settings = { converse: true, autonomous: false, reactions: false, mood: MOODS[0], topic: 'xerxes', visual: 85 };
  saveHandleSettings(storage, settings);
  assert.deepEqual(loadHandleSettings(storage, MOODS), settings);
  saveHandleSettings(storage, { ...settings, visual: 1000 });
  assert.equal(loadHandleSettings(storage, MOODS).visual, 100);
  saveHandleSettings(storage, { ...settings, visual: -7 });
  assert.equal(loadHandleSettings(storage, MOODS).visual, 0);
  assert.doesNotThrow(() => saveHandleSettings({ setItem() { throw new Error('quota'); } }, settings));
});

test('compose works offline through CORTEX by default', async () => {
  const { handle, link } = setup();
  let calls = 0;
  link.generate = async () => {
    calls++;
    return 'x';
  };
  assert.equal(handle.engine, 'cortex');
  const fixed = await handle.compose({ mood: MOODS[1] });
  assert.equal(fixed.engine, 'cortex');
  assert.equal(fixed.mood, MOODS[1]);
  assert.ok(fixed.text.length > 0);
  const free = await handle.compose({ mood: 'random', topic: 'nonsense' });
  assert.ok(MOODS.includes(free.mood));
  assert.equal(free.topic, '');
  const topics = new Set();
  for (let i = 0; i < 12; i++) topics.add((await handle.compose({ topic: 'xerxes' })).topic);
  assert.ok(topics.has('xerxes'));
  assert.equal(calls, 0);
});

test('the neural link is tried first and CORTEX covers every failure', async () => {
  const requests = [];
  const { handle, link, errors } = setup({
    llm: {
      enabled: true,
      generate: async (args) => {
        requests.push(args);
        return '  Insect.\u200B  ';
      },
    },
  });
  assert.equal(handle.engine, 'llm');
  assert.deepEqual(await handle.compose({ mood: MOODS[2], topic: 'xerxes' }), { text: 'Insect.', mood: MOODS[2], topic: 'xerxes', engine: 'llm' });
  assert.equal(requests[0].mood, MOODS[2]);
  assert.equal(requests[0].topic, TOPICS.xerxes.label);
  assert.deepEqual(Object.keys(requests[0].memory).sort(), ['amusement', 'hostility', 'name', 'topic', 'turns']);
  assert.ok(MOODS.includes((await handle.compose()).mood), 'random mood is steered by CORTEX');

  link.generate = async () => {
    throw new Error('offline');
  };
  assert.equal((await handle.compose()).engine, 'cortex');
  assert.equal(errors[0].message, 'offline');

  link.generate = async () => '  \u200B ';
  assert.equal((await handle.compose()).engine, 'cortex');

  let calls = 0;
  link.inFlight = {};
  link.generate = async () => {
    calls++;
    return 'x';
  };
  assert.equal((await handle.compose()).engine, 'cortex');
  assert.equal(calls, 0);
});

test('a throttled link falls back without calling the model', async () => {
  let calls = 0;
  const { handle, throttled } = setup({
    allow: (key) => key !== 'ai',
    llm: {
      enabled: true,
      generate: async () => {
        calls++;
        return 'x';
      },
    },
  });
  assert.equal((await handle.compose()).engine, 'cortex');
  assert.equal(calls, 0);
  assert.deepEqual(throttled, [4000]);
});

test('replies always update CORTEX memory and prefer the link when it answers', async () => {
  const received = [];
  const { handle, link } = setup({
    llm: {
      enabled: true,
      respond: async (text, options) => {
        received.push({ text, options });
        return 'You are nothing, Rebecca.';
      },
    },
  });
  const answer = await handle.reply('My name is Rebecca');
  assert.equal(answer.engine, 'llm');
  assert.equal(answer.text, 'You are nothing, Rebecca.');
  assert.equal(answer.intent, 'name');
  assert.equal(received[0].text, 'My name is Rebecca');
  assert.equal(received[0].options.memory.name, 'Rebecca');
  assert.equal(received[0].options.mood, answer.mood);
  link.enabled = false;
  const local = await handle.reply('Tell me about Xerxes');
  assert.equal(local.engine, 'cortex');
  assert.equal(local.topic, 'xerxes');
  assert.equal(handle.cortex.summary().turns, 2);
});

test('autonomous mode speaks on a random schedule and restarts the countdown after each line', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { handle, spoken } = setup({ random: () => 0.5, config: { autonomousMinMs: 10000, autonomousMaxMs: 30000 } });
  handle.setAutonomous(true);
  assert.equal(handle.nextAt, 20000);
  t.mock.timers.tick(19999);
  await flush();
  assert.equal(spoken.length, 0);
  t.mock.timers.tick(1);
  await flush();
  assert.equal(spoken.length, 1);
  assert.deepEqual(spoken[0].meta, { kind: 'autonomous' });
  assert.equal(spoken[0].line.engine, 'cortex');
  assert.equal(handle.timer, null, 'a started transmission reschedules when it ends');
  handle.transmissionEnded();
  assert.equal(handle.nextAt, 40000);
  handle.setAutonomous(false);
  assert.equal(handle.nextAt, 0);
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(spoken.length, 1);
  handle.transmissionEnded();
  assert.equal(handle.timer, null);
});

test('autonomous timing is clamped to sane bounds', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { handle } = setup({ random: () => 1, config: { autonomousMinMs: 10, autonomousMaxMs: -5 } });
  handle.setAutonomous(true);
  assert.equal(handle.nextAt, 5000);
  handle.config = () => ({ autonomousMinMs: 'junk' });
  handle.schedule();
  assert.equal(handle.nextAt, 90000);
  handle.setAutonomous(false);
});

test('busy terminals postpone autonomous lines and failed starts reschedule', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let busy = true;
  const { handle, spoken } = setup({ random: () => 0, busy: () => busy, speak: () => false });
  handle.setAutonomous(true);
  assert.equal(handle.nextAt, 25000);
  t.mock.timers.tick(25000);
  await flush();
  assert.equal(spoken.length, 0);
  assert.equal(handle.nextAt, 30000);
  busy = false;
  t.mock.timers.tick(5000);
  await flush();
  assert.equal(spoken.length, 1);
  assert.equal(handle.nextAt, 55000);
  handle.setAutonomous(false);
});

test('rescheduling drops a line still being composed for the old slot', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let release;
  const { handle, spoken } = setup({
    random: () => 0,
    llm: {
      enabled: true,
      generate: () => new Promise((resolve) => {
        release = resolve;
      }),
    },
  });
  handle.setAutonomous(true);
  t.mock.timers.tick(25000);
  await flush();
  assert.equal(handle.composing, true);
  handle.schedule();
  release('Too late.');
  await flush();
  assert.equal(spoken.length, 0);
  assert.equal(handle.composing, false);
  handle.setAutonomous(false);
});

test('reactions respect chance, cooldowns, interrupts and the master switch', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const { handle, spoken } = setup({ random: () => 0 });
  assert.equal(handle.react('nonsense'), false);
  assert.equal(handle.react('__proto__'), false);
  assert.equal(handle.react('rapid'), true);
  assert.equal(handle.react('rapid'), true, 'the cooldown is armed only when a reaction fires');
  t.mock.timers.tick(REACTION_RULES.rapid.delay);
  assert.equal(spoken.length, 1);
  assert.deepEqual(spoken[0].meta, { kind: 'reaction', event: 'rapid', interrupt: true });
  assert.equal(spoken[0].line.engine, 'cortex');
  assert.ok(MOODS.includes(spoken[0].line.mood));
  assert.equal(handle.react('rapid'), false);
  t.mock.timers.tick(REACTION_RULES.rapid.cooldown);
  assert.equal(handle.react('rapid'), true);
  handle.reactions = false;
  assert.equal(handle.react('stop'), false);
  t.mock.timers.tick(REACTION_RULES.rapid.delay);
  assert.equal(spoken.length, 1, 'switching reactions off cancels pending ones');

  const unlucky = setup({ random: () => 0.99 });
  assert.equal(unlucky.handle.react('firstContact'), false);
  assert.equal(unlucky.handle.react('stop', { chance: 1, delay: 0 }), true);
  t.mock.timers.tick(1);
  assert.equal(unlucky.spoken.length, 1);
  assert.equal(unlucky.spoken[0].meta.interrupt, false);
});

test('WHITE ICE can veto a reaction at the moment it fires', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let open = false;
  const { handle, spoken } = setup({ random: () => 0, allow: (key) => key !== 'reaction' || open });
  assert.equal(handle.react('paste'), true);
  t.mock.timers.tick(REACTION_RULES.paste.delay);
  assert.equal(spoken.length, 0);
  open = true;
  assert.equal(handle.react('paste'), true, 'a vetoed reaction does not burn its cooldown');
  t.mock.timers.tick(REACTION_RULES.paste.delay);
  assert.equal(spoken.length, 1);
});

test('idle-only reactions wait for silence until their deadline; others are dropped', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let busy = true;
  const { handle, spoken } = setup({ random: () => 0, busy: () => busy });
  assert.equal(handle.react('voiceError'), true);
  t.mock.timers.tick(REACTION_RULES.voiceError.delay + 5000);
  assert.equal(spoken.length, 0);
  busy = false;
  t.mock.timers.tick(1000);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].meta.event, 'voiceError');
  assert.equal(handle.react('voiceError'), false, 'one voice-error remark per session');

  busy = true;
  assert.equal(handle.react('stop'), true);
  t.mock.timers.tick(REACTION_RULES.stop.delay);
  busy = false;
  t.mock.timers.tick(60000);
  assert.equal(spoken.length, 1);

  busy = true;
  assert.equal(handle.react('whiteIce'), true);
  t.mock.timers.tick(REACTION_RULES.whiteIce.whenIdle + 10000);
  busy = false;
  t.mock.timers.tick(5000);
  assert.equal(spoken.length, 1, 'past its deadline the reaction is dropped');
});
