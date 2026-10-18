# 工具列：打開數據面板後（按鈕變「隱藏數據」）各寬度會不會超出畫面
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]; port = int(sys.argv[2])
base = serve(port, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for vw in [320, 360, 390, 430, 480, 600, 844]:
        ctx = b.new_context(viewport={"width": vw, "height": 800 if vw < 600 else 390}, is_mobile=True, has_touch=True); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(1200)
        r = []
        for state in ['關', '開']:
            if state == '開': pg.click("#dataBtn"); pg.wait_for_timeout(200)
            m = pg.evaluate("""() => { const t = document.getElementById('toolbar'); const bs = [...t.querySelectorAll('button,select')].filter(e => e.offsetParent);
                return { sw: t.scrollWidth, cw: t.clientWidth, right: Math.max(...bs.map(e => e.getBoundingClientRect().right)), ov: getComputedStyle(t).overflowX }; }""")
            r.append(f"數據{state}: 最右 {m['right']:.0f} 捲動 {m['sw']}/{m['cw']} {m['ov']}")
        print(vw, ' | '.join(r))
        if vw in (320, 390): pg.locator("#toolbar").screenshot(path=f"{OUT}/tb_{os.path.basename(ROOT.rstrip('/'))}_{vw}.png")
        ctx.close()
