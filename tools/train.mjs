// AI 模型（11/3）：訓練 Random Forest，和規則、DTW 比（命令列）
// 用法（在專案資料夾）：
//   node tools/train.mjs --synthetic A,B,C,D,E,F,G,H --test G,H         合成的受測者（tests/synthetic-sets.mjs，不是真人），G、H 當測試
//   node tools/train.mjs 實測檔或資料夾… --test C [--out models.json]    真人的實測檔
// 每個動作一個模型：用訓練的受測者長森林，拿測試的受測者比 AI 模型、規則、DTW 各猜對幾下（tools/evaluate.mjs）
// 訓練和測試照受測者分（tools/split.mjs），混到就不訓練；--out 把每個動作的模型存成一個 JSON（11/4 放進網站）
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildDataset, readSources } from './dataset.mjs';
import { splitBySubject, checkSplit, splitLine } from './split.mjs';
import { rulePrediction, fitSimilarity, similarityPrediction, score, ratio, learnedLimit } from './evaluate.mjs';
import { trainModel, predictModel, featureUse } from '../js/analysis/forest.js';
import { featureColumns } from '../js/analysis/features.js';
import { FORM_RULES } from '../js/analysis/form.js';
import { WORKOUTS } from '../js/analysis/workouts.js';
import { WORKOUT_ORDER } from '../js/data/test-report.js';

// 一個動作：用 train 訓練、拿 test 比 → { workout, model, threshold（DTW 的門檻）, train, test（幾下）, forest, rules, dtw（成績） }
export function compareOne(workout, train, test, options = {}) {
    const tr = train.filter(r => r.workout === workout), te = test.filter(r => r.workout === workout);
    const model = trainModel(workout, tr, options);
    const threshold = fitSimilarity(tr);
    const limits = FORM_RULES[workout].map(rule => ({ id: rule.id, rule: rule.why.limit, unit: rule.why.unit, learned: learnedLimit(model, tr, rule.id) }));
    return {
        workout, model, threshold, limits, train: tr.length, test: te.length,
        forest: score(te, te.map(r => predictModel(model, r.features).label)),
        rules: score(te, te.map(rulePrediction)),
        dtw: score(te, te.map(r => similarityPrediction(r, threshold)), { kinds: false })
    };
}

// 訓練、測試都有的每個動作（照實測報表的順序）
export function compareAll(train, test, options = {}) {
    return WORKOUT_ORDER.filter(w => train.some(r => r.workout === w) && test.some(r => r.workout === w)).map(w => compareOne(w, train, test, options));
}

// 幾個動作的成績加起來（DTW 分不出種類的，種類也是「不比」）
export function addScores(list) {
    const out = { n: 0, kind: 0, binary: 0, good: { hit: 0, n: 0 }, wrong: { hit: 0, n: 0 } };
    for (const s of list) {
        if (!s.n) continue;
        out.n += s.n;
        out.kind = out.kind === null || s.kind === null ? null : out.kind + s.kind;
        out.binary += s.binary;
        for (const side of ['good', 'wrong']) { out[side].hit += s[side].hit; out[side].n += s[side].n; }
    }
    return out;
}

// AI 模型學到的門檻（和規則比）、最常看的三個數字（11/3：說得出模型為什麼和規則不一樣）
const NAMES = { lean: '上身前傾', heel: '腳跟離地', sag: '腰往下彎', pike: '屁股往上翹', knee: '前膝超過腳尖' };
export function useLine(r) {
    const names = new Map(featureColumns(r.workout).map(c => [c.key, c.name.replace(/（.*）$/, '')]));
    const n = v => Math.round(v * 10) / 10;
    return '  AI 模型學到的門檻：' + r.limits.map(l => NAMES[l.id] + ' ' + (l.learned === null ? '—' : n(l.learned) + l.unit) + '（規則 ' + n(l.rule) + l.unit + '）').join('、')
        + '；最常看：' + featureUse(r.model).slice(0, 3).map(u => names.get(u.key)).join('、');
}

// 給人看的幾行
const line = (name, s) => '  ' + name + '：猜對種類 ' + ratio(s.kind, s.n) + '；做對、做錯分對 ' + ratio(s.binary, s.n)
    + '；做對的判成做對 ' + ratio(s.good.hit, s.good.n) + '；做錯的抓到 ' + ratio(s.wrong.hit, s.wrong.n);
export function resultLines(results) {
    const lines = [];
    for (const r of results) {
        lines.push(WORKOUTS[r.workout].name + '（訓練 ' + r.train + ' 下、測試 ' + r.test + ' 下）');
        lines.push(line('AI 模型', r.forest), useLine(r), line('規則', r.rules));
        if (r.dtw.n) lines.push(line('DTW（相似度 ' + r.threshold + ' 以上算做對）', r.dtw));
    }
    lines.push('全部的動作');
    lines.push(line('AI 模型', addScores(results.map(r => r.forest))), line('規則', addScores(results.map(r => r.rules))));
    lines.push(line('DTW（棒式沒有相似度，不算）', addScores(results.map(r => r.dtw))));
    return lines;
}

async function main(args) {
    let out = null, synthetic = null, testSubjects = null;
    const paths = [];
    const codes = text => String(text || '').split(',').map(c => c.trim()).filter(Boolean);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--out') out = args[++i];
        else if (args[i] === '--synthetic') synthetic = args[++i];
        else if (args[i] === '--test') testSubjects = codes(args[++i]);
        else paths.push(args[i]);
    }
    if ((!paths.length && !synthetic) || !testSubjects || !testSubjects.length) {
        console.error('用法：node tools/train.mjs 實測檔或資料夾… --test C [--out models.json]，或 node tools/train.mjs --synthetic A,B,C,D --test D');
        process.exitCode = 1;
        return;
    }
    const sources = await readSources(paths);
    if (synthetic) {
        const { syntheticSubject } = await import('../tests/synthetic-sets.mjs');
        for (const code of codes(synthetic)) sources.push(...syntheticSubject(code));
    }
    const { rows, failed } = await buildDataset(sources);
    for (const f of failed) console.log('沒有讀到 ' + f.name + '：' + f.why);
    const parts = splitBySubject(rows, testSubjects);
    const problems = checkSplit(parts.train, parts.test);
    console.log(splitLine(parts));
    if (problems.length) {
        console.log('不訓練：' + problems.join('；'));
        process.exitCode = 1;
        return;
    }
    const synth = rows.filter(r => r.synthetic).length;
    if (synth) console.log('其中 ' + synth + ' 列是合成的（示範動畫的火柴人，不是真人）：只能拿來試流程，準確率不能當成研究結果');
    const results = compareAll(parts.train, parts.test);
    console.log(resultLines(results).join('\n'));
    if (out) {
        const file = { version: 1, synthetic: synth > 0, subjects: [...new Set(parts.train.map(r => r.subject))].sort(), models: results.map(r => r.model) };
        await writeFile(out, JSON.stringify(file));
        console.log('模型存到 ' + out);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
