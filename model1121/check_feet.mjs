// 第 6 階段實測（暫存區）：兩份模型對照的錄製檔（A：MediaPipe、B：自己訓練的 21 點 YOLO）→ 腳跟、腳尖看不看得到、和 MediaPipe 差幾像素
// 用法：node check_feet.mjs rec_A.json rec_B.json
import { readFileSync } from 'node:fs';
import { parseRecording } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt3/js/data/replay-core.js';
const [a, b] = process.argv.slice(2).map(f => parseRecording(readFileSync(f, 'utf8')));
const W = a.meta.videoWidth, H = a.meta.videoHeight;
console.log('A', a.meta.model, 'B', b.meta.model, W + 'x' + H, a.frames.length, b.frames.length);
const names = { 27: '左腳踝', 28: '右腳踝', 29: '左腳跟', 30: '右腳跟', 31: '左腳尖', 32: '右腳尖', 25: '左膝', 26: '右膝' };
for (const [id, name] of Object.entries(names)) {
  let n = 0, seenB = 0, dist = 0, both = 0;
  for (let i = 0; i < Math.min(a.frames.length, b.frames.length); i++) {
    const pa = a.frames[i].raw, pb = b.frames[i].raw;
    if (!pa || !pb) continue;
    n++;
    if (pb[id].visibility >= 0.65) seenB++;
    if (pb[id].visibility >= 0.65 && pa[id].visibility >= 0.65) {
      both++;
      dist += Math.hypot((pa[id].x - pb[id].x) * W, (pa[id].y - pb[id].y) * H);
    }
  }
  console.log(name, 'B 看得到', Math.round(seenB / n * 100) + '%', '兩邊都看得到的格子平均差', both ? (dist / both).toFixed(1) + ' 像素' : '—', '(' + both + ' 格)');
}
