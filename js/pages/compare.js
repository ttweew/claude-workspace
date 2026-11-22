// 模型對照頁（compare.html，11/21，讓使用者自己選模型的第 4 步）：同一段影片的同一批畫面，兩個 AI 模型各算一次，並排比
// 做法：影片一格一格跳（每秒 30 或 15 格），每一格兩個模型各找一次骨架（js/ai/pose-source.js，和首頁同一個接口）；
// 存成兩份和首頁一樣格式的錄製檔，用重播分析同一套算法（js/data/replay-core.js）算次數、角度、錯誤，
// 再並排比（js/analysis/model-compare.js）。影片只在這個瀏覽器裡處理，不上傳
// 兩個模型一起跑的負擔 11/21 量過（MediaPipe、YOLO 各在自己的背景執行緒，不會互相拖慢）

import { setupOffline } from '../platform/offline.js';
import { looksLikeVideo } from '../platform/video-source.js';
import { openSource } from '../ai/pose-source.js';
import { MODEL_KEYS, profileOf, shortName, hasFeet } from '../ai/models.js';
import { analyzeRecording, ANGLE_KEYS } from '../data/replay-core.js';
import { compareResults, jointsFor } from '../analysis/model-compare.js';
import { ANGLES } from '../analysis/angles.js';
import { WORKOUTS, isWorkout, formatSeconds } from '../analysis/workouts.js';
import { errorShort, unjudgedRules } from '../analysis/form.js';
import { PoseRecorder, buildFile, downloadBlob, downloadText } from '../data/recorder.js';
import { drawChart } from '../ui/chart.js';
import { CONNECTIONS } from '../ui/draw.js';
import { isVisible } from '../skeleton/landmarks.js';

setupOffline();

const $ = id => document.getElementById(id);
const video = $('video');
const status = $('loadStatus');
const runStatus = $('runStatus');
const progress = $('runProgress');
// 兩個模型的顏色：A 藍、B 橘（畫面上一定另外寫字，不是只靠顏色分）
const COLORS = { A: '#4cc3ff', B: '#ffb02e' };
const ANGLE_NAMES = Object.fromEntries(ANGLES.map(([key, name]) => [key, name]));
const SEEK_TIMEOUT_MS = 5000;   // 跳到某一格超過 5 秒沒好：影片壞了或瀏覽器不支援這種格式

let file = null, fileUrl = null;
let running = false, cancelled = false;
let result = null;   // 算完的結果：{ keys, rate, times, frames, analyses, cmp, info, workout, width, height }

function setStatus(el, text, error = false) {
    el.textContent = text;
    el.classList.toggle('error', error);
}

// ---------- 選項 ----------
function fillOptions() {
    $('workoutPick').replaceChildren(...['squat', 'pushup', 'plank', 'lunge', 'free'].map(id => new Option(WORKOUTS[id].name, id)));
    for (const [id, key] of [['modelA', 'lite'], ['modelB', 'yolo-n']]) {
        $(id).replaceChildren(...MODEL_KEYS.map(k => new Option(profileOf(k).label, k)));
        $(id).value = key;
    }
}
fillOptions();

// ---------- 選影片 ----------
$('videoInput').addEventListener('change', () => {
    const f = $('videoInput').files[0];
    if (f) openVideo(f);
});

async function openVideo(f) {
    if (running) return;
    $('runBtn').disabled = true;
    $('resultCard').hidden = true;
    result = null;
    if (!looksLikeVideo(f)) {
        setStatus(status, '這不是影片檔，請選 MP4、MOV 或 WebM', true);
        return;
    }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    file = f;
    fileUrl = URL.createObjectURL(f);
    setStatus(status, '讀取影片中…');
    try {
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = () => reject(new Error('cannot decode'));
            video.src = fileUrl;
        });
    } catch (err) {
        setStatus(status, '這段影片這個瀏覽器打不開（格式不支援或檔案壞了），請轉成 MP4（H.264）再試', true);
        return;
    }
    // 不知道多長（例如網頁錄的 WebM）就沒辦法一格一格跳
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) {
        setStatus(status, '這段影片不知道有多長，沒辦法一格一格分析；請轉成 MP4 再試', true);
        return;
    }
    setStatus(status, '影片 ' + video.duration.toFixed(1) + ' 秒（' + video.videoWidth + '×' + video.videoHeight + '）；選好動作和兩個模型後按「開始對照」');
    $('runBtn').disabled = false;
}

