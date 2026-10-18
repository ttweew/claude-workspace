# 進度地圖：把「11/9 前的規劃」換成每天的工作表（10/18 使用者要求）；status 傳入 10/18 那一列的狀態
# 用法：python3 progress_daily.py <progress.html> <10/18 的狀態 HTML>
import sys
P = sys.argv[1]
STATUS_1018 = sys.argv[2]
t = open(P, encoding='utf8').read()

def rep(a, b):
    global t
    assert t.count(a) == 1, (a[:60], t.count(a))
    t = t.replace(a, b)

TODO = '<span class="chip todo">還沒做</span>'
WEEKS = [
    ('第 1 週：實測準備、雲端', [
        ('10/19（一）', '實測任務卡＋「複製手機資訊」按鈕（手機型號、瀏覽器、AI 每格幾毫秒，一鍵複製貼到群組）；開始寫開發日誌', '看任務卡、決定實測日期'),
        ('10/20（二）', '計次準確率：關鏡頭後填「實際做了幾下」，自動算出每個動作準不準', '建 Firebase 專案，把設定給我'),
        ('10/21（三）', 'Firebase 正式接上、真手機測試（還沒拿到設定：把瀏覽器測試工具整理進專案）', '實測（建議 10/21～10/23 其中一天，約 60 分鐘）'),
        ('10/22（四）', '實測當天在線上，有問題當天修（還沒實測：測試工具續）', '同上'),
        ('10/23（五）', '用真人數字調門檻（還沒實測：門檻集中到一個設定檔，之後改數字就好）', '錄影放雲端硬碟'),
        ('10/24（六）', '實測結果寫進驗證實驗、路線圖', '—'),
        ('10/25（日）', '第 1 週小結：簡報加一頁、進度地圖更新', '—')]),
    ('第 2 週：進階分析（計畫書目標 2、4）', [
        ('10/26（一）', '運動總結加「每一下」的圖表（深度、速度）', '試用、回報'),
        ('10/27（二）', '疲勞分析：同一組的前段和後段比（變慢、變淺、錯誤變多、相似度下降）', '試用、回報'),
        ('10/28（三）', '流暢度：每一下的節奏穩不穩', '試用、回報'),
        ('10/29（四）', '穩定度：棒式時髖部晃動、深蹲和弓箭步時身體晃動', '試用、回報'),
        ('10/30（五）', '成長曲線：運動紀錄畫成圖（雲端上的也算）', '試用、回報'),
        ('10/31（六）', '重播分析頁也顯示疲勞、流暢度、穩定度', '標記錄影裡每一下做對或做錯'),
        ('11/1（日）', '第 2 週小結：簡報、進度地圖', '同上')]),
    ('第 3 週：AI 模型＋報告（計畫書目標 3）', [
        ('11/2（一）', 'AI 模型的資料：從錄影抽出每一下的特徵＋組員標的對錯（還沒標記：先用合成資料把流程做通）', '—'),
        ('11/3（二）', '訓練 Random Forest，和規則判斷、DTW 比準確率', '看結果'),
        ('11/4（三）', '模型放進網站：重播分析顯示「AI 判斷 vs 規則判斷」', '試用'),
        ('11/5（四）', '功能凍結：完整回歸測試，只修問題', '試用凍結版'),
        ('11/6（五）', '簡報定稿（數字、截圖、示範影片）', '看簡報給意見'),
        ('11/7（六）', '彩排 1 的修正（講稿、時間）', '彩排'),
        ('11/8（日）', '彩排 2 的修正＋備案（離線示範、錄好的示範影片）', '彩排'),
        ('11/9（一）', '<strong>第三次報告</strong>：不改程式，只確認網站、簡報、示範都正常', '報告')])]

rows = ['          <tr><td class="stage">10/18（日）</td><td>地基審查：找到並修好 15 個問題（PR #80）；後端第 1 步：雲端同步運動紀錄，Firebase（PR #81）</td>'
        '<td>決定後端用 Firebase</td><td>' + STATUS_1018 + '</td></tr>']
for title, days in WEEKS:
    rows.append(f'          <tr class="week"><td colspan="4">{title}</td></tr>')
    for date, dev, team in days:
        rows.append(f'          <tr><td class="stage">{date}</td><td>{dev}</td><td>{team}</td><td>{TODO}</td></tr>')

plan = '''  <!-- 11/9 前的規劃：每天的工作表 -->
  <section aria-labelledby="planTitle">
    <div class="sec-head">
      <h2 id="planTitle">11/9（一）第三次報告前：每天的工作表</h2>
      <p>從 10/12 第二次報告到 11/9 第三次報告。<strong>每天做一小步</strong>：當天做完、測過、合併，在這裡標成完成並寫上 PR 編號；開發日誌每天記一段（做了什麼、測了什麼、明天做什麼）。要等組員的項目（實測、Firebase 設定、錄影檔），括號裡是還沒跟上時改做的工作，不會有空白的一天。11/5 之後不加新功能，只做簡報和彩排。</p>
    </div>
    <div class="table-box">
      <table>
        <thead><tr><th>日期</th><th>網站開發</th><th>組員</th><th>狀態</th></tr></thead>
        <tbody>
''' + '\n'.join(rows) + '''
        </tbody>
      </table>
    </div>
    <div class="two" style="margin-top:12px">
      <div class="panel">
        <h3>要請你們決定</h3>
        <ol>
          <li><strong>實測聚會的日期</strong>：建議 10/21～10/23，約 60 分鐘；第 2、3 週都靠這批資料</li>
          <li><strong>錄影檔怎麼交</strong>：建議放 Google Drive 共用資料夾</li>
          <li><strong>後端</strong>：<span class="ok">✓</span> 10/18 決定用 Firebase（之後要不要改成自己的伺服器再討論）。請組員建立 Firebase 專案，步驟在專案的 docs/firebase-setup.md，約 10 分鐘</li>
        </ol>
      </div>
      <div class="panel">
        <h3>時間不夠時的優先順序</h3>
        <ol>
          <li>真人驗證：角度誤差、次數、錯誤門檻</li>
          <li>疲勞分析</li>
          <li>AI 模型試做</li>
          <li>後端的下一步：Google 登入、老師看全班的資料</li>
        </ol>
      </div>
    </div>
  </section>

'''
a = t.index('  <!-- 11/9 前的規劃')
b = t.index('  <!-- 最近完成 -->')
t = t[:a] + plan + t[b:]

# 週的分隔列
rep('td.stage { font-weight: 700; white-space: nowrap; }',
    'td.stage { font-weight: 700; white-space: nowrap; }\ntr.week td { padding: 8px 14px; background: var(--bg); color: var(--muted); font-size: 13px; font-weight: 700; letter-spacing: 0.04em; }')
open(P, 'w', encoding='utf8').write(t)
print('ok', len(rows))
