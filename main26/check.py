# 10/26 主線：實測結果寫進驗證實驗
#  1. 實測報表頁讀 10/20 的 23 個實測檔（真的瀏覽器），整體的數字和寫進使用說明的一樣
#  2. 使用說明「第一次實測的結果」：320～1280 寬不左右超出、axe-core 0 個問題（整頁）、拍照
# 用法：python3 check.py <網站資料夾> <port> <實測檔資料夾>（實測檔是組員的錄影，只在暫存區）
import sys, os, glob
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT, REAL = sys.argv[1], int(sys.argv[2]), sys.argv[3]
HERE = os.path.dirname(os.path.abspath(__file__))
AXE = open(os.path.join(HERE, '..', 'a11y', 'node_modules', 'axe-core', 'axe.min.js')).read()
base = serve(PORT, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + "report.html"); pg.wait_for_timeout(800)
    files = sorted(glob.glob(REAL + '/*.json'))
    pg.set_input_files('#fileInput', files)
    pg.wait_for_function("document.querySelectorAll('#reportTable tbody tr').length >= 23", timeout=180000)
    pg.wait_for_timeout(1500)
    summary = pg.inner_text('#sumTitle + *') if pg.locator('#sumTitle + *').count() else ''
    section = pg.evaluate("document.getElementById('sumTitle').closest('section').innerText")
    print(section)
    for want in ['14／15', '10／10', '9／10', '5／5', '2／2', '7']:
        check(want in section, '報表整體有 ' + want)
    check(not errs, f'報表頁沒有錯誤 {errs[:2]}')
    # 使用說明
    for w in [320, 390, 768, 1280]:
        c2 = b.new_context(viewport={"width": w, "height": 900}, is_mobile=w < 500, has_touch=w < 500)
        hp = c2.new_page(); herrs = []
        hp.on("pageerror", lambda e: herrs.append(str(e)))
        hp.goto(base + "help.html#results1020"); hp.wait_for_timeout(800)
        r = hp.evaluate("""(() => { const t = document.querySelector('.result-table'), box = t.closest('.table-wrap');
          return [document.documentElement.scrollWidth, Math.round(t.getBoundingClientRect().width), box.clientWidth, box.scrollWidth]; })()""")
        check(r[0] <= w and r[3] <= r[2] + 1, f'{w} 寬：整頁 {r[0]}、表格 {r[1]}、框 {r[2]}/{r[3]}（不左右捲動）')
        if w in (320, 1280):
            hp.locator('#results1020').scroll_into_view_if_needed()
            hp.locator('.result-table').screenshot(path=os.path.join(HERE, f'result_{w}.png'))
        if w == 390:
            hp.add_script_tag(content=AXE)
            v = hp.evaluate("axe.run(document).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
            check(v == [], f'axe-core（使用說明整頁）{v}')
        check(not herrs, f'{w} 使用說明沒有錯誤 {herrs[:2]}')
        c2.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
