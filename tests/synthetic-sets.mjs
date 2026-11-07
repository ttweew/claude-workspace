// AI 模型的資料（11/2）：還沒有真人實測檔時，用合成的「實測檔」把流程做通（測試、tools/dataset.mjs 用）
// 照實測模式的規則（js/data/test-mode.js）：每位受測者每個動作做對 10 下、每種錯誤故意做 5 下；棒式做對撐 30 秒、錯誤各撐 10 秒
// 每位「受測者」不一樣：離鏡頭遠近、站的位置、雜訊、節奏、蹲的深度；故意做錯的程度每一下不一樣，有些只差一點點（剛好在門檻附近），
// 做對的也有一點自然的偏差。用網站的錄製程式（PoseRecorder）存成和真的實測檔一樣的 JSON（meta.test、meta.synthetic）
// 11/3（訓練 AI 模型）：每個人本來的樣子也不一樣（上身前傾、腳跟、弓箭步的前膝、伏地挺身的髖部高低，見 subjectStyle）：
// 11/2 的合成資料做對、做錯的數字完全分得開，AI 模型一定 100% 猜對，和規則比沒有意義；10/20 真人實測也是每個人差很多
// 是示範動畫的火柴人，不是真人：拿來訓練、算出來的準確率只能證明流程跑得通，不能當成研究結果
import { demoLandmarks, random } from './helpers.mjs';
import { P } from '../js/skeleton/landmarks.js';
import { PoseRecorder } from '../js/data/recorder.js';
import { testMeta, conditionsFor } from '../js/data/test-mode.js';

const W = 640, H = 480;
const UPPER = [...Array(23).keys()];   // 0～22：頭、肩、手肘、手腕、手（上身前傾時跟著髖部轉）

// 文字 → 亂數的起點（FNV-1a 雜湊）
// 11/2 先直接用代號的字元碼當起點：A、B、C 只差 1，這個亂數（每次乘 16807）第一個數字幾乎一樣（每個人一樣大），
// 後面每個人也只是同一串數字平移（四個人故意做錯的程度幾乎一樣）；打散之後每個人、每一組才是各自的一串
function seedOf(text) {
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h % 2147483646 + 1;
}

// 受測者的樣子（同一個代號每次一樣）
export function subjectStyle(subject) {
    const r = random(seedOf('style|' + subject));
    return {
        scale: 0.85 + r() * 0.25,          // 離鏡頭遠近：0.85～1.1 倍大
        dx: (r() - 0.5) * 0.12,            // 站的位置（畫面寬的比例）
        dy: (r() - 0.5) * 0.06,
        noise: 0.0006 + r() * 0.0012,      // 每個點每一格的雜訊（畫面寬的比例：0.4～1.2 像素）
        half: 24 + Math.floor(r() * 12),   // 下去（起來）幾格：0.8～1.2 秒
        hold: Math.floor(r() * 10),        // 底部停幾格
        rest: 28 + Math.floor(r() * 16),   // 站直休息幾格
        // 每個人本來的樣子（不是故意做錯；每一下再乘上 0.6～1.4，見 syntheticSet）。沒有真人數字的是假設，等實測檔再對
        lean: r() * 12,                    // 蹲下去時本來就比示範動畫多前傾幾度（身材、柔軟度不一樣；假設 0～12°）
        heel: r() * 0.12,                  // 深蹲時腳跟本來就抬一點（小腿長的比例；10/20 實測 B 正常蹲 −4～4%、A 5～20%）
        knee: r() * 0.6,                   // 弓箭步前膝本來就比示範動畫前面多少（小腿長的比例；10/20 實測 A 正常弓箭步有幾下超過腳尖 10%）
        hip: (r() - 0.5) * 0.04            // 伏地挺身、棒式本來的髖部高低（肩到腳踝長度的比例；±0.02 約 ±4.6°，假設）
    };
}

