// 錄製資料重播分析（replay.html）：讀「數據」面板下載的 JSON / CSV，
// 用和鏡頭畫面相同的處理流程（js/pipeline.js）重算一次，畫出角度曲線、統計、匯出
// 用途：真人錄影時一邊錄、事後檢查角度與拍攝方向判斷得對不對（驗證實驗）

import { PosePipeline } from './pipeline.js';
import { ANGLES, computeAngles, signedAngle } from './angles.js';
import { LANDMARKS, P, isVisible } from './landmarks.js';
import { VIEW_NAMES } from './view.js';
import { drawChart, xToTime } from './chart.js';
import { makeDemoRecording } from './synth.js';
import { downloadText } from './recorder.js';
import { SquatCounter, DEPTH_TEXT } from './squat.js';

const $ = id => document.getElementById(id);
const fileInput = $('fileInput'), drop = $('drop'), loadStatus = $('loadStatus');
const aspectRow = $('aspectRow'), aspectSelect = $('aspect');
const result = $('result'), summary = $('summary'), synthNote = $('synthNote');
const toggles = $('toggles'), chart = $('chart'), skeleton = $('skeleton'), readout = $('readout');
const playBtn = $('playBtn'), mirrorBtn = $('mirrorBtn'), stats = $('stats'), csvOut = $('csvOut');
const squatCard = $('squatCard'), squatSummary = $('squatSummary'), squatTable = $('squatTable');

// 深蹲分析還在實驗中：網址加 ?lab=squat 才顯示（和鏡頭畫面一樣）
const LAB_SQUAT = new URLSearchParams(location.search).get('lab') === 'squat';

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

// ---------- 讀檔 ----------

// JSON：網站「下載 JSON」的格式
function parseJSON(text) {
    const json = JSON.parse(text);
    if (json.format !== 'ai-sport-pose' || !Array.isArray(json.frames)) throw new Error('這不是本網站錄製的 JSON 檔');
    const names = json.landmarkNames || LANDMARKS.map(([k]) => k);
    if (names.length !== LANDMARKS.length) throw new Error('點的數量不同（' + names.length + ' 點），目前只支援 33 點');
    return {
        meta: json.meta || {},
        frames: json.frames.map(f => ({
            t: f.t,
            raw: f.landmarks ? f.landmarks.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) : null
        }))
    };
}

// CSV：網站「下載 CSV」的格式（第一列是欄位名稱）
function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const header = lines[0].split(',');
    const col = name => header.indexOf(name);
    if (col('time_ms') < 0 || col('detected') < 0) throw new Error('這不是本網站錄製的 CSV 檔');
    const cols = LANDMARKS.map(([key]) => ['x', 'y', 'z', 'vis'].map(f => col(key.toLowerCase() + '_' + f)));
    if (cols.some(c => c.some(i => i < 0))) throw new Error('CSV 缺少部分點的欄位');
    const frames = lines.slice(1).map(line => {
        const v = line.split(',');
        const detected = v[col('detected')] === '1';
        return {
            t: Number(v[col('time_ms')]),
            raw: detected ? cols.map(([x, y, z, vis]) => ({ x: Number(v[x]), y: Number(v[y]), z: Number(v[z]), visibility: Number(v[vis]) })) : null
        };
    });
    return { meta: { csv: true }, frames };
}

function load(name, text) {
    stopPlaying();
    try {
        const parsed = name.toLowerCase().endsWith('.csv') ? parseCSV(text) : parseJSON(text);
        if (!parsed.frames.length) throw new Error('檔案裡沒有任何一格資料');
        data = { name, ...parsed };
    } catch (err) {
        console.error(err);
        // 收起上一個檔案的結果，避免誤以為是這個檔案的
        data = analysis = null;
        result.hidden = true;
        setStatus('讀取失敗：' + (err instanceof SyntaxError ? '檔案格式不正確' : err.message), true);
        return;
    }
    aspectRow.hidden = !data.meta.csv;
    // 預設和錄製時畫面上看到的一樣（前鏡頭是鏡像）
    mirrored = !!data.meta.displayMirrored;
    mirrorBtn.setAttribute('aria-pressed', mirrored);
    analyze();
}

function setStatus(text, error) {
    loadStatus.textContent = text;
    loadStatus.classList.toggle('error', !!error);
}

// ---------- 重算 ----------

// 鏡頭畫面大小：JSON 有記錄；CSV 沒有，用使用者選的
function frameSize() {
    if (!data.meta.csv && data.meta.videoWidth && data.meta.videoHeight) return [data.meta.videoWidth, data.meta.videoHeight];
    return aspectSelect.value.split('x').map(Number);
}

function analyze() {
    const [width, height] = frameSize();
    const pipeline = new PosePipeline();
    const rows = data.frames.map(f => {
        const p = pipeline.process(f.raw, f.t, width, height);
        const signed = {};
        if (p) for (const [key] of ANGLES) signed[key] = signedAngle(key, p.angles, p.landmarks, width, height, p.view.facing);
        return {
            t: f.t / 1000,
            raw: f.raw,
            pose: p,
            signed,
            // 沒經過平滑、擋鬼點的角度，用來比較
            rawAngles: f.raw ? computeAngles(f.raw, width, height) : null
        };
    });
    analysis = { rows, width, height, times: rows.map(r => r.t), reps: LAB_SQUAT ? countSquats(rows) : [] };
    // 一開始選在第一個有角度的格子（最前面幾格點還沒穩定，角度都是「—」）
    cursor = Math.max(0, rows.findIndex(r => r.pose && Object.values(r.pose.angles).some(a => a !== null)));
    result.hidden = false;
    setStatus('已讀取「' + data.name + '」，共 ' + rows.length + ' 格');
    showSummary();
    showStats();
    showSquats();
    redraw();
}

