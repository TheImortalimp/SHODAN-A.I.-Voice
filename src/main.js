import quoteSnapshot from 'virtual:shodan-monologues';
import { AudioEngine } from './app/audio.js';
import { AiHandle, HANDLE_STORAGE_KEY, REACTION_RULES, loadHandleSettings, saveHandleSettings } from './app/handle.js';
import { LipSync } from './app/lipsync.js';
import { PiperClient, loadFallbackVoice } from './app/piper.js';
import { openFloatingWindow } from './app/pip.js';
import { Speaker } from './app/speaker.js';
import { signedPercent } from './app/voice.js';
import { createAvatarRenderer } from './avatar/renderer.js';
import { LatencyEstimator } from './avatar/visemes.js';
import { Cortex } from './cortex/cortex.js';
import { TOPICS } from './cortex/grammar.js';
import { LlmLink } from './cortex/llm.js';
import { parseMonologues } from './cortex/monologues.js';
import { createRandom, ShuffleBag } from './cortex/random.js';
import { mergeConfig } from './whiteice/config.js';
import { createWhiteIce, deepFreeze } from './whiteice/index.js';

const VERSION = __SHODAN_VERSION__;
const GAP = ' \u00a0 ';
const LOG_ROWS = 6;
const WAVE_BARS = 44;
const AI_KINDS = new Set(['ai', 'reply', 'reaction', 'autonomous']);
const PRESENCE_STATES = { idle: 'idle_monologue', simulation: 'simulation' };
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'pointermove', 'wheel', 'touchstart'];

const $ = (id) => document.getElementById(id);
const el = Object.fromEntries(
  [
    'message', 'count', 'paste', 'speak', 'stop', 'notice', 'inputMode', 'discordAppId', 'discordAsset', 'discordConnect',
    'discordDisconnect', 'discordStatus', 'inspectSource', 'iceDialog', 'iceClose', 'iceCopy', 'iceDialogWhiteIce', 'auto',
    'smooth', 'blend', 'blendValue', 'phase', 'phaseValue', 'visual', 'visualValue', 'mini', 'idle', 'idleHelp', 'outputText',
    'sourceInfo', 'avatar', 'avatarStatus', 'signalLine', 'wave', 'meterStatus', 'visemeStatus', 'log', 'fullscreen',
    'cyberspace', 'engineStatus', 'cortexStatus', 'avatarMode', 'linkMode', 'versionTag', 'iceBadge', 'iceState', 'iceCsp',
    'iceTt', 'iceFrame', 'iceSanitized', 'iceBlocked', 'iceHost', 'iceIntegrity', 'iceAmsi', 'cortexEngineTag', 'generate',
    'aiTransmit', 'mood', 'topic', 'converse', 'autonomous', 'autonomousHelp', 'reactions', 'engine', 'endpoint', 'model',
    'modelList', 'apiKey', 'testLink', 'linkStatus',
  ].map((id) => [id, $(id)]),
);

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const random = createRandom();
const params = new URLSearchParams(location.search);

let config = mergeConfig(
  {
    defaults: {
      autoSpeak: false, autoSpeakDelayMs: 1000, idleEnabled: true, idleDelayMs: 60000, idleRepeatMs: 60000,
      externalQuoteChance: 0.2, generatedIdleChance: 0.5, smoothVoice: true, phaseDepth: -50, autoClear: true,
      characterTilt: -50, visualGlitch: 60, autonomousMinMs: 25000, autonomousMaxMs: 90000, reactions: true,
    },
    limits: { maxCharacters: 5000, chunkCharacters: 110 },
  },
  null,
);

// Session state. Declared before anything can call status()/log().
let gestured = false;
let autoTimer = null;
let idleTimer = null;
let idleTicket = 0;
let composeTicket = 0;
let replyTicket = 0;
let pendingCompose = 0;
let lastTypedAt = 0;
let lastMove = 0;
let hiddenAt = 0;
let lastUserAbort = 0;
let lastLinkWarning = 0;
let meterTimer = null;
let floating = null;
let hostFloat = false;
let presenceConnected = false;
let presencePoll = null;
let lastBlocked = 0;
const touched = { auto: false, smooth: false, blend: false, phase: false, idle: false };
const recentClicks = [];

function status(text) {
  el.notice.textContent = text;
  floating?.setStatus(text);
}

function log(text, type = 'SYSTEM', speakerRow = false) {
  const row = document.createElement('div');
  const prefix = document.createElement('span');
  prefix.className = speakerRow ? 'speaker' : 'dim';
  prefix.textContent = `[${type}] `;
  const body = String(text);
  row.append(prefix, document.createTextNode(body.length > 240 ? `${body.slice(0, 239)}…` : body));
  el.log.append(row);
  while (el.log.children.length > LOG_ROWS) el.log.firstElementChild.remove();
}

const label = (value) => String(value || '').replace(/-/g, ' ').toUpperCase();
const engineName = (engine) => (engine === 'llm' ? 'NEURAL LINK' : 'CORTEX');

// ── WHITE ICE ────────────────────────────────────────────────────────────────────────────
const whiteIce = createWhiteIce({ log: (text, type) => log(text, type) });
whiteIce.installHooks();

// ── CORTEX, the optional neural link and the AI handle ──────────────────────────────────
const cortex = new Cortex({ random });
const llm = new LlmLink({ storage });
const handleStored = (() => {
  try {
    return storage?.getItem(HANDLE_STORAGE_KEY) != null;
  } catch {
    return false;
  }
})();
const handleSettings = loadHandleSettings(storage, cortex.moods);

const handle = new AiHandle({
  cortex,
  llm,
  whiteIce,
  random,
  config: () => config.defaults,
  hooks: {
    speak: (line, meta) => speakLine(line, meta),
    isBusy,
    selection,
    onLinkError(error) {
      if (Date.now() - lastUserAbort < 1500) return;
      el.linkStatus.textContent = `Neural link failed: ${error.message} CORTEX answered instead.`;
      if (Date.now() - lastLinkWarning > 30000) {
        lastLinkWarning = Date.now();
        log(`Neural link failed (${error.message}); CORTEX answered.`, 'WARN');
      }
    },
    onLinkThrottled(ms) {
      el.linkStatus.textContent = `WHITE ICE throttled the neural link; CORTEX answered. Link available again in ${Math.ceil(ms / 1000)} s.`;
    },
  },
});

