// 總結最上面的「教練建議」拍照（320、1280 寬；AI 教練關著＝固定句子、打開＝假的 Gemini 回答）
const H = await import('/home/user/claude-workspace/tests/browser/harness.mjs');
const site = await H.serve(), browser = await H.launch();
const SQUAT = H.script([{ id: 'squat', depth: 0, frames: 60 }, ...[0, 0, 0, 13, 13, 13].flatMap(px => H.rep('squat', { hold: 15, rest: 40, move: px ? (p, k, n) => (k < 25 ? { ...p, x: p.x + px / 640 * Math.sin(n / 30 * 2 * Math.PI) } : p) : undefined }))]);
for (const [w, on] of [[320, false], [1280, true]]) {
    const { context, page } = await H.open(browser, SQUAT, { width: w, height: 800, mobile: w < 400 });
    await context.addInitScript(on => { if (on) localStorage.setItem('aiCoach', '1'); window.__fakeAI = { reply: '每一下都蹲到位，做得很好。後面三下重心前後晃得比較多，下次放慢一點、腳掌踩穩。' }; }, on);
    await H.workout(page, site.base, 'squat', () => document.getElementById('hudReps').textContent === '6');
    await page.waitForTimeout(500);
    await page.locator('#summary').screenshot({ path: process.argv[2] + '/coach_' + w + '.png' });
    await context.close();
}
await browser.close(); await site.close();
