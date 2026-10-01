# AI 智慧運動分析系統

用一支鏡頭，即時看見你的運動姿勢。

網站：https://ttweew.github.io/claude-workspace/

## 檔案結構

```
index.html          畫面結構（按鈕、影像、畫布）
css/style.css       所有外觀樣式
js/main.js          程式起點：取得畫面元素、串接鏡頭與 AI 偵測、處理按鈕
js/config.js        設定：MediaPipe 版本、模型檔網址、測試用網址參數
js/camera.js        鏡頭：開啟、關閉、判斷前後鏡頭、列出所有鏡頭
js/pose.js          AI 骨架偵測：下載 AI 檔案與計算進度、選擇 GPU 或 CPU、暖機、記錄各階段載入秒數
js/landmarks.js     33 個關鍵點的名稱對照表，以及算出新的點（例如髖部中心）
js/draw.js          在畫布上畫骨架
js/labels.js        關鍵點的編號標籤、點選查看某個點
js/gpu.js           查詢 GPU 名稱並整理成看得懂的名稱
js/fps.js           計算每秒偵測次數（FPS）
js/smooth.js        骨架點平滑（One Euro Filter），讓點不抖動、動作快時仍跟得上
js/screen.js        運動時讓螢幕保持亮著（不自動變暗、鎖定）
```

外部套件：MediaPipe Tasks Vision（Google 官方骨架偵測），由 `js/config.js` 指定的 CDN 網址載入，不需要安裝。

## 測試用網址參數

| 網址 | 作用 |
|---|---|
| `?debug` | 一打開就顯示主要關節的編號與名稱（也可以用畫面上的「顯示編號」按鈕切換；直接點畫面上任一點可查看該點）；點開運算標籤時另外顯示各階段載入秒數（下載／啟動／暖機） |
| `?cpu` | 強制使用 CPU，方便和 GPU 比較速度 |
| `?res=720`、`?res=1080` | 改用較高的鏡頭解析度（預設 640×480），方便比較速度差距 |

## 在自己電腦上測試

程式分成多個檔案後，瀏覽器的安全規則不允許直接雙擊 `index.html` 開啟，需要透過網址開啟：

- 使用 VS Code 的 Live Server 擴充功能，或
- 在專案資料夾執行 `python -m http.server`，再打開 http://localhost:8000

鏡頭功能只能在 `https://` 或 `localhost` 網址下使用。

## 更新網站

合併到 `main` 分支後，GitHub Actions 會自動發布到 GitHub Pages，約 1 分鐘生效。瀏覽器可能暫存舊檔案最多 10 分鐘，看到舊畫面時按 Ctrl + F5（手機可用無痕模式）。
