import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
exec(open('fpspick.py', encoding='utf-8').read().split('opts = lambda')[0].split('CAM = ')[1].join(['CAM = ', '']) if False else '')
ROOT = sys.argv[1]
base = serve(8819, ROOT)
src = open('fpspick.py', encoding='utf-8').read()
CAM = eval(src.split('CAM = ', 1)[1].split('\nopts = ')[0].replace('NO_COUNTDOWN + ', ''), {})
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for fps in ['30', '60', '120']:
        ctx = b.new_context(viewport={"width": 320, "height": 640}, is_mobile=True, has_touch=True); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(NO_COUNTDOWN + CAM % 60)
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.select_option("#fpsSelect", fps)
        pg.click("#startBtn"); pg.wait_for_timeout(3000)
        for st in ['收合', '展開']:
            if st == '展開': pg.click("#perfBtn"); pg.wait_for_timeout(1200)
            r = pg.evaluate("""() => [document.documentElement.scrollWidth, ...[...document.querySelectorAll('#infobar > *, #toolbar, #hud')].filter(e => e.offsetParent).map(e => e.id + ':' + Math.round(e.getBoundingClientRect().right) + '/' + Math.round(e.scrollWidth))]""")
            print(fps, st, r)
        ctx.close()
