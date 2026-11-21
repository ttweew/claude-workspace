# 自己訓練 YOLO（11/21，讓使用者自己選模型的第 6 步）：用 tools/yolo-dataset.py 做的資料（21 個點，有腳跟、腳尖）微調官方的 YOLO26n-pose，
# 訓練完轉成網站用的 LiteRT 檔（和 tools/export-yolo.py 一樣的設定：320、不做 NMS）
# 從官方模型開始（不是從零開始）：官方已經學好身體和 17 個點，只要再學腳跟、腳尖 4 個點
#   為什麼要自己搬參數（transfer）：點數從 17 改成 21，模型找點的那一段（最後的 cv4…）整段變寬，Ultralytics 會把這一段整段重來，
#   連原本 17 個點學好的也丟掉。11/21 用示範影片試：沒有搬的話訓練 30 輪，膝蓋以下的點全擠到上半身。
#   所以先把官方那 17 個點的參數搬進新模型的同一個位置，一開始 17 個點和官方一模一樣；
#   新的腳跟、腳尖一開始放在腳踝（START_FROM），只要學差一點點的位置（從隨機開始的話會落在人的中間，試過 30 輪還在上半身）
#
# 用法（在專案資料夾；和 tools/export-yolo.py 同一個 venv）：
#   venv/bin/python tools/yolo-train.py datasets/feet/data.yaml [--epochs 50] [--model yolo26n-pose.pt] [--device cpu]
#   有 NVIDIA 顯示卡：--device 0（快很多）；只有 CPU：先 --epochs 1 試流程（11/21 這台 4 核心的開發機：96 張圖一輪約 15 秒）
# 輸出：runs/pose/feet/weights/best.pt（訓練結果）和同一個資料夾的 .tflite（放進網站：models/yolo/，見 models/yolo/README.md）
# 放進網站：js/ai/models.js 加一筆（feet: true、kpts: 21），js/config.js 的 YOLO_FILES、sw.js 的 AI_SHA256 各加一行，
#   首頁的選單（docs/yolo-training.md 第 6 步的第 4 點）
import argparse
import copy
import hashlib
from pathlib import Path

import torch
import yaml
from ultralytics import YOLO
from ultralytics.nn.tasks import PoseModel


# 新的點一開始照抄哪一個舊的點（21 點的順序見 tools/yolo-dataset.py 的 NAMES）：
# 17 左腳跟、19 左腳尖 → 15 左腳踝；18 右腳跟、20 右腳尖 → 16 右腳踝（腳跟、腳尖就在腳踝旁邊）
START_FROM = {17: 15, 18: 16, 19: 15, 20: 16}


def widen(old, new):
    """一個參數：舊的（17 點）放進新的（21 點）最前面同樣大小的地方；多出來的地方保持隨機（給新的點學）。
    點的輸出是每個點「x、y、可信度」三個一組排好的（Ultralytics 的 Pose26.kpts_decode），所以前 51 個就是原本的 17 點。
    新加的通道接到舊通道的權重設成 0：一開始舊的 17 個點算出來和官方一模一樣"""
    new[tuple(slice(0, n) for n in old.shape)] = old
    if new.dim() >= 2 and new.shape[1] > old.shape[1]:
        new[:old.shape[0], old.shape[1]:] = 0


def transfer(base, kpt_shape, nc):
    """官方的 17 點模型 → kpt_shape 點的模型：形狀一樣的參數直接搬，找點那一段變寬的參數用 widen 搬"""
    new = PoseModel(copy.deepcopy(base.model.yaml), nc=nc, data_kpt_shape=kpt_shape, verbose=False)
    old = base.model.state_dict()
    same = grown = 0
    with torch.no_grad():
        for name, tensor in new.state_dict().items():   # state_dict 的每一個和模型共用同一塊記憶體：改它就是改模型
            src = old.get(name)
            if src is None:
                continue
            if src.shape == tensor.shape:
                tensor.copy_(src)
                same += 1
            elif src.dim() == tensor.dim() and all(a <= b for a, b in zip(src.shape, tensor.shape)):
                widen(src, tensor)
                grown += 1
                # 最後一層（輸出每個點的 x、y、可信度；訓練用的 sigma 是每個點 2 個）：新的點照抄 START_FROM 的那一個舊的點
                per = kpt_shape[1] if 'cv4_kpts.' in name else 2 if 'cv4_sigma.' in name else 0
                for j, k in START_FROM.items() if per else ():
                    if j < kpt_shape[0] and k < src.shape[0] // per:
                        tensor[j * per:(j + 1) * per] = tensor[k * per:(k + 1) * per]
    print(f'官方模型的參數：{same} 個直接搬、{grown} 個搬進變寬的地方（找點的那一段）')
    return new


def main():
    ap = argparse.ArgumentParser(description='用 21 點的資料微調 YOLO26-pose，再轉成網站用的 LiteRT 檔')
    ap.add_argument('data', help='tools/yolo-dataset.py 產生的 data.yaml')
    ap.add_argument('--model', default='yolo26n-pose.pt', help='從哪個官方模型開始（第一次用會自己下載）')
    ap.add_argument('--epochs', type=int, default=50)
    ap.add_argument('--imgsz', type=int, default=320, help='和網站一樣用 320（js/ai/yolo-core.js 的 INPUT_SIZE）')
    ap.add_argument('--batch', type=int, default=16)
    ap.add_argument('--device', default='cpu')
    ap.add_argument('--name', default='feet')
    args = ap.parse_args()
    data = yaml.safe_load(Path(args.data).read_text(encoding='utf-8'))
    kpt_shape = list(data['kpt_shape'])
    model = YOLO(args.model)
    if list(model.model.model[-1].kpt_shape) != kpt_shape:
        # 換成搬好參數的模型：Ultralytics 訓練時會照它建一個一樣的模型、整個搬過去（形狀都一樣，一個都不會丟）
        model.model = transfer(model, kpt_shape, len(data['names']))
    model.train(data=args.data, epochs=args.epochs, imgsz=args.imgsz, batch=args.batch, device=args.device,
                name=args.name, exist_ok=True, plots=False)
    best = Path(model.trainer.best)
    print('訓練結果：', best)
    metrics = YOLO(str(best)).val(data=args.data, imgsz=args.imgsz, device=args.device, plots=False)
    print('驗證資料的準確度（pose mAP50、mAP50-95）：', round(float(metrics.pose.map50), 4), round(float(metrics.pose.map), 4))
    out = Path(YOLO(str(best)).export(format='litert', imgsz=args.imgsz, nms=False))
    if out.is_dir():
        out = sorted(out.glob('*.tflite'))[0]
    sha = hashlib.sha256(out.read_bytes()).hexdigest()
    print(f'網站用的檔案：{out}  {out.stat().st_size} bytes  sha256 {sha}')


if __name__ == '__main__':
    main()
