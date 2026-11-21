"""Raised-arm poses for the puppets (dist/puppet.js) from the posed base dolls.

    python3 -I art/build_poses.py [--check out_dir]

Input: art/source/round2/arms-raised/base-<doll>-pose-<wave|cheer|hip>.webp, the bald base doll drawn
in three poses (wave: her right arm raised, waving; cheer: both arms high; hip: her right hand on her
hip), front view, on their own canvas. For each pose this script
  1. registers the figure to the game's front base doll (dist/assets/dolls/<doll>-front.webp): one
     scale and offset from the legs and the head, which the pose does not change (masked normalised
     cross-correlation of the alpha silhouette and a high-passed grey image, as art/fit_hair_pack2.py);
  2. matches colour and lighting to the base skin: per channel, a smooth ratio map of base over pose
     measured on the bare skin both pictures share (face, neck, legs), fitted as a plane in y and
     applied to the arm;
  3. keeps only the posed arm(s): the pose's pixels inside ARM[doll][pose][side] (a doll-local polygon
     drawn round the arm, from the shoulder outward, plus the side of the torso the raised arm uncovers);
     any lilac bodysuit pixels inside it are painted as skin from their neighbours;
  4. writes dist/assets/dolls/poses/<doll>-<pose>.webp (doll-local px, cropped; colour with alpha) and
     prints the POSE_ARMS block for dist/puppet-rig.js (file, crop offset, the posed joints per side,
     and the fingernails that show, NAILS).
The posed joints (shoulder, elbow, wrist, hand) were read off the registered pictures by eye (JOINTS).
With --check, writes each pose laid over the base doll and the arm cut-outs on a grid to out_dir.

Needs Pillow and numpy.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
_spec = importlib.util.spec_from_file_location("hc_fit_hair", HERE / "fit_hair_pack2.py")
F = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(F)

SRC = ROOT / "art" / "source" / "round2" / "arms-raised"
BASE = ROOT / "dist" / "assets" / "dolls"
OUT = ROOT / "dist" / "assets" / "dolls" / "poses"
POSES = ("wave", "cheer", "hip")
# which arm each pose raises: 0 = the arm on the viewer's left (her right), 1 = the other
SIDES = {"wave": (0,), "cheer": (0, 1), "hip": (0,)}
# registration masks (doll-local): the legs below `legs_y` within +-band of the centre line, and the head
HEAD_BOX = {"adult": (148, 0, 252, 160), "little": (125, 20, 280, 210)}
LEGS = {"adult": (560, 199, 85), "little": (600, 201, 90)}

# The posed arm of side 0, doll-local polygons (read off the --check grids). Each runs from inside the
# shoulder and the side of the chest (the part of the arm on the torso side of the arm's cut line is drawn
# under the outfit, see puppet.js raisedPieces) round the arm and the torso side it uncovers;
# the bodysuit inside is left out (the outfit is drawn there), and the edge is feathered by FEATHER px.
# Side 1 (cheer) is the mirror image about the doll's centre line (MID).
ARM = {
    "adult": {
        "wave": [(-80, 60), (143, 60), (143, 172), (152, 182), (152, 300), (132, 300), (132, 345), (-80, 345)],
        "cheer": [(-130, -140), (70, -140), (147, 150), (147, 172), (152, 184), (152, 300), (-130, 300)],
        "hip": [(-80, 150), (135, 150), (143, 172), (152, 182), (152, 300), (138, 338), (172, 338),
                (172, 415), (-80, 415)]},
    "little": {
        "wave": [(-80, 90), (112, 90), (112, 168), (130, 190), (150, 205), (150, 330), (122, 340), (-80, 340)],
        "cheer": [(-110, -40), (70, -40), (112, 180), (140, 195), (150, 210), (150, 330), (-110, 330)],
        "hip": [(-80, 190), (133, 190), (150, 210), (150, 330), (160, 365), (160, 445), (-80, 445)]},
}
MID = {"adult": 199, "little": 201}
FEATHER = 2.5
# The posed joints of side 0 (doll-local, read off the grids): shoulder, elbow, wrist and the middle of
# the hand. The puppet turns the forearm about the elbow to wave, and the whole arm about the shoulder.
JOINTS = {
    "adult": {"wave": dict(sh=[112, 205], el=[42, 290], wr=[87, 180], hand=[93, 137]),
              "cheer": dict(sh=[122, 200], el=[53, 90], wr=[-7, 7], hand=[-20, -55]),
              "hip": dict(sh=[110, 205], el=[13, 290], wr=[93, 377], hand=[115, 375])},
    "little": {"wave": dict(sh=[118, 228], el=[7, 270], wr=[43, 193], hand=[60, 150]),
               "cheer": dict(sh=[120, 226], el=[50, 130], wr=[13, 60], hand=[0, 20]),
               "hip": dict(sh=[118, 230], el=[20, 317], wr=[83, 397], hand=[110, 400])},
}
# Fingernails that show in a pose (doll-local ellipses [x, y, rx, ry, rotation in degrees], as the base
# doll's `nails` in catalog.js), painted with her polish in the game. Waving and cheering hands show their
# palms; only the hand on the hip shows its nails.
NAILS = {"adult": {"hip": [[154.5, 360, 2.6, 1.9, -20], [157, 380, 2.6, 1.9, -10], [154, 391.5, 2.4, 1.8, 0],
                           [140, 398.5, 2.2, 1.7, 20]]}}
# registration found by register() (scale, offset of the pose picture in doll-local px); --register
# measures it again (about a minute per pose)
REG = {"adult": {"wave": (0.9967, -129, -135), "cheer": (1.0007, -129, -137), "hip": (1.0007, -129, -136)},
       "little": {"wave": (1.0109, -148, -136), "cheer": (0.9947, -147, -131), "hip": (0.9966, -148, -133)}}


def load(p):
    return np.asarray(Image.open(p).convert("RGBA"), dtype=np.float32) / 255.0


def register(doll, pose):
    base = load(BASE / f"{doll}-front.webp")
    img = load(SRC / f"base-{doll}-pose-{pose}.webp")
    H, W = base.shape[:2]
    # fixed mask: the head and the legs
    fm = np.zeros((H, W), np.float32)
    x0, y0, x1, y1 = HEAD_BOX[doll]
    fm[y0:y1, x0:x1] = 1
    ly, cx, band = LEGS[doll]
    fm[ly:H, cx - band:cx + band] = 1
    sig = 2.5
    fg = F.highpass(F.gray(base), sig)
    fa = base[..., 3]
    best = None
    for s in np.exp(np.linspace(np.log(.85), np.log(1.15), 31)):
        mv, _ = F.resize(img, float(s))
        gg = F.highpass(F.gray(mv), sig)
        ga = mv[..., 3]
        n1, N1 = F.masked_ncc(fg, fm, gg, np.ones_like(ga))
        n2, N2 = F.masked_ncc(fa, fm, ga, np.ones_like(ga))
        sc = .5 * n1 + .5 * n2
        sc[N2 < .5 * fm.sum()] = -2
        i, j = np.unravel_index(np.argmax(sc), sc.shape)
        r = dict(s=float(s), tx=float(j - (gg.shape[1] - 1)), ty=float(i - (gg.shape[0] - 1)), score=float(sc[i, j]))
        if not best or r["score"] > best["score"]:
            best = r
    # fine scale
    s0 = best["s"]
    for s in s0 * np.exp(np.linspace(-.01, .01, 11)):
        mv, _ = F.resize(img, float(s))
        gg = F.highpass(F.gray(mv), sig)
        ga = mv[..., 3]
        n1, _ = F.masked_ncc(fg, fm, gg, np.ones_like(ga))
        n2, N2 = F.masked_ncc(fa, fm, ga, np.ones_like(ga))
        sc = .5 * n1 + .5 * n2
        sc[N2 < .5 * fm.sum()] = -2
        i, j = np.unravel_index(np.argmax(sc), sc.shape)
        if sc[i, j] > best["score"]:
            best = dict(s=float(s), tx=float(j - (gg.shape[1] - 1)), ty=float(i - (gg.shape[0] - 1)), score=float(sc[i, j]))
    return base, img, best


def placed(img, reg, H, W):
    """The pose resampled into doll-local px (H x W, the base picture's size, with margin)."""
    mv, _ = F.resize(img, reg["s"])
    out = np.zeros((H, W, 4), np.float32)
    tx, ty = int(round(reg["tx"])), int(round(reg["ty"]))
    h, w = mv.shape[:2]
    ys0, xs0 = max(0, ty), max(0, tx)
    ys1, xs1 = min(H, ty + h), min(W, tx + w)
    out[ys0:ys1, xs0:xs1] = mv[ys0 - ty:ys1 - ty, xs0 - tx:xs1 - tx]
    return out


PAD = 170   # work canvas margin round the base picture (raised hands reach above her head)


def work(doll, pose, reg=None):
    """(base, pose) on the padded work canvas; doll-local (x, y) is work (x + PAD, y + PAD)."""
    base, img, r = register(doll, pose) if reg is None else (load(BASE / f"{doll}-front.webp"),
                                                             load(SRC / f"base-{doll}-pose-{pose}.webp"), reg)
    H, W = base.shape[:2]
    b = np.zeros((H + 2 * PAD, W + 2 * PAD, 4), np.float32)
    b[PAD:PAD + H, PAD:PAD + W] = base
    p = placed(img, dict(r, tx=r["tx"] + PAD, ty=r["ty"] + PAD), H + 2 * PAD, W + 2 * PAD)
    return b, p, r


def lilac(a):
    r, g, b = a[..., 0] * 255, a[..., 1] * 255, a[..., 2] * 255
    return np.clip((b / np.maximum(r, 1) - .6) / .24, 0, 1) * (g < b + 6) * (a[..., 3] > .15)


def skin_gain(b, p, doll):
    """Per-channel gain base/pose as a plane in y, on skin both pictures share (head box and legs)."""
    Hh, Ww = b.shape[:2]
    m = np.zeros((Hh, Ww), bool)
    x0, y0, x1, y1 = HEAD_BOX[doll]
    m[y0 + PAD:y1 + PAD, x0 + PAD:x1 + PAD] = True
    ly, cx, band = LEGS[doll]
    m[ly + PAD:, cx - band + PAD:cx + band + PAD] = True
    ok = m & (b[..., 3] > .98) & (p[..., 3] > .98) & (lilac(b) < .05) & (lilac(p) < .05)
    lb, lp = F.gray(b), F.gray(p)
    ok &= (lb > .35) & (lp > .35)     # skin, not brows, eyes, lips shadows
    ok &= np.abs(F.highpass(lb, 3)) < .03
    ys = np.nonzero(ok)[0].astype(np.float64)
    A = np.stack([np.ones_like(ys), ys / 1000.0], 1)
    coef = []
    for c in range(3):
        ratio = (b[..., c][ok] + 1e-3) / (p[..., c][ok] + 1e-3)
        sol, *_ = np.linalg.lstsq(A, ratio, rcond=None)
        coef.append(sol)
    return np.array(coef)   # [3, 2]: gain = c0 + c1 * y / 1000 (work y)


def grid_img(rgba, step=20, bg=(205, 230, 212)):
    im = Image.new("RGBA", (rgba.shape[1], rgba.shape[0]), bg + (255,))
    im.alpha_composite(Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA"))
    d = ImageDraw.Draw(im)
    for x in range(PAD % step, im.width, step):
        d.line([(x, 0), (x, im.height)], fill=(255, 0, 0, 120) if (x - PAD) % 100 == 0 else (0, 0, 255, 40))
        if (x - PAD) % 100 == 0:
            d.text((x + 2, 2), str(x - PAD), fill=(120, 0, 0, 255))
    for y in range(PAD % step, im.height, step):
        d.line([(0, y), (im.width, y)], fill=(255, 0, 0, 120) if (y - PAD) % 100 == 0 else (0, 0, 255, 40))
        if (y - PAD) % 100 == 0:
            d.text((2, y + 2), str(y - PAD), fill=(120, 0, 0, 255))
    return im


def arm_mask(doll, pose, side, shape):
    """Feathered polygon mask (work canvas) of one posed arm."""
    poly = ARM[doll][pose]
    if side == 1:
        poly = [(2 * MID[doll] - x, y) for x, y in poly]
    im = Image.new("L", (shape[1], shape[0]), 0)
    ImageDraw.Draw(im).polygon([(x + PAD, y + PAD) for x, y in poly], fill=255)
    return np.clip(F.gauss(np.asarray(im, np.float32) / 255, FEATHER), 0, 1)


def build(doll, pose, reg):
    b, p, r = work(doll, pose, reg)
    gain = skin_gain(b, p, doll)
    ys = np.arange(p.shape[0], dtype=np.float32)[:, None] / 1000.0
    out = np.zeros_like(p)
    for c in range(3):
        out[..., c] = np.clip(p[..., c] * (gain[c, 0] + gain[c, 1] * ys), 0, 1)
    m = np.zeros(p.shape[:2], np.float32)
    for side in SIDES[pose]:
        m = np.maximum(m, arm_mask(doll, pose, side, p.shape))
    out[..., 3] = p[..., 3] * m * (1 - lilac(p))
    ys_, xs_ = np.nonzero(out[..., 3] > 1 / 255)
    x0, y0, x1, y1 = xs_.min(), ys_.min(), xs_.max() + 1, ys_.max() + 1
    crop = out[y0:y1, x0:x1]
    OUT.mkdir(parents=True, exist_ok=True)
    rel = f"assets/dolls/poses/{doll}-{pose}.webp"
    Image.fromarray((np.clip(crop, 0, 1) * 255 + .5).astype(np.uint8), "RGBA").save(
        ROOT / "dist" / rel, "WEBP", quality=90, method=6, alpha_quality=100)
    arms = {}
    for side in SIDES[pose]:
        j = JOINTS[doll][pose]
        arms[side] = j if side == 0 else {k: [2 * MID[doll] - v[0], v[1]] for k, v in j.items()}
    entry = dict(file=rel, at=[int(x0 - PAD), int(y0 - PAD)], size=[int(x1 - x0), int(y1 - y0)], arms=arms)
    if NAILS.get(doll, {}).get(pose):
        entry["nails"] = NAILS[doll][pose]
    return entry, b, p, out, r, gain


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check")
    ap.add_argument("--register", action="store_true")
    args = ap.parse_args()
    data = {}
    for doll in ("adult", "little"):
        for pose in POSES:
            if args.register:
                reg = register(doll, pose)[2]
            else:
                s, tx, ty = REG[doll][pose]
                reg = dict(s=s, tx=tx, ty=ty, score=float("nan"))
            entry, b, p, out, r, gain = build(doll, pose, reg)
            data.setdefault(doll, {})[pose] = entry
            print(f"{doll} {pose}: scale {r['s']:.4f} offset ({r['tx']:.0f}, {r['ty']:.0f}) score {r['score']:.3f} "
                  f"gain {gain[:, 0].round(3).tolist()} -> {entry['file']} at {entry['at']} size {entry['size']}",
                  file=sys.stderr, flush=True)
            if args.check:
                d = Path(args.check)
                d.mkdir(parents=True, exist_ok=True)
                grid_img(p).save(d / f"{doll}-{pose}-grid.png")
                over = b.copy()   # the arm laid over the base doll
                a = out[..., 3:4]
                over[..., :3] = over[..., :3] * (1 - a) + out[..., :3] * a
                over[..., 3] = np.maximum(over[..., 3], out[..., 3])
                grid_img(over).save(d / f"{doll}-{pose}-over.png")
    print("/* @generated by art/build_poses.py: the raised-arm poses in doll-local px (file, crop offset `at`, size,")
    print("   and per raised arm the posed shoulder, elbow, wrist and hand) */")
    print("const POSE_ARMS=" + json.dumps(data, separators=(",", ":")) + ";")


if __name__ == "__main__":
    main()
