# 10/20 主線：提示改成講話＋說話規則、計次準確率、複製手機資訊（假鏡頭＋假 AI）
#  1. 首頁「語音提示」三選一：預設完整、舊的「關掉語音」變成不講話、選了會記住
#  2. 完整：深蹲「站好了」、每一下「N 下」；一次一句（不重疊）；站位不嗶
#  3. 伏地挺身（會塌腰、屁股太高）：錯誤只在「連續兩下」時講、在一下做完時講
#  4. 只講錯誤：不講次數、不講站位（改嗶）；不講話：完全不講、照舊嗶
#  5. 錄製倒數：完整時唸「3、2、1、開始」不嗶；不講話時嗶；開始錄的時間不變
#  6. 找不到中文聲音：站位、倒數改用嗶聲
#  7. 關鏡頭：排隊的話不講了
#  8. 計次準確率：總結填實際次數 → 準確率、存進紀錄；亂填會說明；棒式沒有
#  9. 複製手機資訊：複製到剪貼簿；不允許複製時改成文字框
# 10. 使用說明的「複製檢查結果」照常
# 用法：python3 voice_check.py
import sys, os, re, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT = '/home/user/claude-workspace'
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOOP = S + '/audit2'
OUT = os.path.dirname(os.path.abspath(__file__))
base = serve(8876, ROOT)
ok = True
def check(cond, msg):
    global ok
    print(('PASS ' if cond else 'FAIL ') + msg); ok = ok and cond
