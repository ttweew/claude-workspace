// 在畫布上畫骨架（編號標籤在 labels.js）
// 自己畫，不用 MediaPipe 的畫圖工具：AI 改在背景執行緒運算後，主畫面就不需要載入 MediaPipe
// 同樣顏色、粗細的線和點各合成一次畫完，比一條一條畫省時間

import { isVisible, isMainJoint } from './landmarks.js';

// 骨架連線：MediaPipe PoseLandmarker.POSE_CONNECTIONS（33 點之間的 35 條線）
export const CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
    [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
    [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
    [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
    [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]
];
const BODY = CONNECTIONS.filter(([a, b]) => isMainJoint(a) && isMainJoint(b));
const DETAIL = CONNECTIONS.filter(([a, b]) => !(isMainJoint(a) && isMainJoint(b)));

const GREEN = '#00FF00', RED = '#FF0000', BLUE = '#1E90FF';

// 一組線：兩端都看得到才畫
function lines(ctx, points, pairs, visible, color, width) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.beginPath();
    for (const [a, b] of pairs) {
        if (!visible[a] || !visible[b]) continue;
        ctx.moveTo(points[a].x * w, points[a].y * h);
        ctx.lineTo(points[b].x * w, points[b].y * h);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

// 一組點：實心圓，外面再描一圈細邊（和 MediaPipe 畫圖工具的樣子相同）
function dots(ctx, points, color, radius) {
    if (!points.length) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.beginPath();
    for (const p of points) {
        const x = p.x * w, y = p.y * h;
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
}

// 畫出關鍵點（紅點）與連線（綠線），以及自己算出的軀幹（藍色：肩膀中心 → 髖部中心）
// 只畫真的看得到的點；連線兩端都看得到才畫，不在畫面裡的部位不會出現猜出來的點
// 臉、手指、腳尖的點很密集，畫小一點、線細一點，才不會在臉上糊成一團；主要關節維持顯眼
// scale：螢幕像素密度；線條粗細以螢幕上看到的大小為準，任何裝置看起來都一樣粗
export function drawSkeleton(ctx, landmarks, derived, scale = 1) {
    const visible = landmarks.map(isVisible);
    ctx.save();
    ctx.lineCap = 'round';
    lines(ctx, landmarks, DETAIL, visible, GREEN, 2 * scale);
    lines(ctx, landmarks, BODY, visible, GREEN, 3 * scale);
    dots(ctx, landmarks.filter((p, i) => visible[i] && !isMainJoint(i)), RED, 3 * scale);
    dots(ctx, landmarks.filter((p, i) => visible[i] && isMainJoint(i)), RED, 4 * scale);
    const trunk = [derived.SHOULDER_CENTER, derived.HIP_CENTER];
    const trunkVisible = trunk.map(isVisible);
    lines(ctx, trunk, [[0, 1]], trunkVisible, BLUE, 3 * scale);
    dots(ctx, trunk.filter((p, i) => trunkVisible[i]), BLUE, 5.5 * scale);
    ctx.restore();
}
