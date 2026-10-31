// 首頁開鏡頭運動、關鏡頭看總結（瀏覽器端到端，假的 AI，合成資料）
//   深蹲 6 下（後 3 下整個人前後晃）：次數、總結、動作流暢度、動作穩定度、每一下的表格
//   棒式 26 秒（後半髖部上下晃）：秒數、動作穩定度
//   伏地挺身 3 下：沒有穩定度；320 寬的手機：總結不超出畫面
import test from 'node:test';
import assert from 'node:assert/strict';
import { launch, serve, open, script, rep, workout, summary, usedFrames } from './harness.mjs';
import { P } from '../../js/skeleton/landmarks.js';
import { PosePipeline } from '../../js/skeleton/pipeline.js';
import { WorkoutTracker } from '../../js/analysis/tracker.js';

// 同樣的骨架在 node 裡用網站同一套程式算一次：瀏覽器算出來的要和這個差不多
//   used：網站真的拿到的格子 [第幾格, 時間]（harness.mjs 的 usedFrames）；省略時照每秒 30 格、每格都拿
//   瀏覽器是照真的時間拿格子，電腦慢就會跳格：10/31 GitHub 的測試機器跳了好幾格，第 5 下算出 6.1，每秒 30 格是 6.7
//   所以照瀏覽器真的拿到的格子重算：把電腦調慢 1、4、8 倍（跳過 22～492 格）都完全一樣，只留四捨五入的差（0.1）
//   （每秒 30 格的算法在調慢 8 倍時差到 0.8）
function inNode(id, frames, used = frames.map((f, i) => [i, i * 1000 / 30])) {
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker(id);
    const done = [];
    for (const [i, ts] of used) {
        const f = frames[i];
        const lm = f ? f.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null;
        const r = tracker.update(pipeline.process(lm, ts, 640, 480), ts);
        if (r.done) done.push(r.done);
    }
    return done;
}

const stand = (id, frames) => ({ id, depth: 0, frames });
// 整個人（腳不動：25 號以後是膝蓋、腳踝、腳）每秒前後晃一次，晃 px 像素（640 寬）
const rock = px => (p, k, n) => (k < 25 ? { ...p, x: p.x + px / 640 * Math.sin(n / 30 * 2 * Math.PI) } : p);
const SQUAT = script([stand('squat', 60), ...[0, 0, 0, 13, 13, 13].flatMap(px => rep('squat', { hold: 15, rest: 40, move: px ? rock(px) : undefined })), stand('squat', 60)]);
// 棒式：前 13 秒撐得穩，後 13 秒髖部上下晃 ±4.8 像素（480 高）
const hips = [P.LEFT_HIP, P.RIGHT_HIP];
const PLANK = script([{ id: 'plank', depth: 0, frames: 390 },
    { id: 'plank', depth: 0, frames: 390, move: (p, k, n) => (hips.includes(k) ? { ...p, y: p.y + 0.01 * Math.sin(n / 30 * 2 * Math.PI * 0.7) } : p) }]);
const PUSHUP = script([stand('pushup', 60), ...[1, 2, 3].flatMap(() => rep('pushup', { rest: 20 }))]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

test('深蹲 6 下：總結、流暢度、穩定度（後 3 下晃得多）、每一下的表格', async () => {
    const { context, page } = await open(browser, SQUAT);
    await workout(page, site.base, 'squat', () => document.getElementById('hudReps').textContent === '6');
    const s = await summary(page);
    assert.match(s.lines[0], /^深蹲 6 下：/);
    assert.match(s.fluency, /^動作流暢度：節奏穩（6 下有 6 下/);
    assert.deepEqual(s.head, ['第幾下', '最低角度', '深度', '秒數', '順不順', '晃動', '錯誤']);
    const sway = s.rows.map(r => parseFloat(r[5]));
    const expected = inNode('squat', SQUAT, await usedFrames(page)).map(r => r.sway);
    assert.equal(expected.length, 6);
    sway.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= 0.1, '第 ' + (i + 1) + ' 下：瀏覽器 ' + sway + '，node ' + expected));
    assert.ok(Math.max(...sway.slice(0, 3)) <= 2.5 && Math.min(...sway.slice(3)) >= 5, '前 3 下沒晃、後 3 下晃得多：' + sway);
    const m = s.stability.match(/^動作穩定度：重心前後晃動平均 ([\d.]+)%（小腿長 100%；示範動畫 2\.3%），最多的是第 \d 下（[\d.]+%）；前段（第 1～2 下）([\d.]+)% → 後段（第 5～6 下）([\d.]+)%$/);
    assert.ok(m, s.stability);
    assert.equal(+m[1], Math.round(sway.reduce((a, b) => a + b, 0) / 6 * 10) / 10, '平均就是表格的平均');
    assert.equal(+m[3], Math.round((sway[4] + sway[5]) / 2 * 10) / 10, '後段是第 5、6 下的平均');
    // 螢幕閱讀器（10/30 無障礙）：圖念出標題＋重點；疲勞分析每一項的名稱後面有「：」，不會和數字連在一起
    const read = await page.evaluate(() => ({
        charts: [...document.querySelectorAll('#repChart svg[role=img]')].map(svg => svg.getAttribute('aria-label')),
        fatigue: [...document.querySelectorAll('#fatigueBox .fatigue-list li')].map(li => li.textContent),
        region: document.querySelector('#repChart .table-wrap').getAttribute('aria-label')
    }));
    assert.match(read.charts[0], /^每一下最低的膝蓋角度：6 下，最深 \d+°（第 \d 下），到位 6 下$/);
    assert.match(read.charts[1], /^每一下花幾秒：平均每下 [\d.]+ 秒/);
    assert.match(read.fatigue[0], /^每下幾秒：[\d.]+ 秒 → /);
    assert.equal(read.region, '每一下的數字（表格，可以左右捲動）');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('棒式 26 秒：前段撐得穩、後段髖部上下晃', async () => {
    const { context, page } = await open(browser, PLANK);
    await workout(page, site.base, 'plank', () => document.getElementById('hudReps').textContent === '0:24');
    const s = await summary(page);
    const m = s.stability.match(/^動作穩定度：髖部上下晃動 ±([\d.]+)°（第 1 次，撐 (\d+) 秒）；前段 ±([\d.]+)° → 後段 ±([\d.]+)°；髖部的位置 /);
    assert.ok(m, s.stability);
    assert.ok(+m[3] <= 0.2 && +m[4] >= 2, '前段 ' + m[3] + ' → 後段 ' + m[4]);
    assert.deepEqual(s.head, ['第幾次', '秒數', '晃動', '錯誤']);
    assert.deepEqual(s.rows[0].slice(1, 3), [m[2], '±' + m[1] + '°'], '表格和那一句一樣');
    // 棒式的表格叫「每一次的數字」（10/30 以前也寫「每一下」）
    assert.equal(await page.textContent('#repChart details.rep-table summary'), '每一次的數字');
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('伏地挺身 3 下：沒有穩定度；320 寬的手機：總結、表格不超出畫面', async () => {
    const { context, page } = await open(browser, PUSHUP, { width: 320, height: 640, mobile: true });
    await workout(page, site.base, 'pushup', () => document.getElementById('hudReps').textContent === '3');
    const s = await summary(page);
    assert.match(s.lines[0], /^伏地挺身 3 下/);
    assert.equal(s.stability, '');
    assert.ok(!s.head.includes('晃動'));
    await page.click('#repChart details.rep-table summary');
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(width <= 320, '整頁寬 ' + width);
    assert.deepEqual(page.errors, []);
    await context.close();
});
