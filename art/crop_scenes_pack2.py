"""Crop the pack-2 island places (16:9, 2730x1536) to game scenes (16:10).

Usage (from the repo root):
    python3 -I art/crop_scenes_pack2.py [--preview DIR] [--only beach,park]

Writes dist/assets/scenes/<id>.jpg (1152x720), crops the supplied overlays
with the identical window to dist/assets/scenes/fx/<id>-<layer>.webp, checks
overlay registration, and writes art/scenes-pack2.json from the hand-placed
metadata below (normalized coordinates of the 1152x720 crop). With --preview
it draws the walkable band, point-of-interest box, resident/approach spots and
animate regions over each crop. Each scene is independent; existing outputs
are simply overwritten, so the script can be re-run after an interruption.
"""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slice import label  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "source" / "pack2" / "06-island-places"
OUT = ROOT / "dist" / "assets" / "scenes"
FX = OUT / "fx"
META_OUT = ROOT / "art" / "scenes-pack2.json"

W_OUT, H_OUT = 1152, 720
SRC_W, SRC_H = 2730, 1536
WIN_W = SRC_H * 16 / 10          # 2457.6 px: full-height 16:10 window
JPEG_TARGET = 215_000            # existing scenes: 182-251 KB
FX_SCALE = 0.5                   # overlays are alpha masks; half size suffices
FX_WEBP = dict(quality=80, alpha_quality=100, method=6, exact=False)
# Overlays are separate renders, not cut-outs: they register (best shift 0)
# but repaint some areas differently (e.g. water painted over the beach's
# right-hand palm, clouds over the park's palm fronds, foliage over kites).
# Blocks where the opaque overlay differs strongly from the background are
# cut from the mask (see clean_overlay). Layers listed here are dropped.
MISMATCH_DIFF = 56      # max-channel |overlay - background| after a 2px blur
BLOCK = 8               # px block for the mismatch test
MIN_BLOCKS = 6          # only cut connected bad areas at least this big
DROP = {("beach", "sky"): "clouds painted in different places than the background's clouds "
                          "(53% of opaque pixels differ by >48); covers hills and palms. "
                          "Use the scene-data 'sky' colour key instead."}

