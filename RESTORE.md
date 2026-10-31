# 測試工具備份（test-tools 分支）

這個分支只放開發時用的瀏覽器測試工具（Playwright 腳本、假鏡頭、假 AI、回歸測試的基準），**不會合併到 main，也不會發布到網站**。
放這裡是因為雲端開發環境（容器）被回收時，暫存區的檔案會不見。之後會逐步把常用的測試正式整理進專案的 `tests/browser/`。

## 沒有放進來的東西

- 組員的真人錄影（例如 10/6 的 iPad 錄影）：專案是公開的，個人資料不放 GitHub。
- MediaPipe 套件、AI 模型檔、測試用的照片：都是官方公開的檔案，下面的指令會重新下載。
- 測試自己產生的大檔（例如 20 分鐘的錄製檔）、截圖：重跑測試會再產生。

## 還原

腳本裡寫死了原本的暫存區路徑，還原到同一個地方：

```
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
mkdir -p $S
cd /home/user/claude-workspace && git fetch origin test-tools && git archive origin/test-tools | tar -x -C $S

# MediaPipe（測試時代替 CDN）、模型、照片
mkdir -p $S/mp && cd $S/mp && npm init -y >/dev/null && npm install --no-audit --no-fund @mediapipe/tasks-vision@1.0.1
M=https://storage.googleapis.com/mediapipe-models/pose_landmarker
curl -sSLo pose_landmarker_lite.task $M/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
curl -sSLo pose_landmarker_full.task $M/pose_landmarker_full/float16/1/pose_landmarker_full.task
curl -sSLo pose.jpg https://storage.googleapis.com/mediapipe-assets/pose.jpg
cp pose.jpg $S/ghost2/pose.jpg
mkdir -p $S/throttle/__test $S/throttle/model && cp pose.jpg $S/throttle/__test/ && cp pose_landmarker_lite.task $S/throttle/model/
for f in portrait.jpg male_full_height_hands.jpg man-woman-okay.jpg; do curl -sSLo $S/ghost2/$f https://storage.googleapis.com/mediapipe-assets/$f; done
curl -sSLo $S/deck13shots/room.jpg https://storage.googleapis.com/mediapipe-assets/room.jpg

# Firebase（雲端同步的瀏覽器測試）
mkdir -p $S/fb && cd $S/fb && npm init -y >/dev/null && npm install --no-audit --no-fund firebase@12.19.0 firebase-tools@15.32.1
```

瀏覽器用環境裡的 Chromium（`/opt/pw-browsers/chromium`）。

Python 的 Playwright（10/30 還原時沒有）：環境裡的 `python3` 是 3.11，要用 `python3 -m pip` 裝（`pip` 指令是別的版本的 Python），版本和環境的 Chromium 一樣：

```
python3 -m pip install --break-system-packages playwright==1.63.0
```

無障礙的測試要 axe-core：`mkdir -p $S/a11y && cd $S/a11y && npm init -y >/dev/null && npm install axe-core@4.10.3`。實測報表的測試先 `mkdir -p $S/report21/files && node $S/report21/make_files.mjs /home/user/claude-workspace $S/report21/files`。

10/30 起專案裡也有 `tests/browser/`（合成資料、不用連網路）：`PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser`。

`fbreal/browser_real.py`（真的 Firebase 專案，經過環境的代理連網）要讓 Chromium 信任代理的憑證；這個環境原本的瀏覽器憑證庫是空的，要自己加（只加代理的 3 張）：

```
apt-get install -y libnss3-tools
python3 -c "import re;p=re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----',open('/root/.ccr/ca-bundle.crt').read(),re.S);[open(f'/tmp/proxy{i}.pem','w').write(c+'\\n') for i,c in enumerate(p[-3:])]"
for i in 0 1 2; do certutil -d sql:/root/.pki/nssdb -A -t "C,," -n "proxy$i" -i /tmp/proxy$i.pem; done
```

## 主要的測試

- `reg2.sh`：完整回歸測試，約 50 分鐘。結果和 `reg_r22.txt` 比對：
  - 摘要行要一樣：用 `grep -a -E "ALL PASS|ALLOK|ALL OK|SOME|^FAIL|通過 \|"` 取出比較。
  - 要有 39 個 PASS。
  - 擋鬼點評估那一段（`awk '/^5,6c5,6/,/擋鬼點評估差異如上/'`）的 md5 要是 `f2f5250e138b2bf6ea05b7e5d62db9da`。
