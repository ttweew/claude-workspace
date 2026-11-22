// 第 3 項（畫面裡有好幾個人）用真的 YOLO 實測（暫存區，影片是 Ultralytics 的示範影片合成的，不放進 repo）：
//   1) 模型對照頁：兩個人的影片，MediaPipe lite 和 YOLO26n 各數幾下
//   2) 首頁示範模式（影片當鏡頭）選 YOLO26n：骨架跟著誰（看畫面上骨架畫在左半邊還是右半邊）；點右邊的人 → 改跟他；點回左邊的人
// 用法：node two_people.mjs <網站資料夾> <影片>
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const S = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad';
const SITE = normalize(process.argv[2]), VIDEO = process.argv[3];
const OUT = S + '/mp_real';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = normalize(join(SITE, p === '/' ? 'index.html' : p));
  if (!f.startsWith(SITE) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }).end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const base = 'http://127.0.0.1:' + server.address().port + '/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
async function context() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route('https://cdn.jsdelivr.net/npm/@litertjs/core@2.6.0/wasm/**', r => {
    const f = S + '/yolo/pkg/lrweb/node_modules/@litertjs/core/wasm/' + new URL(r.request().url()).pathname.split('/').pop();
    r.fulfill({ path: f, contentType: f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/**', r => {
    const f = S + '/mp/node_modules/@mediapipe/tasks-vision' + new URL(r.request().url()).pathname.replace('/npm/@mediapipe/tasks-vision@1.0.1', '');
    r.fulfill({ path: f, contentType: f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await ctx.route('https://storage.googleapis.com/mediapipe-models/**', r => r.fulfill({ path: S + '/mp/' + new URL(r.request().url()).pathname.split('/').pop(), headers: { 'Access-Control-Allow-Origin': '*' } }));
  return ctx;
}
const errors = [];
// 1) 模型對照
if (!process.env.SKIP_COMPARE) {
  const ctx = await context();
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errors.push('compare: ' + e));
  await pg.goto(base + 'compare.html');
  await pg.setInputFiles('#videoInput', VIDEO);
  await pg.waitForFunction(() => /選好動作|打不開|不知道/.test(document.getElementById('loadStatus').textContent), null, { timeout: 30000 });
  await pg.selectOption('#workoutPick', 'pushup');
  await pg.selectOption('#modelA', 'lite');
  await pg.selectOption('#modelB', 'yolo-n');
  await pg.click('#runBtn');
  await pg.waitForFunction(() => /完成|中斷/.test(document.getElementById('runStatus').textContent), null, { timeout: 900000 });
  console.log('對照：', await pg.textContent('#runStatus'));
  console.log('卡片：', JSON.stringify(await pg.$$eval('#modelCards .model-card', els => els.map(e => e.innerText.replace(/\n/g, ' / ')))));
  await ctx.close();
}
// 2) 首頁示範模式
const ctx = await context();
const pg = await ctx.newPage();
pg.on('pageerror', e => errors.push('home: ' + e));
await pg.addInitScript(() => { try { localStorage.setItem('recordCountdown', '0'); } catch (e) {} });
await pg.goto(base + 'index.html?model=yolo-n&workout=pushup');
await pg.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 120000 });
console.log('AI：', await pg.textContent('#poseStatus'));
await pg.setInputFiles('#clipFile', VIDEO);
await pg.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 30000 });
// 骨架畫在哪裡：畫布上有畫東西的像素的平均位置（鏡頭原始畫面的比例；看 x 就知道是左邊還是右邊的人）
const where = () => pg.evaluate(() => {
  const c = document.querySelector('#stage canvas');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    if (d[(y * c.width + x) * 4 + 3] > 0) { sx += x; sy += y; n++; }
  }
  const video = document.querySelector('video');
  const mirrored = video.classList.contains('mirrored');
  const u = n ? sx / n / c.width : null;
  return { x: u === null ? null : Math.round((mirrored ? 1 - u : u) * 100) / 100, y: n ? Math.round(sy / n / c.height * 100) / 100 : null, n, reps: document.getElementById('hudReps').textContent, mirrored };
});
async function tapAt(x, y) {
  const p = await pg.evaluate(([x, y]) => {
    const stage = document.getElementById('stage'), video = document.querySelector('video');
    const b = stage.getBoundingClientRect();
    const scale = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
    const w = video.videoWidth * scale, h = video.videoHeight * scale;
    const left = (stage.clientWidth - w) / 2, top = (stage.clientHeight - h) / 2;
    const u = video.classList.contains('mirrored') ? 1 - x : x;
    return { x: b.left + left + u * w, y: b.top + top + y * h };
  }, [x, y]);
  await pg.mouse.click(p.x, p.y);
}
const note = () => pg.evaluate(() => { const el = document.getElementById('autoNote'); return el.hidden ? '' : el.textContent; });
await pg.waitForTimeout(3500);
console.log('一開始跟著：', JSON.stringify(await where()));
await pg.screenshot({ path: OUT + '/s1_start.png' });
const [bx, by, ax, ay] = (process.env.TAPS || '0.81,0.72,0.30,0.65').split(',').map(Number);
await tapAt(bx, by);
await pg.waitForTimeout(1500);
console.log('點右邊的人之後：', await note(), JSON.stringify(await where()));
const track = [];
for (let i = 0; i < 8; i++) { await pg.waitForTimeout(500); const w = await where(); track.push(w.x + '/' + w.reps); }
console.log('之後 4 秒骨架的位置（x/次數）：', track.join(' '));
await pg.screenshot({ path: OUT + '/s2_tap_b.png' });
await tapAt(0.02, 0.05);
await pg.waitForTimeout(1000);
console.log('點沒有人的地方：', await note(), JSON.stringify(await where()));
await tapAt(ax, ay);
await pg.waitForTimeout(1500);
console.log('點回左邊的人之後：', await note(), JSON.stringify(await where()));
await pg.screenshot({ path: OUT + '/s3_tap_a.png' });
console.log('錯誤：', JSON.stringify(errors));
await browser.close(); server.close();
