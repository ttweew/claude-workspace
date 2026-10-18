import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8859, sys.argv[1] if len(sys.argv) > 1 else "/home/user/claude-workspace")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--enable-precise-memory-info"])
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    cdp = pg.context.new_cdp_session(pg)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    pg.goto(base + "replay.html?lab=squat")
    # 分析期間每 50 ms 量一次主畫面反應時間
    pg.evaluate("""window.__lags = []; window.__busy = true; (function tick(){ const t = performance.now(); setTimeout(() => { window.__lags.push(performance.now() - t); if (window.__busy) setTimeout(tick, 50); }, 0); })();""")
    t0 = pg.evaluate("performance.now()")
    pg.set_input_files("#fileInput", HERE + "/long.json")
    pg.wait_for_function("document.getElementById('loadStatus').textContent.includes('已讀取')", timeout=180000)
    t1 = pg.evaluate("performance.now()")
    pg.evaluate("window.__busy = false")
    lags = sorted(pg.evaluate("window.__lags"))
    pg.wait_for_timeout(1500)
    heap = pg.evaluate("performance.memory.usedJSHeapSize / 1e6")
    print(f"讀取＋分析 {round(t1 - t0)} ms | 期間主畫面反應：中位數 {lags[len(lags)//2]:.0f} ms、最慢 {lags[-1]:.0f} ms | 主畫面記憶體 {heap:.0f} MB | {pg.inner_text('#squatSummary')} | errors {errs}")
    b.close()
