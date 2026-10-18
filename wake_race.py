from playwright.sync_api import sync_playwright
from audit_common import *
import sys
url = serve(int(sys.argv[2]), sys.argv[1])
WAKE = """(() => { window.__locks = 0; window.__req = 0;
  const mock = { request: () => { window.__req++; return new Promise(res => setTimeout(() => { window.__locks++; const l = new EventTarget(); l.released = false;
     l.release = async () => { if (!l.released) { l.released = true; window.__locks--; l.dispatchEvent(new Event('release')); } }; res(l); }, 300)); } };
  Object.defineProperty(Navigator.prototype, 'wakeLock', { get: () => mock, configurable: true }); })();"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    for first_close in [False, True]:
        pg = b.new_page(); mock_network(pg); pg.add_init_script(WAKE + cam_script(640,480)); pg.goto(url); pg.wait_for_function(READY, timeout=60000)
        if first_close:
            pg.click("#startBtn"); pg.wait_for_timeout(100); pg.click("#stopBtn"); pg.wait_for_timeout(800)
            print("   快速開關後（回到首頁）：鎖", pg.evaluate("__locks"), "（應為 0）")
        pg.click("#startBtn"); pg.wait_for_timeout(1500)
        print("先快速開關一次再開" if first_close else "直接開啟", "→ 鎖", pg.evaluate("__locks"), "（應為 1）")
        pg.click("#stopBtn"); pg.wait_for_timeout(500); print("   關閉後：鎖", pg.evaluate("__locks"), "（應為 0）"); pg.close()
    b.close()
