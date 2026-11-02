#!/bin/bash
# 11/2 保養：先在保養的資料夾跑（主線等 GitHub 的時候）；合併主線後再到主要資料夾跑完整回歸
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=${1:-$S/main1102/maint}
M=$S/main1102
TAG=${2:-w}
cd $W && npm test > $M/m0_unit_$TAG.txt 2>&1
echo "unit: $(grep -E '^# (tests|pass|fail)' $M/m0_unit_$TAG.txt | tr '\n' ' ')"
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/m1_browser_$TAG.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/m1_browser_$TAG.txt | tr '\n' ' ')"
cd $S/report21 && python3 check.py $W 8921 > $M/m2_report21_$TAG.txt 2>&1
echo "report21: $(grep -cE '^PASS' $M/m2_report21_$TAG.txt) PASS, $(grep -cE '^FAIL' $M/m2_report21_$TAG.txt) FAIL, $(tail -1 $M/m2_report21_$TAG.txt | cut -c1-80)"
if [ "$TAG" = "main" ]; then cd $S && bash reg2.sh > $S/reg_m1102.txt 2>&1; echo "regression done"; fi
