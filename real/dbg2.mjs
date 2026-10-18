import { readFileSync } from 'fs';
const U='/root/.claude/uploads/06177a5d-45ba-5b18-b395-0fd8d80e2079/';
for (const [f, ts] of [['2ef82f59-pose_20261005_133933.json',[1,5,12,16,20,34,36]],['e1f4647b-pose_20261005_134842.json',[1,3,5]]]) {
  const d = JSON.parse(readFileSync(U+f,'utf8'));
  console.log(f.slice(9,29));
  for (const t of ts) {
    const fr = d.frames.reduce((a,b)=>Math.abs(b.t/1000-t)<Math.abs(a.t/1000-t)?b:a);
    const L=fr.landmarks, Wd=fr.world;
    const p2=j=>[L[j][0]*480,L[j][1]*640], p3=j=>Wd[j];
    const d2=(a,b)=>Math.hypot(p2(a)[0]-p2(b)[0],p2(a)[1]-p2(b)[1]);
    const d3=(a,b)=>Math.hypot(...[0,1,2].map(k=>p3(a)[k]-p3(b)[k]))*100;
    const mid=(f,a,b)=>f(a).map((v,k)=>(v+f(b)[k])/2);
    const t2=Math.hypot(...[0,1].map(k=>mid(p2,11,12)[k]-mid(p2,23,24)[k])), t3=Math.hypot(...[0,1,2].map(k=>mid(p3,11,12)[k]-mid(p3,23,24)[k]))*100;
    const segs={torso:[t2,t3],thighL:[d2(23,25),d3(23,25)],shankL:[d2(25,27),d3(25,27)],thighR:[d2(24,26),d3(24,26)],shankR:[d2(26,28),d3(26,28)],upArmL:[d2(11,13),d3(11,13)],foreL:[d2(13,15),d3(13,15)]};
    console.log(' t',t,Object.entries(segs).map(([k,[a,b]])=>`${k} ${a.toFixed(0)}px/${b.toFixed(0)}cm=${(a/b).toFixed(2)}`).join('  '));
  }
}
