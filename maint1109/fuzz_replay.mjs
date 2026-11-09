// 11/9 保養：安全複查（這週新加的 AI 功能）：被改壞的錄製檔丟進重播分析
//   AI 判斷、AI 評分、AI 解釋（含每一下的）、你這一下 vs 標準動作、AI 自動辨識動作、AI 全自動分段、實測的 AI 猜對幾下
//   檢查：沒有程式錯誤、沒有 alert（檔案裡的 HTML 不會被執行）、整個結果（含收起來的）沒有 NaN、undefined、Infinity、[object、function
// 用法：node fuzz_replay.mjs <網站資料夾>
const W = process.argv[2];
process.env.SITE_ROOT = W;
const H = await import(W + '/tests/browser/harness.mjs');
const { syntheticSet } = await import(W + '/tests/synthetic-sets.mjs');
const { parseRecording } = await import(W + '/js/data/replay-core.js');
const { PoseRecorder } = await import(W + '/js/data/recorder.js');
const BAD = /NaN|undefined|Infinity|\[object |function /;
// 自由模式錄的：深蹲 → 伏地挺身（AI 全自動分段）
function mixed(sets) {
    const recorder = new PoseRecorder();
    recorder.start({ videoWidth: 640, videoHeight: 480, workout: 'free', synthetic: true });
    let offset = 0;
    for (const set of sets) {
        const frames = parseRecording(set.text).frames, t0 = frames[0].t;
        for (const f of frames) recorder.add(1000 + offset + f.t - t0, f.raw, null);
        offset += frames[frames.length - 1].t - t0 + 33;
    }
    recorder.stop();
    return JSON.parse(recorder.toJSON());
}
const base = {
    lean: JSON.parse(syntheticSet('K', 'squat', 'lean', 1).text),
    mix: mixed([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1)]),
    plank: JSON.parse(syntheticSet('K', 'plank', 'good', 1).text)
};
const clone = o => JSON.parse(JSON.stringify(o));
const cases = [];
const add = (name, from, fn) => { const c = clone(base[from]); fn(c); cases.push({ name: from + '：' + name, obj: c }); };
for (const k of ['lean', 'mix', 'plank']) add('原本的', k, () => {});
for (const v of ['constructor', '__proto__', 'toString', '', null, 123, {}, ['squat'], 'SQUAT', 'free']) {
    add('meta.workout=' + JSON.stringify(v), 'lean', c => { c.meta.workout = v; });
    add('meta.workout=' + JSON.stringify(v), 'mix', c => { c.meta.workout = v; });
}
for (const t of [{ subject: 'K', condition: 'constructor' }, { subject: '<img src=x onerror=alert(1)>', condition: 'lean' }, { subject: 'K', condition: 'lean', reps: '1e999' },
    { subject: 'K', condition: 'lean', reps: -5 }, 'x', [1, 2], { subject: {}, condition: [] }, { subject: 'K', condition: '__proto__' }]) {
    add('meta.test=' + JSON.stringify(t).slice(0, 40), 'lean', c => { c.meta.test = t; });
}
const weird = f => { if (f.landmarks) { f.landmarks[25] = ['NaN', 1e308, -1e308, 'x']; f.landmarks[26] = [null, null, null, null]; f.landmarks[0] = [0.5, 0.2, 0, 'abc']; } };
for (const k of ['lean', 'mix', 'plank']) {
    add('座標是奇怪的值（每 5 格）', k, c => c.frames.filter((f, i) => i % 5 === 0).forEach(weird));
    add('中間 40% 沒有人', k, c => { const n = c.frames.length; c.frames.forEach((f, i) => { if (i > n * 0.3 && i < n * 0.7) f.landmarks = null; }); });
    add('很多格時間一樣', k, c => { const t0 = c.frames[0].t; c.frames.forEach((f, i) => { if (i % 7 === 0) f.t = t0; }); });
    add('時間倒著走', k, c => { c.frames.reverse(); });
    add('中間跳了 10000 秒', k, c => { const n = c.frames.length; c.frames.forEach((f, i) => { if (i > n / 2) f.t += 1e7; }); });
    add('時間是負的', k, c => { c.frames.forEach(f => { f.t -= 1e6; }); });
    add('3D 座標是奇怪的值', k, c => c.frames.forEach(f => { if (f.landmarks) f.world = f.landmarks.map(() => ['x', null, 1e308]); }));
}
add('只有 3 格', 'lean', c => { c.frames = c.frames.slice(0, 3); });
add('沒有格子', 'lean', c => { c.frames = []; });
add('校正不是數字', 'lean', c => { c.meta.calibration = { knee: '1e999', tilt: {} }; });
add('meta 放 HTML', 'mix', c => { c.meta.userAgent = '<script>alert(1)</script>'; c.meta.model = '<img src=x onerror=alert(1)>'; });

const site = await H.serve(), browser = await H.launch();
const { context, page } = await H.open(browser, [], { width: 390, height: 844, mobile: true });
await context.addInitScript(() => { window.__alerts = 0; window.alert = () => { window.__alerts++; }; });
let fails = 0, runs = 0;
const resultText = () => page.evaluate(() => {
    const r = document.getElementById('result');
    return r ? r.textContent.replace(/\s+/g, ' ') : '';
});
for (const c of cases) {
    await page.goto(site.base + 'replay.html');
    await page.setInputFiles('#fileInput', { name: 'fuzz.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(c.obj)) });
    await page.waitForFunction(() => /已讀取|失敗|太大|讀不到/.test(document.getElementById('loadStatus').textContent), null, { timeout: 60000 }).catch(() => {});
    const status = await page.textContent('#loadStatus');
    const picks = status.startsWith('已讀取') ? ['auto', 'squat', 'pushup', 'lunge', 'plank'] : ['（讀不進來）'];
    for (const pick of picks) {
        if (pick !== '（讀不進來）' && pick !== 'auto') {
            await page.selectOption('#workoutPick', pick);
            await page.waitForFunction(() => !/分析中/.test(document.getElementById('loadStatus').textContent), null, { timeout: 60000 }).catch(() => {});
            await page.waitForTimeout(300);
        }
        // 每一下 AI 為什麼這樣判（收起來的）也打開
        await page.evaluate(() => document.querySelectorAll('#result details').forEach(d => { d.open = true; }));
        const text = await resultText();
        const m = text.match(BAD);
        const alerts = await page.evaluate(() => window.__alerts);
        runs++;
        const ok = !m && !page.errors.length && !alerts;
        if (!ok) {
            fails++;
            const at = m ? text.slice(Math.max(0, m.index - 60), m.index + 40) : '';
            console.log('FAIL', c.name, '｜', pick, '｜', status.slice(0, 30), '｜ 怪字：', at, '｜ 錯誤：', page.errors.slice(0, 2), '｜ alert', alerts);
        }
        page.errors.length = 0;
    }
}
console.log(cases.length + ' 個檔案、' + runs + ' 次分析：' + (fails ? fails + ' 個問題' : '都沒有問題'));
await context.close(); await browser.close(); await site.close();
