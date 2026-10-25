// 運動紀錄匯出 CSV（10/25 提案）：首頁「運動紀錄」→「下載 CSV」，自己用 Excel 畫圖、寫報告
// 只有這台裝置上的紀錄（最多 50 次，js/analysis/session.js）；雲端上的不在這裡
// 紀錄可能被改過：loadHistory 先整理掉欄位不對的那一筆；每一欄再檢查一次，不對的留空（不寫出 NaN、[object Object]）
import { WORKOUTS, isWorkout } from '../analysis/workouts.js';
import { errorName, countsReps, countAccuracy, ACTUAL_MAX } from '../analysis/session.js';
import { errorRule } from '../analysis/form.js';
import { validGoal, goalText } from '../analysis/goal.js';

export const HISTORY_HEAD = ['日期', '時間', '動作', '次數', '沒有錯誤的', '到位', '再低一點', '太淺', '最低角度', '平均角度', '每下秒數',
    '相似度', '最久（秒）', '總共（秒）', '錯誤', '目標', '達成目標', '自己數的', '計次準確率', '分鐘'];

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isCount = v => Number.isInteger(v) && v >= 0;
const pad = n => String(n).padStart(2, '0');

// 文字開頭是 = + - @、Tab、換行時前面加 '（Excel 不會當成公式執行）；有逗號、引號、換行的加引號（和實測報表的 CSV 一樣）
function cell(v) {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : String(v);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}

// 一次運動 → 一列（和首頁總結用同一份紀錄；秒數無條件捨去，和畫面、總結一樣）
export function historyRow(s) {
    const d = new Date(s.date);
    const date = isNum(s.date) && !Number.isNaN(d.getTime())
        ? [d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()), pad(d.getHours()) + ':' + pad(d.getMinutes())] : ['', ''];
    const w = isWorkout(s.workout) ? WORKOUTS[s.workout] : null;
    const reps = countsReps(s);
    const hold = !!w && w.kind === 'hold';
    // 錯誤：只寫認得的（舊版的代號、被改過的名字不寫），次數多的在前面：「上身前傾 2；腳跟離地 1」
    const errors = s.errors && typeof s.errors === 'object'
        ? Object.entries(s.errors).filter(([id, n]) => errorRule(s.workout, id) && isCount(n) && n > 0).sort((a, b) => b[1] - a[1])
            .map(([id, n]) => errorName(id) + ' ' + n).join('；')
        : '';
    const goal = validGoal(s.workout, s.goal) ? s.goal : null;
    const done = goal === null ? null : hold ? (isNum(s.best) ? Math.floor(s.best) >= goal : null) : s.count >= goal;
    const actual = reps && isCount(s.actual) && s.actual <= ACTUAL_MAX ? s.actual : null;
    return [
        ...date,
        w ? w.name : '',
        isCount(s.count) ? s.count : '',
        isCount(s.clean) ? s.clean : '',
        reps && isCount(s.good) ? s.good : '',
        reps && isCount(s.close) ? s.close : '',
        reps && isCount(s.shallow) ? s.shallow : '',
        reps && isNum(s.best) ? s.best : '',
        reps && isNum(s.average) ? s.average : '',
        reps && isNum(s.tempo) ? s.tempo : '',
        reps && isNum(s.similarity) && s.similarity >= 0 && s.similarity <= 100 ? Math.round(s.similarity) : '',
        hold && isNum(s.best) ? Math.floor(s.best) : '',
        hold && isNum(s.total) ? Math.floor(s.total) : '',
        errors,
        goal === null ? '' : goalText(s.workout, goal),
        done === null ? '' : done ? '是' : '否',
        actual === null ? '' : actual,
        actual === null ? '' : countAccuracy(s.count, actual) + '%',
        isNum(s.minutes) && s.minutes >= 0 ? Math.round(s.minutes * 10) / 10 : ''
    ];
}

// 整份 CSV：Excel 打得開（開頭加 BOM、換行用 \r\n），舊的在上面（和記錄的順序一樣）
export function historyCsv(list) {
    const rows = (Array.isArray(list) ? list : []).map(historyRow);
    return '﻿' + [HISTORY_HEAD, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// 檔名：workout_history_20261025_0930.csv（只有英文、數字和底線，每支手機都存得下來）
export function historyFileName(now = new Date()) {
    return 'workout_history_' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + '.csv';
}
