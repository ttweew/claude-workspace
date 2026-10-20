import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOP = S + '/audit2'
OUT = os.path.dirname(os.path.abspath(__file__))
base = serve(8890, ROOT)
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{LOOP}/loop_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{LOOP}/loop_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, accept_downloads=True)
    ctx.route(CDN + "/**", fake_cdn('squat_mix'))
    ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    ctx.add_init_script(cam_script(640, 480))
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == 'error' and errs.append(m.text))
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    pg.click('#startBtn'); pg.wait_for_timeout(1500)
    pg.click('#recModeBtn'); pg.wait_for_timeout(300)
    pg.select_option('#recTimer', '0')
    pg.screenshot(path=OUT + '/s_idle.png')
    pg.click('#recMain'); pg.wait_for_timeout(2000)
    print('rec', pg.text_content('#recClock'), pg.is_visible('#recPause'), pg.text_content('#dataBtn'))
    pg.screenshot(path=OUT + '/s_rec.png')
    pg.click('#recPause'); pg.wait_for_timeout(1500)
    print('paused', pg.text_content('#recClock'), pg.text_content('#recordInfo'))
    pg.screenshot(path=OUT + '/s_paused.png')
    pg.click('#recPause'); pg.wait_for_timeout(1500)
    pg.click('#recMain'); pg.wait_for_timeout(1500)
    print('stopped', pg.text_content('#recNote'), pg.text_content('#galleryCount'), pg.text_content('#recordBtn'), pg.text_content('#recordSaved'))
    pg.click('#recMain'); pg.wait_for_timeout(1500); pg.click('#recMain'); pg.wait_for_timeout(1500)
    print('2nd', pg.text_content('#recNote'), pg.text_content('#galleryCount'))
    pg.click('#galleryBtn'); pg.wait_for_timeout(500)
    print('gallery', pg.inner_text('#galleryList')[:300])
    pg.screenshot(path=OUT + '/s_gallery.png')
    print('errors', errs[:3])
