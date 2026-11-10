# Configuration

The web build can be customised without touching code:

- [`shodan.json`](#shodanjson) sets the default settings and limits.
- [`monologues.xml`](#monologuesxml) holds the idle monologue archive.
- [URL parameters](#url-parameters) change the settings for one visit.

Both files sit next to `shodan.html`. In the source tree they are in `public/`, and the build copies them to `dist/`.

The desktop app checks every file it serves against a list of fingerprints. To change these files for the desktop app, edit them in `public/` and rebuild; see [Desktop app](./desktop.md#file-integrity).

## shodan.json

The app loads `shodan.json` on every start and asks the browser to check for a newer copy each time. Every value is checked by WHITE ICE before it is used.

| Key | Default | Allowed | What it sets |
| --- | --- | --- | --- |
| `defaults.autoSpeak` | `false` | `true` / `false` | Initial state of SYNTHESIZE WHILE I TYPE |
| `defaults.autoSpeakDelayMs` | `1000` | 200–10000 | Pause after you stop typing before type-to-speak starts |
| `defaults.idleEnabled` | `true` | `true` / `false` | Initial state of PLAY RANDOM IDLE MONOLOGUES |
| `defaults.idleDelayMs` | `60000` | 5000–3600000 | Inactivity before the first idle line |
| `defaults.idleRepeatMs` | `60000` | 5000–3600000 | Pause between idle lines while you stay idle |
| `defaults.externalQuoteChance` | `0.2` | 0–1 | Chance that an archive line is a game or external quote |
| `defaults.generatedIdleChance` | `0.5` | 0–1 | Chance that an idle line is written by the AI handle rather than taken from the archive |
| `defaults.smoothVoice` | `true` | `true` / `false` | Initial state of SMOOTH VOICE FILTER |
| `defaults.phaseDepth` | `-50` | −100–100 | Initial BIPOLAR PHASE-SHIFT OUTPUT, in percent |
| `defaults.autoClear` | `true` | `true` / `false` | Clear the message box once your transmission starts, if you have not edited it meanwhile |
| `defaults.characterTilt` | `-50` | −50–50 | Initial LOWER PITCH LEAN ←→ FEMININE TILT, in percent |
| `defaults.visualGlitch` | `60` | 0–100 | Initial VISUAL GLITCH INTENSITY, in percent |
| `defaults.autonomousMinMs` | `25000` | 10000–3600000 | Shortest pause between autonomous transmissions |
| `defaults.autonomousMaxMs` | `90000` | 10000–3600000 | Longest pause between autonomous transmissions. A value below the minimum is treated as the minimum. |
| `defaults.reactions` | `true` | `true` / `false` | Initial state of REACTIVE COMMENTARY |
| `limits.maxCharacters` | `5000` | 100–20000 | Maximum length of MESSAGE TO SYNTHESIZE |
| `limits.chunkCharacters` | `110` | 40–400 | Approximate size of the pieces long text is split into for synthesis |

How the file is applied:

- **Bad values.** Numbers outside the allowed range are clamped to it. Values of the wrong type, unknown keys (including `__proto__` and `constructor`) and the informational `app`, `version` and `notes` fields are ignored.
- **Missing file.** If the file is missing or is not valid JSON, the built-in defaults above are used.
- **Your changes win.** The file arrives a moment after the page opens. Any control you have already changed in that moment keeps your value.
- **Saved settings win.** `visualGlitch` and `reactions` only apply while the browser has no saved AI handle settings. Changing any of the settings listed under [Stored data](#stored-data) saves them all.

Example: slower autonomous transmissions and more archive quotes.

```json
{
  "defaults": {
    "autonomousMinMs": 60000,
    "autonomousMaxMs": 180000,
    "generatedIdleChance": 0.25
  }
}
```

Keys you leave out keep their defaults.

## monologues.xml

`monologues.xml` is the archive SHODAN draws on when she plays an idle monologue.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<aiMonologues>
    <quote mood="contempt">Observe yourself, little operator. Your hands tremble.</quote>
    <quote mood="game-quote" source="System Shock 2" url="https://example.org/source">A short, attributed quote.</quote>
</aiMonologues>
```

| Attribute | Meaning |
| --- | --- |
| `mood` | A free label of up to 40 characters, shown in the log as `IDLE MONOLOGUE / MOOD`. Defaults to `unknown`. |
| `source` | Leave it out for your own lines; they count as `user` lines. Any other value, up to 80 characters, marks a game or external quote, shown as `IDLE QUOTE / SOURCE`. |
| `url` | An optional `http` or `https` link to the quote's source. Other schemes are dropped. |

Idle lines are drawn from two shuffled decks, one for `user` lines and one for game or external quotes. `externalQuoteChance` picks between them, and an empty deck is never chosen. No line repeats until its deck is used up.

**Loading.** A copy of the archive is built into the app, so idle monologues work offline. When the page is served over HTTP(S), the app also fetches `monologues.xml`, bypassing the browser cache, and uses it instead if it contains at least one valid quote.

**Parsing rules.** The parser is deliberately strict:

- **Rejected files.** A file is rejected entirely if it:
  - is larger than 256 KB;
  - declares a `<!DOCTYPE>` or `<!ENTITY>`;
  - lacks the `<aiMonologues>` root.
- **Size limits.** Only the first 500 quotes are read, and each quote is cut to 600 characters.
- **Text clean-up.**
  - Comments are removed and `<![CDATA[ … ]]>` sections are allowed.
  - The standard entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) and numeric character references are decoded.
  - A quote that contains other markup is skipped.
  - Whitespace is collapsed and control characters are removed.

The bundled archive has 62 lines. Two of them are short, attributed System Shock 2 quotes; the rest are original. If you add quotes from the games, keep them short and attributed.

## URL parameters

Parameters change settings for a single visit, for example `shodan.html?mood=menace&autonomous=1`.

| Parameter | Effect |
| --- | --- |
| `mood=<mood>` | Sets MOOD VECTOR. Use a mood id from [the moods table](./ai-handle.md#moods) or `random`. |
| `converse=1` | Turns on CONVERSE WITH SHODAN. |
| `autonomous=1` | Turns on AUTONOMOUS TRANSMISSIONS. In a browser she still waits for your first click or key press. |
| `engine=cortex` | Switches GENERATION ENGINE back to CORTEX and saves that choice. Use it to recover from a broken neural link set-up. |

`mood`, `converse` and `autonomous` don't overwrite your saved preferences. If you change one of those settings during the visit, your new choice is saved as usual.

## Stored data

The app saves very little, in the browser's local storage for the site:

| Key | Contents |
| --- | --- |
| `shodan.handle.v1` | CONVERSE, AUTONOMOUS, REACTIVE COMMENTARY, MOOD VECTOR, LORE FOCUS and VISUAL GLITCH INTENSITY |
| `shodan.cortex.v1` | GENERATION ENGINE, ENDPOINT and MODEL |

Nothing else is kept:

- **Not saved.** Your messages, the transmission log, the neural link API key and CORTEX's conversation memory are never written to storage; the memory lasts until you close or reload the page.
- **Reset on each load.** The voice controls (type-to-speak, smooth filter, tilt, phase and idle monologues) start from `shodan.json` every time.
- **Cached files.** The voice model and other files are cached by the browser like any other download.

**To reset everything:**

- **Browser.** Clear the site's data in the browser settings. In Chrome, select the icon to the left of the address bar, then *Site settings* → *Delete data*.
- **Desktop app.** Close it and delete `%LOCALAPPDATA%\ShodanVoice`.
