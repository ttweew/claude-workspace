# 模擬手機網路，在固定時間點截下首頁的載入畫面；之後拼成前後對照圖
import sys, time
src = open("measure3.py", encoding="utf-8").read()
body = src[:src.index("with sync_playwright() as p:")]
SITE, TAG = sys.argv[1], sys.argv[2]
sys.argv = ["x", SITE]
exec(body)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    ctx = b.new_context(viewport={"width": 390, "height": 600}, device_scale_factor=2)
    pg = ctx.new_page()
    cdp = ctx.new_cdp_session(pg); cdp.send("Network.enable")
    cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 60, "downloadThroughput": 4e6 / 8, "uploadThroughput": 2e6 / 8})
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    t0 = time.time(); pg.goto("http://127.0.0.1:8773/index.html")
    k = 0
    for t in range(1, 40):
        while time.time() - t0 < t: pg.wait_for_timeout(100)
        pg.screenshot(path=f"pb_{TAG}_{k}.png", clip={"x": 0, "y": 0, "width": 390, "height": 330}); w = pg.evaluate("(document.querySelector('#modelProgress .fill')||{style:{}}).style.width"); 
        print(f"{k:2d} {time.time()-t0:5.1f}s", w, pg.inner_text("#modelStatus")); k += 1
        if pg.evaluate(READY): break
    b.close()
