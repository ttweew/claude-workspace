// 老師 11/18：precision、accuracy、recall、F1。用 11/3 的交叉驗證（8 位合成受測者輪流當測試）算 AI 模型、規則、DTW 的四個指標
// 「做錯」當作要抓的那一類（positive）：精確率＝報錯的裡面真的做錯的比例；召回率＝真的做錯的裡面抓到的比例
import { buildDataset } from '/home/user/claude-workspace/tools/dataset.mjs';
import { splitBySubject } from '/home/user/claude-workspace/tools/split.mjs';
import { rulePrediction, fitSimilarity, similarityPrediction } from '/home/user/claude-workspace/tools/evaluate.mjs';
import { trainModel, predictModel } from '/home/user/claude-workspace/js/analysis/forest.js';
import { syntheticSubject } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';
import { WORKOUT_ORDER } from '/home/user/claude-workspace/js/data/test-report.js';

const sources = [];
for (const c of 'ABCDEFGH') sources.push(...syntheticSubject(c));
const { rows } = await buildDataset(sources);
const subjects = [...new Set(rows.map(r => r.subject))].sort();
const preds = { forest: [], rules: [], dtw: [] };
for (const s of subjects) {
    const { train, test } = splitBySubject(rows, [s]);
    for (const w of WORKOUT_ORDER) {
        const tr = train.filter(r => r.workout === w), te = test.filter(r => r.workout === w);
        if (!tr.length || !te.length) continue;
        const model = trainModel(w, tr);
        const th = fitSimilarity(tr);
        for (const r of te) {
            preds.forest.push([r.condition, predictModel(model, r.features).label, w]);
            preds.rules.push([r.condition, rulePrediction(r), w]);
            preds.dtw.push([r.condition, similarityPrediction(r, th), w]);
        }
    }
}
const pct = x => (x * 100).toFixed(1) + '%';
function binary(list) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const [t, p] of list) {
        if (p === null || p === undefined) continue;
        const T = t !== 'good', P = p !== 'good';
        if (T && P) tp++; else if (!T && P) fp++; else if (T && !P) fn++; else tn++;
    }
    const P = tp / (tp + fp), R = tp / (tp + fn), A = (tp + tn) / (tp + fp + fn + tn), F = 2 * P * R / (P + R);
    return { tp, fp, fn, tn, P, R, A, F };
}
function macro(list) {   // 每一種（做對、各種錯誤）各算精確率、召回率、F1，再平均（看得出哪一種錯誤比較弱）
    const labels = [...new Set(list.map(x => x[0]))];
    let f1 = 0, n = 0, exact = 0, total = 0;
    for (const [t, p] of list) { if (p == null) continue; total++; if (t === p) exact++; }
    for (const L of labels) {
        let tp = 0, fp = 0, fn = 0;
        for (const [t, p] of list) { if (p == null) continue; if (t === L && p === L) tp++; else if (t !== L && p === L) fp++; else if (t === L && p !== L) fn++; }
        const P = tp + fp ? tp / (tp + fp) : 0, R = tp + fn ? tp / (tp + fn) : 0;
        f1 += P + R ? 2 * P * R / (P + R) : 0; n++;
    }
    return { exactAcc: exact / total, macroF1: f1 / n, total };
}
for (const k of ['forest', 'rules', 'dtw']) {
    const b = binary(preds[k]);
    const m = k === 'dtw' ? null : macro(preds[k]);
    console.log(k.padEnd(7), `TP ${b.tp} FP ${b.fp} FN ${b.fn} TN ${b.tn} | 精確率 ${pct(b.P)} 召回率 ${pct(b.R)} 準確率 ${pct(b.A)} F1 ${pct(b.F)}` + (m ? ` | 分到對的那一種 ${pct(m.exactAcc)}（${m.total} 下）macro-F1 ${pct(m.macroF1)}` : ''));
}
