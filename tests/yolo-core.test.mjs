// YOLO 的前處理和讀輸出（js/ai/yolo-core.js，11/21）：補灰邊的數字、先框出人、模型輸出換回畫面上的位置；
// 畫面裡有好幾個人時跟著誰（11/22）：每一個人都讀出來、跟著同一個人、一開始挑最大的、點哪個人就跟哪個人
import test from 'node:test';
import assert from 'node:assert/strict';
import { INPUT_SIZE, COLS, PERSON_SCORE, SAME_IOU, letterbox, regionFor, regionAround, toInput, decodeBest, decodeAll, iou, pickPerson } from '../js/ai/yolo-core.js';

const S = INPUT_SIZE;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('等比例縮進 320×320：長的那一邊剛好 320，短的那一邊兩邊補一樣多', () => {
    const f = letterbox(640, 480);
    assert.ok(near(f.scale, 0.5));
    assert.ok(near(f.w, 320) && near(f.h, 240));
    assert.ok(near(f.padX, 0) && near(f.padY, 40));
    const g = letterbox(480, 640);
    assert.ok(near(g.padX, 40) && near(g.padY, 0));
    const sq = letterbox(100, 100);
    assert.ok(near(sq.scale, 3.2) && near(sq.padX, 0) && near(sq.padY, 0));
});

test('先框出人：上一格的框放大 1.25 倍、裁成正方形、不超出畫面', () => {
    const r = regionFor([300, 100, 340, 300], 640, 480);
    // 框高 200 → 邊長 250，中心 (320, 200)
    assert.ok(near(r.rx, 195) && near(r.ry, 75) && near(r.rw, 250) && near(r.rh, 250));
    // 靠邊的框：裁掉超出畫面的部分
    const e = regionFor([0, 0, 100, 100], 640, 480);
    assert.ok(near(e.rx, 0) && near(e.ry, 0) && near(e.rw, 112.5) && near(e.rh, 112.5));
});

test('先框出人：沒有框、框壞掉、太小、幾乎是整個畫面 → 看整個畫面（null）', () => {
    for (const bad of [null, undefined, 'x', [1, 2, 3], [0, 0, NaN, 10], [10, 10, 5, 20], [10, 10, 20, 10], [0, 0, Infinity, 5]]) {
        assert.equal(regionFor(bad, 640, 480), null, JSON.stringify(bad));
    }
    assert.equal(regionFor([100, 100, 105, 105], 640, 480), null, '框太小（不到 16 像素）');
    assert.equal(regionFor([0, 0, 640, 480], 640, 480), null, '人佔滿畫面：直接看整個畫面');
});

test('畫面的像素 → 模型的輸入：RGB 分開三張、除以 255', () => {
    const n = 2;
    const rgba = new Uint8ClampedArray([255, 0, 51, 255, 0, 102, 255, 255, 10, 20, 30, 255, 40, 50, 60, 255]);
    const out = toInput(rgba, n);
    assert.equal(out.length, 12);
    assert.deepEqual([...out.slice(0, 4)].map(v => Math.round(v * 255)), [255, 0, 10, 40]);
    assert.deepEqual([...out.slice(4, 8)].map(v => Math.round(v * 255)), [0, 102, 20, 50]);
    assert.deepEqual([...out.slice(8, 12)].map(v => Math.round(v * 255)), [51, 255, 30, 60]);
});

// 假的模型輸出：300 列，第 best 列是人（分數 score），點 k 是 320 裡的像素
function output(rows, best, score, box, k) {
    const d = new Float32Array(rows * COLS);
    for (let r = 0; r < rows; r++) d[r * COLS + 4] = 0.01;
    const o = best * COLS;
    d.set(box, o);
    d[o + 4] = score;
    k.forEach(([x, y, c], j) => { d[o + 6 + j * 3] = x; d[o + 7 + j * 3] = y; d[o + 8 + j * 3] = c; });
    return d;
}

test('讀輸出：挑分數最高的那一個，座標換回整個畫面的比例（扣掉補的灰邊、加回裁切的位置）', () => {
    const W = 640, H = 480;
    // 看整個畫面：縮 0.5、上下各補 40
    const region = { rx: 0, ry: 0, rw: W, rh: H };
    const fit = letterbox(W, H);
    const k = Array.from({ length: 17 }, (_, j) => [160 + j, 40 + 120, 0.8]);   // 畫面上 (320 + 2j, 240)
    const d = output(300, 7, 0.9, [100, 50, 200, 250], k);
    const r = decodeBest(d, region, fit, W, H);
    assert.ok(near(r.score, 0.9, 1e-6));
    assert.ok(near(r.box[0], 200) && near(r.box[1], 20) && near(r.box[2], 400) && near(r.box[3], 420));
    r.k.forEach(([x, y, c], j) => {
        assert.ok(near(x, (320 + 2 * j) / W, 1e-5), 'x ' + j);
        assert.ok(near(y, 240 / H, 1e-5), 'y ' + j);
        assert.ok(near(c, 0.8, 1e-6));
    });
});

