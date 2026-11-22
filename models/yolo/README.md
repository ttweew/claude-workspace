# YOLO 姿勢模型（11/21，實驗）

網站「進階設定 → AI 模型」選 YOLO26n、YOLO26s 時用的模型檔。

| 檔案 | 網站的代號 | 大小 | sha256 |
|---|---|---|---|
| `yolo26n-pose-320.tflite` | `yolo-n` | 11,968,338 bytes | `dfa42d50081ca40b00e011dc00fdbc38660a0b73eb2cea94c4af1cf01af7f67e` |
| `yolo26s-pose-320-w8a32.tflite` | `yolo-s` | 10,884,185 bytes | `0e10ad8a58bd5301fa38d2ad45db94e538a53e067e01924db959edfab1ad8400` |

## 從哪裡來

- 原始模型：Ultralytics 的 **YOLO26n-pose**、**YOLO26s-pose**（`yolo26n-pose.pt`、`yolo26s-pose.pt`，Ultralytics 在 GitHub 公開的權重檔）。
  - 原始碼和權重：https://github.com/ultralytics/ultralytics 、https://github.com/ultralytics/assets/releases
- 轉檔：用 [`tools/export-yolo.py`](../../tools/export-yolo.py) 轉成 LiteRT 格式（`.tflite`），輸入 320×320，不做 NMS（輸出 `[1, 300, 57]`）。
  - n 用 fp32；s 的權重壓成 8 位元（w8a32，運算還是 fp32），檔案小 4 倍。
  - 11/21 用的版本：ultralytics 8.4.215、litert-torch 0.10.0、torch 2.14.1。
- 網站怎麼用：`js/ai/yolo.js`（下載、背景執行緒）、`js/ai/yolo-worker.js`（用 LiteRT.js 執行）、`js/ai/yolo-core.js`（前處理、讀輸出）、`js/ai/keypoints.js`（17 點換成網站的 33 點）。

## 授權：AGPL-3.0

這兩個檔案是 Ultralytics YOLO26 模型轉出來的，授權和原本一樣是 **GNU AGPL-3.0**（全文：同資料夾的 [LICENSE](LICENSE)）。

- AGPL-3.0 要求：用這個模型提供網路服務時，要讓使用的人拿得到原始碼。這個網站的原始碼全部公開在 https://github.com/ttweew/claude-workspace （網站「使用說明」的常見問題也有連結）。
- Ultralytics 的說法是：用了 YOLO 的整個專案都要用 AGPL-3.0 開放原始碼；不想開放要買他們的商業授權。
- **11/22 組員決定整個專案也用 AGPL-3.0**（根目錄的 [LICENSE](../../LICENSE)）。以後真的要拿掉 YOLO 的話：把 `js/ai/model-choice.js` 的 `MODEL_CHOICES` 拿掉 `'yolo-n'`、`'yolo-s'`，再刪掉這個資料夾，網站就回到只有 MediaPipe。

換模型檔時，`sw.js` 的 `AI_SHA256`、`js/config.js` 的 `YOLO_FILES`（檔名、大小）、這份說明的表要一起改。

## 自己訓練（有腳跟、腳尖的 YOLO）

官方的 YOLO26 只有 COCO 的 17 個點，沒有腳跟、腳尖。用 MediaPipe 幫組員的影片標點、再訓練 YOLO 多學 4 個點（21 點）的流程：[docs/yolo-training.md](../../docs/yolo-training.md)（`tools/yolo-dataset.py`、`tools/yolo-train.py`）。網站已經讀得懂 21 點的模型（`js/ai/keypoints.js`、`js/ai/yolo-core.js`）。從 YOLO26 訓練出來的模型一樣是 AGPL-3.0。
