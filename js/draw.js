// 在畫布上畫骨架（編號標籤在 labels.js）

import { isVisible } from './landmarks.js';

// 畫出關鍵點（紅點）與連線（綠線），以及自己算出的軀幹（藍色：肩膀中心 → 髖部中心）
// 只畫真的看得到的點；連線兩端都看得到才畫，不在畫面裡的部位不會出現猜出來的點
// connections：MediaPipe 提供的連線表（PoseLandmarker.POSE_CONNECTIONS）
// scale：螢幕像素密度；線條粗細以螢幕上看到的大小為準，任何裝置看起來都一樣粗
export function drawSkeleton(drawingUtils, connections, landmarks, derived, scale = 1) {
    const visible = landmarks.map(isVisible);
    drawingUtils.drawConnectors(landmarks, connections.filter(c => visible[c.start] && visible[c.end]),
        { color: '#00FF00', lineWidth: 3 * scale });
    drawingUtils.drawLandmarks(landmarks.filter((p, i) => visible[i]),
        { color: '#FF0000', fillColor: '#FF0000', lineWidth: 1, radius: 4 * scale });
    const trunk = [derived.SHOULDER_CENTER, derived.HIP_CENTER];
    if (trunk.every(isVisible)) {
        drawingUtils.drawConnectors(trunk, [{ start: 0, end: 1 }], { color: '#1E90FF', lineWidth: 3 * scale });
    }
    drawingUtils.drawLandmarks(trunk.filter(isVisible),
        { color: '#1E90FF', fillColor: '#1E90FF', lineWidth: 1, radius: 5.5 * scale });
}
