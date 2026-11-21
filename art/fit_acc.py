"""Fit the accessories (hats, glasses, bags, toys) on the base dolls in all four views, and ship the
game-size sprites.

Usage (from the repo root):
    python3 -I art/fit_acc.py [--overlays DIR]   slice the round 2 redraws, register them, write the
                                                 generated block in dist/catalog.js
    python3 -I art/fit_acc.py --ship             also write the game-size sprites and the 160 px card
                                                 pictures to dist/assets/acc/

Sources
* The round 2 hat redraws (art/source/round2/accessories/acc-hats-fix-{adult,little}[-worn].webp):
  each item sheet has a `-worn` proof with the same layout, the hat on the bald doll. The sheets are
  sliced by grid cell here (art/sprites/round2/accessories/<id>-<view>.webp). Little Me's item sheet
  came at half the proof's size, so her hats are cut out of the full-size proof instead, with the
  item sheet's (enlarged) alpha as the mask. The bucket hat was painted two colours (butter in front
  and left, khaki on the right and back): the right and back are recoloured to the front's colour.
  Each proof cell is registered to the base doll's head as art/fit_hair_pack2.py registers the hair
  proofs (its masked normalised cross-correlation of the high-passed face and the silhouette, with
  the hat masked out); the back view, which shows almost no skin, takes the row's scale and vertical
  placement and registers only x. The hat sprite then sits where its cell sits on the proof.
* Everything else comes from the pack2 accessory sheets (art/sprites/pack2/<category>, sliced by
  art/slice_pack2.py), which have no worn proofs: each item is placed by anchors read off the art
  (ANCHORS) and doll landmarks (the eyes and ears for glasses, the crown of the head for a tiara or
  headband, the hand for things she holds), with a scale per item chosen against the redraws' worn
  proofs (a toy is about a quarter of Little Me's height, a tote hangs to mid-thigh).

Per view the fit is the drawFitted rect {x, y, w, h, rot} plus:
* hats: `cut`, the doll-local polygon above the hat's lower edge (the end of the first opaque run of
  every column, extended level past the brim): hair there is erased, so buns and volume do not poke
  through the crown; `clip: false` hides hair clips under hats that cover the head.
* glasses: side views `lens`, the doll-local box of the frame front, drawn over the hair (the arms
  stay under it); the back view has no fit (hidden behind the head).
* held things (`hand`: 0 = her right hand, the viewer's left in front; side views the near hand):
  `grip`, the doll-local polygon of the fingers redrawn over the handle.
* backpack: `layer: 'pack'` (front: straps over the outfit; side and back: on her back).

Output: the block between `/* @generated acc (art/fit_acc.py) */` and `/* @end acc */` in
dist/catalog.js: ACC[id] = {cat, doll, s, files: {view: [w, h]}, fit: {view: fit}}, sprites
dist/assets/acc/<id>-<view>.webp at scale s (premultiplied LANCZOS, WebP), cards
dist/assets/acc/thumbs/<id>.webp.
"""
from __future__ import annotations

import importlib.util
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
_spec = importlib.util.spec_from_file_location("hc_fit_hair", HERE / "fit_hair_pack2.py")
HP = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(HP)

DIST = ROOT / "dist"
DOLLS = DIST / "assets" / "dolls"
P2 = ROOT / "art" / "sprites" / "pack2"
R2 = ROOT / "art" / "sprites" / "round2" / "accessories"
SRC = ROOT / "art" / "source" / "round2" / "accessories"
OUTDIR = DIST / "assets" / "acc"
VIEWS = ("front", "left", "right", "back")
MIRROR = {"adult": 181, "little": 207}
P2MAN = json.loads((P2 / "manifest.json").read_text())["items"]

# ------------------------------------------------------------------ the round 2 hat redraws
FIX = {
    "adult": dict(sheet="acc-hats-fix-adult", extract=False, scales=(.55, 1.05),
                  rows=["bucket-hat", "sun-hat", "baseball-cap"]),
    "little": dict(sheet="acc-hats-fix-little", extract=True, scales=(.85, 1.45),
                   rows=["sun-bonnet", "bear-beanie", "party-crown"]),
}
RECOLOR = {"bucket-hat": {"right": "front", "back": "front"}}


def rgba(path):
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32) / 255.0


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8), "RGBA")


