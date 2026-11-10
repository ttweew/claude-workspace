#!/bin/bash
# 11/10 總體檢（AI 教練的設定、axe-core 4.14.0、文件）：主要資料夾上依序跑（一次一個）；改到 js/cloud/，多跑安全規則的測試
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/audit1110
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
cd $S && bash reg2.sh > $S/reg_1110c.txt 2>&1
echo "regression exit $?"
sum(){ grep -a -E "ALL PASS|ALLOK|ALL OK|SOME|^FAIL|通過 \|" "$1" | cut -c1-60; }
if diff <(sum $S/reg_r22.txt) <(sum $S/reg_1110c.txt) > /dev/null; then echo "摘要行：一樣"; else echo "摘要行：不一樣"; diff <(sum $S/reg_r22.txt) <(sum $S/reg_1110c.txt) | head -20; fi
echo "PASS：$(grep -c '^PASS' $S/reg_1110c.txt)"
echo "md5：$(awk '/^5,6c5,6/,/擋鬼點評估差異如上/' $S/reg_1110c.txt | md5sum | cut -c1-32)"
