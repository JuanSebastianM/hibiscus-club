"""Slice the second Hibiscus Club art pack into per-view sprites + manifest.

Usage (from the repo root):
    python3 -I art/slice_pack2.py [--force] [--contact DIR] [--report]

Inputs: art/source/pack2/{01-hair,03-outfits,04-shoes,05-accessories}/*.webp,
2388x1792 RGBA sheets, each a grid of 3 rows (items) x 4 columns (views:
front, left = figure faces viewer-left, right = faces viewer-right, back).

Outputs:
* art/sprites/pack2/<category>/<id>-<view>.webp (+ part sprites) for hair, outfits and shoes
  (full-resolution slices, not shipped: art/fit_hair_pack2.py and art/fit_wear.py make the game-size
  sprites), dist/assets/pack2/<category>/... for the accessories
* art/sprites/pack2/manifest.json and dist/assets/pack2/manifest.json (the same entries, split by category)
* art/proofs/pack2/<category>/<id>-<view>.webp: worn-proof crops for hair and
  open shoes, plus art/proofs/pack2/manifest.json with the sprite's offset
  inside each proof crop (found by registration, see register()).
* art/proofs/pack2/fragments/<sheet>.json: per-sheet results. The script is
  resumable: a sheet whose fragment exists (and was written by the same
  version of this script for the same source file) is not sliced again;
  --force redoes everything. The manifests are always reassembled from the
  fragments.

Detection and cleanup follow art/slice.py / art/slice_views.py, whose helpers
are imported (neither is modified):
* Items come from the alpha channel: solid pixels (alpha >= SOLID_ALPHA)
  form 8-connected components on a 4x max-pooled grid; each component goes to
  the grid cell holding its centroid, tiny ones join the nearest component.
  An item is the union of its components, so it may be several pieces and may
  cross nominal cell lines; neighbors are excluded by a GROW px margin.
* Low-alpha wisps (hair strands, lace) that are connected to an item through
  pixels above the sheet's haze level are kept up to WISP_REACH px out.
* Alpha cleanup is tuned per sheet from measurements (see measure_sheet()):
  alpha <= haze -> 0, linear stretch so >= opaque -> 255 (these sheets already
  reach 255, so the top end is left alone and genuinely translucent parts
  such as lenses and tulle keep their alpha), RGB zeroed under alpha 0, and
  light-fringe decontamination restricted to the OUTER edge (pixels within
  2 px of empty background), so translucent interiors are not tinted.
* Items taller than MAX_H px are downscaled (LANCZOS) - none are at present.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
_spec = importlib.util.spec_from_file_location("hc_slice", HERE / "slice.py")
S = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(S)
_spec = importlib.util.spec_from_file_location("hc_slice_views", HERE / "slice_views.py")
V = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(V)

ROOT = HERE.parent
SRC = ROOT / "art" / "source" / "pack2"
OUT = ROOT / "dist" / "assets" / "pack2"
ART_OUT = ROOT / "art" / "sprites" / "pack2"
ART_CATS = ("hair", "outfits-adult", "outfits-little", "shoes-adult", "shoes-little")


def out_dir(cat: str) -> Path:
    """Where a category's slices live: full-resolution sources under art/ (not shipped) or dist/."""
    return ART_OUT if cat in ART_CATS else OUT
PROOFS = ROOT / "art" / "proofs" / "pack2"
FRAG = PROOFS / "fragments"
OLD_MANIFESTS = [ROOT / "dist" / "assets" / "items" / "manifest.json",
                 ROOT / "dist" / "assets" / "items" / "views" / "manifest.json"]

VIEWS = ("front", "left", "right", "back")
ROWS, COLS = 3, 4
EDGE = 8            # transparent border added around each sheet
SPECK_REACH = 24
WISP_REACH = 16     # px a low-alpha wisp may extend beyond the solid pixels
MAX_H = 720
OUTER_EDGE = 2      # decontaminate only pixels this close to empty background
FRINGE_MARGIN = 20  # lum excess over the local opaque color that counts as fringe
SCRIPT_VERSION = "2"

# ------------------------------------------------------------------ config
# (sheet path under art/source/pack2, category, [row ids]); None = row not
# taken from this sheet (hair-little-c / -v2 are two drawings of one sheet).
SHEETS = [
    ("01-hair/hair-adult-a.webp", "hair", ["long-waves", "side-ponytail", "half-up-curls"]),
    ("01-hair/hair-adult-b.webp", "hair", ["sleek-curtain-bangs", "flip-bob", "long-braids"]),
    ("01-hair/hair-adult-c.webp", "hair", ["high-bun-tendrils", "space-buns", "crimped-twists"]),
    ("01-hair/hair-little-a.webp", "hair", ["ringlet-pigtails", "curly-buns", "curly-bob"]),
    ("01-hair/hair-little-b.webp", "hair", ["tiny-pigtails", "pixie-sweep", "top-ponytail"]),
    ("01-hair/hair-little-c.webp", "hair", ["chin-bob-bangs", None, "wavy-crop"]),
    ("01-hair/hair-little-c-v2.webp", "hair", [None, "short-braids", None]),
    ("03-outfits/outfits-adult-c.webp", "outfits-adult",
     ["sarong-swimsuit", "tankini-board-shorts", "crochet-cover-up"]),
    ("03-outfits/outfits-adult-d.webp", "outfits-adult",
     ["aqua-velour-tracksuit", "tennis-dress", "baby-tee-cargo"]),
    ("03-outfits/outfits-adult-e.webp", "outfits-adult",
     ["sequin-halter-dress", "butterfly-satin-skirt", "puffer-vest-slip-dress"]),
    ("03-outfits/outfits-adult-f.webp", "outfits-adult",
     ["plaid-knit-vest-set", "hoodie-dress-leg-warmers", "denim-overall-dress"]),
    ("03-outfits/outfits-little-c.webp", "outfits-little",
     ["ruffle-swimsuit", "rash-guard-set", "beach-poncho"]),
    ("03-outfits/outfits-little-d.webp", "outfits-little",
     ["rainbow-tutu-tee", "dino-romper", "raincoat-set"]),
    ("03-outfits/outfits-little-e.webp", "outfits-little",
     ["tulle-party-dress", "bear-onesie", "ballet-wrap-set"]),
    ("04-shoes/shoes-adult-b.webp", "shoes-adult", ["jelly-sandals", "flower-flip-flops", "wedge-sandals"]),
    ("04-shoes/shoes-adult-c.webp", "shoes-adult", ["platform-boots", "fuzzy-slippers", "ribbon-ballet-flats"]),
    ("04-shoes/shoes-little-b.webp", "shoes-little", ["toddler-sandals", "jelly-shoes", "bunny-slippers"]),
    ("04-shoes/shoes-little-c.webp", "shoes-little", ["light-up-sneakers", "cowboy-boots", "ballet-slippers"]),
    ("05-accessories/acc-glasses.webp", "glasses-adult",
     ["heart-sunglasses", "round-tinted-glasses", "cat-eye-glasses"]),
    ("05-accessories/acc-glasses-little.webp", "glasses-little",
     ["star-sunglasses", "round-play-glasses", "swim-goggles"]),
    ("05-accessories/acc-hats-adult.webp", "hats-adult", ["bucket-hat", "sun-hat", "baseball-cap"]),
    ("05-accessories/acc-hats-adult-b.webp", "hats-adult", ["beret", "tiara", "bow-headband"]),
    ("05-accessories/acc-hats-little.webp", "hats-little", ["sun-bonnet", "bear-beanie", "party-crown"]),
    ("05-accessories/acc-bags-adult.webp", "bags-adult", ["mini-shoulder-bag", "beaded-tote", "mini-backpack"]),
    ("05-accessories/acc-bags-adult-b.webp", "bags-adult", ["beach-tote", "heart-purse", "skate-bag"]),
    ("05-accessories/acc-toys-little.webp", "toys-little", ["plush-bunny", "teddy-bear", "kitten-plush"]),
    ("05-accessories/acc-toys-little-b.webp", "toys-little", ["sand-bucket", "pull-duck", "yarn-doll"]),
]

