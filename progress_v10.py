# 進度地圖 v10：第三次報告（PR #61–#79）＋ 11/9 前的規劃
# 用法：python3 progress_v10.py <progress.html> <數字 json> <日期，例如 2026-10-18>
import json, sys
P = sys.argv[1]; NUMS = json.load(open(sys.argv[2])); DATE = sys.argv[3]
t = open(P, encoding='utf8').read()
def rep(a, b, c=1):
    global t
    assert t.count(a) == c, (a[:80], t.count(a)); t = t.replace(a, b)
LAST = NUMS['lastPr']

rep('<span class="eyebrow">AI 智慧運動分析系統 · 2026-10-13</span>', f'<span class="eyebrow">AI 智慧運動分析系統 · {DATE}</span>')

# ---------- 一句話現況 ----------
rep('<h2 id="nowTitle">一句話現況：老師 10/12 的 9 個問題都完成了；「看」和「量」完成，「判斷」的深蹲原型做好了，等捲尺校準和真手機確認</h2>',
    '<h2 id="nowTitle">一句話現況：第三層「判斷」補起來了，四個動作會計次、抓錯誤、給相似度分數、依每個人校正；接下來最重要的是真人實測</h2>')
rep('<p>系統可以分成三層。前兩層已經在網站上運作；第三層（簡報裡的 AI 評分、錯誤偵測、疲勞分析）從深蹲開始，次數與深度的原型已完成，先藏在實驗網址（<code>?lab=squat</code>）；7 段真人錄影已檢查過，接下來用捲尺、量角器校準。老師 10/12 的 9 個問題（PR #61–#67）全部完成，其中提示音、長時間錄製、每秒格數要請組員用真手機確認。</p>',
    f'<p>系統可以分成三層。前兩層已經在網站上運作；第三層這次補起來了：深蹲、伏地挺身、弓箭步計次，棒式計時，6 種常見錯誤會標紅並用語音提醒，每一下和示範動作比對給 0～100 分（DTW），站直 2 秒自動依每個人校正，做完有運動總結。網站也會自己看手機能力，自動調每秒格數和模型。10/18 做了一次地基審查（穩定性、自我修復、安全、數值），修好 9 個問題。這些都用示範動畫做成的骨架測試過；<strong>門檻準不準要靠真人實測</strong>，這是 11/9 報告前最重要的事（見下方「11/9 前的規劃」）。</p>')
rep('<div class="meter" aria-label="剛開始"><span style="width:20%"></span></div>\n        <span class="chip doing">深蹲次數與深度（實驗中）</span>',
    '<div class="meter" aria-label="大部分完成，待真人驗證"><span style="width:60%"></span></div>\n        <span class="chip doing">計次、錯誤、相似度、校正完成；疲勞、AI 模型還沒做</span>')

