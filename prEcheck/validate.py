# 驗證工具（js/analysis/validate.js）：記下角度 → 使用說明比對；重播分析頁分析四個動作（和鏡頭畫面同一套）
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8826, ROOT)
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


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 鏡頭畫面記下角度 → 使用說明頁填量角器 → 統計、CSV、清除
    ctx, pg = fake_page(b, 'pushup_err', '?workout=pushup')
    pg.click("#startBtn"); pg.wait_for_timeout(2500)
    pg.click("#dataBtn"); pg.wait_for_timeout(300)
    check(pg.inner_text("#snapInfo") == '', '還沒記之前沒有說明')
    pg.click("#snapBtn"); pg.wait_for_timeout(200)
    info = pg.inner_text("#snapInfo")
    check(re.match(r'第 1 筆：[左右]肘 \d+°', info) is not None, '記下第 1 筆（伏地挺身比對手肘）：' + info)
    pg.wait_for_timeout(1500); pg.click("#snapBtn"); pg.wait_for_timeout(1000); pg.click("#snapBtn")
    check(pg.inner_text("#snapInfo").startswith('第 3 筆'), pg.inner_text("#snapInfo"))
    # 錄一段給重播分析用（做錯的伏地挺身：第 2、3 下塌腰）
    pg.click("#stopBtn"); pg.wait_for_timeout(300)
    pg.goto(base + "help.html#experiments"); pg.wait_for_timeout(800)
    rows = pg.evaluate("document.querySelectorAll('#valRows tr').length")
    check(rows == 3 and pg.is_visible("#valWrap") and pg.is_hidden("#valEmpty"), f'使用說明頁列出 3 筆')
    sites = pg.evaluate("[...document.querySelectorAll('#valRows tr')].map(tr => parseFloat(tr.children[3].textContent))")
    for i, v in enumerate([sites[0] - 4, sites[1] + 2, sites[2] - 6]):
        pg.fill(f"#valRows tr:nth-child({i + 1}) input", str(round(v)))
    pg.wait_for_timeout(200)
    st = pg.inner_text("#valStats")
    check(st.startswith('已填 3 筆：平均誤差') and '±5° 以內' in st, '統計：' + st)
    # 換比對的關節
    pg.select_option("#valRows tr:nth-child(1) select", 'LEFT_HIP'); pg.wait_for_timeout(200)
    check('髖' in pg.evaluate("document.querySelector('#valRows tr select').selectedOptions[0].textContent"), '可以換關節')
    pg.reload(); pg.wait_for_timeout(800)
    check(pg.input_value("#valRows tr:nth-child(2) input") != '' and pg.evaluate("document.querySelector('#valRows tr select').value") == 'LEFT_HIP', '重新整理後填的還在')
    with pg.expect_download() as d:
        pg.click("#valCsv")
    csv = open(d.value.path(), encoding='utf-8-sig').read().splitlines()
    check(csv[0].startswith('時間,動作,拍攝方向,比對的關節,網站角度,量角器角度,差距') and len(csv) == 4 and ',pushup,' in csv[1], 'CSV：' + csv[1][:60])
    pg.on("dialog", lambda dlg: dlg.accept())
    pg.click("#valClear"); pg.wait_for_timeout(300)
    check(pg.is_visible("#valEmpty") and pg.is_hidden("#valWrap"), '清除全部')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
    # 2. 錄一段做錯的伏地挺身 → 重播分析頁用錄製時選的動作分析，每一下的判斷、錯誤和鏡頭畫面一樣
    ctx, pg = fake_page(b, 'pushup_err', '?workout=pushup')
    pg.click("#startBtn"); pg.wait_for_timeout(400)
    # 開始錄製後收起數據面板（面板開著時不跳每一下的提示），做完再打開停止
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.click("#dataBtn"); pg.wait_for_timeout(12500)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(300)
    live = pg.evaluate("window.__toasts")
    with pg.expect_download() as d:
        pg.click("#jsonBtn")
    path = d.value.path()
    meta = json.load(open(path))['meta']
    check(meta.get('workout') == 'pushup', '錄製檔 workout：' + str(meta.get('workout')))
    pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
    pg.set_input_files("#fileInput", files=[{"name": "pushup.json", "mimeType": "application/json", "buffer": open(path, 'rb').read()}])
    pg.wait_for_function("!document.getElementById('squatCard').hidden && document.getElementById('squatTable').rows.length > 1", timeout=30000)
    summ = pg.inner_text("#squatSummary")
    rows = pg.evaluate("[...document.querySelectorAll('#squatTable tbody tr')].map(tr => [...tr.children].map(c => c.textContent))")
    check(pg.inner_text("#workoutPick option:first-child") == '錄製時選的（伏地挺身）', '選單寫錄製時選的動作')
    check(summ.startswith('伏地挺身 3 下：到位 3') and '要注意：塌腰 2 下' in summ, '重播總結：' + summ)
    # 10/19（PR #86）起錯誤後面寫出最嚴重的數字（例如「塌腰 19°」）：比開頭
    check(len(rows) == 3 and rows[0][-1] == '—' and rows[1][-1].startswith('塌腰') and rows[2][-1].startswith('塌腰'), '每一下的錯誤：' + str([r[-1] for r in rows]))
    check(len(live) == 3 and all(('塌腰' in t) == r[-1].startswith('塌腰') for t, r in zip(live, rows)), '和鏡頭畫面的結果一樣：' + str(live))
    # 換成用深蹲分析：伏地挺身的檔案用深蹲看，算不到
    pg.select_option("#workoutPick", 'squat')
    pg.wait_for_function("document.getElementById('squatSummary').textContent.includes('深蹲')", timeout=30000)
    check('沒有偵測到完整的深蹲' in pg.inner_text("#squatSummary"), '自己選深蹲：' + pg.inner_text("#squatSummary"))
    # 舊的檔案（沒有記下動作）
    data = json.load(open(path)); data['meta'].pop('workout', None)
    pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
    pg.set_input_files("#fileInput", files=[{"name": "old.json", "mimeType": "application/json", "buffer": json.dumps(data).encode()}])
    pg.wait_for_function("!document.getElementById('squatCard').hidden", timeout=30000); pg.wait_for_timeout(500)
    check('錄製時沒有選動作' in pg.inner_text("#squatSummary") and pg.inner_text("#workoutPick option:first-child") == '錄製時沒有選動作', '舊檔案：' + pg.inner_text("#squatSummary"))
    pg.select_option("#workoutPick", 'pushup')
    pg.wait_for_function("document.getElementById('squatSummary').textContent.startsWith('伏地挺身')", timeout=30000)
    check(pg.inner_text("#squatSummary").startswith('伏地挺身 3 下'), '舊檔案自己選伏地挺身：' + pg.inner_text("#squatSummary")[:20])
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:2]))
    ctx.close()
    # 3. 棒式的檔案：表格是「第幾次、撐了幾秒」
    ctx, pg = fake_page(b, 'plank', '?workout=plank')
    pg.click("#startBtn"); pg.wait_for_timeout(400)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(20000); pg.click("#recordBtn"); pg.wait_for_timeout(300)
    with pg.expect_download() as d:
        pg.click("#jsonBtn")
    path = d.value.path()
    pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
    pg.set_input_files("#fileInput", files=[{"name": "plank.json", "mimeType": "application/json", "buffer": open(path, 'rb').read()}])
    pg.wait_for_function("document.getElementById('squatTable').rows.length > 1", timeout=30000)
    head_ = pg.evaluate("[...document.querySelectorAll('#squatTable thead th')].map(c => c.textContent)")
    check(head_ == ['第幾次', '時間', '撐了幾秒', '錯誤'] and re.match(r'棒式 1 次，最久 0:1\d', pg.inner_text("#squatSummary")) is not None, '棒式：' + pg.inner_text("#squatSummary"))
    ctx.close()
    # 4. 版面：使用說明比對表、重播分析在手機上不撐寬
    for vw in [320, 390]:
        ctx = b.new_context(viewport={"width": vw, "height": 800}, is_mobile=True, has_touch=True); pg = ctx.new_page()
        pg.add_init_script("""localStorage.setItem('angleSnapshots', JSON.stringify([1,2,3].map(i => ({ time: Date.now(), workout: 'squat', view: 'side', joint: 'LEFT_KNEE', measured: 90 + i, angles: { LEFT_KNEE: 92 + i, RIGHT_KNEE: null, LEFT_HIP: 120, RIGHT_HIP: null, LEFT_ELBOW: 170, RIGHT_ELBOW: null } }))));""")
        pg.goto(base + "help.html#experiments"); pg.wait_for_timeout(800)
        sw = pg.evaluate("document.documentElement.scrollWidth")
        check(sw == vw and pg.inner_text("#valStats").startswith('已填 3 筆'), f'{vw} 使用說明頁不撐寬 {sw}')
        pg.locator("#valTool").screenshot(path=f"{HERE}/val_{vw}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
