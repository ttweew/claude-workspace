// 錄製資料重播分析（replay.html）：讀「數據」面板下載的 JSON / CSV，
// 用和鏡頭畫面相同的處理流程（js/pipeline.js）重算一次，畫出角度曲線、統計、匯出
// 用途：真人錄影時一邊錄、事後檢查角度與拍攝方向判斷得對不對（驗證實驗）

import { ANGLES } from './angles.js';
import { P } from './landmarks.js';
import { VIEW_NAMES } from './view.js';
import { drawChart, xToTime } from './chart.js';
import { makeDemoRecording } from './synth.js';
import { downloadText } from './recorder.js';
import { DEPTH_TEXT } from './squat.js';
import { parseRecording, needsFrameSize as metaNeedsFrameSize, analyzeRecording, ANGLE_KEYS, SIGNED_KEYS, VIEW_CODES } from './replay-core.js';
import { setupOffline } from './offline.js';

const $ = id => document.getElementById(id);
const fileInput = $('fileInput'), drop = $('drop'), loadStatus = $('loadStatus');
const aspectRow = $('aspectRow'), aspectSelect = $('aspect');
const result = $('result'), summary = $('summary'), synthNote = $('synthNote');
const toggles = $('toggles'), chart = $('chart'), skeleton = $('skeleton'), readout = $('readout');
const playBtn = $('playBtn'), mirrorBtn = $('mirrorBtn'), stats = $('stats'), csvOut = $('csvOut');
const squatCard = $('squatCard'), squatSummary = $('squatSummary'), squatTable = $('squatTable');

// 深蹲分析還在實驗中：網址加 ?lab=squat 才顯示（和鏡頭畫面一樣）
const LAB_SQUAT = new URLSearchParams(location.search).get('lab') === 'squat';
const POINTS = 33;

// 曲線顏色：膝綠、髖藍、肘橘；左邊實線、右邊虛線
const COLORS = { KNEE: '#2EE6A6', HIP: '#4CC3FF', ELBOW: '#FFB547' };
const VIEW_COLORS = { side: '#2EE6A6', oblique: '#FFC857', front: '#FF5C5C', none: 'rgba(255,255,255,0.18)' };
const shown = new Set(['LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_HIP', 'RIGHT_HIP']);
let showRaw = false;

let data = null;       // 讀進來的錄製資料 { name, meta, frames: [{ t, raw }] }
let analysis = null;   // 重算的結果
let cursor = 0;        // 目前選到第幾格
let mirrored = false;
let playing = null;    // 播放中：{ start（真實時間）, from（從第幾秒開始） }
let analysisCount = 0;  // 每次重算加 1，曲線圖用來判斷底圖要不要重畫

// ---------- 讀檔與重算（優先在背景執行緒） ----------

// 背景執行緒的檔案；網址帶上和這個檔案相同的版本號，發布新版時才不會拿到舊的
const WORKER_URL = new URL('./replay-worker.js' + new URL(import.meta.url).search, import.meta.url);
let workerPromise = null;
let requestId = 0;      // 每次讀檔、重算加 1；比較舊的結果直接丟掉
let parsedOnMain = null; // 不能用背景執行緒時，在主畫面讀好的資料
let loadedText = null;   // 目前檔案的內容：背景執行緒中途當掉時，改在主畫面重新讀取用

// 開一個背景執行緒（module worker）；瀏覽器不支援或開不起來就回傳 null，改在主畫面計算
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
            const timer = setTimeout(() => { w.terminate(); resolve(null); }, 8000);
            w.onmessage = e => {
                if (e.data.type !== 'ready') return;
                clearTimeout(timer);
                w.onmessage = null;
                resolve(w);
            };
            w.onerror = e => {
                e.preventDefault();
                clearTimeout(timer);
                w.terminate();
                resolve(null);
            };
        });
    }
    return workerPromise;
}

