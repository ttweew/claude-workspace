#!/bin/bash
# 11/7 晚上 AI 評分、AI 解釋、你這一下 vs 標準動作：主要資料夾上依序跑（一次一個，重的測試不同時跑）；沒改到雲端，不跑安全規則和雲端同步檢查
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/main1107n3
cd $W && npm test > $M/f0_unit.txt 2>&1
echo "unit: $(grep -E '^# (tests|pass|fail)' $M/f0_unit.txt | tr '\n' ' ')"
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/f1_browser.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/f1_browser.txt | tr '\n' ' ')"
cd $S/report21 && python3 check.py $W 8921 > $M/f5_report21.txt 2>&1
echo "report21: $(grep -cE '^PASS' $M/f5_report21.txt) PASS, $(grep -cE '^FAIL' $M/f5_report21.txt) FAIL, $(tail -1 $M/f5_report21.txt | cut -c1-80)"
cd $S/maint27 && python3 check.py $W 8927 > $M/f6_maint27.txt 2>&1
echo "maint27: $(grep -cE '^PASS' $M/f6_maint27.txt) PASS, $(grep -cE '^FAIL' $M/f6_maint27.txt) FAIL, $(tail -1 $M/f6_maint27.txt | cut -c1-80)"
cd $S && bash reg2.sh > $S/reg_n3_1107.txt 2>&1
echo "regression exit $?"
