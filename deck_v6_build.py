import re, json, sys
R = sys.argv[1] + '/project'; S = R + '/slides/'
def rd(n): return open(S + n + '.html', encoding='utf8').read()
def wr(n, t): open(S + n + '.html', 'w', encoding='utf8').write(t)
def rep(t, a, b):
    assert t.count(a) >= 1, (a,); return t.replace(a, b)

p11 = rd('phase11')
head = p11[:p11.index('<table')]
head = head.replace('id="phase11"', 'id="phase12"').replace('10/5–10/6', '10/6').replace('保養⑥：第一次真實錄影', '保養⑦：換筆電、iPhone 錄影')
def row(pr, a, b, c):
    return f'<tr><td><span style="color:#2EE6A6">{pr}</span></td><td>{a}</td><td>{b}</td><td>{c}</td></tr>'
td = 'style="color:#BFD0E0"'
table = ('<table style="font-size:24px;color:#BFD0E0;font-family:\'Noto Sans TC\', Arial, sans-serif"><tr><th style="width:9%;color:#2EE6A6">PR</th><th style="width:31%;color:#2EE6A6">做了什麼</th><th style="width:30%;color:#2EE6A6">為什麼</th><th style="width:30%;color:#2EE6A6">效果</th></tr>'
  + row('#57', '蹲低時不再叫人「往後退」', '腳被身體擋住時，提示「看不到腳，請往後退」，最長 10 秒', '腳還在畫面裡時改說「可能被擋住了」')
  + row('#58', '側面站遠時骨架不再消失', '側面時肩寬幾乎是 0，人看起來變小，被當成鬼骨架藏了 10 秒', '11.8 秒 → 0.6 秒；鬼骨架一樣擋得住')
  + '</table>'
  + '<table style="font-size:24px;color:#BFD0E0;font-family:\'Noto Sans TC\', Arial, sans-serif"><tr><th style="width:22%;color:#4CC3FF">同一個人</th><th style="width:26%;color:#4CC3FF">Android 手機</th><th style="width:26%;color:#4CC3FF">Windows 筆電</th><th style="width:26%;color:#4CC3FF">iPhone</th></tr>'
  + '<tr><td>運算、速度</td><td>GPU、30 格／秒</td><td>GPU、30 格／秒</td><td>GPU、30 格／秒</td></tr>'
  + '<tr><td>AI 估計大腿長</td><td>36.7 公分</td><td>37.5 公分</td><td>38.4 公分</td></tr>'
  + '<tr><td>AI 估計小腿長</td><td>39.5 公分</td><td>37.6 公分</td><td>39.8 公分</td></tr>'
  + '</table>'
  + '<p style="font-size:24px;color:#8299B2;line-height:1.5">換裝置，腿長只差約 2 公分：代表穩定；準不準，還要用捲尺量的長度對照</p>')
foot = p11[p11.index('\n<div style="position:absolute'):p11.index('<aside>')]
aside = '<aside>這是十月六號的保養。同一個人又用 Windows 筆電和 iPhone 各錄了一段，加上之前的 Android 手機，三種裝置都用到 GPU、每秒 30 格，iPhone 也確認可以正常使用。從錄影裡又找到兩個問題並修好：蹲低時腳被擋住，網站卻叫人往後退，現在改成提示可能被擋住；側面站得比較遠時，因為肩寬幾乎是零，人看起來變小，被當成鬼骨架藏起來，現在要軀幹也在縮小才算鬼骨架。下面的表是同一個人在三種裝置上，AI 估計的腿長，差距大約兩公分，代表很穩定；但準不準，還要用捲尺量的長度來對照。</aside>\n</section>\n'
wr('phase12', head + table + foot + aside)

d = json.load(open(R + '/deck.json', encoding='utf8'))
o = d['order']; o.insert(o.index('phase11') + 1, 'phase12'); d['order'] = o
d['sections']['s4']['description'] = '更新歷程：52 次更新（含 10/2–10/6 細緻保養）'
open(R + '/deck.json', 'w', encoding='utf8').write(json.dumps(d, ensure_ascii=False, indent=1))
for idx, sid in enumerate(o, 1):
    wr(sid, re.sub(r'>\d\d / 44<', f'>{idx:02d} / 45<', rd(sid)))

