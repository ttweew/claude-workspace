import sys
from common import *
root, port, case = sys.argv[1], int(sys.argv[2]), sys.argv[3]
serve(root, port)
def st(pg): return pg.inner_text("#poseStatus") + " | " + pg.inner_text("#perfBtn")
with sync_playwright() as p:
    b=launch(p)
    if case == 'A':
        pg,errs,logs=page(b,port)
        pg.click("#startBtn"); pg.wait_for_timeout(2000)
        pg.evaluate("""const o = OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); };
          window.__gls.forEach(g => g.getExtension('WEBGL_lose_context')?.loseContext()); 0""")
        for i in range(10):
            pg.wait_for_timeout(1000); print("  A t+%d" % (i+1), st(pg))
        print("  logs:", [l for l in logs if 'warn' in l[:5] or 'error' in l[:6]])
    else:
        pg,errs,logs=page(b,port,gpu=False)
        pg.click("#startBtn"); pg.wait_for_timeout(2000)
        pg.evaluate("window.__n = 15; const c = CanvasRenderingContext2D.prototype.moveTo; CanvasRenderingContext2D.prototype.moveTo = function (...a) { if (window.__n-- > 0) throw new Error('模擬錯誤'); return c.apply(this, a); }; 0")
        pg.wait_for_timeout(3000)
        print("B1 (15 errors):", st(pg))
        pg.evaluate("window.__n = 1e9")
        pg.wait_for_timeout(3000)
        print("B2 (keeps failing):", st(pg))
        pg.click("#stopBtn"); pg.evaluate("window.__n = 0"); pg.wait_for_timeout(5500); pg.click("#startBtn"); pg.wait_for_timeout(2000)
        print("B3 reopen camera:", st(pg))
        print("  logs:", [l[:80] for l in logs if 'warn' in l[:5] or 'error' in l[:6]])
    print("page errors:", errs)
    b.close()