def match_colour(a, ref):
    """Move the opaque pixels of a to the mean and spread of ref's (per channel, in RGB)."""
    ma, mr = a[..., 3] > .5, ref[..., 3] > .5
    out = a.copy()
    for c in range(3):
        va, vr = a[..., c][ma], ref[..., c][mr]
        out[..., c] = (a[..., c] - va.mean()) / max(va.std(), 1e-3) * vr.std() + vr.mean()
    out[..., :3] = np.clip(out[..., :3], 0, 1)
    return out


def slice_fix(doll):
    """Cells of the item sheet (and its worn proof): {(id, view): dict(sprite, box, cell, worn)}."""
    cfg = FIX[doll]
    worn = rgba(SRC / f"{cfg['sheet']}-worn.webp")
    H, W = worn.shape[:2]
    item = Image.open(SRC / f"{cfg['sheet']}.webp").convert("RGBA")
    if item.size != (W, H):
        item = item.resize((W, H), Image.LANCZOS)
    item = np.asarray(item, dtype=np.float32) / 255.0
    out = {}
    for r, iid in enumerate(cfg["rows"]):
        for c, view in enumerate(VIEWS):
            x0, x1, y0, y1 = c * W // 4, (c + 1) * W // 4, r * H // 3, (r + 1) * H // 3
            a = item[y0:y1, x0:x1, 3]
            ys, xs = np.nonzero(a > .03)
            bx0, by0 = max(0, xs.min() - 2), max(0, ys.min() - 2)
            bx1, by1 = min(a.shape[1], xs.max() + 3), min(a.shape[0], ys.max() + 3)
            if cfg["extract"]:
                spr = worn[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1].copy()
                m = np.clip((a[by0:by1, bx0:bx1] - .03) / .6, 0, 1)
                spr[..., 3] = spr[..., 3] * m
            else:
                spr = item[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1].copy()
            spr[..., :3] *= spr[..., 3:4] > 0
            out[(iid, view)] = dict(sprite=spr, box=[x0 + bx0, y0 + by0], cell=[x0, y0, x1, y1],
                                    worn=worn[y0:y1, x0:x1], mask=a)
    for iid, views in RECOLOR.items():
        if (iid, "front") not in out:
            continue
        for view, ref in views.items():
            out[(iid, view)]["sprite"] = match_colour(out[(iid, view)]["sprite"], out[(iid, ref)]["sprite"])
    R2.mkdir(parents=True, exist_ok=True)
    for (iid, view), e in out.items():
        to_img(e["sprite"]).save(R2 / f"{iid}-{view}.webp", "WEBP", lossless=True)
    return out


def register_cell(e, doll, view, scales, ty_prior=None, ty_tol=6, rotations=(-2, -1, 1, 2), box=None, wgrey=.65):
    """Similarity transform doll = s * R * cell + t of a worn proof cell onto the base doll's head,
    the hat masked out (fit_hair_pack2.register with the proof and mask given)."""
    proof = e["worn"]
    hat = np.zeros(proof.shape[:2], bool)
    m = e["mask"] > .03
    bx, by = e["box"][0] - e["cell"][0] + 2, e["box"][1] - e["cell"][1] + 2
    hat[:m.shape[0], :m.shape[1]] = m
    hat = HP.dilate(hat, 8)
    base = HP.load(DOLLS / f"{doll}-{view}.webp")
    x0, y0, x1, y1 = box or HP.HEAD[doll][view]
    pad = 2
    Hb, Wb = base.shape[:2]
    fx0, fy0 = x0 - pad, y0 - pad
    fixed = np.zeros((y1 - y0 + 2 * pad, x1 - x0 + 2 * pad, 4), np.float32)
    sy0, sx0 = max(0, fy0), max(0, fx0)
    sy1, sx1 = min(Hb, fy0 + fixed.shape[0]), min(Wb, fx0 + fixed.shape[1])
    fixed[sy0 - fy0:sy1 - fy0, sx0 - fx0:sx1 - fx0] = base[sy0:sy1, sx0:sx1]
    sig = 2.5 * (x1 - x0) / 160.0
    fg, fa = HP.features(fixed, sig)
    fm = np.ones(fg.shape, np.float32)
    pmask = (~hat).astype(np.float32)

    def try_scale(s, rot=0.0):
        mv, org = HP.resize(proof, s, rot)
        mk, _ = HP.resize(np.dstack([np.ones_like(pmask)] * 3 + [pmask]), s, rot)
        mk = (mk[..., 3] > .98).astype(np.float32)
        inside, _ = HP.resize(np.dstack([np.ones_like(pmask)] * 4), s, rot)
        mk *= (inside[..., 3] > .98)
        gg, ga = HP.features(mv, sig)
        mk_g = (HP.box_blur(mk, max(1, int(round(sig * 1.5)))) > .999).astype(np.float32)
        n1, N1 = HP.masked_ncc(fg, fm, gg, mk_g)
        n2, N2 = HP.masked_ncc(fa, fm, ga, mk)
        minN = min(.125 * fm.sum(), .5 * float((mk_g * (ga > .5)).sum()))
        score = wgrey * n1 + (1 - wgrey) * n2
        score[(N1 < minN) | (N2 < minN)] = -2
        Hg, Wg = gg.shape
        if ty_prior is not None:
            tys = fy0 + np.arange(score.shape[0]) - (Hg - 1) - org[1]
            score[np.abs(tys - ty_prior) > ty_tol, :] = -2
        i, j = np.unravel_index(np.argmax(score), score.shape)
        dy, dx = i - (Hg - 1), j - (Wg - 1)

        def para(a, b, c):
            d = a - 2 * b + c
            return 0.0 if abs(d) < 1e-9 else .5 * (a - c) / d
        sy = para(score[i - 1, j], score[i, j], score[i + 1, j]) if 0 < i < score.shape[0] - 1 else 0
        sx = para(score[i, j - 1], score[i, j], score[i, j + 1]) if 0 < j < score.shape[1] - 1 else 0
        return dict(score=float(score[i, j]), s=float(s), rot=rot, tx=float(fx0 + dx + sx - org[0]),
                    ty=float(fy0 + dy + sy - org[1]), ncc_grey=float(n1[i, j]), ncc_alpha=float(n2[i, j]))

    best = None
    for s in scales:
        r = try_scale(s)
        if not best or r["score"] > best["score"]:
            best = r
    if len(scales) > 3:
        s0 = best["s"]
        for s in s0 * np.exp(np.linspace(-.03, .03, 13)):
            r = try_scale(s)
            if r["score"] > best["score"]:
                best = r
        s0 = best["s"]
        for rot in rotations:
            r = try_scale(s0, rot)
            if r["score"] > best["score"] + .004:
                best = r
    return best


