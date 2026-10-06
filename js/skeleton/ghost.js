// 防止「鬼點」：MediaPipe 有時會在沒有身體的地方畫出點，甚至一整副骨架
// 常見情況：鏡頭很近只拍到上半身時，腦補出畫面裡的手腳；人走出畫面後，留下一副越縮越小的骨架
// 這兩種情況模型給的可信度常常很高（0.8～0.96），只看可信度擋不住，所以再加三道檢查：
//   1. 出現要穩定：可信度連續 APPEAR_MS 都夠高才畫出來；畫出來之後要低於較低的門檻才收起，不會一直閃
//   2. 骨架鏈：手腕要手肘也看得到、手肘要肩膀也看得到（腳也一樣），遠端的點不能單獨冒出來
//   3. 塌縮保護：真人的身體大小不可能在 0.3 秒內縮小 3 成以上（要瞬間退後好幾公尺），
//      發生這種情況就是鬼骨架，當作沒有人；之後大小穩定 1 秒（沒有繼續縮小）就是真人，恢復顯示
//      軀幹長和肩寬＋髖寬要「都」縮小才算：只有寬度變小是轉身（真實錄影：正面轉側面時以前骨架會消失約 1 秒），
//      只有軀幹變短是彎腰、蹲下
//      （例如人走到鏡頭前調整手機再快速退回原位，不會一直被當作沒有人；6 種真實情境的結果不受影響）
// 模擬測試（6 種情境、各 240 格，詳見 docs/data-format.md）：
//   鏡頭很近時錯位點少 86%、人走出畫面時少 70%；正常全身、光線暗、沒有人的畫面不受影響

import { P } from './landmarks.js';

const SHOW_AT = 0.75;     // 可信度高於這個值，而且持續 APPEAR_MS，才畫出來
const HIDE_AT = 0.6;      // 已經畫出來的點，低於這個值才收起
const APPEAR_MS = 80;     // 約 2～3 格
const SHRINK = 0.3;       // 0.3 秒內縮小超過 3 成 → 鬼骨架
const SHRINK_WINDOW_MS = 300;
const MIN_SIZE = 0.15;    // 身體大小（軀幹長＋肩寬＋髖寬，以畫面高度為 1）小於這個值也當作鬼骨架，正面拍時真人要站在約 8 公尺外才會這麼小（側面見下面的 TORSO_SHRINK）
const RESET_AFTER_MS = 500;
const STABLE_MS = 1000;      // 判定為鬼骨架後，大小穩定這麼久（沒有再縮小）就當作真人，恢復顯示
const STABLE_RANGE = 1.15;   // 「穩定」：這段時間最大、最小相差不到 15%
// 側面拍時肩寬、髖寬幾乎是 0，「身體大小」只剩軀幹長，真人站在 3～4 公尺外就會小於 MIN_SIZE
// 所以側面時，要軀幹也在縮小（比最近 2 秒最長時短 2 成以上）才當作鬼骨架：鬼骨架是整副一起縮小，真人的軀幹長度不會變
// 真實錄影（iPhone，人約佔畫面高度 5 成）：側面蹲低時被當成鬼骨架，骨架藏了 10 秒
const TORSO_WINDOW_MS = 2000;
const TORSO_SHRINK = 0.2;
const SIDE_WIDTH = 0.4;      // 肩寬＋髖寬不到軀幹長的 4 成才算側面（真實錄影側面時約 0.05～0.25；鬼骨架拉遠時約 0.7）

// 每個點靠近身體那一端的點：手指 → 手腕 → 手肘 → 肩膀；腳尖、腳跟 → 腳踝 → 膝蓋 → 髖部
const PARENT = {};
for (const s of ['LEFT', 'RIGHT']) {
    PARENT[P[s + '_ELBOW']] = P[s + '_SHOULDER'];
    PARENT[P[s + '_WRIST']] = P[s + '_ELBOW'];
    for (const k of ['PINKY', 'INDEX', 'THUMB']) PARENT[P[s + '_' + k]] = P[s + '_WRIST'];
    PARENT[P[s + '_KNEE']] = P[s + '_HIP'];
    PARENT[P[s + '_ANKLE']] = P[s + '_KNEE'];
    PARENT[P[s + '_HEEL']] = P[s + '_ANKLE'];
    PARENT[P[s + '_FOOT_INDEX']] = P[s + '_ANKLE'];
}

const inFrame = p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;

export class GhostFilter {
    constructor() {
        this.reset();
    }

    reset() {
        this.shown = null;      // 每個點目前是否畫出來
        this.since = null;      // 每個點從什麼時候開始夠清楚（還沒畫出來的點用）
        this.sizes = [];        // 最近 0.3 秒的身體大小 [時間, 大小]
        this.ghostSize = 0;     // 判定為鬼骨架時，塌縮前的大小；0 代表正常
        this.stable = [];       // 最近 1 秒的身體大小 [時間, 大小]（判斷是不是穩定的真人）
        this.torsos = [];       // 最近 2 秒的軀幹長 [時間, 長度]（側面時判斷是不是在縮小）
        this.lastTime = 0;
    }

