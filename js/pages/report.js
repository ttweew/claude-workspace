// 實測報表（report.html，10/21）：選很多個實測檔（或 zip、或這支手機裡的錄製檔）→ 一個一個重算 → 每一組比對應該做的和網站算的
// 重算在背景執行緒（js/data/report-worker.js），一次一個檔案，主畫面不會卡；背景執行緒開不起來就在主畫面算
// 比對、加總在 js/data/test-report.js；zip 在 js/data/unzip.js
// AI 模型的資料（11/2）：同一批檔案的每一下（量到的數字＋這組要做的），js/data/dataset.js 做成 CSV
// 老師的四個指標（11/25）：規則判斷的抓到、漏掉、誤報、沒事和精確率、召回率、準確率、F1（js/data/metrics.js），MediaPipe、YOLO 錄的分開

import { setResult, markRedos, sortReport, summarizeReport, ratioText, countedText, verdictText, reportCsv,
    ruleTables, labelCounts, modelText, FAMILY_NAME } from '../data/test-report.js';
import { scores, percentText } from '../data/metrics.js';
import { readZip } from '../data/unzip.js';
import { analyzeOne } from '../data/report-core.js';
import { datasetRows, datasetCsv, datasetFileName, datasetSummary } from '../data/dataset.js';
import { hasAiModel, aiJudgeFeatures, ruleJudge, AI_MODEL, seenInTraining } from '../analysis/ai-judge.js';
import { listRecordings, getRecordingFile } from '../data/library.js';
import { WORKOUTS, isWorkout } from '../analysis/workouts.js';
import { downloadText } from '../data/recorder.js';
import { setupOffline } from '../platform/offline.js';

const $ = id => document.getElementById(id);
const fileInput = $('fileInput'), drop = $('drop'), loadStatus = $('loadStatus');
const phoneRow = $('phoneRow'), phoneBtn = $('phoneBtn'), phoneNote = $('phoneNote');
const result = $('result'), reportSummary = $('reportSummary'), reportTable = $('reportTable');
const badFiles = $('badFiles'), badList = $('badList'), csvBtn = $('csvBtn');
const aiDataCard = $('aiDataCard'), aiDataSummary = $('aiDataSummary'), aiDataBtn = $('aiDataBtn');
const metricsCard = $('metricsCard'), metricsTables = $('metricsTables'), aiMetrics = $('aiMetrics');

const MAX_BYTES = 400 * 1024 * 1024;   // 一個檔案最大 400 MB（和重播分析一樣）
let rows = [];
let busy = false;

// ---------- 背景執行緒 ----------
const WORKER_URL = new URL('../data/report-worker.js' + new URL(import.meta.url).search, import.meta.url);
let workerPromise = null;
function getWorker() {
    if (!workerPromise) {
        workerPromise = new Promise(resolve => {
            let w;
            try {
                w = new Worker(WORKER_URL, { type: 'module' });
            } catch (err) {
                resolve(null);
                return;
            }
            const timer = setTimeout(() => resolve(null), 10000);
            w.addEventListener('message', e => { if (e.data && e.data.type === 'ready') { clearTimeout(timer); resolve(w); } }, { once: true });
            w.addEventListener('error', () => { clearTimeout(timer); resolve(null); }, { once: true });
        });
    }
    return workerPromise;
}

let requestId = 0;
// 一個檔案：背景執行緒算；背景執行緒當掉就改在主畫面算（下次也在主畫面）
async function analyzeFile(source) {
    const w = await getWorker();
    if (w) {
        try {
            return await new Promise((resolve, reject) => {
                const id = ++requestId;
                const done = () => { w.removeEventListener('message', onMessage); w.removeEventListener('error', onError); };
                const onMessage = e => {
                    if (e.data.id !== id) return;
                    done();
                    if (e.data.type === 'error') reject(new Error(e.data.message));
                    else resolve(e.data);
                };
                const onError = e => {
                    e.preventDefault();
                    done();
                    w.terminate();
                    workerPromise = Promise.resolve(null);
                    const err = new Error('背景計算出錯');
                    err.crashed = true;
                    reject(err);
                };
                w.addEventListener('message', onMessage);
                w.addEventListener('error', onError);
                w.postMessage({ id, source });
            });
        } catch (err) {
            if (!err.crashed) throw err;
        }
    }
    return analyzeOne(typeof source === 'string' ? source : await source.text());
}

// ---------- 讀檔案 ----------
const isJson = name => /\.json$/i.test(name);
const isZip = file => /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';

