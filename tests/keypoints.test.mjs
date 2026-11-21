// 別家模型的 17 點換成網站的 33 點（js/ai/keypoints.js，11/21 YOLO）：位置、看不看得到、壞掉的資料
import test from 'node:test';
import assert from 'node:assert/strict';
import { COCO_NAMES, SCORE_SEEN, scoreToVisibility, cocoToLandmarks } from '../js/ai/keypoints.js';
import { P, MIN_VISIBILITY, isVisible } from '../js/skeleton/landmarks.js';

// 17 個點：第 i 個放在 (i/100, i/50)，可信度都是 0.9
const points = COCO_NAMES.map((name, i) => [i / 100, i / 50, 0.9]);

test('17 點的名字都是網站 33 點裡有的', () => {
    assert.equal(COCO_NAMES.length, 17);
    for (const name of COCO_NAMES) assert.ok(Object.prototype.hasOwnProperty.call(P, name), name);
});

test('可信度換成 visibility：「看得到」的界線對齊（YOLO 0.3 ↔ MediaPipe 0.65），越大越大', () => {
    assert.equal(scoreToVisibility(0), 0);
    assert.equal(scoreToVisibility(1), 1);
    assert.ok(Math.abs(scoreToVisibility(SCORE_SEEN) - MIN_VISIBILITY) < 1e-9);
    assert.ok(scoreToVisibility(SCORE_SEEN - 0.01) < MIN_VISIBILITY);
    assert.ok(scoreToVisibility(SCORE_SEEN + 0.01) > MIN_VISIBILITY);
    let prev = -1;
    for (let s = 0; s <= 1; s += 0.05) {
        const v = scoreToVisibility(s);
        assert.ok(v > prev, String(s));
        prev = v;
    }
    // 壞掉的數字：當作看不到；超出 0～1 的夾回來
    for (const bad of [NaN, null, undefined, 'x', Infinity, -Infinity]) assert.equal(scoreToVisibility(bad), 0, String(bad));
    assert.equal(scoreToVisibility(-3), 0);
    assert.equal(scoreToVisibility(7), 1);
});

test('有的點原樣放到 33 點的同一個名字；沒有的點放在附近、看不到', () => {
    const lm = cocoToLandmarks(points);
    assert.equal(lm.length, 33);
    COCO_NAMES.forEach((name, i) => {
        const p = lm[P[name]];
        assert.equal(p.x, i / 100, name);
        assert.equal(p.y, i / 50, name);
        assert.equal(p.z, 0, name);
        assert.ok(isVisible(p), name);
    });
    // 腳跟、腳尖放在腳踝；手指放在手腕；看不到
    for (const [name, near] of [['LEFT_HEEL', 'LEFT_ANKLE'], ['RIGHT_FOOT_INDEX', 'RIGHT_ANKLE'], ['LEFT_THUMB', 'LEFT_WRIST'], ['MOUTH_RIGHT', 'NOSE']]) {
        assert.equal(lm[P[name]].x, lm[P[near]].x, name);
        assert.equal(lm[P[name]].y, lm[P[near]].y, name);
        assert.equal(lm[P[name]].visibility, 0, name);
        assert.equal(isVisible(lm[P[name]]), false, name);
    }
    // 每一點都是獨立的物件（改一點不會改到別的點）
    lm[P.LEFT_HEEL].x = 99;
    assert.notEqual(lm[P.LEFT_ANKLE].x, 99);
});

test('不是 17 點、壞掉的點：不是 17 點回傳 null；座標不是數字的點標成看不到', () => {
    assert.equal(cocoToLandmarks(null), null);
    assert.equal(cocoToLandmarks('x'), null);
    assert.equal(cocoToLandmarks(points.slice(0, 16)), null);
    assert.equal(cocoToLandmarks([...points, [0, 0, 1]]), null);
    const broken = points.map(p => [...p]);
    broken[0] = [NaN, 0.5, 0.9];
    broken[5] = 'nope';
    broken[6] = [0.3, Infinity, 0.9];
    const lm = cocoToLandmarks(broken);
    for (const name of ['NOSE', 'LEFT_SHOULDER', 'RIGHT_SHOULDER']) {
        assert.equal(lm[P[name]].visibility, 0, name);
        assert.ok(Number.isFinite(lm[P[name]].x) && Number.isFinite(lm[P[name]].y), name);
    }
    assert.ok(isVisible(lm[P.LEFT_ELBOW]));
});

test('21 點（11/21，自己訓練、加腳跟腳尖的 YOLO）：後面 4 點是左右腳跟、左右腳尖，看得到', async () => {
    const { FEET_NAMES, KNOWN_KPTS } = await import('../js/ai/keypoints.js');
    assert.deepEqual(KNOWN_KPTS, [17, 21]);
    const p21 = [...points, [0.41, 0.9, 0.95], [0.61, 0.9, 0.95], [0.45, 0.93, 0.9], [0.65, 0.93, 0.2]];
    const lm = cocoToLandmarks(p21);
    assert.equal(lm.length, 33);
    FEET_NAMES.forEach((name, i) => {
        assert.equal(lm[P[name]].x, p21[17 + i][0], name);
        assert.equal(lm[P[name]].y, p21[17 + i][1], name);
    });
    assert.ok(isVisible(lm[P.LEFT_HEEL]) && isVisible(lm[P.RIGHT_HEEL]) && isVisible(lm[P.LEFT_FOOT_INDEX]));
    assert.equal(isVisible(lm[P.RIGHT_FOOT_INDEX]), false, '可信度 0.2：看不到');
    assert.equal(lm[P.LEFT_THUMB].visibility, 0, '手指還是沒有');
    for (const n of [18, 20, 22, 33]) assert.equal(cocoToLandmarks(p21.slice(0, n).concat(Array(Math.max(0, n - 21)).fill([0, 0, 1]))), null, n + ' 點');
});