# ---------- 11/9 前的規劃（新的一節，放在「最近完成」前面） ----------
plan = f'''  <!-- 11/9 前的規劃 -->
  <section aria-labelledby="planTitle">
    <div class="sec-head">
      <h2 id="planTitle">11/9（一）第三次報告前的規劃</h2>
      <p>從 10/12 第二次報告到 11/9 第三次報告有四週。功能已經做了很多，接下來最有價值的是<strong>真人的數字</strong>：老師一定會問「準不準」，計畫書裡的 AI 模型也需要真人資料才能訓練。11/5 之後不加新功能，只做簡報和彩排。</p>
    </div>
    <div class="table-box">
      <table>
        <thead><tr><th>時間</th><th>主題</th><th>網站開發</th><th>需要組員</th></tr></thead>
        <tbody>
          <tr><td class="stage">10/18–10/25</td><td><strong>收尾＋真人實測</strong></td><td>10/18 已完成：相似度、個人校正、進階設定、地基審查（PR #77–#80）；簡報、進度地圖更新。接著做「實測任務卡＋手機回報表」；照實測數字調門檻</td><td>一次約 60 分鐘的實測（建議 10/21–10/23）：每人每個動作做對 10 下、每種錯誤 5 下並錄下來；量角器量 5 個姿勢（實驗 A）；真手機確認 4 件事</td></tr>
          <tr><td class="stage">10/26–11/1</td><td><strong>進階分析</strong>（計畫書目標 2、4）</td><td>疲勞分析：同一組動作前段和後段比較（速度變慢、蹲得變淺、錯誤變多、相似度下降）；穩定度（棒式時髖部晃動）、流暢度（每一下節奏穩不穩）；運動總結加每一下的圖表、運動紀錄加成長曲線</td><td>試用新功能，回報合不合理</td></tr>
          <tr><td class="stage">11/2–11/8</td><td><strong>AI 模型試做＋報告準備</strong>（計畫書目標 3）</td><td>用第 1 週的錄影和組員標的「做對／做錯」訓練小模型（Random Forest），和規則、DTW 比較準確率；後端做出設計和原型；11/5 功能凍結；11/6–11/8 簡報、彩排</td><td>標記錄影裡每一下做對或做錯；決定後端用哪一種</td></tr>
        </tbody>
      </table>
    </div>
    <div class="two" style="margin-top:12px">
      <div class="panel">
        <h3>要請你們決定</h3>
        <ol>
          <li><strong>實測聚會的日期</strong>：越早越好，第 2、3 週都靠這批資料</li>
          <li><strong>錄影檔怎麼交</strong>：建議放 Google Drive 共用資料夾</li>
          <li><strong>後端</strong>（10/18 決定先打地基，晚一點再選）：Firebase（最省事，不用自己架伺服器）或 FastAPI＋MongoDB（符合原計畫，要找地方放伺服器、有人建帳號）</li>
        </ol>
      </div>
      <div class="panel">
        <h3>時間不夠時的優先順序</h3>
        <ol>
          <li>真人驗證：角度誤差、次數、錯誤門檻</li>
          <li>疲勞分析</li>
          <li>AI 模型試做</li>
          <li>後端</li>
        </ol>
      </div>
    </div>
  </section>

  <!-- 最近完成 -->'''
rep('  <!-- 最近完成 -->', plan)

