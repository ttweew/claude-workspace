import json, re, sys
R = sys.argv[1] + '/project'; S = R + '/slides/'
def rd(n): return open(S + n + '.html', encoding='utf8').read()
def wr(n, t): open(S + n + '.html', 'w', encoding='utf8').write(t)
def rep(t, a, b, c=1):
    assert t.count(a) == c, (a, t.count(a)); return t.replace(a, b)

# 封面：PR #60、54 次更新、10/10
t = rd('cover')
t = rep(t, '第二批次進度報告（10/6 更新）', '第二批次進度報告（10/10 更新）')
t = rep(t, '>PR #7–#59<', '>PR #7–#60<'); t = rep(t, '>53 次更新<', '>54 次更新<'); t = rep(t, '>2026.10.06<', '>2026.10.10<')
t = re.sub(r'<aside>.*?</aside>', '<aside>開場。右邊的動畫是概念示意：骨架即時偵測深蹲，膝蓋角度跟著變化；角度和骨架是已經完成的功能，深蹲次數目前是實驗功能，一般網址看不到。這次報告的範圍是第二批次，PR 第 7 到第 60 號，共 54 次更新。今天的簡報分成兩部分：前面約十六頁是報告，先回覆老師上次的六個問題，再說明真人實測，以及在手機和各種裝置上的改進，最後是限制和下一步；後面是詳細資料，包括設計邏輯、每一次更新和程式碼，老師可以之後慢慢看。</aside>', t, flags=re.S)
wr('cover', t)

# 成果數字：「老師 6 題」移到開頭，這格改成真人實測
t = rd('numbers')
t = rep(t, 'line-height:1;color:#062019">4/6</p><p style="font-size:32px;font-weight:700;color:#0B3A2C;line-height:1.4">老師的 6 個問題已完成 4 題</p>',
        'line-height:1;color:#062019">6</p><p style="font-size:32px;font-weight:700;color:#0B3A2C;line-height:1.4">個真人實測發現的問題，全部修好</p>')
t = re.sub(r'<aside>.*?</aside>', '<aside>先用四個數字看這一批的成果。真人實測找到六個問題，全部修好了，接下來幾頁會詳細說明。骨架點跟著動作的延遲降低一半。鏡頭很近時，畫錯位置的點少了百分之八十六。十三種裝置尺寸的版面測試全部通過。</aside>', t, flags=re.S)
wr('numbers', t)

# 限制：真人實測修好 6 個問題
t = rd('limits')
t = rep(t, '7 段真人錄影已檢查、修好 5 個問題', '7 段真人錄影已檢查、修好 6 個問題')
t = rep(t, '找到並修好五個問題', '找到並修好六個問題')
wr('limits', t)

# 結尾：提醒後面是詳細資料
t = rd('end')
t = rep(t, '<p style="font-size:44px;color:#BFD0E0;text-align:center">謝謝聆聽，歡迎現場試用</p>',
        '<p style="font-size:44px;color:#BFD0E0;text-align:center">謝謝聆聽，歡迎現場試用</p><p style="font-size:24px;color:#8299B2;text-align:center">第 17～54 頁是詳細資料，老師可以之後慢慢看</p>')
t = rep(t, '最後可以請老師用手機打開網址現場試用。</aside>', '最後可以請老師用手機打開網址現場試用。後面第十七頁開始是詳細資料。</aside>')
wr('end', t)

# 更新歷程：加上 PR #60
t = rd('growth')
t = rep(t, '>8,829<', '>8,912<'); t = rep(t, '>53<', '>54<'); t = rep(t, '次更新（PR #7～#59）', '次更新（PR #7～#60）')
t = rep(t, '現在是 8,829 行', '現在是 8,912 行')
wr('growth', t)
t = rd('timeline')
t = rep(t, '>53 次更新分成六個階段<', '>54 次更新分成六個階段<'); t = rep(t, '>#35–59<', '>#35–60<')
t = rep(t, '53 次更新可以分成六個階段', '54 次更新可以分成六個階段')
t = rep(t, '找出並修好五個問題', '找出並修好六個問題')
wr('timeline', t)
t = rd('workflow')
t = rep(t, '這次報告的 PR #7～#59，就是 53 張這樣的申請單', '這次報告的 PR #7～#60，就是 54 張這樣的申請單')
wr('workflow', t)

# 保養⑦：加 #60；四種裝置的腿長比較已移到第 7 頁
t = rd('phase12')
t = rep(t, '<td>11.8 秒 → 0.6 秒；鬼骨架一樣擋得住</td></tr></table>',
        '<td>11.8 秒 → 0.6 秒；鬼骨架一樣擋得住</td></tr><tr><td><span style="color:#2EE6A6">#60</span></td><td>錄製剩 30 秒、錄滿時大字提醒</td><td>iPad 錄滿 5 分鐘自動停止，當時沒有明顯提醒，後面的動作可能沒錄到</td><td>畫面中央大字＋嗶一聲；錄製中顯示還剩多久</td></tr></table>')
