// 資料一致性（11/1 保養，瀏覽器端到端）：同一次運動，手機上、雲端、重播三個地方的數字一樣
//   首頁：開鏡頭做 8 下深蹲（假的 AI；後 3 下比較淺、整個人前後晃）、棒式 26 秒（後半髖部上下晃），同時錄製、下載錄製檔；雲端同步打開（假的 Firebase）
//   手機上：總結、「每一下」的圖、疲勞分析、流暢度、穩定度、這台裝置的紀錄、運動紀錄的 CSV、成長曲線今天那一點
//   雲端：上傳的那一筆（js/cloud/sync.js 的白名單）
//   重播：同一個錄製檔拿到重播分析，總結、每一下的圖、疲勞分析、流暢度、穩定度、每一下的角度和深度
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launch, serve, open, script, rep } from './harness.mjs';
import { P } from '../../js/skeleton/landmarks.js';
import { cloudSession, sessionId } from '../../js/cloud/sync.js';
import { parseRecording, analyzeRecording } from '../../js/data/replay-core.js';
import { aiJudge, judgeText } from '../../js/analysis/ai-judge.js';

const stand = (id, frames) => ({ id, depth: 0, frames });
// 整個人（腳不動）每秒前後晃一次（和 workout.test.mjs 一樣）
const rock = px => (p, k, n) => (k < 25 ? { ...p, x: p.x + px / 640 * Math.sin(n / 30 * 2 * Math.PI) } : p);
// 淺一點的一下：只蹲到示範動作的 depth 倍
const shallow = (depth, move) => [
    { id: 'squat', depth: i => depth * i / 30, frames: 31, move },
    { id: 'squat', depth, frames: 15, move },
    { id: 'squat', depth: i => depth * (1 - i / 30), frames: 31, move },
    stand('squat', 40)
];
const SQUAT = script([stand('squat', 75), ...[1, 2, 3, 4, 5].flatMap(() => rep('squat', { hold: 15, rest: 40 })),
    ...[0.62, 0.6, 0.58].flatMap(d => shallow(d, rock(10))), stand('squat', 60)]);

let browser, site;
test.before(async () => {
    site = await serve();
    browser = await launch();
});
test.after(async () => {
    await browser.close();
    await site.close();
});

const rows = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].map(tr => [...tr.cells].map(td => td.textContent)), sel);

