// 規則判斷 ⇔ 特徵 > 門檻：合成的組全部檢查
import { syntheticSubject } from '/home/user/claude-workspace/tests/synthetic-sets.mjs';
import { analyzeOne } from '/home/user/claude-workspace/js/data/report-core.js';
import { FORM_RULES } from '/home/user/claude-workspace/js/analysis/form.js';
const subjects = (process.env.SUBJ || 'A,B,C,D').split(',');
const t0 = Date.now();
let checked = 0, bad = 0;
for (const s of subjects) {
    for (const set of syntheticSubject(s)) {
        const r = await analyzeOne(set.text);
        for (const [i, it] of r.items.entries()) {
            for (const rule of FORM_RULES[r.info.workout]) {
                const f = it.features[rule.id];
                const byFeature = f !== null && f > rule.why.limit;
                const byRule = it.errors.includes(rule.id);
                checked++;
                if (byFeature !== byRule) { bad++; console.log('MISMATCH', set.name, i + 1, rule.id, f, rule.why.limit, it.errors); }
            }
        }
        console.log(set.name, r.items.length, JSON.stringify(r.items.map(it => it.features)).slice(0, 160));
    }
}
console.log('checked', checked, 'mismatch', bad, 'ms', Date.now() - t0);