# Sheets with a worn twin (<name>-worn.webp, same layout) used for proofs.
WORN = {s for s, _, _ in SHEETS if s.startswith("01-hair/")} | {
    "04-shoes/shoes-adult-b.webp", "04-shoes/shoes-little-b.webp"}

# Redrawn hairstyles: same ids as dist/assets/items/{,views/}manifest.json.
REDRAWN = {"long-waves", "side-ponytail", "half-up-curls",
           "ringlet-pigtails", "curly-buns", "curly-bob"}

# Side columns drawn the other way round (column 1 faces viewer-RIGHT): the
# worn proof of long-waves shows the face on the right in column 1, and the
# hair-only drawing has its fringe edge at the top right there (as on the
# first pack's sheet). Swapped on output; source.column keeps the sheet column.
SWAP_SIDES = {"long-waves"}

SHOES = {"jelly-sandals", "flower-flip-flops", "wedge-sandals", "platform-boots",
         "fuzzy-slippers", "ribbon-ballet-flats", "toddler-sandals", "jelly-shoes",
         "bunny-slippers", "light-up-sneakers", "cowboy-boots", "ballet-slippers"}
# Two separate garments stacked with an empty row gap in every view (like
# star-pajamas in the first pack): set sprite + top/bottom parts.
STACKED = {"baby-tee-cargo": ("top", "capris"),
           "hoodie-dress-leg-warmers": ("dress", "legwarmers")}
# Bottom parts that are themselves a left/right pair in front/back.
STACKED_PAIR = {"hoodie-dress-leg-warmers": "legwarmers"}

SOURCE_CHOICE = {
    "chin-bob-bangs": {
        "chosen": "art/source/pack2/01-hair/hair-little-c.webp",
        "rejected": "art/source/pack2/01-hair/hair-little-c-v2.webp",
        "reason": "v1: side views have a short neat fringe and the same length as "
                  "front and back; v2's side fringe juts out as a flat shelf and the "
                  "whole bob is drawn larger than the other little styles."},
    "short-braids": {
        "chosen": "art/source/pack2/01-hair/hair-little-c-v2.webp",
        "rejected": "art/source/pack2/01-hair/hair-little-c.webp",
        "reason": "v2: simple smooth top with short braids from the nape, "
                  "consistent in all four views and more toddler-like; v1 shows "
                  "French braids in the side views that the front/back do not "
                  "have, and its front has pale semi-transparent blobs at the ears."},
    "wavy-crop": {
        "chosen": "art/source/pack2/01-hair/hair-little-c.webp",
        "rejected": "art/source/pack2/01-hair/hair-little-c-v2.webp",
        "reason": "v1: compact, matches its worn proof; v2 has a horn-like fringe "
                  "flick sticking out in BOTH side views (absent from its worn proof) "
                  "and a wider front."},
}

NAMES = {  # id: (English, Latin American Spanish)
    "long-waves": ("Beach Babe Waves", "Ondas de Playa"),
    "side-ponytail": ("Sassy Side Pony", "Coleta de Lado Coqueta"),
    "half-up-curls": ("Half-Up Curl Cascade", "Cascada de Rizos Semirrecogidos"),
    "sleek-curtain-bangs": ("Silky Curtain Bangs", "Lacio Sedoso con Flequillo Cortina"),
    "flip-bob": ("Flirty Flip Bob", "Bob Coqueto con Puntas Afuera"),
    "long-braids": ("Twin Plait Princess", "Trenzas Largas de Princesa"),
    "high-bun-tendrils": ("Top Knot & Tendrils", "Chongo Alto con Mechones"),
    "space-buns": ("Cosmic Space Buns", "Chonguitos Espaciales"),
    "crimped-twists": ("Crimped Twist Crown", "Ondas Rizadas con Torcidos"),
    "ringlet-pigtails": ("Ringlet Pigtails", "Coletitas de Tirabuzones"),
    "curly-buns": ("Cutie Curl Buns", "Chonguitos Rizados"),
    "curly-bob": ("Bouncy Curly Bob", "Melenita Rizada Saltarina"),
    "tiny-pigtails": ("Teeny Sprout Pigtails", "Coletitas de Brotecito"),
    "pixie-sweep": ("Pixie Sweep", "Pixie con Fleco de Lado"),
    "top-ponytail": ("Tiny Top Sprout", "Colita Parada"),
    "chin-bob-bangs": ("Bitty Bob & Bangs", "Bob Cortito con Fleco"),
    "short-braids": ("Mini Braid Buddies", "Trencitas Cortas"),
    "wavy-crop": ("Wavy Baby Crop", "Ondas Cortitas"),
    "sarong-swimsuit": ("Lilac Lagoon Swim & Sarong", "Traje de Baño Lila con Pareo"),
    "tankini-board-shorts": ("Plumeria Tankini Splash", "Tankini Floral con Short de Playa"),
    "crochet-cover-up": ("Seashell Crochet Cover-Up", "Salida de Playa Tejida"),
    "aqua-velour-tracksuit": ("Aqua Velour Lounge Set", "Pants de Terciopelo Aqua"),
    "tennis-dress": ("Lilac Match Point Dress", "Vestido de Tenis Lila"),
    "baby-tee-cargo": ("Strawberry Baby Tee & Cargos", "Playerita de Fresa con Capri Cargo"),
    "sequin-halter-dress": ("Coral Sparkle Halter Dress", "Vestido Halter de Lentejuelas"),
    "butterfly-satin-skirt": ("Butterfly Top & Satin Swirl", "Blusa de Mariposas con Falda de Satín"),
    "puffer-vest-slip-dress": ("Rosy Puffer & Mint Slip", "Chaleco Acolchado con Vestido Satinado"),
    "plaid-knit-vest-set": ("Prep School Plaid", "Conjunto Escolar de Cuadros"),
    "hoodie-dress-leg-warmers": ("Cozy Hoodie Dress & Leg Warmers", "Vestido Sudadera con Calentadores"),
    "denim-overall-dress": ("Sunny Stripe Overall Dress", "Vestido Overol de Mezclilla"),
    "ruffle-swimsuit": ("Polka Ruffle Swimsuit", "Trajecito de Baño con Volantes"),
    "rash-guard-set": ("Ocean Pals Rash Guard", "Conjunto de Playa Amigos del Mar"),
    "beach-poncho": ("Bear-Ear Beach Poncho", "Poncho de Playa con Orejitas"),
    "rainbow-tutu-tee": ("Rainbow Tutu Twirl", "Vestido Arcoíris con Tutú"),
    "dino-romper": ("Dino Stomp Romper", "Mameluco de Dinosaurios"),
    "raincoat-set": ("Sunny Puddle Raincoat", "Impermeable Amarillo para Charcos"),
    "tulle-party-dress": ("Pink Party Tulle Dress", "Vestido de Fiesta de Tul Rosa"),
    "bear-onesie": ("Teddy Cuddle Onesie", "Mameluco de Osito"),
    "ballet-wrap-set": ("Little Ballerina Set", "Conjunto de Bailarina"),
    "jelly-sandals": ("Glitter Jelly Sandals", "Sandalias de Gelatina con Brillos"),
    "flower-flip-flops": ("Plumeria Flip-Flops", "Chanclas de Flor"),
    "wedge-sandals": ("Lilac Cork Wedges", "Sandalias de Plataforma de Corcho"),
    "platform-boots": ("Hot Pink Platform Boots", "Botas de Plataforma Fucsia"),
    "fuzzy-slippers": ("Minty Fuzzy Slippers", "Pantuflas Peluditas Menta"),
    "ribbon-ballet-flats": ("Ribbon Ballet Flats", "Balerinas con Listones"),
    "toddler-sandals": ("Splash Pad Sandals", "Sandalitas Cerradas Azules"),
    "jelly-shoes": ("Pink Glitter Jellies", "Zapatitos de Gelatina Rosas"),
    "bunny-slippers": ("Bunny Hop Slippers", "Pantuflas de Conejito"),
    "light-up-sneakers": ("Twinkle Light-Up Sneakers", "Tenis con Lucecitas"),
    "cowboy-boots": ("Little Star Cowgirl Boots", "Botitas Vaqueras de Estrellas"),
    "ballet-slippers": ("Peachy Ballet Slippers", "Zapatillas de Ballet Durazno"),
    "heart-sunglasses": ("Heartbreaker Shades", "Lentes de Sol de Corazón"),
    "round-tinted-glasses": ("Peach Sunset Rounds", "Lentes Redondos Durazno"),
    "cat-eye-glasses": ("Coral Cat-Eye Glam", "Lentes Ojo de Gato"),
    "star-sunglasses": ("Superstar Shades", "Lentes de Estrella"),
    "round-play-glasses": ("Aqua Play Specs", "Lentecitos Redondos"),
    "swim-goggles": ("Splashy Swim Goggles", "Goggles para Nadar"),
    "bucket-hat": ("Lavender Daisy Bucket Hat", "Gorro Pescador Lavanda"),
    "sun-hat": ("Sun-Kissed Straw Hat", "Sombrero de Paja con Moño"),
    "baseball-cap": ("Star Player Cap", "Gorra de Estrella"),
    "beret": ("Raspberry Beret", "Boina Frambuesa"),
    "tiara": ("Sweetheart Tiara", "Tiara de Corazón"),
    "bow-headband": ("Bow-tiful Headband", "Diadema con Moño"),
    "sun-bonnet": ("Gingham Sun Bonnet", "Gorrito de Sol de Cuadritos"),
    "bear-beanie": ("Bear Cub Beanie", "Gorrito de Osito"),
    "party-crown": ("Birthday Party Crown", "Corona de Fiesta"),
    "mini-shoulder-bag": ("Lilac Mini Shoulder Bag", "Bolsita de Hombro Lila"),
    "beaded-tote": ("Bubblegum Bead Tote", "Bolsa de Cuentas"),
    "mini-backpack": ("Watermelon Mini Backpack", "Mochilita Sandía"),
    "beach-tote": ("Beach Day Tote", "Bolsa de Playa con Toalla"),
    "heart-purse": ("Fluffy Heart Purse", "Bolsita Corazón Peludita"),
    "skate-bag": ("Roller Disco Bag", "Bolsa para Patines"),
    "plush-bunny": ("Carrot Cuddle Bunny", "Conejita de Peluche"),
    "teddy-bear": ("Bowtie Teddy", "Osito de Peluche"),
    "kitten-plush": ("Lilac Kitty Plush", "Gatita de Peluche"),
    "sand-bucket": ("Starfish Sand Bucket", "Cubetita y Palita"),
    "pull-duck": ("Waddle Pull-Along Duck", "Patito para Jalar"),
    "yarn-doll": ("Yarn-Hair Rag Doll", "Muñequita de Trapo"),
}


