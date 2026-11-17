// 用法：node shots.mjs <網站資料夾> <輸出資料夾>：六頁 × 手機、電腦的截圖（假的 AI，開始卡片顯示已就緒）
import { launch, serve, open, script, rep, workout } from '/home/user/claude-workspace/tests/browser/harness.mjs';
import { mkdirSync } from 'node:fs';
const [root, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const site = await serve(root); const browser = await launch();
const PAGES = ['index.html', 'help.html', 'results.html', 'replay.html?demo', 'report.html', 'protractor.html'];
for (const size of [{ width: 390, height: 844, mobile: true, tag: 'phone' }, { width: 1280, height: 860, tag: 'desk' }]) {
    const { context, page } = await open(browser, [], size);
    for (const p of PAGES) {
        await page.goto(site.base + p);
        await page.waitForLoadState('load');
        await page.waitForTimeout(p.startsWith('replay') ? 2500 : 900);
        const name = p.split(/[.?]/)[0];
        await page.screenshot({ path: `${out}/${name}-${size.tag}.png`, fullPage: false });
        if (name === 'index') await page.screenshot({ path: `${out}/${name}-${size.tag}-full.png`, fullPage: true });
    }
    await context.close();
}
// 運動中的鏡頭畫面和運動完的總結（手機）
const SQUAT = script([{ id: 'squat', depth: 0, frames: 60 }, ...[1, 2, 3, 4].flatMap(() => rep('squat', { rest: 30 }))]);
{
    const { context, page } = await open(browser, SQUAT, { width: 390, height: 844, mobile: true });
    await page.goto(site.base + 'index.html?workout=squat');
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '2', null, { timeout: 60000 });
    await page.screenshot({ path: `${out}/live-phone.png` });
    await page.waitForFunction(() => document.getElementById('hudReps').textContent === '4', null, { timeout: 60000 });
    await page.waitForTimeout(1200);
    await page.click('#stopBtn');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/summary-phone.png`, fullPage: true });
    await context.close();
}
await browser.close(); await site.close();
console.log('done', out);
