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

// 模型的輸出 → 最像人的那一個：{ score, box（畫面像素）, k（kpts 個點 [x, y, 可信度]，畫面的比例座標）}；沒有人回傳 null
// region：這次給模型看的那一塊；fit：letterbox(region 的寬高)；W、H：整個畫面的大小；kpts：模型有幾個點（17 或 21）
export function decodeBest(data, region, fit, W, H, S = INPUT_SIZE, kpts = 17) {
    const cols = colsOf(kpts);
    if (!data || data.length < cols) return null;
    const rows = Math.floor(data.length / cols);
    let best = 0;
    for (let r = 1; r < rows; r++) if (data[r * cols + 4] > data[best * cols + 4]) best = r;
    const o = best * cols;
    const score = data[o + 4];
    if (!(score >= PERSON_SCORE)) return null;
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
    return { score, box: [fx(data[o]), fy(data[o + 1]), fx(data[o + 2]), fy(data[o + 3])], k };
}
