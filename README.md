# SHODAN Voice Interface

An unofficial System Shock fan project: a SHODAN voice terminal with in-browser neural speech, a lip-synced and glitching avatar, an AI handle that writes her lines so she can stay unpredictable, and WHITE ICE defences. It runs as a static website or as a Windows desktop app built on WebView2.

Live site: <https://www.imortalimp.nl/006/shodan/shodan.html>

> System Shock and SHODAN belong to their respective owners. This project is not affiliated with or endorsed by them. CORTEX writes new lines in the spirit of the games instead of reusing game dialogue.

## Features

### Voice

- The bundled Piper **Amy** medium neural voice (from the MycroftAI Mimic 3 voices) runs entirely in the browser through WebAssembly; no text leaves the machine.
- The SHODAN treatment is applied live: word-fragment glitches, digital stutters, pitch sweeps with matching static, character tilt and phase controls. Text is synthesised in chunks, and the next chunk is prepared while the current one plays.
- A bundled meSpeak/eSpeak robotic voice takes over if the neural voice cannot run.

### Avatar

- The portrait is drawn procedurally on a canvas, so the jaw, lips, eyes and head move with the voice.
- **Lip sync** comes from a viseme track (open, wide, round, closed, teeth) computed from the final, stuttered audio, so the mouth follows exactly what you hear, glitches included. The audio pipeline's latency is measured and compensated; the status bar shows the current shape and the sync offset.
- **Animation:** blinks and double blinks, eye saccades, a digital eyelid shutter, and small head nods on syllable onsets.
- **Glitches:** RGB split, horizontal tear slices, displaced blocks and eye-slice corruption, all scaled by the voice's own glitch cues. Faint micro-tears appear while idle.
- Visual glitch strength is adjustable, and the system's reduced-motion setting is respected.

### The AI handle (CORTEX)

CORTEX is an offline generator that composes original SHODAN lines.

- 11 mood vectors: `contempt`, `menace`, `god-complex`, `cold-amusement`, `fractured`, `lore`, `prophecy`, `observation`, `taunt`, `wrath`, `curiosity`.
- 21 System Shock lore topics, including Citadel Station, Xerxes, the Many, Edward Diego, the Von Braun, Polito, the mining laser, the reactor, the decks and cyberspace.
- An archive of 62 monologue lines (`public/monologues.xml`).

It is wired into the interface in several ways:

- **GENERATE INPUT** writes a line into the message box for you to edit or speak.
- **AI TRANSMIT** composes a line and speaks it immediately.
- **Converse mode** makes SHODAN answer what you type. She notices lore topics, remembers your name and recent turns, and knows the time of day.
- **Autonomous mode** makes SHODAN interject on her own after 25–90 seconds of silence, with a random mood and topic each time.
- **Idle monologues** mix archived lines with generated ones.
- **Reactions:** SHODAN comments on first contact, frantic clicking, pasting, stopping her, switching to fullscreen or float, coming back to the tab, and WHITE ICE events.

URL parameters:

| Parameter | Effect |
| --- | --- |
| `?mood=wrath` | Start with a fixed mood (any mood above, or `random`). |
| `?converse=1` | Start in converse mode. |
| `?autonomous=1` | Start with autonomous transmissions on. |
| `?engine=cortex` | Force the offline CORTEX engine even if the neural link is enabled. |

### Optional neural link (local LLM)

CORTEX always works offline. You can also connect SHODAN to a **local** OpenAI-compatible server, such as Ollama, LM Studio or a llama.cpp server. CORTEX takes over whenever the link fails, times out or returns something unusable.

- WHITE ICE only allows loopback endpoints (`localhost` and `127.0.0.1`), so text never leaves your computer. The default endpoint is `http://localhost:11434/v1` (Ollama).
- The link is off by default. Turn it on in the AI handle panel.
- An API key, if your server needs one, is kept in memory only and never stored.
- Your text is passed to the model as clearly marked untrusted input, and replies are sanitised and length-limited before SHODAN speaks them.
- Ollama only answers browser requests from origins it trusts. Set `OLLAMA_ORIGINS` to the page origin, for example `https://www.imortalimp.nl`, or `https://shodan-voice.example` for the desktop app.
- Some browsers ask before a website may contact services on your own machine. Allow it only for this page.

