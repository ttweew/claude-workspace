// 關節角度：三個點夾出的角度，例如「髖－膝－踝」就是膝蓋彎曲的角度
// 180° 代表完全伸直，越小代表彎得越多（深蹲蹲到大腿與地面平行時，膝蓋約 90°）
//
// 用「畫面座標」（2D）計算，不用公尺座標（3D）：
//   實測一張雙腿、雙手都在畫面平面上的照片，伸直的腿用 2D 算是 174°，3D 卻是 152°；
//   3D 的前後深度是模型從單張畫面猜的，誤差會讓角度偏掉 20 度以上
// 2D 的限制：手腳朝著鏡頭伸出時角度會失真，所以深蹲等動作要從「側面」拍，這也是運動分析常見的拍法
// （view.js 判斷是不是側面拍）
//
// 線段在畫面上太短時不給角度：大腿、前臂等朝著鏡頭伸出時，在畫面上只剩一小段，
// 這時算出來的角度主要是透視造成的假象，加上 1～2 個像素的抖動就會跳幾十度

import { P, isVisible } from './landmarks.js';

// 各段肢體的長度，以軀幹（肩膀中心到髖部中心）為 1；取自 MediaPipe 在真人正面全身照片上的輸出
const SEGMENT_LENGTH = { thigh: 0.8, shank: 0.8, upperArm: 0.55, forearm: 0.5 };
const MIN_FRACTION = 0.5;    // 線段在畫面上不到應有長度的一半（朝鏡頭傾斜超過約 60°）→ 不給角度
const MIN_PIXELS = 12;       // 或是短於 12 像素 → 抖動 1 個像素角度就會差 5° 以上，也不給

// 每段肢體：[名稱, 起點, 終點]
const SEGMENTS = [];
for (const side of ['LEFT', 'RIGHT']) {
    SEGMENTS.push([side + '_thigh', side + '_HIP', side + '_KNEE', 'thigh'],
                  [side + '_shank', side + '_KNEE', side + '_ANKLE', 'shank'],
                  [side + '_upperArm', side + '_SHOULDER', side + '_ELBOW', 'upperArm'],
                  [side + '_forearm', side + '_ELBOW', side + '_WRIST', 'forearm']);
}

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

// 太短的肢體：回傳 Set，例如 { 'LEFT_thigh' }
// 「應有長度」用整個人的大小推算：軀幹長度、以及各段肢體換算回來的軀幹長度取中間值，兩者取大的
// 不只看軀幹，因為正面拍、身體前傾時軀幹本身也會變短；取中間值，一兩段肢體變短不影響
export function shortSegments(landmarks, width, height) {
    const px = id => ({ x: landmarks[P[id]].x * width, y: landmarks[P[id]].y * height });
    const seen = (...ids) => ids.every(id => isVisible(landmarks[P[id]]));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const lengths = {};
    const scales = [];
    for (const [name, a, b, kind] of SEGMENTS) {
        if (!seen(a, b)) continue;
        lengths[name] = dist(px(a), px(b));
        scales.push(lengths[name] / SEGMENT_LENGTH[kind]);
    }
    let scale = 0;
    if (seen('LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_HIP', 'RIGHT_HIP')) {
        const mid = (a, b) => ({ x: (px(a).x + px(b).x) / 2, y: (px(a).y + px(b).y) / 2 });
        scale = dist(mid('LEFT_SHOULDER', 'RIGHT_SHOULDER'), mid('LEFT_HIP', 'RIGHT_HIP'));
    }
    if (scales.length) {
        scales.sort((x, y) => x - y);
        scale = Math.max(scale, scales[Math.floor((scales.length - 1) / 2)]);
    }
    const short = new Set();
    for (const [name, , , kind] of SEGMENTS) {
        if (lengths[name] === undefined) continue;
        if (lengths[name] < MIN_PIXELS || lengths[name] < scale * SEGMENT_LENGTH[kind] * MIN_FRACTION) short.add(name);
    }
    return short;
}

// 關節用到的肢體（軀幹不檢查：側面拍時軀幹一定夠長，正面拍的問題由 view.js 提示）
const JOINT_SEGMENTS = {
    KNEE: ['thigh', 'shank'],
    HIP: ['thigh'],
    ELBOW: ['upperArm', 'forearm']
};

// 算出所有關節角度；三個點都看得到才算，看不到的部位不給數字（避免用猜的點算出錯的角度）
// landmarks：畫面座標（0～1）；width、height：鏡頭畫面的像素大小
// 要換算成像素再算，因為畫面不是正方形（640×480 時，x 的 0.1 比 y 的 0.1 長）
// 回傳 { LEFT_KNEE: 92, … }，算不出來（看不到、或肢體在畫面上太短）的是 null
export function computeAngles(landmarks, width, height) {
    const px = p => ({ x: p.x * width, y: p.y * height, z: 0 });
    const short = shortSegments(landmarks, width, height);
    const result = {};
    for (const [key, , points] of ANGLES) {
        const ids = points.map(k => P[k]);
        const [side, joint] = key.split('_');
        const tooShort = JOINT_SEGMENTS[joint].some(seg => short.has(side + '_' + seg));
        result[key] = !tooShort && ids.every(i => isVisible(landmarks[i]))
            ? angleAt(px(landmarks[ids[0]]), px(landmarks[ids[1]]), px(landmarks[ids[2]]))
            : null;
    }
    return result;
}

// 有方向的角度（膝、髖）：一般彎曲是 0～180°，往反方向彎（膝蓋往後反折、弓箭步後腳的髖往後伸）超過 180°
// 例如膝蓋反折 5° 是 185°。用 2D 外積判斷關節在「上下兩點連線」的哪一邊，再對照人面向哪邊
// facing：view.js 的面向（1 = 右、-1 = 左）；看不出面向（正面拍）時無法判斷，回傳一般角度
// 手肘不判斷：手臂可以轉動，看不出哪邊是「前面」
export function signedAngle(key, angles, landmarks, width, height, facing) {
    const angle = angles[key];
    if (angle === null || !facing || !/_(KNEE|HIP)$/.test(key)) return angle;
    const [, , [a, b, c]] = ANGLES.find(([k]) => k === key);
    const pt = id => ({ x: landmarks[P[id]].x * width, y: landmarks[P[id]].y * height });
    const [pa, pb, pc] = [pt(a), pt(b), pt(c)];
    // 膝：膝蓋在 髖→踝 連線的前面是正常彎曲；髖：膝蓋在 肩→髖 延長線的前面是正常彎曲（大腿往前抬）
    // 畫面 y 往下，人面向右（facing = 1）時，正常彎曲的外積是負的
    const cross = (pc.x - pa.x) * (pb.y - pa.y) - (pc.y - pa.y) * (pb.x - pa.x);
    const crossHip = (pb.x - pa.x) * (pc.y - pb.y) - (pb.y - pa.y) * (pc.x - pb.x);
    const bentBack = (key.endsWith('KNEE') ? cross : crossHip) * facing > 0;
    return bentBack ? 360 - angle : angle;
}
