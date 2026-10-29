# 10/29 保養：運動 30 分鐘的記憶體和速度（假的 AI 一直重複做深蹲，每 10 下約 32.7 秒）
#  每 2 分鐘量一次：記憶體（先回收）、畫面元素數、事件監聽數、AI 每秒幾格、主畫面忙碌的比例、次數
#  第 10～12 分鐘打開數據面板（每一格都更新），之後關掉
#  檢查：記憶體不會一直漲、畫面元素和監聽數不變、每秒格數和忙碌的比例不變差、次數每一下都算到、關鏡頭後總結的次數一樣、沒有錯誤
# 用法：python3 soak30.py <網站資料夾> <port> [分鐘，預設 30]（先跑 make_fake.mjs）
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
MINUTES = float(sys.argv[3]) if len(sys.argv) > 3 else 30
STEP = 120 if MINUTES >= 10 else 30
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(PORT, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=HERE + '/fake_loop.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=HERE + '/fake_loop.js', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
INIT = """(() => {
  // 講話：只數講了幾句（不留下內容，免得測試自己佔記憶體）
  window.__said = 0;
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { window.__said++; setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
  try { localStorage.setItem('voiceMode', 'full'); } catch (e) {}
  // 排了 4 秒以上、還沒跑也沒取消的計時器有幾個（10/29：AI 每一格的逾時檢查以前要等滿 5 秒才清掉）
  const live = new Set(), st = window.setTimeout, ct = window.clearTimeout;
  window.setTimeout = function (fn, ms, ...rest) { const id = st.call(window, (...a) => { live.delete(id); return typeof fn === 'function' ? fn(...a) : undefined; }, ms, ...rest); if (ms >= 4000) live.add(id); return id; };
  window.clearTimeout = function (id) { live.delete(id); return ct.call(window, id); };
  window.__liveTimers = () => live.size;
  // 主畫面卡住超過 50 毫秒的次數（long task）
  window.__long = 0;
  try { new PerformanceObserver(l => { window.__long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
})();"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn)
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(INIT)
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    cdp = ctx.new_cdp_session(pg); cdp.send("Performance.enable")
    def metrics():
        cdp.send("HeapProfiler.collectGarbage")
        m = {x['name']: x['value'] for x in cdp.send("Performance.getMetrics")['metrics']}
        return m
    pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
    t0 = time.time()
    samples = []
    last = None
    panel_open = False
    while time.time() - t0 < MINUTES * 60:
        pg.wait_for_timeout(STEP * 1000)
        el = time.time() - t0
        if MINUTES >= 10 and 600 <= el < 720 and not panel_open: pg.click('#dataBtn'); panel_open = True
        elif panel_open and el >= 720: pg.click('#dataBtn'); panel_open = False
        m = metrics()
        perf = pg.inner_text('#perfBtn')
        fps = re.search(r'(\d+) FPS', perf)
        row = { 'min': round(el / 60, 1), 'reps': int(pg.text_content('#hudReps')), 'heap': round(m['JSHeapUsedSize'] / 1e6, 2), 'nodes': int(m['Nodes']),
                'listeners': int(m['JSEventListeners']), 'fps': int(fps.group(1)) if fps else None, 'panel': panel_open,
                'long': pg.evaluate('window.__long'), 'said': pg.evaluate('window.__said'), 'timers': pg.evaluate('window.__liveTimers()') }
        if last: row['busy'] = round((m['TaskDuration'] - last[0]) / (el - last[1]) * 100, 1)
        last = (m['TaskDuration'], el)
        samples.append(row)
        print('   ', json.dumps(row, ensure_ascii=False), flush=True)
    reps_before = int(pg.text_content('#hudReps'))
    el = time.time() - t0
    pg.click('#stopBtn'); pg.wait_for_timeout(1500)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    fat = pg.evaluate("(document.querySelector('#fatigueBox .fatigue-line') || {}).textContent || ''")
    flu = pg.evaluate("document.getElementById('fluencyBox').textContent")
    chart_bars = pg.evaluate("document.querySelectorAll('#repChart figure:first-of-type .rep-mark').length")
    end = metrics()
    print('    總結：', lines[:2], '｜', fat[:60], '｜', flu[:80], '｜ 長條', chart_bars)
    closed = [s for s in samples if not s['panel'] and s['min'] >= 4]
    first, lastrow = closed[0], closed[-1]
    check(lastrow['heap'] - first['heap'] <= 3, f'記憶體不會一直漲：第 {first["min"]} 分 {first["heap"]} MB → 第 {lastrow["min"]} 分 {lastrow["heap"]} MB')
    # 數據面板打開過之後，面板的內容留在畫面裡（藏起來），所以打開前、關掉後分開比
    before = [s['nodes'] for s in closed if s['min'] < 10]; after = [s['nodes'] for s in closed if s['min'] > 12] or before
    check(max(before) - min(before) <= 50 and max(after) - min(after) <= 50, f'畫面元素數不變：打開數據面板前 {min(before)}～{max(before)}、關掉後 {min(after)}～{max(after)}')
    timers = [s['timers'] for s in samples]
    check(max(timers) <= 5, f'排著沒用的長計時器：{min(timers)}～{max(timers)} 個（以前 AI 每一格排一個 5 秒的，約 150 個）')
    lis = [s['listeners'] for s in closed]
    check(max(lis) - min(lis) <= 20, f'事件監聽數不變：{min(lis)}～{max(lis)}')
    fps = [s['fps'] for s in closed if s['fps']]
    check(min(fps[-3:]) >= min(fps[:3]) - 2, f'AI 每秒格數沒有變少：前面 {fps[:3]}、最後 {fps[-3:]}')
    busy = [s['busy'] for s in closed if 'busy' in s]
    check(sum(busy[-3:]) / 3 <= sum(busy[:3]) / 3 * 1.3 + 2, f'主畫面忙碌的比例沒有變高：前面 {busy[:3]}%、最後 {busy[-3:]}%')
    expect = (el - 2) / 32.7 * 10
    check(abs(reps_before - expect) <= 4, f'{el / 60:.1f} 分鐘算到 {reps_before} 下（應該約 {expect:.0f} 下）')
    check(lines and lines[0].startswith('深蹲 ' + str(reps_before) + ' 下') and chart_bars == reps_before, f'關鏡頭後總結 {reps_before} 下、每一下的圖 {chart_bars} 條')
    check(fat.startswith('疲勞分析：') and flu.startswith('動作流暢度：') and len(flu) <= 120, f'疲勞分析、動作流暢度都有，那一句不會長到看不完（{len(flu)} 個字）')
    check(not errs, f'整段沒有程式錯誤 {errs[:2]}')
    print(f'    關鏡頭後記憶體 {end["JSHeapUsedSize"] / 1e6:.1f} MB')
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
