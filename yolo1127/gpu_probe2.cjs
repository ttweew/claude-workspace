const { chromium } = require('playwright');
(async () => {
  const combos = [
    ['--enable-unsafe-webgpu'],
    ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'],
    ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader'],
  ];
  for (const args of combos) {
    const b = await chromium.launch({ args, executablePath: '/opt/pw-browsers/chromium' });
    const p = await b.newPage();
    await p.goto('http://127.0.0.1:8799/');
    const r = await p.evaluate(async () => {
      if (!navigator.gpu) return 'no navigator.gpu';
      try {
        const a = await navigator.gpu.requestAdapter();
        if (!a) return 'adapter null';
        const info = a.info || {};
        return 'adapter ok: ' + [info.vendor, info.architecture, info.device, info.description].join(' | ') + ' fallback=' + (info.isFallbackAdapter ?? a.isFallbackAdapter) + ' f16=' + a.features.has('shader-f16');
      } catch (e) { return 'error ' + e.message; }
    });
    console.log(JSON.stringify(args), '->', r);
    await b.close();
  }
})();