// 跳到第 t 秒，等那一格的畫面準備好
// 用 addEventListener（不用 onseeked）：拖滑桿時前一次還沒跳好又跳下一次，每一次都等得到，不會互相蓋掉
function seek(t) {
    return new Promise((resolve, reject) => {
        const done = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(() => {
            video.removeEventListener('seeked', done);
            reject(new Error('影片跳到 ' + t.toFixed(2) + ' 秒超過 ' + SEEK_TIMEOUT_MS / 1000 + ' 秒'));
        }, SEEK_TIMEOUT_MS);
        video.addEventListener('seeked', done, { once: true });
        video.currentTime = t;
    });
}

// ---------- 跑兩個模型 ----------
$('runBtn').addEventListener('click', () => run().catch(err => {
    console.error(err);
    setStatus(runStatus, '對照中斷：' + err.message, true);
    finishRun();
}));
$('cancelBtn').addEventListener('click', () => {
    cancelled = true;
    setStatus(runStatus, '停止中…');
});

function showProgress(fraction) {
    const pct = Math.round(fraction * 100);
    progress.firstElementChild.style.width = pct + '%';
    progress.setAttribute('aria-valuenow', String(pct));
}

function finishRun() {
    running = false;
    $('runBtn').disabled = !file;
    $('cancelBtn').hidden = true;
    progress.hidden = true;
    for (const id of ['videoInput', 'workoutPick', 'modelA', 'modelB', 'ratePick']) $(id).disabled = false;
}

// 載入一個模型（和首頁同一個接口）；下載進度寫在狀態列
async function load(label, key) {
    return openSource(key, p => {
        if (p.stage === 'download') setStatus(runStatus, '下載 ' + label + '（' + shortName(key) + '）… ' + Math.round(p.fraction * 100) + '%');
        else setStatus(runStatus, label + '（' + shortName(key) + '）準備中…');
    });
}

// 一格交給一個模型：回傳 { raw, world, ms }；這一格出錯（偶爾）當作沒找到人，不中斷整段
async function detectOne(detector, ts) {
    const t0 = performance.now();
    try {
        const r = await detector.detect(video, ts);
        return { raw: r && r.landmarks ? r.landmarks : null, world: r && r.world ? r.world : null, ms: performance.now() - t0 };
    } catch (err) {
        console.warn('這一格偵測出錯（當作沒找到人）：', err);
        return { raw: null, world: null, ms: performance.now() - t0 };
    }
}

