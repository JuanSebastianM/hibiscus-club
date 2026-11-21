"""Register the pack2 hair proofs to the game's base dolls and emit the hair fit data.

Usage (from the repo root):
    python3 -I art/fit_hair_pack2.py [--overlays DIR] [--only id,id] [--ship]

Each worn proof (art/proofs/pack2/hair/<id>-<view>.webp, see art/proofs/pack2/manifest.json) shows
one hair sprite painted on a bald head that is a separate render of the game's base doll at another
scale and crop. For every style and view this script finds the similarity transform

    doll_xy = s * R(rot) * proof_xy + t        (doll-local px of dist/assets/dolls/<doll>-<view>.webp)

that lays the proof's visible head (face, brows, eyes, nose, mouth, jaw, ears, neck and the skull
outline wherever the hair leaves it bare) onto the base doll's head, by masked normalised
cross-correlation (Padfield's FFT formulation) of
  * a high-passed grey image (facial features; insensitive to the two renders' skin tones), and
  * the alpha silhouette (jaw, chin, ear and neck outlines),
with the hair masked out of the proof (the sprite's alpha at its registered offset, dilated, plus
any dark hair-coloured pixels touching it, so redrawn items whose sprite differs from the proof are
masked too). Scale is searched coarse-to-fine, translation exhaustively (FFT), then a small
rotation and sub-pixel refinement. The sprite then sits at s * offset + t with width s * w.

Per style and view a row's transform is measured independently (every sheet row is its own
generated head); the report lists the per-view spread so it is visible whether one transform per
sheet row would have sufficed.

Outputs:
  * dist/hair-fit.js: HAIR_FIT[id][doll][view] = {x, y, w, h, rot, src:[w,h], score} for the
    shipped sprite (generated; do not edit by hand. Corrections live in catalog.js HAIR_TUNE).
  * art/proofs/pack2/hair-registration.json: transforms, scores, residuals.
  * --ship: dist/assets/items/hair/<id>-<view>.webp, the sprites resampled to the size they are drawn
    at in the game (HAIR_SUPERSAMPLE x the doll scale) so the browser does not shrink 2-3x.
  * --overlays DIR: per style/view a PNG with the proof warped onto the base doll (red/cyan
    difference of features + a blend) for checking by eye.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
PROOFS = ROOT / "art" / "proofs" / "pack2"
DOLLS = ROOT / "dist" / "assets" / "dolls"
PACK = ROOT / "art" / "sprites" / "pack2"  # full-resolution slices (art/slice_pack2.py)
SHIP = ROOT / "dist" / "assets" / "items" / "hair"
VIEWS = ("front", "left", "right", "back")
ADULT = ["long-waves", "side-ponytail", "half-up-curls", "sleek-curtain-bangs", "flip-bob", "long-braids",
         "high-bun-tendrils", "space-buns", "crimped-twists"]
LITTLE = ["ringlet-pigtails", "curly-buns", "curly-bob", "tiny-pigtails", "pixie-sweep", "top-ponytail",
          "chin-bob-bangs", "short-braids", "wavy-crop"]
# doll-local box of the head (and the top of the neck) used for registration: x0, y0, x1, y1
HEAD = {"adult": {"front": (120, -10, 280, 158), "back": (120, -10, 280, 158),
                  "left": (0, -10, 182, 158), "right": (0, -10, 181, 158)},
        "little": {"front": (95, -10, 310, 215), "back": (95, -10, 310, 215),
                   "left": (-5, -10, 208, 215), "right": (-5, -10, 209, 215)}}
HAIR_SUPERSAMPLE = 1.0    # shipped sprite px per doll px (the base dolls are drawn 1:1)


# ------------------------------------------------------------------ image helpers
def load(p):
    return np.asarray(Image.open(p).convert("RGBA"), dtype=np.float32) / 255.0


def box_blur(a, r):
    if r < 1:
        return a
    r = int(r)
    k = 2 * r + 1
    p = np.pad(a, ((r + 1, r), (0, 0)), mode="edge")
    c = np.cumsum(p, 0)
    a = (c[k:] - c[:-k]) / k
    p = np.pad(a, ((0, 0), (r + 1, r)), mode="edge")
    c = np.cumsum(p, 1)
    return (c[:, k:] - c[:, :-k]) / k


def gauss(a, sigma):
    # three box blurs ~ gaussian
    r = max(1, int(round(math.sqrt(12 * sigma * sigma / 3 + 1) / 2)))
    for _ in range(3):
        a = box_blur(a, r)
    return a


def dilate(m, r):
    return box_blur(m.astype(np.float32), r) > 1e-3


def resize(arr, s, rot=0.0):
    """Scale (and rotate about the origin, degrees) an RGBA float image; returns the image and the
    doll-space position of its (0,0) pixel edge relative to the transform's origin (premultiplied)."""
    h, w = arr.shape[:2]
    pm = arr.copy()
    pm[..., :3] *= pm[..., 3:4]
    im = Image.fromarray((np.clip(pm, 0, 1) * 255 + .5).astype(np.uint8), "RGBA")
    if rot:
        # affine: output (u,v) -> input: p = R^-1 (u+o)/s ; we compute the output bbox first
        th = math.radians(rot)
        c, sn = math.cos(th), math.sin(th)
        corners = np.array([[0, 0], [w, 0], [0, h], [w, h]], dtype=float)
        out = np.stack([s * (c * corners[:, 0] - sn * corners[:, 1]), s * (sn * corners[:, 0] + c * corners[:, 1])], 1)
        ox, oy = np.floor(out.min(0))
        W, H = (np.ceil(out.max(0)) - [ox, oy]).astype(int)
        # inverse: p = R^-1 ((u + ox, v + oy) / s)
        a = c / s
        b = sn / s
        coeffs = (a, b, (a * ox + b * oy), -b, a, (-b * ox + a * oy))
        res = im.transform((int(W), int(H)), Image.AFFINE, coeffs, resample=Image.BICUBIC)
        org = (ox, oy)
    else:
        W, H = max(1, round(w * s)), max(1, round(h * s))
        res = im.resize((W, H), Image.LANCZOS)
        org = (0.0, 0.0)
        # exact scale used per axis
    out = np.asarray(res, dtype=np.float32) / 255.0
    a = out[..., 3:4]
    out[..., :3] = np.where(a > 1e-4, out[..., :3] / np.maximum(a, 1e-4), 0)
    return out, org


