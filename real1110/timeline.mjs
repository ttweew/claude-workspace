// 一段伏地挺身（或其他動作）的時間軸：每 0.25 秒印手肘／膝蓋角度、計次狀態、提示、趴著（身體和地面夾角）、側面／正面、AI 猜的
// 用法：node timeline.mjs <檔案> [從幾秒] [到幾秒]
import { readFileSync } from 'node:fs';
const W = '/home/user/claude-workspace';
const { parseRecording } = await import(W + '/js/data/replay-core.js');
const { PosePipeline } = await import(W + '/js/skeleton/pipeline.js');
const { WorkoutTracker } = await import(W + '/js/analysis/tracker.js');
const { ActivityMeter, ActivityDisplay, ACTIVITY_NAMES } = await import(W + '/js/analysis/activity.js');
const { bodyTilt } = await import(W + '/js/analysis/reps.js');
const parsed = parseRecording(readFileSync(process.argv[2], 'utf8'));
const from = +(process.argv[3] ?? 0), to = +(process.argv[4] ?? 1e9);
const m = parsed.meta, w = m.videoWidth, h = m.videoHeight;
const pipeline = new PosePipeline(), tracker = new WorkoutTracker(m.workout), meter = new ActivityMeter(), display = new ActivityDisplay();
if (tracker) tracker.useBaseline(m.calibration);
const t0 = parsed.frames[0].t;
let next = 0, shown = null;
const f1 = v => (v === null || v === undefined ? '  —' : String(Math.round(v)).padStart(3));
for (const f of parsed.frames) {
    const p = pipeline.process(f.raw, f.t, w, h);
    const r = tracker.update(p, f.t);
    const g = meter.update(p, f.t);
    shown = display.update(g);
    const s = (f.t - t0) / 1000;
    if (r.done) console.log('      >>> 數到第 ' + r.done.n + ' 下（最低 ' + Math.round(r.done.min) + '°，' + (r.done.errors || []).join('+') + '）');
    if (s < next) continue;
    next = s + 0.25;
    if (s < from || s > to) continue;
    const a = p ? p.angles : {};
    const tilt = p ? bodyTilt(p.landmarks, w, h) : null;
    console.log(s.toFixed(2).padStart(6) + ' 秒  肘 L' + f1(a.LEFT_ELBOW) + ' R' + f1(a.RIGHT_ELBOW) + '  膝 L' + f1(a.LEFT_KNEE) + ' R' + f1(a.RIGHT_KNEE)
        + '  髖 L' + f1(a.LEFT_HIP) + ' R' + f1(a.RIGHT_HIP) + '  身體夾角' + f1(tilt) + '  ' + (p ? p.view.view || '—' : '沒人').padEnd(7)
        + '  計次值' + f1(r.count ? r.count.value : null) + ' 狀態 ' + (r.count ? r.count.state : '-').padEnd(6) + ' 次數 ' + (r.count ? r.count.reps : '-')
        + (r.count && r.count.prompt ? '  提示：' + r.count.prompt : '') + '  AI：' + (shown ? (shown.label ? ACTIVITY_NAMES[shown.label] : '？') : '－'));
}
