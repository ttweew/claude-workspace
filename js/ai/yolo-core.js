// YOLO 的前處理和讀輸出（11/21）：背景執行緒（js/ai/yolo-worker.js）用，也給 node 的測試直接算（tests/yolo-core.test.mjs）
// 不碰畫布、不碰模型，只做數字：哪一塊畫面要給模型看、縮多小、補多少灰邊、模型的輸出怎麼換回畫面上的位置
//
// 模型：Ultralytics 的 YOLO26 姿勢模型，轉成 LiteRT（.tflite）時選 nms=False（一對一的輸出，不用再整理重複的框）
//   輸入 [1, 3, S, S]：RGB 三張 S×S 的圖，每個數字 0～1（像素 ÷ 255）；等比例縮小、旁邊補灰（114，和 Ultralytics 一樣）
//   輸出 [1, 300, 57]：300 個候選，每一列 x1 y1 x2 y2 分數 類別，再 17 個點 × [x, y, 可信度]
//   座標是 S×S 輸入裡的像素（有的匯出是 0～1，看數值判斷）

export const INPUT_SIZE = 320;   // 11/21 實驗：640 抓的點和 320 幾乎一樣，慢 3～4 倍
export const COLS = 57;           // 6 個框的數字＋17 點 × 3；21 點的模型是 69（colsOf）
export const colsOf = kpts => 6 + 3 * kpts;
export const PERSON_SCORE = 0.25;   // 分數低於這個當作沒有人（Ultralytics 預設的門檻）
export const ROI_GROW = 1.25;       // 先框出人：上一格的框放大 25%（人會動），裁成正方形
export const LOST_GROW = 2.5;       // 跟丟了（11/22）：先在原本的位置附近放大 2.5 倍的範圍找（遠的人在整個畫面裡太小，找不到）
// 畫面裡有好幾個人時跟著誰（11/22，pickPerson）：
export const SAME_IOU = 0.2;        // 這一格的框和上一格跟著的人的框重疊這麼多（交集 ÷ 聯集）才算同一個人；每秒 30 格時同一個人兩格之間的框幾乎一樣，
                                    // 慢的手機每秒只有幾格、動作大時也重疊一半以上；0.2 只排除「站在旁邊、後面」的別人
export const DUPLICATE_IOU = 0.7;   // 兩個框重疊這麼多算同一個人被找到兩次，留分數高的（YOLO26 一個人本來就只給一個框，保險用）

// 一塊畫面（rx, ry, rw, rh，像素）等比例縮進 S×S：縮放比例、縮完多大、左右上下各補多少
export function letterbox(rw, rh, S = INPUT_SIZE) {
    const scale = Math.min(S / rw, S / rh);
    const w = rw * scale, h = rh * scale;
    return { scale, w, h, padX: (S - w) / 2, padY: (S - h) / 2 };
}

// 先框出人（11/21 伏地挺身影片：整個畫面縮到 320 時人太小，最低點的手臂抓錯、一下都沒數到；
// 只看人附近，人在 320 裡變大，數到 2 下和 MediaPipe 一樣，速度不變）
// box：上一格的框 [x1, y1, x2, y2]（畫面像素）；回傳要給模型看的那一塊 { rx, ry, rw, rh }；
// 沒有上一格、框不合理、或那一塊幾乎就是整個畫面時回傳 null（看整個畫面）
export function regionFor(box, W, H, grow = ROI_GROW) {
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return null;
    const [x1, y1, x2, y2] = box;
    if (!(x2 > x1) || !(y2 > y1)) return null;
    const side = Math.max(x2 - x1, y2 - y1) * grow;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const rx = Math.max(0, cx - side / 2), ry = Math.max(0, cy - side / 2);
    const rw = Math.min(W, cx + side / 2) - rx, rh = Math.min(H, cy + side / 2) - ry;
    if (!(rw >= 16) || !(rh >= 16)) return null;
    if (rw * rh > 0.9 * W * H) return null;
    return { rx, ry, rw, rh };
}

