// 簡單的折線圖（畫在 canvas 上），給重播工具畫角度曲線用；不需要另外下載圖表套件

const FONT = 'system-ui, -apple-system, "Segoe UI", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
const PAD = { left: 44, right: 12, top: 18, bottom: 26 };
const BAND_H = 8;  // 最上面的拍攝方向色條

// 畫布要畫成實際像素大小（手機螢幕一個點有 2～3 個像素），線才不會糊
function fit(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
}

// 時間（秒）↔ 畫布上的 x
export function timeToX(canvas, t, tMax) {
    return PAD.left + (t / tMax) * (canvas.clientWidth - PAD.left - PAD.right);
}
export function xToTime(canvas, x, tMax) {
    const t = (x - PAD.left) / (canvas.clientWidth - PAD.left - PAD.right) * tMax;
    return Math.max(0, Math.min(tMax, t));
}

// opts：
//   times：每一格的時間（秒）
//   series：[{ values（和 times 一樣長，沒有值的格子是 null）, color, width, dash, alpha }]
//   bands：[{ from, to, color }] 最上面的色條（拍攝方向）
//   markers：[{ t, label }] 垂直標記線（例如每一下深蹲的最低點）
//   cursor：目前選到的時間（秒），畫一條垂直線
//   yMin、yMax、yStep：縱軸範圍與格線間距
export function drawChart(canvas, opts) {
    const { ctx, w, h } = fit(canvas);
    const { times, series, bands = [], markers = [], cursor = null, yMin = 0, yMax = 200, yStep = 30 } = opts;
    const tMax = times.length ? Math.max(times[times.length - 1], 0.001) : 1;
    const plotTop = PAD.top + BAND_H + 4, plotBottom = h - PAD.bottom;
    const X = t => timeToX(canvas, t, tMax);
    const Y = v => plotBottom - (v - yMin) / (yMax - yMin) * (plotBottom - plotTop);

    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px ' + FONT;
    ctx.textBaseline = 'middle';

    // 橫格線與角度刻度
    for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
        ctx.strokeStyle = v === 180 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(PAD.left, Y(v));
        ctx.lineTo(w - PAD.right, Y(v));
        ctx.stroke();
        ctx.fillStyle = '#9DABBE';
        ctx.textAlign = 'right';
        ctx.fillText(v + '°', PAD.left - 6, Y(v));
    }
    // 時間刻度：依長度挑間距，大約 6～10 個
    const step = [1, 2, 5, 10, 15, 30, 60, 120].find(s => tMax / s <= 10) || 300;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let t = 0; t <= tMax + 1e-9; t += step) {
        ctx.fillStyle = '#9DABBE';
        ctx.fillText(t + ' 秒', X(t), plotBottom + 6);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(X(t), plotTop);
        ctx.lineTo(X(t), plotBottom);
        ctx.stroke();
    }

    // 拍攝方向色條
    for (const b of bands) {
        ctx.fillStyle = b.color;
        ctx.fillRect(X(b.from), PAD.top, Math.max(1, X(b.to) - X(b.from)), BAND_H);
    }

    // 標記線
    ctx.textBaseline = 'bottom';
    for (const m of markers) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(X(m.t), plotTop);
        ctx.lineTo(X(m.t), plotBottom);
        ctx.stroke();
        ctx.setLineDash([]);
        if (m.label) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(m.label, X(m.t), plotTop + 12);
        }
    }

    // 折線：沒有值的格子斷開，不會把前後連起來（看得出中間沒偵測到）
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD.left, plotTop, w - PAD.left - PAD.right, plotBottom - plotTop);
    ctx.clip();
    for (const s of series) {
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = s.alpha || 1;
        ctx.lineWidth = s.width || 2;
        ctx.lineJoin = 'round';
        ctx.setLineDash(s.dash || []);
        ctx.beginPath();
        let drawing = false;
        s.values.forEach((v, i) => {
            if (v === null || v === undefined) {
                drawing = false;
                return;
            }
            const x = X(times[i]), y = Y(v);
            if (drawing) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
            drawing = true;
        });
        ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // 目前選到的時間
    if (cursor !== null) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(X(cursor), PAD.top);
        ctx.lineTo(X(cursor), plotBottom);
        ctx.stroke();
    }
}