// 送一個工作給背景執行緒，等它回傳；progress：進度回報
// 背景執行緒中途當掉：放棄它（下次改在主畫面算），這次的工作回報失敗，不會一直停在「分析中」
function ask(w, message, transfer, progress) {
    return new Promise((resolve, reject) => {
        const id = message.id;
        const cleanup = () => {
            w.removeEventListener('message', onMessage);
            w.removeEventListener('error', onError);
        };
        const onError = e => {
            e.preventDefault();
            cleanup();
            w.terminate();
            workerPromise = Promise.resolve(null);
            const err = new Error('背景計算出錯');
            err.crashed = true;
            reject(err);
        };
        const onMessage = e => {
            const m = e.data;
            if (m.id !== id) return;
            if (m.type === 'progress') {
                if (progress) progress(m.fraction);
                return;
            }
            cleanup();
            if (m.type === 'error') {
                const err = new Error(m.message);
                err.syntax = m.syntax;
                reject(err);
            } else resolve(m);
        };
        w.addEventListener('message', onMessage);
        w.addEventListener('error', onError);
        w.postMessage(message, transfer || []);
    });
}

// 主畫面計算時，每算一段讓畫面喘口氣（進度條才會動、按鈕才按得動）
const breathe = () => new Promise(resolve => setTimeout(resolve, 0));

async function load(name, text) {
    stopPlaying();
    const id = ++requestId;
    setStatus('讀取中…');
    loadedText = text;
    parsedOnMain = null;
    try {
        let meta = null;
        const w = await getWorker();
        if (w) {
            try {
                meta = (await ask(w, { type: 'load', id, text })).meta;
            } catch (err) {
                if (!err.crashed) throw err;
                // 背景執行緒當掉：改在主畫面讀（下面）
            }
        }
        if (!meta) {
            parsedOnMain = parseRecording(text);
            meta = parsedOnMain.meta;
        }
        if (id !== requestId) return;
        data = { name, meta };
    } catch (err) {
        if (id !== requestId) return;
        console.error(err);
        // 收起上一個檔案的結果，避免誤以為是這個檔案的
        data = analysis = null;
        result.hidden = true;
        setStatus('讀取失敗：' + (err instanceof SyntaxError || err.syntax ? '檔案內容不完整或格式不正確' : err.message), true);
        return;
    }
    aspectRow.hidden = !needsFrameSize();
    // 預設和錄製時畫面上看到的一樣（前鏡頭是鏡像）
    mirrored = !!data.meta.displayMirrored;
    mirrorBtn.setAttribute('aria-pressed', mirrored);
    analyze();
}

function setStatus(text, error) {
    loadStatus.textContent = text;
    loadStatus.classList.toggle('error', !!error);
}

// 鏡頭畫面大小：JSON 有記錄；CSV（或沒記錄的檔案）用使用者選的
function needsFrameSize() {
    return metaNeedsFrameSize(data.meta);
}
function frameSize() {
    if (!needsFrameSize()) return [data.meta.videoWidth, data.meta.videoHeight];
    return aspectSelect.value.split('x').map(Number);
}

async function analyze() {
    const id = ++requestId;
    const [width, height] = frameSize();
    const progress = f => { if (id === requestId) setStatus('分析中… ' + Math.round(f * 100) + '%'); };
    let r;
    try {
        const w = await getWorker();
        if (w && !parsedOnMain) {
            try {
                r = (await ask(w, { type: 'analyze', id, width, height, lab: LAB_SQUAT }, [], progress)).result;
            } catch (err) {
                if (!err.crashed) throw err;
                // 背景執行緒當掉：改在主畫面重新讀取、計算（下面），使用者不用重選檔案
            }
        }
        if (!r) {
            if (!parsedOnMain) parsedOnMain = parseRecording(loadedText);
            if (id !== requestId) return;
            r = await analyzeRecording(parsedOnMain, width, height, { lab: LAB_SQUAT, onProgress: progress, pause: breathe });
        }
    } catch (err) {
        if (id !== requestId) return;
        console.error(err);
        setStatus('分析失敗：' + err.message, true);
        return;
    }
    if (id !== requestId) return;
    analysis = { id: ++analysisCount, data: r, rows: buildRows(r), width, height, times: Array.from(r.t), reps: r.reps };
    const rows = analysis.rows;
    // 一開始選在第一個有角度的格子（最前面幾格點還沒穩定，角度都是「—」）
    cursor = Math.max(0, rows.findIndex(row => row.present && Object.values(row.angles).some(a => a !== null)));
    result.hidden = false;
    setStatus('已讀取「' + data.name + '」，共 ' + rows.length + ' 格');
    showSummary();
    showStats();
    showSquats();
    redraw();
}

