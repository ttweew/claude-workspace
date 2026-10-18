S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
cd $S
for t in t6 t8 labels_test data_test framing_test audit_camera; do echo "=== $t"; timeout 560 python3 $t.py 2>&1 | grep -v '^\s*$' | grep -iv 'warning\|Task was destroyed\|task:' | tail -8 | cut -c1-200; done
echo "=== flash"; (cd hunt && timeout 120 python3 flash.py 2>&1 | grep -v Task)
echo "=== r1"; (cd stab && timeout 500 python3 r1.py S1 S2 S3 S4 S6 S9 S10 2>&1 | grep -a '^S' | cut -c1-160)
echo "=== robust"; (cd worker && timeout 600 python3 robust.py 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-160)
echo "=== fallback"; (cd worker && timeout 300 python3 fallback.py 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-160)
echo "=== fixes"; (cd worker && timeout 400 python3 fixes.py 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-160)
echo "=== stall"; (cd step2 && timeout 900 python3 stall.py 2>&1 | grep -E '^PASS|^FAIL' | cut -c1-120)
echo "=== squat"; (cd step5 && timeout 500 python3 live_squat.py 2>&1 | grep '^\[' | cut -c1-120)
echo "=== replay"; (cd step4 && timeout 300 python3 replay_test.py 2>&1 | grep -v Task | grep '^\[\|hscroll\|bad=' | cut -c1-150); (cd step5 && timeout 120 python3 replay_squat.py 2>&1 | grep '^\[' | cut -c1-150)
echo "=== chaos"; (cd hunt && for s in 1 2; do timeout 400 python3 chaos.py $s 2>&1 | grep -a '^seed' | cut -c1-80; done)
echo ALLDONE
