// 一鍵測速（11/25）：輪流用四個 AI 模型（MediaPipe lite、full、YOLO26n、YOLO26s）各算約 10 秒，
// 記下這支手機每個模型每格算幾毫秒、每秒算幾格、用 GPU 還是 CPU；組員用自己的手機按一下，「複製結果」貼到 LINE
// （以前要自己一個一個換模型、點開運算標籤抄數字；速度建議 js/ai/advisor.js 的門檻，例如 full、YOLO26s 慢幾倍，也要靠這些數字調）
// 這裡只有算法和文字（node 測試：tests/model-speed.test.mjs）；卡片在 js/ui/speed-card.js，換模型在 js/pages/main.js
import { MODEL_KEYS, isModelKey, familyOf, profileOf } from './models.js';
import { median } from './advisor.js';
import { MODELS, YOLO_FILES, LITERT_ENGINE_SIZE, MEDIAPIPE_ENGINE_SIZE } from '../config.js';
import { stampText, systemLine, cameraLine } from '../ui/phone-info.js';

// 每個模型：換好之後先暖機 2 秒（剛換的頭幾格特別慢：GPU 要編譯、背景執行緒剛開），再量 8 秒
// 每格幾毫秒只算畫面裡有人的格子：沒有人時 MediaPipe 每格都要重新找人，比平常用的時候慢（速度建議也是只量有人的時候）
// 量了 20 秒還不到 15 格有人：寫「畫面裡沒有人」，換下一個，不會卡住
export const SPEED_PLAN = { warmupMs: 2000, measureMs: 8000, minFrames: 15, giveUpMs: 20000 };

// 測的順序：先測現在用的（不用換、不用下載），再照能力表的順序（js/ai/models.js）；畫面、複製的文字一律照能力表的順序列
export function speedOrder(current) {
    return isModelKey(current) ? [current, ...MODEL_KEYS.filter(k => k !== current)] : [...MODEL_KEYS];
}

// 每個模型的檔案多大（config.js；下載進度也用這個）
function fileBytes(key) {
    if (Object.prototype.hasOwnProperty.call(YOLO_FILES, key)) return YOLO_FILES[key].size;
    return Object.prototype.hasOwnProperty.call(MODELS, key) ? MODELS[key].size : 0;
}

// 測一輪最多要下載多少：現在用的那個之外的模型檔，加上另一家的 AI 引擎（現在用 MediaPipe 就是 YOLO 的 LiteRT，反過來也是）
// 下載過的（瀏覽器存著，js/sw.js）不用再下載，所以是「最多」；不認得的名字當作現在用 MediaPipe lite（網站預設）
export function speedDownloadBytes(current) {
    const key = isModelKey(current) ? current : 'lite';
    let total = familyOf(key) === 'yolo' ? MEDIAPIPE_ENGINE_SIZE : LITERT_ENGINE_SIZE;
    for (const other of MODEL_KEYS) if (other !== key) total += fileBytes(other);
    return total;
}

// 一個模型的量測：換好模型的時間 at 開始；main.js 每一格結果回來時呼叫 frame()，卡片每 0.25 秒看一次 state()
export class ModelTimer {
    constructor(at, plan = SPEED_PLAN) {
        this.plan = plan;
        this.from = at + plan.warmupMs;   // 暖機完、開始量的時間
        this.ms = [];                     // 量測中有人的格子各花幾毫秒
        this.times = [];                  // 量測中每一格（有沒有人都算）結果回來的時間：算每秒幾格
        this.lastPerson = -Infinity;      // 最近一次有人的時間（卡片寫「等你站進畫面」）
    }

    // ms：這格花幾毫秒（送出畫面到結果回來）；person：畫面裡有沒有人；at：結果回來的時間
    frame(ms, person, at) {
        if (!(at >= this.from) || !(typeof ms === 'number' && Number.isFinite(ms) && ms >= 0)) return;
        if (this.times.length < 3000) this.times.push(at);
        if (!person) return;
        this.lastPerson = at;
        if (this.ms.length < 3000) this.ms.push(ms);
    }

    // 'warmup' 暖機中、'measuring' 量測中、'done' 量好了、'nobody' 太久沒人（放棄這一個）
    state(at) {
        if (at < this.from) return 'warmup';
        const passed = at - this.from;
        if (passed >= this.plan.measureMs && this.ms.length >= this.plan.minFrames) return 'done';
        if (passed >= this.plan.giveUpMs) return 'nobody';
        return 'measuring';
    }

