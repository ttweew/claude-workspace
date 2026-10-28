# 10/28 保養：疲勞分析、每一下的圖表的極端情況（瀏覽器）
#  假資料直接畫（首頁的總結框）：只做 1 下、做 100 下（320／390／1280 寬：長條不互相疊到、在圖裡、橫軸編號不擠、整頁不超出）、
#    一下中途停住 40 秒（縱軸不被拉到 40 秒、那一條寫「中途停住」、疲勞分析寫不算進秒數）、中途休息（寫休息幾秒、只比哪幾下）
#  假的 AI（9 下、站著休息 35 秒、再 9 下，每段後 3 下變淺）：運動中第 8 下、第 17 下各提醒一次；總結寫中途休息、只比後面那一段
#  axe-core；舊程式（加 old）：320 寬時 100 下的長條互相疊到、停住 40 秒時縱軸到 40 秒
# 用法：python3 check.py <網站資料夾> <port> [old]（先跑 make_fake.mjs）
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
OLD = 'old' in sys.argv
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(PORT, ROOT)
AXE = open(os.path.join(HERE, '..', 'a11y', 'node_modules', 'axe-core', 'axe.min.js')).read()
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
# 在首頁的總結框畫假資料；kind：one（1 下）、hundred（100 下，後 50 下又淺又慢）、paused（第 9 下停 40 秒）、rest（6 下、休息 40 秒、8 下）
DRAW = """async (kind) => {
  const { repSeries } = await import('./js/analysis/rep-series.js');
  const { renderRepChart } = await import('./js/ui/rep-chart.js');
  let fv = null, fa = null;
  try { fv = await import('./js/ui/fatigue-view.js'); fa = await import('./js/analysis/fatigue.js'); } catch (e) {}
  const plan = { one: [[85, 2]], hundred: [...Array(50).fill([85, 2]), ...Array(50).fill([105, 3.2])],
    paused: [...Array(8).fill([85, 2]), [85, 40]], rest: [...Array(6).fill([85, 2]), [85, 2, 39], ...Array(7).fill([85, 2])] }[kind];
  let t = 0;
  const items = plan.map(([min, sec, wait = 0]) => { t += wait; const r = { min, start: t, end: t + sec, errors: [], similarity: 90 }; t += sec + 1; return r; });
  document.getElementById('summary').hidden = false;
  const series = repSeries('squat', items);
  renderRepChart(document.getElementById('repChart'), series);
  const fb = document.getElementById('fatigueBox');
  if (fv && fb) fv.renderFatigue(fb, fa.fatigueOf(series));
  const figs = [...document.querySelectorAll('#repChart figure')].map(f => {
    const svg = f.querySelector('svg'), sr = svg.getBoundingClientRect();
    const bars = [...f.querySelectorAll('.rep-mark')].map(m => { const b = m.getBBox(); return [b.x, b.x + b.width]; });
    const ticks = [...svg.querySelectorAll('.rep-tick')].filter(t => t.getAttribute('text-anchor') === 'middle').map(t => [t.textContent, t.getBBox().x, t.getBBox().x + t.getBBox().width]);
    return { title: f.querySelector('.rep-title').textContent, svgW: Math.round(sr.width), right: Math.round(sr.right), bars,
      axis: [...svg.querySelectorAll('.rep-tick')].filter(t => t.getAttribute('text-anchor') === 'end').map(t => t.textContent),
      titles: [...f.querySelectorAll('.rep-bar title')].map(t => t.textContent), ticks };
  });
  return { figs, scrollW: document.documentElement.scrollWidth,
    fatigue: fb ? { line: (fb.querySelector('.fatigue-line') || {}).textContent || '', notes: [...fb.querySelectorAll('.fatigue-note')].map(p => p.textContent),
      range: (fb.querySelector('.fatigue-range') || {}).textContent || '' } : null };
}"""
def overlaps(bars):
    return [i for i in range(len(bars) - 1) if bars[i][1] > bars[i + 1][0] + 0.01]
