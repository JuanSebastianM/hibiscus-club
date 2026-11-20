"""Generate the side/back outfit row warps in dist/catalog.js (between the @generated markers).

Usage (from the repo root):
  1. export the composed front outfits once (they define the back-view footprint):
     serve the repo root on port 4193 and run
     node art/fit_views_footprints.cjs <dir>       (writes <dir>/<outfit>.png, DOLL_CANVAS space)
  2. python3 -I art/fit_views.py <dir>

Side views ("hug"): every sprite row inside a hug range [dollY0, dollY1] is stretched so its
silhouette spans the base doll's silhouette at that height (near arm removed) plus margins
(front, back). Rows outside the hug ranges keep the natural scale `loose` * k around the centre of
the nearest hugged row, so skirts and flares keep their drawn shape.
Back views ("front"): each sprite row is stretched onto the mirrored footprint of the calibrated
front outfit at the same height, so the doll keeps her silhouette when turned around.
Per-item options (CONFIG): cover = rows only ever widen so the garment covers the body silhouette
(side: (front, back) margins on loose rows; back: a margin over the back torso / legs, cover_rows
limits it to doll rows below the armpits, cover_core masks sleeves out of the measured span);
gapfill = back trousers whose art legs part wider than the doll's get two nudged copies of the inner
leg strips drawn behind them (emitted as extra pieces before the main one).
Vertical placement is uniform: doll y = top + spriteY * k (k and top come from the item's scaleRef:
the four views share one drawing scale, related to the front fit), optionally piecewise via vmap.
Hand-written extras (arm clipping, sleeve parts, bodysuit cover regions) live in catalog.js.
"""
import json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
VIEWS = json.load(open(DIST / "assets/items/views/manifest.json"))["items"]
DOLL = {  # origin per view (must match catalog.js) and canvas centroid C
    "adult": {"C": 298.8, "front": (100, 145), "back": (100.7, 145), "left": (205.3, 145)},
    "little": {"C": 300.3, "front": (99, 155), "back": (98.9, 155), "left": (195.1, 155)},
}
STEP = 6

