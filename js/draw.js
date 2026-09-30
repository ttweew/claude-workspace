// 在畫布上畫骨架與編號

import { LANDMARKS, isMainJoint } from './landmarks.js';

// 畫出 33 個關鍵點（紅點）與連線（綠線），以及自己算出的軀幹（藍色：肩膀中心 → 髖部中心）
// connections：MediaPipe 提供的連線表（PoseLandmarker.POSE_CONNECTIONS）
export function drawSkeleton(drawingUtils, connections, landmarks, derived) {
    drawingUtils.drawConnectors(landmarks, connections, { color: '#00FF00', lineWidth: 4 });
    drawingUtils.drawLandmarks(landmarks, { color: '#FF0000', radius: 4 });
    const trunk = [derived.SHOULDER_CENTER, derived.HIP_CENTER];
    drawingUtils.drawConnectors(trunk, [{ start: 0, end: 1 }], { color: '#1E90FF', lineWidth: 4 });
    drawingUtils.drawLandmarks(trunk, { color: '#1E90FF', radius: 6 });
}

// 在每個點旁邊標上編號與名稱
// 主要關節（肩、肘、腕、髖、膝、踝）標「編號＋名稱」；臉、手指、腳跟腳尖的點很密集，只標編號
// viewWidth、viewHeight：畫面實際顯示的大小，用來換算文字大小
export function drawLabels(ctx, landmarks, derived, viewWidth, viewHeight) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const mirrored = ctx.canvas.classList.contains('mirrored');
    // 文字在螢幕上固定約 12～18px：依畫面縮放比例換算，手機直式畫面的字才不會太大
    const scale = Math.min(viewWidth / w, viewHeight / h);
    const screenPx = Math.max(12, Math.min(18, Math.min(viewWidth, viewHeight) / 40));
    const size = Math.round(screenPx / scale);
    ctx.save();
    // 畫布是鏡像顯示時，文字先反向翻一次，顯示出來才不會變成鏡像字
    if (mirrored) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.strokeStyle = '#000000';
    // outward：被拍攝者左側的點往一邊標、右側的點往另一邊標，文字才不會壓在身體上
    //         outward 為 0 時，文字置中標在點的正下方
    //         文字超出畫面邊緣時，往內移回畫面裡
    function label(point, text, color, outward, fontSize) {
        const x = (mirrored ? 1 - point.x : point.x) * w;
        const dir = mirrored ? -outward : outward;
        ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
        ctx.lineWidth = Math.max(2, fontSize / 5);
        ctx.fillStyle = color;
        const width = ctx.measureText(text).width;
        const gap = fontSize * 0.6;
        let left = dir > 0 ? x + gap : dir < 0 ? x - gap - width : x - width / 2;
        left = Math.min(Math.max(left, 2), w - width - 2);
        const ty = point.y * h + (dir === 0 ? fontSize * 1.1 : 0);
        ctx.strokeText(text, left, ty);
        ctx.fillText(text, left, ty);
    }
    // 先畫只有編號的小標籤，最後畫主要關節，名稱才不會被蓋住
    LANDMARKS.forEach(([key], id) => {
        if (isMainJoint(id)) return;
        label(landmarks[id], String(id), '#FFFF66', key.includes('RIGHT') ? -1 : 1, Math.round(size * 0.75));
    });
    LANDMARKS.forEach(([key, name], id) => {
        if (!isMainJoint(id)) return;
        label(landmarks[id], id + ' ' + name, '#FFFFFF', key.includes('RIGHT') ? -1 : 1, size);
    });
    label(derived.SHOULDER_CENTER, '肩膀中心', '#8FD3FF', 0, size);
    label(derived.HIP_CENTER, '髖部中心', '#8FD3FF', 0, size);
    ctx.restore();
}
