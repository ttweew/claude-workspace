# 數據面板截圖：手機直拿、320 寬、電腦，選 5 和 20 分鐘，展開和收合
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8814, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for name, vw, vh, mobile in [('iphone', 390, 844, True), ('w320', 320, 640, True), ('laptop', 1280, 720, False)]:
        kw = dict(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
        if mobile: kw['user_agent'] = IPHONE
        ctx = b.new_context(**kw); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#dataBtn"); pg.wait_for_timeout(300)
        for m in ['5', '20']:
            pg.select_option("#limitSelect", m); pg.wait_for_timeout(200)
            h = pg.locator(".panel-head").bounding_box()['height']
            print(name, m, '面板第一列高度', round(h))
            pg.screenshot(path=f"{OUT}/s_{name}_{m}.png")
        if mobile:
            pg.click("#panelToggle"); pg.wait_for_timeout(200)
            pg.screenshot(path=f"{OUT}/s_{name}_collapsed.png")
        ctx.close()
