# 比較：不同設定下的 FPS 與記憶體（CPU 慢 4 倍），確認新功能沒有拖慢偵測
from playwright.sync_api import sync_playwright
from audit_common import *
import sys
url = serve(8833, sys.argv[1] if len(sys.argv) > 1 else "/home/user/claude-workspace")
def run(b, dpr, q, panel):
    pg = b.new_page(viewport={"width": 390, "height": 760}, device_scale_factor=dpr); mock_network(pg); pg.add_init_script(cam_script(480, 640))
    cdp = pg.context.new_cdp_session(pg)
    pg.goto(url + q); pg.wait_for_function(READY, timeout=60000)
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    pg.click("#startBtn"); pg.wait_for_timeout(1500)
    if panel and pg.query_selector("#dataBtn"): pg.click("#dataBtn")
    vals = []
    for i in range(6):
        pg.wait_for_timeout(5000); vals.append(pg.inner_text("#perfBtn"))
    h1 = cdp.send("Runtime.getHeapUsage")["usedSize"]
    pg.close(); return vals, h1
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, dpr, q, panel in [("最簡單（螢幕1倍、無編號）", 1, "", False), ("手機3倍螢幕、無編號", 3, "", False), ("手機3倍＋編號＋數據面板", 3, "?debug", True)]:
        v, h = run(b, dpr, q, panel)
        f = [int(x.split("·")[1].split()[0]) for x in v if "FPS" in x and x.split("·")[1].split()[0].isdigit()]
        print(f"{name:20s} FPS 平均 {sum(f)/len(f):.1f}（{f}） 記憶體 {h/1e6:.1f} MB")
    b.close()
