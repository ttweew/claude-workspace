// 用法：node pair.mjs <before> <after> <out>：每張截圖左右並排（左：改之前，右：改之後）
import { launch } from '/home/user/claude-workspace/tests/browser/harness.mjs';
import { readdirSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
const [a, b, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const name of readdirSync(b).filter(n => n.endsWith('.png') && existsSync(a + '/' + n))) {
    const src = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
    await page.setContent(`<body style="margin:0;background:#e9e9e9;font:600 22px sans-serif;display:flex;gap:24px;padding:12px;width:max-content">
      <figure style="margin:0"><figcaption style="padding:4px 0 10px">改之前</figcaption><img src="${src(a + '/' + name)}"></figure>
      <figure style="margin:0"><figcaption style="padding:4px 0 10px">改之後</figcaption><img src="${src(b + '/' + name)}"></figure></body>`);
    await page.waitForTimeout(100);
    await page.screenshot({ path: out + '/' + name, fullPage: true });
}
await browser.close();
console.log('ok');
