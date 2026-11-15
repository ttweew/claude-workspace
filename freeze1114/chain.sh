#!/bin/bash
# 11/14 凍結日：凍結版（main）依序跑全部的測試（一次一個，重的不同時跑），最後照腳本跑一次現場示範
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/freeze1114
echo "開始 $(TZ=Asia/Taipei date '+%m/%d %H:%M')，main $(cd $W && git rev-parse --short HEAD)"
cd $W && npm test > $M/c0_unit.txt 2>&1
echo "unit: $(grep -E '^# (tests|pass|fail)' $M/c0_unit.txt | tr '\n' ' ')"
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/c1_browser.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/c1_browser.txt | tr '\n' ' ')"
cd $W && npx --yes firebase-tools@15.34.1 emulators:exec --only firestore --project demo-sport "npm run test:rules" > $M/c1b_rules.txt 2>&1
echo "rules: $(grep -E '^# (tests|pass|fail|skipped)' $M/c1b_rules.txt | tr '\n' ' ')"
cd $S/report21 && python3 check.py $W 8921 > $M/c2_report21.txt 2>&1
echo "report21: $(grep -cE '^PASS' $M/c2_report21.txt) PASS, $(grep -cE '^FAIL' $M/c2_report21.txt) FAIL, $(tail -1 $M/c2_report21.txt | cut -c1-80)"
cd $S/maint27 && python3 check.py $W 8927 > $M/c3_maint27.txt 2>&1
echo "maint27: $(grep -cE '^PASS' $M/c3_maint27.txt) PASS, $(grep -cE '^FAIL' $M/c3_maint27.txt) FAIL, $(tail -1 $M/c3_maint27.txt | cut -c1-80)"
cd $S && bash reg2.sh > $S/reg_1114.txt 2>&1
echo "regression exit $?"
sum(){ grep -a -E "ALL PASS|ALLOK|ALL OK|SOME|^FAIL|通過 \|" "$1" | cut -c1-60; }
if diff <(sum $S/reg_r22.txt) <(sum $S/reg_1114.txt) > /dev/null; then echo "摘要行：一樣"; else echo "摘要行：不一樣"; diff <(sum $S/reg_r22.txt) <(sum $S/reg_1114.txt) | head -20; fi
echo "PASS：$(grep -c '^PASS' $S/reg_1114.txt)"
echo "md5：$(awk '/^5,6c5,6/,/擋鬼點評估差異如上/' $S/reg_1114.txt | md5sum | cut -c1-32)"
# 現場示範的腳本（最後 2 下故意前傾；第二段深蹲換伏地挺身）
cd $S/maint1110 && PATTERNS=00011 timeout 900 node demo_dryrun.mjs > $M/c4_dryrun.txt 2>&1
echo "dryrun exit $?，$(grep -c '程式錯誤：\[\]' $M/c4_dryrun.txt) 段沒有程式錯誤"
# AI 教練：真的 Firebase AI 程式＋假的 Google 伺服器
cd $S/audit1110/tools && timeout 600 node ai_sdk_check.mjs $S/fb/node_modules/firebase > $M/c5_aisdk.txt 2>&1
echo "ai_sdk: $(grep -cE '^PASS' $M/c5_aisdk.txt) PASS, $(grep -cE '^FAIL' $M/c5_aisdk.txt) FAIL, $(tail -1 $M/c5_aisdk.txt | cut -c1-80)"
# 離線功能（Service Worker 完整流程）
cd $S/sw && timeout 900 python3 sw_test.py $W > $M/c6_sw.txt 2>&1
echo "sw: $(grep -cE '^PASS' $M/c6_sw.txt) PASS, $(grep -cE '^FAIL' $M/c6_sw.txt) FAIL, $(tail -1 $M/c6_sw.txt | cut -c1-80)"
# 雲端同步：本機模擬器（開著的時候不改 firestore.rules 檔）
cd $W && (npx --yes firebase-tools@15.34.1 emulators:start --only auth,firestore --project demo-sport > $M/emu.log 2>&1 &)
for i in $(seq 1 90); do (echo > /dev/tcp/127.0.0.1/8080) 2>/dev/null && (echo > /dev/tcp/127.0.0.1/9099) 2>/dev/null && break; sleep 2; done
cd $S/fbcheck && timeout 1200 python3 cloud.py $W > $M/c7_cloud.txt 2>&1
echo "cloud: $(grep -cE '^PASS' $M/c7_cloud.txt) PASS, $(grep -cE '^FAIL' $M/c7_cloud.txt) FAIL, $(tail -1 $M/c7_cloud.txt | cut -c1-80)"
pkill -f "emulators:start" 2>/dev/null; sleep 3; pkill -f "cloud-firestore-emulator" 2>/dev/null; pkill -f "firebase-tools" 2>/dev/null
echo "結束 $(TZ=Asia/Taipei date '+%m/%d %H:%M')；工作目錄乾淨：$(cd $W && git status --short | wc -l) 個改動"
echo CHAINDONE