// 一次只做一批：prepare() 準備要算的檔案（解 zip、讀手機裡的錄製檔）→ 一個一個算
// 解 zip 的時候也算在忙：以前這時候再拖檔案進來，兩批會同時算、報表混在一起
async function start(prepare) {
    if (busy) return;
    busy = true;
    fileInput.disabled = phoneBtn.disabled = true;
    try {
        const { sources, bad } = await prepare();
        await analyzeAll(sources, bad);
    } finally {
        busy = false;
        fileInput.disabled = phoneBtn.disabled = false;
    }
}

// sources：[{ name, blob }]；一個一個算，算完一個就把那一組放進報表
async function analyzeAll(sources, bad) {
    rows = [];
    const failed = [...bad];
    for (const [i, s] of sources.entries()) {
        setStatus('分析中 ' + (i + 1) + '／' + sources.length + '：' + s.name);
        try {
            if (s.blob.size > MAX_BYTES) throw new Error('檔案太大（超過 400 MB）');
            const r = await analyzeFile(s.blob);
            const row = setResult(r.info, r.items, r.kind, r.startedAt, s.name, r.model);
            // AI 模型的資料：這一組的每一下（重錄的組下載時不放進去，見 dataset()）
            // blind：錄的模型判斷不了這組要做的錯誤（YOLO 沒有腳）：AI 模型猜對幾列、四個指標都不算（下載的 CSV 照樣有，CSV 只寫 DATASET_HEAD 那幾欄）
            row.dataset = datasetRows(r.info, r.items, { file: s.name, synthetic: r.synthetic }).map(d => Object.assign(d, { blind: row.blind }));
            rows.push(row);
        } catch (err) {
            failed.push({ name: s.name, why: err instanceof SyntaxError || /JSON/.test(err.message) ? '檔案內容不完整或格式不正確' : err.message });
        }
    }
    markRedos(rows);
    show(failed);
    setStatus(rows.length ? '已分析 ' + rows.length + ' 組' + (failed.length ? '，' + failed.length + ' 個檔案沒有讀到（見最下面）' : '')
        : '沒有可以分析的實測檔' + (failed.length ? '（' + failed.length + ' 個檔案沒有讀到，見下面）' : ''), !rows.length);
}

// 選的檔案：JSON 直接用；zip 先解開，只拿裡面的 JSON
const fromFiles = files => start(async () => {
    const sources = [], bad = [];
    for (const f of files) {
        if (isZip(f)) {
            try {
                setStatus('解開 ' + f.name + '…');
                const z = await readZip(f, isJson);
                sources.push(...z.files);
                if (z.skipped) bad.push({ name: f.name, why: '裡面有 ' + z.skipped + ' 個檔案壞掉、不支援或太大（加起來最多 1 GB），跳過' });
            } catch (err) {
                bad.push({ name: f.name, why: err.message });
            }
        } else if (isJson(f.name)) {
            sources.push({ name: f.name, blob: f });
        } else {
            bad.push({ name: f.name, why: '不是 JSON 或 zip 檔' });
        }
    }
    sources.sort((a, b) => a.name.localeCompare(b.name));
    return { sources, bad };
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length) fromFiles([...fileInput.files]);
    fileInput.value = '';
});
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files.length) fromFiles([...e.dataTransfer.files]);
});

// 這支手機裡的錄製檔：只拿實測的（清單已經比對過實測資訊）
let phoneItems = [];
async function findPhoneItems() {
    try {
        phoneItems = (await listRecordings()).filter(i => i.test);
    } catch (err) {
        phoneItems = [];
    }
    phoneRow.hidden = !phoneItems.length;
    phoneNote.textContent = phoneItems.length ? '共 ' + phoneItems.length + ' 段' : '';
}
phoneBtn.addEventListener('click', () => start(async () => {
    const sources = [], bad = [];
    for (const item of phoneItems) {
        try {
            sources.push({ name: item.name + '.json', blob: await getRecordingFile(item.id) });
        } catch (err) {
            bad.push({ name: item.name, why: '讀不到' });
        }
    }
    return { sources, bad };
}));

// ---------- 畫面 ----------
function setStatus(text, error = false) {
    loadStatus.textContent = text;
    loadStatus.classList.toggle('error', error);
}

const workoutName = id => (isWorkout(id) ? WORKOUTS[id].name : id);