def register_fix(doll, cells, overlays=None):
    cfg = FIX[doll]
    regs = {}
    for iid in cfg["rows"]:
        row = {}
        for view in ("front", "left", "right"):
            e = cells[(iid, view)]
            row[view] = register_cell(e, doll, view, np.exp(np.linspace(math.log(cfg["scales"][0]), math.log(cfg["scales"][1]), 30)))
        s_row = sorted(r["s"] for r in row.values())[1]
        # doll y = s * sheet y + Ty: shared by every view of the row
        Ty = sorted(r["ty"] - r["s"] * cells[(iid, v)]["cell"][1] for v, r in row.items())[1]
        e = cells[(iid, "back")]
        x0, y0, x1, y1 = HP.HEAD[doll]["back"]
        row["back"] = register_cell(e, doll, "back", [s_row], ty_prior=Ty + s_row * e["cell"][1], ty_tol=3,
                                    rotations=(), box=(x0 - 40, y0, x1 + 40, y1 + 60), wgrey=.4)
        for view, r in row.items():
            print(f"  {iid:13s} {view:5s} s={r['s']:.4f} rot={r['rot']:+.0f} t=({r['tx']:7.1f},{r['ty']:7.1f}) "
                  f"score={r['score']:.3f} grey={r['ncc_grey']:.3f} alpha={r['ncc_alpha']:.3f}", file=sys.stderr)
            if overlays:
                overlay(cells[(iid, view)], r, doll, view, Path(overlays) / f"reg-{iid}-{view}.png")
        regs[iid] = row
    return regs


def placed(e, r):
    """drawFitted rect of a cell's sprite under the cell's transform."""
    s, rot = r["s"], r["rot"]
    ox, oy = e["box"][0] - e["cell"][0], e["box"][1] - e["cell"][1]
    h, w = e["sprite"].shape[:2]
    th = math.radians(rot)
    c, sn = math.cos(th), math.sin(th)
    px, py = ox + w / 2, oy + h / 2
    cx = s * (c * px - sn * py) + r["tx"]
    cy = s * (sn * px + c * py) + r["ty"]
    return dict(x=round(cx - w * s / 2, 2), y=round(cy - h * s / 2, 2), w=round(w * s, 2), h=round(h * s, 2), rot=round(rot, 2))


