import { launch, serve, open } from '/home/user/claude-workspace/tests/browser/harness.mjs';
const site = await serve(); const browser = await launch();
const { context, page } = await open(browser, []);
await page.goto(site.base + 'protractor.html');
await page.setInputFiles('input[type=file]', process.argv[2]);
await page.waitForFunction(() => document.querySelectorAll('#lines line').length === 2, null, { timeout: 30000 });
const info = await page.evaluate(() => ({ lines: [...document.querySelectorAll('#lines line')].map(l => [...l.attributes].map(a => a.name + '=' + a.value).join(' ')), circles: document.querySelectorAll('#lines circle').length, mine: document.getElementById('mineOut')?.textContent }));
// 拖一個點（鍵盤），線要跟著動
await page.focus('.handle >> nth=0').catch(() => {});
await page.keyboard.press('ArrowRight');
const after = await page.evaluate(() => document.querySelector('#lines line').getAttribute('x1'));
console.log(JSON.stringify(info), 'after-move x1=', after, 'errors', page.errors);
await context.close(); await browser.close(); await site.close();