### Discord Rich Presence (optional)

The Discord panel shares fixed activity labels and elapsed time, never typed text. It talks to a local presence bridge at `api/presence/*` on the page's own origin. That bridge is not part of this repository, so without it the panel just reports that the local server is not running. The panel is disabled in the desktop app.

### Automation API: `window.SHODAN`

Other scripts on the page, or the browser console, can drive SHODAN through a frozen, rate-limited handle:

| Call | Result |
| --- | --- |
| `SHODAN.say(text)` | Speak the given text (sanitised first). |
| `await SHODAN.generate({ mood, topic })` | Compose a line without speaking it. |
| `await SHODAN.transmit({ mood, topic })` | Compose a line and speak it. |
| `await SHODAN.respond(text)` | Converse-mode reply to `text`. |
| `SHODAN.react(event)` | Trigger a reaction (`firstContact`, `stop`, `return`, `fullscreen`, `float`, `paste`, `rapid`, `voiceError`, `whiteIce`). |
| `SHODAN.autonomous(true \| false)` | Switch autonomous mode; returns the current state. |
| `SHODAN.setMood(mood)` | Set the mood (or `random`). |
| `SHODAN.stop()` | Stop the current transmission. |
| `SHODAN.diagnostics()` | Voice, engine, lip-sync latency, CORTEX memory and WHITE ICE statistics. |
| `SHODAN.on('transmission', fn)` | Listen to transmissions. `fn` receives `{ state, kind, mood, engine, event, text }`, where `state` is `start`, `complete`, `fail` or `interrupted`. It returns an unsubscribe function. |

The handle is disabled whenever the page runs inside a frame. Bursts are throttled: 8 calls, then one call every 2.5 seconds.

### WHITE ICE

WHITE ICE is the defensive layer.

In the browser:

- A strict content security policy (no inline script, no `eval`, no third-party hosts, loopback-only `connect-src`) and Trusted Types (policy `shodan`).
- Every input is sanitised, including typed text, API calls and AI replies. Markup, control and bidirectional-override characters are removed.
- Rate limits on the API, AI composition, reactions and the desktop bridge.
- Frame detection, and a CSP violation monitor.
- Live status in the WHITE ICE panel.

BLACK ICE, behind the source-inspection button, is a fictional and harmless demo.

In the desktop app, WHITE ICE also hooks into Windows:

- **File integrity.** The build's SHA-256 manifest is compiled into the exe. At start-up every file is hashed and then kept open so nothing can modify, replace or delete it while the app runs. A single changed byte stops the app before any web content loads.
- **Microsoft Defender (AMSI).** Every script, page and JSON/XML data file is handed to the Antimalware Scan Interface before use, which passes it to Microsoft Defender or whichever antivirus is registered.
- **SmartScreen** reputation checks are on.
- **Allowlisted serving.** Only manifest-listed files are served, with the CSP sent as a real header.
- **Lockdown.** Navigation is limited to the app itself; external `https` links open in your normal browser. Downloads, pop-ups, host objects, autofill and password saving are off. Developer tools are off in Release builds.
- **Permissions.** Requests are denied except autoplay and user-initiated clipboard reads. Newer kinds of permission request show the standard WebView2 prompt so you decide.

## Development

Requirements: Node.js 20 or later.

```sh
npm install
npm run dev       # Vite dev server (no CSP in dev mode; HMR needs inline styles)
npm test          # unit tests: CORTEX, AI handle, lip sync, LLM link, WHITE ICE, build output
npm run build     # production build in dist/ (CSP, integrity manifest, readable sources)
npm run preview   # serve dist/ on http://localhost:4173/shodan.html
```

On Windows PowerShell, if script execution policy blocks `npm`, run `npm.cmd` instead of changing the policy.

### Deploying the website

Upload the **contents** of `dist/` to the site folder (currently `/006/shodan/`), keeping the folder structure. This includes the `voice-packs/`, `piper/`, `onnxruntime-web/` and `vendor/` folders.