function show(failed) {
    result.hidden = !rows.length && !failed.length;
    // 依受測者、動作、這組（做對在前面）、時間排
    sortReport(rows);
    const s = summarizeReport(rows);
    const li = text => { const el = document.createElement('li'); el.textContent = text; return el; };
    const lines = [];
    if (s.sets) {
        lines.push(li('受測者：' + s.people.join('、') + '（共 ' + s.sets + ' 組' + (s.redos ? '；重錄的 ' + s.redos + ' 組不算' : '') + '）'));
        if (s.count.total) lines.push(li('次數完全正確：' + ratioText(s.count.ok, s.count.total) + ' 組'));
        for (const e of s.errors) lines.push(li(e.name + '（' + workoutName(e.workout) + '）：抓到 ' + ratioText(e.caught, e.total) + (e.kind === 'hold' ? ' 組' : ' 下')));
        if (s.falseAlarms.of) lines.push(li('做對的被誤報：' + ratioText(s.falseAlarms.reps, s.falseAlarms.of) + ' 下'));
        if (s.falseAlarms.holdSets) lines.push(li('棒式做對的被誤報：' + ratioText(s.falseAlarms.holds, s.falseAlarms.holdSets) + ' 組'));
    }
    reportSummary.replaceChildren(...lines);
    csvBtn.hidden = !rows.length;
    showMetrics();
    showDataset(li);

    const head = document.createElement('tr');
    for (const h of ['受測者', '動作', '這組', '應做', '網站算', '結果']) {
        const th = document.createElement('th');
        th.scope = 'col';
        th.textContent = h;
        head.append(th);
    }
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    for (const r of rows) {
        const tr = document.createElement('tr');
        if (r.redo) tr.className = 'redo';
        const td = (text, warn = false) => { const c = document.createElement('td'); c.textContent = text; if (warn && !r.redo) c.className = 'warn'; tr.append(c); return c; };
        td(r.subject);
        td(workoutName(r.workout));
        const cond = td(r.conditionName);
        const file = document.createElement('small');
        // 檔名後面寫錄的時候用哪個 AI 模型（四個指標 MediaPipe、YOLO 分開算，看得出這組算在哪一張）
        const model = modelText(r.model);
        file.textContent = r.name + (model ? ' · ' + model : '') + (r.redo ? '（重錄，不算）' : '');
        cond.append(file);
        td(r.expected + ' ' + r.unit);
        td(countedText(r), r.kind === 'reps' && !r.countOk);
        const bad = r.condition === 'good' ? r.falseAlarms > 0 : r.kind === 'hold' ? !r.caught : r.caught < r.expected;
        td(verdictText(r), bad);
        tbody.append(tr);
    }
    reportTable.replaceChildren(thead, tbody);

    badFiles.hidden = !failed.length;
    badList.replaceChildren(...failed.map(f => li(f.name + '：' + f.why)));
}

// ---------- 老師的四個指標（11/18 白板，11/25 放進報表） ----------
// 一張表：第一欄是名字（動作，或 AI 模型／規則），接著四個指標、再來四格；手機上比畫面寬，框可以用鍵盤捲動（和「每一組」一樣）
// 四個指標放前面：320 寬的手機一打開就看得到（11/25 截圖：四格放前面時，四個指標全部在畫面外，要往右捲才看得到）
// region 的名字（label）每一張都不一樣：螢幕閱讀器才分得出來（axe-core 的 landmark-unique）
const METRIC_HEAD = ['精確率', '召回率', '準確率', 'F1', '抓到', '漏掉', '誤報', '沒事'];
function metricsTable(label, first, lines) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', label);
    const table = document.createElement('table');
    table.className = 'stats metrics-table';
    const cell = (tag, text, scope) => { const c = document.createElement(tag); c.textContent = text; if (scope) c.scope = scope; return c; };
    const head = document.createElement('tr');
    head.append(cell('th', first, 'col'), ...METRIC_HEAD.map(h => cell('th', h, 'col')));
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    for (const l of lines) {
        const tr = document.createElement('tr');
        if (l.workout === 'total') tr.className = 'total';
        const c = l.counts;
        tr.append(cell('th', l.label, 'row'), ...[l.precision, l.recall, l.accuracy, l.f1].map(x => cell('td', percentText(x))),
            ...[c.tp, c.fn, c.fp, c.tn].map(n => cell('td', String(n))));
        tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);
    return wrap;
}

