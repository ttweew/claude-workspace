# AI 模型選擇（js/ai/model-choice.js）：lite／full／自動、不重新載入網頁換模型、失敗時回到原本的、錄製檔記下
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8821, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
# 假鏡頭：照要求的每秒格數送畫面（最多 camMax），getCapabilities 回報上限（camMax 為 0 時不回報）
CAM = NO_COUNTDOWN + """
window.__constraints = []; window.__applied = [];
navigator.mediaDevices.getUserMedia = async (c) => {
  window.__constraints.push(JSON.stringify(c));
  const camMax = %d;
  const want = c && c.video && c.video.frameRate ? c.video.frameRate.ideal : 30;
  let fps = Math.min(want, camMax || 30);
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d'); const s = Math.min(cv.width / im.width, cv.height / im.height);
  const dw = im.width * s, dh = im.height * s; let k = 0;
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, cv.width, cv.height); if (!window.__nobody) g.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh); g.fillStyle = k++ %% 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); };
  draw(); let timer = setInterval(draw, 1000 / fps);
  const stream = cv.captureStream();
  const tr = stream.getVideoTracks()[0]; const gs = tr.getSettings.bind(tr);
  tr.getSettings = () => ({ ...gs(), frameRate: fps });
  tr.getCapabilities = () => camMax ? { frameRate: { min: 1, max: camMax } } : {};
  tr.applyConstraints = async (c2) => {
    window.__applied.push(JSON.stringify(c2));
    if (window.__rejectApply) throw new Error('不支援');
    fps = Math.min(c2.frameRate.ideal, camMax || 30);
    clearInterval(timer); timer = setInterval(draw, 1000 / fps);
  };
  return stream;
};"""

NOBODY = "window.__nobody = true;"
CAM2 = CAM
# 測試時把量測結果換成指定的數字（只換 advise 的輸入，量測、顯示、按鈕都是真的）
def fake_advisor(pg):
    def handle(route):
        r = route.fetch(); body = r.text()
        body = body.replace("export function advise(m) {", "export function advise(m) {\n    if (window.__fake) m = { ...m, ...window.__fake };")
        body = body.replace("    second(s, rate, cameraMax) {", "    second(s, rate, cameraMax) {\n        if (window.__fakeSec) s = { ...s, ...window.__fakeSec };\n        window.__secs = (window.__secs || 0) + 1;")
        assert 'window.__fake' in body
        route.fulfill(response=r, body=body)
    pg.route("**/js/ai/advisor.js", handle)
