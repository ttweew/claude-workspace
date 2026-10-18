// 數字的每一次變化都要說得通（10/18 地基審查）：用固定 seed 的亂數產生很多種情況，檢查一定要成立的規則
//   次數：一格最多加 1、不會變少、做幾下就算幾下（每秒 15～60 格、時間不平均、偶爾漏掉幾格都一樣）
//   棒式秒數：不會比真的撐住的時間多、也不會少太多
//   相似度、運動總結、驗證統計、光線、自動調每秒格數、個人校正：範圍和前後關係都對
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoLandmarks, random } from './helpers.mjs';
import { P } from '../js/skeleton/landmarks.js';
import { PosePipeline } from '../js/skeleton/pipeline.js';
import { WORKOUTS, formatSeconds } from '../js/analysis/workouts.js';
import { WorkoutTracker } from '../js/analysis/tracker.js';
import { TEMPLATES, repSimilarity, resample } from '../js/analysis/similarity.js';
import { summarize, describe, validSession } from '../js/analysis/session.js';
import { stats } from '../js/analysis/validate.js';
import { LightMeter, LIGHT } from '../js/analysis/light.js';
import { AutoFps, AUTO_FPS, ADVICE } from '../js/ai/advisor.js';
import { personalThresholds } from '../js/analysis/calibrate.js';
import { FORM_RULES } from '../js/analysis/form.js';

const W = 640, H = 480;

// 一段動作：每一下往下、停、往上的秒數和深度都隨機；每秒 15～60 格，每格的時間差 ±20%；偶爾一段畫面整個沒進來（最多 0.4 秒）
function session(id, rnd, reps) {
    const fps = 15 + rnd() * 45;
    const frames = [];
    let t = 0;
    const push = depth => {
        t += 1000 / fps * (0.8 + 0.4 * rnd());
        if (rnd() < 0.01) t += rnd() * 400;
        frames.push({ t, depth });
    };
    const hold = (depth, sec) => { for (let k = 0, n = Math.ceil(sec * fps); k < n; k++) push(depth); };
    const move = (from, to, sec) => { const n = Math.max(2, Math.ceil(sec * fps)); for (let k = 1; k <= n; k++) push(from + (to - from) * k / n); };
    hold(0, 1 + rnd());
    for (const d of reps) {
        move(0, d, 0.6 + rnd() * 1.4);
        hold(d, rnd());
        move(d, 0, 0.6 + rnd() * 1.4);
        hold(0, 0.6 + rnd());
    }
    return frames;
}

for (const id of ['squat', 'pushup', 'lunge']) {
    test(`${id}：隨機的速度、每秒格數、漏格，做幾下就算幾下，一格最多加 1`, () => {
        const ruleIds = new Set(FORM_RULES[id].map(r => r.id));
        for (let seed = 1; seed <= 25; seed++) {
            const rnd = random(seed * 7919);
            const reps = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => 0.75 + rnd() * 0.25);
            const pipeline = new PosePipeline();
            const tracker = new WorkoutTracker(id);
            let last = 0;
            for (const f of session(id, rnd, reps)) {
                const pose = pipeline.process(demoLandmarks(id, f.depth), f.t, W, H);
                const out = tracker.update(pose, f.t);
                const n = out.count.reps;
                assert.ok(n === last || n === last + 1, `seed ${seed}：一格從 ${last} 跳到 ${n}`);
                last = n;
            }
            const items = tracker.items;
            assert.equal(items.length, reps.length, `seed ${seed}：做 ${reps.length} 下，算到 ${items.length} 下`);
            items.forEach((r, k) => {
                assert.equal(r.n, k + 1);
                assert.ok(r.start < r.bottom + 1e-9 && r.bottom <= r.end && r.end - r.start >= 0.5, `seed ${seed} 第 ${r.n} 下的時間 ${r.start}～${r.bottom}～${r.end}`);
                assert.ok(r.similarity === null || (Number.isInteger(r.similarity) && r.similarity >= 0 && r.similarity <= 100), '相似度 ' + r.similarity);
                assert.ok(r.errors.every(e => ruleIds.has(e)), '錯誤代號 ' + r.errors);
                assert.equal(r.depth, r.min <= WORKOUTS[id].create().config.good ? 'good' : r.min <= WORKOUTS[id].create().config.close ? 'close' : 'shallow');
            });
            const s = summarize(id, items, 0, 60000);
            assert.ok(validSession(s), JSON.stringify(s));
            assert.ok(s.best <= s.average && s.good + s.close + s.shallow === s.count && s.clean <= s.count);
            for (const line of describe(s)) assert.ok(!/NaN|undefined|Infinity/.test(line), line);
        }
    });
}

