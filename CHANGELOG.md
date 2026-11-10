# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/).

## [0.0.1] - 2026-11-10

The first tagged release, and the final release of this repository, which is now archived.

### Added

- **Voice.**
  - The Piper Amy neural voice runs in the browser through WebAssembly and ONNX Runtime, with a meSpeak fallback.
  - The SHODAN treatment is applied live: word-fragment glitches, digital stutters, pitch sweeps with static, character tilt and phase.
  - Text is synthesised in chunks, and the next chunk is prepared while the current one plays.
- **Avatar.**
  - A procedural canvas portrait with lip sync from a viseme track, computed from the final, stuttered audio, with latency compensation.
  - Blinks, eye saccades, head nods, and glitches scaled by the voice's own cues.
  - Adjustable glitch strength, and support for the system's reduced-motion setting.
- **CORTEX, the AI handle.**
  - An offline generator of original SHODAN lines, with 11 moods and 21 System Shock lore topics.
  - An archive of 62 monologue lines.
  - **GENERATE INPUT** and **AI TRANSMIT**.
  - Converse mode, with name and topic memory.
  - Autonomous transmissions at random intervals.
  - Reactions to what the user does.
- **Neural link.** An optional connection to a local, OpenAI-compatible language model, restricted to loopback addresses, with CORTEX as the fallback.
- **`window.SHODAN`.** A frozen, rate-limited scripting interface.
- **WHITE ICE.**
  - A strict content security policy and Trusted Types.
  - Input sanitising, rate limits and frame detection.
  - A live status panel.
- **Desktop app.** A Windows WebView2 host with:
  - SHA-256 file integrity, with the manifest compiled into the exe and the files locked while the app runs;
  - Microsoft Defender (AMSI) scanning and SmartScreen;
  - allowlisted serving and a locked-down browser;
  - a tray menu, float-on-top mode and a command-line self-test.
- **Tests and documentation.**
  - 62 unit tests and an end-to-end desktop smoke test.
  - A user guide, and guides to the AI handle, configuration, WHITE ICE, the desktop app, deployment and development.

### Changed

- The project is built with Vite. The earlier static upload is kept, archived, in `shodan-encoded-metadata/`.

### Known limitations

- `ShodanVoice.exe` is not code-signed, so Windows SmartScreen may warn before the first run.
- The desktop app targets .NET 8, which reached end of support on 10 November 2026. It runs on .NET 8 or any newer installed .NET Desktop Runtime.
- Discord Rich Presence needs a separate local bridge, which is not included, and is disabled in the desktop app.
- The neural link has not been tested in the desktop app against a live language-model server.
- On a host that cannot send headers, the website's content security policy comes only from a `<meta>` tag, which cannot set `frame-ancestors`. See [Deploying the website](./docs/deployment.md#security-headers).

[0.0.1]: https://github.com/TheImortalimp/SHODAN-A.I.-Voice/releases/tag/v0.0.1