// 首頁：開鏡頭、馬上錄製（數據面板的「開始錄製」；harness 把錄製前倒數設成 0）、等做完（done）、停錄、下載錄製檔、關鏡頭看總結
// settle：做完後再等多久才停止錄製（棒式要等撐完起身，見下面）
async function homeSession(frames, workoutId, done, settle = 1500) {
    const { context, page } = await open(browser, frames);
    await context.addInitScript(() => {
        try { localStorage.setItem('cloudSync', '1'); localStorage.setItem('cloudAsked', '1'); } catch (e) {}
        window.__fakeCloud = { docs: [] };
    });
    await page.goto(site.base + 'index.html?workout=' + workoutId);
    await page.waitForFunction(() => /已就緒|失敗/.test(document.getElementById('poseStatus').textContent), null, { timeout: 60000 });
    await page.click('#startBtn');
    await page.waitForFunction(() => !document.getElementById('stage').hidden, null, { timeout: 10000 });
    await page.click('#dataBtn');
    await page.click('#recordBtn');
    await page.click('#dataBtn');
    await page.waitForFunction(done, null, { timeout: 120000 });
    await page.waitForTimeout(settle);
    await page.click('#dataBtn');
    await page.click('#recordBtn');
    const [json] = await Promise.all([page.waitForEvent('download'), page.click('#jsonBtn')]);
    const recording = readFileSync(await json.path(), 'utf8');
    await page.click('#dataBtn');
    await page.click('#stopBtn');
    await page.waitForFunction(() => !document.getElementById('summary').hidden, null, { timeout: 10000 });
    await page.waitForFunction(() => (window.__cloudWrites || []).length > 0, null, { timeout: 10000 });
    const home = await page.evaluate(() => ({
        lines: [...document.querySelectorAll('#summaryLines li')].map(li => li.textContent),
        charts: [...document.querySelectorAll('#repChart svg[role=img]')].map(svg => svg.getAttribute('aria-label')),
        fatigue: document.querySelector('#fatigueBox .fatigue-line') ? document.querySelector('#fatigueBox .fatigue-line').textContent : '',
        fluency: document.getElementById('fluencyBox').textContent,
        stability: document.getElementById('stabilityBox').textContent,
        record: JSON.parse(localStorage.getItem('workoutHistory')).pop(),
        cloud: window.__cloudWrites
    }));
    home.reps = await rows(page, '#repChart .rep-table tbody tr');
    return { context, page, home, recording };
}
// 雲端上傳的就是這台裝置那一筆的白名單欄位（多的 savedAt 是雲端的時間）
function cloudOf(home) {
    const up = home.cloud.find(w => w.path.endsWith('/' + sessionId(home.record)));
    assert.ok(up, '雲端有這一筆：' + home.cloud.map(w => w.path));
    const { savedAt, ...data } = up.data;
    assert.deepEqual(data, cloudSession(home.record));
    return data;
}
// 運動紀錄的 CSV 最後一列（欄名 → 字）
async function csvLast(page) {
    await page.click('#historyBox > summary');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.click('#historyCsv')]);
    const lines = readFileSync(await csv.path(), 'utf8').replace(/^\uFEFF/, '').trim().split('\r\n').map(l => l.split(','));
    return name => lines[lines.length - 1][lines[0].indexOf(name)];
}
// 成長曲線今天那一點（選的數字）
async function growthToday(page, metric) {
    if (!(await page.evaluate(() => document.getElementById('growthBox').open))) {
        await page.click('#growthBox > summary');
        await page.waitForFunction(() => !document.getElementById('growthChart').hidden && !document.getElementById('growthNote').textContent.startsWith('正在讀'), null, { timeout: 20000 });
    }
    await page.selectOption('#growthMetric', metric);
    return (await rows(page, '#growthChart tbody tr'))[0][1];
}
// 重播分析讀同一個錄製檔
async function replayOf(page, recording, prefix) {
    await page.goto(site.base + 'replay.html');
    await page.setInputFiles('#fileInput', { name: 'consistency.json', mimeType: 'application/json', buffer: Buffer.from(recording) });
    await page.waitForFunction(p => !document.getElementById('squatCard').hidden && document.getElementById('squatSummary').textContent.startsWith(p), prefix, { timeout: 60000 });
    const replay = await page.evaluate(() => ({
        summary: document.getElementById('squatSummary').textContent.split('。'),
        charts: [...document.querySelectorAll('#repChart svg[role=img]')].map(svg => svg.getAttribute('aria-label')),
        fatigue: document.querySelector('#fatigueBox .fatigue-line') ? document.querySelector('#fatigueBox .fatigue-line').textContent : '',
        fluency: document.getElementById('fluencyBox').textContent,
        stability: document.getElementById('stabilityBox').textContent
    }));
    replay.reps = await rows(page, '#squatTable tbody tr');
    return replay;
}
// 重播和首頁：總結每一行（重播沒有目標、沒有和上一次比）、每一下的圖、疲勞分析、流暢度、穩定度
function sameAnalysis(home, replay) {
    for (const line of replay.summary) assert.ok(home.lines.includes(line), '重播的「' + line + '」首頁也有：' + home.lines.join('｜'));
    assert.deepEqual(replay.charts, home.charts, '每一下的圖');
    assert.equal(replay.fatigue, home.fatigue, '疲勞分析');
    assert.equal(replay.fluency, home.fluency, '動作流暢度');
    assert.equal(replay.stability, home.stability, '動作穩定度');
}

test('深蹲 8 下：手機上（總結、圖、CSV、成長曲線）、雲端、重播的數字一樣', async () => {
    const { context, page, home, recording } = await homeSession(SQUAT, 'squat', () => document.getElementById('hudReps').textContent === '8');
    const s = home.record;
    assert.equal(s.count, 8);
    assert.match(home.fatigue, /變淺/, '這組要有疲勞分析可以比：' + home.fatigue);
    assert.match(home.stability, /^動作穩定度：/);
    const cloud = cloudOf(home);
    for (const k of ['count', 'clean', 'good', 'close', 'shallow', 'best', 'average', 'tempo', 'similarity']) assert.equal(cloud[k], s[k], '雲端的 ' + k);
    assert.deepEqual(cloud.errors, s.errors);
    // 總結那幾行的數字就是紀錄的數字
    assert.equal(home.lines[0], '深蹲 8 下：到位 ' + s.good + '、再低一點 ' + s.close + '、太淺 ' + s.shallow);
    assert.equal(home.lines[1], '最低 ' + s.best + '°、平均 ' + s.average + '°，每下約 ' + s.tempo + ' 秒；和示範動作相似 ' + s.similarity + '%');
    const col = await csvLast(page);
    assert.deepEqual(['次數', '沒有錯誤的', '到位', '再低一點', '太淺', '最低角度', '平均角度', '每下秒數', '相似度'].map(col),
        [s.count, s.clean, s.good, s.close, s.shallow, s.best, s.average, s.tempo, s.similarity].map(String));
    // 成長曲線今天那一點：一次最多幾下＝次數；到位比例＝總結的算法（四捨五入的 %）
    assert.equal(await growthToday(page, 'count'), s.count + ' 下');
    assert.equal(await growthToday(page, 'good'), Math.round(s.good / s.count * 100) + '%');
    assert.equal(await growthToday(page, 'similarity'), s.similarity + '%');
    const replay = await replayOf(page, recording, '深蹲');
    sameAnalysis(home, replay);
    // 每一下：第幾下、最低角度、深度（重播的表格寫「蹲到位」，首頁寫「到位」）
    const depthWord = t => t.replace(/^蹲到位/, '到位').replace(/（斜側面）$/, '');
    assert.deepEqual(replay.reps.map(r => [r[0], r[2], depthWord(r[3])]), home.reps.map(r => [r[0], r[1], r[2]]));
    // AI 判斷（11/4 保養）：首頁錄的檔案，重播分析每一下最後一欄和 node 用同一套程式算的一樣
    const parsed = parseRecording(recording);
    const node = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: 'squat' });
    assert.deepEqual(replay.reps.map(r => r[r.length - 1]), node.reps.map(it => { const j = aiJudge('squat', it); return judgeText(j.label) + '（' + Math.round(j.confidence * 100) + '%）'; }));
    assert.deepEqual(page.errors, []);
    await context.close();
});

