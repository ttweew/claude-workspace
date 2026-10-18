import sys
from common import *
serve(sys.argv[1], 8792); serve(sys.argv[2], 8793)
with sync_playwright() as p:
    b=launch(p)
    for name, port in [("改後", 8793), ("改前", 8792)]:
        pg,errs,logs=page(b,port,gpu=False)
        pg.click("#startBtn"); pg.wait_for_timeout(3000)
        w0=pg.evaluate("window.__wakes"); pg.wait_for_timeout(10000); w1=pg.evaluate("window.__wakes")
        print(name, "叫醒次數/秒:", (w1-w0)/10, "| 偵測 FPS:", pg.inner_text("#perfBtn"), "| status:", pg.inner_text("#poseStatus"), errs)
        pg.close()
    b.close()
