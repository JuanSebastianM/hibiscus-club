# Art requests for the next Hibiscus Club update

These are prompts for an image-generating agent. Each block is self-contained: paste the
"Shared rules" section first, then one request block, and attach the reference images it names.
The files referenced are in this repository under `art/source/`.

Send the results back as the original image files (PNG or WebP with real transparency), one
sheet per image, named as suggested. Sheets that follow these rules can be cut and fitted by the
existing scripts (`art/slice.py`, `art/slice_views.py`, `art/fit_views.py`).

---

## Shared rules (paste before every request)

You are producing sprite sheets for a 2D paper-doll dress-up game in the style of early-2000s
fashion-doll CD-ROM games. Match the attached reference images exactly in rendering style: soft,
glossy 3D-toy rendering, warm studio lighting from the front-top, gentle highlights, clean edges,
saturated pastel-and-bright colors.

Hard requirements for every sheet:

- Fully transparent background (real alpha, not white, not a checkerboard). No shadows on the
  ground, no glow, no background haze, no text, no labels, no borders, no watermarks.
- Items never touch or overlap each other and never touch the edge of the image. Leave at least
  40 pixels of empty space around every item.
- A regular grid: one item per row, and four columns per row in this exact order from left to
  right: front view, left side view (facing the viewer's left), right side view (facing the
  viewer's right), back view. Every row uses the same order.
- The four views of one item are the same object at the same scale and the same vertical
  alignment, as if a turntable rotated it.
- Consistent scale across the whole sheet: items meant for the same doll are drawn at the size
  they would have on that doll.
- Original designs only. No logos, brand names, trademarked characters or recognizable
  commercial toys.
- Image size 1448 x 1086 pixels or larger at the same 4:3 ratio, three rows per sheet unless the
  request says otherwise.

The two dolls are in the attached turnaround sheets (`base-adult-turnaround.webp`,
`base-little-turnaround.webp`): a grown-up and a toddler, each shown front, left, right and back,
bald, in a lilac bodysuit. Everything you draw must fit these exact bodies in these exact poses:
same proportions, same arm position, same head size.

---

## 1. Hair that grows from the head (highest priority)

Attach: `base-adult-turnaround.webp`, `base-little-turnaround.webp`, `views-hair-adult.webp`,
`views-hair-little.webp` (style reference only).

The current hairstyles look like wigs because they were drawn without the head. Fix that by
construction:

1. For each hairstyle and each of the four views, start from the matching bald figure in the
   turnaround sheet and paint the hair directly onto that head, so the hairline, temples,
   sideburns, nape and ears are correct for that exact head.
2. Then output only the hair, with the head and body removed, keeping the hair at exactly the
   position and size it had on the head. The area where the face, ears and neck show must be
   fully transparent.
3. Also output, as a second image with the same layout, the same hair still on the head and
   shoulders (a "worn" proof sheet). This is used to check placement and is not shipped.

Hair requirements: a natural, slightly irregular hairline low on the forehead (about one third of
the way from eyebrows to the top of the skull); baby hairs at the edge; hair volume that hugs the
skull, not a helmet; long hair rests on the shoulders and back; ears either clearly covered or
clearly visible with hair tucked behind. Dark espresso brown with soft highlights (the game
recolors it).

Sheets wanted, three styles per sheet, four views each:

- `hair-adult-a`: long beach waves with center part; high side ponytail with swept fringe;
  half-up curls. (Redraws of the current three so they fit the head.)
- `hair-adult-b`: sleek straight hair with curtain bangs; shoulder-length bob with flipped ends;
  two long braids.
- `hair-adult-c`: high bun with face-framing tendrils; space buns with loose lengths; long
  crimped hair with a zigzag part and butterfly-clip twists at the front (no clips drawn).
- `hair-little-a`: ringlet pigtails; twin curly buns; short curly bob. (Redraws that fit the
  toddler head.)
- `hair-little-b`: two tiny top pigtails ("fountain" ponytails) with short wispy hair; short
  pixie-soft toddler hair with a side-swept fringe; a single small top ponytail with baby curls.
- `hair-little-c`: chin-length bob with straight bangs; two short braids; a headband-ready short
  wavy style with soft curls at the nape.

Toddler hair must look like real toddler hair: short to chin length, fine, soft, age-appropriate.
No long glamorous styles on the toddler.

---

## 2. Faces: expressions, blinking and talking

Attach: `base-adult-turnaround.webp`, `base-little-turnaround.webp`.

For each doll, draw the head only (cropped at the base of the neck), front view, at the exact
size, position and lighting of the front figure's head, so each image can replace the head
pixel-for-pixel. Nothing but the expression changes: skull, ears, skin tone and lighting stay
identical.

One sheet per doll, a 4 x 3 grid (twelve heads), transparent background:

1. neutral (identical to the reference)
2. soft closed-mouth smile
3. big open smile
4. laughing, eyes squeezed
5. eyes closed (blink), mouth as neutral
6. eyes half closed
7. talking, mouth slightly open ("eh")
8. talking, mouth open round ("oh")
9. talking, mouth wide ("ah")
10. surprised, eyebrows up
11. looking left (eyes only)
12. looking right (eyes only)

Then a second sheet per doll with the same twelve expressions for the left side view of the head
(profile). The right side view is made by mirroring.

Files: `faces-adult-front`, `faces-adult-side`, `faces-little-front`, `faces-little-side`.

---

## 3. More outfits

Attach: both turnaround sheets, `views-outfits-adult-a.webp`, `views-outfits-little-a.webp`
(style reference).

Clothes are drawn empty (no body inside), shaped as worn on the reference body in its exact pose,
four views per item. Sleeves follow the reference arms. Necklines and waistbands show a little of
the inside so they read as hollow. Every outfit fully covers the lilac bodysuit area (torso and
upper thighs) so nothing underneath can show; swimwear is a modest one-piece or a tankini with
shorts that covers the bodysuit area.

Adult sheets (three outfits each):

- `outfits-adult-c` (beach): pastel one-piece swimsuit with a wrap sarong skirt; tankini top with
  board shorts; crochet cover-up dress over a swimsuit.
- `outfits-adult-d` (sporty and casual): velour tracksuit in aqua; tennis dress with pleated
  skirt; graphic baby tee with low-rise cargo capris.
- `outfits-adult-e` (party): sequin halter mini dress with ruffle hem; butterfly-print top with
  satin midi skirt; metallic puffer vest over a slip dress.
- `outfits-adult-f` (cozy and school): plaid skirt with knit vest and collared shirt; oversized
  hoodie dress with leg warmers; denim overall dress over a striped tee.

Toddler sheets (three outfits each), age-appropriate and playful:

- `outfits-little-c` (beach): ruffled one-piece swimsuit with a matching swim skirt; rash-guard
  top with swim shorts; terry-cloth hooded beach poncho over a swimsuit.
- `outfits-little-d` (play): rainbow striped tee with tutu skirt; dinosaur-print romper; raincoat
  with matching trousers.
- `outfits-little-e` (party and cozy): tulle party dress with a big bow; fuzzy bear-ear hooded
  onesie; ballet leotard with a soft tutu and wrap cardigan.

---

## 4. Shoes

Attach: both turnaround sheets, `views-shoes-adult.webp`, `views-shoes-little.webp`.

Front and back cells show the pair, spaced exactly as the reference doll's feet are spaced. Side
cells show one shoe. Shoes are drawn empty and sized to the reference feet.

For every open shoe (sandals, flip-flops, peep-toes), also provide the same sheet a second time
with the reference doll's bare feet inside the shoes, so toes and straps can be layered correctly
(`-worn` suffix).

- `shoes-adult-b`: jelly sandals; flip-flops with a flower; strappy wedge sandals.
- `shoes-adult-c`: knee-high platform boots; fuzzy slippers; ballet flats with ankle ribbons.
- `shoes-little-b`: closed-toe toddler sandals; jelly shoes; soft bunny slippers.
- `shoes-little-c`: light-up style sneakers (lights drawn, no brand); tiny cowboy boots; ballet
  slippers.

---

## 5. Glasses, hats, bags and toys

Attach: both turnaround sheets, `views-clips.webp` (style reference).

Each item in four views, sized for the doll named, and positioned as worn (glasses at eye level
with arms going to the ears; hats seated on the skull with room for hair; bags shown hanging from
the reference doll's hand or shoulder, with the strap shape that fits that pose; toys shown as
held in the reference doll's hand at her side).

- `acc-glasses`: heart-shaped sunglasses; round tinted glasses; cat-eye glasses. (Adult size.)
- `acc-glasses-little`: star-shaped sunglasses; round play glasses; swim goggles pushed up on the
  forehead. (Toddler size.)
- `acc-hats-adult`: bucket hat; wide-brim sun hat with ribbon; baseball cap worn forward.
- `acc-hats-adult-b`: beret; tiara; headband with a bow.
- `acc-hats-little`: sun bonnet; bear-ear beanie; party crown.
- `acc-bags-adult`: mini shoulder bag; beaded tote; small backpack.
- `acc-bags-adult-b`: beach bag with towel; fluffy heart purse; roller-skate bag.
- `acc-toys-little`: plush bunny; teddy bear; kitten plush. (Original designs.)
- `acc-toys-little-b`: toy sand bucket and spade; pull-along duck; small doll with yarn hair.
  (Original designs.)

---

## 6. New island places

Attach: `dist/assets/scenes/boardwalk.jpg`, `market.jpg`, `pavilion.jpg` (style reference) and
`dist/assets/scenes/mara.png` (resident style reference).

Backgrounds: 1152 x 720, opaque, same painted storybook style and color mood as the references.
The lower 40 percent is open, flat, walkable ground with nothing important on it (the characters
walk there). One clear point of interest object on the left or right third, at ground level. No
people, no text.

- `scene-beach`: sandy cove with turquoise water, a lifeguard chair and beach umbrellas; point of
  interest: a sandcastle kit by a towel.
- `scene-park`: playground park with a fountain, flower beds and a picnic lawn; point of interest:
  a kite stand.
- `scene-icecream`: ice-cream parlor street with pastel shopfronts and string lights; point of
  interest: an ice-cream cart.
- `scene-treehouse`: jungle clearing with a treehouse, rope bridge and waterfall; point of
  interest: a treasure chest.

For each background, also provide separate transparent overlay images at the same 1152 x 720
size and alignment, containing only the parts that should move or glow, so the game can animate
them: `-water` (water surface only), `-foliage` (flowers, palms and grass tips that sway),
`-lights` (lamps, lanterns, string lights, windows), `-sky` (clouds only). Do the same for the
three existing scenes and for `dist/assets/island.jpg` (the island map, 1536 x 1024), keeping the
existing images unchanged underneath.

Residents: one new character per new place, full body, front-facing, standing relaxed,
transparent background, 352 x 864 or larger at the same ratio, same style as `mara.png`:
a lifeguard teen (beach), a park gardener grandpa (park), an ice-cream seller (ice-cream street),
a young explorer with binoculars (treehouse). For each, also a second image with a talking
mouth-open expression and a third with a big smile.

---

## 7. House decorator

Attach: `dist/assets/scenes/market.jpg` (the Flower Market picture) as the style reference. The
house itself is new, so there is no house picture to attach; the reference only shows the painted
storybook style, color mood and level of detail the rooms and furniture should match.

Rooms: 1536 x 1024, opaque, empty rooms seen straight on like a dollhouse cutaway (back wall and
floor, slight perspective), no furniture, soft daylight. Provide each room in three wall/floor
color schemes.

- `room-bedroom`, `room-kitchen`, `room-living`, `room-bathroom`, `room-playroom`, `room-patio`.

Furniture and decor: transparent background, drawn in the same straight-on three-quarter view as
the rooms so they sit on the floor or hang on the wall convincingly, consistent light from the
upper left, no cast shadows. 4 x 3 grids of twelve items per sheet (one view per item, not four),
items not touching, consistent scale within a sheet (a bed is bigger than a lamp).

- `furn-bedroom-a`: canopy bed, single bed, bunk bed, wardrobe, dresser with mirror, bedside
  table, desk, desk chair, bookshelf, toy chest, beanbag, floor lamp.
- `furn-kitchen-a`: fridge, stove with oven, sink counter, corner counter, wall cabinets,
  kitchen island, dining table, dining chair, bar stool, toaster and kettle set, fruit bowl,
  hanging pots rack.
- `furn-living-a`: sofa, loveseat, armchair, coffee table, TV on a stand, fireplace, tall plant,
  side table, floor cushion, record player, bookshelf with trinkets, standing mirror.
- `furn-bathroom-a`: bathtub with bubbles, shower, sink vanity, toilet, towel rack, laundry
  basket, bath mat, mirror cabinet, shelf with bottles, rubber duck, potted fern, stool.
- `furn-playroom-a`: dollhouse, play kitchen, rocking horse, toy shelf, art easel, small table
  and chairs, ball pit, tent teepee, train set, plush pile, toy piano, building blocks.
- `furn-patio-a`: lounge chair, patio table with umbrella, grill, swing seat, kiddie pool,
  flower planter, string-light pole, garden gnome, bird bath, picnic blanket, lemonade stand,
  potted palm.
- `decor-walls-a`: framed picture, poster, wall clock, window with curtains, round window, wall
  shelf, fairy lights, heart mirror, pennant banner, hanging plant, wall lamp, star decals.
- `decor-floor-a`: round rug, rectangular rug, heart rug, pet bed with kitten, pet bed with
  puppy, fish tank on a stand, floor vase with flowers, disco ball on a stand, lava lamp, gift
  boxes, balloon bunch, potted hibiscus.
