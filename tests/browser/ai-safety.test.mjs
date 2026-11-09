// 安全複查（11/9 保養，瀏覽器端到端）：被改壞的錄製檔丟進重播分析，這週加的 AI 功能都不能壞
//   AI 自動辨識動作、AI 判斷、AI 評分、AI 解釋（含每一下的）、你這一下 vs 標準動作、AI 全自動分段、實測的 AI 猜對幾下
//   錄製檔是外部來的資料（可能被改過）：動作名稱、實測資訊、座標、時間都改壞試試
//   檢查：沒有程式錯誤、檔案裡的 HTML 不會被執行（alert）、整個結果（含收起來的）沒有 NaN、undefined、Infinity、[object
//   （暫存區 maint1109/fuzz_replay.mjs 試了 56 個檔案 × 5 種分析的動作，這裡放其中有代表性的幾個）
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open } from './harness.mjs';
import { syntheticSet } from '../synthetic-sets.mjs';
import { parseRecording } from '../../js/data/replay-core.js';
import { PoseRecorder } from '../../js/data/recorder.js';

const BAD = /NaN|undefined|Infinity|\[object |function /;

// 自由模式錄的：合成受測者 K 深蹲 → 伏地挺身（AI 全自動分段）
function mixed() {
    const recorder = new PoseRecorder();
    recorder.start({ videoWidth: 640, videoHeight: 480, workout: 'free', synthetic: true });
    let offset = 0;
    for (const set of [syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1)]) {
        const frames = parseRecording(set.text).frames, t0 = frames[0].t;
        for (const f of frames) recorder.add(1000 + offset + f.t - t0, f.raw, null);
        offset += frames[frames.length - 1].t - t0 + 33;
    }
    recorder.stop();
    return JSON.parse(recorder.toJSON());
}
const lean = JSON.parse(syntheticSet('K', 'squat', 'lean', 1).text);   // 實測檔：K 故意上身前傾
const mix = mixed();
const change = (from, fn) => { const c = JSON.parse(JSON.stringify(from)); fn(c); return c; };
const weird = f => {
    if (!f.landmarks) return;
    f.landmarks[25] = ['NaN', 1e308, -1e308, 'x'];
    f.landmarks[26] = [null, null, null, null];
    f.landmarks[0] = [0.5, 0.2, 0, 'abc'];
};
const CASES = [
    ['自由模式錄的、動作名稱是 constructor', change(mix, c => { c.meta.workout = 'constructor'; })],
    ['自由模式錄的、動作名稱不是文字', change(mix, c => { c.meta.workout = ['squat']; })],
    ['實測資訊：受測者代號是 HTML', change(lean, c => { c.meta.test = { subject: '<img src=x onerror=alert(1)>', condition: 'lean' }; })],
    ['實測資訊：這組要做的是 __proto__、下數不是數字', change(lean, c => { c.meta.test = { subject: 'K', condition: '__proto__', reps: '1e999' }; })],
    ['座標是奇怪的值（每 5 格）', change(lean, c => c.frames.filter((f, i) => i % 5 === 0).forEach(weird))],
    ['自由模式錄的、中間 40% 沒有人', change(mix, c => { const n = c.frames.length; c.frames.forEach((f, i) => { if (i > n * 0.3 && i < n * 0.7) f.landmarks = null; }); })],
    ['時間倒著走', change(lean, c => { c.frames.reverse(); })],
    ['自由模式錄的、中間跳了 10000 秒', change(mix, c => { const n = c.frames.length; c.frames.forEach((f, i) => { if (i > n / 2) f.t += 1e7; }); })]
];

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

test('被改壞的錄製檔丟進重播分析：AI 的幾段不會出錯、不會執行檔案裡的 HTML、不會寫出 NaN、undefined（320 寬）', async () => {
    const { context, page } = await open(browser, [], { width: 320, height: 640, mobile: true });
    await context.addInitScript(() => { window.__alerts = 0; window.alert = () => { window.__alerts++; }; });
    const checked = [];
    for (const [name, obj] of CASES) {
        await page.goto(site.base + 'replay.html');
        await page.setInputFiles('#fileInput', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(obj)) });
        await page.waitForFunction(() => /已讀取|失敗/.test(document.getElementById('loadStatus').textContent), null, { timeout: 60000 });
        assert.match(await page.textContent('#loadStatus'), /^已讀取/, name);
        // 錄製時選的、再選深蹲重新分析：兩次都看
        for (const pick of ['auto', 'squat']) {
            if (pick !== 'auto') {
                await page.selectOption('#workoutPick', pick);
                // 用深蹲重新分析完了（總結不再是「錄製時沒有選動作」）
                await page.waitForFunction(() => /^已讀取/.test(document.getElementById('loadStatus').textContent)
                    && !/沒有選動作/.test(document.getElementById('squatSummary').textContent), null, { timeout: 60000 });
                await page.waitForTimeout(300);
            }
            const text = await page.evaluate(() => {
                document.querySelectorAll('#result details').forEach(d => { d.open = true; });
                return document.getElementById('result').textContent.replace(/\s+/g, ' ');
            });
            const m = text.match(BAD);
            assert.equal(m, null, name + '（' + pick + '）：' + (m ? text.slice(Math.max(0, m.index - 60), m.index + 40) : ''));
            assert.deepEqual(page.errors, [], name + '（' + pick + '）');
            assert.equal(await page.evaluate(() => window.__alerts), 0, name);
            // 算到次數時，AI 判斷、AI 評分還是有寫（壞掉的格子不算，其他照常分析）；
            // 錄製時選的：動作名稱被改壞的當成沒選動作（自由模式，不計次），本來就沒有；時間倒著走的算不出次數
            const counted = await page.evaluate(() => !document.getElementById('squatCard').hidden && document.getElementById('squatTable').rows.length > 1);
            if (counted) assert.ok(await page.evaluate(() => !document.getElementById('aiBox').hidden && !document.getElementById('scoreBox').hidden), name + '（' + pick + '）：AI 判斷、評分');
            if (pick === 'squat') checked.push(name + (counted ? '' : '（沒有算到次數）'));
        }
    }
    // 大部分的檔案用深蹲分析都還算得到次數（AI 的幾段真的有檢查到，不是空的）
    assert.ok(checked.filter(n => !n.endsWith('（沒有算到次數）')).length >= 6, checked.join('／'));
    await context.close();
});