test('棒式：撐住的秒數不會比真的撐住的時間多，也不會少超過 0.5 秒；畫面上的秒數只會往上加', () => {
    for (let seed = 1; seed <= 25; seed++) {
        const rnd = random(seed * 104729);
        const fps = 15 + rnd() * 45;
        const flat = demoLandmarks('plank', 0);
        const piked = flat.map((p, i) => (i === P.LEFT_HIP || i === P.RIGHT_HIP ? { ...p, y: p.y - 0.08 } : p));
        const up = flat.map(p => ({ ...p, x: 0.5 + (p.y - 0.5) * 0.75, y: 0.5 - (p.x - 0.5) * 1.333 }));
        const pipeline = new PosePipeline();
        const tracker = new WorkoutTracker('plank');
        let t = 0, good = 0, lastShown = 0;
        const run = (lm, sec, isGood) => {
            const n = Math.ceil(sec * fps);
            for (let k = 0; k < n; k++) {
                const dt = 1000 / fps * (0.8 + 0.4 * rnd());
                t += dt;
                const out = tracker.update(pipeline.process(lm, t, W, H), t);
                if (isGood && k > 0) good += dt;
                const shown = out.count.seconds;
                if (out.count.hold) lastShown = 0;
                else {
                    assert.ok(shown >= lastShown - 1e-9, `seed ${seed}：秒數從 ${lastShown} 變成 ${shown}`);
                    lastShown = shown;
                }
            }
        };
        run(flat, 6 + rnd() * 6, true);
        run(piked, 0.3 + rnd() * 2.5, false);   // 屁股翹起來：暫停
        run(flat, 4 + rnd() * 6, true);
        run(up, 5, false);                       // 起身超過 3 秒：結束
        const holds = tracker.items;
        assert.equal(holds.length, 1, `seed ${seed}：${holds.length} 次`);
        const sec = holds[0].seconds;
        // 從趴好到骨架算出趴好，平滑要幾格；暫停的那段不算
        assert.ok(sec <= good / 1000 + 0.1 && sec >= good / 1000 - 0.5, `seed ${seed}：算 ${sec.toFixed(2)} 秒，真的撐 ${(good / 1000).toFixed(2)} 秒`);
        const s = summarize('plank', holds, 0, 1);
        assert.equal(s.best, Math.floor(sec));
        assert.equal(formatSeconds(sec), formatSeconds(s.best), '總結和畫面上的秒數一樣');
    }
});

test('相似度：快慢不同（0.5～2 倍）也接近滿分；蹲越淺分數越低', () => {
    const rnd = random(42);
    const tpl = TEMPLATES.squat;
    for (let k = 0; k < 40; k++) {
        const scale = 0.5 + rnd() * 1.5;
        const samples = tpl.map((v, i) => ({ t: i * 60 * scale, v: v + (rnd() - 0.5) * 2 }));
        const s = repSimilarity('squat', samples);
        assert.ok(s >= 90, `快慢 ${scale.toFixed(2)} 倍：${s}`);
    }
    // 把曲線的最低點換成不同的角度（等比例縮放深度）
    const top = tpl[0], low = Math.min(...tpl);
    const scores = [85, 100, 110, 125, 140].map(min => repSimilarity('squat', tpl.map((v, i) => ({ t: i * 100, v: top - (top - v) * (top - min) / (top - low) }))));
    for (let i = 1; i < scores.length; i++) assert.ok(scores[i] < scores[i - 1], '分數要越來越低：' + scores);
    assert.ok(scores.every(s => Number.isInteger(s) && s >= 0 && s <= 100));
    assert.equal(repSimilarity('plank', [{ t: 0, v: 1 }]), null);
    assert.equal(repSimilarity('squat', [{ t: 0, v: 170 }, { t: 1, v: 160 }]), null, '點太少不算');
    assert.equal(resample([{ t: 0, v: 1 }, { t: 0, v: 3 }]).every(Number.isFinite), true, '時間一樣也不會出現 NaN');
});