function showMetrics() {
    const groups = ruleTables(rows);
    metricsCard.hidden = !groups.length;
    metricsTables.replaceChildren(...groups.flatMap(g => {
        const title = document.createElement('h3');
        title.className = 'metrics-title';
        title.textContent = FAMILY_NAME[g.family] + ' 錄的';
        const parts = [title];
        if (g.lines.length) parts.push(metricsTable('四個指標：' + FAMILY_NAME[g.family] + ' 錄的', '動作', g.lines));
        // YOLO 判斷不了的錯誤：不算進來（沒有判斷，不是漏掉），寫出是哪幾組
        if (g.skipped.length) {
            const note = document.createElement('p');
            note.className = 'note';
            note.textContent = FAMILY_NAME[g.family] + ' 沒有腳跟、腳尖的點，判斷不了：'
                + g.skipped.map(k => workoutName(k.workout) + '「' + k.name + '」' + k.sets + ' 組').join('、') + '，沒有算進來（沒有判斷，不是漏掉）';
            parts.push(note);
        }
        return parts;
    }));
}

// ---------- AI 模型的資料 ----------
// 照報表的順序（受測者、動作、這組）；重錄的組不放（以最後一次為準，和上面的統計一樣）
const dataset = () => rows.filter(r => !r.redo).flatMap(r => r.dataset);

function showDataset(li) {
    const data = dataset();
    aiDataCard.hidden = !data.length;
    if (!data.length) return;
    const d = datasetSummary(data);
    const lines = [li('共 ' + d.rows + ' 列（每一下一列，棒式每一次一列；受測者：' + d.subjects.join('、') + '）')];
    // 訓練和測試要用不同的人（11/2 保養，tools/split.mjs）：只有一位時分不了
    if (d.subjects.length < 2) lines.push(li('只有 1 位受測者：AI 模型要拿一些人來學、另外的人來考（同一個人不能兩邊都有，不然等於先看過考題），至少要 2 位'));
    for (const w of [...new Set(d.groups.map(g => g.workout))]) {
        const unit = WORKOUTS[w].kind === 'hold' ? ' 次' : ' 下';
        lines.push(li(workoutName(w) + '：' + d.groups.filter(g => g.workout === w).map(g => g.name + ' ' + g.n + unit).join('、')));
    }
    // AI 模型（11/4，js/analysis/ai-judge.js）：訓練時沒看過的受測者，AI 模型和規則各猜對幾列（猜每一下是做對，還是哪一種錯）
    // 訓練時看過的不算（先看過考題，猜對也不算數）
    const judged = data.filter(r => hasAiModel(r.workout) && !seenInTraining(r.subject, r.synthetic) && !r.blind);
    const seen = [...new Set(data.filter(r => seenInTraining(r.subject, r.synthetic)).map(r => r.subject))].sort();
    // 四個指標（11/25）：同一批列，AI 模型和規則各數一次四格（故意做錯的那一下猜對那一種錯才算抓到）
    const aiPairs = [], rulePairs = [];
    if (judged.length) {
        for (const r of judged) {
            aiPairs.push({ truth: r.condition, guess: aiJudgeFeatures(r.workout, r.features).label });
            rulePairs.push({ truth: r.condition, guess: ruleJudge(r.workout, r.ruleErrors, r.features) });
        }
        const ai = aiPairs.filter(p => p.guess === p.truth).length;
        const rule = rulePairs.filter(p => p.guess === p.truth).length;
        lines.push(li('AI 模型（' + (AI_MODEL.synthetic ? '示範：用合成資料訓練的' : '用 ' + AI_MODEL.subjects.length + ' 位受測者的實測資料訓練的')
            + '）猜對 ' + ratioText(ai, judged.length) + ' 列，規則 ' + ratioText(rule, judged.length) + ' 列（猜每一下是做對，還是哪一種錯）'));
    }
    const line = (label, counts) => ({ label, counts, ...scores(counts) });
    aiMetrics.replaceChildren(...(judged.length
        ? [metricsTable('四個指標：AI 模型和規則', '方法', [line('AI 模型', labelCounts(aiPairs)), line('規則', labelCounts(rulePairs))])]
        : []));
    if (seen.length) lines.push(li('受測者 ' + seen.join('、') + ' 的資料訓練 AI 模型時看過，不算進 AI 模型猜對幾列'));
    const redos = rows.filter(r => r.redo).length;
    if (redos) lines.push(li('重錄的 ' + redos + ' 組沒有放進來（以最後一次為準）'));
    if (d.synthetic) lines.push(li('其中 ' + d.synthetic + ' 列是合成的實測檔（示範動畫的火柴人，不是真人）：只能拿來試流程，不能當成研究結果'));
    aiDataSummary.replaceChildren(...lines);
}

aiDataBtn.addEventListener('click', () => downloadText(datasetFileName(), datasetCsv(dataset()), 'text/csv'));

csvBtn.addEventListener('click', () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    downloadText('test_report_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.csv', reportCsv(rows), 'text/csv');
});

findPhoneItems();
setupOffline();
