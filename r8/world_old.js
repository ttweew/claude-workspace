// 公尺座標（MediaPipe 的 world landmarks）穩定化：平滑 ＋ 骨頭長度限制
//
// 只有一支鏡頭時，前後深度（z）是 AI 猜的，雜訊比左右上下大很多，還會慢慢飄、偶爾跳開
// 兩步驟處理（原始資料不變，錄製時另外存一份處理後的）：
//   1. 平滑：x、y、z 各用一個 One Euro Filter（和畫面上骨架的平滑同一種方法），抖動變小、快速動作仍跟得上
//   2. 骨頭長度限制：同一個人的大腿、小腿、上臂、前臂長度不會變。量到的 3D 長度太長或太短，多半是深度估錯：
//      保留左右上下（比較準），只調整深度差，往「估計的骨頭長度」拉回一半
//      只在深度方向很明確時才修正：肢體和鏡頭平行時深度差接近 0，往前或往後只是雜訊，硬修反而會推錯邊
//
// 模擬驗證（合成深蹲有真實 3D 位置；加上深度雜訊、飄移、偶爾跳開；3 種雜訊大小 × 3 種速度 × 3 種拍攝角度 × 20 組亂數，共 540 組）：
//   平均位置誤差 4.55 → 3.51 公分（少 23%），3D 膝蓋角度誤差 9.67° → 6.94°（少 28%）；540 組沒有任何一組比原始資料差
//   也試過「完整拉回骨頭長度、不管方向明不明確」：骨頭長度很穩，但位置、角度反而更不準（膝角多 2～6°），所以沒有採用
//   真實錄影的雜訊可能和模擬不同，要用真人錄影驗證（見 docs/data-format.md）

// 骨頭：[靠近身體的關節, 遠端的關節]（左右大腿、小腿、上臂、前臂）
const BONES = [[23, 25], [25, 27], [24, 26], [26, 28], [11, 13], [13, 15], [12, 14], [14, 16]];
const MIN_CUTOFF = 0.8;    // 平滑：靜止時的平滑程度（越小越穩）
const BETA = 10;           // 平滑：動作越快、平滑越少（公尺座標的數值比畫面比例小，所以比畫面上的骨架大）
const D_CUTOFF = 3;
const LENGTH_WINDOW_MS = 4000;  // 骨頭長度用最近 4 秒的量測估計（取中間值，不怕偶爾跳開）
const MIN_SAMPLES = 10;         // 量測太少時先不修正
const CLEAR_DEPTH = 0.35;       // 深度差至少是骨頭長度的 35%，才算方向明確
const PULL = 0.5;               // 往估計長度拉回的比例
const RESET_AFTER_MS = 500;     // 超過這麼久沒有資料，重新開始

function alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
}

class OneEuro {
    constructor() {
        this.value = null;
        this.speed = 0;
    }
    filter(raw, dt) {
        if (!Number.isFinite(raw)) return this.value === null ? raw : this.value;
        if (this.value === null) return (this.value = raw);
        this.speed += alpha(D_CUTOFF, dt) * ((raw - this.value) / dt - this.speed);
        this.value += alpha(MIN_CUTOFF + BETA * Math.abs(this.speed), dt) * (raw - this.value);
        return this.value;
    }
}

export class WorldStabilizer {
    constructor() {
        this.reset();
    }

    reset() {
        this.filters = null;
        this.lastTime = null;
        this.lengths = BONES.map(() => []);  // 每根骨頭最近的 [時間, 長度]
    }

    // world：MediaPipe 這一格的 33 點公尺座標（{ x, y, z }），沒有時傳 null；timeMs：這一格的時間
    // 回傳處理後的 33 點（新的陣列，不會改到原始資料），沒有資料時回傳 null
    process(world, timeMs) {
        if (!world) return null;
        if (!this.filters || this.filters.length !== world.length || this.lastTime === null
            || timeMs - this.lastTime > RESET_AFTER_MS || timeMs <= this.lastTime) {
            this.reset();
            this.filters = world.map(() => [new OneEuro(), new OneEuro(), new OneEuro()]);
            this.lastTime = timeMs;
        }
        const dt = Math.max(0.001, (timeMs - this.lastTime) / 1000);
        this.lastTime = timeMs;
        const p = world.map((q, i) => {
            const [fx, fy, fz] = this.filters[i];
            return { x: fx.filter(q.x, dt), y: fy.filter(q.y, dt), z: fz.filter(q.z, dt) };
        });
        if (p.length === 33) this.limitBones(p, timeMs);
        return p;
    }

    limitBones(p, timeMs) {
        BONES.forEach(([a, b], k) => {
            const dx = p[b].x - p[a].x, dy = p[b].y - p[a].y, dz = p[b].z - p[a].z;
            const length = Math.hypot(dx, dy, dz);
            if (!Number.isFinite(length)) return;
            const history = this.lengths[k];
            history.push([timeMs, length]);
            while (timeMs - history[0][0] > LENGTH_WINDOW_MS) history.shift();
            if (history.length < MIN_SAMPLES) return;
            const sorted = history.map(h => h[1]).sort((x, y) => x - y);
            const bone = sorted[Math.floor(sorted.length / 2)];
            // 深度方向不明確（肢體大致和鏡頭平行）：不修正
            if (Math.abs(dz) < CLEAR_DEPTH * bone) return;
            // 左右上下不動，深度差改成讓長度等於骨頭長度；左右上下已經比骨頭長時，深度差為 0
            const target = Math.sqrt(Math.max(0, bone * bone - dx * dx - dy * dy)) * Math.sign(dz);
            const shift = (target - dz) * PULL;
            // 遠端關節（以及再下面的關節，例如膝蓋動了、腳踝跟著動）一起往前或往後
            const move = j => {
                p[j].z += shift;
                for (const [parent, child] of BONES) if (parent === j) move(child);
            };
            move(b);
        });
    }
}
