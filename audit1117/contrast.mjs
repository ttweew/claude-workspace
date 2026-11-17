import { launch, serve, open } from '/home/user/claude-workspace/tests/browser/harness.mjs';
const site = await serve(); const browser = await launch();
const { context, page } = await open(browser, [], { width: 320, height: 640, mobile: true });
await page.goto(site.base + 'results.html'); await page.waitForLoadState('load');
const { readFileSync } = await import('node:fs');
await page.evaluate(readFileSync(process.env.AXE_CORE, 'utf8'));
const r = await page.evaluate(() => axe.run(document, { runOnly: ['color-contrast'] }).then(r => r.violations.flatMap(v => v.nodes.map(n => n.html + ' | ' + n.failureSummary))));
console.log(r.join('\n'));
await context.close(); await browser.close(); await site.close();
