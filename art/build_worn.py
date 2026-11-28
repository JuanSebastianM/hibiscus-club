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
SKIN_HUED = {("little", "bear-onesie")}


def garment_mask(worn, base, f=1.0, redrawn=False, skin_hued=False):
    """Where the worn picture differs from the base (the garment), softened: 0..1 at the new picture's px.
    A redrawn body differs from the base's everywhere by a few levels: there skin-coloured pixels are not
    garment either."""
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
    if redrawn:  # skin-coloured where the base has skin is skin (not the garment's edge over the bodysuit)
        # (a skin-hued garment, the bear onesie's brown fleece: skin-hued but clearly unlike the base is garment)
        strong = (d > .12) if skin_hued else np.zeros_like(d, bool)
        m *= ~(skin_px(worn) & skin_px(base) & ~strong)
    # drop thin lines (an outline drawn a pixel off the base's along the arms and legs is not garment)
    ro = 4 if DOLL == "little" else 2  # (Little Me's limbs carry a heavier outline stroke)
    m = (box_blur((box_blur(m, ro) > .999).astype(np.float32), ro) > 1e-3).astype(np.float32)
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
    ("adult", "hoodie-dress-leg-warmers"): {"slivers": (1250, 2000)},  # specks between the cuffs and the body, at the hem
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


# ------------------------------------------------------------------ redrawn bodies (block C2)
# Outfits whose whole body between the chin and the ankles was generated again (at about 887 x 1774, then
# enlarged), with only the head, hands and feet put back from the base, and not always: the torso, arms and
# legs drift from the base by up to 30 px, four outfits have a regenerated head, and the colour can change
# from view to view. Each such picture is fitted to the base before use (fit_redrawn): a smooth warp found
# on the skin and the outline only (never the garment, which has no counterpart in the base), the head and
# neck and the front and back hands put back from the base with a feathered join (the garment, a collar or a
# hood, stays on top), and the garment's colour matched to one view where MATCH_COLOUR says so. The no-arm
# views are fitted the same way, without the near arm; the sleeve layers are cut from the fitted view itself
# (the delivered sleeve only gives the shape), so the sleeve that swings with the puppet's arm is the same
# fabric as the still picture.
REDRAWN = {("adult", o) for o in ("aqua-velour-tracksuit", "baby-tee-cargo", "black-flares-set", "butterfly-satin-skirt",
                                  "green-hibiscus-sundress", "lilac-satin-bow-dress", "pink-velour-cargo", "sarong-swimsuit",
                                  "sequin-halter-dress", "tankini-board-shorts",
                                  # block C3 (head, hands and feet already the base's to the pixel: NOFIT)
                                  "puffer-vest-slip-dress", "plaid-knit-vest-set", "hoodie-dress-leg-warmers", "denim-overall-dress")}
# No-arm deliveries not used (the arm smeared out sideways or regenerated: streaks, a spiral, a blob): the
# puppet rebuilds the garment behind the near arm from the fabric beside it instead
# Redrawn bodies that lie on the base already (head, hands and feet pixel-identical, outline within a pixel):
# not warped (the warp, measured on skin, took the silver slip dress for skin and pulled it in), only their
# masks treat skin as skin
NOFIT = {("adult", o) for o in ("puffer-vest-slip-dress", "plaid-knit-vest-set", "hoodie-dress-leg-warmers", "denim-overall-dress")}
# Little Me's wardrobe (block C for Little Me): drawn on her base in place (head identical, feet within a few
# levels), so not warped either; no no-arm views were delivered (the puppet rebuilds the garment behind the arm)
LITTLE_C = ('ballet-wrap-set', 'beach-poncho', 'bear-onesie', 'denim-overalls', 'dino-romper', 'lilac-cord-pinafore', 'mint-cardigan-dress', 'pink-gingham-bow-dress', 'rainbow-tutu-tee', 'raincoat-set', 'rash-guard-set', 'ruffle-swimsuit', 'star-pajamas', 'tulle-party-dress', 'yellow-dot-dress')
REDRAWN |= {("little", o) for o in LITTLE_C}
NOFIT |= {("little", o) for o in LITTLE_C}
NOARM_UNUSED = {("adult", o) for o in ("puffer-vest-slip-dress", "plaid-knit-vest-set", "hoodie-dress-leg-warmers")}
# (the denim overall dress keeps its no-arm views: the puppet uses only their broad colour there, faded, which
# reads better on denim than the rows rebuilt from the fabric beside the arm)
# the garment's colour statistics in every view matched to this view's (sequin halter dress: the front is light
# coral, the delivered sides and back a darker mauve)
MATCH_COLOUR = {("adult", "sequin-halter-dress"): "front",
                # Little Me: the bear onesie warmer orange-brown, the raincoat and ruffle swimsuit darker, in the
                # other views than in front
                ("little", "bear-onesie"): "front", ("little", "raincoat-set"): "front", ("little", "ruffle-swimsuit"): "front",
                ("little", "lilac-cord-pinafore"): "front"}  # (the pinafore paler lilac in the right view)
