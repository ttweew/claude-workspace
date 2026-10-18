// 雲端同步的規則（不碰 Firebase，可以直接測試）：每一筆的代號、上傳哪些欄位、哪幾筆還沒上傳
// 上傳的只有運動總結的數字（下面的白名單），沒有影像、沒有關鍵點座標
// 欄位的範圍和雲端的安全規則（firestore.rules）是同一套：這裡送得出去的，雲端一定收；改其中一邊要一起改另一邊

import { WORKOUTS, WORKOUT_IDS } from '../analysis/workouts.js';
import { FORM_RULES } from '../analysis/form.js';
import { validSession } from '../analysis/session.js';

export const SCHEMA = 1;   // 雲端資料的格式版本（欄位改了就加 1，舊的資料看得出來是哪一版）

// 雲端收哪些動作（自由模式沒有總結）、哪些是計時的（棒式）、有哪些錯誤代號
export const CLOUD_WORKOUTS = WORKOUT_IDS.filter(id => WORKOUTS[id].kind);
export const HOLD_WORKOUTS = CLOUD_WORKOUTS.filter(id => WORKOUTS[id].kind === 'hold');
export const ERROR_IDS = [...new Set(Object.values(FORM_RULES).flat().map(r => r.id))];

// 每一筆的代號：動作＋開始時間（同一台裝置不會在同一毫秒開始同一個動作）
// 同一筆重傳會蓋掉自己，不會變成兩筆，所以斷線重傳、重複按都沒關係
export const sessionId = s => s.workout + '-' + s.date;

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

// 一筆本機紀錄 → 要上傳的內容；格式不對（舊版存的、被改過的）回傳 null，不上傳
export function cloudSession(s) {
    if (!validSession(s) || !CLOUD_WORKOUTS.includes(s.workout)) return null;
    if (!isInt(s.date, 1600000000000, 4100000000000) || s.count > 100000) return null;
    const out = { v: SCHEMA, workout: s.workout, date: s.date, count: s.count, clean: s.clean };
    if (isNum(s.minutes, 0, 100000)) out.minutes = s.minutes;
    // 錯誤次數：只收認得的錯誤代號（舊版的代號不收，其他照樣上傳）；每一種最多和次數一樣多
    const errors = {};
    for (const [id, n] of Object.entries(s.errors)) {
        if (!ERROR_IDS.includes(id)) continue;
        if (n > s.count) return null;
        errors[id] = n;
    }
    out.errors = errors;
    if (HOLD_WORKOUTS.includes(s.workout)) {
        // 棒式：最久、總共幾秒；每一次的秒數（數量要和次數一樣）
        if (!isNum(s.best, 0, 86400) || !isNum(s.total, 0, 864000) || s.best > s.total) return null;
        Object.assign(out, { best: s.best, total: s.total });
        if (Array.isArray(s.seconds) && s.seconds.length === s.count && s.seconds.every(v => isInt(v, 0, 86400))) out.seconds = s.seconds;
        return out;
    }
    // 計次：到位／再低一點／太淺、最低和平均角度、每下幾秒、和示範動作的相似度
    if (!isNum(s.best, 0, 180) || !isNum(s.average, 0, 180) || s.best > s.average || !isNum(s.tempo, 0, 3600)) return null;
    Object.assign(out, { good: s.good, close: s.close, shallow: s.shallow, best: s.best, average: s.average, tempo: s.tempo });
    out.similarity = isNum(s.similarity, 0, 100) ? s.similarity : null;
    return out;
}

// ---------- 哪幾筆已經上傳（這台裝置的 localStorage） ----------
// 記的是雲端帳號（uid）和已上傳的代號；換了帳號（例如清掉瀏覽器資料後變成新的匿名帳號）就重新上傳全部
const KEY = 'cloudSynced';
const MAX = 500;   // 本機紀錄最多 50 次，記 500 個代號綽綽有餘

export function loadSynced(uid) {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved && saved.uid === uid && Array.isArray(saved.ids)) return new Set(saved.ids.filter(id => typeof id === 'string'));
    } catch (err) { /* 壞掉就當作還沒上傳過：重傳會蓋掉自己，不會重複 */ }
    return new Set();
}
export function saveSynced(uid, ids) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ uid, ids: [...ids].slice(-MAX) }));
    } catch (err) { /* 存不了：下次再傳一次，結果一樣 */ }
}
export function forgetSynced() {
    try { localStorage.removeItem(KEY); } catch (err) { /* 不能存取就算了 */ }
}
// 這台裝置有沒有上傳過（「刪除雲端的紀錄」按鈕要不要出現）
export function hasSynced() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        return !!(saved && Array.isArray(saved.ids) && saved.ids.length);
    } catch (err) {
        return false;
    }
}

// 本機紀錄裡還沒上傳的（格式不對的不算：上傳了雲端也不收，留著只會一直重試）
export function pendingSessions(history, synced) {
    return history.filter(s => cloudSession(s) && !synced.has(sessionId(s)));
}
