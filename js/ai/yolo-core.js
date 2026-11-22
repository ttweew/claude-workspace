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
