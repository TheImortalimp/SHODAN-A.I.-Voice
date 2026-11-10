// End-to-end smoke test for the published WebView2 desktop app (Windows only).
// Works on a scratch copy of desktop/publish:
//   1. Genuine run: the app's own --smoke-test checks (integrity, Defender/AMSI, CSP, Trusted Types,
//      SmartScreen, Piper Amy voice, viseme lip sync) while this script confirms the served files
//      cannot be modified, deleted or renamed, and that an unlisted file on disk is refused.
//   2. Tampered run: one byte appended to a script must stop the app before any web content loads.
// Pass --keep to keep the scratch copy, reports and screenshot after a passing run.
import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, cpSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publish = join(root, 'desktop', 'publish');
const exeName = 'ShodanVoice.exe';
const keep = process.argv.includes('--keep');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (process.platform !== 'win32') {
  console.error('The desktop smoke test needs Windows.');
  process.exit(1);
}
if (!existsSync(join(publish, exeName))) {
  console.error('desktop/publish/ShodanVoice.exe is missing. Run "npm run desktop:publish" first.');
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'shodan-smoke-'));
const app = join(work, 'ShodanVoice');
cpSync(publish, app, { recursive: true });
writeFileSync(join(app, 'app', 'not-in-manifest.js'), 'window.__intruder = true;\n');

const results = [];
function check(name, ok, detail = '') {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

function run(label, whileRunning) {
  const out = join(work, `${label}.json`);
  return new Promise((resolve) => {
    const child = spawn(join(app, exeName), ['--smoke-test', '--smoke-out', out, '--user-data', join(work, 'webview2')], { stdio: 'ignore' });
    let exited = false;
    const timer = setTimeout(() => child.kill(), 300_000);
    const probe = whileRunning ? whileRunning(() => exited) : Promise.resolve(null);
    const finish = async (code, error) => {
      exited = true;
      clearTimeout(timer);
      const report = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
      resolve({ code, error, report, probe: await probe });
    };
    child.once('exit', (code) => finish(code));
    child.once('error', (error) => finish(-1, error));
  });
}

// Returns the error code when the operation is refused by a sharing lock, otherwise false.
function refused(operation) {
  try {
    operation();
    return false;
  } catch (error) {
    return ['EBUSY', 'EPERM', 'EACCES'].includes(error.code) ? error.code : false;
  }
}

async function probeLocks(hasExited) {
  const target = join(app, 'app', 'shodan.html');
  let write = false;
  const until = Date.now() + 20_000;
  while (!write && !hasExited() && Date.now() < until) {
    write = refused(() => closeSync(openSync(target, 'r+')));
    if (!write) await sleep(250);
  }
  return {
    write,
    remove: refused(() => rmSync(target)),
    rename: refused(() => renameSync(target, `${target}.moved`)),
  };
}

// WebView2 can keep the profile open for a while after the app exits, so keep trying for a minute.
async function removeScratch() {
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      rmSync(work, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'].includes(error.code)) throw error;
      await sleep(5000);
    }
  }
  return false;
}

let failed = false;
try {
  console.log('SHODAN desktop smoke test');
  console.log(`scratch copy: ${app}\n`);

  console.log('[1/2] Genuine build');
  const genuine = await run('genuine', probeLocks);
  const report = genuine.report ?? {};
  const ice = report.page?.ice ?? {};
  check('app exited cleanly', genuine.code === 0, `exit ${genuine.code}${genuine.error ? `, ${genuine.error.message}` : ''}`);
  check('integrity verified and locked', report.integrity?.verified === report.integrity?.total && report.integrity?.locked, ice.integrity ?? 'no report');
  check('Defender / AMSI scan', ice.amsi?.startsWith('CLEAN') || ice.amsi === 'UNAVAILABLE ON THIS SYSTEM', ice.amsi);
  check('SmartScreen + CSP header', ice.host?.endsWith('/ SMARTSCREEN') && ice.csp === 'ENFORCED / HEADER + META', `${ice.host} | ${ice.csp}`);
  check('unlisted and private files refused', JSON.stringify(report.fetch) === '[404,404,200]', `not-in-manifest.js, white-ice.manifest.json, shodan.json -> ${JSON.stringify(report.fetch)}`);
  check('Piper Amy transmission completed', JSON.stringify(report.voice?.states) === '["start","complete"]' && report.voice?.engine === 'MIMIC 3 / AMY MEDIUM', `${JSON.stringify(report.voice?.states)} ${report.voice?.engine}`);
  check('viseme lip sync live', report.lipSync && !report.lipSync.startsWith('VISEME / REST'), report.lipSync ?? 'never synced');
  check('served files locked against write / delete / rename', genuine.probe?.write && genuine.probe?.remove && genuine.probe?.rename, JSON.stringify(genuine.probe));
  check('in-app smoke report ok', report.ok === true, (report.failures ?? [report.error]).join(', ') || 'all checks passed');

  console.log('\n[2/2] Tampered build');
  const assets = join(app, 'app', 'assets');
  const script = readdirSync(assets).find((name) => name.endsWith('.js'));
  appendFileSync(join(assets, script), '\n;window.__intruder = true;\n');
  const tampered = await run('tampered');
  check('tampered build refused before loading', tampered.code === 2 && tampered.report?.breach === true, `exit ${tampered.code}`);
  check('breach report names the modified file', tampered.report?.integrity?.failed?.includes(`assets/${script}`), JSON.stringify(tampered.report?.integrity?.failed));

  failed = results.includes(false);
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed.`);
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  if (failed || keep) {
    console.log(`Scratch files kept for inspection (reports and a mid-speech screenshot): ${work}`);
  } else if (!(await removeScratch())) {
    console.log(`The scratch folder is still in use and was not removed; delete it later: ${work}`);
  }
}
process.exit(failed ? 1 : 0);
