# 10/22 提案：照片量角器（protractor.html）。用真的 MediaPipe（暫存區 mp/）看一張真的照片（mp/pose.jpg）
#  1. 選照片 → AI 找到人：圈在 AI 的位置，你量的＝AI 算的；拖膝蓋的圈、方向鍵微調：角度照圈的位置算；差距＝AI－你量的
#  2. 換關節、放回 AI 的位置；記下來 → 使用說明「驗證實驗 A」表格多一筆（時間後面寫「照片」、關節不能換）、CSV 最後一欄「照片」
#  3. 沒有人的照片、不是照片的檔案、AI 下載失敗：說明原因，還是可以自己拖、記下來（AI 那欄空著）
#  4. 背景執行緒和主畫面兩種；320～1280 不左右超出；axe-core 0 個問題
# 用法：python3 check.py <網站資料夾> <port>
import sys, os, json, math
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__))
AXE = HERE + '/../a11y/node_modules/axe-core/axe.min.js'
base = serve(PORT, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def real_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers={"Access-Control-Allow-Origin": "*"})
num = lambda t: float(t.replace('°', '').replace('+', '')) if t not in ('—', '') else None
# 圈的位置（照片上的像素）→ 照網站的公式算角度
STATE = """() => { const c = document.getElementById('photo'); const w = c.width, h = c.height;
  const pts = [...document.querySelectorAll('.handle')].map(b => ({ x: parseFloat(b.style.left) / 100 * w, y: parseFloat(b.style.top) / 100 * h }));
  return { pts, mine: document.getElementById('mine').textContent, ai: document.getElementById('ai').textContent, diff: document.getElementById('diff').textContent,
    joint: (document.querySelector('#jointPick input:checked') || {}).value, status: document.getElementById('photoStatus').textContent }; }"""