# ---------- 最近完成：第三次報告 ----------
recent = f'''<h2 id="recentTitle">第三次報告到目前完成的（PR #61–#{LAST}，10/12–10/18）</h2>
      <p>照順序一個 PR 一個 PR 做，每個合併前都跑完整的回歸測試（約 45 分鐘），結果和改之前一樣才合併。</p>
    </div>
    <h3 style="margin:0 0 8px;font-size:16px">從「量」到「判斷」（PR #73–#{LAST}）</h3>
    <div class="table-box">
      <table>
        <thead><tr><th>項目</th><th>做了什麼</th><th>PR</th><th>狀態</th></tr></thead>
        <tbody>
          <tr><td class="stage">運動模式＋計次</td><td>首頁卡片「開始深蹲」或鏡頭畫面右上角選動作（會記住）；深蹲看膝蓋（90° 到位）、伏地挺身看手肘（95°，要趴著）、弓箭步看兩腳膝蓋（100°）、棒式在肩髖膝一直線時計時；正面拍提示側身</td><td>#73</td><td><span class="chip done">完成</span>（待真人實測）</td></tr>
          <tr><td class="stage">錯誤判斷</td><td>深蹲上身前傾、腳跟離地；伏地挺身和棒式腰塌、屁股太高；弓箭步上身前傾、前膝超過腳尖。做錯的部位畫粗紅線、上方紅字、中文語音提醒；持續 0.4 秒才出現，不誤報</td><td>#74</td><td><span class="chip done">完成</span>（門檻待實測）</td></tr>
          <tr><td class="stage">運動總結＋紀錄</td><td>關鏡頭後首頁顯示「這次運動」（次數、深度分布、最低／平均角度、每下秒數、錯誤統計），和上一次同一個動作比較；最近 10 次列在「運動紀錄」（存在手機，最多 50 次）</td><td>#75</td><td><span class="chip done">完成</span></td></tr>
          <tr><td class="stage">驗證工具</td><td>鏡頭畫面「記下角度」，使用說明「驗證實驗 A」填量角器角度，算平均誤差、偏差、±5°／±10° 以內的比例、下載 CSV；重播分析四個動作都能逐下分析（和鏡頭畫面同一套計算）</td><td>#76</td><td><span class="chip done">完成</span>（等實測數字）</td></tr>
          <tr><td class="stage">動作相似度（DTW）</td><td>每一下的角度曲線和示範動作用動態時間校正對齊，平均每差 1° 扣 2.5 分；做得慢不扣分，蹲得淺會扣。合成曲線：標準約 97、底部停 2 秒約 96、只蹲到 110° 約 82、125° 約 69</td><td>#77</td><td><span class="chip done">完成</span></td></tr>
          <tr><td class="stage">個人校正</td><td>深蹲、弓箭步開鏡頭後側身站直不動 1.5 秒自動校正：「站直」門檻改成這個人站直的角度 − 10°，前傾扣掉手機傾斜。測試：手機放高時 0 下 → 3 下；手機歪 12° 不再誤判前傾</td><td>#78</td><td><span class="chip done">完成</span>（待真人實測）</td></tr>
          <tr><td class="stage">首頁整理</td><td>每秒格數、AI 模型收進「進階設定」（收起來時標題寫出改過的設定）；新增「語音提醒」開關</td><td>#79</td><td><span class="chip done">完成</span></td></tr>
        </tbody>
      </table>
    </div>
    <h3 style="margin:20px 0 8px;font-size:16px">地基審查（10/18，PR #{NUMS['auditPr']}）：穩定性、自我修復、串接、安全、數值</h3>
    <p style="color:var(--muted);font-size:15px;margin-bottom:8px">組員 10/18 要求後端先等等，先把地基打好。逐檔看程式，加上四種新的瀏覽器測試（{NUMS['audit']['browser']}）和兩個自動測試檔（{NUMS['audit']['unit']}），找到並修好 15 個問題，分成四類：</p>
    <div class="table-box">
      <table>
        <thead><tr><th>類別</th><th>找到的問題</th><th>怎麼修</th></tr></thead>
        <tbody>
          <tr><td class="stage">安全</td><td>網址、錄製檔、存的資料裡有 <code>constructor</code> 這種 JavaScript 內建的名字，網頁會壞掉（網址加 <code>?workout=constructor</code>，AI 一直停在「準備中」）</td><td>先比對清單：只認得清單裡的動作、模型、解析度</td></tr>
          <tr><td class="stage">安全</td><td>存在裝置上的紀錄、記下的角度被改壞時，總結會出現 NaN</td><td>欄位不對的那一筆不用</td></tr>
          <tr><td class="stage">安全</td><td>驗證表下載的 CSV 用 Excel 打開時，= + - @ 開頭的文字會被當成公式執行</td><td>前面加 '，當成一般文字</td></tr>
          <tr><td class="stage">安全</td><td>重播分析選到好幾 GB 的影片，整個讀進來分頁會當掉</td><td>超過 400 MB 直接說明，請重新選擇</td></tr>
          <tr><td class="stage">數字</td><td>棒式：每一次的提示寫 0:12，總結寫 0:13</td><td>秒數都無條件捨去，畫面、提示、總結一樣</td></tr>
          <tr><td class="stage">數字</td><td>驗證表：網站角度寫 92°、差距卻是 +2.4°</td><td>網站角度寫到小數第 1 位</td></tr>
          <tr><td class="stage">數字</td><td>量角器打錯字（900）也算進統計</td><td>0～180° 才算，打錯的框變紅</td></tr>
          <tr><td class="stage">數字</td><td>個人校正把站姿本來的前傾（約 6°）也當成手機歪，前傾的判斷變寬鬆</td><td>改看腿（髖部中心 → 兩腳踝中間）量手機歪多少</td></tr>
          <tr><td class="stage">串接</td><td>錄製中可以換動作，重播會用開始錄的動作分析整段</td><td>錄製中鎖住，畫面說明原因</td></tr>
          <tr><td class="stage">串接</td><td>棒式撐到一半就關網頁，這次沒有記下來</td><td>撐到現在的算一次</td></tr>
          <tr><td class="stage">串接</td><td>iPhone 的語音要先在按按鈕時講過一次才講得出來</td><td>按「開啟鏡頭」時先解鎖（唸一個聽不到的空白）</td></tr>
          <tr><td class="stage">串接</td><td>錯誤出現時剛好在提示站位，紅字之後才出現、卻沒有唸</td><td>紅字出現時才唸</td></tr>
          <tr><td class="stage">自我修復</td><td>鏡頭畫面停住（iPhone 省電模式、切回來時）沒有人處理，看起來像當掉</td><td>3 秒沒新畫面先繼續播放，8 秒重開鏡頭（次數保留），還是停住就請使用者重開</td></tr>
          <tr><td class="stage">自我修復</td><td>抓不到鏡頭畫面時被當成 AI 出錯，重新啟動 AI，最後顯示「AI 無法使用」</td><td>交給鏡頭的自我修復（重開鏡頭）</td></tr>
          <tr><td class="stage">自我修復</td><td>瀏覽器的語音卡在「講話中」，之後每一句都被跳過</td><td>超過 15 秒自動清掉重來</td></tr>
        </tbody>
      </table>
    </div>
    <p class="note" style="margin-top:12px"><strong>還沒做、要真手機測過才做：</strong>AI 檔案存進手機前核對檔案指紋（防止被竄改的檔案一直留在手機裡）、內容安全政策（CSP）。這兩項做錯會讓離線功能失效或舊的 iPhone 跑不了 AI，所以等實測時一起確認。</p>
    <h3 style="margin:20px 0 8px;font-size:16px">組員 10/13 的想法：網站自己看手機能力調整（PR #68–#72）</h3>
    <div class="table-box">
      <table>
        <thead><tr><th>項目</th><th>做了什麼</th><th>PR</th><th>狀態</th></tr></thead>
        <tbody>
          <tr><td class="stage">鏡頭能力說明</td><td>運算標籤寫出「鏡頭最多幾格」：螢幕 165 Hz 不代表鏡頭能給 165 格，大部分鏡頭最多 30 格</td><td>#68</td><td><span class="chip done">完成</span></td></tr>
          <tr><td class="stage">速度建議</td><td>開鏡頭約 10 秒後量 AI 每格幾毫秒（暖機 3 秒、量 8 秒取中位數）；跟不上建議改回 30 格或 lite，有餘裕建議 full 或 60 格；只建議，按了才換</td><td>#69</td><td><span class="chip done">完成</span>（門檻待實測）</td></tr>
          <tr><td class="stage">自動每秒格數</td><td>「畫面流暢度」選自動：有餘裕升到 60 格；最近 10 秒有 8 秒跟不上就降回 30；降得快、升得慢，降過 2 次不再試；錄製中鎖住</td><td>#70</td><td><span class="chip done">完成</span>（真手機待實測）</td></tr>
          <tr><td class="stage">自動選模型</td><td>「AI 模型」選自動：先用比較準的 full，跟不上改用 lite 並記住；換模型不用重新整理網頁</td><td>#71</td><td><span class="chip done">完成</span>（真手機待實測）</td></tr>
          <tr><td class="stage">光線太暗提醒</td><td>每秒量畫面亮度（0～255），連續 3 秒低於 45 提醒開燈，回到 60 以上收起</td><td>#72</td><td><span class="chip done">完成</span>（門檻待實測）</td></tr>
        </tbody>
      </table>
    </div>
    <h3 style="margin:20px 0 8px;font-size:16px">老師 10/12 的 9 個問題（PR #61–#67）</h3>
    <div class="table-box">'''
