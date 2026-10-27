# 拍照看：深度三種顏色混在一起、30 下（橫軸編號隔開）、壞掉的那一下（編號空一格）
import sys, os
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
base = serve(int(sys.argv[2]), sys.argv[1])
JS = """async () => {
  const { repSeries } = await import('./js/analysis/rep-series.js');
  const { renderRepChart } = await import('./js/ui/rep-chart.js');
  const box = document.getElementById('repChart'); document.getElementById('summary').hidden = false;
  const items = Array.from({ length: 30 }, (_, i) => ({ min: [82, 97, 125, 88, 104][i % 5] + (i % 3), depth: undefined, start: i * 3, end: i * 3 + 1.6 + (i % 7) * 0.25, errors: i % 4 === 0 ? ['lean'] : [] }));
  items[12] = { min: NaN };
  renderRepChart(box, repSeries('squat', items));
  return [...box.querySelectorAll('svg')].map(s => [...s.querySelectorAll('.rep-tick')].map(t => t.textContent).join(' '));
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for w in (390, 1280):
        pg = b.new_page(viewport={"width": w, "height": 900}); mock_network(pg)
        pg.goto(base + "index.html"); pg.wait_for_timeout(800)
        print(w, pg.evaluate(JS))
        pg.locator('#repChart').screenshot(path=os.path.join(HERE, f'mixed_{w}.png'))
    b.close()
