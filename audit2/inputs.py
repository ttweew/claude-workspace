# 地基審查：外部來的資料（網址參數、這台裝置存的資料、錄製檔）被改過或故意做壞時，網頁不能壞、不能執行裡面的程式、數字不能出現 NaN
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8851, ROOT)
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
# 頁面上任何一段文字出現 NaN、undefined、function、[object 都算壞掉；alert 被叫到代表檔案裡的程式被執行了
BAD_TEXT = r"NaN|undefined|function |\[object |Infinity"
SPY = """window.__alerts = 0; window.alert = () => { window.__alerts++; };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } });"""
def page(b, kind, url, store=None, vw=1280, vh=800):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, accept_downloads=True)
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn(kind))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(SPY)
    if store:
        pg.add_init_script("try { " + ''.join(f"localStorage.setItem({json.dumps(k)}, {json.dumps(v)});" for k, v in store.items()) + " } catch (e) {}")
    pg.goto(base + url)
    return ctx, pg
def visible_text(pg):
    return pg.evaluate("document.body.innerText")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 網址參數：JavaScript 內建的名字、奇怪的值
    for q in ['?workout=constructor', '?workout=__proto__', '?workout=toString', '?workout=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E',
              '?model=constructor', '?model=toString', '?res=constructor', '?res=__proto__', '?fps=constructor', '?fps=1e9', '?fps=-30',
              '?lab=constructor', '?workout=hasOwnProperty&model=valueOf&res=toString&fps=__proto__']:
        ctx, pg = page(b, 'pushup', 'index.html' + q)
        try:
            pg.wait_for_function(READY, timeout=60000)
            ready = True
        except Exception:
            ready = False
        status = pg.inner_text("#modelStatus")
        pg.click("#startBtn"); pg.wait_for_timeout(4000)
        txt = visible_text(pg)
        bad = re.findall(BAD_TEXT, txt)
        check(ready and '已就緒' in status and not pg.errs and not bad and pg.evaluate("window.__alerts") == 0,
              f'網址 {q}：AI {status[:14]}、錯誤 {pg.errs[:1]}、怪字 {bad[:2]}、動作 {pg.inner_text("#demoBtnText")}')
        ctx.close()
    for q in ['?workout=constructor', '?workout=__proto__']:
        ctx, pg = page(b, 'pushup', 'replay.html' + q)
        pg.wait_for_timeout(800); pg.click("#demoSide")
        pg.wait_for_function("!document.getElementById('result').hidden", timeout=30000); pg.wait_for_timeout(500)
        txt = visible_text(pg)
        check(not pg.errs and not re.findall(BAD_TEXT, txt) and pg.inner_text("#workoutPick option:first-child") == '錄製時沒有選動作',
              f'重播頁 {q}：{pg.errs[:1]} 選單「{pg.inner_text("#workoutPick option:first-child")}」')
        ctx.close()

    # 2. 這台裝置存的資料被改壞：網頁照常、壞掉的紀錄不顯示
    good = {"workout": "pushup", "date": 1760000000000, "minutes": 1, "count": 2, "clean": 2, "errors": {}, "good": 2, "close": 0, "shallow": 0, "best": 88, "average": 90, "tempo": 2.1, "similarity": 93}
    poison = {
        'workout': 'constructor', 'cameraFps': 'constructor', 'poseModel': '__proto__', 'autoModel': 'toString', 'soundLevel': 'constructor',
        'voiceOn': '{}', 'recordCountdown': '<b>', 'recordLimit': '1e9', 'panelCollapsed': 'x', 'panelSmooth': 'x', 'showLabels': 'x',
        'adviceSkipped': '{"a":1}',
        'workoutHistory': json.dumps([None, 5, "x", {"workout": "constructor", "count": 1}, {**good, "count": "NaN"}, {**good, "errors": ["x"]},
                                      {**good, "best": None}, {**good, "workout": "plank"}, good]),
        'angleSnapshots': json.dumps([None, {"joint": "constructor", "angles": {}}, {"time": 1, "workout": "=1+1", "view": "<img>", "joint": "LEFT_KNEE", "angles": {"LEFT_KNEE": "x"}, "measured": "y"},
                                      {"time": 2, "workout": "squat", "view": "side", "joint": "LEFT_KNEE", "angles": {"LEFT_KNEE": 92.4}, "measured": 90}])
    }
    ctx, pg = page(b, 'pushup', 'index.html', {'workout': 'constructor'})
    pg.wait_for_function(READY, timeout=60000)
    check(pg.inner_text("#demoBtnText") == '選擇動作' and not pg.errs, '存的動作是 constructor：當作自由模式 ' + str(pg.errs[:1]))
    ctx.close()
    ctx, pg = page(b, 'pushup', 'index.html?workout=pushup', poison)
    pg.wait_for_function(READY, timeout=60000)
    hist = pg.evaluate("[...document.querySelectorAll('#historyList li')].map(li => li.textContent)")
    check(len(hist) == 1 and '伏地挺身 2 下' in hist[0], '壞掉的紀錄不顯示、好的照常：' + str(hist))
    pg.click("#startBtn"); pg.wait_for_timeout(16000)
    pg.click("#stopBtn"); pg.wait_for_timeout(500)
    txt = visible_text(pg)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    check(not pg.errs and not re.findall(BAD_TEXT, txt) and lines and lines[0].startswith('伏地挺身 4 下') and any('比上次多 2 下' in l for l in lines),
          f'存的資料被改壞：照常計算、和上一次（好的那筆）比較 {lines} 錯誤 {pg.errs[:1]}')
    stored = json.loads(pg.evaluate("localStorage.getItem('workoutHistory')"))
    check(len(stored) == 2, '存新的一筆時，壞掉的被整理掉：剩 ' + str(len(stored)))
    pg.goto(base + "help.html#experiments"); pg.wait_for_timeout(800)
    rows = pg.evaluate("[...document.querySelectorAll('#valRows tr')].map(tr => [...tr.children].map(c => c.textContent))")
    st = pg.inner_text("#valStats")
    check(len(rows) == 2 and rows[1][3] == '92.4°' and rows[1][5] == '+2.4°' and st.startswith('已填 1 筆：平均誤差 2.4°') and not pg.errs,
          f'驗證表：壞掉的整理掉，網站角度寫到小數第 1 位、差距對得起來 {rows} {st}')
    # 量角器打錯字：900 不算，框變紅
    pg.fill("#valRows tr:nth-child(2) input", "900"); pg.wait_for_timeout(200)
    check(pg.get_attribute("#valRows tr:nth-child(2) input", "aria-invalid") == 'true' and '填入量角器的角度' in pg.inner_text("#valStats"),
          '量角器打 900：框變紅、不算進統計 ' + pg.inner_text("#valStats")[:30])
    pg.fill("#valRows tr:nth-child(2) input", "95"); pg.wait_for_timeout(200)
    check(pg.get_attribute("#valRows tr:nth-child(2) input", "aria-invalid") == 'false' and '平均誤差 2.6°' in pg.inner_text("#valStats"),
          '改成 95：恢復 ' + pg.inner_text("#valStats")[:40])
    with pg.expect_download() as d:
        pg.click("#valCsv")
    csv = open(d.value.path(), encoding='utf-8-sig').read()
    check("=1+1" not in csv or "'=1+1" in csv, 'CSV 沒有會被 Excel 當成公式的格子')
    ctx.close()

    # 3. 特製的錄製檔：動作是內建的名字、校正不是數字、時間亂跳、座標是奇怪的值、meta 裡放 HTML
    ctx, pg = page(b, 'pushup', 'index.html?workout=pushup')
    pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(400)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.click("#dataBtn"); pg.wait_for_timeout(12000)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(300)
    with pg.expect_download() as d:
        pg.click("#jsonBtn")
    rec = json.load(open(d.value.path()))
    # 錄製檔的時間：一格一格往上加、不重複
    ts = [f['t'] for f in rec['frames']]
    check(all(b2 > a for a, b2 in zip(ts, ts[1:])) and ts[0] == 0, f'錄製檔的時間一直往上加（{len(ts)} 格，{ts[-1]} 毫秒）')
    def replay(obj, name='x.json'):
        pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
        pg.set_input_files("#fileInput", files=[{"name": name, "mimeType": "application/json", "buffer": json.dumps(obj).encode()}])
        try:
            pg.wait_for_function("!document.getElementById('result').hidden || document.getElementById('loadStatus').classList.contains('error')", timeout=30000)
        except Exception:
            pass
        pg.wait_for_timeout(500)
        return pg.inner_text("#loadStatus"), visible_text(pg)
    import copy
    cases = []
    c = copy.deepcopy(rec); c['meta']['workout'] = 'constructor'; cases.append(('meta.workout=constructor', c, '錄製時沒有選動作'))
    c = copy.deepcopy(rec); c['meta']['workout'] = '__proto__'; cases.append(('meta.workout=__proto__', c, '錄製時沒有選動作'))
    c = copy.deepcopy(rec); c['meta']['calibration'] = {'knee': '1e999', 'tilt': {}}; c['meta']['workout'] = 'squat'; cases.append(('校正不是數字', c, None))
    c = copy.deepcopy(rec); c['meta']['videoWidth'] = '<img src=x onerror=alert(1)>'; c['meta']['userAgent'] = '<script>alert(1)</script>'; cases.append(('meta 放 HTML', c, None))
    c = copy.deepcopy(rec); c['frames'] = list(reversed(c['frames'])); cases.append(('時間倒著走', c, None))
    c = copy.deepcopy(rec)
    for f in c['frames'][::7]: f['t'] = c['frames'][0]['t']
    cases.append(('很多格時間一樣', c, None))
    c = copy.deepcopy(rec)
    for f in c['frames'][::5]:
        if f['landmarks']: f['landmarks'][25] = ['NaN', 1e308, -1e308, 'x']; f['landmarks'][26] = [None, None, None, None]
    cases.append(('座標是奇怪的值', c, None))
    for name, obj, expect in cases:
        status, txt = replay(obj)
        bad = re.findall(BAD_TEXT, txt)
        good_pick = expect is None or pg.inner_text("#workoutPick option:first-child") == expect
        check(not pg.errs and not bad and pg.evaluate("window.__alerts") == 0 and good_pick,
              f'錄製檔「{name}」：{status[:30]} 怪字 {bad[:2]} 錯誤 {pg.errs[:1]} 選單 {pg.inner_text("#workoutPick option:first-child")}')
        pg.errs.clear()
    # 選錯檔案（例如 401 MB 的影片）：直接說明，不整個讀進來
    pg.goto(base + "replay.html"); pg.wait_for_timeout(500)
    pg.evaluate("""() => { const f = new File([new Uint8Array(401e6)], 'video.mp4', { type: 'video/mp4' });
        const dt = new DataTransfer(); dt.items.add(f); const input = document.getElementById('fileInput');
        input.files = dt.files; input.dispatchEvent(new Event('change')); }""")
    pg.wait_for_timeout(800)
    st = pg.inner_text("#loadStatus")
    check('檔案太大（401 MB）' in st and pg.is_hidden("#result") and not pg.errs, '選錯 401 MB 的檔案：' + st[:40])
    ctx.close()

    # 4. 錄製中不能換動作：其他動作變灰、按了也不會換；停止後可以換
    ctx, pg = page(b, 'pushup', 'index.html?workout=pushup')
    pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(600)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.click("#dataBtn"); pg.wait_for_timeout(300)
    pg.click("#demoBtn"); pg.wait_for_timeout(200)
    dis = pg.evaluate("[...document.querySelectorAll('.demo-tabs button')].map(b => [b.dataset.exercise, b.disabled])")
    check(all(d == (e != 'pushup') for e, d in dis) and pg.is_visible("#demoLock"), '錄製中：其他動作變灰、有說明 ' + str(dis))
    pg.evaluate("document.querySelector('.demo-tabs button[data-exercise=\"squat\"]').click()"); pg.wait_for_timeout(200)
    check(pg.inner_text("#demoBtnText") == '伏地挺身', '錄製中按深蹲也不會換：' + pg.inner_text("#demoBtnText"))
    pg.click("#demoClose"); pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(300); pg.click("#dataBtn")
    pg.click("#demoBtn"); pg.wait_for_timeout(200)
    check(pg.evaluate("[...document.querySelectorAll('.demo-tabs button')].every(b => !b.disabled)") and pg.is_hidden("#demoLock"), '停止錄製後可以換')
    pg.click(".demo-tabs button[data-exercise='squat']"); pg.wait_for_timeout(300)
    check(pg.inner_text("#demoBtnText") == '深蹲' and not pg.errs, '換成深蹲 ' + str(pg.errs[:1]))
    ctx.close()

    # 5. 棒式撐到一半就關網頁：撐到現在的算一次，記進紀錄
    ctx, pg = page(b, 'plank', 'index.html?workout=plank')
    pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(6500)
    pg.goto(base + "help.html"); pg.wait_for_timeout(500)
    hist = json.loads(pg.evaluate("localStorage.getItem('workoutHistory') || '[]'"))
    check(len(hist) == 1 and hist[0]['workout'] == 'plank' and hist[0]['best'] >= 3, '棒式撐到一半關網頁也記下來：' + str([(h['workout'], h.get('best')) for h in hist]))
    ctx.close()
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
