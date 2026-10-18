// 在畫布上畫骨架（編號標籤在 labels.js）

import { isVisible, isMainJoint } from './landmarks.js';

// 畫出關鍵點（紅點）與連線（綠線），以及自己算出的軀幹（藍色：肩膀中心 → 髖部中心）
// 只畫真的看得到的點；連線兩端都看得到才畫，不在畫面裡的部位不會出現猜出來的點
// 臉、手指、腳尖的點很密集，畫小一點、線細一點，才不會在臉上糊成一團；主要關節維持顯眼
// connections：MediaPipe 提供的連線表（PoseLandmarker.POSE_CONNECTIONS）
// scale：螢幕像素密度；線條粗細以螢幕上看到的大小為準，任何裝置看起來都一樣粗
export function drawSkeleton(drawingUtils, connections, landmarks, derived, scale = 1) {
    const visible = landmarks.map(isVisible);
    const shown = connections.filter(c => visible[c.start] && visible[c.end]);
    const isBody = c => isMainJoint(c.start) && isMainJoint(c.end);
    drawingUtils.drawConnectors(landmarks, shown.filter(c => !isBody(c)), { color: '#00FF00', lineWidth: 2 * scale });
    drawingUtils.drawConnectors(landmarks, shown.filter(isBody), { color: '#00FF00', lineWidth: 3 * scale });
    drawingUtils.drawLandmarks(landmarks.filter((p, i) => visible[i] && !isMainJoint(i)),
        { color: '#FF0000', fillColor: '#FF0000', lineWidth: 1, radius: 3 * scale });
    drawingUtils.drawLandmarks(landmarks.filter((p, i) => visible[i] && isMainJoint(i)),
        { color: '#FF0000', fillColor: '#FF0000', lineWidth: 1, radius: 4 * scale });
    const trunk = [derived.SHOULDER_CENTER, derived.HIP_CENTER];
    if (trunk.every(isVisible)) {
        drawingUtils.drawConnectors(trunk, [{ start: 0, end: 1 }], { color: '#1E90FF', lineWidth: 3 * scale });
    }
    drawingUtils.drawLandmarks(trunk.filter(isVisible),
        { color: '#1E90FF', fillColor: '#1E90FF', lineWidth: 1, radius: 5.5 * scale });
}
