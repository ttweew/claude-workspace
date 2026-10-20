import sys
sys.path.insert(0, '..')
from audit_common import *
from playwright.sync_api import sync_playwright
base = serve(8896, '/home/user/claude-workspace')
AXE = '/tmp/claude-0/-home-user-claude-workspace/06177a5d-45ba-5b18-b395-0fd8d80e2079/scratchpad/a11y/node_modules/axe-core/axe.min.js'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for page in ['index.html', 'replay.html?demo']:
        pg = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
        pg.goto(base + page); pg.wait_for_timeout(3000)
        pg.add_script_tag(path=AXE)
        print(page, pg.evaluate("async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations.map(v => v.id + ' ' + v.nodes.length)"))
