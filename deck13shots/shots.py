# 第三次報告簡報用的截圖：假的 AI（示範動畫做成的骨架），背景換成單純的房間（不放真人照片，免得骨架和人對不上）
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8841, ROOT)
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
NO_SPEECH = "Object.defineProperty(window, 'speechSynthesis', { value: { speak() {}, cancel() {}, getVoices: () => [], speaking: false, pending: false, addEventListener() {} } });"
def fake_page(b, kind, q, vw=1280, vh=800, mobile=False, init=''):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2)
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=f"{HERE}/room.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(NO_SPEECH)
    if init: pg.add_init_script(init)
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    return ctx, pg
def wait_for(pg, js, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        if pg.evaluate(js): return True
        pg.wait_for_timeout(50)
    return False

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 深蹲：做到第 3 下以後、蹲到底的時候
    ctx, pg = fake_page(b, 'squat5', '?workout=squat')
    pg.click("#startBtn")
    ok = wait_for(pg, "(() => { const n = +document.getElementById('hudReps').textContent; const v = [...document.querySelectorAll('#hud .metric-value')].map(e => parseInt(e.textContent)); return n >= 3 && v[0] < 95; })()")
    pg.screenshot(path=f"{HERE}/squat.png"); print('squat', ok, pg.text_content('#hudReps'), pg.errs[:1])
    ctx.close()
    # 2. 錯誤判斷：伏地挺身腰塌（紅線＋紅字）
    ctx, pg = fake_page(b, 'pushup_err', '?workout=pushup')
    pg.click("#startBtn")
    ok = wait_for(pg, "!document.getElementById('formTip').hidden")
    pg.wait_for_timeout(250)
    pg.screenshot(path=f"{HERE}/form.png"); print('form', ok, pg.inner_text('#formTip'), pg.errs[:1])
    ctx.close()
    # 3. 運動總結：先放一筆「上一次」的深蹲紀錄，這次做 4 下（第 2 下前傾、第 3 下太淺）
    prev = {"workout": "squat", "date": int(time.time() * 1000) - 86400000, "minutes": 2, "count": 3, "clean": 3, "errors": {}, "good": 2, "close": 0, "shallow": 1, "best": 86, "average": 94, "tempo": 2.6, "similarity": 88}
    ctx, pg = fake_page(b, 'squat_mix', '?workout=squat', vw=390, vh=844, mobile=True, init="localStorage.setItem('workoutHistory', JSON.stringify([%s]));" % json.dumps(prev))
    pg.click("#startBtn"); pg.wait_for_timeout(16000)
    pg.click("#stopBtn"); pg.wait_for_timeout(600)
    pg.click("#historyBox summary"); pg.wait_for_timeout(200)
    pg.locator(".start-card").screenshot(path=f"{HERE}/summary.png")
    print('summary', pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)"), pg.errs[:1])
    ctx.close()
    # 4. 驗證實驗 A：填了示範數字的比對表
    ctx = b.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=2); pg = ctx.new_page()
    snaps = []
    for i, (site, meas, joint) in enumerate([(92.4, 90, 'LEFT_KNEE'), (118.6, 121, 'LEFT_KNEE'), (165.2, 168, 'LEFT_KNEE'), (101.8, 97, 'LEFT_KNEE'), (143.1, 140, 'LEFT_HIP')]):
        ang = {"LEFT_KNEE": site if joint == 'LEFT_KNEE' else 120.0, "RIGHT_KNEE": None, "LEFT_HIP": site if joint == 'LEFT_HIP' else 150.0, "RIGHT_HIP": None, "LEFT_ELBOW": 168.0, "RIGHT_ELBOW": None}
        snaps.append({"time": int(time.time() * 1000) - (5 - i) * 60000, "workout": "squat", "view": "side", "joint": joint, "measured": meas, "angles": ang})
    pg.add_init_script("localStorage.setItem('angleSnapshots', JSON.stringify(%s));" % json.dumps(snaps))
    pg.goto(base + "help.html#experiments"); pg.wait_for_timeout(1000)
    pg.locator("#valTool").screenshot(path=f"{HERE}/validate.png"); print('validate', pg.inner_text('#valStats'))
    ctx.close()
    # 5. 重播分析：錄一段深蹲（第 2 下前傾），丟進重播分析頁看「動作分析」表格（相似度、錯誤）
    ctx, pg = fake_page(b, 'squat_mix', '?workout=squat')
    ctx2 = ctx
    pg.click("#startBtn"); pg.wait_for_timeout(400)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.click("#dataBtn"); pg.wait_for_timeout(15000)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(300)
    with pg.expect_download() as d:
        pg.click("#jsonBtn")
    path = d.value.path()
    pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
    pg.set_input_files("#fileInput", files=[{"name": "squat.json", "mimeType": "application/json", "buffer": open(path, 'rb').read()}])
    pg.wait_for_function("document.getElementById('squatTable').rows.length > 1", timeout=30000); pg.wait_for_timeout(400)
    pg.locator("#squatCard").screenshot(path=f"{HERE}/replay.png"); print('replay', pg.inner_text('#squatSummary'))
    ctx.close()
    # 6. 首頁「進階設定」打開
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2); pg = ctx.new_page()
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.add_init_script("localStorage.setItem('cameraFps', 'auto'); localStorage.setItem('poseModel', 'auto');")
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#advanced summary"); pg.wait_for_timeout(300)
    pg.locator("#advanced").screenshot(path=f"{HERE}/advanced.png"); print('advanced', pg.inner_text('#advancedTitle'))
    ctx.close()
    b.close()