rep('''<h2 id="recentTitle">最近完成：老師 10/12 的 9 個問題（PR #61–#67，10/12–10/13）</h2>
      <p>照順序一個 PR 一個 PR 做，每個合併前都跑完整的回歸測試（約 45 分鐘），結果和改之前一樣才合併。</p>
    </div>
    <div class="table-box">''', recent)

# 簡報改版說明
rep('<h3 style="margin:20px 0 8px;font-size:16px">簡報改版（10/13）：開頭逐題回覆老師的 9 個問題</h3>',
    f'<h3 style="margin:20px 0 8px;font-size:16px">簡報改版（{DATE[5:].replace("-", "/")}）：第三次報告</h3>')
old_rows = '''          <tr><td class="stage">報告</td><td>第 1～16 頁</td><td>老師 10/12 的 9 個問題（總覽＋一題一頁，照老師提問的順序）→ 還要用真手機確認的 3 件事 → 限制與下一步</td></tr>
          <tr><td class="stage">詳細資料</td><td>第 17～48 頁</td><td>系統與設計邏輯、開發環境、61 次更新、程式碼、技術突破與測試</td></tr>
          <tr><td class="stage">10/12 報告</td><td>第 49～64 頁</td><td>上次報告的內容原封保留：更早的 6 個問題、真人實測、手機與各種裝置</td></tr>'''
