# replay.html、report.html 改成 <main> 前後拍照比對（320、1280 寬，整頁；PNG 檔完全一樣才算一樣）
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
import hashlib
OLD, NEW = serve(8831, sys.argv[1]), serve(8832, sys.argv[2])
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for w in (320, 1280):
        for page in ('replay.html', 'report.html', 'protractor.html'):
            shots = []
            for base, tag in ((OLD, 'old'), (NEW, 'new')):
                pg = b.new_page(viewport={"width": w, "height": 900}); mock_network(pg)
                pg.goto(base + page); pg.wait_for_timeout(800)
                f = f'shot_{tag}_{w}_{page}.png'; pg.screenshot(path=f, full_page=True); shots.append(f); pg.close()
            h = [hashlib.md5(open(f, 'rb').read()).hexdigest() for f in shots]
            print(w, page, '一樣' if h[0] == h[1] else '不一樣', h)
    b.close()
