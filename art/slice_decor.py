"""Slice the house-decorator furniture/decor sheets into game-ready sprites.

Usage (from the repo root):
    python3 -I art/slice_decor.py [--contact DIR] [--report]

Reads the eight 2388x1792 RGBA sheets in art/source/pack2/07-house-decorator/
(each a 4x3 grid of twelve items) and writes
    dist/assets/decor/<room>/<id>.webp      sprites (one common downscale)
    dist/assets/decor/thumbs/<id>.webp      picker thumbnails, longest side 128
    dist/assets/decor/manifest.json
With --contact DIR it also writes labeled contact sheets (over mid pink and a
light wood floor) and a procedurally drawn mock room using the manifest's
anchors and default scales. Deterministic and idempotent: re-running simply
rewrites the same files, so it is safe to run again after an interruption.

Requires Pillow (with WebP) and numpy. Helpers come from art/slice.py.

How items are found
-------------------
* Pixels with raw alpha >= SOLID_ALPHA are grouped into 8-connected
  components on a 4x max-pooled grid. In each of the twelve grid cells the
  largest component whose centroid lies in that cell is the item's "main"
  piece. Every other component (chairs around a table, a kettle beside a
  toaster, loose stars, balloon strings, a shower's little mat that hangs
  below the nominal cell line) joins the item whose main piece is nearest
  (labels grown from the mains, majority vote over the component's cells),
  so an item may cross nominal cell lines and is never clipped. Components
  that land in a different cell than their centroid suggests are reported.
* Each pixel of the sheet then belongs to the nearest item (labels grown
  from the full item masks) and to nothing farther than REACH px from that
  item, so soft glows (wall lamp, fairy and string lights) stay with their
  owner and a neighbor can never leak in.

Edge cleanup (measured on these sheets; different generator than pack 1)
------------------------------------------------------------------------
* Alpha already reaches 255 and edges are crisp: one ~1px anti-aliased ring
  (mean alpha ~34), then a sparse speckle of alpha 1-7 one pixel further out,
  and almost no haze away from items (max raw alpha 2-4 more than 12 px from
  any item on six sheets). The only wide low-alpha areas are intentional
  glows around the wall lamp, fairy lights and string-light pole.
  clean_alpha() therefore only drops alpha <= HAZE_ALPHA and rescales the
  rest so 255 stays 255; glows lose at most 5/255 at their faint tail.
* The anti-aliased ring carries a light matte color: over dark backgrounds a
  speckled pale line shows outside the dark outline of light items (bathtub,
  toilet, canopy bed). decontaminate() (radius 2, margin 20) pulls those edge
  pixels toward the nearby opaque (outline) color in proportion to their
  transparency. Pure glows are not touched (no opaque pixels nearby or not
  lighter than the bulb they surround).
* RGB under alpha 0 is zeroed.
* Downscaling works on premultiplied color (Pillow "RGBa") with Lanczos.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slice import box_sum, decontaminate, dilate, label, trim_box  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "source" / "pack2" / "07-house-decorator"
OUT = ROOT / "dist" / "assets" / "decor"

SOLID_ALPHA = 24
HAZE_ALPHA = 5
POOL = 4
REACH = 48          # px: farthest a pixel may be from its item's solid mask
PAD = 2
TARGET_MAX = 520    # longest side of the largest furniture piece after scaling
THUMB = 128
ROOM_W = 1536       # reference room width for defaultScale
PX_PER_M = 280      # 1 m in a 1536 x 1024 room (adult doll ~1.65 m ~ 460 px)
WEBP = dict(quality=92, alpha_quality=100, method=6, exact=False)

ROOMS = [
    ("furn-bedroom-a.webp", "bedroom", [
        "canopy-bed", "single-bed", "bunk-bed", "wardrobe",
        "vanity-dresser", "bedside-table", "desk", "desk-chair",
        "bookshelf", "toy-chest", "beanbag", "floor-lamp"]),
    ("furn-kitchen-a.webp", "kitchen", [
        "fridge", "stove", "sink-counter", "corner-counter",
        "wall-cabinets", "kitchen-island", "dining-table", "dining-chair",
        "bar-stool", "toaster-kettle", "fruit-bowl", "pot-rack"]),
    ("furn-living-a.webp", "living", [
        "sofa", "loveseat", "armchair", "coffee-table",
        "tv-stand", "fireplace", "tall-plant", "side-table",
        "floor-cushion", "record-player", "trinket-shelf", "standing-mirror"]),
    ("furn-bathroom-a.webp", "bathroom", [
        "bathtub", "shower", "sink-vanity", "toilet",
        "towel-rack", "laundry-basket", "bath-mat", "mirror-cabinet",
        "bottle-shelf", "rubber-duck", "potted-fern", "bath-stool"]),
    ("furn-playroom-a.webp", "playroom", [
        "dollhouse", "play-kitchen", "rocking-horse", "toy-shelf",
        "art-easel", "kids-table-set", "ball-pit", "teepee",
        "train-set", "plush-pile", "toy-piano", "building-blocks"]),
    ("furn-patio-a.webp", "patio", [
        "lounge-chair", "umbrella-table", "grill", "porch-swing",
        "kiddie-pool", "flower-planter", "string-light-pole", "garden-gnome",
        "bird-bath", "picnic-blanket", "lemonade-stand", "potted-palm"]),
    ("decor-walls-a.webp", "walls", [
        "framed-picture", "poster", "wall-clock", "curtain-window",
        "round-window", "wall-shelf", "fairy-lights", "heart-mirror",
        "pennant-banner", "hanging-plant", "wall-lamp", "star-decals"]),
    ("decor-floor-a.webp", "floor", [
        "round-rug", "rect-rug", "heart-rug", "kitten-bed",
        "puppy-bed", "fish-tank", "flower-vase", "disco-ball",
        "lava-lamp", "gift-boxes", "balloon-bunch", "potted-hibiscus"]),
]

# id: (English name, Latin American Spanish name, placement,
#      approx. real size of the sprite's longest side in metres, mirrorable)
META = {
    # bedroom
    "canopy-bed": ("Dreamy Canopy Bed", "Cama con dosel de ensueño", "floor", 2.3, True),
    "single-bed": ("Snuggly Flower Bed", "Camita florida", "floor", 2.0, True),
    "bunk-bed": ("Sleepover Bunk Beds", "Litera de pijamada", "floor", 2.0, True),
    "wardrobe": ("Rosy Wardrobe", "Ropero rosita", "floor", 2.0, True),
    "vanity-dresser": ("Glam Vanity Dresser", "Tocador glamuroso", "floor", 1.7, True),
    "bedside-table": ("Wake-Up Nightstand", "Mesita de noche despertadora", "floor", 0.7, True),
    "desk": ("Homework Desk", "Escritorio de tareas", "floor", 1.2, True),
    "desk-chair": ("Comfy Desk Chair", "Silla de escritorio cómoda", "floor", 0.95, True),
    "bookshelf": ("Storybook Shelf", "Librero de cuentos", "floor", 1.6, True),
    "toy-chest": ("Treasure Toy Chest", "Baúl de juguetes", "floor", 0.9, True),
    "beanbag": ("Squishy Beanbag", "Puf apapachador", "floor", 0.9, True),
    "floor-lamp": ("Frilly Floor Lamp", "Lámpara de pie con holanes", "floor", 1.6, True),
    # kitchen
    "fridge": ("Retro Pink Fridge", "Refri retro rosa", "floor", 1.75, False),
    "stove": ("Mint Dream Stove", "Estufa menta", "floor", 1.15, True),
    "sink-counter": ("Farmhouse Sink Counter", "Fregadero campestre", "floor", 1.35, True),
    "corner-counter": ("Cozy Corner Counter", "Barra de esquina", "floor", 1.25, True),
    "wall-cabinets": ("Teacup Wall Cabinet", "Alacena de tacitas", "wall", 1.2, True),
    "kitchen-island": ("Mint Kitchen Island", "Isla de cocina menta", "floor", 1.4, True),
    "dining-table": ("Sunday Brunch Table", "Mesa del desayuno", "floor", 1.55, True),
    "dining-chair": ("Ladder-Back Chair", "Silla de comedor floreada", "floor", 1.0, True),
    "bar-stool": ("Minty Bar Stool", "Banquito menta", "floor", 0.75, True),
    "toaster-kettle": ("Toast & Tea Set", "Tostadora y tetera", "surface", 0.5, False),
    "fruit-bowl": ("Fruity Bowl", "Frutero tropical", "surface", 0.35, True),
    "pot-rack": ("Hanging Pot Rack", "Colgador de ollas", "wall", 0.95, True),
    # living
    "sofa": ("Big Pink Sofa", "Sofá rosa grandote", "floor", 2.1, True),
    "loveseat": ("Creamy Loveseat", "Sillón de dos plazas", "floor", 1.6, True),
    "armchair": ("Sunny Armchair", "Sillón amarillito", "floor", 1.0, True),
    "coffee-table": ("Coffee Table", "Mesa de centro", "floor", 1.15, True),
    "tv-stand": ("TV & Game Night Stand", "Tele con mueble", "floor", 1.25, False),
    "fireplace": ("Cozy Fireplace", "Chimenea acogedora", "floor", 1.5, True),
    "tall-plant": ("Jungle Hibiscus Plant", "Planta tropical", "floor", 1.5, True),
    "side-table": ("Lamp Side Table", "Mesita con lámpara", "floor", 0.95, True),
    "floor-cushion": ("Tassel Floor Pouf", "Cojín de piso con borlas", "floor", 0.7, True),
    "record-player": ("Groovy Record Player", "Tocadiscos onda retro", "floor", 0.65, False),
    "trinket-shelf": ("Trinket Bookcase", "Librero de tesoritos", "floor", 1.8, True),
    "standing-mirror": ("Twirl Mirror", "Espejo de cuerpo entero", "floor", 1.65, True),
    # bathroom
    "bathtub": ("Bubble Bath Tub", "Tina de burbujas", "floor", 1.6, False),
    "shower": ("Sparkle Shower", "Ducha brillante", "floor", 2.1, False),
    "sink-vanity": ("Bathroom Sink", "Lavamanos con mueble", "floor", 1.2, False),
    "toilet": ("Toilet", "Inodoro", "floor", 0.85, True),
    "towel-rack": ("Fluffy Towel Rack", "Toallero esponjoso", "floor", 1.0, True),
    "laundry-basket": ("Laundry Basket", "Canasta de ropa", "floor", 0.6, True),
    "bath-mat": ("Flower Bath Mat", "Tapete de baño floreado", "rug", 0.9, True),
    "mirror-cabinet": ("Mirror Cabinet", "Botiquín con espejo", "wall", 0.75, True),
    "bottle-shelf": ("Bubbles & Bottles Shelf", "Repisa de jabones", "floor", 0.6, True),
    "rubber-duck": ("Giant Rubber Ducky", "Patito de hule", "surface", 0.3, True),
    "potted-fern": ("Fancy Fern", "Helecho en maceta", "floor", 0.8, True),
    "bath-stool": ("Pastel Stool", "Banquito pastel", "floor", 0.5, True),
    # playroom
    "dollhouse": ("Dream Dollhouse", "Casita de muñecas", "floor", 1.0, True),
    "play-kitchen": ("Little Chef Kitchen", "Cocinita de juguete", "floor", 1.1, True),
    "rocking-horse": ("Rocking Pony", "Caballito mecedor", "floor", 0.95, True),
    "toy-shelf": ("Toy Cubby Shelf", "Repisa de juguetes", "floor", 1.15, True),
    "art-easel": ("Art Easel", "Caballete de pintura", "floor", 1.2, True),
    "kids-table-set": ("Tea Party Table", "Mesita de té", "floor", 1.15, True),
    "ball-pit": ("Rainbow Ball Pit", "Piscina de pelotas", "floor", 1.4, True),
    "teepee": ("Hideaway Teepee", "Tipi escondite", "floor", 1.9, True),
    "train-set": ("Choo-Choo Train Set", "Tren de madera", "rug", 1.2, True),
    "plush-pile": ("Plushie Pile", "Montón de peluches", "floor", 0.9, True),
    "toy-piano": ("Little Pink Piano", "Pianito rosa", "floor", 1.0, False),
    "building-blocks": ("Building Blocks", "Bloques de construcción", "surface", 0.6, True),
    # patio
    "lounge-chair": ("Sunbathing Lounger", "Camastro asoleador", "floor", 1.9, True),
    "umbrella-table": ("Umbrella Patio Set", "Mesa con sombrilla", "floor", 2.2, True),
    "grill": ("BBQ Grill", "Asador", "floor", 1.2, True),
    "porch-swing": ("Striped Porch Swing", "Columpio de jardín", "floor", 2.0, True),
    "kiddie-pool": ("Splash Pool", "Alberquita inflable", "floor", 1.5, True),
    "flower-planter": ("Blooming Planter", "Jardinera florida", "floor", 1.0, True),
    "string-light-pole": ("Twinkle Light Post", "Poste de lucecitas", "floor", 2.2, True),
    "garden-gnome": ("Garden Gnome", "Gnomo de jardín", "floor", 0.5, True),
    "bird-bath": ("Birdie Bath", "Bebedero de pajaritos", "floor", 1.0, True),
    "picnic-blanket": ("Picnic Blanket", "Mantel de pícnic", "rug", 1.7, True),
    "lemonade-stand": ("Lemonade Stand", "Puesto de limonada", "floor", 1.9, True),
    "potted-palm": ("Potted Palm", "Palmerita en maceta", "floor", 1.3, True),
    # walls
    "framed-picture": ("Beach Day Painting", "Cuadro de playa", "wall", 0.9, False),
    "poster": ("Hibiscus Poster", "Póster de hibiscos", "wall", 0.75, True),
    "wall-clock": ("Flower Clock", "Reloj de flor", "wall", 0.5, False),
    "curtain-window": ("Curtained Window", "Ventana con cortinas", "wall", 1.4, True),
    "round-window": ("Porthole Window", "Ventana redonda", "wall", 0.8, True),
    "wall-shelf": ("Plant Shelf", "Repisa de plantitas", "wall", 0.95, True),
    "fairy-lights": ("Fairy Lights", "Guirnalda de lucecitas", "wall", 1.4, True),
    "heart-mirror": ("Heart Mirror", "Espejo de corazón", "wall", 0.7, True),
    "pennant-banner": ("Party Pennants", "Banderines de fiesta", "wall", 1.4, True),
    "hanging-plant": ("Macramé Hanging Plant", "Maceta colgante de macramé", "wall", 0.95, True),
    "wall-lamp": ("Lantern Sconce", "Farolito de pared", "wall", 0.55, False),
    "star-decals": ("Star Stickers", "Estrellitas de pared", "wall", 0.9, True),
    # floor decor
    "round-rug": ("Mandala Rug", "Tapete mandala", "rug", 2.0, True),
    "rect-rug": ("Flower Runner Rug", "Tapete de flores", "rug", 2.2, True),
    "heart-rug": ("Fluffy Heart Rug", "Tapete de corazón peludito", "rug", 1.4, True),
    "kitten-bed": ("Kitty Nap Bed", "Camita con gatito", "floor", 0.7, True),
    "puppy-bed": ("Puppy Nap Basket", "Canasta con perrito", "floor", 0.8, True),
    "fish-tank": ("Fishy Aquarium", "Pecera con mueble", "floor", 1.1, True),
    "flower-vase": ("Tropical Bouquet", "Florero tropical", "floor", 1.0, True),
    "disco-ball": ("Disco Ball", "Bola disco", "surface", 0.45, True),
    "lava-lamp": ("Lava Lamp", "Lámpara de lava", "surface", 0.45, True),
    "gift-boxes": ("Surprise Gifts", "Regalitos sorpresa", "floor", 0.6, True),
    "balloon-bunch": ("Balloon Bunch", "Racimo de globos", "floor", 1.6, True),
    "potted-hibiscus": ("Potted Hibiscus", "Hibisco en maceta", "floor", 0.8, True),
}

# Wall items that hang from a point at their top (anchor = top centre)
HANG_TOP = {"pot-rack", "hanging-plant", "poster", "fairy-lights", "pennant-banner"}


# ----------------------------------------------------------------- helpers

def clean_alpha(a: np.ndarray) -> np.ndarray:
    a = a.astype(np.float32)
    out = (a - HAZE_ALPHA) * (255.0 / (255 - HAZE_ALPHA))
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def grow_labels(lab: np.ndarray, limit: int | None = None) -> np.ndarray:
    """Grow positive labels into zero cells, one 8-neighbour ring per step
    (chessboard Voronoi). Ties resolve to the lowest label. `limit` caps the
    number of steps."""
    lab = lab.copy()
    steps = 0
    while (lab == 0).any() and (limit is None or steps < limit):
        p = np.pad(lab, 1)
        h, w = lab.shape
        best = np.zeros_like(lab)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if dy == dx == 0:
                    continue
                nb = p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]
                take = (nb > 0) & ((best == 0) | (nb < best))
                best = np.where(take, nb, best)
        new = (lab == 0) & (best > 0)
        if not new.any():
            break
        lab[new] = best[new]
        steps += 1
    return lab


def pool_up(m: np.ndarray, H: int, W: int) -> np.ndarray:
    full = np.repeat(np.repeat(m, POOL, 0), POOL, 1)[:H, :W]
    if full.shape != (H, W):
        full = np.pad(full, ((0, H - full.shape[0]), (0, W - full.shape[1])), mode="edge")
    return full


def resize_rgba(img: Image.Image, size) -> Image.Image:
    return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def save_webp(img: Image.Image, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    a = np.array(img)
    a[a[..., 3] == 0] = 0
    Image.fromarray(a, "RGBA").save(path, "WEBP", **WEBP)
    return path.stat().st_size


# ------------------------------------------------------------------ slicing

def slice_sheet(fname: str, room: str, ids: list[str], report: dict):
    arr = np.array(Image.open(SRC / fname).convert("RGBA"))
    H, W = arr.shape[:2]
    raw_a = arr[..., 3]
    alpha = clean_alpha(raw_a)
    rgb, nfix = decontaminate(arr[..., :3], alpha, r=2, margin=20.0)
    rgb[alpha == 0] = 0
    rep = report.setdefault("sheets", {}).setdefault(fname, {})
    rep["decontaminated_px"] = nfix
    rep["haze_px_removed"] = int(((raw_a > 0) & (alpha == 0)).sum())

    solid = raw_a >= SOLID_ALPHA
    ph, pw = (H + POOL - 1) // POOL, (W + POOL - 1) // POOL
    padded = np.zeros((ph * POOL, pw * POOL), bool)
    padded[:H, :W] = solid
    pooled = padded.reshape(ph, POOL, pw, POOL).any(axis=(1, 3))
    lab, n = label(pooled)
    sizes = np.bincount(lab.ravel(), minlength=n + 1)
    cents = {}
    for k in range(1, n + 1):
        ys, xs = np.nonzero(lab == k)
        cents[k] = (ys.mean() * POOL, xs.mean() * POOL)

    def cell_of(cy, cx):
        return min(int(cy / (H / 3)), 2) * 4 + min(int(cx / (W / 4)), 3)

    mains = {}
    for k in range(1, n + 1):
        c = cell_of(*cents[k])
        if c not in mains or sizes[k] > sizes[mains[c]]:
            mains[c] = k
    if len(mains) != 12:
        raise SystemExit(f"{fname}: found main pieces in only {sorted(mains)} cells")

    seed = np.zeros_like(lab)
    for c, k in mains.items():
        seed[lab == k] = c + 1
    vor = grow_labels(seed)
    members = {c: [k] for c, k in mains.items()}
    main_set = set(mains.values())
    rep["moved_components"] = []
    rep["tiny_components"] = 0
    for k in range(1, n + 1):
        if k in main_set:
            continue
        votes = np.bincount(vor[lab == k], minlength=13)[1:]
        c = int(np.argmax(votes))
        members[c].append(k)
        if sizes[k] < 3:
            rep["tiny_components"] += 1
        cc = cell_of(*cents[k])
        if cc != c:
            rep["moved_components"].append(
                dict(px=int(sizes[k]) * POOL * POOL, centroid_cell=ids[cc], joined=ids[c]))

    # full-resolution ownership: nearest item, within REACH px of its solid
    seed2 = np.zeros_like(lab)
    for c, ks in members.items():
        seed2[np.isin(lab, ks)] = c + 1
    vor2 = grow_labels(seed2)
    owner = pool_up(vor2, H, W)

    items = []
    for c in range(12):
        iid = ids[c]
        own = pool_up(np.isin(lab, members[c]), H, W) & solid
        near = dilate(own, REACH)
        region = (owner == c + 1) & near
        a_item = np.where(region, alpha, 0).astype(np.uint8)
        lost = (owner == c + 1) & ~near & (alpha > 0)
        if lost.any():
            rep.setdefault("outside_reach", {})[iid] = dict(
                px=int(lost.sum()), max_alpha=int(alpha[lost].max()))
        x0, y0, x1, y1 = trim_box(a_item)
        x0, y0, x1, y1 = x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD
        if x0 < 0 or y0 < 0 or x1 > W or y1 > H:
            report.setdefault("touches_edge", []).append(iid)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        sa = a_item[y0:y1, x0:x1]
        srgb = np.where(sa[..., None] > 0, rgb[y0:y1, x0:x1], 0).astype(np.uint8)
        spr = Image.fromarray(np.dstack([srgb, sa]), "RGBA")
        # semi-transparent pixels away from the silhouette edge (glass, glow)
        semi = (sa >= 24) & (sa <= 230)
        edge = dilate(sa < 24, 3)
        items.append(dict(id=iid, room=room, sprite=spr, sheet=fname,
                          box=[int(x0), int(y0), int(x1 - x0), int(y1 - y0)],
                          pieces=len(members[c]),
                          interior_semi=int((semi & ~edge).sum()),
                          glow_px=int(((sa > 0) & (sa < 24)).sum())))
    return items


# ----------------------------------------------------------------- metadata

def geometry(spr: Image.Image, placement: str, iid: str):
    a = np.array(spr)[..., 3]
    h, w = a.shape
    sol = a >= 128
    x0, y0, x1, y1 = trim_box(sol)
    if placement in ("floor", "surface"):
        band = sol[max(y0, y1 - max(3, int(0.12 * (y1 - y0)))):y1]
        cols = np.nonzero(band.any(0))[0]
        fx0, fx1 = int(cols[0]), int(cols[-1]) + 1
        anchor = [round((fx0 + fx1) / 2 / w, 4), round(y1 / h, 4)]
        foot = [fx0, fx1]
    elif placement == "rug":
        anchor = [round((x0 + x1) / 2 / w, 4), round((y0 + y1) / 2 / h, 4)]
        foot = [x0, x1]
    else:  # wall
        if iid in HANG_TOP:
            anchor = [round((x0 + x1) / 2 / w, 4), round(y0 / h, 4)]
        else:
            anchor = [round((x0 + x1) / 2 / w, 4), round((y0 + y1) / 2 / h, 4)]
        foot = [x0, x1]
    return anchor, foot


# ------------------------------------------------------------------- build

def build(contact_dir: Path | None, report: dict):
    all_items = []
    for fname, room, ids in ROOMS:
        all_items += slice_sheet(fname, room, ids, report)
    ids = [it["id"] for it in all_items]
    assert len(ids) == len(set(ids)) == 96 and set(ids) == set(META), "id table mismatch"

    furn = [it for it in all_items if META[it["id"]][2] in ("floor",)
            and it["room"] not in ("walls", "floor")]
    biggest = max(furn, key=lambda it: max(it["sprite"].size))
    factor = TARGET_MAX / max(biggest["sprite"].size)
    factor = min(factor, 1.0)
    report["scale_factor"] = round(factor, 5)
    report["largest_piece"] = dict(id=biggest["id"], source_size=list(biggest["sprite"].size))

    manifest = {
        "version": 1,
        "note": ("Generated by art/slice_decor.py. Paths are relative to this file. "
                 "All sprites share one downscale factor (sourceScale) so sizes are "
                 "comparable within a sheet. anchor = normalized point in the sprite "
                 "that sits on the room position: floor/surface = middle of the "
                 "lowest solid band (where it touches the floor), rug = centre, "
                 "wall = centre or, for hanging items, top centre. footprint = "
                 "[x0, x1] of that contact band in sprite px (use its width for "
                 "depth sorting; rugs draw under everything). defaultScale = "
                 f"multiplier for a {ROOM_W}x1024 room at {PX_PER_M} px per metre."),
        "roomWidth": ROOM_W, "pxPerMetre": PX_PER_M,
        "sourceScale": round(factor, 5),
        "items": [],
    }
    totals = {"sprites": 0, "thumbs": 0}
    for it in all_items:
        iid, room = it["id"], it["room"]
        en, es, placement, size_m, mirror = META[iid]
        spr = it["sprite"]
        if factor < 1:
            spr = resize_rgba(spr, (max(1, round(spr.width * factor)),
                                    max(1, round(spr.height * factor))))
        it["out"] = spr
        rel = f"{room}/{iid}.webp"
        totals["sprites"] += save_webp(spr, OUT / rel)
        t = THUMB / max(spr.size)
        th = resize_rgba(spr, (max(1, round(spr.width * t)), max(1, round(spr.height * t))))
        trel = f"thumbs/{iid}.webp"
        totals["thumbs"] += save_webp(th, OUT / trel)
        anchor, foot = geometry(spr, placement, iid)
        scale = round(size_m * PX_PER_M / max(spr.size), 3)
        it["meta"] = dict(anchor=anchor, scale=scale, placement=placement, foot=foot)
        manifest["items"].append({
            "id": iid, "room": room,
            "category": "decor" if room in ("walls", "floor") else "furniture",
            "file": rel, "thumb": trel, "width": spr.width, "height": spr.height,
            "name": {"en": en, "es": es},
            "placement": placement, "anchor": anchor,
            "defaultScale": scale, "mirror": mirror,
            "footprint": {"x0": foot[0], "x1": foot[1], "width": foot[1] - foot[0]},
            "source": {"sheet": f"art/source/pack2/07-house-decorator/{it['sheet']}",
                       "box": it["box"]},
        })
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
    report["bytes"] = totals
    report["items"] = {it["id"]: dict(pieces=it["pieces"], size=list(it["out"].size),
                                      interior_semi=it["interior_semi"], glow_px=it["glow_px"])
                       for it in all_items}
    if contact_dir:
        contact(all_items, contact_dir)
        mock_room(all_items, contact_dir / "mock-room.png")
    return manifest


# ------------------------------------------------------------------ review

def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def contact(items, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    font = _font(16)
    rooms = [r for _, r, _ in ROOMS]
    cell = 300
    for bgname, bg in (("pink", (226, 128, 172)), ("wood", (222, 184, 135))):
        for pair in range(0, len(rooms), 2):
            sheet = Image.new("RGBA", (4 * cell, 6 * cell), bg + (255,))
            d = ImageDraw.Draw(sheet)
            for ri, room in enumerate(rooms[pair:pair + 2]):
                its = [it for it in items if it["room"] == room]
                for i, it in enumerate(its):
                    spr = it["out"]
                    cx, cy = (i % 4) * cell, (ri * 3 + i // 4) * cell
                    s = min((cell - 30) / spr.width, (cell - 30) / spr.height, 1.0)
                    sp = resize_rgba(spr, (max(1, round(spr.width * s)), max(1, round(spr.height * s))))
                    ox, oy = cx + (cell - sp.width) // 2, cy + 24
                    d.rectangle([ox - 1, oy - 1, ox + sp.width, oy + sp.height],
                                outline=(255, 255, 255, 110))
                    sheet.alpha_composite(sp, (ox, oy))
                    d.text((cx + 4, cy + 3), f"{room}/{it['id']} {spr.width}x{spr.height}",
                           fill=(255, 255, 255, 255), font=font, stroke_width=2,
                           stroke_fill=(0, 0, 0, 255))
            sheet.convert("RGB").save(outdir / f"{rooms[pair]}-{rooms[pair + 1]}-{bgname}.png")


def mock_room(items, path: Path):
    """A plain two-tone room with a dozen items placed by anchor and scale."""
    W, Hh = ROOM_W, 1024
    wall_y = 600
    img = Image.new("RGBA", (W, Hh), (246, 214, 222, 255))
    d = ImageDraw.Draw(img)
    for x in range(0, W, 64):  # faint wallpaper stripes
        d.rectangle([x, 0, x + 31, wall_y], fill=(250, 224, 230, 255))
    d.rectangle([0, wall_y, W, Hh], fill=(214, 172, 124, 255))
    for y in range(wall_y + 40, Hh, 70):
        d.line([(0, y), (W, y)], fill=(196, 152, 106, 255), width=2)
    d.rectangle([0, wall_y - 14, W, wall_y], fill=(255, 250, 244, 255))
    by = {it["id"]: it for it in items}
    # (id, x, y) in room px: floor = foot position, wall = anchor, rug = centre
    plan = [("curtain-window", 470, 250), ("framed-picture", 1000, 230),
            ("fairy-lights", 760, 70), ("wall-clock", 1290, 200),
            ("round-rug", 760, 850), ("canopy-bed", 250, 800),
            ("bedside-table", 520, 700), ("sofa", 1040, 760),
            ("floor-lamp", 1320, 680), ("bookshelf", 1440, 720),
            ("armchair", 620, 980), ("beanbag", 1150, 980),
            ("kitten-bed", 860, 940), ("lava-lamp", 525, 600 + 10),
            ("potted-hibiscus", 85, 990)]
    order = sorted(plan, key=lambda p: (by[p[0]]["meta"]["placement"] != "wall",
                                        by[p[0]]["meta"]["placement"] != "rug", p[2]))
    surfaces = {"lava-lamp": "bedside-table"}
    placed = {}
    for iid, x, y in order:
        it = by[iid]
        m = it["meta"]
        spr = it["out"]
        sw, sh = round(spr.width * m["scale"]), round(spr.height * m["scale"])
        sp = resize_rgba(spr, (sw, sh))
        if iid in surfaces:  # sit on the top of the item below
            bx, by_, bw, bh = placed[surfaces[iid]]
            y = by_ + int(bh * 0.13)
            x = bx + bw // 2
        ox, oy = round(x - m["anchor"][0] * sw), round(y - m["anchor"][1] * sh)
        img.alpha_composite(sp, (ox, oy))
        placed[iid] = (ox, oy, sw, sh)
    img.convert("RGB").save(path)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--contact", type=Path, help="write review contact sheets and mock room here")
    ap.add_argument("--report", action="store_true", help="print a JSON report")
    args = ap.parse_args(argv)
    report: dict = {}
    manifest = build(args.contact, report)
    if args.report:
        print(json.dumps(report, indent=1, default=str))
    print(f"{len(manifest['items'])} items, sprites {report['bytes']['sprites']} B, "
          f"thumbs {report['bytes']['thumbs']} B, factor {report['scale_factor']}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