# x0 = left edge of the 16:10 window in source px (full height).
SCENES = {
    "beach": dict(
        x0=136,
        overlays=["water", "foliage", "sky"],
        poi=dict(name="sandcastle kit by the towel", at=[0.73, 0.84],
                 box=[0.6, 0.68, 0.955, 0.955]),
        resident=[0.575, 0.76], approach=[0.54, 0.88],
        floor=0.62,
        floorNote="dry sand; the wet shoreline runs from y~0.55 (centre) to ~0.66 "
                  "(right edge), so keep feet below 0.62 right of x=0.5",
        animate=[
            dict(name="sea", type="water", key="water", poly=[0.42, 0.46, 1, 0.46, 1, 0.67, 0.87, 0.66, 0.6, 0.6, 0.43, 0.53]),
            dict(name="surf line", type="foam", key="foam", poly=[0.42, 0.5, 0.62, 0.55, 0.8, 0.6, 1, 0.6, 1, 0.68, 0.86, 0.68, 0.6, 0.62, 0.42, 0.55]),
            dict(name="clouds", type="sway", key="sky", poly=[0.18, 0.05, 1, 0.05, 1, 0.43, 0.6, 0.45, 0.18, 0.35],
                 note="beach-sky overlay is not usable (different clouds); use the sky key"),
            dict(name="sailboat", type="sway", ellipse=[0.735, 0.43, 0.035, 0.06]),
            dict(name="palm left", type="sway", key="foliage", poly=[0, 0, 0.32, 0, 0.32, 0.3, 0.1, 0.35, 0, 0.3]),
            dict(name="palm and hibiscus right", type="sway", key="foliage", poly=[0.53, 0, 1, 0, 1, 0.45, 0.85, 0.3, 0.7, 0.2, 0.53, 0.1]),
            dict(name="beach umbrellas", type="sway", polys=[
                [0.09, 0.31, 0.2, 0.31, 0.2, 0.39, 0.09, 0.39], [0.04, 0.46, 0.11, 0.46, 0.11, 0.5, 0.04, 0.5],
                [0.205, 0.445, 0.27, 0.445, 0.27, 0.49, 0.205, 0.49], [0.255, 0.445, 0.35, 0.445, 0.35, 0.51, 0.255, 0.51]]),
            dict(name="hill palms", type="wind", key="foliage", poly=[0, 0.2, 0.55, 0.28, 0.55, 0.42, 0, 0.42]),
            dict(name="flower bushes", type="wind", key="foliage", polys=[[0, 0.45, 0.08, 0.45, 0.08, 0.75, 0, 0.75], [0.9, 0.55, 1, 0.55, 1, 0.8, 0.9, 0.8]]),
        ],
        lights=[],
        notes=[
            "Good fit: open sand across the whole lower 40%, POI on the right third, horizon and palms frame it like boardwalk.jpg.",
            "Big soft palm-shadow shapes on the sand at bottom-left and bottom-right are painted in; characters walking through them will not be shaded (cosmetic).",
            "Lifeguard chair and umbrellas sit on the upper sand (y 0.42-0.65 left): keep the walk floor at 0.62 there or characters will walk into the chair.",
            "Perspective is gentle (horizon ~0.47); a constant-size character reads fine.",
            "No text or people. Sailboat could be animated (it is masked out of the water overlay).",
        ]),
    "park": dict(
        x0=272,
        overlays=["water", "foliage", "sky"],
        poi=dict(name="kite stand (kite rack + kite shop booth)", at=[0.76, 0.6],
                 box=[0.57, 0.15, 1.0, 0.8]),
        resident=[0.56, 0.86], approach=[0.68, 0.9],
        floor=0.74,
        floorNote="stone paving starts at y~0.73 left of the booth and ~0.8 in front of it; "
                  "the lawn above is visually walkable but cut by the fountain beds",
        animate=[
            dict(name="fountain pool", type="water", key="water", poly=[0.09, 0.585, 0.2, 0.56, 0.33, 0.56, 0.41, 0.59, 0.38, 0.63, 0.2, 0.635, 0.1, 0.615]),
            dict(name="fountain jets", type="flow", poly=[0.15, 0.23, 0.32, 0.23, 0.32, 0.61, 0.15, 0.61], keyNote="white/light-blue water streams"),
            dict(name="sea glimpse", type="water", key="water", rect=[0.13, 0.425, 0.4, 0.47]),
            dict(name="clouds", type="sway", key="sky", poly=[0.1, 0.05, 0.58, 0.05, 0.58, 0.3, 0.4, 0.33, 0.2, 0.33, 0.1, 0.25]),
            dict(name="bougainvillea top left", type="sway", key="foliage", poly=[0, 0, 0.35, 0, 0.35, 0.12, 0.15, 0.2, 0.05, 0.3, 0, 0.3]),
            dict(name="palm over the booth", type="sway", key="foliage", poly=[0.5, 0, 0.82, 0, 0.82, 0.15, 0.6, 0.18, 0.5, 0.1]),
            dict(name="background palms", type="sway", polys=[[0.05, 0.19, 0.16, 0.19, 0.16, 0.3, 0.05, 0.3], [0.39, 0.2, 0.5, 0.2, 0.5, 0.3, 0.39, 0.3], [0.35, 0.32, 0.44, 0.32, 0.44, 0.4, 0.35, 0.4]]),
            dict(name="flower beds", type="wind", key="foliage", polys=[[0, 0.53, 0.2, 0.55, 0.2, 0.72, 0, 0.72], [0.3, 0.53, 0.48, 0.53, 0.48, 0.71, 0.3, 0.71]]),
            dict(name="foreground flowers", type="wind", key="foliage", poly=[0, 0.75, 0.18, 0.82, 0.18, 1, 0, 1]),
            dict(name="hanging kites", type="sway", polys=[[0.58, 0.32, 0.66, 0.32, 0.66, 0.66, 0.58, 0.66], [0.68, 0.56, 0.9, 0.56, 0.9, 0.8, 0.68, 0.8], [0.7, 0.3, 1, 0.3, 1, 0.5, 0.7, 0.5]],
                 motionNote="bend from the top of each kite; tails flutter"),
            dict(name="swing", type="sway", rect=[0.4, 0.43, 0.46, 0.51]),
        ],
        lights=[],
        notes=[
            "Kite booth is huge (right 43% of the frame, up to y 0.8); the resident at x~0.56-0.6 stands in front of the freestanding kite rack. Fine, but the booth cannot move further right without cutting it.",
            "Clutter on the walk floor: a flower clump in the bottom-left corner (x<0.18, y>0.75) and the potted plant at the bottom-right of the booth (x>0.93, y 0.62-0.82).",
            "Paving recedes in visible perspective (stones shrink toward y~0.75); characters drawn at one size look fine in the band 0.8-1.",
            "Style matches market.jpg closely (same pink paving, striped awning stall). No text or people.",
        ]),
    "icecream": dict(
        x0=272,
        overlays=["foliage", "lights", "sky"],
        poi=dict(name="ice-cream cart", at=[0.83, 0.75],
                 box=[0.7, 0.38, 0.96, 0.9]),
        resident=[0.585, 0.8], approach=[0.66, 0.9],
        floor=0.72,
        floorNote="cobbled plaza from y~0.71; the raised sidewalk in front of the shops (x<0.45, y 0.68-0.85) is also walkable but has a kerb step",
        animate=[
            dict(name="sea", type="water", key="water", poly=[0.53, 0.53, 0.8, 0.53, 0.8, 0.61, 0.53, 0.61]),
            dict(name="sea behind the cart", type="water", key="water", poly=[0.8, 0.53, 0.96, 0.53, 0.96, 0.62, 0.8, 0.62], note="mostly hidden by the cart"),
            dict(name="sunset clouds", type="sway", key="sky", poly=[0.45, 0, 1, 0, 1, 0.4, 0.5, 0.35, 0.45, 0.2]),
            dict(name="palm left of centre", type="sway", key="foliage", poly=[0.25, 0, 0.62, 0, 0.62, 0.22, 0.4, 0.25, 0.25, 0.15]),
            dict(name="palm centre", type="sway", key="foliage", ellipse=[0.565, 0.29, 0.075, 0.1]),
            dict(name="palm right", type="sway", key="foliage", poly=[0.76, 0, 1, 0, 1, 0.3, 0.9, 0.25, 0.76, 0.15]),
            dict(name="bougainvillea", type="wind", key="magenta", polys=[[0, 0.1, 0.1, 0.1, 0.1, 0.32, 0, 0.32], [0.18, 0.18, 0.28, 0.18, 0.28, 0.33, 0.18, 0.33], [0.28, 0.36, 0.42, 0.36, 0.42, 0.56, 0.28, 0.56]]),
            dict(name="flower pots", type="wind", key="foliage", polys=[[0.24, 0.58, 0.42, 0.58, 0.42, 0.7, 0.24, 0.7], [0.94, 0.58, 1, 0.58, 1, 0.75, 0.94, 0.75]]),
            dict(name="shop windows", type="flicker", polys=[[0.0, 0.47, 0.25, 0.47, 0.25, 0.65, 0.0, 0.65], [0.4, 0.5, 0.52, 0.5, 0.52, 0.67, 0.4, 0.67]], keyNote="warm yellow glass"),
        ],
        lights=[
            dict(at=[0.33, 0.236], r=16, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.352, 0.276], r=16, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.384, 0.3], r=18, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.417, 0.326], r=18, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.447, 0.34], r=18, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.48, 0.354], r=18, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.54, 0.378], r=18, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.587, 0.378], r=20, color="#ffd58a", i=0.5, flicker=0.3),
            dict(at=[0.638, 0.375], r=18, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.694, 0.368], r=20, color="#ffd58a", i=0.5, flicker=0.3),
            dict(at=[0.755, 0.347], r=18, color="#ffd58a", i=0.45, flicker=0.3),
            dict(at=[0.818, 0.324], r=22, color="#ffd58a", i=0.5, flicker=0.3),
            dict(at=[0.894, 0.278], r=20, color="#ffd58a", i=0.5, flicker=0.3),
            dict(at=[0.039, 0.086], r=16, color="#ffc15e", i=0.4, flicker=0.2),
            dict(at=[0.05, 0.514], r=16, color="#ffc15e", i=0.4, flicker=0.2),
            dict(at=[0.165, 0.525], r=16, color="#ffc15e", i=0.4, flicker=0.2),
            dict(at=[0.323, 0.521], r=16, color="#ffc15e", i=0.4, flicker=0.2),
            dict(at=[0.714, 0.535], r=18, color="#ffc15e", i=0.45, flicker=0.25),
            dict(at=[0.864, 0.535], r=18, color="#ffc15e", i=0.45, flicker=0.25),
        ],
        notes=[
            "Closest in mood to pavilion.jpg (sunset, string lights). Cart sits on the right third; open cobbles across the middle and front.",
            "Perspective is the strongest of the four: the cobbles converge toward a vanishing point near (0.62, 0.5) and the kerb runs diagonally, so a character walking up to y~0.72 should be scaled down ~15-20% or it will look too big next to the shop doors.",
            "Clutter: the kerb step and planter box at x 0.25-0.42, y 0.65-0.72; nothing on the plaza itself.",
            "No baked text (shop signs are shells, no letters) and no people.",
        ]),
    "treehouse": dict(
        x0=0,
        overlays=["foliage", "sky", "water"],
        # darker and greener than the other places: lifted and warmed a little so it sits with them
        grade=dict(gamma=0.86, gain=(1.07, 1.0, 0.98)),
        poi=dict(name="treasure chest", at=[0.235, 0.77],
                 box=[0.15, 0.66, 0.32, 0.87]),
        resident=[0.585, 0.88], approach=[0.36, 0.89],
        floor=0.8,
        floorNote="dirt path and grass in front of the pool; only ~20% of the height is walkable",
        animate=[
            dict(name="waterfall", type="flow", poly=[0.382, 0.48, 0.477, 0.48, 0.477, 0.65, 0.382, 0.65]),
            dict(name="pool", type="water", key="water", poly=[0.33, 0.66, 0.55, 0.64, 0.78, 0.69, 0.78, 0.76, 0.6, 0.79, 0.4, 0.78, 0.33, 0.74]),
            dict(name="waterfall mist", type="foam", ellipse=[0.43, 0.64, 0.07, 0.035]),
            dict(name="clouds", type="sway", key="sky", poly=[0.22, 0.04, 0.56, 0.04, 0.56, 0.28, 0.22, 0.2]),
            dict(name="palm top left", type="sway", key="foliage", poly=[0, 0, 0.27, 0, 0.27, 0.2, 0.1, 0.25, 0, 0.2]),
            dict(name="palm top right", type="sway", key="foliage", poly=[0.89, 0, 1, 0, 1, 0.25, 0.89, 0.15]),
            dict(name="tree canopy", type="wind", key="foliage", poly=[0.39, 0, 0.92, 0, 0.92, 0.18, 0.39, 0.18]),
            dict(name="hanging vines", type="wind", key="foliage", poly=[0.57, 0.35, 0.75, 0.35, 0.75, 0.6, 0.57, 0.6]),
            dict(name="banana leaves right", type="sway", key="foliage", poly=[0.9, 0.25, 1, 0.25, 1, 0.56, 0.9, 0.56]),
            dict(name="bougainvillea left", type="wind", key="magenta", poly=[0, 0.25, 0.25, 0.28, 0.25, 0.47, 0, 0.47]),
            dict(name="rope bridge", type="sway", poly=[0.28, 0.31, 0.6, 0.31, 0.6, 0.46, 0.28, 0.46], motionNote="tiny vertical bend, sagging middle"),
            dict(name="foreground ferns", type="wind", key="foliage", polys=[[0, 0.78, 0.17, 0.78, 0.2, 1, 0, 1], [0.86, 0.6, 1, 0.6, 1, 1, 0.86, 1]]),
            dict(name="leaf light on the path", type="dapple", rect=[0.25, 0.8, 0.85, 1]),
        ],
        lights=[
            dict(at=[0.61, 0.257], r=16, color="#ffc15e", i=0.45, flicker=0.3),
            dict(at=[0.673, 0.25], r=16, color="#ffc15e", i=0.45, flicker=0.3),
            dict(at=[0.723, 0.261], r=20, color="#ffd58a", i=0.35, flicker=0.15),
        ],
        notes=[
            "Least suitable of the four as a walk scene: the open ground is only the band y 0.8-1 (the brief asks for the lower 40%), the pool comes down to y~0.79 in the middle, and the chest itself sits at y 0.66-0.87 so the approach spot is right of it on the path.",
            "Clutter on the walk floor: ferns in the bottom-left corner (x<0.18) and a large plant clump bottom-right (x>0.86, y>0.6); grass tufts and small flowers dot the path.",
            "Style mismatch: much darker and greener, dense jungle detail, no pink paving or rail; it reads as a different painter next to boardwalk/market/pavilion. A light pink-gold grade (or the scene's ambient tint) would help.",
            "Rainbow and waterfall are painted in (could be animated). No text or people.",
        ]),
}