// 每種錯誤每一下的程度：故意做錯的 0.5～1.6（1 大約是剛好到規則的門檻，見下面的 MAGNITUDE），做對的 0～0.35
// （11/2 用合成的組跑過一次重播量出來的：1 倍時深蹲上身前傾約 51°、腳跟約 15%、伏地挺身腰彎約 18°、屁股翹約 24°、弓箭步見下面）
const MAGNITUDE = {
    lean: 24,     // 上身多轉幾度（深蹲門檻 50°，示範動畫蹲到底約 30°；弓箭步門檻 30°）
    heel: 0.2,    // 腳跟往上抬（小腿長的比例；門檻 14%）
    sag: 0.085,   // 髖部往下（肩到腳踝長度的比例；門檻 0.07）
    pike: 0.11,   // 髖部往上（門檻 0.09）
    knee: 0.67    // 前膝往前（小腿長的比例；1 倍時量到約 +10%，量到的不是直線關係，11/2 試 0.28、0.5、1.0 之後內插的；門檻 10%，示範動畫約 −40%）
};
const LUNGE_LEAN = 34;   // 弓箭步：門檻 30°，示範動畫跨下去時約 3～6°；1 倍時量到約 31°（11/2 先試 14°、27° 都太小）

const px = p => ({ x: p.x * W, y: p.y * H });
function rotateAround(lm, ids, pivot, deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    for (const i of ids) {
        const q = px(lm[i]), vx = q.x - pivot.x, vy = q.y - pivot.y;
        lm[i] = { ...lm[i], x: (pivot.x + vx * c - vy * s) / W, y: (pivot.y + vx * s + vy * c) / H };
    }
}
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 一格：示範動畫的姿勢＋這一下的錯誤（amount：0～1.6，跟著 depth 一起出現：站直時沒有）＋這個人本來的樣子
// style.natural：這一下本來的樣子是平常的幾倍（每一下不太一樣）
function pose(workout, depth, condition, amount, style) {
    const lm = demoLandmarks(workout, depth).map(p => ({ ...p }));
    const hip = mid(px(lm[P.LEFT_HIP]), px(lm[P.RIGHT_HIP]));
    const natural = style.natural ?? 1;
    if (workout === 'squat' || workout === 'lunge') {
        // 上身前傾：上身繞著髖部往前轉（人面向畫面右邊，順時針）；每個人本來就有一點前傾
        const lean = ((condition === 'lean' ? (workout === 'lunge' ? LUNGE_LEAN : MAGNITUDE.lean) * amount : 0) + style.lean * natural) * depth;
        rotateAround(lm, UPPER, hip, lean);
    }
    if (workout === 'squat') {
        // 腳跟往上抬（小腿長的比例）：故意墊腳＋這個人本來就會抬的
        const lift = ((condition === 'heel' ? MAGNITUDE.heel * amount : 0) + style.heel * natural) * depth;
        for (const side of ['LEFT', 'RIGHT']) {
            const shank = dist(px(lm[P[side + '_KNEE']]), px(lm[P[side + '_ANKLE']]));
            const i = P[side + '_HEEL'];
            lm[i] = { ...lm[i], y: lm[i].y - lift * shank / H };
        }
    }
    if (workout === 'pushup' || workout === 'plank') {
        // 髖部往下（塌腰）是正、往上（屁股翹）是負：故意做錯＋這個人本來的高低
        const len = dist(px(lm[P.LEFT_SHOULDER]), px(lm[P.LEFT_ANKLE]));
        const wrong = condition === 'sag' ? MAGNITUDE.sag * amount : condition === 'pike' ? -MAGNITUDE.pike * amount : 0;
        const dy = (wrong + style.hip * natural) * len / H;
        for (const i of [P.LEFT_HIP, P.RIGHT_HIP]) lm[i] = { ...lm[i], y: lm[i].y + dy };
        for (const i of [P.LEFT_KNEE, P.RIGHT_KNEE]) lm[i] = { ...lm[i], y: lm[i].y + dy / 2 };
    }
    if (workout === 'lunge') {
        // 前膝往前（小腿長的比例）：故意超過腳尖＋這個人本來就比示範動畫前面的
        const shank = dist(px(lm[P.LEFT_KNEE]), px(lm[P.LEFT_ANKLE]));
        const shift = ((condition === 'knee' ? MAGNITUDE.knee * amount : 0) + style.knee * natural) * depth;
        lm[P.LEFT_KNEE] = { ...lm[P.LEFT_KNEE], x: lm[P.LEFT_KNEE].x + shift * shank / W };
    }
    return lm;
}

