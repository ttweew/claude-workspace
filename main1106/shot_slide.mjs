// 簡報第 29 頁的截圖：重播分析讀合成受測者 K「故意屁股太高」的伏地挺身，AI 判斷那一句＋表格（中間的圖表先藏起來）
// 也照 PR 的「怎麼試」走一次：重播分析 → 側面拍深蹲 → 選深蹲 → 表格最後一欄是 AI 判斷
const W = '/home/user/claude-workspace';
const H = await import(W + '/tests/browser/harness.mjs');
const { syntheticSet } = await import(W + '/tests/synthetic-sets.mjs');
const OUT = process.argv[2];
const site = await H.serve(), browser = await H.launch();
const newContext = browser.newContext.bind(browser);
browser.newContext = opts => newContext({ ...opts, deviceScaleFactor: 2 });
const { context, page } = await H.open(browser, [], { width: 1000, height: 900 });
const set = syntheticSet('K', 'pushup', 'pike', 112);
await page.goto(site.base + 'replay.html');
await page.setInputFiles('#fileInput', { name: set.name, mimeType: 'application/json', buffer: Buffer.from(set.text) });
await page.waitForFunction(() => !document.getElementById('squatCard').hidden && document.getElementById('squatTable').rows.length > 1, null, { timeout: 60000 });
console.log('aiBox:', await page.textContent('#aiBox'));
console.log('rows:', JSON.stringify(await page.$$eval('#squatTable tr', trs => trs.map(tr => [...tr.cells].map(c => c.textContent + (c.className ? '[' + c.className + ']' : '')).join(' | ')))));
await page.addStyleTag({ content: '#repChart{display:none!important}' });
const a = await page.locator('#aiBox').boundingBox(), b = await page.locator('#squatTable').boundingBox();
await page.screenshot({ path: OUT + '/aiscreen.png', clip: { x: b.x - 12, y: a.y - 4, width: b.width + 24, height: b.y + b.height - a.y + 8 }, fullPage: true });
console.log('clip', Math.round(b.width + 24), Math.round(b.y + b.height - a.y + 8));
// 怎麼試：側面拍深蹲 → 選深蹲
await page.goto(site.base + 'replay.html');
await page.click('#demoSide');
await page.waitForFunction(() => /已讀取/.test(document.getElementById('loadStatus').textContent), null, { timeout: 60000 });
console.log('demo 讀完，動作分析顯示：', !(await page.locator('#squatCard').isHidden()), '選項：', await page.$$eval('#workoutPick option', os => os.map(o => o.value + '=' + o.textContent).join('、')));
await page.selectOption('#workoutPick', 'squat');
await page.waitForFunction(() => !document.getElementById('squatCard').hidden && document.getElementById('squatTable').rows.length > 1, null, { timeout: 60000 });
console.log('demo aiBox:', await page.textContent('#aiBox'));
console.log('demo head:', (await page.$$eval('#squatTable thead th', ths => ths.map(t => t.textContent))).join(' | '));
console.log('demo AI 欄:', (await page.$$eval('#squatTable tbody tr', trs => trs.map(tr => tr.lastElementChild.textContent))).join('、'));
console.log('errors', page.errors);
await context.close(); await browser.close(); await site.close();