test('驗證統計：和直接照定義算的結果一樣', () => {
    const rnd = random(7);
    for (let k = 0; k < 50; k++) {
        const n = 1 + Math.floor(rnd() * 12);
        const list = Array.from({ length: n }, () => {
            // 量角器的角度要在 0～180° 以內才算（validate.js）：網站角度 20～160°、量角器差 ±12° 以內
            const site = Math.round((20 + rnd() * 140) * 10) / 10;
            return { joint: 'LEFT_KNEE', angles: { LEFT_KNEE: site }, measured: Math.round(site + (rnd() - 0.5) * 24) };
        });
        const d = list.map(s => s.angles.LEFT_KNEE - s.measured);
        const mean = d.reduce((a, b) => a + b, 0) / n;
        const r = stats(list);
        const r1 = x => Math.round(x * 10) / 10;
        assert.equal(r.n, n);
        assert.equal(r.bias, r1(mean));
        assert.equal(r.mae, r1(d.reduce((a, b) => a + Math.abs(b), 0) / n));
        assert.equal(r.max, r1(Math.max(...d.map(Math.abs))));
        assert.equal(r.sd, n > 1 ? r1(Math.sqrt(d.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1))) : 0);
        assert.equal(r.within5, Math.round(d.filter(x => Math.abs(x) <= 5).length / n * 100));
        assert.ok(r.mae <= r.max && Math.abs(r.bias) <= r.mae + 0.1);
    }
});

test('光線：連續 3 秒太暗才提醒，亮到 60 以上才收起來', () => {
    const rnd = random(99);
    for (let k = 0; k < 30; k++) {
        const m = new LightMeter();
        let darkRun = 0, dark = false;
        for (let s = 0; s < 60; s++) {
            const luma = rnd() * 120;
            const got = m.update(luma);
            // 自己照規則算一次
            if (dark) { if (luma >= LIGHT.okAbove) { dark = false; darkRun = 0; } }
            else if (luma < LIGHT.darkBelow) { darkRun++; if (darkRun >= LIGHT.darkSeconds) dark = true; }
            else darkRun = 0;
            assert.equal(got, dark, `第 ${s} 秒，亮度 ${luma.toFixed(0)}`);
        }
    }
});

test('自動調每秒格數：60 秒都有餘裕才升、10 秒有 8 秒跟不上才降、降過 2 次不再升', () => {
    const rnd = random(2024);
    for (let k = 0; k < 40; k++) {
        const auto = new AutoFps();
        let rate = 30, downs = 0, roomyRun = 0;
        const recent = [];
        for (let s = 0; s < 400; s++) {
            const roomyNow = rnd() < 0.9;
            const sample = rate > 30
                ? (roomyNow ? { aiFps: 58, cameraFps: 60, msPerFrame: 8 } : { aiFps: 30, cameraFps: 60, msPerFrame: 30 })
                : (roomyNow ? { aiFps: 30, cameraFps: 30, msPerFrame: 8 } : { aiFps: 30, cameraFps: 30, msPerFrame: 12 });
            const next = auto.second(sample, rate, 60);
            recent.push(sample);
            if (next === 60) {
                assert.equal(rate, 30);
                assert.ok(downs < AUTO_FPS.maxDowns, '降過 2 次不能再升');
                assert.ok(roomyRun + 1 >= AUTO_FPS.upGood, `只有連續 ${roomyRun + 1} 秒有餘裕就升了`);
            }
            if (next === 30) {
                assert.ok(rate > 30);
                const last = recent.slice(-AUTO_FPS.window);
                const behind = last.filter(x => x.aiFps < x.cameraFps * ADVICE.keepUp).length;
                assert.ok(behind >= AUTO_FPS.downBad, `10 秒只有 ${behind} 秒跟不上就降了`);
                downs++;
            }
            const roomySample = sample.aiFps >= sample.cameraFps * ADVICE.keepUp && sample.msPerFrame < 1000 / 60 * ADVICE.headroom;
            roomyRun = rate === 30 && roomySample ? roomyRun + 1 : 0;
            if (next) { rate = next; recent.length = 0; roomyRun = 0; }
        }
    }
});

test('個人校正的門檻：站直門檻在 145° 到預設之間；「有彎下去」至少比站直低 15°', () => {
    const rnd = random(5);
    for (const config of [{ up: 160, down: 140 }, { up: 150, down: 130 }]) {
        for (let k = 0; k < 200; k++) {
            const knee = 120 + rnd() * 60;
            const { up, down } = personalThresholds(config, { knee, tilt: 0 });
            assert.ok(up >= 145 && up <= config.up, `站直 ${knee.toFixed(1)}° → 門檻 ${up}`);
            assert.ok(down <= config.down && down <= up - 15, `門檻 ${up}、${down}`);
            if (knee - 10 >= config.up) assert.equal(up, config.up, '站得很直就不改');
        }
    }
});
