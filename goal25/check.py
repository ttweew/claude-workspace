# 10/25 主線：四個動作自訂目標（瀏覽器端到端）
#  首頁「目標」卡片：四列、常用的選項、自己填（先放數字、填錯說明範圍、不存）、重新整理還在、320 寬放得下、axe-core
#  棒式（假的 AI 一直線撐 22 秒，目標 18 秒）：完整語音 10 秒報時、13～17 秒倒數 5～1、18 秒「時間到」、20 秒報時；次數框「目標 0:18」做到變綠；總結「目標 18 秒：達成」
#    只講錯誤：只講倒數、時間到；不講話：倒數短嗶 5 聲、時間到長嗶 1 聲；沒設目標：不報時（和以前一樣）；背景執行緒和主畫面
#  深蹲（4 下，目標 3 下）：第 3 下「3 下，完成目標」、第 4 下照常；只講錯誤時也講完成目標；總結「目標 3 下：達成」
# 用法：python3 check.py <網站資料夾> [old]；先跑 node make_fake.mjs <網站資料夾>
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(8861, ROOT)
AXE = open(os.path.join(HERE, '..', 'a11y', 'node_modules', 'axe-core', 'axe.min.js')).read()
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
FAKE = {'name': 'plank'}
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    n = FAKE['name']
    if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/fake_{n}.mjs", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/fake_{n}.js", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
