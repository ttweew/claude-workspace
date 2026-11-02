// AI 模型的資料（11/2）：命令列版的實測報表「下載 AI 模型的資料」，同一套算法（js/data/report-core.js、test-report.js、dataset.js）
// 用法（在專案資料夾）：
//   node tools/dataset.mjs 實測檔或資料夾… --out ai_dataset.csv     讀實測模式錄的 JSON（資料夾裡的 .json 都讀；zip 先解開）
//   node tools/dataset.mjs --synthetic A,B,C --out ai_dataset.csv   還沒有真人實測檔時：合成的受測者（tests/synthetic-sets.mjs，不是真人）
//   加上 --test C：照受測者分成訓練（A、B）和測試（C），檢查有沒有混到（tools/split.mjs，11/2 保養）；混到時結束代碼是 1
// 沒寫 --out 就印到畫面；摘要（幾列、每種標記幾下、沒讀到的檔案、分法）印在錯誤輸出，不會混進 CSV
// 同一個人、同一個動作、同一組錄了好幾次：以最後一次為準（和實測報表一樣），前面的不放
// 11/3 訓練 AI 模型也用這裡的 buildDataset
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeOne } from '../js/data/report-core.js';
import { setResult, markRedos, sortReport } from '../js/data/test-report.js';
import { datasetRows, datasetCsv, datasetSummary } from '../js/data/dataset.js';
import { WORKOUTS } from '../js/analysis/workouts.js';
import { splitBySubject, checkSplit, splitLine } from './split.mjs';

// sources：[{ name（檔名）, text（檔案內容） }] → { rows（資料表的每一列）, redos（重錄、沒放進來的組數）, failed（[{ name, why }]） }
export async function buildDataset(sources) {
    const sets = [], failed = [];
    for (const s of sources) {
        try {
            const r = await analyzeOne(s.text);
            const set = setResult(r.info, r.items, r.kind, r.startedAt, s.name);
            set.dataset = datasetRows(r.info, r.items, { file: s.name, synthetic: r.synthetic });
            sets.push(set);
        } catch (err) {
            failed.push({ name: s.name, why: err instanceof SyntaxError ? '檔案內容不完整或格式不正確' : err.message });
        }
    }
    sortReport(markRedos(sets));
    return { rows: sets.filter(s => !s.redo).flatMap(s => s.dataset), redos: sets.filter(s => s.redo).length, failed };
}

// 檔案或資料夾 → sources（資料夾只讀第一層的 .json，照檔名排）
async function readSources(paths) {
    const sources = [];
    for (const p of paths) {
        if ((await stat(p)).isDirectory()) {
            const names = (await readdir(p)).filter(n => /\.json$/i.test(n)).sort();
            for (const n of names) sources.push({ name: n, text: await readFile(join(p, n), 'utf8') });
        } else {
            sources.push({ name: p.split(/[\\/]/).pop(), text: await readFile(p, 'utf8') });
        }
    }
    return sources;
}

// 摘要（給人看的幾行）
export function summaryLines({ rows, redos, failed }) {
    const d = datasetSummary(rows);
    const lines = ['AI 模型的資料：' + d.rows + ' 列（受測者：' + (d.subjects.join('、') || '沒有') + '）'];
    for (const g of d.groups) lines.push('  ' + WORKOUTS[g.workout].name + ' ' + g.name + '：' + g.n + (WORKOUTS[g.workout].kind === 'hold' ? ' 次' : ' 下'));
    if (redos) lines.push('重錄的 ' + redos + ' 組沒有放進來（以最後一次為準）');
    if (d.synthetic) lines.push('其中 ' + d.synthetic + ' 列是合成的（示範動畫的火柴人，不是真人）：只能拿來試流程');
    for (const f of failed) lines.push('沒有讀到 ' + f.name + '：' + f.why);
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
    if (!paths.length && !synthetic) {
        console.error('用法：node tools/dataset.mjs 實測檔或資料夾… [--out ai_dataset.csv] [--test C]，或 node tools/dataset.mjs --synthetic A,B,C [--out …] [--test C]');
        process.exitCode = 1;
        return;
    }
    const sources = await readSources(paths);
    if (synthetic) {
        const { syntheticSubject } = await import('../tests/synthetic-sets.mjs');
        for (const code of codes(synthetic)) sources.push(...syntheticSubject(code));
    }
    const result = await buildDataset(sources);
    const csv = datasetCsv(result.rows);
    if (out) await writeFile(out, csv);
    else process.stdout.write(csv);
    console.error(summaryLines(result).join('\n'));
    if (testSubjects) {
        const parts = splitBySubject(result.rows, testSubjects);
        const problems = checkSplit(parts.train, parts.test);
        console.error(splitLine(parts));
        console.error(problems.length ? '檢查：' + problems.join('；') : '檢查：沒有混到（每位受測者只在一邊）');
        if (problems.length) process.exitCode = 1;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
