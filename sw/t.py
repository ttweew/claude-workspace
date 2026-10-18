import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8881, HERE)
hits = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context()
    def model(r): hits.append(r.request.url); r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("https://storage.googleapis.com/**", model)
    pg = ctx.new_page()
    pg.goto(base + "page.html"); print('reg', pg.evaluate("window.reg"))
    pg.reload(); pg.wait_for_timeout(500); print('controlled', pg.evaluate("!!navigator.serviceWorker.controller"))
    print('1st', pg.evaluate("go()"), 'network hits', len(hits)); pg.wait_for_timeout(1000)
    ctx.set_offline(True)
    try: print('offline', pg.evaluate("go()"), 'network hits', len(hits))
    except Exception as e: print('offline FAIL', str(e)[:100])
    b.close()
