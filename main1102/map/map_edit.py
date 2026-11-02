# 11/2 進度地圖：工作表打勾、現況、AI 模型那幾格（用法：python3 map_edit.py 主線PR 保養PR 自動測試項數）
import sys
pr_main, pr_maint, unit = sys.argv[1], sys.argv[2], sys.argv[3]
p = sys.argv[4] if len(sys.argv) > 4 else 'live.html'
s = open(p, encoding='utf-8').read()
def rep(old, new):
    global s
    assert s.count(old) == 1, old[:80]
    s = s.replace(old, new)

rep('<span class="eyebrow">AI 智慧運動分析系統 · 2026-11-01</span>', '<span class="eyebrow">AI 智慧運動分析系統 · 2026-11-02</span>')
rep('計次、錯誤、相似度、校正、疲勞分析、建議（AI 教練）完成；AI 模型還沒做</span>',
    '計次、錯誤、相似度、校正、疲勞分析、建議（AI 教練）完成；AI 模型的資料完成（11/2），11/3 訓練</span>')
rep('''（重播只看得到錄下來的，要先按錄製再開始運動）。10/23 颱風假''',
    '''（重播只看得到錄下來的，要先按錄製再開始運動）。11/2 做了<strong>AI 模型的資料</strong>（研究目標 3 的 Random Forest 第一步）：實測報表可以下載「每一下一列」的資料表，網站量到的數字加上這組要做的（做對，或故意做哪一種錯）當答案，規則的判斷另外一欄、只拿來比；訓練和測試照受測者分，同一個人不會兩邊都有。10/20 的實測檔還沒重新傳來，先用合成的實測檔（示範動畫的火柴人、四位受測者）把流程做通。10/23 颱風假''')
rep('''<tr><td class="stage">11/2（一）</td><td>AI 模型的資料：從錄影抽出每一下的特徵＋檔名上的做對／做錯（還沒實測：先用合成資料把流程做通）<span class="maint"><b>保養</b>AI 模型的資料檢查：訓練和測試資料不能混到（同一個受測者不能同時在兩邊）</span></td><td>—</td><td><span class="chip todo">還沒做</span></td></tr>''',
    '''<tr><td class="stage">11/2（一）</td><td><strong>AI 模型的資料</strong>：實測報表多「AI 模型的資料」：同一批實測檔每一下一列（棒式每一次一列），下載 CSV。給模型看的數字：最低角度、秒數、相似度、晃動、卡住，加上每種錯誤量到的數字（上身前傾幾度、腳跟離地幾 %…，這一下持續 0.4 秒的最大值：比門檻大就是規則會報的錯）；答案是這組要做的（實測檔裡本來就記著）；規則的判斷另外一欄、不給模型看；實測規定的下數、秒數不放（會洩漏答案）；重錄的組不放。10/20 的實測檔還沒重新傳來，先用合成的實測檔（火柴人，每位受測者遠近、節奏、故意做錯的程度都不一樣）把流程做通：四位受測者 504 個「規則報錯 ⇔ 數字比門檻大」全部對得上。順便修好實測報表一個 10/30 起就有的無障礙問題（PR #''' + pr_main + '''）<span class="maint"><b>保養</b>AI 模型的資料檢查：訓練和測試照受測者分，同一個人只會在一邊（同一個人的每一下很像，兩邊都有等於先看過考題）；檢查同一個受測者、同一個檔案兩邊都有、一邊是空的、測試的標記訓練沒學過；實測報表只有 1 位受測者時提醒至少要 2 位（PR #''' + pr_maint + '''）</span></td><td>重新傳 10/20 的實測檔（明天訓練 AI 模型最需要；沒有的話先用合成的，報告時說清楚）；想看的話：實測報表選幾個實測檔，按「下載 AI 模型的資料」用 Excel 打開</td><td><span class="chip done">#''' + pr_main + '''、#''' + pr_maint + ''' 完成</span></td></tr>''')
rep('<li><span class="no">○</span> Random Forest：11/2 起用實測的錄影試做，和規則、DTW 比較</li>',
    '<li><span class="wip">◐</span> Random Forest：資料完成（11/2：每一下的數字＋答案，訓練和測試照受測者分；真人實測檔還沒來，先用合成的），11/3 訓練、和規則與 DTW 比較</li>')
rep('專案內 249 項自動測試，每次推送到 GitHub 自動跑', '專案內 ' + unit + ' 項自動測試，每次推送到 GitHub 自動跑')
rep('個人化建議：AI 教練（10/31，固定句子＋Gemini）；Random Forest 等真人資料</td>',
    '個人化建議：AI 教練（10/31，固定句子＋Gemini）；Random Forest 的資料完成（11/2），11/3 訓練</td>')
rep('<li class="doing"><div class="bar"><span style="width:60%"></span></div><span class="num">03</span><span class="title">AI 模型</span></li>',
    '<li class="doing"><div class="bar"><span style="width:65%"></span></div><span class="num">03</span><span class="title">AI 模型</span></li>')
rep('第三次報告 PR #61–#120 · 更新於 2026-11-01', '第三次報告 PR #61–#' + pr_maint + ' · 更新於 2026-11-02')
open(p, 'w', encoding='utf-8').write(s)
print('ok')
