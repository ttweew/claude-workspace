import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        pg = await b.new_page(viewport={'width':1366,'height':900})
        await pg.goto('http://localhost:8790/index.html')
        await pg.wait_for_timeout(500)
        el = await pg.query_selector('.hero-art')
        await el.screenshot(path='hero_anim_a.png')
        vals = []
        for i in range(14):
            await pg.wait_for_timeout(250)
            vals.append(await pg.evaluate("document.getElementById('artAngle').textContent"))
        print('animated angles:', vals)
        pg2 = await b.new_page(viewport={'width':1366,'height':900}, reduced_motion='reduce')
        await pg2.goto('http://localhost:8790/index.html'); await pg2.wait_for_timeout(500)
        await (await pg2.query_selector('.hero-art')).screenshot(path='hero_static.png')
        print('static:', await pg2.evaluate("document.getElementById('artAngle').textContent"))
        await b.close()
asyncio.run(main())
