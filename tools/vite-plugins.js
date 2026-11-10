import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseMonologues } from '../src/cortex/monologues.js';
import { buildCsp, SECURITY_HEADERS } from '../src/whiteice/csp.js';

export const MANIFEST_NAME = 'white-ice.manifest.json';
const AVATAR_PLACEHOLDER = '<!--SHODAN:EMBEDDED_AVATAR-->';
const VIRTUAL_MONOLOGUES = 'virtual:shodan-monologues';
const RESOLVED_MONOLOGUES = `\0${VIRTUAL_MONOLOGUES}`;

const toPosix = (file) => file.split(path.sep).join('/');
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const escapeAttribute = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

async function listFiles(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

// Restores the lossless avatar copy that the original page carried in its metadata.
function embeddedAvatar(root) {
  return {
    name: 'shodan:embedded-avatar',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        if (!html.includes(AVATAR_PLACEHOLDER)) return html;
        const data = await readFile(path.join(root, 'src', 'meta', 'embedded-avatar.png'));
        const tag = `<meta name="shodan:embedded-image" content="data:image/png;base64,${data.toString('base64')}">`;
        return html.replace(AVATAR_PLACEHOLDER, () => tag);
      },
    },
  };
}

// Offline snapshot of public/monologues.xml so idle lines work before (or without) the fetch.
function monologueSnapshot(root) {
  const file = path.join(root, 'public', 'monologues.xml');
  return {
    name: 'shodan:monologues',
    resolveId(id) {
      return id === VIRTUAL_MONOLOGUES ? RESOLVED_MONOLOGUES : null;
    },
    async load(id) {
      if (id !== RESOLVED_MONOLOGUES) return null;
      this.addWatchFile(file);
      const quotes = parseMonologues(await readFile(file, 'utf8'));
      return `export default ${JSON.stringify(quotes)};`;
    },
  };
}

// WHITE ICE: the built page carries its own CSP so static hosting stays protected.
// Dev mode is left alone because Vite's HMR client needs inline styles.
function whiteIceCsp() {
  return {
    name: 'shodan:white-ice-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const tags = [
          `<meta http-equiv="Content-Security-Policy" content="${escapeAttribute(buildCsp())}">`,
          '<meta name="referrer" content="no-referrer">',
        ].join('\n');
        if (!/<meta charset="utf-8">/i.test(html)) throw new Error('WHITE ICE: <meta charset="utf-8"> must lead the document head.');
        return html.replace(/<meta charset="utf-8">/i, (match) => `${match}\n${tags}`);
      },
    },
  };
}

// Publishes the unminified modules for the "OPEN JAVASCRIPT SOURCE" link.
function readableSource(root) {
  return {
    name: 'shodan:readable-source',
    apply: 'build',
    async generateBundle() {
      const srcDir = path.join(root, 'src');
      const files = (await listFiles(srcDir)).filter((file) => /\.(?:js|css)$/.test(file)).sort(byCodePoint);
      for (const file of files) {
        this.emitFile({ type: 'asset', fileName: `source/${toPosix(path.relative(srcDir, file))}`, source: await readFile(file, 'utf8') });
      }
    },
  };
}

// Ships the licence notices with every web deployment and desktop build.
export const LICENSE_FILES = { 'LICENSE.txt': 'LICENSE', 'THIRD_PARTY_NOTICES.txt': 'THIRD_PARTY_NOTICES.md' };

function licenseNotices(root) {
  return {
    name: 'shodan:license-notices',
    apply: 'build',
    async generateBundle() {
      for (const [fileName, source] of Object.entries(LICENSE_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: await readFile(path.join(root, source), 'utf8') });
      }
    },
  };
}

// Hashes every shipped file. The desktop host embeds this manifest and refuses to serve
// anything that is missing from it or whose SHA-256 does not match.
function whiteIceManifest({ version }) {
  let outDir = '';
  let written = false;
  return {
    name: 'shodan:white-ice-manifest',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    buildStart() {
      written = false;
    },
    writeBundle() {
      written = true;
    },
    async closeBundle() {
      if (!written) return;
      const files = {};
      const paths = (await listFiles(outDir)).map((file) => toPosix(path.relative(outDir, file))).sort(byCodePoint);
      for (const rel of paths) {
        if (rel === MANIFEST_NAME) continue;
        const data = await readFile(path.join(outDir, rel));
        files[rel] = { sha256: createHash('sha256').update(data).digest('hex'), size: data.length };
      }
      const manifest = {
        app: 'SHODAN Voice Interface',
        version,
        algorithm: 'SHA-256',
        entry: 'shodan.html',
        csp: buildCsp({ header: true }),
        headers: SECURITY_HEADERS,
        files,
      };
      await writeFile(path.join(outDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export function shodanPlugins({ root, version }) {
  return [embeddedAvatar(root), monologueSnapshot(root), whiteIceCsp(), readableSource(root), licenseNotices(root), whiteIceManifest({ version })];
}