// 每一格的摘要（時間、角度、拍攝方向）；點的座標留在數字陣列裡，畫骨架時才拿
function buildRows(r) {
    const A = ANGLE_KEYS.length, S = SIGNED_KEYS.length;
    const val = x => (Number.isNaN(x) ? null : x);
    const rows = new Array(r.n);
    for (let i = 0; i < r.n; i++) {
        const present = r.present[i] === 1;
        const angles = {}, signed = {};
        ANGLE_KEYS.forEach((k, j) => { angles[k] = present ? val(r.angles[i * A + j]) : null; });
        SIGNED_KEYS.forEach((k, j) => { signed[k] = present ? val(r.signed[i * S + j]) : null; });
        let rawAngles = null;
        if (r.rawPresent[i]) {
            rawAngles = {};
            ANGLE_KEYS.forEach((k, j) => { rawAngles[k] = val(r.rawAngles[i * A + j]); });
        }
        rows[i] = {
            t: r.t[i], present, angles, signed, rawAngles, hasRaw: r.rawPresent[i] === 1,
            view: present ? { view: VIEW_CODES[r.view[i]], ratio: val(r.ratio[i]), facing: r.facing[i] } : null
        };
    }
    return rows;
}

// ---------- 深蹲分析（實驗中） ----------

function showSquats() {
    squatCard.hidden = !LAB_SQUAT;
    if (!LAB_SQUAT) return;
    const reps = analysis.reps;
    const count = d => reps.filter(r => r.depth === d).length;
    squatSummary.textContent = reps.length
        ? '共 ' + reps.length + ' 下：蹲到位 ' + count('good') + '、再低一點 ' + count('close') + '、太淺 ' + count('shallow')
        : '沒有偵測到完整的深蹲（要側面拍，而且每一下都要站直再蹲下）';
    const head = ['第幾下', '時間', '最低膝蓋', '最低髖部', '判斷'];
    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    head.forEach(h => { const th = document.createElement('th'); th.textContent = h; htr.appendChild(th); });
    thead.appendChild(htr);
    const tbody = document.createElement('tbody');
    for (const r of reps) {
        const tr = document.createElement('tr');
        const cells = [r.n, r.start.toFixed(1) + '～' + r.end.toFixed(1) + ' 秒', Math.round(r.minKnee) + '°',
            r.minHip === null ? '—' : Math.round(r.minHip) + '°', DEPTH_TEXT[r.depth] + (r.oblique ? '（斜側面）' : '')];
        cells.forEach((c, i) => {
            const td = document.createElement(i ? 'td' : 'th');
            td.textContent = c;
            if (i === 4) td.className = 'depth-' + r.depth;
            tr.appendChild(td);
        });
        // 點一列（或用鍵盤選到後按 Enter）跳到那一下最低的時間
        const jump = () => { stopPlaying(); selectTime(r.bottom); };
        tr.addEventListener('click', jump);
        tr.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                jump();
            }
        });
        tr.tabIndex = 0;
        tr.title = '跳到第 ' + r.n + ' 下最低的時間點';
        tr.className = 'jump-row';
        tbody.appendChild(tr);
    }
    squatTable.replaceChildren(thead, tbody);
}

// ---------- 摘要 ----------

