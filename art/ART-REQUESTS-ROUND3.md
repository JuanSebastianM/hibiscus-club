# Art requests, round 3: dressed dolls in high resolution

## Why this round exists

Two problems in the game come from the art itself, not from the code:

1. **Clothes look pasted in front of the body.** Every outfit so far was drawn on a mannequin
   with slightly different proportions and then stretched by code onto the doll. Side and back
   views are mostly computed from the front drawing. That is why collars cover the neck, sleeves
   hang beside the arms, hands do not come out of cuffs and skirts go wavy from the side.
2. **Characters look blurry next to the scenery.** The base dolls are about 870 px tall and each
   outfit about 440 px tall. The scenes are 2388 px wide.

The fix for both: the image agent draws **the doll already wearing the outfit**, in high
resolution, from the same four camera angles as the base doll. The game then shows that dressed
body as one picture, so clothes cannot sit "in front of" a body: they were painted on it.
Head, hair, face, shoes and accessories stay separate layers as today.

Do the **pilot (block B)** first. If the pilot looks right in the game, do the rest (block C).

## Status (after the second delivery)

- **Done and in the game:** blocks A2 and A3 (both base dolls, with real detail) and block B (the
  three Grown-up pilot outfits, with the no-arm side views). Two Little Me outfits from a second
  image model (dino romper, rainbow tutu tee) are also in the game, at the old resolution.
- **Next, in this order:** block C for the Grown-up, block C for Little Me, block E (faces),
  block F (hair), block D (shoes).
- **Use the image model that edits the base picture in place** (the one that produced blocks A
  and B). The other model redrew the child for each picture, in three different canvas sizes, so
  seven of its nine outfits could not be used.

### Rules learned from the deliveries (they apply to every block below)

- **Edit the base file, never redraw the doll.** Head, hands, legs and feet must keep exactly the
  position, shape and colour they have in the base file, and the canvas must stay 1536 x 3072.
  (Their alpha values do not need to be preserved; see the next rule.)
- **Never paste a piece of the base picture over clothing.** A cap sleeve covers the shoulder all
  the way round. Where a hand hangs in front of a skirt, the skirt stays intact around the
  fingers: no wedge of skin, no dark line at the wrist.
- **Normalise the alpha:** every pixel inside the figure fully opaque (alpha 255), everything
  outside fully transparent (alpha 0), with a clean anti-aliased edge. The base files have alpha
  250-254 inside the body; correct that rather than keeping it. No black or coloured background.
- **The lavender bodysuit is a placeholder, never part of an outfit.** Wherever the outfit leaves
  the body bare (shoulders, neckline, back, midriff, thighs), remove the bodysuit and paint skin,
  continuing the base doll's own skin tone, shading and lighting with no visible seam. No
  lavender may remain anywhere. Follow the reference's neckline and hem exactly and do not reveal
  more than the reference shows.
- **State hem lengths against the body:** skirts and dresses end about 60 % of the way from the
  crotch to the knee unless the block says otherwise. (The pilot denim skirt came out at 35 %.)
- **No-arm side views are the same picture minus the arm:** identical pleats, hem, folds and
  outline, with only the near arm (and its sleeve) removed and the clothing behind it painted in.
  Deliver a short sleeve of the near arm as its own file, `...-left-sleeve.png` /
  `...-right-sleeve.png`, same canvas.
- **Paint with the image model; never composite.** Do not cut, warp, paste or upscale any part of
  the reference picture, and never fill skin with a flat colour. The reference shows the design
  only. Clothing must be as sharp as her face at 100 % zoom. (A whole batch was rejected for this.)
- **The four views show one garment.** Same print scale, same colours and the same details in the
  front, left, right and back pictures. (One right view came with a paler, larger print, so the
  game mirrors the left view instead.)
- **Clean bare skin:** no thin pale line along where the bodysuit strap used to be, no straight
  flat-topped edge on the arm under a sleeve frill, no loose specks beside hems.
- **Hoods:** deliver hooded outfits with the hood down, lying on the back, plus the separate
  hood-up layer described in block C.

## Shared rules (paste before every block)

You are producing art for a 2D paper-doll dress-up game. Hard requirements:

- You are given a base doll picture. Edit that picture; do not redraw the character. Her face,
  head size, body shape, proportions, skin tone, pose, hand position, lighting and camera must
  stay exactly as in the base picture. Only add the clothing.
- The pose never changes: standing straight, arms slightly away from the body, hands relaxed and
  open, feet in the same place.
- Clothes are worn like on a real person: the fabric wraps around the body, arms go through
  sleeves and hands come out of the cuffs, collars sit at the base of the neck and never cover
  the chin, skirts and trousers hang from the hips with gravity.
