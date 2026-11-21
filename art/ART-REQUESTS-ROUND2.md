# Art requests, round 2: corrections

Prompts for the image agent. Paste "Shared rules" first, then one block, and attach the files
named in it (all are in this repository). Blocks are ordered by how much they improve the game.

## Shared rules (paste before every block)

You are producing art for a 2D paper-doll dress-up game. Hard requirements:

- Transparent sheets: real alpha, no ground shadows, no glow, no text, no borders. Items never
  touch each other or the image edge; at least 40 px of empty space around each item.
- Keep exactly the grid, order and count each block asks for.
- Match the attached style reference exactly (rendering, lighting from the upper left, colors).
- Original designs only. No logos or branded characters.
- Deliver PNG files with the exact file names given.

---

## A. Empty rooms at human scale (replaces the 18 rooms)

Attach: `art/source/pack2/07-house-decorator/room-bedroom-1.webp` (style reference),
`dist/assets/decor/bedroom/single-bed.webp` and `dist/assets/decor/living/sofa.webp`
(furniture that must look the right size in the room).

Problem with the current rooms: doors and windows are drawn far too tall and the rooms are
wide-angle, so correctly sized furniture looks like miniatures.

Draw each room as an opaque 4:3 image (2388 x 1792), straight-on one-point perspective, camera at
standing eye height (1.5 m), empty, soft daylight from the upper left. Use these real-world
measures and keep them identical in every room so furniture fits all of them:

- Room: 4.5 m wide, 2.5 m high ceiling, 4 m deep.
- Back wall: fills the middle of the picture, 60 % of the image width and 50 % of the image
  height, centred horizontally, its bottom edge at 62 % of the image height from the top.
- Floor: from the bottom of the back wall to the bottom edge of the image; side walls converge to
  a vanishing point at the centre of the back wall, 60 % of the way up it.
- Doors: exactly 2.0 m tall and 0.85 m wide, which is 80 % of the back wall's height. A person
  1.7 m tall standing at the back wall reaches 68 % of the wall's height.
- Windows: sill 0.9 m from the floor, top at 2.1 m, no wider than one third of the back wall.
- One window OR one door on the back wall, placed in the left or right third so at least half of
  the back wall is plain wall for furniture. No doors or windows on the side walls.
- Skirting board 12 cm tall. Optional wainscot up to 0.9 m.
- No furniture, no curtains, no plants inside, no rugs, no ceiling lamps, no people.
- No frame, mat or margin around the picture: the room fills the whole image.

Six rooms, three color schemes each (18 images), named `room-<room>-<1|2|3>.png`:

- `bedroom`: 1 rose stripes with white wainscot and oak floor; 2 lilac florals with cream
  wainscot and whitewashed floor; 3 mint with a pink border and herringbone floor.
- `kitchen`: 1 butter yellow with cream beadboard and terracotta checker tiles; 2 mint gingham
  with white tiles; 3 peach with white subway tile and honey wood.
- `living`: 1 cream with botanical wallpaper and oak floor; 2 sky blue with white panelling and
  pale wood; 3 warm yellow with a flower border and terracotta tiles.
- `bathroom`: 1 pink tiles with rosebud wallpaper and pink checker floor; 2 aqua tiles with
  floral wallpaper and hexagon floor; 3 lemon tiles with a blue border and patterned floor.
- `playroom`: 1 sky blue with hot-air-balloon wallpaper and oak floor; 2 lilac polka dots with
  cork floor; 3 rainbow pastel stripes with pale wood.
- `patio` (outdoors, same geometry: a garden wall 2.5 m tall where the back wall would be, with
  one arch 2.0 m tall in the left or right third; low balustrades instead of side walls; paving
  for the floor; sky above): 1 pink stucco with a lilac pergola and bougainvillea; 2 sage green
  trellis with white flowers; 3 yellow stucco with terracotta paving.

---

## B. Furniture on one shared scale (replaces the 8 furniture sheets)

Attach: `art/source/pack2/07-house-decorator/furn-bedroom-a.webp` (style reference).

Problem with the current sheets: every piece was enlarged to fill its cell, so a lamp is drawn as
big as a bed, and the pieces face different ways.

Redraw the same items in the same illustrated style with these rules:

