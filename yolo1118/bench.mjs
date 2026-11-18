// 用法：node bench.mjs <yolo26 的 onnx 檔名...>：每個 onnx（檔名裡寫 -640、-320）和 MediaPipe lite、full 各跑一次
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
const dir = new URL('.', import.meta.url).pathname;
const server = spawn('python3', ['server.py'], { cwd: dir, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch();
const cases = [...process.argv.slice(2).filter(a => a.endsWith(".onnx")).map(f => "yolo=" + f + "&threads=" + (process.env.THREADS || 1) + "&size=" + f.match(/-(\d+)\.onnx$/)[1]), ...(process.env.NO_MP ? [] : ["mp=lite", "mp=full"])];
for (const c of cases) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror', e.message));
  await page.goto('http://127.0.0.1:8790/bench.html?' + c);
  await page.waitForFunction(() => window.__result && window.__result.done, null, { timeout: 180000 });
  const r = await page.evaluate(() => window.__result);
  console.log(c, JSON.stringify({ load: r.loadMs, yolo: r.yolo, mediapipe: r.mediapipe, dims: r.outputDims, best: r.bestScore, found: r.found }));
  if (r.kpts) { await page.locator('#c').screenshot({ path: dir + 'kpts_' + c.match(/size=(\d+)/)[1] + '.png' }); console.log('  kpts', JSON.stringify(r.kpts.slice(0, 17))); }
  await page.close();
}
await browser.close(); server.kill();
