#!/bin/bash
# 10/31 保養：主要資料夾上依序跑（一次一個，重的測試不同時跑）
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $S/maint31/c1_browser.txt 2>&1
echo "browser: $(grep -E '^# (pass|fail)' $S/maint31/c1_browser.txt | tr '\n' ' ')"
cd $S/maint31 && python3 real_sdk.py $W 8941 > $S/maint31/c2_real_sdk.txt 2>&1
echo "real_sdk: $(grep -cE '^PASS' $S/maint31/c2_real_sdk.txt) PASS, $(grep -E '^(通過|SOME)' $S/maint31/c2_real_sdk.txt)"
for d in main28 main29 main30; do
  cd $S/$d && python3 check.py $W 89${d: -2} > $S/maint31/c3_$d.txt 2>&1
  echo "$d: $(grep -cE '^PASS' $S/maint31/c3_$d.txt) PASS, $(grep -cE '^FAIL' $S/maint31/c3_$d.txt) FAIL, $(tail -1 $S/maint31/c3_$d.txt | cut -c1-80)"
done
cd $S/voice20 && python3 voice_check.py > $S/maint31/c4_voice.txt 2>&1
echo "voice20: $(grep -cE '^PASS' $S/maint31/c4_voice.txt) PASS, $(grep -cE '^FAIL' $S/maint31/c4_voice.txt) FAIL, $(tail -1 $S/maint31/c4_voice.txt | cut -c1-80)"
cd $S && bash reg2.sh > $S/reg_m31.txt 2>&1
echo "regression done"