def window(x0: float):
    return (float(x0), 0.0, float(x0) + WIN_W, float(SRC_H))


def crop(img: Image.Image, x0: float, size) -> Image.Image:
    if img.mode == "RGBA":
        return img.convert("RGBa").resize(size, Image.LANCZOS, box=window(x0)).convert("RGBA")
    return img.resize(size, Image.LANCZOS, box=window(x0))


def apply_grade(img: Image.Image, grade) -> Image.Image:
    """A gentle tone grade: per-channel gain after a gamma lift (both on 0..1 values)."""
    if not grade:
        return img
    a = np.asarray(img).astype(np.float32) / 255
    a = a ** grade.get("gamma", 1.0) * np.array(grade.get("gain", (1, 1, 1)), np.float32)
    return Image.fromarray(np.clip(np.rint(a * 255), 0, 255).astype(np.uint8), "RGB")


def save_jpeg(img: Image.Image, path: Path, target: int):
    lo, hi, best = 60, 95, None
    while lo <= hi:
        q = (lo + hi) // 2
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=q, optimize=True, progressive=True, subsampling=0)
        if buf.tell() <= target:
            best = (q, buf.getvalue())
            lo = q + 1
        else:
            hi = q - 1
    if best is None:
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=60, optimize=True, progressive=True, subsampling=0)
        best = (60, buf.getvalue())
    path.write_bytes(best[1])
    return best[0], len(best[1])