def gray(rgba):
    return (.299 * rgba[..., 0] + .587 * rgba[..., 1] + .114 * rgba[..., 2]) * rgba[..., 3]


def highpass(g, sigma):
    hp = g - gauss(g, sigma)
    return hp


def masked_ncc(f, m, g, n):
    """Padfield masked NCC for every integer shift (dy, dx) of the moving image g (mask n) placed
    with its top-left at (dy, dx) in the fixed image f (mask m). Returns (ncc, overlap) arrays
    indexed [dy + Hg - 1, dx + Wg - 1]."""
    Hf, Wf = f.shape
    Hg, Wg = g.shape
    H, W = Hf + Hg - 1, Wf + Wg - 1
    F = lambda a: np.fft.rfft2(a, (H, W))
    # corr(a, b)(u) = sum_x a(x) b(x - u)  ==  conv(a, flip(b))
    gf = lambda b: b[::-1, ::-1]
    Fm, Ffm, Fffm = F(m), F(f * m), F(f * f * m)
    Fn, Fgn, Fggn = F(gf(n)), F(gf(g * n)), F(gf(g * g * n))
    inv = lambda a: np.fft.irfft2(a, (H, W))
    N = inv(Fm * Fn)
    Sf = inv(Ffm * Fn)
    Sg = inv(Fm * Fgn)
    Sff = inv(Fffm * Fn)
    Sgg = inv(Fm * Fggn)
    Sfg = inv(Ffm * Fgn)
    Nn = np.maximum(N, 1)
    num = Sfg - Sf * Sg / Nn
    vf = Sff - Sf * Sf / Nn
    vg = Sgg - Sg * Sg / Nn
    den = np.sqrt(np.maximum(vf, 1e-9) * np.maximum(vg, 1e-9))
    ncc = num / den
    # degenerate overlaps (one side flat, e.g. only the inside of the head) carry no information
    tiny = .15 * min(f[m > 0].var(), g[n > 0].var() if (n > 0).any() else 1)
    ncc[(vf / Nn < tiny) | (vg / Nn < tiny) | (N < 1)] = -2
    return np.clip(ncc, -2, 1), N
    # index (i, j) <-> shift dy = i - (Hg - 1), dx = j - (Wg - 1)


