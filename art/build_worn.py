"""Dressed ("worn") dolls in high resolution, round 3 (art/ART-REQUESTS-ROUND3.md, blocks A, B).

    python3 -I art/build_worn.py --import DIR     copy the delivered PNGs into art/source/round3/ (lossless WebP)
    python3 -I art/build_worn.py [--doll adult|little] [--check OUT] [--ship] [--reuse]

The image agent redraws each doll's base at 1536 x 3072 (base-<doll>-<view>) and draws the same doll wearing
an outfit (worn-<doll>-<outfit>-<view>, plus worn-<doll>-<outfit>-<left|right>-noarm: the side view without
the near arm, so the garment behind it exists), one view per file. Every other layer of the game (hair,
faces, shoes, jewelry, accessories, the other outfits) is registered to the OLD base doll, the picture
dist/assets/dolls/<doll>-<view>.webp (Grown-up 397 x 873, Little Me 403 x 863), in "doll-local" pixels.
The outfits of a doll are the worn files found for her. This script

  1. registers the new base to the old one per view: one similarity (scale and offset, no rotation) found
     by coordinate descent on the silhouette and the high-passed grey picture, both compared at 2x the old
     doll's pixels (the new picture is resampled with a Lanczos filter for every candidate);
  2. measures how well the two bodies coincide region by region (head, neck, shoulders, hands, knees,
     ankles, feet): the best local shift (old px, at quarter-pixel steps), the mean silhouette edge offset,
     and the head's own scale against the whole body's (did the proportions change?);
  3. with --ship, resamples every worn picture into the old doll's coordinates at WORN_SCALE times its
     pixels (dist/assets/worn/adult-<outfit>-<view>.webp, cropped to the figure, with its doll-local
     offset), writes a garment mask (worn minus base, dist/assets/worn/adult-<outfit>-<view>-mask.webp,
     1x, for colourways) and the generated dist/worn-data.js;
  4. with --check OUT, writes old-vs-new overlays per view (colour fringes where they differ, the old
     outline over the new picture, 4x crops of every region) and registration.json.

Because the new base is laid onto the old one, every existing layer stays where it was fitted; what the
registration cannot absorb is listed by region in registration.json and in dist/worn-data.js (`reg`).
Needs Pillow and numpy.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
SRC = ROOT / "art" / "source" / "round3"
OLD = ROOT / "dist" / "assets" / "dolls"
OUT = ROOT / "dist" / "assets" / "worn"
DATA = ROOT / "dist" / "worn-data.js"
# the registration found by the last full run (kept in the repository; --reuse ships with it)
PROOFS = ROOT / "art" / "proofs" / "round3"
VIEWS = ("front", "left", "right", "back")
DOLLS = ("adult", "little")
DOLL = "adult"  # set by --doll
OUTFITS: tuple = ()  # the outfits with worn files for DOLL (found on disk)
# shipped resolution: WORN_SCALE shipped px per doll-local px (the old base is 873 px tall, so 2 -> 1746)
WORN_SCALE = 2
QUALITY = 88
# Regions (fractions of the figure's height from the top of the head; x: 'all', 'l' / 'r' = the outer
# 14 % of the figure's width on that side (the hands in front and back views), 'c' = the middle 40 %).
# Little Me's are read off her rig (dist/puppet-rig.js: neck cut 214, shoulders 274, hands 490 to 560, knees
# 705, ankles 818 of 863 px).
REGIONS_OF = {
    "adult": {
        "head": (0.0, .125, "all"),
        "neck": (.125, .175, "c"),
        "shoulders": (.175, .245, "all"),
        "hands-l": (.52, .63, "l"),
        "hands-r": (.52, .63, "r"),
        "knees": (.70, .78, "all"),
        "ankles": (.90, .95, "all"),
        "feet": (.95, 1.0, "all"),
    },
    "little": {
        "head": (0.0, .22, "all"),
        "neck": (.22, .28, "c"),
        "shoulders": (.28, .36, "all"),
        "hands-l": (.56, .66, "l"),
        "hands-r": (.56, .66, "r"),
        "knees": (.78, .86, "all"),
        "ankles": (.92, .96, "all"),
        "feet": (.96, 1.0, "all"),
    },
}
SIDE_REGIONS_OF = {"adult": {"hands-l": (.50, .62, "all"), "hands-r": None},
                   "little": {"hands-l": (.55, .66, "all"), "hands-r": None}}
REGIONS = REGIONS_OF["adult"]
SIDE_REGIONS = SIDE_REGIONS_OF["adult"]


def set_doll(doll):
    global DOLL, OUTFITS, REGIONS, SIDE_REGIONS
    DOLL, REGIONS, SIDE_REGIONS = doll, REGIONS_OF[doll], SIDE_REGIONS_OF[doll]
    OUTFITS = tuple(sorted(p.name[len(f"worn-{doll}-"):-len("-front.webp")] for p in SRC.glob(f"worn-{doll}-*-front.webp")))


def reg_file(doll):
    return PROOFS / f"worn-registration-{doll}.json"


def manifest_file(doll):
    return PROOFS / f"worn-{doll}.json"


def alpha_norm(a):
    """The deliveries' alpha is a little short of opaque inside the body (250 to 254): stretch 0..250 to
    0..255 so the body is solid and the edges keep their antialiasing."""
    return np.clip(np.round(a.astype(np.float32) * 255 / 250), 0, 255).astype(np.uint8)


def load(p):
    return np.asarray(Image.open(p).convert("RGBA"), dtype=np.float32) / 255.0


def premul_img(arr):
    pm = arr.copy()
    pm[..., :3] *= pm[..., 3:4]
    return Image.fromarray((np.clip(pm, 0, 1) * 255 + .5).astype(np.uint8), "RGBa")


def unpremul(img):
    out = np.asarray(img, dtype=np.float32) / 255.0
    a = out[..., 3:4]
    out = out.copy()
    out[..., :3] = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    return out


def sample(pm_img, a, bx, by, u0, v0, u1, v1, k):
    """The new picture (premultiplied PIL image) seen in doll-local coordinates: new X = a*u + bx, sampled
    over doll-local [u0,u1) x [v0,v1) at k output px per doll px (Lanczos over the source box)."""
    W, H = int(round((u1 - u0) * k)), int(round((v1 - v0) * k))
    box = (bx + a * u0, by + a * v0, bx + a * u1, by + a * v1)
    if box[0] < 0 or box[1] < 0 or box[2] > pm_img.width or box[3] > pm_img.height:  # reaching past the picture
        m = int(math.ceil(max(0, -box[0], -box[1], box[2] - pm_img.width, box[3] - pm_img.height))) + 2
        padded = Image.new("RGBa", (pm_img.width + 2 * m, pm_img.height + 2 * m), (0, 0, 0, 0))
        padded.paste(pm_img, (m, m))
        pm_img, box = padded, (box[0] + m, box[1] + m, box[2] + m, box[3] + m)
    return unpremul(pm_img.resize((W, H), Image.LANCZOS, box=box))


def box_blur(a, r):
    r = int(r)
    if r < 1:
        return a
    k = 2 * r + 1
    p = np.pad(a, ((r + 1, r), (0, 0)), mode="edge")
    c = np.cumsum(p, 0)
    a = (c[k:] - c[:-k]) / k
    p = np.pad(a, ((0, 0), (r + 1, r)), mode="edge")
    c = np.cumsum(p, 1)
    return (c[:, k:] - c[:, :-k]) / k


def gray(rgba):
    return (.299 * rgba[..., 0] + .587 * rgba[..., 1] + .114 * rgba[..., 2]) * rgba[..., 3]


def feats(rgba):
    g = gray(rgba)
    return rgba[..., 3], g - box_blur(box_blur(g, 3), 3)


def bbox(alpha, thr=.5):
    m = alpha > thr
    ys, xs = np.where(m.any(1))[0], np.where(m.any(0))[0]
    return xs[0], ys[0], xs[-1] + 1, ys[-1] + 1


def old_base(view, k):
    """The old base at k x its pixels (bicubic, premultiplied), as the fixed image."""
    img = Image.open(OLD / f"{DOLL}-{view}.webp").convert("RGBA")
    w, h = img.size
    up = img.convert("RGBa").resize((w * k, h * k), Image.BICUBIC)
    return unpremul(up), (w, h)


def region_mask(name, view, fig, shape, k):
    """Boolean mask (k x doll px) of a region of the figure; fig = old figure bbox in doll px."""
    spec = REGIONS[name]
    if view in ("left", "right") and name in SIDE_REGIONS:
        spec = SIDE_REGIONS[name]
    if spec is None:
        return None
    y0f, y1f, xs = spec
    x0, y0, x1, y1 = fig
    h, w = y1 - y0, x1 - x0
    m = np.zeros(shape, bool)
    ya, yb = int((y0 + y0f * h) * k), int((y0 + y1f * h) * k) + 1
    if xs == "all":
        xa, xb = x0 * k, x1 * k
    elif xs == "c":
        xa, xb = int((x0 + .3 * w) * k), int((x0 + .7 * w) * k)
    elif xs == "l":
        xa, xb = x0 * k, int((x0 + .14 * w) * k)
    else:
        xa, xb = int((x1 - .14 * w) * k), x1 * k
    m[max(0, ya - 2 * k):yb + 2 * k, max(0, xa - 2 * k):xb + 2 * k] = True
    return m


def cost(fixed, moving, mask=None, lam=4.0):
    fa, fg = fixed
    ma, mg = moving
    e = (fa - ma) ** 2 + lam * (fg - mg) ** 2
    if mask is not None:
        return float(e[mask].mean())
    return float(e.mean())


def register(view, new_rgba, k=2, mask_name=None, init=None, verbose=False):
    """Similarity new -> old doll-local: returns (a, bx, by) with new X = a*u + bx."""
    fixed_rgba, (w, h) = old_base(view, k)
    fixed = feats(fixed_rgba)
    pm = premul_img(new_rgba)
    if init is None:
        ox0, oy0, ox1, oy1 = bbox(fixed_rgba[..., 3])
        ox0, oy0, ox1, oy1 = ox0 / k, oy0 / k, ox1 / k, oy1 / k
        nx0, ny0, nx1, ny1 = bbox(new_rgba[..., 3])
        a = (ny1 - ny0) / (oy1 - oy0)
        bx = (nx0 + nx1) / 2 - a * (ox0 + ox1) / 2
        by = ny0 - a * oy0
    else:
        a, bx, by = init
    fig = [v / k for v in bbox(fixed_rgba[..., 3])]
    mask = region_mask(mask_name, view, [int(round(v)) for v in fig], fixed[0].shape, k) if mask_name else None

    def c(a, bx, by):
        mov = feats(sample(pm, a, bx, by, 0, 0, w, h, k))
        return cost(fixed, mov, mask)

    best = c(a, bx, by)
    steps = [a * .004, 2.0, 2.0]
    for it in range(60):
        improved = False
        for i in range(3):
            for sgn in (1, -1):
                p = [a, bx, by]
                p[i] += sgn * steps[i]
                v = c(*p)
                if v < best:
                    best, (a, bx, by), improved = v, p, True
                    break
        if not improved:
            steps = [s / 2 for s in steps]
            if steps[1] < .05:
                break
    if verbose:
        print(f"  {view} {mask_name or 'body'}: a={a:.5f} bx={bx:.2f} by={by:.2f} cost={best:.6f}")
    return a, bx, by


def local_shift(fixed, moving, m, k, r=3.0):
    """Best integer shift (in 1/k doll px, within +-r doll px) of `moving` against `fixed` inside m."""
    fa, fg = fixed
    ma, mg = moving
    ys, xs = np.where(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    R = int(r * k)
    best, arg = 1e9, (0, 0)
    H, W = fa.shape
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            ya, yb, xa, xb = y0 + dy, y1 + dy, x0 + dx, x1 + dx
            if ya < 0 or xa < 0 or yb > H or xb > W:
                continue
            e = ((fa[y0:y1, x0:x1] - ma[ya:yb, xa:xb]) ** 2 + 4 * (fg[y0:y1, x0:x1] - mg[ya:yb, xa:xb]) ** 2).mean()
            if e < best:
                best, arg = e, (dx, dy)
    # moving content at fixed position p sits at p + d in moving -> the new body is offset by +d
    return arg[0] / k, arg[1] / k


def edge_offset(fa, ma, m, k):
    """Mean distance (doll px) between the two silhouettes inside m: |alpha difference| / edge length."""
    diff = np.abs(fa - ma)[m].sum() / k / k
    gy, gx = np.gradient(fa)
    per = np.hypot(gx, gy)[m].sum() / k
    return float(diff / max(per, 1e-6))


def measure(view, new_rgba, reg, k=4):
    fixed_rgba, (w, h) = old_base(view, k)
    a, bx, by = reg
    mov_rgba = sample(premul_img(new_rgba), a, bx, by, 0, 0, w, h, k)
    fixed, mov = feats(fixed_rgba), feats(mov_rgba)
    fig = [int(round(v / k)) for v in bbox(fixed_rgba[..., 3])]
    out = {}
    for name in REGIONS:
        m = region_mask(name, view, fig, fixed[0].shape, k)
        if m is None:
            continue
        dx, dy = local_shift(fixed, mov, m, k)
        out[name] = {"shift": [round(dx, 2), round(dy, 2)], "edge": round(edge_offset(fixed[0], mov[0], m, k), 2)}
    return out, fixed_rgba, mov_rgba, fig


# ------------------------------------------------------------------ pictures for review
def to_img(rgba, bg=(205, 230, 212)):
    a = rgba[..., 3:4]
    rgb = rgba[..., :3] * a + np.array(bg, np.float32) / 255 * (1 - a)
    return Image.fromarray((np.clip(rgb, 0, 1) * 255 + .5).astype(np.uint8), "RGB")


def overlay_sheet(view, fixed_rgba, mov_rgba, fig, k, res, path):
    """Three panels at k x: old and new in complementary colours (grey where they agree), the new
    picture with the old outline in red, and 4x crops of each region with the outline."""
    g0 = gray(fixed_rgba) + (1 - fixed_rgba[..., 3]) * .9
    g1 = gray(mov_rgba) + (1 - mov_rgba[..., 3]) * .9
    fr = np.stack([g0, g1, g0], -1)  # old in magenta, new in green
    p1 = Image.fromarray((np.clip(fr, 0, 1) * 255).astype(np.uint8), "RGB")
    p2 = to_img(mov_rgba)
    edge = np.abs(np.diff((fixed_rgba[..., 3] > .5).astype(np.int8), axis=0, prepend=0)) | \
        np.abs(np.diff((fixed_rgba[..., 3] > .5).astype(np.int8), axis=1, prepend=0))
    e = np.asarray(p2).copy()
    e[edge > 0] = (230, 20, 60)
    p2 = Image.fromarray(e)
    W, H = p1.size
    crops = []
    for name in REGIONS:
        m = region_mask(name, view, fig, fixed_rgba.shape[:2], k)
        if m is None:
            continue
        ys, xs = np.where(m)
        bx = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        # keep crops reasonably square and readable
        c1 = p2.crop(bx)
        c0 = p1.crop(bx)
        s = min(2.0, 420 / max(c1.size))
        c1 = c1.resize((int(c1.width * s), int(c1.height * s)), Image.LANCZOS)
        c0 = c0.resize(c1.size, Image.LANCZOS)
        crops.append((name, c0, c1))
    cw = max(c[1].width for c in crops) * 2 + 30
    sheet_h = max(H, sum(c[1].height + 30 for c in crops))
    sheet = Image.new("RGB", (W * 2 + cw + 40, sheet_h + 40), (250, 250, 250))
    sheet.paste(p1, (10, 30))
    sheet.paste(p2, (W + 20, 30))
    d = ImageDraw.Draw(sheet)
    d.text((10, 8), f"{view}: old (magenta) / new (green), grey where equal", fill=(0, 0, 0))
    d.text((W + 20, 8), "new base, old outline in red", fill=(0, 0, 0))
    y = 30
    x = W * 2 + 30
    for name, c0, c1 in crops:
        r = res.get(name, {})
        d.text((x, y - 14 + 2), f"{name}: shift {r.get('shift')} px, edge {r.get('edge')} px", fill=(0, 0, 0))
        sheet.paste(c0, (x, y + 2))
        sheet.paste(c1, (x + c0.width + 10, y + 2))
        y += c1.height + 30
    sheet.save(path, quality=88)


# ------------------------------------------------------------------ shipping
def garment_mask(worn, base, f=1.0):
    """Where the worn picture differs from the base (the garment), softened: 0..1 at the new picture's px."""
    if f > 1.01:
        # a reduced delivery (Gemini) was redrawn whole, so its skin differs from the base by a few levels
        # everywhere: compare blurred pictures, drop the thin rim along the outline (opening), close holes
        pw, pb = worn[..., :3] * worn[..., 3:4], base[..., :3] * base[..., 3:4]
        d = np.abs(np.stack([box_blur(pw[..., c] - pb[..., c], 2) for c in range(3)], -1)).max(-1)
        d = np.maximum(d, np.abs(box_blur(worn[..., 3] - base[..., 3], 1)))
        m = (d > .05).astype(np.float32) * (worn[..., 3] > .02)
        # its limbs carry dark brown outline strokes the base does not have: skin-hued pixels are not garment
        # (prints of that hue inside the garment are closed over below)
        r, g, b = worn[..., 0], worn[..., 1], worn[..., 2]
        mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
        sat = (mx - mn) / np.maximum(mx, 1e-4)
        hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
        skin = (hue > 5) & (hue < 42) & (sat > .3) & (mx < .97)
        edge = box_blur(1 - m, 3) > 1e-3  # within 3 px of what is not garment
        m *= ~(skin & edge)
        m = (box_blur((box_blur(m, 1) > .999).astype(np.float32), 1) > 1e-3).astype(np.float32)  # opening
        grown = box_blur(m, 3) > 1e-3
        closed = (box_blur(grown.astype(np.float32), 3) > .999).astype(np.float32)
        return np.clip(box_blur(np.maximum(closed, m) * (worn[..., 3] > .02), 1), 0, 1)
    d = np.abs(worn[..., :3] * worn[..., 3:4] - base[..., :3] * base[..., 3:4]).max(-1)
    d = np.maximum(d, np.abs(worn[..., 3] - base[..., 3]))
    m = (d > .035).astype(np.float32) * (worn[..., 3] > .02)
    # drop thin lines (an outline drawn a pixel off the base's along the arms and legs is not garment)
    m = (box_blur((box_blur(m, 2) > .999).astype(np.float32), 2) > 1e-3).astype(np.float32)
    # close the holes (a lilac dress over the lilac bodysuit, mesh, pleats) without growing outward: the
    # skin round the garment is the base's and must stay with the body (puppet pieces), then soften 1 px
    r = 10
    grown = box_blur(m, r) > 1e-3
    closed = (box_blur(grown.astype(np.float32), r) > .999).astype(np.float32)
    closed = np.maximum(closed, m) * (worn[..., 3] > .02)
    return np.clip(box_blur(closed, 1), 0, 1)


