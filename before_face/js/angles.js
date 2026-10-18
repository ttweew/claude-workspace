// 關節角度：三個點夾出的角度，例如「髖－膝－踝」就是膝蓋彎曲的角度
// 180° 代表完全伸直，越小代表彎得越多（深蹲蹲到大腿與地面平行時，膝蓋約 90°）
//
// 用「畫面座標」（2D）計算，不用公尺座標（3D）：
//   實測一張雙腿、雙手都在畫面平面上的照片，伸直的腿用 2D 算是 174°，3D 卻是 152°；
//   3D 的前後深度是模型從單張畫面猜的，誤差會讓角度偏掉 20 度以上
// 2D 的限制：手腳朝著鏡頭伸出時角度會失真，所以深蹲等動作要從「側面」拍，這也是運動分析常見的拍法

import { P, isVisible } from './landmarks.js';

// 要計算的關節：[代號, 中文名, 三個點（中間那個就是關節）]
export const ANGLES = [
    ['LEFT_KNEE', '左膝', ['LEFT_HIP', 'LEFT_KNEE', 'LEFT_ANKLE']],
    ['RIGHT_KNEE', '右膝', ['RIGHT_HIP', 'RIGHT_KNEE', 'RIGHT_ANKLE']],
    ['LEFT_HIP', '左髖', ['LEFT_SHOULDER', 'LEFT_HIP', 'LEFT_KNEE']],
    ['RIGHT_HIP', '右髖', ['RIGHT_SHOULDER', 'RIGHT_HIP', 'RIGHT_KNEE']],
    ['LEFT_ELBOW', '左肘', ['LEFT_SHOULDER', 'LEFT_ELBOW', 'LEFT_WRIST']],
    ['RIGHT_ELBOW', '右肘', ['RIGHT_SHOULDER', 'RIGHT_ELBOW', 'RIGHT_WRIST']]
];

// b 點的夾角（度），a、b、c 都有 x、y、z
export function angleAt(a, b, c) {
    const u = [a.x - b.x, a.y - b.y, a.z - b.z];
    const v = [c.x - b.x, c.y - b.y, c.z - b.z];
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const len = Math.hypot(...u) * Math.hypot(...v);
    if (len === 0) return null;
    return Math.acos(Math.max(-1, Math.min(1, dot / len))) * 180 / Math.PI;
}

// 算出所有關節角度；三個點都看得到才算，看不到的部位不給數字（避免用猜的點算出錯的角度）
// landmarks：畫面座標（0～1）；width、height：鏡頭畫面的像素大小
// 要換算成像素再算，因為畫面不是正方形（640×480 時，x 的 0.1 比 y 的 0.1 長）
// 回傳 { LEFT_KNEE: 92, … }，算不出來的是 null
export function computeAngles(landmarks, width, height) {
    const px = p => ({ x: p.x * width, y: p.y * height, z: 0 });
    const result = {};
    for (const [key, , points] of ANGLES) {
        const ids = points.map(k => P[k]);
        result[key] = ids.every(i => isVisible(landmarks[i]))
            ? angleAt(px(landmarks[ids[0]]), px(landmarks[ids[1]]), px(landmarks[ids[2]]))
            : null;
    }
    return result;
}
