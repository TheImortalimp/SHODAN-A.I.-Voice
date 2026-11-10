# Deploying the website

The web build is a set of static files. Any web server that can serve files over HTTPS can host it: no server code, database or build step is needed on the server.

## Get the files

Use either:

- **The release download.** Extract `SHODAN-Voice-v0.0.1-web.zip` from the [v0.0.1 release](https://github.com/TheImortalimp/SHODAN-A.I.-Voice/releases/tag/v0.0.1). The files are in the `SHODAN-Voice-v0.0.1-web` folder.
- **Your own build.** Run `npm ci` and `npm run build`. The files are in `dist/`. See [Development](./development.md).

The build is about 114 MB, most of it the neural voice model and the WebAssembly runtimes.

## Upload

Upload the **contents** of the folder to your site folder (on the live site, `/006/shodan/`) and keep the folder structure, including:

- `assets/`, `vendor/`, `piper/`, `onnxruntime-web/` and `voice-packs/`;
- `shodan.html`, `index.html`, `shodan.json`, `monologues.xml`;
- `THIRD_PARTY_NOTICES.txt`, `LICENSE.txt` and `licenses/`. The licences of the bundled voice and runtimes require them.

`white-ice.manifest.json` is only used by the desktop app; uploading it is optional.

The app uses relative URLs only, so it works in any folder. `shodan.html` is the page; `index.html` redirects to it, so the folder URL itself also opens the app if your server serves `index.html` for folders.

Use **HTTPS**. Browsers only enable some features on secure pages: over plain HTTP the app still works, but the SoundTouch pitch processor, the floating window and **PASTE FROM CLIPBOARD** are unavailable. Opening `shodan.html` directly from disk (`file://`) does not work, because workers and WebAssembly need a web server. To try the build locally, run `npm run preview`.

### Updating

Files in `assets/` get new names whenever their content changes. When you upload a new version:

1. Upload the new files first, then replace `shodan.html`.
2. If your host puts a cache (such as Varnish or a CDN) in front of the site, purge it.
3. Delete the old files from `assets/` afterwards.

## MIME types

| Extension | Content type | Notes |
| --- | --- | --- |
| `.js` | `text/javascript` | **Required.** Browsers refuse module scripts and workers with any other type. Most servers do this already. |
| `.wasm` | `application/wasm` | Strongly recommended. With another type, the browser logs a warning and loads the voice runtimes a slower way. |
| `.webmanifest` | `application/manifest+json` | Recommended. |
| `.onnx`, `.data` | `application/octet-stream` | Recommended. |
| `.json`, `.xml`, `.css`, `.html`, `.png`, `.txt` | the usual types | Most servers do this already. |

## Security headers

Every page carries the content security policy (CSP) in a `<meta>` tag, so the main protection works on any host. A few protections only work as real HTTP headers:

- `frame-ancestors 'none'` stops other sites from embedding the app in a frame.
- `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` and `Permissions-Policy` add further hardening.

Send these headers for the app's folder only. The CSP is strict and would break other pages on your site.

These are the values the build uses (they are also in `white-ice.manifest.json`, under `csp` and `headers`):

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*; object-src 'none'; base-uri 'self'; form-action 'none'; manifest-src 'self'; require-trusted-types-for 'script'; trusted-types shodan; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()
```

### Apache

Save this as `.htaccess` in the app's folder. It needs `mod_headers`, which most hosts provide.

```apache
AddType application/wasm .wasm
AddType application/manifest+json .webmanifest
AddType application/octet-stream .onnx .data

<IfModule mod_headers.c>
  Header always set Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*; object-src 'none'; base-uri 'self'; form-action 'none'; manifest-src 'self'; require-trusted-types-for 'script'; trusted-types shodan; frame-ancestors 'none'"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "no-referrer"
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Cross-Origin-Resource-Policy "same-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()"
</IfModule>
```

### nginx

Add the headers to the `location` block of the app's folder:

```nginx
location /shodan/ {
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:*; object-src 'none'; base-uri 'self'; form-action 'none'; manifest-src 'self'; require-trusted-types-for 'script'; trusted-types shodan; frame-ancestors 'none'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()" always;
}
```

- nginx does not combine `add_header` lines from different levels. If the block already has `add_header` lines, keep them all together.
- Make sure the server's `mime.types` file contains `application/wasm wasm;`. Do not add a `types { }` block inside the location: it replaces the whole list, and scripts would then be refused.

### Other hosts

- **Netlify** and **Cloudflare Pages** read headers from a `_headers` file.
- **GitHub Pages** cannot send custom headers. The `<meta>` policy still applies, and the app's frame guard turns off the automation API if the app is embedded.

## Caching

| Files | Suggested caching |
| --- | --- |
| `assets/` | Long-lived. The names contain a content hash, so a new build uses new names. |
| `vendor/`, `voice-packs/`, `piper/`, `onnxruntime-web/`, `mespeak-bundle.js`, `soundtouch-processor.js` | Cached, but revalidated. These names do not change with every build. |
| `shodan.html`, `index.html`, `manifest.webmanifest` | Revalidate on every visit (`Cache-Control: no-cache`). |

The app always revalidates `shodan.json` and never caches `monologues.xml`, so changes to these two files show up on the next page load. See [Configuration](./configuration.md).

## The neural link for your visitors

The optional neural link connects each visitor's browser to a model server on **their own** computer; nothing runs on your server. The CSP only allows `localhost` and `127.0.0.1`.

Visitors who use Ollama must add your site's origin (scheme and host, no path) to `OLLAMA_ORIGINS`, for example `https://www.example.com`. See [Neural link (local LLM)](./ai-handle.md#neural-link-local-llm).

## Discord Rich Presence bridge (optional)

The Discord panel talks to a small service on the page's own origin, relative to the page's folder. **That service is not part of this project.** Without it, the panel shows "Start the local server to use Discord Rich Presence." and nothing else happens.

If you provide one, it must answer these requests with JSON:

| Request | Body | Reply |
| --- | --- | --- |
| `GET api/presence/status` | | `{ "connected": true \| false, "message": "…" }` |
| `POST api/presence/connect` | `{ "applicationId": "…", "assetKey": "…" }` | Same as status, or `{ "error": "…" }` with an error status code |
| `POST api/presence/activity` | `{ "state": "…" }` | Any JSON |
| `POST api/presence/disconnect` | `{}` | Same as status |

Activity updates only ever contain one of `speaking`, `idle_monologue`, `simulation` or `standby`, never the text that is typed or spoken.

## Check the deployment

1. Open the page. Press **AI TRANSMIT**. The **ENGINE** status row (in the System output panel) should read `MIMIC 3 / AMY MEDIUM`, not `FALLBACK / ROBOTIC`.
2. Open the **WHITE ICE** panel. CONTENT POLICY should read `ENFORCED / META` (a page cannot see its own HTTP headers, so the website never shows `HEADER`). In browsers that support Trusted Types, such as Edge and Chrome, TRUSTED TYPES should read `ARMED / POLICY "shodan"`.
3. Check the headers from a terminal:

   ```powershell
   curl.exe -I https://www.example.com/shodan/shodan.html
   curl.exe -I https://www.example.com/shodan/piper/piper_phonemize.wasm
   ```

   The first command should list `Content-Security-Policy` and the other headers. The second should show `Content-Type: application/wasm`.
