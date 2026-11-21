# 第 6 階段實測（暫存區，不放進 repo）：網站複本加一個「自己訓練的 21 點 YOLO」（yolo-f），模型檔是用示範影片訓練 1 輪的
# 用法：python3 make_site.py <wt3 網站資料夾> <訓練出來的 .tflite> <輸出的網站複本資料夾>
import shutil, sys
from pathlib import Path
src, tfl, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
if out.exists():
    shutil.rmtree(out)
shutil.copytree(src, out, ignore=shutil.ignore_patterns('.git', 'node_modules', 'datasets', 'runs'))
shutil.copy(tfl, out / 'models' / 'yolo' / 'yolo26n-feet-320.tflite')
size = tfl.stat().st_size

def rep(path, a, b):
    p = out / path
    s = p.read_text(encoding='utf-8')
    assert s.count(a) == 1, (path, a)
    p.write_text(s.replace(a, b), encoding='utf-8')

rep('js/ai/models.js', "file: 'yolo26s-pose', kpts: 17 }",
    "file: 'yolo26s-pose', kpts: 17 },\n    'yolo-f': { family: 'yolo', label: 'YOLO26n 有腳', short: 'YOLO26n 有腳', feet: true, hands: false, world: false, file: 'yolo26n-feet', kpts: 21 }")
rep('js/config.js', "export const YOLO_FILES = {",
    "export const YOLO_FILES = {\n    'yolo-f': { path: 'models/yolo/yolo26n-feet-320.tflite', size: %d }," % size)
print('ok', out, size)