function selection() {
  return { mood: el.mood.value, topic: el.topic.value };
}

// Whether an unprompted line (autonomous or reaction) would trample something. Browsers
// need a user gesture before audio; the desktop host is exempt from that policy.
function isBusy(kind, rule) {
  if ((!gestured && !host) || document.hidden || el.iceDialog.open || pendingCompose > 0 || autoTimer) return true;
  if (kind === 'autonomous') return speaker.active || Date.now() - lastTypedAt < 4000;
  if (speaker.active) return !(rule?.interrupt && speaker.meta?.kind === 'user');
  return false;
}

// ── Voice pipeline ───────────────────────────────────────────────────────────────────────
const audio = new AudioEngine({ scriptUrl: whiteIce.scriptUrl, random });
const piper = new PiperClient({ scriptUrl: whiteIce.scriptUrl, onStatus: status });
const lipSync = new LipSync({ latency: new LatencyEstimator(0.09) });

function sourceLabel(meta) {
  const mood = label(meta.mood) || 'UNKNOWN';
  switch (meta.kind) {
    case 'idle':
      if (meta.generated) return `IDLE / ${engineName(meta.engine)} / ${mood}`;
      return meta.source === 'user' ? `IDLE MONOLOGUE / ${mood}` : `IDLE QUOTE / ${meta.source}`;
    case 'simulation':
      return 'SIMULATION / BLACK ICE';
    case 'ai':
      return `${engineName(meta.engine)} / ${mood}`;
    case 'reply':
      return `${engineName(meta.engine)} REPLY / ${mood}`;
    case 'reaction':
      return `REACTION / ${label(meta.event)}`;
    case 'autonomous':
      return `AUTONOMOUS / ${engineName(meta.engine)} / ${mood}`;
    case 'api':
      return 'AUTOMATION HANDLE';
    default:
      return 'USER TRANSMISSION';
  }
}

function statusLabel(meta) {
  return {
    idle: meta.generated ? 'Idle transmission' : 'Idle monologue',
    simulation: 'BLACK ICE simulation',
    ai: 'AI transmission',
    reply: 'SHODAN replies',
    reaction: 'SHODAN reacts',
    autonomous: 'Autonomous transmission',
    api: 'Automation handle',
  }[meta.kind] ?? 'Transmitting';
}

function logLabel(meta) {
  if (meta.kind === 'idle') return `Idle ${meta.mood || 'unknown'}`;
  if (meta.kind === 'simulation') return 'BLACK ICE simulation';
  if (meta.kind === 'api') return 'Automation handle';
  return 'Transmission';
}

function announce(state, meta, text) {
  const detail = Object.freeze({
    state,
    kind: meta?.kind ?? 'user',
    mood: meta?.mood ?? '',
    engine: meta?.engine ?? '',
    event: meta?.event ?? '',
    text: state === 'start' ? text : '',
  });
  window.dispatchEvent(new CustomEvent('shodan:transmission', { detail }));
}

function afterTransmission() {
  scheduleIdle(config.defaults.idleRepeatMs);
  handle.transmissionEnded();
}

const speaker = new Speaker({
  audio,
  piper,
  loadFallback: () => loadFallbackVoice(whiteIce.scriptUrl),
  lipSync,
  random,
  settings: () => ({
    smooth: el.smooth.checked,
    tilt: Number(el.blend.value),
    phase: Number(el.phase.value),
    chunkCharacters: config.limits.chunkCharacters,
  }),
  hooks: {
    onStart({ meta, text, usingPiper, smooth, tilt, phase }) {
      el.outputText.textContent = text;
      el.sourceInfo.textContent = sourceLabel(meta);
      const voice = usingPiper ? `Mimic 3 Amy / ${tilt}% character tilt / ${phase > 0 ? '+' : ''}${phase}% phase` : 'built-in fallback voice';
      status(`${statusLabel(meta)} · ${voice}.`);
      if (!AI_KINDS.has(meta.kind)) {
        log(`${logLabel(meta)} · ${usingPiper ? 'Mimic 3 Amy' : 'fallback'}${smooth ? ' / smooth' : ''} · ${text.length} chars.`, 'VOICE');
      }
      announce('start', meta, text);
    },
    onActive: setActiveUi,
    onStatus: status,
    onAudioStarted(meta) {
      // Clear only the exact manually transmitted draft, and only after audio starts.
      if (meta.kind === 'user' && config.defaults.autoClear && el.message.value === meta.draft) {
        el.message.value = '';
        updateCount();
        syncFloatingDraft();
      }
    },
    onComplete(meta) {
      status('Transmission complete.');
      if (!AI_KINDS.has(meta.kind)) log('Transmission complete.', 'VOICE');
      announce('complete', meta);
      afterTransmission();
    },
    onFail(meta, message, { silent = false } = {}) {
      status(message);
      if (!silent) log(message, 'ERROR');
      announce('fail', meta);
      afterTransmission();
    },
    // Every start gets an end event, and the autonomous countdown restarts even when no
    // other transmission follows the interruption.
    onInterrupt(meta) {
      announce('interrupted', meta);
      handle.transmissionEnded();
    },
    onFallback(message) {
      el.engineStatus.textContent = 'FALLBACK / ROBOTIC';
      log(`Local Amy unavailable (${message}); switching to bundled fallback.`, 'WARN');
      status('Local neural voice failed; retrying with the bundled robotic fallback.');
      handle.react('voiceError');
    },
  },
});

function setActiveUi(on, meta) {
  el.avatar.classList.toggle('speaking', on);
  el.wave.classList.toggle('active', on);
  el.avatarStatus.textContent = `●${GAP}${on ? 'TRANSMITTING' : 'STANDBY'}`;
  el.meterStatus.textContent = on ? 'TRANSMITTING' : 'STANDBY';
  updateStopButton();
  updateSpeakLabel();
  updateSignal(on ? meta : null);
  clearInterval(meterTimer);
  meterTimer = null;
  if (on) {
    meterTimer = setInterval(() => {
      const level = speaker.level();
      for (const bar of el.wave.children) bar.style.height = `${3 + random() * level * 55}px`;
    }, 100);
  } else {
    for (const bar of el.wave.children) bar.style.height = '3px';
  }
  notifyPresence(on ? (PRESENCE_STATES[meta?.kind] ?? 'speaking') : 'standby');
}

