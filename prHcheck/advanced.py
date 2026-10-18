# 首頁進階設定（收起來的每秒格數、AI 模型、語音開關）
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8829, ROOT)
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
WATCH = """window.__said = []; window.__tips = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak(u) { if (u.text.trim()) window.__said.push(u.text); } } });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  window.__toasts = []; window.__reps = []; window.__status = [];
  new MutationObserver(() => {
    const t = document.getElementById('repToast'); const tt = t && (t.textContent + ' [' + t.className + ']');
    if (t && !t.hidden && window.__toasts[window.__toasts.length - 1] !== tt) window.__toasts.push(tt);
    const r = document.getElementById('hudReps'); if (r && window.__reps[window.__reps.length - 1] !== r.textContent) window.__reps.push(r.textContent);
    const ft = document.getElementById('formTip'); if (ft && !ft.hidden && window.__tips[window.__tips.length - 1] !== ft.textContent) window.__tips.push(ft.textContent);
    const s = document.getElementById('poseStatus'); if (s && window.__status[window.__status.length - 1] !== s.textContent) window.__status.push(s.textContent);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });"""
def fake_page(b, kind, q, vw=1280, vh=800, mobile=False):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route(MODEL.replace("lite", "full"), lambda r: r.fulfill(path=MP + "/pose_landmarker_full.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(WATCH)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg


title = lambda pg: pg.inner_text("#advancedTitle")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx, pg = fake_page(b, 'pushup_err', '?workout=pushup')
    check(not pg.evaluate("document.getElementById('advanced').open") and pg.is_hidden("#fpsSelect") and pg.is_hidden("#modelSelect") and title(pg) == '進階設定', '一開始收起來：' + title(pg))
    pg.click("#advancedTitle"); pg.wait_for_timeout(200)
    check(pg.is_visible("#fpsSelect") and pg.is_visible("#modelSelect") and pg.is_checked("#voiceToggle"), '點開看到每秒格數、AI 模型、語音（預設開）')
    pg.select_option("#fpsSelect", '60'); pg.wait_for_timeout(100)
    check(title(pg) == '進階設定（每秒 60 格）', title(pg))
    pg.select_option("#modelSelect", 'full'); pg.wait_for_function("document.getElementById('modelStatus').textContent.includes('已就緒（full 模型）')", timeout=60000)
    check(title(pg) == '進階設定（每秒 60 格、full 模型）', title(pg))
    pg.uncheck("#voiceToggle"); pg.wait_for_timeout(100)
    check(title(pg) == '進階設定（每秒 60 格、full 模型、語音關）' and pg.evaluate("localStorage.getItem('voiceOn')") == '0', title(pg))
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(title(pg) == '進階設定（每秒 60 格、full 模型、語音關）' and not pg.evaluate("document.getElementById('advanced').open"), '重新整理後收起來、標題記得：' + title(pg))
    # 語音關：做錯也不唸（紅字照常）
    pg.click("#startBtn"); pg.wait_for_timeout(12000)
    check(pg.evaluate("window.__said") == [] and pg.evaluate("window.__tips"), '語音關：有紅字、不唸 ' + str(pg.evaluate("window.__said")))
    pg.click("#stopBtn"); pg.wait_for_timeout(300)
    pg.click("#advancedTitle"); pg.check("#voiceToggle"); pg.select_option("#fpsSelect", '30'); pg.select_option("#modelSelect", 'lite')
    pg.wait_for_function("document.getElementById('modelStatus').textContent.includes('已就緒（lite 模型）')", timeout=60000)
    check(title(pg) == '進階設定', '改回預設：' + title(pg))
    pg.evaluate("window.__said = []")
    pg.click("#startBtn"); pg.wait_for_timeout(12000)
    check('收緊腹部' in pg.evaluate("window.__said"), '語音開：唸出來 ' + str(pg.evaluate("window.__said")))
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
    for vw, vh in [(320, 640), (390, 844), (1280, 800)]:
        ctx, pg = fake_page(b, 'pushup_err', '?workout=pushup', vw, vh, vw < 600)
        pg.click("#advancedTitle"); pg.wait_for_timeout(200)
        r = pg.evaluate("() => ['#advanced', '#fpsSelect', '#modelSelect', '#voiceToggle'].map(s => document.querySelector(s).getBoundingClientRect().right).concat(document.documentElement.scrollWidth)")
        check(max(r[:4]) <= vw and r[4] == vw, f'{vw} 進階設定在畫面內 {r}')
        pg.locator(".start-card").screenshot(path=f"{HERE}/start_{vw}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
