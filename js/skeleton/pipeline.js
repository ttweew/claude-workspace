// 每一格骨架的處理流程：平滑 → 擋鬼點 → 關節角度 → 拍攝方向
// 鏡頭畫面（main.js）和錄製資料重播（replay.js）共用同一套，重播算出來的數字就和當時畫面上的一樣

import { PoseSmoother } from './smooth.js';
import { GhostFilter } from './ghost.js';
import { ViewTracker } from '../analysis/view.js';
import { getDerivedPoints } from './landmarks.js';
import { computeAngles } from '../analysis/angles.js';

const KEEP_MS = 200;  // 漏掉幾格（沒偵測到人）多久以內，接著用原本的擋鬼點、拍攝方向

export class PosePipeline {
    constructor() {
        this.smoother = new PoseSmoother();  // 讓骨架點不抖動
        this.ghosts = new GhostFilter();     // 擋掉模型腦補出來的點與鬼骨架
        this.views = new ViewTracker();      // 判斷側面還是正面拍
        this.lastTime = -Infinity;
        this.lastSeen = -Infinity;
        this.missed = false;
        this.interval = 0;    // 平常每格的間隔（毫秒）
    }

    reset() {
        this.smoother.reset();
        this.ghosts.reset();
        this.views.reset();
        this.lastTime = -Infinity;
        this.lastSeen = -Infinity;
        this.missed = false;
        this.interval = 0;    // 平常每格的間隔（毫秒）
    }

    // raw：MediaPipe 這一格的 33 點原始比例座標（沒偵測到人時為 null）；timeMs：這一格的時間
    // width、height：鏡頭畫面的像素大小
    // 回傳 { landmarks（平滑後）, derived（髖部中心等）, angles, view }；沒有人或是鬼骨架時回傳 null
    process(raw, timeMs, width, height) {
        // 時間倒退（例如兩份錄製檔接在一起）：全部重新開始，不要拿「之後」的紀錄來判斷現在
        // （平滑程式本來就會自己重新開始，這裡讓擋鬼點、拍攝方向也一起，三者才一致）
        if (timeMs < this.lastTime) this.reset();
        this.lastTime = timeMs;
        const landmarks = raw ? this.smoother.smooth(raw, timeMs) : null;
        // AI 偶爾漏掉一兩格：0.2 秒內又偵測到人，擋鬼點、拍攝方向接著用，點不用重新確認，骨架不會閃一下
        // （6 種真實情境：預設的輕量模型錯位點少 1/3、閃爍減半，完整模型幾乎不變）；漏比較久才重新開始
        // 只看「中間真的有沒偵測到人的格子」：慢的裝置每格本來就隔 0.2 秒以上，不能每一格都重新開始
        if (!landmarks) {
            this.missed = true;
            return null;
        }
        // 慢的裝置漏一格就超過 0.2 秒：門檻至少是平常每格間隔的 2.5 倍（漏一格也接得上）；擋鬼點本身超過 0.5 秒會自己重新開始
        if (this.missed && timeMs - this.lastSeen > Math.max(KEEP_MS, this.interval * 2.5)) {
            this.ghosts.reset();
            this.views.reset();
        } else if (!this.missed && this.lastSeen > -Infinity) {
            this.interval = timeMs - this.lastSeen;
        }
        this.missed = false;
        this.lastSeen = timeMs;
        // 鬼骨架（人已經離開畫面，模型還在追一副越縮越小的骨架）當作沒有人
        if (!this.ghosts.update(landmarks, timeMs, width, height)) {
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
