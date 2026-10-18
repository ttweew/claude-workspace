import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8904, '/home/user/claude-workspace')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, vw, vh in [('se', 320, 568), ('phone', 390, 844), ('land', 844, 390)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(3000)
        tb = pg.evaluate("""(() => { const t = document.getElementById('toolbar'); const r = [...t.children].filter(e => !e.hidden).map(e => { const b = e.getBoundingClientRect(); return [e.id, Math.round(b.left), Math.round(b.right), Math.round(b.height)]; });
            return { overflow: t.scrollWidth > t.clientWidth, height: t.offsetHeight, items: r, vw: innerWidth }; })()""")
        nav_under = pg.evaluate("(() => { const s = document.getElementById('stage').getBoundingClientRect(); const el = document.elementFromPoint(innerWidth - 20, 20); return el ? (el.closest('.site-nav') ? '導覽列' : el.id || el.tagName) : null; })()")
        pg.click('#dataBtn'); pg.click('#panelToggle'); pg.wait_for_timeout(500)
        ph = pg.evaluate("document.getElementById('dataPanel').offsetHeight")
        pg.screenshot(path=f"after/{name}_6_collapsed.png")
        print(name, '工具列', tb, '| 右上角最上層', nav_under, '| 收合後面板高', ph, errs)
        ctx.close()
    b.close()
