// 「找骨架」這一層（11/21，讓使用者自己選模型的第 1 步）：網站其他部分（首頁、照片量角器）只透過這裡拿骨架，
// 不管後面是哪一家的模型。同一家換大小（MediaPipe lite ↔ full、YOLO n ↔ s）交給那一家自己換；換一家（MediaPipe ↔ YOLO）時，
// 先把新的載入好、成功了才關掉舊的：新的載入失敗，舊的照常能用（和換大小失敗一樣，錯誤標 recovered）
//
// 每一家的載入函式 load(onProgress, attempt, key) 回傳一個偵測器，要有：
//   model（能力表 js/ai/models.js 的名字，例如 'lite'）、computeMode（'GPU'、'CPU'…）、computeDetail、gpuName、
//   timings（下載、啟動、暖機各幾秒）、background（是不是在背景執行緒）、
//   detect(畫面, 時間) → Promise { landmarks：33 點（MediaPipe 的順序，模型沒有的點 visibility 0）或 null, world：3D 座標或 null }、
//   lostReason()（不能用的原因，能用是 ''）、restart()、useModel(key, onFraction)（同一家換大小）、close()
import { loadPoseModel } from './pose.js';
import { loadYolo } from './yolo.js';
import { modelToLoad } from './model-choice.js';
import { familyOf as profileFamily } from './models.js';

// 每一家怎麼載入（YOLO：js/ai/yolo.js，11/21）
const LOADERS = { mediapipe: loadPoseModel, yolo: loadYolo };

// 關掉一個偵測器；關不掉也沒關係（例如背景執行緒早就停了）
function closeQuietly(detector) {
    try {
        if (detector && typeof detector.close === 'function') detector.close();
    } catch (err) {
        console.warn('關閉舊的偵測器時出錯（不影響使用）：', err);
    }
}

// 載入 key 這個模型，包成一個「換得掉」的偵測器
// loaders、familyOf 可以換成假的（tests/pose-source.test.mjs）
export async function openSource(key, onProgress, attempt = 0, { loaders = LOADERS, familyOf = profileFamily } = {}) {
    const loaderFor = k => {
        const family = familyOf(k);
        if (!family || !Object.prototype.hasOwnProperty.call(loaders, family)) throw new Error('不認得的骨架模型：' + k);
        return loaders[family];
    };
    let current = await loaderFor(key)(onProgress, attempt, key);
    return {
        get model() { return current.model; },
        get family() { return familyOf(current.model); },
        get computeMode() { return current.computeMode; },
        get computeDetail() { return current.computeDetail; },
        get gpuName() { return current.gpuName; },
        get timings() { return current.timings; },
        get background() { return current.background; },
        detect: (video, timeMs) => current.detect(video, timeMs),
        lostReason: () => current.lostReason(),
        restart: () => current.restart(),
        async useModel(next, onFraction) {
            if (familyOf(next) === familyOf(current.model)) return current.useModel(next, onFraction);
            // 換一家：新的下載進度照樣回報；載入失敗時舊的照常能用
            let fresh;
            try {
                fresh = await loaderFor(next)(p => { if (p.stage === 'download' && onFraction) onFraction(p.fraction); }, 0, next);
            } catch (err) {
                err.recovered = true;
                throw err;
            }
            const old = current;
            current = fresh;
            closeQuietly(old);
        },
        close: () => closeQuietly(current)
    };
}

// 載入現在選的模型（js/ai/model-choice.js）
export function loadPose(onProgress, attempt = 0) {
    return openSource(modelToLoad(), onProgress, attempt);
}