def overlay(e, r, doll, view, path):
    """The proof cell mapped onto the base doll (left) and the hat sprite at its fit on the doll (right)."""
    base = to_img(HP.load(DOLLS / f"{doll}-{view}.webp"))
    pad = 120
    W, H = base.width + 2 * pad, 420 if doll == "adult" else 480
    a = Image.new("RGBA", (W, H), (205, 230, 212, 255))
    a.alpha_composite(base, (pad, pad))
    b = a.copy()
    mv, org = HP.resize(e["worn"], r["s"], r["rot"])
    pim = np.asarray(to_img(mv)).copy()
    pim[..., 3] = (pim[..., 3] * .55).astype(np.uint8)
    a.alpha_composite(Image.fromarray(pim), (int(round(r["tx"] + org[0] + pad)), int(round(r["ty"] + org[1] + pad))))
    f = placed(e, r)
    spr = to_img(e["sprite"]).resize((max(1, round(f["w"])), max(1, round(f["h"]))), Image.LANCZOS)
    if f["rot"]:
        spr = spr.rotate(-f["rot"], expand=True, resample=Image.BICUBIC)
    b.alpha_composite(spr, (int(round(f["x"] + f["w"] / 2 - spr.width / 2 + pad)), int(round(f["y"] + f["h"] / 2 - spr.height / 2 + pad))))
    out = Image.new("RGBA", (2 * W, H))
    out.paste(a, (0, 0))
    out.paste(b, (W, 0))
    path.parent.mkdir(parents=True, exist_ok=True)
    out.convert("RGB").save(path)


# ------------------------------------------------------------------ placement by anchors (pack2 art)
# Doll landmarks (doll-local px of each view's base picture; the right view mirrors the left one).
# eyes: the midpoint between the eyes (front), the frame's spot in front of the eye (left);
# ear: where a glasses arm rests on the ear root (left); hand: where a handle sits in her fingers
# (front: her right hand, the viewer's left; left: the near hand on her thigh; back: her right hand,
# the viewer's right); grip: the fingers redrawn over the handle (portrait.js heldLayer).
LAND = {
    "adult": {"eyes": {"front": (210.5, 84)}, "lens": {"left": (38, 82)}, "ear": {"left": (103, 78)},
              "hand": {"front": (34, 524), "left": (72, 524), "back": (364, 524)},
              "grip": {"front": [[16, 506], [50, 500], [52, 552], [16, 552]],
                       "left": [[46, 500], [102, 500], [102, 548], [46, 548]],
                       "back": [[346, 500], [382, 506], [398, 552], [346, 552]]}},
    "little": {"eyes": {"front": (207, 121)}, "lens": {"left": (19, 117)}, "ear": {"left": (106, 113)},
               "hand": {"front": (38, 532), "left": (100, 538), "back": (364, 532)},
               "grip": {"front": [[10, 512], [58, 508], [58, 562], [10, 562]],
                        "left": [[70, 508], [134, 508], [134, 562], [70, 562]],
                        "back": [[344, 508], [392, 512], [396, 562], [344, 562]]}},
}


def sprite_path(c, view):
    if c["src"] == "fix":
        return R2 / f"{c['id']}-{view}.webp"
    return P2 / c["cat"] / f"{c.get('art', c['id'])}-{view}.webp"


def alpha_of(im):
    return np.asarray(im)[..., 3] > 100


def glasses_fit(c, doll, view, im):
    """front: centred on the eyes, `w` doll px wide; left: the frame front on `lens`, the arm stretched
    (columns from `armx` to `bend`, sprite px) so its bend lands on the ear root, then rotated to it."""
    L = LAND[doll]
    W, H = im.size
    if view == "front":
        k = c["w"] / W
        ex, ey = L["eyes"]["front"]
        cy = c.get("cy", .45) * H
        return im, dict(x=ex - W * k / 2, y=ey - cy * k + c.get("dy", 0), w=W * k, h=H * k), None
    # side: frame front point F, arm bend B (sprite px), measured per item
    k = c["w"] / c["frontW"]
    fx, fy = c["F"]
    bx, by = c["B"]
    ax = c["armx"]
    E, A = np.array(L["lens"]["left"], float), np.array(L["ear"]["left"], float)
    need = np.linalg.norm(A - E) / k            # sprite px from F to B wanted
    have = bx - fx
    stretch = max(1.0, (need - (ax - fx)) / (bx - ax))
    a = np.asarray(im).astype(np.float32)
    head, arm, tail = a[:, :ax], a[:, ax:bx], a[:, bx:]
    arm = np.asarray(Image.fromarray(arm.astype(np.uint8)).resize((max(1, round(arm.shape[1] * stretch)), H), Image.LANCZOS)).astype(np.float32)
    a = np.concatenate([head, arm, tail], 1)
    im2 = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
    B2 = (ax + (bx - ax) * stretch, by)
    ang_s = math.atan2(B2[1] - fy, B2[0] - fx)
    ang_d = math.atan2(A[1] - E[1], A[0] - E[0])
    rot = math.degrees(ang_d - ang_s)
    # rect so that F maps to E under scale k and rotation rot about the rect centre
    W2 = im2.width
    cxs, cys = W2 / 2, H / 2
    th = math.radians(rot)
    vx, vy = (fx - cxs) * k, (fy - cys) * k
    rx, ry = vx * math.cos(th) - vy * math.sin(th), vx * math.sin(th) + vy * math.cos(th)
    ccx, ccy = E[0] - rx, E[1] - ry
    fit = dict(x=ccx - W2 * k / 2, y=ccy - H * k / 2, w=W2 * k, h=H * k, rot=rot)
    # the frame front, drawn over the hair: the sprite columns left of the arm, as a doll-local polygon
    lens = [rot_pt((0, 0), fit, W2, H), rot_pt((ax + 4, 0), fit, W2, H), rot_pt((ax + 4, H), fit, W2, H), rot_pt((0, H), fit, W2, H)]
    return im2, fit, lens


