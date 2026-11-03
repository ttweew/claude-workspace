// 合成受測者 K（訓練時沒看過）的 9 組：每一下 AI 判斷、規則的判斷，哪幾組不一樣（挑簡報截圖用）；K 全部各猜對幾下
const W = '/home/user/claude-workspace';
const { syntheticSubject } = await import(W + '/tests/synthetic-sets.mjs');
const { analyzeOne } = await import(W + '/js/data/report-core.js');
const { aiJudge, ruleJudge, judgeText } = await import(W + '/js/analysis/ai-judge.js');
const { itemFeatures } = await import(W + '/js/analysis/features.js');
let ai = 0, rule = 0, n = 0;
for (const set of syntheticSubject('K')) {
    const r = await analyzeOne(set.text);
    const rows = r.items.map(it => {
        const a = aiJudge(r.info.workout, it);
        return [judgeText(a.label) + Math.round(a.confidence * 100), judgeText(ruleJudge(r.info.workout, it.errors, itemFeatures(r.info.workout, it))), a.label, ruleJudge(r.info.workout, it.errors, itemFeatures(r.info.workout, it))];
    });
    const aiHit = rows.filter(x => x[2] === r.info.condition).length, ruleHit = rows.filter(x => x[3] === r.info.condition).length;
    ai += aiHit; rule += ruleHit; n += rows.length;
    console.log(set.name, '| 不一樣', rows.filter(x => x[2] !== x[3]).length, '| AI', aiHit + '/' + rows.length, '規則', ruleHit + '/' + rows.length, '|', rows.map(x => x[0] + ' vs ' + x[1]).join('；'));
}
console.log('K 全部：AI', ai + '/' + n, '規則', rule + '/' + n);
