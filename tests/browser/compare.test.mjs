// 模型對照頁（compare.html，11/21）：瀏覽器端到端，假的 MediaPipe 和假的 YOLO 播同一串骨架（harness.mjs），合成的測試影片
//   選影片（tests/browser/fixtures/clip.webm：ffmpeg 的測試畫面 8 秒，不是真人）→ 深蹲、lite 對 YOLO26n → 兩邊數到一樣的次數、
//   角度差 0（同一串骨架）；YOLO 那張卡片寫「判斷不了：腳跟離地」；下載兩份錄製檔（重播分析讀得懂）和 CSV；320 寬、axe-core
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, serve, open, script, rep, violations } from './harness.mjs';
import { parseRecording, analyzeRecording } from '../../js/data/replay-core.js';

const CLIP = fileURLToPath(new URL('./fixtures/clip.webm', import.meta.url));
const stand = (id, frames) => ({ id, depth: 0, frames });
// 8 秒（240 格）裡排 2 下深蹲
const SQUAT = script([stand('squat', 20), ...[1, 2].flatMap(() => rep('squat', { rest: 30 })), stand('squat', 40)]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

test('模型對照：lite 對 YOLO26n、同一串骨架 → 次數一樣、角度差 0；YOLO 寫出判斷不了的；下載兩份錄製檔和 CSV；320 寬、axe-core', async () => {
    const { context, page } = await open(browser, SQUAT, { width: 320, height: 720, mobile: true });
    await page.goto(site.base + 'compare.html');
    await page.setInputFiles('#videoInput', CLIP);
    await page.waitForFunction(() => /選好動作/.test(document.getElementById('loadStatus').textContent), null, { timeout: 20000 });
    await page.selectOption('#workoutPick', 'squat');
    await page.selectOption('#modelA', 'lite');
    await page.selectOption('#modelB', 'yolo-n');
    await page.click('#runBtn');
    await page.waitForFunction(() => /完成/.test(document.getElementById('runStatus').textContent), null, { timeout: 240000 });
    // 跑完就畫第一格（不用先拖滑桿）
    await page.waitForFunction(() => document.getElementById('frameTime').textContent === '0.0 秒', null, { timeout: 10000 });
    const cards = await page.$$eval('#modelCards .model-card', els => els.map(e => e.textContent));
    assert.equal(cards.length, 2);
    assert.match(cards[0], /A：MediaPipe lite/);
    assert.match(cards[0], /次數：2 下/);
    assert.match(cards[1], /B：YOLO26n/);
    assert.match(cards[1], /次數：2 下/);
    assert.match(cards[1], /判斷不了：腳跟離地/);
    assert.doesNotMatch(cards[0], /判斷不了/);
    // 同一串骨架：每個關節的平均絕對差都是 0
    const joints = await page.$$eval('#jointTable tbody tr', rows => rows.map(r => [...r.children].map(c => c.textContent)));
    assert.equal(joints.length, 4);
    for (const row of joints) {
        assert.ok(Number(row[1]) > 0, row.join(' '));
        assert.equal(row[3], '0°', row.join(' '));
    }
    // 角度曲線預設看主要的關節（深蹲是膝蓋）比到比較多格的那一側；一樣多時是左邊
    const [left, right] = joints;
    assert.equal(await page.$eval('#chartJoint', s => s.selectedOptions[0].textContent), Number(right[1]) > Number(left[1]) ? right[0] : left[0]);
    const reps = await page.$$eval('#repTable tbody tr', rows => rows.map(r => [...r.children].map(c => c.textContent)));
    assert.deepEqual(reps.map(r => r[3]), ['0°', '0°']);
    // 下載：錄製檔是網站的格式，重播分析的算法讀得懂、一樣數到 2 下
    for (const [btn, model] of [['#downloadA', 'pose_landmarker_lite'], ['#downloadB', 'yolo26n-pose']]) {
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click(btn)]);
        const text = readFileSync(await dl.path(), 'utf8');
        const parsed = parseRecording(text);
        assert.equal(parsed.meta.model, model);
        assert.equal(parsed.meta.source, 'compare');
        const r = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: 'squat' });
        assert.equal(r.reps.length, 2, model);
    }
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#downloadCsv')]);
    const lines = readFileSync(await csv.path(), 'utf8').replace(/^﻿/, '').trim().split('\n');
    assert.match(lines[0], /^t,A_LEFT_KNEE,.*B_RIGHT_ELBOW$/);
    assert.ok(lines.length > 200, '每一格一列：' + lines.length);
    // 畫面：拖到中間一格，畫得出來、不出錯
    await page.$eval('#frameSlider', el => { el.value = '120'; el.dispatchEvent(new Event('input')); });
    await page.waitForFunction(() => document.getElementById('frameTime').textContent === '4.0 秒', null, { timeout: 10000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 0, '不超出畫面：' + overflow);
    assert.deepEqual(await violations(page), []);
    assert.deepEqual(page.errors, []);
    await context.close();
});

test('模型對照：不是影片、打不開的檔案 → 說清楚，不能按開始', async () => {
    const { context, page } = await open(browser, SQUAT);
    await page.goto(site.base + 'compare.html');
    await page.setInputFiles('#videoInput', { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.waitForFunction(() => /不是影片/.test(document.getElementById('loadStatus').textContent), null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('runBtn').disabled), true);
    await page.setInputFiles('#videoInput', { name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video') });
    await page.waitForFunction(() => /打不開/.test(document.getElementById('loadStatus').textContent), null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => document.getElementById('runBtn').disabled), true);
    assert.deepEqual(page.errors, []);
    await context.close();
});
