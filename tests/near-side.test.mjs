// 用 YOLO 時挑靠近鏡頭的那一側（11/22）：側面拍時離鏡頭遠的那一側被身體擋住，點是模型猜的。
// MediaPipe 被擋住的點可信度比較低，照可信度挑（clearerSide）；YOLO 兩側都很有把握，照可信度挑會一直停在預設的左側，
// 所以改看頭朝哪邊（js/skeleton/pipeline.js 的 nearByFacing、landmarks.js 的 poseSide）。MediaPipe 的算法不變
//   這裡用合成的深蹲（人面向畫面右邊，MediaPipe 的格式：右側可信度比較高）換成「像 YOLO」的點：
//   取 COCO 的 17 點、兩側的可信度都一樣高，用網站換 YOLO 點的 cocoToLandmarks 換回 33 點
import test from 'node:test';
import assert from 'node:assert/strict';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { P, poseSide, clearerSide } from '../js/skeleton/landmarks.js';
import { headFacing } from '../js/analysis/view.js';
import { clearerAngle } from '../js/analysis/reps.js';
import { defaultJoint } from '../js/analysis/protractor.js';
import { seesOcclusion, MODEL_KEYS, profileOf } from '../js/ai/models.js';
import { cocoToLandmarks, COCO_NAMES } from '../js/ai/keypoints.js';
import { parseRecording, analyzeRecording } from '../js/data/replay-core.js';
import { makeDemoRecording } from '../js/data/synth.js';
import { demoFrames } from './helpers.mjs';

const W = 640, H = 480;
// 像 YOLO：COCO 的 17 點，每一點的可信度都是 0.9（被擋住的那一側也一樣）
const yoloLike = raw => cocoToLandmarks(COCO_NAMES.map(name => [raw[P[name]].x, raw[P[name]].y, 0.9]));

test('能力表：MediaPipe 被擋住的點可信度會變低，YOLO 不會；不認得的名字當作 MediaPipe', () => {
    assert.deepEqual(MODEL_KEYS.filter(k => !seesOcclusion(k)), ['yolo-n', 'yolo-s']);
    for (const k of MODEL_KEYS) assert.equal(seesOcclusion(k), profileOf(k).family === 'mediapipe', k);
    for (const k of ['', 'constructor', '__proto__', null, 'yolo']) assert.equal(seesOcclusion(k), true);
});

test('頭朝哪邊：鼻子在耳朵右邊是正的（面向右）；鏡像過來是負的；看不到耳朵、肩膀時 null', () => {
    const raw = demoFrames({ yaw: 8 })[0].raw;
    assert.ok(headFacing(raw, W, H) > 0.08, String(headFacing(raw, W, H)));
    const mirrored = raw.map(p => ({ ...p, x: 1 - p.x }));
    assert.ok(headFacing(mirrored, W, H) < -0.08);
    const noEars = raw.map((p, i) => (i === P.LEFT_EAR || i === P.RIGHT_EAR ? { ...p, visibility: 0 } : p));
    assert.equal(headFacing(noEars, W, H), null);
    const noShoulder = raw.map((p, i) => (i === P.LEFT_SHOULDER ? { ...p, visibility: 0 } : p));
    assert.equal(headFacing(noShoulder, W, H), null);
});

// 剛開始的幾格（擋鬼點還在確認臉上的點）看不出頭朝哪邊：near 是 null，照可信度挑；最多幾格
const WARMUP = 5;

test('整條流程：MediaPipe（沒開 nearByFacing）照可信度、沒有 near；像 YOLO 的點照可信度會挑到被擋住的左側，開了 nearByFacing 挑右側', () => {
    const frames = demoFrames({ yaw: 8 });
    const run = (convert, nearByFacing) => {
        const pipeline = new PosePipeline();
        pipeline.nearByFacing = nearByFacing;
        const nears = [], sides = [];
        let side = 'LEFT';
        for (const f of frames) {
            const r = pipeline.process(f.raw && convert(f.raw), f.t, W, H);
            if (!r) continue;
            nears.push(r.near);
            side = poseSide(r, side);
            sides.push(side);
        }
        return { nears, sides };
    };
    // MediaPipe：和以前一樣（near 一直是 null，照可信度挑，靠近鏡頭的右側）
    const mp = run(raw => raw, false);
    assert.ok(mp.nears.every(n => n === null));
    assert.ok(mp.sides.length > 400 && mp.sides.every(s => s === 'RIGHT'));
    // 像 YOLO、照可信度：兩側一樣清楚，一直停在預設的左側（被擋住的那一側）：這就是 11/22 修的問題
    const before = run(yoloLike, false);
    assert.ok(before.sides.every(s => s === 'LEFT'));
    // 像 YOLO、看頭朝哪邊：剛開始幾格看不出來（照可信度），之後每一格都用右側（和 MediaPipe 一樣）
    const after = run(yoloLike, true);
    const k = after.nears.indexOf('RIGHT');
    assert.ok(k >= 0 && k <= WARMUP, '第幾格看得出頭朝哪邊：' + k);
    assert.ok(after.nears.slice(k).every(n => n === 'RIGHT') && after.nears.slice(0, k).every(n => n === null));
    assert.ok(after.sides.slice(k).every(s => s === 'RIGHT'));
    assert.equal(after.sides.length, mp.sides.length);
});