// 整個人放大縮小、移位置，再加雜訊
function place(lm, style, gauss) {
    return lm.map(p => ({
        x: +(0.5 + (p.x - 0.5) * style.scale + style.dx + gauss() * style.noise).toFixed(5),
        y: +(0.5 + (p.y - 0.5) * style.scale + style.dy + gauss() * style.noise).toFixed(5),
        z: 0,
        visibility: p.visibility
    }));
}

// 一組：回傳 { name（檔名）, text（錄製檔 JSON）, amounts（每一下的程度，檢查用）, activity（每一格在做什麼，11/8 AI 自動辨識動作的標記） }
// activity：開始前、結束後站著是 'stand'，做動作的那段（包括兩下之間站直休息）是動作的名字；
// 伏地挺身開始前、結束後撐著不動的那段是 null（不是站著、也還沒開始做，不拿來訓練）。只多記一個陣列，亂數不變（之前的資料、模型都一樣）
// subject：代號；workout：squat、pushup、lunge、plank；condition：good 或錯誤代號；seed：亂數
export function syntheticSet(subject, workout, condition, seed = 1) {
    const style = subjectStyle(subject);
    const r = random(seedOf([subject, workout, condition, seed].join('|')));
    const uniform = () => r();
    const gauss = () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform());
    const frames = [], activity = [];
    const good = condition === 'good';
    const amountOf = () => (good ? uniform() * 0.35 : 0.5 + uniform() * 1.1);
    const amounts = [];
    // 本來的樣子每一下是平常的 0.6～1.4 倍（10/20 實測 A 正常蹲的腳跟 5～20%：同一個人每一下也不一樣）
    let natural = 1;
    let doing = null;   // 這一格在做什麼（activity）
    const push = (id, depth, amount) => {
        frames.push(place(pose(id, depth, condition, amount, { ...style, natural }), style, gauss));
        activity.push(doing);
    };
    if (workout === 'plank') {
        // 先站 2 秒（開始錄製後才趴下），撐 30 秒（做對）或 10 秒（故意做錯），起身站 4 秒（起身 3 秒才算結束）
        doing = 'stand';
        for (let i = 0; i < 60; i++) push('squat', 0, 0);
        const seconds = good ? 30 : 10;
        const amount = amountOf();
        amounts.push(amount);
        natural = 0.6 + uniform() * 0.8;
        doing = 'plank';
        for (let i = 0; i < seconds * 30; i++) push('plank', 0, amount);
        doing = 'stand';
        for (let i = 0; i < 120; i++) push('squat', 0, 0);
    } else {
        // 先站 2.5 秒（個人校正要站直不動約 2 秒），每一下：下去、底部停、起來、站直；最後站 2 秒
        const idle = workout === 'pushup' ? null : 'stand';
        doing = idle;
        for (let i = 0; i < 75; i++) push(workout, 0, 0);
        doing = workout;
        const reps = good ? 10 : 5;
        for (let n = 0; n < reps; n++) {
            const amount = amountOf();
            const depth = 0.88 + uniform() * 0.12;
            amounts.push(amount);
            natural = 0.6 + uniform() * 0.8;
            for (let i = 0; i <= style.half; i++) push(workout, depth * i / style.half, amount);
            for (let i = 0; i < style.hold; i++) push(workout, depth, amount);
            for (let i = 0; i <= style.half; i++) push(workout, depth * (1 - i / style.half), amount);
            for (let i = 0; i < style.rest; i++) push(workout, 0, 0);
        }
        // 最後一下做完的休息（style.rest）也還算在做；之後站 2 秒才是結束
        doing = idle;
        for (let i = 0; i < 60; i++) push(workout, 0, 0);
    }
    // 用網站的錄製程式存：每格約 33.3 毫秒、有一點時間抖動（像瀏覽器）
    const recorder = new PoseRecorder();
    recorder.start({ videoWidth: W, videoHeight: H, workout, test: testMeta(subject, condition, workout), synthetic: true,
        description: '合成的實測檔（不是真人）：' + subject + ' ' + workout + ' ' + condition });
    let t = 1000;
    for (const lm of frames) {
        recorder.add(t, lm, null);
        t += 1000 / 30 + (uniform() - 0.5) * 4;
    }
    recorder.stop();
    // 開始錄的時間：seed 越大越晚（同一組錄了好幾次時，實測報表以最後一次為準；測試用小的 seed 做「重錄前的那一次」）
    recorder.meta.startedAt = new Date(Date.UTC(2026, 10, 2, 1, 0) + seed * 60000).toISOString();
    return { name: 'synthetic_' + subject + '_' + workout + '_' + condition + '_' + seed + '.json', text: recorder.toJSON(), amounts, activity };
}

