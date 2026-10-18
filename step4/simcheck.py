import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8837, sys.argv[1])
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    pg = b.new_page(viewport={"width": 1280, "height": 800}); errs = []; reqs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("request", lambda r: reqs.append(r.url) if '127.0.0.1' in r.url and r.url.endswith('.js') else None)
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(2500); pg.click("#dataBtn"); pg.wait_for_timeout(600)
    print('index:', pg.inner_text('#hudKnee') if False else pg.inner_text('#viewInfo'), '| unversioned js:', [u for u in reqs], '| errors', errs)
    pg2 = b.new_page(); errs2 = []; reqs.clear()
    pg2.on("pageerror", lambda e: errs2.append(str(e)))
    pg2.on("request", lambda r: reqs.append(r.url) if '127.0.0.1' in r.url and '.js' in r.url and '?v=' not in r.url else None)
    pg2.goto(base + "replay.html?demo"); pg2.wait_for_timeout(800)
    print('replay:', pg2.inner_text('#loadStatus'), '| unversioned js:', reqs, '| errors', errs2)
    b.close()
