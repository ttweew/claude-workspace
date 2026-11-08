#!/bin/bash
# 11/7 即時 AI 判斷：主要資料夾上依序跑（一次一個，重的測試不同時跑）
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/main1107
cd $W && npm test > $M/f0_unit.txt 2>&1
echo "unit: $(grep -E '^# (tests|pass|fail)' $M/f0_unit.txt | tr '\n' ' ')"
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/f1_browser.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/f1_browser.txt | tr '\n' ' ')"
# 安全規則：emulators:exec（模擬器開好才跑、跑完關掉；FIRESTORE_EMULATOR_HOST 由它設定，不然測試會全部跳過）
cd $W && npx firebase-tools@15.34.1 emulators:exec --only auth,firestore --project demo-sport "npm run test:rules" > $M/f2_rules.txt 2>&1
echo "rules: $(grep -E '^# (tests|pass|fail|skipped)' $M/f2_rules.txt | tr '\n' ' ')"
# 雲端同步檢查（暫存區）：模擬器開著跑，跑完關掉；模擬器開著時不改 firestore.rules
cd $W && (npx firebase-tools@15.34.1 emulators:start --only auth,firestore --project demo-sport > $M/emu.log 2>&1 &)
for i in $(seq 1 90); do grep -q "All emulators ready" $M/emu.log && break; sleep 2; done
echo "emulator ready: $(grep -c 'All emulators ready' $M/emu.log)"
cd $S/fbcheck && python3 cloud.py $W > $M/f3_fbcloud.txt 2>&1
echo "fbcloud: $(grep -c '^PASS' $M/f3_fbcloud.txt) PASS, $(grep -c '^FAIL' $M/f3_fbcloud.txt) FAIL, $(tail -1 $M/f3_fbcloud.txt | cut -c1-60)"
pkill -f "[f]irebase emulators:start"; pkill -f "[c]loud-firestore-emulator"; sleep 3
cd $S/report21 && python3 check.py $W 8921 > $M/f5_report21.txt 2>&1
echo "report21: $(grep -cE '^PASS' $M/f5_report21.txt) PASS, $(grep -cE '^FAIL' $M/f5_report21.txt) FAIL, $(tail -1 $M/f5_report21.txt | cut -c1-80)"
cd $S/maint27 && python3 check.py $W 8927 > $M/f6_maint27.txt 2>&1
echo "maint27: $(grep -cE '^PASS' $M/f6_maint27.txt) PASS, $(grep -cE '^FAIL' $M/f6_maint27.txt) FAIL, $(tail -1 $M/f6_maint27.txt | cut -c1-80)"
cd $S && bash reg2.sh > $S/reg_f1107.txt 2>&1
echo "regression done"
