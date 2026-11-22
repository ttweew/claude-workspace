// 驗證工具：網站算的關節角度準不準
// 做法：擺一個姿勢不動，一個人用量角器量關節角度，另一個人在鏡頭畫面按「記下角度」；
//      做完後到使用說明頁「驗證實驗」把量角器的角度填進去，網站算出平均差幾度
// 10/22 起也可以用照片量角器（js/analysis/protractor.js）：在照片上拖三個點量，和 AI 在同一張照片上算的比，存成同一種紀錄（source: 'photo'）
// 記下的角度存在這台裝置上（最多 200 筆），不會上傳；可以下載成 CSV 放進報告
// 11/22 準確度比賽：每一筆記下是哪個模型算的（model）；照片量角器「也用另一個模型算」時，另一個模型算的角度也記下來（other），
// 統計分模型算、同一張照片兩個模型比誰和量角器差得少（statsByModel、duels）

import { ANGLES } from './angles.js';
import { isWorkout } from './workouts.js';
import { isModelKey, MODEL_KEYS, profileOf } from '../ai/models.js';

const KEY = 'angleSnapshots';
const MAX = 200;

export const JOINT_NAMES = Object.fromEntries(ANGLES.map(([key, name]) => [key, name]));
const JOINT_KEYS = ANGLES.map(([key]) => key);

// 量角器量得到的角度範圍：關節角度是 0～180°；打錯字（例如 900）不算進統計
export const MEASURE_RANGE = [0, 180];
export function validMeasure(v) {
    return typeof v === 'number' && Number.isFinite(v) && v >= MEASURE_RANGE[0] && v <= MEASURE_RANGE[1];
}

// 各關節的角度：不是數字的當作沒有（null）
function cleanAngles(a) {
    const angles = {};
    for (const key of JOINT_KEYS) angles[key] = a && typeof a[key] === 'number' && Number.isFinite(a[key]) ? a[key] : null;
    return angles;
}
// 另一個模型算的（11/22）：模型的代號先比對清單（js/ai/models.js 的 isModelKey，'constructor' 這種名字不能直接拿去查）
function cleanOther(o) {
    return o && typeof o === 'object' && isModelKey(o.model) && o.angles && typeof o.angles === 'object'
        ? { model: o.model, angles: cleanAngles(o.angles) } : null;
}

// 存起來的一筆可能被改過或損壞：關節不是認得的、角度不是數字的地方整理掉，不能用的整筆不要
function clean(s) {
    if (!s || typeof s !== 'object' || !s.angles || typeof s.angles !== 'object' || !JOINT_KEYS.includes(s.joint)) return null;
    const angles = cleanAngles(s.angles);
    const other = cleanOther(s.other);
    return {
        time: Number.isFinite(s.time) ? s.time : 0,
        workout: isWorkout(s.workout) ? s.workout : '',
        view: ['side', 'oblique', 'front'].includes(s.view) ? s.view : null,
        joint: s.joint,
        angles,
        measured: validMeasure(s.measured) ? s.measured : null,
        // 照片量角器量的才有；其他值（被改過）當成鏡頭畫面記下的
        ...(s.source === 'photo' ? { source: 'photo' } : {}),
        // 哪個模型算的（11/22）；11/22 以前記的沒有（那時只有 MediaPipe，統計時當作「沒寫模型」）
        ...(isModelKey(s.model) ? { model: s.model } : {}),
        ...(other && other.model !== s.model ? { other } : {})
    };
}

// pose：pipeline.process 的結果；workout：運動模式；joint：預設要比對的關節（例如深蹲是看得比較清楚那側的膝蓋）
// model：用哪個模型算的（11/22，js/ai/models.js 的代號）
export function makeSnapshot(pose, workout, joint, model = null) {
    const angles = {};
    for (const [key] of ANGLES) angles[key] = pose.angles[key] === null || pose.angles[key] === undefined ? null : Math.round(pose.angles[key] * 10) / 10;
    return { time: Date.now(), workout, view: pose.view ? pose.view.view : null, joint, angles, measured: null, ...(isModelKey(model) ? { model } : {}) };
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
    return summarize(differences(list));
}

// 一串差距（網站 − 量角器）的統計（stats、statsByModel 共用）
function summarize(d) {
    const n = d.length;
    if (!n) return { n: 0 };
    const mean = d.reduce((a, b) => a + b, 0) / n;
    const abs = d.map(Math.abs);
    const sd = n > 1 ? Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
    const within = limit => Math.round(abs.filter(x => x <= limit).length / n * 100);
    const r1 = x => Math.round(x * 10) / 10;
    return { n, bias: r1(mean), mae: r1(abs.reduce((a, b) => a + b, 0) / n), max: r1(Math.max(...abs)), sd: r1(sd), within5: within(5), within10: within(10) };
}

