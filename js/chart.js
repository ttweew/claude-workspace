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

// 畫圖很花時間（5 分鐘的錄製有將近 9000 格），所以：
//   1. 曲線、格線、色條（底圖）畫好一次就存起來，選時間時只重畫游標線
//   2. 格子比畫布像素多很多時，每一個像素寬只畫這段時間的最大、最小值，尖峰不會不見
// opts.key：底圖的內容代號（資料或顯示的關節改變時換一個），一樣就沿用存起來的底圖
//
// opts：
//   times：每一格的時間（秒）
//   series：[{ values（和 times 一樣長，沒有值的格子是 null）, color, width, dash, alpha }]
//   bands：[{ from, to, color }] 最上面的色條（拍攝方向）
//   markers：[{ t, label }] 垂直標記線（例如每一下深蹲的最低點）
//   cursor：目前選到的時間（秒），畫一條垂直線
//   yMin、yMax、yStep：縱軸範圍與格線間距
export function drawChart(canvas, opts) {
    // 圖表沒有顯示出來（大小是 0）時不畫：0 大小的畫布複製到畫面上會出錯
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    const { ctx, w, h } = fit(canvas);
    const { times, cursor = null } = opts;
    const tMax = times.length ? Math.max(times[times.length - 1], 0.001) : 1;
    const dpr = window.devicePixelRatio || 1;
    const key = opts.key + '|' + canvas.width + 'x' + canvas.height;
    if (!canvas._base || canvas._baseKey !== key) {
        canvas._base = canvas._base || document.createElement('canvas');
        canvas._base.width = canvas.width;
        canvas._base.height = canvas.height;
        const bctx = canvas._base.getContext('2d');
        bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawBase(canvas, bctx, w, h, tMax, opts);
        canvas._baseKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(canvas._base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 目前選到的時間
    if (cursor !== null) {
        const x = timeToX(canvas, cursor, tMax);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, PAD.top);
        ctx.lineTo(x, h - PAD.bottom);
        ctx.stroke();
    }
}

function drawBase(canvas, ctx, w, h, tMax, opts) {
    const { times, series, bands = [], markers = [], yMin = 0, yMax = 200, yStep = 30 } = opts;
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
        const dense = times.length > (w - PAD.left - PAD.right) * 2;
        let drawing = false;
        if (!dense) {
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
        } else {
            // 每一個像素寬：連到這段時間的最大值、最小值；中間沒有值就斷開
            let col = null, lo = 0, hi = 0, gap = false;
            const flush = () => {
                if (col === null) return;
                if (drawing && !gap) ctx.lineTo(col + 0.5, Y(hi));
                else ctx.moveTo(col + 0.5, Y(hi));
                ctx.lineTo(col + 0.5, Y(lo));
                drawing = true;
                gap = false;
            };
            s.values.forEach((v, i) => {
                if (v === null || v === undefined) {
                    if (col !== null) flush();
                    col = null;
                    gap = true;
                    return;
                }
                const c = Math.floor(X(times[i]));
                if (c !== col) {
                    flush();
                    col = c;
                    lo = hi = v;
                } else {
                    lo = Math.min(lo, v);
                    hi = Math.max(hi, v);
                }
            });
            flush();
        }
        ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
}
