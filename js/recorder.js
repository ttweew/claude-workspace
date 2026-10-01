// 錄製關鍵點資料，匯出成 CSV（給 Excel、Python 分析）或 JSON（給之後的後端 AI）
// 欄位與座標的說明在 docs/data-format.md

import { LANDMARKS } from './landmarks.js';

const MAX_SECONDS = 300;  // 最多錄 5 分鐘，避免手機記憶體不夠
const FORMAT_VERSION = 1;

// 小數位數：比例座標到小數第 5 位（640 像素寬時約 0.006 像素），公尺到 0.1 公釐
const round = (v, digits) => (v === undefined || v === null || Number.isNaN(v) ? '' : Number(v.toFixed(digits)));

// 錄製中每一格只存成一整塊數字陣列（Float64Array），不是 66 個小陣列：
// 記憶體少一半以上，手機也不用一直回收大量小物件，錄製時畫面比較不會偶爾卡一下
// 匯出時才轉成小數位數固定的格式，匯出的檔案內容和以前完全一樣
const POINTS = LANDMARKS.length;
function pack(points, fields) {
    const data = new Float64Array(POINTS * fields.length);
    points.forEach((p, i) => fields.forEach((f, j) => {
        data[i * fields.length + j] = p[f] === undefined || p[f] === null ? NaN : p[f];
    }));
    return data;
}
function unpack(data, digits) {
    const points = [];
    for (let i = 0; i < data.length; i += digits.length) points.push(digits.map((d, j) => round(data[i + j], d)));
    return points;
}
const LANDMARK_DIGITS = [5, 5, 5, 3];  // x、y、z、visibility
const WORLD_DIGITS = [4, 4, 4];        // 公尺座標 x、y、z

export class PoseRecorder {
    constructor() {
        this.frames = [];
        this.recording = false;
        this.meta = null;
    }

    // 開始錄製；meta：裝置與設定資訊（運算方式、鏡頭解析度…），會寫進 JSON
    start(meta) {
        this.frames = [];
        this.meta = { ...meta, startedAt: new Date().toISOString() };
        this.startTime = null;
        this.recording = true;
    }

    stop() {
        this.recording = false;
    }

    // 錄下一格；timeMs：偵測時間，landmarks：33 點原始比例座標，world：33 點公尺座標（可能沒有）
    // 沒偵測到人的格子也記錄（landmarks 為 null），才看得出中間斷掉多久
    // 回傳 false 表示已達時間上限、自動停止
    add(timeMs, landmarks, world) {
        if (!this.recording) return false;
        if (this.startTime === null) this.startTime = timeMs;
        const t = timeMs - this.startTime;
        if (t > MAX_SECONDS * 1000) {
            this.stop();
            return false;
        }
        this.frames.push({
            t: Math.round(t),
            landmarks: landmarks ? pack(landmarks, ['x', 'y', 'z', 'visibility']) : null,
            world: world ? pack(world, ['x', 'y', 'z']) : null
        });
        return true;
    }

    get frameCount() {
        return this.frames.length;
    }

    get seconds() {
        return this.frames.length ? this.frames[this.frames.length - 1].t / 1000 : 0;
    }

    // CSV：一列一格畫面，欄位為 frame、time_ms、detected，接著每個點的 x、y、z、visibility，最後是公尺座標
    // 匯出用的每一格：{ t, landmarks: [[x, y, z, visibility], …], world: [[x, y, z], …] }
    exportFrames() {
        return this.frames.map(f => ({
            t: f.t,
            landmarks: f.landmarks ? unpack(f.landmarks, LANDMARK_DIGITS) : null,
            world: f.world ? unpack(f.world, WORLD_DIGITS) : null
        }));
    }

    toCSV() {
        const names = LANDMARKS.map(([key]) => key.toLowerCase());
        const header = ['frame', 'time_ms', 'detected']
            .concat(...names.map(n => [n + '_x', n + '_y', n + '_z', n + '_vis']))
            .concat(...names.map(n => [n + '_wx', n + '_wy', n + '_wz']));
        const empty = n => new Array(n).fill('');
        const rows = this.exportFrames().map((f, i) => [i, f.t, f.landmarks ? 1 : 0]
            .concat(f.landmarks ? f.landmarks.flat() : empty(33 * 4))
            .concat(f.world ? f.world.flat() : empty(33 * 3))
            .join(','));
        // 開頭加 BOM，Excel 打開才不會亂碼
        return '﻿' + [header.join(',')].concat(rows).join('\r\n') + '\r\n';
    }

    // JSON：之後上傳後端用的格式，包含裝置資訊與每一格的資料
    toJSON() {
        return JSON.stringify({
            format: 'ai-sport-pose',
            version: FORMAT_VERSION,
            meta: this.meta,
            landmarkNames: LANDMARKS.map(([key]) => key),
            fields: { landmarks: ['x', 'y', 'z', 'visibility'], world: ['x', 'y', 'z'] },
            frames: this.exportFrames()
        });
    }
}

// 讓瀏覽器下載文字檔（手機上會出現「儲存到檔案」或分享選單）
export function downloadText(filename, text, mimeType) {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// 檔名用錄製開始的時間，例如 pose_20261001_153012
export function recordingName(meta) {
    const d = new Date(meta.startedAt);
    const pad = n => String(n).padStart(2, '0');
    return 'pose_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_'
        + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}
