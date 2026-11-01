#!/bin/bash
# 11/1 主線：主要資料夾上依序跑（一次一個，重的測試不同時跑）
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/main1101
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/c1_browser.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/c1_browser.txt | tr '\n' ' ')"
for d in maint27 main28 main29 main30; do
  cd $S/$d && python3 check.py $W 89${d: -2} > $M/c2_$d.txt 2>&1
  echo "$d: $(grep -cE '^PASS' $M/c2_$d.txt) PASS, $(grep -cE '^FAIL' $M/c2_$d.txt) FAIL, $(tail -1 $M/c2_$d.txt | cut -c1-80)"
done
cd $W && (npx firebase-tools@15.34.1 emulators:start --only auth,firestore --project demo-sport > $M/emu2.log 2>&1 &)
for i in $(seq 1 60); do grep -q "All emulators ready" $M/emu2.log && break; sleep 2; done
cd $S/fbcheck && python3 cloud.py $W > $M/c3_fbcloud.txt 2>&1
echo "fbcheck/cloud: $(grep -cE '^PASS' $M/c3_fbcloud.txt) PASS, $(grep -cE '^FAIL' $M/c3_fbcloud.txt) FAIL, $(tail -1 $M/c3_fbcloud.txt | cut -c1-80)"
cd $M && python3 cloud_growth.py $W > $M/c3_growth.txt 2>&1
echo "cloud_growth: $(grep -cE '^PASS' $M/c3_growth.txt) PASS, $(tail -1 $M/c3_growth.txt | cut -c1-60)"
pkill -f "[f]irebase emulators:start"; pkill -f "[c]loud-firestore-emulator"; sleep 3
cd $S && bash reg2.sh > $S/reg_g1101.txt 2>&1
echo "regression done"