# Clean-ups of art flaws, per doll and outfit, applied when shipping (the sources stay as delivered), in
# the delivery's px: `cracks` = row ranges where hairline alpha cracks inside the skin are closed (the
# ghost of the old bodysuit strap edge on the bare shoulders); `slivers` = row ranges where thin detached
# specks and skin wedges beside the sleeves and elbows are removed.
CLEAN = {
    ("adult", "hibiscus-flares"): {"cracks": (500, 900), "slivers": (800, 1300)},
}


def close_cracks(a, y0, y1, r=4):
    """Pixels inside the skin whose alpha dips (a hairline crack) get the alpha of the skin either side:
    alpha < .98 with opaque pixels within r px on both sides along a row or a column."""
    al = a[..., 3]
    op = al >= .98
    H, W = al.shape
    fix = np.zeros_like(op)
    for d in range(1, r + 1):
        for ax in (0, 1):
            fw = np.roll(op, d, ax)
            for e in range(1, r + 1):
                bw = np.roll(op, -e, ax)
                fix |= fw & bw
    band = np.zeros_like(op)
    band[y0:y1] = True
    # colour from the opaque skin round it (mean of the opaque pixels within 2 px)
    acc, n = np.zeros(al.shape + (3,), np.float32), np.zeros(al.shape, np.float32)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            o = np.roll(np.roll(op, dy, 0), dx, 1)
            acc += np.roll(np.roll(a[..., :3], dy, 0), dx, 1) * o[..., None]
            n += o
    col = acc / np.maximum(n, 1)[..., None]
    skin = (col[..., 0] > col[..., 1]) & (col[..., 1] > col[..., 2]) & (col[..., 0] > .55) & (n > 0)
    fix &= band & ~op & skin
    a[..., :3] = np.where(fix[..., None] & (al[..., None] < .5), col, a[..., :3])
    a[..., 3] = np.where(fix, 1.0, al)
    return int(fix.sum())