async function run() {
    if (running || !file) return;
    const keys = { A: $('modelA').value, B: $('modelB').value };
    const workout = $('workoutPick').value;
    const rate = Number($('ratePick').value) === 15 ? 15 : 30;
    if (!MODEL_KEYS.includes(keys.A) || !MODEL_KEYS.includes(keys.B) || !isWorkout(workout)) return;
    running = true;
    cancelled = false;
    result = null;
    $('resultCard').hidden = true;
    $('runBtn').disabled = true;
    $('cancelBtn').hidden = false;
    for (const id of ['videoInput', 'workoutPick', 'modelA', 'modelB', 'ratePick']) $(id).disabled = true;
    progress.hidden = false;
    showProgress(0);
    const detectors = {};
    try {
        detectors.A = await load('模型 A', keys.A);
        if (cancelled) throw new Error('已停止');
        detectors.B = await load('模型 B', keys.B);
        if (cancelled) throw new Error('已停止');
        const W = video.videoWidth, H = video.videoHeight;
        const duration = video.duration;
        const n = Math.max(1, Math.floor(duration * rate));
        const frames = { A: [], B: [] }, ms = { A: [], B: [] };
        const times = [];
        const started = performance.now();
        // 給 AI 的時間：MediaPipe 規定一直往前，而且要比暖機時用的時間（載入時的「現在」）晚，所以從現在開始、照影片裡的間隔往後加
        // （照片量角器 10/22 踩過：從 100 開始，在主畫面跑 AI 時比暖機早，AI 直接出錯）；錄製檔記的是影片裡的時間
        const base = Math.ceil(performance.now()) + 1000;
        for (let i = 0; i < n && !cancelled; i++) {
            const t = Math.min(i / rate, Math.max(0, duration - 0.001));
            await seek(t);
            const at = Math.round(i * 1000 / rate);
            for (const side of ['A', 'B']) {
                const r = await detectOne(detectors[side], base + at);
                frames[side].push({ t: at, raw: r.raw, world: r.world });
                ms[side].push(r.ms);
            }
            times.push(t);
            if (i % 5 === 4 || i === n - 1) {
                showProgress((i + 1) / n);
                const left = (performance.now() - started) / (i + 1) * (n - i - 1) / 1000;
                setStatus(runStatus, '分析中：第 ' + (i + 1) + '／' + n + ' 格' + (i > 10 ? '，大約還要 ' + Math.ceil(left) + ' 秒' : ''));
            }
        }
        if (!times.length) throw new Error('已停止');
        const info = {};
        for (const side of ['A', 'B']) {
            const sorted = [...ms[side]].sort((x, y) => x - y);
            info[side] = { computeMode: detectors[side].computeMode, ms: Math.round(sorted[sorted.length >> 1]) };
        }
        setStatus(runStatus, '算次數、角度中…');
        const analyses = {};
        for (const side of ['A', 'B']) {
            // meta.model：用 YOLO 時照頭朝哪邊挑靠近鏡頭的那一側（11/22，和重播分析同一套，replay-core.js 看這個）
            analyses[side] = await analyzeRecording({ meta: { workout, model: profileOf(keys[side]).file }, frames: frames[side].map(f => ({ t: f.t, raw: f.raw, world: f.world })) }, W, H, { workout });
        }
        result = { keys, rate, times, frames, analyses, info, workout, width: W, height: H, cut: cancelled,
            cmp: compareResults(analyses.A, analyses.B, workout) };
        showResult();
        setStatus(runStatus, (cancelled ? '已停止：只比了前 ' + times.length + ' 格（' + formatSeconds(times[times.length - 1]) + '）' : '完成：比了 ' + times.length + ' 格')
            + '。結果在下面');
    } finally {
        for (const d of Object.values(detectors)) d.close();
        finishRun();
    }
    // 跑完才畫第一格：跑的時候不能跳影片（會打亂正在分析的那一格，showFrame 會直接跳過）
    showFrame(0);
}

// ---------- 結果 ----------
function cell(tag, text) {
    const el = document.createElement(tag);
    el.textContent = text;
    return el;
}
function table(el, head, rows) {
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    tr.append(...head.map(h => cell('th', h)));
    thead.append(tr);
    const tbody = document.createElement('tbody');
    tbody.append(...rows.map(r => {
        const row = document.createElement('tr');
        row.append(...r.map((v, i) => cell(i ? 'td' : 'th', v)));
        return row;
    }));
    el.replaceChildren(thead, tbody);
}
const deg = v => (v === null || v === undefined ? '—' : v + '°');
const signedDeg = v => (v === null || v === undefined ? '—' : (v > 0 ? '+' : '') + v + '°');

