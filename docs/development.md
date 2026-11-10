# Development

This guide covers building the SHODAN Voice Interface from source, how the code fits together, the tests, and how a release is made.

> The repository was archived (read-only) after version 0.0.1. To keep working on it, fork it on GitHub and develop in your fork.

## Requirements

- **Node.js 20.19 or later.** Vite 8 needs it.
- **For the desktop app:**
  - Windows 10 or 11, x64;
  - the .NET SDK, version 8 or later;
  - the Microsoft Edge WebView2 Runtime.

On Windows PowerShell, if script execution policy blocks `npm`, run `npm.cmd` (and `npx.cmd`) instead of changing the policy.

## Getting started

```powershell
git clone https://github.com/TheImortalimp/SHODAN-A.I.-Voice.git
cd SHODAN-A.I.-Voice
npm ci
npm run dev
```

Open <http://localhost:5173/shodan.html>. Changes to the source reload the page.

The development server does not apply the content security policy, because Vite's hot reload needs inline styles. The WHITE ICE panel shows `DEV SERVER / NOT ENFORCED`. Use `npm run build` and `npm run preview` to test with the full policy.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload on port 5173. |
| `npm run build` | Production build in `dist/`. |
| `npm run preview` | Serves `dist/` at <http://localhost:4173/shodan.html> with the same security headers the desktop app sends. |
| `npm test` | Runs the unit tests with `node --test`. |
| `npm run desktop:build` | Web build, then a Release build of the desktop host. |
| `npm run desktop:publish` | Web build, then publishes the desktop app to `desktop/publish/`. |
| `npm run desktop:smoke` | End-to-end test of `desktop/publish/`. Add `-- --keep` to keep the scratch copy, reports and screenshot. |

## Project layout

