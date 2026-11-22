// 合成的錄製檔（MediaPipe 的 33 點，有腳跟、腳尖）：深蹲、弓箭步每一下腳的數字有沒有 null
import { analyzeOne } from '/home/user/claude-workspace/js/data/report-core.js';
import { itemFeatures } from '/home/user/claude-workspace/js/analysis/features.js';
import { syntheticSet } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';
let n = 0, nulls = 0;
for (const subject of ['A','B','C','D','E','F','G','H','I','J','K']) {
  for (const [w, key, conds] of [['squat', 'heel', ['good', 'lean', 'heel']], ['lunge', 'knee', ['good', 'lean', 'knee']]]) {
    for (const c of conds) {
      const r = await analyzeOne(syntheticSet(subject, w, c, 1).text);
      for (const it of r.items) { n++; if (itemFeatures(w, it)[key] === null) { nulls++; console.log('null', subject, w, c, it.n); } }
    }
  }
}
console.log('reps', n, 'null', nulls);
