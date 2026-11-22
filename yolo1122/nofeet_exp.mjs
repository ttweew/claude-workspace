// 暫存區實驗：看不到腳時，一般的 AI 模型 vs 不看腳的模型（不看腳的特徵、不判腳的錯）
// A～H 訓練，I、J、K（沒看過）測試；測試時把腳的特徵改成 null（像 YOLO）
import { analyzeOne } from '/home/user/claude-workspace/js/data/report-core.js';
import { trainForest, predictModel } from '/home/user/claude-workspace/js/analysis/forest.js';
import { featureColumns, itemFeatures } from '/home/user/claude-workspace/js/analysis/features.js';
import { FORM_RULES } from '/home/user/claude-workspace/js/analysis/form.js';
import MODELS from '/home/user/claude-workspace/js/analysis/ai-model.js';
import { buildDataset } from '/home/user/claude-workspace/tools/dataset.mjs';
import { syntheticSet, syntheticSubject } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';

const { rows } = await buildDataset(['A','B','C','D','E','F','G','H'].flatMap(s => syntheticSubject(s)));
for (const workout of ['squat', 'lunge']) {
  const foot = FORM_RULES[workout].filter(r => r.feet).map(r => r.id);
  const features = featureColumns(workout).map(c => c.key).filter(k => !foot.includes(k));
  const classes = ['good', ...FORM_RULES[workout].map(r => r.id)].filter(c => !foot.includes(c));
  const used = rows.filter(r => r.workout === workout && classes.includes(r.condition));
  const trees = trainForest(used.map(r => features.map(k => r.features[k])), used.map(r => classes.indexOf(r.condition)), classes.length);
  const blind = { features, classes, trees };
  const full = MODELS.models.find(m => m.workout === workout);
  // 訓練資料裡腳的特徵是 null 的有幾下
  const nulls = rows.filter(r => r.workout === workout && foot.some(k => r.features[k] === null)).length;
  console.log(workout, '訓練資料', rows.filter(r => r.workout === workout).length, '下，腳的特徵是 null 的', nulls, '下');
  for (const condition of ['good', 'lean', ...foot]) {
    const t = { full: {}, blind: {}, fullSeen: {} };
    let n = 0, gf = 0, gb = 0, cf = 0, cb = 0;
    for (const subject of ['I', 'J', 'K']) {
      const r = await analyzeOne(syntheticSet(subject, workout, condition, 1).text);
      for (const item of r.items) {
        const f = itemFeatures(workout, item);
        const nf = { ...f }; for (const k of foot) nf[k] = null;
        const a = predictModel(full, nf), b = predictModel(blind, nf), s = predictModel(full, f);
        t.full[a.label] = (t.full[a.label] || 0) + 1;
        t.blind[b.label] = (t.blind[b.label] || 0) + 1;
        t.fullSeen[s.label] = (t.fullSeen[s.label] || 0) + 1;
        gf += a.probs[0]; gb += b.probs[0]; cf += Math.max(...a.probs); cb += Math.max(...b.probs); n++;
      }
    }
    console.log(' ', condition, n + ' 下 | 看得到腳（一般模型）', JSON.stringify(t.fullSeen), '| 看不到腳：一般模型', JSON.stringify(t.full),
      '做對把握', (gf / n * 100).toFixed(0) + '%', '把握', (cf / n * 100).toFixed(0) + '%', '| 不看腳的模型', JSON.stringify(t.blind),
      '做對把握', (gb / n * 100).toFixed(0) + '%', '把握', (cb / n * 100).toFixed(0) + '%');
  }
}
