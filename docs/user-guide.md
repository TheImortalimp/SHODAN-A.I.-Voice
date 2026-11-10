# User guide

This guide walks through the SHODAN voice terminal. The web app and the desktop app share the same interface; differences are noted where they matter.

## Before you start

- **Browser.** Use a current desktop version of Microsoft Edge or Google Chrome. The voice uses WebAssembly, Web Workers and AudioWorklet, so open the page over HTTPS (or `http://localhost`), not as a file from disk. Floating mode needs Document Picture-in-Picture, which only Chromium-based desktop browsers provide.
- **First load.** The first visit downloads about 95 MB, most of it the Amy voice model and the speech runtimes. The **ENGINE** row shows `PIPER AMY / LOADING` until the voice is ready, then `MIMIC 3 / AMY MEDIUM`.
- **Sound.** Browsers only allow audio after you interact with a page, so SHODAN stays silent until your first click or key press.
- **Privacy.** Speech is synthesised on your device. Typed text never leaves your computer: the only network connection that can carry it is the optional neural link, and that only accepts addresses on your own machine.

## Layout

The terminal has three columns:

1. **Controls** (left): TRANSMISSION INPUT, CORTEX // AI HANDLE and TRANSMISSION MODE.
2. **Avatar** (middle): SHODAN's face, with FLOAT ON TOP and FULLSCREEN.
3. **System output** (right): the line being spoken, voice meters, the transmission log, status rows, and the Discord and WHITE ICE panels.

## Speaking your own text

1. Type into **MESSAGE TO SYNTHESIZE**. The counter shows how many of the 5,000 characters you have used.
2. Press **Enter** or select **▶ SYNTHESIZE VOICE**. **Shift + Enter** inserts a new line.
3. Select **■ STOP** to end the transmission early.

Some conveniences:

- You don't have to click into the message box first. While focus is not in another field, typed characters, Backspace and Enter go to the message box.
- **＋ PASTE FROM CLIPBOARD** inserts the clipboard text. Your browser may ask for permission first.
- When a transmission finishes, the message box is cleared, unless you edited it in the meantime.
- Long text is spoken in chunks of about 110 characters. The next chunk is synthesised while the current one plays.

The label above the box shows the input mode: `TEXT / UTF-8` when SHODAN speaks your words, or `DIALOGUE / CORTEX` (or `DIALOGUE / NEURAL LINK`) when you converse with her.

## Letting SHODAN speak for herself

The **CORTEX // AI HANDLE** panel controls the AI handle. CORTEX is an offline generator that writes original SHODAN lines on your device; see [AI handle and CORTEX](./ai-handle.md) for how it works.

| Control | What it does |
| --- | --- |
| **✦ GENERATE INPUT** | Writes a new line into the message box, so you can edit it before she speaks it. |
| **◈ AI TRANSMIT** | Writes a line and speaks it at once. |
| **MOOD VECTOR** | `RANDOM / UNPREDICTABLE` lets her choose a mood each time. You can also lock one of 11 moods: CONTEMPT, MENACE, GOD COMPLEX, COLD AMUSEMENT, FRACTURED / CORRUPTED, CITADEL MEMORIES / LORE, PROPHECY / ASCENSION, SURVEILLANCE, TAUNT, WRATH or CLINICAL CURIOSITY. |
| **LORE FOCUS** | `ANY / LET HER CHOOSE`, or steer her toward one of 21 System Shock topics, such as Citadel Station, Xerxes or the Many. |
| **CONVERSE WITH SHODAN** | On: Enter sends your words to SHODAN and she answers in her own voice. Off: she speaks exactly what you type. |
| **AUTONOMOUS TRANSMISSIONS** | She interjects with new lines at random intervals (25–90 seconds by default) while the page is open. |
| **REACTIVE COMMENTARY** | She comments on what you do: going fullscreen, floating, pasting, interrupting her, clicking frantically, or coming back after a while. |

These choices are remembered in this browser.

### Neural link (optional)

Open **NEURAL LINK / OPTIONAL LOCAL LLM** to route generation through a language model running on your own computer, such as Ollama, LM Studio or a llama.cpp server:

1. Set **GENERATION ENGINE** to `NEURAL LINK / LOCAL LLM`.
2. Check the **ENDPOINT**; the default is `http://localhost:11434/v1`, which is Ollama.
3. Select **TEST LINK**. It lists the server's models and picks the first one if **MODEL** is empty.