t = rd('cover')
t = rep(t, 'PR 第 7 到第 56 號，共 50 次更新', 'PR 第 7 到第 58 號，共 52 次更新')
t = rep(t, 'PR #7–#56', 'PR #7–#58'); t = rep(t, '>50 次更新<', '>52 次更新<')
t = rep(t, '最後兩次是第一次真人錄影後的修正。', '最後四次是用真人錄影找到問題後的修正。')
wr('cover', t)
t = rd('agenda')
t = rep(t, '50 次更新，每一次', '52 次更新，每一次')
t = rep(t, 'P.10–22', 'P.10–23'); t = rep(t, 'P.23–33', 'P.24–34'); t = rep(t, 'P.34–44', 'P.35–45')
t = rep(t, '逐一說明 50 次更新的內容，後面二十二次是', '逐一說明 52 次更新的內容，後面二十四次是')
wr('agenda', t)
t = rd('workflow')
t = rep(t, '28 項自動測試全部重跑', '32 項自動測試全部重跑'); t = rep(t, 'PR #7～#56，就是 50 張', 'PR #7～#58，就是 52 張')
wr('workflow', t)
t = rd('growth')
t = rep(t, '>8,692<', '>8,800<'); t = rep(t, '>50<', '>52<'); t = rep(t, '次更新（PR #7～#56）', '次更新（PR #7～#58）'); t = rep(t, '>28<', '>32<')
t = rep(t, '現在是 8,692 行', '現在是 8,800 行'); t = rep(t, '自動跑 28 項測試', '自動跑 32 項測試')
wr('growth', t)
t = rd('timeline')
t = rep(t, '50 次更新分成六個階段', '52 次更新分成六個階段'); t = rep(t, '>#35–56<', '>#35–58<')
t = rep(t, '50 次更新可以分成六個階段', '52 次更新可以分成六個階段')
t = rep(t, '最後用第一次真人錄影找出並修好三個問題。', '最後用真人錄影（Android、筆電、iPhone）找出並修好五個問題。')
wr('timeline', t)
t = rd('questions')
t = rep(t, '自動優先使用 GPU，畫面顯示 GPU／CPU 與每秒偵測次數', '自動優先使用 GPU，畫面顯示 GPU／CPU 與每秒偵測次數；Android、iPhone、筆電實測都是 GPU、每秒 30 次')
t = rep(t, '第一次真人錄影已分析，等捲尺對照', '5 段真人錄影（3 種裝置）已分析，等捲尺對照')
t = rep(t, '十月五號已經用第一次真人錄影檢查過，並修好找到的問題；', '十月五號、六號已經用五段真人錄影、三種裝置檢查過，並修好找到的問題；')
wr('questions', t)
t = rd('tests')
t = rep(t, '專案內 28 項自動測試，每次推送自動跑；並用 3 段真人錄影檢查', '專案內 32 項自動測試，每次推送自動跑；並用 5 段真人錄影（Android、筆電、iPhone）檢查')
t = rep(t, '目前 28 項', '目前 32 項')
t = rep(t, '十月五號起也用朋友錄的三段真人錄影檢查', '十月五號起也用朋友在 Android 手機、筆電、iPhone 錄的五段真人錄影檢查')
wr('tests', t)
t = rd('limits')
t = rep(t, '第一次真人錄影已檢查、修好 3 個問題；準不準要用捲尺長度對照', '5 段真人錄影已檢查、修好 5 個問題；準不準要用捲尺長度對照')
t = rep(t, '十月五號第一次用真人錄影檢查，找到並修好三個問題，', '十月五號、六號用五段真人錄影檢查，找到並修好五個問題，')
wr('limits', t)
t = rd('roadmap')
t = rep(t, '第一次錄影已檢查並修正；下一步用捲尺長度對照', '真人錄影已檢查並修正；下一步用捲尺長度對照')
t = rep(t, '第一次真人錄影已經檢查過，找到的問題也修好了；', '五段真人錄影、三種裝置都檢查過，找到的問題也修好了；')
wr('roadmap', t)
t = rd('end')
t = rep(t, '第一次真人錄影已經檢查並修正', '真人錄影已經檢查並修正')
wr('end', t)
print('ok', len(o))