// 點畫面換人時，點的那一點附近的一塊（11/22）：正方形、邊長是畫面短邊的一半、不超出畫面；畫面太小（邊長不到 32 像素）回傳 null
// 為什麼要放大找：整個畫面縮到 320 時，遠的、趴著的人只剩幾十個像素，YOLO 找不到（11/22 兩個人的伏地挺身合成影片：
// 右邊比較小的人整個畫面找不到，點他沒反應）；只看點的那一塊，那個人在 320 裡大好幾倍
export const FOCUS_SIDE = 0.5;
export function regionAround(point, W, H) {
    const side = FOCUS_SIDE * Math.min(W, H);
    if (!Array.isArray(point) || !point.every(Number.isFinite) || !(side >= 32)) return null;
    const [x, y] = point;
    return { rx: Math.min(Math.max(0, x - side / 2), W - side), ry: Math.min(Math.max(0, y - side / 2), H - side), rw: side, rh: side };
}

// RGBA 像素（S×S，畫布的 getImageData）→ 模型的輸入（RGB 分開三張，每個數字 ÷ 255）
export function toInput(rgba, S = INPUT_SIZE, out = new Float32Array(3 * S * S)) {
    const n = S * S;
    for (let i = 0; i < n; i++) {
        out[i] = rgba[i * 4] / 255;
        out[n + i] = rgba[i * 4 + 1] / 255;
        out[2 * n + i] = rgba[i * 4 + 2] / 255;
    }
    return out;
}

// 模型輸出的一列（從第 o 個數字開始）→ { score, box（畫面像素）, k（kpts 個點 [x, y, 可信度]，畫面的比例座標）}
// region：這次給模型看的那一塊；fit：letterbox(region 的寬高)；W、H：整個畫面的大小；kpts：模型有幾個點（17 或 21）
function decodeRow(data, o, region, fit, W, H, S, kpts) {
    // 座標的單位：這次的匯出是 S×S 裡的像素；有的匯出是 0～1，最大值不超過 1.5 就當作 0～1
    let max = 0;
    for (let j = 0; j < 4; j++) max = Math.max(max, Math.abs(data[o + j]));
    const unit = max <= 1.5 ? S : 1;
    const fx = v => ((v * unit - fit.padX) / fit.scale + region.rx);
    const fy = v => ((v * unit - fit.padY) / fit.scale + region.ry);
    const k = [];
    for (let j = 0; j < kpts; j++) {
        const b = o + 6 + j * 3;
        k.push([fx(data[b]) / W, fy(data[b + 1]) / H, data[b + 2]]);
    }
    return { score: data[o + 4], box: [fx(data[o]), fy(data[o + 1]), fx(data[o + 2]), fy(data[o + 3])], k };
}

// 兩個框 [x1, y1, x2, y2] 重疊多少：交集 ÷ 聯集（0 是沒碰到，1 是一模一樣）
export function iou(a, b) {
    const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), h = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    if (!(w > 0) || !(h > 0)) return 0;
    const inter = w * h;
    const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
    return union > 0 ? inter / union : 0;
}

// 模型的輸出 → 找到的每一個人（11/22）：分數 PERSON_SCORE 以上、分數高的在前；重疊太多的（同一個人兩個框）只留分數高的
// 回傳 [{ score, box, k }]（decodeRow 的格式），沒有人是空陣列
export function decodeAll(data, region, fit, W, H, S = INPUT_SIZE, kpts = 17) {
    const cols = colsOf(kpts);
    if (!data || data.length < cols) return [];
    const rows = Math.floor(data.length / cols);
    const found = [];
    for (let r = 0; r < rows; r++) if (data[r * cols + 4] >= PERSON_SCORE) found.push(r);
    found.sort((a, b) => data[b * cols + 4] - data[a * cols + 4]);
    const people = [];
    for (const r of found) {
        const p = decodeRow(data, r * cols, region, fit, W, H, S, kpts);
        if (p.box.every(Number.isFinite) && !people.some(q => iou(q.box, p.box) > DUPLICATE_IOU)) people.push(p);
    }
    return people;
}

