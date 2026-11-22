// 每一格骨架的處理流程：平滑 → 擋鬼點 → 關節角度 → 拍攝方向
// 鏡頭畫面（main.js）和錄製資料重播（replay.js）共用同一套，重播算出來的數字就和當時畫面上的一樣

import { PoseSmoother } from './smooth.js';
import { GhostFilter } from './ghost.js';
import { ViewTracker, headFacing } from '../analysis/view.js';
import { getDerivedPoints } from './landmarks.js';
import { computeAngles } from '../analysis/angles.js';

const KEEP_MS = 200;  // 漏掉幾格（沒偵測到人）多久以內，接著用原本的擋鬼點、拍攝方向
// 用哪一側算角度（11/22）：側面拍時離鏡頭遠的那一側被身體擋住，點是模型猜的，要用靠近鏡頭那一側。
//   MediaPipe 被擋住的點可信度比較低，各處照可信度挑（js/skeleton/landmarks.js 的 clearerSide）。
//   YOLO 兩側都很有把握：11/21 伏地挺身示範影片（模型對照頁的錄製檔）兩側可信度加總 3.87、3.93，差不到換邊的門檻 0.4，
//   網站 237 格都用預設的左側（人面向右邊，左側是被擋住的那一側）；同一段 MediaPipe 是 3.05、3.91，240 格都用右側。
//   所以用 YOLO 時（nearByFacing，js/ai/models.js 的 occlusion 是 false）改看頭朝哪邊：面向畫面右邊時靠近鏡頭的是右側
//   （鏡頭原始畫面；趴著做伏地挺身、棒式頭朝右也一樣是右側靠近鏡頭）
const NEAR_MIN = 0.08;   // 鼻子比耳朵往前至少軀幹長度的 8% 才算看得出頭朝哪邊（和 view.js 的 FACING_MIN 一樣）；看不出來時沿用上一次的

export class PosePipeline {
    constructor() {
        this.smoother = new PoseSmoother();  // 讓骨架點不抖動
        this.ghosts = new GhostFilter();     // 擋掉模型腦補出來的點與鬼骨架
        this.views = new ViewTracker();      // 判斷側面還是正面拍
        this.lastTime = -Infinity;
        this.lastSeen = -Infinity;
        this.missed = false;
        this.interval = 0;    // 平常每格的間隔（毫秒）
        this.nearByFacing = false;   // 照頭朝哪邊決定靠近鏡頭的那一側（用 YOLO 時由 main.js、replay-core.js 設定）
        this.near = null;            // 靠近鏡頭的那一側（'LEFT'、'RIGHT'）；還看不出來是 null
    }

    reset() {
        this.smoother.reset();
        this.ghosts.reset();
        this.views.reset();
        this.lastTime = -Infinity;
        this.lastSeen = -Infinity;
        this.missed = false;
        this.interval = 0;    // 平常每格的間隔（毫秒）
        this.near = null;
    }

    // raw：MediaPipe 這一格的 33 點原始比例座標（沒偵測到人時為 null）；timeMs：這一格的時間
    // width、height：鏡頭畫面的像素大小
    // 回傳 { landmarks（平滑後）, derived（髖部中心等）, angles, view, near, width, height }；沒有人或是鬼骨架時回傳 null
    //   near：靠近鏡頭的那一側（nearByFacing 時才有，不然 null：各處照可信度挑，見 landmarks.js 的 poseSide）
    // width、height 一起傳回去：動作判斷算身體傾斜時要換算成像素（畫面不是正方形）
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
        if (this.nearByFacing) {
            const head = headFacing(landmarks, width, height);
            if (head !== null && head >= NEAR_MIN) this.near = 'RIGHT';
            else if (head !== null && head <= -NEAR_MIN) this.near = 'LEFT';
        } else {
            this.near = null;
        }
        return {
            landmarks: landmarks,
            derived: getDerivedPoints(landmarks),
            // 關節角度用平滑後的畫面座標計算，數字才不會跳
            angles: computeAngles(landmarks, width, height),
            // 拍攝方向（側面／正面）與面向
            view: this.views.update(landmarks, timeMs, width, height),
            near: this.near,
            width: width,
            height: height
        };
    }
}
