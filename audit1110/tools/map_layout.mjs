// 進度地圖發布前的版面檢查：手機寬度（390）、電腦寬度（1280）整頁不能左右捲動；新加的那幾列要看得到
// 用法：node map_layout.mjs 地圖.html [要找的字 ...]
import { createRequire } from 'node:module';
// 這個環境的 playwright 裝在全域，ES 模組的 import 找不到，改用 require
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'node:fs';
const [file, ...needles] = process.argv.slice(2);
const body = fs.readFileSync(file, 'utf8');
// 和發布後的外框一樣（artifact 會包這一層）
const html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;box-sizing:border-box}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}</style></head><body>\n' +
  body + '\n</body></html>';
const browser = await chromium.launch();
let bad = 0;
for (const [w, h] of [[390, 844], [1280, 800]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  // 外部字型連不到就用系統字型，不要卡住
  await page.route(/^https?:\/\//, r => r.abort());
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
  const ok = m.sw <= m.cw;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} 寬 ${w}：整頁寬 ${m.sw}／畫面寬 ${m.cw}，高 ${m.h}`);
  for (const n of needles) {
    const box = await page.evaluate(n => {
      const it = document.createNodeIterator(document.body, NodeFilter.SHOW_TEXT);
      let t; while ((t = it.nextNode())) if (t.nodeValue.includes(n)) { const r = t.parentElement.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }
      return null;
    }, n);
    const ok2 = box && box.w > 0 && box.h > 0;
    if (!ok2) bad++;
    console.log(`${ok2 ? 'PASS' : 'FAIL'} 寬 ${w}：找得到「${n}」${box ? `（${box.w}×${box.h}）` : ''}`);
  }
  if (w === 390) await page.locator('text=等真人的數字').first().scrollIntoViewIfNeeded().catch(() => {});
  if (w === 390) await page.screenshot({ path: file.replace(/\.html$/, '_390.png') });
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
