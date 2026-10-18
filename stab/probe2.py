import sys
from common import *
root, port = sys.argv[1], int(sys.argv[2])
serve(root, port)
with sync_playwright() as p:
    b=launch(p)
    pg,errs,logs=page(b,port)
    fails=[]; pg.on("requestfailed", lambda r: fails.append(r.url[:100]))
    pg.click("#startBtn"); pg.wait_for_timeout(2000)
    pg.evaluate("window.__gls.forEach(g => { const e = g.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); })")
    pg.wait_for_timeout(3000)
    print(fails, pg.inner_text("#poseStatus"))
    b.close()
