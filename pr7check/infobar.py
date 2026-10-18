# 高速模式的運算標籤比較長：320～390 寬的狀態列會不會超出畫面
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8817, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for vw, vh in [(320, 640), (390, 844), (844, 390)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=True, has_touch=True); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html?fps=60"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(3500)
        for state in ['收合', '展開']:
            if state == '展開': pg.click("#perfBtn"); pg.wait_for_timeout(1200)
            r = pg.evaluate("""() => { const b = document.getElementById('perfBtn').getBoundingClientRect(); const s = document.getElementById('poseStatus').getBoundingClientRect();
                return { right: Math.round(b.right), bottom: Math.round(b.bottom), sRight: Math.round(s.right), text: document.getElementById('perfBtn').innerText, sw: document.documentElement.scrollWidth }; }""")
            print(vw, state, r)
            pg.screenshot(path=f"{OUT}/info_{vw}_{state}.png")
        ctx.close()
