# 網站實際比較：主執行緒忙碌比例、FPS、點按鈕的反應時間（AI 佔住主執行緒時，點下去要等它算完才會反應）
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8864, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for q in ['?worker=0', '']:
        pg = b.new_page(viewport={"width": 390, "height": 844})
        mock_network(pg); pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html" + q); pg.wait_for_function(READY, timeout=90000)
        pg.click('#startBtn'); pg.wait_for_timeout(3000)
        cdp = pg.context.new_cdp_session(pg); cdp.send("Performance.enable")
        m0 = {m['name']: m['value'] for m in cdp.send("Performance.getMetrics")['metrics']}
        # 反應時間：每 200 ms 排一個 0 ms 的計時器，量它實際晚多久才執行（主執行緒被佔住就會晚）
        lag = pg.evaluate("""new Promise(res => { const out = []; let n = 0;
            const tick = () => { const t = performance.now(); setTimeout(() => { out.push(performance.now() - t); if (++n < 40) setTimeout(tick, 200); else res(out); }, 0); }; tick(); })""")
        m1 = {m['name']: m['value'] for m in cdp.send("Performance.getMetrics")['metrics']}
        secs = 40 * 0.2
        lag.sort()
        print(f"[{q or 'default（背景）'}] 主執行緒忙碌 {(m1['TaskDuration']-m0['TaskDuration'])/secs*100:.0f}% | {pg.inner_text('#perfBtn')} | 反應延遲 中位數 {lag[len(lag)//2]:.0f} ms、最慢 {lag[-1]:.0f} ms")
        pg.close()
    b.close()