test('near：看不出頭朝哪邊時沿用上一次的；重新開始時清掉；關掉 nearByFacing 就沒有', () => {
    const frames = demoFrames({ yaw: 8 });
    const pipeline = new PosePipeline();
    pipeline.nearByFacing = true;
    let i = 0, r = null;
    for (; i <= WARMUP && !(r && r.near); i++) r = pipeline.process(yoloLike(frames[i].raw), frames[i].t, W, H);
    assert.equal(r.near, 'RIGHT');
    // 這一格看不到耳朵（頭朝哪邊看不出來）：沿用右側
    const noEars = yoloLike(frames[i].raw).map((p, j) => (j === P.LEFT_EAR || j === P.RIGHT_EAR ? { ...p, visibility: 0 } : p));
    assert.equal(pipeline.process(noEars, frames[i].t, W, H).near, 'RIGHT');
    pipeline.reset();
    assert.equal(pipeline.near, null);
    pipeline.nearByFacing = false;
    assert.equal(pipeline.process(yoloLike(frames[i + 1].raw), frames[i + 1].t, W, H).near, null);
});

test('poseSide、計次的角度、量角器的預設關節：有 near 就用它，沒有照可信度', () => {
    const landmarks = yoloLike(demoFrames({ yaw: 8 })[0].raw);
    const angles = { LEFT_KNEE: 100, RIGHT_KNEE: 80 };
    assert.equal(poseSide({ landmarks, near: 'RIGHT' }), 'RIGHT');
    assert.equal(poseSide({ landmarks, near: null }), clearerSide(landmarks));
    assert.equal(poseSide({ landmarks, near: 'constructor' }), clearerSide(landmarks), '不認得的值當作沒有');
    const counter = { side: 'LEFT' };
    assert.equal(clearerAngle({ landmarks, angles, near: 'RIGHT' }, counter, 'KNEE'), 80);
    assert.equal(counter.side, 'RIGHT');
    assert.equal(clearerAngle({ landmarks, angles, near: null }, { side: 'LEFT' }, 'KNEE'), 100, '兩側一樣清楚時停在原本的左側');
    assert.equal(defaultJoint(landmarks, 'RIGHT'), 'RIGHT_KNEE');
    assert.equal(defaultJoint(landmarks), clearerSide(landmarks) + '_KNEE');
    assert.equal(defaultJoint(null, null), 'LEFT_KNEE');
});

test('重播分析：錄製檔記的是 YOLO（meta.model）就看頭朝哪邊；每一下最低的角度和 MediaPipe 的一樣（同一側）', async () => {
    const rec = makeDemoRecording({ yaw: 8 });
    const text = model => JSON.stringify({
        ...rec, meta: { ...rec.meta, model },
        frames: rec.frames.map(f => ({ ...f, landmarks: f.landmarks && (model === 'yolo26n-pose'
            ? yoloLike(f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility }))).map(p => [p.x, p.y, p.z, p.visibility])
            : f.landmarks), world: model === 'yolo26n-pose' ? null : f.world }))
    });
    const mp = await analyzeRecording(parseRecording(text('pose_landmarker_lite')), W, H, { workout: 'squat' });
    const yolo = await analyzeRecording(parseRecording(text('yolo26n-pose')), W, H, { workout: 'squat' });
    // 同一個錄製檔、記的模型名字改掉（被改過的、不認得的）：當作 MediaPipe，照可信度（一直停在左側）
    const unknown = await analyzeRecording(parseRecording(text('yolo26n-pose').replace('"yolo26n-pose"', '"constructor"')), W, H, { workout: 'squat' });
    assert.ok(mp.reps.length >= 3);
    assert.equal(yolo.reps.length, mp.reps.length);
    yolo.reps.forEach((r, i) => assert.ok(Math.abs(r.min - mp.reps[i].min) < 1, '第 ' + (i + 1) + ' 下：YOLO ' + r.min + '、MediaPipe ' + mp.reps[i].min));
    assert.equal(unknown.reps.length, mp.reps.length);
});
