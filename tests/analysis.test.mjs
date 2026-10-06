// 動作判斷（js/analysis/）：關節角度、深蹲次數與深度、入鏡提示
import test from 'node:test';
import assert from 'node:assert/strict';
import { angleAt, computeAngles } from '../js/analysis/angles.js';
import { depthOf } from '../js/analysis/squat.js';
import { framingAdvice } from '../js/analysis/framing.js';
import { P } from '../js/skeleton/landmarks.js';
import { parseRecording, analyzeRecording } from '../js/data/replay-core.js';
import { makeDemoRecording } from './helpers.mjs';

test('角度：直角 90°、伸直 180°、三點重疊時沒有角度', () => {
    const p = (x, y) => ({ x, y, z: 0 });
    assert.equal(Math.round(angleAt(p(0, 1), p(0, 0), p(1, 0))), 90);
    assert.equal(Math.round(angleAt(p(0, 1), p(0, 0), p(0, -1))), 180);
    assert.equal(angleAt(p(0, 0), p(0, 0), p(1, 0)), null);
});

test('深度判斷：≤ 90° 蹲到位、90～110° 再低一點、> 110° 太淺', () => {
    assert.equal(depthOf(85), 'good');
    assert.equal(depthOf(100), 'close');
    assert.equal(depthOf(125), 'shallow');
});

const analyze = async options => {
    const rec = makeDemoRecording(options);
    return analyzeRecording(parseRecording(JSON.stringify(rec)), rec.meta.videoWidth, rec.meta.videoHeight, { lab: true });
};

test('深蹲：側面拍 5 下全部算到，最低膝蓋角度誤差 5° 以內', async () => {
    const depths = [95, 85, 125, 80, 92];
    const r = await analyze({ yaw: 5, depths });
    assert.equal(r.reps.length, 5);
    r.reps.forEach((rep, i) => assert.ok(Math.abs(rep.minKnee - depths[i]) <= 5, `第 ${i + 1} 下：${rep.minKnee.toFixed(1)}° vs ${depths[i]}°`));
});

test('深蹲：正面拍不計算（角度不準）', async () => {
    const r = await analyze({ yaw: 85 });
    assert.equal(r.reps.length, 0);
});

test('深蹲：只是小幅晃動不會誤算', async () => {
    const r = await analyze({ yaw: 5, depths: [150, 148, 152] });
    assert.equal(r.reps.length, 0);
});

// 手機放得比較高、往下拍：越下面的部位在畫面上縮得越多（第一次真實錄影：站直時小腿只有軀幹的 0.37 倍）
// 用合成的正面站姿，把髖部以下往髖部壓扁成 45%，模仿這種畫面
test('肢體太短：手機放高往下拍時，站直的膝蓋仍然有角度', () => {
    const frame = makeDemoRecording({ yaw: 85, depths: [], lead: 1 }).frames[10];
    const hipY = (frame.landmarks[23][1] + frame.landmarks[24][1]) / 2;
    const l = frame.landmarks.map(([x, y, z, visibility], i) => ({ x, y: i >= 25 ? hipY + (y - hipY) * 0.45 : y, z, visibility }));
    const a = computeAngles(l, 640, 480);
    assert.ok(a.LEFT_KNEE !== null && a.LEFT_KNEE > 165, '左膝 ' + a.LEFT_KNEE);
    assert.ok(a.RIGHT_KNEE !== null && a.RIGHT_KNEE > 165, '右膝 ' + a.RIGHT_KNEE);
});

test('肢體太短：大腿朝著鏡頭（畫面上只剩 3 成長）時不給膝蓋角度（給了會錯很多）', () => {
    const frame = makeDemoRecording({ yaw: 85, depths: [], lead: 1 }).frames[10];
    const l = frame.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));
    // 左腿：膝蓋往髖部縮到 3 成，小腿、腳跟著平移（小腿長度不變）
    const hip = l[23], knee = l[25];
    const dx = (hip.x - knee.x) * 0.7, dy = (hip.y - knee.y) * 0.7;
    for (const i of [25, 27, 29, 31]) { l[i].x += dx; l[i].y += dy; }
    const a = computeAngles(l, 640, 480);
    assert.equal(a.LEFT_KNEE, null);
    assert.ok(a.RIGHT_KNEE !== null, '另一腳照常給角度');
});