// 棒式：先站 2 秒（開始錄製後才趴下），前 13 秒撐得穩，後 13 秒髖部上下晃（和 workout.test.mjs 一樣）
// 11/1 第一次寫成一開始就趴著：首頁從第一格就開始計時，錄製晚幾格才開始，重播少了開頭幾格，
// 每 2 秒一段的切法差幾格，後段髖部的位置首頁算出往上翹 0.1°、重播是一直線。重播只看得到錄下來的，要先錄再開始（使用說明有寫）
// 結束也一樣：最後起身站 2 秒，撐完起身才停止錄製（11/1 第二次：還在撐就停止錄製，首頁多算了停止錄製後的 0.3 秒，後段差 0.1°）
const hips = [P.LEFT_HIP, P.RIGHT_HIP];
const PLANK = script([{ id: 'squat', depth: 0, frames: 60 }, { id: 'plank', depth: 0, frames: 390 },
    { id: 'plank', depth: 0, frames: 390, move: (p, k, n) => (hips.includes(k) ? { ...p, y: p.y + 0.01 * Math.sin(n / 30 * 2 * Math.PI * 0.7) } : p) },
    { id: 'squat', depth: 0, frames: 60 }]);

test('棒式：手機上（總結、圖、CSV、成長曲線）、雲端、重播的秒數一樣（都無條件捨去）', async () => {
    // 計時到 0:24 以後還有 2 秒左右才撐完，再站 2 秒：等 4.5 秒再停止錄製
    const { context, page, home, recording } = await homeSession(PLANK, 'plank', () => document.getElementById('hudReps').textContent === '0:24', 4500);
    const s = home.record;
    const cloud = cloudOf(home);
    for (const k of ['count', 'clean', 'best', 'total']) assert.equal(cloud[k], s[k], '雲端的 ' + k);
    assert.deepEqual(cloud.seconds, s.seconds);
    assert.match(home.stability, /^動作穩定度：髖部上下晃動/);
    const col = await csvLast(page);
    assert.deepEqual(['次數', '最久（秒）', '總共（秒）'].map(col), [s.count, s.best, s.total].map(String));
    assert.equal(await growthToday(page, 'best'), s.best + ' 秒');
    assert.equal(await growthToday(page, 'total'), s.total + ' 秒');
    const replay = await replayOf(page, recording, '棒式');
    sameAnalysis(home, replay);
    assert.ok(!/還在撐/.test(await page.textContent('#squatNote')), '撐完起身才停止：沒有說明');
    // 同一個檔案去掉開頭（像是撐到一半才按錄製）：重播的第 1 次少了沒錄到的秒數，說明裡寫出來
    const rec = JSON.parse(recording);
    const frames = rec.frames;
    const from = frames[0].t + 4000;   // 站 2 秒＋趴好 2 秒
    rec.frames = frames.filter(f => f.t >= from);
    const late = await replayOf(page, JSON.stringify(rec), '棒式');
    assert.match(await page.textContent('#squatNote'), /^錄製開始時已經在撐了：第 1 次只算錄到的秒數。先按錄製、撐完起身再停止錄製/);
    const first = Number(late.reps[0][2].split(':')[1]);
    assert.ok(first < s.seconds[0] && first >= s.seconds[0] - 3, '第 1 次少了沒錄到的 2 秒左右：' + late.reps[0] + ' / ' + s.seconds[0]);
    // 去掉結尾 5 秒（還在撐就停止錄製）：最後一次只算到停止錄製
    rec.frames = frames.filter(f => f.t <= frames[frames.length - 1].t - 5000);
    await replayOf(page, JSON.stringify(rec), '棒式');
    assert.match(await page.textContent('#squatNote'), /^停止錄製時還在撐：最後一次只算到停止錄製。/);
    assert.deepEqual(page.errors, []);
    await context.close();
});
