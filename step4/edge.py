import sys, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8838)
def rec(frames, meta=None):
    return json.dumps({"format": "ai-sport-pose", "version": 1, "meta": meta or {"videoWidth": 640, "videoHeight": 480}, "landmarkNames": ["X"] * 33, "fields": {}, "frames": frames}).encode()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(viewport={"width": 1280, "height": 900}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + "replay.html")
    cases = {
        'all-empty': rec([{"t": i * 33, "landmarks": None, "world": None} for i in range(50)]),
        'one-frame-empty': rec([{"t": 0, "landmarks": None, "world": None}]),
        'no-frames': rec([]),
        'wrong-count': json.dumps({"format": "ai-sport-pose", "landmarkNames": ["X"] * 17, "frames": [{"t": 0, "landmarks": None}]}).encode(),
    }
    for name, buf in cases.items():
        pg.set_input_files("#fileInput", files=[{"name": name + ".json", "mimeType": "application/json", "buffer": buf}]); pg.wait_for_timeout(300)
        print(name, '→', pg.inner_text('#loadStatus'), '|', pg.inner_text('#readout').replace('\n', ' ') if pg.is_visible('#readout') else '(result hidden)')
    pg.click('#demoSide'); pg.wait_for_timeout(400)
    print('demo initial readout:', pg.inner_text('#readout').replace('\n', ' '))
    pg.focus('#chart'); [pg.keyboard.press('ArrowRight') for _ in range(5)]; pg.keyboard.press('Shift+ArrowRight')
    print('after 5→ + shift→:', pg.inner_text('#readout').split('\n')[0])
    pg.click('#mirrorBtn'); pg.wait_for_timeout(100)
    print('mirror facing:', [t for t in pg.inner_text('#summary').split('\n') if '畫面' in t])
    print('errors', errs)
    b.close()
