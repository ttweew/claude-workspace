# 運動總結（js/analysis/session.js）：關鏡頭後的總結、和上一次比較、紀錄、換動作也記下
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8825, ROOT)
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
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(WATCH)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg

lines = lambda pg: pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
hist = lambda pg: pg.evaluate("[...document.querySelectorAll('#historyList li')].map(li => li.textContent)")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx, pg = fake_page(b, 'pushup', '?workout=pushup')
    check(pg.is_hidden("#summary") and pg.is_hidden("#historyBox"), '一開始沒有總結、沒有紀錄')
    pg.click("#startBtn"); pg.wait_for_timeout(15000); pg.click("#stopBtn"); pg.wait_for_timeout(500)
    ls = lines(pg)
    check(pg.is_visible("#summary") and ls[0] == '伏地挺身 4 下：到位 3、再低一點 0、太淺 1', '關鏡頭後的總結：' + str(ls))
    check(any(l.startswith('最低 89°') for l in ls) and any('每下約' in l for l in ls), '角度、每下秒數')
    check(len(hist(pg)) == 1 and '伏地挺身 4 下' in hist(pg)[0] and '運動紀錄（1 次' in pg.inner_text("#historyBox summary"), '紀錄：' + str(hist(pg)))
    # 再做一次：和上一次比較
    pg.evaluate("window.__fakeStart && window.__fakeStart()")
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.is_hidden("#summary") and len(hist(pg)) == 1, '重新整理後紀錄還在')
    pg.click("#startBtn"); pg.wait_for_timeout(15000); pg.click("#stopBtn"); pg.wait_for_timeout(500)
    ls = lines(pg)
    check('次數和上次一樣' in ls and any(l.startswith('到位比例 75%，和上次一樣') for l in ls), '和上一次比較：' + str(ls))
    # 沒做任何一下就關：不記
    pg.click("#startBtn"); pg.wait_for_timeout(1500); pg.click("#stopBtn"); pg.wait_for_timeout(300)
    check(len(hist(pg)) == 2, '沒做就關不記：' + str(len(hist(pg))))
    pg.on("dialog", lambda d: d.accept())
    pg.click("#historyBox summary"); pg.click("#clearHistory"); pg.wait_for_timeout(300)
    check(pg.is_hidden("#summary") and pg.is_hidden("#historyBox") and pg.evaluate("localStorage.getItem('workoutHistory')") is None, '清除紀錄')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
    # 換動作：做到一半換成自由，也記下來
    ctx, pg = fake_page(b, 'lunge', '?workout=lunge')
    pg.click("#startBtn"); pg.wait_for_timeout(11000)
    pg.click("#demoBtn"); pg.click(".demo-tabs button:has-text('自由')"); pg.wait_for_timeout(300)
    pg.click("#demoClose"); pg.click("#stopBtn"); pg.wait_for_timeout(300)
    ls = lines(pg)
    check(ls and ls[0] == '弓箭步 3 下：到位 2、再低一點 0、太淺 1', '換動作時記下：' + str(ls))
    ctx.close()
    # 棒式：撐完起身 → 總結「棒式 1 次，最久 0:1x」；換每秒格數（重開鏡頭）不會清掉
    ctx, pg = fake_page(b, 'plank', '?workout=plank')
    pg.click("#startBtn"); pg.wait_for_timeout(21000); pg.click("#stopBtn"); pg.wait_for_timeout(500)
    ls = lines(pg)
    check(ls and re.match(r'棒式 1 次，最久 0:1[0-3]，總共 0:1[0-3]$', ls[0]) is not None, '棒式總結：' + str(ls))
    ctx.close()
    ctx, pg = fake_page(b, 'pushup', '?workout=pushup')
    pg.click("#startBtn"); pg.wait_for_timeout(9000)
    pg.click("#perfBtn"); pg.wait_for_timeout(300); pg.select_option("#fpsLive", 'auto'); pg.wait_for_timeout(3000)
    reps_after = pg.text_content("#hudReps")
    pg.click("#stopBtn"); pg.wait_for_timeout(500)
    ls = lines(pg)
    check(reps_after != '0' and ls and ls[0].startswith('伏地挺身 '), f'換每秒格數重開鏡頭：次數保留（{reps_after}），關鏡頭時一起記 {ls[:1]}')
    ctx.close()
    # 版面：總結和紀錄在首頁畫面內
    for vw, vh, mob in [(320, 640, True), (390, 844, True), (1280, 800, False)]:
        ctx, pg = fake_page(b, 'pushup', '?workout=pushup', vw, vh, mob)
        pg.click("#startBtn"); pg.wait_for_timeout(15000); pg.click("#stopBtn"); pg.wait_for_timeout(500)
        pg.click("#historyBox summary"); pg.wait_for_timeout(200)
        r = pg.evaluate("() => [document.getElementById('summary').getBoundingClientRect().right, document.getElementById('historyBox').getBoundingClientRect().right, document.documentElement.scrollWidth]")
        check(max(r[:2]) <= vw and r[2] == vw, f'{vw} 總結在畫面內 {r}')
        pg.locator(".start-card").screenshot(path=f"{HERE}/summary_{vw}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
