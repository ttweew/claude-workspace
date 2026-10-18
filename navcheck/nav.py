import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        for name, vp, dpr in [('lap', {'width':1366,'height':768}, 1), ('ph', {'width':390,'height':844}, 2)]:
            pg = await b.new_page(viewport=vp, device_scale_factor=dpr)
            await pg.goto('http://localhost:8765/index.html')
            await pg.wait_for_timeout(800)
            nav = await pg.query_selector('.site-nav')
            await nav.screenshot(path=f'nav_{name}.png')
            info = await pg.evaluate("""() => [...document.querySelectorAll('.nav-links a, .nav-brand')].map(a => {const r=a.getBoundingClientRect(); const cs=getComputedStyle(a); return [a.textContent.trim(), Math.round(r.width), Math.round(r.height), cs.fontSize]})""")
            print(name, info)
        await b.close()
asyncio.run(main())
