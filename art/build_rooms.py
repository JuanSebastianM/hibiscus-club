"""Turn the eighteen painted empty rooms into Dream House backdrops.

Usage (from the repo root):
    python3 -I art/build_rooms.py [--grid DIR]

Reads art/source/pack2/07-house-decorator/room-<room>-<1|2|3>.webp (opaque
2388x1792 paintings) and writes
    dist/assets/decor/rooms/<room>-<n>.webp        the backdrop, 1536 x 1152
    dist/assets/decor/rooms/thumbs/<room>-<n>.webp a 192 x 144 swatch
The backdrop is the painting with its outer border or mat cropped away and
trimmed to exactly 4:3 (the decorator's room is 1536 x 1152 room pixels), so
geometry measured on the backdrop (art/measure_rooms.py) is in room pixels.
With --grid DIR it also writes each backdrop with a labeled 50 px grid, for
reading hints off by eye.

Border detection: rows and columns are walked inward from each edge while
they stay one flat colour (the mat); a few pixels more are taken for the
soft inner edge of the mat. Rooms painted edge to edge (the patios and the
playrooms) are listed in BLEED and are not cropped. If the cropped picture
is wider than 4:3 its sides are trimmed evenly (side walls only); if it is
taller, the top is trimmed (ceiling only).

Deterministic and idempotent. Requires Pillow (with WebP) and numpy.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "source" / "pack2" / "07-house-decorator"
OUT = ROOT / "dist" / "assets" / "decor" / "rooms"
ROOMS = ["bedroom", "kitchen", "living", "bathroom", "playroom", "patio"]
W, H = 1536, 1152
TW, TH = 192, 144
BLEED = {"patio", "playroom"}   # painted edge to edge: no mat to crop
EXTRA = 10                      # px (source) taken beyond the flat mat: its soft inner edge
WEBP = dict(quality=80, method=6)
WEBP_THUMB = dict(quality=74, method=6)


def border(a: np.ndarray) -> tuple[int, int, int, int]:
    """(left, top, right, bottom) widths of a flat-coloured mat around the painting."""
    h, w, _ = a.shape

    def run(lines):
        ref = lines[0].mean(0)
        for i, line in enumerate(lines):
            if np.median(np.abs(line - ref).mean(1)) > 12 or line.std(0).mean() > 14:
                return i
        return len(lines)

    top = run([a[i, w // 4:3 * w // 4] for i in range(300)])
    bot = run([a[h - 1 - i, w // 4:3 * w // 4] for i in range(300)])
    left = run([a[h // 4:3 * h // 4, i] for i in range(300)])
    right = run([a[h // 4:3 * h // 4, w - 1 - i] for i in range(300)])
    return left, top, right, bot


def crop_box(name: str, img: Image.Image) -> tuple[int, int, int, int]:
    w, h = img.size
    if name.split("-")[0] in BLEED:
        l = t = r = b = 0
    else:
        a = np.asarray(img.convert("RGB")).astype(float)
        l, t, r, b = (v + EXTRA for v in border(a))
    x0, y0, x1, y1 = l, t, w - r, h - b
    cw, ch = x1 - x0, y1 - y0
    if cw * 3 > ch * 4:          # too wide: trim the sides evenly
        nw = round(ch * 4 / 3)
        x0 += (cw - nw) // 2
        x1 = x0 + nw
    elif cw * 3 < ch * 4:        # too tall: trim the ceiling
        nh = round(cw * 3 / 4)
        y0 = y1 - nh
    return x0, y0, x1, y1


def grid(img: Image.Image, path: Path) -> None:
    g = img.convert("RGB").copy()
    d = ImageDraw.Draw(g)
    for x in range(0, W, 50):
        d.line([(x, 0), (x, H)], fill=(0, 0, 0) if x % 100 else (255, 0, 0), width=1)
        if x % 100 == 0:
            d.text((x + 2, 2), str(x), fill=(255, 0, 0))
            d.text((x + 2, H - 14), str(x), fill=(255, 0, 0))
    for y in range(0, H, 50):
        d.line([(0, y), (W, y)], fill=(0, 0, 0) if y % 100 else (255, 0, 0), width=1)
        if y % 100 == 0:
            d.text((2, y + 2), str(y), fill=(255, 0, 0))
            d.text((W - 30, y + 2), str(y), fill=(255, 0, 0))
    g.save(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", type=Path)
    args = ap.parse_args()
    (OUT / "thumbs").mkdir(parents=True, exist_ok=True)
    if args.grid:
        args.grid.mkdir(parents=True, exist_ok=True)
    total = 0
    thumbs = 0
    for room in ROOMS:
        for n in (1, 2, 3):
            name = f"{room}-{n}"
            src = Image.open(SRC / f"room-{name}.webp").convert("RGB")
            box = crop_box(name, src)
            img = src.crop(box).resize((W, H), Image.LANCZOS)
            out = OUT / f"{name}.webp"
            img.save(out, "WEBP", **WEBP)
            th = OUT / "thumbs" / f"{name}.webp"
            img.resize((TW, TH), Image.LANCZOS).save(th, "WEBP", **WEBP_THUMB)
            total += out.stat().st_size
            thumbs += th.stat().st_size
            print(f"{name}: crop {box} -> {out.stat().st_size:,} B, thumb {th.stat().st_size:,} B")
            if args.grid:
                grid(img, args.grid / f"{name}.png")
    print(f"backdrops {total:,} B, thumbnails {thumbs:,} B")


if __name__ == "__main__":
    main()