test('讀輸出：只看人附近時，加回裁切的位置；0～1 的匯出也認得', () => {
    const W = 1280, H = 720;
    const region = { rx: 400, ry: 100, rw: 400, rh: 400 };
    const fit = letterbox(400, 400);   // 縮 0.8、不用補
    const k = Array.from({ length: 17 }, () => [160, 80, 0.7]);   // 裁切裡的 (200, 100) → 畫面 (600, 200)
    const px = decodeBest(output(300, 0, 0.6, [0, 0, 320, 320], k), region, fit, W, H);
    assert.ok(near(px.k[0][0], 600 / W, 1e-5) && near(px.k[0][1], 200 / H, 1e-5));
    // 同一個結果，用 0～1 表示（有的匯出是這樣）
    const unit = k.map(([x, y, c]) => [x / S, y / S, c]);
    const n = decodeBest(output(300, 0, 0.6, [0, 0, 1, 1], unit), region, fit, W, H);
    assert.ok(near(n.k[0][0], 600 / W, 1e-4) && near(n.k[0][1], 200 / H, 1e-4));
});

test('讀輸出：分數太低（沒有人）、資料不夠、壞掉 → null', () => {
    const region = { rx: 0, ry: 0, rw: 640, rh: 480 };
    const fit = letterbox(640, 480);
    const k = Array.from({ length: 17 }, () => [10, 10, 0.9]);
    assert.equal(decodeBest(output(300, 3, PERSON_SCORE - 0.01, [0, 0, 10, 10], k), region, fit, 640, 480), null);
    assert.equal(decodeBest(output(300, 3, NaN, [0, 0, 10, 10], k), region, fit, 640, 480), null);
    assert.equal(decodeBest(new Float32Array(10), region, fit, 640, 480), null);
    assert.equal(decodeBest(null, region, fit, 640, 480), null);
    assert.ok(decodeBest(output(300, 3, PERSON_SCORE, [0, 0, 10, 10], k), region, fit, 640, 480));
});

test('21 點的模型（11/21）：一列 69 個數字，21 個點都換回畫面上的位置', async () => {
    const { colsOf } = await import('../js/ai/yolo-core.js');
    assert.equal(colsOf(17), COLS);
    assert.equal(colsOf(21), 69);
    const W = 640, H = 480;
    const region = { rx: 0, ry: 0, rw: W, rh: H };
    const fit = letterbox(W, H);
    const cols = colsOf(21);
    const d = new Float32Array(300 * cols);
    const o = 5 * cols;
    d.set([100, 50, 200, 250, 0.8, 0], o);
    for (let j = 0; j < 21; j++) d.set([160 + j, 160, 0.9], o + 6 + j * 3);
    const r = decodeBest(d, region, fit, W, H, S, 21);
    assert.equal(r.k.length, 21);
    r.k.forEach(([x, y], j) => {
        assert.ok(near(x, (320 + 2 * j) / W, 1e-5), 'x ' + j);
        assert.ok(near(y, 240 / H, 1e-5), 'y ' + j);
    });
    // 用 17 點去讀 21 點的輸出會讀錯：所以一定要照模型的點數（js/ai/models.js 的 kpts）
    assert.notEqual(decodeBest(d, region, fit, W, H, S, 17).score, 0.8);
});

// ---------- 畫面裡有好幾個人（11/22） ----------
// 好幾個人的假輸出：people 是 [{ row, score, box, k }]（320 裡的像素），其他列分數 0.01
function crowd(people, rows = 300) {
    const d = new Float32Array(rows * COLS);
    for (let r = 0; r < rows; r++) d[r * COLS + 4] = 0.01;
    for (const p of people) {
        const o = p.row * COLS;
        d.set(p.box, o);
        d[o + 4] = p.score;
        (p.k || []).forEach(([x, y, c], j) => d.set([x, y, c], o + 6 + j * 3));
    }
    return d;
}
const pts = (x, y) => Array.from({ length: 17 }, () => [x, y, 0.9]);

test('兩個框重疊多少（交集 ÷ 聯集）：一樣 1、沒碰到 0、一半', () => {
    assert.equal(iou([0, 0, 10, 10], [0, 0, 10, 10]), 1);
    assert.equal(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0);
    assert.equal(iou([0, 0, 10, 10], [10, 0, 20, 10]), 0, '只碰到邊');
    assert.ok(near(iou([0, 0, 10, 10], [5, 0, 15, 10]), 50 / 150));
    assert.equal(iou([0, 0, 10, 10], [NaN, 0, 10, 10]), 0);
});

