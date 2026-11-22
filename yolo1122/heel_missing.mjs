// 暫存區實驗：用 YOLO（看不到腳跟、腳尖）時，網站的 AI 判斷會怎樣
// 合成受測者 I、J、K（AI 模型訓練時沒看過）的深蹲「故意腳跟離地」、弓箭步「故意前膝超過腳尖」，
// 照常算一次 AI 判斷，再把腳的特徵改成 null（YOLO 看不到）算一次
import { analyzeOne } from '/home/user/claude-workspace/js/data/report-core.js';
import { aiJudgeFeatures, repScore } from '/home/user/claude-workspace/js/analysis/ai-judge.js';
import { itemFeatures } from '/home/user/claude-workspace/js/analysis/features.js';
import { syntheticSet } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';
for (const [workout, condition, footKey] of [['squat', 'heel', 'heel'], ['lunge', 'knee', 'knee'], ['squat', 'good', 'heel']]) {
  const tally = { normal: {}, yolo: {} };
  let n = 0, scoreN = 0, scoreY = 0;
  for (const subject of ['I', 'J', 'K']) {
    const r = await analyzeOne(syntheticSet(subject, workout, condition, 1).text);
    for (const item of r.items || r.reps || []) {
      const f = itemFeatures(workout, item);
      const a = aiJudgeFeatures(workout, f);
      const g = aiJudgeFeatures(workout, { ...f, [footKey]: null });
      tally.normal[a.label] = (tally.normal[a.label] || 0) + 1;
      tally.yolo[g.label] = (tally.yolo[g.label] || 0) + 1;
      scoreN += a.good; scoreY += g.good; n++;
    }
  }
  console.log(workout, condition, n + ' 下', '平常：', JSON.stringify(tally.normal), '看不到腳：', JSON.stringify(tally.yolo),
    '平均「做對」的把握 ' + (scoreN / n * 100).toFixed(0) + '% → ' + (scoreY / n * 100).toFixed(0) + '%');
}
