# 簡報用：自動調整的說明、速度建議小卡（兩倍解析度）
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
base = serve(8871, ROOT)
HERE = os.path.dirname(os.path.abspath(__file__))
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
    ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2)
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

def wait_for(pg, js, timeout=40000):
    try:
        pg.wait_for_function(js, timeout=timeout); return True
    except Exception:
        return False
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 自動升到 60 格：運算標籤＋旁邊的說明
    ctx, pg = page(b, 1280, 800, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    pg.add_init_script("try { localStorage.setItem('cameraFps', 'auto'); localStorage.setItem('adviceSkipped', JSON.stringify(['full'])); } catch (e) {}")
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn")
    ok = wait_for(pg, "(() => { const e = document.getElementById('autoNote'); return !e.hidden && e.textContent.includes('改成每秒 60 格'); })()")
    r = pg.evaluate("""() => { const a = document.getElementById('perfBtn').getBoundingClientRect(), n = document.getElementById('autoNote').getBoundingClientRect();
        return [Math.min(a.left, n.left), Math.min(a.top, n.top), Math.max(a.right, n.right), Math.max(a.bottom, n.bottom)]; }""")
    pad = 6
    clip = {"x": r[0] - pad, "y": r[1] - pad, "width": r[2] - r[0] + 2 * pad, "height": r[3] - r[1] + 2 * pad}
    pg.screenshot(path=f"{HERE}/auto.png", clip=clip)
    print('auto', ok, pg.inner_text('#perfBtn'), '|', pg.inner_text('#autoNote'), clip, pg.errs[:1])
    ctx.close()
    # 速度建議：鏡頭最多 30 格、AI 每格 8 毫秒 → 建議試試 full
    ctx, pg = page(b, 1280, 800, cam_max=30, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn")
    ok = wait_for(pg, "!document.getElementById('advice').hidden")
    pg.wait_for_timeout(800)
    r = pg.evaluate("(() => { const a = document.querySelector('#advice .advice-card').getBoundingClientRect(); return [a.left - 4, a.top - 4, a.width + 8, a.height + 8]; })()")
    pg.screenshot(path=f"{HERE}/advice.png", clip={"x": r[0], "y": r[1], "width": r[2], "height": r[3]}, animations="disabled")
    print('advice', ok, pg.inner_text('#advice').replace('\n', ' / '), pg.errs[:1])
    ctx.close()
    b.close()