- No hair (keep the bare head exactly as in the base picture), no shoes (bare feet), no jewelry,
  no bags, no props. Those are separate layers in the game.
- Transparent background with real alpha. No ground shadow, no glow, no text, no border.
- Same canvas size and the same position of the doll on the canvas as the base picture, so the
  result can be laid exactly over the base picture.
- Original designs only. No logos or branded characters.
- Deliver PNG files with the exact file names given.

---

## A. High-resolution base dolls (do this first; everything else is edited from these)

Attach: `art/source/base-adult-turnaround.webp`, `art/source/base-little-turnaround.webp`.

**Status:** the Grown-up files were delivered and their size and position are exactly right, but
they are the old small picture enlarged about 3.2 times: at 100 % zoom the face, skin and outline
are soft and stair-stepped. Please redo them with block A2 below. The Little Me files were not
delivered: block A3 below is a standalone prompt for them.

Deliver eight files, each **1536 x 3072 px**, transparent, one view per file, the doll centred,
the top of the head 150 px from the top edge and the soles of the feet 150 px from the bottom
edge in every view:

- `base-adult-front.png`, `base-adult-left.png`, `base-adult-right.png`, `base-adult-back.png`
- `base-little-front.png`, `base-little-left.png`, `base-little-right.png`, `base-little-back.png`

"Left" means she faces the left edge of the picture; "right" means she faces the right edge.
The four views of one doll must be the same height and the same person.

### A2. Redo of the Grown-up base doll with real detail

Attach: the four delivered `base-adult-*.png` files (they fix the exact size, pose and position)
and `art/source/base-adult-turnaround.webp` (it fixes the character).

Repaint the Grown-up base doll with real detail at this size, in all four views. Do not enlarge
or upscale the attached picture: paint it again at full resolution.

- At 100 % zoom there must be no stair-stepped outline, no blocky pixels and no blur: crisp
  eyelashes, irises with a highlight, individual eyebrow hairs, lip texture, fingernails, toes,
  skin shading with smooth gradients, a clean anti-aliased outline.
- Keep exactly the same silhouette, pose, proportions, face, skin tone, bodysuit and position on
  the canvas as the attached files. Laid over them, the outlines must coincide.
- Deliver `base-adult-front.png`, `base-adult-left.png`, `base-adult-right.png`,
  `base-adult-back.png`, each 1536 x 3072 px, transparent.

### A3. Little Me base doll (not delivered yet)

Attach: `art/source/base-little-turnaround.webp` (it fixes the character) and one finished
`base-adult-front.png` from block A2 (it shows the level of detail and the canvas).

Paint the Little Me base doll (the toddler in the turnaround sheet) at full resolution with real
detail, in all four views. Same character, same face, same toddler proportions, same pose (standing
straight, arms slightly away from the body, hands relaxed), same simple bodysuit and bald head as
in her turnaround sheet, same lighting. Keep her age-appropriate.

- Same quality bar as block A2: nothing stair-stepped, blocky or blurred at 100 % zoom.
- Each file 1536 x 3072 px, transparent, one view per file, the doll centred, the top of her head
  150 px from the top edge and the soles of her feet 150 px from the bottom edge. She fills the
  canvas height like the Grown-up does; the game scales her down itself.
- "Left" means she faces the left edge of the picture; "right" means she faces the right edge.
  The four views must be the same height and the same child.
- Deliver `base-little-front.png`, `base-little-left.png`, `base-little-right.png`,
  `base-little-back.png`.

## B. Pilot: three dressed dolls, Grown-up only (do this before block C)

Attach: the four `base-adult-*.png` files from block A, plus the reference for each outfit:
`art/source/pack2/03-outfits/` sheet cell or the cropped card from `dist/assets/wear/`.

For each outfit below, edit each of the four base views so she wears it. Deliver four files per
outfit, same size and doll position as the base files:

1. `worn-adult-tennis-dress-{front,left,right,back}.png`: lilac polo tennis dress, small white
   collar lying flat at the base of the neck (neck and chin fully visible), short puff sleeves
   with a white band, pleated skirt to mid-thigh that hangs straight down from the hips.
2. `worn-adult-denim-jacket-skirt-{front,left,right,back}.png`: cropped light-blue denim jacket
   worn open over a white camisole, navy pleated denim mini skirt. Arms are inside the jacket
   sleeves, cuffs end at the wrists, both hands fully visible below the cuffs.
