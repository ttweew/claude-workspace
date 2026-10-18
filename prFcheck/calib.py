# 個人校正（js/analysis/calibrate.js）：站直不動 → 自動校正 → 手機放高也算得到
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8827, ROOT)
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


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for worker in ['', '&worker=0']:
        ctx, pg = fake_page(b, 'squat_high', '?workout=squat' + worker)
        pg.click("#startBtn")
        try:
            pg.wait_for_function("document.getElementById('autoNote').textContent.includes('已依你的站姿校正')", timeout=8000); note = True
        except Exception:
            note = False
        txt = pg.inner_text("#autoNote")
        check(note and re.search(r'站直時膝蓋 15\d°', txt) is not None, worker + ' 站直不動後自動校正：' + txt)
        pg.wait_for_timeout(12000)
        check(pg.text_content("#hudReps") == '3', worker + ' 手機放高（站直 158°）也算到 3 下：' + pg.text_content("#hudReps"))
        pg.click("#perfBtn"); pg.wait_for_timeout(500)
        check(re.search(r'校正：站直膝 15\d°', pg.inner_text("#perfBtn")) is not None, worker + ' 運算標籤寫校正：' + pg.inner_text("#perfBtn")[-60:])
        pg.click("#perfBtn")
        pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(600); pg.click("#recordBtn"); pg.wait_for_timeout(300)
        with pg.expect_download() as d:
            pg.click("#jsonBtn")
        meta = json.load(open(d.value.path()))['meta']
        check(meta.get('calibration') and 150 <= meta['calibration']['knee'] <= 160, worker + ' 錄製檔記下校正：' + str(meta.get('calibration')))
        check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:2]))
        ctx.close()
    # 重播分析沿用錄製檔的校正：校正好之後才開始錄（錄影裡沒有站直 1.5 秒的那段），重播也要算到 3 下；拿掉校正就算不到
    ctx, pg = fake_page(b, 'squat_high', '?workout=squat')
    pg.click("#startBtn")
    pg.wait_for_function("document.getElementById('autoNote').textContent.includes('已依你的站姿校正')", timeout=8000)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.click("#dataBtn"); pg.wait_for_timeout(11000)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(300)
    live = pg.text_content("#hudReps")
    with pg.expect_download() as d:
        pg.click("#jsonBtn")
    data = json.load(open(d.value.path()))
    def replay(obj):
        pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
        pg.set_input_files("#fileInput", files=[{"name": "r.json", "mimeType": "application/json", "buffer": json.dumps(obj).encode()}])
        pg.wait_for_function("!document.getElementById('squatCard').hidden && document.getElementById('squatSummary').textContent.length > 0", timeout=30000)
        pg.wait_for_timeout(300)
        return pg.evaluate("document.querySelectorAll('#squatTable tbody tr').length"), pg.inner_text("#squatSummary")
    n, summ = replay(data)
    check(live == '3' and n == 3, f'重播沿用錄製時的校正：鏡頭畫面 {live} 下、重播 {n} 下 {summ[:30]}')
    data['meta'].pop('calibration', None)
    n2, summ2 = replay(data)
    check(n2 == 0, f'拿掉校正（錄影裡沒有站直的那段）：重播 {n2} 下 {summ2[:30]}')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
    # 自由模式、伏地挺身不校正
    for wk in ['free', 'pushup']:
        ctx, pg = fake_page(b, 'squat_high', '?workout=' + wk)
        pg.click("#startBtn"); pg.wait_for_timeout(5000)
        check('校正' not in pg.inner_text("#autoNote"), wk + ' 不校正')
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
