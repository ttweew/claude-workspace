// 實測報表：一個錄製檔 → 這一組的實測資訊＋網站算的每一下（背景執行緒和主畫面共用，結果一樣）
// 不是實測模式錄的、實測資訊被改壞的檔案：丟出錯誤，報表列成「不是實測檔」
// 每一下除了錯誤，也帶 AI 模型的資料要用的數字（js/data/dataset.js：最低角度、秒數、相似度、晃動、卡住、每條規則量到的數字）

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
        // 合成的實測檔（tests/synthetic-sets.mjs，不是真人）：AI 模型的資料表另外標出來
        synthetic: parsed.meta.synthetic === true,
        // 只留比對、AI 模型的資料要用的（每一下的錯誤、棒式的秒數、上面那些數字）：角度曲線那些大陣列不傳回主畫面
        items: r.reps.map(it => ({
            errors: Array.isArray(it.errors) ? it.errors : [], seconds: it.seconds,
            start: it.start, end: it.end, min: it.min, similarity: it.similarity, stalls: it.stalls, sway: it.sway, features: it.features
        }))
    };
}
