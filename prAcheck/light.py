# 光線偵測（js/analysis/light.js）：太暗時提醒、亮了收起來、版面
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8822, ROOT)
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
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, cv.width, cv.height); if (!window.__nobody) g.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh); g.fillStyle = k++ %% 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); if (window.__dim) { g.fillStyle = 'rgba(0,0,0,' + window.__dim + ')'; g.fillRect(0, 0, cv.width, cv.height); } };
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

def light_visible(pg):
    return pg.is_visible("#lightNote")
def wait_light(pg, shown, timeout=15000):
    try:
        pg.wait_for_function("s => !document.getElementById('lightNote').hidden === s", arg=shown, timeout=timeout); return True
    except Exception:
        return False
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 正常亮度不提醒；調暗 → 3 秒後提醒；亮度數字寫在運算標籤；調亮 → 收起來；關鏡頭重來
    ctx, pg = page(b, cam_max=30)
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(6000)
    check(not light_visible(pg), '正常亮度不提醒')
    bd = badge(pg)
    m = re.search(r'畫面亮度 (\d+)', bd)
    check(m is not None and int(m.group(1)) > 60, '運算標籤寫出亮度：' + (m.group(0) if m else bd))
    pg.click("#perfBtn")
    pg.evaluate("window.__dim = 0.9")
    t = time.time()
    check(wait_light(pg, True), '調暗後提醒')
    print(f'   調暗到提醒花了 {time.time() - t:.1f} 秒')
    check(time.time() - t > 2, '不會馬上跳（要連續 3 秒）')
    check('光線太暗' in pg.inner_text("#lightNote"), pg.inner_text("#lightNote"))
    bd = badge(pg)
    check('（太暗）' in bd, '運算標籤：' + re.search(r'畫面亮度[^·]*', bd).group(0))
    pg.click("#perfBtn")
    pg.screenshot(path="dark_1280.png")
    pg.evaluate("window.__dim = 0")
    check(wait_light(pg, False), '調亮後收起來')
    pg.evaluate("window.__dim = 0.9"); wait_light(pg, True)
    pg.click("#stopBtn"); pg.wait_for_timeout(300)
    check(pg.is_hidden("#lightNote"), '關鏡頭時收起來')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 2. 一閃而過（1 秒暗）不提醒
    ctx, pg = page(b, cam_max=30)
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(4000)
    pg.evaluate("window.__dim = 0.9"); pg.wait_for_timeout(1000); pg.evaluate("window.__dim = 0")
    pg.wait_for_timeout(5000)
    check(not light_visible(pg), '暗一下（約 1 秒）不提醒')
    ctx.close()
    # 3. 版面：提醒在畫面內、不蓋工具列
    for vw, vh, mob in [(320, 640, True), (390, 844, True), (844, 390, True)]:
        ctx, pg = page(b, vw, vh, cam_max=30, mobile=mob)
        pg.add_init_script("window.__dim = 0.9;")
        pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn")
        ok_ = wait_light(pg, True, 20000)
        r = pg.evaluate("() => { const a = document.getElementById('lightNote').getBoundingClientRect(), t = document.getElementById('toolbar').getBoundingClientRect(); return [a.left, a.top, a.right, a.bottom, t.bottom, document.documentElement.scrollWidth]; }")
        check(ok_ and r[0] >= 0 and r[2] <= vw and r[1] >= r[4] and r[5] == vw, f'{vw}x{vh} 提醒在畫面內 {[round(x) for x in r]}')
        pg.screenshot(path=f"dark_{vw}x{vh}.png")
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
