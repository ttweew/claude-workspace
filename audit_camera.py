# 鏡頭情境測試：用程式模擬前後兩顆鏡頭、權限被拒、鏡頭被拔掉等狀況
from playwright.sync_api import sync_playwright
from audit_common import *
import sys, time
import os
base = serve(int(os.environ.get("PORT", "8781")), os.environ.get("SITE", "/home/user/claude-workspace"))
MOCK = """
window.__cams = [{deviceId: 'front', label: '前置鏡頭', facingMode: 'user'}, {deviceId: 'back', label: '後置鏡頭', facingMode: 'environment'}];
window.__gumDelay = 0; window.__gumError = null; window.__tracks = [];
navigator.mediaDevices.enumerateDevices = async () => __cams.map(c => ({kind: 'videoinput', deviceId: c.deviceId, label: c.label, groupId: ''}));
navigator.mediaDevices.getUserMedia = async (constraints) => {
  await new Promise(r => setTimeout(r, __gumDelay));
  if (__gumError) throw new DOMException('mock error', __gumError);
  const want = constraints.video && constraints.video.deviceId && constraints.video.deviceId.exact;
  const cam = want ? __cams.find(c => c.deviceId === want) : __cams[0];
  if (!cam) throw new DOMException('mock error', want ? 'OverconstrainedError' : 'NotFoundError');
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); g.drawImage(im, 0, 0); setInterval(() => g.drawImage(im, 0, 0), 33);
  const stream = c.captureStream(30); const t = stream.getVideoTracks()[0];
  const gs = t.getSettings.bind(t); t.getSettings = () => ({...gs(), deviceId: cam.deviceId, facingMode: cam.facingMode});
  window.__tracks.push(t); return stream;
};
window.__live = () => window.__tracks.filter(t => t.readyState === 'live').length;
"""
ST = "document.getElementById('status').textContent"
MIR = "document.getElementById('video').classList.contains('mirrored')"
OPTS = "[...document.getElementById('cameraSelect').options].map(o => (o.selected ? '*' : '') + o.textContent)"
VIS = "!document.getElementById('stage').hidden"
SELVIS = "!document.getElementById('cameraSelect').hidden"
results = []


def check(name, ok, detail):
    results.append((name, ok))
    print(("通過" if ok else "失敗"), "|", name, "|", detail, flush=True)


def new_page(b, block_cdn=False, hold_model=None):
    ctx = b.new_context(viewport={"width": 1280, "height": 720})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:150]))
    if block_cdn:
        pg.route(CDN + "/**", lambda r: r.abort())
    else:
        pg.route(CDN + "/**", cdn)
    if hold_model is not None:
        pg.route(MODEL, lambda r: hold_model.append(r))
    else:
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(MOCK)
    pg.goto(base + "index.html")
    return ctx, pg, errs


def ready(pg):
    pg.wait_for_function(READY, timeout=60000)


def detected(pg):
    pg.wait_for_function("document.getElementById('poseStatus').textContent === '已偵測到全身'", timeout=30000)


