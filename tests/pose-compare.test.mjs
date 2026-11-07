// 你這一下 vs 標準動作（11/12）：你的骨架照示範動畫的大小、方向擺（js/ui/pose-compare.js 的 userFigure）
// 測試用的骨架就是示範動畫的火柴人放進 640×480 的畫面（tests/helpers.mjs），擺回去要和示範動畫一模一樣
import test from 'node:test';
import assert from 'node:assert/strict';
import { userFigure, standardFigure, COMPARED } from '../js/ui/pose-compare.js';
import { POSES } from '../js/ui/demo.js';
import { P } from '../js/skeleton/landmarks.js';
import { demoLandmarks } from './helpers.mjs';

const close = (a, b, name) => {
    assert.equal(a.length, b.length, name);
    a.forEach((p, i) => assert.ok(Math.abs(p[0] - b[i][0]) < 1e-6 && Math.abs(p[1] - b[i][1]) < 1e-6, name + ' 第 ' + i + ' 點 ' + p + ' / ' + b[i]));
};

test('示範動畫的火柴人放進畫面再擺回來：大小、位置和示範動畫一模一樣（深蹲、伏地挺身、弓箭步）', () => {
    assert.deepEqual(COMPARED, ['squat', 'lunge', 'pushup']);
    for (const id of COMPARED) {
        const fig = userFigure(id, demoLandmarks(id, 1), 640, 480, 1);
        const std = POSES[id](1);
        if (id === 'lunge') {
            // 前腳（肩 → 髖 → 膝 → 腳踝 → 腳尖）、手、後腳（髖 → 膝 → 腳踝 → 腳尖）
            close(fig.lines[0], std.lines[0], id + ' 前腳');
            close(fig.lines[1], std.lines[2], id + ' 手');
            close(fig.lines[2], std.lines[1], id + ' 後腳');
        } else if (id === 'squat') {
            close(fig.lines[0], std.lines[0], id + ' 身體和腳');
            close(fig.lines[1], std.lines[1], id + ' 手');
        } else {
            // 伏地挺身：示範動畫從腳尖畫到肩膀，這裡從肩膀畫到腳尖
            close(fig.lines[0], [...std.lines[0]].reverse(), id + ' 身體');
            close(fig.lines[1], std.lines[1], id + ' 手');
        }
        assert.ok(fig.head, id + ' 頭');
        assert.deepEqual(standardFigure(id), std);
    }
});

test('面向左邊（畫面左右相反）：翻過來和面向右邊的一樣；棒式、點不夠、看不到、被改壞的不畫', () => {
    for (const id of COMPARED) {
        const right = userFigure(id, demoLandmarks(id, 1), 640, 480, 1);
        const mirrored = demoLandmarks(id, 1).map(p => ({ ...p, x: 1 - p.x }));
        const left = userFigure(id, mirrored, 640, 480, -1);
        right.lines.forEach((line, i) => close(left.lines[i], line, id + ' 翻過來'));
    }
    // 畫面不是正方形：照像素算（比例座標直接用的話，1280×720 的人會被壓扁）
    const wide = demoLandmarks('squat', 1).map(p => ({ ...p, x: 0.5 + (p.x - 0.5) * 640 / 1280, y: 0.5 + (p.y - 0.5) * 480 / 720 }));
    close(userFigure('squat', wide, 1280, 720, 1).lines[0], POSES.squat(1).lines[0], '1280×720');
    assert.equal(userFigure('plank', demoLandmarks('plank', 1), 640, 480, 1), null);
    assert.equal(standardFigure('plank'), null);
    assert.equal(standardFigure('constructor'), null);
    const hidden = demoLandmarks('squat', 1);
    for (const side of ['LEFT', 'RIGHT']) hidden[P[side + '_HIP']] = { ...hidden[P[side + '_HIP']], visibility: 0.1 };
    assert.equal(userFigure('squat', hidden, 640, 480, 1), null, '看不到髖部');
    for (const bad of [null, [], demoLandmarks('squat', 1).slice(0, 20), 'x']) assert.equal(userFigure('squat', bad, 640, 480, 1), null);
    assert.equal(userFigure('squat', demoLandmarks('squat', 1), 0, 480, 1), null);
    assert.equal(userFigure('constructor', demoLandmarks('squat', 1), 640, 480, 1), null);
    const broken = demoLandmarks('squat', 1);
    broken[P.LEFT_KNEE] = { x: NaN, y: 0.5, visibility: 1 };
    broken[P.RIGHT_KNEE] = { x: 'x', y: 0.5, visibility: 1 };
    assert.equal(userFigure('squat', broken, 640, 480, 1), null, '膝蓋被改壞');
});
