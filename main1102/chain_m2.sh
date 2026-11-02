#!/bin/bash
# 11/2 保養：保養資料夾的瀏覽器測試、實測報表檢查跑完後（程式和主要資料夾一模一樣），主要資料夾跑自動測試＋完整回歸（一次一個）
S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
M=$S/main1102
until grep -q "^report21:" $M/chain_mw.out 2>/dev/null; do sleep 5; done
cat $M/chain_mw.out
cd /home/user/claude-workspace && npm test > $M/m0_unit_main.txt 2>&1
echo "main unit: $(grep -E '^# (tests|pass|fail)' $M/m0_unit_main.txt | tr '\n' ' ')"
cd $S && bash reg2.sh > $S/reg_m1102.txt 2>&1
echo "regression done"
