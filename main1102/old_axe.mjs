// 改之前的報表頁：載入實測檔後整頁 axe（看 landmark-unique 是不是本來就有）
import { launch, serve, open, violations } from '/home/user/claude-workspace/tests/browser/harness.mjs';
import { syntheticSubject } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';
const site = await serve(), browser = await launch();
const { context, page } = await open(browser, [], { width: 320, height: 640, mobile: true });
await page.goto(site.base + 'report.html');
const files = syntheticSubject('A', ['squat']);
await page.setInputFiles('#fileInput', files.map(f => ({ name: f.name, mimeType: 'application/json', buffer: Buffer.from(f.text) })));
await page.waitForFunction(() => /^(已分析|沒有可以分析)/.test(document.getElementById('loadStatus').textContent), null, { timeout: 120000 });
console.log(process.env.SITE_ROOT || 'new', await page.textContent('#loadStatus'), JSON.stringify(await violations(page)));
await context.close(); await browser.close(); await site.close();
