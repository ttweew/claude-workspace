// 深蹲：計算次數、每一下蹲多深（計算的方式和弓箭步、伏地挺身共用，見 reps.js）
//
// 怎麼算一下：先站直（膝蓋 ≥ 160°）→ 往下蹲到膝蓋 ≤ 140° → 再站直 → 算一下
// 每一下記錄最低的膝蓋角度，判斷深度：
//   ≤ 90° 蹲到位、90～110° 再低一點、> 110° 太淺
//   90° 是老師 10/12 決定的門檻（很多健身 App 也用 90°）：只看髖、膝、踝三點的夾角，不用考慮地面，
//   手機放歪、整個畫面跟著轉時夾角也不變；不用「大腿和地面平行」（約 60～70°），那要先知道哪裡是水平

import { RepCounter, REP_DEFAULTS, clearerAngle, depthOf as depthWith } from './reps.js';

export const SQUAT = {
    ...REP_DEFAULTS,
    STAND: 160,       // 膝蓋 ≥ 這個角度算站直
    DOWN: 140,        // 膝蓋 ≤ 這個角度才算有蹲下去
    GOOD: 90,         // 最低膝蓋角度 ≤ 這個：蹲到位
    CLOSE: 110        // ≤ 這個：再低一點；再大：太淺
};

export const DEPTH_TEXT = { good: '蹲到位', close: '再低一點', shallow: '太淺' };

export const SQUAT_CONFIG = {
    up: SQUAT.STAND, down: SQUAT.DOWN, good: SQUAT.GOOD, close: SQUAT.CLOSE,
    metric: (pose, counter) => clearerAngle(pose, counter, 'KNEE'),
    // 髖部角度也記下最小值（身體前傾多少），重播分析的表格會列出來
    aux: (pose, counter) => pose.angles[counter.side + '_HIP'] ?? null,
    frontPrompt: '請側身對著鏡頭，正面拍膝蓋角度不準',
    // 舊的欄位名稱（重播分析、錄製檔的分析都用這兩個）
    decorate: rep => {
        rep.minKnee = rep.min;
        rep.minHip = rep.minAux;
    }
};

export function depthOf(minKnee) {
    return depthWith(minKnee, SQUAT_CONFIG);
}

export class SquatCounter extends RepCounter {
    constructor() {
        super(SQUAT_CONFIG);
    }
}
