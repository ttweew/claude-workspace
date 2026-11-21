// 別家模型的點換成網站用的 33 點（MediaPipe 的順序，js/skeleton/landmarks.js）（11/8 寫好、放著，11/21 接 YOLO 時拿出來）
// 網站其他部分（角度、計次、錯誤、AI 判斷）都只認 33 點；別家的點比較少，沒有的點放在附近、標成看不到（visibility 0），
// 用到那些點的功能自己會跳過（例如腳跟離地要看得到腳跟，看不到就不判斷），不會算錯
//
// COCO 17 點（YOLO-pose、MoveNet、RTMPose 這些開源模型大多用這個格式）：
//   0 鼻子、1 左眼、2 右眼、3 左耳、4 右耳、5 左肩、6 右肩、7 左手肘、8 右手肘、9 左手腕、10 右手腕、
//   11 左髖、12 右髖、13 左膝、14 右膝、15 左腳踝、16 右腳踝
import { P, MIN_VISIBILITY } from '../skeleton/landmarks.js';

export const COCO_NAMES = ['NOSE', 'LEFT_EYE', 'RIGHT_EYE', 'LEFT_EAR', 'RIGHT_EAR', 'LEFT_SHOULDER', 'RIGHT_SHOULDER',
    'LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', 'RIGHT_ANKLE'];

// 33 點裡 COCO 沒有的：放在哪一點的位置（看不到）
const NEAR = {
    LEFT_EYE_INNER: 'LEFT_EYE', LEFT_EYE_OUTER: 'LEFT_EYE', RIGHT_EYE_INNER: 'RIGHT_EYE', RIGHT_EYE_OUTER: 'RIGHT_EYE',
    MOUTH_LEFT: 'NOSE', MOUTH_RIGHT: 'NOSE',
    LEFT_PINKY: 'LEFT_WRIST', LEFT_INDEX: 'LEFT_WRIST', LEFT_THUMB: 'LEFT_WRIST',
    RIGHT_PINKY: 'RIGHT_WRIST', RIGHT_INDEX: 'RIGHT_WRIST', RIGHT_THUMB: 'RIGHT_WRIST',
    LEFT_HEEL: 'LEFT_ANKLE', LEFT_FOOT_INDEX: 'LEFT_ANKLE', RIGHT_HEEL: 'RIGHT_ANKLE', RIGHT_FOOT_INDEX: 'RIGHT_ANKLE'
};

// 模型的可信度 → MediaPipe 的 visibility：MediaPipe 0.65（MIN_VISIBILITY）以上算看得到；
// YOLO 官方畫骨架時 0.25 以上就畫、MoveNet 的官方範例 0.3，這裡取 0.3 當「看得到」的界線
// 兩段各自拉直：0～0.3 → 0～0.65、0.3～1 → 0.65～1，「看得到」的界線才會對齊
// 11/21 側拍伏地挺身：YOLO 對被身體擋住的那一側也給約 0.9（MediaPipe 約 0.6），只靠這個分不出遠近，
// 要用真人影片重訂（研究頁「進化的步驟」第 5 階段）
export const SCORE_SEEN = 0.3;
export function scoreToVisibility(score) {
    const s = typeof score === 'number' && Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : 0;
    return s < SCORE_SEEN ? s / SCORE_SEEN * MIN_VISIBILITY : MIN_VISIBILITY + (s - SCORE_SEEN) / (1 - SCORE_SEEN) * (1 - MIN_VISIBILITY);
}

// COCO 17 點 [[x, y, 可信度]]（畫面的比例座標 0～1）→ 33 點 [{ x, y, z: 0, visibility }]；不是 17 點時回傳 null
// 座標不是數字的點（模型壞掉、資料被改過）放在 0、標成看不到
export function cocoToLandmarks(points) {
    if (!Array.isArray(points) || points.length !== COCO_NAMES.length) return null;
    const byName = {};
    COCO_NAMES.forEach((name, i) => {
        const p = Array.isArray(points[i]) ? points[i] : [];
        const ok = typeof p[0] === 'number' && Number.isFinite(p[0]) && typeof p[1] === 'number' && Number.isFinite(p[1]);
        byName[name] = { x: ok ? p[0] : 0, y: ok ? p[1] : 0, z: 0, visibility: ok ? scoreToVisibility(p[2]) : 0 };
    });
    const out = new Array(33);
    for (const [name, i] of Object.entries(P)) {
        if (Object.prototype.hasOwnProperty.call(byName, name)) out[i] = byName[name];
        else out[i] = { ...byName[NEAR[name]], visibility: 0 };
    }
    return out;
}
