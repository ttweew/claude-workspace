// 第 4 階段實測（暫存區）：模型對照頁用真的 MediaPipe、真的 YOLO 跑示範影片（Ultralytics 的伏地挺身，重複 4 次、8 秒）
// 用法：node compare_real.mjs <網站資料夾> [A] [B]
import { createRequire } from 'node:module';
import { readFileSync, existsSync, copyFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, normalize, extname } from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const S = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad';
const SITE = normalize(process.argv[2]);
const A = process.argv[3] || 'lite', B = process.argv[4] || 'yolo-n';
const OUTDIR = process.env.OUT || S + '/p4e2e';
const WORKOUT = process.env.WORKOUT || 'pushup';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = normalize(join(SITE, p === '/' ? 'index.html' : p));
  if (!f.startsWith(SITE) || !existsSync(f)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' }).end(readFileSync(f));
}).listen(0, '127.0.0.1');
await new Promise(r => server.on('listening', r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await ctx.route('https://cdn.jsdelivr.net/npm/@litertjs/core@2.6.0/wasm/**', r => {
  const f = S + '/yolo/pkg/lrweb/node_modules/@litertjs/core/wasm/' + new URL(r.request().url()).pathname.split('/').pop();
  r.fulfill({ path: f, contentType: f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
});
await ctx.route('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/**', r => {
  const f = S + '/mp/node_modules/@mediapipe/tasks-vision' + new URL(r.request().url()).pathname.replace('/npm/@mediapipe/tasks-vision@1.0.1', '');
  r.fulfill({ path: f, contentType: f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } });
});
await ctx.route('https://storage.googleapis.com/mediapipe-models/**', r => r.fulfill({ path: S + '/mp/' + new URL(r.request().url()).pathname.split('/').pop(), headers: { 'Access-Control-Allow-Origin': '*' } }));
const pg = await ctx.newPage();
const errors = [];
pg.on('pageerror', e => errors.push(String(e)));
await pg.goto('http://127.0.0.1:' + server.address().port + '/compare.html');
await pg.setInputFiles('#videoInput', S + '/p4e2e/pushup_x4.webm');
await pg.waitForFunction(() => /選好動作|打不開|不知道/.test(document.getElementById('loadStatus').textContent), null, { timeout: 30000 });
console.log('影片：', await pg.textContent('#loadStatus'));
await pg.selectOption('#workoutPick', WORKOUT);
await pg.selectOption('#modelA', A);
await pg.selectOption('#modelB', B);
const t0 = Date.now();
await pg.click('#runBtn');
await pg.waitForFunction(() => /完成|中斷/.test(document.getElementById('runStatus').textContent), null, { timeout: 600000 });
console.log('對照：', await pg.textContent('#runStatus'), ((Date.now() - t0) / 1000).toFixed(1) + ' 秒');
console.log('卡片：', JSON.stringify(await pg.$$eval('#modelCards .model-card', els => els.map(e => e.innerText.replace(/\n/g, ' / ')))));
console.log('每一下：', JSON.stringify(await pg.$$eval('#repTable tbody tr', rows => rows.map(r => r.innerText.replace(/\t/g, ' ')))));
console.log('曲線預設：', await pg.$eval('#chartJoint', s => s.selectedOptions[0].textContent));
console.log('角度差：', JSON.stringify(await pg.$$eval('#jointTable tbody tr', rows => rows.map(r => r.innerText.replace(/\t/g, ' ')))));
for (const [btn, name] of [['#downloadA', 'rec_A.json'], ['#downloadB', 'rec_B.json'], ['#downloadCsv', 'angles.csv']]) {
  const [d] = await Promise.all([pg.waitForEvent('download'), pg.click(btn)]);
  copyFileSync(await d.path(), OUTDIR + '/' + name);
}
await pg.$eval('#frameSlider', el => { el.value = '60'; el.dispatchEvent(new Event('input')); });
await pg.waitForTimeout(1500);
await pg.screenshot({ path: OUTDIR + '/compare_page.png', fullPage: true });
console.log('errors', errors);
await browser.close(); server.close();