# ------------------------------------------------------------------ data
def doll_of(item):
    return "adult" if item in ADULT else "little"


def proof_entry(manifest, item, view):
    return manifest["items"][item][view]


def hair_mask(proof, sprite, offset, flagged):
    """Proof pixels that belong to the hair: the sprite's alpha at its offset, dilated, plus dark,
    hair-coloured pixels connected to that (for redrawn sprites the proof's own hair differs)."""
    H, W = proof.shape[:2]
    m = np.zeros((H, W), bool)
    ox, oy = offset
    sh, sw = sprite.shape[:2]
    y0, x0 = max(0, oy), max(0, ox)
    y1, x1 = min(H, oy + sh), min(W, ox + sw)
    m[y0:y1, x0:x1] = sprite[y0 - oy:y1 - oy, x0 - ox:x1 - ox, 3] > .08
    m = dilate(m, 5 if not flagged else 12)
    if flagged:
        # hair colour: dark, desaturated relative to skin, and reachable from the sprite mask
        r, g, b, a = (proof[..., i] for i in range(4))
        lum = .299 * r + .587 * g + .114 * b
        hairish = (a > .3) & (lum < .36) & ((r - b) < .16)
        grow = m.copy()
        for _ in range(40):
            nxt = dilate(grow, 2) & (hairish | grow)
            if nxt.sum() == grow.sum():
                break
            grow = nxt
        m = dilate(grow, 3)
    return m


def features(rgba, sigma):
    g = gray(rgba)
    return highpass(g, sigma), rgba[..., 3]


