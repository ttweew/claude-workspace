// 用法：node bench2.mjs 'rt=ort&model=weights/x.onnx&ep=wasm&threads=1' …（每一組一個網址參數）
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
const dir = new URL('.', import.meta.url).pathname;
const server = spawn('python3', ['server.py'], { cwd: dir, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu'] });
for (const c of process.argv.slice(2)) {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  pageerror', e.message.slice(0, 200)));
  await page.goto('http://127.0.0.1:8790/bench2.html?' + c);
  await page.waitForFunction(() => window.__result && window.__result.done, null, { timeout: 300000 });
  const r = await page.evaluate(() => window.__result);
  const { kpts, ...rest } = r;
  console.log(c, JSON.stringify(rest));
  if (kpts) console.log('  kpts', JSON.stringify(kpts));
  await page.close();
}
await browser.close(); server.kill();