def rot_pt(p, fit, W, H):
    """sprite px -> doll px under a drawFitted rect (rotation about its centre)."""
    k = fit["w"] / W
    th = math.radians(fit.get("rot", 0))
    vx, vy = (p[0] - W / 2) * k, (p[1] - H / 2) * (fit["h"] / H)
    return [round(fit["x"] + fit["w"] / 2 + vx * math.cos(th) - vy * math.sin(th), 1),
            round(fit["y"] + fit["h"] / 2 + vx * math.sin(th) + vy * math.cos(th), 1)]


def top_grip(im):
    """The middle of a handle's top (sprite px): opaque pixels within 3% of the sprite's top."""
    a = alpha_of(im)
    ys, xs = np.nonzero(a)
    y0 = ys.min()
    sel = ys <= y0 + max(4, .03 * a.shape[0])
    return float(xs[sel].mean()), float(y0 + .035 * a.shape[0])


def paw_grip(im, upper_right):
    """The tip of a plush toy's raised arm (the paw held): the opaque pixel furthest up and out."""
    a = alpha_of(im)
    ys, xs = np.nonzero(a)
    sc = (xs if upper_right else -xs) - ys
    i = np.argmax(sc)
    W = a.shape[1]
    # a little in from the very tip, toward the body, so the fingers close round the paw
    d = .045 * a.shape[0]
    return float(xs[i] - d if upper_right else xs[i] + d), float(ys[i] + d)


def held_fit(c, doll, view, im):
    """A thing she holds: the sprite's grip point on her hand, `h` doll px tall, `rot` degrees."""
    L = LAND[doll]
    W, H = im.size
    k = c["h"] / H
    gx, gy = c["grip_fn"](im, view)
    hv = view if view != "right" else "left"
    hx, hy = L["hand"][hv]
    rot = c.get("rot", {}).get(hv, 0)
    th = math.radians(rot)
    vx, vy = (gx - W / 2) * k, (gy - H / 2) * k
    rx, ry = vx * math.cos(th) - vy * math.sin(th), vx * math.sin(th) + vy * math.cos(th)
    fit = dict(x=hx - rx - W * k / 2, y=hy - ry - H * k / 2, w=W * k, h=H * k)
    if rot:
        fit["rot"] = rot
    return fit


def rect_fit(c, view, im):
    """Hand-placed: `place[view]` = (centre x, top y, width) in doll px, optional rot."""
    W, H = im.size
    cx, top, w, *r = c["place"][view]
    k = w / W
    fit = dict(x=cx - w / 2, y=top, w=w, h=H * k)
    if r:
        fit["rot"] = r[0]
    return fit