- One scale for all eight sheets: 220 pixels per metre. Draw every piece at its real size on that
  scale. Reference sizes: single bed 2.0 m long x 1.0 m wide x 1.0 m high at the headboard; sofa
  2.0 m wide x 0.9 m high; armchair 0.9 m wide; dining table 1.4 m x 0.75 m high; chair seat 0.45
  m, back 0.9 m; fridge 0.7 m wide x 1.7 m high; kitchen counter 0.9 m high; bathtub 1.6 m long
  x 0.6 m high; toilet 0.75 m high; wardrobe 1.0 m wide x 1.9 m high; bookshelf 0.8 m wide x 1.6 m
  high; floor lamp 1.5 m high; bedside table 0.5 m; lava lamp 0.35 m; rubber duck 0.12 m.
- One viewing angle for every piece: three-quarter view from the front-left, camera slightly
  above (about 20 degrees), so the front and the right side are visible and the top is just
  visible. Long pieces (beds, sofas, tubs) run from back-left to front-right.
- Every piece stands on a flat floor: the feet or base that touch the floor are clearly visible
  and nothing is cut off at the bottom.
- Sheets are 2388 x 1792 with a 4 x 3 grid, but pieces keep their true relative size: small
  items sit small in their cells. Big items that do not fit a cell may span two cells; keep
  reading order.
- In the bottom-right corner of every sheet, outside the grid, draw a plain grey silhouette of a
  standing adult exactly 1.7 m tall (374 px) as a scale check.
- Same twelve items per sheet and the same file names as before: `furn-bedroom-a`,
  `furn-kitchen-a`, `furn-living-a`, `furn-bathroom-a`, `furn-playroom-a`, `furn-patio-a`,
  `decor-walls-a` (flat front view, as hung on a wall), `decor-floor-a` (rugs seen from the same
  camera angle, lying flat).

Item lists (unchanged):

- bedroom: canopy bed, single bed, bunk bed, wardrobe, dresser with mirror, bedside table, desk,
  desk chair, bookshelf, toy chest, beanbag, floor lamp.
- kitchen: fridge, stove with oven, sink counter, corner counter, wall cabinets, kitchen island,
  dining table, dining chair, bar stool, toaster and kettle set, fruit bowl, hanging pots rack.
- living: sofa, loveseat, armchair, coffee table, TV on a stand, fireplace, tall plant, side
  table, floor cushion, record player, bookshelf with trinkets, standing mirror.
- bathroom: bathtub with bubbles, shower, sink vanity, toilet, towel rack, laundry basket, bath
  mat, mirror cabinet, shelf with bottles, rubber duck, potted fern, stool.
- playroom: dollhouse, play kitchen, rocking horse, toy shelf, art easel, small table and chairs,
  ball pit, teepee tent, train set, plush pile, toy piano, building blocks.
- patio: lounge chair, patio table with umbrella, grill, swing seat, kiddie pool, flower planter,
  string-light pole, garden gnome, bird bath, picnic blanket, lemonade stand, potted palm.
- walls: framed picture, poster, wall clock, window with curtains, round window, wall shelf,
  fairy lights, heart mirror, pennant banner, hanging plant, wall lamp, star decals.
- floor: round rug, rectangular rug, heart rug, pet bed with kitten, pet bed with puppy, fish
  tank on a stand, floor vase with flowers, disco ball on a stand, lava lamp, gift boxes, balloon
  bunch, potted hibiscus.

---

## C. Three hairstyles that still do not sit right

Attach: `art/source/base-adult-turnaround.webp`, `art/source/base-little-turnaround.webp`,
`art/source/pack2/01-hair/hair-adult-a-worn.webp` (style reference).

For each style: paint the hair directly on the matching bald head from the turnaround sheet in
all four views (front, left, right, back), at the head's exact size and position. Then deliver
two sheets with the same layout: `-worn` (hair on the head and shoulders) and hair only (head
removed, transparent where face, ears and neck show). The hair-only sheet must be the SAME
drawing as the worn sheet, pixel for pixel, with the head erased. Dark espresso brown.

Rules that the current versions break:

- The hair touches the head everywhere along the hairline, temples and behind the ears: no gap
  of background between skin and hair on either side of the face.
- The face stays open: both eyes with their outer corners, both cheeks to the cheekbones and the
  whole jawline are visible in the front view.
- Each ear is either completely covered by hair or completely visible, never half.

