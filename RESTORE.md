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
- 真的 Firebase 專案：專案裡的 `npm run test:live`（在這個環境要加 `NODE_USE_ENV_PROXY=1`）；瀏覽器版 `fbreal/browser_real.py`（見上面的憑證）。`fbreal/emu_util.py`：模擬器換規則、清空、看剩下的資料。
- 用法：`cd $S/<資料夾> && python3 <腳本>.py /home/user/claude-workspace`