def register(item, view, manifest, verbose=False, scales=None, ty_prior=None, ty_tol=10,
             rotations=(-3, -2, -1, 1, 2, 3), box=None, wgrey=.65):
    doll = doll_of(item)
    e = proof_entry(manifest, item, view)
    proof = load(PROOFS / e["proof"])
    sprite = load(PACK / "hair" / f"{item}-{view}.webp")
    flagged = bool(e.get("flags"))
    hm = hair_mask(proof, sprite, e["offset"], flagged)
    base = load(DOLLS / f"{doll}-{view}.webp")
    x0, y0, x1, y1 = box or HEAD[doll][view]
    pad = 2
    # fixed: doll crop (with transparent padding where the box leaves the picture)
    Hb, Wb = base.shape[:2]
    fx0, fy0 = x0 - pad, y0 - pad
    fixed = np.zeros((y1 - y0 + 2 * pad, x1 - x0 + 2 * pad, 4), np.float32)
    sy0, sx0 = max(0, fy0), max(0, fx0)
    sy1, sx1 = min(Hb, fy0 + fixed.shape[0]), min(Wb, fx0 + fixed.shape[1])
    fixed[sy0 - fy0:sy1 - fy0, sx0 - fx0:sx1 - fx0] = base[sy0:sy1, sx0:sx1]
    unit = (x1 - x0) / 160.0
    sig = 2.5 * unit
    fg, fa = features(fixed, sig)
    fm = np.ones(fg.shape, np.float32)
    # proof: everything but the hair (background included: the silhouette matters)
    pmask = (~hm).astype(np.float32)
    # a rough initial scale: the bald proof skin height vs the doll head height is unknown, so search
    fixed = scales is not None
    if scales is None:
        scales = np.exp(np.linspace(math.log(.42), math.log(.75), 34))   # both dolls: ~.5-.62
    best = None

    def try_scale(s, rot=0.0, fmask=None, near=None):
        fmk = fm if fmask is None else fmask
        mv, org = resize(np.concatenate([proof[..., :3], proof[..., 3:4]], -1), s, rot)
        mk, _ = resize(np.dstack([np.ones_like(pmask)] * 3 + [pmask]), s, rot)
        mk = mk[..., 3]
        mk = (mk > .98).astype(np.float32)
        inside, _ = resize(np.dstack([np.ones_like(pmask)] * 4), s, rot)
        mk *= (inside[..., 3] > .98)
        gg, ga = features(mv, sig)
        # erode the moving mask so the high-pass halo of the hair edge is excluded
        mk_g = (box_blur(mk, max(1, int(round(sig * 1.5)))) > .999).astype(np.float32)
        n1, N1 = masked_ncc(fg, fmk, gg, mk_g)
        n2, N2 = masked_ncc(fa, fmk, ga, mk)
        # enough overlap: an eighth of the head box, or less where the hair leaves only a profile bare
        minN = min(.125 * fmk.sum(), .5 * float((mk_g * (ga > .5)).sum()))
        score = wgrey * n1 + (1 - wgrey) * n2 if wgrey else n2.copy()
        score[((N1 < minN) if wgrey else False) | (N2 < minN)] = -2
        Hg, Wg = gg.shape
        if ty_prior is not None:   # keep the vertical placement near the row's (see main)
            tys = fy0 + np.arange(score.shape[0]) - (Hg - 1) - org[1]
            score[np.abs(tys - ty_prior) > ty_tol, :] = -2
        if near is not None:       # residual search: only shifts within 5 px of the global fit
            tys = fy0 + np.arange(score.shape[0]) - (Hg - 1) - org[1]
            txs = fx0 + np.arange(score.shape[1]) - (Wg - 1) - org[0]
            score[np.abs(tys - near[1]) > 5, :] = -2
            score[:, np.abs(txs - near[0]) > 5] = -2
        i, j = np.unravel_index(np.argmax(score), score.shape)
        dy, dx = i - (Hg - 1), j - (Wg - 1)
        # sub-pixel: parabola through neighbours
        def para(a, b, c):
            d = a - 2 * b + c
            return 0.0 if abs(d) < 1e-9 else .5 * (a - c) / d
        sy = para(score[i - 1, j], score[i, j], score[i + 1, j]) if 0 < i < score.shape[0] - 1 else 0
        sx = para(score[i, j - 1], score[i, j], score[i, j + 1]) if 0 < j < score.shape[1] - 1 else 0
        tx = fx0 + dx + sx - org[0]
        ty = fy0 + dy + sy - org[1]
        # actual scale of the LANCZOS resize per axis (rounded size)
        return dict(score=float(score[i, j]), s=s, rot=rot, tx=float(tx), ty=float(ty),
                    ncc_grey=float(n1[i, j]), ncc_alpha=float(n2[i, j]))

    for s in scales:
        r = try_scale(float(s))
        if not best or r["score"] > best["score"]:
            best = r
    if not fixed:
        # refine scale
        s0 = best["s"]
        for s in s0 * np.exp(np.linspace(-.03, .03, 13)):
            r = try_scale(float(s))
            if r["score"] > best["score"]:
                best = r
        # tiny rotation
        s0 = best["s"]
        for rot in rotations:
            for s in s0 * np.exp(np.linspace(-.006, .006, 3)):
                r = try_scale(float(s), rot)
                if r["score"] > best["score"] + .004:   # only if it clearly helps
                    best = r
        # final fine scale at the chosen rotation
        s0, rot0 = best["s"], best["rot"]
        for s in s0 * np.exp(np.linspace(-.008, .008, 9)):
            r = try_scale(float(s), rot0)
            if r["score"] > best["score"]:
                best = r
    # residuals: the best local shift of each quadrant of the head box (left/right x upper/lower)
    # at the final scale and rotation; small values = one similarity transform fits the whole head
    res = {}
    Hq, Wq = fm.shape
    for name, (a, b, c, d) in {"upper-left": (0, .5, 0, .55), "upper-right": (.5, 1, 0, .55),
                               "lower-left": (0, .5, .55, 1), "lower-right": (.5, 1, .55, 1)}.items():
        q = np.zeros_like(fm)
        q[int(c * Hq):int(d * Hq), int(a * Wq):int(b * Wq)] = 1
        r = try_scale(best["s"], best["rot"], fmask=q, near=(best["tx"], best["ty"]))
        if r["score"] > .3:
            res[name] = [round(r["tx"] - best["tx"], 1), round(r["ty"] - best["ty"], 1), round(r["score"], 3)]
    best["residuals"] = res
    best.update(doll=doll, flagged=flagged)
    return best, proof, sprite, hm, base


