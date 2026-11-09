// fuzz_replay.mjs 的原本三個檔案：AI 的那幾段真的有出現（檢查的不是空的頁面）
const W = process.argv[2];
process.env.SITE_ROOT = W;
const H = await import(W + '/tests/browser/harness.mjs');
const { syntheticSet } = await import(W + '/tests/synthetic-sets.mjs');
const site = await H.serve(), browser = await H.launch();
const { context, page } = await H.open(browser, [], { width: 390, height: 844, mobile: true });
for (const [name, text] of [['K 深蹲故意前傾（實測檔）', syntheticSet('K', 'squat', 'lean', 1).text], ['K 棒式', syntheticSet('K', 'plank', 'good', 1).text]]) {
    await page.goto(site.base + 'replay.html');
    await page.setInputFiles('#fileInput', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.waitForFunction(() => /已讀取|失敗/.test(document.getElementById('loadStatus').textContent), null, { timeout: 60000 });
    const seen = await page.evaluate(() => Object.fromEntries(['activityBox', 'aiBox', 'scoreBox', 'explainBox', 'poseCompareBox', 'autoSegBox'].map(id => {
        const el = document.getElementById(id);
        return [id, el && !el.hidden && !el.closest('[hidden]') ? el.textContent.replace(/\s+/g, ' ').slice(0, 70) : '（沒有）'];
    })));
    console.log(name);
    for (const [k, v] of Object.entries(seen)) console.log('   ', k.padEnd(15), v);
}
await context.close(); await browser.close(); await site.close();