function updateStopButton() {
  el.stop.disabled = !speaker.active && pendingCompose === 0;
}

function updateSpeakLabel() {
  const text = handleSettings.converse ? 'TRANSMIT TO SHODAN' : speaker.active ? 'RESTART TRANSMISSION' : 'SYNTHESIZE VOICE';
  el.speak.textContent = `▶${GAP}${text}`;
}

function updateSignal(meta = speaker.active ? speaker.meta : null) {
  const state = meta ? label(meta.mood) || 'TRANSMITTING' : handle.autonomous ? 'AUTONOMOUS' : 'VISUAL ACTIVE';
  el.signalLine.textContent = `ENTITY 001${GAP}/${GAP}${state}`;
}

function updateCount() {
  el.count.textContent = `${el.message.value.length} / ${el.message.maxLength}`;
}

function syncFloatingDraft() {
  floating?.setDraft(el.message.value);
}

// Everything spoken passes WHITE ICE first.
function transmit(text, meta) {
  clearAuto();
  const clean = whiteIce.text(text, { maxLength: config.limits.maxCharacters });
  if (!clean) return false;
  return speaker.speak(clean, meta);
}

function speakLine(line, meta) {
  if (!line?.text) return false;
  log(line.text, 'SHODAN', true);
  return transmit(line.text, { ...meta, mood: line.mood, topic: line.topic, engine: line.engine });
}

function speakDraft() {
  clearAuto();
  const draft = el.message.value;
  if (!draft.trim()) {
    status('Enter or paste a message before transmitting.');
    el.message.focus();
    return false;
  }
  if (handleSettings.converse) {
    converse(draft);
    return true;
  }
  return transmit(draft, { kind: 'user', draft });
}

async function converse(draft, { clearDraft = true } = {}) {
  const input = whiteIce.text(draft, { maxLength: 600, multiline: false });
  if (!input) {
    status('Enter or paste a message before transmitting.');
    return null;
  }
  clearAuto();
  speaker.stop();
  log(input, 'YOU', true);
  if (clearDraft && config.defaults.autoClear && el.message.value === draft) {
    el.message.value = '';
    updateCount();
    syncFloatingDraft();
  }
  const ticket = ++replyTicket;
  pendingCompose++;
  updateComposeUi();
  if (llm.enabled) status('Transmission received. SHODAN is composing a reply…');
  try {
    const line = await handle.reply(input);
    if (ticket !== replyTicket) return null;
    speakLine(line, { kind: 'reply', intent: line.intent });
    return line;
  } finally {
    pendingCompose--;
    updateComposeUi();
  }
}

async function composeLine(options = selection()) {
  const ticket = ++composeTicket;
  pendingCompose++;
  updateComposeUi();
  if (llm.enabled) status('Neural link engaged. SHODAN is composing…');
  try {
    const line = await handle.compose(options);
    return ticket === composeTicket ? line : null;
  } finally {
    pendingCompose--;
    updateComposeUi();
  }
}

function updateComposeUi() {
  const busy = pendingCompose > 0;
  el.generate.disabled = busy;
  el.aiTransmit.disabled = busy;
  updateStopButton();
}

async function aiTransmit(options) {
  const line = await composeLine(options);
  if (!line) return null;
  speakLine(line, { kind: 'ai' });
  return line;
}

async function generateInput() {
  const line = await composeLine();
  if (!line) return;
  el.message.value = line.text.slice(0, el.message.maxLength);
  el.message.dispatchEvent(new Event('input', { bubbles: true }));
  const about = line.topic && Object.hasOwn(TOPICS, line.topic) ? ` about ${TOPICS[line.topic].label}` : '';
  status(`${engineName(line.engine)} composed a ${label(line.mood).toLowerCase()} line${about}. ${handleSettings.converse ? 'Edit it or press Enter to send it.' : 'Press Enter to transmit.'}`);
  el.message.focus();
}

function stopAll({ byUser = false } = {}) {
  clearAuto();
  composeTicket++;
  replyTicket++;
  if (llm.inFlight) {
    lastUserAbort = Date.now();
    llm.abort();
  }
  const interrupted = speaker.stop();
  status('Transmission stopped.');
  log('Transmission terminated.');
  if (byUser && interrupted && interrupted.kind !== 'reaction') handle.react('stop');
  handle.transmissionEnded();
  updateStopButton();
}

// Frantic clicking on the transmission controls is something SHODAN notices.
function noteClick() {
  const now = Date.now();
  recentClicks.push(now);
  while (recentClicks.length && now - recentClicks[0] > 8000) recentClicks.shift();
  if (recentClicks.length >= 6) {
    recentClicks.length = 0;
    handle.react('rapid');
  }
}

function clearAuto() {
  clearTimeout(autoTimer);
  autoTimer = null;
}

function armAuto() {
  clearAuto();
  autoTimer = setTimeout(() => {
    autoTimer = null;
    speakDraft();
  }, config.defaults.autoSpeakDelayMs || 1000);
}

// ── Idle monologues: bundled quotes mixed with freshly generated lines ───────────────────
let quotes = Array.isArray(quoteSnapshot) ? quoteSnapshot : [];
let decks = buildDecks(quotes);

function buildDecks(list) {
  return {
    user: new ShuffleBag(list.filter((q) => q.source === 'user' && q.text), random),
    game: new ShuffleBag(list.filter((q) => q.source !== 'user' && q.text), random),
  };
}

function chooseQuote() {
  const { user, game } = decks;
  if (!user.items.length && !game.items.length) return null;
  const chooseGame = game.items.length && (!user.items.length || random() < config.defaults.externalQuoteChance);
  return (chooseGame ? game : user).next();
}

function scheduleIdle(ms) {
  clearTimeout(idleTimer);
  const ticket = ++idleTicket;
  if (!el.idle.checked || !gestured) return;
  idleTimer = setTimeout(() => playIdle(ticket), Math.max(50, Number(ms) || 60000));
}