- 各功能的測試：`prBcheck`～`prHcheck`、`pr9check`～`pr11check`、`audit2/`（惡意輸入、亂按、畫面停住、長時間運行）、`fbcheck/`（雲端同步，要先開 Firebase 模擬器）。
- 首頁（10/19 改版）：`home19/home_check.py`（四個大按鈕、雲端同步的詢問、實測任務卡、手機版面；要先開 Firebase 模擬器）。
- 無障礙（10/19）：`a11y/maint19.py`、`a11y/axe_more.py`（要先 `cd a11y && npm init -y && npm install axe-core@4.10.3`，maint19 要開 Firebase 模擬器）。錯誤說出原因：`why19/why_check.py <網站資料夾>`。
- 教練影片分析（10/19）：`coach/`。`node an.mjs <錄製檔.json> squat <每秒摘要.txt>` 重算次數和錯誤；`trace.mjs` 逐格看計次狀態；`python3 sheet.py <檔> <開始秒> <結束秒> <間隔> <輸出.png>` 畫骨架縮圖；`heelall.mjs`／`leanall.mjs 名稱=檔案 …` 列出每一下的腳跟、前傾；`sim_stand.mjs`、`sim_two.mjs` 試改計次；`frontcount.mjs` 試算正面計次。錄製檔是網路教練影片，不放進這個分支。
- 10/20：
  - `voice20/voice_check.py`：語音提示、說話規則、計次準確率、複製手機資訊（51 項；用假的講話記下每一句的時間）。`voice20/pick_only.py`：首頁語音三選一。
  - `maint20/check.py <網站資料夾> [old]`：小手機上狀態列變高時，大字（入鏡提示、紅字、每一下的提示）在狀態列下面 8px；加 `old` 在舊程式上跑，預期失敗。`maint20/shot.py <網站資料夾> <old|new>`：紅字出現時拍照比較。
  - `test20/test_check.py [網站資料夾]`：實測模式、主持人卡、受測者卡（56 項；要先裝 axe-core，見上面）。`test20/overflow.py <網站資料夾> <port>`：使用說明 320 寬是誰超出畫面。
  - 教練影片：`coach/sim_real.mjs <錄製檔>`（專案的程式和第二個資料夾的程式各算一次，比次數和錯誤；第二個資料夾寫死在 `wt-maint`，換成要比的程式）、`coach/knee_window.mjs <錄製檔> <開始秒> <結束秒>`（每 0.2 秒的膝蓋角度、方向、計次狀態，新舊並排）、`coach/sim_stand2.mjs`、`coach/heelmag.mjs`。
  - `home19/home_check.py`、`a11y/maint19.py`、`audit2/chaos.py`：改成新的語音三選一；首頁測試的任務卡改用 10/20 的項目。
  - 錄影像手機一樣＋錄製檔清單（10/20 晚上）：`lib20/check.py [網站資料夾]`（錄影控制列、暫停、存成一段一段、首頁和鏡頭畫面的清單、一個個下載、一次下載、zip、刪除、重新整理還在、重播頁讀手機裡的錄製檔；51 項；要先裝 axe-core）；`lib20/toolbar.py`（工具列在 320～1280 寬、各種狀態都排得下一行）；`lib20/smoke.py`（拍照看樣子）；`node lib20/zipcheck.mjs` 做出 zip 再用 Python `zipfile` 和 `unzip -t` 檢查；`lib20/axe_old.py`（舊程式本來就有的兩個無障礙問題）。
  - `r9/countdown.py`、`r10/reclimit.py`、`test20/test_check.py`：錄完之後的按鈕字改成「● 錄下一段」；實測模式改成存進錄製檔、可選「每組做完也馬上下載」。
  - `fix20/check.py [網站資料夾]`：數據面板開著時按「錄影」控制列要出現（8 種螢幕大小）、綠框只在看得到時亮、數據面板的「看錄製檔」（82 項；舊程式 12 項失敗）。`fix20/repro.py`：重現使用者回報的「按了沒反應」。
