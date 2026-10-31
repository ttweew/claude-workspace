# 10/31 保養：AI 教練的失敗情況，用「真的」Firebase AI 程式（fb/node_modules/firebase 的 firebase-app.js、firebase-ai.js，和 gstatic 上的一樣），
# 只把 Gemini 的伺服器（firebasevertexai.googleapis.com）換成假的，看網站寫什麼（取代 main31/real_sdk.py 的三種情況）：
#   ok：列點、粗體、表情符號的回答 → 整理好、補句號，用 Gemini 的話
#   disabled（10/31 真的拿到的 403）→ 還沒開通；busy429（RESOURCE_EXHAUSTED）→ 太忙；model404 → 模型要更新
#   safety（回答被安全規則擋下）、promptblock（問題被擋下）、english、number（編出來的數字）→ 怪怪的；promptblock2（擋下但沒附原因，SDK 自己出錯）→ 暫時連不上
#   abort（連線斷掉）→ 暫時連不上；hang（Google 一直不回）→ 超過 10 秒；offline（按結束前斷網）→ 沒有網路，什麼都不送
# 用法：python3 real_sdk.py <網站資料夾> <port> [情況...]（假的 MediaPipe 用 ../main30 的 fake_sway）
import sys, os, json, time
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
ROOT, PORT = sys.argv[1], int(sys.argv[2])
HERE = os.path.dirname(os.path.abspath(__file__))
FB = os.path.join(HERE, '..', 'fb', 'node_modules', 'firebase')
FAKE = os.path.join(HERE, '..', 'main30', 'fake_sway')
DISABLED = open(os.path.join(HERE, '..', 'main31', 'disabled_403.json')).read()
base = serve(PORT, ROOT)
fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)
def fake_cdn(route):
    rel = route.request.url[len(CDN):].split("?")[0]
    hdr = {"Access-Control-Allow-Origin": "*"}
    if rel == '/vision_bundle.mjs': route.fulfill(path=FAKE + '.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.mjs': route.fulfill(path=PKG + '/vision_bundle.mjs', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle.js': route.fulfill(path=FAKE + '.js', content_type="text/javascript", headers=hdr)
    elif rel == '/vision_bundle_real.js': route.fulfill(path=PKG + '/vision_bundle.js', content_type="text/javascript", headers=hdr)
    else: route.fulfill(path=PKG + rel, content_type="application/wasm" if rel.endswith(".wasm") else "text/javascript", headers=hdr)
INIT = """(() => {
  const said = window.__said = [];
  const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'zh-TW', name: 'fake-zh' }], addEventListener() {},
    speak(u) { said.push(u.text); setTimeout(() => { if (u.onend) u.onend({}); }, 200); }, cancel() {} };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; };
  try { localStorage.setItem('aiCoach', '1'); } catch (e) {}
})();"""
def answer(text=None, finish='STOP', **extra):
    cand = {'finishReason': finish}
    if text is not None: cand['content'] = {'role': 'model', 'parts': [{'text': text}]}
    return json.dumps({'candidates': [cand], **extra})
def error(code, status, message):
    return json.dumps({'error': {'code': code, 'message': message, 'status': status}})
# 情況 → (Google 怎麼回：(HTTP 狀態, 內容) 或 'abort'、'hang'、None（不會送出去）, 總結要寫的原因（None：用 Gemini 的話）)
CASES = {
    'ok': ((200, answer('- **6 下都蹲到位**，很穩 💪\n- 下次放慢一點')), None),
    'disabled': ((403, DISABLED), '還沒開通'),
    'busy429': ((429, error(429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).')), '太忙'),
    'model404': ((404, error(404, 'NOT_FOUND', 'models/gemini-3.5-flash-lite is not found for API version v1beta')), '模型要更新'),
    'safety': ((200, answer(None, 'SAFETY')), '怪怪的'),
    'promptblock': ((200, json.dumps({'promptFeedback': {'blockReason': 'SAFETY', 'safetyRatings': [{'category': 'HARM_CATEGORY_HARASSMENT', 'probability': 'HIGH'}]}})), '怪怪的'),
    # 沒有 safetyRatings 的時候，firebase-ai.js 12.19.0 自己出錯（mapPromptFeedback 讀 undefined.forEach，TypeError）→ 當成連不上，還是改用固定句子
    'promptblock2': ((200, json.dumps({'promptFeedback': {'blockReason': 'OTHER'}})), '暫時連不上'),
    'english': ((200, answer('Great job! Keep your back straight and go slower next time.')), '怪怪的'),
    'number': ((200, answer('你做了 12 下，比上次多。下次再加油。')), '怪怪的'),
    'abort': ('abort', '暫時連不上'),
    'hang': ('hang', '超過 10 秒'),
    'offline': (None, '沒有網路'),
}
which = sys.argv[3:] or list(CASES)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for case in which:
        how, why = CASES[case]
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page(); errs = []; sent = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: print('     console', m.type, m.text[:200]) if 'AI 教練' in m.text else None)
        pg.route(CDN + "/**", fake_cdn)
        pg.route(MODEL, lambda r: r.fulfill(path=MP + "/pose_landmarker_lite.task", headers={"Access-Control-Allow-Origin": "*"}))
        pg.route("**/__test/pose.jpg", lambda r: r.fulfill(path=MP + "/pose.jpg", content_type="image/jpeg"))
        pg.route("https://www.gstatic.com/firebasejs/12.19.0/*", lambda r: r.fulfill(path=os.path.join(FB, r.request.url.split('/')[-1].split('?')[0]), content_type="text/javascript", headers={"Access-Control-Allow-Origin": "*"}))
        # 處理函式只能有一個參數（兩個的話 Playwright 會把 request 塞進第二個）
        def gemini(route):
            req = route.request
            sent.append({'url': req.url, 'body': req.post_data})
            if how == 'abort': route.abort('failed')
            elif how == 'hang': pass   # 不回答：請求一直掛著
            else: route.fulfill(status=how[0], headers={"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"}, body=how[1])
        pg.route("https://firebasevertexai.googleapis.com/**", gemini)
        pg.add_init_script(cam_script(640, 480)); pg.add_init_script(INIT)
        pg.goto(base + "index.html?workout=squat"); pg.wait_for_function(READY, timeout=60000)
        pg.click('#startBtn'); pg.wait_for_function("!document.getElementById('stage').hidden", timeout=10000)
        pg.wait_for_function("document.getElementById('hudReps').textContent === '6'", timeout=120000)
        pg.wait_for_timeout(1500)
        if case == 'offline': ctx.set_offline(True)
        t0 = time.time(); pg.click('#stopBtn')
        pg.wait_for_function("!document.getElementById('coachAdvice').hidden && !document.getElementById('coachStatus').textContent.includes('想一下')", timeout=20000)
        sec = time.time() - t0
        r = pg.evaluate("""() => ({ source: document.getElementById('coachSource').textContent, status: document.getElementById('coachStatus').textContent,
            lines: [...document.querySelectorAll('#coachLines li')].map(li => li.textContent), said: window.__said.filter(t => t.startsWith('教練建議')) })""")
        print('    ', case, f'{sec:.1f} 秒', json.dumps(r, ensure_ascii=False)[:300])
        check(len(sent) == (0 if how is None else 1), f'{case}：送出去 {len(sent)} 次')
        if why is None:
            check(r['source'] == '（AI 教練，Gemini）' and r['lines'] == ['6 下都蹲到位，很穩。', '下次放慢一點。'] and r['status'] == ''
                  and r['said'] == ['教練建議：6 下都蹲到位，很穩。下次放慢一點。'], f'{case}：整理好（列點、粗體、表情符號、補句號）{r["lines"]}')
        else:
            check(r['source'] == '（固定建議）' and why in r['status'] and r['lines'] and r['said'] == ['教練建議：' + ''.join(r['lines'])],
                  f'{case}：固定句子＋「{why}」：{r["status"]}')
        if case == 'hang': check(9.5 <= sec <= 13, f'hang：等了 {sec:.1f} 秒（10 秒逾時）')
        if case in ('offline', 'disabled', 'busy429', 'abort'): check(sec < 3, f'{case}：{sec:.1f} 秒就改用固定句子（不用等 10 秒）')
        check(not errs, f'{case}：沒有程式錯誤 {errs[:2]}')
        ctx.close()
    b.close()
print('通過 |' if not fails else 'SOME FAIL', len(fails), fails[:5])
