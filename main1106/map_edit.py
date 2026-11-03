# 進度地圖（11/3 收尾，11/4～11/8 提前做完）：11/4～11/9 那幾列、一句話現況、判斷得出、AI 模型、整合測試、研究目標 3；
# 新增一段「11/9 報告準備」：每一頁講稿的時間（從簡報的講稿算）、精簡版、現場示範、備案、檢查清單、老師可能會問的問題
# 用法：python3 map_edit.py <線上版本存下來的 HTML> <輸出> <config.json>
import sys, json, re, os, html
SRC, OUT, CFG = sys.argv[1], sys.argv[2], sys.argv[3]
C = json.load(open(CFG, encoding='utf-8'))
t = open(SRC, encoding='utf-8').read()
# 拿掉服務包的外層：從 <title> 到最後的 </body></html> 前
t = t[t.index('<title>專題進度地圖</title>'):]
t = t[:t.rindex('</body>')].rstrip() + '\n'
def rep(a, b, n=1):
    global t
    assert t.count(a) == n, (a[:80], t.count(a))
    t = t.replace(a, b)

P1, P2 = C['pr_main'], C['pr_maint']
# ---------- 一句話現況 ----------
rep('合成的錯誤很乾淨，這些數字只證明流程，真人實測檔來了再用同一套程式重算。10/23 颱風假',
    '合成的錯誤很乾淨，這些數字只證明流程，真人實測檔來了再用同一套程式重算。<strong>11/3 下午把 11/4～11/8 的工作也提前做完</strong>：AI 模型放進網站（重播分析每一下多一欄「AI 判斷」，和規則並排；實測報表寫 AI 和規則各猜對幾下）、放進網站後的整合測試（斷網、發布時加版本號、背景執行緒開不起來都照常）、凍結檢查（最後的程式跑全部的測試）；簡報加第 28、29 頁（第 3 週小結、AI 判斷的畫面）；講稿的時間、現場示範、備案、報告當天的檢查清單在下面「11/9 報告準備」。10/23 颱風假')
rep('<div class="meter" aria-label="大部分完成，待真人驗證"><span style="width:80%"></span></div>\n        <span class="chip doing">計次、錯誤、相似度、校正、疲勞分析、建議（AI 教練）完成；AI 模型訓練好了（11/3，合成資料），11/4 放進網站</span>',
    '<div class="meter" aria-label="大部分完成，待真人驗證"><span style="width:85%"></span></div>\n        <span class="chip doing">計次、錯誤、相似度、校正、疲勞分析、建議（AI 教練）完成；AI 模型放進網站了（合成資料訓練的示範，真人實測檔來了重新訓練）</span>')

# ---------- 每天的工作表：11/4～11/9 ----------
rep('<tr><td class="stage">11/4（三）</td><td>模型放進網站：重播分析顯示「AI 判斷 vs 規則判斷」<span class="maint"><b>保養</b>模型放進網站後的整合測試</span></td><td>試用</td><td><span class="chip todo">還沒做</span></td></tr>',
    '<tr><td class="stage">11/4（三）</td><td><strong>AI 模型放進網站</strong>（11/3 提前做）：重播分析的「動作分析」每一下最後多一欄「AI 判斷（把握）」，和規則不一樣的標藍色，上面一句寫和規則一樣幾下；實測模式的檔案再寫 AI、規則各猜對幾下（訓練時看過的受測者寫「不能算數」）；實測報表多一行 AI 模型和規則各猜對幾列。模型檔約 79 KB（壓縮後約 8 KB），用 8 位合成受測者訓練，畫面上寫明是示範（PR #' + P1 + '）'
    '<span class="maint"><b>保養</b>放進網站後的整合測試：背景執行緒開不起來（改在主畫面算）、斷網（有網路時打開過一次，模型檔存在手機裡）、發布時每個檔案加版本號（照發布的指令在複本上跑）、首頁錄的檔案拿到重播分析、320 寬的手機，AI 判斷都照常、和 node 算的一樣' + C['maint_found'] + '（PR #' + P2 + '）</span></td>'
    '<td>試用：打開重播分析，按「側面拍深蹲」、「分析哪個動作」選深蹲，看表格最後一欄</td><td><span class="chip done">#' + P1 + '、#' + P2 + ' 完成</span></td></tr>')
