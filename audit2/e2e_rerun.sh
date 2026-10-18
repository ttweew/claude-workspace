S=/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad
R=/home/user/claude-workspace
for t in prBcheck/workout prCcheck/form prDcheck/summary prEcheck/validate prFcheck/calib prGcheck/similar prHcheck/advanced pr10check/auto pr11check/model pr9check/advice; do
  d=${t%/*}; f=${t#*/}
  echo "=== $t"
  (cd $S/$d && timeout 900 python3 $f.py $R 2>&1 | grep -a -E '^(PASS|FAIL)|ALL PASS|SOME FAIL|Traceback|Error' | grep -v 'Task was destroyed' | cut -c1-220)
done
echo E2EDONE