# id: doll, and per view either a dict or (for the pyjamas) a list of per-part dicts
CONFIG = {
    "hibiscus-flares": {"doll": "adult",
        "left": dict(k=1.894, top=187.9, hug=[(186, 500, 1, 1)], loose=1.0, blend=120, cover=(2, 3)),
        "back": dict(k=1.894, top=187.9, cover=4, cover_rows=(306, 2000), cover_core=[[[0, 0], [48, 0], [48, 62], [0, 62]]], gapfill=dict(sy0=150, w=30, shift=6))},
    "lilac-satin-bow-dress": {"doll": "adult",
        "left": dict(k=1.315, top=181.1, hug=[(181, 400, 1, 1)], loose=1.0, blend=60),
        "back": dict(k=1.315, top=183.8)},
    "denim-jacket-skirt": {"doll": "adult",
        "left": dict(k=1.321, top=132, hug=[(170, 420, 3, 3)], loose=1.0, blend=60),
        "back": dict(k=1.321, top=136, margin=5, core=[[[0, 20], [95, 20], [100, 60], [100, 100], [75, 170], [55, 240], [0, 240]]])},
    "green-hibiscus-sundress": {"doll": "adult",
        # the front was shortened to end at the knee (it is a short sundress); the waist stays put
        "left": dict(k=1.947, top=168.9, vmap=[(0, 168.9), (100, 355), (296, 655)], hug=[(180, 400, 1, 1)], loose=0.85, blend=60),
        "back": dict(k=1.947, top=168.9, vmap=[(0, 182), (100, 355), (296, 655)])},  # straps start on the shoulders
    "black-flares-set": {"doll": "adult",
        "left": dict(k=2.008, top=165.3, hug=[(170, 500, 1, 1)], loose=1.0, blend=120, cover=(2, 3)),
        "back": dict(k=2.008, top=171.3, margin=[(250, 5), (290, 14), (380, 14), (430, 5)], cover=[(285, 4), (330, 8), (380, 6), (450, 4)], cover_rows=(285, 2000), gapfill=dict(sy0=150, w=30, shift=6), core=[[[0, 0], [57, 0], [59, 25], [60, 48], [59, 60], [59, 72], [59, 84], [54, 94], [43, 106], [35, 120], [28, 140], [0, 140]]])},
    "pink-velour-cargo": {"doll": "adult",
        "left": dict(k=1.803, top=146.4, hug=[(180, 470, 4, 4)], loose=1.0, blend=80, cover=(3, 4)),
        "back": dict(k=1.803, top=148.2, margin=5, core=[[[0, 0], [65, 0], [70, 25], [71, 60], [70, 72], [68, 80], [66, 90], [63, 100], [55, 115], [47, 135], [35, 160], [0, 160]]])},
    "yellow-dot-dress": {"doll": "little",
        "left": dict(k=1.358, top=209.8, hug=[(215, 400, 1, 1)], loose=1.0, blend=60),
        "back": dict(k=1.358, top=209.8)},
    "lilac-cord-pinafore": {"doll": "little",
        "left": dict(k=1.311, top=200.8, hug=[(215, 400, 1, 1)], loose=1.0, blend=60),
        "back": dict(k=1.311, top=200.8)},
    "pink-gingham-bow-dress": {"doll": "little",
        "left": dict(k=1.225, top=208.7, hug=[(215, 400, 1, 1)], loose=1.0, blend=60),
        "back": dict(k=1.225, top=208.7)},
    "denim-overalls": {"doll": "little",
        "left": dict(k=1.37, top=200.4, hug=[(210, 560, 2, 2)], loose=1.0, blend=60),
        "back": dict(k=1.37, top=201.8)},
    "mint-cardigan-dress": {"doll": "little",
        "left": dict(k=1.5, top=192.5, hug=[(205, 420, 3, 3)], loose=1.0, blend=60),
        "back": dict(k=1.5, top=194, margin=5, core=[[[0, 0], [82, 0], [88, 60], [86, 125], [80, 150], [75, 172], [0, 172]]])},
    "star-pajamas": {"doll": "little",
        "left": [dict(part="trousers", k=1.388, top=201.3, off=(5, 155), hug=[(400, 780, 3, 6)], loose=1.0, blend=60),
                 dict(part="top", k=1.388, top=201.3, off=(0, 0), hug=[(205, 400, 3, 6)], loose=1.0, blend=40)],
        "back": [dict(part="trousers", k=1.388, top=202.7, off=(39, 156), core=[]),
                 dict(part="top", k=1.388, top=202.7, off=(0, 0), margin=5, cover=5, cover_rows=(350, 2000), core=[[[0, 0], [71, 0], [73, 40], [73, 80], [69, 100], [61, 120], [49, 140], [46, 170], [0, 170]]])]},
}


def load_alpha(path):
    return np.array(Image.open(path).convert("RGBA"))[..., 3]


def spans(a, th=100, core=None):
    """Per row (first, last+1) opaque x; with core=x only the run nearest x (sleeves apart)."""
    out = []
    for y in range(a.shape[0]):
        m = a[y] > th
        xs = np.nonzero(m)[0]
        if not len(xs):
            out.append(None)
            continue
        if core is None:
            out.append((int(xs[0]), int(xs[-1]) + 1))
            continue
        gaps = np.nonzero(np.diff(xs) > 3)[0]
        starts = [xs[0]] + [xs[g + 1] for g in gaps]
        ends = [xs[g] + 1 for g in gaps] + [xs[-1] + 1]
        best = min(zip(starts, ends), key=lambda r: 0 if r[0] <= core < r[1] else min(abs(r[0] - core), abs(r[1] - core)))
        out.append((int(best[0]), int(best[1])))
    return out


def catalog_arm(doll):
    src = (DIST / "catalog.js").read_text()
    m = re.search(doll + r":\{rightOrigin:.*?arm:(\[\[.*?\]\])\}", src, re.S)
    return json.loads(m.group(1))


def body_side(doll):
    a = load_alpha(DIST / f"assets/dolls/{doll}-left.webp").copy()
    mask = Image.new("L", (a.shape[1], a.shape[0]), 0)
    ImageDraw.Draw(mask).polygon([tuple(p) for p in catalog_arm(doll)], fill=255)
    a[np.array(mask) > 0] = 0
    return spans(a)


