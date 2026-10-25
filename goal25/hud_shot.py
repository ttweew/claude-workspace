# 直拿手機（320、360、390 寬）：次數框上面「目標 1:15」「目標 200」會不會和左右兩組數字重疊
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8864, ROOT)
FAKE = {'name': 'plank'}
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    n = FAKE['name']
    if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/fake_{n}.mjs", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/fake_{n}.js", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for workout, goals in [('plank', {'plank': 75}), ('squat', {'squat': 200})]:
        FAKE['name'] = workout
        for w, h in [(320, 568), (360, 740), (390, 844), (844, 390)]:
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=True, has_touch=True, device_scale_factor=2)
            pg = ctx.new_page()
            pg.route(CDN + "/**", fake_cdn)
            pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
            pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
            pg.add_init_script(cam_script(640, 480))
            pg.add_init_script("localStorage.setItem('workoutGoals', %s)" % json.dumps(json.dumps(goals)))
            pg.goto(base + "index.html?workout=" + workout); pg.wait_for_function(READY, timeout=60000)
            pg.click("#startBtn"); pg.wait_for_timeout(5000)
            r = pg.evaluate("""(() => { const box = id => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)]; };
              const reps = box('hudRepsBox'); const metrics = [...document.querySelectorAll('.hud-side .metric')].filter(m => m.id !== 'hudRepsBox' && m.offsetParent).map(m => { const r = m.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)]; });
              const hit = metrics.filter(m => !(m[1] <= reps[0] || m[0] >= reps[1] || m[3] <= reps[2] || m[2] >= reps[3]));
              return { label: document.getElementById('hudRepsName').textContent, reps, hit, sw: document.documentElement.scrollWidth }; })()""")
            ok = not r['hit'] and r['sw'] <= w
            bad += not ok
            print(('PASS ' if ok else 'FAIL ') + f"{workout} {w}x{h} {r}")
            pg.screenshot(path=os.path.join(HERE, f'hud_{workout}_{w}.png'))
            ctx.close()
    b.close()
print('通過 |' if not bad else 'SOME FAIL', bad)
