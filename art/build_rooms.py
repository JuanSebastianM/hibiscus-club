"""Turn the eighteen painted empty rooms into Dream House backdrops.

Usage (from the repo root):
    python3 -I art/build_rooms.py [--grid DIR]

Reads art/source/round2/rooms/room-<room>-<1|2|3>.webp (opaque paintings, drawn edge to edge
with no mat: ten at 2386 x 1792, eight at 1151 x 864) and writes
    dist/assets/decor/rooms/<room>-<n>.webp        the backdrop, 1536 x 1152
    dist/assets/decor/rooms/thumbs/<room>-<n>.webp a 192 x 144 swatch
The backdrop is the whole painting trimmed to exactly 4:3 (a row or two of ceiling, or a column
or two of side wall, split evenly) and resized to the decorator's room, 1536 x 1152 room pixels,
so geometry measured on the backdrop (art/measure_rooms.py) is in room pixels.

The large paintings are reduced with Lanczos. The small ones are enlarged 1.33 times: Lanczos
(sharper than bicubic on the ink lines, without its ringing at this small factor), then a light
unsharp mask so they hold up next to the large ones at the decorator's stage size.

With --grid DIR it also writes each backdrop with a labelled 50 px grid, for reading hints off
by eye. Deterministic and idempotent. Requires Pillow (with WebP).
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "source" / "round2" / "rooms"
OUT = ROOT / "dist" / "assets" / "decor" / "rooms"
ROOMS = ["bedroom", "kitchen", "living", "bathroom", "playroom", "patio"]
W, H = 1536, 1152
TW, TH = 192, 144
WEBP = dict(quality=80, method=6)
WEBP_THUMB = dict(quality=74, method=6)
# for the paintings smaller than the backdrop: radius in backdrop px, strength %, threshold
SHARPEN = dict(radius=1.1, percent=55, threshold=2)


def crop_box(img: Image.Image) -> tuple[int, int, int, int]:
    """The largest centred 4:3 box (the paintings are within a pixel or two of 4:3)."""
    w, h = img.size
    if w * 3 > h * 4:
        nw = round(h * 4 / 3)
        x0 = (w - nw) // 2
        return x0, 0, x0 + nw, h
    nh = round(w * 3 / 4)
    y0 = (h - nh) // 2
    return 0, y0, w, y0 + nh


def backdrop(src: Image.Image) -> Image.Image:
    box = crop_box(src)
    img = src.crop(box).resize((W, H), Image.LANCZOS)
    if box[2] - box[0] < W:
        img = img.filter(ImageFilter.UnsharpMask(**SHARPEN))
    return img


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
            img = backdrop(src)
            out = OUT / f"{name}.webp"
            img.save(out, "WEBP", **WEBP)
            th = OUT / "thumbs" / f"{name}.webp"
            img.resize((TW, TH), Image.LANCZOS).save(th, "WEBP", **WEBP_THUMB)
            total += out.stat().st_size
            thumbs += th.stat().st_size
            up = " (enlarged, sharpened)" if src.size[0] < W else ""
            print(f"{name}: {src.size[0]}x{src.size[1]} crop {crop_box(src)}{up} -> {out.stat().st_size:,} B, thumb {th.stat().st_size:,} B")
            if args.grid:
                grid(img, args.grid / f"{name}.png")
    print(f"backdrops {total:,} B, thumbnails {thumbs:,} B")


if __name__ == "__main__":
    main()