// ---------- 深蹲分析（實驗中） ----------

// 和鏡頭畫面用同一個 SquatCounter，一格一格餵進去
function countSquats(rows) {
    const counter = new SquatCounter();
    for (const r of rows) counter.update(r.pose, r.t * 1000);
    return counter.reps;
}

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
        // 點一列跳到那一下最低的時間
        tr.addEventListener('click', () => { stopPlaying(); selectTime(r.bottom); });
        tr.style.cursor = 'pointer';
        tbody.appendChild(tr);
    }
    squatTable.replaceChildren(thead, tbody);
}

// ---------- 摘要 ----------

function showSummary() {
    const { rows, width, height } = analysis;
    const seconds = rows[rows.length - 1].t;
    const detected = rows.filter(r => r.pose).length;
    const views = { side: 0, oblique: 0, front: 0 };
    const facing = { 1: 0, '-1': 0 };
    for (const r of rows) {
        if (r.pose && r.pose.view.view) views[r.pose.view.view]++;
        if (r.pose && r.pose.view.facing) facing[r.pose.view.facing]++;
    }
    const pct = n => (detected ? Math.round(n / detected * 100) : 0) + '%';
    const m = data.meta;
    const items = [
        ['長度', seconds.toFixed(1) + ' 秒 · ' + rows.length + ' 格'],
        ['每秒格數', seconds > 0 ? ((rows.length - 1) / seconds).toFixed(1) + ' 格' : '—'],
        ['偵測到人', Math.round(detected / rows.length * 100) + '% 的格子'],
        ['拍攝方向', '側面 ' + pct(views.side) + ' · 斜側 ' + pct(views.oblique) + ' · 正面 ' + pct(views.front)],
        ['面向（畫面上）', facingText(facing)],
        ['鏡頭畫面', width + '×' + height + (m.csv ? '（手動選擇）' : '')],
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
        const vals = rows.map(r => (r.pose ? r.pose.angles[key] : null));
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
        const v = r.pose && r.pose.view.view ? r.pose.view.view : 'none';
        const t1 = i + 1 < rows.length ? rows[i + 1].t : r.t;
        const last = bands[bands.length - 1];
        if (last && last.view === v) last.to = t1;
        else bands.push({ view: v, from: r.t, to: t1, color: VIEW_COLORS[v] });
    });
    return bands;
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
        series.push({ values: rows.map(r => (r.pose ? r.pose.angles[key] : null)), color, width: 2, dash });
    }
    const markers = analysis.reps.map(r => ({ t: r.bottom, label: String(r.n) }));
    drawChart(chart, { times, series, bands: viewBands(), markers, cursor: rows[cursor].t, yMin: 0, yMax: 200, yStep: 30 });
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
    const { rows, width, height } = analysis;
    const dpr = window.devicePixelRatio || 1;
    const w = skeleton.clientWidth, h = Math.round(w * height / width);
    skeleton.style.height = h + 'px';
    skeleton.width = Math.round(w * dpr);
    skeleton.height = Math.round(h * dpr);
    const ctx = skeleton.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const row = rows[cursor];
    const px = p => [(mirrored ? 1 - p.x : p.x) * w, p.y * h];
    // 原始的點（淡色）：看得出平滑、擋鬼點前後的差別
    if (row.raw) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        for (const p of row.raw) {
            if (!isVisible(p)) continue;
            const [x, y] = px(p);
            ctx.beginPath();
            ctx.arc(x, y, 1.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    if (!row.pose) {
        ctx.fillStyle = '#9DABBE';
        ctx.font = '13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('這一格沒有人', w / 2, h / 2);
        return;
    }
    const l = row.pose.landmarks;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2EE6A6';
    for (const [a, b] of BONES) {
        const pa = l[P[a]], pb = l[P[b]];
        if (!isVisible(pa) || !isVisible(pb)) continue;
        ctx.beginPath();
        ctx.moveTo(...px(pa));
        ctx.lineTo(...px(pb));
        ctx.stroke();
    }
    for (const [key] of ANGLES) {
        const p = l[P[key]];
        if (!isVisible(p)) continue;
        ctx.fillStyle = COLORS[key.split('_')[1]];
        ctx.beginPath();
        ctx.arc(...px(p), 3.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function showReadout() {
    const row = analysis.rows[cursor];
    const head = row.t.toFixed(2) + ' 秒（第 ' + cursor + ' 格）';
    if (!row.pose) {
        readout.textContent = head + ' · 沒有人';
        return;
    }
    const v = row.pose.view;
    const parts = ANGLES.map(([key, name]) => {
        const a = row.pose.angles[key];
        const s = row.signed[key];
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
    cursor = lo;
    redraw();
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
        const v = r.pose ? r.pose.view : null;
        return [Math.round(r.t * 1000), r.pose ? 1 : 0, v && v.view ? v.view : '', v && v.ratio !== null ? v.ratio.toFixed(3) : '', v ? v.facing : '']
            .concat(keys.map(k => num(r.pose ? r.pose.angles[k] : null)))
            .concat(signedKeys.map(k => num(r.pose ? r.signed[k] : null)))
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
aspectSelect.addEventListener('change', () => { if (data) analyze(); });

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
    redraw();
});
playBtn.addEventListener('click', togglePlay);
mirrorBtn.addEventListener('click', () => {
    mirrored = !mirrored;
    mirrorBtn.setAttribute('aria-pressed', mirrored);
    showSummary();
    redraw();
});
csvOut.addEventListener('click', exportCSV);
window.addEventListener('resize', redraw);

buildToggles();
// 網址加上 ?demo 直接載入側面示範（方便展示）
if (new URLSearchParams(location.search).has('demo')) $('demoSide').click();
