// AI 模型的資料檢查（11/2 保養）：訓練和測試資料不能混到
// 同一個人的每一下很像（同一個身材、同一種做法、同一支手機、同一天拍）：如果有些下拿去訓練、有些拿去測試，
// 模型等於先看過考題，測出來的準確率會比遇到新的人時好看。所以照受測者分，同一個人只會在一邊
// （11/3 交叉驗證：每次留一位受測者當測試）
// 只能照代號分：同一個人用了兩個代號（例如 C 和 C2）這裡分不出來，實測時同一個人要一直用同一個代號
// 訓練 AI 模型用（tools/），網站不用
import { WORKOUTS } from '../js/analysis/workouts.js';

// rows：js/data/dataset.js 的資料表（每一下一列）；testSubjects：當測試的受測者代號
// 回傳 { train, test }：每一列只在一邊，順序不變
export function splitBySubject(rows, testSubjects) {
    const test = new Set(testSubjects);
    return { train: rows.filter(r => !test.has(r.subject)), test: rows.filter(r => test.has(r.subject)) };
}

// 檢查訓練、測試有沒有混到：回傳問題（一個問題一句；沒有問題是空陣列）
//   同一個受測者、同一個檔案兩邊都有；有一邊是空的；
//   測試資料有、訓練資料沒有的標記（模型沒學過這種錯，一定答錯：準確率會被低估，要寫出來；訓練資料是空的時候不另外列）
export function checkSplit(train, test) {
    const problems = [];
    const shared = key => {
        const seen = new Set(train.map(key));
        return [...new Set(test.map(key))].filter(v => seen.has(v)).sort();
    };
    const subjects = shared(r => r.subject);
    if (subjects.length) problems.push('受測者兩邊都有：' + subjects.join('、'));
    // 檔案很多時只列前 3 個
    const files = shared(r => r.file);
    if (files.length) problems.push('同一個檔案兩邊都有：' + files.slice(0, 3).join('、') + (files.length > 3 ? ' 等 ' + files.length + ' 個' : ''));
    if (!train.length) problems.push('訓練資料是空的');
    if (!test.length) problems.push('測試資料是空的');
    const learned = new Set(train.map(r => r.workout + '|' + r.condition));
    const unseen = new Map();
    for (const r of test) if (!learned.has(r.workout + '|' + r.condition)) unseen.set(r.workout + '|' + r.condition, WORKOUTS[r.workout].name + ' ' + r.conditionName);
    if (train.length && unseen.size) problems.push('測試資料有、訓練資料沒有的標記：' + [...unseen.values()].join('、'));
    return problems;
}

// 給人看的一行：「訓練：A、B、C（189 列）；測試：D（63 列）」
export function splitLine({ train, test }) {
    const who = rows => [...new Set(rows.map(r => r.subject))].sort().join('、') || '沒有';
    return '訓練：' + who(train) + '（' + train.length + ' 列）；測試：' + who(test) + '（' + test.length + ' 列）';
}
