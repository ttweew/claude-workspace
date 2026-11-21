// 兩個模型的校正（tools/calibrate-models.mjs，11/21）：照角度分段算差幾度、門檻換成 B 要幾度、資料不夠不建議、看不看得到
import test from 'node:test';
import assert from 'node:assert/strict';
import { BIN, thresholdsOf, offsetBins, suggest, visibilityGap, report, calibrate } from '../tools/calibrate-models.mjs';
import { ANGLE_KEYS } from '../js/data/replay-core.js';
import { SQUAT_CONFIG } from '../js/analysis/squat.js';
import { P } from '../js/skeleton/landmarks.js';
import { demoLandmarks } from './helpers.mjs';

const A = ANGLE_KEYS.length;
// 假的重播結果：膝蓋角度 a(i)；B 用 b(i)
function fake(n, knee) {
    const r = { n, present: new Uint8Array(n).fill(1), angles: new Float32Array(n * A).fill(NaN), reps: [] };
    for (let i = 0; i < n; i++) {
        r.angles[i * A + ANGLE_KEYS.indexOf('LEFT_KNEE')] = knee(i);
        r.angles[i * A + ANGLE_KEYS.indexOf('RIGHT_KNEE')] = knee(i);
    }
    return r;
}

test('每個動作的門檻：深蹲看膝蓋（和網站的設定一樣），棒式兩個，自由模式沒有', () => {
    const [squat] = thresholdsOf('squat');
    assert.equal(squat.joint, 'KNEE');
    assert.deepEqual(squat.list.map(x => x[1]), [SQUAT_CONFIG.up, SQUAT_CONFIG.down, SQUAT_CONFIG.good, SQUAT_CONFIG.close]);
    assert.equal(thresholdsOf('pushup')[0].joint, 'ELBOW');
    assert.deepEqual(thresholdsOf('plank').map(t => t.joint), ['HIP', 'KNEE']);
    assert.deepEqual(thresholdsOf('free'), []);
    assert.deepEqual(thresholdsOf('constructor'), []);
});

test('照 A 的角度每 15° 一段算 B 多幾度：彎的時候差得多、直的時候差得少，分得出來', () => {
    // A 從 60° 到 179°；B 在 A 小於 120° 時多 12°，其他多 2°
    const n = 120;
    const a = fake(n, i => 60 + i);
    const b = fake(n, i => (60 + i < 120 ? 60 + i + 12 : 60 + i + 2));
    const bins = offsetBins(a, b, 'KNEE');
    assert.equal(bins[0].from, 60);
    assert.equal(bins[0].to, 60 + BIN);
    assert.equal(bins[0].frames, 30, '15 格 × 左右兩邊');
    assert.equal(bins[0].mean, 12);
    assert.equal(bins.find(x => x.from === 150).mean, 2);
    // 門檻：90°（到位）在 90～105 那一段 → 102°；160°（伸直）→ 162°
    assert.deepEqual(suggest(90, bins), { value: 102, offset: 12, frames: 30 });
    assert.equal(suggest(160, bins).value, 162);
    // 那一段沒有資料、或格子太少：不建議
    assert.equal(suggest(30, bins), null);
    assert.equal(suggest(90, [{ from: 90, to: 105, frames: 3, mean: 9 }]), null);
    // 有一邊沒有人、角度算不出來的格子不算
    const c = fake(n, i => 60 + i);
    c.present.fill(0);
    assert.deepEqual(offsetBins(a, c, 'KNEE'), []);
});

test('看不看得到：B 說看得到但 A 說看不到的比例（YOLO 對被擋住的那一側也很有把握）', () => {
    const lm = demoLandmarks('squat', 0);
    const hidden = lm.map((p, i) => (i === P.RIGHT_KNEE ? { ...p, visibility: 0.3 } : p));
    const frames = (list, n) => ({ frames: Array.from({ length: n }, (_, i) => ({ t: i * 33, raw: list })) });
    const v = visibilityGap(frames(hidden, 10), frames(lm, 10));
    assert.equal(v.RIGHT_KNEE.onlyB, 100);
    assert.equal(v.LEFT_KNEE.onlyB, 0);
    assert.equal(v.RIGHT_KNEE.a, 0.3);
    // 一邊沒有人的格子不算
    const none = { frames: Array.from({ length: 10 }, () => ({ t: 0, raw: null })) };
    assert.equal(visibilityGap(none, frames(lm, 10)).LEFT_KNEE, null);
});

test('整份報告：從兩份錄製檔算到建議（同一串骨架：差 0，門檻不用改）', async () => {
    const frames = [];
    for (let k = 0; k < 4; k++) {
        for (let i = 0; i <= 60; i++) frames.push(demoLandmarks('squat', i <= 30 ? i / 30 : (60 - i) / 30));
        for (let i = 0; i < 30; i++) frames.push(demoLandmarks('squat', 0));
    }
    const text = model => JSON.stringify({
        format: 'ai-sport-pose', version: 1, meta: { model, workout: 'squat', videoWidth: 640, videoHeight: 480, source: 'compare' },
        fields: { landmarks: ['x', 'y', 'z', 'visibility'] },
        frames: frames.map((lm, i) => ({ t: i * 1000 / 30, landmarks: lm.map(p => [p.x, p.y, p.z, p.visibility]) }))
    });
    const r = await calibrate(text('pose_landmarker_full'), text('yolo26n-pose'));
    assert.equal(r.modelA, 'full');
    assert.equal(r.modelB, 'YOLO26n');
    assert.equal(r.reps.a, 4);
    assert.equal(r.reps.b, 4);
    for (const bin of r.bins.KNEE) assert.equal(bin.mean, 0);
    const lines = report(r);
    assert.match(lines, /A full、B YOLO26n，動作 squat/);
    assert.match(lines, /只是建議/);
    for (const s of r.suggestions[0].list) if (s.suggest) assert.equal(s.suggest.value, s.value, s.name);
    await assert.rejects(calibrate(text('a'), text('b'), 'free'), /要指定動作/);
});
