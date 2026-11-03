// AI 模型的資料（11/2）：實測檔 → 「一下一列」的資料表（給 11/3 的 Random Forest 訓練、和規則比）
// 每一列：哪個檔、受測者、動作、標記（這組要做的：做對，或故意做哪一種錯；來自實測模式記在檔案裡的 meta.test）、第幾下、
//   特徵（js/analysis/features.js：量到的數字，不是規則的判斷）、規則的判斷（另外一欄，只拿來和模型比，不是特徵）
// 標記是「這一組」要做的：故意做錯的組，每一下都標成那種錯（受測者每一下都照受測者卡做；做得不夠明顯的那幾下也一樣標，
// 這是實測資料本來的限制，要抽查：使用者 11/1 的「抽查自動標記」）
// 重錄的組（同一個人、同一個動作、同一組錄了好幾次，以最後一次為準，見 test-report.js 的 markRedos）不放進來：是做壞、中途停下來的
// 實測報表（js/pages/report.js）的「下載 AI 模型的資料」、tools/dataset.mjs 共用

import { featureColumns, itemFeatures } from '../analysis/features.js';
import { errorShort } from '../analysis/form.js';
import { WORKOUTS } from '../analysis/workouts.js';
import { WORKOUT_ORDER } from './test-report.js';

// 所有動作的特徵欄位合在一起（同一個 key 只出現一次，照實測報表的動作順序）：一個 CSV 放四個動作，沒有的欄位留空
export const DATASET_FEATURES = (() => {
    const seen = new Map();
    for (const w of WORKOUT_ORDER) for (const c of featureColumns(w)) if (!seen.has(c.key)) seen.set(c.key, c.name);
    return [...seen].map(([key, name]) => ({ key, name }));
})();

// 一組 → 每一下一列
// info：test-mode.js 的 testInfo（受測者、動作、這組要做的）；items：tracker 的每一下（重播、實測報表算的）；
// file：檔名；synthetic：合成的實測檔（tests/synthetic-sets.mjs，不是真人）
export function datasetRows(info, items, { file = '', synthetic = false } = {}) {
    return (Array.isArray(items) ? items : []).map((it, i) => {
        const features = itemFeatures(info.workout, it);
        return {
            file, subject: info.subject, workout: info.workout, condition: info.condition, conditionName: info.name,
            n: i + 1, features, ruleErrors: Array.isArray(it.errors) ? [...it.errors] : [], synthetic: !!synthetic
        };
    });
}

// 欄名：前面是誰、哪一組、標記；中間是特徵；最後是規則的判斷、是不是合成的
export const DATASET_HEAD = ['檔名', '受測者', '動作', '標記', '標記代號', '第幾下', ...DATASET_FEATURES.map(f => f.name), '規則判斷', '規則判斷代號', '合成資料'];

// 文字開頭是 = + - @、Tab、換行時前面加 '（Excel 不會當成公式執行）；有逗號、引號、換行的加引號（和實測報表、運動紀錄的 CSV 一樣）
function cell(v) {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : String(v);
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
}

// 一列的每一格（照 DATASET_HEAD）；這個動作沒有的特徵留空
export function datasetRow(r) {
    return [
        r.file, r.subject, WORKOUTS[r.workout].name, r.conditionName, r.condition, r.n,
        ...DATASET_FEATURES.map(f => (Object.prototype.hasOwnProperty.call(r.features, f.key) ? r.features[f.key] : null)),
        r.ruleErrors.map(errorShort).join('、') || '沒有錯誤', r.ruleErrors.join(' ') || 'good', r.synthetic ? '是' : '否'
    ];
}

// 整份 CSV：Excel 打得開（開頭加 BOM、換行用 \r\n）
export function datasetCsv(rows) {
    return '\uFEFF' + [DATASET_HEAD, ...rows.map(datasetRow)].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

// 檔名：ai_dataset_20261102_0930.csv
export function datasetFileName(now = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return 'ai_dataset_' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes()) + '.csv';
}

// 資料表的摘要（實測報表上寫幾行、tools/dataset.mjs 印出來）：幾下、幾位受測者、每個動作每種標記幾下、合成的幾下
// groups：[{ workout, condition, name（標記的中文）, n }]，和實測報表一樣照動作、做對在前面排
export function datasetSummary(rows) {
    const subjects = [...new Set(rows.map(r => r.subject))].sort();
    const groups = new Map();
    for (const r of rows) {
        const key = r.workout + '|' + r.condition;
        if (!groups.has(key)) groups.set(key, { workout: r.workout, condition: r.condition, name: r.conditionName, n: 0 });
        groups.get(key).n++;
    }
    const order = g => WORKOUT_ORDER.indexOf(g.workout) * 100 + (g.condition === 'good' ? 0 : 1);
    return {
        rows: rows.length, subjects, synthetic: rows.filter(r => r.synthetic).length,
        groups: [...groups.values()].sort((a, b) => order(a) - order(b) || a.condition.localeCompare(b.condition))
    };
}