def angle(pts):
    a, b, c = pts
    u = (a['x'] - b['x'], a['y'] - b['y']); v = (c['x'] - b['x'], c['y'] - b['y'])
    return math.degrees(math.acos(max(-1, min(1, (u[0] * v[0] + u[1] * v[1]) / (math.hypot(*u) * math.hypot(*v))))))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def clear(pg):
        pg.evaluate("document.getElementById('photoStatus').textContent = ''")
    def page(q='', vw=1280, vh=900, model_ok=True):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=vw < 500, has_touch=vw < 500, accept_downloads=True)
        ctx.route(CDN + "/**", real_cdn)
        if model_ok: ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        else: ctx.route(MODEL, lambda r: r.fulfill(status=404, body='no'))
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "protractor.html" + q); pg.wait_for_timeout(500)
        return ctx, pg, errs
    def wait_ai(pg):
        # 狀態先清掉：選了新的檔案之後，要等這一次的結果（不是上一個檔案的）
        pg.wait_for_function("() => document.getElementById('photoStatus').textContent !== ''", timeout=5000)
        pg.wait_for_function("() => /^(AI 找到|AI 在這張|AI 用不了|這不是|讀不了|照片太大)/.test(document.getElementById('photoStatus').textContent)", timeout=120000)
    for q in ['', '?worker=0']:
        tag = '（主畫面）' if q else ''
        ctx, pg, errs = page(q)
        check(not pg.is_visible('#measureCard'), tag + '一開始只有選照片')
        clear(pg); pg.set_input_files('#photoInput', MP + '/pose.jpg'); wait_ai(pg)
        s = pg.evaluate(STATE)
        print('   ', s['status'], s['joint'], s['mine'], s['ai'])
        check(s['status'].startswith('AI 找到人了') and s['joint'] in ('LEFT_KNEE', 'RIGHT_KNEE'), f'{tag}AI 找到人、預設量膝蓋：{s["joint"]}')
        check(s['mine'] == s['ai'] and num(s['ai']) and 60 < num(s['ai']) < 180 and s['diff'] == '0.0°', f'{tag}圈在 AI 的位置：你量的 {s["mine"]}＝AI 算的 {s["ai"]}，差 {s["diff"]}')
        check(abs(angle(s['pts']) - num(s['mine'])) < 0.06, f'{tag}角度照圈的位置算 {angle(s["pts"]):.2f}')
        # 拖膝蓋的圈往右 40 像素（畫面上的）
        pg.locator('.handle').nth(1).scroll_into_view_if_needed(); pg.mouse.wheel(0, 150); pg.wait_for_timeout(300)   # 圈要在畫面裡才拖得到（上面還有固定的導覽列）
        box = pg.locator('.handle').nth(1).bounding_box()
        cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx + 20, cy + 5, steps=4); pg.mouse.move(cx + 40, cy + 10, steps=4); pg.mouse.up()
        s2 = pg.evaluate(STATE)
        d = round(num(s2['ai']) * 10) / 10 - round(num(s2['mine']) * 10) / 10
        check(s2['mine'] != s['mine'] and abs(angle(s2['pts']) - num(s2['mine'])) < 0.06 and abs(num(s2['diff']) - d) < 0.051,
              f'{tag}拖了膝蓋的圈：你量的 {s2["mine"]}（照圈的位置 {angle(s2["pts"]):.2f}）、差 {s2["diff"]}')
        # 方向鍵：右 5 下、Shift＋上 1 下（照片上 5、10 像素）
        pg.locator('.handle').nth(1).focus()
        for _ in range(5): pg.keyboard.press('ArrowRight')
        pg.keyboard.press('Shift+ArrowUp')
        s3 = pg.evaluate(STATE)
        moved = (s3['pts'][1]['x'] - s2['pts'][1]['x'], s3['pts'][1]['y'] - s2['pts'][1]['y'])
        check(abs(moved[0] - 5) < 0.01 and abs(moved[1] + 10) < 0.01 and abs(angle(s3['pts']) - num(s3['mine'])) < 0.06, f'{tag}方向鍵微調：移了 {moved}，角度 {s3["mine"]}')
        label = pg.locator('.handle').nth(1).get_attribute('aria-label')
        check('膝' in label and '方向鍵' in label, f'{tag}圈有名字：{label}')
        # 記下來
        pg.click('#saveBtn')
        snaps = pg.evaluate("JSON.parse(localStorage.getItem('angleSnapshots') || '[]')")
        check(len(snaps) == 1 and snaps[0]['source'] == 'photo' and abs(snaps[0]['measured'] - num(s3['mine'])) < 0.051 and snaps[0]['joint'] == s3['joint']
              and abs(snaps[0]['angles'][s3['joint']] - num(s3['ai'])) < 0.051, f'{tag}記下來：{json.dumps(snaps)[:160]}')
        check(pg.text_content('#saveStatus').startswith('已記下第 1 筆'), tag + pg.text_content('#saveStatus'))
        # 換成髖：圈移到 AI 的髖、肩、膝；放回 AI 的位置
        hip = s3['joint'].replace('KNEE', 'HIP')
        pg.click(f'#jointPick label:has(input[value="{hip}"])')   # 選項是藏起來的圓鈕，按的是外面的字
        s4 = pg.evaluate(STATE)
        check(s4['joint'] == hip and s4['mine'] == s4['ai'] and s4['mine'] != s3['mine'], f'{tag}換成髖：{s4["mine"]}／{s4["ai"]}')
        pg.keyboard.press('Tab')
        pg.locator('.handle').nth(0).focus(); pg.keyboard.press('Shift+ArrowLeft'); pg.click('#resetBtn')
        check(pg.evaluate(STATE)['mine'] == s4['ai'], tag + '放回 AI 找到的位置')
        check(not errs, f'{tag}沒有錯誤 {errs[:2]}')
        if not q:
            pg.screenshot(path=HERE + '/protractor_1280.png', full_page=True)
            # 使用說明頁：表格多一筆照片的、關節不能換、量的角度填好了；CSV 最後一欄
            pg.goto(base + 'help.html#experiments'); pg.wait_for_timeout(800)
            row = pg.evaluate("(() => { const tr = document.querySelector('#valRows tr'); return tr && { time: tr.children[1].textContent, disabled: tr.querySelector('select').disabled, value: tr.querySelector('input').value }; })()")
            check(row and row['time'].endswith('（照片）') and row['disabled'] and abs(float(row['value']) - num(s3['mine'])) < 0.051, f'使用說明的表格：{row}')
            with pg.expect_download() as dl: pg.click('#valCsv')
            csv = open(dl.value.path(), encoding='utf-8-sig', newline='').read().split('\r\n')
            check(csv[0].endswith(',來源') and csv[1].endswith(',照片'), 'CSV 最後一欄：' + csv[1][-12:])
            check('照片量角器' in pg.inner_text('#experiments') and pg.locator('#experiments a[href="protractor.html"]').count() >= 1, '使用說明有照片量角器的連結')
        ctx.close()
    # 3. 沒有人的照片、不是照片、AI 下載失敗
    ctx, pg, errs = page()
    clear(pg); pg.set_input_files('#photoInput', HERE + '/notes.txt'); wait_ai(pg)
    check(pg.text_content('#photoStatus').startswith('這不是照片') and not pg.is_visible('#measureCard'), '不是照片：' + pg.text_content('#photoStatus'))
    clear(pg); pg.set_input_files('#photoInput', HERE + '/empty.png'); wait_ai(pg)
    s = pg.evaluate(STATE)
    check(s['status'].startswith('AI 在這張照片裡找不到人') and s['ai'] == '—' and s['mine'] == '180.0°' and s['diff'] == '—' and pg.is_hidden('#resetBtn'), f'沒有人：{s["status"][:20]} 你量的 {s["mine"]} AI {s["ai"]}')
    pg.click('#saveBtn')
    snaps = pg.evaluate("JSON.parse(localStorage.getItem('angleSnapshots') || '[]')")
    check(len(snaps) == 1 and snaps[0]['angles'][s['joint']] is None and snaps[0]['measured'] == 180, '沒有人也可以記下（AI 那欄空著）')
    check(not errs, f'沒有錯誤 {errs[:2]}')
    ctx.close()
    ctx, pg, errs = page(model_ok=False)
    clear(pg); pg.set_input_files('#photoInput', MP + '/pose.jpg'); wait_ai(pg)
    s = pg.evaluate(STATE)
    check(s['status'].startswith('AI 用不了') and s['ai'] == '—' and pg.is_visible('.handle'), 'AI 下載失敗：' + s['status'][:40])
    ctx.close()
    # 4. 版面、無障礙
    for vw in (320, 390, 768, 1280):
        ctx, pg, errs = page(vw=vw, vh=800)
        clear(pg); pg.set_input_files('#photoInput', MP + '/pose.jpg'); wait_ai(pg)
        over = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(over <= 0, f'{vw}：整頁不左右超出（{over}）')
        if vw in (390, 1280):
            pg.add_script_tag(path=AXE)
            r = pg.evaluate("async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(v => v.id + '×' + v.nodes.length)")
            check(not r, f'axe {vw}：{r}')
        if vw == 390: pg.screenshot(path=HERE + '/protractor_390.png', full_page=True)
        ctx.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
