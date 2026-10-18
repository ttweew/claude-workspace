# 動作相似度（js/analysis/similarity.js）：每一下的提示、運動總結、重播分析
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8828, ROOT)
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
WATCH = """Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } }); window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.__toasts = []; window.__reps = []; window.__status = [];
  new MutationObserver(() => {
    const t = document.getElementById('repToast'); const tt = t && (t.textContent + ' [' + t.className + ']');
    if (t && !t.hidden && window.__toasts[window.__toasts.length - 1] !== tt) window.__toasts.push(tt);
    const r = document.getElementById('hudReps'); if (r && window.__reps[window.__reps.length - 1] !== r.textContent) window.__reps.push(r.textContent);
    const s = document.getElementById('poseStatus'); if (s && window.__status[window.__status.length - 1] !== s.textContent) window.__status.push(s.textContent);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });"""
def fake_page(b, kind, q, vw=1280, vh=800, mobile=False):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(WATCH)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg


sim = lambda t: int(re.search(r'相似 (\d+)%', t).group(1)) if re.search(r'相似 (\d+)%', t) else None
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for kind, secs in [('pushup', 15), ('lunge', 12)]:
        ctx, pg = fake_page(b, kind, '?workout=' + kind)
        pg.click("#startBtn"); pg.wait_for_timeout(400)
        pg.click("#dataBtn"); pg.click("#recordBtn"); pg.click("#dataBtn")
        pg.wait_for_timeout(secs * 1000)
        toasts = pg.evaluate("window.__toasts")
        sims = [sim(t) for t in toasts]
        good = [s for t, s in zip(toasts, sims) if '[good]' in t]
        shallow = [s for t, s in zip(toasts, sims) if '[shallow]' in t]
        check(all(s is not None for s in sims) and min(good) >= 85 and max(shallow) < min(good) - 10, f'{kind} 每一下的相似度：{toasts}')
        pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(300)
        with pg.expect_download() as d:
            pg.click("#jsonBtn")
        path = d.value.path()
        pg.click("#stopBtn"); pg.wait_for_timeout(500)
        ls = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
        avg = int(sum(sims) / len(sims) + 0.5)   # 和 JS 的 Math.round 一樣（Python 的 round 是四捨六入五成雙）
        check(any(f'和示範動作相似 {avg}%' in l for l in ls), f'{kind} 總結的平均相似度 {avg}：{ls}')
        pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
        pg.set_input_files("#fileInput", files=[{"name": "r.json", "mimeType": "application/json", "buffer": open(path, 'rb').read()}])
        pg.wait_for_function("document.getElementById('squatTable').rows.length > 1", timeout=30000)
        head_ = pg.evaluate("[...document.querySelectorAll('#squatTable thead th')].map(c => c.textContent)")
        col = pg.evaluate("[...document.querySelectorAll('#squatTable tbody tr')].map(tr => tr.children[4].textContent)")
        check('相似度' in head_ and len(col) == len(sims) and all(abs(int(c.rstrip('%')) - v) <= 1 for c, v in zip(col, sims)), f'{kind} 重播分析的相似度和鏡頭畫面一樣：{col} vs {sims}')
        check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:2]))
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
