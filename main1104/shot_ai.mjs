// 重播分析的 AI 判斷（390、1280 寬）、實測報表的 AI 模型那一行：拍照
import { launch, serve, open } from '/home/user/claude-workspace/tests/browser/harness.mjs';
import { syntheticSet, syntheticSubject } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';
const OUT = process.argv[2];
const site = await serve(), browser = await launch();
for (const width of [390, 1280]) {
    const { context, page } = await open(browser, [], { width, height: 900, mobile: width < 500 });
    const set = syntheticSet('K', 'squat', 'heel', 1);
    await page.goto(site.base + 'replay.html');
    await page.setInputFiles('#fileInput', { name: set.name, mimeType: 'application/json', buffer: Buffer.from(set.text) });
    await page.waitForFunction(() => document.getElementById('squatTable').rows.length > 1, null, { timeout: 60000 });
    await page.locator('#aiBox').scrollIntoViewIfNeeded();
    await page.locator('#squatCard').screenshot({ path: OUT + '/replay_ai_' + width + '.png' });
    await context.close();
}
const { context, page } = await open(browser, [], { width: 1280, height: 900 });
await page.goto(site.base + 'report.html');
const sets = syntheticSubject('K');
await page.setInputFiles('#fileInput', sets.map(f => ({ name: f.name, mimeType: 'application/json', buffer: Buffer.from(f.text) })));
await page.waitForFunction(() => /^已分析/.test(document.getElementById('loadStatus').textContent), null, { timeout: 120000 });
await page.locator('#aiDataCard').screenshot({ path: OUT + '/report_ai_1280.png' });
await context.close(); await browser.close(); await site.close();
console.log('ok');
