# 用鍵盤按「下載 CSV」：產生完之後焦點還在按鈕上嗎？連按兩次只下載一份嗎？
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8899, sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--use-fake-ui-for-media-stream"])
    ctx = b.new_context(viewport={"width": 1280, "height": 800}, accept_downloads=True)
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:100]))
    downloads = []; pg.on("download", lambda d: downloads.append(d.suggested_filename))
    mock_network(pg); pg.add_init_script(cam_script(640, 480))
    pg.goto(base + "index.html"); pg.wait_for_function(READY, timeout=90000)
    pg.click('#startBtn'); pg.wait_for_timeout(3000)
    pg.click('#dataBtn'); pg.click('#recordBtn'); pg.wait_for_timeout(15000); pg.click('#recordBtn')
    cdp = ctx.new_cdp_session(pg); cdp.send('Emulation.setCPUThrottlingRate', {'rate': 6})
    pg.focus('#csvBtn'); pg.keyboard.press('Enter'); pg.keyboard.press('Enter')
    pg.wait_for_timeout(4000)
    cdp.send('Emulation.setCPUThrottlingRate', {'rate': 1}); pg.wait_for_timeout(1500)
    focus = pg.evaluate("document.activeElement.id || document.activeElement.tagName")
    print('焦點', focus, '| 下載', downloads, '| 按鈕文字', pg.inner_text('#csvBtn'), '| errors', errs)
    b.close()