def remove_slivers(a, y0, y1, wmax=10, rows_min=5):
    """Thin pieces (runs at most wmax px wide with nothing either side) that hang below or float beside the
    figure: groups of such runs over at least rows_min rows, or groups with nothing above and below."""
    al = a[..., 3] > .4
    H, W = al.shape
    marks = []
    for y in range(y0, y1):
        row = al[y]
        xs = np.flatnonzero(np.diff(np.concatenate(([0], row.astype(np.int8), [0]))))
        for s, e in zip(xs[::2], xs[1::2]):
            if e - s <= wmax and s > 0 and e < W:
                marks.append((y, s, e))
    # group runs that touch from one row to the next
    groups = []
    open_ = []
    for y, s, e in marks:
        g = next((g for g in open_ if g[-1][0] == y - 1 and g[-1][1] < e and s < g[-1][2]), None)
        if g is None:
            g = []
            groups.append(g)
            open_.append(g)
        g.append((y, s, e))
        open_ = [g for g in open_ if g[-1][0] >= y - 1]
    gone = 0
    for g in groups:
        ytop, ybot = g[0][0], g[-1][0]
        above = al[ytop - 1, g[0][1]:g[0][2]].any()
        below = al[ybot + 1, g[-1][1]:g[-1][2]].any() if ybot + 1 < H else False
        if len(g) >= rows_min and not below or not above and not below:
            for y, s, e in g:
                a[y, s:e, 3] = 0
                gone += e - s
    return gone


