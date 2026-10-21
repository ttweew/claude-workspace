# 10/21 首頁版面整理＋醒目提醒：設定卡片、黃色提醒（進階設定、實測模式開著、錄製檔還沒下載）、實測模式拿到外面
# 用法：python3 check.py [網站資料夾]（舊程式預期失敗）
import sys, os, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1] if len(sys.argv) > 1 else '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AXE = S + '/a11y/node_modules/axe-core/axe.min.js'
base = serve(8907, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def axe(pg, label, within=None):
    pg.add_script_tag(path=AXE)
    res = pg.evaluate("""async (within) => { const r = await axe.run(within ? document.querySelector(within) : document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 4).map(n => n.target.join(' ')) })); }""", within)
    for v in res: print(f"    - {v['id']}（{v['impact']}，{v['n']} 處）{v['help']}：{v['targets']}")
    check(not res, f'axe {label}：{len(res)} 種問題')
AMBER = 'rgb(255, 200, 87)'
SEED = """async (n) => { const lib = await import('/js/data/library.js');
  for (let i = 0; i < n; i++) await lib.saveRecording({ name: 'test_A_squat_good_2026102' + i + '_210000', meta: { workout: 'squat', test: { subject: 'A', condition: 'good', reps: 10 } }, seconds: 30, frames: 900, blob: new Blob(['{}']) }); }"""
STATE = """() => { const q = s => document.querySelector(s); const vis = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const cs = e => getComputedStyle(e);
  return { note: vis(q('#testOnNote')) ? q('#testOnNote').innerText : null, more: vis(q('#testMore')), on: q('#testBox').classList.contains('on'),
    boxBorder: cs(q('#testBox')).borderTopColor, advTitle: q('#advancedTitle').innerText, advName: cs(q('.adv-name')).color, advOpen: q('#advanced').open,
    fpsVis: vis(q('#fpsSelect')), testInAdv: !!q('#advanced #testToggle'), lib: vis(q('#libraryBox')) ? q('#librarySummary').innerText : null,
    libAttn: q('#libraryBox').classList.contains('attn'), libBorder: cs(q('#libraryBox')).borderTopColor }; }"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def page(vw=390, vh=844):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, is_mobile=vw < 500, has_touch=vw < 500)
        ctx.route(CDN + "/**", cdn)
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type == 'error' and not m.text.startswith('INFO:') and errs.append(m.text))
        pg.goto(base + "index.html"); pg.wait_for_timeout(1200)
        return ctx, pg, errs
    # 1. 預設
    ctx, pg, errs = page()
    st = pg.evaluate(STATE)
    check(st['note'] is None and not st['more'] and not st['on'], '預設：沒有實測提醒、代號和下載的選項藏起來 ' + str({k: st[k] for k in ('note', 'more', 'on')}))
    check(st['advTitle'] == '進階設定（畫面流暢度、AI 模型，一般不用改）' and st['advName'] == AMBER and not st['advOpen'] and pg.is_hidden('#fpsSelect'),
          '進階設定：收起來、「進階設定」是黃色、標題的字和以前一樣（' + st['advTitle'] + '，' + st['advName'] + '）')
    check(not st['testInAdv'], '實測模式不在進階設定裡面')
    check(st['lib'] is None, '沒有錄製檔：不顯示錄製檔那一列')
    # 2. 實測模式：開、改代號、重新整理、關
    pg.click('#testBox .switch-pick span'); pg.wait_for_timeout(200)
    st = pg.evaluate(STATE)
    check(st['note'] and st['note'].startswith('實測模式開著 · 受測者 A') and st['more'] and st['on'] and st['boxBorder'] == AMBER,
          '按「實測模式」的字（label）就打開：最上面黃色提醒、卡片變黃、出現代號和下載的選項 ' + str(st['note']))
    pg.fill('#testSubject', 'b7'); pg.press('#testSubject', 'Tab'); pg.wait_for_timeout(200)
    st = pg.evaluate(STATE)
    check(st['note'].startswith('實測模式開著 · 受測者 B7') and '受測者' not in st['advTitle'], '改代號：提醒跟著改（大寫）；進階設定的標題不寫實測模式 ' + st['advTitle'])
    top = pg.evaluate("() => [document.getElementById('testOnNote').getBoundingClientRect().top, document.getElementById('pickTitle').getBoundingClientRect().top]")
    check(top[0] < top[1], '提醒在「今天要做什麼運動？」上面')
    pg.reload(); pg.wait_for_timeout(1200)
    st = pg.evaluate(STATE)
    check(st['note'] and 'B7' in st['note'] and st['on'] and pg.input_value('#testSubject') == 'B7', '重新整理後還開著、代號還在')
    pg.click('#testToggle'); pg.wait_for_timeout(200)
    st = pg.evaluate(STATE)
    check(st['note'] is None and not st['more'] and not st['on'], '關掉：提醒、選項都收起來')
    # 3. 進階設定改過的寫在標題上
    pg.click('#advancedTitle'); pg.wait_for_timeout(200)
    check(pg.is_visible('#fpsSelect'), '點進階設定：打開，看得到畫面流暢度')
    pg.select_option('#fpsSelect', '60'); pg.select_option('#modelSelect', 'auto'); pg.wait_for_timeout(200)
    pg.click('#advancedTitle'); pg.wait_for_timeout(200)
    st = pg.evaluate(STATE)
    check(st['advTitle'] == '進階設定（每秒 60 格、AI 模型自動）' and not st['advOpen'], '改過的設定寫在標題上：' + st['advTitle'])
    pg.click('#advancedTitle'); pg.select_option('#fpsSelect', '30'); pg.select_option('#modelSelect', 'lite'); pg.click('#advancedTitle')
    # 鍵盤：Tab 走得到進階設定，Enter 打開
    pg.focus('#testToggle'); pg.keyboard.press('Tab'); 
    check(pg.evaluate("document.activeElement.id") == 'advancedTitle', '鍵盤：實測模式的開關之後是進階設定')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    check(pg.evaluate("document.getElementById('advanced').open"), '鍵盤：Enter 打開進階設定')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
    # 4. 錄製檔：還沒下載的整列變黃；都下載過就不黃
    pg.evaluate(SEED, 2); pg.reload(); pg.wait_for_timeout(1200)
    st = pg.evaluate(STATE)
    check(st['lib'] and st['lib'].startswith('錄製檔') and '2 段' in st['lib'] and '2 段還沒下載' in st['lib'] and st['libAttn'] and st['libBorder'] == AMBER,
          '有還沒下載的錄製檔：整列變黃，下面一行寫幾段、幾段還沒下載 ' + repr(st['lib']))
    pg.evaluate("async () => { const lib = await import('/js/data/library.js'); const items = await lib.listRecordings(); await lib.markDownloaded(items.map(i => i.id)); }")
    pg.reload(); pg.wait_for_timeout(1200)
    st = pg.evaluate(STATE)
    check(st['lib'] and '都下載過了' in st['lib'] and not st['libAttn'] and st['libBorder'] != AMBER, '都下載過了：不黃 ' + repr(st['lib']))
    pg.click('#librarySummary'); pg.wait_for_timeout(300)
    check(pg.locator('#homeLibrary .lib-items li').count() == 2, '點錄製檔那一列：打開清單')
    check(not errs, f'沒有錯誤 {errs[:2]}')
    ctx.close()
    # 5. 版面：各種寬度不左右超出、語音三個選項同一行、開關在右邊、自由模式一行、卡片在首頁的框裡
    LAYOUT = """() => { const r = e => e.getBoundingClientRect(); const card = r(document.querySelector('.start-card'));
      const pills = [...document.querySelectorAll('.voice-modes span')].map(e => Math.round(r(e).top));
      const sw = r(document.getElementById('testToggle')), box = r(document.getElementById('testBox'));
      const cards = [...document.querySelectorAll('.set-card, .row-card, .attn-bar')].filter(e => e.getClientRects().length);
      return { over: document.documentElement.scrollWidth - innerWidth, pillsRow: new Set(pills).size, switchRight: Math.round(box.right - sw.right),
        free: Math.round(r(document.querySelector('#freeLine .free-start:not([hidden])')).height), inside: cards.every(e => r(e).left >= card.left - 0.5 && r(e).right <= card.right + 0.5),
        cards: cards.length }; }"""
    for vw, vh in [(320, 640), (360, 740), (375, 667), (390, 844), (414, 896), (768, 1024), (1280, 800), (1920, 1080)]:
        ctx, pg, errs = page(vw, vh)
        pg.evaluate(SEED, 1)
        pg.evaluate("localStorage.setItem('testMode', JSON.stringify({ on: true, subject: 'A', autoDownload: false }))")
        pg.reload(); pg.wait_for_timeout(1200)
        pg.evaluate("document.getElementById('advanced').open = true"); pg.wait_for_timeout(150)
        L = pg.evaluate(LAYOUT)
        check(L['over'] <= 0 and L['pillsRow'] == 1 and 12 <= L['switchRight'] <= 16 and L['free'] <= 46 and L['inside'] and L['cards'] >= 6,
              f'{vw}×{vh}：不左右超出、語音選項同一行、開關靠右、自由模式一行、卡片在框裡 {L}')
        if vw in (390, 1280):
            axe(pg, f'{vw} 首頁（實測模式開著、進階設定打開、有錄製檔）', '.start-card')
        ctx.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:6])