D = NUMS['deck']
new_rows = f'''          <tr><td class="stage">報告</td><td>第 1～{D['end']} 頁</td><td>老師 10/12 的 9 個問題 → 組員的想法：網站自己看手機能力調整（2 頁）→ 從「量」到「判斷」（9 頁：計次、錯誤、總結、驗證、相似度、校正、地基審查 2 頁）→ 要請組員實測的事 → 限制與下一步</td></tr>
          <tr><td class="stage">詳細資料</td><td>第 {D['appendix']}～{D['questions'] - 1} 頁</td><td>系統與設計邏輯、開發環境、{LAST - 6} 次更新、程式碼、技術突破與測試</td></tr>
          <tr><td class="stage">10/12 報告</td><td>第 {D['questions']}～{D['total']} 頁</td><td>上次報告的內容原封保留：更早的 6 個問題、真人實測、手機與各種裝置</td></tr>'''
rep(old_rows, new_rows)
rep('<p class="note" style="margin-top:12px"><strong>老師已決定：</strong>「蹲到位」用膝蓋 90°（10/12）。問題關節標紅（上次 Q3 的後半）還要先定「前傾多少算錯」。<a href="https://claude.ai/artifact/DLE3Mgj4qAsx34vkhtTfN1">打開簡報</a></p>',
    '<p class="note" style="margin-top:12px"><strong>老師已決定：</strong>「蹲到位」用膝蓋 90°（10/12）。問題關節標紅（上次 Q3 的後半）已完成，前傾先訂 50°（弓箭步 30°），要請組員實測調整。<a href="https://claude.ai/artifact/DLE3Mgj4qAsx34vkhtTfN1">打開簡報</a></p>')

# ---------- 8 個階段 ----------
rep('<li class="doing"><div class="bar"><span style="width:25%"></span></div><span class="num">03</span><span class="title">AI 模型</span><span class="here">● 目前位置</span></li>\n      <li><div class="bar"><span></span></div><span class="num">04</span><span class="title">分析優化</span></li>',
    '<li class="doing"><div class="bar"><span style="width:60%"></span></div><span class="num">03</span><span class="title">AI 模型</span><span class="here">● 目前位置</span></li>\n      <li><div class="bar"><span></span></div><span class="num">04</span><span class="title">分析優化</span><span class="here">下一步</span></li>')
rep('<li class="doing"><div class="bar"><span style="width:55%"></span></div><span class="num">06</span><span class="title">前端視覺化</span></li>\n      <li class="doing"><div class="bar"><span style="width:65%"></span></div><span class="num">07</span><span class="title">整合測試</span></li>\n      <li class="doing"><div class="bar"><span style="width:50%"></span></div><span class="num">08</span><span class="title">驗證優化</span></li>',
    '<li class="doing"><div class="bar"><span style="width:65%"></span></div><span class="num">06</span><span class="title">前端視覺化</span></li>\n      <li class="doing"><div class="bar"><span style="width:70%"></span></div><span class="num">07</span><span class="title">整合測試</span></li>\n      <li class="doing"><div class="bar"><span style="width:55%"></span></div><span class="num">08</span><span class="title">驗證優化</span></li>')