// 分數最高的那一個人；沒有人回傳 null（11/21 只用這個；11/22 起背景執行緒用 decodeAll＋pickPerson）
export function decodeBest(data, region, fit, W, H, S = INPUT_SIZE, kpts = 17) {
    return decodeAll(data, region, fit, W, H, S, kpts)[0] || null;
}

const area = b => (b[2] - b[0]) * (b[3] - b[1]);
const center = b => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];

// 這一格跟著誰（11/22）：people 是 decodeAll 的結果；MediaPipe 一次只找一個人，YOLO 一次找到畫面裡每一個人，網站要自己挑
//   focus（使用者點的位置，畫面像素 [x, y]）：框包住那一點的人（好幾個框都包住時挑中心最近的）；點的地方沒有人回傳 null
//   prev（上一格跟著的人的框）：挑和 prev 重疊最多的（SAME_IOU 以上）；都不夠重疊回傳 null：原本的人被擋住、走出畫面了，
//     不跳到旁邊的人身上（11/21 以前挑分數最高的，旁邊的人分數比較高就跳過去）
//     只找到一個人時寬鬆一點：中心離 prev 的中心不超過 prev 的對角線長也算（每秒格數低、動作快時兩格的框可能不太重疊）；
//     更遠的不算（11/22 兩個人的合成影片：跟著右邊比較小的人時，整個畫面只找得到左邊的大人，以前「只有一個人就是他」會馬上跳過去）
//   都沒有（剛開始、跟丟太久）：框最大的那一個（離手機最近的人：運動的人通常在手機前面，旁邊、後面經過的人在畫面上比較小）
export function pickPerson(people, { prev = null, focus = null } = {}) {
    if (!Array.isArray(people) || !people.length) return null;
    if (focus) {
        const [x, y] = focus;
        const hit = people.filter(p => x >= p.box[0] && x <= p.box[2] && y >= p.box[1] && y <= p.box[3]);
        const d = p => Math.hypot(center(p.box)[0] - x, center(p.box)[1] - y);
        return hit.length ? hit.reduce((a, b) => (d(b) < d(a) ? b : a)) : null;
    }
    if (prev) {
        const best = people.reduce((a, b) => (iou(b.box, prev) > iou(a.box, prev) ? b : a));
        if (iou(best.box, prev) >= SAME_IOU) return best;
        if (people.length > 1) return null;
        const [cx, cy] = center(prev), [px, py] = center(people[0].box);
        return Math.hypot(px - cx, py - cy) <= Math.hypot(prev[2] - prev[0], prev[3] - prev[1]) ? people[0] : null;
    }
    return people.reduce((a, b) => (area(b.box) > area(a.box) ? b : a));
}

// ---------- GPU 和 CPU 對答案（11/27）----------
// 組員的手機選 YOLO 完全沒有骨架（全身進到畫面也沒有），MediaPipe 正常：手機的 GPU 算錯了，而且不會報錯
// 這台測試電腦的軟體 GPU 強制用半精度（fp16）時，模型輸出的每一個數字都是 0（全灰的畫面、真人照片都一樣）；
// 手機的 GPU 支援半精度，LiteRT.js 預設就用半精度。以前啟動時只看「算出來的是不是數字」，0 也是數字，
// 什麼都沒算當然最快，就選了 GPU，之後每一格都「沒有人」
// 現在 GPU 一律用一般精度（fp32，yolo-worker.js），再加兩道對答案：啟動時（outputLooksSame）、前幾格有人的畫面（compareRuns）

