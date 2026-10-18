from playwright.sync_api import sync_playwright
JS = """() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no WebGL';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl2: !!c.getContext('webgl2') || gl instanceof WebGL2RenderingContext,
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  };
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    pg = b.new_page(); pg.set_content("<p>x</p>")
    print(pg.evaluate(JS)); b.close()
