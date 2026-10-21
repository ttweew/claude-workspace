// 實測報表：一個錄製檔 → 這一組的實測資訊＋網站算的每一下（背景執行緒和主畫面共用，結果一樣）
// 不是實測模式錄的、實測資訊被改壞的檔案：丟出錯誤，報表列成「不是實測檔」

import { parseRecording, needsFrameSize, analyzeRecording } from './replay-core.js';
import { testInfo } from './test-mode.js';
import { WORKOUTS } from '../analysis/workouts.js';

export async function analyzeOne(text) {
    const parsed = parseRecording(text);
    const info = testInfo(parsed.meta);
    if (!info) throw new Error('不是實測模式錄的檔案');
    if (needsFrameSize(parsed.meta)) throw new Error('檔案沒有記錄畫面大小');
    const r = await analyzeRecording(parsed, parsed.meta.videoWidth, parsed.meta.videoHeight, { workout: info.workout });
    const started = Date.parse(parsed.meta.startedAt);
    return {
        info,
        kind: WORKOUTS[info.workout].kind,
        startedAt: Number.isFinite(started) ? started : 0,
        // 只留比對要用的（每一下的錯誤、棒式的秒數）：角度曲線那些大陣列不傳回主畫面
        items: r.reps.map(it => ({ errors: Array.isArray(it.errors) ? it.errors : [], seconds: it.seconds }))
    };
}
