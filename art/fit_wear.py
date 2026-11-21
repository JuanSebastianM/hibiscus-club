"""Fit the second wardrobe (pack2 outfits, with the round 2 redraws where they won) on the base dolls in
all four views, and ship the game-size sprites.

Usage (from the repo root):
    python3 -I art/fit_wear.py            write the generated block in dist/catalog.js
    python3 -I art/fit_wear.py --ship     also write the game-size sprites and thumbnails to dist/assets/wear/

Sources: the full-resolution slices in art/sprites/pack2 (art/slice_pack2.py) and art/sprites/round2
(art/slice_round2.py), each with a manifest. The sheets were drawn on these dolls' proportions, so an
outfit is placed by registration rather than drawn into place: every view of an item comes from one
sheet row at one drawing scale (manifest scaleRef / source.box), so one scale `k` (doll px per sprite
px) and the doll y of the sprite's top (`top`, front view) place all four views; the other views follow
from where their boxes sit on the sheet (`dtop` corrects a view by a few px where the art differs).
k and top were read by matching the garment's shoulders, waist, hem and cuffs to the doll's (see the
overlay contact sheets in art/lab.html?sheet=wear), then corrected by eye.

Each row of the sprite is then warped onto the body (as art/fit_views.py does for the first wardrobe):
* hug [(dollY0, dollY1, m0, m1)]: inside these doll rows the garment's own span is stretched onto the
  doll's span plus margins (m0 outer-left / m1 outer-right, doll px). Front and back: the span through
  the body's centre line (the torso without the arms below the armpits; at the legs, both legs); the
  garment's span is the one through its own centre line (sleeves apart; `gc` = garment centre column).
  Side views: the silhouette without the near arm (drawn over the outfit), the garment's whole width.
* rows outside the hug ranges keep the drawing scale (`loose` * k) about the centre of the nearest
  hugged row, easing over `blend` doll px, so skirts, sleeves and hems keep their drawn shape.
* cover (front/back: (m0, m1) or side): rows only ever widen so the garment covers the body plus
  margins inside `cover_rows` (no bodysuit can show at the sides of a fitted garment).
Pieces: stacked garments (a top over trousers, leg warmers) are separate pieces with their own k/top,
drawn in order; rect pieces (`rect`: x, y, w) are placed whole (the leg warmers on the calves).
Hand-written extras per view (skin regions, parts behind the body, the near arm's clip line in side
views, sleeves cut out and mapped onto the arms) are in EXTRA and copied into the fit; the right view
mirrors the left view's extras (x -> MIRROR - x) unless given.

Output: the block between `/* @generated wear (art/fit_wear.py) */` and `/* @end wear */` in
dist/catalog.js: WEAR[id] = {cat, doll, s (game sprite scale), files: {view: {part: [w, h]}}, fit: {view: fit}}.
With --ship: dist/assets/wear/<id>-<view>[-<part>].webp at scale s (premultiplied LANCZOS, WebP q86),
and dist/assets/wear/thumbs/<id>.webp (160 px, the studio card picture).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
P2 = ROOT / "art" / "sprites" / "pack2"
R2 = ROOT / "art" / "sprites" / "round2"
MAN = {"p": json.load(open(P2 / "manifest.json"))["items"], "r": json.load(open(R2 / "manifest.json"))["items"]}
OUTDIR = DIST / "assets" / "wear"
VIEWS = ("front", "left", "right", "back")
STEP = 6
MIRROR = {"adult": 181, "little": 207}
# doll-local x of the body's centre line per view (DOLL_CANVAS centroid minus the view's origin)
CENTRE = {"adult": {"front": 198.8, "back": 198.1}, "little": {"front": 201.3, "back": 201.4}}


# ------------------------------------------------------------------ configuration
def hugf(y0, y1, m=2):
    return (y0, y1, m, m)


# default hug: side views from the shoulders to the top of the thighs; front and back are placed as drawn
# (uniform), only widened to cover the torso from the armpits down (COVER_ROWS)
HUG = {"adult": {"fb": [], "side": [hugf(176, 500, 2)]},
       "little": {"fb": [], "side": [hugf(216, 545, 2)]}}
COVER_ROWS = {"adult": (286, 495), "little": (352, 540)}
# bodysuit repainted as skin wherever the outfit lets it show (only lilac pixels change)
SKIN = {"adult": {"front": [{"rect": [0, 165, 397, 345]}], "left": [{"rect": [0, 140, 182, 580]}],
                  "right": [{"rect": [0, 140, 182, 580]}], "back": [{"rect": [0, 140, 397, 580]}]},
        "little": {"front": [{"rect": [0, 205, 403, 355]}], "left": [{"rect": [0, 180, 209, 500]}],
                   "right": [{"rect": [0, 180, 209, 500]}], "back": [{"rect": [0, 180, 403, 500]}]}}

CONFIG = {
    # id: src (p = pack2, r = round2), k, top, and per view / piece options
    "sarong-swimsuit": dict(src="p", k=.70, top=166),
    "tankini-board-shorts": dict(src="p", k=.71, top=170),
    "crochet-cover-up": dict(src="p", k=.69, top=175),
    "aqua-velour-tracksuit": dict(src="r", k=1.2, top=142, armY=465, sideHug=[hugf(176, 845, 2)]),
    "tennis-dress": dict(src="p", k=.77, top=134),
    "baby-tee-cargo": dict(src="p", pieces=[dict(part="capris", k=.92, top=166), dict(part="top", k=.92, top=166)]),
    "sequin-halter-dress": dict(src="p", k=.74, top=141),
    "butterfly-satin-skirt": dict(src="p", k=.88, top=158),
    "puffer-vest-slip-dress": dict(src="p", k=.70, top=114),
    "plaid-knit-vest-set": dict(src="p", k=.70, top=135),
    "hoodie-dress-leg-warmers": dict(src="r", pieces=[dict(part="dress", k=.9, top=150)]),
    "denim-overall-dress": dict(src="p", k=.73, top=177),
}
EXTRA = {}


# ------------------------------------------------------------------ helpers
def entry(src, iid, view):
    return MAN[src][iid]["views"][view]


def sprite_file(src, iid, view, part=None):
    e = entry(src, iid, view)
    base = P2 if src == "p" else R2
    if part and part != "main":
        return base / e["parts"][part]["file"], e["parts"][part]["offset"]
    return base / e["file"], [0, 0]


def load_rgba(p):
    return np.array(Image.open(p).convert("RGBA"))


def close(mask, r=3):
    """Morphological closing (square, radius r): lace and mesh count as cloth for the spans."""
    def dil(m, r):
        o = m.copy()
        for d in range(1, r + 1):
            o[d:] |= m[:-d]; o[:-d] |= m[d:]
        p = o.copy()
        for d in range(1, r + 1):
            p[:, d:] |= o[:, :-d]; p[:, :-d] |= o[:, d:]
        return p
    return ~dil(~dil(mask, r), r)


def runs(row):
    xs = np.nonzero(row)[0]
    if not len(xs):
        return []
    g = np.nonzero(np.diff(xs) > 3)[0]
    return list(zip([int(xs[0])] + [int(xs[i + 1]) for i in g], [int(xs[i]) + 1 for i in g] + [int(xs[-1]) + 1]))


def centre_span(row, c, legs=True):
    """The run through column c; where c falls in a gap (between the legs), the outer extent of the
    nearest runs either side."""
    rs = runs(row)
    if not rs:
        return None
    hit = [r for r in rs if r[0] <= c < r[1]]
    if hit:
        return hit[0]
    if not legs:
        return None
    lft = [r for r in rs if r[1] <= c]
    rgt = [r for r in rs if r[0] > c]
    if lft and rgt:
        return (lft[-1][0], rgt[0][1])
    return None


def catalog_arm(doll):
    src = (DIST / "catalog.js").read_text()
    m = re.search(doll + r":\{rightOrigin:.*?arm:(\[\[.*?\]\])\}", src, re.S)
    return json.loads(m.group(1))


_body = {}


def body_spans(doll, view):
    key = (doll, view)
    if key in _body:
        return _body[key]
    a = load_rgba(DIST / f"assets/dolls/{doll}-{view}.webp")[..., 3] > 100
    if view in ("left", "right"):
        arm = catalog_arm(doll)
        if view == "right":
            arm = [[MIRROR[doll] - x, y] for x, y in arm]
        m = Image.new("L", (a.shape[1], a.shape[0]), 0)
        ImageDraw.Draw(m).polygon([tuple(p) for p in arm], fill=255)
        a = a & ~(np.array(m) > 0)
        out = []
        for y in range(a.shape[0]):
            rs = runs(a[y])
            out.append((rs[0][0], rs[-1][1]) if rs else None)
    else:
        c = int(round(CENTRE[doll][view]))
        out = [centre_span(a[y], c) for y in range(a.shape[0])]
    # smooth over a few rows (fingers and toes do not kink a hem)
    sm = []
    for y in range(len(out)):
        w = [s for s in out[max(0, y - 3):y + 4] if s]
        sm.append(None if not out[y] else (float(np.mean([s[0] for s in w])), float(np.mean([s[1] for s in w]))))
    _body[key] = sm
    return sm


def smooth(vals, r=2):
    out = []
    for i, v in enumerate(vals):
        win = [w for w in vals[max(0, i - r):i + r + 1] if w is not None]
        out.append(None if v is None or not win else tuple(np.mean([w[j] for w in win]) for j in range(2)))
    return out


def view_top(cfg, src, iid, view, part=None):
    """Doll y of the sprite's top in this view: the front's `top`, moved by where this view's box sits on
    the sheet relative to the front's (one drawing scale per row), plus the part's offset."""
    ef, ev = entry(src, iid, "front"), entry(src, iid, view)
    k = cfg["k"]
    top = cfg["top"] + (ev["source"]["box"][1] - ef["source"]["box"][1]) * k
    if part:
        top += ev["parts"][part]["offset"][1] * k  # the part inside the whole sprite (k, top: the whole sprite)
    return top + cfg.get("dtop", {}).get(view, 0)


def gen_piece(iid, doll, view, cfg, src):
    part = cfg.get("part")
    path, _ = sprite_file(src, iid, view, part)
    rgba = load_rgba(path)
    H, W = rgba.shape[:2]
    alpha = rgba[..., 3] > 100
    cl = close(alpha, cfg.get("closeR", 3))
    if cfg.get("core"):  # sprite polygons (sleeves) left out of the measured spans
        m = Image.new("L", (W, H), 0)
        for poly in cfg["core"]:
            ImageDraw.Draw(m).polygon([tuple(p) for p in poly], fill=255)
        cl = cl & ~(np.array(m) > 0)
    k = cfg["k"]
    top = view_top(cfg, src, iid, view, part)
    vmap = cfg.get("vmap")

    def dolly(sy):
        if vmap:
            return float(np.interp(sy, [p[0] for p in vmap], [p[1] for p in vmap])) + (top - cfg["top"])
        return top + sy * k

    side = view in ("left", "right")
    gc = cfg.get("gc", {}).get(view)
    if gc is None:  # the garment's centre column: mean of the upper half (shoulders, chest)
        ys, xs = np.nonzero(alpha[: max(1, H // 2)])
        gc = float(xs.mean()) if len(xs) else W / 2
    if side:
        gs = [(rs[0][0], rs[-1][1]) if (rs := runs(cl[y])) else None for y in range(H)]
    else:
        gs = [centre_span(cl[y], int(round(gc))) for y in range(H)]
    body = body_spans(doll, view)
    hug = cfg.get("hug", [])
    rows = sorted(set(list(range(0, H, STEP)) + [H - 1]))
    src_sp = smooth([gs[y] for y in rows])
    tgt = []
    for sy in rows:
        y = dolly(sy)
        h = next((h for h in hug if h[0] <= y <= h[1]), None)
        yi = int(round(y))
        b = body[yi] if h and 0 <= yi < len(body) else None
        tgt.append((b[0] - h[2], b[1] + h[3]) if b else None)
    tgt = smooth(tgt)
    tr = [None] * len(rows)
    for i, (s, t) in enumerate(zip(src_sp, tgt)):
        # hug only rows where the garment spans most of the body there (not a halter tie, a strap, the
        # last row of a hem): a narrow row stretched to the body's width would fly out
        if s and t and (s[1] - s[0]) * k > cfg.get("hugMin", .6) * (t[1] - t[0]):
            kx = (t[1] - t[0]) / (s[1] - s[0])
            tr[i] = (kx, t[0] - s[0] * kx)
    known = [i for i, t in enumerate(tr) if t]
    loose = cfg.get("loose", 1.0) * k
    blend = cfg.get("blend", 60)
    cx_doll = cfg.get("cx", {}).get(view)
    out = []
    for i, sy in enumerate(rows):
        if tr[i]:
            kx, o = tr[i]
        elif known:
            j = min(known, key=lambda q: abs(q - i))
            kj, oj = tr[j]
            s = src_sp[j] or (0, W)
            c_s = (s[0] + s[1]) / 2
            c_d = oj + c_s * kj
            t = 1 if not blend else min(1, abs(dolly(sy) - dolly(rows[j])) / blend)
            kl = kj + (loose - kj) * t
            kx, o = kl, c_d - c_s * kl
        else:  # no hugged rows: uniform, centred on cx (doll) at the sprite centre gc
            kx, o = loose, (cx_doll if cx_doll is not None else body_centre(doll, view)) - gc * loose
        cover = cfg.get("cover")
        y = int(round(dolly(sy)))
        lim = cfg.get("cover_rows", (-1e9, 1e9))
        if cover is not None and lim[0] <= y <= lim[1]:
            b = body[y] if 0 <= y < len(body) else None
            s = src_sp[i]
            if b and s and s[1] - s[0] > 4:
                d0, d1 = o + s[0] * kx, o + s[1] * kx
                n0, n1 = min(d0, b[0] - cover[0]), max(d1, b[1] + cover[1])
                kx = (n1 - n0) / (s[1] - s[0])
                o = n0 - s[0] * kx
        o += cfg.get("dx", {}).get(view, 0) if isinstance(cfg.get("dx"), dict) else cfg.get("dx", 0)
        out.append((sy, dolly(sy), o, o + W * kx))
    return {"part": part or "main", "rows": out, "W": W, "H": H}


def body_centre(doll, view):
    if view in CENTRE[doll]:
        return CENTRE[doll][view]
    a = load_rgba(DIST / f"assets/dolls/{doll}-{view}.webp")[..., 3] > 100
    return float(np.nonzero(a)[1].mean())


def mirror_shapes(shapes, M):
    out = []
    for s in shapes:
        s = dict(s)
        if "poly" in s:
            s["poly"] = [[M - x, y] for x, y in s["poly"]]
        if "rect" in s:
            x, y, w, h = s["rect"]
            s["rect"] = [M - x - w, y, w, h]
        if "ellipse" in s:
            x, y, rx, ry, *r = s["ellipse"]
            s["ellipse"] = [M - x, y, rx, ry] + ([-r[0]] if r else [])
        out.append(s)
    return out


def item_conf(iid):
    c = CONFIG[iid]
    src = c["src"]
    doll = MAN[src][iid]["category"].split("-")[1] if iid in MAN[src] else None
    return c, src, doll


def view_cfg(c, view, piece=None):
    """Merge: item defaults < item per-view < piece < piece per-view."""
    base = {k: v for k, v in c.items() if k not in VIEWS and k != "pieces"}
    base.update(c.get(view, {}))
    if piece:
        base.update({k: v for k, v in piece.items() if k not in VIEWS})
        base.update(piece.get(view, {}))
    side = view in ("left", "right")
    if side and "sideHug" in base:
        base.setdefault("hug", base["sideHug"])
    base.setdefault("hug", HUG[c["_doll"]]["side" if side else "fb"])
    if not side:  # front/back: drawn on the doll, so placed as drawn; rows only widen to cover the torso
        base.setdefault("cover", (2, 2))
        base.setdefault("cover_rows", COVER_ROWS[c["_doll"]])
    return base


def scale_for(c):
    ks = [p["k"] for p in c.get("pieces", [])] or [c["k"]]
    return min(1.0, max(ks) * c.get("res", 1.0))


def build():
    wear = {}
    for iid, c in CONFIG.items():
        src = c["src"]
        cat = MAN[src][iid]["category"] if iid in MAN[src] else MAN["p"][iid]["category"]
        doll = cat.split("-")[1]
        c["_doll"] = doll
        s = scale_for(c)
        files, fits = {}, {}
        for view in VIEWS:
            pieces = c.get("pieces") or [None]
            fpieces = []
            for pc in pieces:
                cfg = view_cfg(c, view, pc)
                if cfg.get("skip"):
                    continue
                part = cfg.get("part")
                path, _ = sprite_file(src, iid, view, part)
                im = Image.open(path)
                Ws, Hs = max(1, round(im.width * s)), max(1, round(im.height * s))
                files.setdefault(view, {})[part or "main"] = [Ws, Hs]
                if cfg.get("rect"):
                    x, y, w = cfg["rect"]
                    fpieces.append({"part": part or "main", "x": x, "y": y, "w": w})
                    continue
                g = gen_piece(iid, doll, view, cfg, src)
                sx, sy_ = Ws / g["W"], Hs / g["H"]
                warp = [[round(sy * sy_, 2), round(dy, 1), 0, round(a, 1), Ws, round(b, 1)] for sy, dy, a, b in g["rows"]]
                if cfg.get("slip"):  # an opaque lining drawn first, so the doll never shows through lace or tulle
                    files[view]["slip"] = [Ws, Hs]
                    fpieces.append({"part": "slip", "warp": warp})
                piece = {"part": part or "main", "warp": warp}
                if cfg.get("sleeve") and view in ("front", "back"):
                    piece["parts"] = sleeve_limbs(cfg, doll, view, g["W"], g["H"], sx, s)
                if cfg.get("cut"):
                    piece["cut"] = [[[round(x * sx, 1), round(y * sx, 1)] for x, y in poly] for poly in cfg["cut"]]
                fpieces.append(piece)
            fit = {"pieces": fpieces}
            vc = view_cfg(c, view)
            if view in ("left", "right") and vc.get("armY") is not None:
                y = vc["armY"]
                y0, y1 = (y, y) if not isinstance(y, list) else y
                clip = [{"poly": [[-80, y0], [300, y1], [300, 950], [-80, 950]], "feather": 3}]
                fit["armClip"] = clip if view == "left" else mirror_shapes(clip, MIRROR[doll])
            if view in ("left", "right") and vc.get("arm") == "hidden":
                fit["arm"] = "hidden"
            if vc.get("behind"):
                fit["behind"] = vc["behind"] if view != "right" or "right" in c else mirror_shapes(vc["behind"], MIRROR[doll])
            if vc.get("shoesOver"):
                fit["shoesOver"] = True
            ex = EXTRA.get(iid, {})
            vx = ex.get(view)
            if vx is None and view == "right" and ex.get("left"):
                vx = mirror_extra(ex["left"], MIRROR[doll])
            if vx:
                for key, v in vx.items():
                    if key == "pieceExtra":
                        for i, pe in v.items():
                            fit["pieces"][int(i)].update(pe)
                    else:
                        fit[key] = v
            if "skin" not in fit:
                fit["skin"] = SKIN[doll][view]
            fits[view] = fit
        wear[iid] = {"cat": cat, "doll": doll, "s": round(s, 4), "files": files, "fit": fits}
    return wear


# the doll's arms per view: (shoulder joint, wrist) for the viewer-left and viewer-right arm, doll px
ARMS = {"adult": {"front": [[[94, 196], [28, 470]], [[306, 196], [372, 470]]],
                  "back": [[[100, 194], [38, 455]], [[296, 194], [358, 455]]]},
        "little": {"front": [[[104, 230], [31, 470]], [[298, 230], [371, 470]]],
                   "back": [[[96, 230], [36, 466]], [[307, 230], [367, 466]]]}}


def limb(poly, s0, s1, d0, d1, kx, extra):
    """As catalog.js limb(): the cut-out from sprite points s0 -> s1 onto doll points d0 -> d1."""
    sv = (s1[0] - s0[0], s1[1] - s0[1]); dv = (d1[0] - d0[0], d1[1] - d0[1])
    ky = float(np.hypot(*dv) / np.hypot(*sv))
    rot = float(np.degrees(np.arctan2(dv[1], dv[0]) - np.arctan2(sv[1] * ky, sv[0] * kx)))
    r = lambda pts: [[round(x, 1), round(y, 1)] for x, y in pts]
    return {"poly": r(poly), "pivot": r([s0])[0], "to": r([d0])[0], "rot": round(rot, 2),
            "scale": [round(kx, 4), round(ky, 4)], **extra}


def sleeve_limbs(cfg, doll, view, W, H, sx, s):
    """Long sleeves in the front and back views: each sleeve (the sprite left of `seam` for the viewer-left
    one, mirrored for the other) is cut from the body and mapped from its shoulder s0 and cuff s1 onto the
    doll's arm (ARMS, nudged by `arm` [[dx0, dy0], [dx1, dy1]], outward positive), drawn under the body
    piece. Sprite coordinates are full resolution; the result is in game-sprite px (sx)."""
    sl = cfg["sleeve"]
    out = []
    for i, (d0, d1) in enumerate(ARMS[doll][view]):
        seam, s0, s1 = sl["seam"], sl["s0"], sl["s1"]
        if i == 1:
            m = lambda pts: [[W - x, y] for x, y in pts]
            seam, s0, s1 = m(seam), m([s0])[0], m([s1])[0]
            edge = W + 20
        else:
            edge = -20
        poly = [[edge, seam[0][1]]] + [list(p) for p in seam] + [[edge, seam[-1][1]]]
        nd = sl.get("arm", [[0, 0], [0, 0]])
        sgn = -1 if i == 0 else 1
        D0 = [d0[0] + sgn * nd[0][0], d0[1] + nd[0][1]]
        D1 = [d1[0] + sgn * nd[1][0], d1[1] + nd[1][1]]
        S = lambda pts: [[x * sx, y * sx] for x, y in pts]
        kx = cfg["k"] / sx * sl.get("kx", 1.0)
        out.append(limb(S(poly), S([s0])[0], S([s1])[0], D0, D1, kx, {"under": True}))
    return out


def mirror_extra(vx, M):
    out = {}
    for key, v in vx.items():
        if key in ("skin", "behind", "front", "armClip", "overRegion", "erase", "cutDoll"):
            out[key] = mirror_shapes(v, M)
        elif key == "pieceExtra":
            continue  # sprite-space: given per view
        else:
            out[key] = v
    return out


def write_block(wear):
    lines = ["const WEAR={"]
    for iid, w in wear.items():
        lines.append(json.dumps(iid) + ":" + json.dumps(w, separators=(",", ":")) + ",")
    lines.append("};")
    block = "\n".join(lines)
    path = DIST / "catalog.js"
    src = path.read_text()
    a, b = "/* @generated wear (art/fit_wear.py) */\n", "\n/* @end wear */"
    i, j = src.index(a) + len(a), src.index(b)
    path.write_text(src[:i] + block + src[j:])


def premul_resize(im, size):
    a = np.array(im.convert("RGBA")).astype(np.float32)
    al = a[..., 3:4] / 255
    pm = np.concatenate([a[..., :3] * al, a[..., 3:4]], -1)
    chans = [Image.fromarray(pm[..., i]).resize(size, Image.LANCZOS) for i in range(4)]
    r = np.stack([np.array(c) for c in chans], -1)
    alpha = np.clip(r[..., 3], 0, 255)
    rgb = np.where(alpha[..., None] > .5, r[..., :3] * 255 / np.maximum(alpha[..., None], 1e-3), 0)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha]).round().astype(np.uint8), "RGBA")


def slip_image(im, opt):
    """A plain lining in the garment's own outline (holes of the lace closed, `inset` px inside its edge,
    only from sprite row `from` down), softly shaded, for see-through garments."""
    from PIL import ImageFilter
    a = np.array(im.convert("RGBA"))[..., 3] > 60
    a = close(a, opt.get("close", 10))
    m = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(2 * opt.get("inset", 3) + 1))
    m = np.array(m).astype(np.float32)
    m[: int(opt.get("from", 0) * m.shape[0])] = 0
    soft = np.array(Image.fromarray(m.astype(np.uint8)).filter(ImageFilter.GaussianBlur(6))).astype(np.float32) / 255
    col = np.array([int(opt["color"][i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    shade = (.8 + .2 * soft)[..., None]
    rgb = np.clip(col * shade, 0, 255)
    return Image.fromarray(np.dstack([rgb, m]).astype(np.uint8), "RGBA")


def ship(wear):
    OUTDIR.mkdir(parents=True, exist_ok=True)
    (OUTDIR / "thumbs").mkdir(exist_ok=True)
    keep = set()
    for iid, w in wear.items():
        src = CONFIG[iid]["src"]
        for view, parts in w["files"].items():
            for part, (Ws, Hs) in parts.items():
                if part == "slip":
                    name = f"{iid}-{view}-slip.webp"
                    keep.add(name)
                    path, _ = sprite_file(src, iid, view)
                    premul_resize(slip_image(Image.open(path), CONFIG[iid]["slip"]), (Ws, Hs)).save(
                        OUTDIR / name, "WEBP", quality=80, method=6)
                    continue
                path, _ = sprite_file(src, iid, view, None if part == "main" else part)
                name = f"{iid}-{view}" + ("" if part == "main" else "-" + part) + ".webp"
                keep.add(name)
                dst = OUTDIR / name
                if dst.exists() and dst.stat().st_mtime > path.stat().st_mtime and Image.open(dst).size == (Ws, Hs):
                    continue  # up to date
                premul_resize(Image.open(path), (Ws, Hs)).save(OUTDIR / name, "WEBP", quality=86, method=6)
                keep.add(name)
        # card picture: the whole front sprite, fitted into 160 px
        path, _ = sprite_file(src, iid, "front")
        im = Image.open(path)
        f = 160 / max(im.size)
        premul_resize(im, (max(1, round(im.width * f)), max(1, round(im.height * f)))).save(
            OUTDIR / "thumbs" / f"{iid}.webp", "WEBP", quality=88, method=6)
    for p in OUTDIR.glob("*.webp"):
        if p.name not in keep:
            p.unlink()


def main(argv):
    wear = build()
    write_block(wear)
    if "--ship" in argv:
        ship(wear)
    print("wrote", len(wear), "items", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
