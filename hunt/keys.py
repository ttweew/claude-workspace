import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8855)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + "replay.html?demo"); pg.wait_for_timeout(500)
    pg.focus('#chart')
    for _ in range(5): pg.keyboard.press('ArrowRight')
    pg.keyboard.press('Shift+ArrowRight'); pg.wait_for_timeout(100)
    print('after 5→ + shift→ (wait):', pg.inner_text('#readout').split('\n')[0])
    for name, buf in [('x.txt', b'hello world'), ('half.json', b'{"format":"ai-sport-pose","frames":[{"t":0,')]:
        pg.set_input_files("#fileInput", files=[{"name": name, "mimeType": "text/plain", "buffer": buf}]); pg.wait_for_timeout(200)
        print(name, '→', pg.inner_text('#loadStatus'))
    print('errors', errs)
    b.close()