def body_back(doll):
    """Back view: per row the torso (the run through the centre line, arms left out) or, where the
    centre is a gap (between the legs), the two runs either side of it."""
    a = load_alpha(DIST / f"assets/dolls/{doll}-back.webp")
    c = int(round(DOLL[doll]["C"] - DOLL[doll]["back"][0]))
    out = []
    for y in range(a.shape[0]):
        xs = np.nonzero(a[y] > 100)[0]
        if not len(xs):
            out.append(None)
            continue
        gaps = np.nonzero(np.diff(xs) > 3)[0]
        runs = list(zip([xs[0]] + [xs[g + 1] for g in gaps], [xs[g] + 1 for g in gaps] + [xs[-1] + 1]))
        hit = [r for r in runs if r[0] <= c < r[1]]
        if hit:
            out.append((int(hit[0][0]), int(hit[0][1])))
            continue
        lft = [r for r in runs if r[1] <= c]
        rgt = [r for r in runs if r[0] > c]
        out.append((int(lft[-1][0]), int(rgt[0][1])) if lft and rgt else None)
    return out


def smooth(vals, r=2):
    out = []
    for i, v in enumerate(vals):
        win = [w for w in vals[max(0, i - r):i + r + 1] if w is not None]
        out.append(None if v is None or not win else tuple(np.mean([w[j] for w in win]) for j in range(2)))
    return out


