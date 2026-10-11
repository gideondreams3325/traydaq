#!/usr/bin/env python3
"""Regression checks for launcher icon quality and crop safety."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

SCRIPT = Path(__file__).parent / "generate-traydaq-launcher.py"
SVG = Path(__file__).parent / "traydaq-launcher-mark.svg"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

class TraydaqIconTest(unittest.TestCase):
    def test_complete_logo_not_masked_and_every_density_fresh(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            main = root / "android/app/src/main"
            main.mkdir(parents=True)
            manifest = main / "AndroidManifest.xml"
            manifest.write_text(
                '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
                '<application android:icon="@mipmap/old_icon" android:label="TRAYDAQ"></application></manifest>'
            )
            subprocess.run([sys.executable, str(SCRIPT), str(root), str(SVG)], check=True, capture_output=True)
            text = manifest.read_text()
            self.assertIn('android:icon="@mipmap/ic_launcher"', text)
            self.assertIn('android:roundIcon="@mipmap/ic_launcher_round"', text)
            self.assertIn('android:label="TRAYDAQ"', text)
            for density, scale in DENSITIES.items():
                folder = main / "res" / f"mipmap-{density}"
                for filename, dims, max_fraction in (
                    ("ic_launcher.png", round(48 * scale), .75),
                    ("ic_launcher_round.png", round(48 * scale), .75),
                    ("ic_launcher_foreground.png", round(108 * scale), .68),
                ):
                    img = Image.open(folder / filename).convert("RGBA")
                    self.assertEqual(img.size, (dims, dims))
                    pixels = img.load()
                    visible = [(x, y) for y in range(dims) for x in range(dims)
                               if (lambda p: p[3] > 120 and p[1] < 190 and p[0] < 245)(pixels[x, y])]
                    self.assertTrue(visible, filename)
                    left, right = min(x for x, _ in visible), max(x for x, _ in visible)
                    top, bottom = min(y for _, y in visible), max(y for _, y in visible)
                    self.assertGreater(left, dims * .10, filename)
                    self.assertLess(right, dims * .90, filename)
                    self.assertGreater(top, dims * .10, filename)
                    self.assertLess(bottom, dims * .90, filename)
                    self.assertLessEqual(right - left + 1, dims * max_fraction + 2)
            xml = (main / "res/mipmap-anydpi-v26/ic_launcher.xml").read_text()
            self.assertIn("@mipmap/ic_launcher_foreground", xml)
            self.assertIn("@color/traydaq_launcher_bg", xml)
            self.assertTrue((main / "traydaq_launcher_512.png").exists())

if __name__ == "__main__":
    unittest.main()