rep('              <li><span class="ok">✓</span> AI 在背景執行緒運算、離線使用、手機門檻檢查</li>\n',
    '              <li><span class="ok">✓</span> AI 在背景執行緒運算、離線使用、手機門檻檢查</li>\n              <li><span class="ok">✓</span> 自動調整：速度建議、自動每秒格數、自動選模型、光線太暗提醒（門檻待真手機實測）</li>\n')
rep('''              <li><span class="ok">✓</span> 深蹲規則式原型：次數、每一下的深度（實驗中，網址加 <code>?lab=squat</code>）</li>
              <li><span class="ok">✓</span> 蹲到位的門檻：老師決定膝蓋 90°（10/12）</li>
              <li><span class="wip">◐</span> 錯誤判斷（前傾、膝蓋內夾）還沒做；前傾的門檻還沒定</li>
              <li><span class="no">○</span> Random Forest：需要先錄製並標註訓練資料</li>
            </ul></td>
            <td><span class="chip doing">深蹲原型</span></td>''',
    '''              <li><span class="ok">✓</span> 四個動作的規則式判斷：深蹲、伏地挺身、弓箭步計次，棒式計時</li>
              <li><span class="ok">✓</span> 6 種常見錯誤：骨架標紅、紅字、語音提醒；蹲到位膝蓋 90°（老師 10/12 決定）</li>
              <li><span class="ok">✓</span> 動作相似度：和示範動作用 DTW 比對，每一下 0～100 分，不用訓練資料、說得出原因</li>
              <li><span class="ok">✓</span> 個人校正：站直 2 秒，門檻依每個人調整</li>
              <li><span class="wip">◐</span> 門檻要靠真人實測調整；膝蓋內夾要正面拍，先不判斷</li>
              <li><span class="no">○</span> Random Forest：11/2 起用組員實測的錄影試做，和規則、DTW 比較</li>
            </ul></td>
            <td><span class="chip doing">規則式＋相似度完成</span></td>''')
rep('<td>錄製功能已經能保存整段動作，之後可以用來比較前段與後段</td>\n            <td><span class="chip todo">未開始</span></td>',
    '<td>每一下的深度、速度、錯誤、相似度都已經記下來，疲勞分析（前段和後段比較）排在 10/26 那週</td>\n            <td><span class="chip todo">下一步</span></td>')
rep('              <li><span class="no">○</span> FastAPI、資料庫尚未建置</li>',
    '              <li><span class="ok">✓</span> 運動紀錄先存在這台手機（最多 50 次）</li>\n              <li><span class="no">○</span> FastAPI、資料庫尚未建置：Firebase 或 FastAPI＋MongoDB 待決定</li>')
rep('              <li><span class="no">○</span> 歷史紀錄 Dashboard、成長曲線圖表</li>',
    '              <li><span class="ok">✓</span> 運動總結、運動紀錄、錯誤標紅、首頁「進階設定」</li>\n              <li><span class="no">○</span> 每一下的圖表、成長曲線（排在 10/26 那週）</li>')
rep('              <li><span class="ok">✓</span> 每次合併前重跑 39 項情境測試（約 45 分鐘）；專案內 42 項自動測試，每次推送到 GitHub 自動跑</li>',
    f'              <li><span class="ok">✓</span> 每次合併前重跑 39 項情境測試（約 45 分鐘）；專案內 {NUMS["tests"]} 項自動測試，每次推送到 GitHub 自動跑</li>\n              <li><span class="ok">✓</span> 判斷動作的功能用示範動畫做成的假骨架端到端測試：計次、錯誤、總結、重播、相似度、校正</li>')
