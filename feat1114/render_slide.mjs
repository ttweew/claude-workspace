// 看一頁簡報長什麼樣子（自己檢查排版用）：1920×1080，量內容最下面到哪裡、有沒有超出頁尾
// 用法：node render_slide.mjs <slides 資料夾> <輸出資料夾> <頁名> [頁名 ...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [dir, out, ...ids] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const id of ids) {
  const body = fs.readFileSync(dir + '/' + id + '.html', 'utf8');
  const html = '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=JetBrains+Mono:wght@500;700&family=Chakra+Petch:wght@500;700&display=swap">' +
    '<style>html,body{margin:0;background:#000}p,h1,h2,h3,ul,ol{margin:0}section{position:relative;width:1920px;height:1080px;box-sizing:border-box;overflow:hidden}aside{display:none}</style></head><body>' + body + '</body></html>';
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  let fonts = 'ok';
  await page.setContent(html, { waitUntil: 'load', timeout: 15000 }).catch(() => { fonts = '字型載入逾時'; });
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const sec = document.querySelector('section');
    const kids = [...sec.children].filter(el => el.tagName !== 'ASIDE');
    const footer = kids.find(el => getComputedStyle(el).position === 'absolute');
    const flow = kids.filter(el => el !== footer && getComputedStyle(el).position !== 'absolute');
    const bottom = Math.max(...flow.map(el => el.getBoundingClientRect().bottom));
    const right = Math.max(...[...sec.querySelectorAll('p,h1,h2,h3')].map(el => el.getBoundingClientRect().right));
    const noto = document.fonts.check('24px "Noto Sans TC"');
    return { bottom: Math.round(bottom), footerTop: footer ? Math.round(footer.getBoundingClientRect().top) : null, right: Math.round(right), noto };
  });
  const ok = m.footerTop === null || m.bottom <= m.footerTop - 8;
  console.log((ok ? 'PASS ' : 'FAIL ') + id + '：內容最下面 ' + m.bottom + '、頁尾上緣 ' + m.footerTop + '、最右邊 ' + m.right + '、Noto 字型 ' + m.noto + '、' + fonts);
  await page.screenshot({ path: out + '/' + id + '.png' });
  await page.close();
}
await browser.close();
