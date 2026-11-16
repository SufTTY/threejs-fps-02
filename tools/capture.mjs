// Headless test driver: Node 22 stdlib only (global WebSocket + CDP over the debug pipe).
// Starts the static server in-process, opens game pages in the sandbox's Playwright Chromium
// with SwiftShader (software WebGL2), captures screenshots for ?shot= modes, and smoke-tests
// live gameplay (errors, determinism of the shot frames, gameplay loop).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME_BIN;
const PORT = 8123;
const here = new URL('.', import.meta.url).pathname;

async function serverUp(port) {
  try { await fetch(`http://127.0.0.1:${port}/`); return true; } catch { return false; }
}
let ownServer = false;
let server = null;
if (!(await serverUp(PORT))) {
  server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: new URL('..', import.meta.url).pathname, stdio: 'pipe' });
  ownServer = true;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), 5000);
    server.stdout.on('data', (d) => { if (String(d).includes('http://')) { clearTimeout(t); resolve(); } });
    server.stderr.on('data', (d) => process.stderr.write('[serve] ' + d));
  });
}

const chromeArgs = [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--disable-features=IntensiveWakeUpThrottling',
  '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  `--remote-debugging-port=9333`,
  '--window-size=1280,720', '--hide-scrollbars', '--mute-audio',
  'about:blank',
];
const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });

async function connect() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:9333/json/version`);
      const info = await res.json();
      return info.webSocketDebuggerUrl;
    } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  throw new Error('chrome debug port never opened');
}

const wsUrl = await connect();
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
async function waitReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await send('Runtime.evaluate', { expression: 'window.__shotReady === true', returnByValue: true }, s);
    if (res.result?.result?.value === true) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

const { Target } = { Target: null };
const created = await send('Target.createTarget', { url: 'about:blank' });
const sessionId = created.result.targetId;
const attached = await send('Target.attachToTarget', { targetId: sessionId, flatten: true });
const s = attached.result.sessionId;

async function nav(url) {
  await send('Page.enable', {}, s);
  const errors = [];
  await send('Runtime.enable', {}, s);
  // Headless rAF runs at ~1 fps without compositor demand: shim it with a 16 ms timer so the
  // game loop runs at real speed. Test-harness only; the shipped game is untouched.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__realRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
  ` }, s);
  // collect console errors via evaluate at end instead (simpler): track with a global.
  await send('Runtime.evaluate', { expression: 'window.__errors=[];window.addEventListener("error",e=>window.__errors.push(String(e.message)));window.addEventListener("unhandledrejection",e=>window.__errors.push(String(e.reason)));', returnByValue: true }, s);
  await send('Page.navigate', { url }, s);
  await new Promise((r) => setTimeout(r, 900));
}

async function shotFrame(name, query, outDir) {
  await nav(`http://127.0.0.1:${PORT}/?${query}`);
  const ok = await waitReady(12000);
  await new Promise((r) => setTimeout(r, 250));
  const cap = await send("Page.captureScreenshot", { format: "jpeg", quality: 88 }, s); if (!cap.result) console.log("CAP-ERR", JSON.stringify(cap));
  const buf = Buffer.from(cap.result.data, 'base64');
  writeFileSync(`${outDir}/${name}`, buf);
  const errRes = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__errors||[])', returnByValue: true }, s);
  return { name, ok, bytes: buf.length, errors: JSON.parse(errRes.result?.result?.value ?? '[]') };
}

async function waitExpr(expr, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await send('Runtime.evaluate', { expression: `!!(${expr})`, returnByValue: true }, s);
    if (res.result?.result?.value === true) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

async function gameplaySmoke() {
  await nav(`http://127.0.0.1:${PORT}/`);
  await waitExpr('window.__game');
  // Deterministic gameplay: unlock the sim, then drive it through __game.advance so the test
  // does not depend on headless timer throttling. Fire into the arena and let enemies act.
  const res = await send('Runtime.evaluate', { expression: `
    (() => {
      const g = window.__game;
      document.getElementById('play').click();
      g.input.firing = true;
      g.spawnAhead(7);         // a drone straight ahead, in the crosshair
      g.advance(180);          // 3 s of gunfight
      const mid = g.stats;
      g.advance(600);          // 10 s more combat
      const end = g.stats;
      g.input.firing = false;
      return JSON.stringify({ mid, end, errors: window.__errors });
    })()
  `, returnByValue: true }, s);
  if (!res.result?.result?.value) console.log('SMOKE-ERR', JSON.stringify(res));
  return JSON.parse(res.result.result.value);
}

async function determinismProbe() {
  const runs = [];
  for (let index = 0; index < 2; index += 1) {
    await nav(`http://127.0.0.1:${PORT}/`);
    await waitExpr('window.__game');
    const res = await send('Runtime.evaluate', { expression: `
      (() => {
        const g = window.__game;
        g.freeze();
        document.getElementById('play').click();
        g.input.firing = true;
        g.advance(420);
        g.input.firing = false;
        return JSON.stringify(g.stats);
      })()
    `, returnByValue: true }, s);
    if (!res.result?.result?.value) console.log('DET-ERR', index, JSON.stringify(res));
    runs.push(JSON.parse(res.result.result.value));
  }
  return runs;
}

const outDir = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const results = [];
results.push(await shotFrame('1-start.jpg', 'shot=start&seed=1337', outDir));
results.push(await shotFrame('2-play.jpg', 'shot=play&seed=1337', outDir));
results.push(await shotFrame('3-end.jpg', 'shot=end&seed=1337', outDir));
const smoke = await gameplaySmoke();
const clean = (s) => JSON.stringify({ ...s, elapsed: 0 });
const det = await determinismProbe();
console.log(JSON.stringify({
  results, smoke,
  deterministic: clean(det[0]) === clean(det[1]), det: det[0],
  combatOk: smoke.end.score > 0 && (smoke.end.health < 100 || smoke.mid.enemies < smoke.end.enemies || smoke.end.dead),
}, null, 1));

ws.close();
chrome.kill();
if (ownServer && server) server.kill('SIGKILL');
process.exit(0);
