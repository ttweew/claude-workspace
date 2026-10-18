# 最擠的情況：數據面板打開＋錄製中（●）＋全螢幕
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]; port = int(sys.argv[2])
base = serve(port, ROOT)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for vw in [int(x) for x in (sys.argv[3] if len(sys.argv) > 3 else "320,360,390,430,480,520,600").split(",")]:
        ctx = b.new_context(viewport={"width": vw, "height": 800}, is_mobile=True, has_touch=True); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(1200)
        pg.click("#dataBtn"); pg.select_option("#countdownSelect", "0"); pg.click("#recordBtn"); pg.wait_for_timeout(300)
        pg.click("#fullscreenBtn"); pg.wait_for_timeout(500)
        m = pg.evaluate("""() => { const t = document.getElementById('toolbar'); const bs = [...t.querySelectorAll('button,select')].filter(e => e.offsetParent);
            return { sw: t.scrollWidth, cw: t.clientWidth, right: Math.max(...bs.map(e => e.getBoundingClientRect().right)), txt: bs.map(e => e.innerText.trim()).join(' / '), fs: !!document.fullscreenElement }; }""")
        print(vw, f"最右 {m['right']:.0f} 捲動 {m['sw']}/{m['cw']} 全螢幕={m['fs']} | {m['txt']}")
        ctx.close()