function modelCard(side) {
    const key = result.keys[side];
    const s = result.cmp[side.toLowerCase()];
    const info = result.info[side];
    const card = document.createElement('div');
    card.className = 'model-card';
    card.style.setProperty('--model-color', COLORS[side]);
    const title = cell('h3', side + '：' + profileOf(key).label + '（' + (side === 'A' ? '藍線' : '橘線') + '）');
    const lines = [
        '運算：' + (info.computeMode || '—') + ' · 每格約 ' + info.ms + ' 毫秒',
        '找到人：' + s.seen + '% 的格子'
    ];
    if (WORKOUTS[result.workout].kind === 'hold') {
        const longest = s.seconds.filter(v => v !== null);
        lines.push('棒式：撐了 ' + s.reps + ' 次' + (longest.length ? '，最久 ' + Math.max(...longest) + ' 秒' : ''));
    } else if (WORKOUTS[result.workout].kind === 'reps') {
        lines.push('次數：' + s.reps + ' 下');
    }
    const errors = Object.entries(s.errors);
    if (WORKOUTS[result.workout].kind) lines.push(errors.length ? '錯誤：' + errors.map(([id, c]) => errorShort(id) + ' ' + c + ' 下').join('、') : '錯誤：沒有');
    const unjudged = unjudgedRules(result.workout, hasFeet(key));
    if (unjudged.length) lines.push('判斷不了：' + unjudged.join('、') + '（沒有腳跟、腳尖的點）');
    const list = document.createElement('ul');
    list.append(...lines.map(text => cell('li', text)));
    card.append(title, list);
    return card;
}

function showResult() {
    const { cmp, keys } = result;
    $('modelCards').replaceChildren(modelCard('A'), modelCard('B'));
    // 每一下最低的角度
    const kind = WORKOUTS[result.workout].kind;
    const repRows = [];
    if (kind === 'reps') {
        const n = Math.max(cmp.a.mins.length, cmp.b.mins.length);
        for (let i = 0; i < n; i++) {
            const d = i < cmp.repDiffs.length ? cmp.repDiffs[i] : null;
            repRows.push(['第 ' + (i + 1) + ' 下', deg(cmp.a.mins[i] ?? null), deg(cmp.b.mins[i] ?? null), signedDeg(d)]);
        }
    }
    $('repTable').hidden = !repRows.length;
    table($('repTable'), ['第幾下', 'A 最低', 'B 最低', '差（A－B）'], repRows);
    // 角度差
    table($('jointTable'), ['關節', '比了幾格', '平均差（A－B）', '平均絕對差', '9 成在幾度內', '最大'],
        cmp.joints.map(j => [ANGLE_NAMES[j.key] || j.key, String(j.frames), signedDeg(j.mean), deg(j.meanAbs), deg(j.p90), deg(j.max)]));
    // 曲線
    const joints = jointsFor(result.workout);
    $('chartJoint').replaceChildren(...joints.map(k => new Option(ANGLE_NAMES[k] || k, k)));
    // 預設看主要的關節（計次用的，jointsFor 排在最前面，左右一對）比到比較多格的那一側：
    // 側面拍時被身體擋住的那一側常常一格都比不到，曲線是空的（11/21 伏地挺身示範影片：左肘 0 格、右肘 217 格；以前預設第一個「左肘」）
    let pick = null;
    for (let i = 0; i + 1 < cmp.joints.length && !pick; i += 2) {
        const [left, right] = [cmp.joints[i], cmp.joints[i + 1]];
        const better = right.frames > left.frames ? right : left;
        if (better.frames > 0) pick = better;
    }
    if (pick) $('chartJoint').value = pick.key;
    $('chartLegend').replaceChildren(...['A', 'B'].map(side => {
        const span = cell('span', side + '：' + shortName(keys[side]));
        span.style.setProperty('--model-color', COLORS[side]);
        return span;
    }));
    $('resultCard').hidden = false;
    drawCurves();
    // 畫面（第一格等跑完再畫，見 run 的最後）
    $('frameSlider').max = String(result.times.length - 1);
    $('frameSlider').value = '0';
}

