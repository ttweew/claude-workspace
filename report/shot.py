from playwright.sync_api import sync_playwright
import pathlib
html = pathlib.Path('report.html').read_text()
pathlib.Path('preview.html').write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + html)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    for w, name, scheme in [(400, 'phone', 'dark'), (1200, 'desk', 'light')]:
        pg = b.new_page(viewport={"width": w, "height": 900}, color_scheme=scheme)
        pg.goto('file://' + str(pathlib.Path('preview.html').resolve())); pg.wait_for_timeout(1500)
        print(name, 'scrollWidth', pg.evaluate("document.documentElement.scrollWidth"), 'height', pg.evaluate("document.body.scrollHeight"))
        pg.screenshot(path=f'shot_{name}.png', full_page=True)
    b.close()
