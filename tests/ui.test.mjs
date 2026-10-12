// 畫面元件（js/ui/）：大字儀表板左右兩組怎麼放、什麼時候變淡
import test from 'node:test';
import assert from 'node:assert/strict';
import { Hud } from '../js/ui/hud.js';
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
