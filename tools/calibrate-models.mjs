// 兩個模型的校正（11/21，讓使用者自己選模型的第 5 步）：同一段影片，兩個模型各一份錄製檔（模型對照頁 compare.html 下載的），
// 算出 B 的角度比 A 多幾度（在不同的角度範圍分開算）、看不看得到的差別，再建議每個計次門檻換成 B 時要改成幾度
// 為什麼分範圍：11/21 的伏地挺身影片，YOLO 的手肘在伸直時和 MediaPipe 差不多，彎到底時大 10° 以上；只用一個平均數會不準
// 只建議、不改網站：門檻要等組員的真人影片（每個動作至少 2 位、10 下以上）算出來、大家看過才改（js/analysis/ 的設定）
//
// 用法（在專案資料夾）：
//   node tools/calibrate-models.mjs A的錄製檔.json B的錄製檔.json [--workout squat] [--json 結果.json]
//   A 通常是 MediaPipe（網站現在的門檻是照它訂的），B 是要校正的模型（例如 YOLO26n）
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseRecording, analyzeRecording, ANGLE_KEYS } from '../js/data/replay-core.js';
import { isWorkout } from '../js/analysis/workouts.js';
import { SQUAT_CONFIG } from '../js/analysis/squat.js';
import { PUSHUP_CONFIG, LUNGE_CONFIG, PLANK } from '../js/analysis/workouts.js';
import { keyOfFile, shortName } from '../js/ai/models.js';
import { P } from '../js/skeleton/landmarks.js';

// 每 15° 一段：大部分門檻之間差 15～20°，一段太寬會把伸直和彎到底混在一起
export const BIN = 15;
const MIN_FRAMES = 10;   // 一段至少要這麼多格才算數（太少的段落不給建議）

// 每個動作的計次門檻：要比的關節（左右都算）、門檻的名字和現在的數字
export function thresholdsOf(workoutId) {
    const reps = (joint, c) => ({ joint, list: [['伸直（up）', c.up], ['往下（down）', c.down], ['到位（good）', c.good], ['再低一點（close）', c.close]] });
    if (workoutId === 'squat') return [reps('KNEE', SQUAT_CONFIG)];
    if (workoutId === 'pushup') return [reps('ELBOW', PUSHUP_CONFIG)];
    if (workoutId === 'lunge') return [reps('KNEE', LUNGE_CONFIG)];
    if (workoutId === 'plank') return [{ joint: 'HIP', list: [['髖部一直線', PLANK.HIP]] }, { joint: 'KNEE', list: [['腳伸直', PLANK.KNEE]] }];
    return [];
}

// 兩份重算結果，某個關節（例如 'KNEE'：左右都算）：每 15° 一段（照 A 的角度分），B − A 平均差幾度
// 回傳 [{ from, to, frames, mean }]（只列有資料的段落；mean 取到小數 1 位）
export function offsetBins(a, b, joint) {
    const A = ANGLE_KEYS.length;
    const cols = ['LEFT_', 'RIGHT_'].map(s => ANGLE_KEYS.indexOf(s + joint)).filter(j => j >= 0);
    const sums = new Map();
    const n = Math.min(a.n, b.n);
    for (let i = 0; i < n; i++) {
        if (!a.present[i] || !b.present[i]) continue;
        for (const j of cols) {
            const x = a.angles[i * A + j], y = b.angles[i * A + j];
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const from = Math.floor(x / BIN) * BIN;
            const s = sums.get(from) || { sum: 0, n: 0 };
            s.sum += y - x;
            s.n++;
            sums.set(from, s);
        }
    }
    return [...sums.entries()].sort((p, q) => p[0] - q[0])
        .map(([from, s]) => ({ from, to: from + BIN, frames: s.n, mean: Math.round(s.sum / s.n * 10) / 10 }));
}

// 一個門檻換成 B 要幾度：用門檻所在那一段的平均差（那一段格子太少就不建議，回傳 null）
export function suggest(value, bins) {
    const bin = bins.find(x => value >= x.from && value < x.to) || (value === 180 ? bins.find(x => x.to === 180) : null);
    if (!bin || bin.frames < MIN_FRAMES) return null;
    return { value: Math.round(value + bin.mean), offset: bin.mean, frames: bin.frames };
}

