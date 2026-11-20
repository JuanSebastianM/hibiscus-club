"""Slice the Hibiscus Club turnaround sheets into per-view sprites.

Usage (from the repo root):
    python3 -I art/slice_views.py [--contact DIR] [--report]

Reads the ten RGBA sheets in art/source/views/ and writes
dist/assets/items/views/<category>/<id>-<view>.webp (view = front, left,
right, back) plus dist/assets/items/views/manifest.json. With --contact DIR it
also writes labeled contact sheets (over pink and over dark) for review.

Each sheet is a grid of 3 rows (items) x 4 columns (views) in the order
front, left, right, back. "left" is the column whose figure faces viewer-left
(nose/toes pointing to the left edge of the image), "right" faces viewer-right;
this matches columns 2 and 3 of art/source/base-*-turnaround.webp. One sheet
row is drawn the other way round (see SWAP_SIDES) and is swapped on output.

Detection and cleanup are the same as art/slice.py, whose helpers are
imported (slice.py itself is not modified):
* Items are found from the alpha channel: solid pixels (alpha >= SOLID_ALPHA)
  are grouped into 8-connected components on a 4x max-pooled grid; each
  component goes to the grid cell (row = third of the sheet height, column =
  quarter of the width) holding its centroid. Tiny components (stray wisps,
  chain links) join the nearest item component within SPECK_REACH px, or are
  dropped and reported if nothing is near. The crop is the union of the item's
  components grown by GROW px, minus anything within GROW px of another item,
  so tall items that cross a nominal row line are never clipped and neighbors
  never leak in.
* Alpha: haze <= HAZE_ALPHA -> 0, >= OPAQUE_ALPHA -> 255 (linear stretch);
  RGB zeroed under alpha 0; light-fringe decontamination near opaque pixels.
* Pairs (shoes front/back, earrings in every view) are split at the widest
  empty column gap into -l / -r halves (viewer's left / right); the pajama set
  is split at the empty row gap into -top / -trousers.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("hc_slice", HERE / "slice.py")
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)

ROOT = HERE.parent
SRC = ROOT / "art" / "source" / "views"
OUT = ROOT / "dist" / "assets" / "items" / "views"
FRONT_MANIFEST = ROOT / "dist" / "assets" / "items" / "manifest.json"

VIEWS = ("front", "left", "right", "back")
EDGE = 8              # transparent border added around each sheet
SPECK_REACH = 24      # px: tiny components this close to an item join it

# (sheet, category, [row0 id, row1 id, row2 id])
SHEETS = [
    ("views-outfits-adult-a.webp", "outfits-adult",
     ["hibiscus-flares", "lilac-satin-bow-dress", "denim-jacket-skirt"]),
    ("views-outfits-adult-b.webp", "outfits-adult",
     ["green-hibiscus-sundress", "black-flares-set", "pink-velour-cargo"]),
    ("views-outfits-little-a.webp", "outfits-little",
     ["yellow-dot-dress", "lilac-cord-pinafore", "pink-gingham-bow-dress"]),
    ("views-outfits-little-b.webp", "outfits-little",
     ["denim-overalls", "mint-cardigan-dress", "star-pajamas"]),
    ("views-hair-adult.webp", "hair", ["long-waves", "side-ponytail", "half-up-curls"]),
    ("views-hair-little.webp", "hair", ["ringlet-pigtails", "curly-buns", "curly-bob"]),
    ("views-shoes-adult.webp", "shoes-adult",
     ["black-platform-sandals", "lilac-mary-jane-heels", "pink-chunky-sneakers"]),
    ("views-shoes-little.webp", "shoes-little",
     ["red-mary-janes", "white-velcro-sneakers", "strawberry-rain-boots"]),
    ("views-jewelry.webp", "jewelry",
     ["gold-hoops", "pearl-starfish-necklace", "butterfly-necklace"]),
    ("views-clips.webp", "jewelry", ["hibiscus-clip", "butterfly-clip", "red-bow"]),
]

SHOES = {"black-platform-sandals", "lilac-mary-jane-heels", "pink-chunky-sneakers",
         "red-mary-janes", "white-velcro-sneakers", "strawberry-rain-boots"}


def pair_views(iid: str):
    """Views in which the item is drawn as a left/right pair."""
    if iid == "gold-hoops":
        return VIEWS
    if iid in SHOES:
        return ("front", "back")
    return ()


STACKED = {"star-pajamas": ("top", "trousers")}

# Items whose two side columns are drawn the other way round (column 2 faces
# viewer-right). Their side views are swapped so that "left" always means
# "faces viewer-left"; source.column in the manifest keeps the sheet column.
# long-waves: in column 2 the crown is at viewer-left and the forehead
# hairline/fringe edge at the top right, with the face gap on the right.
SWAP_SIDES = {"long-waves"}


def view_name(iid: str, col: int) -> str:
    v = VIEWS[col]
    if iid in SWAP_SIDES and v in ("left", "right"):
        v = "right" if v == "left" else "left"
    return v


# ------------------------------------------------------------------ slicing

def slice_sheet(fname, cat, ids, report):
    im = Image.open(SRC / fname).convert("RGBA")
    # pad with transparency so an item touching the sheet border still gets
    # its full 2px padding (its box then starts/ends EDGE px off the sheet)
    arr = np.pad(np.array(im), ((EDGE, EDGE), (EDGE, EDGE), (0, 0)))
    H, W = arr.shape[:2]
    H0, W0 = im.height, im.width
    raw_a = arr[..., 3]
    alpha = S.clean_alpha(raw_a)
    rgb, nfix = S.decontaminate(arr[..., :3], alpha)
    rgb[alpha == 0] = 0
    report["decontaminated_px"][fname] = nfix
    report["haze_px_removed"][fname] = int(((raw_a > 0) & (alpha == 0)).sum())
    report["raw_alpha_max"][fname] = int(raw_a.max())

    P = S.POOL
    solid = raw_a >= S.SOLID_ALPHA
    ph, pw = H // P, W // P
    pooled = solid[:ph * P, :pw * P].reshape(ph, P, pw, P).any(axis=(1, 3))
    lab, n = S.label(pooled)
    rows, cols = 3, 4
    groups = {(r, c): [] for r in range(rows) for c in range(cols)}
    specks = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < S.MIN_CELLS:
            specks.append((k, ys, xs))
            continue
        cy, cx = (ys.mean() + 0.5) * P - EDGE, (xs.mean() + 0.5) * P - EDGE
        cell = (min(max(int(cy / (H0 / rows)), 0), rows - 1),
                min(max(int(cx / (W0 / cols)), 0), cols - 1))
        groups[cell].append(k)
        x0, x1 = xs.min() * P - EDGE, (xs.max() + 1) * P - 1 - EDGE
        y0, y1 = ys.min() * P - EDGE, (ys.max() + 1) * P - 1 - EDGE
        if int(x0 / (W0 / cols)) != int(x1 / (W0 / cols)) or \
           int(y0 / (H0 / rows)) != int(y1 / (H0 / rows)):
            report["crosses_grid"].append((fname, ids[cell[0]], VIEWS[cell[1]]))

    # attach specks to the nearest real component, if close enough
    reach = max(1, SPECK_REACH // P)
    cell_of = {k: cell for cell, ks in groups.items() for k in ks}
    big = np.isin(lab, list(cell_of))
    for k, ys, xs in specks:
        y0, y1 = max(ys.min() - reach, 0), min(ys.max() + reach + 1, ph)
        x0, x1 = max(xs.min() - reach, 0), min(xs.max() + reach + 1, pw)
        win = lab[y0:y1, x0:x1] * big[y0:y1, x0:x1]
        near = np.unique(win[win > 0])
        if len(near):
            cy, cx = ys.mean(), xs.mean()
            best = min(near, key=lambda kk: np.min(
                (np.nonzero(lab[y0:y1, x0:x1] == kk)[0] + y0 - cy) ** 2 +
                (np.nonzero(lab[y0:y1, x0:x1] == kk)[1] + x0 - cx) ** 2))
            cell = cell_of[int(best)]
            groups[cell].append(k)
            report["specks_attached"].append((fname, ids[cell[0]], VIEWS[cell[1]], len(ys)))
        else:
            report["specks_dropped"].append((fname, int(xs.mean() * P), int(ys.mean() * P), len(ys)))

    masks = {}
    for cell, ks in groups.items():
        m = np.isin(lab, ks)
        full = np.zeros((H, W), bool)
        full[:ph * P, :pw * P] = np.repeat(np.repeat(m, P, 0), P, 1)
        masks[cell] = full & solid

    out = []
    for cell, own in masks.items():
        r, c = cell
        iid, view = ids[r], view_name(ids[r], c)
        if not own.any():
            raise SystemExit(f"{fname}: no pixels found for {iid} {view}")
        others = np.zeros((H, W), bool)
        for oc, om in masks.items():
            if oc != cell:
                others |= om
        region = S.dilate(own, S.GROW) & ~S.dilate(others, S.GROW)
        a_item = np.where(region, alpha, 0).astype(np.uint8)
        x0, y0, x1, y1 = S.trim_box(a_item)
        x0, y0, x1, y1 = x0 - S.PAD, y0 - S.PAD, x1 + S.PAD, y1 + S.PAD
        if x0 < EDGE or y0 < EDGE or x1 > W - EDGE or y1 > H - EDGE:
            report["touches_edge"].append((iid, view, [x0 - EDGE, y0 - EDGE, x1 - EDGE, y1 - EDGE]))
        # alpha the item lost to the neighbor exclusion (should be ~0)
        lost = (alpha > 0) & S.dilate(own, S.GROW) & S.dilate(others, S.GROW)
        if lost.any():
            report["neighbor_overlap_px"].append((iid, view, int(lost.sum())))
        sub_a = a_item[y0:y1, x0:x1]
        sub_rgb = np.where(sub_a[..., None] > 0, rgb[y0:y1, x0:x1], 0).astype(np.uint8)
        sprite = Image.fromarray(np.dstack([sub_rgb, sub_a]), "RGBA")
        out.append(dict(id=iid, view=view, category=cat, sprite=sprite, sheet=fname, column=c,
                        sheet_box=[int(x0 - EDGE), int(y0 - EDGE), int(x1 - x0), int(y1 - y0)],
                        raw_a=raw_a[y0:y1, x0:x1]))
    return out


def seam_split(rgba: np.ndarray, lo: int, hi: int, center: int,
               step: int = 2) -> np.ndarray:
    """Cheapest left-to-right seam through rows lo..hi (dynamic programming,
    the row may change by up to `step` px per column). Cost is coverage times
    brightness, so the seam runs through transparency and the dark contact
    shadow where two touching pieces meet; a small pull toward `center` keeps
    it from wandering through empty space into the other piece. Returns a mask of the pixels above
    the seam (the first part)."""
    h, w = rgba.shape[:2]
    a = rgba[..., 3].astype(np.float32) / 255.0
    lum = (rgba[..., :3].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)) / 255.0
    cost = (a * (0.15 + lum ** 2))[lo:hi]
    n = hi - lo
    pull = 0.05 * np.abs(np.arange(lo, hi) - center) / max(1.0, 0.1 * h)
    cost = cost + pull[:, None].astype(np.float32)
    acc = cost[:, 0].copy()
    back = np.zeros((n, w), np.int16)
    for x in range(1, w):
        best = np.full(n, np.inf, np.float32)
        arg = np.zeros(n, np.int16)
        for d in range(-step, step + 1):
            sh = np.full(n, np.inf, np.float32)
            if d >= 0:
                sh[d:] = acc[:n - d] if d else acc
            else:
                sh[:d] = acc[-d:]
            better = sh < best
            best[better] = sh[better]
            arg[better] = d
        back[:, x] = arg
        acc = best + cost[:, x]
    ys = np.zeros(w, np.int32)
    y = int(np.argmin(acc))
    for x in range(w - 1, -1, -1):
        ys[x] = y
        y -= int(back[y, x])
    first = np.arange(h)[:, None] < (ys[None, :] + lo)
    return first


def split_parts(it, report):
    """Return {name: (sprite, offset)} for pairs and stacked sets."""
    iid, view, spr = it["id"], it["view"], it["sprite"]
    rgba = np.array(spr)
    a = rgba[..., 3]
    if view in pair_views(iid):
        axis, names = 1, ("left", "right")
    elif iid in STACKED:
        axis, names = 0, STACKED[iid]
    else:
        return {}
    idx, gap = S.split_point(a >= S.SOLID_ALPHA, axis)
    info = {"axis": "x" if axis else "y", "at": int(idx), "gap_px": int(gap)}
    if gap:
        first = np.zeros_like(a, bool)
        if axis == 1:
            first[:, :idx] = True
        else:
            first[:idx, :] = True
    else:
        # the pieces touch or overlap: cut along the cheapest seam through
        # transparency / contact shadow instead of a straight line
        src = rgba if axis == 0 else rgba.transpose(1, 0, 2)
        n = src.shape[0]
        lo, hi = int(n * 0.25), int(n * 0.6) if axis == 0 else int(n * 0.75)
        first = seam_split(src, lo, hi, idx)
        if axis == 1:
            first = first.T
        info["seam"] = True
        report["split_without_gap"].append(f"{iid}-{view}")
    report["splits"][f"{iid}-{view}"] = info
    parts = {}
    for k, pname in enumerate(names):
        part, off = S.sub_sprite(spr, first if k == 0 else ~first)
        parts[pname] = (part, [int(off[0]), int(off[1])])
    return parts


SUFFIX = {"left": "l", "right": "r", "top": "top", "trousers": "trousers"}


def build(contact_dir: Path | None):
    report = dict(decontaminated_px={}, haze_px_removed={}, raw_alpha_max={},
                  specks_attached=[], specks_dropped=[], crosses_grid=[],
                  touches_edge=[], neighbor_overlap_px=[], splits={},
                  split_without_gap=[])
    front = json.loads(FRONT_MANIFEST.read_text())["items"]
    manifest = {
        "version": 1,
        "note": "Generated by art/slice_views.py from art/source/views/*.webp. Paths "
                "are relative to this file. Views: front, left (figure faces "
                "viewer-left), right (faces viewer-right), back - same column order "
                "and facing as art/source/base-*-turnaround.webp. Each view's "
                "source.box is [x, y, w, h] in sheet px (sprite px = sheet px, "
                "including the 2px padding); all four views of an item come from "
                "one sheet row at one drawing scale, so box offsets between views "
                "give their relative size and vertical alignment. scaleRef "
                "restates this per item: rowTop/rowBottom = union of the four "
                "boxes, and per view dy = box top - rowTop, bottomGap = rowBottom - "
                "box bottom, heightVsFront = h / front h. parts: offset = position "
                "of the part inside the view's sprite; source.column = 0-based "
                "sheet column (long-waves has its side columns swapped on the "
                "sheet, so its left view comes from column 2); a box may "
                "extend a few px past the sheet edge (transparent padding); left/right = viewer's left/"
                "right. faceHole (hair front only) as in ../manifest.json.",
        "views": list(VIEWS),
        "items": {},
    }
    total = 0
    items = []
    for fname, cat, ids in SHEETS:
        items += slice_sheet(fname, cat, ids, report)

    for it in items:
        iid, view, cat, spr = it["id"], it["view"], it["category"], it["sprite"]
        if iid not in front or front[iid]["category"] != cat:
            raise SystemExit(f"{iid}: id/category does not match ../manifest.json")
        rel = f"{cat}/{iid}-{view}.webp"
        total += S.save(spr, OUT / rel)
        entry = {"file": rel, "width": spr.width, "height": spr.height,
                 "source": {"sheet": f"art/source/views/{it['sheet']}",
                            "box": it["sheet_box"],
                            "column": it["column"]}}
        parts = split_parts(it, report)
        it["parts"] = {}
        if parts:
            entry["parts"] = {}
            for pname, (part, off) in parts.items():
                prel = f"{cat}/{iid}-{view}-{SUFFIX[pname]}.webp"
                total += S.save(part, OUT / prel)
                entry["parts"][pname] = {"file": prel, "width": part.width,
                                         "height": part.height, "offset": off}
                it["parts"][pname] = part
        if cat == "hair" and view == "front":
            hole = S.face_hole(np.array(spr)[..., 3])
            entry["faceHole"] = hole
            it["hole"] = hole
        item = manifest["items"].setdefault(iid, {
            "category": cat, "name": front[iid]["name"],
            "sheet": f"art/source/views/{it['sheet']}", "views": {}})
        item["views"][view] = entry

    for iid, item in manifest["items"].items():
        boxes = {v: item["views"][v]["source"]["box"] for v in VIEWS}
        top = min(b[1] for b in boxes.values())
        bot = max(b[1] + b[3] for b in boxes.values())
        fh = boxes["front"][3]
        item["scaleRef"] = {
            "rowTop": top, "rowBottom": bot,
            "views": {v: {"dy": b[1] - top, "bottomGap": bot - (b[1] + b[3]),
                          "heightVsFront": round(b[3] / fh, 4)}
                      for v, b in boxes.items()}}

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    report["total_bytes"] = total + (OUT / "manifest.json").stat().st_size
    report["sprite_bytes"] = total
    if contact_dir:
        contact(items, contact_dir)
    return manifest, report


# ------------------------------------------------------------------ contact

def contact(items, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    try:
        font = ImageFont.load_default(size=16)
    except TypeError:
        font = ImageFont.load_default()
    by_id = {}
    for it in items:
        by_id.setdefault(it["id"], {})[it["view"]] = it
    sheets = {}
    for fname, cat, ids in SHEETS:
        sheets.setdefault(fname[len("views-"):-len(".webp")], ids)
    for bgname, bg in (("pink", (231, 122, 176, 255)), ("dark", (24, 22, 34, 255))):
        for sname, ids in sheets.items():
            cell = 300
            # one row per item: 4 views, then any parts
            rows = []
            for iid in ids:
                tiles = []
                for v in VIEWS:
                    it = by_id[iid][v]
                    tiles.append((f"{iid} {v}", it["sprite"], it.get("hole")))
                for v in VIEWS:
                    for pname, p in by_id[iid][v]["parts"].items():
                        tiles.append((f"{v}-{SUFFIX[pname]}", p, None))
                rows.append(tiles)
            ncols = max(len(r) for r in rows)
            sheet = Image.new("RGBA", (ncols * cell, len(rows) * (cell + 30)), bg)
            d = ImageDraw.Draw(sheet)
            for ri, tiles in enumerate(rows):
                for ci, (name, spr, hole) in enumerate(tiles):
                    cx, cy = ci * cell, ri * (cell + 30)
                    s = min((cell - 16) / spr.width, (cell - 10) / spr.height, 1.0)
                    sp = spr.resize((max(1, round(spr.width * s)), max(1, round(spr.height * s))),
                                    Image.LANCZOS) if s < 1 else spr
                    ox, oy = cx + (cell - sp.width) // 2, cy + 26
                    d.rectangle([ox - 1, oy - 1, ox + sp.width, oy + sp.height],
                                outline=(255, 255, 255, 70))
                    sheet.alpha_composite(sp, (ox, oy))
                    if hole:
                        f = hole["face"]
                        d.rectangle([ox + f["x"] * s, oy + f["y"] * s,
                                     ox + (f["x"] + f["w"]) * s, oy + (f["y"] + f["h"]) * s],
                                    outline=(255, 255, 0, 255), width=2)
                    d.text((cx + 4, cy + 4), f"{name} {spr.width}x{spr.height}",
                           fill=(255, 255, 255, 255), font=font,
                           stroke_width=2, stroke_fill=(0, 0, 0, 255))
            sheet.convert("RGB").save(outdir / f"{sname}-{bgname}.png")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--contact", type=Path, help="write review contact sheets here")
    ap.add_argument("--report", action="store_true", help="print a JSON report")
    args = ap.parse_args(argv)
    manifest, report = build(args.contact)
    if args.report:
        print(json.dumps(report, indent=1, default=str))
    n = sum(1 + len(v.get("parts", {})) for e in manifest["items"].values()
            for v in e["views"].values())
    print(f"{len(manifest['items'])} items, {n} sprites, {report['total_bytes']} bytes",
          file=sys.stderr)


if __name__ == "__main__":
    main()
