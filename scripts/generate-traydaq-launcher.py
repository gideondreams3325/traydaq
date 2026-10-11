#!/usr/bin/env python3
"""Render crisp, mask-safe TRAYDAQ Android icons from the vector brand mark.

Run after npx cap sync android, before Gradle, so Capacitor cannot restore
older raster launcher art. Never reads or publishes private application data.
"""
from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path
import re

import cairosvg
from PIL import Image, ImageDraw

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def centered_mark(mark: Image.Image, size: int, fraction: float, background: str) -> Image.Image:
    """Place complete artwork inside the Android launcher safe area."""
    if background == "transparent":
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        if background == "round":
            mask = Image.new("L", (size, size), 0)
            ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
            canvas.putalpha(mask)
    target = round(size * fraction)
    ratio = min(target / mark.width, target / mark.height)
    graphic = mark.resize((round(mark.width * ratio), round(mark.height * ratio)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(graphic, ((size - graphic.width) // 2, (size - graphic.height) // 2))
    return canvas


def write_launcher(root: Path, svg: Path) -> None:
    android = root / "android/app/src/main"
    if not (android / "AndroidManifest.xml").is_file():
        raise SystemExit("AndroidManifest.xml missing; run this after Capacitor Android setup")
    if not svg.is_file():
        raise SystemExit("Brand mark SVG missing")
    source = Image.open(BytesIO(cairosvg.svg2png(url=str(svg), output_width=2048, output_height=2048))).convert("RGBA")
    bbox = source.getbbox()
    if not bbox:
        raise SystemExit("TRAYDAQ vector logo is blank")
    source = source.crop(bbox)

    for density, scale in DENSITIES.items():
        folder = android / "res" / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        legacy = round(48 * scale)
        adaptive = round(108 * scale)
        # Legacy art within 70%; adaptive foreground within central 2/3 safe circle.
        centered_mark(source, legacy, .70, "white").save(folder / "ic_launcher.png", optimize=True)
        centered_mark(source, legacy, .64, "round").save(folder / "ic_launcher_round.png", optimize=True)
        centered_mark(source, adaptive, .61, "transparent").save(folder / "ic_launcher_foreground.png", optimize=True)

    xml_folder = android / "res/mipmap-anydpi-v26"
    xml_folder.mkdir(parents=True, exist_ok=True)
    xml = ('<?xml version="1.0" encoding="utf-8"?>\n'
           '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
           '  <background android:drawable="@color/traydaq_launcher_bg" />\n'
           '  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n'
           '</adaptive-icon>\n')
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (xml_folder / name).write_text(xml, encoding="utf-8")

    values = android / "res/values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "traydaq_launcher_bg.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        '  <color name="traydaq_launcher_bg">#FFFFFFFF</color>\n</resources>\n', encoding="utf-8")
    manifest = android / "AndroidManifest.xml"
    old = manifest.read_text(encoding="utf-8")
    match = re.search(r"<application\b[^>]*>", old, re.S)
    if not match:
        raise SystemExit("Android application declaration missing in manifest")
    application = match.group(0)
    for key, replacement in (("icon", "@mipmap/ic_launcher"),
                             ("roundIcon", "@mipmap/ic_launcher_round")):
        pattern = rf'android:{key}="[^"]*"'
        if re.search(pattern, application):
            application = re.sub(pattern, f'android:{key}="{replacement}"', application, count=1)
        else:
            application = application.replace("<application", f'<application android:{key}="{replacement}"', 1)
    manifest.write_text(old[:match.start()] + application + old[match.end():], encoding="utf-8")
    centered_mark(source, 512, .70, "white").save(android / "traydaq_launcher_512.png", optimize=True)
    print("PASS: complete TRAYDAQ logo with safe padding at 5 densities plus Android adaptive icons")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path, help="Private app checkout root on Android build runner")
    parser.add_argument("svg", type=Path, help="Public vector brand mark")
    args = parser.parse_args()
    write_launcher(args.root.resolve(), args.svg.resolve())


if __name__ == "__main__":
    main()
