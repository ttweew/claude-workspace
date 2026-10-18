// 重播分析的計算核心：讀檔（JSON / CSV）、用和鏡頭畫面相同的流程重算每一格
// 背景執行緒（replay-worker.js）和主畫面（不支援背景執行緒時）共用這一份，結果完全相同
//
// 結果用一整塊數字陣列（typed array）存，不是每一格一堆小物件：5 分鐘約 9000 格，
// 小物件會有幾十萬個，佔記憶體、手機上也慢；數字陣列還可以「整塊交給」主畫面，不用複製

import { PosePipeline } from './pipeline.js';
import { ANGLES, computeAngles, signedAngle } from './angles.js';
import { LANDMARKS, isVisible } from './landmarks.js';
import { SquatCounter } from './squat.js';

export const ANGLE_KEYS = ANGLES.map(([key]) => key);
export const SIGNED_KEYS = ANGLE_KEYS.filter(k => /_(KNEE|HIP)$/.test(k));
export const VIEW_CODES = [null, 'side', 'oblique', 'front'];
const POINTS = LANDMARKS.length;

// ---------- 讀檔 ----------

// 一個點：[x, y, z, visibility]；x、y 壞掉（不是數字、空的）的點當作看不到，其他點照常使用
// z 沒有時當作 0、可信度沒有時當作 0（和以前讀檔的結果相同）
function toPoint(q) {
    if (!Array.isArray(q)) return { x: NaN, y: NaN, z: NaN, visibility: 0 };
    const [x, y, z, visibility] = q.map(v => (v === null || v === '' ? NaN : Number(v)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: NaN, y: NaN, z: NaN, visibility: 0 };
    return { x, y, z: Number.isFinite(z) ? z : 0, visibility: Number.isFinite(visibility) ? visibility : 0 };
}

// 時間一定要是數字：壞掉的時間會讓平滑程式算出壞數字，之後每一格的角度都算不出來
function frameTime(value, index) {
    const t = value === null || value === '' ? NaN : Number(value);
    if (!Number.isFinite(t)) throw new Error('第 ' + (index + 1) + ' 格的時間不正確，檔案可能被修改或損壞');
    return t;
}

// JSON：網站「下載 JSON」的格式
function parseJSON(text) {
    const json = JSON.parse(text);
    if (!json || json.format !== 'ai-sport-pose' || !Array.isArray(json.frames)) throw new Error('這不是本網站「數據」面板下載的 JSON 或 CSV 檔');
    const names = json.landmarkNames || LANDMARKS.map(([k]) => k);
    if (names.length !== POINTS) throw new Error('點的數量不同（' + names.length + ' 點），目前只支援 33 點');
    return {
        meta: json.meta && typeof json.meta === 'object' ? json.meta : {},
        frames: json.frames.map((f, i) => {
            if (!f || typeof f !== 'object') throw new Error('第 ' + (i + 1) + ' 格資料損壞，檔案可能被修改或不完整');
            const lm = f.landmarks;
            if (lm !== null && lm !== undefined && (!Array.isArray(lm) || lm.length !== POINTS)) {
                throw new Error('第 ' + (i + 1) + ' 格的點資料不完整（應該有 33 點），檔案可能被修改或損壞');
            }
            return { t: frameTime(f.t, i), raw: lm ? lm.map(toPoint) : null };
        })
    };
}

// CSV：網站「下載 CSV」的格式（第一列是欄位名稱）
function parseCSV(text) {
    const lines = text.replace(/^\ufeff/, '').split(/\r?\n/).filter(l => l.trim());
    const header = lines[0].split(',');
    const col = name => header.indexOf(name);
    if (col('time_ms') < 0 || col('detected') < 0) throw new Error('這不是本網站「數據」面板下載的 JSON 或 CSV 檔');
    const cols = LANDMARKS.map(([key]) => ['x', 'y', 'z', 'vis'].map(f => col(key.toLowerCase() + '_' + f)));
    if (cols.some(c => c.some(i => i < 0))) throw new Error('CSV 缺少部分點的欄位');
    const tCol = col('time_ms'), dCol = col('detected');
    const rows = lines.slice(1).map(line => line.split(','));
    // 最後一列欄位不夠：檔案只存到一半（例如下載中斷），略過這一列，前面的照常使用
    if (rows.length && rows[rows.length - 1].length < header.length) rows.pop();
    const frames = rows.map((v, i) => {
        if (v.length < header.length) throw new Error('第 ' + (i + 1) + ' 格的欄位數量不對，檔案可能被修改或損壞');
        return {
            t: frameTime(v[tCol], i),
            raw: v[dCol] === '1' ? cols.map(([x, y, z, vis]) => toPoint([v[x], v[y], v[z], v[vis]])) : null
        };
    });
    return { meta: { csv: true }, frames };
}

// 看內容判斷格式，不看副檔名：有些手機下載時會把檔名改成 xxx.json.txt
export function parseRecording(text) {
    const parsed = text.replace(/^﻿/, '').trimStart().startsWith('{') ? parseJSON(text) : parseCSV(text);
    if (!parsed.frames.length) throw new Error('檔案裡沒有任何一格資料');
    return parsed;
}

// 檔案有沒有記錄鏡頭畫面大小（CSV 沒有，要使用者選）
export function needsFrameSize(meta) {
    return !!meta.csv || !(meta.videoWidth > 0 && meta.videoHeight > 0);
}

// ---------- 重算 ----------

// parsed：parseRecording 的結果；width、height：鏡頭畫面大小；lab：是否計算深蹲（實驗中）
// onProgress(0～1)：進度；pause：每算一段就呼叫一次（主畫面執行時用來讓畫面喘口氣，背景執行緒不用）
// 回傳：{ n, t, present, angles, signed, rawAngles, view, ratio, facing, smooth, smoothVis, rawPresent, raw, rawVis, reps }
//   沒有值（算不出來）的角度、比值是 NaN；present：這一格有沒有人（經過擋鬼點）
export async function analyzeRecording(parsed, width, height, { lab = false, onProgress = null, pause = null } = {}) {
    const frames = parsed.frames;
    const n = frames.length, A = ANGLE_KEYS.length, S = SIGNED_KEYS.length;
    const out = {
        n, width, height,
        t: new Float64Array(n),
        present: new Uint8Array(n),
        angles: new Float32Array(n * A).fill(NaN),
        signed: new Float32Array(n * S).fill(NaN),
        rawAngles: new Float32Array(n * A).fill(NaN),
        view: new Uint8Array(n),
        ratio: new Float32Array(n).fill(NaN),
        facing: new Int8Array(n),
        smooth: new Float32Array(n * POINTS * 2),     // 平滑後的點 x、y（畫骨架用）
        smoothVis: new Uint8Array(n * POINTS),        // 平滑後的點是否看得到（經過擋鬼點）
        rawPresent: new Uint8Array(n),                // 原始資料這一格有沒有偵測到人
        raw: new Float32Array(n * POINTS * 2),        // 原始的點 x、y
        rawVis: new Uint8Array(n * POINTS),
        reps: []
    };
    const pipeline = new PosePipeline();
    const squat = lab ? new SquatCounter() : null;
    for (let i = 0; i < n; i++) {
        const f = frames[i];
        out.t[i] = f.t / 1000;
        const p = pipeline.process(f.raw, f.t, width, height);
        if (squat) squat.update(p, f.t);
        if (f.raw) {
            out.rawPresent[i] = 1;
            const ra = computeAngles(f.raw, width, height);
            ANGLE_KEYS.forEach((k, j) => { if (ra[k] !== null) out.rawAngles[i * A + j] = ra[k]; });
            f.raw.forEach((q, j) => {
                out.raw[(i * POINTS + j) * 2] = q.x;
                out.raw[(i * POINTS + j) * 2 + 1] = q.y;
                out.rawVis[i * POINTS + j] = isVisible(q) ? 1 : 0;
            });
        }
        if (p) {
            out.present[i] = 1;
            ANGLE_KEYS.forEach((k, j) => { if (p.angles[k] !== null) out.angles[i * A + j] = p.angles[k]; });
            SIGNED_KEYS.forEach((k, j) => {
                const s = signedAngle(k, p.angles, p.landmarks, width, height, p.view.facing);
                if (s !== null) out.signed[i * S + j] = s;
            });
            out.view[i] = Math.max(0, VIEW_CODES.indexOf(p.view.view));
            if (p.view.ratio !== null) out.ratio[i] = p.view.ratio;
            out.facing[i] = p.view.facing;
            p.landmarks.forEach((q, j) => {
                out.smooth[(i * POINTS + j) * 2] = q.x;
                out.smooth[(i * POINTS + j) * 2 + 1] = q.y;
                out.smoothVis[i * POINTS + j] = isVisible(q) ? 1 : 0;
            });
        }
        if ((i & 511) === 511) {
            if (onProgress) onProgress(i / n);
            if (pause) await pause();
        }
    }
    if (squat) out.reps = squat.reps;
    if (onProgress) onProgress(1);
    return out;
}

// 可以「整塊交給」另一個執行緒的陣列（不用複製）
export function transferables(result) {
    return ['t', 'present', 'angles', 'signed', 'rawAngles', 'view', 'ratio', 'facing', 'smooth', 'smoothVis', 'rawPresent', 'raw', 'rawVis']
        .map(k => result[k].buffer);
}