3. `worn-adult-crochet-cover-up-{front,left,right,back}.png`: sage-green open-mesh crochet
   cover-up dress with cap sleeves that sit on the shoulders, over a coral one-piece swimsuit
   that is clearly visible through the mesh. Hem at mid-thigh.

Check before sending: lay each file over the matching base file. The head, neck, hands, legs and
feet must line up exactly; only the clothing differs.

**Status of the pilot:** all twelve files line up exactly with the base and the clothes look
properly worn. Three things to correct when these are redone on the A2 base, and to follow for
every outfit in block C:

- **Never paste a piece of the base picture over the clothing.** In the crochet side views a
  rectangle of the bare arm covers the cap sleeve. Sleeves and caps lie over the shoulder; the arm
  comes out below them.
- **No trace of the lilac bodysuit may remain** under or beside the outfit (its leg lines show
  through the crochet mesh). Bare skin that a neckline uncovers keeps the base doll's shading (the
  chest under the open denim jacket came out flat and too saturated).
- **Keep the lengths of the reference design.** The denim skirt came out much shorter than the
  reference and the jacket more cropped. Skirt hems end at mid-thigh, as in the reference card.

Extra files that make the animation cleaner, for every outfit: in the **left and right views**
also deliver the same picture **without the near arm** (the arm closest to the camera removed, the
clothing behind it painted in), same canvas, named `...-left-noarm.png` and `...-right-noarm.png`.

## C. The rest of the wardrobe (next)

One request per outfit. For each outfit, attach exactly **five files**:

1. The four base pictures of that doll, the ones the image model delivered in block A2/A3 and
   that you already have: `base-adult-front.png`, `base-adult-left.png`, `base-adult-right.png`,
   `base-adult-back.png` (for Little Me: the four `base-little-*.png`). These are the pictures
   to edit.
2. The outfit's **reference picture** from `art/refs/round3/` in this repository (see the tables
   below). Each one is a single JPG showing the outfit as it is in the game today, on the doll,
   from the front, left, right and back.

The reference picture shows the **design only**: the garments, colours, patterns, details and
lengths. It was assembled by the game from flat drawings, so it has small flaws (soft edges, odd
sleeve openings, seams). Do not copy the flaws, the hair or the low resolution: paint the outfit
properly on the base pictures.

Then paste the shared rules, the "Rules learned" list, and this prompt, with the outfit id filled
in:

