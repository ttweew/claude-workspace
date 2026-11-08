# 11/8 保養：全部 AI 一起開，運動 30 分鐘的記憶體和速度（10/29 soak30.py 改的）
#  自由模式、AI 全自動打開、手勢控制錄影打開（預設）、每一下的 AI 判斷和分數（有 AI 模型的動作都有）
#  假的 AI 一輪約 104 秒（make_fake_ai.mjs）：深蹲 8 下 → 舉手開始錄影 → 深蹲 4 下 → 舉手結束錄影 → 伏地挺身 8 下 → 弓箭步 8 下，一直重複
#  每 2 分鐘量一次：記憶體（先回收）、畫面元素數、事件監聽數、AI 每秒幾格、主畫面忙碌的比例、長計時器、講了幾句、換了幾次動作、錄了幾段
#  檢查：記憶體不會一直漲、畫面元素和監聽數不變、每秒格數和忙碌的比例不變差、每一輪都換 3 次動作、錄 1 段、關鏡頭後的總結、沒有錯誤
# 用法：python3 soak_ai.py <網站資料夾> <port> [分鐘，預設 30] [off：AI 全自動、手勢都關，只選深蹲（比較用）]
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import serve, cam_script, MP, READY
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
MINUTES = float(sys.argv[3]) if len(sys.argv) > 3 else 30
OFF = len(sys.argv) > 4 and sys.argv[4] == 'off'
STEP = 120 if MINUTES >= 10 else 30
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(PORT, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    name = route.request.url.split('?')[0].split('/')[-1]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if name == 'vision_bundle.mjs': route.fulfill(path=HERE + '/fake_ai.mjs', content_type="text/javascript", headers=hdr)
    elif name == 'vision_bundle.js': route.fulfill(path=HERE + '/fake_ai.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(status=404, headers=hdr)
SETTINGS = ("localStorage.setItem('aiAuto', '0'); localStorage.setItem('gestureControl', '0');" if OFF
            else "localStorage.setItem('aiAuto', '1'); localStorage.setItem('gestureControl', '1');")
INIT = """(() => {
  try { localStorage.setItem('voiceMode', 'full'); %s } catch (e) {}
  // 講話：只數（不留下全部內容，免得測試自己佔記憶體）；「做完」的最後 6 句留著看次數
  const n = window.__n = { said: 0, start: 0, done: 0, recOn: 0, recOff: 0, toasts: 0, aiToasts: 0 };
  const last = window.__lastDone = [];
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { n.said++; const t = u.text || '';
      if (t.includes('開始數') || t.includes('開始計時')) n.start++;
      if (t.includes('做完')) { n.done++; last.push(t); if (last.length > 6) last.shift(); }
      if (t.includes('開始錄影')) n.recOn++;
      if (t.includes('結束錄影')) n.recOff++;
      setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
  // 每一下的提示：跳了幾次、其中有 AI 判斷那一行的幾次
  document.addEventListener('DOMContentLoaded', () => {
    const toast = document.getElementById('repToast');
    if (toast) new MutationObserver(() => { if (toast.hidden) return; n.toasts++; if (toast.querySelector('.ai-toast')) n.aiToasts++; }).observe(toast, { childList: true });
  });
  // 排了 4 秒以上、還沒跑也沒取消的計時器有幾個
  const live = new Set(), st = window.setTimeout, ct = window.clearTimeout;
  window.setTimeout = function (fn, ms, ...rest) { const id = st.call(window, (...a) => { live.delete(id); return typeof fn === 'function' ? fn(...a) : undefined; }, ms, ...rest); if (ms >= 4000) live.add(id); return id; };
  window.clearTimeout = function (id) { live.delete(id); return ct.call(window, id); };
  window.__liveTimers = () => live.size;
  window.__long = 0;
  try { new PerformanceObserver(l => { window.__long += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
})();""" % SETTINGS
RECS = """() => new Promise(res => { try { const r = indexedDB.open('recordings'); r.onsuccess = () => { const db = r.result;
  if (!db.objectStoreNames.contains('items')) { db.close(); return res(0); }
  const c = db.transaction('items').objectStore('items').count(); c.onsuccess = () => { res(c.result); db.close(); }; }; r.onerror = () => res(-1); } catch (e) { res(-2); } })"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    for cdn in ["https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@*/**", "https://unpkg.com/@mediapipe/tasks-vision@*/**"]: ctx.route(cdn, fake_cdn)
    ctx.route("https://storage.googleapis.com/mediapipe-models/**", lambda r: r.fulfill(body=b'fake-model', headers={"Access-Control-Allow-Origin": "*"}))
    ctx.route("https://www.gstatic.com/**", lambda r: r.fulfill(status=404))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(INIT)
    pg.goto(base + ("index.html?workout=squat" if OFF else "index.html?workout=free")); pg.wait_for_function(READY, timeout=60000)
    print('   ', pg.text_content('#poseStatus')[:40], '｜ AI 全自動', pg.is_checked('#aiAutoToggle'), '｜ 手勢', pg.is_checked('#gestureToggle'))
    cdp = ctx.new_cdp_session(pg); cdp.send("Performance.enable")
    def metrics():
        cdp.send("HeapProfiler.collectGarbage")
        return {x['name']: x['value'] for x in cdp.send("Performance.getMetrics")['metrics']}
    pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
    t0 = time.time()
    samples = []
    last = None
    while time.time() - t0 < MINUTES * 60:
        pg.wait_for_timeout(STEP * 1000)
        el = time.time() - t0
        m = metrics()
        fps = re.search(r'(\d+) FPS', pg.inner_text('#perfBtn'))
        n = pg.evaluate('window.__n')
        hist = pg.evaluate("(() => { try { return JSON.parse(localStorage.getItem('workoutHistory') || '[]').length; } catch (e) { return -1; } })()")
        row = { 'min': round(el / 60, 1), 'workout': pg.evaluate("localStorage.getItem('workout')"), 'reps': pg.text_content('#hudReps'),
                'heap': round(m['JSHeapUsedSize'] / 1e6, 2), 'nodes': int(m['Nodes']), 'listeners': int(m['JSEventListeners']),
                'fps': int(fps.group(1)) if fps else None, 'long': pg.evaluate('window.__long'), 'timers': pg.evaluate('window.__liveTimers()'),
                'said': n['said'], 'start': n['start'], 'done': n['done'], 'recOn': n['recOn'], 'recOff': n['recOff'], 'toasts': n['toasts'], 'aiToasts': n['aiToasts'],
                'recs': pg.evaluate(RECS), 'hist': hist }
        if last: row['busy'] = round((m['TaskDuration'] - last[0]) / (el - last[1]) * 100, 1)
        last = (m['TaskDuration'], el)
        samples.append(row)
        print('   ', json.dumps(row, ensure_ascii=False), flush=True)
    el = time.time() - t0
    print('    最後幾次換動作講的：', pg.evaluate('window.__lastDone'))
    pg.click('#stopBtn'); pg.wait_for_timeout(2000)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    auto = pg.evaluate("(b => b && !b.hidden ? b.textContent : '')(document.getElementById('autoSummaryBox'))")
    box = pg.evaluate("(b => { if (!b || b.hidden) return null; const r = b.getBoundingClientRect(); return { h: Math.round(r.height), w: Math.round(r.width) }; })(document.getElementById('autoSummaryBox'))")
    end = metrics()
    print('    總結：', lines[:2])
    print('    AI 全自動那一句（%d 個字，框 %s）：%s' % (len(auto), box, auto[:200] + ('…' + auto[-80:] if len(auto) > 280 else auto[200:])))
    first, lastrow = samples[1], samples[-1]
    check(lastrow['heap'] - first['heap'] <= 3, f'記憶體不會一直漲：第 {first["min"]} 分 {first["heap"]} MB → 第 {lastrow["min"]} 分 {lastrow["heap"]} MB')
    nodes = [s['nodes'] for s in samples[1:]]
    check(max(nodes) - min(nodes) <= 50, f'畫面元素數不變：{min(nodes)}～{max(nodes)}')
    timers = [s['timers'] for s in samples]
    check(max(timers) <= 5, f'排著沒用的長計時器：{min(timers)}～{max(timers)} 個')
    lis = [s['listeners'] for s in samples[1:]]
    check(max(lis) - min(lis) <= 20, f'事件監聽數不變：{min(lis)}～{max(lis)}')
    fps = [s['fps'] for s in samples if s['fps']]
    check(min(fps[-3:]) >= min(fps[:3]) - 2, f'AI 每秒格數沒有變少：前面 {fps[:3]}、最後 {fps[-3:]}')
    busy = [s['busy'] for s in samples if 'busy' in s]
    check(sum(busy[-3:]) / 3 <= sum(busy[:3]) / 3 * 1.3 + 2, f'主畫面忙碌的比例沒有變高：前面 {busy[:3]}%、最後 {busy[-3:]}%')
    loops = el / 104
    if not OFF:
        check(abs(lastrow['done'] - loops * 3) <= 4, f'{el / 60:.1f} 分鐘（約 {loops:.1f} 輪）換了 {lastrow["done"]} 次動作（每輪 3 次）')
        check(abs(lastrow['recs'] - loops) <= 2 and lastrow['recOn'] - lastrow['recOff'] in (0, 1), f'手勢錄了 {lastrow["recs"]} 段（開始 {lastrow["recOn"]}、結束 {lastrow["recOff"]} 次）')
        check(lastrow['aiToasts'] >= lastrow['toasts'] * 0.9, f'每一下的提示 {lastrow["toasts"]} 次，有 AI 判斷的 {lastrow["aiToasts"]} 次')
    check(not errs, f'整段沒有程式錯誤 {errs[:2]}')
    print(f'    關鏡頭後記憶體 {end["JSHeapUsedSize"] / 1e6:.1f} MB')
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
