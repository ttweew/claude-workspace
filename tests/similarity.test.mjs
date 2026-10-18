// 動作相似度（js/analysis/similarity.js）：DTW 對齊、分數、標準曲線
import test from 'node:test';
import assert from 'node:assert/strict';
import { dtw, resample, score, repSimilarity, TEMPLATES } from '../js/analysis/similarity.js';

const curve = (min, seconds, top = 168) => {
    const out = [];
    const n = Math.round(seconds * 30);
    for (let i = 0; i <= n; i++) {
        const x = i / n, d = x < 0.5 ? x * 2 : (1 - x) * 2;
        const e = d * d * (3 - 2 * d);
        out.push({ t: i / 30, v: top + (min - top) * e });
    }
    return out;
};

test('DTW：一樣的曲線差 0；快慢不同（時間拉長）幾乎不扣分；幅度不同會扣分', () => {
    const a = resample(curve(85, 2.4));
    assert.equal(dtw(a, a), 0);
    assert.ok(dtw(resample(curve(85, 2.4)), resample(curve(85, 5))) < 3, '快慢不同');
    assert.ok(dtw(resample(curve(85, 2.4)), resample(curve(120, 2.4))) > 6, '蹲得比較淺');
});

test('分數：差 0° 是 100、4° 是 90、40° 以上是 0', () => {
    assert.deepEqual([score(0), score(4), score(60), score(null)], [100, 90, 0, null]);
});

test('標準曲線：深蹲 168° → 85°、伏地挺身 164° → 89°', () => {
    assert.equal(TEMPLATES.squat.length, 40);
    assert.ok(Math.abs(Math.min(...TEMPLATES.squat) - 85) < 1 && Math.abs(TEMPLATES.squat[0] - 168) < 1);
    assert.ok(Math.abs(Math.min(...TEMPLATES.pushup) - 89) < 1);
});

test('每一下的相似度：標準的深蹲 ≥ 90、慢慢蹲也 ≥ 90、只蹲一半明顯比較低；棒式沒有', () => {
    const good = repSimilarity('squat', curve(86, 2.4));
    const slow = repSimilarity('squat', curve(86, 6));
    const half = repSimilarity('squat', curve(125, 2.4));
    assert.ok(good >= 90, 'good ' + good);
    assert.ok(slow >= 90, 'slow ' + slow);
    assert.ok(half < 75 && half < good - 15, 'half ' + half);
    assert.equal(repSimilarity('plank', curve(86, 2.4)), null);
    assert.equal(repSimilarity('squat', curve(86, 0.1)), null, '點太少');
});

test('從骨架算起（和鏡頭畫面同一套流程）：示範動畫的標準深蹲、伏地挺身、弓箭步 ≥ 90 分，只做一半的明顯比較低', async () => {
    const { WorkoutTracker } = await import('../js/analysis/tracker.js');
    const { PosePipeline } = await import('../js/skeleton/pipeline.js');
    const { demoLandmarks } = await import('./helpers.mjs');
    for (const id of ['squat', 'pushup', 'lunge']) {
        const pipeline = new PosePipeline();
        const tracker = new WorkoutTracker(id);
        let t = 0;
        const step = d => tracker.update(pipeline.process(demoLandmarks(id, d), t += 33, 640, 480), t);
        for (let i = 0; i < 30; i++) step(0);
        for (const depth of [1, 0.6]) {
            for (let i = 0; i <= 39; i++) step(depth * (i / 39) ** 2 * (3 - 2 * i / 39));
            for (let i = 0; i < 12; i++) step(depth);
            for (let i = 39; i >= 0; i--) step(depth * (i / 39) ** 2 * (3 - 2 * i / 39));
            for (let i = 0; i < 20; i++) step(0);
        }
        const [full, half] = tracker.items.map(r => r.similarity);
        assert.equal(tracker.items.length, 2, id);
        assert.ok(full >= 90, id + ' 標準 ' + full);
        assert.ok(half < full - 10, id + ' 一半 ' + half);
        assert.equal(tracker.items[0].samples, undefined, '曲線算完就不留');
    }
});
