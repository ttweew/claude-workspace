# 10/21 保養：三個頁面整頁 axe-core（手機 390、筆電 1280）；10/20 找到的兩個舊問題（手機上網站名稱連結沒有字、重播分析切換按鈕對比不夠）要變 0
# 用法：python3 axe_pages.py <網站資料夾> <port>
import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
base = serve(PORT, ROOT)
AXE = '../a11y/node_modules/axe-core/axe.min.js'
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for vw, vh in [(390, 844), (1280, 800)]:
        for page in ['index.html', 'replay.html?demo', 'help.html']:
            ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=vw < 500)
            ctx.route(CDN + "/**", cdn)
            pg = ctx.new_page()
            pg.goto(base + page); pg.wait_for_timeout(3000)
            pg.add_script_tag(path=AXE)
            r = pg.evaluate("async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => v.id + '×' + v.nodes.length + ' ' + v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | '))")
            name = pg.evaluate("() => { const a = document.querySelector('.nav-brand'); return [a.getAttribute('aria-label'), getComputedStyle(a.querySelector('.nav-name')).display]; }")
            print(('PASS ' if not r else 'FAIL ') + f'{vw} {page}：{len(r)} 種問題 {r}；網站名稱連結 {name}')
            bad += bool(r)
            ctx.close()
print('ALL PASS' if not bad else 'SOME FAIL')
