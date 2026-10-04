// 錄製關鍵點資料，匯出成 CSV（給 Excel、Python 分析）或 JSON（給之後的後端 AI）
// 欄位與座標的說明在 docs/data-format.md

import { LANDMARKS, isVisible } from './landmarks.js';

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
const SMOOTH_DIGITS = [5, 5, 5, 3, 0];   // 平滑後的 x、y、z、visibility、seen（畫面上有沒有畫出來：1／0）
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
    // smoothed：平滑後的 33 點（和畫面上的骨架相同；沒有人或被擋鬼點擋掉時為 null）
    // 沒偵測到人的格子也記錄（landmarks 為 null），才看得出中間斷掉多久
    // 回傳 false 表示已達時間上限、自動停止
    add(timeMs, landmarks, world, smoothed = null) {
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
            world: world ? pack(world, ['x', 'y', 'z']) : null,
            smoothed: smoothed ? pack(smoothed.map(p => ({ ...p, seen: isVisible(p) ? 1 : 0 })), ['x', 'y', 'z', 'visibility', 'seen']) : null
        });
        return true;
    }

    get frameCount() {
        return this.frames.length;
    }

    get seconds() {
        return this.frames.length ? this.frames[this.frames.length - 1].t / 1000 : 0;
    }

    // 匯出用的每一格：{ t, landmarks: [[x, y, z, visibility], …], world: [[x, y, z], …], smoothed: [[x, y, z, visibility, seen], …] }
    exportFrame(f) {
        return {
            t: f.t,
            landmarks: f.landmarks ? unpack(f.landmarks, LANDMARK_DIGITS) : null,
            world: f.world ? unpack(f.world, WORLD_DIGITS) : null,
            smoothed: f.smoothed ? unpack(f.smoothed, SMOOTH_DIGITS) : null
        };
    }

    exportFrames() {
        return this.frames.map(f => this.exportFrame(f));
    }

    // CSV：一列一格畫面，欄位為 frame、time_ms、detected，接著每個點的 x、y、z、visibility，然後是公尺座標，最後是平滑後的點
    // 一小段一小段產生（每段 CHUNK 格），匯出時中間可以讓畫面喘口氣
    *csvChunks() {
        const frames = this.frames;
        const names = LANDMARKS.map(([key]) => key.toLowerCase());
        const header = ['frame', 'time_ms', 'detected']
            .concat(...names.map(n => [n + '_x', n + '_y', n + '_z', n + '_vis']))
            .concat(...names.map(n => [n + '_wx', n + '_wy', n + '_wz']))
            // 平滑後的點（加在最後面，前面的欄位和以前完全相同，舊的分析程式不用改）
            .concat(...names.map(n => [n + '_sx', n + '_sy', n + '_sz', n + '_svis', n + '_seen']));
        const empty = n => new Array(n).fill('');
        // 開頭加 BOM，Excel 打開才不會亂碼
        yield '\ufeff' + header.join(',') + '\r\n';
        for (let start = 0; start < frames.length; start += CHUNK) {
            let text = '';
            for (let i = start; i < Math.min(frames.length, start + CHUNK); i++) {
                const f = this.exportFrame(frames[i]);
                text += [i, f.t, f.landmarks ? 1 : 0]
                    .concat(f.landmarks ? f.landmarks.flat() : empty(33 * 4))
                    .concat(f.world ? f.world.flat() : empty(33 * 3))
                    .concat(f.smoothed ? f.smoothed.flat() : empty(33 * 5))
                    .join(',') + '\r\n';
            }
            yield text;
        }
    }

    // JSON：之後上傳後端用的格式，包含裝置資訊與每一格的資料（內容和整個一起 JSON.stringify 完全相同）
    *jsonChunks() {
        const frames = this.frames;
        const head = JSON.stringify({
            format: 'ai-sport-pose',
            version: FORMAT_VERSION,
            meta: this.meta,
            landmarkNames: LANDMARKS.map(([key]) => key),
            fields: { landmarks: ['x', 'y', 'z', 'visibility'], world: ['x', 'y', 'z'], smoothed: ['x', 'y', 'z', 'visibility', 'seen'] },
            frames: null
        });
        yield head.slice(0, -'null}'.length) + '[';
        for (let start = 0; start < frames.length; start += CHUNK) {
            const part = [];
            for (let i = start; i < Math.min(frames.length, start + CHUNK); i++) part.push(JSON.stringify(this.exportFrame(frames[i])));
            yield (start ? ',' : '') + part.join(',');
        }
        yield ']}';
    }

    toCSV() {
        return [...this.csvChunks()].join('');
    }

    toJSON() {
        return [...this.jsonChunks()].join('');
    }
}

const CHUNK = 50;

// 把一段一段的內容組成檔案；每算一小段（約 12 毫秒）就讓畫面喘口氣，
// 5 分鐘的錄製在較慢的手機上要算 2～3 秒，一次算完畫面會整個停住（骨架、按鈕都不動）
// 直接組成 Blob，不先接成一個十幾 MB 的大字串，也比較省記憶體
export async function buildFile(chunks, mimeType) {
    const parts = [];
    let last = performance.now();
    for (const part of chunks) {
        parts.push(part);
        if (performance.now() - last > 12) {
            await new Promise(resolve => setTimeout(resolve, 0));
            last = performance.now();
        }
    }
    return new Blob(parts, { type: mimeType });
}

// 讓瀏覽器下載文字檔（手機上會出現「儲存到檔案」或分享選單）
export function downloadText(filename, text, mimeType) {
    downloadBlob(filename, new Blob([text], { type: mimeType }));
}

export function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
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