    // landmarks：平滑後的 33 點（會直接加上 visible 欄位，給 isVisible 使用）
    // width、height：鏡頭畫面的像素大小
    // 回傳 false 代表這是鬼骨架，應當作畫面裡沒有人
    update(landmarks, timeMs, width, height) {
        if (!this.shown || this.shown.length !== landmarks.length
            || timeMs - this.lastTime > RESET_AFTER_MS || timeMs <= this.lastTime) this.reset();
        if (!this.shown) {
            this.shown = landmarks.map(() => false);
            this.since = landmarks.map(() => null);
        }
        this.lastTime = timeMs;

        // 1. 出現要穩定、收起要明確
        landmarks.forEach((p, i) => {
            const clear = p.visibility >= SHOW_AT && inFrame(p);
            if (this.shown[i]) {
                if (p.visibility < HIDE_AT || !inFrame(p)) {
                    this.shown[i] = false;
                    this.since[i] = null;
                }
            } else if (!clear) {
                this.since[i] = null;
            } else if (this.since[i] === null) {
                this.since[i] = timeMs;
            } else if (timeMs - this.since[i] >= APPEAR_MS) {
                this.shown[i] = true;
            }
        });

        // 2. 骨架鏈：往身體方向一路檢查，中間有任何一個點沒畫出來，這個點也不畫
        landmarks.forEach((p, i) => {
            let visible = this.shown[i];
            for (let j = PARENT[i]; visible && j !== undefined; j = PARENT[j]) visible = this.shown[j];
            p.visible = visible;
        });

        // 3. 塌縮保護
        const ghost = this.isCollapsing(landmarks, timeMs, width / height);
        if (ghost) landmarks.forEach(p => { p.visible = false; });
        return !ghost;
    }

    // 身體大小用軀幹長＋肩寬＋髖寬：深蹲、彎腰時這三個長度幾乎不變，不會被誤判
    isCollapsing(l, timeMs, aspect) {
        const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
        const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const ls = l[P.LEFT_SHOULDER], rs = l[P.RIGHT_SHOULDER], lh = l[P.LEFT_HIP], rh = l[P.RIGHT_HIP];
        const torso = dist(mid(ls, rs), mid(lh, rh)), widths = dist(ls, rs) + dist(lh, rh);
        const size = torso + widths;
        this.sizes.push([timeMs, size, torso, widths]);
        while (timeMs - this.sizes[0][0] > SHRINK_WINDOW_MS) this.sizes.shift();
        let recent = 0, recentTorso = 0, recentWidths = 0;
        for (const [, s, t, w] of this.sizes) { recent = Math.max(recent, s); recentTorso = Math.max(recentTorso, t); recentWidths = Math.max(recentWidths, w); }
        // 突然縮小：軀幹長和肩寬＋髖寬「都」縮小才算（鬼骨架是整副等比例縮小）
        // 只有寬度變小是轉身（正面轉側面時肩寬、髖寬 0.1 秒內少 4 成）；只有軀幹變短是彎腰、蹲下
        const shrunk = size < recent * (1 - SHRINK) && torso < recentTorso * (1 - SHRINK) && widths < recentWidths * (1 - SHRINK);
        this.torsos.push([timeMs, torso]);
        while (timeMs - this.torsos[0][0] > TORSO_WINDOW_MS) this.torsos.shift();
        let maxTorso = 0;
        for (const [, t] of this.torsos) maxTorso = Math.max(maxTorso, t);
        const side = widths < torso * SIDE_WIDTH;
        const tooSmall = size < MIN_SIZE && (!side || torso < maxTorso * (1 - TORSO_SHRINK));
        if (!this.ghostSize && (shrunk || tooSmall)) {
            this.ghostSize = Math.max(recent, MIN_SIZE / 0.7);
        }
        // 大小回到塌縮前的 7 成以上：人回來了（或重新偵測到），恢復顯示
        if (this.ghostSize && size >= this.ghostSize * 0.7) this.ghostSize = 0;
        // 鬼骨架會越縮越小；大小穩定一段時間（沒有再縮小）、而且不是小到不合理，就是真人
        // 例如人走到鏡頭前調整手機、再快速退回原位：退後的那一下像塌縮，之後人一直站著，不能永遠當作沒有人
        this.stable.push([timeMs, size]);
        while (timeMs - this.stable[0][0] > STABLE_MS) this.stable.shift();
        if (this.ghostSize && size >= MIN_SIZE && timeMs - this.stable[0][0] >= STABLE_MS * 0.9) {
            let lo = Infinity, hi = 0;
            for (const [, s] of this.stable) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
            if (hi <= lo * STABLE_RANGE) this.ghostSize = 0;
        }
        return this.ghostSize > 0;
    }
}
