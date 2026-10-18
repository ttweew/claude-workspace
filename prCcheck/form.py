# 動作錯誤判斷（js/analysis/form.js）：從鏡頭畫面端到端：紅字、標紅、每一下的提示、語音
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8824, ROOT)
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
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak(u) { if (u.text.trim()) window.__said.push(u.text); else window.__unlock = (window.__unlock || 0) + 1; } } });
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
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(WATCH)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg

# 畫布上有沒有紅線（做錯的部位）：數一下紅色像素
RED_PIXELS = "(() => { const c = document.getElementById('overlay'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] < 90 && d[i + 3] > 150) n++; return n; })()"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for worker in ['', '&worker=0']:
        tag = '（主畫面）' if worker else ''
        # 伏地挺身：第 1 下標準，第 2、3 下塌腰
        ctx, pg = fake_page(b, 'pushup_err', '?workout=pushup' + worker)
        pg.click("#startBtn")
        reds = []
        for k in range(26):
            pg.wait_for_timeout(500); reds.append(pg.evaluate(RED_PIXELS))
        toasts = pg.evaluate("window.__toasts"); tips = pg.evaluate("window.__tips"); said = pg.evaluate("window.__said")
        check(len(toasts) == 3 and '塌腰' not in toasts[0] and '[good]' in toasts[0] and all(re.search(r'· 塌腰( · 相似 \d+%)? \[close\]', t) for t in toasts[1:]), tag + '伏地挺身每一下：' + str(toasts))
        check(tips == ['腰塌下去了，收緊腹部'], tag + '紅字：' + str(tips))
        check(max(reds) > max(reds[:8]) + 800, f'{tag}做錯時骨架多了紅線（標準那一下最多 {max(reds[:8])}、做錯時最多 {max(reds)} 個紅色像素；關節本來就是紅點）')
        check('收緊腹部' in said and '1 下' in said and said.count('收緊腹部') <= 2, tag + '語音：' + str(said))
        check(not pg.errs, tag + '沒有錯誤 ' + str(pg.errs[:2]))
        ctx.close()
    # 深蹲：第 2 下上身太前傾
    ctx, pg = fake_page(b, 'squat_err', '?workout=squat')
    pg.click("#startBtn"); pg.wait_for_timeout(11000)
    toasts = pg.evaluate("window.__toasts"); tips = pg.evaluate("window.__tips"); said = pg.evaluate("window.__said")
    check(len(toasts) == 2 and '前傾' not in toasts[0] and '上身前傾' in toasts[1], '深蹲每一下：' + str(toasts))
    check(tips == ['上身太前傾，胸口挺起來'] and '胸口挺起來' in said, f'深蹲紅字 {tips}、語音 {said}')
    ctx.close()
    # 弓箭步：第 1 下前膝超過腳尖
    ctx, pg = fake_page(b, 'lunge_err', '?workout=lunge')
    pg.click("#startBtn"); pg.wait_for_timeout(9500)
    toasts = pg.evaluate("window.__toasts"); tips = pg.evaluate("window.__tips")
    check(len(toasts) == 2 and '膝超過腳尖' in toasts[0] and '膝超過腳尖' not in toasts[1], '弓箭步每一下：' + str(toasts))
    check(tips == ['前膝超過腳尖了，步伐跨大一點'], '弓箭步紅字：' + str(tips))
    ctx.close()
    # 音量關：不唸；自由模式：不判斷
    ctx, pg = fake_page(b, 'pushup_err', '?workout=pushup')
    pg.evaluate("localStorage.setItem('soundLevel', 'off')"); pg.reload(); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(13000)
    check(pg.evaluate("window.__said") == [] and pg.evaluate("window.__tips"), '音量關：有紅字但不唸 ' + str(pg.evaluate("window.__said")))
    ctx.close()
    ctx, pg = fake_page(b, 'pushup_err', '?workout=free')
    pg.click("#startBtn"); pg.wait_for_timeout(13000)
    check(pg.evaluate("window.__tips") == [] and pg.evaluate("window.__said") == [] and pg.evaluate(RED_PIXELS) < 50, '自由模式不判斷')
    ctx.close()
    # 版面：紅字在畫面內
    for vw, vh, mob in [(320, 640, True), (844, 390, True), (1280, 800, False)]:
        ctx, pg = fake_page(b, 'pushup_err', '?workout=pushup', vw, vh, mob)
        pg.click("#startBtn")
        try:
            pg.wait_for_function("!document.getElementById('formTip').hidden", timeout=15000); shown = True
        except Exception:
            shown = False
        r = pg.evaluate("() => { const a = document.getElementById('formTip').getBoundingClientRect(); return [a.left, a.top, a.right, a.bottom, document.documentElement.scrollWidth]; }")
        check(shown and r[0] >= 0 and r[2] <= vw and r[4] == vw, f'{vw}x{vh} 紅字在畫面內 {[round(x) for x in r]}')
        pg.screenshot(path=f"{HERE}/form_{vw}x{vh}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