- 10/21：
  - `home21/check.py [網站資料夾]`：首頁版面整理（設定卡片、黃色提醒、實測模式在外面、錄製檔沒下載變黃；320～1920 八種寬度；axe-core）。`home21/shot.py <網站資料夾> <before|after> <port>`：首頁改前改後拍照。
  - `maint21/axe_pages.py <網站資料夾> <port>`：三個頁面整頁 axe-core（390、1280）。
  - `report21/make_files.mjs <網站資料夾> <輸出資料夾>` 做合成的實測檔（示範資料加上實測資訊），`report21/check.py <網站資料夾> <port>`：實測報表頁。
  - `real20/`：重算實測檔的工具（實測檔本身是組員的錄影，不放進這個分支）。`table.mjs <資料夾>` 每一組的次數和錯誤（`ROOT=<程式資料夾>` 指定用哪一份程式，改前改後比較）；`trace_win.mjs <檔> <動作> <開始秒> <結束秒>` 逐格看計次狀態；`plank_timeline.mjs <檔>` 棒式每 0.5 秒的狀態；`heelbase.mjs`、`heelrise.mjs`、`heelrise2.mjs` 三種腳跟量法比較；`coach_cmp.mjs <教練影片資料夾>`。
  - 10/21 下午：`report21/check.py` 加上「算的時候又拖檔案進來」「390 以上表格放得進框裡」，CSV 用 `newline=''` 讀（保留 \r\n）；`report21/real_report.mjs <資料夾>`（`ROOT=<程式資料夾>`）用報表的程式跑實測檔、印每一組和總結。`real20/quick.mjs <資料夾>` 列出不到 1 秒的那幾下（時間、最低角度、深度）；`real20/coach_rep.mjs <教練影片.json>` 列出 160～200 秒的每一下。`step5/replay_squat.py`：表格超過 2 列才點（10/14 起沒有 nolab 那一列）。
- 10/22：
  - `plank22/`：棒式趴好就算開始（`node make_fake.mjs <網站資料夾>` 做出屁股一直翹著 10 秒再起身的假 AI，`python3 check.py <網站資料夾>`：秒數停在 0:00、紅字、提示、講的話、總結；背景執行緒和主畫面）。
  - `prop22/check.py <網站資料夾> <port>`：照片量角器（真的 AI 看 `mp/pose.jpg`：拖圈、方向鍵、換關節、記下來、使用說明的表格和 CSV、沒有人的照片 `empty.png`、不是照片 `notes.txt`、AI 下載失敗、版面、axe-core）。
  - `real20/plank_holds.mjs <資料夾>`（`ROOT=<程式資料夾>`）：棒式實測檔每一次的開始、結束、秒數、錯誤。
  - `prEcheck/validate.py`：每一下的錯誤 10/19 起後面有數字（「塌腰 19°」），改成比開頭（以前這兩項一直失敗，不在完整回歸測試裡所以沒發現）。
  - `reg2_from10.sh`：容器重開、回歸測試跑到一半斷掉時，從第 10 行（squat）接著跑；前面的輸出要逐段和 `reg_r22.txt` 比對行數，確定是完整的再接起來。
- 10/24（10/23 颱風假）：
  - `heel24/`：腳跟離地改成和站直時比（`node make_fake.mjs <網站資料夾>` 做出深蹲 4 下、後 2 下腳跟往上移 25% 的假 AI，`python3 check.py <網站資料夾>`：每一下的提示、說出原因、連續兩下才講、總結；背景執行緒和主畫面）。`real20/heelrise3.mjs 名稱=檔案 …`（`ROOT=<程式資料夾>`）：兩種腳跟量法每一下的最大值。
  - `sec24/fuzz_history.mjs <網站資料夾>`：存在手機上的運動紀錄改成 43 種奇怪的值，看總結、比較、雲端上傳會不會出錯或出現 NaN、[object Object]。
  - `prop22/check.py`：加上檔案很小、寫很大的圖 `huge.png`（8000×8000，7.8 KB）要說「照片太大」。
  - `prCcheck/form.py`：跟上 10/19（紅字多一行說出原因）、10/20（講「3 下，收緊腹部」）、10/24（腳跟離地的新量法）。
  - `bal24/`：平衡與重心。`node make_fake.mjs <網站資料夾>` 做出站直 → 往前倒 15° → 正面的假 AI，也算出網站應該算的重心（`expected.json`）和重播用的 `stand.json`；`python3 check.py <網站資料夾>`：數據面板、畫面上的記號、重播分析（36 項）。`real.mjs 檔案 …`（`ROOT=<程式資料夾>`）：實測檔每一下最低時、站直時的重心和前後晃動；`com.mjs`、`com_ankle.mjs`、`ratio.mjs`：比較「腳跟 0%～腳尖 100%」和「以腳踝、小腿長為準」兩種寫法。
