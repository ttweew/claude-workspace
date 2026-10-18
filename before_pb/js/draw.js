// 在畫布上畫骨架（編號標籤在 labels.js）

// 畫出 33 個關鍵點（紅點）與連線（綠線），以及自己算出的軀幹（藍色：肩膀中心 → 髖部中心）
// connections：MediaPipe 提供的連線表（PoseLandmarker.POSE_CONNECTIONS）
export function drawSkeleton(drawingUtils, connections, landmarks, derived) {
    drawingUtils.drawConnectors(landmarks, connections, { color: '#00FF00', lineWidth: 4 });
    drawingUtils.drawLandmarks(landmarks, { color: '#FF0000', radius: 4 });
    const trunk = [derived.SHOULDER_CENTER, derived.HIP_CENTER];
    drawingUtils.drawConnectors(trunk, [{ start: 0, end: 1 }], { color: '#1E90FF', lineWidth: 4 });
    drawingUtils.drawLandmarks(trunk, { color: '#1E90FF', radius: 6 });
}
