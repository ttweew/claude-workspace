# 10/21 提案：實測報表（report.html）
#  1. 選很多個檔案：重錄的以最後一次為準、次數不對變黃、故意做錯沒抓到變黃、不是實測檔的列在最下面說明原因；算的時候拖進來的不理
#  2. 選 zip（錄製檔清單壓的）：一樣讀得到
#  3. 這支手機裡的錄製檔：只拿實測的
#  4. 下載 CSV；背景執行緒開不起來時改在主畫面算；重播分析頁有連結
#  5. 320～1280 不左右超出（表格在自己的框裡捲動）；axe-core 0 個問題
# 用法：python3 check.py <網站資料夾> <port>
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__))
FILES = HERE + '/files'
AXE = HERE + '/../a11y/node_modules/axe-core/axe.min.js'
base = serve(PORT, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
TABLE = """() => [...document.querySelectorAll('#reportTable tbody tr')].map(tr => ({ redo: tr.classList.contains('redo'),
  cells: [...tr.children].map(td => td.firstChild ? td.firstChild.textContent : ''), warn: [...tr.children].map(td => td.classList.contains('warn')) }))"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def page(vw=390, vh=844, block_worker=False):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=vw < 500, has_touch=vw < 500, accept_downloads=True)
        if block_worker: ctx.route("**/report-worker.js*", lambda r: r.abort())
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == 'error' and not m.text.startswith('Failed to load') and errs.append(m.text))
        pg.goto(base + "report.html"); pg.wait_for_timeout(800)
        return ctx, pg, errs
    def wait_done(pg):
        pg.wait_for_function("() => /^(已分析|沒有可以分析)/.test(document.getElementById('loadStatus').textContent)", timeout=120000)
    names = ['test_A_squat_good_20261020_210000.json', 'test_A_squat_good_20261020_210500.json', 'test_A_squat_lean_20261020_211000.json',
             'pose_20261020_211500.json', 'broken.json', 'notes.txt']
    # 1. 很多個檔案
    ctx, pg, errs = page()
    check(not pg.is_visible('#result') and not pg.is_visible('#phoneRow'), '一開始：沒有結果；手機裡沒有實測檔時不出現「讀這支手機裡的實測檔」')
    pg.set_input_files('#fileInput', [FILES + '/' + n for n in names])
    # 還在算的時候又拖一個檔案進來：不理它（不會兩批同時算、報表混在一起）
    pg.evaluate("""() => { const dt = new DataTransfer(); dt.items.add(new File(['{}'], 'late.json'));
        document.getElementById('drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""")
    wait_done(pg)
    pg.wait_for_timeout(500)
    status = pg.text_content('#loadStatus')
    rows = pg.evaluate(TABLE)
    summ = pg.inner_text('#reportSummary')
    bad = pg.inner_text('#badList')
    print('   ', status); print('   ', summ.replace('\n', ' / ')); print('   ', json.dumps(rows, ensure_ascii=False)[:600]); print('   ', bad.replace('\n', ' / '))
    check(status.startswith('已分析 3 組') and '3 個檔案沒有讀到' in status, '狀態：3 組、3 個檔案沒有讀到 ' + status)
    check(len(rows) == 3 and [r['redo'] for r in rows] == [True, False, False], '3 組，第一次的做對（只做 5 下）標成重錄')
    good, lean = rows[1], rows[2]
    check(good['cells'][:5] == ['A', '深蹲', '做對', '10 下', '10 下'] and good['cells'][5] == '沒有誤報' and not any(good['warn']), '做對 10 下：網站算 10 下、沒有誤報、不變黃 ' + str(good['cells']))
    check(lean['cells'][2] == '故意上身前傾' and lean['cells'][4] == '5 下' and lean['cells'][5].startswith('抓到 0／5 下') and lean['warn'][5], '故意前傾（示範資料沒有前傾）：抓到 0／5、變黃 ' + str(lean['cells']))
    check(rows[0]['cells'][4] == '5 下' and not any(rows[0]['warn']), '重錄的那組：變淡、不變黃')
    check('受測者：A（共 2 組；重錄的 1 組不算）' in summ and '次數完全正確：2／2（100%） 組' in summ and '故意上身前傾（深蹲）：抓到 0／5（0%） 下' in summ and '故意故意' not in summ and '做對的被誤報：0／10（0%） 下' in summ,
          '整體：受測者、重錄不算、次數、抓到、誤報')
    check('late.json' not in bad and not pg.is_disabled('#fileInput') and not pg.is_disabled('#phoneBtn'), '算的時候拖進來的檔案不理；算完按鈕恢復可以按')
    check('pose_20261020_211500.json：不是實測模式錄的檔案' in bad and 'broken.json：檔案內容不完整或格式不正確' in bad and 'notes.txt：不是 JSON 或 zip 檔' in bad, '沒有讀到的檔案寫出原因')
    with pg.expect_download() as d:
        pg.click('#csvBtn')
    csv = open(d.value.path(), encoding='utf-8-sig', newline='').read().split('\r\n')   # newline=''：保留 \r\n（Excel 要的換行）
    check(d.value.suggested_filename.startswith('test_report_') and csv[0].startswith('受測者,動作,這組,應做') and len(csv) == 5 and csv[1].split(',')[11] == '是',
          '下載 CSV：' + d.value.suggested_filename + '，3 組＋標題，重錄的標「是」')
    pg.screenshot(path=HERE + '/report_390.png', full_page=True)
    check(not errs, f'沒有錯誤 {errs[:2]}')
    # 2. zip
    pg.set_input_files('#fileInput', [FILES + '/bundle.zip'])
    wait_done(pg)
    rows = pg.evaluate(TABLE)
    check(pg.text_content('#loadStatus') == '已分析 2 組' and len(rows) == 2 and not pg.is_visible('#badFiles'), 'zip：解開後 2 組，沒有讀不到的 ' + pg.text_content('#loadStatus'))
    ctx.close()
    # 3. 這支手機裡的錄製檔
    ctx, pg, errs = page()
    pg.evaluate("""async (texts) => { const lib = await import('/js/data/library.js');
        for (const [name, text] of texts) { const rec = JSON.parse(text); await lib.saveRecording({ name, meta: rec.meta, seconds: 10, frames: rec.frames.length, blob: new Blob([text]) }); }
        await lib.saveRecording({ name: 'pose_20261020_220000', meta: { workout: 'squat' }, seconds: 5, frames: 100, blob: new Blob(['{}']) }); }""",
        [[n[:-5], open(FILES + '/' + n).read()] for n in names[1:3]])
    pg.reload(); pg.wait_for_timeout(800)
    check(pg.is_visible('#phoneBtn') and pg.text_content('#phoneNote') == '共 2 段', '手機裡有實測檔：出現按鈕，只算實測的 2 段（不算一般錄製檔）')
    pg.click('#phoneBtn'); wait_done(pg)
    check(pg.text_content('#loadStatus') == '已分析 2 組' and len(pg.evaluate(TABLE)) == 2, '讀這支手機裡的實測檔：2 組')
    check(not errs, f'沒有錯誤 {errs[:2]}')
    ctx.close()
    # 4. 背景執行緒開不起來：改在主畫面算，結果一樣
    ctx, pg, errs = page(block_worker=True)
    pg.set_input_files('#fileInput', [FILES + '/' + n for n in names[:3]])
    wait_done(pg)
    rows = pg.evaluate(TABLE)
    check(pg.text_content('#loadStatus') == '已分析 3 組' and [r['cells'][4] for r in rows] == ['5 下', '10 下', '5 下'], '背景執行緒開不起來：在主畫面算，結果一樣')
    ctx.close()
    # 重播分析頁的連結
    ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page()
    pg.goto(base + 'replay.html'); pg.wait_for_timeout(500)
    pg.click('.report-link a'); pg.wait_for_timeout(500)
    check(pg.url.endswith('report.html') and pg.text_content('h1') == '實測報表', '重播分析頁的連結打開實測報表')
    ctx.close()
    # 5. 版面、無障礙
    for vw, vh in [(320, 640), (390, 844), (768, 1024), (1280, 800)]:
        ctx, pg, errs = page(vw, vh)
        pg.set_input_files('#fileInput', [FILES + '/' + n for n in names])
        wait_done(pg)
        over = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(over <= 0, f'{vw}：整頁不左右超出（{over}）')
        if vw >= 390:
            # 390 以上：表格放得進框裡，「結果」那一欄不用左右捲動才看得到
            inner = pg.evaluate("(() => { const w = document.querySelector('.table-wrap'); return w.scrollWidth - w.clientWidth; })()")
            check(inner <= 1, f'{vw}：表格放得進框裡（多 {inner}）')
        if vw in (320, 1280):
            pg.add_script_tag(path=AXE)
            r = pg.evaluate("async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => v.id + '×' + v.nodes.length + ' ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | '))")
            check(not r, f'axe {vw}：{r}')
        if vw == 1280: pg.screenshot(path=HERE + '/report_1280.png', full_page=True)
        ctx.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