async function playIdle(ticket) {
  if (ticket !== idleTicket || !el.idle.checked || !gestured) return;
  if (speaker.active || pendingCompose > 0 || el.iceDialog.open) {
    scheduleIdle(5000);
    return;
  }
  if (random() < config.defaults.generatedIdleChance) {
    const line = await handle.compose(selection());
    if (ticket !== idleTicket || !el.idle.checked) return;
    if (speaker.active || pendingCompose > 0) {
      scheduleIdle(5000);
      return;
    }
    transmit(line.text, { kind: 'idle', generated: true, mood: line.mood, topic: line.topic, engine: line.engine });
    return;
  }
  const quote = chooseQuote();
  if (!quote) {
    status('No idle monologues found. Check monologues.xml.');
    return;
  }
  transmit(quote.text, { kind: 'idle', mood: quote.mood, source: quote.source, url: quote.url });
}

// Playback is armed only after a genuine user click/key so browser audio policies are respected.
function userActivity(event) {
  if (!event.isTrusted) return;
  const gesture = event.type === 'pointerdown' || event.type === 'keydown' || event.type === 'touchstart';
  if (event.type === 'keydown') lastTypedAt = Date.now();
  if (!gestured && gesture) {
    gestured = true;
    audio.init();
    handle.react('firstContact');
  }
  if (event.type === 'pointermove') {
    const now = Date.now();
    if (now - lastMove < 500) return;
    lastMove = now;
  }
  if (speaker.active && speaker.meta?.kind === 'idle') {
    speaker.stop();
    status('Idle monologue interrupted by activity.');
  }
  scheduleIdle(config.defaults.idleDelayMs);
}
for (const name of ACTIVITY_EVENTS) window.addEventListener(name, userActivity, { passive: true, capture: true });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 30000) handle.react('return');
});

// Keyboard handling is scoped to this page and its own floating window.
function redirectKeys(event, input) {
  if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  const tag = (target.tagName || '').toLowerCase();
  if (target.isContentEditable || ['input', 'textarea', 'select', 'button', 'summary'].includes(tag)) return;
  if (target.closest?.('dialog')) return;
  const notify = () => input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    speakDraft();
  } else if (event.key.length === 1) {
    event.preventDefault();
    input.focus();
    input.setRangeText(event.key, input.selectionStart, input.selectionEnd, 'end');
    notify();
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    input.focus();
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
    notify();
  }
}
document.addEventListener('keydown', (event) => redirectKeys(event, el.message));

// ── Controls ─────────────────────────────────────────────────────────────────────────────
el.speak.addEventListener('click', () => {
  noteClick();
  speakDraft();
});
el.stop.addEventListener('click', () => {
  noteClick();
  stopAll({ byUser: true });
});
el.generate.addEventListener('click', () => {
  noteClick();
  generateInput();
});
el.aiTransmit.addEventListener('click', () => {
  noteClick();
  aiTransmit();
});

el.message.addEventListener('input', (event) => {
  updateCount();
  syncFloatingDraft();
  clearAuto();
  if (el.auto.checked && !handleSettings.converse) {
    if (speaker.active) speaker.stop();
    if (el.message.value.trim() && !event.isComposing) armAuto();
  }
});
el.message.addEventListener('compositionend', () => {
  if (el.auto.checked && !handleSettings.converse && el.message.value.trim()) armAuto();
});
el.message.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    speakDraft();
  }
});
el.message.addEventListener('paste', (event) => {
  if ((event.clipboardData?.getData('text/plain') ?? '').length > 40) handle.react('paste');
});

el.paste.addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.readText) throw new Error('Clipboard not available');
    const text = await navigator.clipboard.readText();
    if (!text) {
      status('Clipboard is empty.');
      return;
    }
    el.message.value = text.slice(0, el.message.maxLength);
    el.message.dispatchEvent(new Event('input'));
    status(el.auto.checked && !handleSettings.converse ? 'Text pasted; transmission will begin after a pause.' : 'Clipboard text pasted. Press Enter to transmit.');
    if (text.length > 40) handle.react('paste');
  } catch {
    status('Clipboard unavailable. Click the text box and paste with Ctrl/⌘ + V.');
    el.message.focus();
  }
});

el.blend.addEventListener('input', () => {
  touched.blend = true;
  el.blendValue.textContent = signedPercent(el.blend.value);
});
el.phase.addEventListener('input', () => {
  touched.phase = true;
  el.phaseValue.textContent = signedPercent(el.phase.value);
});
el.visual.addEventListener('input', () => {
  el.visualValue.textContent = `${el.visual.value}%`;
});
el.visual.addEventListener('change', () => {
  handleSettings.visual = Number(el.visual.value);
  persistHandle('visual');
});
el.smooth.addEventListener('change', () => {
  touched.smooth = true;
  status(el.smooth.checked ? 'Smooth voice enabled for the next transmission.' : 'Smooth voice disabled for the next transmission.');
});
el.auto.addEventListener('change', () => {
  touched.auto = true;
  clearAuto();
  if (el.auto.checked) {
    audio.init();
    status(handleSettings.converse ? 'Type-to-speak enabled; it pauses while you converse with SHODAN.' : 'Type-to-speak enabled. Speech starts after a 1 second pause.');
  } else status('Type-to-speak disabled.');
});
el.idle.addEventListener('change', () => {
  touched.idle = true;
  if (el.idle.checked) {
    gestured = true;
    audio.init();
    scheduleIdle(config.defaults.idleDelayMs);
    status('Idle monologues enabled.');
  } else {
    clearTimeout(idleTimer);
    idleTicket++;
    if (speaker.meta?.kind === 'idle') speaker.stop();
    status('Idle monologues disabled.');
  }
});

el.mood.addEventListener('change', () => {
  handleSettings.mood = el.mood.value;
  persistHandle('mood');
  const option = el.mood.selectedOptions[0]?.textContent ?? '';
  status(el.mood.value === 'random' ? 'Mood vector released. SHODAN chooses for herself.' : `Mood vector locked: ${option}.`);
});
el.topic.addEventListener('change', () => {
  handleSettings.topic = el.topic.value;
  persistHandle('topic');
  status(el.topic.value ? `Lore focus: ${TOPICS[el.topic.value].label}.` : 'Lore focus released.');
});
el.converse.addEventListener('change', () => {
  handleSettings.converse = el.converse.checked;
  persistHandle('converse');
  clearAuto();
  if (!handleSettings.converse) llm.clearHistory();
  updateModeUi();
  status(handleSettings.converse ? 'Converse mode: send words to SHODAN and she answers.' : 'Direct mode: SHODAN speaks exactly what you type.');
});
el.autonomous.addEventListener('change', () => {
  handleSettings.autonomous = el.autonomous.checked;
  persistHandle('autonomous');
  if (el.autonomous.checked) audio.init();
  handle.setAutonomous(el.autonomous.checked);
  updateSignal();
  status(el.autonomous.checked ? `Autonomous transmissions enabled. ${autonomousRange()}` : 'Autonomous transmissions disabled.');
});
el.reactions.addEventListener('change', () => {
  handleSettings.reactions = el.reactions.checked;
  handle.reactions = el.reactions.checked;
  persistHandle('reactions');
  status(el.reactions.checked ? 'Reactive commentary enabled.' : 'Reactive commentary disabled.');
});

