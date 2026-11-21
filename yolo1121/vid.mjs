// 用法：node vid.mjs <輸出資料夾> 'm=lite' 'm=yolo&model=weights/x.tflite' …：每一組存成 <輸出資料夾>/<名稱>.json
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
const dir = new URL('.', import.meta.url).pathname;
const outDir = process.argv[2]; mkdirSync(outDir, { recursive: true });
const server = spawn('python3', ['server.py'], { cwd: dir, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch();
for (const c of process.argv.slice(3)) {
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8790/vid.html?' + c);
  await page.waitForFunction(() => window.__result && window.__result.done, null, { timeout: 600000 });
  const r = await page.evaluate(() => window.__result);
  const name = (c.includes('model=') ? c.match(/model=weights\/([^&]+)/)[1].replace(/\.\w+$/, '') : 'mediapipe-' + c.match(/m=(\w+)/)[1]) + (c.includes('roi=1') ? '-roi' : '') + (c.match(/size=(\d+)/) ? '' : '');
  writeFileSync(outDir + '/' + name + '.json', JSON.stringify(r));
  console.log(name, 'frames', r.frames.length, 'detected', r.frames.filter(f => f.r).length, 'ms/格', r.msMedian, r.error || '');
  await page.close();
}
await browser.close(); server.kill();