// 啟動時給全灰的畫面算，GPU 和 CPU 的輸出要差不多：不是 0 的數字一樣多（真的模型 17100 個裡 16800 個不是 0，
// 300 個是類別，都是 0）、框的座標平均大小差不多。11/27 實測：YOLO26n 兩邊一模一樣；YOLO26s 的權重壓成 8 位元，
// CPU 和 GPU 算法不同，框的平均大小差 2%（162 和 158 像素）。全部是 0、壞掉的數字一看就差很多
export const OUTPUT_RATIO = 2;   // 框的平均大小：GPU 要在 CPU 的一半到兩倍之間
function outputSummary(data, cols) {
    const rows = Math.floor(data.length / cols);
    let nonzero = 0, coord = 0;
    for (let i = 0; i < rows * cols; i++) {
        if (!Number.isFinite(data[i])) return null;
        if (data[i] !== 0) nonzero++;
    }
    for (let r = 0; r < rows; r++) for (let j = 0; j < 4; j++) coord += Math.abs(data[r * cols + j]);
    return { nonzero, coord: rows ? coord / (rows * 4) : 0 };
}
export function outputLooksSame(gpu, cpu, kpts = 17) {
    const cols = colsOf(kpts);
    if (!gpu || !cpu || gpu.length !== cpu.length || gpu.length < cols) return false;
    const g = outputSummary(gpu, cols), c = outputSummary(cpu, cols);
    if (!g || !c || !(c.nonzero > 0) || !(c.coord > 0)) return false;
    return g.nonzero * 2 >= c.nonzero && g.coord * OUTPUT_RATIO >= c.coord && g.coord <= c.coord * OUTPUT_RATIO;
}

// 前幾格畫面裡有人時，同一格 GPU、CPU 各算一次（decodeAll 的結果），看是不是找到同一個人、點的位置一樣
// 回傳 'same'（一樣）、'differ'（不一樣）、null（兩邊都沒有清楚的人，看不出來，例如還沒站進畫面）
// 11/27 真人照片實測：YOLO26n 兩邊一模一樣；YOLO26s 框重疊 0.997、點的位置最多差框對角線的 0.3%、點的可信度最多差 0.01
export const CLEAR_SCORE = 0.5;   // 「清楚的人」才拿來比（YOLO26s 看全灰的畫面，GPU 給 0.42 分、CPU 0.22 分，都不算有人）；點也是可信度這麼高才比
export const MATCH_IOU = 0.5;     // 另一邊要找得到框重疊一半以上的人，才算找到同一個人
export const POINT_SLACK = 0.1;   // 同一個點的位置差不超過框對角線的 10% 才算一樣；三分之二以上的點一樣才算同一個姿勢
export function compareRuns(gpu, cpu, W, H) {
    const clear = p => !!p && p.score >= CLEAR_SCORE;
    const g = Array.isArray(gpu) ? gpu : [], c = Array.isArray(cpu) ? cpu : [];
    // 以 CPU 為準（電腦上測過、和真人實測對過的算法）；CPU 沒看到清楚的人、GPU 卻有，就看 CPU 有沒有同一個人
    const ref = clear(c[0]) ? c[0] : clear(g[0]) ? g[0] : null;
    if (!ref) return null;
    const others = ref === c[0] ? g : c;
    const match = others.find(p => iou(p.box, ref.box) >= MATCH_IOU);
    if (!match) return 'differ';
    const diag = Math.hypot(ref.box[2] - ref.box[0], ref.box[3] - ref.box[1]);
    let n = 0, ok = 0;
    ref.k.forEach(([x, y, conf], j) => {
        if (!(conf >= CLEAR_SCORE)) return;
        n++;
        const q = match.k[j];
        if (q && q[2] >= PERSON_SCORE && Math.hypot((q[0] - x) * W, (q[1] - y) * H) <= POINT_SLACK * diag) ok++;
    });
    // 清楚的點不到 3 個（只露出一點點）：只看框
    return n < 3 || ok * 3 >= n * 2 ? 'same' : 'differ';
}
