import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8821, sys.argv[1] if len(sys.argv) > 1 else "/home/user/claude-workspace")
tag = sys.argv[2] if len(sys.argv) > 2 else 'new'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for name, vw, vh, cw, ch in [('phone', 390, 844, 720, 1280), ('laptop', 1280, 720, 640, 480), ('land', 844, 390, 640, 480)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2, is_mobile=vw < 600, has_touch=vw < 600)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        mock_network(pg); pg.add_init_script(cam_script(cw, ch))
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(2500)
        hud = [pg.inner_text('#hudKnee'), pg.inner_text('#hudHip')]
        pg.click("#dataBtn"); pg.wait_for_timeout(1200)
        info = pg.inner_text('#viewInfo') if pg.query_selector('#viewInfo') else '(none)'
        geo = pg.evaluate("(() => { const r = document.getElementById('dataPanel').getBoundingClientRect(); const b = document.querySelector('.panel-body'); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.height), b.scrollHeight > b.clientHeight, b.scrollWidth > b.clientWidth]; })()")
        pg.screenshot(path=f"panel_{tag}_{name}.png")
        print(f"[{name}] HUD={hud} panel top/bottom/h/vscroll/hscroll={geo} errors={errs}\n  info={info!r}")
        ctx.close()
    b.close()
