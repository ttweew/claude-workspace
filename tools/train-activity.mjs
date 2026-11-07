// AI 自動辨識動作（11/8）：訓練「看最近 3 秒的骨架，猜在做哪個動作」的模型（命令列）
// 用法（在專案資料夾）：
//   node tools/train-activity.mjs --synthetic A,B,C,D,E,F,G,H --test I,J,K
//       合成的受測者（tests/synthetic-sets.mjs，不是真人）訓練，I、J、K 當測試：每一種各猜對幾段
//   node tools/train-activity.mjs --synthetic A,B,C,D,E,F,G,H --test I,J,K --module js/analysis/activity-model.js
//       再存成網站用的模型（js/analysis/activity.js 讀）
// 資料：每位受測者四個動作的每一組（做對＋每種錯誤），加上站著、手撐的棒式各撐一段（syntheticHold：組裡站著的時間太短）
// 每 0.5 秒取一段（最近 3 秒，和網站用同一個 ActivityMeter 取），標記是這一段每一格都在做的（一段裡換了動作的不用）
// 訓練和測試照受測者分：同一個人的每一段很像，兩邊都有等於先看過考題（和 tools/split.mjs 同一個道理）
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseRecording } from '../js/data/replay-core.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { ActivityMeter, ACTIVITIES, ACTIVITY_FEATURES, ACTIVITY_NAMES, WINDOW_MS, guessActivity } from '../js/analysis/activity.js';
import { trainClassifier } from '../js/analysis/forest.js';

// 一份合成的錄製檔（{ text, activity（每一格在做什麼） }）→ 每 0.5 秒一段 [{ features, label }]
export function windowsOf(set) {
    const parsed = parseRecording(set.text);
    const width = parsed.meta.videoWidth || 640, height = parsed.meta.videoHeight || 480;
    const pipeline = new PosePipeline(), meter = new ActivityMeter(null);
    const recent = [];   // 最近 3 秒每一格的標記（和 ActivityMeter 裡的 samples 同樣的取法）
    const out = [];
    parsed.frames.forEach((f, i) => {
        recent.push({ t: f.t, label: set.activity[i] ?? null });
        while (recent.length > 1 && f.t - recent[0].t > WINDOW_MS) recent.shift();
        const features = meter.features(pipeline.process(f.raw, f.t, width, height), f.t);
        if (!features) return;
        const label = recent[0].label;
        if (label && recent.every(x => x.label === label)) out.push({ features, label });
    });
    return out;
}

// 一位受測者的全部資料：四個動作的每一組＋撐著不動的三段（站著、弓箭步的站姿、手撐的棒式）
export async function subjectWindows(subject) {
    const { syntheticSubject, syntheticHold } = await import('../tests/synthetic-sets.mjs');
    const sets = [...syntheticSubject(subject), syntheticHold(subject, 'squat', 'stand'), syntheticHold(subject, 'lunge', 'stand'),
        syntheticHold(subject, 'pushup', 'plank')];
    return sets.flatMap(set => windowsOf(set).map(w => ({ ...w, subject })));
}

export const trainActivity = rows => trainClassifier('activity', ACTIVITY_FEATURES, ACTIVITIES, rows);

// 測試：每一種各猜對幾段 → { total: { n, hit }, by: { label: { n, hit, as: { 猜成的: 幾段 } } } }
export function scoreActivity(model, rows) {
    const by = Object.fromEntries(ACTIVITIES.map(a => [a, { n: 0, hit: 0, as: {} }]));
    let n = 0, hit = 0;
    for (const r of rows) {
        const g = guessActivity(r.features, model);
        const b = by[r.label];
        b.n++;
        n++;
        if (g && g.label === r.label) {
            b.hit++;
            hit++;
        } else {
            const as = g ? g.label : 'none';
            b.as[as] = (b.as[as] || 0) + 1;
        }
    }
    return { total: { n, hit }, by };
}

const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';
export function scoreLines(score) {
    const lines = ['猜對 ' + score.total.hit + '／' + score.total.n + ' 段（' + pct(score.total.hit, score.total.n) + '）'];
    for (const a of ACTIVITIES) {
        const b = score.by[a];
        if (!b.n) continue;
        const wrong = Object.entries(b.as).map(([k, v]) => (ACTIVITY_NAMES[k] || '猜不出來') + ' ' + v).join('、');
        lines.push('  ' + ACTIVITY_NAMES[a] + '：' + b.hit + '／' + b.n + (wrong ? '（猜成 ' + wrong + '）' : ''));
    }
    return lines;
}

// 網站用的模型檔（JS 模組）：開頭寫怎麼產生的、測試的成績
export function moduleText(file, command, testLine) {
    return '// AI 自動辨識動作的模型（自動產生，不要手改；js/analysis/activity.js 用）：' + command + '\n'
        + (file.synthetic ? '// 用合成資料（示範動畫的火柴人，不是真人）訓練的示範模型：真人的錄製檔來了要重新訓練\n' : '')
        + '// 訓練的受測者：' + file.subjects.join('、') + '；' + testLine + '\n'
        + 'export default ' + JSON.stringify(file) + ';\n';
}

async function main(args) {
    let synthetic = null, test = [], moduleOut = null;
    const codes = text => String(text || '').split(',').map(c => c.trim()).filter(Boolean);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--synthetic') synthetic = codes(args[++i]);
        else if (args[i] === '--test') test = codes(args[++i]);
        else if (args[i] === '--module') moduleOut = args[++i];
    }
    if (!synthetic || !synthetic.length || !test.length || test.some(c => synthetic.includes(c))) {
        console.error('用法：node tools/train-activity.mjs --synthetic A,B,C,D,E,F,G,H --test I,J,K [--module js/analysis/activity-model.js]（測試的受測者不能也在訓練裡）');
        process.exitCode = 1;
        return;
    }
    const train = (await Promise.all(synthetic.map(subjectWindows))).flat();
    const testRows = (await Promise.all(test.map(subjectWindows))).flat();
    console.log('訓練 ' + train.length + ' 段（' + synthetic.join('、') + '）、測試 ' + testRows.length + ' 段（' + test.join('、') + '）；合成的（示範動畫的火柴人，不是真人）：只證明流程');
    const model = trainActivity(train);
    const score = scoreActivity(model, testRows);
    console.log(scoreLines(score).join('\n'));
    if (moduleOut) {
        const file = { ...model, synthetic: true, subjects: synthetic };
        const command = 'node tools/train-activity.mjs ' + args.join(' ');
        await writeFile(moduleOut, moduleText(file, command, '沒看過的受測者 ' + test.join('、') + ' 猜對 ' + score.total.hit + '／' + score.total.n + ' 段（' + pct(score.total.hit, score.total.n) + '）'));
        console.log('網站用的模型存到 ' + moduleOut);
    }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
