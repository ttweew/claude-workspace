import sys, os, shutil, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
COPY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site_up')
shutil.rmtree(COPY, ignore_errors=True); shutil.copytree('/home/user/claude-workspace', COPY, ignore=shutil.ignore_patterns('.git'))
base = serve(8884, COPY)
UNPKG = "https://unpkg.com/@mediapipe/tasks-vision@1.0.1"
hits = []
def cdn(prefix):
    def h(route):
        hits.append(route.request.url.split('/')[-1].split('?')[0])
        f = PKG + route.request.url[len(prefix):].split("?")[0]
        route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    return h
def ok(name, cond, detail): print(('PASS ' if cond else 'FAIL ') + name + ' | ' + detail, flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    ctx.route(CDN + "/**", cdn(CDN)); ctx.route(UNPKG + "/**", cdn(UNPKG))
    ctx.route(MODEL, lambda r: (hits.append('model'), r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"})))
    ctx.add_init_script(cam_script(640, 480))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    W = "document.getElementById('modelStatus').textContent.match(/已就緒|請檢查網路/)"
    def visit():
        hits.clear(); pg.goto(base + "index.html"); pg.wait_for_function(W, timeout=90000); pg.wait_for_timeout(1500)
        return list(hits), pg.inner_text('#modelStatus')
    for i in range(3): visit()
    before = pg.evaluate("caches.keys()")
    # 新版：sw.js 存檔名稱換成 v2（例如換了 MediaPipe 版本）
    sw = os.path.join(COPY, 'sw.js'); s = open(sw, encoding='utf-8').read()
    open(sw, 'w', encoding='utf-8').write(s.replace("'ai-files-v1'", "'ai-files-v2'"))
    h1, st1 = visit()               # 這次打開時新的 SW 安裝並接手
    pg.click('#startBtn'); pg.wait_for_timeout(3000); det1 = pg.inner_text('#poseStatus'); pg.click('#stopBtn')
    pg.wait_for_timeout(1500)
    h2, st2 = visit()               # 新版存好
    h3, st3 = visit()               # 之後零下載
    after = pg.evaluate("caches.keys()")
    ok('更換存檔版本：升級過程都能用、舊存檔清掉、新存檔建立', '已就緒' in st1 and det1 == '已偵測到全身' and '已就緒' in st3 and not h3 and 'ai-files-v1' not in after and 'ai-files-v2' in after,
       f"升級前 {before} → 升級後 {after} | 升級當次 {st1}／{det1} 下載 {sorted(set(h1))} | 之後下載 {h3} | errors {errs}")
    b.close()
