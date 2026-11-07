// AI 自動辨識動作（11/8）：看最近 3 秒的骨架猜在做哪個動作（js/analysis/activity.js、tools/train-activity.mjs）
import test from 'node:test';
import assert from 'node:assert/strict';
import MODEL from '../js/analysis/activity-model.js';
import { ACTIVITIES, ACTIVITY_FEATURES, ACTIVITY_NAMES, ActivityMeter, ActivityDisplay, activitySummary, frameValues, windowFeatures,
    guessActivity, hasActivityModel, ACTIVITY_MODEL, WINDOW_MS, STEP_MS } from '../js/analysis/activity.js';
import { subjectWindows, trainActivity, scoreActivity } from '../tools/train-activity.mjs';
import { syntheticSet, syntheticHold } from './synthetic-sets.mjs';
import { parseRecording, analyzeRecording } from '../js/data/replay-core.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';

test('模型檔：站著和四個動作、特徵照 activity.js；寫明是合成資料訓練的', () => {
    assert.ok(hasActivityModel());
    assert.equal(MODEL.task, 'activity');
    assert.deepEqual(MODEL.classes, ACTIVITIES);
    assert.deepEqual(MODEL.features, ACTIVITY_FEATURES);
    assert.equal(MODEL.synthetic, true);
    assert.equal(ACTIVITY_MODEL.synthetic, true);
    assert.deepEqual(MODEL.subjects, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    assert.deepEqual(ACTIVITIES.map(a => ACTIVITY_NAMES[a]), ['站著', '深蹲', '伏地挺身', '棒式', '弓箭步']);
});

test('網站裡的模型就是這套程式訓練出來的（不一樣就要重新產生：node tools/train-activity.mjs --synthetic A,B,C,D,E,F,G,H --test I,J,K --module js/analysis/activity-model.js）', async () => {
    const rows = (await Promise.all(MODEL.subjects.map(subjectWindows))).flat();
    assert.equal(JSON.stringify({ ...trainActivity(rows), synthetic: true, subjects: MODEL.subjects }), JSON.stringify(MODEL));
});

test('訓練時沒看過的合成受測者（K）：每一種都猜得準', async () => {
    const rows = await subjectWindows('K');
    const score = scoreActivity(MODEL, rows);
    assert.ok(score.total.hit >= score.total.n * 0.95, score.total.hit + '／' + score.total.n);
    for (const a of ACTIVITIES) assert.ok(score.by[a].n >= 10 && score.by[a].hit >= score.by[a].n * 0.9, a + ' ' + JSON.stringify(score.by[a]));
});

// 一格的骨架：用合成的組裡的一格（pipeline 處理過）
function processedFrames(set) {
    const parsed = parseRecording(set.text);
    const pipeline = new PosePipeline();
    return parsed.frames.map(f => ({ t: f.t, p: pipeline.process(f.raw, f.t, 640, 480) }));
}

test('一格的數字、一段的特徵：站著身體直、趴著身體斜；看不到身體、被改壞的不會壞掉', () => {
    // 擋鬼點（ghost.js）剛看到人的頭幾格還沒確認那些點（visible: false）：取第一格算得出數字的
    const first = set => processedFrames(set).map(f => f.p).find(p => frameValues(p));
    const stand = first(syntheticHold('K', 'squat', 'stand', 4));
    const plank = first(syntheticHold('K', 'pushup', 'plank', 4));
    assert.ok(frameValues(stand).tilt < 15, '站著：' + frameValues(stand).tilt);
    assert.ok(frameValues(plank).tilt > 60, '手撐的棒式：' + frameValues(plank).tilt);
    for (const bad of [null, {}, { landmarks: 'x', angles: {} }, { landmarks: [], angles: {} }, { landmarks: Array(33).fill(null), angles: {} },
        { landmarks: Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.99 }), angles: {}, width: 640, height: 480 }]) {
        assert.equal(frameValues(bad), null, JSON.stringify(bad));
    }
    // 角度被改壞（不是數字）：當成看不到
    const v = frameValues({ ...stand, angles: { LEFT_KNEE: '170', RIGHT_KNEE: NaN, LEFT_HIP: null } });
    assert.equal(v.knee, null);
    assert.equal(v.hip, null);
    // 一段：不到 2.7 秒、看得到人的格子不到 7 成 → 不猜
    const sample = (t, ok = true) => ({ t, v: ok ? frameValues(stand) : null });
    const full = Array.from({ length: 91 }, (_, i) => sample(i * 1000 / 30));
    assert.ok(windowFeatures(full));
    assert.deepEqual(Object.keys(windowFeatures(full)), ACTIVITY_FEATURES);
    assert.equal(windowFeatures(full.slice(0, 80)), null, '2.6 秒');
    assert.equal(windowFeatures(full.map((s, i) => sample(s.t, i % 3 === 0))), null, '只有 1/3 的格子看得到人');
    for (const bad of [null, 'x', [], [sample(0)]]) assert.equal(windowFeatures(bad), null);
    // 特徵被改壞、沒有模型：不猜
    assert.equal(guessActivity(null), null);
    assert.equal(guessActivity({ tilt: 'x' }, null), null);
    assert.equal(guessActivity(windowFeatures(full), { ...MODEL, task: 'judge' }), null);
    assert.ok(ACTIVITIES.includes(guessActivity({ tilt: 'x', knee: {} }).label));
});