function showSummary() {
    const { rows, width, height } = analysis;
    const seconds = rows[rows.length - 1].t;
    const detected = rows.filter(r => r.present).length;
    const views = { side: 0, oblique: 0, front: 0 };
    const facing = { 1: 0, '-1': 0 };
    for (const r of rows) {
        if (r.present && r.view.view) views[r.view.view]++;
        if (r.present && r.view.facing) facing[r.view.facing]++;
    }
    const pct = n => (detected ? Math.round(n / detected * 100) : 0) + '%';
    const m = data.meta;
    const items = [
        ['長度', seconds.toFixed(1) + ' 秒 · ' + rows.length + ' 格'],
        ['每秒格數', seconds > 0 ? ((rows.length - 1) / seconds).toFixed(1) + ' 格' : '—'],
        ['偵測到人', Math.round(detected / rows.length * 100) + '% 的格子'],
        ['拍攝方向', '側面 ' + pct(views.side) + ' · 斜側 ' + pct(views.oblique) + ' · 正面 ' + pct(views.front)],
        ['面向（畫面上）', facingText(facing)],
        ['鏡頭畫面', width + '×' + height + (needsFrameSize() ? '（手動選擇）' : '')],
        ['模型 · 運算', (m.model || '—') + ' · ' + (m.computeMode || '—')],
        ['錄製時間', m.startedAt && !m.synthetic ? new Date(m.startedAt).toLocaleString('zh-TW') : '—']
    ];
    summary.replaceChildren(...items.map(([k, v]) => {
        const div = document.createElement('div');
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = k;
        dd.textContent = v;
        div.append(dt, dd);
        return div;
    }));
    synthNote.hidden = !m.synthetic;
    synthNote.textContent = m.synthetic ? '⚠ ' + (m.description || '合成示範資料，不是真人錄影') : '';
}

// 面向是用鏡頭原始畫面判斷的；鏡像顯示時左右對調，和使用者當時看到的一樣
function facingText(count) {
    const right = count[1], left = count[-1];
    if (!right && !left) return '看不出來（正面拍或看不到）';
    const dir = right >= left ? 1 : -1;
    return '畫面' + ((dir > 0) !== mirrored ? '右' : '左') + '邊' + (mirrored ? '（鏡像）' : '');
}

// ---------- 統計 ----------

function showStats() {
    const { rows } = analysis;
    const head = ['關節', '有角度', '最小', '最大', '平均', '抖動', '原始抖動'];
    const body = ANGLES.map(([key, name]) => {
        const vals = rows.map(r => r.angles[key]);
        const rawVals = rows.map(r => (r.rawAngles ? r.rawAngles[key] : null));
        const ok = vals.filter(v => v !== null);
        const cells = [name, Math.round(ok.length / rows.length * 100) + '%'];
        if (ok.length) {
            cells.push(Math.round(Math.min(...ok)) + '°', Math.round(Math.max(...ok)) + '°',
                Math.round(ok.reduce((s, v) => s + v, 0) / ok.length) + '°');
        } else {
            cells.push('—', '—', '—');
        }
        cells.push(jitter(vals), jitter(rawVals));
        return cells;
    });
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    head.forEach(h => { const th = document.createElement('th'); th.textContent = h; tr.appendChild(th); });
    thead.appendChild(tr);
    const tbody = document.createElement('tbody');
    body.forEach(cells => {
        const row = document.createElement('tr');
        cells.forEach((c, i) => { const td = document.createElement(i ? 'td' : 'th'); td.textContent = c; row.appendChild(td); });
        tbody.appendChild(row);
    });
    stats.replaceChildren(thead, tbody);
}

// 相鄰兩格（都有角度）平均差幾度
function jitter(values) {
    let sum = 0, n = 0;
    for (let i = 1; i < values.length; i++) {
        if (values[i] !== null && values[i - 1] !== null) {
            sum += Math.abs(values[i] - values[i - 1]);
            n++;
        }
    }
    return n ? (sum / n).toFixed(2) + '°' : '—';
}

