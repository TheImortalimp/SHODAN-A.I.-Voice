import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { buildCsp, SECURITY_HEADERS } from './src/whiteice/csp.js';
import { shodanPlugins } from './tools/vite-plugins.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  root,
  // Relative URLs so dist/ can be uploaded to any folder (e.g. /006/shodan/) or served by the desktop host.
  base: './',
  define: {
    __SHODAN_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: shodanPlugins({ root, version: pkg.version }),
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    // Every supported browser has native modulepreload; skipping the polyfill keeps the page free of inline script.
    modulePreload: { polyfill: false },
    sourcemap: false,
    rolldownOptions: {
      input: {
        shodan: fileURLToPath(new URL('./shodan.html', import.meta.url)),
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
      },
    },
  },
  preview: {
    // Mirrors the headers the desktop host sends, so `npm run preview` exercises the full policy.
    headers: { ...SECURITY_HEADERS, 'Content-Security-Policy': buildCsp({ header: true }) },
  },
});
