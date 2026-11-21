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

Scale: the furniture manifest's defaultScale assumes 280 px per metre. The paintings were drawn at
human scale (a 2.5 m ceiling, 2.0 m doors), so a room's scale at the back wall is its yardstick's
pixels per metre / 280: the door opening (2.0 m) where the back wall has a door, the patios'
garden arch (2.0 m), and in the window rooms the ceiling line (2.5 m). The window sills were asked
for at 0.9 m but are painted at about 0.6 m in every window room (the door rooms' doors and
ceilings agree to within 3 %), so the sill is only measured and printed, as a check.
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
YARD_M = {"door": 2.0, "arch": 2.0, "ceil": 2.5, "sill": 0.9}  # the requested heights

# Read by eye on the 50 px grid of each backdrop (room pixels). All eighteen were drawn on one
# shared layout: back wall x 300..1232 from the ceiling line (y ~250) to the floor (y ~902).
# Keys:
#   back: [y, xLeft, xRight]   floor line at the back wall and the two back corners (refined)
#   ceil: y of the ceiling line (bottom of the crown moulding, or the porch beam) on the back wall
#   top/rail: the wall band for wall decor: below the crown/frieze, above the chair rail or tile cap
#   skirt: skirting height in px at the back wall
#   open: openings on the back wall [x0, y0, x1, y1, kind] (window | door | arch), outer casing
#   yard: the yardstick: ['door', y] (top of the door opening), ['arch', y] (top of the arch
#         opening), ['ceil'] (the ceiling line); sill: y of the top of a window sill (printed only)
#   zones: patios only: wall zones [x0, y0, x1, y1] or [x0, y0, x1, y1, 'hang'] (only hanging pieces)
#   vx, vy: where to look for the vanishing point when the edges alone mislead (floor joints)
#   light: which way contact shadows lean (+ right, - left), from the sunlight on the floor
HINTS: dict[str, dict] = {
    "bedroom-1": dict(back=[902, 300, 1232], ceil=250, top=262, rail=688, skirt=30,
                      open=[[396, 298, 766, 772, "window"]], yard=["ceil"], sill=750, light=.05),
    "bedroom-2": dict(back=[902, 300, 1232], ceil=250, top=262, rail=688, skirt=30,
                      open=[[912, 312, 1198, 770, "window"]], yard=["ceil"], sill=738, light=.05),
    "bedroom-3": dict(back=[902, 300, 1232], ceil=250, top=300, rail=652, skirt=30,
                      open=[[377, 357, 648, 902, "door"]], yard=["door", 385], light=-.05),
    "kitchen-1": dict(back=[902, 300, 1232], ceil=250, top=262, rail=686, skirt=30,
                      open=[[871, 312, 1173, 748, "window"]], yard=["ceil"], sill=712, light=.05),
    "kitchen-2": dict(back=[902, 300, 1232], ceil=250, top=262, rail=686, skirt=30,
                      open=[[366, 367, 634, 902, "door"]], yard=["door", 393], light=-.05),
    "kitchen-3": dict(back=[902, 300, 1232], ceil=250, top=262, rail=686, skirt=30,
                      open=[[876, 315, 1177, 775, "window"]], yard=["ceil"], sill=738, light=.05),
    "living-1": dict(back=[902, 300, 1232], ceil=250, top=262, rail=692, skirt=30,
                     open=[[855, 305, 1133, 775, "window"]], yard=["ceil"], sill=748, light=.05),
    "living-2": dict(back=[902, 300, 1232], ceil=250, top=262, rail=686, skirt=30,
                     open=[[385, 367, 632, 902, "door"]], yard=["door", 395], light=-.05),
    "living-3": dict(back=[902, 300, 1232], ceil=250, top=262, rail=676, skirt=30,
                     open=[[869, 320, 1170, 770, "window"]], yard=["ceil"], sill=732, light=.0),
    "bathroom-1": dict(back=[902, 300, 1232], ceil=250, top=262, rail=686, skirt=30,
                       open=[[371, 315, 682, 775, "window"]], yard=["ceil"], sill=738, light=-.05),
    "bathroom-2": dict(back=[902, 300, 1232], ceil=250, top=262, rail=638, skirt=30,
                       open=[[866, 320, 1168, 765, "window"]], yard=["ceil"], sill=730, light=.0),
    "bathroom-3": dict(back=[902, 300, 1232], ceil=250, top=262, rail=622, skirt=30,
                       open=[[375, 349, 654, 902, "door"]], yard=["door", 380], light=-.05),
    "playroom-1": dict(back=[902, 300, 1232], ceil=250, top=262, rail=688, skirt=30,
                       open=[[873, 316, 1171, 768, "window"]], yard=["ceil"], sill=735, light=.05),
    "playroom-2": dict(back=[902, 300, 1232], ceil=250, top=262, rail=688, skirt=30,
                       open=[[385, 350, 647, 902, "door"]], yard=["door", 377], light=-.05),
    "playroom-3": dict(back=[902, 300, 1232], ceil=250, top=262, rail=688, skirt=30,
                       open=[[866, 325, 1155, 770, "window"]], yard=["ceil"], sill=740, light=.05),
    "patio-1": dict(back=[904, 300, 1236], ceil=None, skirt=0,
                    zones=[[322, 290, 1212, 770], [300, 215, 1225, 262, "hang"]],
                    open=[[370, 328, 690, 904, "arch"]], yard=["arch", 381], light=-.04),
    "patio-2": dict(back=[902, 300, 1234], ceil=254, skirt=30,
                    zones=[[318, 282, 1222, 770], [305, 228, 1230, 256, "hang"]],
                    open=[[873, 333, 1158, 902, "arch"]], yard=["arch", 379], light=-.04),
    "patio-3": dict(back=[902, 312, 1226], ceil=None, skirt=0,
                    zones=[[262, 272, 1278, 780]],
                    open=[[388, 352, 654, 902, "arch"]], yard=["arch", 355], light=-.04),
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
    patio = "zones" in h
    yb, xl, xr = h["back"]
    opens = h.get("open", [])
    dbg = {}
    if "lines" not in h:
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
    # yardstick -> pixels per metre at the back wall: the painted rooms are at human scale, so
    # the furniture scale is simply the yardstick's
    y = h["yard"]
    if y[0] in ("door", "arch"):
        ppm = (yb - y[1]) / YARD_M[y[0]]
    else:
        ppm = (yb - h["ceil"]) / YARD_M["ceil"]
    scale = ppm / PX_PER_M
    # checks, printed: the door/arch, the ceiling and the window sill in metres at this scale
    dbg["door_m"] = (yb - y[1]) / ppm if y[0] in ("door", "arch") else None
    dbg["ceil_m"] = (yb - h["ceil"]) / ppm if h.get("ceil") else None
    dbg["sill_m"] = (yb - h["sill"]) / ppm if h.get("sill") else None
    dbg["wall_m"] = (xr - xl) / ppm
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
            # (a single door: its whole width, casing included)
            k = max(0, min(.27 * (o[2] - o[0]), (o[2] - o[0] - 1.6 * scale * PX_PER_M) / 2))
            clear.append([round(o[0] + k), yb, round(o[2] - k), round(yb + (front - yb) * .38)])
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
    # 1.7 m figure (the Grown-up) at the back wall and at the front
    s = geo["scale"] * PX_PER_M
    for fx, fy in [((geo["floor"][0][0] + geo["floor"][1][0]) / 2 - 300, yb), (300, min(geo["floor"][2][1], H) - 40)]:
        k = min(1.5, (fy - vy) / (yb - vy))  # as the game: growth toward the viewer capped at 1.5
        hh = 1.7 * s * k
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
              f" slopes {dbg['sl']:.3f} {dbg['sr']:.3f} {len(dbg.get('pts', []))} pts; back wall {dbg['wall_m']:.2f} m"
              + "".join(f", {k} {dbg[k + '_m']:.2f} m" for k in ("door", "ceil", "sill") if dbg[k + "_m"]).replace("door", "arch" if geo.get("outdoor") else "door"))
        if args.overlay:
            overlay(img, geo, dbg, args.overlay / f"{name}.png", name)
    if not args.dry_run:
        write_data(entries)
        print(f"wrote {len(entries)} backdrops to {DATA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
