from playwright.sync_api import sync_playwright
from audit_common import *
base = serve(8791)
Q = "(async () => { return null; })()"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 720}); pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    pg.on("console", lambda m: errs.append(m.text[:150]) if m.type == "warning" and "螢幕" in m.text else None)
    mock_network(pg); pg.add_init_script(cam_script(1280, 720))
    # 記錄 wake lock 的申請與釋放
    pg.add_init_script("""window.__wl = []; if (navigator.wakeLock) { const r = navigator.wakeLock.request.bind(navigator.wakeLock);
      navigator.wakeLock.request = async t => { const l = await r(t); __wl.push('request'); l.addEventListener('release', () => __wl.push('release')); return l; }; }""")
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    print("支援 wakeLock：", pg.evaluate("'wakeLock' in navigator"))
    pg.click("#startBtn"); pg.wait_for_function("document.getElementById('poseStatus').textContent === '已偵測到全身'", timeout=30000)
    pg.wait_for_timeout(500); pg.click("#perfBtn"); pg.wait_for_timeout(300)
    print("開鏡頭後：", pg.evaluate("__wl"), "| 標籤展開：", pg.inner_text("#perfBtn"))
    pg.click("#stopBtn"); pg.wait_for_timeout(300)
    print("關鏡頭後：", pg.evaluate("__wl"))
    pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#stopBtn"); pg.wait_for_timeout(300)
    print("再開再關：", pg.evaluate("__wl"), "| 錯誤/警告：", errs)
    b.close()
