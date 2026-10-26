#!/bin/bash
# 示範模式的測試要先準備：假的 AI（goal25 的深蹲 4 下，改成一直重複）和測試影片
# 用法：bash prep.sh <網站資料夾>
set -e
cd "$(dirname "$0")"
(cd ../goal25 && node make_fake.mjs "$1")
cp ../goal25/fake_squat.mjs ../goal25/fake_squat.js .
sed -i 's|const f = FRAMES\[Math.floor((ts - t0) / (1000 / 30))\];|const f = FRAMES[Math.floor((ts - t0) / (1000 / 30)) % FRAMES.length];|' fake_squat.mjs fake_squat.js
grep -q "% FRAMES.length" fake_squat.mjs
python3 make_videos.py