def speech(mode, goals):
    return """(() => {
  const log = window.__speech = [];
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { log.push([Math.round(performance.now()), u.text]); setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
  try { localStorage.setItem('voiceMode', %s); %s } catch (e) {}
  // 嗶聲：記下每個音的頻率（880 短嗶＝倒數、1320 長嗶＝時間到，見 js/ui/sound.js）
  window.__tones = [];
  const Orig = window.AudioContext || window.webkitAudioContext;
  if (Orig) {
    class Spy extends Orig { createOscillator() { const o = super.createOscillator(); const start = o.start.bind(o);
      o.start = t => { window.__tones.push([Math.round(performance.now()), o.frequency.value]); return start(t); }; return o; } }
    window.AudioContext = Spy; window.webkitAudioContext = Spy;
  }
  window.__labels = [];
  new MutationObserver(() => { const n = document.getElementById('hudRepsName'), b = document.getElementById('hudRepsBox');
    if (!n || b.hidden) return; const v = n.textContent + (b.classList.contains('goal-done') ? '✓' : '');
    if (window.__labels[window.__labels.length - 1] !== v) window.__labels.push(v); })
    .observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
})();""" % (json.dumps(mode), ("localStorage.setItem('workoutGoals', %s);" % json.dumps(json.dumps(goals))) if goals is not None else '')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def page(vw=1280, vh=800):
        ctx = b.new_context(viewport={"width": vw, "height": vh})
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480))
        return ctx, pg, errs
    # ---------- 首頁「目標」卡片（加 old：舊程式沒有這張卡片，跳過） ----------
    ctx, pg, errs = page() if 'old' not in sys.argv else (None, None, None)
    if ctx:
      pg.goto(base + "index.html"); pg.wait_for_timeout(800)
      rows = pg.evaluate("[...document.querySelectorAll('#goalRows .goal-row')].map(r => [r.querySelector('label').textContent, [...r.querySelectorAll('option')].map(o => o.textContent)])")
      check([r[0] for r in rows] == ['深蹲', '伏地挺身', '棒式', '弓箭步'] and rows[2][1] == ['不設目標', '10 秒', '20 秒', '30 秒', '40 秒', '自己填…'] and rows[0][1] == ['不設目標', '5 下', '10 下', '15 下', '20 下', '自己填…'],
            f'四列、常用的選項 {rows}')
      check(not pg.is_visible('#goalInput-plank') and pg.evaluate("document.getElementById('goal-plank').value") == '', '一開始不設目標、沒有框')
      pg.select_option('#goal-plank', 'custom'); pg.wait_for_timeout(200)
      st = lambda: pg.evaluate("localStorage.getItem('workoutGoals')")
      check(pg.is_visible('#goalInput-plank') and pg.input_value('#goalInput-plank') == '30' and json.loads(st()) == {'plank': 30}, f'選「自己填」：先放 30、存起來 {st()}')
      pg.fill('#goalInput-plank', 'abc'); pg.press('#goalInput-plank', 'Enter'); pg.wait_for_timeout(200)
      note = pg.text_content('#goalNote-plank')
      check(note == '請填 5～600 的整數' and pg.get_attribute('#goalInput-plank', 'aria-invalid') is not None and json.loads(st()) == {'plank': 30}, f'填錯：說明範圍、不存 {note} {st()}')
      pg.fill('#goalInput-plank', '１８'); pg.wait_for_timeout(200)
      check(json.loads(st()) == {'plank': 18} and pg.text_content('#goalNote-plank') == '', f'全形數字也可以 {st()}')
      pg.select_option('#goal-squat', 'custom'); pg.fill('#goalInput-squat', '3'); pg.wait_for_timeout(200)
      pg.select_option('#goal-lunge', '15'); pg.wait_for_timeout(200)
      check(json.loads(st()) == {'plank': 18, 'squat': 3, 'lunge': 15} and not pg.is_visible('#goalInput-lunge'), f'深蹲自己填 3、弓箭步選 15 下 {st()}')
      pg.reload(); pg.wait_for_timeout(800)
      kept = pg.evaluate("['squat','pushup','plank','lunge'].map(id => [document.getElementById('goal-' + id).value, document.getElementById('goalInput-' + id).value])")
      check(kept == [['custom', '3'], ['', ''], ['custom', '18'], ['15', '']], f'重新整理還在 {kept}')
      pg.select_option('#goal-lunge', ''); pg.wait_for_timeout(200)
      check(json.loads(st()) == {'plank': 18, 'squat': 3}, f'改回不設目標 {st()}')
      for w in [320, 390]:
          pg.set_viewport_size({"width": w, "height": 800}); pg.wait_for_timeout(300)
          sw = pg.evaluate("document.documentElement.scrollWidth")
          box = pg.evaluate("(() => { const r = document.getElementById('goalPick').getBoundingClientRect(); const rows = [...document.querySelectorAll('.goal-row')].map(x => x.getBoundingClientRect().height); return [Math.round(r.right), Math.max(...rows)]; })()")
          check(sw <= w and box[0] <= w, f'{w} 寬放得下（scrollWidth {sw}、卡片右邊 {box[0]}、一列最高 {box[1]}px）')
          if w == 320: pg.screenshot(path=os.path.join(HERE, 'home_320.png'), clip={'x': 0, 'y': 0, 'width': 320, 'height': 1500}, full_page=True)
      pg.set_viewport_size({"width": 1280, "height": 800})
      pg.add_script_tag(content=AXE)
      v = pg.evaluate("axe.run(document.getElementById('goalPick')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
      check(v == [], f'axe-core（目標卡片）{v}')
      check(not errs, f'首頁沒有錯誤 {errs[:2]}')
      # 用鍵盤也選得到
      pg.focus('#goal-pushup'); pg.keyboard.press('ArrowDown'); pg.wait_for_timeout(200)
      check(json.loads(st()).get('pushup') == 5, f'鍵盤選下一項 {st()}')
      ctx.close()
    # ---------- 鏡頭畫面 ----------
    def run(workout, mode, goals, worker='', secs=29):
        FAKE['name'] = workout
        ctx, pg, errs = page()
        pg.add_init_script(speech(mode, goals))
        pg.goto(base + "index.html?workout=" + workout + worker); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(secs * 1000)
        said = pg.evaluate("window.__speech"); tones = pg.evaluate("window.__tones"); labels = pg.evaluate("window.__labels")
        pg.click("#stopBtn"); pg.wait_for_timeout(600)
        lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
        ctx.close()
        return said, tones, labels, lines, errs
    GOALCALLS = ['10 秒', '5', '4', '3', '2', '1', '時間到', '20 秒']
    for mode, goals, worker in [('full', {'plank': 18}, ''), ('full', {'plank': 18}, '&worker=0'), ('errors', {'plank': 18}, ''), ('off', {'plank': 18}, ''), ('full', None, '')]:
        tag = f'棒式 {mode}{"（主畫面）" if worker else ""}{"" if goals else "、沒設目標"}'
        said, tones, labels, lines, errs = run('plank', mode, goals, worker)
        texts = [t for _, t in said]
        calls = [x for x in said if re.fullmatch(r'\d+ 秒|[1-5]|時間到', x[1])]
        print('   ', texts); print('   ', labels, lines)
        if goals is None:
            check(not calls and labels and all(l == '棒式' for l in labels), f'{tag}：不報時、次數框寫「棒式」 {texts} {labels}')
        elif mode == 'full':
            seq = [t for _, t in calls]
            gaps = [calls[i + 1][0] - calls[i][0] for i in range(1, 6)] if len(calls) >= 7 else []
            check(seq == GOALCALLS, f'{tag}：10 秒、倒數 5～1、時間到、20 秒 {seq}')
            check(gaps and all(800 <= g <= 1250 for g in gaps), f'{tag}：倒數每秒一個 {gaps}')
            check(labels and labels[0] == '目標 0:18' and '目標 0:18✓' in labels, f'{tag}：次數框「目標 0:18」，時間到變綠 {labels}')
            check('目標 18 秒：達成' in lines, f'{tag}：總結 {lines}')
        elif mode == 'errors':
            seq = [t for _, t in calls]
            check(seq == ['5', '4', '3', '2', '1', '時間到'], f'{tag}：只講倒數、時間到（不報 10 秒、20 秒） {seq}')
        else:
            beeps = [f for _, f in tones if f in (880, 1320)]
            check(not calls and beeps == [880] * 5 + [1320], f'{tag}：不講話，倒數短嗶 5 聲、時間到長嗶 {texts} {beeps}')
        check(not errs, f'{tag}：沒有錯誤 {errs[:2]}')
    for mode in ['full', 'errors']:
        tag = f'深蹲 {mode}'
        said, tones, labels, lines, errs = run('squat', mode, {'squat': 3}, '', 22)
        texts = [t for _, t in said]
        print('   ', texts); print('   ', labels, lines)
        if mode == 'full':
            reps = [t for t in texts if re.match(r'\d 下', t)]
            check(reps == ['1 下', '2 下', '3 下，完成目標', '4 下'], f'{tag}：第 3 下「3 下，完成目標」、第 4 下照常 {reps}')
            check(labels and labels[0] == '目標 3' and '目標 3✓' in labels, f'{tag}：次數框「目標 3」，做到變綠 {labels}')
            check('目標 3 下：達成' in lines, f'{tag}：總結 {lines}')
        else:
            check([t for t in texts if '下' in t] == ['3 下，完成目標'], f'{tag}：只講錯誤時也講完成目標，其他下不講 {texts}')
        check(not errs, f'{tag}：沒有錯誤 {errs[:2]}')
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
