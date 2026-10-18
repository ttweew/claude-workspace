import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        for w in (1280, 390):
            pg = await b.new_page(viewport={'width': w, 'height': 900}, device_scale_factor=1)
            await pg.goto('http://localhost:8790/help.html'); await pg.wait_for_timeout(400)
            el = await pg.query_selector('#screen, section[aria-labelledby=screenTitle]')
            await el.screenshot(path=f'pr3check/help_{w}.png')
        await b.close()
asyncio.run(main())
