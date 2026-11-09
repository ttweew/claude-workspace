// 11/9 保養：首頁運動中（AI 全自動、手勢、每一下的 AI 判斷和分數、總結的 AI 評分、解釋、對照圖），假的 AI 偶爾給壞掉的座標
//   每 9 格有兩個點是壞的（null、1e308、文字、看得到的程度是負的）；每 50 格整個沒有人 3 格
//   檢查：沒有程式錯誤；每一下的提示、卡片、手勢提示、總結都沒有 NaN、undefined、Infinity、[object
const W = process.argv[2];
process.env.SITE_ROOT = W;
const H = await import(W + '/tests/browser/harness.mjs');
const BAD = /NaN|undefined|Infinity|\[object |function /;
const stand = (id, frames) => ({ id, depth: 0, frames });
const clean = H.script([stand('squat', 120), ...[1, 2, 3, 4, 5].flatMap(() => H.rep('squat', { hold: 10, rest: 20 })), stand('squat', 60),
    ...[1, 2, 3, 4, 5].flatMap(() => H.rep('pushup', { hold: 10, rest: 20 })), stand('pushup', 60)]);
const frames = clean.map((f, i) => {
    if (i % 50 >= 47) return [];   // 沒有人（landmarks 是空的）
    if (i % 9) return f;
    const g = f.map(p => p.slice());
    g[25] = [null, 1e308, 0, -1];
    g[26] = ['x', 'y', 0, 'abc'];
    return g;
});
const site = await H.serve(), browser = await H.launch();
const { context, page } = await H.open(browser, frames, { width: 390, height: 844, mobile: true });
await context.addInitScript(() => {
    try { localStorage.setItem('aiAuto', '1'); localStorage.setItem('aiCoach', '1'); } catch (e) {}
    window.__fakeAI = { reply: '每一下都蹲到位，節奏很穩。' };
    window.__seen = [];
    setInterval(() => {
        for (const id of ['activityText', 'gestureNote', 'repToast']) {
            const el = document.getElementById(id);
            if (el && !el.hidden && el.textContent) window.__seen.push(el.textContent);
        }
    }, 200);
});
await page.goto(site.base + 'index.html?workout=free');
await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
await page.click('#startBtn');
await page.waitForTimeout(clean.length / 30 * 1000 + 3000);
const during = await page.evaluate(() => ({ seen: [...new Set(window.__seen)], toasts: window.__toasts, reps: document.getElementById('hudReps').textContent, name: document.getElementById('hudRepsName').textContent }));
await page.click('#stopBtn');
await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
await page.waitForTimeout(1500);
const summary = await page.evaluate(() => document.getElementById('summary').textContent.replace(/\s+/g, ' '));
const said = await page.evaluate(() => window.__said);
const bad = [...during.seen, ...during.toasts.map(t => t.ai || ''), summary, ...said].filter(t => BAD.test(t));
console.log('運動中最後：', during.name, during.reps, '下；提示', during.toasts.length, '次（有 AI 的', during.toasts.filter(t => t.ai).length, '）');
console.log('總結：', summary.slice(0, 160));
console.log('怪字：', bad.slice(0, 3), '｜ 錯誤：', page.errors.slice(0, 3));
console.log(bad.length || page.errors.length ? 'SOME FAIL' : '通過');
await context.close(); await browser.close(); await site.close();
