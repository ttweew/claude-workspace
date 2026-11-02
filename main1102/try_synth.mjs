// 合成的實測檔跑過重播（實測報表同一套 analyzeOne 前的分析）：每一組算幾下、規則抓到幾下、特徵的範圍
const W = '/home/user/claude-workspace';
const { syntheticSet } = await import(W + '/tests/synthetic-sets.mjs');
const { parseRecording, analyzeRecording } = await import(W + '/js/data/replay-core.js');
const { conditionsFor } = await import(W + '/js/data/test-mode.js');
const subjects = process.argv.slice(2).length ? process.argv.slice(2) : ['A', 'B'];
for (const workout of (process.env.W ? process.env.W.split(',') : ['squat', 'pushup', 'lunge', 'plank'])) {
    for (const c of conditionsFor(workout)) {
        for (const subject of subjects) {
            const set = syntheticSet(subject, workout, c.id, 3);
            const r = await analyzeRecording(parseRecording(set.text), 640, 480, { workout });
            const caught = r.reps.filter(it => it.errors.includes(c.id)).length;
            const anyErr = r.reps.filter(it => it.errors.length).length;
            const feats = r.reps.map(it => JSON.stringify(it.features)).join(' ');
            console.log(workout.padEnd(6), c.id.padEnd(5), subject, '算', r.reps.length, '下｜這種錯', caught, '｜有錯', anyErr, '｜程度', set.amounts.map(a => a.toFixed(2)).join(','), '\n   ', feats.slice(0, 400));
        }
    }
}
