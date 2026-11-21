"""Game-ready expression heads for the puppets (dist/puppet.js) from the drawn sheets.

    python3 art/build_faces.py [--check out_dir]

Input: art/source/pack2/02-faces/faces-<doll>-<front|side>.webp, a 4 x 3 grid of bald heads in the order
of HibiscusPuppetRig.EXPRESSIONS (neutral, soft smile, big smile, laugh, blink, half closed, talk eh,
talk oh, talk ah, surprised, look left, look right). They were drawn apart from the base dolls, so for
each cell this script
  1. registers the head to the base doll's head (assets/dolls/<doll>-<front|left>.webp): scale and
     offset from the skull and ear silhouette (which expressions do not change), refined on the eyes,
     nose and mouth by normalised cross-correlation of the neutral cell against the base face;
  2. matches colour and lighting to the base skin: a smooth per-channel ratio map between the base and
     the registered neutral cell, measured on skin only (eyes, brows and mouth left out) and applied to
     every cell, so the swapped face shows no patch;
  3. keeps only the face interior (brows to chin, inside the ears and the hairline) with a feathered
     mask, so hair, ears, earrings, the neck and the face outline stay the live doll's;
  4. finds the lips in each cell (for the makeup pass, which recolours them in the game).
Output, in doll-local pixels of the base picture at 2x: dist/assets/faces/faces-<doll>-<front|side>.webp
(RGBA: colour + blend mask) and faces-<doll>-<front|side>-lips.webp (lips in the red channel), each a
4 x 3 grid of cells of BOX[...] size; and the EXPRESSION_ART lines for dist/puppet-rig.js.
With --check, writes registration difference images and a preview sheet to out_dir.
Needs Pillow and numpy.
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'art/source/pack2/02-faces/faces-{doll}-{kind}.webp')
BASE = os.path.join(ROOT, 'dist/assets/dolls/{doll}-{view}.webp')
OUT = os.path.join(ROOT, 'dist/assets/faces')
NAMES = ['neutral', 'soft-smile', 'big-smile', 'laugh', 'blink', 'half-closed', 'talk-eh', 'talk-oh', 'talk-ah', 'surprised', 'look-left', 'look-right']
SCALE = 2  # output px per doll px

# Per doll and sheet (doll-local px of the base picture): the face-interior ellipse(s) that are blended
# in [cx, cy, rx, ry], the output box [x, y, w, h], the rows used for the silhouette fit (skull and ears,
# above the jaw) and the feature window for the fine fit. Side sheets map onto the left view.
SPEC = {
    ('adult', 'front'): dict(view='front', face=[[207, 106, 45, 44]], box=[156, 56, 104, 100], rows=(6, 118), feat=[166, 66, 84, 76],
                             eyes=[[188, 86.5, 21, 9.5], [232, 86.5, 21, 9.5]], mouth=[[207, 128, 32, 19]]),
    ('adult', 'side'):  dict(view='left', face=[[55, 104, 36, 44]], box=[12, 54, 86, 100], rows=(10, 96), feat=[26, 66, 50, 74],
                             eyes=[[53, 82, 16, 8.5]], mouth=[[42, 125, 24, 18]]),
    ('little', 'front'): dict(view='front', face=[[207, 152, 60, 52]], box=[140, 94, 134, 116], rows=(6, 150), feat=[150, 104, 112, 92],
                              eyes=[[176, 123, 26, 15], [238, 123, 26, 15]], mouth=[[208, 180, 34, 20]]),
    # Little Me's side sheet is drawn in three-quarter view and cannot be laid on her strict profile
    # (a second cheek and nose show); it is built for reference only and not used by the game.
    ('little', 'side'):  dict(view='left', face=[[36, 150, 36, 50]], box=[0, 94, 82, 112], rows=(8, 140), feat=[8, 100, 60, 92],
                              eyes=[[31, 115, 14, 9]], mouth=[[18, 171, 20, 14]], unused=True),
}
# What each expression swaps: only the eyes (blinks and glances keep the live doll's brows, cheeks and
# lips and their makeup), only the mouth and chin (talking), or the whole face interior.
REGION = {'neutral': 'face', 'soft-smile': 'face', 'big-smile': 'face', 'laugh': 'face', 'surprised': 'face',
          'blink': 'eyes', 'half-closed': 'eyes', 'look-left': 'eyes', 'look-right': 'eyes',
          'talk-eh': 'mouth', 'talk-oh': 'mouth', 'talk-ah': 'mouth'}

def load(path):
    return np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)

def cells(sheet):
    H, W = sheet.shape[:2]
    out = []
    for r in range(3):
        for c in range(4):
            y0, y1 = round(r * H / 3), round((r + 1) * H / 3)
            x0, x1 = round(c * W / 4), round((c + 1) * W / 4)
            out.append(sheet[y0:y1, x0:x1])
    return out

def edges(alpha, y0, y1, thr=128):
    """left and right silhouette x per row (nan when empty) for rows y0..y1"""
    L, R = [], []
    for y in range(y0, y1):
        xs = np.nonzero(alpha[y] > thr)[0]
        L.append(xs[0] if len(xs) else np.nan); R.append(xs[-1] if len(xs) else np.nan)
    return np.array(L, float), np.array(R, float)

def head_top(alpha, thr=128):
    """first row of the head: skips the shoulders of the cell above that spill over the top edge (wide
    rows touching the top) and anything left of a gap"""
    rows = (alpha > thr).sum(1)
    y = 0
    while y < len(rows) and rows[y] > 0:  # spill from the row above
        y += 1
    if y > len(rows) * .3:  # no spill after all
        y = 0
    return int(y + np.nonzero(rows[y:] > 0)[0][0])

def sample(img, s, dx, dy, w, h):
    """img (cell) mapped into doll-local space: doll = s * cell + (dx, dy); returns w x h (bilinear)"""
    pil = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGBA')
    # premultiply to avoid dark fringes when resampling
    a = img[..., 3:4] / 255
    pm = np.concatenate([img[..., :3] * a, img[..., 3:4]], -1)
    pil = Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), 'RGBA')
    inv = (1 / s, 0, -dx / s, 0, 1 / s, -dy / s)
    out = np.asarray(pil.transform((w, h), Image.AFFINE, inv, resample=Image.BICUBIC)).astype(np.float32)
    a = out[..., 3:4] / 255
    rgb = np.where(a > 0, out[..., :3] / np.maximum(a, 1e-3), 0)
    return np.concatenate([np.clip(rgb, 0, 255), out[..., 3:4]], -1)

def silhouette_fit(base, cell, rows, side):
    """scale and offset that put the cell's skull silhouette on the base's"""
    ba, ca = base[..., 3], cell[..., 3]
    bt, ct = head_top(ba), head_top(ca)
    bl, br = edges(ba, bt + rows[0], bt + rows[1])
    ys = np.arange(bt + rows[0], bt + rows[1])
    best = None
    for s in np.arange(0.12, 0.45, 0.0025):
        dy = bt - s * ct
        cy = np.round((ys - dy) / s).astype(int)
        ok = (cy >= 0) & (cy < ca.shape[0])
        cl, cr = edges(ca, 0, ca.shape[0])
        cl, cr = np.where(ok, cl[np.clip(cy, 0, ca.shape[0] - 1)], np.nan), np.where(ok, cr[np.clip(cy, 0, ca.shape[0] - 1)], np.nan)
        # side views: only the back of the skull (the face contour changes with the expression)
        pairs = [(br, cr)] if side else [(bl, cl), (br, cr)]
        res = []
        for b, c in pairs:
            m = ~np.isnan(b) & ~np.isnan(c)
            res.append((b[m], s * c[m]))
        dx = np.mean(np.concatenate([b - c for b, c in res]))
        err = np.mean(np.concatenate([np.abs(b - c - dx) for b, c in res]))
        if best is None or err < best[0]:
            best = (err, s, dx, dy)
    return best[1:]

def cell_offset(ref, cell, side):
    """offset (cell px) that moves `cell` onto `ref`: head tops level, the skull's outline (back of the
    skull only in profile; both sides in front) matched above the ears"""
    ra, ca = ref[..., 3], cell[..., 3]
    rt, ct = head_top(ra), head_top(ca)
    h = int((ra > 128).any(1).sum() * .38)
    rl, rr = edges(ra, rt, rt + h); cl, cr = edges(ca, ct, ct + h)
    pairs = [(rr, cr)] if side else [(rl, cl), (rr, cr)]
    d = np.concatenate([(b - c)[~np.isnan(b - c)] for b, c in pairs])
    return float(-np.median(d)), float(ct - rt)

def luma(img):
    return img[..., 0] * .299 + img[..., 1] * .587 + img[..., 2] * .114

def ncc(a, b, m):
    a, b = a[m], b[m]
    a, b = a - a.mean(), b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6))

def feature_fit(base, cell, s, dx, dy, feat):
    """fine search on the eyes, nose and mouth (edges of the luminance) of the neutral cell"""
    x, y, w, h = feat
    def grad(img):
        L = luma(img)
        gx = np.zeros_like(L); gy = np.zeros_like(L)
        gx[:, 1:-1] = L[:, 2:] - L[:, :-2]; gy[1:-1] = L[2:] - L[:-2]
        return np.hypot(gx, gy)
    gb = grad(base)[y:y + h, x:x + w]
    best = (-2, s, dx, dy)
    cx, cy = x + w / 2, y + h / 2
    for ds in np.arange(-0.04, 0.0401, 0.008):
        ss = s * (1 + ds)
        bx, by = cx - ss * (cx - dx) / s, cy - ss * (cy - dy) / s   # scaled about the window centre
        for ox in np.arange(-5, 5.01, 1):
            for oy in np.arange(-5, 5.01, 1):
                r = sample(cell, ss, bx + ox - x, by + oy - y, w, h)  # just the window
                gr = grad(r)
                m = (base[y:y + h, x:x + w, 3] > 200) & (r[..., 3] > 200)
                v = ncc(gb, gr, m)
                if v > best[0]:
                    best = (v, ss, bx + ox, by + oy)
    return best

def ellipse_mask(w, h, ells, feather):
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    for cx, cy, rx, ry in ells:
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(feather))).astype(np.float32) / 255

def box1(a, r, axis):
    a = np.moveaxis(a, axis, 0)
    p = np.concatenate([np.repeat(a[:1], r + 1, 0), a, np.repeat(a[-1:], r, 0)], 0)
    c = np.cumsum(p, 0)
    out = (c[2 * r + 1:] - c[:-2 * r - 1]) / (2 * r + 1)
    return np.moveaxis(out, 0, axis)

def blur(a, sigma):
    """gaussian-like blur (three box passes per axis), float arrays of any channel count"""
    r = max(1, int(round(sigma * .87)))
    a = a.astype(np.float32)
    for _ in range(3):
        a = box1(box1(a, r, 0), r, 1)
    return a

def features_mask(img):
    """eyes, brows, lips and teeth: anything far from skin (dark, very bright or very red)"""
    L = luma(img)
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    red = (r - g) - np.median((r - g)[img[..., 3] > 200])
    skinL = np.median(L[img[..., 3] > 200])
    f = (L < skinL * .62) | (L > skinL * 1.25) | (red > 26)
    return np.asarray(Image.fromarray((f * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0

def lips_mask(img, mouth_box):
    """lips: redder than the skin around them, not teeth, not the dark inside of the mouth"""
    x, y, w, h = mouth_box
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    L = luma(img)
    skin = img[..., 3] > 200
    ref = np.median((r - g)[y:y + h, x:x + w][skin[y:y + h, x:x + w]]) if skin[y:y + h, x:x + w].any() else 40
    red = np.clip(((r - g) - ref - 4) / 14, 0, 1)
    sat = np.clip((L - 55) / 25, 0, 1) * np.clip((215 - L) / 25, 0, 1)
    win = np.zeros_like(L); win[y:y + h, x:x + w] = 1
    m = red * sat * win * skin
    return blur(m, .6)

MOUTH = {('adult', 'front'): [176, 106, 62, 38], ('adult', 'side'): [24, 104, 40, 34],
         ('little', 'front'): [178, 160, 60, 34], ('little', 'side'): [4, 150, 30, 34]}

def build(doll, kind, check=None):
    spec = SPEC[(doll, kind)]
    base = load(BASE.format(doll=doll, view=spec['view']))
    sheet = cells(load(SRC.format(doll=doll, kind=kind)))
    side = kind == 'side'
    bh, bw = base.shape[:2]
    # 1. registration: silhouette for every cell, features on the neutral one (offset applied to all)
    fit0 = silhouette_fit(base, sheet[0], spec['rows'], side)
    v, s0, dx0, dy0 = feature_fit(base, sheet[0], *fit0, spec['feat'])
    fits = [fit0]
    regs = []
    for c in sheet:
        # the cells share the drawing's scale: each is moved onto the neutral cell by its skull outline
        ox, oy = cell_offset(sheet[0], c, side)
        regs.append(sample(c, s0, dx0 - ox * s0, dy0 - oy * s0, bw, bh))
    # 2. lighting: smooth ratio base / neutral measured on skin only
    neutral = regs[0]
    face = ellipse_mask(bw, bh, spec['face'], 3)
    skin = (base[..., 3] > 230) & (neutral[..., 3] > 230) & (face > .5) & ~features_mask(base) & ~features_mask(neutral)
    w = skin.astype(np.float32)
    rb = blur(base[..., :3] * w[..., None], 10) / np.maximum(blur(w, 10)[..., None], 1e-3)
    rn = blur(neutral[..., :3] * w[..., None], 10) / np.maximum(blur(w, 10)[..., None], 1e-3)
    ratio = np.clip(rb / np.maximum(rn, 1), .84, 1.2)
    # fill the ratio outside the measured skin smoothly (normalised convolution with a wide blur)
    cov = blur(w, 10)
    wide = blur(ratio * cov[..., None], 14) / np.maximum(blur(cov, 14)[..., None], 1e-3)
    ratio = np.where(cov[..., None] > .25, ratio, wide)
    # 3. blend mask: the face interior, where the drawn head and the base head both are
    x, y, W, H = spec['box']
    out = np.zeros((3 * H * SCALE, 4 * W * SCALE, 4), np.uint8)
    lips = np.zeros((3 * H * SCALE, 4 * W * SCALE), np.uint8)
    report = []
    region = {'face': face, 'eyes': face * ellipse_mask(bw, bh, spec['eyes'], 3), 'mouth': face * ellipse_mask(bw, bh, spec['mouth'], 3.5)}
    for n, reg in enumerate(regs):
        col = np.clip(reg[..., :3] * ratio, 0, 255)
        rm = region[REGION[NAMES[n]]]
        a = rm * (reg[..., 3] / 255) * np.clip(base[..., 3] / 255 * 1.2, 0, 1)
        # where the drawn chin drops below the base chin (open mouths), keep the drawn pixels
        a = np.maximum(a, rm * (reg[..., 3] / 255) * (base[..., 3] < 10))
        rgba = np.concatenate([col, a[..., None] * 255], -1)[y:y + H, x:x + W]
        big = Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA').resize((W * SCALE, H * SCALE), Image.LANCZOS)
        r, c = divmod(n, 4)
        out[r * H * SCALE:(r + 1) * H * SCALE, c * W * SCALE:(c + 1) * W * SCALE] = np.asarray(big)
        lm = lips_mask(np.concatenate([col, reg[..., 3:4]], -1), MOUTH[(doll, kind)])[y:y + H, x:x + W]
        lbig = Image.fromarray((np.clip(lm, 0, 1) * 255).astype(np.uint8), 'L').resize((W * SCALE, H * SCALE), Image.LANCZOS)
        lips[r * H * SCALE:(r + 1) * H * SCALE, c * W * SCALE:(c + 1) * W * SCALE] = np.asarray(lbig)
        if n == 0:
            m = face > .5
            d = np.abs(luma(np.concatenate([col, reg[..., 3:4]], -1)) - luma(base))[m & (reg[..., 3] > 200) & (base[..., 3] > 200)]
            report.append(f'{doll} {kind}: scale {s0:.4f}, feature ncc {v:.3f}, neutral vs base luma diff mean {d.mean():.1f} (median {np.median(d):.1f}) in the face')
        if check is not None:
            os.makedirs(check, exist_ok=True)
            comp = base.copy()
            comp[..., :3] = comp[..., :3] * (1 - a[..., None]) + col * a[..., None]
            if n == 0:
                diff = np.abs(luma(np.concatenate([col, reg[..., 3:4]], -1)) - luma(base)) * (reg[..., 3] > 200) * (base[..., 3] > 200)
                Image.fromarray(np.clip(diff * 4, 0, 255).astype(np.uint8)).crop((x - 20, y - 20, x + W + 20, y + H + 20)).resize(((W + 40) * 3, (H + 40) * 3), Image.NEAREST).save(f'{check}/reg-{doll}-{kind}-diff.png')
                ov = base.copy(); ov[..., :3] = ov[..., :3] * .5 + reg[..., :3] * .5 * (reg[..., 3:4] / 255) + ov[..., :3] * .5 * (1 - reg[..., 3:4] / 255)
                Image.fromarray(ov.astype(np.uint8)).crop((x - 30, y - 50, x + W + 30, y + H + 30)).resize(((W + 60) * 3, (H + 80) * 3), Image.LANCZOS).save(f'{check}/reg-{doll}-{kind}-overlay.png')
            Image.fromarray(comp.astype(np.uint8)).crop((x - 10, y - 10, x + W + 10, y + H + 10)).save(f'{check}/cell-{doll}-{kind}-{n:02d}.png')
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(out, 'RGBA').save(os.path.join(OUT, f'faces-{doll}-{kind}.webp'), quality=90, method=6)
    rgb = np.stack([lips, lips * 0, lips * 0], -1)
    Image.fromarray(rgb, 'RGB').save(os.path.join(OUT, f'faces-{doll}-{kind}-lips.webp'), quality=92, method=6)
    if spec.get('unused'):
        os.remove(os.path.join(OUT, f'faces-{doll}-{kind}.webp')); os.remove(os.path.join(OUT, f'faces-{doll}-{kind}-lips.webp'))
        return report + [f'{doll} {kind}: not used by the game (three-quarter drawing)'], None
    return report, {'file': f'assets/faces/faces-{doll}-{kind}.webp', 'lips': f'assets/faces/faces-{doll}-{kind}-lips.webp', 'at': [x, y], 'cell': [W, H], 'scale': SCALE}

if __name__ == '__main__':
    check = sys.argv[sys.argv.index('--check') + 1] if '--check' in sys.argv else None
    only = [a for a in sys.argv[1:] if '-' in a and not a.startswith('--') and a != check]
    art = {}
    for doll, kind in SPEC:
        if only and f'{doll}-{kind}' not in only:
            continue
        rep, spec = build(doll, kind, check)
        print('\n'.join(rep))
        if spec:
            art.setdefault(doll, {})[kind] = spec
    print(json.dumps(art))