# ------------------------------------------------------------- utilities

def script_hash() -> str:
    return hashlib.sha1(Path(__file__).read_bytes()).hexdigest()[:12] + "-v" + SCRIPT_VERSION


def file_hash(p: Path) -> str:
    return hashlib.sha1(p.read_bytes()).hexdigest()[:12]


def view_name(iid: str, col: int) -> str:
    v = VIEWS[col]
    if iid in SWAP_SIDES and v in ("left", "right"):
        v = "right" if v == "left" else "left"
    return v


def load_padded(path: Path) -> np.ndarray:
    return np.pad(np.array(Image.open(path).convert("RGBA")), ((EDGE, EDGE), (EDGE, EDGE), (0, 0)))


def measure_sheet(raw: np.ndarray) -> dict:
    """Haze level, alpha ceiling and outer-edge fringe of one sheet."""
    al = raw[..., 3].astype(np.int32)
    rgb = raw[..., :3].astype(np.float32)
    solid = al >= S.SOLID_ALPHA
    far = ~S.dilate(solid, 12)
    farv = al[far]
    farnz = farv[farv > 0]
    haze_p999 = float(np.percentile(farnz, 99.9)) if farnz.size else 0.0
    inner = S.box_sum(solid.astype(np.float32), 6) >= 169
    innerv = al[inner]
    ring = S.dilate(solid, 12) & ~S.dilate(solid, 2)
    rv = al[ring]
    clear = al <= 8
    outer = (al > 8) & (al < 255) & S.dilate(clear, 2)
    op = (al == 255) & ~S.dilate(al < 255, 2)
    ws = S.box_sum(op.astype(np.float32), 4)
    m = outer & (ws >= 4)
    fr = {}
    if m.any():
        loc = np.stack([S.box_sum(rgb[..., c] * op, 4)[m] for c in range(3)], -1) / ws[m][:, None]
        d = rgb[m] - loc
        av = al[m]
        for lo, hi in ((9, 64), (64, 160), (160, 255)):
            s = (av >= lo) & (av < hi)
            if s.any():
                fr[f"{lo}-{hi}"] = {"n": int(s.sum()),
                                     "dRGB": [round(float(x), 1) for x in d[s].mean(0)],
                                     "dLum": round(float((d[s] @ np.array([.299, .587, .114])).mean()), 1)}
    return {
        "alpha_max": int(al.max()),
        "haze_far_px": int(farnz.size), "haze_far_max": int(farnz.max()) if farnz.size else 0,
        "haze_far_p99_9": round(haze_p999, 1),
        "glow_ring_nonzero_frac": round(float((rv > 0).mean()), 4),
        "glow_ring_p95": float(np.percentile(rv[rv > 0], 95)) if (rv > 0).any() else 0.0,
        "interior_frac_below_255": round(float((innerv < 255).mean()), 4),
        "interior_frac_below_200": round(float((innerv < 200).mean()), 4),
        "outer_edge_vs_interior": fr,
    }


def clean(raw: np.ndarray, meas: dict):
    """Per-sheet alpha cleanup. Returns (rgb, alpha, params, n_fringe_fixed)."""
    haze = int(min(8, max(2, np.ceil(meas["haze_far_p99_9"]))))
    opaque = 255 if meas["alpha_max"] == 255 else int(min(250, meas["alpha_max"] - 6))
    a = raw[..., 3].astype(np.float32)
    alpha = np.clip(np.rint((a - haze) * (255.0 / (opaque - haze))), 0, 255).astype(np.uint8)
    fixed, n_all = S.decontaminate(raw[..., :3], alpha, margin=FRINGE_MARGIN)
    outer = S.dilate(alpha == 0, OUTER_EDGE)
    rgb = np.where(outer[..., None], fixed, raw[..., :3]).astype(np.uint8)
    nfix = int(((fixed != raw[..., :3]).any(-1) & outer).sum())
    rgb[alpha == 0] = 0
    return rgb, alpha, {"haze": haze, "opaque": opaque, "fringe_margin": FRINGE_MARGIN,
                        "decontaminate": f"outer {OUTER_EDGE}px only"}, nfix


