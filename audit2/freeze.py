# 地基審查：自我修復——鏡頭畫面停住了（iPhone 省電模式、切回來時停在最後一格、鏡頭驅動卡住）
#   1. 畫面暫停、繼續播放就好：3 秒後自動繼續播放，不用重開鏡頭
#   2. 繼續播放也沒用：8 秒後自動重開同一顆鏡頭，次數保留、繼續計算；錄製中會先停止（錄到的保留）
#   3. 重開了還是停住：不再一直重開，請使用者關掉鏡頭重開
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8854, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/loop_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/loop_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
SPY = """window.__opens = 0; window.__plays = 0;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } });
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async c => { window.__opens++; return gum(c); };
  const play = HTMLVideoElement.prototype.play;
  // 模擬：__noPlay 時繼續播放沒用；__noAutoplay 時新的鏡頭也不會自己播放（一直停住）
  HTMLVideoElement.prototype.play = function () { window.__plays++; return window.__noPlay ? Promise.resolve() : play.call(this); };
  const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject');
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get() { return desc.get.call(this); },
    set(v) { desc.set.call(this, v); if (window.__noAutoplay && v) setTimeout(() => this.pause(), 0); } });"""
def page(b, kind, q):
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    pg = ctx.new_page(); pg.errs = []; pg.logs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.on("console", lambda m: pg.logs.append(m.text))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(SPY)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg
reps = lambda pg: int(pg.text_content("#hudReps"))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 暫停：3 秒後自動繼續播放，不用重開鏡頭
    ctx, pg = page(b, 'pushup_err', '?workout=pushup')
    pg.click("#startBtn"); pg.wait_for_timeout(12000)
    r0 = reps(pg)
    pg.evaluate("document.getElementById('video').pause()")
    pg.wait_for_timeout(5000)
    check(not pg.evaluate("document.getElementById('video').paused") and pg.evaluate("window.__opens") == 1 and pg.is_hidden("#autoNote"),
          f'暫停 → 自動繼續播放（沒有重開鏡頭：開了 {pg.evaluate("window.__opens")} 次）')
    pg.wait_for_timeout(8000)
    check(reps(pg) > r0 and not pg.errs, f'之後繼續算次數：{r0} → {reps(pg)} {pg.errs[:1]}')
    ctx.close()

    # 2. 繼續播放沒用：8 秒後重開鏡頭；次數保留；錄製中的先停止、錄到的保留
    ctx, pg = page(b, 'pushup_err', '?workout=pushup')
    pg.click("#startBtn"); pg.wait_for_timeout(12000)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(2000); pg.click("#dataBtn")
    r0 = reps(pg)
    pg.evaluate("window.__noPlay = true; document.getElementById('video').pause()")
    pg.wait_for_timeout(4000)
    check(pg.evaluate("window.__opens") == 1, '停住 4 秒：還沒重開（先試繼續播放）')
    pg.wait_for_timeout(5500)
    note = pg.inner_text("#autoNote") if pg.is_visible("#autoNote") else ''
    check(pg.evaluate("window.__opens") == 2 and '鏡頭畫面停住了' in note, f'停住 9 秒：自動重開鏡頭（{note}）')
    pg.evaluate("window.__noPlay = false")
    pg.wait_for_timeout(12000)
    r1 = reps(pg)
    check(r1 > r0, f'重開後繼續算，次數保留：{r0} → {r1}')
    pg.click("#dataBtn")
    info = pg.inner_text("#recordInfo")
    check(info.startswith('已錄') and not pg.is_hidden("#jsonBtn"), '錄製先停止、錄到的保留：' + info)
    check(not pg.errs, '沒有程式錯誤 ' + str(pg.errs[:1]))
    ctx.close()

    # 3. 重開了還是停住：不再一直重開，請使用者關掉鏡頭重開
    ctx, pg = page(b, 'pushup_err', '?workout=pushup')
    pg.click("#startBtn"); pg.wait_for_timeout(5000)
    pg.evaluate("window.__noPlay = true; window.__noAutoplay = true; document.getElementById('video').pause()")
    pg.wait_for_timeout(30000)
    opens = pg.evaluate("window.__opens")
    status = pg.inner_text("#poseStatus")
    check(opens == 2 and '請關閉鏡頭再重新開啟' in status, f'一直停住：只重開 1 次（開了 {opens} 次），然後請使用者自己重開：「{status}」')
    pg.evaluate("window.__noPlay = false; window.__noAutoplay = false")
    pg.click("#stopBtn"); pg.wait_for_timeout(500); pg.click("#startBtn"); pg.wait_for_timeout(6000)
    check('已偵測到全身' in pg.inner_text("#poseStatus") or pg.is_visible("#banner"), '使用者重開鏡頭後恢復：' + pg.inner_text("#poseStatus"))
    check(not pg.errs, '沒有程式錯誤 ' + str(pg.errs[:1]))
    ctx.close()

    # 4. 網頁在背景時不算停住（不會偷偷重開鏡頭）
    ctx, pg = page(b, 'pushup_err', '?workout=pushup')
    pg.add_init_script("")
    pg.click("#startBtn"); pg.wait_for_timeout(4000)
    pg.evaluate("""Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
                   Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
                   window.__noPlay = true; document.getElementById('video').pause(); document.dispatchEvent(new Event('visibilitychange'));""")
    pg.wait_for_timeout(12000)
    check(pg.evaluate("window.__opens") == 1, '在背景 12 秒：沒有重開鏡頭')
    pg.evaluate("""Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
                   Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
                   window.__noPlay = false; document.dispatchEvent(new Event('visibilitychange'));""")
    pg.wait_for_timeout(4000)
    check(not pg.evaluate("document.getElementById('video').paused") and pg.evaluate("window.__opens") == 1, '切回來：繼續播放，不用重開')
    ctx.close()
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
