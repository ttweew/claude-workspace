// 全部 AI 功能一起用（11/13 整合測試，瀏覽器端到端，假的 AI）：最小的手機（320 寬）、斷網
//   這週加的 AI 功能都分開測過；這裡照實際會用的樣子一次跑完，看它們會不會互相干擾：
//   有網路時打開過首頁、重播分析（Service Worker 把網頁、程式、AI 檔案存起來），之後斷網重新打開首頁：
//     「AI 全自動」「AI 教練」打開（手勢控制錄影預設開著）、自由模式開鏡頭：
//     站著 → 深蹲 3 下（AI 認出來自己開始數，之前做的也算）→ 舉手 2 秒開始錄影 → 深蹲 4 下 → 舉手 2 秒結束錄影
//   舉手的時候 AI 全自動不會換動作、不會多數；卡片、手勢的提示、每一下的提示（AI 判斷和分數）都在畫面裡、不互相蓋住
//   結束：總結 7 下，AI 判斷、AI 評分、AI 解釋、你這一下 vs 標準動作都有，說的是同一下；教練建議沒有網路用固定句子；
//   整頁不左右捲動；axe-core
//   錄製檔（錄到的 4 下）拿到重播分析（也是斷網）：AI 的幾句和對照圖都有，和 node 用同一套程式算的一樣
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, serve, open, script, rep, summary, violations } from './harness.mjs';
import { demoLandmarks } from '../helpers.mjs';
import { P } from '../../js/skeleton/landmarks.js';
import { parseRecording, analyzeRecording } from '../../js/data/replay-core.js';
import { judgeReps, aiLine, scoreLine, explainLine, worstIndex } from '../../js/analysis/ai-judge.js';
import { FAILURE_TEXT } from '../../js/cloud/ai-coach.js';

// 舉手（和 tests/browser/gesture.test.mjs 一樣）：站著，右手腕舉到鼻子上面 0.15（畫面高的比例）
const base = demoLandmarks('squat', 0);
const nose = base[P.NOSE], shoulder = base[P.RIGHT_SHOULDER];
const toward = (p, x, y, f) => ({ ...p, x: p.x + (x - p.x) * f, y: p.y + (y - p.y) * f });
const raise = f => (p, k) => (k === P.RIGHT_WRIST ? toward(p, shoulder.x, nose.y - 0.15, f)
    : k === P.RIGHT_ELBOW ? toward(p, shoulder.x, (shoulder.y + nose.y) / 2 - 0.05, f) : p);
