// AI 模型（11/3）：訓練 Random Forest，和規則、DTW 比（命令列）
// 用法（在專案資料夾）：
//   node tools/train.mjs --synthetic A,B,C,D,E,F,G,H --test G,H         合成的受測者（tests/synthetic-sets.mjs，不是真人），G、H 當測試
//   node tools/train.mjs 實測檔或資料夾… --test C [--out models.json]    真人的實測檔
//   node tools/train.mjs --synthetic A,B,C,D --cv [--out models.json]    交叉驗證（11/3 保養）：每一位輪流當測試
// 每個動作一個模型：用訓練的受測者長森林，拿測試的受測者比 AI 模型、規則、DTW 各猜對幾下（tools/evaluate.mjs）
// 訓練和測試照受測者分（tools/split.mjs），混到就不訓練；--out 把每個動作的模型存成一個 JSON
// （加 --cv 時存的是用全部受測者訓練的模型：交叉驗證只是用來估準確率）
// --module js/analysis/ai-model.js（要加 --cv，11/4）：存成網站用的模型（JS 模組，重播分析、實測報表的「AI 判斷」）：
//   node tools/train.mjs --synthetic A,B,C,D,E,F,G,H --cv --module js/analysis/ai-model.js
//   真人的實測檔來了：node tools/train.mjs 實測檔資料夾 --cv --module js/analysis/ai-model.js
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

// ---------- 交叉驗證（11/3 保養） ----------
// 每次留一位受測者當測試、其他人訓練，每一位都輪一次（leave-one-subject-out）
// 只用一種分法（例如 G、H 當測試）運氣成分大：剛好那兩位好分，準確率就好看。每個人都當一次測試、加起來，
// 每一下剛好被「沒看過這個人的模型」猜過一次，也看得出哪一位特別難分、學到的門檻每次差多少
// 每一次都先檢查訓練、測試有沒有混到（split.mjs）：同一個人、同一個檔案兩邊都有、有一邊是空的就停；
// 「測試的標記訓練沒有」照樣算（例如只有這位做了棒式），問題寫在那一次
const UNSEEN = '測試資料有、訓練資料沒有的標記';
export function crossValidate(rows, options = {}) {
    const subjects = [...new Set(rows.map(r => r.subject))].sort();
    if (subjects.length < 2) throw new Error('受測者要 2 位以上才能交叉驗證');
    return subjects.map(subject => {
        const { train, test } = splitBySubject(rows, [subject]);
        const problems = checkSplit(train, test);
        const mixed = problems.filter(p => !p.startsWith(UNSEEN));
        if (mixed.length) throw new Error(subject + ' 當測試時混到了：' + mixed.join('；'));
        return { subject, problems, results: compareAll(train, test, options) };
    });
}

// 每一次同一個動作的成績加起來（每一下剛好被猜過一次）、學到的門檻每一次的範圍
// → [{ workout, test（幾下）, forest, rules, dtw, limits: [{ id, rule, unit, low, high }] }]
export function foldTotals(folds) {
    return WORKOUT_ORDER.map(workout => {
        const list = folds.flatMap(f => f.results.filter(r => r.workout === workout));
        if (!list.length) return null;
        const limits = list[0].limits.map(({ id, rule, unit }) => {
            const learned = list.map(r => r.limits.find(l => l.id === id).learned).filter(v => v !== null);
            return { id, rule, unit, low: learned.length ? Math.min(...learned) : null, high: learned.length ? Math.max(...learned) : null };
        });
        return {
            workout, test: list.reduce((s, r) => s + r.test, 0), limits,
            forest: addScores(list.map(r => r.forest)), rules: addScores(list.map(r => r.rules)), dtw: addScores(list.map(r => r.dtw))
        };
    }).filter(Boolean);
}

