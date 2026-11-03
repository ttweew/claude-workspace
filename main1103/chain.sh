#!/bin/bash
# 11/3 主線：主要資料夾上依序跑（一次一個，重的測試不同時跑）
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/main1103
cd $W && npm test > $M/c0_unit.txt 2>&1
echo "unit: $(grep -E '^# (tests|pass|fail)' $M/c0_unit.txt | tr '\n' ' ')"
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/c1_browser.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/c1_browser.txt | tr '\n' ' ')"
cd $S && bash reg2.sh > $S/reg_g1103.txt 2>&1
echo "regression done"
