"""
CLC Landing Page - Verification Script
Checks all implemented animation & interactivity features.
"""
import sys, time
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

URL = "file:///C:/Users/jalva/Downloads/Proyecto_CLC_Ver_1.02/index.html"
SS  = "c:/Users/jalva/Downloads/Proyecto_CLC_Ver_1.02/screenshots"

import os; os.makedirs(SS, exist_ok=True)

results = []
def check(label, ok, detail=""):
    icon = "✅" if ok else "❌"
    results.append((icon, label, detail))
    print(f"{icon} {label}" + (f" — {detail}" if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    # ── 1. Page loads ──────────────────────────────────────────
    page.goto(URL)
    page.wait_for_load_state("networkidle")

    # ── 2. Loading screen visible on load ─────────────────────
    loader = page.locator("#loading")
    loader_visible = loader.is_visible()
    # On fast load it may already be gone; check it exists at least
    loader_exists = page.locator("#loading").count() > 0
    check("Loading screen exists in DOM", loader_exists)

    page.screenshot(path=f"{SS}/01_initial_load.png", full_page=False)

    # ── 3. Wait for loader to hide (CSS slide-up after 1200ms) ─
    page.wait_for_timeout(2000)
    loader_hidden = page.evaluate("document.getElementById('loading').classList.contains('hide')")
    check("Loading screen hides after delay", loader_hidden,
          "classList includes 'hide'")
    page.screenshot(path=f"{SS}/02_after_loader.png", full_page=False)

    # ── 4. Custom cursor elements exist ───────────────────────
    cursor_el   = page.locator("#cursor").count() > 0
    cursor_dot  = page.locator(".cursor-dot").count() > 0
    cursor_ring = page.locator(".cursor-ring").count() > 0
    check("Custom cursor element (#cursor) in DOM", cursor_el)
    check("Cursor dot (.cursor-dot) in DOM",        cursor_dot)
    check("Cursor ring (.cursor-ring) in DOM",      cursor_ring)

    # ── 5. Navbar exists and has id ───────────────────────────
    navbar_id = page.locator("#navbar").count() > 0
    check("Navbar has id='navbar'", navbar_id)

    # ── 6. Navbar scroll state ────────────────────────────────
    # Initially should NOT have 'scrolled' class (at top)
    has_scrolled_at_top = page.evaluate(
        "document.getElementById('navbar').classList.contains('scrolled')"
    )
    check("Navbar does NOT have .scrolled at page top", not has_scrolled_at_top)

    # Scroll down 200px, check scrolled class appears
    page.evaluate("window.scrollTo(0, 200)")
    page.wait_for_timeout(200)
    has_scrolled_after = page.evaluate(
        "document.getElementById('navbar').classList.contains('scrolled')"
    )
    check("Navbar gets .scrolled class after scrolling down", has_scrolled_after)
    page.screenshot(path=f"{SS}/03_navbar_scrolled.png", full_page=False)

    # Scroll back to top
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(200)

    # ── 7. Hero reveal animations ─────────────────────────────
    hero_reveal_count = page.locator(".hero-reveal").count()
    check("Hero reveal elements exist (.hero-reveal)", hero_reveal_count > 0,
          f"{hero_reveal_count} elements found")

    hero_animated = page.evaluate(
        "document.querySelectorAll('.hero-reveal.hero-animate').length"
    )
    check("Hero entry animation triggered (.hero-animate)", hero_animated > 0,
          f"{hero_animated} elements have .hero-animate")

    # ── 8. Rotating word ──────────────────────────────────────
    rotating_el = page.locator(".rotating-word").count() > 0
    check("Rotating word element exists (.rotating-word)", rotating_el)

    initial_word = page.locator(".rotating-word").inner_text()
    check("Rotating word has text content", bool(initial_word.strip()),
          f"current word: '{initial_word.strip()}'")

    # Wait 3s for word to change
    page.wait_for_timeout(3000)
    new_word = page.locator(".rotating-word").inner_text()
    word_changed = initial_word.strip() != new_word.strip()
    check("Rotating word changes after interval", word_changed,
          f"'{initial_word.strip()}' → '{new_word.strip()}'")

    # ── 9. Canvas elements ────────────────────────────────────
    hero_canvas    = page.locator("#hero-canvas").count() > 0
    about_canvas   = page.locator("#about-canvas").count() > 0
    service_canvas = page.locator("#service-canvas").count() > 0
    check("Hero canvas exists (#hero-canvas)",       hero_canvas)
    check("About canvas exists (#about-canvas)",     about_canvas)
    check("Service canvas exists (#service-canvas)", service_canvas)

    # Check canvas has non-zero dimensions
    hero_w = page.evaluate(
        "document.getElementById('hero-canvas')?.width || 0"
    )
    hero_h = page.evaluate(
        "document.getElementById('hero-canvas')?.height || 0"
    )
    check("Hero canvas has dimensions", hero_w > 0 and hero_h > 0,
          f"{hero_w}×{hero_h}px")

    # ── 10. Scroll reveal – data-reveal elements ──────────────
    reveal_total = page.evaluate(
        "document.querySelectorAll('[data-reveal]').length"
    )
    check("data-reveal elements present in DOM", reveal_total > 0,
          f"{reveal_total} elements")

    # Scroll to client section to trigger reveal
    page.evaluate("document.getElementById('client').scrollIntoView()")
    page.wait_for_timeout(600)
    revealed = page.evaluate(
        "document.querySelectorAll('[data-reveal].revealed').length"
    )
    check("Scroll reveal triggers .revealed class", revealed > 0,
          f"{revealed}/{reveal_total} elements revealed")

    page.screenshot(path=f"{SS}/04_client_section_revealed.png", full_page=False)

    # ── 11. Sticker spin – CSS animation applied ──────────────
    sticker_anim = page.evaluate("""
        getComputedStyle(document.querySelector('.sticker')).animationName
    """)
    check("Sticker has CSS animation", sticker_anim and sticker_anim != "none",
          f"animation-name: {sticker_anim}")

    sticker_two_anim = page.evaluate("""
        getComputedStyle(document.querySelector('.sticker.two')).animationName
    """)
    check("Sticker.two has reverse animation", sticker_two_anim != sticker_anim,
          f"animation-name: {sticker_two_anim}")

    # ── 12. Service section scroll reveal ─────────────────────
    page.evaluate("document.getElementById('service').scrollIntoView()")
    page.wait_for_timeout(700)
    service_revealed = page.evaluate(
        "document.querySelectorAll('#service [data-reveal].revealed').length"
    )
    check("Service section scroll reveal works", service_revealed > 0,
          f"{service_revealed} service elements revealed")
    page.screenshot(path=f"{SS}/05_service_section.png", full_page=False)

    # ── 13. Service card hover effect (CSS transition) ─────────
    service_wrapper = page.locator(".service-wrapper").first
    service_wrapper.hover()
    page.wait_for_timeout(500)
    page.screenshot(path=f"{SS}/06_service_hover.png", full_page=False)
    # Check computed transform changes on hover via JS
    transform_on_hover = page.evaluate("""
        (() => {
            const el = document.querySelector('.service-wrapper');
            const style = getComputedStyle(el);
            return style.transition;
        })()
    """)
    check("Service wrapper has CSS transition defined",
          "transform" in transform_on_hover,
          f"transition: {transform_on_hover[:80]}...")

    # ── 14. About section – parallax video ────────────────────
    page.evaluate("document.getElementById('about').scrollIntoView()")
    page.wait_for_timeout(500)
    video_el = page.locator(".thinking-video").count() > 0
    check("Thinking video element exists", video_el)
    video_transform = page.evaluate(
        "getComputedStyle(document.querySelector('.thinking-video')).willChange"
    )
    check("Thinking video has will-change:transform for parallax",
          "transform" in video_transform,
          f"will-change: {video_transform}")
    page.screenshot(path=f"{SS}/07_about_section.png", full_page=False)

    # ── 15. Full-page screenshot ───────────────────────────────
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(400)
    page.screenshot(path=f"{SS}/08_fullpage.png", full_page=True)

    # ── 16. Console errors check ──────────────────────────────
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text)
            if msg.type == "error" else None)
    page.reload()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    check("No JS console errors on load", len(console_errors) == 0,
          f"{len(console_errors)} errors: {console_errors[:3]}" if console_errors else "clean")

    browser.close()

# ── Summary ───────────────────────────────────────────────────
print("\n" + "─"*55)
print("VERIFICATION SUMMARY")
print("─"*55)
passed = sum(1 for r in results if r[0] == "✅")
failed = sum(1 for r in results if r[0] == "❌")
for icon, label, detail in results:
    print(f"  {icon} {label}" + (f"\n     {detail}" if detail else ""))
print("─"*55)
print(f"  {passed}/{len(results)} checks passed")
verdict = "PASS" if failed == 0 else f"FAIL ({failed} issue{'s' if failed > 1 else ''})"
print(f"  Verdict: {verdict}")
print("─"*55)
print(f"  Screenshots saved to: screenshots/")
