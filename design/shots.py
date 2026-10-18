# 盤點目前各頁面在手機、筆電上的樣子
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
site = sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace'
out = sys.argv[2] if len(sys.argv) > 2 else 'before'
base = serve(8902, site)
os.makedirs(out, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, vw, vh, mobile in [('phone', 390, 844, True), ('laptop', 1280, 800, False)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html?lab=squat"); pg.wait_for_function(READY, timeout=90000); pg.wait_for_timeout(1500)
        pg.screenshot(path=f"{out}/{name}_1_home.png", full_page=True)
        pg.click('#startBtn'); pg.wait_for_timeout(4000)
        pg.screenshot(path=f"{out}/{name}_2_camera.png")
        pg.click('#labelBtn'); pg.wait_for_timeout(800); pg.screenshot(path=f"{out}/{name}_3_labels.png"); pg.click('#labelBtn')
        pg.click('#dataBtn'); pg.wait_for_timeout(800); pg.screenshot(path=f"{out}/{name}_4_data.png")
        pg.goto(base + "replay.html?demo&lab=squat"); pg.wait_for_function("document.getElementById('loadStatus').textContent.includes('已讀取')", timeout=30000); pg.wait_for_timeout(800)
        pg.screenshot(path=f"{out}/{name}_5_replay.png", full_page=True)
        ctx.close()
    b.close()
print('ok')
