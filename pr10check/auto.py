# 自動調每秒格數（js/ai/advisor.js 的 AutoFps）：升降、錄製中鎖住、直接換格數不重開鏡頭、換不了就重開
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8820, ROOT)
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
# 首頁的每秒格數、AI 模型收進「進階設定」（PR #79）：測試一開始就打開
CAM2 += "\ndocument.addEventListener('DOMContentLoaded', () => { const d = document.getElementById('advanced'); if (d) d.open = true; });"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 選自動：量完有餘裕升 60（直接換、不重開鏡頭）→ 真的速度跟不上 60 → 降 30 → 連續 60 秒有餘裕再升 → 再降 → 降過 2 次不再升
    ctx, pg = page(b, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    check(opts(pg, '#fpsSelect')[-1] == '自動（30～60 格，實驗）', '選單最後一項是自動：' + str(opts(pg, '#fpsSelect')))
    pg.select_option("#fpsSelect", 'auto'); pg.wait_for_timeout(100)
    check(pg.is_visible("#fpsHint") and '自動調整' in pg.inner_text("#fpsHint") and pg.evaluate("localStorage.getItem('cameraFps')") == 'auto', '選自動：說明、記住 ' + pg.inner_text("#fpsHint")[:40])
    pg.click("#startBtn"); pg.wait_for_timeout(2000)
    cons = pg.evaluate("window.__constraints")
    check(len(cons) == 1 and 'frameRate' not in cons[0], '自動從每秒 30 格開始（不指定格數）')
    check(wait_note(pg, '改成每秒 60 格'), '量完有餘裕：升到 60 並短暫說明 ' + pg.inner_text("#autoNote"))
    pg.wait_for_timeout(300)
    check(len(pg.evaluate("window.__constraints")) == 1 and '"frameRate":{"ideal":60}' in applied(pg)[-1] and '"width":{"ideal":640}' in applied(pg)[-1], '直接換格數、沒有重開鏡頭 ' + str(applied(pg)))
    check(pg.is_hidden("#advice"), '自動時不跳每秒格數的建議')
    bd = badge(pg)
    check('每秒格數自動，目前 60 格' in bd and re.search(r'鏡頭 (5\d|6\d) · AI', bd) is not None, '運算標籤：' + bd)
    pg.click("#perfBtn")
    pg.wait_for_timeout(6500)
    check(pg.is_hidden("#autoNote"), '說明 6 秒後收起來')
    check(wait_note(pg, '改回 30 格', 40000), 'AI 真的跟不上 60（電腦模擬約 25 格）：降回 30 ' + pg.inner_text("#autoNote"))
    check('"frameRate":{"ideal":30}' in applied(pg)[-1] and len(pg.evaluate("window.__constraints")) == 1, '直接換回 30 ' + applied(pg)[-1])
    pg.evaluate("window.__fakeSec = { aiFps: 30, cameraFps: 30, msPerFrame: 8 }")
    t = time.time()
    check(wait_note(pg, '再試每秒 60 格', 90000), '連續 60 秒有餘裕：再試 60')
    print(f'   再升花了 {time.time() - t:.0f} 秒')
    check(time.time() - t > 55, '不會太快再升（要 60 秒）')
    pg.evaluate("window.__fakeSec = null")
    check(wait_note(pg, '改回 30 格', 40000), '又跟不上：再降')
    pg.evaluate("window.__fakeSec = { aiFps: 30, cameraFps: 30, msPerFrame: 8 }")
    n = len(applied(pg))
    pg.wait_for_timeout(75000)
    check(len(applied(pg)) == n and pg.evaluate("window.__secs") > 60, f'降過 2 次：不再升（餵了 {pg.evaluate("window.__secs")} 秒）')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 2. 錄製中鎖住：量完前開始錄 → 錄製中不換；停了才量、才升；錄製檔記下 fpsChoice
    ctx, pg = page(b, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    pg.add_init_script("try { localStorage.setItem('cameraFps', 'auto'); } catch (e) {}")
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(5000)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(16000)
    check(not applied(pg) and pg.is_hidden("#autoNote"), '錄製中不換格數')
    pg.click("#recordBtn"); pg.wait_for_timeout(300)
    with pg.expect_download() as d:
        pg.click("#jsonBtn")
    meta = json.load(open(d.value.path()))['meta']
    check(meta.get('fpsChoice') == 'auto' and meta.get('cameraFrameRate') == 30, '錄製檔記下 fpsChoice：' + str({k: meta.get(k) for k in ('fpsChoice', 'cameraFrameRate', 'aiMsPerFrame')}))
    check(wait_note(pg, '改成每秒 60 格', 30000), '停止錄製後量完才升')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 3. 瀏覽器不能直接換格數：改成重開鏡頭（要 60 格）
    ctx, pg = page(b, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    pg.add_init_script("window.__rejectApply = true; try { localStorage.setItem('cameraFps', 'auto'); } catch (e) {}")
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn")
    check(wait_note(pg, '改成每秒 60 格'), '升到 60')
    pg.wait_for_timeout(2500)
    cons = pg.evaluate("window.__constraints")
    check(len(cons) == 2 and '"frameRate":{"ideal":60}' in cons[-1] and pg.is_visible("#stage"), '換不了就重開鏡頭、要 60 格 ' + cons[-1])
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 4. 鏡頭最多 30 格（筆電）：自動不會升，也不跳每秒格數的建議；網址 ?fps=auto 直接選自動、不記住
    ctx, pg = page(b, cam_max=30, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    pg.goto(base + "index.html?fps=auto"); pg.wait_for_function(READY, timeout=60000)
    check(pg.input_value("#fpsSelect") == 'auto', '網址 ?fps=auto 選好自動')
    pg.click("#startBtn"); pg.wait_for_timeout(16000)
    check(not applied(pg) and pg.is_hidden("#autoNote"), '鏡頭最多 30：不升')
    t = advice_text(pg) if pg.is_visible("#advice") else ''
    check('60 格' not in t, '不跳每秒格數的建議（可以有模型的建議）：' + t.replace('\n', ' / '))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    check(pg.input_value("#fpsSelect") == '30', '網址指定的自動不會記住')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 5. 版面：自動的說明在畫面內
    for vw, vh, mob in [(320, 640, True), (844, 390, True), (1280, 800, False)]:
        ctx, pg = page(b, vw, vh, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30}, mobile=mob)
        pg.add_init_script("try { localStorage.setItem('cameraFps', 'auto'); localStorage.setItem('adviceSkipped', '[\"full\"]'); } catch (e) {}")
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        r = pg.evaluate("() => [document.getElementById('fpsHint').getBoundingClientRect().right, document.documentElement.scrollWidth]")
        check(r[0] <= vw and r[1] == vw, f'{vw} 首頁自動說明在畫面內 {r}')
        pg.click("#startBtn")
        ok_ = wait_note(pg, '改成每秒 60 格')
        r = pg.evaluate("() => { const a = document.getElementById('autoNote').getBoundingClientRect(), t = document.getElementById('toolbar').getBoundingClientRect(); return [a.left, a.top, a.right, a.bottom, t.bottom, document.documentElement.scrollWidth]; }")
        check(ok_ and r[2] <= vw and r[1] >= r[4] and r[5] == vw, f'{vw}x{vh} 自動說明在畫面內、不蓋工具列 {[round(x) for x in r]}')
        pg.screenshot(path=f"auto_{vw}x{vh}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