// 給人看的幾行：每一位當測試時的正確率、每個動作加起來（含學到的門檻範圍）、全部
const pct = s => (s.n && s.kind !== null ? Math.round(s.kind / s.n * 100) + '%' : '—');
export function cvLines(folds) {
    const n = v => Math.round(v * 10) / 10;
    const lines = ['交叉驗證：每次留一位受測者當測試、其他人訓練，共 ' + folds.length + ' 次'];
    lines.push('每一位當測試時猜對種類（AI 模型／規則）：' + folds.map(f => f.subject + ' '
        + pct(addScores(f.results.map(r => r.forest))) + '／' + pct(addScores(f.results.map(r => r.rules)))).join('、'));
    for (const f of folds) for (const p of f.problems) lines.push('  ' + f.subject + ' 當測試：' + p);
    const totals = foldTotals(folds);
    for (const t of totals) {
        lines.push(WORKOUTS[t.workout].name + '（每一下都被猜過一次，共 ' + t.test + ' 下）');
        lines.push(line('AI 模型', t.forest));
        lines.push('  AI 模型學到的門檻（每一次）：' + t.limits.map(l => NAMES[l.id] + ' '
            + (l.low === null ? '—' : n(l.low) + (l.high !== l.low ? '～' + n(l.high) : '') + l.unit) + '（規則 ' + n(l.rule) + l.unit + '）').join('、'));
        lines.push(line('規則', t.rules));
        if (t.dtw.n) lines.push(line('DTW（門檻每一次用訓練資料挑）', t.dtw));
    }
    lines.push('全部的動作');
    lines.push(line('AI 模型', addScores(totals.map(t => t.forest))), line('規則', addScores(totals.map(t => t.rules))));
    lines.push(line('DTW（棒式沒有相似度，不算）', addScores(totals.map(t => t.dtw))));
    return lines;
}

// 網站用的模型檔（JS 模組）：開頭寫怎麼產生的、交叉驗證的成績，內容是一行 JSON
export function moduleText(file, command, cvSummary) {
    return '// AI 模型（自動產生，不要手改；js/analysis/ai-judge.js 用）：' + command + '\n'
        + (file.synthetic ? '// 用合成資料（示範動畫的火柴人，不是真人）訓練的示範模型：真人的實測檔來了要重新訓練（docs/architecture.md「AI 模型」）\n' : '')
        + '// 受測者：' + file.subjects.join('、') + '；交叉驗證（每一位輪流當測試）：' + cvSummary + '\n'
        + 'export default ' + JSON.stringify(file) + ';\n';
}

async function main(args) {
    let out = null, synthetic = null, testSubjects = null, cv = false, moduleOut = null;
    const paths = [];
    const codes = text => String(text || '').split(',').map(c => c.trim()).filter(Boolean);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--out') out = args[++i];
        else if (args[i] === '--synthetic') synthetic = args[++i];
        else if (args[i] === '--test') testSubjects = codes(args[++i]);
        else if (args[i] === '--cv') cv = true;
        else if (args[i] === '--module') moduleOut = args[++i];
        else paths.push(args[i]);
    }
    if ((!paths.length && !synthetic) || (!cv && (!testSubjects || !testSubjects.length)) || (moduleOut && !cv)) {
        console.error('用法：node tools/train.mjs 實測檔或資料夾… --test C（或 --cv）[--out models.json]，或 node tools/train.mjs --synthetic A,B,C,D --test D（或 --cv）；--module 要和 --cv 一起用');
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
    const synth = rows.filter(r => r.synthetic).length;
    if (cv) {
        if (synth) console.log('其中 ' + synth + ' 列是合成的（示範動畫的火柴人，不是真人）：只能拿來試流程，準確率不能當成研究結果');
        let folds;
        try {
            folds = crossValidate(rows);
            console.log(cvLines(folds).join('\n'));
        } catch (err) {
            console.log('不訓練：' + err.message);
            process.exitCode = 1;
            return;
        }
        if (out || moduleOut) {
            const models = WORKOUT_ORDER.filter(w => rows.some(r => r.workout === w)).map(w => trainModel(w, rows));
            const file = { version: 1, synthetic: synth > 0, subjects: [...new Set(rows.map(r => r.subject))].sort(), models };
            if (out) {
                await writeFile(out, JSON.stringify(file));
                console.log('模型（全部受測者訓練）存到 ' + out);
            }
            if (moduleOut) {
                const totals = foldTotals(folds);
                const sum = key => addScores(totals.map(t => t[key]));
                const cvSummary = 'AI 模型猜對 ' + ratio(sum('forest').kind, sum('forest').n) + '、規則 ' + ratio(sum('rules').kind, sum('rules').n);
                const command = 'node tools/train.mjs ' + args.filter(a => a !== moduleOut && a !== '--module').join(' ') + ' --module ' + moduleOut;
                await writeFile(moduleOut, moduleText(file, command, cvSummary));
                console.log('網站用的模型存到 ' + moduleOut);
            }
        }
        return;
    }
    const parts = splitBySubject(rows, testSubjects);
    const problems = checkSplit(parts.train, parts.test);
    console.log(splitLine(parts));
    if (problems.length) {
        console.log('不訓練：' + problems.join('；'));
        process.exitCode = 1;
        return;
    }
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