def sprite_fit(reg, e, sprite):
    """Sprite placement in doll space as portrait.js drawFitted takes it: the unrotated rect
    {x, y, w, h} and a rotation (degrees) about the rect's centre."""
    s, rot = reg["s"], reg["rot"]
    ox, oy = e["offset"]
    h, w = sprite.shape[:2]
    th = math.radians(rot)
    c, sn = math.cos(th), math.sin(th)
    px, py = ox + w / 2, oy + h / 2          # sprite centre in proof px
    cx = s * (c * px - sn * py) + reg["tx"]
    cy = s * (sn * px + c * py) + reg["ty"]
    W, H = w * s, h * s
    return dict(x=round(cx - W / 2, 2), y=round(cy - H / 2, 2), w=round(W, 2), h=round(H, 2), rot=round(rot, 2))


def overlay(item, view, reg, proof, hm, base, path):
    """Left: base doll head; middle: proof warped onto it (hair shown); right: feature edges of the
    doll (red) and of the warped bald proof (cyan)."""
    doll = reg["doll"]
    x0, y0, x1, y1 = HEAD[doll][view]
    x0, y0, x1, y1 = x0 - 30, y0 - 50, x1 + 30, y1 + 40
    W, H = x1 - x0, y1 - y0
    mv, org = resize(proof, reg["s"], reg["rot"])
    px, py = reg["tx"] + org[0] - x0, reg["ty"] + org[1] - y0
    canvas = Image.new("RGBA", (W, H), (205, 230, 212, 255))
    b = Image.fromarray((base * 255).astype(np.uint8), "RGBA")
    a1 = canvas.copy()
    a1.paste(b, (-x0, -y0), b)
    pim = Image.fromarray((np.clip(mv, 0, 1) * 255).astype(np.uint8), "RGBA")
    a2 = a1.copy()
    a2b = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    a2b.paste(pim, (int(round(px)), int(round(py))))
    arr = np.asarray(a2b).copy()
    arr[..., 3] = (arr[..., 3] * .6).astype(np.uint8)
    a2.alpha_composite(Image.fromarray(arr))
    # edges
    bb = np.zeros((H, W, 4), np.float32)
    bimg = np.asarray(a1, dtype=np.float32) / 255
    pimg = np.zeros((H, W, 4), np.float32)
    pimg[...] = np.asarray(a1, dtype=np.float32) / 255
    over = np.asarray(Image.alpha_composite(a1, a2b), dtype=np.float32) / 255
    e1 = np.abs(highpass(gray(bimg), 1.5))
    e2 = np.abs(highpass(gray(over), 1.5))
    hmv, _ = resize(np.dstack([np.zeros_like(hm, np.float32)] * 3 + [hm.astype(np.float32)]), reg["s"], reg["rot"])
    hmc = np.zeros((H, W), np.float32)
    ix, iy = int(round(px)), int(round(py))
    hh, ww = hmv.shape[:2]
    ya, xa = max(0, iy), max(0, ix)
    yb, xb = min(H, iy + hh), min(W, ix + ww)
    if yb > ya and xb > xa:
        hmc[ya:yb, xa:xb] = hmv[ya - iy:yb - iy, xa - ix:xb - ix, 3]
    e2 = e2 * (1 - hmc)
    k = 6
    rgb = np.ones((H, W, 3), np.float32)
    rgb[..., 1] -= np.clip(e1 * k, 0, 1)
    rgb[..., 2] -= np.clip(e1 * k, 0, 1)
    rgb[..., 0] -= np.clip(e2 * k, 0, 1)
    a3 = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB").convert("RGBA")
    out = Image.new("RGBA", (W * 3 + 8, H), (40, 30, 40, 255))
    out.paste(a1, (0, 0))
    out.paste(a2, (W + 4, 0))
    out.paste(a3, (2 * W + 8, 0))
    scale = 2 if doll == "adult" else 1.5
    out = out.resize((int(out.width * scale), int(out.height * scale)), Image.LANCZOS)
    out.convert("RGB").save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--overlays")
    ap.add_argument("--only")
    ap.add_argument("--ship", action="store_true")
    ap.add_argument("--refit", action="store_true", help="reuse the saved registration, only rewrite the fits")
    args = ap.parse_args()
    manifest = json.loads((PROOFS / "manifest.json").read_text())
    regpath = PROOFS / "hair-registration.json"
    old = json.loads(regpath.read_text()) if regpath.exists() else {"items": {}}
    items = old.get("items", {})
    ids = args.only.split(",") if args.only else ADULT + LITTLE
    if args.refit:
        for item in ids:
            for view, r in items[item].items():
                sprite = load(PACK / "hair" / f"{item}-{view}.webp")
                r["fit"] = sprite_fit(r, proof_entry(manifest, item, view), sprite)
        ids = []
    for item in ids:
        row = {}
        for view in ("front", "left", "right", "back"):
            e = proof_entry(manifest, item, view)
            if view != "back":
                reg, proof, sprite, hm, base = register(item, view, manifest)
                row[view] = reg
            else:
                # The back of the head shows almost no skin (neck, ear rims), so the back view takes
                # the row's scale (all four views of a sheet row are drawn at one scale) and its
                # vertical placement (doll-local y is shared by all views, sheet y by the row), and
                # registers the horizontal position (with a few px of vertical slack).
                s_row = sorted(r["s"] for r in row.values())[1]
                Ty = sorted(r["Ty_sheet"] for r in row.values())[1]
                reg, proof, sprite, hm, base = register(
                    item, view, manifest, scales=s_row * np.exp(np.linspace(-.01, .01, 3)),
                    ty_prior=Ty + s_row * e["proof_box"][1], ty_tol=4, rotations=())
                reg["row_prior"] = True
                if reg["score"] < .3:
                    # long hair hides the whole head: match the neck and shoulder silhouette instead
                    x0, y0, x1, y1 = HEAD[doll_of(item)][view]
                    reg, proof, sprite, hm, base = register(
                        item, view, manifest, scales=[s_row], ty_prior=Ty + s_row * e["proof_box"][1],
                        ty_tol=3, rotations=(), box=(x0 - 60, y0, x1 + 60, y1 + 110), wgrey=0)
                    reg["row_prior"] = "shoulders"
            reg["Ty_sheet"] = reg["ty"] - reg["s"] * e["proof_box"][1]
            fit = sprite_fit(reg, e, sprite)
            items.setdefault(item, {})[view] = dict(reg, fit=fit, sprite=[sprite.shape[1], sprite.shape[0]])
            print(f"{item:20s} {view:5s} s={reg['s']:.4f} rot={reg['rot']:+.0f} t=({reg['tx']:7.2f},{reg['ty']:7.2f}) "
                  f"score={reg['score']:.3f} grey={reg['ncc_grey']:.3f} alpha={reg['ncc_alpha']:.3f} "
                  f"Ty_sheet={reg['Ty_sheet']:.1f} res={reg['residuals']} fit=({fit['x']},{fit['y']},{fit['w']}){' FLAGGED' if reg['flagged'] else ''}", flush=True)
            if args.overlays:
                Path(args.overlays).mkdir(parents=True, exist_ok=True)
                overlay(item, view, reg, proof, hm, base, Path(args.overlays) / f"{item}-{view}.png")
    regpath.write_text(json.dumps({"note": "Generated by art/fit_hair_pack2.py: proof -> doll similarity transforms "
                                   "(doll = s*R(rot)*proof + t) and the resulting sprite fits.", "items": items}, indent=1))
    write_js(items)
    if args.ship:
        ship(items)


