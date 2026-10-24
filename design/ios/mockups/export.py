"""Export the design-canvas screens in src/ to plain HTML pages next to this script.

The canvas files (*.dc.html) are static markup wrapped in the canvas runtime's tags.
This strips the wrapper so each screen opens directly in a browser.

Usage: python3 design/ios/mockups/export.py
"""

import re
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / "src"

# Canvas file -> exported page, in learning-loop order.
PAGES = {
    "iPad-Library.dc.html": "ipad-1-import.html",
    "iPad-Listen.dc.html": "ipad-2-listen.html",
    "iPad-Intend.dc.html": "ipad-3-intend.html",
    "Main.dc.html": "ipad-4-try.html",
    "iPad-Compare.dc.html": "ipad-5-compare.html",
    "iPhone-Home.dc.html": "iphone-1-home.html",
    "iPhone-Points.dc.html": "iphone-2-points.html",
    "iPhone-Try.dc.html": "iphone-3-try.html",
    "iPhone-Compare.dc.html": "iphone-4-compare.html",
    "iPhone-Mixer.dc.html": "iphone-5-mixer.html",
}


def export(source: str) -> str:
    helmet = re.search(r"<helmet>(.*?)</helmet>", source, re.S).group(1)
    out = source.replace('<script src="./support.js"></script>', helmet.strip())
    out = re.sub(r"<helmet>.*?</helmet>\n?", "", out, flags=re.S)
    out = re.sub(r"</?x-dc>\n?", "", out)
    out = re.sub(r'<script type="text/x-dc".*?</script>\n?', "", out, flags=re.S)
    for canvas_name, page in PAGES.items():
        out = out.replace(f'href="{canvas_name}"', f'href="{page}"')
    return out


def main() -> None:
    for canvas_name, page in PAGES.items():
        source = (SRC / canvas_name).read_text(encoding="utf-8")
        (HERE / page).write_text(export(source), encoding="utf-8")
        print(f"{canvas_name} -> {page}")


if __name__ == "__main__":
    main()
