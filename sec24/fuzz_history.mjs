// 安全複查（10/24）：存在這台裝置的運動紀錄被改過時，總結、比較、雲端上傳會不會出錯或出現 NaN
const ROOT = process.argv[2];
const store = new Map();
globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { loadHistory, describe, compare, summarize } = await import(ROOT + '/js/analysis/session.js');
const { cloudSession } = await import(ROOT + '/js/cloud/sync.js');
const base = summarize('squat', [{ min: 85, depth: 'good', errors: ['lean'], peaks: { lean: 60 }, start: 0, end: 2, similarity: 90 }], 1761000000000, 1761000060000);
const hold = summarize('plank', [{ seconds: 20, errors: [] }], 1761000000000, 1761000060000);
const weird = [null, 'x', 42, [], {}, { lean: 'abc' }, { lean: NaN }, { constructor: 5 }, JSON.parse('{"__proto__": {"x": 1}}'), { lean: { a: 1 } }];
const cases = [];
for (const v of weird) {
    cases.push({ ...base, peaks: v }, { ...base, actual: v }, { ...hold, seconds: v }, { ...base, similarity: v });
}
cases.push({ ...base, errors: { constructor: 1 } }, { ...base, errors: JSON.parse('{"__proto__": 1}') }, { ...base, errors: { toString: 1 } });
let bad = 0;
for (const c of cases) {
    store.set('workoutHistory', JSON.stringify([base, c]));
    for (const s of loadHistory()) {
        try {
            const lines = [...describe(s), ...compare(s, base)];
            const t = lines.join(' | ');
            if (/NaN|undefined|null|\[object|Infinity/.test(t)) { bad++; console.log('BAD TEXT', JSON.stringify({ peaks: s.peaks, actual: s.actual, seconds: s.seconds, errors: s.errors, similarity: s.similarity }).slice(0, 120), '→', t.slice(0, 200)); }
            cloudSession(s);
        } catch (err) { bad++; console.log('THROW', JSON.stringify({ peaks: s.peaks, actual: s.actual, seconds: s.seconds, errors: s.errors }).slice(0, 120), err.message); }
    }
}
console.log(bad ? 'FOUND ' + bad : 'OK', cases.length, 'cases');
