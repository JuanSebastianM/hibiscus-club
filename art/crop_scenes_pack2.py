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

import numpy as np
from PIL import Image, ImageDraw, ImageFont

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

# x0 = left edge of the 16:10 window in source px (full height).
SCENES = {
    "beach": dict(
        x0=136,
        overlays=["water", "foliage", "sky"],
        poi=dict(name="sandcastle kit by the towel", at=[0.70, 0.86],
                 box=[0.555, 0.68, 0.925, 0.955]),
        resident=[0.585, 0.73], approach=[0.52, 0.86],
        floor=0.62,
        floorNote="dry sand; the wet shoreline runs from y~0.55 (centre) to ~0.66 (right edge)",
        animate=[
            dict(name="sea", type="water", poly=[0.42, 0.46, 1, 0.46, 1, 0.67, 0.87, 0.66, 0.6, 0.6, 0.43, 0.53]),
            dict(name="surf line", type="foam", poly=[0.42, 0.5, 0.62, 0.55, 0.8, 0.6, 1, 0.6, 1, 0.68, 0.86, 0.68, 0.6, 0.62, 0.42, 0.55]),
            dict(name="clouds", type="sway", poly=[0.18, 0.05, 1, 0.05, 1, 0.43, 0.6, 0.45, 0.18, 0.35]),
            dict(name="sailboat", type="sway", ellipse=[0.735, 0.43, 0.035, 0.06]),
            dict(name="palm left", type="sway", poly=[0, 0, 0.32, 0, 0.32, 0.3, 0.1, 0.35, 0, 0.3]),
            dict(name="palm and hibiscus right", type="sway", poly=[0.53, 0, 1, 0, 1, 0.45, 0.85, 0.3, 0.7, 0.2, 0.53, 0.1]),
            dict(name="beach umbrellas", type="sway", polys=[[0.03, 0.43, 0.12, 0.43, 0.12, 0.5, 0.03, 0.5], [0.18, 0.43, 0.31, 0.43, 0.31, 0.5, 0.18, 0.5]]),
            dict(name="flower bushes", type="wind", polys=[[0, 0.45, 0.07, 0.45, 0.07, 0.75, 0, 0.75], [0.9, 0.55, 1, 0.55, 1, 0.8, 0.9, 0.8]]),
        ]),
    "park": dict(
        x0=272,
        overlays=["water", "foliage", "sky"],
        poi=dict(name="kite stand", at=[0.76, 0.6],
                 box=[0.57, 0.15, 1.0, 0.8]),
        resident=[0.585, 0.83], approach=[0.68, 0.9],
        floor=0.74,
        floorNote="stone paving; the lawn (y 0.55-0.74) is walkable visually but crossed by the fountain beds",
        animate=[],
    ),
    "icecream": dict(
        x0=272,
        overlays=[],
        poi=dict(name="ice-cream cart", at=[0.83, 0.75],
                 box=[0.7, 0.38, 0.96, 0.9]),
        resident=[0.585, 0.8], approach=[0.68, 0.9],
        floor=0.72,
        floorNote="cobbled plaza; the raised sidewalk in front of the shops is also walkable",
        animate=[],
    ),
    "treehouse": dict(
        x0=0,
        overlays=[],
        poi=dict(name="treasure chest", at=[0.24, 0.77],
                 box=[0.15, 0.66, 0.32, 0.87]),
        resident=[0.585, 0.86], approach=[0.36, 0.88],
        floor=0.79,
        floorNote="dirt path and grass in front of the pool",
        animate=[],
    ),
}


def window(x0: float):
    return (float(x0), 0.0, float(x0) + WIN_W, float(SRC_H))


def crop(img: Image.Image, x0: float, size) -> Image.Image:
    if img.mode == "RGBA":
        return img.convert("RGBa").resize(size, Image.LANCZOS, box=window(x0)).convert("RGBA")
    return img.resize(size, Image.LANCZOS, box=window(x0))


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
        bg = crop(src, x0, (W_OUT, H_OUT))
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
        if "lights" in m:
            entry["lights"] = m["lights"]
        if "notes" in m:
            entry["notes"] = m["notes"]
        ovs = {}
        bg_full = np.array(src)
        for layer in m["overlays"]:
            ov = Image.open(SRC / f"scene-{sid}-{layer}.webp").convert("RGBA")
            entry["registration"][layer + "_source"] = registration(bg_full, np.array(ov))
            full = crop(ov, x0, (W_OUT, H_OUT))
            entry["registration"][layer + "_crop"] = registration(np.array(bg), np.array(full))
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
