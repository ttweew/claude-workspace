// 動作流暢度（js/analysis/fluency.js，10/29）：每一下中途卡住幾次、整組的節奏穩不穩
import test from 'node:test';
import assert from 'node:assert/strict';
import { repStalls, fluencyOf, fluencyLine, FLUENCY } from '../js/analysis/fluency.js';
import { repSeries } from '../js/analysis/rep-series.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';

// 一下深蹲的膝蓋角度曲線（每秒 30 格）：168° 站直 → 85° → 168°，下去、起來各 sec 秒（平滑的加減速）
// stall：{ at（下去途中第幾度停住）, ms（停多久） }；jitter：每格加減幾度的雜訊（固定的亂數，每次一樣）
function curve({ sec = 1, stall = null, up = null, jitter = 0, top = 168, low = 85 } = {}) {
    const out = [];
    let t = 0, seed = 7;
    const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 2 * jitter; };
    const push = v => { out.push({ t, v: v + noise() }); t += 1000 / 30; };
    const phase = (from, to, s, pause) => {
        const n = Math.round(s * 30);
        for (let i = 0; i <= n; i++) {
            const v = from + (to - from) * (1 - Math.cos(Math.PI * i / n)) / 2;
            push(v);
            if (pause && Math.abs(v - pause.at) < Math.abs(to - from) / n / 2 + 0.01) for (let k = 0; k < pause.ms / (1000 / 30); k++) push(v);
        }
    };
    phase(top, low, sec, stall);
    phase(low, top, sec, up);
    return out;
}

test('平滑的一下：0 次；有雜訊（每格 ±1°）也是 0 次', () => {
    assert.equal(repStalls('squat', curve()), 0);
    assert.equal(repStalls('squat', curve({ jitter: 1 })), 0);
    assert.equal(repStalls('pushup', curve({ top: 165, low: 80 })), 0);
});

test('下去途中停 0.3 秒算卡一下、0.15 秒不算；起來途中停也算；最低附近停（轉向）不算', () => {
    assert.equal(repStalls('squat', curve({ stall: { at: 126.5, ms: 300 } })), 1);
    assert.equal(repStalls('squat', curve({ stall: { at: 126.5, ms: 150 } })), 0);
    assert.equal(repStalls('squat', curve({ stall: { at: 126.5, ms: 300 }, up: { at: 126.5, ms: 400 } })), 2);
    // 最低的 15% 角度範圍（85～97°）裡停：本來就會慢下來轉向
    assert.equal(repStalls('squat', curve({ stall: { at: 90, ms: 600 } })), 0);
});

test('弓箭步、棒式、自由模式不看卡一下；曲線太短、太淺回傳 null', () => {
    assert.equal(repStalls('lunge', curve({ stall: { at: 126.5, ms: 300 } })), null);
    assert.equal(repStalls('plank', curve()), null);
    assert.equal(repStalls('free', curve()), null);
    assert.equal(repStalls('squat', curve().slice(0, 4)), null);
    assert.equal(repStalls('squat', curve({ top: 168, low: 155 })), null);
    assert.equal(repStalls('squat', null), null);
});

// 一組：每一下 [秒數, 卡住幾次]
const set = list => list.map(([sec, stalls], i) => ({ min: 85, depth: 'good', start: i * 4, end: i * 4 + sec, errors: [], stalls }));

test('節奏：每一下和平均（總結的「每下約幾秒」）差不到 2 成的有 8 成以上算穩；不到 5 下不看', () => {
    const steady = fluencyOf(repSeries('squat', set([[1.4, 0], [1.5, 0], [1.4, 0], [1.3, 0], [1.4, 0], [2.3, 0]])));
    assert.deepEqual(steady.rhythm, { count: 6, within: 5, average: 1.6, steady: true });
    // 平均就是總結寫的「每下約幾秒」（同一個數字）
    assert.equal(steady.rhythm.average, repSeries('squat', set([[1.4, 0], [1.5, 0], [1.4, 0], [1.3, 0], [1.4, 0], [2.3, 0]])).tempo);
    // 10/20 A 弓箭步做對那組的秒數：中間 3 下慢下來，4／10 → 忽快忽慢
    const uneven = fluencyOf(repSeries('lunge', set([1.5, 1.4, 1.9, 1.4, 1.6, 2.3, 2.7, 2.8, 1.6, 1.8].map(s => [s, null]))));
    assert.deepEqual(uneven.rhythm, { count: 10, within: 4, average: 1.9, steady: false });
    assert.equal(uneven.stalls, null, '弓箭步不看卡一下');
    assert.equal(fluencyOf(repSeries('squat', set([[1.4, 0], [1.5, 0], [1.4, 0], [1.3, 0]]))).rhythm, null);
    // 中途停住超過 10 秒的那一下不算進節奏（和「每下約幾秒」一樣）
    assert.equal(fluencyOf(repSeries('squat', set([[1.4, 0], [1.4, 0], [1.4, 0], [1.4, 0], [1.4, 0], [40, 0]]))).rhythm.count, 5);
});

test('總結的那一句：節奏、卡住的是第幾下', () => {
    const f = fluencyOf(repSeries('squat', set([[1.4, 0], [1.5, 1], [1.4, 0], [1.3, 0], [1.4, 2]])));
    assert.deepEqual(f.stalls, { judged: 5, list: [2, 5] });
    assert.equal(fluencyLine(f), '動作流暢度：節奏穩（5 下有 5 下和平均的 1.4 秒差不到 2 成）；2 下中途卡了一下（第 2 下、第 5 下）');
    assert.equal(fluencyLine(fluencyOf(repSeries('squat', set([[1.4, 0], [1.5, 0]])))), '動作流暢度：做 5 下以上才看節奏；每一下都很順，沒有卡住');
    assert.equal(fluencyOf(repSeries('plank', [{ seconds: 30, errors: [] }])), null);
    assert.equal(fluencyLine(null), '');
});

test('被改過的資料：卡住次數不是 0～99 的整數就不算', () => {
    const s = repSeries('squat', [...set([[1.4, 0], [1.4, 1]]), { min: 85, start: 9, end: 10, stalls: 'x' }, { min: 85, start: 11, end: 12, stalls: -1 }, { min: 85, start: 13, end: 14, stalls: 2.5 }]);
    assert.deepEqual(s.reps.map(r => r.stalls), [0, 1, null, null, null]);
    assert.deepEqual(fluencyOf(s).stalls, { judged: 2, list: [2] });
});

test('計次時就算好：WorkoutTracker 完成一下時記上卡住幾次（曲線算完就不留）', () => {
    const tracker = new WorkoutTracker('squat');
    const item = { samples: curve({ stall: { at: 126.5, ms: 300 } }) };
    tracker.attach(item);
    assert.equal(item.stalls, 1);
    assert.equal(item.samples, undefined);
    assert.ok(FLUENCY.STALL_WORKOUTS.includes('squat'));
});
