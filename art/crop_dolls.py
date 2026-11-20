"""Crop the front figure of each base doll turnaround into dist/assets/dolls/.

Usage (from the repo root): python3 -I art/crop_dolls.py

The turnarounds hold four figures (front, left, right, back). Only the front
figure is shipped for now. Alpha gets the same haze cleanup as art/slice.py:
alpha <= 8 becomes 0, >= 244 becomes 255, and RGB under alpha 0 is zeroed.
The crop keeps the source resolution with PAD px of transparent margin.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "assets" / "dolls"
HAZE, OPAQUE, PAD = 8, 244, 6

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for doll in ("adult", "little"):
        arr = np.array(Image.open(ROOT / "art" / "source" / f"base-{doll}-turnaround.webp").convert("RGBA"))
        a = np.clip(np.rint((arr[..., 3].astype(np.float32) - HAZE) * 255 / (OPAQUE - HAZE)), 0, 255).astype(np.uint8)
        arr[..., 3] = a
        arr[a == 0] = 0
        cols = (a > 24).any(0)
        # first run of occupied columns = the front figure
        x0 = int(np.argmax(cols)); x1 = x0
        while x1 < len(cols) and cols[x1]: x1 += 1
        rows = np.nonzero((a[:, x0:x1] > 24).any(1))[0]
        y0, y1 = int(rows[0]), int(rows[-1]) + 1
        bx0, by0 = max(x0 - PAD, 0), max(y0 - PAD, 0)
        bx1, by1 = min(x1 + PAD, arr.shape[1]), min(y1 + PAD, arr.shape[0])
        # zero anything outside the figure's columns (neighbouring haze)
        crop = arr[by0:by1, bx0:bx1].copy()
        im = Image.fromarray(crop, "RGBA")
        im.save(OUT / f"{doll}-front.webp", "WEBP", quality=94, alpha_quality=100, method=6, exact=False)
        print(doll, "front", (bx0, by0, bx1, by1), im.size)

if __name__ == "__main__":
    main()
