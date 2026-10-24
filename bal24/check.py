# 10/24 提案：平衡與重心（瀏覽器端到端）
#  鏡頭畫面（假的 AI：站直 6 秒 → 上身往前倒 15° 2 秒 → 站直 2 秒 → 正面 2 秒）：
#   - 數據面板寫出重心比腳踝前多少（和 node 算的一樣）、站直 3 秒後的前後晃動；往前倒時變大；正面拍時「重心：—」
#   - 畫面上有重心的記號（黃色），位置和 node 算的一樣；正面拍時沒有；棒式不算（沒有記號、沒有這一行）
#   - 深蹲、自由模式；背景執行緒和主畫面兩種
#  重播分析（合成示範資料）：深蹲每一下最低時的重心、摘要的站直時重心和前後晃動、讀數、骨架回放的記號（鏡像時跟著左右對調）；
#   伏地挺身不算
# 用法：python3 check.py <網站資料夾>；先跑 node make_fake.mjs <網站資料夾>
import sys, os, re, json
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
EXP = json.load(open(os.path.join(HERE, 'expected.json')))
base = serve(8841, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=f"{HERE}/fake_bal.mjs", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=f"{HERE}/fake_bal.js", content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
# 黃色（#FFC83D）的像素：在哪裡、有幾個
GOLD = """(id) => { const c = document.getElementById(id); if (!c.width || !c.height) return { n: 0 };
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] > 235 && d[i + 1] > 190 && d[i + 1] < 210 && d[i + 2] < 100 && d[i + 3] > 200) { n++; const p = i / 4; sx += p % c.width; sy += Math.floor(p / c.width); } }
  return n ? { n, x: sx / n / c.width, y: sy / n / c.height } : { n: 0 }; }"""
SAMPLE = """window.__samples = []; setInterval(() => {
  const info = document.getElementById('viewInfo'); const line = (info.textContent.split('\\n').find(l => l.startsWith('重心')) || '');
  window.__samples.push({ line, gold: (%s)('overlay') }); }, 150);""" % GOLD
OFF = re.compile(r'比腳踝前 ([\d.]+)%')
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for workout, worker in [('squat', ''), ('squat', '&worker=0'), ('free', ''), ('plank', '')]:
        tag = workout + ('（主畫面）' if worker else '')
        ctx = b.new_context(viewport={"width": 1280, "height": 800})
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.add_init_script(cam_script(640, 480))
        pg.goto(base + "index.html?workout=" + workout + worker); pg.wait_for_function(READY, timeout=60000)
        pg.click("#startBtn"); pg.wait_for_timeout(800); pg.click("#dataBtn")
        pg.evaluate(SAMPLE)
        if workout == 'squat' and not worker:
            pg.wait_for_timeout(4000); pg.screenshot(path=os.path.join(HERE, 'cam_stand.png'))
            pg.wait_for_timeout(3300); pg.screenshot(path=os.path.join(HERE, 'cam_lean.png')); pg.wait_for_timeout(6200)
        else:
            pg.wait_for_timeout(13500)
        s = pg.evaluate("window.__samples")
        lines = [x['line'] for x in s]
        uniq = []
        for l in lines:
            if not uniq or uniq[-1] != l: uniq.append(l)
        print('   ', len(s), 'samples', [u[:60] for u in uniq][:12])
        if workout == 'plank':
            check(all(l == '' for l in lines) and all(x['gold']['n'] == 0 for x in s), f'{tag}：沒有重心那一行、沒有記號')
        else:
            offs = [float(OFF.search(l).group(1)) for l in lines if OFF.search(l)]
            stand = [x for x in s if OFF.search(x['line']) and abs(float(OFF.search(x['line']).group(1)) - EXP['stand']['offset']) <= 0.5]
            tilt = [x for x in s if OFF.search(x['line']) and abs(float(OFF.search(x['line']).group(1)) - EXP['tilted']['offset']) <= 0.5]
            check(len(stand) >= 10 and all('重心在腳掌上方' in x['line'] for x in stand), f'{tag}：站直時重心比腳踝前 {EXP["stand"]["offset"]}%（node 算的）{len(stand)} 次')
            check(any(re.search(r'前後晃動 0\.\d%（最近 3 秒）', x['line']) for x in stand) and any('前後晃動 —（站直不動 3 秒）' in x['line'] for x in stand), f'{tag}：剛開始「站直不動 3 秒」、之後前後晃動 0.x%')
            check(len(tilt) >= 5, f'{tag}：往前倒 15° 時比腳踝前 {EXP["tilted"]["offset"]}%：{len(tilt)} 次，數字 {sorted(set(offs))[:12]}')
            near = [x for x in stand if x['gold']['n'] > 30 and abs(x['gold']['x'] - EXP['stand']['x']) < 0.02]
            check(len(near) >= len(stand) * 0.8, f'{tag}：畫面上的記號在 node 算的位置附近 {len(near)}／{len(stand)}：{[x["gold"] for x in stand[:2]]}')
            tnear = [x for x in tilt if x['gold']['n'] > 30 and x['gold']['x'] > EXP['stand']['x'] + 0.005]
            check(len(tnear) >= len(tilt) * 0.6, f'{tag}：往前倒時記號往前移 {len(tnear)}／{len(tilt)}')
            last = s[-int(len(s) / 8):]
            gone = [x for x in s if x['line'].startswith('重心：—')]
            check(len(gone) >= 3 and all(x['gold']['n'] == 0 for x in gone), f'{tag}：正面拍、沒有人時「重心：—」、沒有記號 {len(gone)} 次')
        check(not errs, f'{tag}：沒有錯誤 {errs[:2]}')
        ctx.close()
    # ---------- 重播分析 ----------
    for q in ['?lab=squat&demo', '?demo', '?workout=pushup&demo', '?workout=squat']:
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(base + "replay.html" + q)
        if 'demo' not in q: pg.set_input_files('#fileInput', os.path.join(HERE, 'stand.json'))
        pg.wait_for_function("document.getElementById('loadStatus').textContent.includes('已讀取')", timeout=60000); pg.wait_for_timeout(500)
        summ = pg.evaluate("[...document.querySelectorAll('#summary div')].map(d => d.textContent)")
        head = pg.evaluate("[...document.querySelectorAll('#squatTable thead th')].map(c => c.textContent)")
        rows = pg.evaluate("[...document.querySelectorAll('#squatTable tbody tr')].map(tr => [...tr.children].map(c => c.textContent))")
        if q == '?lab=squat&demo':
            col = head.index('重心（最低時）') if '重心（最低時）' in head else -1
            check(col == 5 and head[-1] == '錯誤', f'重播深蹲：表格多一欄「重心（最低時）」在錯誤前面 {head}')
            vals = [r[col] for r in rows] if col >= 0 else []
            check(len(vals) >= 3 and all(re.match(r'^腳踝(前|後) \d+\.\d%$', v) for v in vals), f'重播深蹲：每一下最低時的重心 {vals}')
            check(any(re.match(r'重心（站直時）比腳踝(前|後) [\d.]+%$', x) for x in summ) and any(x.startswith('前後晃動（站直時）') for x in summ), f'重播深蹲：摘要 {[x for x in summ if "重心" in x or "晃動" in x]}')
            pg.locator('#squatTable tbody tr').nth(1).click(); pg.wait_for_timeout(400)
            ro = pg.inner_text('#readout').split('\n')
            check(len(ro) == 3 and ro[2].startswith('重心在'), f'重播深蹲：讀數第三行 {ro[2:] }')
            g1 = pg.evaluate(GOLD, 'skeleton')
            pg.click('#mirrorBtn'); pg.wait_for_timeout(400)
            g2 = pg.evaluate(GOLD, 'skeleton')
            check(g1['n'] > 20 and g2['n'] > 20 and abs(g1['x'] + g2['x'] - 1) < 0.03, f'重播深蹲：骨架回放有重心的記號，鏡像時左右對調 {g1} {g2}')
        elif q == '?demo':
            ro = pg.inner_text('#readout').split('\n')
            check(any(x.startswith('重心（站直時）') for x in summ) and len(ro) == 3 and ro[2].startswith('重心'), f'重播沒選動作：摘要、讀數有重心 {ro[2:]}')
        elif q == '?workout=squat':
            sw = [x for x in summ if x.startswith('前後晃動（站直時）')]
            check(len(sw) == 1 and re.match(r'前後晃動（站直時）\d+\.\d%$', sw[0]), f'重播站直 5 秒的檔案：摘要有前後晃動的數字 {sw}')
            pg.screenshot(path=os.path.join(HERE, 'replay_stand.png'), full_page=True)
            g1 = pg.evaluate(GOLD, 'skeleton'); pg.click('#mirrorBtn'); pg.wait_for_timeout(400); g2 = pg.evaluate(GOLD, 'skeleton')
            check(g1['n'] > 20 and g2['n'] > 20 and abs(g1['x'] - 0.5) > 0.03 and abs(g1['x'] + g2['x'] - 1) < 0.03, f'重播站直：記號不在正中間，鏡像時左右對調 {g1} {g2}')
        else:
            ro = pg.inner_text('#readout').split('\n')
            check('重心（最低時）' not in head and len(ro) == 2 and not any('重心' in x for x in summ) and pg.evaluate(GOLD, 'skeleton')['n'] == 0,
                  f'重播伏地挺身：沒有重心 {head} {ro}')
        check(not errs, f'重播 {q}：沒有錯誤 {errs[:2]}')
        ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
