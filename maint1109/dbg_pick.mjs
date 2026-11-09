const W = '/home/user/claude-workspace';
process.env.SITE_ROOT = W;
const H = await import(W + '/tests/browser/harness.mjs');
const { syntheticSet } = await import(W + '/tests/synthetic-sets.mjs');
const { parseRecording } = await import(W + '/js/data/replay-core.js');
const { PoseRecorder } = await import(W + '/js/data/recorder.js');
const recorder = new PoseRecorder();
recorder.start({ videoWidth: 640, videoHeight: 480, workout: 'free', synthetic: true });
let offset = 0;
for (const set of [syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1)]) {
    const frames = parseRecording(set.text).frames, t0 = frames[0].t;
    for (const f of frames) recorder.add(1000 + offset + f.t - t0, f.raw, null);
    offset += frames[frames.length - 1].t - t0 + 33;
}
recorder.stop();
const obj = JSON.parse(recorder.toJSON());
obj.meta.workout = 'constructor';
const site = await H.serve(), browser = await H.launch();
const { context, page } = await H.open(browser, [], { width: 320, height: 640, mobile: true });
await page.goto(site.base + 'replay.html');
await page.setInputFiles('#fileInput', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
await page.waitForFunction(() => /已讀取|失敗/.test(document.getElementById('loadStatus').textContent), null, { timeout: 60000 });
const state = () => page.evaluate(() => ({ status: document.getElementById('loadStatus').textContent, pick: document.getElementById('workoutPick').value,
    card: !document.getElementById('squatCard').hidden, rows: document.getElementById('squatTable').rows.length, ai: !document.getElementById('aiBox').hidden,
    note: (document.getElementById('squatNote') || {}).textContent, summary: (document.getElementById('squatSummary') || {}).textContent }));
console.log('auto', JSON.stringify(await state()).slice(0, 400));
await page.selectOption('#workoutPick', 'squat');
for (const ms of [300, 1500, 4000]) { await page.waitForTimeout(ms); console.log('squat +' + ms, JSON.stringify(await state()).slice(0, 400)); }
console.log('errors', page.errors);
await context.close(); await browser.close(); await site.close();
