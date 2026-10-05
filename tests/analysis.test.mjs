// 動作判斷（js/analysis/）：關節角度、深蹲次數與深度
import test from 'node:test';
import assert from 'node:assert/strict';
import { angleAt, computeAngles } from '../js/analysis/angles.js';
import { depthOf } from '../js/analysis/squat.js';
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
