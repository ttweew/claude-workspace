import { syntheticSet } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';
import { analyzeOne } from '/home/user/claude-workspace/js/data/report-core.js';
for (const s of ['A', 'B', 'C', 'D']) for (const c of ['good', 'sag', 'pike']) {
    const set = syntheticSet(s, 'plank', c, 7);
    const r = await analyzeOne(set.text);
    console.log(s, c, set.amounts.map(a => a.toFixed(2)), JSON.stringify(r.items.map(it => ({ sec: it.seconds, f: it.features, e: it.errors }))));
}
