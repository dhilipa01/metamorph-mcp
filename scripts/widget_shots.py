"""Renders the Assessment view of the widget with REAL-shaped data and saves screenshots.

Why Python: the only Playwright on this machine is the Python package (Chromium only, already installed; no downloads,
no new dependencies). scripts/widget-shots.mjs is a thin wrapper that calls this file.

Usage: python3 scripts/widget_shots.py [--base http://localhost:3417/score-dashboard] [--out docs/img] [--only name,...]
Data: tests/fixtures/widget/assess_project.monorepo.json (made by scripts/make-widget-fixture.mjs, offline).
"""
import argparse
import json
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = [
    # name, theme, mode, width, height
    ("assessment-light-1920x1080", "light", "full", 1920, 1080),
    ("assessment-dark-1920x1080", "dark", "full", 1920, 1080),
    ("assessment-light-1280x720", "light", "full", 1280, 720),
    ("assessment-dark-1280x720", "dark", "full", 1280, 720),
    ("assessment-light-inline-640x400", "light", "inline", 640, 400),
]


def load_output(with_repo=False):
    env = json.loads((ROOT / "tests/fixtures/widget/assess_project.monorepo.json").read_text())
    out = env["structuredContent"]
    if with_repo:
        # Not what assess_project returns today (it does not echo its input); used only to exercise the callTool path.
        out = {**out, "repo_url": "https://github.com/acme/legacy-monorepo", "commit": "9f3c2ab41d0e"}
    return out


def open_page(browser, base, theme, mode, w, h, output, call_tool=False, inject_theme=True):
    ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, color_scheme=theme)
    page = ctx.new_page()
    init = "window.openai = { toolOutput: %s };" % json.dumps(output)
    if call_tool:
        # Stand-in for a host: callTool resolves after a moment and records the call.
        init += "window.__calls = []; window.openai.callTool = (n, a) => { window.__calls.push([n, a]); return new Promise(r => setTimeout(() => r({ ok: true }), 150)); };"
    page.add_init_script(init)
    page.on("console", lambda m: print("  console error:", m.text[:200]) if m.type == "error" else None)
    q = f"theme={theme}&" if inject_theme else ""
    page.goto(f"{base}?{q}mode={mode}", wait_until="networkidle")
    page.wait_for_selector(".numeral" if output else ".state", timeout=20000)
    page.wait_for_timeout(300)
    return ctx, page


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3417/score-dashboard")
    ap.add_argument("--out", default=str(ROOT / "docs/img"))
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    only = set(filter(None, a.only.split(",")))
    output = load_output()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for name, theme, mode, w, h in SHOTS:
            if only and name not in only:
                continue
            ctx, page = open_page(browser, a.base, theme, mode, w, h, output)
            path = out / f"{name}.png"
            page.screenshot(path=str(path), full_page=(mode == "full"))
            size = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.scrollHeight]")
            print(f"{path.name}: page {size[0]}x{size[1]}, {path.stat().st_size // 1024} KB")
            ctx.close()
        # Path 2: no host theme, the user drives the switch itself (auto -> light -> dark). Proves the override path.
        if not only or "assessment-dark-via-switch-1280x720" in only:
            ctx, page = open_page(browser, a.base, "light", "full", 1280, 720, output, inject_theme=False)
            seen = []
            for _ in range(2):
                page.click(".tswitch")
                page.wait_for_timeout(150)
                seen.append(page.evaluate("document.querySelector('.mm').dataset.theme"))
            assert seen == ["light", "dark"], seen
            path = out / "assessment-dark-via-switch-1280x720.png"
            page.screenshot(path=str(path), full_page=True)
            print(f"{path.name}: switch cycle gave {seen}, {path.stat().st_size // 1024} KB")
            # A host theme change must not override the choice (host injection is only the initial value here).
            ctx.close()
        browser.close()


if __name__ == "__main__":
    sys.exit(main())
