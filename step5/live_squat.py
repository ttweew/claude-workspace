# 鏡頭畫面的深蹲實驗功能：用假的 MediaPipe 播放合成深蹲，確認次數、深度提示、正面提醒
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
WDIR = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/worker'
MODE = sys.argv[1] if len(sys.argv) > 1 else ''   # 'main' → ?worker=0
base = serve(8842)
def fake_cdn(kind):
    def h(route):
        url = route.request.url
        rel = url[len(CDN):].split("?")[0]
        if rel == '/vision_bundle.mjs':
            route.fulfill(path=f"{HERE}/fake_{kind}.mjs", content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"})
        elif rel == '/vision_bundle_real.mjs':
            route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"})
        elif rel == '/vision_bundle.js':
            route.fulfill(path=f"{WDIR}/fake_{kind}.js", content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"})
        elif rel == '/vision_bundle_real.js':
            route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"})
        else:
            route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    return h
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for kind, q, vw, vh in [('side', '?lab=squat', 390, 844), ('side', '?lab=squat', 1280, 720), ('front', '?lab=squat', 390, 844), ('side', '', 390, 844), ('side', '?lab=squat', 320, 568)]:
        ctx = b.new_context(viewport={"width": vw, "height": vh}, device_scale_factor=2, is_mobile=vw < 600, has_touch=vw < 600)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route(CDN + "/**", fake_cdn(kind))
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480))
        pg.add_init_script("""window.__toasts = []; window.__banners = [];
          new MutationObserver(() => {
            const t = document.getElementById('repToast'); const tt = t && (t.textContent + ' [' + t.className + ']'); if (t && !t.hidden && window.__toasts[window.__toasts.length - 1] !== tt) window.__toasts.push(tt);
            const b = document.getElementById('banner'); if (b && !b.hidden && window.__banners[window.__banners.length - 1] !== b.textContent) window.__banners.push(b.textContent);
          }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });""")
        qq = q + (('&' if q else '?') + 'worker=0' if MODE == 'main' else '')
        pg.goto(base + "index.html" + qq); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn")
        shot_at = 9.5  # 第 4 下附近
        pg.wait_for_timeout(int(shot_at * 1000))
        tag = f"{kind}_{'lab' if q else 'nolab'}_{vw}"
        pg.screenshot(path=f"{HERE}/live_{tag}.png")
        pg.wait_for_timeout(int((15.5 - shot_at) * 1000))
        reps = pg.text_content('#hudReps') if not pg.get_attribute('#hudRepsBox', 'hidden') is not None else '(hidden box)'
        geo = pg.evaluate("""(() => { const h = document.getElementById('hud').getBoundingClientRect(); return [Math.round(h.left), Math.round(h.right), innerWidth]; })()""")
        link = pg.get_attribute('#replayLink', 'href')
        print(f"[{tag}] reps={reps} toasts={pg.evaluate('window.__toasts')} banners={pg.evaluate('window.__banners')[:4]} hud(left,right,vw)={geo} replayLink={link} errors={errs}")
        ctx.close()
    b.close()
