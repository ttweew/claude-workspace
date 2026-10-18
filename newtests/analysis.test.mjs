// 動作判斷（js/analysis/）：關節角度、深蹲次數與深度
import test from 'node:test';
import assert from 'node:assert/strict';
import { angleAt } from '../js/analysis/angles.js';
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
