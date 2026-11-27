// 手機 YOLO 沒有骨架（11/27）的診斷：真的 YOLO26n、真的 LiteRT 引擎（本機檔案），假鏡頭畫一張真人照片（MediaPipe 官方範例照），
// 橫的、直的畫面各跑一次，看背景執行緒回傳的結果有沒有人
// 用法：node diag.mjs <W> <H> [cpu] [model]
import { readFileSync } from 'node:fs';
import { serve, playwright } from '/home/user/claude-workspace/tests/browser/harness.mjs';
const S = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad';
const [W, H] = [Number(process.argv[2] || 640), Number(process.argv[3] || 480)];
const cpu = process.argv.includes('cpu');
const model = process.argv.find(a => /^yolo-/.test(a)) || 'yolo-n';
const shot = process.argv.find(a => a.endsWith('.png'));
// 照片 1000×667，人在 x 240～760、y 230～640：裁成和畫面一樣的長寬比、人在中間
const IW = 1000, IH = 667;
let sw, sh;
if (W / H >= IW / IH) { sw = IW; sh = IW * H / W; } else { sh = IH; sw = IH * W / H; }
const sx = Math.max(0, Math.min(IW - sw, 500 - sw / 2)), sy = Math.max(0, Math.min(IH - sh, 440 - sh / 2));
const init = `(() => {
  try { localStorage.setItem('recordCountdown', '0'); } catch (e) {}
  const img = new Image(); img.src = '/__pose.jpg';
  navigator.mediaDevices.getUserMedia = async () => {
    const c = document.createElement('canvas'); c.width = ${W}; c.height = ${H};
    const g = c.getContext('2d');
    const draw = () => { g.fillStyle = '#888'; g.fillRect(0, 0, ${W}, ${H}); if (img.complete && img.naturalWidth) g.drawImage(img, ${sx}, ${sy}, ${sw}, ${sh}, 0, 0, ${W}, ${H}); };
    draw(); setInterval(draw, 33);
    return c.captureStream(30);
  };
  const R = window.__yolo = { ready: null, results: 0, found: 0, errors: [], sizes: [] };
  const Orig = window.Worker;
  window.Worker = class extends Orig { constructor(...a) { super(...a); this.addEventListener('message', e => { const m = e.data || {};
    if (m.type === 'ready') R.ready = { mode: m.mode, tried: m.tried, gpuError: m.gpuError, gpuWrong: m.gpuWrong, checking: m.checking }; if (m.type === 'mode') (R.modes = R.modes || []).push({ ...m, at: R.results });
    if (m.type === 'result') { R.results++; if (m.k) { R.found++; R.last = m.k.map(p => p.map(v => +v.toFixed(3))); } }
    if (m.type === 'detect-error' || m.type === 'fatal') R.errors.push(m.message); }); }
    postMessage(m, t) { if (m && m.type === 'detect' && m.bitmap) R.sizes.push(m.bitmap.width + 'x' + m.bitmap.height); return super.postMessage(m, t); } };
})();`;
const { base, close } = await serve();
const gpu = process.argv.includes('gpu');
const browser = await playwright().chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: gpu ? ['--enable-unsafe-webgpu'] : [] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('pageerror: ' + e));
for (const cdn of ['https://cdn.jsdelivr.net/npm/@litertjs/core@2.6.0/wasm/**', 'https://unpkg.com/@litertjs/core@2.6.0/wasm/**']) {
  await context.route(cdn, route => {
    const file = new URL(route.request().url()).pathname.split('/').pop();
    try { return route.fulfill({ body: readFileSync(S + '/yolo/pkg/lr/wasm/' + file), contentType: file.endsWith('.js') ? 'text/javascript' : 'application/wasm', headers: { 'Access-Control-Allow-Origin': '*' } }); }
    catch (e) { return route.fulfill({ status: 404 }); }
  });
}
await context.route('**/__pose.jpg', route => route.fulfill({ body: readFileSync(S + '/yolo/pose.jpg'), contentType: 'image/jpeg' }));
await context.route('https://www.gstatic.com/**', route => route.abort());
// gpu：軟體模擬的 GPU 也當作真的 GPU（網站平常不試，比 CPU 慢）
// gpu：軟體模擬的 GPU 也當作真的 GPU（網站平常不試，比 CPU 慢）；forcegpu：比 CPU 慢也用 GPU；
// fp16：GPU 強制用半精度（模擬手機算錯：輸出全部是 0）；blind：GPU 啟動時正常，畫面上有東西時全部給 0（模擬只有真的畫面才算錯）
const force = process.argv.includes('forcegpu'), fp16 = process.argv.includes('fp16'), blind = process.argv.includes('blind');
const old = process.argv.includes('old');
if (gpu) await context.route('**/js/ai/yolo-worker.js*', async route => {
  let body = readFileSync(old ? S + '/yphone/old-worker.js' : '/home/user/claude-workspace/js/ai/yolo-worker.js', 'utf8').replace('if (info.isFallbackAdapter || adapter.isFallbackAdapter) return null;', '');
  const swap = (a, b) => { if (!body.includes(a)) throw new Error('找不到：' + a); body = body.replace(a, b); };
  // old（改之前的程式）：手機的 GPU 預設用半精度；GPU 比較快（全部是 0，什麼都沒算）就選 GPU
  if (old) { swap('const compiled = await core.loadAndCompile(new Uint8Array(bytes), { accelerator });', "const compiled = await core.loadAndCompile(new Uint8Array(bytes), accelerator === 'webgpu' ? { accelerator, gpuOptions: { precision: 'fp16' } } : { accelerator });"); swap('if (!best || cpu.ms <= best.ms) {', 'if (!best) {'); }
  else {
  if (force) swap('} else if (r.ms < cpu.ms) {', '} else if (true) {');
  if (fp16) swap("gpuOptions: { precision: 'fp32' }", "gpuOptions: { precision: 'fp16' }");
  }
  if (blind && !old) swap('const people = yc.decodeAll(await runOnce(model), region, fit, W, H, S, kpts);', 'const people = yc.decodeAll(checker ? new Float32Array((await runOnce(model)).length) : await runOnce(model), region, fit, W, H, S, kpts);');
  return route.fulfill({ body, contentType: 'text/javascript' });
});
await context.addInitScript(init);
await page.goto(base + 'index.html?workout=squat&model=' + model + (cpu ? '&cpu' : ''));
await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 180000 });
console.log('status:', await page.textContent('#poseStatus'));
await page.click('#startBtn');
await page.waitForTimeout(gpu ? 20000 : 8000);
const r = await page.evaluate(() => window.__yolo);
console.log(`畫面 ${W}x${H}（裁 ${sx|0},${sy|0} ${sw|0}x${sh|0}）`, JSON.stringify({ ready: r.ready, results: r.results, found: r.found, errors: r.errors.slice(0, 3), sizes: [...new Set(r.sizes)] }));
if (r.last) console.log('最後一格的點（前 7 個）：', JSON.stringify(r.last.slice(0, 7)));
await page.click('#perfBtn'); await page.waitForTimeout(1200); console.log('運算標籤：', (await page.textContent('#perfBtn')).trim()); console.log('模式訊息：', JSON.stringify(r.modes || []));
console.log('提示：', await page.evaluate(() => [...document.querySelectorAll('#hint, #poseHint, .hint, #status')].map(e => e.id + '=' + e.textContent.trim()).join(' | ')));
if (shot) await page.screenshot({ path: shot });
console.log(logs.filter(l => /YOLO|error|錯誤|warn/i.test(l)).slice(0, 10).join('\n'));
await browser.close(); await close();
