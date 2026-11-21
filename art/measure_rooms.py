"""Measure the painted Dream House backdrops and write their geometry into dist/decor-data.js.

Usage (from the repo root, after art/build_rooms.py):
    python3 -I art/measure_rooms.py [--overlay DIR] [--dry-run]

Every number the decorator needs to stand furniture in a painted room comes from here:
the floor quadrilateral, the vanishing point, the scale at the back wall, the wall zones
for wall decor, the window/door openings, the skirting and chair-rail lines, the floor
areas Surprise me keeps clear (in front of doors) and the shadow direction. They are
written between the markers `BEGIN generated backdrops` / `END generated backdrops` in
dist/decor-data.js (never edit that block by hand: change HINTS below and re-run).

How it measures (on the 1536 x 1152 backdrop, i.e. in room pixels)
------------------------------------------------------------------
HINTS holds rough positions read by eye off a 50 px grid (art/build_rooms.py --grid).
The script then refines them on the picture itself:
  * the back floor line (where the skirting meets the floor): the row with the strongest
    vertical brightness change near the hint, averaged over the plain wall on both sides
    of any window or door;
  * the two back corners: the column with the strongest horizontal change near the hint,
    averaged over the wainscot/skirting height just above the floor;
  * each side floor line (where a side wall's skirting meets the floor): edge points found
    row by row along the hinted direction (gradient across the line), then a line through
    the back corner fitted to them (median slope, outliers dropped);
  * the vanishing point is where the two side lines meet; its height is the horizon.
The hints that cannot be found reliably by edges (window and door rectangles, chair rails,
the patios' balustrade lines, wall zones on the garden walls) are used as read, and the
overlay previews (--overlay) are how they were checked and corrected.

Scale: the furniture manifest's defaultScale assumes 280 px per metre. A room's scale at
the back wall is pxPerMetre / 280 with pxPerMetre = the back wall's width in px / its width in
metres (BACK_WALL_M: 6.6 m indoors, 7.5 m on the terraces). The paintings are wide-angle, so the
yardsticks in them (a door's height, a side door carried back through the perspective, the
ceiling, the patios' central arch) are drawn tall: sized by them, furniture crowded every room.
They still bound the result: the scale is kept within 42 to 72 % of the yardstick's, and the
door heights it implies are printed as a check (the overlay's 1.8 m figure stands well under
every door).
Nearer the viewer pieces grow with the floor: scale(y) = scale * (y - horizon) / (backY - horizon).

Requires Pillow and numpy. Deterministic.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ROOMS_DIR = ROOT / "dist" / "assets" / "decor" / "rooms"
DATA = ROOT / "dist" / "decor-data.js"
W, H = 1536, 1152
PX_PER_M = 280
BACK_WALL_M = {"indoor": 6.6, "patio": 7.5}  # the back wall's width in metres (see measure())

# Read by eye on the 50 px grid of each backdrop (room pixels). Keys:
#   back: [y, xLeft, xRight]   floor line at the back wall and the two back corners (refined)
#   ceil: y of the ceiling line (bottom of the crown moulding) on the back wall
#   top/rail: the wall band for wall decor: below the crown/frieze, above the chair rail or tile cap
#   skirt: skirting height in px at the back wall
#   open: openings on the back wall [x0, y0, x1, y1, kind] (window | door | arch | awning)
#   side: a door in the left side wall: [x of its far jamb, y of its sill there, x near jamb, y there, top y]
#   yard: the yardstick: ['door', topY, m] (door at the back wall, bottom = floor line),
#         ['side'] (the side door, 2.05 m), ['ceil', m], ['arch', topY, m]
#   lines: patios only: the side floor lines as two points each [[x,y],[x,y]] (balustrade bases)
#   front: y of the front floor edge when the floor does not run to the bottom of the picture
#   zones: patios only: wall zones [x0, y0, x1, y1] or [x0, y0, x1, y1, 'hang'] (only hanging pieces)
#   vx, vy: where to look for the vanishing point when the edges alone mislead (floor joints)
#   light: which way contact shadows lean (+ right, - left), the sun in the painting
HINTS: dict[str, dict] = {
    "bedroom-1": dict(back=[940, 250, 1285], ceil=214, top=232, rail=698, skirt=36,
                      open=[[538, 262, 1002, 778, "window"]], yard=["ceil", 2.8], light=.05),
    "bedroom-2": dict(back=[905, 300, 1235], ceil=238, top=255, rail=695, skirt=34,
                      open=[[533, 266, 1002, 905, "door"]], yard=["door", 268, 2.4], light=-.04),
    "bedroom-3": dict(back=[900, 297, 1247], ceil=192, top=262, rail=612, skirt=48,
                      open=[[468, 270, 1058, 790, "window"]], yard=["ceil", 2.8], light=-.05),
    "kitchen-1": dict(back=[898, 297, 1245], ceil=246, top=262, rail=668, skirt=30,
                      open=[[546, 270, 992, 752, "window"]], side=[250, 945, 140, 1030, 282],
                      yard=["side"], light=.05),
    "kitchen-2": dict(back=[918, 250, 1280], ceil=198, top=278, rail=622, skirt=42,
                      open=[[430, 274, 1102, 680, "window"]], yard=["ceil", 2.8], light=.0),
    "kitchen-3": dict(back=[942, 230, 1300], ceil=208, top=222, rail=688, skirt=44,
                      open=[[497, 236, 1040, 796, "window"]], yard=["ceil", 2.8], light=-.04),
    "living-1": dict(back=[858, 283, 1250], ceil=246, top=262, rail=662, skirt=36,
                     open=[[488, 276, 1047, 858, "door"]], yard=["door", 418, 2.1], light=-.05),
    "living-2": dict(back=[918, 275, 1255], ceil=248, top=262, rail=700, skirt=40,
                     open=[[428, 268, 1106, 918, "door"]], yard=["door", 430, 2.1], light=.05),
    "living-3": dict(back=[898, 300, 1240], ceil=256, top=325, rail=690, skirt=40,
                     open=[[444, 276, 1094, 898, "door"]], yard=["door", 440, 2.1], light=-.05),
    "bathroom-1": dict(back=[905, 280, 1252], ceil=220, top=236, rail=602, skirt=36,
                       open=[[568, 236, 968, 732, "window"]], side=[215, 965, 105, 1052, 300],
                       yard=["side"], light=.05),
    "bathroom-2": dict(back=[890, 305, 1228], ceil=237, top=252, rail=602, skirt=36,
                       open=[[464, 284, 1066, 720, "window"]], side=[230, 968, 100, 1060, 262],
                       yard=["side"], light=-.03),
    "bathroom-3": dict(back=[925, 265, 1270], ceil=210, top=310, rail=612, skirt=34,
                       open=[[553, 226, 985, 768, "window"]], side=[210, 985, 100, 1058, 300], vy=530,
                       yard=["side"], light=.0),
    "playroom-1": dict(back=[848, 350, 1185], ceil=196, top=282, rail=606, skirt=34,
                       open=[[534, 248, 1000, 740, "window"]], side=[290, 905, 165, 995, 222],
                       yard=["side"], light=.04),
    "playroom-2": dict(back=[870, 348, 1195], ceil=255, top=330, rail=650, skirt=34,
                       open=[[496, 340, 1042, 738, "window"]], side=[275, 930, 165, 1010, 275],
                       yard=["side"], light=.0),
    "playroom-3": dict(back=[852, 330, 1200], ceil=200, top=282, rail=620, skirt=36,
                       open=[[526, 255, 1010, 748, "window"]], side=[265, 920, 125, 1000, 258],
                       yard=["side"], light=-.03),
    "patio-1": dict(back=[828, 250, 1290], lines=[[[250, 828], [0, 945]], [[1290, 828], [1536, 945]]],
                    zones=[[352, 300, 872, 600], [1108, 300, 1190, 600], [250, 222, 1290, 300, "hang"]],
                    open=[[870, 330, 1110, 828, "arch"]], yard=["arch", 335, 2.6], light=-.06),
    "patio-2": dict(back=[795, 250, 1290], lines=[[[250, 800], [0, 892]], [[1290, 800], [1536, 892]]], front=955,
                    zones=[[280, 300, 590, 640], [950, 300, 1258, 640], [250, 232, 1290, 300, "hang"]],
                    open=[[392, 348, 508, 612, "window"], [1032, 348, 1148, 612, "window"], [590, 296, 952, 795, "arch"],
                          [528, 184, 1008, 292, "awning"]],
                    yard=["arch", 300, 2.6], light=.05),
    "patio-3": dict(back=[798, 330, 1215], lines=[[[330, 800], [0, 935]], [[1215, 800], [1536, 945]]],
                    zones=[[588, 470, 646, 770], [890, 470, 954, 770], [342, 470, 400, 770], [1142, 470, 1200, 770],
                           [345, 262, 1200, 345, "hang"]],
                    open=[[400, 345, 590, 798, "window"], [646, 330, 890, 798, "arch"], [954, 345, 1142, 798, "window"]],
                    yard=["arch", 345, 2.6], light=.05),
}
ORDER = [f"{r}-{n}" for r in ["bedroom", "kitchen", "living", "bathroom", "playroom", "patio"] for n in (1, 2, 3)]


def gray(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("L")).astype(float)


def refine_back_y(g: np.ndarray, y: int, xl: int, xr: int, opens) -> int:
    """Row of the strongest brightness change near y over plain back wall."""
    cols = np.zeros(W, bool)
    cols[xl + 15:xr - 15] = True
    for o in opens:
        cols[max(0, o[0] - 10):o[2] + 10] = False
    gy = np.abs(g[2:, :] - g[:-2, :])[:, cols].mean(1)  # gy[i] ~ edge at row i+1
    lo, hi = y - 22, y + 22
    i = int(np.argmax(gy[lo - 1:hi - 1])) + lo
    return i


def refine_corner_x(g: np.ndarray, x: int, y: int) -> int:
    gx = np.abs(g[:, 2:] - g[:, :-2])[y - 120:y - 8].mean(0)
    lo, hi = x - 8, x + 8
    return int(np.argmax(gx[lo - 1:hi - 1])) + lo


def edge_strength(g: np.ndarray) -> np.ndarray:
    gm = np.hypot(np.abs(g[1:-1, 2:] - g[1:-1, :-2]), np.abs(g[2:, 1:-1] - g[:-2, 1:-1]))
    return np.pad(gm, 1)


def line_score(gm: np.ndarray, corner, vx: float, vy: float, front_y: int):
    """Mean edge strength along the line from a back corner away from the vanishing point."""
    cx, cy = corner
    ys = np.arange(cy + 8, min(front_y, H) - 4, 2)
    xs = np.round(cx + (cx - vx) / (cy - vy) * (ys - cy)).astype(int)
    ok = (xs > 2) & (xs < W - 3)
    if ok.sum() < 20:
        return 0.0, []
    return float(gm[ys[ok], xs[ok]].mean()), list(zip(xs[ok][::6].tolist(), ys[ok][::6].tolist()))


def find_vp(g: np.ndarray, left, right, front_y: int, vx_hint=None, vy_hint=None):
    """The vanishing point: the point above the back wall from which the two lines through the
    back corners run along the strongest edges (the side walls' skirting meeting the floor).
    In one-point perspective both side floor lines meet there, so they are searched together
    (a two-parameter Hough transform), coarse to fine. The paintings are near-symmetric, so the
    point is looked for within 30 px of the middle of the back wall (or of a hinted x): without
    that prior a floor joint or the top of a skirting board can win on one side."""
    gm = edge_strength(g)
    mid = (left[0] + right[0]) / 2 if vx_hint is None else vx_hint
    yb = left[1]
    best = (-1.0, mid, yb - 400)
    ys = (yb - 900, yb - 140) if vy_hint is None else (vy_hint - 40, vy_hint + 40)
    for step, box in [(6, (mid - 30, mid + 30, *ys)), (2, None), (.5, None)]:
        if box:
            x0, x1, y0, y1 = box
        else:
            _, bx, by = best
            x0, x1, y0, y1 = bx - 4 * step, bx + 4 * step, by - 4 * step, by + 4 * step
        for vx in np.arange(x0, x1 + 1e-6, step):
            for vy in np.arange(y0, y1 + 1e-6, step):
                a, _ = line_score(gm, left, vx, vy, front_y)
                b, _ = line_score(gm, right, vx, vy, front_y)
                if a + b > best[0]:
                    best = (a + b, vx, vy)
    _, vx, vy = best
    pts = line_score(gm, left, vx, vy, front_y)[1] + line_score(gm, right, vx, vy, front_y)[1]
    return vx, vy, pts


def wall_colour(img: Image.Image, h: dict, yb: int, xl: int, xr: int) -> str:
    a = np.asarray(img.convert("RGB")).astype(float)
    if "zones" in h:
        z = h["zones"][0]
        reg = a[z[1]:z[3], z[0]:z[2]]
    else:
        top = h["top"] + 20
        reg = a[top:h["rail"] - 10, xl + 10:xl + 140]
    c = np.median(reg.reshape(-1, 3), 0)
    return "#%02x%02x%02x" % tuple(int(v) for v in c)


def measure(name: str, img: Image.Image) -> tuple[dict, dict]:
    h = HINTS[name]
    g = gray(img)
    patio = "lines" in h
    yb, xl, xr = h["back"]
    opens = h.get("open", [])
    dbg = {}
    if not patio:
        yb = refine_back_y(g, yb, xl, xr, opens)
        xl = refine_corner_x(g, xl, yb)
        xr = refine_corner_x(g, xr, yb)
        front = h.get("front", H)
        vx, vy, dbg["pts"] = find_vp(g, (xl, yb), (xr, yb), front, h.get("vx"), h.get("vy"))
        sl, sr = (xl - vx) / (yb - vy), (xr - vx) / (yb - vy)
    else:
        (a0, a1), (b0, b1) = h["lines"]
        sl = (a1[0] - a0[0]) / (a1[1] - a0[1])
        sr = (b1[0] - b0[0]) / (b1[1] - b0[1])
        xl = round(a0[0] + sl * (yb - a0[1]))
        xr = round(b0[0] + sr * (yb - b0[1]))
        front = h.get("front", H)
    # vanishing point: where x = xl + sl*(y-yb) meets x = xr + sr*(y-yb)
    d = (xr - xl) / (sl - sr)  # y - yb at the meeting point (negative: above)
    vy = yb + d
    vx = xl + sl * d
    fl = (xl + sl * (front - yb), front)
    fr = (xr + sr * (front - yb), front)
    # yardstick -> pixels per metre at the back wall
    y = h["yard"]
    if y[0] == "door" or y[0] == "arch":
        ppm = (yb - y[1]) / y[2]
    elif y[0] == "ceil":
        ppm = (yb - h["ceil"]) / y[1]
    else:  # side door: its height where it stands, carried back through the perspective
        s = h["side"]
        bx, by = (s[0] + s[2]) / 2, (s[1] + s[3]) / 2
        top = s[4]
        ppm_there = (by - top) / 2.05
        ppm = ppm_there * (yb - vy) / (by - vy)
    # The paintings are wide-angle: their doors and ceilings are drawn tall for the room's width, and
    # furniture sized by them crowds the room. The scale comes from the back wall's width instead
    # (BACK_WALL_M: 6.6 m indoors, 7.5 m for the open terraces), and the door yardstick is kept as a
    # check: the door heights this implies are printed.
    width_m = BACK_WALL_M["patio" if patio else "indoor"]
    # ...kept within 42 to 72 % of the yardstick's scale, so neither measure runs away
    scale = min(max((xr - xl) / width_m / PX_PER_M, .42 * ppm / PX_PER_M), .72 * ppm / PX_PER_M)
    dbg["yard_m"] = None
    if y[0] in ("door", "arch"):
        dbg["yard_m"] = (yb - y[1]) / (scale * PX_PER_M)
    elif y[0] == "side":
        dbg["yard_m"] = 2.05 * ppm / (scale * PX_PER_M)
    dbg["yard_scale"] = ppm / PX_PER_M
    # wall zones and keep-clear floor areas
    if patio:
        zones = [z[:4] + ([z[4]] if len(z) > 4 else []) for z in h["zones"]]
    else:
        zones = [[xl + 12, h["top"], xr - 12, h["rail"]]]
    clear = []
    for o in opens:
        if o[4] in ("door", "arch") and o[3] >= yb - 4:
            # the floor in front of a doorway at the back wall, a third of the way forward: a walkway
            # at least 1.6 m wide through the middle of the (wide, French) doors; furniture may
            # stand in front of their outer leaves and casing
            k = max(36, min(.27 * (o[2] - o[0]), (o[2] - o[0] - 1.6 * scale * PX_PER_M) / 2))
            clear.append([round(o[0] + k), yb, round(o[2] - k), round(yb + (front - yb) * .38)])
    if "side" in h:
        s = h["side"]
        y0, y1 = min(s[1], s[3]) - 10, max(s[1], s[3]) + 30
        clear.append([0, y0, round(max(s[0], s[2]) + 150), y1])
    geo = dict(
        floor=[[xl, yb], [xr, yb], [round(fr[0]), front], [round(fl[0]), front]],
        vp=[round(vx), round(vy)],
        scale=round(scale, 3),
        wall=zones,
        openings=[o[:5] for o in opens],
        skirt=h.get("skirt", 0),
        rail=h.get("rail"),
        ceil=h.get("ceil"),
        clear=clear,
        light=h.get("light", .04),
    )
    if patio:
        geo["outdoor"] = True
    dbg.update(sl=sl, sr=sr, ppm=ppm)
    return geo, dbg


def overlay(img: Image.Image, geo: dict, dbg: dict, path: Path, name: str) -> None:
    o = img.convert("RGBA")
    lay = Image.new("RGBA", o.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.polygon([tuple(p) for p in geo["floor"]], fill=(0, 200, 255, 60), outline=(0, 120, 255, 255))
    for z in geo["wall"]:
        col = (255, 160, 0, 70) if len(z) > 4 else (0, 255, 90, 60)
        d.rectangle(z[:4], fill=col, outline=(0, 160, 60, 255), width=3)
    for op in geo["openings"]:
        d.rectangle(op[:4], outline=(255, 0, 0, 255), width=4)
        d.line([op[0], op[1], op[2], op[3]], fill=(255, 0, 0, 200), width=2)
        d.line([op[0], op[3], op[2], op[1]], fill=(255, 0, 0, 200), width=2)
    for c in geo["clear"]:
        d.rectangle(c, outline=(255, 0, 255, 255), width=3)
    vx, vy = geo["vp"]
    for p in geo["floor"]:
        d.line([p[0], p[1], vx, vy], fill=(0, 0, 255, 120), width=1)
    d.ellipse([vx - 8, vy - 8, vx + 8, vy + 8], outline=(0, 0, 255, 255), width=3)
    d.line([0, vy, W, vy], fill=(0, 0, 255, 90), width=1)
    yb = geo["floor"][0][1]
    if geo.get("rail"):
        d.line([0, geo["rail"], W, geo["rail"]], fill=(160, 0, 160, 140), width=1)
    d.line([geo["floor"][0][0], yb - geo["skirt"], geo["floor"][1][0], yb - geo["skirt"]], fill=(160, 0, 160, 200), width=2)
    for x, y in dbg.get("pts", []):
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 0, 255))
    # 1.8 m figure at the back wall and at the front: the yardstick in use
    s = geo["scale"] * PX_PER_M
    for fx, fy in [((geo["floor"][0][0] + geo["floor"][1][0]) / 2 - 300, yb), (300, min(geo["floor"][2][1], H) - 40)]:
        k = min(1.5, (fy - vy) / (yb - vy))  # as the game: growth toward the viewer capped at 1.5
        hh = 1.8 * s * k
        d.rectangle([fx - 0.25 * s * k, fy - hh, fx + 0.25 * s * k, fy], outline=(255, 255, 255, 255), fill=(0, 0, 0, 70), width=3)
    d.text((10, 10), f"{name} scale {geo['scale']} vp {geo['vp']}", fill=(0, 0, 0, 255))
    Image.alpha_composite(o, lay).convert("RGB").save(path)


def write_data(entries: list[dict]) -> None:
    src = DATA.read_text()
    lines = ["  /* BEGIN generated backdrops: art/measure_rooms.py writes this block; do not edit by hand */", "  backdrops:["]
    for e in entries:
        lines.append("    " + json.dumps(e, separators=(",", ":")) + ",")
    lines[-1] = lines[-1].rstrip(",")
    lines.append("  ],")
    lines.append("  /* END generated backdrops */")
    block = "\n".join(lines)
    pat = re.compile(r"  /\* BEGIN generated backdrops.*?/\* END generated backdrops \*/", re.S)
    if pat.search(src):
        src = pat.sub(lambda m: block, src)
    else:
        src, n = re.subn(r"  backdrops:\[\],", lambda m: block, src)
        if n != 1:
            raise SystemExit("backdrops block not found in decor-data.js")
    DATA.write_text(src)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--overlay", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    if args.overlay:
        args.overlay.mkdir(parents=True, exist_ok=True)
    entries = []
    for name in ORDER:
        img = Image.open(ROOMS_DIR / f"{name}.webp").convert("RGB")
        geo, dbg = measure(name, img)
        room = name.split("-")[0]
        e = dict(room=room, id=name, file=f"assets/decor/rooms/{name}.webp", thumb=f"assets/decor/rooms/thumbs/{name}.webp",
                 swatch=wall_colour(img, HINTS[name], geo["floor"][0][1], geo["floor"][0][0], geo["floor"][1][0]))
        e.update(geo)
        entries.append(e)
        f = geo["floor"]
        print(f"{name}: floor {f} vp {geo['vp']} scale {geo['scale']} (front x{geo['scale'] * (f[2][1] - geo['vp'][1]) / (f[0][1] - geo['vp'][1]):.2f})"
              f" slopes {dbg['sl']:.3f} {dbg['sr']:.3f} {len(dbg.get('pts', []))} pts; by yardstick {dbg['yard_scale']:.3f}"
              + (f", door/arch {dbg['yard_m']:.2f} m" if dbg['yard_m'] else ""))
        if args.overlay:
            overlay(img, geo, dbg, args.overlay / f"{name}.png", name)
    if not args.dry_run:
        write_data(entries)
        print(f"wrote {len(entries)} backdrops to {DATA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
