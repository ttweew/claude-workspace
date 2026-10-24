// 平衡與重心（js/analysis/balance.js，10/24）：重心在腳的哪裡、站著時前後晃動多少
import test from 'node:test';
import assert from 'node:assert/strict';
import { P } from '../js/skeleton/landmarks.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { centerOfMass, balanceOf, balanceText, BalanceMeter, MASS_TOTAL, BALANCE } from '../js/analysis/balance.js';
import { parseRecording, analyzeRecording, BALANCE_FIELDS } from '../js/data/replay-core.js';
import { demoLandmarks, makeDemoRecording } from './helpers.mjs';

const W = 640, H = 480;
// 上半身（臉、肩、手臂，0～22 號點）以髖部為中心往前倒 deg 度（示範的人面向右邊）；用像素轉，畫面不是正方形
function lean(lm, deg) {
    const a = deg * Math.PI / 180, hip = lm[P.LEFT_HIP];
    return lm.map((p, i) => {
        if (i > 22) return p;
        const x = (p.x - hip.x) * W, y = (p.y - hip.y) * H;
        return { ...p, x: hip.x + (x * Math.cos(a) - y * Math.sin(a)) / W, y: hip.y + (x * Math.sin(a) + y * Math.cos(a)) / H };
    });
}
const shift = (lm, dx) => lm.map(p => ({ ...p, x: p.x + dx }));
const mirror = lm => lm.map(p => ({ ...p, x: 1 - p.x }));
const hide = (lm, ...names) => lm.map((p, i) => (names.some(n => P[n] === i) ? { ...p, visibility: 0 } : p));
// 同一個姿勢連續 30 格（約 1 秒）：平滑、拍攝方向穩定下來
function settle(lm) {
    const pipeline = new PosePipeline();
    let pose = null;
    for (let i = 0; i < 30; i++) pose = pipeline.process(lm, i * 33, W, H);
    return pose;
}

test('各部位的重量比例加起來是 1（Winter 2009）', () => {
    assert.ok(Math.abs(MASS_TOTAL - 1) < 1e-9, String(MASS_TOTAL));
});

test('站直：重心在髖部附近的高度、腳跟和腳尖之間；整個人移動、鏡像（面向另一邊）結果一樣', () => {
    const lm = demoLandmarks('squat', 0);
    const b = balanceOf(settle(lm));
    assert.ok(b, '算得出來');
    assert.ok(b.heel < 0 && b.toe > 0, '腳跟在腳踝後面、腳尖在前面：' + JSON.stringify(b));
    assert.ok(b.offset > b.heel && b.offset < b.toe, '重心在腳上方：' + JSON.stringify(b));
    const hip = lm[P.LEFT_HIP], shoulder = lm[P.LEFT_SHOULDER], knee = lm[P.LEFT_KNEE];
    assert.ok(b.y > shoulder.y && b.y < (hip.y + knee.y) / 2, '高度在肩膀和大腿中間之間：' + b.y);
    for (const other of [shift(lm, 0.1), mirror(lm)]) {
        const o = balanceOf(settle(other));
        assert.ok(o && Math.abs(o.offset - b.offset) <= 0.2 && Math.abs(o.heel - b.heel) <= 0.2, JSON.stringify([b, o]));
    }
});

test('上身往前倒：重心往前移；蹲下去重心照樣算得出來', () => {
    const lm = demoLandmarks('squat', 0);
    const base = balanceOf(settle(lm)).offset;
    const tilted = balanceOf(settle(lean(lm, 20))).offset;
    assert.ok(tilted > base + 5, '往前倒 20°：' + base + ' → ' + tilted);
    const back = balanceOf(settle(lean(lm, -10))).offset;
    assert.ok(back < base, '往後仰：' + base + ' → ' + back);
    assert.ok(balanceOf(settle(demoLandmarks('squat', 1))), '蹲到底');
});

