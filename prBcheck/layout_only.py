# 運動模式（js/analysis/workouts.js）：從鏡頭畫面端到端（假的 AI 播放示範動畫做成的動作）＋介面
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8823, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/fake_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/fake_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
WATCH = """window.__toasts = []; window.__reps = []; window.__status = [];
  new MutationObserver(() => {
    const t = document.getElementById('repToast'); const tt = t && (t.textContent + ' [' + t.className + ']');
    if (t && !t.hidden && window.__toasts[window.__toasts.length - 1] !== tt) window.__toasts.push(tt);
    const r = document.getElementById('hudReps'); if (r && window.__reps[window.__reps.length - 1] !== r.textContent) window.__reps.push(r.textContent);
    const s = document.getElementById('poseStatus'); if (s && window.__status[window.__status.length - 1] !== s.textContent) window.__status.push(s.textContent);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });"""
def fake_page(b, kind, q, vw=1280, vh=800, mobile=False):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(WATCH)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 3. 版面：首頁卡片按鈕、鏡頭畫面三格（直拿）／右邊三格（橫拿）都在畫面內、不互相重疊
    for vw, vh, mob, wk in [(320, 640, True, 'plank'), (320, 640, True, 'squat'), (390, 844, True, 'plank'), (844, 390, True, 'plank'), (844, 390, True, 'squat'), (667, 375, True, 'plank'), (568, 320, True, 'plank'), (1280, 800, False, 'plank'), (1024, 600, False, 'squat')]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mob, has_touch=mob); pg = ctx.new_page()
        mock_network(pg); pg.add_init_script(cam_script(640, 480) + "try { localStorage.setItem('workout', '" + wk + "'); } catch (e) {}")
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        r = pg.evaluate("() => [...document.querySelectorAll('.exercises .start-workout')].map(b => b.getBoundingClientRect().right).concat(document.documentElement.scrollWidth)")
        check(max(r[:-1]) <= vw and r[-1] == vw, f'{vw} 首頁卡片按鈕在畫面內 {r}')
        if vw in (320, 1280):
            pg.locator(".exercises").screenshot(path=f"{HERE}/cards_{vw}.png")
        pg.click("#startBtn"); pg.wait_for_timeout(3500)
        boxes = pg.evaluate("""() => [...document.querySelectorAll('#hud .metric')].filter(e => e.offsetParent || getComputedStyle(e).position === 'fixed').map(e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })
            .concat([['toolbar', ...(r => [r.left, r.top, r.right, r.bottom])(document.getElementById('toolbar').getBoundingClientRect())], ['demo', ...(r => [r.left, r.top, r.right, r.bottom])(document.getElementById('demoBtn').getBoundingClientRect())]])""")
        metrics = [m for m in boxes if not isinstance(m[0], str)]
        others = [m[1:] for m in boxes if isinstance(m[0], str)]
        hit = lambda a, c: not (a[2] <= c[0] or a[0] >= c[2] or a[3] <= c[1] or a[1] >= c[3])
        inside = all(m[0] >= 0 and m[2] <= vw and m[1] >= 0 and m[3] <= vh for m in metrics)
        overlap = [(i, j) for i in range(len(metrics)) for j in range(i + 1, len(metrics)) if hit(metrics[i], metrics[j])]
        cover = [o for o in others for m in metrics if hit(m, o)]
        check(len(metrics) == 5 and inside and not overlap, f'{vw}x{vh} 五格都在畫面內、不重疊 {len(metrics)} {overlap}')
        check(not cover, f'{vw}x{vh} 不蓋到工具列、右上角按鈕 {len(cover)}')
        pg.screenshot(path=f"{HERE}/live_{vw}x{vh}_{wk}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
