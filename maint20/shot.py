# 紅字出現的當下拍照（舊程式、新程式各一張，放在一起比）
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
sys.argv = [sys.argv[0], sys.argv[1]] + sys.argv[2:]
import importlib.util
ROOT, TAG = sys.argv[1], sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
FAKE = HERE + '/../prCcheck'
base = serve(8842 if TAG == 'new' else 8843, ROOT)
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{FAKE}/fake_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{FAKE}/fake_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 320, "height": 640}, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.route(CDN + "/**", fake_cdn('squat_err'))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    pg.click('#startBtn')
    pg.wait_for_function("!document.getElementById('formTip').hidden", timeout=20000)
    pg.wait_for_timeout(150)
    pg.screenshot(path=f"{HERE}/tip_{TAG}_320.png", clip={'x': 0, 'y': 0, 'width': 320, 'height': 300})
    print(TAG, 'ok')