- 10/25：
  - `goal25/`：四個動作自訂目標。`node make_fake.mjs <網站資料夾>` 做出棒式一直線撐 22 秒、深蹲 4 下的假 AI；`python3 check.py <網站資料夾> [old]`：首頁「目標」卡片（自己填、填錯、重新整理還在、320 寬、axe-core）、棒式報時和倒數（完整語音、只講錯誤、不講話的嗶聲、沒設目標不報）、深蹲「3 下，完成目標」、總結（35 項；加 `old` 在舊程式上跑，預期失敗，「沒設目標和以前一樣」那項舊程式也要通過）。`hud_shot.py <網站資料夾>`：直拿 320～390 寬、橫拿時次數框上面的「目標」字樣不會和左右兩組重疊（拍照看）。
  - `r10/reclimit.py`：改成等錄到第一格再往後跳時間（錄製的開始時間是第一格畫面進來時才記，以前偶爾第一格還沒進來就跳，「剩 30 秒」不會出現）。`r10/race_proof.py`：刻意讓按錄製和跳時間同時發生，重現這個失敗。
  - `csv25/check.py <網站資料夾> <port> [old]`：運動紀錄下載 CSV（首頁放 13 次紀錄＋1 筆壞掉的：按鈕寫全部幾次、檔名、BOM、表頭、13 列、深蹲和棒式那一列、axe-core、320／390 寬；加 `old` 確認舊程式沒有這個按鈕）。
- 10/26：
  - `main26/check.py <網站資料夾> <port> <實測檔資料夾>`：實測報表頁（真的瀏覽器）讀 10/20 的實測檔，整體的數字和寫進使用說明的一樣；使用說明「第一次實測的結果」320～1280 寬、axe-core（實測檔是組員的錄影，不放進這個分支）。
  - `prop26/`：示範模式（用一段影片代替鏡頭）。先 `bash prep.sh <網站資料夾>`（用 goal25 做假的 AI、改成一直重複，再用 `make_videos.py` 在 Chromium 裡錄 WebM 測試影片：容器沒有 ffmpeg、Chromium 也不能播 mp4），再 `python3 check.py <網站資料夾> <port> [old]`（25 項：計次、講話、播完的總結不存、「選擇動作」照常、壞檔案、實測模式、真的 AI、版面、axe-core；加 `old` 確認舊程式沒有這個按鈕）。
  - `reg2.sh`：「手機轉向」（`r3/rotate.py`）的完整輸出另外存在 `r3/rotate_last.txt`（10/21 失敗過一次、當時只看得到「1 FAILED」）；畫面上的輸出不變，比對方法不變。
  - 套件檢查（不用工具）：在暫存資料夾寫只有那幾個套件的 `package.json`，`npm install --package-lock-only --ignore-scripts` 再 `npm audit`；方法寫在專案的 `docs/architecture.md` 第八節。
- 10/27：
  - `main27/check.py <網站資料夾> <port> [old]`：運動總結的「每一下」圖表（19 項，假的 AI 用 `../goal25` 的 `fake_*.mjs`，先跑那裡的 `make_fake.mjs`）：深蹲 4 下關鏡頭後兩張圖（深度、秒數）、顏色、說明、最深的數字和總結的「最低」一樣、平均線和「每下約幾秒」一樣、數字畫在圖裡、表格；棒式目標 18 秒的目標線；320、390 寬不超出、表格在自己的框裡；axe-core；加 `old` 確認舊程式沒有圖。
  - `main27/mixed.py <網站資料夾> <port>`：只拍照（不判斷）：三種深度顏色混在一起、30 下（橫軸編號隔開）、壞掉的那一下（編號空一格）。
  - `maint27/check.py <網站資料夾> <port> [old]`：重播分析用同一套圖（20 項）：首頁鏡頭畫面錄 4 下假的深蹲（不倒數）→ 下載 JSON（存成 `maint27/rec_squat.json`，是假的 AI，不是真人）→ 重播分析讀同一個檔，每一下的角度、深度、秒數、平均線和首頁一樣；和重播頁原本的表格對得起來；換動作收起來、換回來又出現；合成示範資料選了深蹲才有圖；320、390 寬；axe-core；加 `old` 確認舊程式的重播頁沒有圖。