rep('              <li><span class="no">○</span> 角度與 3D 準確度：等照「錄影任務卡」錄、附捲尺量的腿長（錄完直接看）</li>',
    '              <li><span class="ok">✓</span> 驗證實驗 A 的工具：記下角度＋填量角器角度，自動算平均誤差</li>\n              <li><span class="no">○</span> 角度與 3D 準確度：等實測（量角器、捲尺量的腿長）</li>')

# ---------- 5 大目標 ----------
rep('<td>先做規則式判斷（深蹲次數與深度原型完成，實驗中），再收集資料訓練模型</td><td><span class="chip doing">規則式原型</span></td>',
    '<td>規則式判斷（四個動作、6 種錯誤）和 DTW 動作相似度完成；Random Forest 等真人資料</td><td><span class="chip doing">規則式＋相似度</span></td>')
rep('<td>錄製功能是它的基礎</td><td><span class="chip todo">未開始</span></td>',
    '<td>每一下的深度、速度、錯誤、相似度都有了，排在 10/26 那週</td><td><span class="chip todo">下一步</span></td>')
rep('<td>即時數據面板已完成；長期 Dashboard 需要後端與資料庫</td><td><span class="chip doing">即時部分完成</span></td>',
    '<td>即時數據面板、運動總結和紀錄（存在手機）完成；長期 Dashboard 需要後端與資料庫</td><td><span class="chip doing">即時＋單次總結完成</span></td>')

# ---------- 4 種運動 ----------
rep('''        <div class="sport-head"><h3>深蹲</h3><span class="en">SQUAT · 原型</span></div>
        <ul class="metrics">
          <li><span class="what">膝蓋彎曲角度</span><span class="chip done">可量測</span></li>
          <li><span class="what">髖部下蹲深度</span><span class="chip done">可量測</span></li>
          <li><span class="what">次數、每一下的深度</span><span class="chip doing">原型（實驗中）</span></li>
          <li><span class="what">背部姿勢、錯誤判斷</span><span class="chip todo">未做</span></li>''',
    '''        <div class="sport-head"><h3>深蹲</h3><span class="en">SQUAT</span></div>
        <ul class="metrics">
          <li><span class="what">膝蓋彎曲角度</span><span class="chip done">可量測</span></li>
          <li><span class="what">髖部下蹲深度</span><span class="chip done">可量測</span></li>
          <li><span class="what">次數、每一下的深度、相似度</span><span class="chip done">完成</span></li>
          <li><span class="what">錯誤：上身前傾、腳跟離地</span><span class="chip done">完成（待實測）</span></li>''')
rep('''          <li><span class="what">身體穩定度</span><span class="chip todo">未做</span></li>
          <li><span class="what">次數計算、錯誤判斷</span><span class="chip todo">未做</span></li>''',
    '''          <li><span class="what">身體穩定度</span><span class="chip todo">10/26 那週</span></li>
          <li><span class="what">次數、相似度</span><span class="chip done">完成</span></li>
          <li><span class="what">錯誤：上身前傾、前膝超過腳尖</span><span class="chip done">完成（待實測）</span></li>''')
rep('''          <li><span class="what">手肘角度</span><span class="chip doing">已計算，畫面未顯示</span></li>
          <li><span class="what">動作深度</span><span class="chip todo">未做</span></li>
          <li><span class="what">次數計算、錯誤判斷</span><span class="chip todo">未做</span></li>''',
    '''          <li><span class="what">手肘角度</span><span class="chip done">可量測、畫面顯示</span></li>
          <li><span class="what">次數、每一下的深度、相似度</span><span class="chip done">完成</span></li>
          <li><span class="what">錯誤：腰塌、屁股太高</span><span class="chip done">完成（待實測）</span></li>''')
rep('''          <li><span class="what">身體平直度</span><span class="chip todo">未做</span></li>
          <li><span class="what">骨盆高度</span><span class="chip todo">未做</span></li>
          <li><span class="what">核心穩定度、計時</span><span class="chip todo">未做</span></li>''',
    '''          <li><span class="what">身體平直度（肩髖膝一直線時計時）</span><span class="chip done">完成</span></li>
          <li><span class="what">骨盆高度：腰塌、屁股太高</span><span class="chip done">完成（待實測）</span></li>
          <li><span class="what">核心穩定度（晃動）</span><span class="chip todo">10/26 那週</span></li>''')

