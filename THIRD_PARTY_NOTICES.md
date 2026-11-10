# Third-party notices

The original code in this repository is dedicated to the public domain under CC0 1.0 (see `LICENSE`). The third-party components below are redistributed **unchanged**, under their own licences. The CC0 dedication does not replace or override those licences.

`npm run build` copies the notice files into every build:

| Source | Copied to |
| --- | --- |
| This file | `dist/THIRD_PARTY_NOTICES.txt` |
| `LICENSE` | `dist/LICENSE.txt` |
| `public/licenses/GPL-3.0.txt` | `dist/licenses/GPL-3.0.txt` |

The web deployment and the desktop app (`app/`) therefore carry them. Keep these files and `voice-packs/amy/` when you redistribute the app.

System Shock, SHODAN and related names and characters belong to their respective rights holders. This is an unofficial fan project and is not affiliated with or endorsed by them.

## Summary

Paths are relative to `public/` in the repository and to the root of `dist/` in a build.

| Component | Version | Shipped files | Licence |
| --- | --- | --- | --- |
| Piper Amy voice model | piper-voices v1.0.0, medium | `voice-packs/amy/` | CC BY-SA 4.0 |
| Piper browser speech worker:<br>• @mintplex-labs/piper-tts-web 1.0.5<br>• onnxruntime-web 1.18.0 | (see component) | `vendor/piper-tts/*.js`, `onnxruntime-web/*.wasm` | MIT |
| Piper phonemizer (@diffusionstudio/piper-wasm), built from:<br>• piper-phonemize<br>• eSpeak NG | 1.0.0 | `piper/piper_phonemize.wasm`, `piper/piper_phonemize.data` | MIT and GPL-3.0-or-later |
| SoundTouchJS (@soundtouchjs/audio-worklet) | 2.1.1 | `soundtouch-processor.js` | MPL-2.0 |
| meSpeak.js, with speak.js and eSpeak | 1.9.6 | `mespeak-bundle.js` | GPL-3.0; bundled helpers MIT and BSD-3-Clause |
| Microsoft.Web.WebView2 SDK | 1.0.4314.35 | Desktop build only (`desktop/publish/`):<br>• `Microsoft.Web.WebView2.Core.dll`<br>• `Microsoft.Web.WebView2.WinForms.dll`<br>• `WebView2Loader.dll` | Microsoft BSD-style licence |
| Vite | 8 | Nothing; build tool only | MIT |

The desktop app is published framework-dependent: it uses the separately installed .NET 8 Desktop Runtime and Microsoft Edge WebView2 Runtime and does not redistribute them.

## Piper Amy US English medium voice model

