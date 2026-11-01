#!/bin/bash
# 11/1 保養：主要資料夾上依序跑（一次一個）
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/main1101
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/m1c_browser.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/m1c_browser.txt | tr '\n' ' ')"
cd $S/maint27 && python3 check.py $W 8927 > $M/m2c_maint27.txt 2>&1
echo "maint27: $(grep -cE '^PASS' $M/m2c_maint27.txt) PASS, $(grep -cE '^FAIL' $M/m2c_maint27.txt) FAIL, $(tail -1 $M/m2c_maint27.txt | cut -c1-80)"
cd $S/main30 && python3 check.py $W 8930 > $M/m3c_main30.txt 2>&1
echo "main30: $(grep -cE '^PASS' $M/m3c_main30.txt) PASS, $(grep -cE '^FAIL' $M/m3c_main30.txt) FAIL, $(tail -1 $M/m3c_main30.txt | cut -c1-80)"
cd $S && bash reg2.sh > $S/reg_m1101c.txt 2>&1
echo "regression done"
