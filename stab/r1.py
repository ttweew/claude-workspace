import sys, json
from common import *
PORT = int(__import__("os").environ.get("PORT", 8801)); serve("/home/user/claude-workspace", PORT)
SCENE = """
window.__scene = 'person';
navigator.mediaDevices.getUserMedia = async () => {
  const im = new Image(); im.src = '/__test/pose.jpg'; await im.decode();
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d'); let k = 0;
  const draw = () => { if (window.__scene === 'person') g.drawImage(im, 0, 0); else { g.fillStyle = '#334'; g.fillRect(0, 0, c.width, c.height); } g.fillStyle = k++ % 2 ? '#000' : '#111'; g.fillRect(0, 0, 2, 2); };
  draw(); setInterval(draw, 33);
  const s = c.captureStream(30); window.__streams = (window.__streams || []); window.__streams.push(s); return s;
};"""
def live(pg): return pg.evaluate("(window.__streams||[]).filter(s => s.getVideoTracks().some(t => t.readyState === 'live')).length")
def st(pg): return pg.evaluate("[document.getElementById('poseStatus').textContent, document.getElementById('banner').hidden ? '' : document.getElementById('banner').textContent, document.getElementById('perfBtn').textContent]")
def newpage(b, gpu=False, vw=1280, vh=720, mobile=False):
    pg = b.new_page(viewport={"width":vw,"height":vh}, is_mobile=mobile, has_touch=mobile, device_scale_factor=3 if mobile else 1)
    errs=[]; logs=[]
    pg.on("pageerror",lambda e:errs.append(str(e)[:150]))
    pg.on("console",lambda m: logs.append(m.type+": "+m.text[:150]) if m.type in ('error','warning') and 'W1001' not in m.text and 'GL Driver' not in m.text and 'XNNPACK' not in m.text and 'CERT' not in m.text and 'E1001' not in m.text else None)
    pg.route(CDN+"/**", cdn)
    pg.route("https://storage.googleapis.com/**", lambda r: r.fulfill(path=MP+"/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin":"*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP+"/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script("try { localStorage.setItem('recordCountdown', '0'); } catch (e) {}")
    pg.add_init_script(SCENE); pg.add_init_script(TRACK_GL)
    if gpu: pg.add_init_script(FAKE_GPU)
    pg.goto(f"http://127.0.0.1:{PORT}/index.html" + __import__("os").environ.get("QUERY", ""))
    pg.wait_for_function("document.getElementById('modelStatus').textContent.match(/已就緒|失敗/)", timeout=60000)
    return pg, errs, logs
which = sys.argv[1:]
with sync_playwright() as p:
    b = launch(p)
    if 'S1' in which:
        pg,errs,logs = newpage(b)
        pg.evaluate("document.getElementById('startBtn').click(); document.getElementById('startBtn').click(); document.getElementById('startBtn').click()")
        pg.wait_for_timeout(2500)
        print("S1 三連點開啟：使用中鏡頭", live(pg), st(pg), errs, logs)
        pg.close()
    if 'S2' in which:
        pg,errs,logs = newpage(b, gpu=True)
        pg.click("#startBtn"); pg.wait_for_timeout(2000)
        pg.evaluate("window.__gls.forEach(g => g.getExtension('WEBGL_lose_context')?.loseContext()); 0")
        pg.wait_for_timeout(150); pg.click("#stopBtn"); pg.wait_for_timeout(300)
        print("S2 重新啟動中關鏡頭：首頁", pg.inner_text("#status"), "| 使用中鏡頭", live(pg))
        pg.wait_for_timeout(4000)
        pg.click("#startBtn"); pg.wait_for_timeout(4000)
        print("S2 再開：", st(pg), errs, logs)
        pg.close()
    if 'S3' in which:
        pg,errs,logs = newpage(b, gpu=True)
        pg.click("#startBtn"); pg.wait_for_timeout(2000)
        pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(2000)
        pg.evaluate("window.__gls.forEach(g => g.getExtension('WEBGL_lose_context')?.loseContext()); 0")
        pg.wait_for_timeout(5000)
        info1 = pg.inner_text("#recordInfo"); pg.click("#recordBtn")
        print("S3 錄製中 GPU 失效：", info1, "→", pg.inner_text("#recordInfo"), "| 狀態", st(pg), "| CSV 鈕", pg.is_visible("#csvBtn"), errs, logs)
        pg.close()
    if 'S4' in which:
        pg,errs,logs = newpage(b)
        pg.click("#startBtn"); pg.wait_for_timeout(2000)
        pg.evaluate("document.getElementById('video').pause()")
        pg.evaluate("Object.defineProperty(document, 'visibilityState', {value: 'hidden', configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")
        pg.wait_for_timeout(500)
        pg.evaluate("Object.defineProperty(document, 'visibilityState', {value: 'visible', configurable: true}); document.dispatchEvent(new Event('visibilitychange'))")
        pg.wait_for_timeout(1500)
        print("S4 切背景回來：影像暫停?", pg.evaluate("document.getElementById('video').paused"), st(pg), errs, logs)
        pg.close()
    if 'S5' in which:
        pg,errs,logs = newpage(b, vw=390, vh=844, mobile=True)
        pg.click("#startBtn"); pg.wait_for_timeout(2500)
        def geo():
            return pg.evaluate("""(() => { const s = document.getElementById('stage').getBoundingClientRect(), o = document.getElementById('overlay'), r = o.getBoundingClientRect(), v = document.getElementById('video');
              const sc = Math.min(s.width / v.videoWidth, s.height / v.videoHeight);
              return {stage: [s.width, s.height], overlayCss: [Math.round(r.width), Math.round(r.height)], expect: [Math.round(v.videoWidth*sc), Math.round(v.videoHeight*sc)], canvas: [o.width, o.height],
                labelsOutside: [...document.querySelectorAll('.joint-label:not([hidden])')].filter(l => { const b = l.getBoundingClientRect(); return b.right > s.width + 1 || b.left < -1 || b.bottom > s.height + 1 || b.top < -1; }).map(l => l.textContent),
                hud: getComputedStyle(document.getElementById('hud')).display}; })()""")
        print("S5 直式：", geo())
        pg.set_viewport_size({"width":844,"height":390}); pg.wait_for_timeout(1500)
        print("S5 轉橫式：", geo())
        pg.set_viewport_size({"width":390,"height":844}); pg.wait_for_timeout(1500)
        print("S5 轉回直式：", geo(), errs, logs)
        pg.close()
    if 'S6' in which:
        pg,errs,logs = newpage(b)
        pg.click("#startBtn"); pg.wait_for_timeout(2000)
        seq = []
        for i in range(6):
            pg.evaluate(f"window.__scene = '{'blank' if i % 2 == 0 else 'person'}'"); pg.wait_for_timeout(1500)
            seq.append((st(pg)[0], pg.evaluate("document.getElementById('hud').classList.contains('empty')"), pg.evaluate("document.querySelectorAll('.joint-label:not([hidden])').length")))
        print("S6 人進出畫面：", seq, errs, logs)
        pg.close()
    if 'S7' in which:
        pg,errs,logs = newpage(b)
        pg.click("#startBtn"); pg.wait_for_timeout(3000)
        pg.click("#labelBtn")
        cdp = pg.context.new_cdp_session(pg)
        def m():
            cdp.send("HeapProfiler.collectGarbage")
            h = pg.evaluate("performance.memory ? performance.memory.usedJSHeapSize : 0")
            return round(h/1e6,1), pg.evaluate("document.getElementsByTagName('*').length"), st(pg)[2]
        r = [m()]
        for i in range(4):
            pg.evaluate(f"window.__scene = '{'blank' if i == 1 else 'person'}'")
            pg.wait_for_timeout(30000); r.append(m())
        print("S7 長時間 2 分鐘 (heapMB, DOM, FPS)：", r, errs, logs)
        pg.close()
    if 'S8' in which:
        pg,errs,logs = newpage(b, vw=320, vh=568, mobile=True)
        pg.click("#startBtn"); pg.wait_for_timeout(2000)
        pg.click("#labelBtn"); pg.click("#dataBtn"); pg.click("#recordBtn"); pg.wait_for_timeout(1000)
        pg.screenshot(path="r1_s8_small.png")
        pg.set_viewport_size({"width":568,"height":320}); pg.wait_for_timeout(1000)
        pg.screenshot(path="r1_s8_land.png")
        print("S8 小螢幕全開：", st(pg), errs, logs)
        pg.close()
    if 'S9' in which:
        pg,errs,logs = newpage(b)
        pg.click("#startBtn"); pg.wait_for_timeout(1500)
        pg.evaluate("window.__scene = 'blank'"); pg.wait_for_timeout(1500)
        pg.mouse.click(640, 360); pg.wait_for_timeout(300)
        pg.evaluate("window.__scene = 'person'"); pg.wait_for_timeout(1500)
        pg.mouse.click(640, 360); pg.wait_for_timeout(200)
        pg.evaluate("window.__scene = 'blank'"); pg.wait_for_timeout(800)
        pg.evaluate("window.__scene = 'person'"); pg.wait_for_timeout(1000)
        print("S9 點畫面時沒人/點完人離開：", pg.evaluate("[...document.querySelectorAll('.joint-label:not([hidden])')].map(l=>l.textContent)"), errs, logs)
        pg.close()
    if 'S10' in which:
        pg,errs,logs = newpage(b)
        pg.focus("#startBtn"); pg.keyboard.press("Enter"); pg.wait_for_timeout(2000)
        order = []
        for i in range(8):
            pg.keyboard.press("Tab"); order.append(pg.evaluate("document.activeElement.id || document.activeElement.tagName"))
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        print("S10 鍵盤：開啟後", pg.is_visible("#stage"), "| Tab 順序", order, "| 焦點框", pg.evaluate("getComputedStyle(document.activeElement).outlineStyle"), errs)
        pg.close()
    b.close()