# ---------- 老師的 6 個問題：Q3 完成 ----------
rep('<tr><td class="stage">Q3 顯示編號、標出問題關節</td><td>編號標籤、點選查看已完成；蹲到位的門檻老師已決定用膝蓋 90°；問題關節標紅還要先定前傾的門檻</td><td><span class="chip doing">前半完成</span></td></tr>',
    '<tr><td class="stage">Q3 顯示編號、標出問題關節</td><td>編號標籤、點選查看；蹲到位用膝蓋 90°（老師決定）；做錯的部位畫粗紅線、紅字、語音提醒（PR #74）</td><td><span class="chip done">完成</span>（門檻待實測）</td></tr>')

# ---------- 補強點 ----------
rep('          <li><strong>跨裝置一致性：</strong>',
    '          <li><strong>判斷的方法：</strong>規則式判斷（角度門檻）加上 DTW 動作相似度，不用訓練資料、每個判斷說得出原因，適合寫進「研究方法」；Random Forest 可以等收集到資料後當成比較組</li>\n          <li><strong>自動調整（自適應）：</strong>網站自己量 AI 速度，自動調每秒格數、選模型，門檻和「降得快、升得慢」的設計可以寫進系統實作</li>\n          <li><strong>跨裝置一致性：</strong>')

# ---------- 接下來的分工 ----------
i = t.index('<h3>網站開發（依序進行，每完成一段先給老師看）</h3>')
j = t.index('</ol>', i) + len('</ol>')
t = t[:i] + '''<h3>網站開發（依序進行，每完成一段先給老師看）</h3>
        <ol>
          <li>照實測數字調門檻：錯誤判斷、到位角度、相似度、校正、自動調整</li>
          <li>疲勞分析：同一組動作前段和後段比較（10/26 那週）</li>
          <li>穩定度、流暢度；運動總結的圖表、成長曲線</li>
          <li>AI 評分模型試做：Random Forest，和規則、DTW 比較（11/2 那週）</li>
          <li>後端與歷史紀錄：先決定 Firebase 或 FastAPI＋MongoDB</li>
        </ol>''' + t[j:]
i = t.index('<h3>需要組員幫忙</h3>')
j = t.index('</ol>', i) + len('</ol>')
t = t[:i] + '''<h3>需要組員幫忙</h3>
        <ol>
          <li><strong>實測聚會</strong>（建議 10/21–10/23，約 60 分鐘）：每人每個動作做對 10 下、每種錯誤故意做 5 下，全部錄下來；記下網站算的次數、有沒有報錯</li>
          <li>量角器量 5 個姿勢，在鏡頭畫面按「記下角度」，再到使用說明「驗證實驗 A」填進去</li>
          <li>真手機 4 件事：iPhone 靜音開關時的提示音；手機錄 10 分鐘以上；每秒 60／90／120 格；畫面流暢度和 AI 模型都選「自動」運動 5 分鐘</li>
          <li>手機放高、放歪各試一次個人校正；暗的房間試光線提醒</li>
          <li>錄影檔放 Google Drive 共用資料夾；標記每一下做對或做錯（訓練 AI 模型用）</li>
          <li>決定後端用哪一種；討論 Q4 要不要做模型比較</li>
        </ol>''' + t[j:]

rep('網站：<a href="https://ttweew.github.io/claude-workspace/">ttweew.github.io/claude-workspace</a> · 第二批次 PR #7–#67 · 更新於 2026-10-13',
    f'網站：<a href="https://ttweew.github.io/claude-workspace/">ttweew.github.io/claude-workspace</a> · 第三次報告 PR #61–#{LAST} · 更新於 {DATE}')
open(P, 'w', encoding='utf8').write(t)
print('ok', len(t))