def components(raw_a: np.ndarray, report: dict, tag: str, cut_rows: bool = False):
    """Group pooled components into grid cells. Returns {cell: mask} (full res).
    cut_rows: separate figures at the nominal row lines first (worn proofs
    are cropped at the row line, so shoulders/legs touch the next row)."""
    H, W = raw_a.shape
    H0, W0 = H - 2 * EDGE, W - 2 * EDGE
    P = S.POOL
    solid = raw_a >= S.SOLID_ALPHA
    if cut_rows:
        solid = solid.copy()
        for r in range(1, ROWS):
            yl = EDGE + int(round(r * H0 / ROWS))
            solid[yl - P:yl + P] = False
    ph, pw = H // P, W // P
    pooled = solid[:ph * P, :pw * P].reshape(ph, P, pw, P).any(axis=(1, 3))
    lab, n = S.label(pooled)
    groups = {(r, c): [] for r in range(ROWS) for c in range(COLS)}
    specks = []
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        if len(ys) < S.MIN_CELLS:
            specks.append((k, ys, xs))
            continue
        cy, cx = (ys.mean() + 0.5) * P - EDGE, (xs.mean() + 0.5) * P - EDGE
        cell = (min(max(int(cy / (H0 / ROWS)), 0), ROWS - 1),
                min(max(int(cx / (W0 / COLS)), 0), COLS - 1))
        groups[cell].append(k)
        x0, x1 = xs.min() * P - EDGE, (xs.max() + 1) * P - 1 - EDGE
        y0, y1 = ys.min() * P - EDGE, (ys.max() + 1) * P - 1 - EDGE
        if int(max(x0, 0) / (W0 / COLS)) != int(min(x1, W0 - 1) / (W0 / COLS)) or \
           int(max(y0, 0) / (H0 / ROWS)) != int(min(y1, H0 - 1) / (H0 / ROWS)):
            report.setdefault("crosses_grid", []).append((tag, cell))
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
            groups[cell_of[int(best)]].append(k)
            report.setdefault("specks_attached", 0)
            report["specks_attached"] += 1
        else:
            report.setdefault("specks_dropped", []).append((tag, int(xs.mean() * P), int(ys.mean() * P), len(ys)))
    masks = {}
    for cell, ks in groups.items():
        m = np.isin(lab, ks)
        full = np.zeros((H, W), bool)
        full[:ph * P, :pw * P] = np.repeat(np.repeat(m, P, 0), P, 1)
        masks[cell] = full & solid
    return masks


def grow_wisps(own: np.ndarray, allowed: np.ndarray, reach: int) -> np.ndarray:
    """Geodesic growth of `own` through `allowed` pixels, up to `reach` px."""
    ys, xs = np.nonzero(own)
    if not len(ys):
        return own
    H, W = own.shape
    y0, y1 = max(ys.min() - reach - 1, 0), min(ys.max() + reach + 2, H)
    x0, x1 = max(xs.min() - reach - 1, 0), min(xs.max() + reach + 2, W)
    cur = own[y0:y1, x0:x1].copy()
    al = allowed[y0:y1, x0:x1]
    for _ in range(reach):
        nxt = (S.box_sum(cur.astype(np.int32), 1) > 0) & al | cur
        if (nxt == cur).all():
            break
        cur = nxt
    out = np.zeros_like(own)
    out[y0:y1, x0:x1] = cur
    return out


# ------------------------------------------------------------------ slicing

def slice_sheet(sheet: str, cat: str, ids, report: dict):
    raw = load_padded(SRC / sheet)
    H, W = raw.shape[:2]
    meas = measure_sheet(raw)
    rgb, alpha, params, nfix = clean(raw, meas)
    rep = {"measure": meas, "cleanup": params, "fringe_px_fixed": nfix,
           "haze_px_removed": int(((raw[..., 3] > 0) & (alpha == 0)).sum())}
    masks = components(raw[..., 3], rep, sheet)
    above_haze = raw[..., 3] > params["haze"]
    out = []
    for (r, c), own in masks.items():
        iid = ids[r]
        if iid is None:
            continue
        if not own.any():
            raise SystemExit(f"{sheet}: no pixels for {iid} col {c}")
        others = np.zeros((H, W), bool)
        for oc, om in masks.items():
            if oc != (r, c):
                others |= om
        block = S.dilate(others, S.GROW)
        grown = grow_wisps(own, above_haze & ~block, WISP_REACH)
        region = (S.dilate(own, S.GROW) | grown) & ~block
        lost = (alpha > 0) & S.dilate(own, S.GROW) & block
        if lost.any():
            rep.setdefault("neighbor_overlap_px", []).append((iid, c, int(lost.sum())))
        rep.setdefault("wisp_px_kept", {})[f"{iid}/{c}"] = int(
            ((alpha > 0) & grown & ~S.dilate(own, S.GROW)).sum())
        a_item = np.where(region, alpha, 0).astype(np.uint8)
        x0, y0, x1, y1 = S.trim_box(a_item)
        x0, y0, x1, y1 = x0 - S.PAD, y0 - S.PAD, x1 + S.PAD, y1 + S.PAD
        if x0 < EDGE or y0 < EDGE or x1 > W - EDGE or y1 > H - EDGE:
            rep.setdefault("touches_sheet_edge", []).append((iid, c))
        sub_a = a_item[y0:y1, x0:x1]
        sub_rgb = np.where(sub_a[..., None] > 0, rgb[y0:y1, x0:x1], 0).astype(np.uint8)
        out.append(dict(id=iid, view=view_name(iid, c), column=c, category=cat,
                        sprite=Image.fromarray(np.dstack([sub_rgb, sub_a]), "RGBA"),
                        box=[int(x0 - EDGE), int(y0 - EDGE), int(x1 - x0), int(y1 - y0)]))
    report[sheet] = rep
    return out


def split_parts(iid: str, view: str, spr: Image.Image, report: dict):
    """{name: (sprite, offset, file-suffix)} for pairs and stacked sets."""
    rgba = np.array(spr)
    a = rgba[..., 3]

    def cut(mask_first, names, sub):
        res = {}
        for k, pname in enumerate(names):
            part, off = S.sub_sprite(spr, mask_first if k == 0 else ~mask_first)
            res[pname] = (part, [int(off[0]) + sub[0], int(off[1]) + sub[1]])
        return res

    def first_mask(img_a, rgba_, axis):
        idx, gap = S.split_point(img_a >= S.SOLID_ALPHA, axis)
        info = {"axis": "x" if axis else "y", "at": int(idx), "gap_px": int(gap)}
        if gap:
            m = np.zeros_like(img_a, bool)
            if axis == 1:
                m[:, :idx] = True
            else:
                m[:idx, :] = True
        else:
            src = rgba_ if axis == 0 else rgba_.transpose(1, 0, 2)
            n = src.shape[0]
            lo, hi = int(n * 0.25), int(n * 0.6) if axis == 0 else int(n * 0.75)
            m = V.seam_split(src, lo, hi, idx)
            if axis == 1:
                m = m.T
            info["seam"] = True
        return m, info

    if iid in SHOES and view in ("front", "back"):
        m, info = first_mask(a, rgba, 1)
        report[f"{iid}-{view}"] = info
        return {k: (p, o, {"left": "l", "right": "r"}[k])
                for k, (p, o) in cut(m, ("left", "right"), (0, 0)).items()}
    if iid in STACKED:
        names = STACKED[iid]
        m, info = first_mask(a, rgba, 0)
        report[f"{iid}-{view}"] = info
        parts = {k: (p, o, k) for k, (p, o) in cut(m, names, (0, 0)).items()}
        if iid in STACKED_PAIR and view in ("front", "back"):
            bname = STACKED_PAIR[iid]
            bpart, boff, _ = parts[bname]
            barr = np.array(bpart)
            m2, info2 = first_mask(barr[..., 3], barr, 1)
            report[f"{iid}-{view}-{bname}"] = info2
            for k in ("left", "right"):
                sub, off = S.sub_sprite(bpart, m2 if k == "left" else ~m2)
                parts[f"{bname}-{k}"] = (sub, [boff[0] + int(off[0]), boff[1] + int(off[1])],
                                         f"{bname}-{k[0]}")
        return parts
    return {}


