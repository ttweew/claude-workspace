// GPU 資訊：查詢裝置的 GPU 名稱，並整理成一般人看得懂的名稱

// 向瀏覽器查詢 GPU 名稱；software 為 true 代表只是軟體模擬的 GPU（實際仍由 CPU 運算）
// 瀏覽器不支援 WebGL 時回傳 null
export function getGpuInfo() {
    const gl = document.createElement('canvas').getContext('webgl2')
        || document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return { name: name, software: /swiftshader|llvmpipe|software/i.test(name) };
}

// 瀏覽器回報的名稱常包含驅動資訊，只留下一般人看得懂的晶片名稱
// 例：ANGLE (Intel, Intel(R) UHD Graphics (0x00004688) Direct3D11 vs_5_0 ps_5_0, D3D11) → Intel UHD Graphics
export function shortGpuName(raw) {
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
