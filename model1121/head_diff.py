# 第 6 階段除錯（暫存區）：官方 17 點的 YOLO26n-pose 和 21 點的同一個模型，哪些參數形狀不一樣
import sys
from ultralytics import YOLO
from ultralytics.nn.tasks import PoseModel
base = YOLO(sys.argv[1])
new = PoseModel(base.model.yaml, nc=1, data_kpt_shape=(21, 3), verbose=False)
a, b = base.model.state_dict(), new.state_dict()
diff = [(k, tuple(a[k].shape), tuple(b[k].shape)) for k in b if k in a and a[k].shape != b[k].shape]
missing = [k for k in b if k not in a]
print('total', len(b), 'same-shape', sum(1 for k in b if k in a and a[k].shape == b[k].shape), 'diff', len(diff), 'missing', len(missing))
for d in diff: print('DIFF', d)
for k in missing[:10]: print('MISSING', k, tuple(b[k].shape))
head = base.model.model[-1]
print(type(head).__name__, 'kpt_shape', head.kpt_shape, 'nk', getattr(head, 'nk', None))
print([n for n, _ in head.named_children()])
