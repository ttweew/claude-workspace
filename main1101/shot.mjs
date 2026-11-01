// 成長曲線拍照（320、1280 寬）：合成的紀錄 14 天
const H = await import('/home/user/claude-workspace/tests/browser/harness.mjs');
const { summarize } = await import('/home/user/claude-workspace/js/analysis/session.js');
const site = await H.serve(), browser = await H.launch();
const at = (m, d, h = 20) => new Date(2026, m - 1, d, h).getTime();
const list = [];
for (let i = 0; i < 14; i++) {
    const n = 5 + Math.round(i * 0.7 + (i % 3));
    const items = Array.from({ length: n }, (_, k) => { const min = 80 + ((k + i) % 4) * 8; return { n: k + 1, min, depth: min <= 90 ? 'good' : min <= 110 ? 'close' : 'shallow', start: k * 3, end: k * 3 + 2, errors: k % 5 === 0 ? ['lean'] : [], similarity: 85 + (i % 6) }; });
    list.push(summarize('squat', items, at(10, 15 + i), at(10, 15 + i) + 60000));
}
for (const [w, file] of [[320, 'growth_320.png'], [1280, 'growth_1280.png']]) {
    const { context, page } = await H.open(browser, [], { width: w, height: 900, mobile: w < 400 });
    await context.addInitScript(l => { localStorage.setItem('workoutHistory', JSON.stringify(l)); localStorage.setItem('cloudAsked', '1'); }, list);
    await page.goto(site.base + 'index.html');
    await page.click('#growthBox > summary');
    await page.waitForTimeout(500);
    await page.locator('#growthBox').screenshot({ path: process.argv[2] + '/' + file });
    console.log(file, await page.evaluate(() => document.querySelector('#growthChart svg').getAttribute('aria-label')), page.errors);
    await context.close();
}
await browser.close(); await site.close();
