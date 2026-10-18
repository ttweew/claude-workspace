// 驗證工具：網站算的關節角度準不準
// 做法：擺一個姿勢不動，一個人用量角器量關節角度，另一個人在鏡頭畫面按「記下角度」；
//      做完後到使用說明頁「驗證實驗」把量角器的角度填進去，網站算出平均差幾度
// 記下的角度存在這台裝置上（最多 200 筆），不會上傳；可以下載成 CSV 放進報告

import { ANGLES } from './angles.js';
import { isWorkout } from './workouts.js';

const KEY = 'angleSnapshots';
const MAX = 200;

export const JOINT_NAMES = Object.fromEntries(ANGLES.map(([key, name]) => [key, name]));
const JOINT_KEYS = ANGLES.map(([key]) => key);

// 量角器量得到的角度範圍：關節角度是 0～180°；打錯字（例如 900）不算進統計
export const MEASURE_RANGE = [0, 180];
export function validMeasure(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= MEASURE_RANGE[0] && v <= MEASURE_RANGE[1];
}

// 存起來的一筆可能被改過或損壞：關節不是認得的、角度不是數字的地方整理掉，不能用的整筆不要
function clean(s) {
    if (!s || typeof s !== 'object' || !s.angles || typeof s.angles !== 'object' || !JOINT_KEYS.includes(s.joint)) return null;
    const angles = {};
    for (const key of JOINT_KEYS) angles[key] = typeof s.angles[key] === 'number' && Number.isFinite(s.angles[key]) ? s.angles[key] : null;
    return {
        time: Number.isFinite(s.time) ? s.time : 0,
        workout: isWorkout(s.workout) ? s.workout : '',
        view: ['side', 'oblique', 'front'].includes(s.view) ? s.view : null,
        joint: s.joint,
        angles,
        measured: validMeasure(s.measured) ? s.measured : null
    };
}

// pose：pipeline.process 的結果；workout：運動模式；joint：預設要比對的關節（例如深蹲是看得比較清楚那側的膝蓋）
export function makeSnapshot(pose, workout, joint) {
    const angles = {};
    for (const [key] of ANGLES) angles[key] = pose.angles[key] === null || pose.angles[key] === undefined ? null : Math.round(pose.angles[key] * 10) / 10;
    return { time: Date.now(), workout, view: pose.view ? pose.view.view : null, joint, angles, measured: null };
}

export function loadSnapshots() {
    try {
        const list = JSON.parse(localStorage.getItem(KEY) || '[]');
        return Array.isArray(list) ? list.map(clean).filter(Boolean) : [];
    } catch (err) {
        return [];
    }
}
export function saveSnapshots(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (err) { /* 存不了就算了 */ }
}
export function addSnapshot(snapshot) {
    const list = loadSnapshots();
    list.push(snapshot);
    saveSnapshots(list);
    return list.length;
}
export function clearSnapshots() {
    try { localStorage.removeItem(KEY); } catch (err) { /* 沒關係 */ }
}

// 每一筆的差距：網站 − 量角器（正數代表網站算得比較大）；沒填量角器或網站沒算出來的不算
export function differences(list) {
    return list
        .map(s => (!validMeasure(s.measured) || s.angles[s.joint] === null || s.angles[s.joint] === undefined
            ? null : s.angles[s.joint] - s.measured))
        .filter(d => d !== null && Number.isFinite(d));
}

// 統計：筆數、平均差（偏差，看網站是不是固定偏大或偏小）、平均絕對誤差、最大誤差、標準差、在 ±5°／±10° 以內的比例
export function stats(list) {
    const d = differences(list);
    const n = d.length;
    if (!n) return { n: 0 };
    const mean = d.reduce((a, b) => a + b, 0) / n;
    const abs = d.map(Math.abs);
    const sd = n > 1 ? Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
    const within = limit => Math.round(abs.filter(x => x <= limit).length / n * 100);
    const r1 = x => Math.round(x * 10) / 10;
    return { n, bias: r1(mean), mae: r1(abs.reduce((a, b) => a + b, 0) / n), max: r1(Math.max(...abs)), sd: r1(sd), within5: within(5), within10: within(10) };
}

// 下載用的 CSV（Excel 打得開：開頭加 BOM，中文才不會變亂碼）
export function toCSV(list) {
    const head = ['時間', '動作', '拍攝方向', '比對的關節', '網站角度', '量角器角度', '差距', ...ANGLES.map(([, name]) => name)];
    // 文字開頭是 = + - @ 時，Excel 會當成公式執行：前面加 ' 當成一般文字（數字不受影響）
    const cell = v => (v === null || v === undefined ? '' : typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : String(v));
    const rows = list.map(s => {
        const site = s.angles[s.joint];
        const diff = !validMeasure(s.measured) || site === null || site === undefined ? '' : Math.round((site - s.measured) * 10) / 10;
        return [new Date(s.time).toLocaleString('zh-TW', { hour12: false }), s.workout, s.view, JOINT_NAMES[s.joint] || s.joint, site, s.measured, diff,
            ...ANGLES.map(([key]) => s.angles[key])].map(cell).join(',');
    });
    return '﻿' + [head.join(','), ...rows].join('\r\n') + '\r\n';
}