// ---------- 曲線圖 ----------

function buildToggles() {
    const buttons = ANGLES.map(([key, name]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'toggle';
        b.textContent = (key.startsWith('LEFT') ? '━ ' : '┅ ') + name;
        b.style.color = COLORS[key.split('_')[1]];
        b.setAttribute('aria-pressed', shown.has(key));
        b.addEventListener('click', () => {
            if (shown.has(key)) shown.delete(key);
            else shown.add(key);
            b.setAttribute('aria-pressed', shown.has(key));
            redraw();
        });
        return b;
    });
    const raw = document.createElement('button');
    raw.type = 'button';
    raw.className = 'toggle';
    raw.textContent = '原始（未平滑）';
    raw.setAttribute('aria-pressed', showRaw);
    raw.addEventListener('click', () => {
        showRaw = !showRaw;
        raw.setAttribute('aria-pressed', showRaw);
        redraw();
    });
    toggles.replaceChildren(...buttons, raw);
}

// 拍攝方向色條：連續同一類的格子合成一段
function viewBands() {
    const { rows } = analysis;
    const bands = [];
    rows.forEach((r, i) => {
        const v = r.present && r.view.view ? r.view.view : 'none';
        const t1 = i + 1 < rows.length ? rows[i + 1].t : r.t;
        const last = bands[bands.length - 1];
        if (last && last.view === v) last.to = t1;
        else bands.push({ view: v, from: r.t, to: t1, color: VIEW_COLORS[v] });
    });
    return bands;
}

// 拖曳時一秒可能有上百次移動事件，合併成每個畫面更新一次
let redrawPending = false;
function scheduleRedraw() {
    if (redrawPending) return;
    redrawPending = true;
    requestAnimationFrame(() => {
        redrawPending = false;
        redraw();
    });
}

function redraw() {
    if (!analysis) return;
    const { rows, times } = analysis;
    const series = [];
    for (const [key] of ANGLES) {
        if (!shown.has(key)) continue;
        const color = COLORS[key.split('_')[1]];
        const dash = key.startsWith('RIGHT') ? [6, 4] : [];
        if (showRaw) series.push({ values: rows.map(r => (r.rawAngles ? r.rawAngles[key] : null)), color, width: 1, dash, alpha: 0.45 });
        series.push({ values: rows.map(r => r.angles[key]), color, width: 2, dash });
    }
    const markers = analysis.reps.map(r => ({ t: r.bottom, label: String(r.n) }));
    // 底圖代號：檔案、顯示的關節、是否顯示原始資料；只換游標時沿用底圖
    const key = analysis.id + '|' + [...shown].join(',') + '|' + showRaw;
    drawChart(chart, { key, times, series, bands: viewBands(), markers, cursor: rows[cursor].t, yMin: 0, yMax: 200, yStep: 30 });
    drawSkeleton();
    showReadout();
}

// ---------- 選擇時間點：骨架與數字 ----------

const BONES = [
    ['LEFT_SHOULDER', 'RIGHT_SHOULDER'], ['LEFT_HIP', 'RIGHT_HIP'],
    ['LEFT_SHOULDER', 'LEFT_HIP'], ['RIGHT_SHOULDER', 'RIGHT_HIP'],
    ['LEFT_SHOULDER', 'LEFT_ELBOW'], ['LEFT_ELBOW', 'LEFT_WRIST'],
    ['RIGHT_SHOULDER', 'RIGHT_ELBOW'], ['RIGHT_ELBOW', 'RIGHT_WRIST'],
    ['LEFT_HIP', 'LEFT_KNEE'], ['LEFT_KNEE', 'LEFT_ANKLE'], ['LEFT_ANKLE', 'LEFT_HEEL'], ['LEFT_HEEL', 'LEFT_FOOT_INDEX'], ['LEFT_ANKLE', 'LEFT_FOOT_INDEX'],
    ['RIGHT_HIP', 'RIGHT_KNEE'], ['RIGHT_KNEE', 'RIGHT_ANKLE'], ['RIGHT_ANKLE', 'RIGHT_HEEL'], ['RIGHT_HEEL', 'RIGHT_FOOT_INDEX'], ['RIGHT_ANKLE', 'RIGHT_FOOT_INDEX'],
    ['NOSE', 'LEFT_EAR'], ['NOSE', 'RIGHT_EAR']
];