rep('<tr><td class="stage">11/5（四）</td><td>功能凍結：完整回歸測試，只修問題</td><td>試用凍結版</td><td><span class="chip todo">還沒做</span></td></tr>',
    '<tr><td class="stage">11/5（四）</td><td><strong>功能凍結</strong>（11/3 提前做）：PR #' + P2 + ' 是報告前最後一次改程式，合併後的網站就是凍結版。在這個版本上跑了全部的測試：專案內 ' + str(C['unit']) + ' 項、瀏覽器 ' + str(C['browser']) + ' 項、雲端安全規則（本機模擬器）、真的 Firebase 專案、暫存區的雲端同步、實測報表、保養檢查、完整回歸測試（39 項情境）' + C['freeze_found'] + '。之後到 11/9 只修問題</td><td>試用凍結版（有問題直接在對話裡說）</td><td><span class="chip done">完成</span></td></tr>')
rep('<tr><td class="stage">11/6（五）</td><td>簡報定稿（數字、截圖、示範影片）</td><td>看簡報給意見</td><td><span class="chip todo">還沒做</span></td></tr>',
    '<tr><td class="stage">11/6（五）</td><td><strong>簡報定稿</strong>（11/3 提前做）：加第 28 頁「第 3 週小結」（AI 評分模型：98%／86%／52%、學到的門檻、資料 → 訓練 → 放進網站）、第 29 頁「重播分析的 AI 判斷」（網站的截圖）；封面（PR #61–#' + P2 + '、' + str(C['updates']) + ' 次更新）、目錄、限制（AI 模型還沒有真人的準確率）、下一步（第 4 步打勾）、結尾跟著改；後面的頁碼、互相參照都 +2（共 80 頁）。順便修好以前就寫錯的頁碼（結尾的「第 29～76 頁」、講稿裡的「第十三頁」）和測試那一頁的數字（105 項 → ' + str(C['unit']) + '＋' + str(C['browser']) + ' 項）。示範影片見下面「備案」</td><td>看簡報給意見（第 28、29 頁是新的）</td><td><span class="chip done">完成</span></td></tr>')
rep('<tr><td class="stage">11/7（六）</td><td>彩排 1 的修正（講稿、時間）</td><td>彩排</td><td><span class="chip todo">還沒做</span></td></tr>',
    '<tr><td class="stage">11/7（六）</td><td>講稿和時間（11/3 先做好）：每一頁講稿的字數換算成時間，完整版約 ' + str(C['full_min']) + ' 分鐘、精簡版約 ' + str(C['short_min']) + ' 分鐘（下面「11/9 報告準備」）。彩排後照你們量到的時間、講不順的地方改講稿</td><td><strong>彩排 1</strong>：照講稿講一遍、用碼表量，告訴我總共幾分鐘、報告限時幾分鐘、哪幾頁講不順</td><td><span class="chip doing">講稿時間已估，等彩排</span></td></tr>')
rep('<tr><td class="stage">11/8（日）</td><td>彩排 2 的修正＋備案（離線示範、錄好的示範影片）</td><td>彩排</td><td><span class="chip todo">還沒做</span></td></tr>',
    '<tr><td class="stage">11/8（日）</td><td>備案（11/3 先做好）：錄好的示範影片（合成的火柴人，約 ' + str(C['video_s']) + ' 秒）、離線示範的步驟、報告前一天和當天的檢查清單、老師可能會問的問題（都在下面「11/9 報告準備」）。彩排 2 後再修</td><td><strong>彩排 2</strong>；用要示範的手機錄一段真人示範（手機螢幕錄影：深蹲 5 下＋總結）</td><td><span class="chip doing">備案已做好，等彩排</span></td></tr>')
rep('<tr><td class="stage">11/9（一）</td><td><strong>第三次報告</strong>：不改程式，只確認網站、簡報、示範都正常</td><td>報告</td><td><span class="chip todo">還沒做</span></td></tr>',
    '<tr><td class="stage">11/9（一）</td><td><strong>第三次報告</strong>：不改程式，只確認網站、簡報、示範都正常（早上的排程會檢查一次網站）</td><td>報告：照下面的檢查清單</td><td><span class="chip todo">還沒做</span></td></tr>')

