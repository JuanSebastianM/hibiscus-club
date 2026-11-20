"""Crop the four figures of each base doll turnaround into dist/assets/dolls/.

Usage (from the repo root): python3 -I art/crop_dolls.py

The turnarounds hold four figures, columns front / left (faces viewer-left) /
right (faces viewer-right) / back, drawn at one scale on one foot baseline.
Alpha gets the same haze cleanup as art/slice.py: alpha <= 8 becomes 0,
>= 244 becomes 255, and RGB under alpha 0 is zeroed. Each crop keeps the source
resolution with PAD px of transparent margin around its own columns, and every
view uses the front figure's rows, so the feet sit on the same row in all four
pictures (the doll does not jump or resize when turned).

The script prints, per view, the crop box and the figure's x centroid inside
the crop; catalog.js places each view so that centroid lands on the front
figure's centroid (CATALOG.dolls[doll].views[view].origin).

The near arm of the side figures is not cut here: portrait.js masks it at
runtime with the doll-local polygon CATALOG.dolls[doll].views[view].arm.
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "assets" / "dolls"
HAZE, OPAQUE, PAD = 8, 244, 6
VIEWS = ("front", "left", "right", "back")


def runs(cols, min_width=20):
    out, x = [], 0
    while x < len(cols):
        if cols[x]:
            s = x
            while x < len(cols) and cols[x]:
                x += 1
            if x - s >= min_width:
                out.append((s, x))
        x += 1
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for doll in ("adult", "little"):
        arr = np.array(Image.open(ROOT / "art" / "source" / f"base-{doll}-turnaround.webp").convert("RGBA"))
        a = np.clip(np.rint((arr[..., 3].astype(np.float32) - HAZE) * 255 / (OPAQUE - HAZE)), 0, 255).astype(np.uint8)
        arr[..., 3] = a
        arr[a == 0] = 0
        figures = runs((a > 24).any(0))
        assert len(figures) == 4, (doll, figures)
        # rows of the front figure (unchanged from the original front-only crop)
        x0, x1 = figures[0]
        rows = np.nonzero((a[:, x0:x1] > 24).any(1))[0]
        by0, by1 = max(int(rows[0]) - PAD, 0), min(int(rows[-1]) + 1 + PAD, arr.shape[0])
        for view, (x0, x1) in zip(VIEWS, figures):
            bx0, bx1 = max(x0 - PAD, 0), min(x1 + PAD, arr.shape[1])
            crop = arr[by0:by1, bx0:bx1].copy()
            if view != "front":  # front stays byte-identical to the original crop
                # keep only this figure's columns (neighbouring haze)
                crop[:, : x0 - bx0] = 0
                crop[:, x1 - bx0:] = 0
            im = Image.fromarray(crop, "RGBA")
            im.save(OUT / f"{doll}-{view}.webp", "WEBP", quality=94, alpha_quality=100, method=6, exact=False)
            ys, xs = np.nonzero(crop[..., 3] > 128)
            print(doll, view, (bx0, by0, bx1, by1), im.size, "centroid x %.1f" % xs.mean())


if __name__ == "__main__":
    main()
