// 無頭 Chromium 有沒有 WebGPU（不同啟動參數）
const { chromium } = require('playwright');
(async () => {
  const combos = [
    [],
    ['--enable-unsafe-webgpu'],
    ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
    ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'],
  ];
  for (const args of combos) {
    const b = await chromium.launch({ args });
    const p = await b.newPage();
    await p.goto('about:blank');
    const r = await p.evaluate(async () => {
      if (!navigator.gpu) return 'no navigator.gpu';
      try {
        const a = await navigator.gpu.requestAdapter();
        if (!a) return 'adapter null';
        const info = a.info || {};
        return 'adapter ok: ' + [info.vendor, info.architecture, info.device, info.description].join(' | ') + ' fallback=' + a.isFallbackAdapter;
      } catch (e) { return 'error ' + e.message; }
    });
    console.log(JSON.stringify(args), '->', r);
    await b.close();
  }
})();
