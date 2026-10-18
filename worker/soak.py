# 10 分鐘連續運行：每分鐘記錄 FPS、主畫面記憶體、整個瀏覽器分頁的記憶體
import sys, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8873)
q = sys.argv[1] if len(sys.argv) > 1 else ''
mins = int(sys.argv[2]) if len(sys.argv) > 2 else 10
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream", "--enable-precise-memory-info"])
    pg = b.new_page(viewport={"width": 390, "height": 844}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=90000)
    pg.click('#startBtn'); pg.wait_for_timeout(5000)
    cdp = pg.context.new_cdp_session(pg)
    rows = []
    for m in range(mins + 1):
        if m: pg.wait_for_timeout(60000)
        heap = pg.evaluate("performance.memory.usedJSHeapSize / 1e6")
        dom = pg.evaluate("document.getElementsByTagName('*').length")
        wheap = None
        if pg.workers:
            try: wheap = pg.workers[0].evaluate("performance.memory ? performance.memory.usedJSHeapSize / 1e6 : -1")
            except Exception as e: wheap = 'n/a'
        rows.append((m, pg.inner_text('#perfBtn'), round(heap, 1), wheap if not isinstance(wheap, float) else round(wheap, 1), dom, pg.inner_text('#poseStatus')))
        print(rows[-1], flush=True)
    print('errors', errs, 'workers', len(pg.workers))
    b.close()
