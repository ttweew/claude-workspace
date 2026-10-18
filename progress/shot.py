import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        for name,vp in [('lap',{'width':1280,'height':900}),('ph',{'width':390,'height':844})]:
            pg = await b.new_page(viewport=vp)
            await pg.goto('file://'+__import__('os').path.abspath('progress.html'))
            el = await pg.query_selector('section[aria-labelledby=recentTitle]')
            await el.screenshot(path=f'pm7_{name}.png')
            ov = await pg.evaluate('document.documentElement.scrollWidth > innerWidth')
            print(name, 'hscroll', ov)
        await b.close()
asyncio.run(main())