def page(b, vw=1280, vh=800, cam_max=60, fake=None, nobody=False, mobile=False):
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page(); pg.errs = []; pg.logs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.on("console", lambda m: pg.logs.append((m.text, pg.evaluate("performance.now()") if False else None)) if '速度量測' in m.text else None)
    mock_network(pg); fake_advisor(pg)
    full = MP + "/pose_landmarker_full.task"
    pg.route(MODEL.replace('lite', 'full'), lambda r: r.fulfill(path=full if os.path.exists(full) else MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.add_init_script((NOBODY if nobody else '') + (f"window.__fake = {json.dumps(fake)};" if fake else '') + CAM2 % cam_max)
    return ctx, pg
def open_cam(pg, url="index.html"):
    pg.goto(base + url); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_function("document.getElementById('stage').hidden === false", timeout=10000)
    return pg.evaluate("performance.now()")
def wait_advice(pg, timeout=25000):
    try:
        pg.wait_for_function("!document.getElementById('advice').hidden", timeout=timeout); return True
    except Exception:
        return False
advice_text = lambda pg: pg.inner_text("#advice")

opts = lambda pg, sel: pg.evaluate(f"[...document.querySelectorAll('{sel} option')].map(o => (o.disabled ? 'x ' : '') + o.textContent)")
applied = lambda pg: pg.evaluate("window.__applied")
def wait_note(pg, text, timeout=30000):
    try:
        pg.wait_for_function("t => { const e = document.getElementById('autoNote'); return !e.hidden && e.textContent.includes(t); }", arg=text, timeout=timeout); return True
    except Exception:
        return False
def badge(pg):
    if pg.is_hidden("#fpsLive"): pg.click("#perfBtn"); pg.wait_for_timeout(1200)
    return pg.inner_text("#perfBtn")

FULL_URL = MODEL.replace('lite', 'full')
def track(pg):
    pg.models = []
    pg.on("request", lambda r: pg.models.append('full' if 'pose_landmarker_full' in r.url else 'lite') if r.url.endswith('.task') else None)
def wait_status(pg, text, timeout=60000):
    try:
        pg.wait_for_function("t => document.getElementById('modelStatus').textContent.includes(t)", arg=text, timeout=timeout); return True
    except Exception:
        return False
def detected(pg, timeout=20000):
    try:
        pg.wait_for_function("document.getElementById('poseStatus').textContent.includes('已偵測到全身')", timeout=timeout); return True
    except Exception:
        return False
mopts = lambda pg, sel: pg.evaluate(f"[...document.querySelectorAll('{sel} option')].map(o => o.textContent)")
# 首頁的每秒格數、AI 模型收進「進階設定」（PR #79）：測試一開始就打開
CAM2 += "\ndocument.addEventListener('DOMContentLoaded', () => { const d = document.getElementById('advanced'); if (d) d.open = true; });"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for worker in ['', '?worker=0']:
        tag = '（主畫面運算）' if worker else ''
        # 1. 預設 lite；首頁選 full：不重新載入網頁就換好；開鏡頭標籤寫 full；錄製檔記下
        ctx, pg = page(b, cam_max=30); track(pg)
        pg.goto(base + "index.html" + worker); pg.wait_for_function(READY, timeout=60000)
        pg.evaluate("window.__marker = 1")
        check(pg.input_value("#modelSelect") == 'lite' and pg.is_hidden("#modelPickHint") and pg.models == ['lite'], tag + '預設 lite，只下載 lite ' + str(pg.models))
        check(mopts(pg, '#modelSelect') == ['lite（較快，建議）', 'full（較準、較慢）', '自動（先用 full，太慢改 lite，實驗）'], tag + '選項：' + str(mopts(pg, '#modelSelect')))
        pg.select_option("#modelSelect", 'full')
        check(wait_status(pg, '已就緒（full 模型）'), tag + '換成 full：' + pg.inner_text("#modelStatus"))
        check(pg.evaluate("window.__marker") == 1 and pg.models == ['lite', 'full'] and pg.evaluate("localStorage.getItem('poseModel')") == 'full', tag + '沒有重新載入網頁、下載 full、記住 ' + str(pg.models))
        check(pg.is_visible("#modelPickHint") and '1.5 倍' in pg.inner_text("#modelPickHint"), tag + 'full 的說明')
        pg.click("#startBtn")
        check(detected(pg), tag + 'full 偵測到人')
        pg.wait_for_timeout(1500)
        bd = badge(pg)
        check('（full 模型）' in bd and pg.is_visible("#modelLive") and pg.input_value("#modelLive") == 'full', tag + '運算標籤：' + bd)
        pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(1500)
        check(pg.is_disabled("#modelLive"), tag + '錄製中不能換模型')
        pg.click("#recordBtn"); pg.wait_for_timeout(300)
        check(not pg.is_disabled("#modelLive"), tag + '停止錄製後可以換')
        with pg.expect_download() as d:
            pg.click("#jsonBtn")
        meta = json.load(open(d.value.path()))['meta']
        check(meta.get('model') == 'pose_landmarker_full' and meta.get('modelChoice') == 'full', tag + '錄製檔：' + str({k: meta.get(k) for k in ('model', 'modelChoice')}))
        # 2. 開著鏡頭換回 lite：不重開鏡頭、不重新載入網頁，骨架回來
        n = len(pg.evaluate("window.__constraints"))
        pg.select_option("#modelLive", 'lite')
        check(wait_status(pg, '已就緒（lite 模型）'), tag + '開著鏡頭換回 lite')
        check(detected(pg), tag + '換完骨架回來')
        pg.wait_for_timeout(1500)
        check(len(pg.evaluate("window.__constraints")) == n and pg.evaluate("window.__marker") == 1 and pg.input_value("#modelSelect") == 'lite', tag + '鏡頭沒有重開、網頁沒有重新載入、首頁選單同步')
        check('（lite 模型）' in badge(pg), tag + '標籤寫 lite')
        check(not pg.errs, tag + '沒有錯誤 ' + str(pg.errs[:3]))
        ctx.close()
    # 3. 自動：先用 full；量到跟不上 → 改用 lite 並記住；重新整理直接用 lite；再選一次自動重新判斷（用 full）
    ctx, pg = page(b, cam_max=30, fake={"msPerFrame": 45, "aiFps": 20, "cameraFps": 30}); track(pg)
    pg.add_init_script("try { localStorage.setItem('poseModel', 'auto'); } catch (e) {}")
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    check(pg.models == ['full'] and '先用比較準的 full' in pg.inner_text("#modelPickHint"), '自動：一開始就下載 full ' + str(pg.models))
    pg.click("#startBtn")
    check(wait_note(pg, '改用比較快的 lite', 30000), '量到 full 跟不上：自動改用 lite ' + pg.inner_text("#autoNote"))
    check(wait_status(pg, '已就緒（lite 模型）') and pg.evaluate("localStorage.getItem('autoModel')") == 'lite', '換好、記住')
    check(detected(pg), '換完骨架回來')
    pg.wait_for_timeout(1500)
    check('（自動：lite 模型）' in badge(pg), '標籤：' + badge(pg))
    pg.wait_for_timeout(14000)
    check(pg.is_hidden("#advice") or 'lite' not in advice_text(pg), '自動時不跳模型的建議')
    pg.models.clear(); pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.models == ['lite'] and '之前量到 full 跟不上' in pg.inner_text("#modelPickHint"), '重新整理：直接用 lite ' + str(pg.models))
    pg.select_option("#modelSelect", 'lite'); pg.select_option("#modelSelect", 'auto')
    check(wait_status(pg, '已就緒（full 模型）') and pg.evaluate("localStorage.getItem('autoModel')") is None, '再選一次自動：忘掉、改用 full')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 4. 自動、full 跟得上：繼續用 full，不換
    ctx, pg = page(b, cam_max=30, fake={"msPerFrame": 20, "aiFps": 30, "cameraFps": 30}); track(pg)
    pg.goto(base + "index.html?model=auto"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(16000)
    check(pg.models == ['full'] and pg.is_hidden("#autoNote") and pg.evaluate("localStorage.getItem('autoModel')") is None, 'full 跟得上：不換 ' + str(pg.models))
    ctx.close()
    # 5. 速度建議「試試 full」：直接換，不重新載入網頁
    ctx, pg = page(b, cam_max=30, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30}); track(pg)
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.evaluate("window.__marker = 1")
    pg.click("#startBtn")
    check(wait_advice(pg) and pg.inner_text("#adviceYes") == '試試 full', '建議試試 full')
    pg.click("#adviceYes")
    check(wait_status(pg, '已就緒（full 模型）') and pg.evaluate("window.__marker") == 1 and pg.evaluate("localStorage.getItem('poseModel')") == 'full', '按試試 full：不重新載入就換好、記住')
    check(detected(pg), '換完骨架回來')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 6. full 下載失敗：繼續用 lite，偵測照常
    ctx, pg = page(b, cam_max=30); track(pg)
    pg.route(FULL_URL, lambda r: r.abort())
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); detected(pg)
    pg.click("#perfBtn"); pg.wait_for_timeout(500)
    pg.select_option("#modelLive", 'full')
    check(wait_status(pg, '失敗，繼續用 lite'), '下載失敗：' + pg.inner_text("#modelStatus"))
    check(detected(pg), '繼續用 lite 偵測')
    pg.wait_for_timeout(1500)
    check('（lite 模型）' in pg.inner_text("#perfBtn") and not pg.is_disabled("#modelLive"), '標籤寫 lite、選單可以再選')
    ctx.close()
    # 7. 網址 ?model=full：使用者自己選 lite 後網址拿掉 model（重新整理不會又變 full）
    ctx, pg = page(b, cam_max=30); track(pg)
    pg.goto(base + "index.html?model=full&res=480"); pg.wait_for_function(READY, timeout=60000)
    check(pg.models == ['full'] and pg.input_value("#modelSelect") == 'full' and pg.evaluate("localStorage.getItem('poseModel')") is None, '網址 ?model=full：用 full、不記住')
    pg.select_option("#modelSelect", 'lite'); wait_status(pg, '已就緒（lite 模型）')
    check('model=' not in pg.url and 'res=480' in pg.url, '選了 lite：網址拿掉 model ' + pg.url)
    ctx.close()
    # 8. 版面：首頁兩個選單、鏡頭畫面點開標籤的兩個選單都在畫面內
    for vw, vh, mob in [(320, 640, True), (390, 844, True), (844, 390, True), (1280, 800, False)]:
        ctx, pg = page(b, vw, vh, cam_max=60, mobile=mob)
        pg.add_init_script("try { localStorage.setItem('poseModel', 'full'); localStorage.setItem('cameraFps', 'auto'); } catch (e) {}")
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        r = pg.evaluate("() => ['#modelSelect', '#modelPickHint', '#fpsSelect', '#fpsHint'].map(s => document.querySelector(s).getBoundingClientRect().right).concat(document.documentElement.scrollWidth)")
        check(max(r[:4]) <= vw and r[4] == vw, f'{vw} 首頁選單和說明在畫面內 {r}')
        pg.locator(".start-card").screenshot(path=f"start_{vw}.png")
        pg.click("#startBtn"); detected(pg); pg.click("#perfBtn"); pg.wait_for_timeout(1200)
        r = pg.evaluate("() => ['#fpsLive', '#modelLive', '#perfBtn'].map(s => document.querySelector(s).getBoundingClientRect().right).concat(document.documentElement.scrollWidth)")
        check(max(r[:3]) <= vw and r[3] == vw, f'{vw}x{vh} 鏡頭畫面的選單在畫面內 {r}')
        pg.screenshot(path=f"live_{vw}x{vh}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