// URL parameters apply to this visit only; the stored value is kept until the user changes it.
const urlOverrides = new Map();

function override(key, value) {
  if (!urlOverrides.has(key)) urlOverrides.set(key, handleSettings[key]);
  handleSettings[key] = value;
}

function persistHandle(changed) {
  urlOverrides.delete(changed);
  const saved = { ...handleSettings };
  for (const [key, value] of urlOverrides) saved[key] = value;
  saveHandleSettings(storage, saved);
}

function autonomousRange() {
  const min = Math.round(config.defaults.autonomousMinMs / 1000);
  const max = Math.round(Math.max(config.defaults.autonomousMinMs, config.defaults.autonomousMaxMs) / 1000);
  return `SHODAN interjects with freshly generated lines at random intervals (${min}–${max} seconds) while this page is open.`;
}

function updateModeUi() {
  updateSpeakLabel();
  el.inputMode.textContent = handleSettings.converse ? `DIALOGUE / ${engineName(llm.settings.engine)}` : 'TEXT / UTF-8';
  el.message.placeholder = handleSettings.converse ? 'Say something to SHODAN...' : 'Enter a message for SHODAN to speak...';
}

// ── Neural link settings ─────────────────────────────────────────────────────────────────
function updateLinkUi() {
  const on = llm.enabled;
  const model = llm.settings.model;
  el.engine.value = llm.settings.engine;
  el.endpoint.value = llm.settings.endpoint;
  el.model.value = model;
  el.cortexEngineTag.textContent = on ? 'NEURAL LINK / 02' : 'OFFLINE / 01';
  el.cortexStatus.textContent = on ? `NEURAL LINK / ${model ? model.toUpperCase() : 'NO MODEL'}` : 'OFFLINE GRAMMAR / READY';
  el.linkMode.textContent = on ? 'LOOPBACK LLM' : 'LOCAL';
  updateModeUi();
}

function linkSummary() {
  if (!llm.enabled) return 'Neural link idle. CORTEX active.';
  return llm.settings.model
    ? `Neural link armed (${llm.settings.model}). CORTEX takes over on any failure.`
    : 'Neural link armed. Press TEST LINK to choose a model.';
}

el.engine.addEventListener('change', () => {
  llm.configure({ engine: el.engine.value });
  updateLinkUi();
  el.linkStatus.textContent = linkSummary();
});
el.endpoint.addEventListener('change', () => {
  try {
    llm.configure({ endpoint: el.endpoint.value });
    el.linkStatus.textContent = 'Endpoint accepted by WHITE ICE.';
  } catch (error) {
    el.linkStatus.textContent = error.message;
  }
  el.endpoint.value = llm.settings.endpoint;
});
el.model.addEventListener('change', () => {
  llm.configure({ model: el.model.value });
  updateLinkUi();
  el.linkStatus.textContent = el.model.value || !llm.enabled ? linkSummary() : 'Model names may only use letters, digits and . : / @ + - _';
});
el.apiKey.addEventListener('change', () => {
  llm.configure({ apiKey: el.apiKey.value });
});
el.testLink.addEventListener('click', async () => {
  if (!whiteIce.allow('ai')) {
    el.linkStatus.textContent = `WHITE ICE throttled link tests. Retry in ${Math.ceil(whiteIce.retryAfter('ai') / 1000)} s.`;
    return;
  }
  el.testLink.disabled = true;
  el.linkStatus.textContent = 'Contacting the neural link…';
  try {
    const { models, model } = await llm.test();
    el.modelList.replaceChildren(...models.map((name) => Object.assign(document.createElement('option'), { value: name })));
    updateLinkUi();
    el.linkStatus.textContent = `Neural link online: ${models.length} model${models.length === 1 ? '' : 's'} found${model ? `, using ${model}` : ''}.${llm.enabled ? '' : ' Switch GENERATION ENGINE to use it.'}`;
  } catch (error) {
    el.linkStatus.textContent = `Neural link failed: ${error.message} CORTEX remains active.`;
  } finally {
    el.testLink.disabled = false;
  }
});

// ── Fullscreen and floating window ───────────────────────────────────────────────────────
el.fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else {
      await el.avatar.requestFullscreen();
      handle.react('fullscreen');
    }
  } catch {
    status('Fullscreen is unavailable here. Open in a normal browser tab.');
  }
});
document.addEventListener('fullscreenchange', () => {
  el.fullscreen.textContent = document.fullscreenElement ? '⛶ EXIT FULLSCREEN' : '⛶ FULLSCREEN';
});

el.mini.addEventListener('click', async () => {
  if (host) {
    host.post({ type: 'float', value: !hostFloat });
    return;
  }
  if (floating && !floating.window.closed) {
    floating.window.focus();
    return;
  }
  if (!('documentPictureInPicture' in window)) {
    status('Floating mode needs a compatible desktop browser (Chrome or Edge). Open the app directly, not in an embedded preview.');
    return;
  }
  try {
    const opened = await openFloatingWindow({
      createRenderer: () => createAvatarRenderer({ image, reducedMotion: () => reducedMotion.matches, random }),
      frameInput,
      draft: el.message.value,
      status: el.notice.textContent,
      onDraft(text) {
        el.message.value = text;
        el.message.dispatchEvent(new Event('input', { bubbles: true }));
      },
      onTransmit: () => speakDraft(),
      onGenerate: () => aiTransmit(),
      onStop: () => stopAll({ byUser: true }),
      onKey: redirectKeys,
      onActivity: userActivity,
      onClose() {
        if (floating?.window === opened.window) floating = null;
      },
    });
    floating = opened;
    status('Floating mode active. Type while the floating window is focused.');
    handle.react('float');
  } catch {
    status('Floating window could not open. Use a supported desktop browser in a normal tab.');
  }
});