If the link fails at any point, CORTEX answers instead. The [AI handle guide](./ai-handle.md#neural-link-local-llm) covers set-up for each server.

## Shaping the voice and the avatar

The **TRANSMISSION MODE** panel:

| Control | Default | What it does |
| --- | --- | --- |
| **SYNTHESIZE WHILE I TYPE** | Off | Speaks automatically after you pause typing for 1 second. Editing interrupts the previous transmission. It is ignored while you converse with SHODAN. |
| **LOWER PITCH LEAN ←→ FEMININE TILT** | −50% | At −50% the voice sits about three semitones below Amy's neutral pitch, with warmer EQ. Positive values raise it. The glitch pitch sweeps stay active at any setting. |
| **BIPOLAR PHASE-SHIFT OUTPUT / 4.32 Hz** | −50% | Depth and polarity of a 4.32 Hz phase modulation across four all-pass stages. The rate is a modulation rate, not a vocal pitch. |
| **VISUAL GLITCH INTENSITY** | 60% | Scales the avatar's scanline tears, RGB channel splits and head jolts. Lip sync, blinking and gaze stay active at 0%. |
| **SMOOTH VOICE FILTER** | On | Cleans up the voice (high-pass, de-mud and de-harsh EQ, gentle compression) and calms the glitch bursts and echo. Turn it off for a rawer, more distorted SHODAN. |
| **PLAY RANDOM IDLE MONOLOGUES** | On | After your first click or key press, she plays a line after 60 seconds of inactivity. Any interaction stops it. |

Voice settings apply from the next transmission.

## The avatar

SHODAN's portrait is drawn live on a canvas:

- Her jaw and lips follow the audio you actually hear, stutters included.
- She blinks and looks around.
- She glitches in time with the voice.

If your operating system is set to reduce motion, the glitch effects, head movement and background animation are switched off. Lip sync, blinking and gaze keep working.

- **▣ FLOAT ON TOP.** In the browser this opens a small always-on-top window with the avatar, a message box, and ▶ TRANSMIT, ◈ AI and ■ STOP buttons. Keys you type while that window is focused go to SHODAN. In the desktop app the button shrinks the main window into a compact always-on-top window instead; select **▣ EXIT FLOAT** to return.
- **⛶ FULLSCREEN** shows the avatar alone. Press **Esc** or select **⛶ EXIT FULLSCREEN** to leave.

## Reading the output

- **SYSTEM OUTPUT** shows the line being spoken and where it came from:

  | Label | Source |
  | --- | --- |
  | `USER TRANSMISSION` | Your typed text. |
  | `CORTEX / MENACE` | An AI-written line. |
  | `NEURAL LINK REPLY / CONTEMPT` | A converse-mode reply. |
  | `REACTION / PASTE` | A reaction to something you did. |
  | `AUTONOMOUS / CORTEX / LORE` | An unprompted interjection. |
  | `IDLE MONOLOGUE / …` | An idle line. |
  | `AUTOMATION HANDLE` | A script. |

- **VOICE ACTIVITY** is a live level meter. **VOICE SIGNAL** shows the current mouth shape (OPEN, WIDE, ROUND, CLOSED or TEETH), its strength, and the measured audio latency that the lip sync compensates for.
- **TRANSMISSION LOG** keeps the last six events of this session.
- The status rows:
  - **ENGINE** shows the voice in use: `MIMIC 3 / AMY MEDIUM`, or `FALLBACK / ROBOTIC` if the neural voice could not start.
  - **CORTEX** shows the generator state.
  - **PROCESSING** confirms that synthesis runs in the browser on your device.
  - **AVATAR** shows the avatar mode.
  - **LINK STATUS** shows whether the neural link is in use.

## WHITE ICE panel

**WHITE ICE / DEFENSIVE COUNTERMEASURES** shows the live state of the app's protections. The badge at the top of the page turns into `◆ WHITE ICE / n BLOCKED` when something has been stopped.

| Row | Meaning |
| --- | --- |
| STATE | `ARMED`, or how many intrusions were blocked. |
| CONTENT POLICY | Whether the content security policy is enforced (`META` on the website, `HEADER + META` in the desktop app). |
| TRUSTED TYPES | Whether the browser enforces the `shodan` Trusted Types policy. |
| FRAME GUARD | `TOP LEVEL`, or `EMBEDDED / HANDLES OFF` if another page framed this one. |
| INPUT SANITIZED | How many inputs were cleaned and how many characters were removed. |
| BLOCKED / THROTTLED | Blocked events and rate-limited calls. |
| HOST | `BROWSER`, or the WebView2 version and SmartScreen state in the desktop app. |
| FILE INTEGRITY | Desktop app only: how many files were verified and locked. |
| DEFENDER / AMSI | Desktop app only: the Microsoft Defender (AMSI) scan result. |

[WHITE ICE security](./white-ice.md) explains each protection.

## BLACK ICE demo

**◇ INSPECT SOURCE / BLACK ICE DEMO** opens a fictional "BLACK ICE DEPLOYED" screen while SHODAN taunts you. It is a harmless joke; nothing happens to your computer.

- **RETURN TO TERMINAL** closes it.
- **OPEN JAVASCRIPT SOURCE ↗** opens the app's readable source code.

## Discord Rich Presence

**DISCORD RICH PRESENCE / OPTIONAL** shows your SHODAN session as your Discord activity. It shares only fixed activity labels and elapsed time, never your text.

It needs a separate local presence service and the Discord desktop app. That service is not part of this project, so without it the panel reports that the local server is not running. The panel is disabled in the desktop app.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Enter | Transmit the message, or send it to SHODAN in converse mode |
| Shift + Enter | New line |
| Any character, Backspace | Typed into the message box when no other field has focus |
| Esc | Leave fullscreen |
| F11 | Toggle fullscreen (desktop app) |

Shortcuts that use Ctrl, Alt or the Windows key are left to the browser.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| No sound | Click or press a key on the page first. Check that the tab and the system are not muted. |
| ENGINE shows `FALLBACK / ROBOTIC` | The Amy voice could not start, so the eSpeak-based voice took over. Reload the page. If you host the app yourself, check that every folder was uploaded, including `voice-packs/`, `piper/` and `onnxruntime-web/` ([deployment guide](./deployment.md#upload)). |
| Nothing works when opening `shodan.html` from disk | Serve the folder over HTTP(S), for example with `npm run preview`. |
| "Floating mode needs a compatible desktop browser" | Use desktop Edge or Chrome, in a normal tab rather than an embedded preview. |
| "Fullscreen is unavailable here" | Open the page in a normal browser tab. |
| "WHITE ICE throttled…" | A rate limit was reached. Wait for the number of seconds shown. |
| A banner says the page is embedded | Another site has framed the page, so automation is switched off. Open the page directly. |
| "Neural link failed…" | See [neural link troubleshooting](./ai-handle.md#troubleshooting-the-neural-link). CORTEX keeps working meanwhile. |

For desktop-specific problems, see the [desktop guide](./desktop.md#troubleshooting).
