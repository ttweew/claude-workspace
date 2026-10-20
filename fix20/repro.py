# 使用者 10/20 回報：按「錄影」沒反應（按鈕變綠框、下面的控制列沒出現）。各種寬度 × 數據面板開／關，看控制列在不在、有沒有被蓋住
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOP = S + '/audit2'
base = serve(8891, ROOT)
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
PROBE = """() => {
  const bar = document.getElementById('recBar'), r = bar.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  return { hiddenAttr: bar.hidden, display: getComputedStyle(bar).display, pressed: document.getElementById('recModeBtn').getAttribute('aria-pressed'),
    box: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vw: innerWidth, vh: innerHeight,
    onTop: !!hit && bar.contains(hit), hit: hit ? (hit.id || hit.className || hit.tagName) : null, panel: !document.getElementById('dataPanel').hidden };
}"""
sizes = [(1366, 657, False), (1280, 720, False), (1920, 940, False), (1024, 640, False), (820, 1180, True), (844, 390, True), (390, 844, True)]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for w, h, mobile in sizes:
        for panel in (False, True):
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, has_touch=mobile)
            ctx.route(CDN + "/**", fake_cdn('squat_mix'))
            ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
            ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
            ctx.add_init_script(cam_script(640, 480))
            pg = ctx.new_page()
            pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
            pg.click('#startBtn'); pg.wait_for_timeout(1200)
            if panel: pg.click('#dataBtn'); pg.wait_for_timeout(300)
            pg.click('#recModeBtn'); pg.wait_for_timeout(300)
            r = pg.evaluate(PROBE)
            ok = r['display'] != 'none' and r['onTop'] and r['box'][1] >= 0 and r['box'][1] + r['box'][3] <= r['vh']
            print(('OK  ' if ok else 'BAD ') + f"{w}x{h} 數據面板{'開' if panel else '關'}", json.dumps(r, ensure_ascii=False))
            pg.screenshot(path=os.path.dirname(os.path.abspath(__file__)) + f"/r_{w}x{h}_{int(panel)}.png")
            ctx.close()