test('讀出每一個人：分數高的在前、太低的不要、同一個人兩個框只留一個、座標換回整個畫面；最高分的和 decodeBest 一樣', () => {
    const W = 640, H = 480, region = { rx: 0, ry: 0, rw: W, rh: H }, fit = letterbox(W, H);
    const d = crowd([
        { row: 5, score: 0.6, box: [10, 50, 60, 250], k: pts(30, 100) },
        { row: 9, score: 0.9, box: [200, 60, 300, 270], k: pts(250, 150) },
        { row: 12, score: 0.8, box: [202, 62, 300, 268], k: pts(251, 151) },   // 和 row 9 幾乎一樣：同一個人
        { row: 20, score: PERSON_SCORE - 0.01, box: [100, 100, 120, 120], k: pts(110, 110) }
    ]);
    const people = decodeAll(d, region, fit, W, H);
    assert.deepEqual(people.map(p => Math.round(p.score * 10) / 10), [0.9, 0.6]);
    assert.ok(near(people[0].box[0], 400) && near(people[0].box[1], 40), '扣掉補的灰邊、放大回去');
    assert.ok(near(people[1].k[0][0], 60 / W, 1e-5));
    assert.deepEqual(decodeBest(d, region, fit, W, H), people[0]);
    assert.deepEqual(decodeAll(null, region, fit, W, H), []);
    assert.deepEqual(decodeAll(crowd([]), region, fit, W, H), []);
});

test('跟著誰：好幾個人時跟著和上一格重疊最多的（不跳到分數高的人身上）；都不重疊回傳 null；只有一個人時在附近就算', () => {
    const me = { score: 0.7, box: [100, 100, 200, 400] }, other = { score: 0.95, box: [400, 120, 480, 380] };
    // 只有一個人：和上一格的框不重疊，但中心離得不遠（不超過上一格框的對角線 316 像素，例如每秒格數很低、動很快）：還是他
    const moved = { score: 0.8, box: [250, 120, 350, 420] };
    assert.equal(pickPerson([moved], { prev: me.box }), moved);
    // 只有一個人、但離很遠（中心差 500 像素）：不是原本的人（原本的人可能小到整個畫面找不到），先不跟
    assert.equal(pickPerson([{ score: 0.9, box: [600, 100, 700, 400] }], { prev: me.box }), null);
    // 好幾個人：跟著和上一格重疊最多的；分數比較高的旁人不會搶走
    assert.equal(pickPerson([other, { ...me, box: [104, 98, 205, 402] }], { prev: me.box }).score, 0.7);
    // 原本的人被擋住了（旁邊的人都不夠重疊）：null（跟丟了，背景執行緒等一下再找）
    assert.equal(pickPerson([other, { score: 0.8, box: [205, 100, 300, 400] }], { prev: me.box }), null);
    assert.ok(iou([205, 100, 300, 400], me.box) < SAME_IOU);
    assert.equal(pickPerson([], { prev: me.box }), null);
    assert.equal(pickPerson(null), null);
});

test('一開始（或跟丟太久）挑框最大的人（離手機最近），不是分數最高的；點畫面就跟著點的那個人', () => {
    const near1 = { score: 0.7, box: [100, 50, 300, 450] }, far = { score: 0.95, box: [450, 150, 520, 320] };
    assert.equal(pickPerson([far, near1]), near1);
    // 點在遠的那個人身上：跟著他；點在兩個框都包住的地方：中心比較近的；點在沒有人的地方：null
    assert.equal(pickPerson([far, near1], { focus: [480, 200] }), far);
    const behind = { score: 0.9, box: [80, 40, 330, 470] };
    assert.equal(pickPerson([near1, behind], { focus: [200, 250] }), near1);
    assert.equal(pickPerson([far, near1], { focus: [600, 20] }), null);
    // 點了畫面就不看上一格：點的是誰就跟誰
    assert.equal(pickPerson([far, near1], { focus: [480, 200], prev: near1.box }), far);
});

test('點畫面換人：點的那一點附近放大找（遠的人在整個畫面裡太小）：邊長是短邊的一半、靠邊時往裡面挪、不超出畫面', () => {
    const r = regionAround([830, 295], 1024, 360);
    assert.ok(near(r.rw, 180) && near(r.rh, 180));
    assert.ok(near(r.rx, 740) && near(r.ry, 180), '靠下面：整塊往上挪，不超出畫面');
    const c = regionAround([320, 240], 640, 480);
    assert.ok(near(c.rx, 200) && near(c.ry, 120) && near(c.rw, 240));
    const corner = regionAround([5, 5], 640, 480);
    assert.ok(near(corner.rx, 0) && near(corner.ry, 0));
    assert.equal(regionAround([5, 5], 40, 40), null, '畫面太小');
    assert.equal(regionAround([NaN, 5], 640, 480), null);
    assert.equal(regionAround(null, 640, 480), null);
});