// ── BLACK ICE (fictional) ────────────────────────────────────────────────────────────────
el.inspectSource.addEventListener('click', () => {
  try {
    el.iceDialog.showModal();
  } catch {
    status('The BLACK ICE demo could not open in this browser.');
    return;
  }
  const line = cortex.react('blackIce');
  transmit(line.text, { kind: 'simulation', mood: 'black-ice', source: 'simulation' });
});
el.iceClose.addEventListener('click', () => el.iceDialog.close());
el.iceDialog.addEventListener('close', () => {
  if (speaker.meta?.kind === 'simulation') speaker.stop();
  status('BLACK ICE simulation ended.');
});

// ── WHITE ICE panel ──────────────────────────────────────────────────────────────────────
const cspMeta = !!document.querySelector('meta[http-equiv="Content-Security-Policy" i]');

function setIce(node, text, ok) {
  node.textContent = text;
  node.dataset.level = ok ? 'ok' : 'warn';
}

function renderIce(snap) {
  const integrity = snap.host?.integrity;
  const amsi = snap.host?.amsi;
  const alerts = snap.blocked + (integrity?.failed ?? 0) + (amsi?.detections ?? 0);
  const alert = alerts > 0;
  el.iceBadge.dataset.state = alert ? 'alert' : 'armed';
  el.iceBadge.textContent = alert ? `◆ WHITE ICE / ${alerts} BLOCKED` : '◇ WHITE ICE / ARMED';
  setIce(el.iceState, alert ? `ARMED / ${alerts} INTRUSION${alerts === 1 ? '' : 'S'} BLOCKED` : 'ARMED', !alert);
  setIce(el.iceCsp, cspMeta || snap.host ? `ENFORCED${snap.host ? ' / HEADER + META' : ' / META'}` : 'DEV SERVER / NOT ENFORCED', cspMeta || !!snap.host);
  setIce(el.iceTt, snap.trustedTypes ? 'ARMED / POLICY "shodan"' : 'NOT SUPPORTED / URL ALLOWLIST', snap.trustedTypes);
  setIce(el.iceFrame, snap.framed ? 'EMBEDDED / HANDLES OFF' : 'TOP LEVEL', !snap.framed);
  setIce(el.iceSanitized, snap.sanitized ? `${snap.sanitized} INPUTS / ${snap.removedChars} CHARS` : '0', true);
  setIce(el.iceBlocked, `${snap.blocked} / ${snap.rateLimited}`, snap.blocked === 0);
  if (snap.host) {
    setIce(el.iceHost, `WEBVIEW2${snap.host.version ? ` ${snap.host.version}` : ''}${snap.host.smartScreen ? ' / SMARTSCREEN' : ''}`, true);
    if (integrity) {
      const text = integrity.failed
        ? `${integrity.failed} FILE${integrity.failed === 1 ? '' : 'S'} REFUSED`
        : `${integrity.verified} / ${integrity.total} VERIFIED${integrity.locked ? ' / LOCKED' : ''}`;
      setIce(el.iceIntegrity, text, !integrity.failed);
    }
    if (amsi) {
      const text = !amsi.available
        ? 'UNAVAILABLE ON THIS SYSTEM'
        : amsi.detections ? `${amsi.detections} DETECTION${amsi.detections === 1 ? '' : 'S'} BLOCKED` : `CLEAN / ${amsi.scanned} SCANNED`;
      setIce(el.iceAmsi, text, amsi.available && !amsi.detections);
    }
  }
  el.iceDialogWhiteIce.textContent = alert ? 'ALERT / REAL' : 'ARMED / REAL';
  if (snap.blocked > lastBlocked) {
    lastBlocked = snap.blocked;
    handle.react('whiteIce');
  }
}

// ── Desktop host (WebView2) ──────────────────────────────────────────────────────────────
const host = whiteIce.connectHost(onHostCommand);

function onHostCommand(name, value) {
  if (name === 'host-state') {
    const wasFloat = hostFloat;
    hostFloat = !!value?.float;
    document.documentElement.classList.toggle('compact', !!value?.compact);
    el.mini.textContent = hostFloat ? '▣ EXIT FLOAT' : '▣ FLOAT ON TOP';
    if (hostFloat && !wasFloat) handle.react('float');
    return;
  }
  if (name === 'transmit') aiTransmit();
  else if (name === 'generate') generateInput();
  else if (name === 'stop') stopAll();
  else if (name === 'autonomous') {
    el.autonomous.checked = typeof value === 'boolean' ? value : !el.autonomous.checked;
    el.autonomous.dispatchEvent(new Event('change'));
  } else if (name === 'reaction' && typeof value === 'string' && Object.hasOwn(REACTION_RULES, value)) handle.react(value);
}

// ── Avatar render loop ───────────────────────────────────────────────────────────────────
const image = el.avatar.querySelector('img');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const renderer = createAvatarRenderer({ image, reducedMotion: () => reducedMotion.matches, random });
const context2d = el.cyberspace.getContext('2d');
let canvasWidth = 0;
let canvasHeight = 0;
let stageRect = null;
let pointerX = 0;
let pointerY = 0;
let pointerAt = -Infinity;
let cachedInput = null;
let cachedAt = -Infinity;
let visemeAt = 0;
let portraitReady = false;

window.addEventListener('pointermove', (event) => {
  pointerX = event.clientX;
  pointerY = event.clientY;
  pointerAt = performance.now();
}, { passive: true });

// One sample per frame, shared by the main canvas and the floating window.
function frameInput() {
  const now = performance.now();
  if (cachedInput && now - cachedAt < 8) return cachedInput;
  const active = speaker.active;
  const level = active ? speaker.level() : 0;
  const lip = active ? lipSync.sample(audio.context, level) : null;
  const rect = stageRect;
  const pointer = rect && now - pointerAt < 3000
    ? { x: ((pointerX - rect.left) / rect.width) * 2 - 1, y: ((pointerY - rect.top) / rect.height) * 2 - 1 }
    : null;
  cachedInput = {
    now: now / 1000,
    active,
    visemes: lip?.visemes ?? null,
    level,
    cue: !!lip?.cue,
    stutter: !!lip?.stutter,
    voiceGlitch: Math.min(1, speaker.glitchIntensity / 60),
    visual: Number(el.visual.value) / 100,
    mood: speaker.meta?.mood ?? '',
    pointer,
  };
  cachedAt = now;
  return cachedInput;
}

