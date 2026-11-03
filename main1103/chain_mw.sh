#!/bin/bash
# 11/3 保養：保養的資料夾先跑自動測試、瀏覽器測試（主線等 GitHub 的時候）
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=$S/main1103/maint
M=$S/main1103
cd $W && npm test > $M/m0_unit_w.txt 2>&1
echo "unit: $(grep -E '^# (tests|pass|fail)' $M/m0_unit_w.txt | tr '\n' ' ')"
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/m1_browser_w.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/m1_browser_w.txt | tr '\n' ' ')"