def tick_gaps(ticks):
    return [round(b[1] - a[2], 1) for a, b in zip(ticks, ticks[1:])]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def page(w, h=900):
        pg = b.new_page(viewport={"width": w, "height": h}); mock_network(pg); pg.errs = []
        pg.on("pageerror", lambda e: pg.errs.append(str(e)))
        pg.goto(base + "index.html"); pg.wait_for_timeout(800)
        return pg
    # ---------- 做 100 下 ----------
    for w in (320, 390, 1280):
        pg = page(w)
        r = pg.evaluate(DRAW, 'hundred')
        d, s = r['figs']
        ov = overlaps(d['bars']) + overlaps(s['bars'])
        if OLD:
            # 舊程式長條最窄 2 像素：每下不到 2 像素寬（320 寬）時才會疊到，390、1280 寬每下 2.3、3.2 像素不會
            check((len(ov) > 0) == (w == 320), f'舊程式 {w} 寬：100 下的長條互相疊到 {len(ov)} 處（寬 {d["bars"][0][1] - d["bars"][0][0]:.1f}）')
            pg.close(); continue
        inside = all(0 <= x0 and x1 <= f['svgW'] for f in r['figs'] for x0, x1 in f['bars'])
        check(not ov and inside and len(d['bars']) == 100, f'{w} 寬：100 條長條不互相疊到、都在圖裡（每條 {d["bars"][0][1] - d["bars"][0][0]:.2f} 像素）')
        gaps = tick_gaps(d['ticks'])
        check(min(gaps) >= 4 and [t[0] for t in d['ticks']][0] == '1' and d['ticks'][-1][0] == '100', f'{w} 寬：橫軸編號不擠在一起 {[t[0] for t in d["ticks"]]} 間隔 {gaps}')
        check(max(f['right'] for f in r['figs']) <= w and r['scrollW'] <= w, f'{w} 寬：圖不超出、整頁不左右捲動 {[f["right"] for f in r["figs"]]} {r["scrollW"]}')
        check(r['fatigue']['line'].startswith('疲勞分析：後段（第 68～100 下）比前段（第 1～33 下）變慢 60%、變淺 20°'), '疲勞分析：' + r['fatigue']['line'])
        if w == 320: pg.locator('#summary').screenshot(path=os.path.join(HERE, 'hundred_320.png'))
        check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
        pg.close()
    # ---------- 一下中途停住 40 秒 ----------
    pg = page(390)
    r = pg.evaluate(DRAW, 'paused')
    s = r['figs'][1]
    if OLD:
        check(s['axis'][-1] == '40 秒', f'舊程式：縱軸被拉到 40 秒 {s["axis"]}')
        b.close(); print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5]); sys.exit()
    check(s['axis'] == ['0', '3 秒'] and s['titles'][-1] == '第 9 下：40 秒（中途停住，超出圖的範圍）', f'停住 40 秒：縱軸照其他的（到 3 秒），那一條寫中途停住 {s["axis"]} {s["titles"][-1]}')
    leg = pg.evaluate("[...document.querySelectorAll('#repChart figure')][1].querySelector('.rep-key').textContent")
    check(leg == '平均 2 秒（不算停住的）', f'停住 40 秒：平均線不算停住的那一下（和總結的「每下約幾秒」一樣）{leg}')
    check(r['fatigue']['notes'] == ['第 9 下中途停住（40 秒），不算進每下幾秒'] and '差不多' in r['fatigue']['line'], f'疲勞分析：停住的那一下不算進秒數、不會說變慢 {r["fatigue"]}')
    pg.locator('#summary').screenshot(path=os.path.join(HERE, 'paused_390.png'))
    # ---------- 只做 1 下 ----------
    r = pg.evaluate(DRAW, 'one')
    d = r['figs'][0]
    check(len(d['bars']) == 1 and [t[0] for t in d['ticks']] == ['1'] and r['fatigue']['line'] == '疲勞分析：做 6 下以上才比前段和後段（這次 1 下）' and not r['fatigue']['notes'],
          f'只做 1 下：一條、橫軸只有 1、寫要做 6 下以上 {r["fatigue"]["line"]}')
    # ---------- 中途休息 40 秒 ----------
    r = pg.evaluate(DRAW, 'rest')
    check(r['fatigue']['notes'] == ['中途休息了 40 秒：休息前後分開算，只比連續做的第 7～14 下'] and r['fatigue']['range'] == '前段（第 7～8 下）→ 後段（第 13～14 下）',
          f'中途休息：寫休息幾秒、只比第 7～14 下 {r["fatigue"]}')
    pg.add_script_tag(content=AXE)
    v = pg.evaluate("axe.run(document.getElementById('summary')).then(r => r.violations.map(x => x.id + ':' + x.nodes.length))")
    check(v == [], f'axe-core（總結、疲勞分析的補充）{v}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    pg.close()
    # ---------- 假的 AI：9 下、休息 35 秒、再 9 下 ----------
    def fake_cdn(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=HERE + '/fake_rest.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=HERE + '/fake_rest.js', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page(); pg.errs = []
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.route(CDN + "/**", fake_cdn)
    pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
    pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
    pg.add_init_script(cam_script(640, 480))
    pg.add_init_script("""(() => { const log = window.__speech = [];
      const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
        speak(u) { log.push(u.text); setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
      window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
      try { localStorage.setItem('voiceMode', 'full'); } catch (e) {} })();""")
    pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
    pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
    pg.wait_for_function("document.getElementById('hudReps').textContent === '18'", timeout=200000)
    pg.wait_for_timeout(1500)
    pg.click('#stopBtn'); pg.wait_for_timeout(800)
    said = pg.evaluate("window.__speech")
    fb = pg.evaluate("(() => { const fb = document.getElementById('fatigueBox'); return { line: fb.querySelector('.fatigue-line').textContent, notes: [...fb.querySelectorAll('.fatigue-note')].map(p => p.textContent) }; })()")
    print('     講的：', said); print('    ', fb)
    check([t for t in said if '越來越淺' in t] == ['8 下，越來越淺了', '17 下，越來越淺了'], f'運動中：第 8 下、休息後的第 17 下各提醒一次 {[t for t in said if "淺" in t]}')
    m = re.fullmatch(r'中途休息了 (\d+) 秒：休息前後分開算，只比連續做的第 10～18 下', fb['notes'][0]) if fb['notes'] else None
    check(m and 30 <= int(m.group(1)) <= 40 and fb['line'].startswith('疲勞分析：後段（第 16～18 下）比前段（第 10～12 下）變淺 '), f'總結：中途休息、只比後面那一段（一樣長取後面的）{fb}')
    check(not pg.errs, f'沒有錯誤 {pg.errs[:2]}')
    ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
