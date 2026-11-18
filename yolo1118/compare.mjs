// 用法：node compare.mjs → compare/side_by_side.png（MediaPipe 和 YOLO 同一張照片並排）
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
const dir = new URL('.', import.meta.url).pathname;
const server = spawn('python3', ['server.py'], { cwd: dir, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1450, height: 600 }, deviceScaleFactor: 2 });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('http://127.0.0.1:8790/compare.html');
await page.waitForFunction(() => window.__done, null, { timeout: 120000 });
await page.locator('.row').screenshot({ path: dir + 'compare/side_by_side.png' });
await browser.close(); server.kill(); console.log('ok');
