// 骨架點平滑：讓點穩穩黏在身上，不會一直小幅抖動
// 使用 One Euro Filter（Casiez 等人，CHI 2012），常用在姿勢追蹤、VR 手把等即時互動：
//   靜止或慢慢動時 → 強力平滑，消除抖動
//   動作快的時候   → 自動減少平滑，點能馬上跟上，不會拖在後面
// 這裡只處理畫面要畫的點；原始資料不變，之後分析時可以自己選要用哪一種

const MIN_CUTOFF = 0.8;      // 靜止時的平滑程度：越小越穩，但慢慢動時會有一點延遲
const BETA = 25;             // 動作越快、平滑越少的程度：越大越跟得上快速動作
const D_CUTOFF = 3.0;        // 多快察覺「開始動了」：越大越快放開平滑，起步時點才不會先停一下再跟上
// 實測（模擬 30 FPS 晃頭 0.4 秒移動 120 像素）：
//   原本的設定（MIN_CUTOFF 1.0、BETA 8、D_CUTOFF 1）移動中點平均落後 9.6 像素，感覺「停一下才跟上」
//   現在的設定落後 4.9 像素（少一半），靜止時的抖動仍比不平滑少約 6 成
const RESET_AFTER_MS = 500;  // 超過這麼久沒偵測到人，重新開始，不會從舊位置滑過來

// 指數平滑的權重：cutoff 越高、間隔越長，越相信新的值
function alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
}

// 一個數值（例如左膝的 x）的 One Euro Filter
class OneEuro {
    constructor() {
        this.value = null;
        this.speed = 0;
    }
    filter(raw, dt) {
        if (this.value === null) {
            this.value = raw;
            return raw;
        }
        const rawSpeed = (raw - this.value) / dt;
        this.speed += alpha(D_CUTOFF, dt) * (rawSpeed - this.speed);
        const cutoff = MIN_CUTOFF + BETA * Math.abs(this.speed);
        this.value += alpha(cutoff, dt) * (raw - this.value);
        return this.value;
    }
}

// 整個身體 33 點的平滑器：每個點的 x、y、z 各用一個濾波器
// visibility 也稍微平滑，點才不會在門檻附近一下出現、一下消失
export class PoseSmoother {
    constructor() {
        this.reset();
    }
    reset() {
        this.filters = null;
        this.visibility = null;
        this.lastTime = 0;
    }
    // landmarks：MediaPipe 這一格的 33 點；timeMs：這一格的時間（毫秒）
    // 回傳平滑後的 33 點（新的陣列，不會改到原始資料）
    smooth(landmarks, timeMs) {
        if (!this.filters || timeMs - this.lastTime > RESET_AFTER_MS || timeMs <= this.lastTime) {
            this.filters = landmarks.map(() => [new OneEuro(), new OneEuro(), new OneEuro()]);
            this.visibility = landmarks.map(p => p.visibility);
            this.lastTime = timeMs;
            return landmarks.map(p => ({ ...p }));
        }
        const dt = (timeMs - this.lastTime) / 1000;
        this.lastTime = timeMs;
        return landmarks.map((p, i) => {
            const [fx, fy, fz] = this.filters[i];
            this.visibility[i] += 0.5 * (p.visibility - this.visibility[i]);
            return {
                ...p,
                x: fx.filter(p.x, dt),
                y: fy.filter(p.y, dt),
                z: fz.filter(p.z, dt),
                visibility: this.visibility[i]
            };
        });
    }
}
