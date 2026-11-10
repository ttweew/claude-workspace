// 錯誤紅字的時間軸：每一格印某條規則的值、是不是「真的做錯」（bad）、紅字有沒有亮（shown）、計次狀態；看紅字的尾巴有沒有被算進下一下
// 用法：node formline.mjs <檔案> <規則代號> <從幾秒> <到幾秒>
import { readFileSync } from 'node:fs';
const W = '/home/user/claude-workspace';
const { parseRecording } = await import(W + '/js/data/replay-core.js');
const { PosePipeline } = await import(W + '/js/skeleton/pipeline.js');
const { WorkoutTracker } = await import(W + '/js/analysis/tracker.js');
const parsed = parseRecording(readFileSync(process.argv[2], 'utf8'));
const rule = process.argv[3], from = +process.argv[4], to = +process.argv[5];
const m = parsed.meta, pipeline = new PosePipeline(), tracker = new WorkoutTracker(m.workout);
tracker.useBaseline(m.calibration);
const t0 = parsed.frames[0].t;
for (const f of parsed.frames) {
    const p = pipeline.process(f.raw, f.t, m.videoWidth, m.videoHeight);
    const r = tracker.update(p, f.t);
    const s = (f.t - t0) / 1000;
    if (r.done) console.log('   >>> 第 ' + r.done.n + ' 下結束：' + r.done.start.toFixed(2) + '–' + r.done.end.toFixed(2) + ' 秒，錯誤 ' + JSON.stringify(r.done.errors) + ' ' + JSON.stringify(r.done.peaks));
    if (s < from || s > to) continue;
    const st = tracker.form.states.get(rule);
    const v = r.form.values[rule];
    const ruleObj = tracker.form.rules.find(x => x.id === rule);
    const val = r.form.m && ruleObj.why ? ruleObj.why.value(r.form.m) : null;
    console.log(s.toFixed(2).padStart(6) + ' 秒  值 ' + (val === null ? '  —' : val.toFixed(1).padStart(5)) + (r.form.m && ruleObj.active(r.form.m) && ruleObj.bad(r.form.m) ? '  做錯' : '      ') + (st.shown ? '  紅字亮' : '        ')
        + '  計次 ' + (r.count ? r.count.state + ' ' + (r.count.value === null ? '—' : Math.round(r.count.value)) : '-'));
}