> Edit each of the four attached base pictures so she wears the outfit shown in the attached
> reference picture. Keep the reference's design, colours, patterns and lengths. Deliver
> `worn-{doll}-{outfit-id}-front.png`, `-left.png`, `-right.png`, `-back.png`, and for the side
> views also `-left-noarm.png`, `-right-noarm.png` (same picture without the near arm) and, if
> the outfit has sleeves, `-left-sleeve.png`, `-right-sleeve.png` (the near arm's sleeve alone).
> Every file 1536 x 3072 px, transparent, the doll in exactly the same place as in the base
> pictures.

### Grown-up (15 outfits; `{doll}` = `adult`)

| Outfit id | Reference picture to attach | Notes |
|---|---|---|
| `hibiscus-flares` | `art/refs/round3/ref-adult-hibiscus-flares.jpg` |  |
| `lilac-satin-bow-dress` | `art/refs/round3/ref-adult-lilac-satin-bow-dress.jpg` |  |
| `green-hibiscus-sundress` | `art/refs/round3/ref-adult-green-hibiscus-sundress.jpg` |  |
| `black-flares-set` | `art/refs/round3/ref-adult-black-flares-set.jpg` |  |
| `pink-velour-cargo` | `art/refs/round3/ref-adult-pink-velour-cargo.jpg` |  |
| `sarong-swimsuit` | `art/refs/round3/ref-adult-sarong-swimsuit.jpg` |  |
| `tankini-board-shorts` | `art/refs/round3/ref-adult-tankini-board-shorts.jpg` |  |
| `aqua-velour-tracksuit` | `art/refs/round3/ref-adult-aqua-velour-tracksuit.jpg` |  |
| `baby-tee-cargo` | `art/refs/round3/ref-adult-baby-tee-cargo.jpg` |  |
| `sequin-halter-dress` | `art/refs/round3/ref-adult-sequin-halter-dress.jpg` |  |
| `butterfly-satin-skirt` | `art/refs/round3/ref-adult-butterfly-satin-skirt.jpg` |  |
| `puffer-vest-slip-dress` | `art/refs/round3/ref-adult-puffer-vest-slip-dress.jpg` |  |
| `plaid-knit-vest-set` | `art/refs/round3/ref-adult-plaid-knit-vest-set.jpg` |  |
| `hoodie-dress-leg-warmers` | `art/refs/round3/ref-adult-hoodie-dress-leg-warmers.jpg` |  |
| `denim-overall-dress` | `art/refs/round3/ref-adult-denim-overall-dress.jpg` |  |

Already done: `tennis-dress`, `denim-jacket-skirt`, `crochet-cover-up` (their reference pictures
are in the folder too, in case you want the denim skirt redone at its original length).

### Little Me (15 outfits; `{doll}` = `little`; keep every design age-appropriate for a toddler)

| Outfit id | Reference picture to attach | Notes |
|---|---|---|
| `yellow-dot-dress` | `art/refs/round3/ref-little-yellow-dot-dress.jpg` |  |
| `lilac-cord-pinafore` | `art/refs/round3/ref-little-lilac-cord-pinafore.jpg` |  |
| `pink-gingham-bow-dress` | `art/refs/round3/ref-little-pink-gingham-bow-dress.jpg` |  |
| `denim-overalls` | `art/refs/round3/ref-little-denim-overalls.jpg` |  |
| `mint-cardigan-dress` | `art/refs/round3/ref-little-mint-cardigan-dress.jpg` |  |
| `star-pajamas` | `art/refs/round3/ref-little-star-pajamas.jpg` |  |
| `ruffle-swimsuit` | `art/refs/round3/ref-little-ruffle-swimsuit.jpg` |  |
| `rash-guard-set` | `art/refs/round3/ref-little-rash-guard-set.jpg` |  |
| `beach-poncho` | `art/refs/round3/ref-little-beach-poncho.jpg` | hood down, lying on her back; plus the hood-up layer |
| `rainbow-tutu-tee` | `art/refs/round3/ref-little-rainbow-tutu-tee.jpg` | in the game at low resolution; redo at full size |
| `dino-romper` | `art/refs/round3/ref-little-dino-romper.jpg` | in the game at low resolution; redo at full size |
| `tulle-party-dress` | `art/refs/round3/ref-little-tulle-party-dress.jpg` |  |
| `raincoat-set` | `art/refs/round3/ref-little-raincoat-set.jpg` | hood down; plus the hood-up layer |
| `bear-onesie` | `art/refs/round3/ref-little-bear-onesie.jpg` | hood down; plus the hood-up layer |
| `ballet-wrap-set` | `art/refs/round3/ref-little-ballet-wrap-set.jpg` |  |

For the three hooded outfits also deliver a separate hood-up layer, four views each, same canvas:
`hood-little-{outfit-id}-{front,left,right,back}.png`, showing only the hood worn up over the
bare head (face fully open), nothing else.

## D. Shoes on the high-resolution feet (after block A)

Attach: the base files from block A and `art/source/sheet-shoes.webp`,
`art/source/pack2/04-shoes/`.

For each pair, edit the four base views so she wears the shoes and nothing else changes. Crop is
not needed: deliver full-canvas files named `shoes-{adult|little}-{shoe-id}-{view}.png`. The foot
sits inside the shoe: sole under the foot, straps over it, the ankle entering the shoe opening.
Heels lift the heel of the foot; the toes stay on the ground line.

## E. Faces on the new base dolls (after block C)

Attach: `base-adult-front.png`, `base-adult-left.png` (and the Little Me ones for her set), plus
the current expression sheets as the list of expressions: `art/source/pack2/02-faces/` and
`art/source/round2/talking-mouths/`.

The game swaps the face for blinks, talking and laughing. Those faces were drawn on the old, soft
doll, so they look smoother than the new detailed face. Redraw each expression **as an edit of
the base file**: same canvas, same head, only the eyes, brows, mouth and cheeks change. Nothing
below the chin changes.

- Per doll, front view and left view (the game mirrors left to get right).
- Expressions: eyes closed (blink); mouth shapes "eh", "oh", "ah" on a neutral face; the same
  three on a smiling face; smiling with closed mouth; big smile; laugh with eyes squeezed;
  surprised.
- File names `face-{adult|little}-{front|left}-{expression}.png`, e.g.
  `face-adult-front-blink.png`.

## F. Hair on the new base dolls (after block E)

Attach: the four base files of the doll and the current hair sheets (`art/source/pack2/01-hair/`,
`art/source/round2/hairstyles/`) as the designs.

For each hairstyle, edit the four base views so she wears the hair and nothing else changes: same
canvas, the face stays fully open, the hair grows from the hairline with no gap at the temples or
ears. Also deliver each view as **hair only** on a transparent canvas (same size and position),
named `hair-{adult|little}-{style-id}-{view}.png`, so the game can recolour it. Natural dark
brown; the game applies the other colours.
