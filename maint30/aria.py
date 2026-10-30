# 10/30 保養：運動完的總結，螢幕閱讀器拿到什麼（Playwright 的 aria snapshot：角色、名字、文字）
# 用法：python3 aria.py <網站資料夾> <port> [plank]（假的 AI 用 ../main30 的 fake_sway、fake_plank）
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
PLANK = 'plank' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
M30 = os.path.join(HERE, '..', 'main30')
base = serve(PORT, ROOT)
FAKE = {'path': M30 + ('/fake_plank' if PLANK else '/fake_sway')}
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=FAKE['path'] + '.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=FAKE['path'] + '.js', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    pg.route(CDN + "/**", fake_cdn)
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480))
    pg.add_init_script("""(() => {
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
})();""")
    pg.goto(base + "index.html?workout=" + ('plank' if PLANK else 'squat')); pg.wait_for_function(READY, timeout=60000)
    pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
    pg.wait_for_function("document.getElementById('hudReps').textContent === '" + ('0:24' if PLANK else '6') + "'", timeout=120000)
    pg.wait_for_timeout(1500); pg.click('#stopBtn'); pg.wait_for_timeout(800)
    pg.locator('details.rep-table summary').click(); pg.wait_for_timeout(200)
    print(pg.locator('#summary').aria_snapshot())
    b.close()