    // 量了幾秒（無條件捨去，和畫面上其他秒數一樣）
    seconds(at) {
        return Math.max(0, Math.floor((at - this.from) / 1000));
    }

    // 最近 1 秒有沒有人（卡片寫「等你站進畫面」）
    seesPerson(at) {
        return at - this.lastPerson <= 1000;
    }

    // { ms：每格幾毫秒（中位數，取整數，和運算標籤一樣）, fps：每秒幾格（和 js/ai/fps.js 一樣四捨五入）, frames：量了幾格有人的 }
    result() {
        const n = this.times.length;
        const span = n >= 2 ? this.times[n - 1] - this.times[0] : 0;
        return {
            ms: Math.round(median(this.ms)),
            fps: span > 0 ? Math.round((n - 1) * 1000 / span) : 0,
            frames: this.ms.length
        };
    }
}

// 每一個模型的結果（卡片收集）：{ key, ms, fps, frames, compute（'GPU'、'CPU'）, detail（晶片名稱…）, error（沒量到的原因，量到是 ''） }
// 外面組的，名字一律先比對清單；數字不是數字的當作沒量到
function cleanResult(r) {
    if (!r || !isModelKey(r.key)) return null;
    const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    const error = typeof r.error === 'string' ? r.error : '';
    const ms = num(r.ms), fps = num(r.fps);
    return {
        key: r.key,
        ms, fps,
        compute: typeof r.compute === 'string' ? r.compute : '',
        detail: typeof r.detail === 'string' ? r.detail : '',
        // 0 毫秒是四捨五入後的真實數字（測試的假 AI），不是沒量到
        error: error || (ms === null || fps === null ? '沒量到' : '')
    };
}

// 照能力表的順序排好，每個模型一列（沒有結果的寫「沒測」）
export function speedRows(results) {
    const byKey = new Map();
    for (const r of Array.isArray(results) ? results : []) {
        const c = cleanResult(r);
        if (c) byKey.set(c.key, c);
    }
    const lite = byKey.get('lite');
    const base = lite && !lite.error ? lite.ms : 0;
    return MODEL_KEYS.map(key => {
        const r = byKey.get(key) || { key, ms: null, fps: null, compute: '', detail: '', error: '沒測' };
        return {
            key,
            label: profileOf(key).label,
            ms: r.error ? '—' : r.ms + ' 毫秒',
            fps: r.error ? '—' : r.fps + ' 格',
            compute: r.error ? '—' : r.compute || '不明',
            detail: r.error ? '' : r.detail,
            // 和 lite 比慢幾倍（每格的毫秒數相除，用畫面上的數字算，小數一位）：調速度建議的門檻用
            ratio: !r.error && base > 0 && key !== 'lite' ? (r.ms / base).toFixed(1) : '',
            error: r.error
        };
    });
}

// 複製的文字（貼到 LINE、筆記）：時間、每個模型一行、怎麼量的、手機和鏡頭
// info：{ time, results, device, screen, ua, size, cameraFps, cameraMax, fpsSetting }（手機的部分和「複製手機資訊」一樣，js/ui/phone-info.js）
export function speedReport(info) {
    const lines = ['【AI 速度】' + stampText(info.time)];
    for (const row of speedRows(info.results)) {
        if (row.error) {
            lines.push(row.label + '：沒量到（' + row.error + '）');
            continue;
        }
        const ms = '每格 ' + row.ms + (row.ratio ? '（lite 的 ' + row.ratio + ' 倍）' : '');
        lines.push(row.label + '：' + [ms, '每秒 ' + row.fps, row.compute + (row.detail ? '（' + row.detail + '）' : '')].join(' · '));
    }
    lines.push('（每個模型暖機 ' + SPEED_PLAN.warmupMs / 1000 + ' 秒、量 ' + SPEED_PLAN.measureMs / 1000 + ' 秒，只算畫面裡有人的格子；每秒格數不會超過鏡頭的格數）');
    lines.push(systemLine(info.device));
    if (info.screen) lines.push('螢幕：' + info.screen.width + '×' + info.screen.height + '（像素密度 ' + info.screen.dpr + '）');
    lines.push(cameraLine(info));
    lines.push('識別字串：' + (info.ua || ''));
    return lines.join('\n');
}