// ---------- 準確度比賽（11/22） ----------
// 一筆裡某個模型算的那個關節角度和量角器差多少（模型算 − 量角器）；沒量、沒算出來是 null
const diffOf = (angles, s) => {
    const a = angles ? angles[s.joint] : null;
    return validMeasure(s.measured) && typeof a === 'number' && Number.isFinite(a) ? a - s.measured : null;
};

// 每個模型和量角器差多少：每一筆算的模型（model），加上照片量角器「另一個模型」算的（other）
// 回傳 [{ model（代號；11/22 以前記的沒寫，是 ''）, ...stats 的數字 }]：照能力表的順序、沒寫模型的放最後，沒有資料的模型不列
export function statsByModel(list) {
    const by = new Map();
    const add = (model, d) => {
        if (d === null) return;
        if (!by.has(model)) by.set(model, []);
        by.get(model).push(d);
    };
    for (const s of list) {
        add(s.model || '', diffOf(s.angles, s));
        if (s.other) add(s.other.model, diffOf(s.other.angles, s));
    }
    return [...MODEL_KEYS, ''].filter(m => by.has(m)).map(m => ({ model: m, ...summarize(by.get(m)) }));
}

// 同一張照片兩個模型都算了（照片量角器的 other）：誰和量角器差得少
// 回傳 [{ a, b（兩個模型的代號，照能力表的順序）, n（幾張）, wins: { a, b, tie }（差距一樣算平手，取到小數第 1 位比）, maeA, maeB }]
export function duels(list) {
    const pairs = new Map();
    for (const s of list) {
        if (!s.other || !isModelKey(s.model)) continue;
        const d1 = diffOf(s.angles, s), d2 = diffOf(s.other.angles, s);
        if (d1 === null || d2 === null) continue;
        const [a, b] = [s.model, s.other.model].sort((x, y) => MODEL_KEYS.indexOf(x) - MODEL_KEYS.indexOf(y));
        const [da, db] = a === s.model ? [d1, d2] : [d2, d1];
        const key = a + '|' + b;
        if (!pairs.has(key)) pairs.set(key, { a, b, list: [] });
        pairs.get(key).list.push([Math.abs(da), Math.abs(db)]);
    }
    const r1 = x => Math.round(x * 10) / 10;
    return [...pairs.values()].map(({ a, b, list: l }) => {
        const wins = { a: 0, b: 0, tie: 0 };
        for (const [x, y] of l) {
            if (r1(x) < r1(y)) wins.a++;
            else if (r1(y) < r1(x)) wins.b++;
            else wins.tie++;
        }
        return { a, b, n: l.length, wins, maeA: r1(l.reduce((s, [x]) => s + x, 0) / l.length), maeB: r1(l.reduce((s, [, y]) => s + y, 0) / l.length) };
    });
}

// 下載用的 CSV（Excel 打得開：開頭加 BOM，中文才不會變亂碼）
export function toCSV(list) {
    // 來源放最後一欄（10/22 加的）：前面的欄位和以前一樣，舊的整理方式不用改
    // 11/22 再加模型、另一個模型（照片量角器「也用另一個模型算」）的四欄，一樣放最後
    const head = ['時間', '動作', '拍攝方向', '比對的關節', '網站角度', '量角器角度', '差距', ...ANGLES.map(([, name]) => name), '來源',
        '模型', '另一個模型', '另一個模型的角度', '另一個模型的差距'];
    // 文字開頭是 = + - @ 時，Excel 會當成公式執行：前面加 ' 當成一般文字（數字不受影響）
    const cell = v => (v === null || v === undefined ? '' : typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : String(v));
    const rows = list.map(s => {
        const site = s.angles[s.joint];
        const diff = !validMeasure(s.measured) || site === null || site === undefined ? '' : Math.round((site - s.measured) * 10) / 10;
        const other = s.other ? s.other.angles[s.joint] : null;
        const otherDiff = s.other ? diffOf(s.other.angles, s) : null;
        return [new Date(s.time).toLocaleString('zh-TW', { hour12: false }), s.workout, s.view, JOINT_NAMES[s.joint] || s.joint, site, s.measured, diff,
            ...ANGLES.map(([key]) => s.angles[key]), s.source === 'photo' ? '照片' : '鏡頭',
            s.model ? profileOf(s.model).label : '', s.other ? profileOf(s.other.model).label : '', other,
            otherDiff === null ? '' : Math.round(otherDiff * 10) / 10].map(cell).join(',');
    });
    return '﻿' + [head.join(','), ...rows].join('\r\n') + '\r\n';
}
