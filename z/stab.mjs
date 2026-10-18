// 公尺座標（world）的穩定化候選：One Euro 平滑 ＋ 骨頭長度限制
// 骨頭長度限制：同一個人的大腿、小腿、上臂、前臂長度不會變；量到的 3D 長度太短或太長，多半是深度（z）估錯
//   保留左右上下（x、y，比較準），只調整深度差，讓長度回到估計的骨頭長度；
//   骨頭長度用最近幾秒「比較長的那些量測」估計（肢體和鏡頭平行時量到的長度最接近真的）
const SEGMENTS = [[23, 25], [25, 27], [24, 26], [26, 28], [11, 13], [13, 15], [12, 14], [14, 16]]; // 父 → 子
function alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
class OneEuro {
  constructor(minCutoff, beta, dCutoff) { Object.assign(this, { minCutoff, beta, dCutoff, value: null, speed: 0 }); }
  filter(raw, dt) {
    if (!Number.isFinite(raw)) return this.value === null ? raw : this.value;
    if (this.value === null) return (this.value = raw);
    const rawSpeed = (raw - this.value) / dt;
    this.speed += alpha(this.dCutoff, dt) * (rawSpeed - this.speed);
    this.value += alpha(this.minCutoff + this.beta * Math.abs(this.speed), dt) * (raw - this.value);
    return this.value;
  }
}
export class WorldStabilizer {
  constructor({ smooth = true, bones = true, minCutoff = 0.8, beta = 3, dCutoff = 3, zMinCutoff = null, zBeta = null, window = 4000, quantile = 0.8, minDz = 0, blend = 1 } = {}) {
    Object.assign(this, { smooth, bones, minCutoff, beta, dCutoff, zMinCutoff: zMinCutoff ?? minCutoff, zBeta: zBeta ?? beta, window, quantile, minDz, blend });
    this.reset();
  }
  reset() { this.filters = null; this.last = null; this.hist = SEGMENTS.map(() => []); }
  process(world, t) {
    if (!world) return null;
    if (!this.filters || t - this.last > 500 || t <= this.last) {
      this.filters = world.map(() => [new OneEuro(this.minCutoff, this.beta, this.dCutoff), new OneEuro(this.minCutoff, this.beta, this.dCutoff), new OneEuro(this.zMinCutoff, this.zBeta, this.dCutoff)]);
      this.last = t;
    }
    const dt = Math.max(1e-3, (t - this.last) / 1000); this.last = t;
    let p = world.map((q, i) => this.smooth ? [this.filters[i][0].filter(q[0], dt), this.filters[i][1].filter(q[1], dt), this.filters[i][2].filter(q[2], dt)] : q.slice());
    if (this.bones) {
      SEGMENTS.forEach(([a, b], k) => {
        const d = [p[b][0] - p[a][0], p[b][1] - p[a][1], p[b][2] - p[a][2]];
        const len = Math.hypot(...d);
        const h = this.hist[k]; h.push([t, len]); while (t - h[0][0] > this.window) h.shift();
        if (h.length < 10) return;
        const sorted = h.map(x => x[1]).sort((x, y) => x - y);
        const L = sorted[Math.floor(this.quantile * (sorted.length - 1))];
        const xy2 = d[0] * d[0] + d[1] * d[1];
        if (Math.abs(d[2]) < this.minDz * L) return;  // 深度方向不明確：不修正
        // 只改深度差：|dz| = √(L² − dx² − dy²)，方向沿用量到的；dx、dy 已經比 L 長時深度差設為 0
        const dz = Math.sqrt(Math.max(0, L * L - xy2)) * (d[2] >= 0 ? 1 : -1);
        const shift = (dz - d[2]) * this.blend;
        // 子關節（以及它下面的關節）一起往前或往後移
        const moveChain = j => { p[j][2] += shift; SEGMENTS.forEach(([pa, ch]) => { if (pa === j) moveChain(ch); }); };
        moveChain(b);
      });
    }
    return p;
  }
}
