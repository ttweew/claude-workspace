// 簡報每一頁放進 1920×1080 的畫面拍照，檢查有沒有超出頁面（本機字型：文泉驛正黑，中文字寬和 Noto Sans TC 一樣是 1em）
// 用法：node render.mjs <slides 資料夾> <輸出資料夾> id1 id2 …（圖片 /_blob/… 換成 blobs.json 對應的本機檔案）
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
const require = createRequire('/home/user/claude-workspace/tests/browser/harness.mjs');
const { chromium } = require('playwright');
const [dir, out, ...ids] = process.argv.slice(2);
const blobs = existsSync(out + '/blobs.json') ? JSON.parse(readFileSync(out + '/blobs.json', 'utf8')) : {};
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const results = [];
for (const id of ids) {
    let html = readFileSync(dir + '/' + id + '.html', 'utf8');
    for (const [blob, file] of Object.entries(blobs)) html = html.split(blob).join('data:image/png;base64,' + readFileSync(file).toString('base64'));
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;font-family:"Noto Sans TC","WenQuanYi Zen Hei",sans-serif}'
        + 'section{position:relative;width:1920px;height:1080px;overflow:hidden}aside{display:none}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #1F3049}x-embed{display:block}</style></head><body>'
        + html + '</body></html>');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
        const s = document.querySelector('section');
        const box = s.getBoundingClientRect();
        // 內容（頁尾以外）最下面到哪裡；頁尾在 bottom:64px
        let bottom = 0, right = 0;
        for (const el of s.querySelectorAll('*')) {
            if (el.closest('aside') || el.closest('x-embed')) continue;
            const st = getComputedStyle(el);
            if (st.position === 'absolute' || el.closest('[style*="position:absolute"]')) continue;
            const b = el.getBoundingClientRect();
            if (b.width && b.height) { bottom = Math.max(bottom, b.bottom - box.top); right = Math.max(right, b.right - box.left); }
        }
        return { scrollH: s.scrollHeight, scrollW: s.scrollWidth, bottom: Math.round(bottom), right: Math.round(right) };
    });
    await page.screenshot({ path: out + '/' + id + '.png' });
    results.push({ id, ...r, ok: r.bottom <= 1080 - 112 && r.right <= 1920 - 128 + 1 });
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