def face_hole_robust(alpha: np.ndarray):
    """S.face_hole, but when the hair has detached lower pieces (braids that
    start below the ears) the side hair does not close the face window and
    S.face_hole returns the open gap between the braids (a box spanning most
    of the sprite width). Then the window is measured only down to the bottom
    of the main (largest) hair piece, and marked topPieceOnly=true."""
    h, w = alpha.shape
    hole = S.face_hole(alpha)
    if hole and hole["face"]["w"] < 0.75 * w:
        return hole
    P = 4
    hh, ww = (h + P - 1) // P, (w + P - 1) // P
    pad = np.zeros((hh * P, ww * P), bool)
    pad[:h, :w] = alpha >= 128
    lab, n = S.label(pad.reshape(hh, P, ww, P).any(axis=(1, 3)))
    if n < 2:
        return hole
    big = 1 + int(np.argmax(np.bincount(lab.ravel())[1:]))
    y_end = min(h, (int(np.nonzero((lab == big).any(1))[0][-1]) + 1) * P)
    hole2 = S.face_hole(alpha[:y_end])
    if hole2:
        hole2["topPieceOnly"] = True
        return hole2
    return hole


# ----------------------------------------------------------- registration

def xcorr_valid(I: np.ndarray, K: np.ndarray) -> np.ndarray:
    """out[y, x] = sum(K * I[y:y+h, x:x+w]) for all fully-inside offsets."""
    H, W = I.shape
    h, w = K.shape
    sh = (int(2 ** np.ceil(np.log2(H))), int(2 ** np.ceil(np.log2(W))))
    F = np.fft.rfft2(I, sh)
    G = np.fft.rfft2(K[::-1, ::-1], sh)
    full = np.fft.irfft2(F * G, sh)
    return full[h - 1:H, w - 1:W]


