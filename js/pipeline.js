// 每一格骨架的處理流程：平滑 → 擋鬼點 → 關節角度 → 拍攝方向
// 鏡頭畫面（main.js）和錄製資料重播（replay.js）共用同一套，重播算出來的數字就和當時畫面上的一樣

import { PoseSmoother } from './smooth.js';
import { GhostFilter } from './ghost.js';
import { ViewTracker } from './view.js';
import { getDerivedPoints } from './landmarks.js';
import { computeAngles } from './angles.js';

export class PosePipeline {
    constructor() {
        this.smoother = new PoseSmoother();  // 讓骨架點不抖動
        this.ghosts = new GhostFilter();     // 擋掉模型腦補出來的點與鬼骨架
        this.views = new ViewTracker();      // 判斷側面還是正面拍
    }

    reset() {
        this.smoother.reset();
        this.ghosts.reset();
        this.views.reset();
    }

    // raw：MediaPipe 這一格的 33 點原始比例座標（沒偵測到人時為 null）；timeMs：這一格的時間
    // width、height：鏡頭畫面的像素大小
    // 回傳 { landmarks（平滑後）, derived（髖部中心等）, angles, view }；沒有人或是鬼骨架時回傳 null
    process(raw, timeMs, width, height) {
        const landmarks = raw ? this.smoother.smooth(raw, timeMs) : null;
        // 鬼骨架（人已經離開畫面，模型還在追一副越縮越小的骨架）當作沒有人
        if (!landmarks || !this.ghosts.update(landmarks, timeMs, width, height)) {
            if (!landmarks) this.ghosts.reset();
            this.views.reset();
            return null;
        }
        return {
            landmarks: landmarks,
            derived: getDerivedPoints(landmarks),
            // 關節角度用平滑後的畫面座標計算，數字才不會跳
            angles: computeAngles(landmarks, width, height),
            // 拍攝方向（側面／正面）與面向
            view: this.views.update(landmarks, timeMs, width, height)
        };
    }
}
