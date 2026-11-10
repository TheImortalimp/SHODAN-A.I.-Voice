# SHODAN Voice Lab

A browser-based rebuild of the supplied SHODAN-A.I.-Voice GitHub ZIP, using its live page as a feature and visual reference. The app bundles one neural voice: Piper Amy medium, from the MycroftAI Mimic 3 voices dataset. It does not include the live site's second SHODAN voice model or a dual-voice mix.

## Run locally

Requirements: Node.js 20.19 or newer.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Core speech generation uses the bundled Amy model and local browser WebAssembly assets; typed text is not sent to a speech server. The first run may take time to download/load the model assets from this app. After they are available in the browser's local model cache, inference runs on-device. A built deployment is roughly 100 MB because it includes the 61 MB model and inference runtime.

Create a static deployment bundle with:

```sh
npm run build
```

Deploy the contents of `dist/` over HTTPS (GitHub Pages is suitable). No GitHub upload is performed by this project.

## Voice and sound treatment

- **Piper Amy medium:** English (United States), one speaker, 22,050 Hz. Default character tilt is −50% (about three semitones below neutral) with warmer EQ; positive values raise the baseline. This is a single voice, not a second-voice blend.
- **Fallback:** a bundled eSpeak/meSpeak robotic voice is used if the browser cannot run the local neural voice or Amy initialization fails. The status indicator reports when fallback is active.
- **4.32 Hz phase treatment:** four phase-spread all-pass filters are driven by smooth sine LFOs at exactly 4.32 cycles per second. Phase output is bipolar and defaults to −50% (inverted polarity at half depth); this is modulation, not a vocal fundamental. Strong up/down pitch sweeps remain active at every tilt setting. Glitches add short repeated audio slices and restart word/word-part fragments to create stutters and false starts, alongside EQ, waveshaping, delay, and compression.
- **Other interface features:** editable monologues, optional type-to-speak, audio-reactive visual effects, fullscreen, floating-picture-in-picture where supported, and an explicitly fictional BLACK ICE source-inspection demo. Keyboard capture is limited to the focused app/window; there is no system-wide key capture.

## Optional Discord Rich Presence

Discord integration is optional and is not required for speech. It works only on the user's own computer with Discord desktop and the local Python bridge; it is unavailable in the hosted preview/static site. It shares fixed activity labels and elapsed time, never entered text. To enable it:

```sh
python3 -m pip install pypresence
npm run presence
```

Run the bridge in one terminal, then start Vite in another. The bridge binds to loopback (`127.0.0.1:8765`); Vite forwards only the app's `/api/presence` requests to it. No Discord token or password is requested.

## Voice model attribution and license

The bundled Amy ONNX model is distributed under the voice dataset's CC BY-SA 4.0 terms. Attribution, the model card, the license text, and the model SHA-256 are in `THIRD_PARTY_NOTICES.md` and `public/voice-packs/amy/`. Preserve these files and the attribution when redistributing. The Piper wrapper, phonemizer WebAssembly, and ONNX Runtime have their own MIT licenses.