- **Files:** `en_US-amy-medium.onnx` and its JSON configuration, in `voice-packs/amy/`.
- **Voice card:** Piper Amy (medium), English (United States), one speaker, 22,050 Hz. The included model card says the voice was fine-tuned from the US English Lessac voice and points to the Mimic 3 voices dataset.
- **Model source:** [rhasspy/piper-voices, Amy medium](https://huggingface.co/rhasspy/piper-voices/tree/v1.0.0/en/en_US/amy/medium).
- **Dataset and attribution:** [MycroftAI Mimic 3 Voices](https://github.com/MycroftAI/mimic3-voices).
- **Licence:** the voice dataset repository states [Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/). The licence text (`LICENSE-CC-BY-SA-4.0.txt`) and the model card (`MODEL_CARD`) are included beside the model.
- **Model SHA-256:** `b3a6e47b57b8c7fbe6a0ce2518161a50f59a9cdd8a50835c02cb02bdd6206c18`.

The model is redistributed unchanged. Preserve this attribution and the included voice-pack licence when redistributing the app.

## Piper browser speech worker

`vendor/piper-tts/` holds the minified build of the app's speech worker, which bundles:

- **@mintplex-labs/piper-tts-web 1.0.5:** Mintplex Labs (team@mintplexlabs.com). It is a fork of @diffusion-studio/vits-web. The package metadata states MIT; the package ships no separate licence file. Source: <https://github.com/Mintplex-Labs/piper-tts-web>.
- **The JavaScript loader for the Piper phonemizer:** see the next section.
- **onnxruntime-web 1.18.0:** Copyright (c) Microsoft Corporation, MIT. Source: <https://github.com/microsoft/onnxruntime>. The WebAssembly runtimes in `onnxruntime-web/` come from the same release.

## Piper phonemizer (WebAssembly)

`piper/piper_phonemize.wasm` and `piper/piper_phonemize.data` come from **@diffusionstudio/piper-wasm 1.0.0** (Konstantin Paulus; the package metadata states MIT). That package compiles two projects to WebAssembly:

- **piper-phonemize:** Copyright (c) 2023 Michael Hansen, MIT. Source: <https://github.com/rhasspy/piper-phonemize>. The Piper project itself is Copyright (c) 2022 Michael Hansen, MIT: <https://github.com/rhasspy/piper>.
- **eSpeak NG (rhasspy fork):** GNU General Public License, version 3 or later. `piper_phonemize.data` is eSpeak NG's `espeak-ng-data` folder, preloaded for the WebAssembly build. Source: <https://github.com/rhasspy/espeak-ng>, upstream <https://github.com/espeak-ng/espeak-ng>.

The build recipe is at <https://github.com/diffusion-studio/piper-wasm> and <https://github.com/wide-video/piper-wasm>. The GPL text is in `licenses/GPL-3.0.txt`.

## SoundTouchJS audio worklet

`soundtouch-processor.js` is the unmodified `soundtouch-processor.js` from **@soundtouchjs/audio-worklet 2.1.1**, by Steve 'Cutter' Blades and contributors. It is byte-identical to the published package.

It is licensed under the **Mozilla Public License, v. 2.0**: "If a copy of the MPL was not distributed with this file, You can obtain one at <https://mozilla.org/MPL/2.0/>." Source code: <https://github.com/cutterbl/SoundTouchJS> and the npm package `@soundtouchjs/audio-worklet@2.1.1`.

## meSpeak.js fallback voice

`mespeak-bundle.js` is a browser bundle of **meSpeak.js 1.9.6** (Modular eSpeak), by Norbert Landsteiner, 2011–2014, <https://www.masswerk.at/mespeak/>, together with its English voice and configuration.

- meSpeak is based on **speak.js** by Alon Zakai (<https://github.com/kripken/speak.js>, GPL-3.0). speak.js is an Emscripten build of **eSpeak** by Jonathan Duddington (<https://espeak.sourceforge.net/>, GNU GPL version 3 or later).
- As the bundle's own header says, "eSpeak and other code here are under the GNU GPL". The GPL text is in `licenses/GPL-3.0.txt`.
- Source code: <https://www.masswerk.at/mespeak/>, the npm package `mespeak`, and the speak.js and eSpeak repositories above.

The bundle also contains three small helper libraries:

- **base64-js:** Copyright (c) 2014 Jameson Little, MIT.
- **buffer:** Copyright (c) Feross Aboukhadijeh, and other contributors, MIT.
- **ieee754:** Copyright 2008 Fair Oaks Labs, Inc., BSD-3-Clause.

The licence texts follow below.

## Microsoft.Web.WebView2 SDK (desktop build only)

The desktop host references the **Microsoft.Web.WebView2 1.0.4314.35** NuGet package. A desktop publish redistributes three of its files: `Microsoft.Web.WebView2.Core.dll`, `Microsoft.Web.WebView2.WinForms.dll` and `WebView2Loader.dll`.

The package's notice says that Microsoft makes certain open source code available at <https://3rdpartysource.microsoft.com>. The package licence is:

```text
Copyright (C) Microsoft Corporation. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.
   * The name of Microsoft Corporation, or the names of its contributors 
may not be used to endorse or promote products derived from this
software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

## Build tooling

**Vite** (Copyright (c) 2019-present, VoidZero Inc. and Vite contributors, MIT) is the only npm dependency, and it is a development dependency. The production bundle contains no Vite runtime code.

## Licence texts

### MIT License

This text applies to the MIT-licensed components above, under these copyright notices:

- Copyright (c) Microsoft Corporation (onnxruntime-web)
- Copyright (c) 2022 Michael Hansen (Piper)
- Copyright (c) 2023 Michael Hansen (piper-phonemize)
- Mintplex Labs (@mintplex-labs/piper-tts-web)
- Konstantin Paulus (@diffusionstudio/piper-wasm)
- Copyright (c) 2014 Jameson Little (base64-js)
- Copyright (c) Feross Aboukhadijeh, and other contributors (buffer)

```text
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### BSD-3-Clause (ieee754)

```text
Copyright 2008 Fair Oaks Labs, Inc.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### Other licences

| Licence | Where to find it |
| --- | --- |
| GNU General Public License v3 (eSpeak NG, eSpeak, speak.js, meSpeak) | `licenses/GPL-3.0.txt`; also <https://www.gnu.org/licenses/gpl-3.0.txt> |
| Mozilla Public License 2.0 (SoundTouchJS) | <https://mozilla.org/MPL/2.0/> |
| CC BY-SA 4.0 (Amy voice) | `voice-packs/amy/LICENSE-CC-BY-SA-4.0.txt` |