- 10/28：
  - `fat28/real.mjs`、`real2.mjs`：`ROOT=<網站資料夾> node real.mjs <實測檔資料夾>`。10/20 的實測檔每一組前三分之一和後三分之一差多少（訂疲勞分析的門檻用），`real2.mjs` 用網站的疲勞分析跑每一組、運動中會不會提醒（實測檔是組員的錄影，不放進這個分支）。
  - `main28/`：疲勞分析。先 `node make_fake.mjs <網站資料夾>`（tired：6 下正常＋6 下又淺又慢；steady：8 下一樣），再 `python3 check.py <網站資料夾> <port> [old]`（18 項：總結、數字和每一下的表格對得起來、第 8 下提醒一次、只講錯誤、差不多、4 下、棒式、320／390、axe-core；4 下深蹲、棒式用 `../goal25` 的假 AI）。
  - `maint28/`：極端情況。先 `node make_fake.mjs <網站資料夾>`（9 下、站著休息 35 秒、再 9 下），再 `python3 check.py <網站資料夾> <port> [old]`（25 項：假資料直接畫 100 下、停住 40 秒、1 下、中途休息；假的 AI 休息後再提醒；`old` 是 4 項：320 寬會疊、縱軸到 40 秒）。
  - `prop28/check.py <網站資料夾> <port>`：研究成果頁（21 項：三種寬度、大數字、表格不捲動、axe-core、錨點和連結、數字和使用說明一樣）。
- 10/29：
  - `flu29/`：訂動作流暢度的門檻用。`ROOT=<網站資料夾> node dump.mjs <實測檔資料夾>` 把每一下的角度曲線存成 `reps.json`，`node an.mjs [速度比例 0.2] [毫秒 150] [邊緣 0.15]` 用不同條件算每一組卡住幾下，`ROOT=<網站資料夾> node real.mjs <實測檔資料夾>` 用網站的 fluency.js 跑每一組（實測檔和 `reps.json` 是組員的錄影算出來的，不放進這個分支）；`curvecheck.mjs` 看單元測試的假曲線長怎樣。
  - `main29/`：動作流暢度。先 `node make_fake.mjs <網站資料夾>`（6 下，第 3 下下去到一半停 0.5 秒），再 `python3 check.py <網站資料夾> <port> [old]`（13 項：只有第 3 下的提示寫「卡了一下」、不講話、總結、平均和「每下約幾秒」一樣、表格的「順不順」、深度圖的說明、4 下、棒式、320 寬、axe-core；4 下深蹲、棒式用 `../goal25` 的假 AI；`old` 確認舊程式沒有）。
  - `maint29/`：運動 30 分鐘。先 `node make_fake.mjs <網站資料夾>`（一直重複做深蹲，每 10 下約 32.7 秒），再 `python3 soak30.py <網站資料夾> <port> [分鐘，預設 30]`（每 2 分鐘量記憶體、畫面元素、事件監聽、排著的長計時器、每秒幾格、主畫面忙碌、次數；第 10～12 分鐘打開數據面板；最後關鏡頭看總結；不到 10 分鐘時每 30 秒量一次）。`heapsample.py <網站資料夾> <port> [分鐘]`：記憶體取樣，前半和全部各拍一次，列出留最多、變多的程式位置（`draw :8` 是測試工具的假鏡頭，不是網站的）。`repsize.mjs`（`node --expose-gc`）：一下的資料大約多大。
  - `prop29/`：加到手機主畫面。`make_icons.py <輸出資料夾>` 用 Chromium 畫四張圖示；`check.py <網站資料夾> <port> [old]`（29 項：六頁的 manifest、圖示大小、捷徑、Chrome 說可以安裝、按鈕什麼時候出現、從主畫面打開不出現、使用說明、320 寬、axe-core；`old` 2 項）。Playwright 一般的視窗算無痕，Chrome 不讓無痕安裝，「可以安裝」要用 `launch_persistent_context`；這版 Chromium 的 CDP 不能假裝 display-mode，改在網頁裡假裝。