def fake_cdn(kind):
    def h(route):
        rel = route.request.url[len(CDN):].split("?")[0]
        hdr = {"Access-Control-Allow-Origin": "*"}
        if rel == '/vision_bundle.mjs': route.fulfill(path=f"{LOOP}/loop_{kind}.mjs", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle.js': route.fulfill(path=f"{LOOP}/loop_{kind}.js", content_type="text/javascript", headers=hdr)
        elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
        else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
    return h
# 假的講話：照順序一句一句講（每句 0.2 秒＋每個字 0.15 秒），記下每一句開始、結束的時間
def speech_script(chinese=True):
    voices = "[{ lang: 'zh-TW', name: 'fake-zh' }]" if chinese else "[{ lang: 'en-US', name: 'fake-en' }]"
    return """(() => {
  const log = window.__speech = [];
  let speaking = false, timer = null, cur = null; const queue = [];
  const synth = {
    get speaking() { return speaking; }, get pending() { return queue.length > 0; },
    getVoices: () => %s, addEventListener() {},
    speak(u) { queue.push(u); if (!speaking) next(); },
    cancel() { const q = queue.splice(0); if (timer) clearTimeout(timer); timer = null; const c = cur; cur = null; speaking = false;
      if (c) { c.__end = performance.now(); if (c.onerror) c.onerror({}); } for (const u of q) if (u.onerror) u.onerror({}); }
  };
  function next() {
    const u = queue.shift(); if (!u) { speaking = false; return; }
    speaking = true; cur = u;
    const rec = { t: performance.now(), text: u.text, vol: u.volume, voice: u.voice && u.voice.name };
    log.push(rec); u.__rec = rec;
    const dur = u.text.trim() ? 200 + 150 * u.text.length : 10;
    timer = setTimeout(() => { timer = null; speaking = false; cur = null; rec.end = performance.now(); if (u.onend) u.onend({}); next(); }, dur);
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.volume = 1; this.lang = ''; this.voice = null; this.rate = 1; };
  window.__osc = 0;
  class FakeCtx { constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; } resume() {}
    createOscillator() { window.__osc++; return { type: '', frequency: { value: 0 }, connect(x) { return x; }, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(x) { return x; } }; } }
  window.AudioContext = FakeCtx; window.webkitAudioContext = FakeCtx;
})();""" % voices
WATCH = """() => { window.__toasts = []; let last = '';
  setInterval(() => { const el = document.getElementById('repToast'); const t = el.hidden ? '' : el.textContent;
    if (t && t !== last) window.__toasts.push({ t: performance.now(), text: t }); last = t; }, 50); }"""
said = lambda pg: [x for x in pg.evaluate("window.__speech") if x['text'].strip()]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    def context(kind, init=None, chinese=True, vw=1280, vh=800, perms=None):
        ctx = b.new_context(viewport={"width": vw, "height": vh}, accept_downloads=True)
        if perms: ctx.grant_permissions(perms, origin=base[:-1])
        ctx.errs = []
        ctx.route(CDN + "/**", fake_cdn(kind))
        ctx.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        ctx.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        ctx.add_init_script(cam_script(640, 480)); ctx.add_init_script(speech_script(chinese))
        if init: ctx.add_init_script(init)
        return ctx
    def page(ctx, path='index.html'):
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: ctx.errs.append(str(e)))
        pg.goto(base + path); pg.wait_for_function(READY, timeout=60000)
        return pg
    def no_overlap(items):
        for a, c in zip(items, items[1:]):
            if c['t'] < a.get('end', a['t']) - 1: return False
        return True

    # 1. 首頁的三選一
    ctx = context('squat_mix'); pg = page(ctx)
    modes = pg.evaluate("[...document.querySelectorAll('input[name=voiceMode]')].map(i => [i.value, i.checked, i.disabled])")
    check(modes == [['full', True, False], ['errors', False, False], ['off', False, False]], f'語音提示三選一，預設「完整」：{modes}')
    pg.click("text=只講錯誤"); pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.evaluate("document.querySelector('input[name=voiceMode]:checked').value") == 'errors', '選了「只講錯誤」重新整理後還記得')
    # 鍵盤：方向鍵換選項
    pg.focus("input[name=voiceMode][value=errors]"); pg.keyboard.press('ArrowRight')
    check(pg.evaluate("document.querySelector('input[name=voiceMode]:checked').value") == 'off' and pg.evaluate("localStorage.getItem('voiceMode')") == 'off', '鍵盤方向鍵可以換成「不講話」，也會記住')
    pg.evaluate("localStorage.removeItem('voiceMode'); localStorage.setItem('voiceOn', '0')"); pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.evaluate("document.querySelector('input[name=voiceMode]:checked').value") == 'off', '以前關掉語音提醒的人：變成「不講話」')
    pg.evaluate("localStorage.setItem('voiceMode', 'constructor')"); pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.evaluate("document.querySelector('input[name=voiceMode]:checked').value") == 'off', '存的值被改壞（constructor）：不理它，照舊的設定')
    for w in (320, 390):
        pg.set_viewport_size({"width": w, "height": 800}); pg.wait_for_timeout(200)
        r = pg.evaluate("""(() => { const els = [...document.querySelectorAll('.voice-modes span')].map(s => s.getBoundingClientRect());
            return { right: Math.max(...els.map(e => e.right)), rows: new Set(els.map(e => Math.round(e.top))).size, h: Math.min(...els.map(e => e.height)), sw: document.documentElement.scrollWidth }; })()""")
        check(r['right'] <= w - 8 and r['rows'] == 1 and r['h'] >= 44 and r['sw'] <= w, f'{w} 寬：三個選項排在一行、按鈕高 44 以上、沒有左右捲動 {r}')
        pg.locator('.quick-settings').screenshot(path=f'{OUT}/pick_{w}.png')
    ctx.close()

    # 2. 完整：深蹲
    ctx = context('squat_mix'); pg = page(ctx)
    pg.evaluate(WATCH)
    pg.click('#workoutGrid button[data-workout="squat"]'); pg.wait_for_selector('#stage:not([hidden])')
    osc0 = pg.evaluate("window.__osc")
    pg.wait_for_timeout(22000)
    sp = said(pg); toasts = pg.evaluate("window.__toasts")
    texts = [x['text'] for x in sp]
    counts = [x for x in sp if re.match(r'^\d+ 下', x['text'])]
    check(texts[:1] == ['站好了'], f'完整：一開始講「站好了」：{texts[:3]}')
    check(len(counts) >= 5 and [int(x['text'].split(' ')[0]) for x in counts] == list(range(1, len(counts) + 1)), f'每一下講次數（{len(counts)} 下）：{[x["text"] for x in counts][:8]}')
    # 每一句次數都在那一下做完時講（和畫面上每一下的提示同時，差 0.5 秒內）
    near = all(any(abs(x['t'] - tt['t']) < 500 for tt in toasts) for x in counts)
    check(near, f'次數在一下做完時講（和提示同時）：{[round(x["t"]) for x in counts[:4]]} vs {[round(t["t"]) for t in toasts[:4]]}')
    check(no_overlap(sp), '一次一句：上一句講完才講下一句')
    check(any(x['text'].endswith('很好') for x in counts if x['text'].startswith('5 下')) or not any(x['text'].startswith('5 下') for x in counts), '第 5 下做得好時加「很好」：' + str([x['text'] for x in counts if x['text'].startswith('5 下')]))
    check(pg.evaluate("window.__osc") == osc0, f'完整語音時站位不嗶（嗶了 {pg.evaluate("window.__osc") - osc0} 個音）')
    check(all(x['voice'] == 'fake-zh' and x['vol'] > 0 for x in sp), '用中文的聲音、音量不是 0')
    # 7. 關鏡頭：排隊的不講
    pg.click('#stopBtn'); n_after = len(said(pg)); pg.wait_for_timeout(2500)
    check(len(said(pg)) == n_after, f'關鏡頭後不會再講（{n_after} → {len(said(pg))}）')
    # 8. 計次準確率
    lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    m = re.match(r'深蹲 (\d+) 下', lines[0]); n = int(m.group(1)) if m else -1
    check(pg.is_visible('#actualForm'), '總結下面出現「實際做了幾下？」')
    pg.fill('#actualInput', 'abc'); pg.click('#actualForm button')
    check('請填 0～999 的整數' in pg.inner_text('#actualNote'), '亂填：說明要填整數：' + pg.inner_text('#actualNote'))
    pg.fill('#actualInput', str(n + 1)); pg.press('#actualInput', 'Enter')
    acc = round((1 - 1 / (n + 1)) * 100)
    note = pg.inner_text('#actualNote'); lines = pg.evaluate("[...document.querySelectorAll('#summaryLines li')].map(li => li.textContent)")
    check(f'計次準確率 {acc}%' in note and any(l == f'你數的 {n + 1} 下，網站算 {n} 下：計次準確率 {acc}%' for l in lines), f'填 {n + 1}：{note}；總結 {[l for l in lines if "你數的" in l]}')
    hist = pg.evaluate("JSON.parse(localStorage.getItem('workoutHistory'))")
    check(hist[-1].get('actual') == n + 1, '存進這一次的紀錄（只在這台裝置）')
    pg.locator('#summary').screenshot(path=f'{OUT}/summary_actual.png')
    pg.reload(); pg.wait_for_function(READY, timeout=60000)
    check(pg.evaluate("JSON.parse(localStorage.getItem('workoutHistory'))[0].actual") == n + 1, '重新整理後紀錄還在')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    # 3. 伏地挺身：錯誤連續兩下才講
    ctx = context('pushup_err'); pg = page(ctx)
    pg.evaluate(WATCH)
    pg.click('#workoutGrid button[data-workout="pushup"]'); pg.wait_for_selector('#stage:not([hidden])')
    pg.wait_for_timeout(30000)
    sp = said(pg); toasts = pg.evaluate("window.__toasts")
    errs_said = [x for x in sp if '，' in x['text'] and ('收緊腹部' in x['text'] or '屁股放低' in x['text'])]
    seq = []   # 每一下的錯誤（從提示來）
    for tt in toasts:
        mm = re.match(r'^第 (\d+) 下', tt['text'])
        if mm: seq.append((int(mm.group(1)), set(e for e in ('塌腰', '屁股太高') if e in tt['text']), tt['t']))
    word = {'收緊腹部': '塌腰', '屁股放低': '屁股太高'}
    good = True; detail = []
    for x in errs_said:
        k = int(x['text'].split(' ')[0]); e = word['收緊腹部' if '收緊腹部' in x['text'] else '屁股放低']
        cur = [s for s in seq if s[0] == k]; prev = [s for s in seq if s[0] == k - 1]
        okk = cur and prev and e in cur[0][1] and e in prev[0][1] and abs(cur[0][2] - x['t']) < 500
        detail.append((k, e, bool(okk))); good = good and bool(okk)
    check(errs_said and good, f'錯誤只在連續兩下時、那一下做完時講：{detail[:6]}；每一下 {[(s[0], sorted(s[1])) for s in seq[:8]]}')
    # 只出現一下的錯誤不講
    singles = [s for i, s in enumerate(seq) for e in s[1] if not any(t[0] == s[0] - 1 and e in t[1] for t in seq)]
    spoken_k = {int(x['text'].split(' ')[0]) for x in errs_said}
    check(all(s[0] not in spoken_k or any(e in s[1] and any(t[0] == s[0] - 1 and e in t[1] for t in seq) for e in s[1]) for s in singles), '偶爾一下的錯誤不講')
    check(no_overlap(sp), '一次一句')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    # 4. 只講錯誤、不講話
    for mode in ('errors', 'off'):
        ctx = context('pushup_err', f"try {{ localStorage.setItem('voiceMode', '{mode}'); }} catch (e) {{}}"); pg = page(ctx)
        pg.click('#workoutGrid button[data-workout="pushup"]'); pg.wait_for_selector('#stage:not([hidden])')
        pg.wait_for_timeout(20000)
        texts = [x['text'] for x in said(pg)]; osc = pg.evaluate("window.__osc")
        if mode == 'errors':
            check(texts and all(t in ('收緊腹部', '屁股放低') for t in texts), f'只講錯誤：只講錯誤的短句、不講次數和站位：{texts[:6]}')
        else:
            check(texts == [], f'不講話：完全不講：{texts[:3]}')
        check(osc >= 1, f'{mode}：站位改用嗶聲（{osc} 個音）')
        check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
        ctx.close()

    # 5. 錄製倒數
    for mode, chinese in (('full', True), ('off', True), ('full', False)):
        ctx = context('squat_mix', f"try {{ localStorage.setItem('voiceMode', '{mode}'); localStorage.setItem('recordCountdown', '3'); }} catch (e) {{}}", chinese=chinese)
        ctx.add_init_script("try { localStorage.setItem('recordCountdown', '3'); } catch (e) {}")
        pg = page(ctx)
        pg.click('#workoutGrid button[data-workout="free"]') if pg.locator('#workoutGrid button[data-workout="free"]').count() else pg.click('#startBtn')
        pg.wait_for_selector('#stage:not([hidden])'); pg.wait_for_timeout(2500)
        pg.click('#dataBtn'); pg.wait_for_timeout(300)
        n0 = len(said(pg)); osc0 = pg.evaluate("window.__osc"); t0 = pg.evaluate("performance.now()")
        pg.click('#recordBtn')
        pg.wait_for_function("document.getElementById('recordBtn').textContent.includes('停止錄製')", timeout=8000)
        t1 = pg.evaluate("performance.now()"); pg.wait_for_timeout(1500)
        new = [x for x in said(pg)[n0:]]
        osc = pg.evaluate("window.__osc") - osc0
        label = f'倒數（{mode}{"" if chinese else "，沒有中文聲音"}）'
        check(2.8 <= (t1 - t0) / 1000 <= 3.8, f'{label}：約 3 秒後開始錄（{(t1 - t0) / 1000:.2f} 秒）')
        if mode == 'full' and chinese:
            check([x['text'] for x in new] == ['3', '2', '1', '開始'] and osc == 0, f'{label}：唸 3、2、1、開始，不嗶：{[x["text"] for x in new]} 嗶 {osc}')
            gaps = [round((c['t'] - a['t']) / 1000, 2) for a, c in zip(new, new[1:])]
            check(all(0.8 <= g <= 1.2 for g in gaps), f'{label}：每秒一個數字 {gaps}')
        else:
            check([x['text'] for x in new] == [] and osc == 4, f'{label}：不唸、嗶 4 聲（3 短 1 長）：{[x["text"] for x in new]} 嗶 {osc}')
        pg.click('#recordBtn')
        check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
        ctx.close()

    # 6. 找不到中文聲音：站位改用嗶聲，次數照講
    ctx = context('squat_mix', chinese=False); pg = page(ctx)
    pg.click('#workoutGrid button[data-workout="squat"]'); pg.wait_for_selector('#stage:not([hidden])')
    pg.wait_for_timeout(12000)
    texts = [x['text'] for x in said(pg)]
    check('站好了' not in texts and pg.evaluate("window.__osc") >= 1 and any(re.match(r'^\d+ 下', t) for t in texts), f'沒有中文聲音：站位嗶、次數照講：{texts[:4]} 嗶 {pg.evaluate("window.__osc")}')
    ctx.close()

    # 音量關：不講也不嗶
    ctx = context('squat_mix', "try { localStorage.setItem('soundLevel', 'off'); } catch (e) {}"); pg = page(ctx)
    pg.click('#workoutGrid button[data-workout="squat"]'); pg.wait_for_selector('#stage:not([hidden])')
    pg.wait_for_timeout(10000)
    check(said(pg) == [] and pg.evaluate("window.__osc") == 0, f'音量關：不講也不嗶 {said(pg)[:2]}')
    ctx.close()

    # 8b. 棒式沒有「實際做了幾下」
    ctx = context('plank'); pg = page(ctx)
    pg.click('#workoutGrid button[data-workout="plank"]'); pg.wait_for_selector('#stage:not([hidden])')
    pg.wait_for_timeout(9000); pg.click('#stopBtn'); pg.wait_for_timeout(800)
    check(pg.is_visible('#summary') and pg.is_hidden('#actualForm'), '棒式的總結沒有「實際做了幾下」')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    # 9. 複製手機資訊
    ctx = context('squat_mix', perms=['clipboard-read', 'clipboard-write']); pg = page(ctx)
    pg.click('#workoutGrid button[data-workout="squat"]'); pg.wait_for_selector('#stage:not([hidden])'); pg.wait_for_timeout(12000)
    pg.click('#dataBtn'); pg.wait_for_timeout(300); pg.click('#phoneInfoBtn'); pg.wait_for_timeout(500)
    clip = pg.evaluate("navigator.clipboard.readText()")
    check(clip.startswith('【手機資訊】') and 'AI 模型 lite' in clip and re.search(r'AI 每格 \d+ 毫秒', clip) and '鏡頭：640×480' in clip and '識別字串：' in clip,
          '複製手機資訊：' + clip.replace('\n', ' | ')[:240])
    check('已複製' in pg.inner_text('#phoneInfoStatus'), '說明已複製：' + pg.inner_text('#phoneInfoStatus'))
    pg.locator('#dataPanel').screenshot(path=f'{OUT}/panel.png')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()
    ctx = context('squat_mix', "navigator.clipboard.writeText = () => Promise.reject(new Error('不准'));"); pg = page(ctx)
    pg.click('#workoutGrid button[data-workout="squat"]'); pg.wait_for_selector('#stage:not([hidden])'); pg.wait_for_timeout(3000)
    pg.click('#dataBtn'); pg.wait_for_timeout(300); pg.click('#phoneInfoBtn'); pg.wait_for_timeout(300); pg.click('#phoneInfoBtn'); pg.wait_for_timeout(300)
    areas = pg.evaluate("[...document.querySelectorAll('#dataPanel .copy-fallback')].map(a => a.value)")
    check(len(areas) == 1 and areas[0].startswith('【手機資訊】') and '長按' in pg.inner_text('#phoneInfoStatus'), f'不允許複製：改成一個選好的文字框（按兩次也只有一個）{len(areas)}')
    check(not ctx.errs, '沒有程式錯誤 ' + str(ctx.errs[:2]))
    ctx.close()

    # 10. 使用說明「複製檢查結果」
    ctx = b.new_context(viewport={"width": 390, "height": 844}); ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base[:-1])
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(base + 'help.html'); pg.wait_for_timeout(800)
    pg.click('#checkBtn'); pg.click('#copyBtn'); pg.wait_for_timeout(400)
    clip = pg.evaluate("navigator.clipboard.readText()")
    check(clip.startswith('【手機檢查結果】') and '識別字串' in clip and '已複製' in pg.inner_text('#copyStatus') and not errs, '使用說明的複製檢查結果照常：' + clip.split('\n')[0])
    ctx.close()
    b.close()
print('ALL PASS' if ok else 'SOME FAIL')