# Views taken from the opposite side view, mirrored (the base's right view is its left one mirrored to
# within half a pixel): for a delivery whose right view does not match the others (hibiscus flares: the
# top's print paler and larger on the right than in the other three views).
MIRROR = {("adult", "hibiscus-flares"): {"right": "left"}}


def load_view(name_fmt, outfit, view):
    """Load art/source/round3/<name_fmt with the view>, mirrored from the other side view when MIRROR says so."""
    src = MIRROR.get((DOLL, outfit), {}).get(view)
    if src:
        return load(SRC / name_fmt.format(view=src))[:, ::-1].copy()
    return load(SRC / name_fmt.format(view=view))


def worn_and_base(outfit, view):
    """The worn picture and the base at the worn picture's size. A delivery drawn on the base reduced (the
    Gemini Little Me outfits: 512 x 1024, the base / 3 exactly) is used at its own size: the base is
    reduced to match and the registration scaled with it (returned factor f, new px = (a*u + b) / f)."""
    worn = load_view(f"worn-{DOLL}-{outfit}-{{view}}.webp", outfit, view)
    worn[..., 3] = np.where(worn[..., 3] < .04, 0, worn[..., 3])  # faint haze some deliveries carry round the figure
    clean = CLEAN.get((DOLL, outfit))
    if clean:
        c = close_cracks(worn, *clean["cracks"]) if view in ("front", "back") and "cracks" in clean else 0
        g = remove_slivers(worn, *clean["slivers"]) if "slivers" in clean else 0
        print(f"    clean {outfit} {view}: {c} crack px closed, {g} sliver px removed")
    mirrored = MIRROR.get((DOLL, outfit), {}).get(view)
    base_img = Image.open(SRC / f"base-{DOLL}-{mirrored or view}.webp").convert("RGBA")
    if mirrored:  # compare with the base mirrored the same way, so the garment mask is the same
        base_img = base_img.transpose(Image.FLIP_LEFT_RIGHT)
    f = base_img.width / worn.shape[1]
    if abs(f - 1) > 1e-6:
        base_img = base_img.convert("RGBa").resize((worn.shape[1], worn.shape[0]), Image.LANCZOS).convert("RGBA")
    return worn, np.asarray(base_img, dtype=np.float32) / 255.0, f


