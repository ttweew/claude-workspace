// 換動作的那幾秒：舊的動作還在數（AI 要看幾秒才認得出換了），新的動作又重算最近幾秒，同一下被兩個動作都數到
// 比較 4 種做法：V0 現在的 main.js（不傳 keep、不刪）、V1 傳 keep、V2 換的時候把舊動作在 from 之後才開始的那幾下刪掉、V3 兩個都做
const R = process.argv[2];
const { AutoSwitch, dropRecounted } = await import(R + '/js/analysis/auto-mode.js');
const { ActivityMeter, ActivityDisplay } = await import(R + '/js/analysis/activity.js');
const { WorkoutTracker } = await import(R + '/js/analysis/tracker.js');
const { PosePipeline } = await import(R + '/js/skeleton/pipeline.js');
const { parseRecording } = await import(R + '/js/data/replay-core.js');
const { syntheticSet } = await import(R + '/tests/synthetic-sets.mjs');
const { script, rep } = await import(R + '/tests/browser/harness.mjs');
function framesOf(sets) {
    const out = []; let offset = 0;
    for (const set of sets) {
        const parsed = parseRecording(set.text); const t0 = parsed.frames[0].t;
        for (const f of parsed.frames) out.push({ t: offset + f.t - t0, raw: f.raw });
        offset = out[out.length - 1].t + 33;
    }
    return out;
}
const demo = parts => script(parts).map((f, i) => ({ t: Math.round(i * 1000 / 30), raw: f.map(([x, y, z, visibility]) => ({ x, y, z, visibility })) }));
function run(frames, { keep: passKeep, trim }) {
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), auto = new AutoSwitch();
    let current = 'free', tracker = new WorkoutTracker('free');
    const counts = [];
    const finish = (from) => {
        if (tracker.workout.kind === 'hold' && tracker.counter.current) tracker.interrupt();
        let n = tracker.items.length;

        counts.push([current, n]);
    };
    for (const f of frames) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        tracker.update(p, f.t);
        const guess = meter.update(p, f.t), shown = display.update(guess);
        const change = auto.update(p, f.t, shown, current, true);
        if (!change) continue;
        if (trim) dropRecounted(tracker, change);
        finish(change.from); current = change.workout; tracker = new WorkoutTracker(current);
        meter.reset(); display.reset(); auto.reset();
        for (const g of change.frames) tracker.update(g.processed, g.now);
    }
    finish();
    // 站著被猜成別的動作、還沒數到東西的不算（例如 plank 0）；同一個動作連續兩段合起來
    const out = [];
    for (const [id, n] of counts) {
        if (id === 'free' || !n) continue;
        if (out.length && out[out.length - 1][0] === id) out[out.length - 1][1] += n; else out.push([id, n]);
    }
    return out;
}
const reps = (id, n) => Array.from({ length: n }, () => rep(id, { hold: 10, rest: 20 })).flat();
const st = (id, frames) => ({ id, depth: 0, frames });
const V = { V0: { keep: false, trim: false }, V2: { keep: false, trim: true } };
const err = { V0: 0, V2: 0 };
const rows = [];
const pairs = [['lunge', 'squat'], ['squat', 'lunge'], ['squat', 'pushup'], ['pushup', 'squat'], ['pushup', 'lunge'], ['lunge', 'pushup']];
for (const [a, b] of pairs) for (const pause of [0, 1, 2, 4, 6]) {
    const frames = demo([st(a, 120), ...reps(a, 6), st(a, pause * 30), st(b, 1), ...reps(b, 6), st(b, 60)]);
    rows.push({ name: `示範 ${a} 6 → 停 ${pause} 秒 → ${b} 6`, want: [[a, 6], [b, 6]], frames });
}
for (const [a, b] of pairs) rows.push({ name: `K ${a} → ${b}`, want: [[a, 10], [b, 10]], frames: framesOf([syntheticSet('K', a, 'good', 1), syntheticSet('K', b, 'good', 1)]) });
for (const [a, b] of [['squat', 'lunge'], ['lunge', 'squat']]) rows.push({ name: `I/J ${a} → ${b}`, want: [[a, 10], [b, 10]], frames: framesOf([syntheticSet(a === 'squat' ? 'I' : 'J', a, 'good', 1), syntheticSet(b === 'squat' ? 'I' : 'J', b, 'good', 1)]) });
for (const row of rows) {
    const res = {};
    for (const [k, opt] of Object.entries(V)) {
        const got = run(row.frames, opt);
        const e = row.want.reduce((s, [id, n]) => s + Math.abs(((got.find(x => x[0] === id) || [id, 0])[1]) - n), 0) + got.filter(x => !row.want.some(w => w[0] === x[0])).reduce((s, x) => s + x[1], 0);
        err[k] += e;
        res[k] = got.map(x => x[0] + ' ' + x[1]).join('→') + (e ? ` ✗${e}` : ' ✓');
    }
    console.log(row.name.padEnd(30), '|', Object.entries(res).map(([k, v]) => k + ' ' + v).join(' | '));
}
console.log('總誤差（每一個動作的次數差多少加起來）：', err);
