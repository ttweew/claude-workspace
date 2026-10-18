// 畫面元件（js/ui/）：大字儀表板左右兩組怎麼放、什麼時候變淡；提示音；示範動畫的姿勢；運算標籤的每秒格數（js/ai/fps.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hud } from '../js/ui/hud.js';
import { POSES, angleAt } from '../js/ui/demo.js';
import { FpsCounter } from '../js/ai/fps.js';
import { LANDMARKS, P } from '../js/skeleton/landmarks.js';

// 測試用的假畫面元素：只做 hud.js 用到的部分
function fakeEl() {
    const classes = new Set();
    return {
        textContent: '', dataset: {}, children: [],
        classList: {
            contains: c => classes.has(c),
            toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))
        },
        querySelector(sel) { return this.querySelectorAll(sel)[0]; },
        querySelectorAll(sel) {
            const cls = sel.replace('.', '');
            const out = [];
            const walk = el => el.children.forEach(ch => { if (ch.cls === cls) out.push(ch); walk(ch); });
            walk(this);
            return out;
        }
    };
}
function el(cls, children = []) {
    const e = fakeEl();
    e.cls = cls;
    e.children = children;
    return e;
}
function makeHud() {
    const side = () => el('hud-side', [0, 1].map(() => el('metric', [el('metric-label'), el('metric-value')])));
    const root = el('hud', [side(), side()]);
    return { hud: new Hud(root), root };
}
// 畫面左邊、右邊那一組顯示的文字，例如 ['左膝 90°', '左髖 100°']
const shown = root => root.querySelectorAll('hud-side').map(box =>
    box.querySelectorAll('metric').map(m => m.querySelector('metric-label').textContent + ' ' + m.querySelector('metric-value').textContent));

// 每個點的可信度：left、right 分別是左、右兩側肩、髖、膝、踝的可信度
function pose(left, right) {
    const points = LANDMARKS.map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 }));
    for (const k of ['SHOULDER', 'HIP', 'KNEE', 'ANKLE']) {
        points[P['LEFT_' + k]].visibility = left;
        points[P['RIGHT_' + k]].visibility = right;
    }
    return points;
}
const ANGLES = { LEFT_KNEE: 90, LEFT_HIP: 100, RIGHT_KNEE: 150, RIGHT_HIP: null };

test('儀表板：前鏡頭（鏡像）時左側那組在畫面左邊；後鏡頭時對調；看不到的顯示「—」', () => {
    const { hud, root } = makeHud();
    hud.setMirrored(true);
    hud.update(pose(0.9, 0.9), ANGLES);
    assert.deepEqual(shown(root), [['左膝 90°', '左髖 100°'], ['右膝 150°', '右髖 —']]);
    hud.setMirrored(false);
    hud.update(pose(0.9, 0.9), ANGLES);
    assert.deepEqual(shown(root), [['右膝 150°', '右髖 —'], ['左膝 90°', '左髖 100°']]);
});

test('儀表板：四個角度都算不出來（或沒有人）時整個收起來', () => {
    const { hud, root } = makeHud();
    hud.update(pose(0.9, 0.9), { LEFT_KNEE: null, LEFT_HIP: null, RIGHT_KNEE: null, RIGHT_HIP: null });
    assert.equal(root.classList.contains('empty'), true);
    hud.update(pose(0.9, 0.9), ANGLES);
    assert.equal(root.classList.contains('empty'), false);
    hud.update(null);
    assert.equal(root.classList.contains('empty'), true);
});

test('儀表板：側面拍時看得比較不清楚的那一側變淡；差距在門檻附近不會一直閃', () => {
    const { hud, root } = makeHud();
    hud.setMirrored(true);
    const dim = () => root.querySelectorAll('hud-side').map(b => b.classList.contains('dim'));
    hud.update(pose(0.9, 0.9), ANGLES);
    assert.deepEqual(dim(), [false, false]);         // 正面：兩側差不多，都不變淡
    hud.update(pose(0.95, 0.6), ANGLES);              // 右側每點少 0.35，加總少 1.4：右側變淡
    assert.deepEqual(dim(), [false, true]);
    hud.update(pose(0.9, 0.82), ANGLES);              // 差 0.32：在兩個門檻之間，維持原狀
    assert.deepEqual(dim(), [false, true]);
    hud.update(pose(0.9, 0.86), ANGLES);              // 差 0.16：恢復
    assert.deepEqual(dim(), [false, false]);
    hud.update(pose(0.5, 0.95), ANGLES);              // 換成左側看不清楚
    assert.deepEqual(dim(), [true, false]);
});

// ---------- 提示音（js/ui/sound.js）：什麼時候響、響哪一種 ----------
import { FramingSound } from '../js/ui/sound.js';