def ssd_map(region: np.ndarray, tmpl: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Masked mean squared RGB error of tmpl against every placement in region."""
    m = mask.astype(np.float64)
    total = np.zeros((region.shape[0] - tmpl.shape[0] + 1, region.shape[1] - tmpl.shape[1] + 1))
    for c in range(3):
        I = region[..., c].astype(np.float64)
        T = tmpl[..., c].astype(np.float64)
        total += (m * T * T).sum() - 2 * xcorr_valid(I, m * T) + xcorr_valid(I * I, m)
    return total / max(m.sum(), 1)


def proof_figure_box(worn_raw: np.ndarray, masks: dict, cell) -> list:
    """Bounding box (sheet px, padded coords) of the worn figure of one cell,
    clipped to that cell's row band + 24 px (shoulders/legs reach the row line
    and can touch the next row's figure)."""
    H, W = worn_raw.shape[:2]
    H0 = H - 2 * EDGE
    r = cell[0]
    top = int(r * H0 / ROWS) + EDGE - 24
    bot = int((r + 1) * H0 / ROWS) + EDGE + 24
    m = masks[cell].copy()
    m[:max(top, 0)] = False
    m[bot:] = False
    x0, y0, x1, y1 = S.trim_box(m.astype(np.uint8))
    return [x0, y0, x1, y1]


def register_one(spr: Image.Image, box, worn_rgba: np.ndarray, search: int = 48,
                 anchor: str = "full"):
    """Find (dx, dy) so that the sprite placed at box + (dx, dy) on the worn
    sheet (padded coords) matches the item painted there.

    Masked RGB template matching (SSD over the sprite's solid pixels). With
    anchor="scalp" (hair) only the top 40% of the sprite is matched, so a
    redrawn length or silhouette lower down cannot pull the hairline off the
    head. The item and worn sheets share one layout, so (0, 0) is kept unless
    a shift is clearly better (>3% lower error and not at the window edge).
    Residual: each third of the sprite is matched alone within +-12 px of the
    chosen shift; a band counts as displaced only if moving it improves its
    error by >10%."""
    t = np.array(spr).astype(np.float32)
    mask = t[..., 3] >= 200
    tmpl = t[..., :3]
    x, y, w, h = box
    H, W = worn_rgba.shape[:2]
    gx0, gy0 = x - search, y - search
    gx1, gy1 = x + w + search, y + h + search
    region = np.full((gy1 - gy0, gx1 - gx0, 3), 128.0, np.float32)
    sx0, sy0, sx1, sy1 = max(gx0, 0), max(gy0, 0), min(gx1, W), min(gy1, H)
    wa = worn_rgba[sy0:sy1, sx0:sx1].astype(np.float32)
    al = wa[..., 3:4] / 255.0
    region[sy0 - gy0:sy1 - gy0, sx0 - gx0:sx1 - gx0] = wa[..., :3] * al + 128.0 * (1 - al)
    ys = np.nonzero(mask.any(1))[0]
    am = mask
    if anchor == "scalp" and len(ys) > 30:
        am = mask.copy()
        am[int(ys[0] + 0.4 * (ys[-1] - ys[0])):] = False
    mp = ssd_map(region, tmpl, am)
    yy, xx = np.unravel_index(int(np.argmin(mp)), mp.shape)
    bdx, bdy = int(xx) - search, int(yy) - search
    ssd0 = float(mp[search, search])
    edge = abs(bdx) >= search - 1 or abs(bdy) >= search - 1
    if edge or ssd0 <= float(mp[yy, xx]) * 1.03:
        dx, dy, how = 0, 0, ("kept (0,0): search hit window edge" if edge and (bdx, bdy) != (0, 0)
                             else "kept (0,0)")
    else:
        dx, dy, how = bdx, bdy, f"{anchor} match"
    cy, cx = dy + search, dx + search
    full = ssd_map(region, tmpl, mask) if am is not mask else mp
    rmse = float(np.sqrt(max(full[cy, cx], 0)))
    fy, fx = np.unravel_index(int(np.argmin(full)), full.shape)
    bands = {}
    if len(ys) > 30:
        cuts = np.linspace(ys[0], ys[-1] + 1, 4).astype(int)
        for k, nm in enumerate(("top", "middle", "bottom")):
            mk = np.zeros_like(mask)
            mk[cuts[k]:cuts[k + 1]] = mask[cuts[k]:cuts[k + 1]]
            if mk.sum() < 200:
                continue
            mb = ssd_map(region, tmpl, mk)
            r0, r1 = max(cy - 12, 0), min(cy + 13, mb.shape[0])
            c0, c1 = max(cx - 12, 0), min(cx + 13, mb.shape[1])
            sub = mb[r0:r1, c0:c1]
            by, bx = np.unravel_index(int(np.argmin(sub)), sub.shape)
            gain = 1 - float(sub[by, bx]) / max(float(mb[cy, cx]), 1e-6)
            bands[nm] = {"shift": [int(bx + c0 - cx), int(by + r0 - cy)] if gain > 0.10 else [0, 0],
                         "gain": round(gain, 3),
                         "rmse": round(float(np.sqrt(max(mb[cy, cx], 0))), 1)}
    info = {"method": how, "anchor": anchor, "best_anchor_shift": [bdx, bdy],
            "best_full_mask_shift": [int(fx) - search, int(fy) - search]}
    return dx, dy, rmse, bands, info


def classify_item(proof: np.ndarray, spr_a: np.ndarray, off, spr_rgb: np.ndarray):
    """Two-class Gaussian colour classifier: pixels of the worn proof that look
    like the item (hair / shoe) vs the rest of the figure (skin, top).
    Returns a boolean mask over the proof crop."""
    ph, pw = proof.shape[:2]
    ox, oy = off
    h, w = spr_a.shape
    placed = np.zeros((ph, pw), bool)
    ys0, xs0 = max(oy, 0), max(ox, 0)
    ys1, xs1 = min(oy + h, ph), min(ox + w, pw)
    placed[ys0:ys1, xs0:xs1] = spr_a[ys0 - oy:ys1 - oy, xs0 - ox:xs1 - ox] >= 200
    fig = proof[..., 3] >= 128
    rgb = proof[..., :3].astype(np.float64)
    item_px = spr_rgb[spr_a >= 200].astype(np.float64)
    rest = fig & ~S.dilate(placed, 6)
    if rest.sum() < 100 or len(item_px) < 100:
        return placed & fig
    rest_px = rgb[rest]

    def nll(px, data):
        mu = data.mean(0)
        cov = np.cov(data.T) + np.eye(3) * 4.0
        inv = np.linalg.inv(cov)
        d = px - mu
        return 0.5 * np.einsum("ij,jk,ik->i", d, inv, d) + 0.5 * np.log(np.linalg.det(cov))

    flat = rgb.reshape(-1, 3)
    is_item = (nll(flat, item_px) < nll(flat, rest_px)).reshape(ph, pw) & fig
    # light closing to fill highlights
    is_item = ~S.dilate(~S.dilate(is_item, 2), 2) & fig
    # drop blobs not touching the placed sprite (eyebrows, eyes, shadows)
    P = S.POOL
    hh, ww = (ph + P - 1) // P, (pw + P - 1) // P
    pad = np.zeros((hh * P, ww * P), bool)
    pad[:ph, :pw] = is_item
    pooled = pad.reshape(hh, P, ww, P).any(axis=(1, 3))
    lab, n = S.label(pooled)
    pp = np.zeros((hh * P, ww * P), bool)
    pp[:ph, :pw] = placed
    touch = np.unique(lab[pp.reshape(hh, P, ww, P).any(axis=(1, 3)) & (lab > 0)])
    keep = np.repeat(np.repeat(np.isin(lab, touch), P, 0), P, 1)[:ph, :pw]
    return is_item & keep


# ------------------------------------------------------------------- build

def process_sheet(sheet: str, cat: str, ids, force: bool) -> dict:
    fpath = FRAG / (Path(sheet).stem + ".json")
    sig = {"script": script_hash(), "source": file_hash(SRC / sheet)}
    worn_path = SRC / sheet.replace(".webp", "-worn.webp")
    if sheet in WORN:
        sig["worn"] = file_hash(worn_path)
    if fpath.exists() and not force:
        frag = json.loads(fpath.read_text())
        if frag.get("signature") == sig and all(
                (out_dir(it["category"]) / v["file"]).exists() for it in frag["items"].values() for v in it["views"].values()):
            print(f"  {sheet}: up to date", file=sys.stderr)
            return frag
    print(f"  {sheet}: slicing", file=sys.stderr)
    report = {}
    items = slice_sheet(sheet, cat, ids, report)
    split_rep = {}
    frag = {"signature": sig, "sheet": f"art/source/pack2/{sheet}", "report": report[sheet],
            "splits": split_rep, "items": {}, "proofs": {}}
    sprites = {}
    for it in items:
        iid, view, spr = it["id"], it["view"], it["sprite"]
        scale = 1.0
        if spr.height > MAX_H:
            scale = MAX_H / spr.height
            spr = spr.resize((max(1, round(spr.width * scale)), MAX_H), Image.LANCZOS)
        rel = f"{cat}/{iid}-{view}.webp"
        S.save(spr, out_dir(cat) / rel)
        entry = {"file": rel, "width": spr.width, "height": spr.height,
                 "source": {"sheet": f"art/source/pack2/{sheet}", "box": it["box"],
                            "column": it["column"]}}
        if scale != 1.0:
            entry["scale"] = round(scale, 5)
        parts = split_parts(iid, view, spr, split_rep)
        if parts:
            entry["parts"] = {}
            for pname, (part, off, suf) in parts.items():
                prel = f"{cat}/{iid}-{view}-{suf}.webp"
                S.save(part, out_dir(cat) / prel)
                entry["parts"][pname] = {"file": prel, "width": part.width,
                                         "height": part.height, "offset": off}
        if cat == "hair" and view == "front":
            entry["faceHole"] = face_hole_robust(np.array(spr)[..., 3])
        item = frag["items"].setdefault(iid, {"category": cat, "views": {}})
        item["views"][view] = entry
        sprites[(iid, view)] = (spr, it)
    if sheet in WORN:
        frag["proofs"] = make_proofs(sheet, cat, ids, sprites, worn_path)
    FRAG.mkdir(parents=True, exist_ok=True)
    fpath.write_text(json.dumps(frag, indent=1, default=int) + "\n")
    return frag


def make_proofs(sheet, cat, ids, sprites, worn_path: Path) -> dict:
    worn_raw = load_padded(worn_path)
    meas = measure_sheet(worn_raw)
    wrgb, walpha, _, _ = clean(worn_raw, meas)
    worn = np.dstack([wrgb, walpha])
    wmasks = components(worn_raw[..., 3], {}, "worn", cut_rows=True)
    # restore the pixels removed at the row cut to the cell above/below them
    full = worn_raw[..., 3] >= S.SOLID_ALPHA
    for cell in wmasks:
        wmasks[cell] = S.dilate(wmasks[cell], 2 * S.POOL) & full & ~np.logical_or.reduce(
            [wmasks[o] for o in wmasks if o != cell])
    H, W = worn.shape[:2]
    out = {}
    vdir = Path(REG_DIR) if REG_DIR else None
    for (iid, view), (spr, it) in sprites.items():
        x, y, w, h = it["box"]
        bx, by = x + EDGE, y + EDGE           # padded coords
        cell = (ids.index(iid), it["column"])
        fx0, fy0, fx1, fy1 = proof_figure_box(worn_raw, wmasks, cell)
        dx, dy, rmse, bands, rinfo = register_one(spr, [bx, by, w, h], worn,
                                                  anchor="scalp" if cat == "hair" else "full")
        # proof box: the sprite's own box (where it was painted) united with
        # the figure (head, neck, shoulders / feet, legs)
        px0, py0 = min(bx + dx, fx0) - S.PAD, min(by + dy, fy0) - S.PAD
        px1, py1 = max(bx + dx + w, fx1) + S.PAD, max(by + dy + h, fy1) + S.PAD
        px0, py0, px1, py1 = max(px0, 0), max(py0, 0), min(px1, W), min(py1, H)
        crop = worn[py0:py1, px0:px1].copy()
        # keep only this cell's figure + the registered sprite footprint
        keep = wmasks[cell][py0:py1, px0:px1]
        keep = S.dilate(keep, S.GROW + 2)
        crop[~keep] = 0
        off = [int(bx + dx - px0), int(by + dy - py0)]
        rel = f"{cat}/{iid}-{view}.webp"
        (PROOFS / cat).mkdir(parents=True, exist_ok=True)
        Image.fromarray(crop, "RGBA").save(PROOFS / rel, "WEBP", **S.WEBP)
        sa = np.array(spr)
        item_mask = classify_item(crop, sa[..., 3], off, sa[..., :3])
        placed = np.zeros(crop.shape[:2], bool)
        placed_any = np.zeros(crop.shape[:2], bool)
        ys0, xs0 = max(off[1], 0), max(off[0], 0)
        ys1, xs1 = min(off[1] + h, crop.shape[0]), min(off[0] + w, crop.shape[1])
        placed[ys0:ys1, xs0:xs1] = sa[ys0 - off[1]:ys1 - off[1], xs0 - off[0]:xs1 - off[0], 3] >= 128
        placed_any[ys0:ys1, xs0:xs1] = sa[ys0 - off[1]:ys1 - off[1], xs0 - off[0]:xs1 - off[0], 3] > 0
        inter = (placed & item_mask).sum()
        union = (placed | item_mask).sum()
        iou = float(inter / max(union, 1))
        uncovered = float((item_mask & ~placed_any).sum() / max(item_mask.sum(), 1))
        overhang = float((placed & (crop[..., 3] < 128)).sum() / max(placed.sum(), 1))
        sub = crop[ys0:ys1, xs0:xs1].astype(np.int32)
        sp = sa[ys0 - off[1]:ys1 - off[1], xs0 - off[0]:xs1 - off[0]].astype(np.int32)
        sm = sp[..., 3] >= 250
        same = float(((np.abs(sp[..., :3] - sub[..., :3]).max(-1) <= 24) & (sub[..., 3] >= 200))[sm].mean())
        band_dev = max([max(abs(b["shift"][0]), abs(b["shift"][1])) for b in bands.values()] or [0])
        flag = []
        if same < (0.85 if cat == "hair" else 0.5):
            flag.append(f"drawing differs from proof (only {same:.0%} of pixels identical)")
        if iou < 0.8:
            flag.append("shape differs (IoU < 0.8)")
        if band_dev > 6:
            flag.append(f"parts drawn {band_dev}px apart")
        if uncovered > 0.12:
            flag.append(f"{uncovered:.0%} of proof {('hair' if cat == 'hair' else 'shoe')} not covered")
        entry = {"proof": rel, "worn_sheet": f"art/source/pack2/{worn_path.parent.name}/{worn_path.name}",
                 "proof_box": [px0 - EDGE, py0 - EDGE, px1 - px0, py1 - py0],
                 "sprite": (f"../../sprites/pack2/{cat}/{iid}-{view}.webp" if cat in ART_CATS else f"../../../dist/assets/pack2/{cat}/{iid}-{view}.webp"),
                 "sprite_box": [x, y, w, h],
                 "offset": off,
                 "registration": {"shift_vs_sprite_box": [dx, dy], **rinfo, "rgb_rmse": round(rmse, 1),
                                  "band_offsets": bands, "max_band_dev_px": band_dev,
                                  "identical_px": round(same, 3), "iou": round(iou, 3), "proof_item_uncovered": round(uncovered, 3),
                                  "sprite_over_background": round(overhang, 3)},
                 "flags": flag}
        # shoes: register each part on its own too
        if iid in SHOES and view in ("front", "back"):
            parts = split_parts(iid, view, spr, {})
            entry["parts"] = {}
            for pname, (part, poff, _) in parts.items():
                pdx, pdy, prm, _, _ = register_one(
                    part, [bx + poff[0], by + poff[1], part.width, part.height], worn, 32)
                entry["parts"][pname] = {
                    "offset": [int(bx + poff[0] + pdx - px0), int(by + poff[1] + pdy - py0)],
                    "shift_vs_set_registration": [pdx - dx, pdy - dy], "rgb_rmse": round(prm, 1)}
        out[f"{iid}/{view}"] = entry
        if vdir:
            verify_image(crop, item_mask, spr, off, vdir / f"{iid}-{view}.png", entry)
    return out


REG_DIR = None


def verify_image(crop, item_mask, spr, off, path: Path, entry):
    """Proof with the item region blanked (flat grey), sprite composited on
    top at the registered offset, next to the raw proof and an outline diff."""
    path.parent.mkdir(parents=True, exist_ok=True)
    blank = crop.copy()
    blank[item_mask] = [200, 200, 200, 255]
    bgc = (24, 22, 34, 255)
    a = Image.new("RGBA", (crop.shape[1], crop.shape[0]), bgc)
    a.alpha_composite(Image.fromarray(blank, "RGBA"))
    comp = a.copy()
    comp.alpha_composite(spr, (int(off[0]), int(off[1])))
    raw = Image.new("RGBA", a.size, bgc)
    raw.alpha_composite(Image.fromarray(crop, "RGBA"))
    # outline overlay: sprite edge (cyan) over the raw proof
    sa = np.zeros(crop.shape[:2], bool)
    h, w = spr.height, spr.width
    ys0, xs0 = max(off[1], 0), max(off[0], 0)
    ys1, xs1 = min(off[1] + h, crop.shape[0]), min(off[0] + w, crop.shape[1])
    sa[ys0:ys1, xs0:xs1] = np.array(spr)[ys0 - off[1]:ys1 - off[1], xs0 - off[0]:xs1 - off[0], 3] >= 128
    edge = sa & S.dilate(~sa, 1)
    ov = np.array(raw)
    ov[edge] = [0, 255, 255, 255]
    tiles = [raw, comp, Image.fromarray(ov, "RGBA")]
    out = Image.new("RGB", (a.width * 3 + 20, a.height + 24), (255, 255, 255))
    for i, t in enumerate(tiles):
        out.paste(t.convert("RGB"), (i * (a.width + 10), 24))
    d = ImageDraw.Draw(out)
    r = entry["registration"]
    d.text((4, 4), f"{path.stem} shift {r['shift_vs_sprite_box']} iou {r['iou']} bands {r['band_offsets']} {entry['flags']}",
           fill=(0, 0, 0))
    out.save(path)


def check_ids():
    old = {}
    for p in OLD_MANIFESTS:
        old.update(json.loads(p.read_text())["items"])
    seen = set()
    for sheet, cat, ids in SHEETS:
        for iid in ids:
            if iid is None:
                continue
            if iid in seen:
                raise SystemExit(f"duplicate id {iid}")
            seen.add(iid)
            if iid in old and iid not in REDRAWN:
                raise SystemExit(f"{iid} collides with an existing id")
            # (the first art of a redrawn id may since have been retired from the old manifests)
            if iid in REDRAWN and iid in old and old[iid].get("category") != cat:
                raise SystemExit(f"{iid}: redrawn id missing or category mismatch")
    missing = seen - set(NAMES)
    if missing:
        raise SystemExit(f"names missing for {missing}")


def assemble(frags: list[dict]):
    manifest = {
        "version": 1,
        "note": "Generated by art/slice_pack2.py from art/source/pack2/*. Paths are relative "
                "to this file. Hair, outfits and shoes (full-resolution slices, not shipped; the game uses the "
                "game-size sprites made from them) are in art/sprites/pack2/manifest.json, the accessories in "
                "dist/assets/pack2/manifest.json. Same conventions as ../items/views/manifest.json: views front, "
                "left (figure faces viewer-left), right (faces viewer-right), back; "
                "source.box = [x, y, w, h] in sheet px including the 2px padding, sprite px = "
                "sheet px unless the view has a 'scale' (none at present); all four views of "
                "an item come from one sheet row at one drawing scale, and scaleRef restates "
                "their relative size and vertical alignment (rowTop/rowBottom = union of the "
                "four boxes; per view dy = box top - rowTop, bottomGap = rowBottom - box "
                "bottom, heightVsFront = h / front h). source.column = 0-based sheet column "
                "(long-waves has its side columns swapped on the sheet). parts: offset = "
                "position of the part inside the view's sprite; left/right = viewer's "
                "left/right. faceHole (hair front only) as in ../items/manifest.json. "
                "replaces = the item redraws the same id in ../items/views/manifest.json. "
                "name = English display name, nameEs = Latin American Spanish.",
        "views": list(VIEWS),
        "categories": [],
        "items": {},
    }
    proofs = {"version": 1,
              "note": "Generated by art/slice_pack2.py. Worn-proof crops (NOT shipped) for "
                      "registering hair and open-shoe sprites to the head / feet they were "
                      "painted on. proof_box = [x, y, w, h] of the crop in the worn sheet; "
                      "offset = top-left of the item sprite (art/sprites/pack2/<file>) inside "
                      "the proof crop, measured by masked RGB template matching of the sprite "
                      "against the worn sheet (the two sheets are separate generations). "
                      "registration.shift_vs_sprite_box = how far the item sits on the worn "
                      "sheet from where it sits on the item sheet (hair is matched on its top 40%, "
                      "the scalp, so the hairline sits right even where lengths were redrawn); "
                      "band_offsets = best extra shift of the top/middle/bottom third alone, "
                      "counted only if it lowers that band's error by >10% (residual "
                      "misalignment); identical_px = fraction of the sprite's opaque pixels "
                      "identical to the proof at the offset (the item sheets are mostly "
                      "cut-outs of the worn sheets; low values = redrawn); iou = overlap of the sprite with the "
                      "proof pixels classified as the item; proof_item_uncovered = fraction of "
                      "those proof pixels the sprite does not cover. Shoe pairs also list per-"
                      "part offsets.",
              "items": {}}
    for frag in frags:
        for iid, it in frag["items"].items():
            e = manifest["items"].setdefault(iid, {
                "category": it["category"], "name": NAMES[iid][0], "nameEs": NAMES[iid][1],
                "sheet": frag["sheet"], "views": {}})
            e["views"].update(it["views"])
            if iid in REDRAWN:
                e["replaces"] = f"../items/views/manifest.json#{iid}"
            if iid in SOURCE_CHOICE:
                e["sourceChoice"] = SOURCE_CHOICE[iid]
        for key, p in frag.get("proofs", {}).items():
            iid, view = key.split("/")
            proofs["items"].setdefault(iid, {})[view] = p
    for iid, item in manifest["items"].items():
        item["views"] = {v: item["views"][v] for v in VIEWS}
        item["sheet"] = item["views"]["front"]["source"]["sheet"]
        boxes = {v: item["views"][v]["source"]["box"] for v in VIEWS}
        top = min(b[1] for b in boxes.values())
        bot = max(b[1] + b[3] for b in boxes.values())
        fh = boxes["front"][3]
        item["scaleRef"] = {
            "rowTop": top, "rowBottom": bot,
            "views": {v: {"dy": b[1] - top, "bottomGap": bot - (b[1] + b[3]),
                          "heightVsFront": round(b[3] / fh, 4)} for v, b in boxes.items()}}
        if item["category"] not in manifest["categories"]:
            manifest["categories"].append(item["category"])
    for d, keep in ((ART_OUT, True), (OUT, False)):
        part = {**manifest, "categories": [c for c in manifest["categories"] if (c in ART_CATS) == keep],
                "items": {k: v for k, v in manifest["items"].items() if (v["category"] in ART_CATS) == keep}}
        d.mkdir(parents=True, exist_ok=True)
        (d / "manifest.json").write_text(json.dumps(part, indent=2, ensure_ascii=False) + "\n")
    PROOFS.mkdir(parents=True, exist_ok=True)
    (PROOFS / "manifest.json").write_text(json.dumps(proofs, indent=2) + "\n")
    return manifest, proofs


# ------------------------------------------------------------------ contact

def contact(manifest: dict, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    try:
        font = ImageFont.load_default(size=16)
    except TypeError:
        font = ImageFont.load_default()
    by_sheet = {}
    for iid, it in manifest["items"].items():
        by_sheet.setdefault(it["sheet"], []).append(iid)
    for bgname, bg in (("pink", (231, 122, 176, 255)), ("dark", (24, 22, 34, 255))):
        for sheet, ids in by_sheet.items():
            cell = 300
            rows = []
            for iid in ids:
                vs = manifest["items"][iid]["views"]
                tiles = []
                for v in VIEWS:
                    spr = Image.open(out_dir(manifest["items"][iid]["category"]) / vs[v]["file"]).convert("RGBA")
                    tiles.append((f"{iid} {v}", spr, vs[v].get("faceHole")))
                for v in VIEWS:
                    for pname, p in vs[v].get("parts", {}).items():
                        tiles.append((f"{v}-{pname}", Image.open(out_dir(manifest["items"][iid]["category"]) / p["file"]).convert("RGBA"), None))
                rows.append(tiles)
            ncols = max(len(r) for r in rows)
            img = Image.new("RGBA", (ncols * cell, len(rows) * (cell + 30)), bg)
            d = ImageDraw.Draw(img)
            for ri, tiles in enumerate(rows):
                for ci, (name, spr, hole) in enumerate(tiles):
                    cx, cy = ci * cell, ri * (cell + 30)
                    s = min((cell - 16) / spr.width, (cell - 10) / spr.height, 1.0)
                    sp = spr.resize((max(1, round(spr.width * s)), max(1, round(spr.height * s))),
                                    Image.LANCZOS) if s < 1 else spr
                    ox, oy = cx + (cell - sp.width) // 2, cy + 26
                    d.rectangle([ox - 1, oy - 1, ox + sp.width, oy + sp.height], outline=(255, 255, 255, 70))
                    img.alpha_composite(sp, (ox, oy))
                    if hole:
                        f = hole["face"]
                        d.rectangle([ox + f["x"] * s, oy + f["y"] * s, ox + (f["x"] + f["w"]) * s,
                                     oy + (f["y"] + f["h"]) * s], outline=(255, 255, 0, 255), width=2)
                    d.text((cx + 4, cy + 4), f"{name} {spr.width}x{spr.height}", fill=(255, 255, 255, 255),
                           font=font, stroke_width=2, stroke_fill=(0, 0, 0, 255))
            img.convert("RGB").save(outdir / f"{Path(sheet).stem}-{bgname}.png")


def main(argv=None):
    global REG_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="redo sheets that are up to date")
    ap.add_argument("--only", help="comma-separated sheet stems to (re)process")
    ap.add_argument("--contact", type=Path, help="write review contact sheets here")
    ap.add_argument("--verify", type=Path, help="write registration check images here")
    ap.add_argument("--report", action="store_true", help="print per-category sizes")
    args = ap.parse_args(argv)
    REG_DIR = args.verify
    check_ids()
    only = set(args.only.split(",")) if args.only else None
    frags = []
    for sheet, cat, ids in SHEETS:
        force = args.force or (only is not None and Path(sheet).stem in only)
        frags.append(process_sheet(sheet, cat, ids, force))
    manifest, _ = assemble(frags)
    if args.contact:
        contact(manifest, args.contact)
    sizes = {}
    n = 0
    for p in sorted(list(OUT.rglob("*.webp")) + list(ART_OUT.rglob("*.webp"))):
        cat = p.parent.name
        sizes[cat] = sizes.get(cat, 0) + p.stat().st_size
        n += 1
    if args.report:
        print(json.dumps({"bytes_per_category": sizes, "total": sum(sizes.values()),
                          "manifest_bytes": (OUT / "manifest.json").stat().st_size}, indent=1))
    print(f"{len(manifest['items'])} items, {n} sprites, {sum(sizes.values())} bytes", file=sys.stderr)


if __name__ == "__main__":
    main()