test('遠的那側手臂被擋住：用近的那側代替，結果差不多；正面拍、看不到腳踝、頭、手臂時不算', () => {
    const lm = demoLandmarks('squat', 0);
    const full = balanceOf(settle(lm)).offset;
    const near = balanceOf(settle(hide(lm, 'RIGHT_ELBOW', 'RIGHT_WRIST'))).offset;
    assert.ok(Math.abs(near - full) <= 1, full + ' vs ' + near);
    assert.equal(balanceOf(settle(demoLandmarks('squat', 0, { yaw: 1 }))), null, '正面拍');
    assert.equal(balanceOf(settle(hide(lm, 'LEFT_ANKLE', 'RIGHT_ANKLE'))), null, '看不到腳踝');
    assert.equal(centerOfMass(hide(lm, 'LEFT_EAR', 'RIGHT_EAR', 'NOSE')), null, '看不到頭');
    assert.equal(centerOfMass(hide(lm, 'LEFT_ELBOW', 'RIGHT_ELBOW')), null, '兩邊手肘都看不到');
    assert.equal(balanceOf(null), null);
    assert.equal(balanceOf({ ...settle(lm), view: { view: 'side', facing: 0 } }), null, '看不出面向');
});

test('前後晃動：站直不動 3 秒約 0；前後晃 ±3°（約 2 秒一次）看得出來；蹲下、沒有人、還沒站滿 2.5 秒不算', () => {
    const lm = demoLandmarks('squat', 0);
    const run = (frames, edit) => {
        const pipeline = new PosePipeline(), meter = new BalanceMeter();
        const out = [];
        for (let i = 0; i < frames; i++) {
            const t = i * 33;
            const pose = pipeline.process(edit(t), t, W, H);
            out.push(meter.update(pose, t));
        }
        return out;
    };
    const still = run(120, () => lm);
    assert.equal(still[60].sway, null, '站了 2 秒還不算');
    assert.ok(still[119].sway !== null && still[119].sway <= 0.2, '站直不動：' + still[119].sway);
    const sway = run(150, t => lean(lm, 3 * Math.sin(t / 1000 * Math.PI)));
    assert.ok(sway[149].sway >= 1, '前後晃：' + sway[149].sway);
    // 中間蹲下去一下：晃動重新量
    const squat = run(150, t => (t > 3000 && t < 3500 ? demoLandmarks('squat', 0.6) : lm));
    assert.equal(squat[110].sway, null, '剛蹲完站起來不算');
    assert.ok(squat[110].offset !== null, '重心照樣有');
    const gone = run(150, t => (t > 3000 && t < 3100 ? null : lm));
    assert.equal(gone[92], null, '沒有人');
    assert.equal(gone[110].sway, null, '人回來重新量');
    assert.equal(BALANCE.standKnee, 160);
});

test('給人看的位置：腳跟上方、腳掌上方、腳尖前面、腳跟後面；看不到腳跟腳尖時只說腳踝前後', () => {
    const b = { heel: -10, toe: 35 };
    assert.equal(balanceText({ ...b, offset: 8 }), '重心在腳掌上方（比腳踝前 8.0%，小腿長 100%）');
    assert.equal(balanceText({ ...b, offset: -4.5 }), '重心在腳跟上方（比腳踝後 4.5%，小腿長 100%）');
    assert.equal(balanceText({ ...b, offset: 40 }), '重心在腳尖前面（比腳踝前 40.0%，小腿長 100%）');
    assert.equal(balanceText({ ...b, offset: -12 }), '重心在腳跟後面（比腳踝後 12.0%，小腿長 100%）');
    assert.equal(balanceText({ heel: null, toe: null, offset: 3 }), '重心在腳踝前面（比腳踝前 3.0%，小腿長 100%）');
});

test('重播分析：自由模式、深蹲每一格都有重心，伏地挺身、棒式、弓箭步不算（和鏡頭畫面一樣）', async () => {
    const demo = makeDemoRecording();
    const rec = parseRecording(JSON.stringify(demo));
    const B = BALANCE_FIELDS.length, off = BALANCE_FIELDS.indexOf('offset');
    const count = r => { let n = 0; for (let i = 0; i < r.n; i++) if (!Number.isNaN(r.balance[i * B + off])) n++; return n; };
    for (const workout of [null, 'squat']) {
        const r = await analyzeRecording(rec, 640, 480, { workout });
        assert.ok(count(r) > r.n * 0.5, workout + '：' + count(r) + '／' + r.n);
    }
    for (const workout of ['pushup', 'plank', 'lunge']) {
        const r = await analyzeRecording(rec, 640, 480, { workout });
        assert.equal(count(r), 0, workout);
    }
});