function makeSound() {
    const played = [];
    const s = new FramingSound(name => played.push(name));
    // 模擬每 100 毫秒一格，從 from 到 to（毫秒）都是同一個狀況
    const run = (category, text, from, to) => { for (let t = from; t <= to; t += 100) s.update(category, text, t); };
    return { s, played, run };
}

test('提示音：還沒走進畫面不響；站好了「叮」一次，一直站好不會再響', () => {
    const { played, run } = makeSound();
    run('away', '未偵測到人體', 0, 5000);
    assert.deepEqual(played, []);
    run('ok', '已偵測到全身', 5100, 9000);
    assert.deepEqual(played, ['ok']);
});

test('提示音：離開畫面 1 秒後「逼逼逼」，沒回來每 5 秒再提醒，最多 3 次', () => {
    const { played, run } = makeSound();
    run('ok', '已偵測到全身', 0, 1000);
    played.length = 0;
    run('away', '未偵測到人體', 1100, 2000);
    assert.deepEqual(played, []);                       // 還不到 1 秒
    run('away', '未偵測到人體', 2100, 30000);
    assert.deepEqual(played, ['away', 'away', 'away']); // 1 秒、6 秒、11 秒，之後不再響
    run('ok', '已偵測到全身', 30100, 31000);
    assert.deepEqual(played.at(-1), 'ok');              // 回來站好：叮
});

test('提示音：站位不對「逼逼」；換成別的提示再響，但兩次至少隔 2 秒；腳被擋住不響', () => {
    const { played, run } = makeSound();
    run('ok', '已偵測到全身', 0, 1000);
    played.length = 0;
    run('wrong', '太近了，請往後退', 1100, 2000);
    assert.deepEqual(played, ['wrong']);
    run('wrong', '看不到腳，請再往後退一點', 2100, 2500);  // 換提示，但離上一次不到 2 秒
    assert.deepEqual(played, ['wrong']);
    run('wrong', '請站到畫面中間一點', 3200, 4000);       // 換提示，已經隔 2 秒以上
    assert.deepEqual(played, ['wrong', 'wrong']);
    run('ok', '已偵測到全身', 4100, 5000);
    run(null, '看不到腳，可能被擋住了', 5100, 6000);       // 蹲低時腳被擋住：不算狀況改變
    run('ok', '已偵測到全身', 6100, 7000);
    assert.deepEqual(played, ['wrong', 'wrong', 'ok']);   // 只有回到「站好了」那一次叮
});

test('每秒格數：滿一秒才更新；鏡頭兩次叫醒之間送來 2 格時算 2 格', () => {
    const ai = new FpsCounter(), camera = new FpsCounter();
    ai.reset(); camera.reset();
    ai.start = camera.start = 0;
    let changed = false;
    // AI 每 40 毫秒算一格（每秒 25 格）；鏡頭每秒 60 格，但程式每 33 毫秒才被叫醒一次，每次看到 2 格
    for (let t = 40; t <= 1000; t += 40) changed = ai.tick(t);
    for (let t = 33; t <= 1023; t += 33) camera.tick(t, 2);
    assert.equal(changed, true);
    assert.equal(ai.value, 25);
    assert.ok(Math.abs(camera.value - 60) <= 1, String(camera.value));
});

test('示範動畫：最低點的角度符合重點字（深蹲 < 90°、伏地挺身和弓箭步約 90°），起始姿勢接近伸直', () => {
    const angle = (id, d) => { const p = POSES[id](d); return angleAt(p.angle.from, p.angle.at, p.angle.to); };
    assert.ok(angle('squat', 1) < 90, String(angle('squat', 1)));
    assert.ok(Math.abs(angle('pushup', 1) - 90) <= 5, String(angle('pushup', 1)));
    assert.ok(Math.abs(angle('lunge', 1) - 90) <= 5, String(angle('lunge', 1)));
    for (const id of ['squat', 'pushup', 'lunge']) assert.ok(angle(id, 0) > 150, id + ' ' + angle(id, 0));
});

test('示範動畫：動的時候骨頭長度不變，腳和手不會穿過地面', () => {
    for (const id of Object.keys(POSES)) {
        const lengths = d => POSES[id](d).lines.map(line => line.slice(1).map((p, i) => Math.hypot(p[0] - line[i][0], p[1] - line[i][1])));
        const first = lengths(0);
        for (const d of [0.25, 0.5, 0.75, 1]) {
            lengths(d).forEach((line, i) => line.forEach((len, j) => assert.ok(Math.abs(len - first[i][j]) < 0.5, `${id} 第 ${i} 條第 ${j} 節 ${len} ≠ ${first[i][j]}`)));
            for (const p of POSES[id](d).joints) assert.ok(p[1] <= 162, `${id} 關節 ${p} 在地面下`);
        }
    }
});
