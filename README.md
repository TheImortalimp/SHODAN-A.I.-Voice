# SHODAN Voice Lab

A static, browser-based SHODAN Amy voice site. The deployed page is [`shodan.html`](./shodan.html); its audio and visual processing run in the browser using the bundled assets.

## Current project layout

- `shodan.html` and `assets/` are the deployed page and its bundled application files.
- `source/shodan.js` is a readable application-logic snapshot. The page currently loads the built bundle at `assets/shodan-DfQkFGit.js`.
- The repository does not include a package manifest or reproducible build pipeline. Changes to `source/shodan.js` alone will not update the deployed bundle; restore a build workflow before relying on it for deployment.
- `monologues.xml` and `monologues.js` contain the editable and browser-loaded monologue data.
- [`shodan-encoded-metadata/ARCHIVED.md`](./shodan-encoded-metadata/ARCHIVED.md) marks the earlier upload as archived. Preserve it for history; new work belongs in the root-level site.

Serve the repository root over HTTP or HTTPS and open `shodan.html`. Browser workers, audio, and WebAssembly may not work when opening the file directly from disk.

## Voice and sound

- The bundled Piper Amy medium model is English (United States), one speaker, 22,050 Hz. Character tilt and phase controls shape the sound; this is one voice, not a second-voice blend.
- A bundled eSpeak/meSpeak robotic voice is used if the browser cannot run the local neural voice or Amy initialization fails.
- Glitch effects include audio stutters, pitch changes, and audio-reactive visual effects.
- Other interface features include editable monologues, optional type-to-speak, fullscreen, floating picture-in-picture where supported, and a fictional BLACK ICE source-inspection demo. Keyboard capture is limited to the focused app/window.

## Attribution

The bundled Amy ONNX model is distributed under the voice dataset's CC BY-SA 4.0 terms. Preserve the attribution, model card, and license in `THIRD_PARTY_NOTICES.md` and `voice-packs/amy/` when redistributing. The Piper wrapper, phonemizer WebAssembly, and ONNX Runtime have their own MIT licenses.
