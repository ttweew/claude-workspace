# 速度建議（js/ai/advisor.js）：量測時機、建議內容、按鈕動作、錄製中不打擾、版面
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8819, ROOT)
OUT = os.path.dirname(os.path.abspath(__file__))
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
# 假鏡頭：照要求的每秒格數送畫面（最多 camMax），getCapabilities 回報上限（camMax 為 0 時不回報）
CAM = NO_COUNTDOWN + """
window.__constraints = [];
navigator.mediaDevices.getUserMedia = async (c) => {
  window.__constraints.push(JSON.stringify(c));
  const camMax = %d;
  const want = c && c.video && c.video.frameRate ? c.video.frameRate.ideal : 30;
  const fps = Math.min(want, camMax || 30);
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d'); const s = Math.min(cv.width / im.width, cv.height / im.height);
  const dw = im.width * s, dh = im.height * s; let k = 0;
  const draw = () => { g.fillStyle = '#5a88b8'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(im, (cv.width - dw) / 2, (cv.height - dh) / 2, dw, dh); g.fillStyle = k++ %% 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); };
  draw(); setInterval(draw, 1000 / fps);
  const stream = cv.captureStream(fps);
  const tr = stream.getVideoTracks()[0]; const gs = tr.getSettings.bind(tr);
  tr.getSettings = () => ({ ...gs(), frameRate: fps });
  tr.getCapabilities = () => camMax ? { frameRate: { min: 1, max: camMax } } : {};
  return stream;
};"""

NOBODY = "window.__nobody = true;"
CAM2 = CAM.replace("g.drawImage(im,", "if (!window.__nobody) g.drawImage(im,")
# 測試時把量測結果換成指定的數字（只換 advise 的輸入，量測、顯示、按鈕都是真的）
def fake_advisor(pg):
    def handle(route):
        r = route.fetch(); body = r.text()
        body = body.replace("export function advise(m) {", "export function advise(m) {\n    if (window.__fake) m = { ...m, ...window.__fake };")
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
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for vw, vh, mob, panel in [(1280, 800, False, False), (1024, 600, False, False), (1280, 800, False, True), (320, 640, True, False), (390, 844, True, False),
                               (844, 390, True, False), (844, 390, True, True), (667, 375, True, False), (568, 320, True, False)]:
        ctx, pg = page(b, vw, vh, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30}, mobile=mob)
        open_cam(pg)
        if panel: pg.click("#dataBtn")
        ok_ = wait_advice(pg)
        r = pg.evaluate("""() => {
            const box = e => { if (!e || !e.offsetParent && getComputedStyle(e).position !== 'fixed') return null; const r = e.getBoundingClientRect(); return r.width ? [r.left, r.top, r.right, r.bottom] : null; };
            const q = s => box(document.querySelector(s));
            return { card: q('.advice-card'), toolbar: q('#toolbar'), demo: q('#demoBtn'), status: q('#poseStatus'), perf: q('#perfBtn'), panel: q('#dataPanel'),
                     metrics: [...document.querySelectorAll('#hud .metric')].map(box).filter(Boolean), sw: document.documentElement.scrollWidth };
        }""")
        c = r['card']
        hit = lambda a: a and c and not (a[2] <= c[0] or a[0] >= c[2] or a[3] <= c[1] or a[1] >= c[3])
        inside = c and c[0] >= 0 and c[2] <= vw and c[3] <= vh and r['sw'] == vw
        bad = [k for k in ('toolbar', 'demo', 'status', 'perf', 'panel') if hit(r[k])] + [('hud', m) for m in r['metrics'] if hit(m)]
        check(ok_ and inside and not bad, f'{vw}x{vh}{" 數據面板" if panel else ""} 卡片在畫面內、不蓋到其他東西 {[round(x) for x in c] if c else c} {bad}')
        pg.screenshot(path=f"advice_{vw}x{vh}{'_panel' if panel else ''}.png")
        # 入鏡提示出現時先藏起來，消失後再出現
        pg.evaluate("() => { const b = document.getElementById('banner'); b.textContent = '請往後退'; b.hidden = false; }")
        hid = pg.is_hidden("#advice") or not pg.evaluate("getComputedStyle(document.getElementById('advice')).display !== 'none'")
        pg.evaluate("() => { document.getElementById('banner').hidden = true; }")
        back = pg.evaluate("getComputedStyle(document.getElementById('advice')).display !== 'none'")
        check(hid and back, f'{vw}x{vh} 入鏡提示出現時藏起來、消失後回來')
        check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
        ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
