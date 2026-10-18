# 效能剖析：模擬中階手機（CPU 慢 4 倍），開啟編號＋數據面板＋錄製（最吃效能的情況），
# 用 CPU 取樣統計時間花在哪些程式；同時量長時間運行的記憶體、DOM 數量、FPS
from playwright.sync_api import sync_playwright
from audit_common import *
import sys, collections, time
DUR = int(sys.argv[1]) if len(sys.argv) > 1 else 120
url = serve(8832)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    pg = b.new_page(viewport={"width": 390, "height": 760}, device_scale_factor=3); mock_network(pg); pg.add_init_script(cam_script(480, 640))
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    cdp = pg.context.new_cdp_session(pg)
    pg.goto(url + "?debug"); pg.wait_for_function(READY, timeout=60000)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn"); pg.click("#recordBtn")
    # CPU 取樣 10 秒
    cdp.send("Profiler.enable"); cdp.send("Profiler.setSamplingInterval", {"interval": 500}); cdp.send("Profiler.start")
    pg.wait_for_timeout(10000)
    prof = cdp.send("Profiler.stop")["profile"]
    nodes = {n["id"]: n for n in prof["nodes"]}
    self_count = collections.Counter(prof["samples"])
    total = sum(self_count.values())
    by = collections.Counter()
    for nid, c in self_count.items():
        cf = nodes[nid]["callFrame"]; u = cf["url"]
        key = ("我們的程式 " + u.split("/js/")[-1] + ":" + cf["functionName"]) if "/js/" in u and "127.0.0.1" in u else \
              ("MediaPipe" if "jsdelivr" in u or "wasm" in u or u.startswith("wasm") else ("(閒置)" if cf["functionName"] == "(idle)" else ("(瀏覽器/垃圾回收/繪圖)" if not u else "其他 " + u[-30:])))
        by[key] += c
    print("CPU 時間分布（10 秒，CPU 慢 4 倍）：")
    for k, c in by.most_common(14): print(f"  {c/total*100:5.1f}%  {k}")
    ours = sum(c for k, c in by.items() if k.startswith("我們"))
    print(f"  → 我們的程式合計 {ours/total*100:.1f}%")
    # 長時間運行
    print("長時間運行（錄製中、面板開著）：")
    t0 = time.time()
    while time.time() - t0 < DUR:
        pg.wait_for_timeout(20000)
        heap = cdp.send("Runtime.getHeapUsage")
        dom = pg.evaluate("document.getElementsByTagName('*').length")
        print(f"  {time.time()-t0:5.0f}s  JS記憶體 {heap['usedSize']/1e6:6.1f} MB  DOM元素 {dom}  {pg.inner_text('#perfBtn')}  {pg.inner_text('#recordInfo')}")
    print("錯誤：", errs)
    b.close()
