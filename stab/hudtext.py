import sys
from common import *
PORT=int(sys.argv[1]); tag=sys.argv[2]; serve("/home/user/claude-workspace", PORT)
with sync_playwright() as p:
    b = launch(p)
    for name, w, h in [("phone", 390, 844), ("phone_land", 844, 390), ("se", 320, 568), ("se_land", 568, 320), ("laptop", 1366, 768)]:
        pg = b.new_page(viewport={"width":w,"height":h}, is_mobile=True, has_touch=True, device_scale_factor=3)
        pg.route(CDN+"/**", cdn)
        pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(PERSON_CAM)
        pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒/)", timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(2500)
        info = pg.evaluate("""(() => { const f = s => { const e = document.querySelector(s); const c = getComputedStyle(e); return s + ' ' + c.fontSize + ' ' + c.color + ' w' + c.fontWeight; };
          return [f('.metric-label'), f('.metric-value'), f('.joint-label')]; })()""")
        fit = pg.evaluate("(() => { const r = document.getElementById('hud').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom), innerWidth, innerHeight, document.getElementById('toolbar').getBoundingClientRect().bottom]; })()")
        print(tag, name, info, 'hud box', fit)
        pg.screenshot(path=f"hud_{tag}_{name}.png")
        pg.close()
    b.close()
