function shortGpuName(raw) {
            let name = raw;
            const angle = name.match(/^ANGLE \((.*)\)$/);
            if (angle) {
                const parts = angle[1].split(', ');
                name = parts[1] || parts[0];
            }
            name = name
                .replace('ANGLE Metal Renderer: ', '')
                .replace(/\(0x[0-9a-f]+\)/gi, '')
                .replace(/Direct3D.*$/i, '')
                .replace(/\((R|TM)\)/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            return name || raw;
        }

        
const cases = [
 'ANGLE (Intel, Intel(R) UHD Graphics (0x00004688) Direct3D11 vs_5_0 ps_5_0, D3D11)',
 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002503) Direct3D11 vs_5_0 ps_5_0, D3D11)',
 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)',
 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
 'ANGLE (Qualcomm, Adreno (TM) 740, OpenGL ES 3.2)',
 'Adreno (TM) 740', 'Mali-G78', 'Apple GPU',
 'ANGLE (ARM, Mali-G710, OpenGL ES 3.2)',
];
for (const c of cases) console.log(JSON.stringify(shortGpuName(c)).padEnd(28), '<=', c);
