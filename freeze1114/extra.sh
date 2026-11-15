#!/bin/bash
# 11/15 凍結檢查剩下的三項（合併後的 main）：AI 教練用真的 Firebase AI 程式、離線功能、雲端同步（本機模擬器）；一次一個
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/freeze1114
echo "開始 $(TZ=Asia/Taipei date '+%m/%d %H:%M')，$(cd $W && git rev-parse --short HEAD)"
cd $S/audit1110/tools && timeout 600 node ai_sdk_check.mjs $S/fb/node_modules/firebase > $M/c5_aisdk.txt 2>&1
echo "ai_sdk: $(grep -cE '^PASS' $M/c5_aisdk.txt) PASS, $(grep -cE '^FAIL' $M/c5_aisdk.txt) FAIL, $(tail -1 $M/c5_aisdk.txt | cut -c1-80)"
cd $S/sw && timeout 900 python3 sw_test.py $W > $M/c6_sw.txt 2>&1
echo "sw: $(grep -cE '^PASS' $M/c6_sw.txt) PASS, $(grep -cE '^FAIL' $M/c6_sw.txt) FAIL, $(tail -1 $M/c6_sw.txt | cut -c1-80)"
cd $W && (npx --yes firebase-tools@15.34.1 emulators:start --only auth,firestore --project demo-sport > $M/emu.log 2>&1 &)
for i in $(seq 1 90); do (echo > /dev/tcp/127.0.0.1/8080) 2>/dev/null && (echo > /dev/tcp/127.0.0.1/9099) 2>/dev/null && break; sleep 2; done
cd $S/fbcheck && timeout 1200 python3 cloud.py $W > $M/c7_cloud.txt 2>&1
echo "cloud: $(grep -cE '^PASS' $M/c7_cloud.txt) PASS, $(grep -cE '^FAIL' $M/c7_cloud.txt) FAIL, $(tail -1 $M/c7_cloud.txt | cut -c1-80)"
pkill -f "emulators:start" 2>/dev/null; sleep 3; pkill -f "cloud-firestore-emulator" 2>/dev/null; pkill -f "firebase-tools" 2>/dev/null
echo "結束 $(TZ=Asia/Taipei date '+%m/%d %H:%M')；工作目錄：$(cd $W && git status --short | wc -l) 個改動"
echo EXTRADONE
