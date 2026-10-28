# 10/28 提案：研究成果頁（results.html，瀏覽器）
#  320／390／1280 寬：整頁不左右捲動、四個大數字（手機兩個一排、電腦一排四個）、表格在框裡（比框寬的要能用鍵盤捲）；
#  目錄的錨點都在、連到的頁面和錨點都在；導覽列標在「使用說明」；數字和使用說明「第一次實測的結果」一樣；
#  使用說明、首頁頁尾有連到這一頁；axe-core 整頁 0 個問題；拍照
# 用法：python3 check.py <網站資料夾> <port>
import sys, os, re
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(PORT, ROOT)
AXE = open(os.path.join(HERE, '..', 'a11y', 'node_modules', 'axe-core', 'axe.min.js')).read()
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
help_html = open(os.path.join(ROOT, 'help.html'), encoding='utf-8').read()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for w, h in [(320, 640), (390, 844), (1280, 900)]:
        pg = b.new_page(viewport={"width": w, "height": h}); mock_network(pg); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "results.html"); pg.wait_for_timeout(600)
        r = pg.evaluate("""(() => ({ sw: document.documentElement.scrollWidth,
          tops: [...document.querySelectorAll('.stat')].map(s => Math.round(s.getBoundingClientRect().top)),
          wraps: [...document.querySelectorAll('.table-wrap')].map(t => [t.scrollWidth, t.clientWidth, t.tabIndex]) }))()""")
        rows = len(set(r['tops']))
        check(r['sw'] <= w, f'{w} 寬：整頁不左右捲動 {r["sw"]}')
        check(rows == (2 if w < 640 else 1) and len(r['tops']) == 4, f'{w} 寬：四個大數字排成 {rows} 列')
        over = [x for x in r['wraps'] if x[0] > x[1]]
        check(all(x[2] == 0 for x in over), f'{w} 寬：比框寬的表格 {len(over)} 個（要能用鍵盤捲：tabindex 0）{r["wraps"]}')
        pg.add_script_tag(content=AXE)
        v = pg.evaluate("axe.run(document).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
        check(v == [], f'{w} 寬：axe-core 整頁 {v}')
        pg.screenshot(path=os.path.join(HERE, f'results_{w}.png'), full_page=True)
        check(not errs, f'沒有錯誤 {errs[:2]}')
        if w == 1280:
            info = pg.evaluate("""(() => ({ toc: [...document.querySelectorAll('.toc a')].map(a => [a.getAttribute('href'), !!document.querySelector(a.getAttribute('href'))]),
              links: [...document.querySelectorAll('main a')].map(a => a.getAttribute('href')),
              current: (document.querySelector('.nav-links a[aria-current=page]') || {}).textContent,
              text: document.querySelector('main').innerText }))()""")
            check(all(ok for _, ok in info['toc']) and len(info['toc']) == 7, f'目錄的 {len(info["toc"])} 個錨點都在')
            check('使用說明' in (info['current'] or ''), '導覽列標在「使用說明」（這一頁在使用說明底下）')
            bad = []
            for href in info['links']:
                page, _, anchor = href.partition('#')
                resp = pg.request.get(base + page)
                if resp.status != 200 or (anchor and f'id="{anchor}"' not in resp.text()): bad.append(href)
            check(not bad and len(info['links']) >= 4, f'連到的 {len(info["links"])} 個頁面、錨點都在 {bad}')
            same = ['上身前傾 10／10、腳跟離地 10／10', '腰塌 5／5、屁股太高 5／5', '上身前傾 9／10、前膝超過腳尖 10／10', '15 組全對', '50 下有 7 下']
            check(all(s in info['text'] and s in help_html for s in same), '數字和使用說明「第一次實測的結果」一樣：' + '｜'.join(s for s in same if not (s in info['text'] and s in help_html)))
        pg.close()
    # 使用說明、首頁頁尾有連過來
    pg = b.new_page(viewport={"width": 1280, "height": 900}); mock_network(pg)
    pg.goto(base + "help.html"); pg.wait_for_timeout(500)
    check(pg.locator('#experiments a[href="results.html"]').count() == 1, '使用說明「驗證實驗」有連到研究成果')
    pg.goto(base + "index.html"); pg.wait_for_timeout(500)
    check(pg.locator('footer a[href="results.html"]').count() == 1, '首頁頁尾有連到研究成果')
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
