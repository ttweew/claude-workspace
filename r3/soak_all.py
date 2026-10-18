# 20 分鐘「全部功能一起開」：背景運算＋離線功能＋每分鐘錄 20 秒並匯出 CSV/JSON＋開關面板、編號
import sys, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8895)
mins = int(sys.argv[1]) if len(sys.argv) > 1 else 20
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream", "--enable-precise-memory-info"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html?lab=squat"); pg.wait_for_function(READY, timeout=90000)
    pg.wait_for_timeout(2000)
    pg.goto(base + "index.html?lab=squat"); pg.wait_for_function(READY, timeout=90000)
    sw = pg.evaluate("!!navigator.serviceWorker.controller")
    pg.click('#startBtn'); pg.wait_for_timeout(5000)
    downloads = 0
    for m in range(mins + 1):
        if m:
            # 開數據面板、錄 20 秒、停止、匯出兩種、關面板；開關編號
            pg.click('#dataBtn'); pg.click('#recordBtn'); pg.wait_for_timeout(20000); pg.click('#recordBtn')
            for btn in ('#csvBtn', '#jsonBtn'):
                with pg.expect_download(timeout=30000) as d: pg.click(btn)
                if d.value.path(): downloads += 1
            pg.click('#dataBtn'); pg.click('#labelBtn'); pg.wait_for_timeout(20000); pg.click('#labelBtn')
            pg.wait_for_timeout(18000)
        heap = pg.evaluate("performance.memory.usedJSHeapSize / 1e6")
        wheap = pg.workers[0].evaluate("performance.memory ? performance.memory.usedJSHeapSize / 1e6 : -1") if pg.workers else -1
        dom = pg.evaluate("document.getElementsByTagName('*').length")
        print((m, pg.inner_text('#perfBtn'), round(heap, 1), round(wheap, 1), dom, pg.inner_text('#poseStatus'), '下載', downloads, '背景執行緒', len(pg.workers)), flush=True)
    print('SW', sw, 'errors', errs)
    b.close()
