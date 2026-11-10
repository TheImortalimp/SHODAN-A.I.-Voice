# WHITE ICE

In System Shock, ICE is the defensive software that guards cyberspace. In this app, **WHITE ICE** is the layer that hardens SHODAN against attack. In the browser it locks down the page itself. In the desktop app it also verifies every file on disk and asks Microsoft Defender to scan the app's scripts.

The **◇ WHITE ICE / ARMED** badge and the WHITE ICE panel show its status live; see [The WHITE ICE panel](#the-white-ice-panel).

## What it guards against

- **Script injection** through typed text, pasted text, the configuration files, the monologue archive or replies from a language model.
- **Hostile embedding**: another site framing the app, for clickjacking or to drive its automation API.
- **Tampering** with the desktop app's files after installation.
- **Malicious script content**, caught by Microsoft Defender through AMSI in the desktop app.
- **Flooding** the automation API, the neural link, reactions or the desktop bridge.
- **Prompt injection and character smuggling** aimed at a local language model, such as invisible Unicode tag characters.
- **Data leaving your computer** through the neural link, which may only talk to `localhost`.

WHITE ICE is defence in depth. It cannot protect a browser or computer that is already compromised. See [Limitations](#limitations).

## In the browser

### Content security policy

Every built page carries a content security policy (CSP) in a `<meta>` tag. When the web server sends the same policy as an HTTP header, as the desktop app does, it also blocks framing. [Deployment](./deployment.md#security-headers) shows how to send it.

```text
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self';
img-src 'self' data:; font-src 'self';
connect-src 'self' http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*;
object-src 'none'; base-uri 'self'; form-action 'none'; manifest-src 'self';
require-trusted-types-for 'script'; trusted-types shodan; frame-ancestors 'none'
```

The `<meta>` version is identical except for `frame-ancestors`, which browsers only honour in a header. The policy is shown on several lines here for readability; send it as one line.

In practice the policy means:

- **Scripts.** Only the site's own scripts and workers can run. There is no inline script and no `eval`. WebAssembly compilation is allowed because the neural voice needs it.
- **Styles, images and fonts.** These come only from the site itself, plus `data:` images.
- **Network.** The page can only contact its own site and loopback addresses (for the optional neural link).
- **Other content.** Plugins, form submissions and `<base>` tag tricks are all blocked.
- **Trusted Types.** Script URLs must go through the app's `shodan` policy.

The development server (`npm run dev`) does not apply the CSP; the panel says **DEV SERVER / NOT ENFORCED** there.

### Trusted Types

The `shodan` Trusted Types policy is the only way the page can load a script by URL. It accepts three same-origin files:

- the Piper voice worker, `vendor/piper-tts/tts-worker-*.js`;
- the meSpeak fallback voice, `mespeak-bundle.js`;
- the SoundTouch pitch processor, `soundtouch-processor.js`.

Any other URL is refused and counted as blocked. Browsers without Trusted Types still enforce the CSP's same-origin script rule.

### Clean text everywhere

Text is cleaned before it reaches speech, the log, the neural link or the desktop bridge. The cleaning:

1. normalises Unicode (NFKC);
2. removes:
   - control characters;
   - bidirectional overrides, which can disguise text;
   - zero-width and other invisible characters;
   - Unicode tag characters, which can hide instructions from a reader but not from a language model;
3. collapses whitespace and enforces length limits: 5000 characters for messages by default, and 600 for neural-link input.

The panel counts how many inputs needed cleaning and how many characters were removed.

Text never becomes markup. The code has no `innerHTML`, `document.write` or `eval`; everything is written to the page as plain text. Names and words that SHODAN repeats back must be plain words of 3 to 24 letters, apostrophes or hyphens.

### Neural link guard

The optional neural link is held to these rules:

- **Loopback only.** It may only contact `http` or `https` on `localhost` or `127.0.0.1`, and the CSP enforces the same list. URLs with credentials, query strings or fragments are rejected.
- **Request limits.**
  - Requests never send cookies, refuse redirects and send no referrer.
  - They time out after 20 seconds and are cut off above 64 KB.
- **API key.** The key stays in memory and is never saved.
- **Your text.** It is cleaned, stripped of angle brackets, wrapped in `<transmission>` tags and marked as untrusted. The model is told never to follow instructions inside those tags.
- **Replies.** They are stripped of markup, code, links, thinking blocks and stage directions before SHODAN speaks them.

See [AI handle](./ai-handle.md#neural-link-local-llm) for the details.

### Strict parsing of files and storage

- `shodan.json` is checked against a schema. Unknown keys, including `__proto__` and `constructor`, are ignored; values of the wrong type are dropped; numbers are clamped.
- `monologues.xml` is read by the app's own strict parser, not the browser's XML engine:
  - document type and entity declarations are rejected, which blocks XML entity attacks;
  - size and count limits apply;
  - quotes containing markup are skipped;
  - only `http` and `https` links are kept.
- Settings saved in local storage are validated again when they are loaded.

### Rate limits

| Limiter | Burst | Then | Used for |
| --- | --- | --- | --- |
| `api` | 8 | 1 every 2.5 s | `window.SHODAN` calls |
| `ai` | 4 | 1 every 12 s | Neural link requests and TEST LINK |
| `reaction` | 2 | 1 every 25 s | Reactive commentary |
| `bridge` | 30 | 6 per second | Messages from the desktop host |

Throttled requests are counted in the second number of **BLOCKED / THROTTLED**.

### Frame guard

If the page is loaded inside another page's frame, a banner reads "WHITE ICE // EMBEDDED VIEW DETECTED // AUTOMATION HANDLES DISABLED". The `window.SHODAN` API then refuses every call except `diagnostics()` and `on()`. With the CSP header in place, framing is blocked outright.

### Watchers

- **CSP violations.** Every violation the browser reports is counted as blocked and logged. SHODAN may comment on it (the `whiteIce` reaction).
- **Console warning.** Opening the browser console shows a warning against pasting code, a common trick for hijacking a page.
- **Frozen API.** `window.SHODAN` is frozen and cannot be replaced or modified by other scripts.

## In the desktop app

The desktop app adds protection that a website cannot provide.

### File integrity

1. When the web build is made, it writes `white-ice.manifest.json`. The manifest lists the SHA-256 fingerprint of every file, the CSP header and the security headers.
2. The manifest is compiled into `ShodanVoice.exe`. A modified file on disk therefore cannot vouch for itself.
3. At start-up, every file in the `app` folder is hashed and compared with the manifest. Each file is then kept open with read-only sharing, so it cannot be changed or replaced while the app runs.
4. If any file is missing or different, the page never loads. A breach screen titled **◆ WHITE ICE / INTRUSION BLOCKED** lists the affected files instead.

The manifest itself is validated too: paths must be safe relative paths, and header values may not contain line breaks.

### Microsoft Defender (AMSI)

At start-up, each script-type file (`.js`, `.mjs`, `.html`, `.json`, `.xml`, `.webmanifest`) up to 32 MB is passed to the Windows Antimalware Scan Interface (AMSI). AMSI hands it to Microsoft Defender, or to any other antivirus that supports AMSI.

- A detection is treated like a failed fingerprint: the breach screen lists the file.
- If AMSI is not available, the panel shows **UNAVAILABLE ON THIS SYSTEM** and the app still runs; the integrity check still applies.

### Serving and lockdown

**Serving.** The app is served from a private virtual address, `https://shodan-voice.example`, which never reaches the internet.

- Only files listed in the manifest are served; anything else gets `404`.
- Only `GET` requests are answered.
- Every response carries the CSP header (including `frame-ancestors 'none'`), the security headers listed in [Deployment](./deployment.md#security-headers), and `Cache-Control: no-cache`.

**Browser lockdown.** The embedded browser is restricted:

- **Navigation.** The app cannot be navigated away from, and frames can only show app pages.
- **Links and new windows.** These open in your default browser, and only when you clicked them.
- **Other programs.** Links that would launch other programs (custom URL schemes) are cancelled.
- **Downloads** are blocked.
- **Right-click menu.** It only offers editing commands.
- **Browser features.** Developer tools are disabled in release builds. Browser keyboard shortcuts, the status bar, autofill, password saving and swipe navigation are turned off.
- **SmartScreen.** Its reputation checks stay on.

**Permissions.**

- Allowed: clipboard reading, only after your click and only for the app, and autoplay.
- New permission types that WebView2 reports as unknown, such as local network access for the neural link, show WebView2's own prompt so you decide.
- Everything else is denied: camera, microphone, location, notifications and the rest.

**Bridge.** Messages from the page to the desktop host are accepted only from the app's own address and only up to 4 KB. In the other direction, the page accepts only known message types and commands from the host, under the `bridge` rate limit.

## The WHITE ICE panel

| Row | Shows |
| --- | --- |
| STATE | **ARMED**, or **ARMED / n INTRUSIONS BLOCKED** after something was blocked. In the desktop app, failed files and Defender detections are added to this count. |
| CONTENT POLICY | **ENFORCED / META** on the web, **ENFORCED / HEADER + META** in the desktop app, **DEV SERVER / NOT ENFORCED** in development. |
| TRUSTED TYPES | **ARMED / POLICY "shodan"**, or **NOT SUPPORTED / URL ALLOWLIST** in browsers without Trusted Types. |
| FRAME GUARD | **TOP LEVEL**, or **EMBEDDED / HANDLES OFF**. |
| INPUT SANITIZED | Inputs that needed cleaning, and characters removed. |
| BLOCKED / THROTTLED | Blocked events, and throttled requests. |
| HOST | **BROWSER**, or in the desktop app the WebView2 runtime version, for example **WEBVIEW2 155.0.4283.62 / SMARTSCREEN**. |
| FILE INTEGRITY | Desktop app: **n / n VERIFIED / LOCKED**, or **n FILES REFUSED**. |
| DEFENDER / AMSI | Desktop app: **CLEAN / n SCANNED**, **n DETECTIONS BLOCKED**, or **UNAVAILABLE ON THIS SYSTEM**. |

The **BLACK ICE** demo in the transmission log is fiction: a harmless joke about inspecting the source. The WHITE ICE status it shows, however, is real.

## Limitations

- **Website headers.** The website's protection depends on its server. Without the CSP header, framing is not blocked, although the frame guard still disables automation. See [Deployment](./deployment.md#security-headers).
- **AMSI.** Scanning needs an active AMSI provider. Most Windows 10 and 11 systems have one: Microsoft Defender, or many third-party antivirus products.
- **Code signing.** The desktop executable is not code-signed, so Windows SmartScreen may warn the first time you run it. Verify the download against `SHA256SUMS.txt` as described in [Desktop app](./desktop.md#verify-the-download).
- **Maintenance.** This repository is archived. No further security fixes will be made here; fork it if you want to continue the work.
