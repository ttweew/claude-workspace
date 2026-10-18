import sys, time
from common import *
root, port = sys.argv[1], int(sys.argv[2])
serve(root, port)
with sync_playwright() as p:
    b=launch(p)
    pg,errs,logs=page(b,port)
    pg.click("#startBtn"); pg.wait_for_timeout(3000)
    w0=pg.evaluate("window.__wakes"); pg.wait_for_timeout(5000); w1=pg.evaluate("window.__wakes")
    print("FPS label:", pg.inner_text("#perfBtn"), "| wakes/s:", (w1-w0)/5)
    print("status before:", pg.inner_text("#poseStatus"), "| gls:", pg.evaluate("window.__gls.length"))
    pg.evaluate("window.__gls.forEach(g => { const e = g.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); })")
    for i in range(6):
        pg.wait_for_timeout(1000)
        print(f"t+{i+1}s status:", pg.inner_text("#poseStatus"), "| banner:", pg.evaluate("document.getElementById('banner').hidden ? '' : document.getElementById('banner').textContent"), "| perf:", pg.inner_text("#perfBtn"))
    n=len([l for l in logs if l.startswith("error")])
    print("console errors:", n, "| sample:", [l for l in logs if l.startswith('error')][:2])
    print("page errors:", errs[:3])
    pg.screenshot(path=f"lost_{port}.png")
    b.close()