const stand = frames => ({ id: 'squat', depth: 0, frames });
const hand = [
    ...[0.25, 0.5, 0.75].map(f => ({ id: 'squat', depth: 0, frames: 2, move: raise(f) })),
    { id: 'squat', depth: 0, frames: 80, move: raise(1) },
    ...[0.75, 0.5, 0.25].map(f => ({ id: 'squat', depth: 0, frames: 2, move: raise(f) }))
];
const squats = n => Array.from({ length: n }, () => rep('squat', { hold: 10, rest: 20 })).flat();
// 站 4 秒 → 深蹲 3 下（約 9 秒）→ 站 1 秒 → 舉手 2.9 秒（開始錄影）→ 站 1 秒 → 深蹲 4 下 → 站 1 秒 → 舉手（結束錄影）→ 站 2 秒
const SCRIPT = script([stand(120), ...squats(3), stand(30), ...hand, stand(30), ...squats(4), stand(30), ...hand, stand(60)]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

const ready = page => page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
// 畫面上看得到的框（看不到的是 null）
const boxOf = (page, sel) => page.$eval(sel, el => {
    if (el.hidden || el.closest('[hidden]')) return null;
    const r = el.getBoundingClientRect();
    return r.width && r.height ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom } : null;
});
const overlap = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test('全部 AI 功能一起用：320 寬的手機、斷網；AI 全自動、手勢錄影、每一下的 AI 判斷和分數、總結的評分、解釋、對照圖、教練建議、重播分析', async () => {
    const { context, page } = await open(browser, SCRIPT, { width: 320, height: 640, mobile: true });
    await context.addInitScript(() => {
        try { localStorage.setItem('aiCoach', '1'); } catch (e) {}
        window.__fakeAI = { reply: '每一下都蹲到位，很穩。' };
    });
    // 有網路時打開一次：Service Worker 接手之後再打開首頁、重播分析，網頁、程式、AI 檔案都存起來
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });
    await page.goto(site.base + 'replay.html');
    await page.waitForLoadState('load');
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    await page.click('#aiAutoToggle');
    assert.equal(await page.isChecked('#gestureToggle'), true, '手勢控制錄影預設開著');

    // 斷網，重新打開首頁：從手機裡存的檔案打開，AI 照常
    await context.setOffline(true);
    await page.reload();
    await ready(page);
    assert.match(await page.textContent('#poseStatus'), /已就緒/);
    assert.equal(await page.isChecked('#aiAutoToggle'), true, 'AI 全自動會記住');
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });

    // AI 認出深蹲：自己開始數（之前做的也算）、講「開始數深蹲」
    await page.waitForFunction(() => !document.getElementById('hudRepsBox').hidden, null, { timeout: 30000 });
    assert.match(await page.textContent('#activityText'), /^開始數深蹲(（AI 認出來之前做的 \d 下也算進去）)?$/);
    assert.ok(await page.evaluate(() => window.__said.includes('開始數深蹲')));

    // 舉手 2 秒：開始錄影（數的是深蹲，錄製檔記深蹲）；這時候卡片、手勢的提示、次數都在畫面裡、不互相蓋住
    await page.waitForFunction(() => document.getElementById('gestureNote').textContent === '✋ 手勢：開始錄影', null, { timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('recordBtn').classList.contains('recording'), null, { timeout: 5000 });
    assert.equal(await page.textContent('#hudReps'), '3', '舉手的時候不會多數');
    const shown = { card: await boxOf(page, '#activity .activity-card'), note: await boxOf(page, '#gestureNote'), reps: await boxOf(page, '#hudRepsBox') };
    for (const [name, box] of Object.entries(shown)) assert.ok(box && box.left >= 0 && box.right <= 320, name + ' 在畫面裡：' + JSON.stringify(box));
    assert.ok(!overlap(shown.card, shown.note) && !overlap(shown.card, shown.reps) && !overlap(shown.note, shown.reps), '不互相蓋住：' + JSON.stringify(shown));

    // 錄著再做 4 下，舉手結束錄影
    await page.waitForFunction(() => document.getElementById('gestureNote').textContent === '✋ 手勢：結束錄影', null, { timeout: 40000 });
    await page.waitForFunction(() => !document.getElementById('recordBtn').classList.contains('recording'), null, { timeout: 5000 });
    assert.equal(await page.textContent('#hudReps'), '7');
    // 一直數的是深蹲：舉手、站著的時候 AI 全自動都沒有換動作
    assert.equal(await page.evaluate(() => localStorage.getItem('workout')), 'squat');
    // 停止錄製後卡片馬上（下一格）不再寫「錄製中不自動換動作」
    await page.waitForFunction(() => document.getElementById('activityText').textContent === '現在數深蹲；換別的動作，AI 會跟著換', null, { timeout: 2000 });
    // 每一下的提示：AI 認出來之後的每一下都有 AI 判斷和分數，都在畫面裡（AI 認出來之前做的那幾下是重算的，不一下一下跳）
    const toasts = await page.evaluate(() => window.__toasts);
    assert.ok(toasts.length >= 4 && toasts.length <= 6, '提示 ' + toasts.length + ' 次');
    for (const t of toasts) {
        assert.match(t.ai, /^AI：(做對|上身前傾|腳跟離地|膝蓋超過腳尖)（\d+%） · \d+ 分$/);
        assert.ok(t.left >= 0 && t.right <= 320, '提示在畫面裡：' + JSON.stringify(t));
    }
    // 開始、結束錄影都講出來（不會被「開始數深蹲」蓋掉）
    const said = await page.evaluate(() => window.__said);
    assert.ok(said.includes('開始錄影') && said.includes('結束錄影'), said.join('／'));

    // 錄製檔（斷網也能下載）
    await page.click('#dataBtn');
    const [json] = await Promise.all([page.waitForEvent('download'), page.click('#jsonBtn')]);
    const recording = readFileSync(await json.path(), 'utf8');
    await page.click('#dataBtn');

    // 結束：總結的 AI 幾句、對照圖，說的是同一下；教練建議沒有網路用固定句子
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => !document.getElementById('coachStatus').textContent.includes('想一下'), null, { timeout: 15000 });
    const home = await summary(page);
    assert.match(home.lines[0], /^深蹲 7 下/);
    assert.match(home.ai, /^AI 判斷（示範：模型是用合成資料訓練的，不是真人）：/);
    const read = await page.evaluate(() => ({
        score: document.getElementById('scoreSummaryBox').hidden ? '' : document.getElementById('scoreSummaryBox').textContent,
        explain: document.getElementById('explainSummaryBox').hidden ? '' : document.getElementById('explainSummaryBox').textContent,
        labels: [...document.querySelectorAll('#poseCompareBox .pose-compare-label')].map(t => t.textContent),
        figures: document.querySelectorAll('#poseCompareBox .demo-bones').length,
        coach: { source: document.getElementById('coachSource').textContent, status: document.getElementById('coachStatus').textContent, lines: document.querySelectorAll('#coachLines li').length }
    }));
    const worst = read.score.match(/^AI 評分（每一下 0～100 分：AI 覺得做對的把握 × 和示範動作有多像）：平均 \d+ 分；最好第 \d 下 \d+ 分、最差第 (\d) 下 \d+ 分。$/);
    assert.ok(worst, read.score);
    assert.match(read.explain, new RegExp('^AI 解釋（最差的第 ' + worst[1] + ' 下，判成'));
    assert.deepEqual(read.labels, ['你（第 ' + worst[1] + ' 下）', '標準動作']);
    assert.equal(read.figures, 2);
    assert.deepEqual(read.coach, { source: '（固定建議）', status: FAILURE_TEXT.offline, lines: read.coach.lines });
    assert.ok(read.coach.lines > 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(await violations(page, '#summary'), []);

    // 重播分析（還是斷網）：錄到的 4 下，AI 的幾句和 node 用同一套程式算的一樣，也畫對照圖
    await page.goto(site.base + 'replay.html');
    await page.setInputFiles('#fileInput', { name: 'ai-all.json', mimeType: 'application/json', buffer: Buffer.from(recording) });
    await page.waitForFunction(() => !document.getElementById('squatCard').hidden && document.getElementById('squatTable').rows.length > 1, null, { timeout: 60000 });
    const parsed = parseRecording(recording);
    assert.equal(parsed.meta.workout, 'squat');
    const node = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: 'squat' });
    assert.equal(node.reps.length, 4);
    const judged = judgeReps('squat', node.reps);
    const replay = await page.evaluate(() => ({
        ai: document.getElementById('aiBox').textContent,
        score: document.getElementById('scoreBox').textContent,
        explain: document.getElementById('explainBox').textContent,
        labels: [...document.querySelectorAll('#poseCompareBox .pose-compare-label')].map(t => t.textContent),
        figures: document.querySelectorAll('#poseCompareBox .demo-bones').length
    }));
    assert.ok(replay.ai.startsWith(aiLine('squat', node.reps, judged)), replay.ai);
    assert.equal(replay.score, scoreLine('squat', node.reps, judged) + '。');
    assert.equal(replay.explain, explainLine('squat', node.reps, judged) + '。');
    assert.deepEqual(replay.labels, ['你（第 ' + node.reps[worstIndex(node.reps, judged)].n + ' 下）', '標準動作']);
    assert.equal(replay.figures, 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await context.setOffline(false);
    assert.deepEqual(page.errors, []);
    await context.close();
});

