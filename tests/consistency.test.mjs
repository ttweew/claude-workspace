// 資料一致性（11/1 保養）：同一串骨架，運動時（首頁）算的和錄下來拿到重播分析算的一樣
// 首頁：每一格用瀏覽器給的時間（有小數）直接算；重播：網站的錄製程式（PoseRecorder）存成 JSON，再用重播的程式（replay-core）算
// 以前錄製檔的時間四捨五入到整數毫秒：平滑、棒式每 2 秒一段的切法差一點點，一位小數的數字偶爾差 0.1
// （下面這組時間：以前重播寫「後段 ±2.6°」、首頁「±2.5°」）；11/1 起存到小數第 2 位，完全一樣
import test from 'node:test';
import assert from 'node:assert/strict';
import { script, rep } from './browser/harness.mjs';
import { P } from '../js/skeleton/landmarks.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';
import { repSeries } from '../js/analysis/rep-series.js';
import { summarize, describe } from '../js/analysis/session.js';
import { stabilityOf, stabilityLine } from '../js/analysis/stability.js';
import { fatigueOf, fatigueLine } from '../js/analysis/fatigue.js';
import { fluencyOf, fluencyLine } from '../js/analysis/fluency.js';
import { PoseRecorder } from '../js/data/recorder.js';
import { parseRecording, analyzeRecording } from '../js/data/replay-core.js';

// 棒式：先站 2 秒，前 13 秒撐得穩，後 13 秒髖部上下晃（和瀏覽器測試一樣）
const hips = [P.LEFT_HIP, P.RIGHT_HIP];
const PLANK = script([{ id: 'squat', depth: 0, frames: 60 }, { id: 'plank', depth: 0, frames: 390 },
    { id: 'plank', depth: 0, frames: 390, move: (p, k, n) => (hips.includes(k) ? { ...p, y: p.y + 0.01 * Math.sin(n / 30 * 2 * Math.PI * 0.7) } : p) }]);
// 深蹲 8 下：後 3 下整個人前後晃
const rock = px => (p, k, n) => (k < 25 ? { ...p, x: p.x + px / 640 * Math.sin(n / 30 * 2 * Math.PI) } : p);
const SQUAT = script([{ id: 'squat', depth: 0, frames: 75 }, ...[0, 0, 0, 0, 0, 10, 10, 10].flatMap(px => rep('squat', { hold: 15, rest: 40, move: px ? rock(px) : undefined }))]);

// 像瀏覽器一樣的時間：每格約 33.3 毫秒、±6 毫秒、有小數（seed 固定，每次一樣）；格子照時間拿
function browserTimes(frames, seed) {
    let rnd = seed;
    const r = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
    const out = [], t0 = 1000.37;
    for (let t = t0; ; t += 33.3 + (r() - 0.5) * 12) {
        const i = Math.floor((t - t0) / (1000 / 30));
        if (i >= frames.length) break;
        out.push([i, t]);
    }
    return out;
}
const points = f => f.map(([x, y, z, visibility]) => ({ x, y, z, visibility }));

// 首頁：照時間一格一格算（js/pages/main.js：pipeline.process、tracker.update 用同一個時間）
function atHome(workout, frames, times) {
    const pipeline = new PosePipeline(), tracker = new WorkoutTracker(workout);
    for (const [i, t] of times) tracker.update(pipeline.process(points(frames[i]), t, 640, 480), t);
    if (tracker.workout.kind === 'hold' && tracker.counter.current) tracker.interrupt();
    return tracker.items;
}
// 錄下來 → JSON → 重播分析
async function inReplay(workout, frames, times) {
    const recorder = new PoseRecorder();
    recorder.start({ videoWidth: 640, videoHeight: 480, workout });
    for (const [i, t] of times) recorder.add(t, points(frames[i]), null);
    recorder.stop();
    const result = await analyzeRecording(parseRecording(recorder.toJSON()), 640, 480, { workout });
    return result.reps;
}
const words = (workout, items) => {
    const series = repSeries(workout, items);
    return [...describe(summarize(workout, items, 0, 1)), fatigueLine(fatigueOf(series)), fluencyLine(fluencyOf(series)), stabilityLine(stabilityOf(series, workout))];
};

test('棒式：運動時和重播寫的一樣（以前整數毫秒時，這組時間後段的晃動差 0.1°）', async () => {
    const times = browserTimes(PLANK, 7);
    const home = words('plank', atHome('plank', PLANK, times));
    assert.match(home[home.length - 1], /^動作穩定度：髖部上下晃動/);
    assert.deepEqual(words('plank', await inReplay('plank', PLANK, times)), home);
});

test('深蹲：運動時和重播寫的一樣（總結、疲勞分析、流暢度、穩定度）', async () => {
    for (const seed of [3, 7, 11]) {
        const times = browserTimes(SQUAT, seed);
        const home = words('squat', atHome('squat', SQUAT, times));
        assert.match(home[0], /^深蹲 8 下/);
        assert.deepEqual(words('squat', await inReplay('squat', SQUAT, times)), home, 'seed ' + seed);
    }
});
