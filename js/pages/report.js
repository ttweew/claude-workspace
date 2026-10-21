// 實測報表（report.html，10/21）：選很多個實測檔（或 zip、或這支手機裡的錄製檔）→ 一個一個重算 → 每一組比對應該做的和網站算的
// 重算在背景執行緒（js/data/report-worker.js），一次一個檔案，主畫面不會卡；背景執行緒開不起來就在主畫面算
// 比對、加總在 js/data/test-report.js；zip 在 js/data/unzip.js

import { setResult, markRedos, summarizeReport, ratioText, countedText, verdictText, reportCsv } from '../data/test-report.js';
import { readZip } from '../data/unzip.js';
import { analyzeOne } from '../data/report-core.js';
import { listRecordings, getRecordingFile } from '../data/library.js';
import { WORKOUTS, isWorkout } from '../analysis/workouts.js';
import { downloadText } from '../data/recorder.js';
import { setupOffline } from '../platform/offline.js';

const $ = id => document.getElementById(id);
const fileInput = $('fileInput'), drop = $('drop'), loadStatus = $('loadStatus');
const phoneRow = $('phoneRow'), phoneBtn = $('phoneBtn'), phoneNote = $('phoneNote');
const result = $('result'), reportSummary = $('reportSummary'), reportTable = $('reportTable');
const badFiles = $('badFiles'), badList = $('badList'), csvBtn = $('csvBtn');

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
            rows.push(setResult(r.info, r.items, r.kind, r.startedAt, s.name));
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
                if (z.skipped) bad.push({ name: f.name, why: '裡面有 ' + z.skipped + ' 個檔案壞掉或不支援，跳過' });
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
const ORDER = ['squat', 'lunge', 'pushup', 'plank'];

function show(failed) {
    result.hidden = !rows.length && !failed.length;
    // 依受測者、動作、這組（做對在前面）、時間排
    rows.sort((a, b) => a.subject.localeCompare(b.subject) || ORDER.indexOf(a.workout) - ORDER.indexOf(b.workout)
        || (a.condition === 'good' ? -1 : 0) - (b.condition === 'good' ? -1 : 0) || a.condition.localeCompare(b.condition) || a.startedAt - b.startedAt);
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
        file.textContent = r.name + (r.redo ? '（重錄，不算）' : '');
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

csvBtn.addEventListener('click', () => {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    downloadText('test_report_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.csv', reportCsv(rows), 'text/csv');
});

findPhoneItems();
setupOffline();
