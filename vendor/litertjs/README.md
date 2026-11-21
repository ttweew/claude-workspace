# LiteRT.js（Google，Apache-2.0）

網站用它在瀏覽器裡執行 YOLO 模型（`js/ai/yolo-worker.js`）。

| 檔案 | 來源 | sha256 |
|---|---|---|
| `litert-core.js` | npm `@litertjs/core@2.6.0` 的 `dist/index.js` | `a296c0a401fe958cb4ca0e27e58f8315ab091a72fac0ab9c87b1c040e55364b5` |
| `wasm-utils.js` | npm `@litertjs/wasm-utils@2.6.0` 的 `dist/index.js` | `6d936cd47aaf4122db5cbe2793175508fe973f5a98c13e64f076987563e9f386` |

- 原始碼：https://github.com/google-ai-edge/LiteRT （`litert/js/packages/core`）。授權：Apache License 2.0（全文：同資料夾的 [LICENSE](LICENSE)）。
- **改過的地方**（Apache-2.0 要求寫出來）：
  - `litert-core.js`：只有一行，`import ... from "@litertjs/wasm-utils"` 改成 `from "./wasm-utils.js"`（瀏覽器不認得 npm 套件的名字）。
  - 兩個檔案都拿掉最後一行的 `//# sourceMappingURL=`（對照用的 `.map` 檔沒有放進來），開頭加了說明的註解。其他內容原封不動。
- 為什麼放在網站裡：這兩個檔案只有約 100 KB；AI 引擎（`litert_wasm_internal.wasm`，約 11 MB）照樣從 jsDelivr、unpkg 下載（`js/config.js` 的 `LITERT_URLS`，`sw.js` 核對指紋）。
- 換版本：換這兩個檔案（照上面改那一行）、`js/config.js` 的 `LITERT_URLS` 版本號、`js/ai/yolo.js` 的 `RELAXED_SIMD_CHECK`（新版的 `WASM_RELAXED_SIMD_CHECK`）、`sw.js` 的網址和 `AI_SHA256`。
