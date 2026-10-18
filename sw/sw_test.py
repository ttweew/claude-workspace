# Service Worker 完整流程測試
import sys, os, time, shutil
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
SITE = sys.argv[1] if len(sys.argv) > 1 else "/home/user/claude-workspace"
# 用一份複本當網站（測試「網站更新」時要改檔案）
COPY = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')
shutil.rmtree(COPY, ignore_errors=True); shutil.copytree(SITE, COPY, ignore=shutil.ignore_patterns('.git'))
base = serve(8882, COPY)
UNPKG = "https://unpkg.com/@mediapipe/tasks-vision@1.0.1"
hits = []
def cdn(prefix):
    def h(route):
        hits.append(route.request.url.split('/')[-1].split('?')[0])
        f = PKG + route.request.url[len(prefix):].split("?")[0]
        route.fulfill(path=f, content_type="application/wasm" if f.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
    return h
def model(r): hits.append('model.task'); r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"})
def ok(name, cond, detail): print(('PASS ' if cond else 'FAIL ') + name + ' | ' + detail, flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    ctx = b.new_context(viewport={"width": 390, "height": 844})
    ctx.route(CDN + "/**", cdn(CDN)); ctx.route(UNPKG + "/**", cdn(UNPKG)); ctx.route(MODEL, model)
    ctx.add_init_script(cam_script(640, 480))
    ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:120]))
    def visit(label, url=base + "index.html"):
        hits.clear(); t0 = time.time()
        pg.goto(url); pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|請檢查網路/)", timeout=90000)
        return (time.time() - t0, list(hits), pg.inner_text('#modelStatus'), pg.evaluate("!!navigator.serviceWorker && !!navigator.serviceWorker.controller"))
    t, h, st, ctl = visit('1')
    ok('第 1 次：正常下載', '已就緒' in st, f"{t:.1f}s 下載 {sorted(set(h))} | 由 SW 處理 {ctl}")
    pg.wait_for_timeout(1500)
    t, h, st, ctl = visit('2')
    ok('第 2 次：由 SW 處理並存進手機', '已就緒' in st and ctl, f"{t:.1f}s 下載 {sorted(set(h))} | 由 SW 處理 {ctl}")
    pg.wait_for_timeout(2000)
    t, h, st, ctl = visit('3')
    ok('第 3 次：AI 檔案零下載', '已就緒' in st and not h, f"{t:.1f}s 下載 {sorted(set(h))} | {st}")
    # 斷網
    ctx.set_offline(True)
    t, h, st, ctl = visit('offline')
    pg.click('#startBtn'); pg.wait_for_timeout(4000)
    ok('斷網：網頁、AI 都能用，偵測得到人', '已就緒' in st and pg.inner_text('#poseStatus') == '已偵測到全身', f"{t:.1f}s {st} | {pg.inner_text('#poseStatus')} | 背景執行緒 {len(pg.workers)}")
    pg.click('#stopBtn')
    ctx.set_offline(False)
    # 網站更新：有網路時一定拿到新版
    p_html = os.path.join(COPY, 'index.html')
    s = open(p_html, encoding='utf-8').read(); open(p_html, 'w', encoding='utf-8').write(s.replace('專題作品', '專題作品（新版）'))
    visit('updated')
    ok('網站更新後有網路：拿到新版', '新版' in pg.inner_text('footer'), pg.inner_text('footer'))
    # 重播頁斷網也能開（有網路時打開過一次）
    pg.goto(base + "replay.html?demo"); pg.wait_for_timeout(2500)
    ctx.set_offline(True)
    try:
        pg.goto(base + "replay.html?demo"); pg.wait_for_timeout(2000)
        ok('斷網：重播頁也能用（之前打開過）', '已讀取' in pg.inner_text('#loadStatus'), pg.inner_text('#loadStatus'))
    except Exception as e:
        ok('斷網：重播頁也能用（之前打開過）', False, str(e)[:120])
    ctx.set_offline(False)
    # ?sw=0：移除
    pg.goto(base + "index.html?sw=0"); pg.wait_for_timeout(8000)
    regs = pg.evaluate("navigator.serviceWorker.getRegistrations().then(r => r.length)")
    caches_left = pg.evaluate("caches.keys()")
    ok('?sw=0：移除 SW 與存起來的檔案', regs == 0 and not caches_left, f"註冊 {regs} 存檔 {caches_left}")
    print('errors', errs)
    b.close()
