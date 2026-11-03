// 合成資料（A～H）每個動作每種標記：每個特徵的範圍、規則抓到幾下
const W = '/home/user/claude-workspace';
const { buildDataset } = await import(W + '/tools/dataset.mjs');
const { syntheticSubject } = await import(W + '/tests/synthetic-sets.mjs');
const { featureColumns } = await import(W + '/js/analysis/features.js');
const subjects = (process.env.SUBJ || 'A,B,C,D,E,F,G,H').split(',');
const t0 = Date.now();
const { rows } = await buildDataset(subjects.flatMap(s => syntheticSubject(s)));
console.log('rows', rows.length, 'ms', Date.now() - t0);
for (const w of ['squat', 'lunge', 'pushup', 'plank']) {
    const cols = featureColumns(w).map(c => c.key);
    for (const c of [...new Set(rows.filter(r => r.workout === w).map(r => r.condition))]) {
        const rs = rows.filter(r => r.workout === w && r.condition === c);
        const stat = k => { const v = rs.map(r => r.features[k]).filter(x => x !== null); return v.length ? Math.min(...v).toFixed(1) + '~' + Math.max(...v).toFixed(1) + (v.length < rs.length ? '(null ' + (rs.length - v.length) + ')' : '') : 'null'; };
        const ruleOk = rs.filter(r => c === 'good' ? r.ruleErrors.length === 0 : r.ruleErrors.includes(c)).length;
        console.log(w, c, rs.length, 'rule', ruleOk, '|', cols.map(k => k + ' ' + stat(k)).join('  '));
    }
}