# ---------- 11/9 報告準備（新的一段，放在每天的工作表後面） ----------
N = C['slides']   # [[頁碼, 名稱, 秒數, 精簡版]]
rows = ''.join('<tr><td class="stage">%d</td><td>%s</td><td>%d 秒</td><td>%s</td></tr>' % (n, html.escape(name), s, '<span class="ok">✓</span>' if short else '<span class="no">跳過</span>') for n, name, s, short in N)
skip = '、'.join(str(n) for n, _, _, short in N if not short)
prep = ('\n  <!-- 11/9 報告準備（11/3 先做好；彩排後照實際時間改） -->\n'
 '  <section aria-labelledby="prepTitle">\n'
 '    <div class="sec-head">\n'
 '      <h2 id="prepTitle">11/9 報告準備：講稿的時間、現場示範、備案、檢查清單</h2>\n'
 '      <p>時間是用簡報每一頁的講稿字數估的（照講稿唸，每分鐘約 240 字）：<strong>完整版（第 1～32 頁）約 ' + str(C['full_min']) + ' 分鐘、精簡版（打勾的 ' + str(sum(1 for x in N if x[3])) + ' 頁）約 ' + str(C['short_min']) + ' 分鐘</strong>，現場示範另外約 3 分鐘。精簡版跳過的頁（' + skip + '）說一句「細節在第幾頁」就好。彩排時用碼表量，告訴我實際幾分鐘、報告限時多久，我照著改講稿。</p>\n'
 '    </div>\n'
 '    <div class="table-box">\n'
 '      <table>\n'
 '        <thead><tr><th>頁</th><th>內容</th><th>講稿約</th><th>精簡版</th></tr></thead>\n'
 '        <tbody>' + rows + '</tbody>\n'
 '      </table>\n'
 '    </div>\n'
 '    <div class="two" style="margin-top:12px">\n'
 '      <div class="panel">\n'
 '        <h3>現場示範（約 3 分鐘）</h3>\n'
 '        <ol>\n'
 '          <li>手機從主畫面的圖示打開網站，首頁「今天要做什麼運動？」按「深蹲」（按了就開鏡頭）</li>\n'
 '          <li>手機放在 2～3 公尺外、側面拍、全身入鏡；聽到「叮」再開始</li>\n'
 '          <li>做 5 下，其中 1 下故意上身前傾：看次數、紅字和語音提醒</li>\n'
 '          <li>按「結束」看運動總結：次數、每一下的圖、教練建議</li>\n'
 '          <li>電腦打開重播分析，按「側面拍深蹲」、選深蹲，往下看表格最後一欄「AI 判斷」（第 29 頁的畫面）</li>\n'
 '          <li>有時間再打開研究成果頁</li>\n'
 '        </ol>\n'
 '      </div>\n'
 '      <div class="panel">\n'
 '        <h3>備案：現場出問題時</h3>\n'
 '        <ul>\n'
 '          <li><strong>沒有網路</strong>：前一天用同一支手機把首頁、重播分析各打開兩次（第一次只是讓手機記住網站），開一次鏡頭做一組，網站和 AI 檔案就存在手機裡，當天斷網也能用（11/4 測過：斷網後重播分析的 AI 判斷照常）</li>\n'
 '          <li><strong>鏡頭打不開、AI 太慢</strong>：播錄好的示範影片。最好是組員用手機螢幕錄影錄的真人示範；另外有一段我錄的合成示範（火柴人，約 ' + str(C['video_s']) + ' 秒：首頁深蹲 6 下、總結、重播分析的 AI 判斷、研究成果頁），在這個對話裡</li>\n'
 '          <li><strong>投影的電腦沒有鏡頭</strong>：電腦的 Chrome 用「示範模式」選一段側面拍的運動影片代替鏡頭，或直接開重播分析的示範檔</li>\n'
 '          <li><strong>網站整個打不開</strong>：手機上已經加到主畫面、打開過的頁面還是能用；不行就播影片、用簡報的截圖講</li>\n'
 '        </ul>\n'
 '      </div>\n'
 '    </div>\n'
 '    <div class="two" style="margin-top:12px">\n'
 '      <div class="panel">\n'
 '        <h3>檢查清單</h3>\n'
 '        <p class="who">報告前一天</p>\n'
 '        <ul>\n'
 '          <li>☐ 手機、筆電充電；帶充電線、手機架（或找可以靠牆放的地方）</li>\n'
 '          <li>☐ 用要示範的手機把首頁、重播分析各打開兩次，開一次鏡頭做一組（存進手機，斷網也能用）</li>\n'
 '          <li>☐ 錄一段真人示範影片（手機螢幕錄影），傳到投影用的電腦</li>\n'
 '          <li>☐ 投影用的電腦打開簡報，翻到最後一頁（80 頁），看字和圖都正常</li>\n'
 '          <li>☐ 照講稿講一遍、用碼表量時間</li>\n'
 '        </ul>\n'
 '        <p class="who">報告當天</p>\n'
 '        <ul>\n'
 '          <li>☐ 網址 ttweew.github.io/claude-workspace（或主畫面的圖示）</li>\n'
 '          <li>☐ 場地：側面 2～3 公尺、全身入鏡、燈夠亮</li>\n'
 '          <li>☐ 聲音：網站的音量「中」或「大」、手機不要靜音</li>\n'
 '          <li>☐ 電腦先開好分頁：簡報、重播分析、研究成果頁、示範影片</li>\n'
 '        </ul>\n'
 '      </div>\n'
 '      <div class="panel">\n'
 '        <h3>老師可能會問的問題</h3>\n'
 '        <ol>\n'
 '          <li><strong>AI 模型 98% 是真人的嗎？</strong>不是。是示範動畫的火柴人做成的 8 位合成受測者，只證明訓練、比較、放進網站的流程是通的；合成的錯誤很乾淨，真人一定比較低。組員的實測檔來了，用同一個指令重新訓練就有真人的數字</li>\n'
 '          <li><strong>為什麼 AI 比規則準？</strong>合成資料裡有一半的故意做錯只做到門檻的一半到一倍，固定門檻的規則抓不到；AI 自己學到比較低的門檻（深蹲上身前傾約 41°，我們訂 50°）。哪個門檻對要看真人的資料</li>\n'
 '          <li><strong>答案（做對、做錯）怎麼來？</strong>實測模式：受測者照卡片做（做對、故意做某一種錯），網站把這組要做的寫進檔案，就是答案，不用另外一下一下標</li>\n'
 '          <li><strong>會不會先看過考題？</strong>訓練和測試照受測者分，同一個人只會在一邊；交叉驗證每次留一位當測試；網站上訓練時看過的受測者寫「不能算數」</li>\n'
 '          <li><strong>為什麼用 Random Forest、不用深度學習？</strong>計畫書的規劃；資料少也能訓練；看得出它最常看哪些數字、學到的門檻；模型壓縮後約 8 KB，在手機上直接算、斷網也能用</li>\n'
 '          <li><strong>DTW 為什麼只有 52%？</strong>DTW 比的是膝蓋、手肘的角度曲線（蹲多深、節奏像不像），上身前傾、腳跟離地幾乎不改變這條曲線；適合給「像不像示範」的分數，不適合判斷這幾種錯誤</li>\n'
 '          <li><strong>角度準不準？</strong>驗證工具（量角器對照、照片量角器）做好了，還沒有真人的數字，是下一步最重要的事</li>\n'
 '          <li><strong>影像會上傳嗎？</strong>不會，影像不離開手機；雲端同步只存每次運動的數字（預設關閉），AI 教練只送這組的數字</li>\n'
 '        </ol>\n'
 '      </div>\n'
 '    </div>\n'
 '  </section>\n')