def ship_one(outfit, view, reg, pm_cache):
    worn, base, f = worn_and_base(outfit, view)
    reg = tuple(v / f for v in reg)
    # shipped px per doll px: 2, or 1 for a delivery that has no more than the old doll's own resolution
    K = WORN_SCALE if reg[0] >= WORN_SCALE * .9 else 1
    na_path = SRC / f"worn-{DOLL}-{outfit}-{view}-noarm.webp"
    noarm = load_view(f"worn-{DOLL}-{outfit}-{{view}}-noarm.webp", outfit, view) if view in ("left", "right") and na_path.exists() else None
    a, bx, by = reg
    nx0, ny0, nx1, ny1 = bbox(worn[..., 3], .004)
    if noarm is not None:  # one frame for both
        b2 = bbox(noarm[..., 3], .004)
        nx0, ny0, nx1, ny1 = min(nx0, b2[0]), min(ny0, b2[1]), max(nx1, b2[2]), max(ny1, b2[3])
    # doll-local crop of the figure, padded 2 px, on whole doll px
    u0 = math.floor((nx0 - bx) / a) - 2
    v0 = math.floor((ny0 - by) / a) - 2
    u1 = math.ceil((nx1 - bx) / a) + 2
    v1 = math.ceil((ny1 - by) / a) + 2
    pic = sample(premul_img(worn), a, bx, by, u0, v0, u1, v1, K)
    img = Image.fromarray((np.clip(pic, 0, 1) * 255 + .5).astype(np.uint8), "RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    p = OUT / f"{DOLL}-{outfit}-{view}.webp"
    img.save(p, "WEBP", quality=QUALITY, alpha_quality=100, method=6)
    gm = garment_mask(worn, base, f)
    gmi = Image.fromarray((gm * 255 + .5).astype(np.uint8), "L")
    W1, H1 = u1 - u0, v1 - v0
    box = (bx + a * u0, by + a * v0, bx + a * u1, by + a * v1)
    m = int(math.ceil(max(0, -box[0], -box[1], box[2] - gmi.width, box[3] - gmi.height))) + 2
    padded = Image.new("L", (gmi.width + 2 * m, gmi.height + 2 * m), 0)
    padded.paste(gmi, (m, m))
    gmi = padded.resize((W1, H1), Image.BILINEAR, box=(box[0] + m, box[1] + m, box[2] + m, box[3] + m))
    mp = OUT / f"{DOLL}-{outfit}-{view}-mask.webp"
    Image.merge("RGBA", [Image.new("L", gmi.size, 0)] * 3 + [gmi]).save(mp, "WEBP", lossless=True, quality=100, method=6)
    out = {"src": f"assets/worn/{p.name}", "mask": f"assets/worn/{mp.name}", "at": [u0, v0], "size": [W1, H1],
           "bytes": p.stat().st_size, "maskBytes": mp.stat().st_size, "k": K}
    if noarm is not None:
        # the garment without the near arm (only what differs from the base), at 1x, for the puppet: what a
        # swinging arm uncovers
        na = noarm.copy()
        na[..., 3] *= garment_mask(noarm, base)
        pic = sample(premul_img(na), a, bx, by, u0, v0, u1, v1, 1)
        q = OUT / f"{DOLL}-{outfit}-{view}-noarm.webp"
        Image.fromarray((np.clip(pic, 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(q, "WEBP", quality=QUALITY, alpha_quality=100, method=6)
        out["noarm"] = f"assets/worn/{q.name}"
        out["bytes"] += q.stat().st_size
    sl_path = SRC / f"worn-{DOLL}-{outfit}-{view}-sleeve.webp"
    if view in ("left", "right") and sl_path.exists():
        # the near arm's sleeve alone, at the picture's resolution, for the puppet: it goes with the arm
        sl = load_view(f"worn-{DOLL}-{outfit}-{{view}}-sleeve.webp", outfit, view)
        sl[..., 3] = np.where(sl[..., 3] < .04, 0, sl[..., 3])
        pic = sample(premul_img(sl), a, bx, by, u0, v0, u1, v1, K)
        q = OUT / f"{DOLL}-{outfit}-{view}-sleeve.webp"
        Image.fromarray((np.clip(pic, 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(q, "WEBP", quality=QUALITY, alpha_quality=100, method=6)
        out["sleeve"] = f"assets/worn/{q.name}"
        out["bytes"] += q.stat().st_size
    return out


def ship_thumb(outfit):
    """The outfit's card picture from the worn front view: the garment alone (worn where it differs from the
    base, holes kept open, so no skin shows through a mesh), cropped, 320 px tall."""
    worn, base, f = worn_and_base(outfit, "front")
    d = np.abs(worn[..., :3] * worn[..., 3:4] - base[..., :3] * base[..., 3:4]).max(-1)
    a = np.clip((d - .03) / .05, 0, 1) * worn[..., 3] if f < 1.01 else garment_mask(worn, base, f) * worn[..., 3]
    out = worn.copy()
    out[..., 3] = a
    x0, y0, x1, y1 = bbox(a, .3)
    img = Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8), "RGBA").crop((x0 - 8, y0 - 8, x1 + 8, y1 + 8))
    h = 320
    img = img.convert("RGBa").resize((round(img.width * h / img.height), h), Image.LANCZOS).convert("RGBA")
    (OUT / "thumbs").mkdir(parents=True, exist_ok=True)
    p = OUT / "thumbs" / f"{DOLL}-{outfit}.webp"
    img.save(p, "WEBP", quality=88, alpha_quality=100, method=6)
    return f"assets/worn/thumbs/{p.name}"


def write_data():
    """dist/worn-data.js from every doll's manifest (art/proofs/round3/worn-<doll>.json)."""
    lines = ["/* Generated by art/build_worn.py: do not edit by hand.",
             "   Dressed dolls (round 3). WORN_DATA[doll][outfit][view] = {src, mask, at, size, noarm?}: the doll",
             "   wearing the outfit, drawn at `scale` (or its own `k`) shipped px per doll-local px, whose top-left corner sits at",
             "   doll-local `at` and covers `size` doll px (so it lies exactly over the old base picture); `mask` is",
             "   the garment (worn minus base) at 1x, for colourways and the puppet; `noarm` (side views) the garment",
             "   without the near arm at 1x, for the puppet. `thumbs` = card pictures of the garments from the worn",
             "   front views. `reg` = how each doll's new base was laid on the old one (new px = a * doll px + b)",
             "   and how far each region still is from the old base (doll px). */",
             "const WORN_DATA={scale:%d," % WORN_SCALE]
    regs, thumbs = {}, {}
    for doll in DOLLS:
        if not manifest_file(doll).exists():
            continue
        m = json.loads(manifest_file(doll).read_text())
        regs[doll] = m["reg"]
        thumbs[doll] = m.get("thumbs", {})
        lines.append(f"{doll}:{{")
        for o, views in m.get("entries", {}).items():
            parts = []
            for v in VIEWS:
                e = views[v]
                extra = f",noarm:'{e['noarm']}'" if e.get("noarm") else ""
                extra += f",sleeve:'{e['sleeve']}'" if e.get("sleeve") else ""
                if e.get("k", WORN_SCALE) != WORN_SCALE:
                    extra += f",k:{e['k']}"
                parts.append(f"{v}:{{src:'{e['src']}',mask:'{e['mask']}',at:[{e['at'][0]},{e['at'][1]}],size:[{e['size'][0]},{e['size'][1]}]{extra}}}")
            lines.append(f"  '{o}':{{" + ",".join(parts) + "},")
        lines.append("},")
    lines.append("thumbs:{" + ",".join(f"{d}:{{" + ",".join(f"'{o}':'{t}'" for o, t in th.items()) + "}" for d, th in thumbs.items()) + "},")
    lines.append("reg:" + json.dumps(regs, separators=(",", ":")) + "};")
    DATA.write_text("\n".join(lines) + "\n")


# Deliveries named otherwise, taken under the game's outfit ids: the Gemini Little Me outfits that are the
# GPT base reduced exactly (512 x 1024) and clearly better than the flat outfit in all four views.
RENAME = {"outfit-little-dino-romper-": "worn-little-dino-romper-", "outfit-little-rainbow-tulle-": "worn-little-rainbow-tutu-tee-"}


def do_import(src_dir):
    SRC.mkdir(parents=True, exist_ok=True)
    for p in sorted(Path(src_dir).glob("*.png")):
        stem = p.stem
        for a, b in RENAME.items():
            if stem.startswith(a):
                stem = b + stem[len(a):]
        if not any(stem.startswith(f"{k}-{d}-") for k in ("base", "worn") for d in DOLLS):
            continue
        img = Image.open(p)
        img.load()
        img = img.convert("RGBA")
        arr = np.asarray(img).copy()
        arr[..., 3] = alpha_norm(arr[..., 3])
        img = Image.fromarray(arr, "RGBA")
        q = SRC / (stem + ".webp")
        img.save(q, "WEBP", lossless=True, quality=100, method=6, exact=True)
        back = np.asarray(Image.open(q).convert("RGBA"))
        assert (back == np.asarray(img)).all(), q
        print(f"{q.relative_to(ROOT)}  {q.stat().st_size // 1024} KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--import", dest="imp")
    ap.add_argument("--doll", default="adult", choices=DOLLS)
    ap.add_argument("--check")
    ap.add_argument("--ship", action="store_true")
    ap.add_argument("--reuse", action="store_true", help="ship with the registration kept in art/proofs/round3 (no new search)")
    args = ap.parse_args()
    if args.imp:
        do_import(args.imp)
        return
    set_doll(args.doll)
    regs, measures, heads = {}, {}, {}
    if args.reuse:
        kept = json.loads(reg_file(DOLL).read_text())
        regs = {v: tuple(kept[v]["reg"]) for v in VIEWS}
        measures = {v: kept[v]["regions"] for v in VIEWS}
    for v in VIEWS if not args.reuse else ():
        new = load(SRC / f"base-{DOLL}-{v}.webp")
        reg = register(v, new, verbose=True)
        regs[v] = reg
        # the head alone: does it want another scale than the body (changed proportions)?
        hreg = register(v, new, mask_name="head", init=reg, verbose=True)
        heads[v] = hreg
        res, fixed, mov, fig = measure(v, new, reg)
        res["headScale"] = round(hreg[0] / reg[0], 4)
        measures[v] = res
        print(v, json.dumps(res))
        if args.check:
            out = Path(args.check)
            out.mkdir(parents=True, exist_ok=True)
            overlay_sheet(v, fixed, mov, fig, 4, res, out / f"a-overlay-{DOLL}-{v}.jpg")
    if not args.reuse:
        PROOFS.mkdir(parents=True, exist_ok=True)
        reg_file(DOLL).write_text(json.dumps({v: {"reg": list(regs[v]), "head": list(heads[v]), "regions": measures[v]} for v in VIEWS}, indent=1) + "\n")
    if args.ship:
        entries = {o: {} for o in OUTFITS}
        total = 0
        for o in OUTFITS:
            for v in VIEWS:
                e = ship_one(o, v, regs[v], None)
                entries[o][v] = e
                total += e["bytes"] + e["maskBytes"]
                print(f"  {o} {v}: {e['size']} at {e['at']}  {e['bytes'] // 1024} KB + mask {e['maskBytes'] // 1024} KB")
        print(f"total {total // 1024} KB")
        thumbs = {o: ship_thumb(o) for o in OUTFITS}
        reg = {v: {"a": round(regs[v][0], 5), "b": [round(regs[v][1], 2), round(regs[v][2], 2)], "regions": measures[v]} for v in VIEWS}
        manifest_file(DOLL).write_text(json.dumps({"reg": reg, "entries": entries, "thumbs": thumbs}, indent=1) + "\n")
        write_data()


if __name__ == "__main__":
    main()
