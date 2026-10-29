const src = (await import('fs')).readFileSync('/home/user/claude-workspace/tests/fluency.test.mjs', 'utf8');
const body = src.slice(src.indexOf('function curve'), src.indexOf("test('平滑"));
const curve = new Function(body + '; return curve;')();
for (const o of [{}, { stall: { at: 126.5, ms: 300 } }, { stall: { at: 126.5, ms: 150 } }, { stall: { at: 90, ms: 600 } }, { up: { at: 126.5, ms: 400 } }]) console.log(JSON.stringify(o), curve(o).length);