def hat_cut(im, fit):
    """Doll-local polygon of everything above the hat's lower edge: per sprite column the end of the
    first opaque run from the top, extended level past both ends of the hat."""
    a = alpha_of(im)
    H, W = a.shape
    pts = []
    step = max(1, W // 40)
    for x in list(range(0, W, step)) + [W - 1]:
        col = np.nonzero(a[:, x])[0]
        if not len(col):
            continue
        y0 = col[0]
        run = np.nonzero(~a[y0:, x])[0]
        y1 = y0 + (run[0] if len(run) else H - y0)
        pts.append(rot_pt((x, y1 - 1), fit, W, H))
    (xl, yl), (xr, yr) = pts[0], pts[-1]
    # past the ends the line rises, so hair bulging out under the brim stays and no straight cut shows
    return [[xl - 400, -400], [xr + 400, -400], [xr + 400, yr - 14], [xr + 26, yr - 14], [xr + 8, yr - 6], *pts[::-1],
            [xl - 8, yl - 6], [xl - 26, yl - 14], [xl - 400, yl - 14]]


def mirror_fit(fit, doll):
    M = MIRROR[doll]
    out = dict(fit)
    out["x"] = round(M - fit["x"] - fit["w"], 2)
    if fit.get("rot"):
        out["rot"] = -fit["rot"]
    for key in ("cut", "lens", "grip"):
        if key in fit:
            out[key] = [[round(M - x, 1), y] for x, y in fit[key]][::-1]
    return out


def mirror_im(im):
    return im.transpose(Image.FLIP_LEFT_RIGHT)


# Items. kind: hat | glasses | held | pack. src: fix (round 2 redraw, registered) or p2 (pack2 slice).
# views: which art view is drawn in each doll view (held bags: the bag hangs edge-on from the front,
# its broad face shows from the side), `flip` = mirrored. Hats: cut=False for ones worn over the hair
# (tiara, headband, the party crown with hair between its points); clip=False hides hair clips.
def _toy(i):
    # held by the raised paw with the body hanging in front of her leg (front and back views are the
    # art mirrored so the paw is on the hand's outer side), not out beside her: it stays well inside the
    # doll canvas and every portrait crop
    return dict(cat="toys-little", src="fix", doll="little", kind="held", h=196, grid_row=i,
                views={"front": ("front", "flip"), "left": "front", "right": ("front", "flip"), "back": ("back", "flip")},
                grip_fn=lambda im, v: paw_grip(im, v != "front"), rot={"front": 6, "left": 4, "back": -6})


ITEMS = {
    "bucket-hat": dict(cat="hats-adult", src="fix", doll="adult", kind="hat"),
    "sun-hat": dict(cat="hats-adult", src="fix", doll="adult", kind="hat"),
    "baseball-cap": dict(cat="hats-adult", src="fix", doll="adult", kind="hat"),
    "tiara": dict(cat="hats-adult", src="p2", doll="adult", kind="hat", cut=False, clip=True,
                  place={"front": (200, -42, 112), "back": (199, -30, 112)},
                  side={"left": dict(P=((70, 205), (372, 405)), D=((54, 10), (120, 86)))}),
    "bow-headband": dict(cat="hats-adult", src="p2", doll="adult", kind="hat", cut=False, clip=False,
                         place={"front": (201, -26, 128), "back": (199, -24, 128)},
                         side={"left": dict(P=((160, 105), (235, 450)), D=((66, 6), (104, 92)))}),
    "sun-bonnet": dict(cat="hats-little", src="fix", doll="little", kind="hat"),
    "bear-beanie": dict(cat="hats-little", src="fix", doll="little", kind="hat"),
    "party-crown": dict(cat="hats-little", src="fix", doll="little", kind="hat", cut=False, clip=False),
    "heart-sunglasses": dict(cat="glasses-adult", src="p2", doll="adult", kind="glasses", w=112, frontW=595, cy=.46,
                             F=(34, 108), B=(292, 94), armx=96),
    "round-tinted-glasses": dict(cat="glasses-adult", src="p2", doll="adult", kind="glasses", w=110, frontW=600, cy=.5,
                                 F=(30, 122), B=(292, 104), armx=92),
    "cat-eye-glasses": dict(cat="glasses-adult", src="p2", doll="adult", kind="glasses", w=114, frontW=619, cy=.5,
                            F=(36, 100), B=(312, 68), armx=96),
    "star-sunglasses": dict(cat="glasses-little", src="p2", doll="little", kind="glasses", w=150, frontW=586, cy=.48,
                            F=(44, 132), B=(300, 112), armx=100),
    "round-play-glasses": dict(cat="glasses-little", src="p2", doll="little", kind="glasses", w=146, frontW=592, cy=.5,
                               F=(40, 122), B=(300, 108), armx=96),
    "beaded-tote": dict(cat="bags-adult", src="p2", doll="adult", kind="held", h=178,
                        views={"front": "left", "left": "front", "right": ("front", "flip"), "back": "right"},
                        grip_fn=lambda im, v: top_grip(im)),
    "heart-purse": dict(cat="bags-adult", src="p2", doll="adult", kind="held", h=168,
                        views={"front": "left", "left": "front", "right": ("front", "flip"), "back": "right"},
                        grip_fn=lambda im, v: top_grip(im)),
    "beach-tote": dict(cat="bags-adult", src="p2", doll="adult", kind="held", h=212,
                       views={"front": "left", "left": "front", "right": ("front", "flip"), "back": "right"},
                       grip_fn=lambda im, v: top_grip(im)),
    "mini-backpack": dict(cat="bags-adult", src="fix", doll="adult", kind="pack",
                          place={"front": (200, 170, 134), "left": (112, 166, 166), "back": (199, 166, 168)}),
    "plush-bunny": _toy(0),
    "teddy-bear": _toy(1),
    "kitten-plush": _toy(2),
    "sand-bucket": dict(cat="toys-little", src="p2", doll="little", kind="held", h=150,
                        views={"front": "front", "left": "left", "right": "right", "back": "back"},
                        grip_fn=lambda im, v: top_grip(im)),
}
# round 2 sheets sliced by grid cell (item sheet only): toys and the backpack row of the bag redraws
GRID = {"toys-little": ("acc-toys-little-fix", ["plush-bunny", "teddy-bear", "kitten-plush"]),
        "bags-adult": ("acc-bags-adult-fix", [None, None, "mini-backpack"])}
for iid, c in ITEMS.items():
    c["id"] = iid


def slice_grid():
    for cat, (sheet, rows) in GRID.items():
        a = rgba(SRC / f"{sheet}.webp")
        H, W = a.shape[:2]
        for r, iid in enumerate(rows):
            if not iid:
                continue
            for col, view in enumerate(VIEWS):
                x0, x1, y0, y1 = col * W // 4, (col + 1) * W // 4, r * H // 3, (r + 1) * H // 3
                al = a[y0:y1, x0:x1, 3]
                ys, xs = np.nonzero(al > .03)
                spr = a[y0 + ys.min():y0 + ys.max() + 1, x0 + xs.min():x0 + xs.max() + 1].copy()
                spr[..., :3] *= spr[..., 3:4] > 0
                to_img(spr).save(R2 / f"{iid}-{view}.webp", "WEBP", lossless=True)


REGFILE = ROOT / "art" / "proofs" / "round2" / "acc-registration.json"


def registrations(argv):
    """The hats' proof -> doll transforms, measured with --register (slow) and kept in REGFILE."""
    cells = {}
    for doll in FIX:
        cells.update(slice_fix(doll))
    if "--register" in argv or not REGFILE.exists():
        overlays = argv[argv.index("--overlays") + 1] if "--overlays" in argv else None
        regs = {}
        for doll in FIX:
            regs.update(register_fix(doll, cells, overlays))
        REGFILE.parent.mkdir(parents=True, exist_ok=True)
        REGFILE.write_text(json.dumps({"note": "Generated by art/fit_acc.py --register: worn proof cell -> doll similarity "
                                       "transforms (doll = s*R(rot)*cell + t) of the round 2 hat redraws.", "items": regs}, indent=1))
    return cells, json.loads(REGFILE.read_text())["items"]


def build(argv):
    slice_grid()
    cells, regs = registrations(argv)
    acc, images = {}, {}
    for iid, c in ITEMS.items():
        doll = c["doll"]
        fits, files = {}, {}
        for view in VIEWS:
            if c["kind"] == "glasses" and view == "back":
                continue   # behind her head
            if view == "right" and not (c["kind"] == "hat" and c["src"] == "fix"):
                continue   # mirrored from the left view below (only the registered hats have their own)
            art = c.get("views", {}).get(view, view)
            flip = isinstance(art, tuple)
            art = art[0] if flip else art
            im = Image.open(sprite_path(c, art)).convert("RGBA")
            if flip:
                im = mirror_im(im)
            extra = {}
            if c["src"] == "fix" and c["kind"] == "hat":
                fit = placed(cells[(iid, view)], regs[iid][view])
            elif c["kind"] == "glasses":
                im, fit, lens = glasses_fit(c, doll, view, im)
                if lens:
                    extra["lens"] = lens
            elif c["kind"] == "held":
                fit = held_fit(c, doll, view, im)
                hv = "left" if view == "right" else view
                extra["hand"] = 0
                extra["grip"] = LAND[doll]["grip"][hv]
            elif view in c.get("side", {}):
                P, D = c["side"][view]["P"], c["side"][view]["D"]
                sv = np.subtract(P[1], P[0]); dv = np.subtract(D[1], D[0])
                k = np.linalg.norm(dv) / np.linalg.norm(sv)
                rot = math.degrees(math.atan2(dv[1], dv[0]) - math.atan2(sv[1], sv[0]))
                W, H = im.size
                th = math.radians(rot)
                vx, vy = (P[0][0] - W / 2) * k, (P[0][1] - H / 2) * k
                rx, ry = vx * math.cos(th) - vy * math.sin(th), vx * math.sin(th) + vy * math.cos(th)
                fit = dict(x=D[0][0] - rx - W * k / 2, y=D[0][1] - ry - H * k / 2, w=W * k, h=H * k, rot=rot)
            else:
                fit = rect_fit(c, view, im)
            if c["kind"] == "hat" and c.get("cut", True):
                extra["cut"] = hat_cut(im, fit)
            if c["kind"] == "hat" and not c.get("clip", False):
                extra["clip"] = False
            if c["kind"] == "pack":
                extra["layer"] = "pack"
            fit = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in fit.items()}
            if not fit.get("rot"):
                fit.pop("rot", None)
            fits[view] = {**fit, **extra}
            images[(iid, view)] = im
        # the right view mirrors the left one where it has no art of its own
        if "right" not in fits and "left" in fits:
            fits["right"] = mirror_fit(fits["left"], doll)
            images[(iid, "right")] = mirror_im(images[(iid, "left")])
        for view, f in fits.items():
            files[view] = [max(1, round(f["w"])), max(1, round(f["h"]))]
        acc[iid] = {"cat": c["cat"], "doll": doll, "kind": c["kind"], "files": files,
                    "fit": {v: fits[v] for v in VIEWS if v in fits}}
    return acc, images


