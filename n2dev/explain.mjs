const W = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/n3wt';
const { syntheticSet } = await import(W + '/tests/synthetic-sets.mjs');
const { analyzeOne } = await import(W + '/js/data/report-core.js');
const { judgeReps, explainRep, aiLimit } = await import(W + '/js/analysis/ai-judge.js');
const { itemFeatures } = await import(W + '/js/analysis/features.js');
const { predictModel } = await import(W + '/js/analysis/forest.js');
const MODELS = (await import(W + '/js/analysis/ai-model.js')).default;
// 和一格一格試的一樣嗎
function scan(w, features, error) {
    const model = MODELS.models.find(m => m.workout === w);
    const MIRROR = { sag: 'pike', pike: 'sag' };
    const limits = { lean: w === 'lunge' ? 30 : 50, heel: 14, knee: 10 };
    for (let i = 0; i <= 3000; i++) {
        const f = { ...features, [error]: i / 10 };
        if (MIRROR[error]) f[MIRROR[error]] = -i / 10;
        if (predictModel(model, f).label === error) return i / 10;
    }
    return null;
}
let checked = 0, same = 0;
for (const [w, c] of [['squat', 'good'], ['squat', 'lean'], ['squat', 'heel'], ['pushup', 'good'], ['pushup', 'sag'], ['pushup', 'pike'], ['lunge', 'knee'], ['plank', 'pike']]) {
    const r = await analyzeOne(syntheticSet('K', w, c, 1).text);
    const j = judgeReps(w, r.items);
    const t0 = performance.now();
    const lines = r.items.map((it, i) => explainRep(w, it, j[i].ai));
    const ms = performance.now() - t0;
    console.log(w, c, Math.round(ms) + 'ms', '|', lines.slice(0, 3).join(' ｜ '));
    for (const it of r.items) for (const e of MODELS.models.find(m => m.workout === w).classes.slice(1)) {
        const f = itemFeatures(w, it);
        const a = aiLimit(w, f, e), b = scan(w, f, e);
        checked++; if (a === b || (b !== null && a === null && b > 0)) same++; else console.log('  diff', w, e, a, b);
    }
}
console.log('checked', checked, 'same', same);
