import json, re, sys
R = sys.argv[1] + '/project'; S = R + '/slides/'
def rd(n): return open(S + n + '.html', encoding='utf8').read()
def wr(n, t): open(S + n + '.html', 'w', encoding='utf8').write(t)
def rep(t, a, b, c=1):
    assert t.count(a) == c, (a, t.count(a)); return t.replace(a, b)
def aside(t, s):
    t2, k = re.subn(r'<aside>.*?</aside>', '<aside>' + s + '</aside>', t, flags=re.S); assert k == 1; return t2

# 總覽：完成的排上面，每題指到自己的那一頁
t = rd('questions')
CARD = '<div style="display:flex;flex-direction:column;gap:10px;background:#0E1928;'
head, rest = t.split(CARD, 1)
parts = (CARD + rest).split(CARD)[1:]
assert len(parts) == 6
cards = [CARD + p for p in parts]
last, tail = cards[5].split('</div></div>\n', 1)
cards[5] = last + '</div>'
tail = '</div>\n' + tail
assert all(c.endswith('</div>') for c in cards)
byq = {}
for c in cards:
    q = re.search(r'>(Q\d)</p>', c).group(1); byq[q] = c
pages = {'Q1': '04', 'Q2': '05', 'Q5': '06', 'Q3': '07', 'Q6': '08', 'Q4': '09'}
for q, pg in pages.items():
    byq[q], k = re.subn(r'→ [^<]*</p></div>$', '→ 詳見 P.%s</p></div>' % pg, byq[q]); assert k == 1, q
t = head + ''.join(byq[q] for q in pages) + tail
t = aside(t, '先回覆老師上次提的六個問題。這一頁是總覽：上面一排 Q1、Q2、Q5 已經完成；下面一排 Q3 完成前半、Q6 的驗證工具都做好了，Q4 暫緩。接下來一題一頁，先講完成的三題，做了什麼、改變了什麼，再講還在進行的三題，以及還沒完成的原因和下一步。')
wr('questions', t)

# 目錄：新的頁碼
t = rd('agenda')
t = rep(t, '<p style="font-size:24px;color:#BFD0E0">逐題回覆，還沒完成的原因與下一步</p></div><p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#8299B2">P.02–03</p>',
        '<p style="font-size:24px;color:#BFD0E0">一題一頁：先講完成的 3 題，再講進行中的 3 題</p></div><p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#8299B2">P.03–09</p>')
for a, b in [('P.05–10', 'P.10–15'), ('P.11–13', 'P.16–18'), ('P.14–16', 'P.19–21'),
             ('P.18–20', 'P.23–25'), ('P.21–24', 'P.26–29'), ('P.25–38', 'P.30–43'), ('P.39–49', 'P.44–54'), ('P.50–54', 'P.55–59')]:
    t = rep(t, '>' + a + '<', '>' + b + '<')
t = aside(t, '開始之前，先說明今天的簡報分成兩部分。第一部分是報告，共二十一頁：先一題一頁回覆老師上次的六個問題，接著是第二批次的成果和真人實測，再來是手機和各種裝置上的改進，最後是限制和下一步。第二部分是詳細資料，包括系統設計、開發環境、五十四次更新各改了什麼、程式碼和技術細節，報告時不會逐頁講，老師可以之後慢慢看。')
wr('agenda', t)

t = rd('appendix')
for a, b in [('P.18–20', 'P.23–25'), ('P.21–24', 'P.26–29'), ('P.25–38', 'P.30–43'), ('P.39–49', 'P.44–54'), ('P.50–54', 'P.55–59')]:
    t = rep(t, '>' + a + '<', '>' + b + '<')
wr('appendix', t)

t = rd('cover')
t = rep(t, '今天的簡報分成兩部分：前面約十六頁是報告，先回覆老師上次的六個問題，再說明真人實測',
        '今天的簡報分成兩部分：前面二十一頁是報告，先說明今天的內容，再一題一頁回覆老師上次的六個問題，接著說明真人實測')
wr('cover', t)

t = rd('end')
t = rep(t, '第 17～54 頁是詳細資料', '第 22～59 頁是詳細資料')
t = rep(t, '後面第十七頁開始是詳細資料', '後面第二十二頁開始是詳細資料')
wr('end', t)

t = rd('phase12')
t = rep(t, '同一個人在 4 種裝置算出的腿長比較，見第 7 頁', '同一個人在 4 種裝置算出的腿長比較，見第 12 頁')
t = rep(t, '四種裝置算出的腿長比較，在第七頁', '四種裝置算出的腿長比較，在第十二頁')
wr('phase12', t)

order = ['cover', 'agenda', 'questions', 'q1', 'q2', 'q5', 'q3', 'q6', 'q4', 'numbers',
         'real-what', 'real-data', 'real-fixes', 'real-change', 'real-open',
         'mobile-found', 'readable', 'mobile-speed', 'limits', 'roadmap', 'end',
         'appendix', 'layers', 'pipeline', 'principles', 'stack', 'workflow', 'deploy', 'testenv',
         'growth', 'timeline'] + ['phase%d' % i for i in range(1, 13)] + \
        ['filemap', 'frame', 'code-angle', 'code-smooth', 'code-visible', 'code-ghost', 'code-framing',
         'code-load', 'code-data', 'params', 'urlparams', 'live', 'ghost', 'angle', 'stable', 'tests']
assert len(order) == len(set(order)) == 59, len(order)
d = json.load(open(R + '/deck.json', encoding='utf8'))
assert set(order) == (set(d['order']) - {'qa-pending'}) | {'q1', 'q2', 'q3', 'q4', 'q5', 'q6'}
d['order'] = order
d['sections'] = {
    's1': {'description': '開場與目錄：先報告，再附詳細資料', 'start': 'cover'},
    's2': {'description': '老師上次的 6 個問題：一題一頁，先講完成的', 'start': 'questions'},
    's3': {'description': '成果與真人實測：4 種裝置、7 段錄影', 'start': 'numbers'},
    's4': {'description': '手機與各種裝置：發現的問題與修正', 'start': 'mobile-found'},
    's5': {'description': '限制與下一步', 'start': 'limits'},
    's6': {'description': '詳細資料：系統與設計邏輯', 'start': 'appendix'},
    's7': {'description': '詳細資料：開發環境與工作方式', 'start': 'stack'},
    's8': {'description': '詳細資料：更新歷程（54 次更新）', 'start': 'growth'},
    's9': {'description': '詳細資料：程式碼介紹', 'start': 'filemap'},
    's10': {'description': '詳細資料：技術突破與測試', 'start': 'live'},
}
open(R + '/deck.json', 'w', encoding='utf8').write(json.dumps(d, ensure_ascii=False, indent=2))

FOOT = '<p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#5F7690">AI 智慧運動分析系統 · 第二批次</p>'
cut = order.index('appendix')
for i, n in enumerate(order, 1):
    t = rd(n)
    t, k = re.subn(r'>\d\d / \d\d<', '>%02d / 59<' % i, t)
    assert k == (0 if n == 'cover' else 1), (n, k)
    if i > cut + 1:
        assert '第二批次 · 詳細資料<' in t, n
    else:
        assert '第二批次 · 詳細資料<' not in t or n == 'agenda', n
    wr(n, t)
print('ok', len(order))