def write_block(acc):
    lines = ["const ACC={"]
    for iid, w in acc.items():
        lines.append(json.dumps(iid) + ":" + json.dumps(w, separators=(",", ":")) + ",")
    lines.append("};")
    path = DIST / "catalog.js"
    src = path.read_text()
    a, b = "/* @generated acc (art/fit_acc.py) */\n", "\n/* @end acc */"
    i, j = src.index(a) + len(a), src.index(b)
    path.write_text(src[:i] + "\n".join(lines) + src[j:])


def premul_resize(im, size):
    a = np.array(im.convert("RGBA")).astype(np.float32)
    al = a[..., 3:4] / 255
    pm = np.concatenate([a[..., :3] * al, a[..., 3:4]], -1)
    chans = [Image.fromarray(pm[..., i]).resize(size, Image.LANCZOS) for i in range(4)]
    r = np.stack([np.array(ch) for ch in chans], -1)
    alpha = np.clip(r[..., 3], 0, 255)
    rgb = np.where(alpha[..., None] > .5, r[..., :3] * 255 / np.maximum(alpha[..., None], 1e-3), 0)
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha]).round().astype(np.uint8), "RGBA")


SUPERSAMPLE = 1.25   # shipped sprite px per doll px: the stage and postcards draw the doll a little over 1:1


