# YOLO 模型檔怎麼來的（11/21）：把 Ultralytics 官方的 YOLO26 姿勢模型（.pt）轉成網站用的 LiteRT 格式（.tflite），放進 models/yolo/
# 網站上的模型檔就是這支程式轉出來的；換模型、重新轉檔照這裡做，轉完把 sha256 更新到 sw.js 的 AI_SHA256、models/yolo/README.md
#
# 準備（Linux x86 或 macOS；Ultralytics 的 LiteRT 轉檔只支援這兩種）：
#   python3 -m venv venv && venv/bin/pip install ultralytics==8.4.215 litert-torch==0.10.0
#   （11/21 用的版本：torch 2.14.1、ultralytics 8.4.215、litert-torch 0.10.0）
# 用法（在專案資料夾）：
#   venv/bin/python tools/export-yolo.py            兩個都轉
#   venv/bin/python tools/export-yolo.py yolo-n     只轉一個
#
# 為什麼這樣轉：
#   imgsz=320：11/21 實驗 640 抓的點和 320 幾乎一樣，慢 3～4 倍
#   nms=False：YOLO26 本來就是一個人只給一個框（不用再整理重複的框），輸出 [1, 300, 57]，網站自己挑分數最高的
#   n 用 fp32：權重壓成 8 位元（w8a32）的版本，伏地挺身最低點的手肘角度多偏約 10°
#   s 用 w8a32（權重 8 位元、運算 fp32）：fp32 要 42 MB 太大；Ultralytics 的 LiteRT 轉檔沒有 fp16 可以選
# 授權：YOLO26 的模型是 AGPL-3.0（Ultralytics），轉出來的檔案也是；models/yolo/LICENSE、README.md
import hashlib
import shutil
import sys
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'models' / 'yolo'
JOBS = {
    # 網站的代號：（官方權重檔名、轉檔的量化方式、放進網站的檔名）；權重檔第一次用時 Ultralytics 會自己從 GitHub 下載
    'yolo-n': ('yolo26n-pose.pt', None, 'yolo26n-pose-320.tflite'),
    'yolo-s': ('yolo26s-pose.pt', 'w8a32', 'yolo26s-pose-320-w8a32.tflite'),
}


def export(key):
    weights, quantize, name = JOBS[key]
    kw = dict(format='litert', imgsz=320, nms=False)
    if quantize:
        kw['quantize'] = quantize
    out = Path(YOLO(weights).export(**kw))
    # 有的版本輸出一個資料夾，裡面才是 .tflite
    if out.is_dir():
        out = sorted(out.glob('*.tflite'))[0]
    dst = OUT / name
    shutil.move(str(out), dst)
    sha = hashlib.sha256(dst.read_bytes()).hexdigest()
    print(f'{key}: {dst.relative_to(ROOT)}  {dst.stat().st_size} bytes  sha256 {sha}')


if __name__ == '__main__':
    keys = sys.argv[1:] or list(JOBS)
    for k in keys:
        if k not in JOBS:
            sys.exit('不認得的模型：' + k + '（可以用：' + '、'.join(JOBS) + '）')
    OUT.mkdir(parents=True, exist_ok=True)
    for k in keys:
        export(k)