_FITTED = {}
FLOW_CACHE = None  # --flow-cache DIR: the warps kept between runs (keyed by the source file's size and time)


def skin_px(x):
    """The doll's skin by hue and saturation (the base's arms, legs and face: hue 12 to 26 degrees, saturation
    .45 to .75; shadows a little wider), so a coral, pink, peach or yellow garment is not taken for skin."""
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    return (hue > 9) & (hue < 32) & (sat > .33) & (sat < .9)


def garment_px(x):
    """Opaque pixels that are not skin, without thin rims (an outline stroke is not garment)."""
    m = ((x[..., 3] > .5) & ~skin_px(x)).astype(np.float32)
    return box_blur((box_blur(m, 3) > .999).astype(np.float32), 3) > 1e-3


def _down(a, f):
    H, W = a.shape[:2]
    return a[:H // f * f, :W // f * f].reshape(H // f, f, W // f, f, *a.shape[2:]).mean((1, 3))


def warp_img(img, u, v):
    """img sampled at (x + u, y + v) (bilinear; premultiply colour first)."""
    H, W = u.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    X, Y = xx + u, yy + v
    x0, y0 = np.floor(X).astype(np.int32), np.floor(Y).astype(np.int32)
    fx, fy = X - x0, Y - y0
    out = 0
    for dy in (0, 1):
        for dx in (0, 1):
            xi, yi = np.clip(x0 + dx, 0, img.shape[1] - 1), np.clip(y0 + dy, 0, img.shape[0] - 1)
            w = (fx if dx else 1 - fx) * (fy if dy else 1 - fy)
            out = out + img[yi, xi] * (w[..., None] if img.ndim == 3 else w)
    return out


def flow(fixed, moving, wt, levels=(16, 8, 4), alpha2=.05, iters=150, warps=3):
    """Horn-Schunck flow, coarse to fine: d with moving(p + d) ~ fixed(p) where wt > 0, smooth elsewhere.
    fixed, moving: lists of channels; returns (u, v) at full size."""
    u = v = None
    for f in levels:
        F = [box_blur(_down(c, f), 1) for c in fixed]
        M = [box_blur(_down(c, f), 1) for c in moving]
        Wt = _down(wt.astype(np.float32), f)
        H, W = F[0].shape
        if u is None:
            u, v = np.zeros((H, W), np.float32), np.zeros((H, W), np.float32)
        else:
            u = np.asarray(Image.fromarray(u).resize((W, H), Image.BILINEAR)) * 2
            v = np.asarray(Image.fromarray(v).resize((W, H), Image.BILINEAR)) * 2
        for _ in range(warps):
            Mw = [warp_img(m, u, v) for m in M]
            J11 = J12 = J22 = b1 = b2 = 0
            for Fc, Mc in zip(F, Mw):
                Iy, Ix = np.gradient(Mc)
                It = Mc - Fc
                J11, J12, J22 = J11 + Wt * Ix * Ix, J12 + Wt * Ix * Iy, J22 + Wt * Iy * Iy
                b1, b2 = b1 + Wt * Ix * It, b2 + Wt * Iy * It
            A11, A22 = J11 + alpha2, J22 + alpha2
            det = A11 * A22 - J12 * J12
            U, V = u, v
            for _ in range(iters):
                r1 = alpha2 * (box_blur(U, 1) - u) - b1
                r2 = alpha2 * (box_blur(V, 1) - v) - b2
                U, V = u + (A22 * r1 - J12 * r2) / det, v + (A11 * r2 - J12 * r1) / det
            u, v = U.astype(np.float32), V.astype(np.float32)
    H, W = fixed[0].shape
    f = levels[-1]
    return (np.asarray(Image.fromarray(u).resize((W, H), Image.BILINEAR)) * f,
            np.asarray(Image.fromarray(v).resize((W, H), Image.BILINEAR)) * f)


def _channels(x):
    g = gray(x)
    return [x[..., 3], (g - box_blur(box_blur(g, 6), 6)) * 2]


def warp_rgba(x, u, v):
    pm = x.copy()
    pm[..., :3] *= pm[..., 3:4]
    out = warp_img(pm, u, v)
    out[..., :3] = np.where(out[..., 3:4] > 1e-4, out[..., :3] / np.maximum(out[..., 3:4], 1e-4), 0)
    return np.clip(out, 0, 1).astype(np.float32)


def fig_box(base):
    x0, y0, x1, y1 = bbox(base[..., 3])
    return x0, y0, x1, y1


def restore_from_base(x, base, view):
    """The head and neck, and in front and back views the hands, from the base, feathered into the fitted
    picture; garment pixels (a collar, a hood, a cuff) stay. Returns the number of pixels changed."""
    x0, y0, x1, y1 = fig_box(base)
    h, w = y1 - y0, x1 - x0
    H, W = base.shape[:2]
    ys = np.arange(H, dtype=np.float32)[:, None]
    xs = np.arange(W, dtype=np.float32)[None, :]
    wt = np.clip((y0 + .20 * h - ys) / (.04 * h), 0, 1) * np.ones((1, W), np.float32)  # head and neck
    if view in ("front", "back"):
        band = np.clip((ys - (y0 + .50 * h)) / (.03 * h), 0, 1) * np.clip((y0 + .70 * h - ys) / (.02 * h), 0, 1)
        side = np.clip(np.maximum((x0 + .19 * w - xs), (xs - (x1 - .19 * w))) / (.02 * w), 0, 1)
        wt = np.maximum(wt, band * side)
    # keep the garment (feathered 3 px) below the chin (above it everything is the base's: the lips, eyes and
    # brows are not skin-coloured either); take the base only where it is skin or nothing
    below = np.clip((ys - (y0 + .11 * h)) / (.03 * h), 0, 1)
    # nor the base's own features down to the chin (the lips sit at .13 to .15 of her height), grown 16 px
    feat = ((base[..., 3] > .5) & ~skin_px(base)).astype(np.float32)
    feat[int(y0 + .17 * h):] = 0
    below = below * (1 - np.clip(box_blur(feat, 16) * 8, 0, 1))
    keep = np.clip(box_blur(garment_px(x).astype(np.float32), 3) * 2, 0, 1) * below
    ok = np.maximum(box_blur((skin_px(base) | (base[..., 3] < .5)).astype(np.float32), 2), 1 - below)
    wt = wt * (1 - keep) * ok
    pm_x, pm_b = x[..., :3] * x[..., 3:4], base[..., :3] * base[..., 3:4]
    a = x[..., 3] * (1 - wt) + base[..., 3] * wt
    rgb = pm_x * (1 - wt[..., None]) + pm_b * wt[..., None]
    n = int(((wt > .5) & ((x[..., 3] > .5) | (base[..., 3] > .5))).sum())
    x[..., :3] = np.where(a[..., None] > 1e-4, rgb / np.maximum(a[..., None], 1e-4), 0)
    x[..., 3] = a
    return n


def diff_garment(x, base):
    """For a picture drawn on the base in place: the garment is what differs from the base (whatever its hue:
    a brown bear onesie is skin-coloured to the hue test)."""
    m = ((np.abs(x[..., :3] - base[..., :3]).max(-1) > .12) & (x[..., 3] > .9)).astype(np.float32)
    return box_blur((box_blur(m, 2) > .999).astype(np.float32), 2) > 1e-3


def garment_stats(x, base=None):
    m = garment_px(x) if base is None else diff_garment(x, base)
    y0 = fig_box(x)[1]
    m[:y0 + int((.28 if DOLL == "little" else .2) * (fig_box(x)[3] - y0))] = False  # not the face
    c = x[..., :3][m]
    return c.mean(0), c.std(0)


def match_colour(x, ref, base=None):
    """Garment pixels moved to the reference view's colour statistics (per channel mean and spread)."""
    mu, sd = garment_stats(x, base)
    mu_r, sd_r = ref
    gm = garment_px(x) if base is None else diff_garment(x, base)
    g = np.clip(box_blur(gm.astype(np.float32), 2), 0, 1)[..., None]
    new = np.clip((x[..., :3] - mu) * (sd_r / np.maximum(sd, 1e-4)) + mu_r, 0, 1)
    x[..., :3] = x[..., :3] * (1 - g) + new * g


def fit_redrawn(outfit, name, worn, base):
    """A redrawn picture (name = view, or view-noarm) fitted to the base: (fitted picture, (u, v))."""
    key = (DOLL, outfit, name)
    if (DOLL, outfit) in NOFIT:
        H, W = worn.shape[:2]
        z = np.zeros((H, W), np.float32)
        view = name.split("-")[0]
        ref = MATCH_COLOUR.get((DOLL, outfit))
        if ref and view != ref:
            rk = (DOLL, outfit, "stats", ref)
            if rk not in _FITTED:
                _FITTED[rk] = garment_stats(*_raw(outfit, ref))
            worn = worn.copy()
            match_colour(worn, _FITTED[rk], base)
            print(f"    {outfit} {name}: colour matched to {ref}")
        _FITTED[key] = (worn, (z, z))
        return worn.copy(), (z, z)
    if key in _FITTED:
        return _FITTED[key][0].copy(), _FITTED[key][1]
    view = name.split("-")[0]
    wt = (box_blur(garment_px(base).astype(np.float32), 8) < 1e-3) & (box_blur(garment_px(worn).astype(np.float32), 8) < 1e-3)
    if name.endswith("noarm"):
        # not the near arm (in the base, not in this picture): wide regions where the base has the body and
        # this picture nothing, grown by 30 px
        gone = ((base[..., 3] > .5) & (worn[..., 3] < .5)).astype(np.float32)
        gone = box_blur((box_blur(gone, 20) > .999).astype(np.float32), 20) > 1e-3
        wt &= ~(box_blur(gone.astype(np.float32), 30) > 1e-3)
    src = SRC / f"worn-{DOLL}-{outfit}-{name}.webp"
    cf = None
    if FLOW_CACHE:
        st = src.stat()
        cf = Path(FLOW_CACHE) / f"{DOLL}-{outfit}-{name}-{st.st_size}-{int(st.st_mtime)}-{MIRROR.get((DOLL, outfit), {}).get(view, '')}.npy"
    if cf and cf.exists():
        u, v = np.load(cf).astype(np.float32)
    else:
        u, v = flow(_channels(base), _channels(worn), wt)
        if cf:
            cf.parent.mkdir(parents=True, exist_ok=True)
            np.save(cf, np.stack([u, v]).astype(np.float16))
    out = warp_rgba(worn, u, v)
    ref = MATCH_COLOUR.get((DOLL, outfit))
    if ref and view != ref:  # (before the head goes back: lips and eyes are not skin-coloured either)
        rk = (DOLL, outfit, "stats", ref)
        if rk not in _FITTED:
            _FITTED[rk] = garment_stats(fit_redrawn(outfit, ref, *_raw(outfit, ref))[0])
        match_colour(out, _FITTED[rk])
    n = restore_from_base(out, base, view) if not name.endswith("noarm") else 0
    mag = np.hypot(u, v)[base[..., 3] > .5]
    print(f"    fit {outfit} {name}: warp up to {mag.max():.1f} px (95 % under {np.percentile(mag, 95):.1f}), {n} px from the base"
          + (f", colour matched to {ref}" if ref and view != ref else ""))
    _FITTED[key] = (out, (u, v))
    return out.copy(), (u, v)


def _raw(outfit, name):
    view = name.split("-")[0]
    w = load_view(f"worn-{DOLL}-{outfit}-{{view}}{name[len(view):]}.webp", outfit, view)
    w[..., 3] = np.where(w[..., 3] < .04, 0, w[..., 3])
    return w, np.asarray(Image.open(SRC / f"base-{DOLL}-{view}.webp").convert("RGBA"), dtype=np.float32) / 255.0


def match_local(x, ref, r=60):
    """x's garment moved to ref's local colour (the difference where both are garment, spread smoothly over
    r px): a no-arm view drawn separately is a shade off, and it shows round the arm when the arm swings."""
    # only well inside both garments (8 px from anything else: the arm's rim is not garment) and where the
    # two are the same fabric (a fold or the arm's shadow in one of them is not a colour difference)
    inside = lambda m: box_blur(m.astype(np.float32), 8) > .999
    diff = ref[..., :3] - x[..., :3]
    w = (inside(garment_px(x)) & inside(garment_px(ref)) & (np.abs(diff).max(-1) < .12)).astype(np.float32)
    d = np.stack([box_blur(diff[..., c] * w, r) for c in range(3)], -1)
    n = box_blur(w, r)[..., None]
    corr = np.where(n > 1e-3, d / np.maximum(n, 1e-3), 0)
    g = np.clip(box_blur(garment_px(x).astype(np.float32), 2), 0, 1)[..., None]
    x[..., :3] = np.clip(x[..., :3] + corr * g, 0, 1)


def sleeve_from_fitted(outfit, view, sleeve, fitted, uv):
    """The near sleeve cut from the fitted view: the delivered sleeve's shape, moved onto the raw view
    (the shift within 80 px that best lays its outline on the view's edges), carried by the view's warp, times the fitted picture."""
    raw, _ = _raw(outfit, view)
    k = 4

    def edges(c):
        gy, gx = np.gradient(box_blur(_down(c, k), 1))
        e = np.hypot(gx, gy)
        return e / max(float(e.max()), 1e-6)
    G = edges(gray(raw) + raw[..., 3])  # the sleeve's outline shows in the view as an edge
    S = edges(sleeve[..., 3])
    best, arg = -1, (0, 0)
    R = 20
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            sc = float((np.roll(np.roll(S, dy, 0), dx, 1) * G).sum())
            if sc > best:
                best, arg = sc, (dx, dy)
    if (DOLL, outfit) in NOFIT:  # the sleeve file is in place (same render, registered)
        arg = (0, 0)
    sa = np.roll(np.roll(sleeve[..., 3], arg[1] * k, 0), arg[0] * k, 1)
    sa = np.clip(warp_img(sa, *uv), 0, 1)
    out = fitted.copy()
    out[..., 3] *= sa * (1.0 if (DOLL, outfit) in NOFIT else garment_px(fitted))  # (in place: the sleeve file is the shape; a brown fleece is skin-hued)
    out[..., 3] = np.clip(box_blur(out[..., 3], 1), 0, 1) * (fitted[..., 3] > .02)
    cover = float(out[..., 3].sum() / max(sleeve[..., 3].sum(), 1))
    print(f"    sleeve {outfit} {view}: shape moved {arg[0] * k}, {arg[1] * k} px, {cover:.0%} of the delivered sleeve")
    return out


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
    if (DOLL, outfit) in REDRAWN:
        base = np.asarray(Image.open(SRC / f"base-{DOLL}-{view}.webp").convert("RGBA"), dtype=np.float32) / 255.0
        worn, _ = fit_redrawn(outfit, view, worn, base)
        return worn, base, 1.0
    base_img = Image.open(SRC / f"base-{DOLL}-{mirrored or view}.webp").convert("RGBA")
    if mirrored:  # compare with the base mirrored the same way, so the garment mask is the same
        base_img = base_img.transpose(Image.FLIP_LEFT_RIGHT)
    f = base_img.width / worn.shape[1]
    if abs(f - 1) > 1e-6:
        base_img = base_img.convert("RGBa").resize((worn.shape[1], worn.shape[0]), Image.LANCZOS).convert("RGBA")
    return worn, np.asarray(base_img, dtype=np.float32) / 255.0, f


def ship_one(outfit, view, reg, pm_cache):
    worn, base, f = worn_and_base(outfit, view)
    redrawn = (DOLL, outfit) in REDRAWN
    reg = tuple(v / f for v in reg)
    # shipped px per doll px: 2, or 1 for a delivery that has no more than the old doll's own resolution
    K = WORN_SCALE if reg[0] >= WORN_SCALE * .9 else 1
    na_path = SRC / f"worn-{DOLL}-{outfit}-{view}-noarm.webp"
    if (DOLL, outfit) in NOARM_UNUSED:
        na_path = SRC / "none"
    noarm = load_view(f"worn-{DOLL}-{outfit}-{{view}}-noarm.webp", outfit, view) if view in ("left", "right") and na_path.exists() else None
    if noarm is not None and redrawn:
        noarm[..., 3] = np.where(noarm[..., 3] < .04, 0, noarm[..., 3])
        noarm, _ = fit_redrawn(outfit, f"{view}-noarm", noarm, base)
        match_local(noarm, worn)
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
    gm = garment_mask(worn, base, f, redrawn, (DOLL, outfit) in SKIN_HUED)
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
        na[..., 3] *= garment_mask(noarm, base, 1.0, redrawn)
        pic = sample(premul_img(na), a, bx, by, u0, v0, u1, v1, 1)
        q = OUT / f"{DOLL}-{outfit}-{view}-noarm.webp"
        Image.fromarray((np.clip(pic, 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(q, "WEBP", quality=QUALITY, alpha_quality=100, method=6)
        out["noarm"] = f"assets/worn/{q.name}"
        out["bytes"] += q.stat().st_size
    hd_path = SRC / f"hood-{DOLL}-{outfit}-{view}.webp"
    if hd_path.exists():
        # the hood worn up (hood alone, face open), on the same canvas: shipped at K, cropped to itself
        hd = load(hd_path)
        hd[..., 3] = np.where(hd[..., 3] < .04, 0, hd[..., 3])
        hx0, hy0, hx1, hy1 = bbox(hd[..., 3], .004)
        hu0, hv0 = math.floor((hx0 - bx) / a) - 2, math.floor((hy0 - by) / a) - 2
        hu1, hv1 = math.ceil((hx1 - bx) / a) + 2, math.ceil((hy1 - by) / a) + 2
        pic = sample(premul_img(hd), a, bx, by, hu0, hv0, hu1, hv1, K)
        q = OUT / f"{DOLL}-{outfit}-{view}-hood.webp"
        Image.fromarray((np.clip(pic, 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(q, "WEBP", quality=QUALITY, alpha_quality=100, method=6)
        out["hood"] = {"src": f"assets/worn/{q.name}", "at": [hu0, hv0], "size": [hu1 - hu0, hv1 - hv0]}
        out["bytes"] += q.stat().st_size
    sl_path = SRC / f"worn-{DOLL}-{outfit}-{view}-sleeve.webp"
    if view in ("left", "right") and sl_path.exists():
        # the near arm's sleeve alone, at the picture's resolution, for the puppet: it goes with the arm
        sl = load_view(f"worn-{DOLL}-{outfit}-{{view}}-sleeve.webp", outfit, view)
        sl[..., 3] = np.where(sl[..., 3] < .04, 0, sl[..., 3])
        if redrawn:
            sl = sleeve_from_fitted(outfit, view, sl, worn, _FITTED[(DOLL, outfit, view)][1])
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
    if (DOLL, outfit) in REDRAWN:
        a = garment_mask(worn, base, f, True, (DOLL, outfit) in SKIN_HUED) * worn[..., 3]
    else:
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
                if e.get("hood"):
                    h = e["hood"]
                    extra += f",hood:{{src:'{h['src']}',at:[{h['at'][0]},{h['at'][1]}],size:[{h['size'][0]},{h['size'][1]}]}}"
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
        if not any(stem.startswith(f"{k}-{d}-") for k in ("base", "worn", "hood") for d in DOLLS):
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
    ap.add_argument("--only", help="ship only these outfits (comma-separated), keeping the others' entries from the manifest")
    ap.add_argument("--flow-cache", help="keep the redrawn pictures' warps here between runs")
    ap.add_argument("--dump", help="also write each shipped picture of the outfits shipped, fitted, as PNG here (review)")
    args = ap.parse_args()
    if args.imp:
        do_import(args.imp)
        return
    set_doll(args.doll)
    global FLOW_CACHE
    FLOW_CACHE = args.flow_cache
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
        only = args.only.split(",") if args.only else OUTFITS
        old = json.loads(manifest_file(DOLL).read_text()) if args.only else {}
        entries = {o: (old.get("entries", {}).get(o) if o not in only else {}) for o in OUTFITS}
        entries = {o: e for o, e in entries.items() if e is not None}
        total = 0
        for o in only:
            for v in VIEWS:
                e = ship_one(o, v, regs[v], None)
                if args.dump:
                    Path(args.dump).mkdir(parents=True, exist_ok=True)
                    w = worn_and_base(o, v)[0]
                    Image.fromarray((np.clip(w, 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(Path(args.dump) / f"{o}-{v}.png")
                entries[o][v] = e
                total += e["bytes"] + e["maskBytes"]
                print(f"  {o} {v}: {e['size']} at {e['at']}  {e['bytes'] // 1024} KB + mask {e['maskBytes'] // 1024} KB")
        print(f"total {total // 1024} KB")
        thumbs = {o: ship_thumb(o) if o in only else old["thumbs"][o] for o in entries}
        reg = {v: {"a": round(regs[v][0], 5), "b": [round(regs[v][1], 2), round(regs[v][2], 2)], "regions": measures[v]} for v in VIEWS}
        manifest_file(DOLL).write_text(json.dumps({"reg": reg, "entries": entries, "thumbs": thumbs}, indent=1) + "\n")
        write_data()


if __name__ == "__main__":
    main()