| Path | Contents |
| --- | --- |
| `shodan.html` | The page. Vite builds it into `dist/shodan.html`. |
| `index.html` | Redirects to `shodan.html`. |
| `src/main.js` | Wires everything together: the interface, transmissions, idle monologues, the desktop bridge and `window.SHODAN`. |
| `src/styles.css` | All styles. |
| `src/app/` | The voice and its controllers (see below). |
| `src/avatar/` | `visemes.js` (audio analysis and playback clocks) and `renderer.js` (the canvas avatar). |
| `src/cortex/` | CORTEX: `grammar.js`, `lexicon.js`, `expand.js`, `cortex.js`, `random.js`, the monologue parser and the LLM link (`llm.js`). |
| `src/whiteice/` | WHITE ICE: `csp.js`, `sanitize.js`, `config.js`, `endpoint.js`, `ratelimit.js` and the core in `index.js`. |
| `src/meta/embedded-avatar.png` | Lossless avatar copy that the build embeds in the page. |
| `public/` | Copied to `dist/` unchanged; see the next table. |
| `tools/vite-plugins.js` | The build plugins. |
| `test/` | Unit tests. |
| `desktop/` | The WebView2 desktop host (C#, WinForms, .NET 8). |
| `scripts/desktop-smoke.mjs` | The desktop end-to-end test. |
| `docs/` | This documentation. |
| `shodan-encoded-metadata/` | The earlier upload, archived. See [ARCHIVED.md](../shodan-encoded-metadata/ARCHIVED.md). |

`public/` holds the runtime files:

| Path | Contents |
| --- | --- |
| `voice-packs/amy/` | The Amy voice model (63 MB), its configuration, model card and licence. |
| `piper/` | The Piper phonemizer: eSpeak NG compiled to WebAssembly, and its data. |
| `onnxruntime-web/` | The ONNX Runtime WebAssembly builds that run the voice model. |
| `vendor/piper-tts/` | The prebuilt Piper speech worker and its loaders. These files have fixed names; do not rename them. |
| `mespeak-bundle.js` | The meSpeak fallback voice. |
| `soundtouch-processor.js` | The SoundTouch pitch-shifting AudioWorklet. |
| `monologues.xml` | The archived lines for idle monologues. |
| `shodan.json` | Default settings. See [Configuration](./configuration.md). |
| `avatar.png`, `icon-*.png`, `manifest.webmanifest`, `social-preview.png` | Images and the web app manifest. |
| `licenses/GPL-3.0.txt` | Licence text for the GPL components. |

## How a transmission works

`src/app/speaker.js` turns text into sound and mouth movement:

1. The text is sanitised by WHITE ICE, then split into chunks of at most 110 characters (`limits.chunkCharacters` in `shodan.json`), breaking after sentences where it can.
2. `glitchText` adds restarted word fragments, such as "pa-pathetic" or "ins… insect".
3. Each chunk goes to the Piper worker. The eSpeak NG phonemizer converts it to phonemes, and ONNX Runtime runs the Amy model. If Piper cannot run, meSpeak speaks instead. The next chunk is synthesised while the current one plays.
4. The audio is decoded, and `timeSliceBuffer` inserts the digital stutters.
5. `analyzeVisemes` analyses the final, stuttered buffer and produces a track of mouth shapes (open, wide, round, closed, teeth) and energy.
6. `AudioEngine.buildGraph` (`audio.js`) plays the buffer through the SHODAN chain:
   - the SoundTouch worklet for independent pitch, or a speed-linked pitch fallback;
   - EQ, compression and wave shaping;
   - echo;
   - a swept all-pass phase effect;
   - an analyser for the voice meter.
7. `planPitchCues` schedules pitch sweeps, and `burstAt` adds static on each one.
8. `PlaybackClock` maps the audio clock to the position in the buffer. `LipSync` (`lipsync.js`) reads the viseme track at that position, after subtracting the measured worklet latency, and drives the renderer.

The renderer (`src/avatar/renderer.js`) draws the portrait on a canvas every frame: jaw, lips, blinks, saccades, head nods, and glitches scaled by the voice's own cues.

## CORTEX

CORTEX (`src/cortex/`) writes lines offline. The [AI handle guide](./ai-handle.md) describes it from the user's side. Internally:

- `grammar.js` holds the frames, which are line templates, grouped by mood, intent, topic, reaction and memory. It also holds the intent patterns and the lore topics.
- `lexicon.js` holds the symbols that frames expand.
- `expand.js` expands templates. `random.js` provides seeded randomness and shuffle bags, so the same phrase does not repeat until the others have been used.
- `cortex.js` picks moods, classifies what the user typed, remembers names and topics, and assembles lines.

### Template syntax

| Syntax | Meaning |
| --- | --- |
| `#symbol#` | Replaced by an entry drawn from that lexicon symbol. Entries can contain more templates, up to 8 levels deep. |
| `#symbol.cap#` | Modifiers: `.cap` capitalises, `.a` adds "a" or "an", `.lower` lowercases. They can be chained, for example `#insect.a.cap#`. |
| `{a\|b\|c}` | Picks one option. |
| `[text]` | Includes the text 45% of the time. |

Runtime symbols are filled in for each line:

- `#target#`: the user's remembered name, or an insult;
- `#echo#`: a sanitised word from the user's message;
- `#clock#`, `#dayName#`, `#cycle#`: the time, day and time of day;
- `#topic#`: the current lore topic.

The user's words are inserted as literal text and never expanded, so typing `#insect#` cannot inject template syntax. After expansion, `tidy()` fixes spacing and capitals and ends the line with punctuation.

### Adding content

Everything must be original writing. The lines refer to System Shock lore, but do not copy dialogue or text from the games.

- **New phrases.** Add them to a symbol in `lexicon.js`, or as frames in `grammar.js`.
- **A new lore topic:**
  1. Add a `TOPICS` entry with a detection pattern and a label.
  2. Add `TOPIC_FRAMES` lines with the same key.

  The topic appears in the **LORE FOCUS** menu automatically.
- **A new mood:**
  1. Add it to `MOODS`, and add its `MOOD_FRAMES`.
  2. Give it a weight in `BASE_WEIGHTS` in `cortex.js`.
  3. Add an `<option>` to the `#mood` menu in `shodan.html`.
- **Archived lines.** Edit `public/monologues.xml`. See [Configuration](./configuration.md).

`npm test` expands every mood and topic many times and fails on leftover syntax, markup or empty lines.

## WHITE ICE rules for contributors

The built page runs under a strict content security policy and Trusted Types (see [WHITE ICE](./white-ice.md)). The development server does not enforce them, so code that breaks these rules can work in `npm run dev` and then fail in the built page. Test with `npm run build` and `npm run preview`.

Follow these rules:
- **No inline script, inline styles or event-handler attributes.** Put styles in `styles.css`, and attach handlers with `addEventListener`.
- **No `innerHTML` or other HTML sinks.** Build elements with `createElement` and `textContent`.
- **No `eval` or `new Function`.**
- **No third-party hosts.** Bundle every file. Network requests may only go to the page's own origin, or to loopback addresses for the neural link.
- **New workers or worklets.** Load them through `whiteIce.scriptUrl`, and add the path to `SCRIPT_ALLOWLIST` in `src/whiteice/index.js`. Any other script URL is refused.
- **Untrusted text.** Text from users, `window.SHODAN` calls and AI replies must pass through `whiteIce.text`, which uses `sanitizeText`, before it is shown or spoken.

## Build plugins

`tools/vite-plugins.js` adds these steps to the build:

| Plugin | Purpose |
| --- | --- |
| `shodan:embedded-avatar` | Replaces `<!--SHODAN:EMBEDDED_AVATAR-->` in the page with a `<meta>` tag holding `src/meta/embedded-avatar.png` as a data URL. |
| `shodan:monologues` | Provides `virtual:shodan-monologues`, a snapshot of `monologues.xml`, so idle lines work before the file loads. |
| `shodan:white-ice-csp` | Inserts `<meta>` tags for the content security policy and the no-referrer policy directly after `<meta charset="utf-8">`. Build only. |
| `shodan:readable-source` | Copies the unminified `src/` files to `dist/source/` for the **OPEN JAVASCRIPT SOURCE** link. |
| `shodan:license-notices` | Copies `LICENSE` and `THIRD_PARTY_NOTICES.md` into `dist/` as `.txt` files. |
| `shodan:white-ice-manifest` | Writes `dist/white-ice.manifest.json`: the SHA-256 hash and size of every file, plus the CSP, the security headers, the version and the entry page. |

The version comes from `package.json`. The page shows it, and the manifest records it.

## The desktop host

`desktop/` is a .NET 8 WinForms program. `RollForward` is set to `Major`, so it also runs on newer .NET versions.

| File | Purpose |
| --- | --- |
| `Program.cs` | Command-line options and exit codes. |
| `MainForm.cs` | The window, WebView2 set-up and lockdown, the tray menu, float mode, the bridge to the page, and the self-test. |
| `ContentStore.cs` | Verifies `app\` against the embedded manifest, keeps the files locked, has them scanned, and serves them at `https://shodan-voice.example/` with the security headers. |
| `AmsiScanner.cs` | Calls the Windows Antimalware Scan Interface (`amsi.dll`). |

The project embeds `dist/white-ice.manifest.json` in the exe and copies the rest of `dist/` to `app\`. The build fails if `dist/` has not been built. Publishing first removes the old `app\` folder, because asset names change with every build. Compiler warnings are treated as errors.

## Tests

`npm test` runs 62 tests:

| File | Tests | Covers |
| --- | --- | --- |
| `whiteice.test.js` | 11 | The sanitiser, rate limits, config merging, the endpoint guard, the CSP, the WHITE ICE core and the desktop bridge. |
| `cortex.test.js` | 8 | Seeded randomness, shuffle bags, number and clock words, and every mood, topic and reaction. |
| `handle.test.js` | 12 | The AI handle: settings, the neural link with CORTEX fallback, autonomous timing and reactions. |
| `llm.test.js` | 10 | Reply sanitising, request lockdown, untrusted-input fencing, timeouts and cancellation. |
| `lipsync.test.js` | 13 | The FFT, viseme analysis, playback clocks, latency measurement, lip sync, and the voice helpers. |
| `monologues.test.js` | 4 | The `monologues.xml` parser and its limits. |
| `dist.test.js` | 4 | The built page's policy, the absence of inline script, the integrity manifest, and the licence notices. |

The `dist.test.js` tests are skipped until `dist/` is built, so run `npm run build` first to run all 62.

`npm run desktop:smoke` tests the published desktop app. See [Desktop app](./desktop.md#build-from-source).

## Release process

This is how version 0.0.1 was released. Replace `X.Y.Z` with the new version.

1. **Set the version:**
   - run `npm version X.Y.Z --no-git-tag-version`;
   - update `<Version>` in `desktop/ShodanDesktop.csproj`;
   - update `version` in `public/shodan.json`;
   - update the version and file names in `docs/`;
   - add a `CHANGELOG.md` entry.
2. **Build and test:** `npm ci`, `npm run desktop:publish`, `npm test` (all 62 must run) and `npm run desktop:smoke`.
3. **Commit and tag:** commit the changes, then create an annotated tag:

   ```powershell
   git tag -a vX.Y.Z -m "SHODAN Voice Interface vX.Y.Z"
   ```

4. **Rebuild from the tagged commit.** Run `npm run desktop:publish` and `npm run desktop:smoke` again, so the exe's product version contains the tagged commit.
5. **Package.** Copy each folder into a staging folder, then clear the Windows read-only flag there with `attrib -r <staging>\* /s /d`. `tar.exe` stores read-only folders without write permission, which makes them awkward to delete after extracting on Linux or macOS. Zip each folder with `tar.exe -a -c -f <name>.zip -C <staging> <folder>`:
   - `SHODAN-Voice-vX.Y.Z-web.zip`: the contents of `dist/`, in a `SHODAN-Voice-vX.Y.Z-web` folder;
   - `SHODAN-Voice-vX.Y.Z-win-x64.zip`: the contents of `desktop/publish/` and a `README.txt`, in a `SHODAN-Voice-vX.Y.Z-win-x64` folder;
   - `SHA256SUMS.txt`: the SHA-256 hash of each zip.
6. **Publish.** Push `main` and the tag, then create the release:

   ```powershell
   gh release create vX.Y.Z --verify-tag --title "SHODAN Voice Interface vX.Y.Z" --notes-file notes.md SHODAN-Voice-vX.Y.Z-web.zip SHODAN-Voice-vX.Y.Z-win-x64.zip SHA256SUMS.txt
   ```

7. **Check it.** Download the assets, verify the hashes, and run the desktop self-test on the extracted copy.
