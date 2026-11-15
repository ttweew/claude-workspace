// 看進度地圖某一段文字附近長什麼樣子（自己檢查用）：node shot.mjs 地圖.html 寬度 "要找的字" 輸出.png
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [file, width, needle, out] = process.argv.slice(2);
const html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head><body>\n' + fs.readFileSync(file, 'utf8') + '\n</body></html>';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(width), height: 900 } });
await page.route(/^https?:\/\//, r => r.abort());
await page.setContent(html, { waitUntil: 'domcontentloaded' });
await page.evaluate(n => {
  const it = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);
  let t; while ((t = it.nextNode())) if (t.nodeValue.includes(n)) { t.parentElement.scrollIntoView({ block: 'center' }); break; }
}, needle);
await page.waitForTimeout(200);
await page.screenshot({ path: out });
await browser.close();
