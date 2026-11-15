#!/bin/bash
# 11/14 新功能（智慧課表、每一下也唸 AI 分數、分享這次的結果；研究成果頁、使用說明、文件）：主要資料夾上依序跑（一次一個）
# 沒改到 js/cloud/、firestore.rules：不跑安全規則和雲端同步檢查；跑完回歸接著照腳本跑一次現場示範（凍結檢查的一部分）
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
W=/home/user/claude-workspace
M=$S/feat1114
echo "開始 $(TZ=Asia/Taipei date '+%m/%d %H:%M')"
cd $W && npm test > $M/c0_unit.txt 2>&1
echo "unit: $(grep -E '^# (tests|pass|fail)' $M/c0_unit.txt | tr '\n' ' ')"
cd $W && PLAYWRIGHT_CHROMIUM=/opt/pw-browsers/chromium AXE_CORE=$S/a11y/node_modules/axe-core/axe.min.js npm run test:browser > $M/c1_browser.txt 2>&1
echo "browser: $(grep -E '^# (tests|pass|fail)' $M/c1_browser.txt | tr '\n' ' ')"
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
cd $S/maint1110 && PATTERNS=00011 timeout 900 node demo_dryrun.mjs > $M/c4_dryrun.txt 2>&1
echo "dryrun exit $?，$(grep -c '程式錯誤：\[\]' $M/c4_dryrun.txt) 段沒有程式錯誤"
echo "結束 $(TZ=Asia/Taipei date '+%m/%d %H:%M')"
echo CHAINDONE