with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")

    # S1 兩顆鏡頭：清單、切換、鏡像
    ctx, pg, errs = new_page(b); ready(pg); pg.click("#startBtn"); detected(pg)
    o1, m1 = pg.evaluate(OPTS), pg.evaluate(MIR)
    pg.select_option("#cameraSelect", "back"); pg.wait_for_timeout(800)
    o2, m2, live2 = pg.evaluate(OPTS), pg.evaluate(MIR), pg.evaluate("__live()")
    pg.select_option("#cameraSelect", "front"); pg.wait_for_timeout(800)
    m3, live3 = pg.evaluate(MIR), pg.evaluate("__live()")
    check("S1 兩顆鏡頭清單與切換",
          o1 == ['*前置鏡頭', '後置鏡頭'] and m1 and o2 == ['前置鏡頭', '*後置鏡頭'] and not m2 and m3 and live2 == 1 and live3 == 1 and not errs,
          f"清單{o1}→{o2} 鏡像 前{m1}/後{m2}/前{m3} 使用中鏡頭數 {live2},{live3} 錯誤{errs}")

    # S2 快速連續切換：兩次請求重疊時，不能留下沒關掉的鏡頭
    pg.evaluate("__gumDelay = 400")
    pg.select_option("#cameraSelect", "back"); pg.wait_for_timeout(50); pg.select_option("#cameraSelect", "front")
    pg.wait_for_timeout(1500)
    live, mir = pg.evaluate("__live()"), pg.evaluate(MIR)
    check("S2 快速連續切換不殘留鏡頭", live == 1 and mir, f"使用中鏡頭數 {live}（應為 1），目前鏡像 {mir}（最後選前置，應為 True）")
    pg.evaluate("__gumDelay = 0")

    # S3 鏡頭中途斷線（例如外接鏡頭被拔掉）
    pg.evaluate("__tracks.filter(t => t.readyState === 'live').forEach(t => t.dispatchEvent(new Event('ended')))")
    pg.wait_for_timeout(500)
    check("S3 鏡頭中途斷線有提示", not pg.evaluate(VIS) and '中斷' in pg.evaluate(ST),
          f"畫面仍開著 {pg.evaluate(VIS)}，狀態「{pg.evaluate(ST)}」")

    # S4 先前選的鏡頭被拔掉後，再按開啟鏡頭
    if pg.evaluate(VIS):
        pg.click("#stopBtn")
    pg.evaluate("__tracks.forEach(t => t.stop())")
    pg.click("#startBtn"); pg.wait_for_timeout(800)
    if pg.evaluate(VIS):
        pg.select_option("#cameraSelect", "back"); pg.wait_for_timeout(800); pg.click("#stopBtn")
    pg.evaluate("__cams = __cams.filter(c => c.deviceId !== 'back')")
    pg.click("#startBtn"); pg.wait_for_timeout(1200)
    check("S4 選過的鏡頭被拔掉後仍能開啟", pg.evaluate(VIS) and pg.evaluate("__live()") == 1,
          f"畫面開啟 {pg.evaluate(VIS)}，狀態「{pg.evaluate(ST)}」")
    # S4b 只剩一顆鏡頭時，下拉選單要隱藏（沒得選）
    check("S4b 只有一顆鏡頭時隱藏選單", pg.evaluate(VIS) and not pg.evaluate(SELVIS), f"選單顯示 {pg.evaluate(SELVIS)}")
    ctx.close()

    # S5～S7 無法開啟鏡頭時的錯誤訊息
    for code, name, expect in [("NotAllowedError", "S5 拒絕相機權限", "權限"),
                               ("NotFoundError", "S6 裝置沒有鏡頭", "找不到"),
                               ("NotReadableError", "S7 鏡頭被其他程式佔用", "其他程式")]:
        ctx, pg, errs = new_page(b); ready(pg); pg.evaluate(f"__gumError = '{code}'")
        pg.click("#startBtn"); pg.wait_for_timeout(500)
        st = pg.evaluate(ST)
        check(name, expect in st and not pg.evaluate(VIS) and not errs, f"狀態「{st}」")
        ctx.close()

    # S8 重複開關鏡頭 5 次：每次都要完全關閉鏡頭
    ctx, pg, errs = new_page(b); ready(pg); lives = []
    for i in range(5):
        pg.click("#startBtn"); detected(pg); pg.click("#stopBtn"); pg.wait_for_timeout(200); lives.append(pg.evaluate("__live()"))
    check("S8 重複開關 5 次", lives == [0] * 5 and not errs and pg.evaluate(ST) == '鏡頭已關閉', f"每次關閉後使用中鏡頭數 {lives} 錯誤{errs}")

    # S9 全螢幕中直接關閉鏡頭，要離開全螢幕
    pg.click("#startBtn"); detected(pg); pg.click("#fullscreenBtn"); pg.wait_for_timeout(500)
    fs1 = pg.evaluate("!!document.fullscreenElement"); pg.click("#stopBtn"); pg.wait_for_timeout(500)
    fs2 = pg.evaluate("!!document.fullscreenElement")
    check("S9 全螢幕中關閉鏡頭", fs1 and not fs2 and not errs, f"進入全螢幕 {fs1}，關閉後仍全螢幕 {fs2} 錯誤{errs}")
    ctx.close()

    # S10 模型還沒載入好就開鏡頭：鏡頭先開，模型好了自動開始偵測
    held = []
    ctx, pg, errs = new_page(b, hold_model=held); pg.wait_for_timeout(1500)
    pg.click("#startBtn"); pg.wait_for_timeout(1000)
    before, vis = pg.inner_text("#poseStatus"), pg.evaluate(VIS)
    for r in held:
        r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"})
    detected(pg)
    check("S10 模型未就緒先開鏡頭", vis and not errs, f"模型未好時畫面開啟 {vis}、狀態「{before}」→ 之後「{pg.inner_text('#poseStatus')}」 錯誤{errs}")
    ctx.close()

    # S11 AI 模型載入失敗：鏡頭仍可使用
    ctx, pg, errs = new_page(b, block_cdn=True); ready(pg)
    ms = pg.inner_text("#modelStatus"); pg.click("#startBtn"); pg.wait_for_timeout(1000)
    check("S11 模型載入失敗仍可開鏡頭", '失敗' in ms and pg.evaluate(VIS) and pg.evaluate("__live()") == 1,
          f"首頁「{ms}」，鏡頭畫面開啟 {pg.evaluate(VIS)}")
    ctx.close()
    b.close()

print(f"\n共 {len(results)} 項，通過 {sum(1 for _, ok in results if ok)} 項")
