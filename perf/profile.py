# CPU 取樣剖析：開鏡頭 + 真的 MediaPipe（CPU 模式），CPU 慢 4 倍，取樣 10 秒，依函式彙總自己的時間
import sys, json, collections
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8861, sys.argv[1] if len(sys.argv) > 1 else "/home/user/claude-workspace")
q = sys.argv[2] if len(sys.argv) > 2 else ''
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    pg = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=60000)
    cdp = pg.context.new_cdp_session(pg)
    pg.click("#startBtn"); pg.wait_for_timeout(2500)
    if 'panel' in sys.argv: pg.click('#dataBtn')
    if 'labels' in sys.argv: pg.click('#labelBtn')
    cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    pg.wait_for_timeout(1000)
    cdp.send("Profiler.enable"); cdp.send("Profiler.setSamplingInterval", {"interval": 200}); cdp.send("Profiler.start")
    cdp.send("Performance.enable")
    m0 = {m['name']: m['value'] for m in cdp.send("Performance.getMetrics")['metrics']}
    pg.wait_for_timeout(10000)
    m1 = {m['name']: m['value'] for m in cdp.send("Performance.getMetrics")['metrics']}
    prof = cdp.send("Profiler.stop")['profile']
    fpsText = pg.inner_text('#perfBtn')
    heap = pg.evaluate("performance.memory.usedJSHeapSize/1e6")
    nodes = {n['id']: n for n in prof['nodes']}
    dt = collections.Counter()
    deltas = prof['timeDeltas']; samples = prof['samples']
    for sid, d in zip(samples, deltas): dt[sid] += d
    self_by = collections.Counter()
    for nid, t in dt.items():
        cf = nodes[nid]['callFrame']
        url = cf['url'].split('/')[-1].split('?')[0]
        self_by[(cf['functionName'] or '(anon)') + ' @' + url] += t
    total = sum(self_by.values())
    by_file = collections.Counter()
    for k, v in self_by.items(): by_file[k.split('@')[-1] or '(native/idle)'] += v
    print('fps', fpsText, '| heap MB', round(heap, 1), '| errors', errs)
    print('TaskDuration %.2fs ScriptDuration %.2fs LayoutDuration %.2fs RecalcStyle %.2fs over 10s' % tuple(m1[k] - m0[k] for k in ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']))
    print('--- by file (ms over 10s)')
    for k, v in by_file.most_common(12): print('%8.0f  %s' % (v / 1000, k))
    print('--- top self functions in our js')
    ours = [(k, v) for k, v in self_by.items() if k.split('@')[-1].endswith('.js') and 'vision' not in k]
    for k, v in sorted(ours, key=lambda x: -x[1])[:25]: print('%8.1f  %s' % (v / 1000, k))
    b.close()