// 看不看得到：每個點平均可信度、B 說看得到但 A 說看不到的格子比例（YOLO 對被擋住的那一側也很有把握）
// 回傳 { [點的名字]: { a, b, onlyB } }（只列主要關節）
export function visibilityGap(parsedA, parsedB) {
    const names = ['SHOULDER', 'ELBOW', 'WRIST', 'HIP', 'KNEE', 'ANKLE'].flatMap(p => ['LEFT_' + p, 'RIGHT_' + p]);
    const out = {};
    const n = Math.min(parsedA.frames.length, parsedB.frames.length);
    for (const name of names) {
        const id = P[name];
        let sa = 0, sb = 0, both = 0, onlyB = 0;
        for (let i = 0; i < n; i++) {
            const fa = parsedA.frames[i].raw, fb = parsedB.frames[i].raw;
            if (!fa || !fb) continue;
            both++;
            sa += fa[id].visibility;
            sb += fb[id].visibility;
            if (fb[id].visibility >= 0.65 && fa[id].visibility < 0.65) onlyB++;
        }
        out[name] = both ? { a: Math.round(sa / both * 100) / 100, b: Math.round(sb / both * 100) / 100, onlyB: Math.round(onlyB / both * 100) } : null;
    }
    return out;
}

// 整理成一份報告（文字）：哪兩個模型、幾格、每個門檻的建議、看不看得到
export function report({ modelA, modelB, workout, frames, bins, suggestions, visibility, reps }) {
    const lines = ['兩個模型的校正：A ' + modelA + '、B ' + modelB + '，動作 ' + workout + '，兩邊都有人的格子 ' + frames + ' 格',
        '次數：A ' + reps.a + ' 下、B ' + reps.b + ' 下'];
    for (const t of suggestions) {
        lines.push('', t.joint + '（B − A，照 A 的角度每 ' + BIN + '° 一段）：' + bins[t.joint].map(x => x.from + '～' + x.to + '° ' + (x.mean > 0 ? '+' : '') + x.mean + '°（' + x.frames + ' 格）').join('、'));
        for (const s of t.list) {
            lines.push('  ' + s.name + '：A 現在 ' + s.value + '° → ' + (s.suggest ? 'B 建議 ' + s.suggest.value + '°（這一段差 ' + (s.suggest.offset > 0 ? '+' : '') + s.suggest.offset + '°、' + s.suggest.frames + ' 格）' : '資料不夠（這一段不到 ' + MIN_FRAMES + ' 格），先不改'));
        }
    }
    lines.push('', '看不看得到（平均可信度 A／B；B 看得到但 A 看不到的格子比例）：');
    for (const [name, v] of Object.entries(visibility)) if (v) lines.push('  ' + name + ' ' + v.a + '／' + v.b + '（' + v.onlyB + '%）');
    lines.push('', '只是建議：要有組員的真人影片（每個動作至少 2 位、10 下以上）算出來、大家看過，才改網站的門檻');
    return lines.join('\n');
}

export async function calibrate(textA, textB, workoutArg = null) {
    const pa = parseRecording(textA), pb = parseRecording(textB);
    const workout = workoutArg || (pa.meta && pa.meta.workout) || (pb.meta && pb.meta.workout);
    if (!isWorkout(workout) || workout === 'free') throw new Error('要指定動作（--workout squat、pushup、plank、lunge）');
    const size = m => [m && m.videoWidth > 0 ? m.videoWidth : 640, m && m.videoHeight > 0 ? m.videoHeight : 480];
    const [w, h] = size(pa.meta);
    const ra = await analyzeRecording(pa, w, h, { workout });
    const rb = await analyzeRecording(pb, w, h, { workout });
    let frames = 0;
    for (let i = 0; i < Math.min(ra.n, rb.n); i++) if (ra.present[i] && rb.present[i]) frames++;
    const bins = {};
    const suggestions = thresholdsOf(workout).map(({ joint, list }) => {
        bins[joint] = offsetBins(ra, rb, joint);
        return { joint, list: list.map(([name, value]) => ({ name, value, suggest: suggest(value, bins[joint]) })) };
    });
    const name = m => (m && typeof m.model === 'string' ? (keyOfFile(m.model) ? shortName(keyOfFile(m.model)) : m.model) : '（沒寫）');
    return { modelA: name(pa.meta), modelB: name(pb.meta), workout, frames, bins, suggestions,
        visibility: visibilityGap(pa, pb), reps: { a: ra.reps.length, b: rb.reps.length } };
}

async function main(args) {
    const files = args.filter(a => !a.startsWith('--'));
    const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
    const workout = flag('--workout'), out = flag('--json');
    const inputs = files.filter(f => f !== workout && f !== out);
    if (inputs.length !== 2) {
        console.log('用法：node tools/calibrate-models.mjs A的錄製檔.json B的錄製檔.json [--workout squat] [--json 結果.json]');
        process.exitCode = 1;
        return;
    }
    const result = await calibrate(await readFile(inputs[0], 'utf8'), await readFile(inputs[1], 'utf8'), workout);
    console.log(report(result));
    if (out) await writeFile(out, JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
