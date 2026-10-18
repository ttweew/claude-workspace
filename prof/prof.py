# 主執行緒每一格的時間花在哪：CDP Profiler 取樣 8 秒，依函式（自身時間）加總
import sys, json, collections
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8891)
q = sys.argv[1] if len(sys.argv) > 1 else ''
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    pg = b.new_page(viewport={"width": 390, "height": 844})
    pg.route(CDN + "/**", lambda r: r.fulfill(path=PKG + r.request.url[len(CDN):].split("?")[0], content_type="application/wasm" if r.request.url.split('?')[0].endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480) + ("window.__vf = true;" if "--vf" in sys.argv else ""))
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=90000)
    pg.click('#startBtn'); pg.wait_for_timeout(5000)
    if '--labels' in sys.argv: pg.click('#labelBtn')
    if '--data' in sys.argv: pg.click('#dataBtn')
    cdp = pg.context.new_cdp_session(pg)
    cdp.send('Profiler.enable'); cdp.send('Profiler.setSamplingInterval', {'interval': 200})
    cdp.send('Profiler.start'); pg.wait_for_timeout(8000)
    prof = cdp.send('Profiler.stop')['profile']
    perf = pg.inner_text('#perfBtn')
    nodes = {n['id']: n for n in prof['nodes']}
    dt = collections.Counter()
    deltas = prof['timeDeltas']; samples = prof['samples']
    for s, d in zip(samples, deltas[1:] + [0]):
        dt[s] += d
    total = sum(dt.values()) / 1000
    by = collections.Counter()
    for nid, us in dt.items():
        cf = nodes[nid]['callFrame']
        name = cf['functionName'] or '(anon)'
        url = cf['url'].split('/')[-1].split('?')[0]
        by[f"{name} {url}:{cf['lineNumber']+1}" if url else name] += us / 1000
    idle = by.get('(idle)', 0)
    print(f"{q or '(worker)'} {sys.argv[2:]} | {perf} | 取樣 {total:.0f} ms，忙碌 {total-idle:.0f} ms ({(total-idle)/total*100:.0f}%)")
    for k, v in by.most_common(22):
        if k == '(idle)': continue
        print(f"  {v:7.1f} ms  {v/8:5.1f} ms/秒  {k}")
    b.close()
