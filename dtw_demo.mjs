// 簡報的 DTW 示意圖資料：標準曲線、比較慢的一下（底部停久、蹲到約 95°）、對齊路徑
import { TEMPLATES, resample, repSimilarity, SIMILARITY } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-g/js/analysis/similarity.js';
import { POSES, angleAt } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-g/js/ui/demo.js';
import { writeFileSync } from 'node:fs';
const knee = d => { const [, hip, k, ankle] = POSES.squat(d).lines[0]; return angleAt(hip, k, ankle); };
const ease = t => t * t * (3 - 2 * t);
const samples = []; let t = 0;
const DEEP = 0.9;   // 沒有蹲到最低（示範是 1）
for (let i = 0; i <= 60; i++) samples.push({ t: t += 33, v: knee(DEEP * ease(i / 60)) });    // 往下 2 秒
for (let i = 0; i < 45; i++) samples.push({ t: t += 33, v: knee(DEEP) });                    // 底部停 1.5 秒
for (let i = 45; i >= 0; i--) samples.push({ t: t += 33, v: knee(DEEP * ease(i / 45)) });     // 往上 1.5 秒
const a = TEMPLATES.squat, b = resample(samples);
const n = a.length, m = b.length, w = Math.ceil(Math.max(n, m) * SIMILARITY.window);
const C = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(Infinity)); C[0][0] = 0;
for (let i = 1; i <= n; i++) for (let j = Math.max(1, i - w); j <= Math.min(m, i + w); j++)
    C[i][j] = Math.abs(a[i - 1] - b[j - 1]) + Math.min(C[i - 1][j - 1], C[i - 1][j], C[i][j - 1]);
const path = []; let i = n, j = m;
while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    const opts = [[C[i - 1][j - 1], i - 1, j - 1], [C[i - 1][j], i - 1, j], [C[i][j - 1], i, j - 1]].sort((x, y) => x[0] - y[0]);
    [, i, j] = opts[0];
}
path.reverse();
const out = { template: a.map(v => Math.round(v * 10) / 10), user: b.map(v => Math.round(v * 10) / 10), path, score: repSimilarity('squat', samples),
    min: Math.round(Math.min(...b)), tmin: Math.round(Math.min(...a)) };
writeFileSync(process.argv[2], JSON.stringify(out));
console.log('score', out.score, 'min', out.min, 'template min', out.tmin, 'path', path.length);