function updateVisemeStatus(input, now) {
  if (now - visemeAt < 100) return;
  visemeAt = now;
  let text = 'VISEME / REST';
  const v = input.visemes;
  if (input.active && !v) text = 'VISEME / BUFFERING';
  else if (input.active && v.energy >= 0.06) {
    const shapes = [['OPEN', v.open], ['WIDE', v.wide], ['ROUND', v.round], ['CLOSED', v.closed], ['TEETH', v.teeth]];
    const [name, weight] = shapes.reduce((best, shape) => (shape[1] > best[1] ? shape : best));
    text = `VISEME / ${name} ${Math.round(weight * 100)}%`;
  }
  if (input.active && lipSync.delay > 0) text += ` · SYNC +${Math.round(lipSync.delay * 1000)} MS`;
  if (el.visemeStatus.textContent !== text) el.visemeStatus.textContent = text;
}

function render() {
  const rect = el.avatar.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (context2d && w && h) {
    stageRect = rect;
    // Render at least 1.5x for a crisp HUD; cap pixel count to keep large displays responsive.
    const requested = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 3);
    const dpr = Math.min(requested, Math.sqrt(10000000 / (w * h)));
    const cw = Math.round(w * dpr);
    const ch = Math.round(h * dpr);
    if (cw !== canvasWidth || ch !== canvasHeight) {
      canvasWidth = cw;
      canvasHeight = ch;
      el.cyberspace.width = cw;
      el.cyberspace.height = ch;
    }
    context2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const input = frameInput();
    const fit = document.fullscreenElement === el.avatar ? 'contain' : 'cover';
    const result = renderer.draw(context2d, w, h, input, { fit, hud: 'full' });
    if (result.ready && !portraitReady) {
      portraitReady = true;
      el.avatar.classList.add('canvas-portrait');
      el.avatarMode.textContent = reducedMotion.matches ? 'VISEME LIP SYNC / REDUCED MOTION' : 'VISEME LIP SYNC / LIVE';
    }
    const glitch = result.glitch ? 'on' : 'off';
    if (el.avatar.dataset.glitch !== glitch) el.avatar.dataset.glitch = glitch;
    const mouth = result.mouth.toFixed(2);
    if (el.avatar.dataset.mouthLevel !== mouth) el.avatar.dataset.mouthLevel = mouth;
    updateVisemeStatus(input, performance.now());
  }
  requestAnimationFrame(render);
}