def write_js(items):
    """dist/hair-fit.js: the sprite placement per style, doll and view (shipped sprite coordinates)."""
    out = {}
    for item, views in items.items():
        doll = doll_of(item)
        for view, r in views.items():
            f = r["fit"]
            out.setdefault(item, {}).setdefault(doll, {})[view] = {"x": f["x"], "y": f["y"], "w": f["w"], "h": f["h"],
                                                                    **({"rot": f["rot"]} if f["rot"] else {})}
    lines = ["/* @generated by art/fit_hair_pack2.py from the worn proofs (art/proofs/pack2): where each hair",
             "   sprite sits on the base doll, HAIR_FIT[id][doll][view] = {x, y, w, h, rot} in doll-local px",
             "   (the unrotated rect; rot in degrees about its centre). Do not edit; corrections are in catalog.js. */",
             "const HAIR_FIT={"]
    ids = [i for i in ADULT + LITTLE if i in out]
    for n, item in enumerate(ids):
        parts = []
        for doll, views in out[item].items():
            vs = ",".join(f"{v}:{json.dumps(views[v], separators=(',', ':'))}" for v in VIEWS if v in views)
            parts.append(f"{doll}:{{{vs}}}")
        lines.append(f"  '{item}':{{{','.join(parts)}}}{',' if n < len(ids) - 1 else ''}")
    lines.append("};")
    # The luminance range of each style over all four views (2nd and 99.5th percentile of opaque
    # pixels): portrait.js hairLut stretches its gradient map over it, so a colour lands the same in
    # every view of a style instead of being re-stretched per sprite.
    lum = {}
    for item in ids:
        vals = []
        for view in VIEWS:
            a = load(PACK / "hair" / f"{item}-{view}.webp").reshape(-1, 4)
            a = a[a[:, 3] > 200 / 255]
            vals.append((.299 * a[:, 0] + .587 * a[:, 1] + .114 * a[:, 2]) * 255)
        v = np.concatenate(vals)
        lum[item] = [int(round(np.percentile(v, 2))), int(round(np.percentile(v, 99.5)))]
    lines.append("/* luminance range [lo, hi] of each style's sprites, for the hair-colour gradient map */")
    lines.append("const HAIR_LUM=" + json.dumps(lum, separators=(",", ":")) + ";")
    (ROOT / "dist" / "hair-fit.js").write_text("\n".join(lines) + "\n")


def ship(items):
    """Resample each sprite to HAIR_SUPERSAMPLE x its drawn size (premultiplied LANCZOS)."""
    SHIP.mkdir(parents=True, exist_ok=True)
    for item, views in items.items():
        for view, r in views.items():
            src = PACK / "hair" / f"{item}-{view}.webp"
            im = load(src)
            k = min(1.0, r["s"] * HAIR_SUPERSAMPLE)
            out, _ = resize(im, k)
            Image.fromarray((np.clip(out, 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(
                SHIP / f"{item}-{view}.webp", "WEBP", quality=85, method=6, alpha_quality=100)


if __name__ == "__main__":
    main()
