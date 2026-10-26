# 10/26 提案：示範模式（選一段影片當鏡頭）瀏覽器端到端
#  假的 AI（goal25 的深蹲 4 下，這裡改成一直重複，同一頁第二次開鏡頭也有動作）＋ 22 秒的影片：骨架、計次、講話照常；左上角寫影片檔名、不鏡像、沒有鏡頭選單；
#    播完自動回首頁，總結寫「示範影片的結果（不存進運動紀錄）」、4 下，不存進紀錄、不能填實際幾下
#  不是影片（.txt）、壞掉的影片：說明、不開鏡頭畫面；中途按結束：回首頁，之後一般的鏡頭照常（鏡像、沒有影片標籤）
#  實測模式開著：示範影片不出現實測的一組；真的 AI＋站著的人的影片：偵測到全身；320 寬、axe-core；舊程式沒有這個按鈕
# 用法：python3 check.py <網站資料夾> <port> [old]；先跑 python3 make_videos.py
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
OLD = 'old' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(PORT, ROOT)
AXE = open(os.path.join(HERE, '..', 'a11y', 'node_modules', 'axe-core', 'axe.min.js')).read()
V22, V3, PERSON = [os.path.join(HERE, n) for n in ('moving_22.webm', 'moving_3.webm', 'person_6.webm')]
BAD = os.path.join(HERE, 'broken.webm'); open(BAD, 'wb').write(b'this is not a video ' * 50)
TXT = os.path.join(HERE, 'notes.txt'); open(TXT, 'w').write('hello')
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/fake_squat.mjs", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/fake_squat.js", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
SPEECH = """(() => {
  const log = window.__speech = [];
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { log.push(u.text); setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
  try { localStorage.setItem('voiceMode', 'full'); localStorage.setItem('recordCountdown', '0'); %s } catch (e) {}
})();"""
STATE = """() => ({ stage: !document.getElementById('stage').hidden, tag: document.getElementById('clipTag') && !document.getElementById('clipTag').hidden ? document.getElementById('clipTag').textContent : null,
  mirrored: document.getElementById('video').classList.contains('mirrored'), select: !document.getElementById('cameraSelect').hidden,
  reps: document.getElementById('hudReps').textContent, status: document.getElementById('status').textContent,
  pose: document.getElementById('poseStatus').textContent, title: document.getElementById('summaryTitle') ? document.getElementById('summaryTitle').textContent : '',
  summary: document.getElementById('summary').hidden ? null : [...document.querySelectorAll('#summaryLines li')].map(li => li.textContent),
  actual: !document.getElementById('actualForm').hidden, history: localStorage.getItem('workoutHistory'),
  testBar: !document.getElementById('testBar').hidden })"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=['--autoplay-policy=no-user-gesture-required'])
    def page(vw=1280, vh=800, real=False, extra=''):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=vw < 500, has_touch=vw < 500)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        if real: mock_network(pg)
        else:
            pg.route(CDN + "/**", fake_cdn)
            pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480))
        pg.add_init_script(SPEECH % extra)
        return ctx, pg, errs
    def pick(pg, path):
        with pg.expect_file_chooser() as fc:
            pg.click('#clipBtn')
        fc.value.set_files(path)
    if OLD:
        ctx, pg, errs = page()
        pg.goto(base + "index.html"); pg.wait_for_timeout(800)
        check(pg.locator('#clipBtn').count() == 0, '舊程式沒有示範模式的按鈕')
        b.close(); print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5]); sys.exit()
    # ---------- 1. 假的 AI 深蹲 4 下＋22 秒的影片 ----------
    ctx, pg, errs = page()
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    check(pg.is_visible('#clipBtn') and pg.text_content('#clipBtn') == '用一段影片代替鏡頭（示範模式）', '首頁有示範模式的按鈕')
    pick(pg, V22)
    pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000); pg.wait_for_timeout(1500)
    s = pg.evaluate(STATE)
    panel = pg.evaluate("[document.getElementById('demoBtn').getAttribute('aria-expanded'), document.getElementById('demoPanel').hidden]")
    check(panel == ['false', True], f'鏡頭畫面的「選擇動作」沒有被打開 {panel}')
    pg.click('#demoBtn'); pg.wait_for_timeout(300)
    panel = pg.evaluate("[document.getElementById('demoBtn').getAttribute('aria-expanded'), document.getElementById('demoPanel').hidden]")
    check(panel == ['true', False], f'按「選擇動作」打開選動作的視窗 {panel}')
    pg.click('#demoBtn'); pg.wait_for_timeout(300)
    check(s['tag'] == '示範影片：moving_22.webm' and not s['mirrored'] and not s['select'] and not s['testBar'], f'鏡頭畫面：影片檔名、不鏡像、沒有鏡頭選單 {s["tag"]} {s["mirrored"]} {s["select"]}')
    pg.wait_for_function("document.getElementById('hudReps').textContent === '4'", timeout=30000)
    check(True, '計次照常：4 下')
    pg.wait_for_function("document.getElementById('stage').hidden", timeout=15000); pg.wait_for_timeout(500)
    s = pg.evaluate(STATE)
    sp = pg.evaluate("window.__speech")
    print('   ', s['summary'], s['status'], sp[-6:])
    check(s['status'] == '示範影片播完了' and s['title'] == '示範影片的結果（不存進運動紀錄）' and s['summary'] and s['summary'][0].startswith('深蹲 4 下'), f'播完回首頁、總結 {s["title"]} {s["summary"][:1] if s["summary"] else None}')
    check(s['history'] is None and not s['actual'], f'不存進運動紀錄、不能填實際幾下 history={s["history"]}')
    check(any(t.startswith('4 下') or t == '4' for t in sp) or any('4' in t for t in sp), f'講話照常 {sp[-4:]}')
    check(pg.evaluate("document.getElementById('historyBox').hidden"), '運動紀錄沒有出現（一次都沒有）')
    # 再做一次一般的鏡頭：鏡像、沒有影片標籤；結束後總結寫「這次運動」、會存
    pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000); pg.wait_for_timeout(1500)
    s = pg.evaluate(STATE)
    check(s['tag'] is None and s['mirrored'], f'之後一般的鏡頭：鏡像、沒有影片標籤 {s["tag"]} {s["mirrored"]}')
    pg.wait_for_function("Number(document.getElementById('hudReps').textContent) >= 1", timeout=30000)
    pg.click('#stopBtn'); pg.wait_for_timeout(800)
    s = pg.evaluate(STATE)
    check(s['title'] == '這次運動' and s['history'] is not None and s['actual'], f'一般運動的總結照舊：存起來、可以填實際幾下 {s["title"]}')
    check(not errs, f'沒有錯誤 {errs[:2]}')
    ctx.close()
    # ---------- 2. 不是影片、壞掉的影片、中途結束、實測模式 ----------
    ctx, pg, errs = page(extra="localStorage.setItem('testMode', JSON.stringify({ on: true, subject: 'A', autoDownload: false }));")
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    pick(pg, TXT); pg.wait_for_timeout(800)
    s = pg.evaluate(STATE)
    check(not s['stage'] and s['status'] == '請選影片檔（mp4、webm）', f'選到文字檔：說明、不開 {s["status"]}')
    pick(pg, BAD); pg.wait_for_timeout(2500)
    s = pg.evaluate(STATE)
    check(not s['stage'] and s['status'].startswith('這段影片播不了'), f'壞掉的影片：說明、不開 {s["status"]}')
    pick(pg, V22); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000); pg.wait_for_timeout(1500)
    s = pg.evaluate(STATE)
    check(not s['testBar'], '實測模式開著：示範影片不出現實測的一組')
    pg.wait_for_timeout(1500); pg.click('#stopBtn'); pg.wait_for_timeout(800)
    s = pg.evaluate(STATE)
    check(not s['stage'] and s['status'] == '鏡頭已關閉' and s['history'] is None, f'中途結束：回首頁、不存 {s["status"]}')
    pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000); pg.wait_for_timeout(1000)
    s = pg.evaluate(STATE)
    check(s['testBar'] and s['tag'] is None, '之後一般的鏡頭：實測的一組回來了')
    pg.click('#stopBtn'); pg.wait_for_timeout(500)
    check(not errs, f'沒有錯誤 {errs[:2]}')
    ctx.close()
    # ---------- 3. 真的 AI：站著的人的影片 ----------
    ctx, pg, errs = page(real=True)
    pg.goto(base + "index.html?workout=free"); pg.wait_for_function(READY, timeout=90000)
    pick(pg, PERSON)
    pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
    try:
        pg.wait_for_function("document.getElementById('poseStatus').textContent.includes('偵測到')", timeout=8000); seen = True
    except Exception: seen = False
    pose = pg.text_content('#poseStatus')
    pg.screenshot(path=os.path.join(HERE, 'real_person.png'))
    check(seen, f'真的 AI 在影片裡找到人：{pose}')
    pg.wait_for_function("document.getElementById('stage').hidden", timeout=15000)
    check(pg.text_content('#status') == '示範影片播完了', '播完回首頁')
    check(not errs, f'沒有錯誤 {errs[:2]}')
    ctx.close()
    # ---------- 4. 版面：320 寬、axe-core ----------
    for w in [320, 390]:
        ctx, pg, errs = page(w, 800)
        pg.goto(base + "index.html"); pg.wait_for_timeout(1000)
        r = pg.evaluate("(() => { const a = document.getElementById('clipBtn').getBoundingClientRect(), c = document.querySelector('.start-card').getBoundingClientRect(); return [Math.round(a.right), document.documentElement.scrollWidth, Math.round(a.height), Math.round(a.top - c.top) > 0 && a.bottom <= c.bottom]; })()")
        check(max(r[:2]) <= w and r[2] >= 40 and r[3], f'{w} 寬：按鈕在首頁的卡片裡、放得下 {r}')
        if w == 390:
            pg.locator('.start-card').screenshot(path=os.path.join(HERE, 'start_card_390.png'))
            pg.add_script_tag(content=AXE)
            v = pg.evaluate("axe.run(document).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
            check(v == [], f'axe-core（首頁）{v}')
        ctx.close()
    # 鏡頭畫面上的影片標籤：檔名很長時不撐開（320 寬）
    ctx, pg, errs = page(320, 640)
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    LONG = os.path.join(HERE, 'a_very_long_coach_video_name_squat_tutorial_2026.webm')
    if not os.path.exists(LONG): os.symlink(V22, LONG)
    pick(pg, LONG); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000); pg.wait_for_timeout(2000)
    r = pg.evaluate("(() => { const t = document.getElementById('clipTag').getBoundingClientRect(); return [Math.round(t.right), document.documentElement.scrollWidth]; })()")
    pg.screenshot(path=os.path.join(HERE, 'stage_320.png'))
    check(max(r) <= 320, f'320 寬：長檔名的標籤不超出 {r}')
    pg.click('#stopBtn'); ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