test('ActivityMeter：每 0.5 秒猜一次、剛開始的 2.7 秒不猜；時間倒退重新開始；沒有模型不猜', () => {
    const frames = processedFrames(syntheticHold('K', 'squat', 'stand', 6));
    const meter = new ActivityMeter();
    const at = [];
    for (const f of frames) {
        const g = meter.update(f.p, f.t);
        if (g !== undefined) at.push([f.t - frames[0].t, g]);
    }
    // 第一格就猜一次（資料不夠：null），之後每 0.5 秒
    assert.equal(at[0][1], null);
    at.slice(1).forEach(([t], i) => assert.ok(Math.abs(t - at[i][0] - STEP_MS) < 40, '間隔 ' + (t - at[i][0])));
    const first = at.find(([, g]) => g);
    assert.ok(first[0] >= WINDOW_MS * 0.9 && first[0] < WINDOW_MS * 0.9 + STEP_MS + 40, '第一次猜在 ' + first[0] + ' 毫秒');
    assert.ok(at.filter(([, g]) => g).every(([, g]) => g.label === 'stand' && g.confidence > 0.6), JSON.stringify(at.map(([, g]) => g && g.label)));
    // 時間倒退：重新開始（之前的不算），2.7 秒內不猜
    assert.equal(meter.update(frames[0].p, frames[0].t), null);
    assert.equal(meter.samples.length, 1);
    // 沒有模型、時間被改壞
    const none = new ActivityMeter(null);
    for (const f of frames) assert.ok(none.update(f.p, f.t) == null);
    assert.equal(new ActivityMeter().update(frames[0].p, NaN), undefined);
});

test('畫面上的猜測：同一個動作連續 2 次才換、把握不到 6 成寫還不確定、看不到人收起來', () => {
    const d = new ActivityDisplay();
    const g = (label, confidence = 0.9) => ({ label, confidence });
    assert.deepEqual(d.update(g('stand')), { label: 'stand', confidence: 0.9 }, '第一次猜到就寫');
    assert.equal(d.update(undefined).label, 'stand', '這一格沒猜：不變');
    assert.equal(d.update(g('squat')).label, 'stand', '換成深蹲只猜到 1 次：還不換');
    assert.equal(d.update(g('squat', 0.8)).label, 'squat', '連續 2 次：換');
    assert.equal(d.update(g('squat', 0.7)).confidence, 0.7, '同一個動作：把握跟著更新');
    assert.equal(d.update(g('pushup')).label, 'squat');
    assert.equal(d.update(g('squat')).label, 'squat', '中間只有 1 次不一樣：不換');
    assert.equal(d.update(g('lunge', 0.5)).label, 'squat');
    assert.equal(d.update(g('pushup', 0.55)).label, null, '把握不到 6 成連續 2 次：還不確定');
    assert.equal(d.update(null), null, '看不到人：收起來');
    assert.equal(d.update(g('plank')).label, 'plank', '重新開始：第一次猜到就寫');
});

test('一段錄影的統計：各猜了幾秒（把握 6 成以上才算）、最多的動作不算站著；重播分析的檔案也有', async () => {
    const g = (label, confidence = 0.9) => ({ label, confidence });
    assert.deepEqual(activitySummary([g('stand'), g('squat'), g('squat'), g('squat'), g('stand'), g('lunge'), null, g('plank', 0.3), g('constructor'), 'x']), {
        total: 3, list: [{ label: 'squat', seconds: 1.5 }, { label: 'lunge', seconds: 0.5 }, { label: 'stand', seconds: 1 }], top: 'squat'
    });
    assert.deepEqual(activitySummary([g('stand'), g('stand')]), { total: 1, list: [{ label: 'stand', seconds: 1 }], top: null });
    assert.deepEqual(activitySummary(null), { total: 0, list: [], top: null });
    // 重播分析（replay-core.js 的 analyzeRecording）：沒選動作的錄製檔也猜；和用 ActivityMeter 一格一格猜的一樣
    const set = syntheticSet('K', 'lunge', 'good', 7);
    const parsed = parseRecording(set.text);
    const out = await analyzeRecording(parsed, 640, 480, { workout: null });
    assert.equal(out.activity.top, 'lunge');
    const meter = new ActivityMeter(), pipeline = new PosePipeline(), guesses = [];
    for (const f of parsed.frames) {
        const r = meter.update(pipeline.process(f.raw, f.t, 640, 480), f.t);
        if (r !== undefined) guesses.push(r);
    }
    assert.deepEqual(out.activity, activitySummary(guesses));
    const lunge = out.activity.list.find(x => x.label === 'lunge');
    assert.ok(lunge.seconds >= out.activity.total * 0.8, JSON.stringify(out.activity));
});
