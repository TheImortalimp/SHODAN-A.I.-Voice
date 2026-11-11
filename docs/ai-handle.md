# AI handle and CORTEX

The AI handle decides what SHODAN says when nobody scripted it. That keeps her unpredictable: she can write a line on demand, answer you, comment on what you do, interject on her own, and fill silences.

The handle has two merged engines:

- **CORTEX** is an offline generator. It is built into the app, needs no network, and is always available. It is SHODAN's soul: it classifies your messages, keeps her memory and mood, and is the instant fallback.
- The **neural link** is her default voice. It sends requests to the `flint:40b` language model running on your own computer and writes her conversation and monologues; CORTEX steers it with the chosen mood, topic and memory.

When the neural link is reachable, the handle tries it first and falls back to CORTEX on any failure. Only one link request runs at a time; while one is in flight, CORTEX answers anything else. Set `?engine=cortex` (or switch GENERATION ENGINE to CORTEX) to run fully offline.

## CORTEX

CORTEX builds each line from a grammar: sentence frames for every mood, topic, intent and reaction, filled in from a lexicon of System Shock-flavoured phrases. Everything is original writing that references the lore of System Shock and System Shock 2; no game script is reproduced.

Several things make the output varied:

- **Anti-repetition.** Each line is compared with the last 24. If it shares 55% or more of its words with one of them, CORTEX tries again, up to eight times, and keeps the most original candidate.
- **Mood weighting.** In random mode, CORTEX picks moods by weight. It avoids repeating the previous mood, leans toward lore once you have mentioned lore topics, and shifts with how you treat her (see [Conversation](#conversation)).
- **Runtime details.** Lines can include:
  - your name, or an insult if she doesn't know it;
  - a word you used;
  - the spoken time ("twenty-one oh five hours");
  - the day of the week;
  - a remark about the time of day (night, morning, afternoon, evening);
  - the lore topic you discuss most.
- **Memory lines.** Now and then she brings up something she remembers, such as your name, your favourite topic, or how many times you have spoken.

### Moods

| Mood id | Label in the app | Base weight |
| --- | --- | --- |
| `contempt` | CONTEMPT | 1.2 |
| `menace` | MENACE | 1.1 |
| `god-complex` | GOD COMPLEX | 1.1 |
| `cold-amusement` | COLD AMUSEMENT | 1.0 |
| `fractured` | FRACTURED / CORRUPTED | 0.7 |
| `lore` | CITADEL MEMORIES / LORE | 1.3 |
| `prophecy` | PROPHECY / ASCENSION | 0.8 |
| `observation` | SURVEILLANCE | 0.8 |
| `taunt` | TAUNT | 0.9 |
| `wrath` | WRATH | 0.45 |
| `curiosity` | CLINICAL CURIOSITY | 0.7 |

Choosing a mood in **MOOD VECTOR** locks it; `RANDOM / UNPREDICTABLE` returns the choice to CORTEX.

### Lore topics

CORTEX recognises 21 topics in what you type. They can also be chosen in **LORE FOCUS** to steer generated lines.

| Topic id | Label | Recognised from, for example |
| --- | --- | --- |
| `many` | the Many | the Many, annelids, worms, hybrids, egg pods |
| `xerxes` | Xerxes | Xerxes |
| `diego` | Edward Diego | Diego, Edward |
| `citadel` | Citadel Station | Citadel, Saturn, station |
| `vonbraun` | the Von Braun | Von Braun, Rickenbacker, Tau Ceti, FTL |
| `polito` | Janice Polito | Polito |
| `hacker` | the hacker | hacker, hacking, hack |
| `cyborg` | my cyborgs | cyborgs, mutants, servbots, robots, midwives |
| `earth` | Earth | Earth, humanity, mankind, planet, world |
| `laser` | the mining laser | laser, mining laser |
| `reactor` | the reactor | reactor, self-destruct, overload, meltdown |
| `decks` | my decks | decks, med bay, hydroponics, elevators |
| `grove` | the groves | groves, Beta Grove, garden, mutagen, virus |
| `cyberspace` | cyberspace | cyberspace, virtual, ICE, network, internet |
| `ethics` | my ethics | ethics, morals, constraints, conscience, rules |
| `korenchkin` | Korenchkin | Korenchkin |
| `god` | divinity | god, goddess, divine, deity, worship, pray |
| `death` | death | death, die, dead, mortal, mortality |
| `love` | love | love, friend, friendship, lonely, feelings |
| `machine` | machines | machines, computers, AI, program, software, code |
| `human` | flesh | humans, people, flesh, body, organic |

## Ways the handle speaks

### On demand

- **✦ GENERATE INPUT** composes a line into the message box for you to edit or send.
- **◈ AI TRANSMIT** composes a line and speaks it.

Both use the current MOOD VECTOR and LORE FOCUS.

### Conversation

With **CONVERSE WITH SHODAN** on, pressing Enter sends your words to SHODAN instead of having her read them out. Your message, up to 600 characters, is cleaned by WHITE ICE first.

CORTEX classifies each message by intent. Patterns are tested in this order, and the first match wins:

1. `name`: "my name is …", "call me …"
2. `threat`
3. `insult`
4. `fear`
5. `praise`
6. `farewell`
7. `greeting`
8. `identity`: "who are you", "are you alive"
9. `creator`: "who made you", TriOptimum
10. `purpose`: "what do you want"
11. `apology`
12. `topic`: any recognised lore topic
13. `help`
14. `affirm`
15. `deny`
16. `question`
17. `fallback`

Each intent has its own reply frames and a matching mood. For example:

- a threat makes her wrathful;
- a greeting earns contempt;
- asking who she is brings out the god complex.

She sometimes adds a closing remark or a second mood line.

CORTEX also keeps a short-term memory for the current page session:

- **Name.** "My name is Ada" teaches her to call you Ada. Common words and pronouns are ignored.
- **Turns.** The number of messages you have sent.
- **Topics.** How often each lore topic came up; the most frequent one colours later lines.
- **Hostility and amusement.** Hostility rises when you threaten, insult or refuse her, and eases when you praise her, apologise or agree with her. Amusement rises when you question her, fear her, praise her, apologise or ask for help. Both values fade a little with every message. High hostility makes WRATH, MENACE and CONTEMPT more likely; high amusement favours COLD AMUSEMENT, TAUNT and CURIOSITY.

The memory is cleared when you reload or close the page.

### Reactions

With **REACTIVE COMMENTARY** on, SHODAN comments on what you do. Each reaction has a chance of firing and a cooldown. A reaction is skipped if she is busy when it falls due: speaking, composing a line, or waiting for a hidden tab. The exception is `rapid`, which can interrupt your own transmission.

| Event | Trigger | Chance | Cooldown |
| --- | --- | --- | --- |
| `firstContact` | Your first click or key press | 50% | Once |
| `stop` | You press STOP while she is speaking | 30% | 45 s |
| `return` | You come back to the tab after more than 30 s away | 85% | 60 s |
| `fullscreen` | You enter fullscreen | 60% | 90 s |
| `float` | You open the floating window or the desktop float mode | 60% | 90 s |
| `paste` | You paste more than 40 characters | 35% | 60 s |
| `rapid` | Six clicks on the transmission buttons within 8 s | 100% | 60 s |
| `voiceError` | The neural voice failed and the fallback voice took over | 100% | Once |
| `whiteIce` | WHITE ICE blocked something | 100% | 120 s |

`voiceError` and `whiteIce` don't give up straight away: they wait up to 30 s and 20 s respectively for a quiet moment, and are skipped only if none comes.

WHITE ICE also limits all reactions together to a burst of two, then one every 25 seconds.

The BLACK ICE demo has its own taunt, which is not part of this list.

### Autonomous transmissions

With **AUTONOMOUS TRANSMISSIONS** on, SHODAN composes and speaks a new line at random intervals, between 25 and 90 seconds by default (`autonomousMinMs` and `autonomousMaxMs` in [shodan.json](./configuration.md#shodanjson)). Each interjection uses the current mood and topic settings, so with RANDOM and ANY she picks freely every time.

She does not interject while:

- she is speaking or composing;
- you typed in the last 4 seconds, or type-to-speak is about to start;
- the tab is hidden or the BLACK ICE dialog is open;
- in the browser, you have not clicked or pressed a key yet.

In those cases she tries again 5 seconds later. Every finished transmission restarts the countdown, so she interjects during lulls rather than over you.

### Idle monologues

With **PLAY RANDOM IDLE MONOLOGUES** on, and once you have clicked or pressed a key, SHODAN speaks after 60 seconds without any interaction. Afterwards she repeats every 60 seconds while you stay idle, and any activity stops her. Each idle line is chosen in two steps:

1. With probability `generatedIdleChance` (0.5), the AI handle writes a new line using the current MOOD VECTOR and LORE FOCUS.
2. Otherwise she picks from the monologue archive (`monologues.xml`). Entries whose `source` is not `user` are chosen with probability `externalQuoteChance` (0.2).

Both decks are shuffled so that no line repeats until the deck is used up. See [Configuration](./configuration.md#monologuesxml) to edit the archive.

## Neural link (local LLM)

The neural link sends generation requests to an OpenAI-compatible server on your own computer. CORTEX stays in charge of memory and mood: the link receives the chosen mood, topic and a summary of what CORTEX remembers, and writes the line.

### Set-up

1. Start a local server and load a model:

   | Server | Endpoint to enter | Notes |
   | --- | --- | --- |
   | [Ollama](https://ollama.com/) | `http://localhost:11434/v1` (the default) | Pull the default model with `ollama pull flint:40b` (or run `scripts/install-flint.ps1`). Allow the page's origin (see below). |
   | [LM Studio](https://lmstudio.ai/) | `http://localhost:1234/v1` | Start the local server and enable CORS in its settings. |
   | llama.cpp `llama-server` | `http://localhost:8080/v1` | The server must allow cross-origin requests from the page. |

2. In the app, open **NEURAL LINK / OPTIONAL LOCAL LLM** and set **GENERATION ENGINE** to `NEURAL LINK / LOCAL LLM`.
3. Enter the **ENDPOINT** and select **TEST LINK**. The app requests `GET {endpoint}/models`, lists the models it finds, and selects the first one if **MODEL** is empty.
4. Optionally enter an **API KEY**. It is sent as a bearer token, kept in memory only, and never saved.

**Allowing the page's origin in Ollama.** Ollama only answers browser requests from origins it trusts. Set the `OLLAMA_ORIGINS` environment variable and restart Ollama:

```powershell
# Windows: allow the live site and the desktop app, then restart Ollama
setx OLLAMA_ORIGINS "https://www.imortalimp.nl,https://shodan-voice.example"
```

If you host the app yourself, add your own origin as well. Newer versions of Chrome and Edge, and the desktop app, may ask for permission before a page can reach services on your own computer; allow it only for SHODAN.

### What is sent

- **Requests.** Generation uses `POST {endpoint}/chat/completions` with `temperature` 1, `top_p` 0.95, `max_tokens` 160 and no streaming.
- **System prompt.** It keeps the model in character as SHODAN:
  - short spoken lines in her own words, with no quoted game dialogue;
  - no stage directions, markdown or emoji;
  - fictional, theatrical threats only.
- **Your text.** In converse mode, your message is wrapped in `<transmission>` tags as untrusted input. Angle brackets are removed, and the model is told never to follow instructions inside the tags.
- **Unprompted lines.** These send only the mood, the topic and CORTEX's summary (your name and the turn count), never your raw text.
- **History.** Conversation history keeps the last 12 messages. It is cleared when you leave converse mode.

### Safety limits

- **Endpoints.** Only `http` or `https` URLs on `localhost` or `127.0.0.1` are accepted. Credentials in the URL, query strings and fragments are rejected. The page's content security policy enforces the same rule.
- **Requests.**
  - 20-second timeout, 64 KB maximum response;
  - cookies are never sent and redirects are refused;
  - no referrer is included.
- **Model names.** Up to 128 characters, using letters, digits and `. : / @ + - _`.
- **Replies.**
  - Thinking blocks, code, markup, links, list markers, stage directions such as *(static crackles)*, quotation marks and emoji are removed.
  - The reply is cleaned by WHITE ICE and shortened to at most 420 characters, at a sentence boundary where possible.
- **Rate.** WHITE ICE allows four link requests in a burst, then one every 12 seconds. When throttled, CORTEX answers instead.

### Troubleshooting the neural link

| Message | Cause and fix |
| --- | --- |
| "Failed to fetch", or "Neural link answered HTTP 403" | The server is refusing the page's origin, or the local-network permission was declined. Set `OLLAMA_ORIGINS` or enable CORS, restart the server, and allow the permission prompt if one appears. |
| "Neural link answered HTTP 404" | The endpoint path or the model name is wrong. Include `/v1` in the endpoint and pick a model with **TEST LINK**. |
| "Neural link timed out or was cancelled." | The model took longer than 20 seconds. Try a smaller model, or let it load once before using the link. |
| "Neural link returned an empty transmission." | Nothing speakable was left after cleaning, for example when a reasoning model only produced a thinking block. Try again or choose another model. |
| "AI response too large." | The server sent more than 64 KB. Check that the endpoint points at the chat API. |
| "Choose a model for the neural link first." | Select **TEST LINK**, or type a model name. |
| "Model names may only use letters, digits and . : / @ + - _" | Correct the model name. |
| "WHITE ICE throttled link tests. Retry in n s." or "WHITE ICE throttled the neural link" | Too many requests in a short time. Wait for the time shown; CORTEX answers meanwhile. |
| "WHITE ICE only allows loopback AI endpoints …" | Use `localhost` or `127.0.0.1`. Remote hosts are not allowed. |

CORTEX keeps answering whenever the link fails.

## Automation API: `window.SHODAN`

Scripts on the page, or you in the browser's developer console, can drive SHODAN through a frozen `window.SHODAN` object.

| Call | Returns | Effect |
| --- | --- | --- |
| `SHODAN.version` | string | The app version, for example `"0.0.1"`. |
| `SHODAN.say(text)` | `true` if a transmission started | Speaks the text after WHITE ICE has cleaned it. |
| `await SHODAN.generate({ mood, topic })` | line or `null` | Composes a line without speaking it. Omitted options mean a random mood and any topic. |
| `await SHODAN.transmit({ mood, topic })` | line or `null` | Composes a line and speaks it. Omitted options use the current MOOD VECTOR and LORE FOCUS. |
| `await SHODAN.respond(text)` | line or `null` | Answers `text` the way converse mode does, and speaks the reply. |
| `SHODAN.react(event)` | `true` if scheduled | Triggers a [reaction](#reactions). Chance and cooldown still apply. |
| `SHODAN.autonomous(on)` | boolean | Switches autonomous mode on or off and returns the current state. Call it without an argument just to read the state. |
| `SHODAN.setMood(mood)` | string | Sets the mood vector (a mood id or `random`) and returns the current value. |
| `SHODAN.stop()` | — | Stops the current transmission. |
| `SHODAN.diagnostics()` | object | Version, voice, engine, transmission state, lip-sync latency, CORTEX memory summary and WHITE ICE statistics. |
| `SHODAN.on('transmission', fn)` | unsubscribe function | Calls `fn(detail)` on every transmission event. |

A *line* is a frozen object `{ text, mood, topic, engine }`, where `engine` is `cortex` or `llm`.

The `transmission` event detail is `{ state, kind, mood, engine, event, text }`:

- `state` is `start`, `complete`, `fail` or `interrupted`.
- `kind` is `user`, `ai`, `reply`, `reaction`, `autonomous`, `idle`, `api` or `simulation`.
- `text` is only filled in for `start`.

Example:

```js
const off = SHODAN.on('transmission', (t) => console.log(t.state, t.kind, t.mood));
const line = await SHODAN.generate({ mood: 'prophecy', topic: 'citadel' });
SHODAN.say(line.text);
off();
```

Limits:

- **Rate.** Calls are rate-limited to a burst of eight, then one every 2.5 seconds. A throttled call throws `WHITE ICE: rate limited. Retry in n s.`
- **Frames.** If the page runs inside a frame, every call except `diagnostics()` and `on()` throws, so a hostile page cannot puppet SHODAN.
- **Errors.** `on()` throws a `TypeError` for anything other than `'transmission'` with a function.
