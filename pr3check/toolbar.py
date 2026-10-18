import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'stab'))
from common import *
ROOT = sys.argv[1]; PORT = int(sys.argv[2]); OUT = sys.argv[3]
serve(ROOT, PORT)
SCENE = """navigator.mediaDevices.getUserMedia = async () => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); setInterval(() => { g.fillStyle = '#334'; g.fillRect(0,0,640,480); }, 33); return c.captureStream(30); };"""
with sync_playwright() as p:
    b = launch(p)
    for vw, vh, mobile in [(320, 568, True), (360, 740, True), (390, 844, True), (480, 800, True), (768, 1024, True), (1280, 720, False), (568, 320, True), (844, 390, True)]:
        pg = b.new_page(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2)
        pg.route(CDN + "/**", cdn)
        pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.add_init_script(SCENE)
        pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|失敗/)", timeout=60000)
        pg.click('#startBtn'); pg.wait_for_timeout(1200)
        r = pg.evaluate("""() => { const t = document.getElementById('toolbar'); const items = [...t.children].filter(e => !e.hidden && getComputedStyle(e).display !== 'none');
            const rows = new Set(items.map(e => Math.round(e.getBoundingClientRect().top)));
            return { rows: rows.size, overflow: t.scrollWidth > t.clientWidth, right: Math.round(Math.max(...items.map(e => e.getBoundingClientRect().right))), vw: innerWidth,
                     texts: items.map(e => e.innerText.trim() || e.getAttribute('aria-label')) }; }""")
        print(vw, vh, r)
        if vw in (320, 390, 1280): pg.screenshot(path=f"{OUT}/tb_{vw}.png", clip={"x": 0, "y": 0, "width": vw, "height": 64})
        pg.close()
    b.close()
