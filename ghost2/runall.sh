cd /tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/ghost2
S=walk,waistup,panout,empty,dark,close
timeout 1500 python3 run.py 8840 0.5 $S 240 lite VIDEO > log_lite.txt 2>&1
timeout 1500 python3 run.py 8841 0.5 $S 240 full VIDEO > log_full.txt 2>&1
timeout 1500 python3 run.py 8842 0.5 $S 240 lite VIDEO seg > log_seg.txt 2>&1
echo DONE > log_done.txt