def registration(bg: np.ndarray, ov: np.ndarray):
    """Mean |overlay - background| over fully opaque overlay pixels, at the
    given alignment and for shifts of up to 3 px (best shift reported)."""
    a = ov[..., 3] >= 250
    res = {}
    best = None
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            sh = np.roll(np.roll(ov, dy, 0), dx, 1)
            m = np.roll(np.roll(a, dy, 0), dx, 1)
            m[:4] = m[-4:] = False
            m[:, :4] = m[:, -4:] = False
            d = np.abs(sh[..., :3].astype(np.int16) - bg[..., :3].astype(np.int16))[m].mean()
            if best is None or d < best[0]:
                best = (float(d), dx, dy)
            if dx == dy == 0:
                res["mean_abs_diff_at_0"] = round(float(d), 2)
                diffs = np.abs(sh[..., :3].astype(np.int16) - bg[..., :3].astype(np.int16))[m].max(1)
                res["p99_max_channel_diff"] = int(np.percentile(diffs, 99))
                res["opaque_px"] = int(m.sum())
    res["best_shift"] = [best[1], best[2]]
    res["mean_abs_diff_best"] = round(best[0], 2)
    return res


def clean_overlay(bg: Image.Image, ov: Image.Image):
    """Zero the overlay's alpha over sizeable areas whose colour does not
    match the background (repainted content). Returns (overlay, cut_px)."""
    b = np.array(bg.filter(ImageFilter.BoxBlur(2))).astype(np.int16)
    o = np.array(ov.convert("RGB").filter(ImageFilter.BoxBlur(2))).astype(np.int16)
    a = np.array(ov)[..., 3]
    bad = (a >= 200) & (np.abs(o - b).max(-1) > MISMATCH_DIFF)
    H, W = a.shape
    hb, wb = H // BLOCK, W // BLOCK
    blk = bad[:hb * BLOCK, :wb * BLOCK].reshape(hb, BLOCK, wb, BLOCK).mean(axis=(1, 3)) > 0.5
    lab, n = label(blk)
    sizes = np.bincount(lab.ravel(), minlength=n + 1)
    keep_bad = np.isin(lab, [k for k in range(1, n + 1) if sizes[k] >= MIN_BLOCKS])
    # grow by one block, then feather
    pb = np.pad(keep_bad, 1)
    grown = np.zeros_like(keep_bad)
    for dy in (0, 1, 2):
        for dx in (0, 1, 2):
            grown |= pb[dy:dy + hb, dx:dx + wb]
    full = np.zeros((H, W), np.uint8)
    full[:hb * BLOCK, :wb * BLOCK] = np.repeat(np.repeat(grown, BLOCK, 0), BLOCK, 1) * 255
    cut = np.array(Image.fromarray(full).filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255
    new_a = np.rint(a * (1 - cut)).astype(np.uint8)
    out = np.array(ov)
    out[..., 3] = new_a
    return Image.fromarray(out, "RGBA"), int(((a > 0) & (new_a == 0)).sum())


def preview(sid: str, meta: dict, bg: Image.Image, overlays: dict, path: Path):
    im = bg.convert("RGBA")
    W, H = im.size
    lay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    try:
        font = ImageFont.load_default(size=16)
    except TypeError:
        font = ImageFont.load_default()
    # walkable band
    d.rectangle([0, meta["floor"] * H, W, H], fill=(0, 255, 120, 40))
    d.line([(0, meta["floor"] * H), (W, meta["floor"] * H)], fill=(0, 255, 120, 255), width=3)
    d.line([(0, 0.6 * H), (W, 0.6 * H)], fill=(255, 255, 255, 120), width=1)
    for xg in (1 / 3, 2 / 3):
        d.line([(xg * W, 0), (xg * W, H)], fill=(255, 255, 255, 90), width=1)
    cols = {"water": (0, 160, 255), "foam": (255, 255, 255), "sway": (255, 200, 0),
            "wind": (255, 120, 0), "flicker": (255, 0, 255), "parallax": (160, 160, 255)}
    for a in meta["animate"]:
        c = cols.get(a["type"], (255, 255, 255))
        shapes = a.get("polys") or ([a["poly"]] if "poly" in a else [])
        for p in shapes:
            pts = [(p[i] * W, p[i + 1] * H) for i in range(0, len(p), 2)]
            d.polygon(pts, outline=c + (255,), width=2)
        if "ellipse" in a:
            cx, cy, rx, ry = a["ellipse"]
            d.ellipse([(cx - rx) * W, (cy - ry) * H, (cx + rx) * W, (cy + ry) * H], outline=c + (255,), width=2)
        if "rect" in a:
            x0, y0, x1, y1 = a["rect"]
            d.rectangle([x0 * W, y0 * H, x1 * W, y1 * H], outline=c + (255,), width=2)
        p0 = shapes[0][:2] if shapes else (a.get("ellipse") or a.get("rect"))[:2]
        d.text((p0[0] * W + 4, p0[1] * H + 2), a["name"], fill=c + (255,), font=font,
               stroke_width=2, stroke_fill=(0, 0, 0, 255))
    for a in meta.get("lights", []):
        x, y = a["at"]
        d.ellipse([x * W - 5, y * H - 5, x * W + 5, y * H + 5], outline=(255, 0, 255, 255), width=2)
    b = meta["poi"]["box"]
    d.rectangle([b[0] * W, b[1] * H, b[2] * W, b[3] * H], outline=(255, 40, 40, 255), width=3)
    d.text((b[0] * W + 4, b[1] * H + 4), "POI " + meta["poi"]["name"], fill=(255, 80, 80, 255),
           font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
    # resident silhouette: 176x432 sprite at the scene's usual on-screen size (~0.5 H)
    rx, ry = meta["resident"]
    rh, rw = 0.5 * H, 0.5 * H * 176 / 432
    d.rectangle([rx * W - rw / 2, ry * H - rh, rx * W + rw / 2, ry * H], outline=(0, 255, 255, 255), width=2)
    d.ellipse([rx * W - 6, ry * H - 6, rx * W + 6, ry * H + 6], fill=(0, 255, 255, 255))
    ax, ay = meta["approach"]
    d.ellipse([ax * W - 6, ay * H - 6, ax * W + 6, ay * H + 6], fill=(255, 255, 0, 255))
    d.text((ax * W + 8, ay * H - 8), "approach", fill=(255, 255, 0, 255), font=font,
           stroke_width=2, stroke_fill=(0, 0, 0, 255))
    im.alpha_composite(lay)
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path)
    # overlays tinted over a darkened background, for checking the masks
    if overlays:
        dark = Image.blend(bg.convert("RGB"), Image.new("RGB", bg.size, (0, 0, 0)), 0.6).convert("RGBA")
        tints = {"water": (0, 140, 255), "foliage": (60, 255, 60), "sky": (255, 255, 255),
                 "lights": (255, 0, 255)}
        for name, ov in overlays.items():
            a = np.array(ov.resize(bg.size, Image.BILINEAR))[..., 3]
            t = Image.new("RGBA", bg.size, tints.get(name, (255, 255, 0)) + (0,))
            t.putalpha(Image.fromarray((a * 0.7).astype(np.uint8)))
            dark.alpha_composite(t)
        dark.convert("RGB").save(path.with_name(path.stem + "-overlays.png"))


def run(only, preview_dir):
    FX.mkdir(parents=True, exist_ok=True)
    meta_all = json.loads(META_OUT.read_text()) if META_OUT.exists() else {}
    meta_all.setdefault("scenes", {})
    meta_all["note"] = ("Generated by art/crop_scenes_pack2.py. Coordinates are normalized to the "
                        "1152x720 crop. crop = window in the source [x0, y0, x1, y1] px. "
                        "floor = highest y a character's feet can reach. resident/approach = "
                        "feet positions. animate = suggested living-scene layers in the "
                        "spirit of dist/scene-data.js (shapes only; keys/motion to tune).")
    for sid, m in SCENES.items():
        if only and sid not in only:
            continue
        src = Image.open(SRC / f"scene-{sid}.webp").convert("RGB")
        x0 = m["x0"]
        bg_plain = crop(src, x0, (W_OUT, H_OUT))
        bg = apply_grade(bg_plain, m.get("grade"))
        q, nbytes = save_jpeg(bg, OUT / f"{sid}.jpg", JPEG_TARGET)
        entry = {
            "source": f"art/source/pack2/06-island-places/scene-{sid}.webp",
            "image": f"assets/scenes/{sid}.jpg",
            "crop": [x0, 0, round(x0 + WIN_W, 1), SRC_H],
            "jpeg": {"quality": q, "bytes": nbytes},
            "poi": m["poi"], "resident": m["resident"], "approach": m["approach"],
            "floor": m["floor"], "floorNote": m["floorNote"],
            "animate": m["animate"], "overlays": {}, "registration": {},
        }
        if m.get("grade"):
            entry["grade"] = m["grade"]
        if "lights" in m:
            entry["lights"] = m["lights"]
        if "notes" in m:
            entry["notes"] = m["notes"]
        ovs = {}
        bg_full = np.array(src)
        for layer in m["overlays"]:
            ov = Image.open(SRC / f"scene-{sid}-{layer}.webp").convert("RGBA")
            entry["registration"][layer + "_source"] = registration(bg_full, np.array(ov))
            if (sid, layer) in DROP:
                entry["overlays"][layer] = None
                entry.setdefault("overlayDropped", {})[layer] = DROP[(sid, layer)]
                (FX / f"{sid}-{layer}.webp").unlink(missing_ok=True)
                continue
            ov, ncut = clean_overlay(src, ov)
            entry["registration"][layer + "_mismatch_cut_px"] = ncut
            entry["registration"][layer + "_cleaned"] = registration(bg_full, np.array(ov))
            full = crop(ov, x0, (W_OUT, H_OUT))
            entry["registration"][layer + "_crop"] = registration(np.array(bg_plain), np.array(full))
            half = crop(ov, x0, (round(W_OUT * FX_SCALE), round(H_OUT * FX_SCALE)))
            sizes = {}
            for tag, img in (("full", full), ("half", half)):
                buf = io.BytesIO()
                a = np.array(img)
                a[a[..., 3] == 0] = 0
                Image.fromarray(a, "RGBA").save(buf, "WEBP", **FX_WEBP)
                sizes[tag] = buf.tell()
                if (tag == "half") == (FX_SCALE == 0.5):
                    (FX / f"{sid}-{layer}.webp").write_bytes(buf.getvalue())
            entry["overlays"][layer] = f"assets/scenes/fx/{sid}-{layer}.webp"
            entry.setdefault("overlayBytes", {})[layer] = sizes
            ovs[layer] = half if FX_SCALE == 0.5 else full
        meta_all["scenes"][sid] = entry
        META_OUT.write_text(json.dumps(meta_all, indent=1) + "\n")
        print(sid, "q", q, nbytes, "B", entry.get("overlayBytes", ""))
        if preview_dir:
            preview(sid, m, bg, ovs, preview_dir / f"{sid}.png")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", type=Path)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    run([s for s in args.only.split(",") if s], args.preview)


if __name__ == "__main__":
    main()