One sheet, three rows, file names `hair-fix-a.png` and `hair-fix-a-worn.png`:

1. Adult, high side ponytail with a swept fringe: the fringe sweeps across the forehead and is
   tucked behind the far ear; on that side the hair is pulled back flat against the temple with
   no gap.
2. Adult, long crimped hair with two small twists at the front: the lengths fall behind the
   shoulders and lie against the jaw and neck, not hanging away from them.
3. Toddler, short curly bob: chin length, hugging the head, same size in all four views.

---

## D. Outfits that follow the doll's arms (replaces five outfits)

Attach: `art/source/base-adult-turnaround.webp`, `art/source/base-little-turnaround.webp`,
`art/source/pack2/03-outfits/outfits-adult-d.webp` (style reference).

Clothes are drawn empty (no body), shaped exactly as worn on the attached doll: lay the garment
over the doll's figure in each view so the sleeves follow her arms in their exact position and
angle, shoulders sit on her shoulders, and hems hang at the right height. Four views per item,
same scale as the doll. Every outfit covers the torso and upper thighs completely.

- `outfits-fix-adult.png` (three rows): aqua velour tracksuit; puffer vest over a slip dress;
  oversized hoodie dress with leg warmers (leg warmers drawn on the calves where they are worn).
- `outfits-fix-little.png` (three rows): raincoat with matching trousers; bear-ear hooded
  onesie; ballet leotard with tutu and wrap cardigan (cardigan sleeves present in every view).

---

## E. Open shoes in two layers

Attach: both turnaround sheets, `art/source/pack2/04-shoes/shoes-adult-b-worn.webp`.

For each open shoe, deliver the shoe split into two sheets with identical layout so the doll's
foot can go between them: `-under` (sole and insole only, everything the foot stands on) and
`-over` (straps, buckles, bows and uppers only, everything that goes over the foot). Front and
back cells show the pair spaced as the doll's feet; side cells one shoe. Sized to the doll's feet.

- `shoes-adult-open-under.png` / `-over.png`: jelly sandals; flower flip-flops; strappy wedges.
- `shoes-little-open-under.png` / `-over.png`: closed-toe toddler sandals; jelly shoes.

---

## F. Accessories drawn as worn or held

Attach: both turnaround sheets, `art/source/pack2/05-accessories/acc-glasses.webp` (style
reference: glossy 3D render like the dolls, not outlined cartoon).

Each item in four views, positioned exactly as worn on the attached doll, in the dolls' glossy
3D style (no dark outlines). Deliver a `-worn` proof sheet (item on the doll) and the item-only
sheet with the same layout.

- `acc-bags-adult-fix`: mini shoulder bag hanging from her shoulder with the strap over the
  shoulder; beaded tote held in her hand at her side; small backpack on her back with both
  straps over the shoulders.
- `acc-toys-little-fix`: plush bunny, teddy bear and kitten plush, each held by the toddler in
  one hand at her side, dangling by an arm, sized for a toddler's hand.
- `acc-hats-fix`: bucket hat, wide-brim sun hat and baseball cap on the adult head; sun bonnet,
  bear-ear beanie and party crown on the toddler head (two sheets, `-adult` and `-little`).

---

## G. Grown-up talking mouths that start from her smile

Attach: `art/source/base-adult-turnaround.webp`, `art/source/pack2/02-faces/faces-adult-front.webp`.

Her resting face is an open smile showing teeth. Draw six heads (front view, bald, same size and
lighting as the reference, transparent background) that start from that smile so talking does
not snap to a closed mouth: 1 the resting open smile; 2 smile with lips slightly parted wider
("eh"); 3 smile rounding ("oh"); 4 smile wide open ("ah"); 5 smile with eyes closed (blink);
6 big laughing smile with eyes squeezed. One row of six, file `faces-adult-front-smile.png`.
Then the same six in left profile, `faces-adult-side-smile.png`.

---

## H. Arms raised (enables waving and cheering)

Attach: both turnaround sheets.

The current doll only has arms down, so waving looks broken. For each doll draw the same bald
figure in the same style, front view only, full body, in three extra poses, each on its own
transparent image at the same size and position as the front figure in the turnaround:
1 right arm raised and waving, left arm down; 2 both arms raised high (cheer); 3 one hand on
the hip. Files `base-<adult|little>-pose-<wave|cheer|hip>.png`.
