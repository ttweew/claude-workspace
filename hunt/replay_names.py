import sys, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8854)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + "replay.html")
    # 先產生一份示範 JSON（從頁面拿）
    js = pg.evaluate("import('./js/data/synth.js').then(m => JSON.stringify(m.makeDemoRecording({ yaw: 8 })))")
    nometa = json.loads(js); nometa['meta'] = {"model": "x"}
    cases = [('demo.json.txt', js.encode()), ('demo', js.encode()), ('nometa.json', json.dumps(nometa).encode()), ('﻿bom.json', ('﻿' + js).encode())]
    for name, buf in cases:
        pg.set_input_files("#fileInput", files=[{"name": name, "mimeType": "text/plain", "buffer": buf}]); pg.wait_for_timeout(300)
        print(repr(name), '→', pg.inner_text('#loadStatus'), '| 畫面大小選單', pg.is_visible('#aspectRow'), '|', [l for l in pg.inner_text('#summary').split('\n') if '×' in l])
    print('errors', errs)
    b.close()
