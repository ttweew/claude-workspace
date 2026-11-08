import { syntheticSet } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/n3wt/tests/synthetic-sets.mjs';
import { analyzeOne } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/n3wt/js/data/report-core.js';
import { judgeReps, repScore, scoreLine } from '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/n3wt/js/analysis/ai-judge.js';
for (const [w, c] of [['squat', 'good'], ['squat', 'lean'], ['squat', 'heel'], ['pushup', 'good'], ['pushup', 'sag'], ['lunge', 'good'], ['lunge', 'knee'], ['plank', 'good'], ['plank', 'pike']]) {
    const r = await analyzeOne(syntheticSet('K', w, c, 1).text);
    const j = judgeReps(w, r.items);
    console.log(w, c, r.items.map((it, i) => repScore(it, j[i].ai) + '(' + Math.round(j[i].ai.good * 100) + '×' + it.similarity + ')').join(' '));
    console.log('   ', scoreLine(w, r.items, j));
}
