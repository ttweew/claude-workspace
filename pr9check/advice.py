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
# 首頁的每秒格數、AI 模型收進「進階設定」（PR #79）：測試一開始就打開
CAM2 += "\ndocument.addEventListener('DOMContentLoaded', () => { const d = document.getElementById('advanced'); if (d) d.open = true; });"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 真的量（不換數字）：開鏡頭約 11 秒後量完一次；顯示的建議和規則一致；運算標籤寫出每格毫秒
    ctx, pg = page(b, cam_max=30)
    t0 = open_cam(pg)
    pg.wait_for_timeout(9000)
    check(not pg.logs, '開鏡頭 9 秒內還沒量完（先等 3 秒暖機、再量 8 秒）')
    pg.wait_for_timeout(9000)
    check(len(pg.logs) == 1, '約 11～18 秒量完一次：' + str([l[0] for l in pg.logs]))
    pg.click("#perfBtn"); pg.wait_for_timeout(1200)
    badge = pg.inner_text("#perfBtn")
    check(re.search(r'AI 每格 \d+ 毫秒（lite 模型）', badge) is not None, '運算標籤寫出 AI 每格幾毫秒：' + badge)
    print('   實際量測：', pg.logs[0][0] if pg.logs else '-', '| 建議：', advice_text(pg) if pg.is_visible("#advice") else '（沒有）')
    pg.wait_for_timeout(12000)
    check(len(pg.logs) == 1, '同一次開鏡頭只量一次')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 2. 很有餘裕（每格 8 毫秒、鏡頭最多 60）：先建議 full；按「不用了」記住，重開鏡頭改建議 60 格；按「試試 60 格」重開鏡頭要 60 格
    ctx, pg = page(b, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    open_cam(pg)
    check(wait_advice(pg), '有餘裕時跳出建議')
    t = advice_text(pg)
    check('速度建議' in t and 'AI 每格只要 8 毫秒' in t and 'full' in t and pg.inner_text("#adviceYes") == '試試 full' and pg.inner_text("#adviceNo") == '不用了', '先建議 full：' + t.replace('\n', ' / '))
    pg.click("#adviceNo"); pg.wait_for_timeout(200)
    check(pg.is_hidden("#advice") and pg.evaluate("localStorage.getItem('adviceSkipped')") == '["full"]', '按不用了：收起來、記住')
    pg.click("#stopBtn"); pg.wait_for_timeout(300); pg.click("#startBtn")
    check(wait_advice(pg), '重開鏡頭再量一次')
    t = advice_text(pg)
    check('每秒 60 格' in t and pg.inner_text("#adviceYes") == '試試 60 格', 'full 不再提，改建議 60 格：' + t.replace('\n', ' / '))
    pg.click("#adviceYes"); pg.wait_for_timeout(3500)
    cons = pg.evaluate("window.__constraints")
    check('"frameRate":{"ideal":60}' in cons[-1] and pg.input_value("#fpsSelect") == '60' and pg.is_hidden("#advice"), '按試試 60 格：重開鏡頭要 60 格、選單變 60')
    pg.screenshot(path="after60.png")
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 3. 選 60 跟不上：建議改回 30，按下去重開鏡頭、不指定格數
    ctx, pg = page(b, cam_max=60, fake={"msPerFrame": 24, "aiFps": 38, "cameraFps": 60})
    pg.add_init_script("try { localStorage.setItem('cameraFps', '60'); } catch (e) {}")
    open_cam(pg)
    check(wait_advice(pg), '跟不上時跳出建議')
    t = advice_text(pg)
    check('跟不上鏡頭的 60 格' in t and pg.inner_text("#adviceYes") == '改回 30 格', '建議改回 30：' + t.replace('\n', ' / '))
    pg.click("#adviceYes"); pg.wait_for_timeout(3500)
    cons = pg.evaluate("window.__constraints")
    check('frameRate' not in cons[-1] and pg.input_value("#fpsSelect") == '30', '按改回 30 格：重開鏡頭、不指定格數')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 4. 換模型（第 3 步之後不用重新載入網頁）：試試 full → 直接換成 full、記住；full 跟不上 → 改用 lite
    ctx, pg = page(b, cam_max=30, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    open_cam(pg, "index.html?res=480")
    pg.evaluate("window.__marker = 1")
    check(wait_advice(pg), '建議 full')
    pg.click("#adviceYes")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.includes('已就緒（full 模型）')", timeout=60000)
    check(pg.evaluate("window.__marker") == 1 and pg.evaluate("localStorage.getItem('poseModel')") == 'full', '按試試 full：不重新載入就換成 full、記住')
    pg.evaluate("window.__fake = { msPerFrame: 40, aiFps: 22, cameraFps: 30 }")
    pg.wait_for_timeout(1500); pg.click("#perfBtn"); pg.wait_for_timeout(1200)
    check('full 模型' in pg.inner_text("#perfBtn"), '運算標籤寫出 full 模型')
    pg.click("#perfBtn")
    check(wait_advice(pg), 'full 跟不上時跳出建議')
    t = advice_text(pg)
    check('改用比較快的 lite' in t and pg.inner_text("#adviceYes") == '改用 lite', '建議 lite：' + t.replace('\n', ' / '))
    pg.click("#adviceYes")
    pg.wait_for_function("document.getElementById('modelStatus').textContent.includes('已就緒（lite 模型）')", timeout=60000)
    check(pg.evaluate("window.__marker") == 1 and pg.evaluate("localStorage.getItem('poseModel')") == 'lite' and 'res=480' in pg.url, '按改用 lite：不重新載入就換回 lite ' + pg.url)
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 5. 錄製中不打擾：量完前開始錄 → 錄製中不跳；停止後重新量才跳。建議顯示中開始錄 → 收起來
    ctx, pg = page(b, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30})
    open_cam(pg)
    pg.wait_for_timeout(6000)
    pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(14000)
    check(pg.is_hidden("#advice") and not pg.logs, '錄製中不量、不跳建議')
    pg.click("#recordBtn"); pg.wait_for_timeout(5000)
    check(pg.is_hidden("#advice"), '停止錄製後重新量（5 秒內不會跳）')
    check(wait_advice(pg), '停止錄製後量滿就跳建議')
    pg.click("#recordBtn"); pg.wait_for_timeout(300)
    check(pg.is_hidden("#advice"), '建議顯示中開始錄製：收起來')
    pg.click("#recordBtn"); pg.wait_for_timeout(12000)
    check(pg.is_hidden("#advice"), '這次開鏡頭已經給過建議，不再跳')
    meta = pg.evaluate("1")
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 6. 畫面裡沒有人：不量、不建議
    ctx, pg = page(b, cam_max=60, fake={"msPerFrame": 8, "aiFps": 30, "cameraFps": 30}, nobody=True)
    open_cam(pg)
    pg.wait_for_timeout(16000)
    check(pg.is_hidden("#advice") and not pg.logs, '沒有人時不量、不建議')
    check(not pg.errs, '沒有錯誤 ' + str(pg.errs[:3]))
    ctx.close()
    # 7. 只能提醒的建議（lite 也很慢）：只有「知道了」
    ctx, pg = page(b, cam_max=30, fake={"msPerFrame": 70, "aiFps": 14, "cameraFps": 30})
    open_cam(pg)
    check(wait_advice(pg), '很慢時跳出提醒')
    check(pg.is_hidden("#adviceYes") and pg.inner_text("#adviceNo") == '知道了' and '關掉其他 App' in advice_text(pg), '只有知道了：' + advice_text(pg).replace('\n', ' / '))
    pg.click("#adviceNo")
    check(pg.evaluate("localStorage.getItem('adviceSkipped')") == '["slow"]', '知道了也記住')
    ctx.close()
print('ALL PASS' if ok else 'SOME FAIL')
