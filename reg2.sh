S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
cd $S
for t in t6 t7 t8 t9 labels_test data_test framing_test audit_camera; do echo "=== $t"; timeout 560 python3 $t.py 2>&1 | grep -v '^\s*$' | grep -iv 'warning\|Task was destroyed\|task:' | tail -8 | cut -c1-200; done
echo "=== flash"; (cd hunt && timeout 120 python3 flash.py 2>&1 | grep -v Task)
echo "=== r1"; (cd stab && timeout 500 python3 r1.py S1 S2 S3 S4 S6 S9 S10 2>&1 | grep -a '^S' | cut -c1-160)
echo "=== robust"; (cd worker && timeout 600 python3 robust.py 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-160)
echo "=== fallback"; (cd worker && timeout 300 python3 fallback.py 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-160)
echo "=== fixes"; (cd worker && timeout 400 python3 fixes.py 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-160)
echo "=== stall"; (cd step2 && QUERY='?worker=0' timeout 900 python3 stall.py 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-120)
echo "=== squat"; (cd step5 && timeout 500 python3 live_squat.py 2>&1 | grep '^\[' | cut -c1-120)
echo "=== replay"; (cd step4 && timeout 300 python3 replay_test.py 2>&1 | grep -v Task | grep '^\[\|hscroll\|bad=' | cut -c1-150); (cd step5 && timeout 120 python3 replay_squat.py 2>&1 | grep '^\[' | cut -c1-150)
echo "=== chaos"; (cd hunt && for s in 1 2; do timeout 400 python3 chaos.py $s 2>&1 | grep -a '^seed' | cut -c1-80; done)
echo '=== 新測試'; (cd z && node robust_prod.mjs | tail -2 && node fuzz_world.mjs); (cd r6 && node lowfps.mjs | tail -1; (cd ../step5 && node squat_unit.mjs | tail -1); (cd ../hunt && timeout 120 python3 flash.py 2>&1 | grep -v Task)); (cd r6 && timeout 300 python3 blink.py 2>&1 | grep -v Task | tail -2; for b in 0.03 0.1; do node flicker_ui.mjs $b | tail -10; done); (cd r3 && node stuck.mjs); (cd ghost2 && rm -rf final && mkdir final && cp /home/user/claude-workspace/js/skeleton/{smooth,ghost,landmarks}.js final/ && node eval_fix.mjs final > b.txt; K=200 node eval_k.mjs cur > a2.txt; diff a2.txt b.txt; echo 擋鬼點評估差異如上); (cd r3 && timeout 300 python3 rotate.py 2>&1 | grep -v Task | tail -2; timeout 300 python3 export_focus.py 2>&1 | grep -v Task | tail -1; timeout 600 python3 replay_soak.py 2>&1 | grep -v Task | tail -2); (cd sw && timeout 400 python3 upgrade.py 2>&1 | grep -E 'PASS|FAIL' | cut -c1-200); (cd sw && timeout 300 python3 corrupt.py 2>&1 | grep -E 'PASS|FAIL' | cut -c1-160); (cd worker && timeout 300 python3 robust.py sleep,restarthang 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-160); (cd r3 && (cd ../r7 && node export_same.mjs && timeout 300 python3 panel_mode.py 2>&1 | grep -v Task); node core_same.mjs | tail -1; node bad_files.mjs; node csv_cut.mjs; for s in 7 11 23 5 99 1 2 3; do node fuzz.mjs $s; done; timeout 200 python3 bad_ui.py 2>&1 | grep -v Task | cut -c1-120; timeout 200 python3 freeze.py 2>&1 | grep -v Task); (cd sw && timeout 400 python3 sw_test.py /home/user/claude-workspace 2>&1 | grep -E 'PASS|FAIL|errors' | cut -c1-140)
echo "=== 倒數、3D"; (cd r9 && timeout 500 python3 countdown.py 2>&1 | grep -E "FAIL|ALL|SOME"); (cd r8 && node world_same.mjs | head -1 && timeout 400 python3 world_card.py 2>&1 | grep -E "^(FAIL|ALL|SOME)")
echo "=== 錄製上限提醒"; (cd r10 && timeout 600 python3 reclimit.py 2>&1 | grep -E "FAIL|ALL|SOME")
echo "=== 專案內測試"; (cd /home/user/claude-workspace && npm test 2>&1 | grep -E "^# (pass|fail)")
echo ALLDONE
