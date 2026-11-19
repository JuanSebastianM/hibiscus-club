"""Slice the Hibiscus Club item sheets into trimmed transparent sprites.

Usage (from the repo root):
    python3 -I art/slice.py [--contact DIR]

Reads the five 1536x1024 RGBA sheets in art/source/ and writes
dist/assets/items/<category>/<id>.webp plus dist/assets/items/manifest.json.
With --contact DIR it also writes labeled contact sheets for review.

Requires Pillow (with WebP) and numpy. Deterministic: running it twice gives
the same files.

How items are found
-------------------
* Each sheet holds a 3x2 arrangement of items on real transparency. Item
  bounds come from the alpha channel: pixels with alpha >= SOLID_ALPHA are
  grouped into 8-connected components (on a 4x max-pooled grid for speed),
  and components are assigned to an item by which third/half of the sheet
  their centroid falls in. The crop is the union of the item's components,
  so an item that crosses a nominal grid line is never clipped, and pixels
  belonging to a neighbor's components are never included.
* Pairs (earrings, shoes) are split at the widest empty column gap near the
  middle of the pair; the pajama set is split at the empty row gap between
  top and trousers.

Edge cleanup (see clean_alpha / decontaminate)
----------------------------------------------
* The sheets were exported with alpha that tops out at 252-254 (never 255),
  plus a faint alpha 1-8 haze: blotches across the empty background and a
  2-12 px soft "ghost" glow around every item. clean_alpha() remaps alpha
  linearly so that <= HAZE_ALPHA becomes 0 and >= OPAQUE_ALPHA becomes 255.
  Real edge pixels, hair wisps and chain links sit well above the haze level
  and survive (they actually get slightly more opaque).
* Fully transparent pixels get RGB zeroed (the sheets carry saturated junk
  colors under alpha 0, which can bleed in when a browser scales a sprite).
* decontaminate() pulls semi-transparent edge pixels that are much lighter
  than the opaque pixels next to them toward the local opaque color, in
  proportion to their transparency, to remove any white matte fringe.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "source"
OUT = ROOT / "dist" / "assets" / "items"

SOLID_ALPHA = 24      # alpha that counts as "part of an item" for bounds
HAZE_ALPHA = 8        # alpha at or below this is background haze -> 0
OPAQUE_ALPHA = 244    # alpha at or above this becomes fully opaque
POOL = 4              # max-pool factor for connected components
MIN_CELLS = 3         # ignore pooled components smaller than this
GROW = 3              # px of dilation around an item's solid pixels
PAD = 2               # transparent padding around each sprite
WEBP = dict(lossless=True, quality=100, method=6, exact=False)

# (sheet file, category for row 0, category for row 1, [[row0 ids], [row1 ids]])
SHEETS = [
    ("sheet-outfits-adult.webp", "outfits-adult", "outfits-adult", [
        ["hibiscus-flares", "lilac-satin-bow-dress", "denim-jacket-skirt"],
        ["green-hibiscus-sundress", "black-flares-set", "pink-velour-cargo"],
    ]),
    ("sheet-hair.webp", "hair", "hair", [
        ["long-waves", "side-ponytail", "half-up-curls"],
        ["ringlet-pigtails", "curly-buns", "curly-bob"],
    ]),
    ("sheet-outfits-little.webp", "outfits-little", "outfits-little", [
        ["yellow-dot-dress", "lilac-cord-pinafore", "pink-gingham-bow-dress"],
        ["denim-overalls", "mint-cardigan-dress", "star-pajamas"],
    ]),
    ("sheet-jewelry-clips.webp", "jewelry", "jewelry", [
        ["gold-hoops", "pearl-starfish-necklace", "butterfly-necklace"],
        ["hibiscus-clip", "butterfly-clip", "red-bow"],
    ]),
    ("sheet-shoes.webp", "shoes-adult", "shoes-little", [
        ["black-platform-sandals", "lilac-mary-jane-heels", "pink-chunky-sneakers"],
        ["red-mary-janes", "white-velcro-sneakers", "strawberry-rain-boots"],
    ]),
]

NAMES = {
    "hibiscus-flares": "Hibiscus Flares",
    "lilac-satin-bow-dress": "Lilac Satin Bow Dress",
    "denim-jacket-skirt": "Double Denim Darling",
    "green-hibiscus-sundress": "Hibiscus Sundae Sundress",
    "black-flares-set": "Midnight Mall Flares",
    "pink-velour-cargo": "Pink Velour Weekend",
    "long-waves": "Beach Babe Waves",
    "side-ponytail": "Sassy Side Pony",
    "half-up-curls": "Half-Up Curl Cascade",
    "ringlet-pigtails": "Ringlet Pigtails",
    "curly-buns": "Cutie Curl Buns",
    "curly-bob": "Bouncy Curly Bob",
    "yellow-dot-dress": "Lemon Drop Dot Dress",
    "lilac-cord-pinafore": "Lilac Daisy Pinafore",
    "pink-gingham-bow-dress": "Pink Picnic Gingham Dress",
    "denim-overalls": "Peachy Heart Overalls",
    "mint-cardigan-dress": "Mint Blossom Cardi Dress",
    "star-pajamas": "Starry Sleepover PJs",
    "gold-hoops": "Golden Glam Hoops",
    "pearl-starfish-necklace": "Pearl & Starfish Necklace",
    "butterfly-necklace": "Butterfly Kisses Necklace",
    "hibiscus-clip": "Hibiscus Hair Clip",
    "butterfly-clip": "Flutter Butterfly Clip",
    "red-bow": "Cherry Red Bow",
    "black-platform-sandals": "Black Platform Sandals",
    "lilac-mary-jane-heels": "Lilac Mary Jane Heels",
    "pink-chunky-sneakers": "Pink Chunky Sneakers",
    "red-mary-janes": "Cherry Mary Janes",
    "white-velcro-sneakers": "Sweetheart Velcro Sneakers",
    "strawberry-rain-boots": "Strawberry Puddle Boots",
}

PAIRS = {"gold-hoops", "black-platform-sandals", "lilac-mary-jane-heels",
         "pink-chunky-sneakers", "red-mary-janes", "white-velcro-sneakers",
         "strawberry-rain-boots"}
STACKED = {"star-pajamas": ("top", "trousers")}


# ----------------------------------------------------------------- helpers

def box_sum(x: np.ndarray, r: int) -> np.ndarray:
    """Sum over a (2r+1)^2 window, zero outside the image."""
    p = np.pad(x, ((r + 1, r), (r + 1, r)))
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]


def dilate(m: np.ndarray, r: int) -> np.ndarray:
    return box_sum(m.astype(np.int32), r) > 0


def label(mask: np.ndarray, conn8: bool = True):
    """Connected components of a small boolean array. Returns (labels, n)."""
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    nb = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if conn8:
        nb += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if lab[y0, x0]:
            continue
        n += 1
        lab[y0, x0] = n
        q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy, dx in nb:
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
    return lab, n


def clean_alpha(a: np.ndarray) -> np.ndarray:
    a = a.astype(np.float32)
    out = (a - HAZE_ALPHA) * (255.0 / (OPAQUE_ALPHA - HAZE_ALPHA))
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def decontaminate(rgb: np.ndarray, alpha: np.ndarray, r: int = 3,
                  margin: float = 30.0) -> tuple[np.ndarray, int]:
    """Darken light-fringed edge pixels toward the nearby opaque color."""
    rgb = rgb.astype(np.float32)
    opaque = (alpha >= 250).astype(np.float32)
    wsum = box_sum(opaque, r)
    csum = np.stack([box_sum(rgb[..., c] * opaque, r) for c in range(3)], -1)
    edge = (alpha > 0) & (alpha < 230) & (wsum >= 3)
    local = np.zeros_like(rgb)
    local[edge] = csum[edge] / wsum[edge][:, None]
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    llum = local @ np.array([0.299, 0.587, 0.114], np.float32)
    fix = edge & (lum > llum + margin)
    t = (alpha[fix].astype(np.float32) / 255.0)[:, None]
    rgb[fix] = local[fix] + (rgb[fix] - local[fix]) * t
    return np.clip(np.rint(rgb), 0, 255).astype(np.uint8), int(fix.sum())


def trim_box(alpha: np.ndarray):
    ys = np.nonzero(alpha.any(1))[0]
    xs = np.nonzero(alpha.any(0))[0]
    return int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1


def split_point(solid: np.ndarray, axis: int):
    """Index along `axis` (0=rows, 1=cols) to split a pair at the widest
    empty gap in the middle 60%. Returns (index, gap_width)."""
    prof = solid.sum(axis=1 - axis)
    n = len(prof)
    lo, hi = int(n * 0.2), int(n * 0.8)
    best = (0, None)
    i = lo
    while i < hi:
        if prof[i] == 0:
            j = i
            while j < hi and prof[j] == 0:
                j += 1
            if j - i > best[0]:
                best = (j - i, (i + j) // 2)
            i = j
        else:
            i += 1
    if best[1] is not None:
        return best[1], best[0]
    return lo + int(np.argmin(prof[lo:hi])), 0


def face_hole(alpha: np.ndarray):
    """Largest transparent region with hair above it and hair on both sides
    in the same row: the face/neck window of a hair sprite."""
    hair = alpha >= 128
    above = np.maximum.accumulate(hair, axis=0)
    left = np.maximum.accumulate(hair, axis=1)
    right = np.maximum.accumulate(hair[:, ::-1], axis=1)[:, ::-1]
    cand = (alpha == 0) & above & left & right
    if not cand.any():
        return None
    # label on a 2x pooled grid, then take the biggest component
    h, w = cand.shape
    ph, pw = (h + 1) // 2, (w + 1) // 2
    pooled = np.zeros((ph * 2, pw * 2), bool)
    pooled[:h, :w] = cand
    pooled = pooled.reshape(ph, 2, pw, 2).all(axis=(1, 3))
    lab, n = label(pooled, conn8=False)
    if n == 0:
        return None
    sizes = np.bincount(lab.ravel())[1:]
    big = 1 + int(np.argmax(sizes))
    region = np.repeat(np.repeat(lab == big, 2, 0), 2, 1)[:h, :w] & cand
    x0, y0, x1, y1 = trim_box(region)
    closed_bottom = bool(hair[y1:, x0:x1].any(axis=0).all()) if y1 < h else False
    return {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0,
            "area": int(region.sum()), "closedBelow": closed_bottom}


def save(img: Image.Image, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", **WEBP)
    return path.stat().st_size


# ------------------------------------------------------------------- main

def slice_sheet(fname, cats, ids, report):
    im = Image.open(SRC / fname).convert("RGBA")
    arr = np.array(im)
    H, W = arr.shape[:2]
    raw_a = arr[..., 3]
    alpha = clean_alpha(raw_a)
    rgb, nfix = decontaminate(arr[..., :3], alpha)
    rgb[alpha == 0] = 0
    report["decontaminated_px"][fname] = nfix
    report["haze_px_removed"][fname] = int(((raw_a > 0) & (alpha == 0)).sum())

    # components of solid pixels on a pooled grid
    solid = raw_a >= SOLID_ALPHA
    ph, pw = H // POOL, W // POOL
    pooled = solid[:ph * POOL, :pw * POOL].reshape(ph, POOL, pw, POOL).any(axis=(1, 3))
    lab, n = label(pooled)
    groups = {(r, c): [] for r in range(2) for c in range(3)}
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < MIN_CELLS:
            report["ignored_specks"].append((fname, k, len(ys)))
            continue
        cy, cx = ys.mean() * POOL, xs.mean() * POOL
        cell = (min(int(cy / (H / 2)), 1), min(int(cx / (W / 3)), 2))
        groups[cell].append(k)
        # flag components spanning cells (would mean two items touch)
        x0, x1 = xs.min() * POOL, (xs.max() + 1) * POOL
        if int(x0 / (W / 3)) != int((x1 - 1) / (W / 3)) or \
           int(ys.min() * POOL / (H / 2)) != int(((ys.max() + 1) * POOL - 1) / (H / 2)):
            report["crosses_grid"].append((fname, ids[cell[0]][cell[1]]))

    pooled_masks = {}
    for cell, ks in groups.items():
        m = np.isin(lab, ks)
        full = np.zeros((H, W), bool)
        full[:ph * POOL, :pw * POOL] = np.repeat(np.repeat(m, POOL, 0), POOL, 1)
        pooled_masks[cell] = full & solid

    items = []
    for cell, own in pooled_masks.items():
        r, c = cell
        item_id = ids[r][c]
        cat = cats[r]
        if not own.any():
            raise SystemExit(f"{fname}: no pixels found for {item_id}")
        others = np.zeros((H, W), bool)
        for oc, om in pooled_masks.items():
            if oc != cell:
                others |= om
        region = dilate(own, GROW) & ~dilate(others, GROW)
        a_item = np.where(region, alpha, 0).astype(np.uint8)
        x0, y0, x1, y1 = trim_box(a_item)
        x0, y0 = x0 - PAD, y0 - PAD
        x1, y1 = x1 + PAD, y1 + PAD
        if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
            report["touches_edge"].append(item_id)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        sub_a = a_item[y0:y1, x0:x1]
        sub_rgb = np.where(sub_a[..., None] > 0, rgb[y0:y1, x0:x1], 0).astype(np.uint8)
        sprite = Image.fromarray(np.dstack([sub_rgb, sub_a]), "RGBA")
        items.append(dict(id=item_id, category=cat, sprite=sprite, sheet=fname,
                          sheet_box=[x0, y0, x1 - x0, y1 - y0],
                          own=own[y0:y1, x0:x1], raw_a=raw_a[y0:y1, x0:x1],
                          raw_rgb=arr[y0:y1, x0:x1, :3]))
    return items


def sub_sprite(sprite: Image.Image, keep: np.ndarray):
    a = np.array(sprite)
    a[..., 3] = np.where(keep, a[..., 3], 0)
    a[a[..., 3] == 0] = 0
    x0, y0, x1, y1 = trim_box(a[..., 3])
    x0, y0 = max(x0 - PAD, 0), max(y0 - PAD, 0)
    x1, y1 = min(x1 + PAD, a.shape[1]), min(y1 + PAD, a.shape[0])
    return Image.fromarray(a[y0:y1, x0:x1], "RGBA"), (x0, y0)


def build(contact_dir: Path | None):
    report = dict(decontaminated_px={}, haze_px_removed={}, ignored_specks=[],
                  crosses_grid=[], touches_edge=[], splits={}, hair_raw={})
    manifest = {"version": 1,
                "note": "Generated by art/slice.py. Paths are relative to this file. "
                        "offset = position of a part inside the item's full sprite; "
                        "faceHole = transparent face/neck window in sprite px.",
                "items": {}}
    total = 0
    all_items = []
    for fname, cat0, cat1, ids in SHEETS:
        all_items += slice_sheet(fname, (cat0, cat1), ids, report)

    for it in all_items:
        iid, cat, spr = it["id"], it["category"], it["sprite"]
        rel = f"{cat}/{iid}.webp"
        total += save(spr, OUT / rel)
        entry = {"category": cat, "name": NAMES[iid], "file": rel,
                 "width": spr.width, "height": spr.height,
                 "source": {"sheet": f"art/source/{it['sheet']}",
                            "box": it["sheet_box"]}}
        it["parts"] = {}
        a = np.array(spr)[..., 3]
        if iid in PAIRS or iid in STACKED:
            axis = 1 if iid in PAIRS else 0
            idx, gap = split_point(a >= SOLID_ALPHA, axis)
            names = ("left", "right") if axis == 1 else STACKED[iid]
            report["splits"][iid] = {"axis": "x" if axis else "y", "at": idx, "gap_px": gap}
            parts = {}
            for k, pname in enumerate(names):
                keep = np.zeros_like(a, bool)
                if axis == 1:
                    (keep[:, :idx] if k == 0 else keep[:, idx:])[...] = True
                else:
                    (keep[:idx, :] if k == 0 else keep[idx:, :])[...] = True
                part, off = sub_sprite(spr, keep)
                prel = f"{cat}/{iid}-{pname}.webp"
                total += save(part, OUT / prel)
                parts[pname] = {"file": prel, "width": part.width,
                                "height": part.height, "offset": list(off)}
                it["parts"][pname] = part
            entry["parts"] = parts
        if cat == "hair":
            hole = face_hole(a)
            entry["faceHole"] = hole
            it["hole"] = hole
            if hole:
                hx, hy, hw, hh = hole["x"], hole["y"], hole["w"], hole["h"]
                ra = it["raw_a"][hy:hy + hh, hx:hx + hw]
                rr = it["raw_rgb"][hy:hy + hh, hx:hx + hw]
                # raw alpha inside the strict hole interior (4px in from hair)
                inner = (np.array(spr)[hy:hy + hh, hx:hx + hw, 3] == 0)
                inner &= ~dilate(np.array(spr)[hy:hy + hh, hx:hx + hw, 3] > 0, 4)
                vals = ra[inner]
                nz = vals > 0
                report["hair_raw"][iid] = {
                    "raw_alpha_max": int(vals.max()) if vals.size else None,
                    "raw_alpha_nonzero_frac": round(float(nz.mean()), 3) if vals.size else None,
                    "raw_rgb_mean_where_nonzero": [round(float(v)) for v in rr[inner][nz].mean(0)] if nz.any() else None,
                }
        manifest["items"][iid] = entry

    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    report["total_bytes"] = total
    if contact_dir:
        contact(all_items, contact_dir)
    return manifest, report


# --------------------------------------------------------------- contact

def contact(items, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    try:
        font = ImageFont.load_default(size=18)
    except TypeError:
        font = ImageFont.load_default()
    cats = []
    for it in items:
        if it["category"] not in cats:
            cats.append(it["category"])
    for bgname, bg in (("pink", (231, 122, 176, 255)), ("dark", (24, 22, 34, 255))):
        for cat in cats:
            tiles = []
            for it in items:
                if it["category"] != cat:
                    continue
                tiles.append((it["id"], it["sprite"], it.get("hole")))
                for pname, p in it.get("parts", {}).items():
                    tiles.append((f"{it['id']}-{pname}", p, None))
            cell = 520
            cols = 3 if len(tiles) <= 6 else 4
            rows = (len(tiles) + cols - 1) // cols
            sheet = Image.new("RGBA", (cols * cell, rows * cell), bg)
            d = ImageDraw.Draw(sheet)
            for i, (name, spr, hole) in enumerate(tiles):
                cx, cy = (i % cols) * cell, (i // cols) * cell
                s = min((cell - 40) / spr.width, (cell - 40) / spr.height, 1.0)
                sp = spr.resize((max(1, round(spr.width * s)), max(1, round(spr.height * s))),
                                Image.LANCZOS) if s < 1 else spr
                ox, oy = cx + (cell - sp.width) // 2, cy + 30
                d.rectangle([ox - 1, oy - 1, ox + sp.width, oy + sp.height],
                            outline=(255, 255, 255, 90))
                sheet.alpha_composite(sp, (ox, oy))
                if hole:
                    d.rectangle([ox + hole["x"] * s, oy + hole["y"] * s,
                                 ox + (hole["x"] + hole["w"]) * s,
                                 oy + (hole["y"] + hole["h"]) * s],
                                outline=(0, 255, 255, 255), width=2)
                d.text((cx + 8, cy + 4), f"{name}  {spr.width}x{spr.height}",
                       fill=(255, 255, 255, 255), font=font,
                       stroke_width=2, stroke_fill=(0, 0, 0, 255))
            sheet.convert("RGB").save(outdir / f"{cat}-{bgname}.png")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--contact", type=Path, help="write review contact sheets here")
    ap.add_argument("--report", action="store_true", help="print a JSON report")
    args = ap.parse_args(argv)
    manifest, report = build(args.contact)
    if args.report:
        print(json.dumps(report, indent=1, default=str))
    n = sum(1 + len(e.get("parts", {})) for e in manifest["items"].values())
    print(f"{len(manifest['items'])} items, {n} sprites, {report['total_bytes']} bytes",
          file=sys.stderr)


if __name__ == "__main__":
    main()
