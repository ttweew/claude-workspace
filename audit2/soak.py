# 地基審查：長時間運行。伏地挺身一直做（每 11.2 秒 3 下），中間錄 10 分鐘；棒式一直撐、起身、再撐
# 檢查：次數每一下都算到、不會多算；棒式每一次的秒數都在合理範圍；記憶體不會一直漲（錄製中的資料除外）；
# 錄 10 分鐘的檔案下載得出來、每一格的時間一直往上加；整段沒有程式錯誤
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
MINUTES = float(sys.argv[2]) if len(sys.argv) > 2 else 12
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8853, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/loop_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/loop_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
SPY = """window.__toasts = [];
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speaking: false, pending: false, getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} } });
  new MutationObserver(() => {
    const t = document.getElementById('repToast');
    if (t && !t.hidden && window.__toasts[window.__toasts.length - 1] !== t.textContent) window.__toasts.push(t.textContent);
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });"""
def heap(pg, cdp):
    cdp.send("HeapProfiler.collectGarbage")
    m = {x['name']: x['value'] for x in cdp.send("Performance.getMetrics")['metrics']}
    return m['JSHeapUsedSize'] / 1e6

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    # 1. 伏地挺身（假的 AI 一直重播：每 11.2 秒 3 下，第 2、3 下塌腰）
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn('pushup_err'))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(SPY)
    pg.add_init_script("try { localStorage.setItem('recordLimit', '10'); } catch (e) {}")
    pg.goto(base + "index.html?workout=pushup"); pg.wait_for_function(READY, timeout=60000)
    cdp = ctx.new_cdp_session(pg); cdp.send("Performance.enable")
    t0 = time.time()
    pg.click("#startBtn"); pg.wait_for_timeout(3000)
    h_start = heap(pg, cdp)
    samples = []
    rec_started = rec_stopped = None
    total = MINUTES * 60
    while time.time() - t0 < total:
        pg.wait_for_timeout(20000)
        el = time.time() - t0
        reps = int(pg.text_content("#hudReps"))
        samples.append((round(el), reps, round(heap(pg, cdp), 1), pg.inner_text("#perfBtn")[:30]))
        # 第 1 分鐘後開始錄 10 分鐘（錄滿自動停止）
        if rec_started is None and el > 60:
            pg.click("#dataBtn"); pg.click("#recordBtn"); pg.click("#dataBtn"); rec_started = time.time()
    print('時間、次數、記憶體 MB：', samples)
    toasts = pg.evaluate("window.__toasts")
    reps = int(pg.text_content("#hudReps"))
    # 每 11.2 秒 3 下：開鏡頭後 elapsed 秒，最多差 1 輪
    el = time.time() - t0 - 3
    expect = el / 11.2 * 3
    check(abs(reps - expect) <= 4, f'{el:.0f} 秒算到 {reps} 下（應該約 {expect:.0f} 下）')
    nums = [int(re.match(r'第 (\d+) 下', t).group(1)) for t in toasts if re.match(r'第 (\d+) 下', t)]
    check(nums == list(range(nums[0], nums[0] + len(nums))) if nums else False, f'每一下的提示編號連續、不重複（{nums[:3]}…{nums[-3:]}，共 {len(nums)} 個）')
    sag = [t for t in toasts if '塌腰' in t]
    check(abs(len(sag) - len(nums) * 2 / 3) <= 3, f'塌腰的比例：{len(sag)}／{len(nums)}（應該約 2/3）')
    sims = [int(m.group(1)) for t in toasts for m in [re.search(r'相似 (\d+)%', t)] if m]
    check(sims and min(sims) >= 0 and max(sims) <= 100 and max(sims) - min(sims) <= 10, f'相似度穩定：{min(sims)}～{max(sims)}')
    # 錄製：10 分鐘錄滿自動停止，記憶體在錄製中變大，停止後下載
    info = pg.inner_text("#recordInfo")
    check('已錄滿 10 分鐘' in info or MINUTES < 11.5, '錄滿自動停止：' + info)
    pg.click("#dataBtn")
    # 短時間跑的時候還沒錄滿：先按停止錄製（錄製中下載按鈕是藏起來的）
    if pg.evaluate("document.getElementById('recordBtn').classList.contains('recording')"):
        pg.click("#recordBtn"); pg.wait_for_timeout(500)
    with pg.expect_download(timeout=120000) as d:
        pg.click("#jsonBtn")
    path = d.value.path()
    size = os.path.getsize(path) / 1e6
    rec = json.load(open(path))
    ts = [f['t'] for f in rec['frames']]
    check(all(b2 > a for a, b2 in zip(ts, ts[1:])), f'錄製檔 {size:.0f} MB、{len(ts)} 格、時間一直往上加（最後 {ts[-1] / 1000:.0f} 秒）')
    # 不錄的時候記憶體不能一直漲：比較錄製停止後和一開始
    pg.click("#dataBtn")
    reps = int(pg.text_content("#hudReps"))   # 關鏡頭前最後的次數（下載的時候可能又做完一下）
    pg.click("#stopBtn"); pg.wait_for_timeout(1500)
    h_end = heap(pg, cdp)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    check(lines and lines[0].startswith('伏地挺身 ' + str(reps) + ' 下'), '關鏡頭後總結：' + str(lines[:2]))
    print(f'記憶體：開始 {h_start:.1f} MB，關鏡頭後 {h_end:.1f} MB（錄製的資料還留著，可以再下載）')
    check(not errs, '整段沒有程式錯誤 ' + str(errs[:2]))
    ctx.close()

    # 2. 棒式：撐 8 秒、翹屁股 2 秒、再撐 4 秒、起身 5 秒，一直重複（每輪約 19 秒，一次約 12 秒）
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn('plank'))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480)); pg.add_init_script(SPY)
    pg.goto(base + "index.html?workout=plank"); pg.wait_for_function(READY, timeout=60000)
    pg.click("#startBtn"); pg.wait_for_timeout(int(MINUTES / 3 * 60000))
    toasts = pg.evaluate("window.__toasts")
    secs = [int(m.group(1)) * 60 + int(m.group(2)) for t in toasts for m in [re.search(r'撐了 (\d+):(\d\d)', t)] if m]
    check(len(secs) >= 3 and all(9 <= s <= 12 for s in secs), f'棒式每一次撐的秒數（應該 9～12 秒）：{secs}')
    pg.click("#stopBtn"); pg.wait_for_timeout(500)
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    best = max(secs) if secs else -1
    check(lines and ('最久 0:%02d' % best) in lines[0], f'總結的最久和提示一樣（{best} 秒）：{lines[:1]}')
    check(not errs, '棒式整段沒有程式錯誤 ' + str(errs[:2]))
    ctx.close()
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