t = re.sub(r'<table style="font-size:24px;color:#BFD0E0;font-family:\'Noto Sans TC\', Arial, sans-serif"><tr><th style="width:20%;color:#4CC3FF">同一個人</th>.*?</table>', '', t, flags=re.S)
t = rep(t, '換裝置、換鏡頭，腿長只差約 2 公分：代表穩定；準不準，還要用捲尺量的長度對照', '同一個人在 4 種裝置算出的腿長比較，見第 7 頁')
t = re.sub(r'<aside>.*?</aside>', '<aside>這是十月六號的保養。同一個人又用 Windows 筆電、iPhone 和 iPad 錄影，iPad 還分別用廣角和一般鏡頭各錄一段，iPhone 和 iPad 也確認可以正常使用。從錄影裡又找到三個問題並修好：蹲低時腳被擋住，網站卻叫人往後退，現在改成提示可能被擋住；側面站得比較遠時，因為肩寬幾乎是零，人看起來變小，被當成鬼骨架藏起來，現在要軀幹也在縮小才算鬼骨架；iPad 那段錄滿五分鐘自動停止時沒有明顯提醒，現在剩三十秒和錄滿時都會顯示大字並嗶一聲。四種裝置算出的腿長比較，在第七頁。</aside>', t, flags=re.S)
wr('phase12', t)

# 角度程式碼：大腿平行時的膝蓋角度和第 3 頁一致
t = rd('code-angle')
t = rep(t, '深蹲蹲到大腿與地面平行時，膝蓋約 90°', '大腿與地面平行時，小腿會往前傾，膝蓋約 60～70°')
wr('code-angle', t)

# 技術突破：可讀性移到手機段落，後面的編號往前
t = rd('stable'); t = rep(t, 'BREAKTHROUGH 04 · 穩定性', 'BREAKTHROUGH 03 · 穩定性'); wr('stable', t)

# 新順序
order = ['cover', 'questions', 'qa-pending', 'agenda', 'numbers',
         'real-what', 'real-data', 'real-fixes', 'real-change', 'real-open',
         'mobile-found', 'readable', 'mobile-speed', 'limits', 'roadmap', 'end',
         'appendix', 'layers', 'pipeline', 'principles', 'stack', 'workflow', 'deploy', 'testenv',
         'growth', 'timeline'] + ['phase%d' % i for i in range(1, 13)] + \
        ['filemap', 'frame', 'code-angle', 'code-smooth', 'code-visible', 'code-ghost', 'code-framing',
         'code-load', 'code-data', 'params', 'urlparams', 'live', 'ghost', 'angle', 'stable', 'tests']
assert len(order) == len(set(order)) == 54, len(order)
d = json.load(open(R + '/deck.json', encoding='utf8'))
assert set(order) == set(d['order']) | {'qa-pending', 'real-what', 'real-data', 'real-fixes', 'real-change', 'real-open', 'mobile-found', 'mobile-speed', 'appendix'}
d['order'] = order
d['sections'] = {
    's1': {'description': '開場：老師上次的 6 個問題與目錄', 'start': 'cover'},
    's2': {'description': '成果與真人實測：4 種裝置、7 段錄影', 'start': 'numbers'},
    's3': {'description': '手機與各種裝置：發現的問題與修正', 'start': 'mobile-found'},
    's4': {'description': '限制與下一步', 'start': 'limits'},
    's5': {'description': '詳細資料：系統與設計邏輯', 'start': 'appendix'},
    's6': {'description': '詳細資料：開發環境與工作方式', 'start': 'stack'},
    's7': {'description': '詳細資料：更新歷程（54 次更新）', 'start': 'growth'},
    's8': {'description': '詳細資料：程式碼介紹', 'start': 'filemap'},
    's9': {'description': '詳細資料：技術突破與測試', 'start': 'live'},
}
open(R + '/deck.json', 'w', encoding='utf8').write(json.dumps(d, ensure_ascii=False, indent=1))

# 頁碼；詳細資料的頁尾加上「詳細資料」
FOOT = '<p style="font-family:\'JetBrains Mono\', \'Courier New\', monospace;font-size:24px;color:#5F7690">AI 智慧運動分析系統 · 第二批次</p>'
for i, n in enumerate(order, 1):
    t = rd(n)
    t, k = re.subn(r'>\d\d / 45<', '>%02d / 54<' % i, t)
    assert k == (0 if n == 'cover' else 1), (n, k)
    if i > order.index('appendix') + 1:
        t = rep(t, FOOT, FOOT.replace('第二批次<', '第二批次 · 詳細資料<'))
    wr(n, t)
print('ok', len(order))
