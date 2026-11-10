# Third-party notices

## Piper Amy US English medium voice model

- Model: `en_US-amy-medium.onnx` and matching JSON configuration.
- Voice card: Piper Amy (medium), English (United States), one speaker, 22,050 Hz. The included model card says the voice was fine-tuned from the US English Lessac voice and points to the Mimic 3 voices dataset.
- Model source: [rhasspy/piper-voices, Amy medium](https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en/en_US/amy/medium).
- Dataset / attribution: [MycroftAI Mimic 3 Voices](https://github.com/MycroftAI/mimic3-voices).
- License stated by the voice dataset repository: [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/). The license text and model card are included beside the files in `public/voice-packs/amy/`.
- Model SHA-256: `b3a6e47b57b8c7fbe6a0ce2518161a50f59a9cdd8a50835c02cb02bdd6206c18`.

The model is redistributed unchanged. The repository's root CC0 notice does not replace or override the separate license applying to this voice model. Preserve this attribution and the included voice-pack license when redistributing the app.

## Browser inference runtime

- `@mintplex-labs/piper-tts-web` 1.0.5 — MIT; browser-side Piper/ONNX runtime wrapper.
- `@diffusionstudio/piper-wasm` 1.0.0 — MIT; Piper phonemizer WebAssembly assets.
- `onnxruntime-web` 1.18.0 — MIT; ONNX Runtime WebAssembly assets.

The package license notices are available in `node_modules` after `npm install`; see each package's upstream repository/package metadata. This file records the exact versions used by `package-lock.json`.
