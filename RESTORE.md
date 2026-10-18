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

## 主要的測試

- `reg2.sh`：完整回歸測試，約 50 分鐘。結果和 `reg_r22.txt` 比對：
  - 摘要行要一樣：用 `grep -a -E "ALL PASS|ALLOK|ALL OK|SOME|^FAIL|通過 \|"` 取出比較。
  - 要有 39 個 PASS。
  - 擋鬼點評估那一段（`awk '/^5,6c5,6/,/擋鬼點評估差異如上/'`）的 md5 要是 `f2f5250e138b2bf6ea05b7e5d62db9da`。
- 各功能的測試：`prBcheck`～`prHcheck`、`pr9check`～`pr11check`、`audit2/`（惡意輸入、亂按、畫面停住、長時間運行）、`fbcheck/`（雲端同步，要先開 Firebase 模擬器）。
- 用法：`cd $S/<資料夾> && python3 <腳本>.py /home/user/claude-workspace`
