import sys
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("file:///C:/Users/jalva/Downloads/Proyecto_CLC_Ver_1.02/index.html")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # Initial state
    word  = page.evaluate("document.querySelector('.rotating-word').textContent.trim()")
    color = page.evaluate("document.querySelector('.rotating-word').style.color")
    print(f"[0] word: '{word}'  color: {color!r}")

    # Capture 7 more cycles
    for i in range(7):
        page.wait_for_timeout(2700)
        word  = page.evaluate("document.querySelector('.rotating-word').textContent.trim()")
        color = page.evaluate("document.querySelector('.rotating-word').style.color")
        print(f"[{i+1}] word: '{word}'  color: {color!r}")

    page.screenshot(path="screenshots/rotating_word_color.png")
    browser.close()
    print("\nScreenshot saved.")