function drawSkeleton() {
    const { rows, width, height, data: r } = analysis;
    const dpr = window.devicePixelRatio || 1;
    const w = skeleton.clientWidth, h = Math.round(w * height / width);
    skeleton.style.height = h + 'px';
    skeleton.width = Math.round(w * dpr);
    skeleton.height = Math.round(h * dpr);
    const ctx = skeleton.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const row = rows[cursor];
    const base = cursor * POINTS;
    // 第 j 個點在畫布上的位置（鏡像時左右對調）
    const at = (xy, j) => [(mirrored ? 1 - xy[(base + j) * 2] : xy[(base + j) * 2]) * w, xy[(base + j) * 2 + 1] * h];
    // 原始的點（淡色）：看得出平滑、擋鬼點前後的差別
    if (row.hasRaw) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        for (let j = 0; j < POINTS; j++) {
            if (!r.rawVis[base + j]) continue;
            const [x, y] = at(r.raw, j);
            ctx.moveTo(x + 1.6, y);
            ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        }
        ctx.fill();
    }
    if (!row.present) {
        ctx.fillStyle = '#9DABBE';
        ctx.font = '13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('這一格沒有人', w / 2, h / 2);
        return;
    }
    const seen = j => r.smoothVis[base + j] === 1;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2EE6A6';
    ctx.beginPath();
    for (const [a, b] of BONES) {
        const ia = P[a], ib = P[b];
        if (!seen(ia) || !seen(ib)) continue;
        ctx.moveTo(...at(r.smooth, ia));
        ctx.lineTo(...at(r.smooth, ib));
    }
    ctx.stroke();
    for (const [key] of ANGLES) {
        const j = P[key];
        if (!seen(j)) continue;
        ctx.fillStyle = COLORS[key.split('_')[1]];
        ctx.beginPath();
        ctx.arc(...at(r.smooth, j), 3.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function showReadout() {
    const row = analysis.rows[cursor];
    const head = row.t.toFixed(2) + ' 秒（第 ' + cursor + ' 格）';
    if (!row.present) {
        readout.textContent = head + ' · 沒有人';
        return;
    }
    const v = row.view;
    const parts = ANGLES.map(([key, name]) => {
        const a = row.angles[key];
        const s = row.signed[key] === undefined ? null : row.signed[key];
        // 往後反折、後伸時（超過 180°）另外標出來
        return name + ' ' + (a === null ? '—' : Math.round(a) + '°' + (s !== null && s > 180 ? '（反折 ' + Math.round(s) + '°）' : ''));
    });
    readout.textContent = head + ' · ' + (v.view ? VIEW_NAMES[v.view] + '（比值 ' + v.ratio.toFixed(2) + '）' : '拍攝方向判斷中') + '\n' + parts.join(' · ');
}

function selectTime(t) {
    const { times } = analysis;
    let lo = 0, hi = times.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (times[mid] < t) lo = mid + 1;
        else hi = mid;
    }
    if (lo > 0 && t - times[lo - 1] < times[lo] - t) lo--;
    if (lo === cursor) return;
    cursor = lo;
    scheduleRedraw();
}

// ---------- 播放 ----------

function togglePlay() {
    if (playing) {
        stopPlaying();
        return;
    }
    const { rows } = analysis;
    if (cursor >= rows.length - 1) cursor = 0;
    playing = { start: performance.now(), from: rows[cursor].t };
    playBtn.textContent = '❚❚ 暫停';
    requestAnimationFrame(step);
}

function step(now) {
    if (!playing || !analysis) return;
    const { times } = analysis;
    const t = playing.from + (now - playing.start) / 1000;
    if (t >= times[times.length - 1]) {
        selectTime(times[times.length - 1]);
        stopPlaying();
        return;
    }
    selectTime(t);
    requestAnimationFrame(step);
}

function stopPlaying() {
    playing = null;
    playBtn.textContent = '▶ 播放';
}

// ---------- 匯出 ----------

function exportCSV() {
    const { rows } = analysis;
    const keys = ANGLES.map(([key]) => key);
    const signedKeys = keys.filter(k => /_(KNEE|HIP)$/.test(k));
    const header = ['time_ms', 'detected', 'view', 'view_ratio', 'facing']
        .concat(keys.map(k => k.toLowerCase()))
        .concat(signedKeys.map(k => k.toLowerCase() + '_signed'))
        .concat(keys.map(k => k.toLowerCase() + '_raw'));
    const num = v => (v === null || v === undefined ? '' : v.toFixed(1));
    const lines = rows.map(r => {
        const v = r.view;
        return [Math.round(r.t * 1000), r.present ? 1 : 0, v && v.view ? v.view : '', v && v.ratio !== null ? v.ratio.toFixed(3) : '', v ? v.facing : '']
            .concat(keys.map(k => num(r.angles[k])))
            .concat(signedKeys.map(k => num(r.signed[k])))
            .concat(keys.map(k => num(r.rawAngles ? r.rawAngles[k] : null)))
            .join(',');
    });
    const base = data.name.replace(/\.(json|csv)$/i, '');
    downloadText(base + '_angles.csv', '﻿' + [header.join(',')].concat(lines).join('\r\n') + '\r\n', 'text/csv');
}

// ---------- 事件 ----------

function readFile(file) {
    if (!file) return;
    setStatus('讀取中…');
    file.text().then(text => load(file.name, text), err => setStatus('讀取失敗：' + err.message, true));
}

fileInput.addEventListener('change', () => readFile(fileInput.files[0]));
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('over');
    readFile(e.dataTransfer.files[0]);
});
$('demoSide').addEventListener('click', () => load('合成示範_側面深蹲.json', JSON.stringify(makeDemoRecording({ yaw: 8 }))));
$('demoFront').addEventListener('click', () => load('合成示範_正面深蹲.json', JSON.stringify(makeDemoRecording({ yaw: 85 }))));
aspectSelect.addEventListener('change', () => { if (data) analyze(); });  // 只重算，不用重新讀檔

