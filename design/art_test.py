import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8905, '/home/user/claude-workspace')
ANG = "document.getElementById('artAngle').textContent"
HEADTOP = "(() => { const h = document.getElementById('artHead'); return +h.getAttribute('cy') - 20; })()"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    # 電腦：會動
    pg = b.new_page(viewport={"width": 1280, "height": 800}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
    angles, tops = [], []
    for i in range(16):
        angles.append(pg.evaluate(ANG)); tops.append(pg.evaluate(HEADTOP))
        if i in (0, 3, 6): pg.locator('.hero-art').screenshot(path=f"after/art_{i}.png")
        pg.wait_for_timeout(230)
    print('電腦：角度變化', angles, '| 頭頂最高 y', min(tops), '| errors', errs)
    # 開鏡頭後停止
    pg.click('#startBtn'); pg.wait_for_timeout(1000)
    a1 = pg.evaluate("document.getElementById('artKnee').getAttribute('cy')"); pg.wait_for_timeout(1200)
    a2 = pg.evaluate("document.getElementById('artKnee').getAttribute('cy')")
    pg.click('#stopBtn'); after = []
    for i in range(10):
        pg.wait_for_timeout(300); after.append(pg.evaluate(ANG))
    print('鏡頭開著時停住', a1 == a2, '| 關掉鏡頭後的角度', after)
    pg.close()
    # 手機：示意圖隱藏，不跑
    pg = b.new_page(viewport={"width": 390, "height": 844}); pg.goto(base + "index.html"); pg.wait_for_timeout(1500)
    print('手機：角度', pg.evaluate(ANG), '（應維持 95°，沒有在跑）')
    pg.close()
    # 減少動態效果
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, reduced_motion='reduce'); pg = ctx.new_page()
    pg.goto(base + "index.html"); pg.wait_for_timeout(1500)
    print('減少動態效果：角度', pg.evaluate(ANG))
    b.close()