rep('\n  <!-- 最近完成 -->', prep + '\n  <!-- 最近完成 -->')

# ---------- 開發階段 03 AI 模型、07 整合測試；研究目標 3 ----------
rep('<li><span class="wip">◐</span> Random Forest：訓練好了、和規則與 DTW 比過（11/3，合成資料的交叉驗證：AI 模型 98%、規則 86%、DTW 52%），11/4 放進網站；真人的準確率等實測檔</li>',
    '<li><span class="ok">✓</span> Random Forest：訓練好了、和規則與 DTW 比過（11/3，合成資料的交叉驗證：AI 模型 98%、規則 86%、DTW 52%）；放進網站（11/4）：重播分析每一下的 AI 判斷和規則並排、實測報表各猜對幾下</li>\n'
    '              <li><span class="wip">◐</span> AI 模型真人的準確率：等組員的實測檔，用同一個指令重新訓練</li>')
rep('<td><span class="chip doing">規則式＋相似度完成</span></td>', '<td><span class="chip doing">規則式＋相似度＋AI 模型（示範）完成</span></td>')
rep('<li><span class="ok">✓</span> 每次合併前重跑 39 項情境測試（約 45 分鐘）；專案內 280 項自動測試，每次推送到 GitHub 自動跑</li>',
    '<li><span class="ok">✓</span> 每次合併前重跑 39 項情境測試（約 45 分鐘）；專案內 ' + str(C['unit']) + ' 項自動測試＋' + str(C['browser']) + ' 項瀏覽器測試，每次推送到 GitHub 自動跑</li>\n'
    '              <li><span class="ok">✓</span> AI 判斷放進網站後的整合（11/4）：背景執行緒開不起來、斷網、發布時加版本號、首頁錄的檔案、320 寬，AI 判斷都照常；11/5 凍結版跑過全部的測試</li>')
rep('Random Forest 訓練好了（11/3，合成資料：AI 模型 98%、規則 86%），11/4 放進網站</td><td><span class="chip doing">規則式＋相似度＋建議</span></td>',
    'Random Forest 訓練好了（11/3，合成資料：AI 模型 98%、規則 86%），放進網站（11/4：重播分析每一下的 AI 判斷）；真人的準確率等實測檔</td><td><span class="chip doing">規則式＋相似度＋建議＋AI 模型（示範）</span></td>')
rep('第三次報告 PR #61–#124 · 更新於 2026-11-03', '第三次報告 PR #61–#' + P2 + ' · 更新於 2026-11-03')
open(OUT, 'w', encoding='utf-8').write(t)
print('ok', len(t))