function angleSeries(r, key) {
    const j = ANGLE_KEYS.indexOf(key), A = ANGLE_KEYS.length;
    const out = [];
    for (let i = 0; i < r.n; i++) {
        const v = r.present[i] ? r.angles[i * A + j] : NaN;
        out.push(Number.isFinite(v) ? v : null);
    }
    return out;
}

function drawCurves() {
    if (!result) return;
    const key = $('chartJoint').value;
    drawChart($('chart'), {
        key: 'compare|' + key + '|' + result.times.length,
        times: result.times,
        series: ['A', 'B'].map(side => ({ values: angleSeries(result.analyses[side], key), color: COLORS[side], width: 2 })),
        yMin: 0, yMax: 180, yStep: 30
    });
}
$('chartJoint').addEventListener('change', drawCurves);
window.addEventListener('resize', drawCurves);

// 一格畫面＋兩個模型的骨架（原始的點，看得到的才畫）
let frameRequest = 0;
async function showFrame(i) {
    if (!result || running) return;
    const request = ++frameRequest;
    const t = result.times[i];
    $('frameTime').textContent = t.toFixed(1) + ' 秒';
    try {
        await seek(t);
    } catch (err) {
        return;
    }
    if (request !== frameRequest) return;
    const canvas = $('frameView');
    canvas.width = result.width;
    canvas.height = result.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const line = Math.max(2, Math.round(canvas.width / 240));
    for (const side of ['A', 'B']) {
        const raw = result.frames[side][i].raw;
        if (!raw) continue;
        ctx.strokeStyle = COLORS[side];
        ctx.lineWidth = line;
        ctx.beginPath();
        for (const [a, b] of CONNECTIONS) {
            if (!isVisible(raw[a]) || !isVisible(raw[b])) continue;
            ctx.moveTo(raw[a].x * canvas.width, raw[a].y * canvas.height);
            ctx.lineTo(raw[b].x * canvas.width, raw[b].y * canvas.height);
        }
        ctx.stroke();
    }
}
$('frameSlider').addEventListener('input', () => showFrame(Number($('frameSlider').value)));

// ---------- 下載 ----------
// 錄製檔：和首頁錄的同一個格式（js/data/recorder.js），可以拿到重播分析打開
async function downloadRecording(side) {
    if (!result) return;
    const key = result.keys[side];
    const rec = new PoseRecorder();
    rec.start({
        app: 'AI 智慧運動分析系統',
        source: 'compare',          // 模型對照頁算的（不是鏡頭即時錄的）
        model: profileOf(key).file,
        modelChoice: key,
        computeMode: result.info[side].computeMode,
        videoWidth: result.width,
        videoHeight: result.height,
        workout: result.workout,
        sampleRate: result.rate
    }, Math.ceil(result.times[result.times.length - 1]) + 10);
    for (const f of result.frames[side]) rec.add(f.t, f.raw, f.world);
    rec.stop();
    const blob = await buildFile(rec.jsonChunks(), 'application/json');
    downloadBlob('compare_' + side + '_' + profileOf(key).file + '_' + result.workout + '.json', blob);
}
$('downloadA').addEventListener('click', () => downloadRecording('A'));
$('downloadB').addEventListener('click', () => downloadRecording('B'));

// 角度 CSV：每一格一列，兩個模型的每個角度各一欄（看不到的空著）
$('downloadCsv').addEventListener('click', () => {
    if (!result) return;
    const head = ['t'].concat(...['A', 'B'].map(side => ANGLE_KEYS.map(k => side + '_' + k)));
    const series = {};
    for (const side of ['A', 'B']) for (const k of ANGLE_KEYS) series[side + '_' + k] = angleSeries(result.analyses[side], k);
    const lines = [head.join(',')];
    result.times.forEach((t, i) => {
        lines.push([t.toFixed(3)].concat(head.slice(1).map(c => (series[c][i] === null ? '' : series[c][i].toFixed(1)))).join(','));
    });
    downloadText('compare_angles_' + result.keys.A + '_vs_' + result.keys.B + '.csv', '﻿' + lines.join('\n') + '\n', 'text/csv');
});
