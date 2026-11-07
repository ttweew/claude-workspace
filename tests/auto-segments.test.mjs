// 重播分析的 AI 全自動分段（11/8 追加 3，js/analysis/auto-segments.js）：自由模式錄的影片做了好幾個動作，
// 照首頁 AI 全自動的做法切成幾段；同一批骨架，分出來的每一段、每一段幾下要和 tests/auto-mode.test.mjs 照 main.js 的做法跑的一樣
import test from 'node:test';
import assert from 'node:assert/strict';
import { AutoSegmenter } from '../js/analysis/auto-segments.js';
import { AutoSwitch } from '../js/analysis/auto-mode.js';
import { ActivityMeter, ActivityDisplay } from '../js/analysis/activity.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { parseRecording, analyzeRecording } from '../js/data/replay-core.js';
import { PoseRecorder } from '../js/data/recorder.js';
import { syntheticSet } from './synthetic-sets.mjs';

// 幾組接在一起（時間接著上一組），和 tests/auto-mode.test.mjs 一樣
function framesOf(sets) {
    const out = [];
    let offset = 0;
    for (const set of sets) {
        const parsed = parseRecording(set.text);
        const t0 = parsed.frames[0].t;
        for (const f of parsed.frames) out.push({ t: offset + f.t - t0, raw: f.raw });
        offset = out[out.length - 1].t + 33;
    }
    return out;
}
// 照 main.js 的做法（tests/auto-mode.test.mjs 的 run()）：每一段 [動作, 幾下]
function mainWay(frames) {
    const pipeline = new PosePipeline(), meter = new ActivityMeter(), display = new ActivityDisplay(), auto = new AutoSwitch();
    let current = 'free', tracker = new WorkoutTracker('free');
    const counts = [];
    const finish = () => {
        if (tracker.workout.kind === 'hold' && tracker.counter.current) tracker.interrupt();
        counts.push([current, tracker.items.length]);
    };
    for (const f of frames) {
        const p = pipeline.process(f.raw, f.t, 640, 480);
        tracker.update(p, f.t);
        const guess = meter.update(p, f.t);
        const shown = display.update(guess);
        const keep = tracker.items.length > 0 || !!(tracker.counter && tracker.counter.current);
        const change = auto.update(p, f.t, guess, shown, current, true, keep);
        if (!change) continue;
        finish();
        current = change.workout;
        tracker = new WorkoutTracker(current);
        meter.reset();
        display.reset();
        auto.reset();
        for (const g of change.frames) tracker.update(g.processed, g.now);
    }
    finish();
    return counts.filter(([id, n]) => id !== 'free' && n > 0);
}
// 用網站的錄製程式存成一個錄製檔（自由模式，或 workout 指定的動作）
function recordingOf(frames, workout) {
    const recorder = new PoseRecorder();
    recorder.start({ videoWidth: 640, videoHeight: 480, workout, synthetic: true, description: '合成的（不是真人）：幾組接在一起' });
    for (const f of frames) recorder.add(1000 + f.t, f.raw, null);
    recorder.stop();
    return recorder.toJSON();
}

test('合成受測者 K：深蹲 10 下 → 伏地挺身 10 下 → 弓箭步 10 下，分段和首頁 AI 全自動的做法一樣（瞬間換成弓箭步時少算第 1 下，兩邊一樣）', () => {
    const frames = framesOf([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1), syntheticSet('K', 'lunge', 'good', 1)]);
    const seg = new AutoSegmenter();
    const pipeline = new PosePipeline();
    for (const f of frames) seg.update(pipeline.process(f.raw, f.t, 640, 480), f.t);
    const got = seg.done().map(s => [s.workout, s.items.length]);
    assert.deepEqual(got, mainWay(frames));
    // 弓箭步少 1 下：接在一起的合成資料是一瞬間從趴著變站著（真人起身要幾秒）；AI 看的 3 秒裡還有伏地挺身，
    // 弓箭步那組開始 2.8 秒後才不再猜伏地挺身，重算從那裡開始，第 1 下（最低點在 3.5 秒）只剩一半，不算（首頁 AI 全自動一樣）
    assert.deepEqual(got, [['squat', 10], ['pushup', 10], ['lunge', 9]]);
    // done() 之後再呼叫：不會重複算最後一段
    assert.deepEqual(seg.done().map(s => s.workout), ['squat', 'pushup', 'lunge']);
});

test('重播分析：自由模式錄的才分段（和上面一樣）；選了動作錄的不分；只做一個動作是一段', async () => {
    const frames = framesOf([syntheticSet('K', 'squat', 'good', 1), syntheticSet('K', 'pushup', 'good', 1)]);
    const free = await analyzeRecording(parseRecording(recordingOf(frames, 'free')), 640, 480, {});
    assert.deepEqual(free.autoSegments.map(s => [s.workout, s.items.length]), [['squat', 10], ['pushup', 10]]);
    // 每一下和重播分析的 reps 一樣的格式（有最低點、相似度）
    assert.ok(free.autoSegments[0].items.every(it => typeof it.bottom === 'number' && Number.isInteger(it.n)));
    // 選深蹲錄的：不分段（也不多花時間）；分析的結果和以前一樣
    const squat = await analyzeRecording(parseRecording(recordingOf(frames, 'squat')), 640, 480, { workout: 'squat' });
    assert.deepEqual(squat.autoSegments, []);
    // 沒記動作的舊檔案也分；只有深蹲：一段
    const one = await analyzeRecording(parseRecording(recordingOf(framesOf([syntheticSet('I', 'squat', 'good', 1)]), undefined)), 640, 480, {});
    assert.deepEqual(one.autoSegments.map(s => [s.workout, s.items.length]), [['squat', 10]]);
    // 被改壞的動作名稱：當成選了別的動作，不分段
    const bad = await analyzeRecording(parseRecording(recordingOf(frames, 'constructor')), 640, 480, {});
    assert.deepEqual(bad.autoSegments, []);
});
