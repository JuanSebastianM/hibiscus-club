"""Game-ready sprites for the two pack-2 residents (Sol the lifeguard, Teo the gardener).

Reads art/source/pack2/06-island-places/resident-{lifeguard,gardener}{,-talk,-smile}.webp (1536 x 2730; the
gardener's smile is 756 x 1344 and is brought to the same size first: all three frames of each resident
register at shift 0) and writes dist/assets/scenes/<id>.png plus <id>-talk.png and <id>-smile.png, 176 x 432
like mara.png: the feet on the same baseline (y 428), the body centred on x 88, scaled to the height below.
Downscaling is done on premultiplied colour so the alpha edges carry no dark or light fringe.

The talk and smile frames are full sprites in the same registration; puppet.js uses only their lower face
(a feathered patch round the mouth) as real frames for talking and smiling.

Run from the repository root: python3 art/build_residents_pack2.py
"""
from PIL import Image
import numpy as np

SRC = 'art/source/pack2/06-island-places/'
OUT = 'dist/assets/scenes/'
SIZE = (176, 432)
BASELINE = 428          # feet, like mara.png / rosa.png / kit.png
RESIDENTS = {
    # id: (source name, figure height in game px). Sol is a teenager, a little shorter than Mara (425);
    # Teo's straw hat brings him up to the others.
    'sol': ('lifeguard', 410),
    'teo': ('gardener', 421),
}
FULL = (1536, 2730)


def load(name):
    im = Image.open(SRC + name + '.webp').convert('RGBA')
    if im.size != FULL:
        im = im.resize(FULL, Image.LANCZOS)
    return im


def figure_box(im):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 128)
    return xs.min(), ys.min(), xs.max(), ys.max()


def feet_centre(im, box):
    """x centre of the two feet (the lowest 4 % of the figure)."""
    a = np.array(im)[:, :, 3]
    y1 = box[3]
    band = a[int(y1 - (y1 - box[1]) * .04):y1 + 1] > 128
    xs = np.where(band.any(0))[0]
    return (xs.min() + xs.max()) / 2


def build(rid, src, height):
    frames = {'': load('resident-' + src), '-talk': load('resident-%s-talk' % src), '-smile': load('resident-%s-smile' % src)}
    base = frames['']
    box = figure_box(base)
    s = height / (box[3] - box[1])
    cx = feet_centre(base, box)
    # premultiplied resize of the whole canvas, then placed so (cx, box[3]) lands on (88, BASELINE)
    W, H = round(FULL[0] * s), round(FULL[1] * s)
    ox, oy = round(88 - cx * s), round(BASELINE - box[3] * s)
    print(rid, 'scale %.5f' % s, 'feet centre x %.1f' % cx, 'offset', (ox, oy),
          'map: x\' = x*%.5f%+d, y\' = y*%.5f%+d' % (s, ox, s, oy))
    for suffix, im in frames.items():
        small = im.convert('RGBa').resize((W, H), Image.LANCZOS).convert('RGBA')
        a = np.array(small)
        a[a[:, :, 3] < 6] = 0          # no ghost pixels round the edge
        small = Image.fromarray(a)
        out = small.crop((-ox, -oy, -ox + SIZE[0], -oy + SIZE[1]))  # outside the picture comes out transparent
        out.save(OUT + rid + suffix + '.png', optimize=True)
        print('  wrote', OUT + rid + suffix + '.png', figure_box(out))


if __name__ == '__main__':
    for rid, (src, h) in RESIDENTS.items():
        build(rid, src, h)