def gen(id, view, cfg, doll, fpdir):
    part = cfg.get("part")
    v = VIEWS[id]["views"][view]
    f = v["parts"][part]["file"] if part else v["file"]
    sa = load_alpha(DIST / "assets/items/views" / f)
    core = "core" in cfg  # sleeve polygons (sprite px, viewer-left arm) left out of the spans
    if cfg.get("core"):
        sa = sa.copy()
        W = sa.shape[1]
        mask = Image.new("L", (W, sa.shape[0]), 0)
        for poly in cfg["core"]:
            ImageDraw.Draw(mask).polygon([tuple(p) for p in poly], fill=255)
            if view == "back":
                ImageDraw.Draw(mask).polygon([(W - x, y) for x, y in poly], fill=255)
        sa[np.array(mask) > 0] = 0
    ss = spans(sa)
    H = sa.shape[0]
    k, top = cfg["k"], cfg["top"]
    ox, oy = cfg.get("off", (0, 0))
    vmap = cfg.get("vmap")

    def dolly(sy):
        if vmap:
            return float(np.interp(sy + oy, [p[0] for p in vmap], [p[1] for p in vmap]))
        return top + (sy + oy) * k

    rows_sy = sorted(set(list(range(0, H, STEP)) + [H - 1]))
    target = []  # per row: (a,b) doll span or None
    if view == "left":
        body = body_side(doll)
        for sy in rows_sy:
            y = dolly(sy)
            hit = next((h for h in cfg["hug"] if h[0] <= y <= h[1]), None)
            b = body[int(round(y))] if hit and 0 <= int(round(y)) < len(body) else None
            target.append((b[0] - hit[2], b[1] + hit[3]) if b else None)
    else:
        fp = load_alpha(Path(fpdir) / f"{id}.png")
        C = DOLL[doll]["C"]
        if core:
            fp = load_alpha(Path(fpdir) / f"{id}.core.png")
        fs = spans(fp, 60)
        bx, by = DOLL[doll]["back"]
        for sy in rows_sy:
            Y = int(round(dolly(sy) + by))
            s = fs[Y] if 0 <= Y < len(fs) else None
            m = cfg.get("margin", 0)
            if isinstance(m, list):  # [(dollY, margin), ...] interpolated
                m = float(np.interp(dolly(sy), [p[0] for p in m], [p[1] for p in m]))
            target.append((2 * C - s[1] - bx - m, 2 * C - s[0] - bx + m) if s else None)
    src = smooth([ss[sy] for sy in rows_sy])
    target = smooth(target)
    # horizontal transform per row: x' = o + x * kx
    tr = [None] * len(rows_sy)
    for i, (s, t) in enumerate(zip(src, target)):
        if s and t and s[1] - s[0] > 4:
            kx = (t[1] - t[0]) / (s[1] - s[0])
            tr[i] = (kx, t[0] - s[0] * kx)
    csrc = src  # spans the cover widens from; cover_core = sprite polys (sleeves) left out of them
    if cfg.get("cover_core"):
        ca = load_alpha(DIST / "assets/items/views" / f).copy()
        cm = Image.new("L", (ca.shape[1], ca.shape[0]), 0)
        for poly in cfg["cover_core"]:
            ImageDraw.Draw(cm).polygon([tuple(p) for p in poly], fill=255)
            if view == "back":
                ImageDraw.Draw(cm).polygon([(ca.shape[1] - x, y) for x, y in poly], fill=255)
        ca[np.array(cm) > 0] = 0
        csrc = smooth([spans(ca)[sy] for sy in rows_sy])
    if view == "back" and cfg.get("cover") is not None:
        bb = body_back(doll)  # smoothed over a few rows so the hands do not kink the hem
        bback = [None if bb[y] is None else tuple(float(np.mean([v[j] for v in bb[max(0, y - 6):y + 7] if v])) for j in range(2)) for y in range(len(bb))]
    loose = cfg.get("loose", 1.0) * k
    blend = cfg.get("blend", 0)  # doll px over which loose rows ease from the hugged scale
    known = [i for i, t in enumerate(tr) if t]
    out = []
    for i, sy in enumerate(rows_sy):
        if tr[i]:
            kx, o = tr[i]
        else:
            j = min(known, key=lambda q: abs(q - i))
            kj, oj = tr[j]
            s = src[j] or (0, sa.shape[1])
            c_s = (s[0] + s[1]) / 2
            c_d = oj + c_s * kj
            t = 1 if not blend else min(1, abs(dolly(sy) - dolly(rows_sy[j])) / blend)
            kl = kj + (loose - kj) * t
            kx, o = kl, c_d - c_s * kl
        # cover: rows only ever widen so the garment keeps the body covered. Side views: loose rows,
        # (front, back) margins over the silhouette. Back views: every row, a margin (or [(dollY, m)])
        # over the back torso / legs (body_back); limit=(y0, y1) restricts it to those doll rows.
        cover = cfg.get("cover")
        y = int(round(dolly(sy)))
        lim = cfg.get("cover_rows", (-1e9, 1e9))
        if cover is not None and lim[0] <= y <= lim[1] and (view == "back" or not tr[i]):
            if view == "left":
                b, m0, m1 = (body[y] if 0 <= y < len(body) else None), cover[0], cover[1]
            else:
                b = bback[y] if 0 <= y < len(bback) else None
                m0 = m1 = float(np.interp(y, [p[0] for p in cover], [p[1] for p in cover])) if isinstance(cover, list) else cover
            s = csrc[i]
            if b and s and s[1] - s[0] > 4:
                d0, d1 = o + s[0] * kx, o + s[1] * kx
                n0, n1 = min(d0, b[0] - m0), max(d1, b[1] + m1)
                kx = (n1 - n0) / (s[1] - s[0])
                o = n0 - s[0] * kx
        kx *= cfg.get("sx", 1)
        o += cfg.get("dx", 0)
        W = sa.shape[1]
        out.append([sy, round(dolly(sy), 1), 0, round(o, 1), W, round(o + W * kx, 1)])
    piece = {"part": part or "main", "warp": out}
    gf = cfg.get("gapfill")
    if not gf:
        return [piece]
    # gap fill (back views): the legs of the art part wider than the doll's, so two copies of the
    # inner strip of each trouser leg (sprite rows sy0.., `w` px either side of the centre line),
    # nudged `shift` doll px towards the centre, are drawn behind the piece to close the gap.
    W, cs = sa.shape[1], sa.shape[1] / 2
    y0 = max(0, int(gf["sy0"]))
    fills = []
    for side in (-1, 1):
        x0, x1 = (cs - gf["w"], cs) if side < 0 else (cs, cs + gf["w"])
        warp = [[r[0], r[1], r[2], round(r[3] - side * gf["shift"], 1), r[4], round(r[5] - side * gf["shift"], 1)] for r in out]
        fills.append({"part": part or "main", "warp": warp, "keep": [[[x0, y0], [x1, y0], [x1, H], [x0, H]]]})
    return fills + [piece]


def main():
    fpdir = sys.argv[1]
    lines = []
    for id, c in CONFIG.items():
        doll = c["doll"]
        views = {}
        for view in ("left", "back"):
            cfgs = c[view] if isinstance(c[view], list) else [c[view]]
            views[view] = {"pieces": [p for cfg in cfgs for p in gen(id, view, cfg, doll, fpdir)]}
        lines.append("vf(%s,%s,%s);" % (json.dumps(id), json.dumps(doll), json.dumps(views, separators=(",", ":"))))
    block = "\n".join(lines)
    path = DIST / "catalog.js"
    src = path.read_text()
    a, b = "/* @generated outfit view warps (art/fit_views.py) */\n", "\n/* @end generated */"
    i, j = src.index(a) + len(a), src.index(b)
    path.write_text(src[:i] + block + src[j:])
    print("wrote", len(lines), "outfits")


if __name__ == "__main__":
    main()
