import sys
from common import *
root, port = sys.argv[1], int(sys.argv[2])
serve(root, port)
def st(pg): return pg.inner_text("#poseStatus") + " | " + pg.inner_text("#perfBtn")
with sync_playwright() as p:
    b=launch(p)
    # A：GPU 失效兩次（間隔 > 5 秒），第二次 GPU 也建不起來 → 改用 CPU
    pg,errs,logs=page(b,port)
    pg.click("#startBtn"); pg.wait_for_timeout(2000)
    pg.evaluate("window.__gls.forEach(g => g.getExtension('WEBGL_lose_context')?.loseContext())")
    pg.wait_for_function("document.getElementById('poseStatus').textContent.includes('全身')", timeout=20000)
    print("A1 recovered:", st(pg))
    pg.wait_for_timeout(6000)
    pg.evaluate("""window.__gls.forEach(g => g.getExtension('WEBGL_lose_context')?.loseContext());
      const o = OffscreenCanvas.prototype.getContext; OffscreenCanvas.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a); }; 0""")
    for i in range(8):
        pg.wait_for_timeout(1000); print("  A2 t+%d" % (i+1), st(pg))
    print("  logs:", [l for l in logs if 'warn' in l[:5] or 'error' in l[:6]][-4:])
    pg.click("#perfBtn")
    print("A2 recovered on CPU:", st(pg), "| page errors:", errs)
    pg.close()
    # B：連續出錯（模擬）→ 自動重新啟動；5 秒內再壞 → 顯示請重新整理
    pg,errs,logs=page(b,port,gpu=False)
    pg.click("#startBtn"); pg.wait_for_timeout(2000)
    pg.evaluate("window.__n = 15; const c = CanvasRenderingContext2D.prototype.clearRect; CanvasRenderingContext2D.prototype.clearRect = function (...a) { if (window.__n-- > 0) throw new Error('模擬錯誤'); return c.apply(this, a); }; 0")
    pg.wait_for_timeout(3000)
    print("B1:", st(pg), "| console errors printed:", len([l for l in logs if 'error' in l[:6] and '模擬' in l]))
    pg.evaluate("window.__n = 1e9")
    pg.wait_for_timeout(3000)
    print("B2 (keeps failing):", st(pg), "| console errors printed:", len([l for l in logs if 'error' in l[:6] and '模擬' in l]))
    pg.click("#stopBtn"); pg.evaluate("window.__n = 0"); pg.click("#startBtn"); pg.wait_for_timeout(1500)
    print("B3 reopen camera:", st(pg))
    b.close()