// 撐著不動的一段（11/8，AI 自動辨識動作的訓練資料）：站著（深蹲、弓箭步的起始姿勢）、手撐著的棒式（伏地挺身的起始姿勢）
// 合成的組裡站著的時間太短（開始前 2.5 秒、結束後 2 秒，不到 AI 看的 3 秒），只靠那些分不出「站著」；手撐的棒式也是
// 整個人慢慢前後晃（每個人、每一段不一樣：最多約 2% 的畫面寬），不是完全不動
// 回傳 { name, text（錄製檔 JSON）, activity（每一格都是 label） }；pose：'squat'、'lunge'、'pushup'（depth 0 的姿勢）
export function syntheticHold(subject, pose, label, seconds = 12, seed = 1) {
    const style = subjectStyle(subject);
    const r = random(seedOf([subject, 'hold', pose, label, seed].join('|')));
    const uniform = () => r();
    const gauss = () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform());
    const sway = uniform() * 0.02, period = 2 + uniform() * 3;
    const id = ['squat', 'lunge', 'pushup'].includes(pose) ? pose : 'squat';
    const frames = [];
    for (let i = 0; i < seconds * 30; i++) frames.push(place(demoPose(id, sway * Math.sin(i / 30 / period * 2 * Math.PI)), style, gauss));
    const recorder = new PoseRecorder();
    recorder.start({ videoWidth: W, videoHeight: H, workout: 'free', synthetic: true, description: '合成的錄製檔（不是真人）：' + subject + ' ' + label });
    let t = 1000;
    for (const lm of frames) {
        recorder.add(t, lm, null);
        t += 1000 / 30 + (uniform() - 0.5) * 4;
    }
    recorder.stop();
    return { name: 'synthetic_' + subject + '_hold_' + id + '_' + seed + '.json', text: recorder.toJSON(), activity: frames.map(() => label) };
}
// 示範動畫起始姿勢整個人往旁邊移 dx（畫面寬的比例）
function demoPose(id, dx) {
    return demoLandmarks(id, 0).map(p => ({ ...p, x: p.x + dx }));
}

// 一位受測者四個動作的每一組（做對＋每種錯誤）
export function syntheticSubject(subject, workouts = ['squat', 'pushup', 'lunge', 'plank'], seed = 1) {
    const sets = [];
    workouts.forEach((w, i) => conditionsFor(w).forEach((c, j) => sets.push(syntheticSet(subject, w, c.id, seed * 100 + i * 10 + j))));
    return sets;
}
