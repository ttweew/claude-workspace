// 第 2 階段實測（暫存區，不放進 repo）：真的 LiteRT 引擎、真的 YOLO 模型、真的 MediaPipe，網站（wt2）照常流程
// 鏡頭換成 Ultralytics 官方的伏地挺身示範影片（2 秒、60 格，重複播）；只在暫存區，不放進 repo
// 用法：node real.mjs <網站資料夾> <情境…>   情境：yolo-n、yolo-s、lite、switch、gpu
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, extname } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const S = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad';
const SITE = normalize(process.argv[2]);
const WASM = S + '/yolo/pkg/lrweb/node_modules/@litertjs/core/wasm/';
const MPPKG = S + '/mp/node_modules/@mediapipe/tasks-vision';
const FRAMES = S + '/yolo/frames/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = normalize(join(SITE, p === '/' ? 'index.html' : p));
  if (!f.startsWith(SITE) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }).end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const BASE = 'http://127.0.0.1:' + server.address().port + '/';
const CAM = `try { localStorage.setItem('recordCountdown', '0'); } catch (e) {}
navigator.mediaDevices.getUserMedia = async () => {
  const imgs = [];
  for (let i = 0; i < 60; i++) { const im = new Image(); im.src = '/__test/pu_' + String(i).padStart(3, '0') + '.png'; await im.decode(); imgs.push(im); }
  const c = document.createElement('canvas'); c.width = 640; c.height = 360;
  const g = c.getContext('2d'); let n = 0;
  const draw = () => { g.drawImage(imgs[n++ % 60], 0, 0, 640, 360); };
  draw(); setInterval(draw, 1000 / 30);
  return c.captureStream(30);
};`;
async function page(browser, query) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.route('https://cdn.jsdelivr.net/npm/@litertjs/core@2.6.0/wasm/**', r => {
    const f = WASM + new URL(r.request().url()).pathname.split('/').pop();
    r.fulfill({ path: f, contentType: f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/**', r => {
    const f = MPPKG + new URL(r.request().url()).pathname.replace('/npm/@mediapipe/tasks-vision@1.0.1', '');
    r.fulfill({ path: f, contentType: f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('https://storage.googleapis.com/mediapipe-models/**', r => {
    const name = new URL(r.request().url()).pathname.split('/').pop();
    r.fulfill({ path: S + '/mp/' + name, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('**/__test/pu_*.png', r => r.fulfill({ path: FRAMES + new URL(r.request().url()).pathname.split('/').pop(), contentType: 'image/png' }));
  await ctx.addInitScript(CAM);
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.logs = [];
  pg.on('pageerror', e => pg.errors.push(String(e)));
  pg.on('console', m => { const t = m.text(); if (/YOLO|LiteRT|錯|error/i.test(t)) pg.logs.push(m.type() + ': ' + t.slice(0, 200)); });
  pg.on('worker', w => w.on('console', m => pg.logs.push('[worker] ' + m.type() + ': ' + m.text().slice(0, 200))));
  await pg.goto(BASE + 'index.html' + query);
  return { ctx, pg };
}
const text = (pg, id) => pg.evaluate(i => document.getElementById(i).textContent, id);
async function workout(browser, model, seconds = 14) {
  const t0 = Date.now();
  const { ctx, pg } = await page(browser, '?model=' + model + '&workout=pushup');
  await pg.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 180000 });
  const ready = (Date.now() - t0) / 1000;
  const status = await text(pg, 'modelStatus');
  await pg.click('#startBtn');
  await pg.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
  await pg.waitForTimeout(seconds * 1000);
  await pg.click('#perfBtn');
  const perf = await text(pg, 'perfBtn');
  const reps = await text(pg, 'hudReps');
  const note = await pg.evaluate(() => { const n = document.getElementById('modelNote'); return n.hidden ? '(hidden)' : n.textContent; });
  await pg.click('#stopBtn');
  await pg.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
  const lines = await pg.evaluate(() => [...document.querySelectorAll('#summaryLines li')].map(li => li.textContent));
  console.log(JSON.stringify({ model, ready: ready.toFixed(1) + 's', status, perf, reps, note, summary: lines.slice(0, 3), errors: pg.errors, logs: pg.logs.slice(0, 8) }, null, 1));
  await ctx.close();
}
async function switchLive(browser) {
  const { ctx, pg } = await page(browser, '?workout=pushup');
  await pg.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 180000 });
  await pg.click('#startBtn');
  await pg.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
  await pg.waitForTimeout(6000);
  const out = { before: await text(pg, 'hudReps') };
  const choose = k => pg.evaluate(v => { const s = document.getElementById('modelLive'); s.value = v; s.dispatchEvent(new Event('change')); }, k);
  for (const k of ['yolo-n', 'full', 'yolo-n', 'lite']) {
    const t = Date.now();
    await choose(k);
    await pg.waitForFunction(() => /已就緒（|失敗/.test(document.getElementById('modelStatus').textContent), null, { timeout: 180000 });
    out[k + '@' + Object.keys(out).length] = { status: await text(pg, 'modelStatus'), sec: ((Date.now() - t) / 1000).toFixed(1) };
    await pg.waitForTimeout(5000);
    out[k + '@' + Object.keys(out).length + ' reps'] = await text(pg, 'hudReps');
  }
  out.errors = pg.errors; out.logs = pg.logs.slice(0, 10);
  console.log(JSON.stringify(out, null, 1));
  await ctx.close();
}
const browser = await chromium.launch({ args: process.argv.includes('gpu') ? ['--enable-unsafe-webgpu'] : [] });
for (const c of process.argv.slice(3)) {
  if (c === 'switch') await switchLive(browser);
  else if (c !== 'gpu') await workout(browser, c);
}
await browser.close();
server.close();