// 點圖或拖曳選時間；左右鍵一次移一格
function pointerTime(e) {
    const rect = chart.getBoundingClientRect();
    selectTime(xToTime(chart, e.clientX - rect.left, analysis.times[analysis.times.length - 1]));
}
chart.addEventListener('pointerdown', e => {
    if (!analysis) return;
    stopPlaying();
    chart.setPointerCapture(e.pointerId);
    pointerTime(e);
});
chart.addEventListener('pointermove', e => {
    if (analysis && chart.hasPointerCapture(e.pointerId)) pointerTime(e);
});
chart.addEventListener('keydown', e => {
    if (!analysis || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    stopPlaying();
    const stepSize = e.shiftKey ? 10 : 1;
    cursor = Math.max(0, Math.min(analysis.rows.length - 1, cursor + (e.key === 'ArrowRight' ? stepSize : -stepSize)));
    scheduleRedraw();
});
playBtn.addEventListener('click', togglePlay);
mirrorBtn.addEventListener('click', () => {
    mirrored = !mirrored;
    mirrorBtn.setAttribute('aria-pressed', mirrored);
    showSummary();
    redraw();
});
csvOut.addEventListener('click', exportCSV);
window.addEventListener('resize', scheduleRedraw);

buildToggles();
// 網址加上 ?demo 直接載入側面示範（方便展示）
if (new URLSearchParams(location.search).has('demo')) $('demoSide').click();
setupOffline();
