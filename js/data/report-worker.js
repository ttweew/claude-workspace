// 實測報表的背景執行緒（10/21）：一個檔案讀進來、重算、只回傳每一下的錯誤（棒式是每一次的秒數和錯誤），算完就丟掉
// 和重播分析一樣在背景算，主畫面不會卡；一次幾十個檔案也不會同時佔著記憶體
// 收到：{ id, source（File 或文字） }；送出：{ id, type: 'result', info, kind, startedAt, items } 或 { id, type: 'error', message }

import { analyzeOne } from './report-core.js';

self.onmessage = async event => {
    const m = event.data;
    try {
        const text = typeof m.source === 'string' ? m.source : await m.source.text();
        self.postMessage({ type: 'result', id: m.id, ...(await analyzeOne(text)) });
    } catch (err) {
        self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
    }
};

self.postMessage({ type: 'ready' });