- 10/30：
  - `main30/`：動作穩定度。先 `node make_fake.mjs <網站資料夾>`（fake_sway：深蹲 6 下、後 3 下前後晃 ±13 像素；fake_plank：棒式 26 秒、後半髖部上下晃；fake_pushup：伏地挺身 3 下），再 `python3 check.py <網站資料夾> <port> [old]`（17 項：表格「晃動」、那一句的平均／最多的一下／前段後段、棒式、伏地挺身沒有、320 寬、axe-core；`old` 也印出舊程式 320 寬的表格寬度和 axe-core）。`proto.mjs`、`ref.mjs`、`ref2.mjs`、`ref3.mjs <網站資料夾>`：示範動畫加雜訊、前後晃、底部停幾格時算出來的數字（訂說明裡的參考數字用）。
  - `maint30/`：無障礙。`aria.py <網站資料夾> <port> [plank]`：運動完的總結，印出螢幕閱讀器拿到的（Playwright 的 aria snapshot，用 `../main30` 的假 AI）；`pixdiff.py <舊的網站資料夾> <新的網站資料夾>`：重播分析、實測報表、量角器三頁 320／1280 寬整頁拍照，PNG 一樣才算一樣（這個環境 python3 的 PIL 壞的，用檔案的 md5 比）。
  - `main28/check.py`：疲勞分析每一項的名稱後面多了「：」（10/30），比名稱時去掉；`main29/check.py`：表格「順不順」後面多一欄「晃動」（10/30）。
- 10/31：
  - Firebase AI 的程式（AI 教練用）：`fb/node_modules/firebase/` 裡的 `firebase-app.js`、`firebase-ai.js` 就是 gstatic 上的同一份（12.19.0）；這個環境連不到 gstatic、firebase.google.com，測試時用 route 換成這兩個檔。
  - `main31/real_sdk.py <網站資料夾> <port>`：AI 教練（主線），真的 Firebase AI 程式、假的 Gemini 伺服器（firebasevertexai.googleapis.com），3 種：正常、`disabled_403.json`（10/31 真的打一次拿到的 403，AI Logic 還沒開）、模型 404；12 項。用 `../main30` 的 fake_sway（先跑那裡的 `make_fake.mjs`）。`shot.mjs`：總結的教練建議拍照（320、1280 寬）。
  - `maint31/real_sdk.py <網站資料夾> <port> [情況…]`：AI 教練的失敗情況（取代上面那個），12 種：ok（列點的回答整理好）、disabled、busy429、model404、safety、promptblock、promptblock2（擋下但沒附 safetyRatings，firebase-ai.js 自己出錯）、english、number、abort、hang（等 10 秒）、offline（按結束前 `set_offline`）。Playwright Python 的 route 處理函式只能有一個參數（兩個的話第二個會被塞 request）。
  - `maint31/flaky_sway.mjs <網站資料夾> <慢幾倍…>`：CPU 調慢（CDP `Emulation.setCPUThrottlingRate`）時，瀏覽器算的晃動、node 每秒 30 格算的、照瀏覽器真的拿到的格子（`usedFrames`）重算的差多少（10/31 CI 失敗的原因：慢 8 倍時每秒 30 格的差到 0.8，照拿到的格子 0.0）。`fps_sway.mjs`：只用 node，假裝每秒 10～30 格、時間抖動時算出來的晃動。
  - `maint31/chain.sh`：合併前在主要資料夾依序跑（專案的瀏覽器測試 → real_sdk → main28／29／30 → voice20 → 完整回歸），一次一個。
  - `main28/check.py`、`main29/check.py`：關鏡頭後的教練建議會說「放慢」「卡了一下」，檢查「運動中沒講」時不算「教練建議：」開頭的那句。
  - 安全規則測試要先開模擬器，再帶 `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run test:rules`（沒帶會全部跳過）。
- 真的 Firebase 專案：專案裡的 `npm run test:live`（在這個環境要加 `NODE_USE_ENV_PROXY=1`）；瀏覽器版 `fbreal/browser_real.py`（見上面的憑證）。`fbreal/emu_util.py`：模擬器換規則、清空、看剩下的資料。
- 用法：`cd $S/<資料夾> && python3 <腳本>.py /home/user/claude-workspace`
