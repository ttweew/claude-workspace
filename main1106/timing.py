# 簡報第 1～32 頁（報告的部分）每一頁講稿的字數 → 秒數（每分鐘 240 字，取到 5 秒）；精簡版留哪幾頁
import json, re, sys, os
S = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad'
N = S + '/slides1106/project/'
NAMES = {'cover': '封面', 'agenda': '目錄', 'fbq': '老師的 9 個問題（總覽）', 'fb1': 'Q1 左右兩組分邊', 'fb2': 'Q2 導覽列的字放大', 'fb3': 'Q3 聲音提示',
         'fb4': 'Q4 錄製時間可以選', 'fb5': 'Q5 音量四段', 'fb6': 'Q6 蹲到位：膝蓋 90°', 'fb7': 'Q7 動作示範動畫', 'fb8': 'Q8 改用公分', 'fb9': 'Q9 每秒格數',
         'adq': '網站自己看手機能力調整', 'adhow': '自動調整怎麼決定', 'jq': '從「量」到「判斷」（總覽）', 'j1': '運動模式＋計次', 'j2': '錯誤判斷',
         'j3': '運動總結', 'j4': '驗證工具', 'j5': '動作相似度（DTW）', 'j6': '個人校正', 'audit': '地基審查：怎麼測', 'audit2': '地基審查：15 個問題',
         'fbcheck': '要請組員用真手機確認的事', 'thr': '要靠真人調整的門檻', 'week1': '第 1 週小結（第一次真人實測）', 'week2': '第 2 週小結（進階分析）',
         'week3': '第 3 週小結（AI 評分模型）', 'aiscreen': '重播分析的 AI 判斷（畫面）', 'limits': '目前的限制', 'roadmap': '下一步', 'end': '結尾'}
SHORT = {'cover', 'agenda', 'fbq', 'adq', 'jq', 'j2', 'j5', 'week1', 'week2', 'week3', 'aiscreen', 'limits', 'roadmap', 'end'}
order = json.load(open(N + 'deck.json'))['order']
out, full, short = [], 0, 0
for i, sid in enumerate(order[:32], 1):
    a = re.search(r'<aside>(.*?)</aside>', open(N + 'slides/' + sid + '.html', encoding='utf-8').read(), re.S).group(1)
    chars = len(re.sub(r'\s', '', a))
    sec = chars / 4
    full += sec
    if sid in SHORT: short += sec
    out.append([i, NAMES[sid], int(5 * round(sec / 5)), sid in SHORT])
assert len(NAMES) == 32 and order[31] == 'end'
print(json.dumps({'slides': out, 'full_min': round(full / 60), 'short_min': round(short / 60)}, ensure_ascii=False))