// 速度建議（11/13 整合測試找到）：開鏡頭約 10 秒量完 AI 的速度，跳一張「速度建議」（試試 full 之類），要按「不用了」才收起來；
// 建議出現時 AI 全自動的卡片會藏起來（橫拿時兩張卡片疊在同一個地方）。AI 全自動是人站在 2～3 公尺外不碰手機的，
// 按不到，卡片（現在數什麼）就一直看不到 → AI 全自動開著時不跳建議；關著時照常（AI 自動辨識動作的卡片先藏起來）
const SHORT = script([stand(60), ...squats(6), stand(60)]);
async function speedAdvice(auto) {
    const { context, page } = await open(browser, SHORT, { width: 320, height: 640, mobile: true });
    if (auto) await context.addInitScript(() => { try { localStorage.setItem('aiAuto', '1'); } catch (e) {} });
    await page.goto(site.base + 'index.html?workout=free');
    await ready(page);
    const measured = page.waitForEvent('console', { predicate: m => m.text().startsWith('速度量測：'), timeout: 45000 });
    await page.click('#startBtn');
    await page.evaluate(() => {
        window.__adviceShown = false;
        setInterval(() => { if (!document.getElementById('advice').hidden) window.__adviceShown = true; }, 50);
    });
    await measured;
    await page.waitForTimeout(1000);
    const out = {
        shown: await page.evaluate(() => window.__adviceShown),
        advice: await boxOf(page, '#advice .advice-card'),
        card: await boxOf(page, '#activity .activity-card'),
        title: await page.textContent('#activityTitle')
    };
    assert.deepEqual(page.errors, []);
    await context.close();
    return out;
}

test('速度建議：AI 全自動開著時不跳（站遠按不到，會藏起 AI 全自動的卡片）；關著時照常跳', async () => {
    const on = await speedAdvice(true);
    assert.equal(on.shown, false, 'AI 全自動：量完速度也不跳建議');
    assert.equal(on.advice, null);
    assert.ok(on.card, 'AI 全自動的卡片看得到');
    assert.equal(on.title, 'AI 全自動');
    const off = await speedAdvice(false);
    assert.equal(off.shown, true, 'AI 全自動關著：照常跳建議');
    assert.ok(off.advice, '建議看得到');
    assert.equal(off.card, null, '建議出現時 AI 自動辨識動作的卡片先藏起來（和以前一樣）');
});