def ship(acc, images):
    OUTDIR.mkdir(parents=True, exist_ok=True)
    (OUTDIR / "thumbs").mkdir(exist_ok=True)
    keep = set()
    for iid, w in acc.items():
        for view, f in w["fit"].items():
            im = images[(iid, view)]
            size = (max(1, min(im.width, round(f["w"] * SUPERSAMPLE))), max(1, min(im.height, round(f["h"] * SUPERSAMPLE))))
            name = f"{iid}-{view}.webp"
            premul_resize(im, size).save(OUTDIR / name, "WEBP", quality=86, method=6)
            keep.add(name)
        c = ITEMS[iid]
        # card picture: the item's own front art (a held bag shows its broad face; a backpack its back
        # view, where the pack is), fitted into 160 px
        im = Image.open(sprite_path(c, "back" if c["kind"] == "pack" else "front")).convert("RGBA")
        f = 160 / max(im.size)
        premul_resize(im, (max(1, round(im.width * f)), max(1, round(im.height * f)))).save(
            OUTDIR / "thumbs" / f"{iid}.webp", "WEBP", quality=88, method=6)
        keep.add(f"thumbs/{iid}.webp")
    for p in list(OUTDIR.glob("*.webp")) + list((OUTDIR / "thumbs").glob("*.webp")):
        if str(p.relative_to(OUTDIR)) not in keep:
            p.unlink()


def main(argv):
    acc, images = build(argv)
    write_block(acc)
    if "--ship" in argv:
        ship(acc, images)
    print("wrote", len(acc), "accessories", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv[1:])