test('深蹲：側面蹲到底、起身時轉成正面，站直了也算這一下', async () => {
    const { SquatCounter } = await import('../js/analysis/squat.js');
    const counter = new SquatCounter();
    const pose = (knee, view) => ({ angles: { LEFT_KNEE: knee, RIGHT_KNEE: knee, LEFT_HIP: knee, RIGHT_HIP: knee }, landmarks: Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 })), view: { view } });
    let t = 0;
    const run = (knee, view, ms) => { for (let e = 0; e < ms; e += 33) counter.update(pose(knee, view), t += 33); };
    run(175, 'side', 500);          // 側面站直
    run(80, 'side', 800);           // 側面蹲到底
    run(120, 'front', 400);         // 起身時轉成正面
    run(175, 'front', 500);         // 正面站直
    assert.equal(counter.reps.length, 1);
    assert.equal(Math.round(counter.reps[0].minKnee), 80, '最低角度用側面量到的');
    run(80, 'front', 1500);         // 一直正面蹲：不算
    run(175, 'front', 500);
    assert.equal(counter.reps.length, 1);
});

// 入鏡提示用的側面骨架：靠鏡頭的左側看得到，右側被身體擋住（可信度低，位置和左側差不多）
function sidePose(points) {
    const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.3 }));
    for (const [k, [x, y, v = 0.95]] of Object.entries(points)) {
        lm[P['LEFT_' + k] ?? P[k]] = { x, y, z: 0, visibility: v };
        if (P['RIGHT_' + k] !== undefined) lm[P['RIGHT_' + k]] = { x: x + 0.01, y, z: 0, visibility: 0.3 };
    }
    return lm;
}
const STAND = { NOSE: [0.5, 0.15], SHOULDER: [0.5, 0.25], HIP: [0.5, 0.5], KNEE: [0.5, 0.7], ANKLE: [0.5, 0.9] };

test('入鏡提示：側面站好時「已偵測到全身」；腳真的出了畫面才叫人往後退', () => {
    assert.equal(framingAdvice(sidePose(STAND)).text, '已偵測到全身');
    // 走太近：膝蓋、腳踝估計在畫面下緣外
    const close = sidePose({ ...STAND, HIP: [0.5, 0.75], KNEE: [0.5, 0.98, 0.4], ANKLE: [0.5, 1.15, 0.2] });
    assert.equal(framingAdvice(close).text, '看不到腳，請再往後退一點');
});

test('入鏡提示：蹲低時腳被擋住（位置還在畫面裡）不叫人往後退', () => {
    // 真實錄影：蹲低、腳踝被擋住，AI 估計的腳踝在畫面 0.65 的高度
    const low = sidePose({ NOSE: [0.45, 0.4], SHOULDER: [0.48, 0.45], HIP: [0.42, 0.6], KNEE: [0.55, 0.66, 0.4], ANKLE: [0.5, 0.67, 0.3] });
    assert.equal(framingAdvice(low).text, '看不到腳，可能被擋住了');
});

test('入鏡提示：蹲到底時人沒有變小，不提示「離太遠」；真的站很遠才提示', () => {
    // 站著時頭到腳 0.32（不算遠）的人蹲到底：頭到腳只剩約 0.2
    const squat = sidePose({ NOSE: [0.52, 0.52], SHOULDER: [0.51, 0.55], HIP: [0.44, 0.64], KNEE: [0.54, 0.65], ANKLE: [0.5, 0.72] });
    assert.notEqual(framingAdvice(squat).text, '離太遠了，可以往前一點');
    // 站很遠：頭到腳 0.2
    const far = sidePose({ NOSE: [0.5, 0.4], SHOULDER: [0.5, 0.43], HIP: [0.5, 0.5], KNEE: [0.5, 0.55], ANKLE: [0.5, 0.6] });
    assert.equal(framingAdvice(far).text, '離太遠了，可以往前一點');
});