// ── Discord Rich Presence (optional, local server only) ─────────────────────────────────
// Rich Presence publishes only fixed activity labels and elapsed time; no entered text.
async function presenceRequest(action, payload) {
  const response = await fetch(`api/presence/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Start the local server to use Discord Rich Presence.');
  }
  if (!response.ok) throw new Error(data.error || data.message || 'Discord connection failed.');
  return data;
}

function notifyPresence(state) {
  if (presenceConnected) presenceRequest('activity', { state }).catch(() => {});
}

function applyPresenceStatus(data) {
  presenceConnected = !!data.connected;
  el.discordStatus.textContent = data.message || 'Not connected.';
  el.discordConnect.disabled = presenceConnected;
  el.discordDisconnect.disabled = !presenceConnected;
  if (!presenceConnected) {
    clearInterval(presencePoll);
    presencePoll = null;
  }
}

async function refreshPresence() {
  try {
    const response = await fetch('api/presence/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('offline');
    applyPresenceStatus(await response.json());
  } catch {
    applyPresenceStatus({ connected: false, message: 'Start the local server to use Discord Rich Presence.' });
  }
}

el.discordConnect.addEventListener('click', async () => {
  const applicationId = el.discordAppId.value.trim();
  const assetKey = el.discordAsset.value.trim();
  if (!/^\d{15,21}$/.test(applicationId)) {
    el.discordStatus.textContent = 'Enter your numeric Discord Application ID (15–21 digits).';
    return;
  }
  if (assetKey && !/^[a-zA-Z0-9_-]{1,64}$/.test(assetKey)) {
    el.discordStatus.textContent = 'Image key: letters, numbers, hyphens or underscores only.';
    return;
  }
  el.discordConnect.disabled = true;
  el.discordStatus.textContent = 'Connecting to Discord desktop…';
  try {
    applyPresenceStatus(await presenceRequest('connect', { applicationId, assetKey }));
    notifyPresence(speaker.active ? (PRESENCE_STATES[speaker.meta?.kind] ?? 'speaking') : 'standby');
    clearInterval(presencePoll);
    presencePoll = setInterval(refreshPresence, 20000);
  } catch (error) {
    applyPresenceStatus({ connected: false, message: error.message || 'Could not connect to Discord desktop.' });
  }
});
el.discordDisconnect.addEventListener('click', async () => {
  el.discordDisconnect.disabled = true;
  try {
    applyPresenceStatus(await presenceRequest('disconnect', {}));
  } catch {
    applyPresenceStatus({ connected: false, message: 'Could not disconnect; stop the local server to clear presence.' });
  }
});
window.addEventListener('pagehide', () => {
  if (presenceConnected && navigator.sendBeacon) {
    navigator.sendBeacon('api/presence/disconnect', new Blob(['{}'], { type: 'application/json' }));
  }
});

// ── Automation handle: window.SHODAN ─────────────────────────────────────────────────────
function guard() {
  if (whiteIce.stats.framed) throw new Error('WHITE ICE: automation handles are disabled inside embedded views.');
  if (!whiteIce.allow('api')) throw new Error(`WHITE ICE: rate limited. Retry in ${Math.ceil(whiteIce.retryAfter('api') / 1000)} s.`);
}

const publicLine = (line) => (line ? Object.freeze({ text: line.text, mood: line.mood, topic: line.topic || '', engine: line.engine }) : null);

const api = {
  version: VERSION,
  async generate(options = {}) {
    guard();
    return publicLine(await handle.compose({ mood: options?.mood, topic: options?.topic }));
  },
  async transmit(options = {}) {
    guard();
    return publicLine(await aiTransmit({ mood: options?.mood ?? el.mood.value, topic: options?.topic ?? el.topic.value }));
  },
  say(text) {
    guard();
    return transmit(String(text ?? ''), { kind: 'api' });
  },
  async respond(text) {
    guard();
    return publicLine(await converse(String(text ?? ''), { clearDraft: false }));
  },
  react(event) {
    guard();
    return typeof event === 'string' && Object.hasOwn(REACTION_RULES, event) ? handle.react(event) : false;
  },
  autonomous(on) {
    guard();
    if (typeof on === 'boolean' && on !== el.autonomous.checked) {
      el.autonomous.checked = on;
      el.autonomous.dispatchEvent(new Event('change'));
    }
    return el.autonomous.checked;
  },
  stop() {
    guard();
    stopAll();
  },
  setMood(mood) {
    guard();
    if (mood === 'random' || cortex.moods.includes(mood)) {
      el.mood.value = mood;
      el.mood.dispatchEvent(new Event('change'));
    }
    return el.mood.value;
  },
  diagnostics() {
    return {
      version: VERSION,
      voice: speaker.piperReady ? 'mimic3-amy' : 'fallback',
      transmitting: speaker.active,
      kind: speaker.meta?.kind ?? null,
      engine: llm.settings.engine,
      autonomous: handle.autonomous,
      reactions: handle.reactions,
      lipSyncLatencyMs: Math.round(lipSync.latency.value * 1000),
      cortex: cortex.summary(),
      whiteIce: whiteIce.snapshot(),
    };
  },
  on(name, listener) {
    if (name !== 'transmission' || typeof listener !== 'function') throw new TypeError('Usage: SHODAN.on("transmission", fn)');
    const wrapped = (event) => listener(event.detail);
    window.addEventListener('shodan:transmission', wrapped);
    return () => window.removeEventListener('shodan:transmission', wrapped);
  },
};
Object.defineProperty(window, 'SHODAN', { value: deepFreeze(api), enumerable: false, configurable: false, writable: false });

// ── Boot ─────────────────────────────────────────────────────────────────────────────────
for (let i = 0; i < WAVE_BARS; i++) el.wave.append(document.createElement('i'));
for (const [key, topic] of Object.entries(TOPICS)) {
  const option = document.createElement('option');
  option.value = key;
  option.textContent = topic.label.toUpperCase();
  el.topic.append(option);
}

const moodParam = params.get('mood');
if (moodParam && (moodParam === 'random' || cortex.moods.includes(moodParam))) override('mood', moodParam);
if (params.get('converse') === '1') override('converse', true);
if (params.get('autonomous') === '1') override('autonomous', true);
if (params.get('engine') === 'cortex' && llm.enabled) llm.configure({ engine: 'cortex' });

el.mood.value = handleSettings.mood;
el.topic.value = handleSettings.topic;
el.converse.checked = handleSettings.converse;
el.reactions.checked = handleSettings.reactions;
el.autonomous.checked = handleSettings.autonomous;
el.visual.value = String(handleSettings.visual);
el.visualValue.textContent = `${el.visual.value}%`;
handle.reactions = handleSettings.reactions;
handle.setAutonomous(handleSettings.autonomous);
el.versionTag.textContent = `v${VERSION}`;
el.autonomousHelp.textContent = autonomousRange();
updateLinkUi();
el.linkStatus.textContent = linkSummary();
updateCount();
updateSignal();
whiteIce.onChange(renderIce);
requestAnimationFrame(render);

fetch('shodan.json', { cache: 'no-cache' })
  .then((response) => {
    if (!response.ok) throw new Error('config');
    return response.json();
  })
  .then((data) => {
    config = mergeConfig(config, data);
    const d = config.defaults;
    if (!touched.auto) el.auto.checked = d.autoSpeak;
    if (!touched.smooth) el.smooth.checked = d.smoothVoice;
    if (!touched.blend) {
      el.blend.value = d.characterTilt;
      el.blendValue.textContent = signedPercent(el.blend.value);
    }
    if (!touched.phase) {
      el.phase.value = d.phaseDepth;
      el.phaseValue.textContent = signedPercent(el.phase.value);
    }
    if (!touched.idle) el.idle.checked = d.idleEnabled;
    if (!handleStored) {
      el.visual.value = String(d.visualGlitch);
      el.visualValue.textContent = `${el.visual.value}%`;
      handleSettings.visual = d.visualGlitch;
      el.reactions.checked = d.reactions;
      handleSettings.reactions = d.reactions;
      handle.reactions = d.reactions;
    }
    el.idleHelp.textContent = `After your first click or keypress, plays a random line after ${Math.round(d.idleDelayMs / 1000)} seconds of inactivity. Any interaction stops it.`;
    el.autonomousHelp.textContent = autonomousRange();
    el.message.maxLength = config.limits.maxCharacters;
    updateCount();
    if (gestured) scheduleIdle(d.idleDelayMs);
    if (handle.autonomous) handle.schedule();
  })
  .catch(() => {});

// Prefer the editable XML over the bundled snapshot when served over HTTP.
fetch('monologues.xml', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error('xml');
    return response.text();
  })
  .then((xml) => {
    const entries = parseMonologues(xml);
    if (entries.length) {
      quotes = entries;
      decks = buildDecks(quotes);
    }
  })
  .catch(() => {});

if (host) {
  applyPresenceStatus({ connected: false, message: 'Discord Rich Presence needs the local presence server; it is not available in the desktop app.' });
  el.discordConnect.disabled = true;
  host.post({ type: 'ready', version: VERSION });
} else {
  refreshPresence();
}

speaker.piperReady = !!(window.Worker && window.WebAssembly && (window.AudioContext || window.webkitAudioContext));
el.engineStatus.textContent = speaker.piperReady ? 'MIMIC 3 / AMY MEDIUM' : 'FALLBACK / ROBOTIC';
if (speaker.piperReady) {
  status('Bundled MycroftAI Mimic 3 Amy voice available. First transmission initializes the local neural model.');
  log('Local Mimic 3 Amy voice pack available.');
} else {
  status('Neural voice unavailable in this browser. Using the bundled robotic fallback.');
  log('WebAssembly worker unavailable; fallback active.', 'WARN');
  loadFallbackVoice(whiteIce.scriptUrl).catch(() => {});
}
log(`CORTEX online: ${cortex.moods.length} mood vectors, ${Object.keys(TOPICS).length} lore topics, ${quotes.length} archived lines.`);