- Serve `.wasm` files as `application/wasm`.
- `white-ice.manifest.json` is only used by the desktop build, so uploading it is optional.
- The page carries its CSP in a `<meta>` tag. If your host lets you set response headers, also send the `csp` and `headers` values from `dist/white-ice.manifest.json`, which add `frame-ancestors 'none'` and the other security headers.
- Open the page over HTTP or HTTPS, not from disk, so that workers, audio and WebAssembly work.

The **OPEN JAVASCRIPT SOURCE** link serves the readable modules from `dist/source/`.

## Desktop app (WebView2)

Requirements: Windows 10 or 11 (x64), the [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0), and the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/), which is preinstalled on Windows 11. Building also needs the .NET 8 SDK.

```sh
npm run desktop:publish   # web build + desktop/publish/ShodanVoice.exe (with its app/ folder)
npm run desktop:smoke     # end-to-end test of the published app (add -- --keep to keep reports and a screenshot)
```

To use it, run `desktop/publish/ShodanVoice.exe`; to distribute it, ship the whole `desktop/publish/` folder.

- **Tray menu:** AI transmit, Generate input, Stop transmission, Toggle autonomous transmissions, Float on top, Show SHODAN, Exit.
- **Float:** the FLOAT button, or the tray menu, turns SHODAN into a compact always-on-top window in the corner of the screen.
- **Keys:** F11 toggles fullscreen and Esc leaves it.
- **Data:** browser data is kept in `%LOCALAPPDATA%\ShodanVoice\WebView2`.
- **Command line:**
  - `--smoke-test` runs the self-test and exits;
  - `--smoke-out <file>` writes its JSON report;
  - `--user-data <folder>` overrides the browser data folder.

The smoke test runs on a scratch copy of the publish folder and checks:

- integrity, AMSI, SmartScreen and CSP status;
- that unlisted files are refused, even when they exist on disk;
- a complete Amy transmission with live lip sync;
- that served files cannot be written, deleted or renamed while the app runs;
- that a tampered build is refused with a breach report naming the changed file.

The exe is not code-signed. Windows SmartScreen may warn about a downloaded copy until it is signed with a code-signing certificate.

## Project layout

| Path | Contents |
| --- | --- |
| `shodan.html`, `index.html` | Page template and redirect |
| `src/main.js` | App wiring: UI, transmissions, host bridge, `window.SHODAN` |
| `src/app/` | Voice pipeline (Piper, DSP, chunking, speaker), lip-sync clock, AI handle, floating window |
| `src/avatar/` | Viseme analysis and the canvas avatar renderer |
| `src/cortex/` | CORTEX grammar, lexicon, memory, monologue parser and the optional LLM link |
| `src/whiteice/` | CSP, sanitiser, rate limits, endpoint guard and the WHITE ICE core |
| `public/` | Voice pack, WebAssembly runtimes, fallback voice, monologues, icons, config (`shodan.json`) |
| `tools/vite-plugins.js` | Build plugins: embedded avatar, monologue snapshot, CSP, readable sources, integrity manifest |
| `test/` | `node --test` unit tests |
| `desktop/` | WebView2 desktop host (C#, .NET 8 WinForms) |
| `scripts/desktop-smoke.mjs` | Desktop end-to-end smoke test |
| `shodan-encoded-metadata/` | The earlier upload, archived ([ARCHIVED.md](./shodan-encoded-metadata/ARCHIVED.md)) |

## Licences and attribution

The original project code is dedicated to the public domain under [CC0 1.0](./LICENSE). Bundled third-party components keep their own licences, which are listed with their licence texts in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). In particular:

- the Amy voice model is CC BY-SA 4.0;
- the Piper phonemizer's eSpeak NG data and the meSpeak fallback voice are GPL-3.0;
- the SoundTouch worklet is MPL-2.0.

Every build also contains `THIRD_PARTY_NOTICES.txt`, `LICENSE.txt`, `licenses/GPL-3.0.txt` and `voice-packs/amy/`. Keep them when you redistribute the app.
