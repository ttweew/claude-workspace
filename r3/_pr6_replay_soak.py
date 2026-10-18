# 重播頁反覆讀 5 分鐘的檔案、切換畫面大小與顯示的關節，看記憶體會不會一直累積
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8898 + 1000, '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/wt-pr6')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--enable-precise-memory-info", "--js-flags=--expose-gc"])
    for q in ('', '?lab=squat'):
        pg = b.new_page(viewport={"width": 1280, "height": 900}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        pg.goto(base + "replay.html" + q)
        heaps = []
        for i in range(20):
            pg.set_input_files('#fileInput', '../hunt/long.json')
            pg.wait_for_function("document.getElementById('loadStatus').textContent.includes('已讀取')", timeout=60000)
            # 切換幾個顯示的關節、拖一下游標
            for btn in pg.query_selector_all('#toggles button')[:3]: btn.click()
            pg.keyboard.press('End') if i % 2 else pg.keyboard.press('Home')
            if i % 5 == 4:
                pg.evaluate("window.gc && window.gc()"); pg.wait_for_timeout(300)
                heaps.append(round(pg.evaluate("performance.memory.usedJSHeapSize / 1e6"), 1))
        print(q or '(一般)', '每 5 次的記憶體 MB', heaps, '背景執行緒', len(pg.workers), 'errors', errs)
        pg.close()
    b.close()
