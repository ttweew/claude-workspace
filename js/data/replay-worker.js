// 重播分析的背景執行緒：讀檔、重算都在這裡做，主畫面不會卡住（5 分鐘的檔案在手機上要算好幾秒）
// 收到：load（檔案本身或文字）、analyze（畫面大小、是否計算深蹲）
// 檔案直接交給這裡讀：20 分鐘的檔案超過 100 MB，在主畫面讀成文字再複製過來，主畫面會卡好幾秒、記憶體多用一份
// 送出：ready、parsed（檔案資訊）、progress（0～1）、result（算好的數字陣列）、error

import { parseRecording, analyzeRecording, transferables } from './replay-core.js';

let parsed = null;

self.onmessage = async event => {
    const m = event.data;
    try {
        if (m.type === 'load') {
            parsed = null;
            parsed = parseRecording(typeof m.source === 'string' ? m.source : await m.source.text());
            self.postMessage({ type: 'parsed', id: m.id, meta: parsed.meta, frames: parsed.frames.length });
        } else if (m.type === 'analyze') {
            const result = await analyzeRecording(parsed, m.width, m.height, {
                workout: m.workout,
                onProgress: f => self.postMessage({ type: 'progress', id: m.id, fraction: f })
            });
            self.postMessage({ type: 'result', id: m.id, result }, transferables(result));
        }
    } catch (err) {
        self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err), syntax: err instanceof SyntaxError });
    }
};

self.postMessage({ type: 'ready' });
