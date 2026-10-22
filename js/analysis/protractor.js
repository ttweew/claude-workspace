// 照片量角器（10/22）：在照片上把三個點拖到關節中心量角度，和 AI 在同一張照片上算的比
// 驗證實驗 A 的另一種做法：拍完再量，受測者只要被拍，現場不用另一個人拿量角器（量角器也很難對準關節中心）
// 量到的一筆存進驗證實驗 A 的清單（js/analysis/validate.js，來源寫「照片」），使用說明頁一起算平均誤差、下載 CSV
// 畫面在 js/pages/protractor.js；這裡只有計算

import { ANGLES } from './angles.js';
import { P, isVisible, clearerSide } from '../skeleton/landmarks.js';

// 可以量的關節：和網站算的一樣（膝、髖、肘，左右各一）；ids 是三個點，中間那個是關節
export const JOINTS = ANGLES.map(([key, name, ids]) => ({ key, name, ids }));

// 外面來的值（網頁上的選項、存的資料）先比對清單，不直接拿去查物件
export const isJoint = key => JOINTS.some(j => j.key === key);
export const jointOf = key => JOINTS.find(j => j.key === key) || null;

// 三個點（照片上的像素）在中間那一點的夾角（度）；和網站一樣用 2D 算（js/analysis/angles.js 的 computeAngles 也是畫面座標）
// 兩點重疊（量不出方向）回傳 null
export function pointAngle(a, b, c) {
    const ux = a.x - b.x, uy = a.y - b.y, vx = c.x - b.x, vy = c.y - b.y;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (!(len > 0)) return null;
    return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / len))) * 180 / Math.PI;
}

// AI 找到的三個點（像素）；有一點看不清楚（AI 用猜的）就回傳 null，改用預設的位置讓使用者自己拖
export function aiPoints(landmarks, key, width, height) {
    const joint = jointOf(key);
    if (!joint || !landmarks) return null;
    const pts = joint.ids.map(id => landmarks[P[id]]);
    if (!pts.every(isVisible)) return null;
    return pts.map(p => ({ x: p.x * width, y: p.y * height }));
}

// 沒有 AI 的點時的起始位置：照片中間一條直線（180°），使用者自己拖到關節上
export function startPoints(width, height) {
    return [0.3, 0.5, 0.7].map(f => ({ x: width / 2, y: height * f }));
}

// 預設量哪個關節：看得比較清楚那一側的膝蓋（實驗 A 主要量膝蓋）；找不到人時左膝
export function defaultJoint(landmarks) {
    return (landmarks ? clearerSide(landmarks) : 'LEFT') + '_KNEE';
}

// 角度寫到小數第 1 位（和鏡頭畫面「記下角度」一樣）
const r1 = v => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

// 存進驗證實驗 A 的一筆：格式和鏡頭畫面「記下角度」一樣（js/analysis/validate.js 的 makeSnapshot），多一個 source: 'photo'
//   angles：AI 在這張照片上算的各關節角度（找不到人時都是 null，差距就空著）；view：AI 判斷的拍攝方向
//   measured：使用者拖三個點量到的角度，直接填進「量角器」那一欄
export function photoSnapshot(angles, view, key, measured, time = Date.now()) {
    const out = {};
    for (const j of JOINTS) out[j.key] = r1(angles ? angles[j.key] : null);
    return { time, workout: '', view: view || null, joint: key, angles: out, measured: r1(measured), source: 'photo' };
}
