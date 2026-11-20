# Hibiscus Club

Hibiscus Club is a single-player browser game inspired by early-2000s fashion-doll CD-ROMs. Dress the same character at two ages from head to toe, spend the stars you earn in the island shop, rehearse a runway routine, and turn a favorite look into a downloadable postcard. The five buildings on Hibiscus Island are playable destinations.

## Play locally

Use Node.js 16.14 or later and a modern browser. From the project directory, run the following command.

```sh
node serve.cjs
```

Open [Hibiscus Club on this computer](http://127.0.0.1:4173). The server binds to your computer’s loopback address. Stop it with Ctrl+C. If that port is busy, run `node serve.cjs 4180` and open the address printed in the terminal. The game uses bundled artwork and runs offline while the local server is running. There are no packages to install.

You can also put the contents of `dist/` on a static web host. Serve the files together from the same origin so the browser can export postcard images. The existing Sites project uses the static directory specified in `.openai/hosting.json`.

## Deploy to Cloudflare Workers

`wrangler.jsonc` configures an assets-only Worker named `hibiscus-club` that serves `dist/`. There is no Worker script, and rooms use URL hashes, so no routing rules are needed. From the project directory, run the following command. Wrangler asks you to sign in to Cloudflare the first time.

```sh
npx wrangler deploy
```

Add `--dry-run` to check the configuration without uploading anything.

## A first trip around the island

1. Pick **Grown-up** or **Little Me** on the player card. Each character remembers her own look.
2. Open **Dress-Up Studio**. The tabs hold **Outfits**, **Shoes**, **Jewelry** (earrings and necklaces) and **Scenery**. Choose a card to put it on. The selected item’s color swatches appear under the rack. The stage zooms in on the part you are styling.
3. Visit the **Beauty Salon** for **Hair** (style and color), **Makeup** (lips, blush, eyeshadow and face gems), **Nails** and **Accessories** (clips and bows). Little Me sees only the options made for her age, so she has no Nails tab or eyeshadow.
4. Tap **Surprise me!** in either room for a random look built from what you own, usually around one color family. **Save look** keeps up to six favorite looks per character. Tap a favorite to wear it again, or tap its × to remove it after a confirmation.
5. From the studio or salon, choose **Walk the island runway** to rehearse. Watch the three marks, then repeat them in order. **Replay cues** repeats the same routine.
6. In the **Photo Booth**, choose scenery, a frame, and a corner sticker, then take a photo. The style challenge card lists exactly what to wear, ticks off what she already has on, and links to the right room and tab. A successful photo advances the challenge.
7. Open **Scrapbook** to download a 640 × 860 PNG. The album holds 24 postcards. Removing a postcard asks for confirmation and frees one space. Download favorites before clearing browser data.

Use a mouse or touch, or Tab and Shift+Tab to move between controls. Enter activates links and buttons. Space also activates buttons. In the studio and salon, the arrow keys move between tabs. Escape closes dialogs. Sound starts on: an endless, cheerful background tune begins with your first click or key press and keeps playing as you move between rooms, with sparkles for clicks and a fanfare for wins. The speaker in the top bar turns the music and sound effects off or on together, and the game remembers your choice.

## Island Life

Choose **Explore Island Life** on the player card, pick either age, and use **Choose a name**. Click or tap the ground to walk. A second click redirects her. You can also focus the scene and use the arrow keys. Select a resident or object to walk within reach and interact. Use the three travel cards to change districts.

Mara collects shells on Pearl Boardwalk, Rosa tends the Flower Market, and Kit runs the Starlight Pavilion. Ask about their work to become friends, or offer to help to start a task. The journal records the next action and destination, and the bag shows what you’re carrying. The three errands award 6, 8, and 10 stars once per character. Each age remembers her own name, location, friendships, and task progress. Both share the star wallet.

**Take a scenic postcard** uses your current location in the photo booth. The studio and booth also let you select any district or the original pink studio. Saved postcards retain the scenery you chose.

## Stars and stamps

| Activity | How to finish | Reward |
| --- | --- | --- |
| Star Arcade | Find all six pairs in Memory Match. Each two-card attempt counts as a turn. | 8 stars and a personal best if you improve |
| Flower Garden | Pick the three flowers on the order, including any repeated stems. Selection order is flexible. Wrap the bouquet to deliver it. | 5 stars and the next order |
| Island Runway | Repeat all three spotlight marks in order. | 6 stars |
| Island Life errands | Finish each resident’s task, once per character. | 6, 8 and 10 stars |
| Style challenge | Photograph the two pieces the brief names. Eight briefs rotate, and each one can be met by both characters with free starter options. | 10 stars and the next brief |

At 10 stars earned in all, **Golden hour** becomes available in the booth for both characters. Spending stars never locks it again. Visiting each map destination adds its stamp to the island passport.

## The star shop

Both characters share one wallet. The top bar shows the stars you can spend. Hover over it to see the lifetime total. A generous starter wardrobe is free, and the rest costs 5 to 25 stars:

| Category | Free for both characters | Costs stars |
| --- | --- | --- |
| Outfits | Three per character, including both default looks | Lilac Satin Bow Dress 20, Double Denim Darling 15, Midnight Mall Flares 25, Lilac Daisy Pinafore 15, Mint Blossom Cardi Dress 20, Starry Sleepover PJs 25 |
| Colorways | The original and the first alternative for every item | Later outfit and shoe colors 5, Rose gold hoops 6 |
| Shoes | Defaults, the sneakers, and barefoot | Lilac Mary Jane Heels 12, Strawberry Puddle Boots 12 |
| Hair | Beach Babe Waves, Sassy Side Pony, Ringlet Pigtails, Bouncy Curly Bob | Half-Up Curl Cascade 15, Cutie Curl Buns 18 |
| Hair color | Espresso, Jet Black, Chestnut, Honey Blonde | Strawberry Blonde 10, Bubblegum Pink 20, Lilac 20 |
| Jewelry | Golden Glam Hoops, Pearl Studs, Sweetheart Studs, Pearl & Starfish Necklace, or none | Twinkle Star Studs 8, Butterfly Kisses Necklace 12 |
| Hair accessories | Five clips and bows, or none | Flutter Butterfly Clip 10 |
| Makeup | Natural, Rose Nude and Peach Gloss lips; Strawberry Tint for Little Me; three blushes; Pink Frost and Lilac Dream eyeshadow; three face gems | Bubblegum Gloss 8, Cherry Red 10, Berry Crush 10, Cherry Gloss 6, Berry blush 6, Gold Shimmer 8, Aqua Splash 8, Bronze 10, Glitter glow 6, Crystal tears 8, Butterfly gem 10 |
| Nails (Grown-up) | Bare, Bubblegum, Coral | Cherry 6, Lilac 6, Pearl White 8 |

Locked options show a lock and their price. Choosing one puts it on her as a try-on, and the stage shows **Buy** and **Put back**. Buying asks for confirmation, takes the stars, and keeps the item. A **new!** tag marks it for the rest of the visit. If you don’t have enough stars, the Buy button says how many more you need. Try-ons are never saved. They are left out of saved looks, favorites and postcards, and her look reverts when you leave the room or switch characters. The prices live in `dist/shop.js`.

## How the game was built

The original project supplied a page shell, a flower emblem, an icon library, and a static hosting manifest. The finished game uses HTML, CSS, and browser JavaScript with no build step or dependencies. Every script shares the page’s global scope, in the order `index.html` loads them. A URL hash identifies each room, so links, refresh, and the browser’s Back button work with static hosting.

Each character is a layered paper doll. A base doll picture per age sits under transparent sprites for the outfit, shoes, hairstyle, jewelry and hair accessories. Makeup, nail polish, hair color and colorways are pixel recolors done once and cached. `composeDoll()` builds a dressed doll on one transparent canvas. The player card, studio, salon, booth, runway, Island Life walker, favorites and postcards all draw from it. A saved postcard records the character and every look choice, so the renderer recreates it for display and PNG export. The island is an original AI-generated illustration with five HTML links positioned over its buildings. The gingham, paper frames, stamps, and game controls are drawn with CSS and vector icons.

| File | Responsibility |
| --- | --- |
| `dist/index.html` | Page shell, navigation, accessible dialogs, script loading |
| `dist/style.css` | Responsive island layout, booth, game tables, and scrapbook |
| `dist/makeover.css` | Studio and salon: sticky doll stage, tabs, item cards, swatches, shop tags, try-on bar, favorites |
| `dist/game.js` | Room navigation, character choices, memory game, bouquet orders, style challenges, rewards, and saves |
| `dist/catalog.js` | Wardrobe catalog: every item, its art, colorways and fit, makeup and hair-color lists, look validation |
| `dist/portrait.js` | Paper-doll compositing, recolors, makeup, face gems, postcard frames, and Canvas 2D rendering |
| `dist/shop.js` | Star-shop prices and ownership, coordinated Surprise me looks, cached option and favorite thumbnails |
| `dist/makeover.js` | Dress-Up Studio and Beauty Salon controls, try-on and buying, favorite looks, and the turn control |
| `dist/island-life.js` and `dist/island-life.css` | Movement, scene layout, character naming, conversations, inventory, and task progression |
| `dist/music.js` | Procedural background music loop and sound effects synthesized with the Web Audio API |
| `dist/fx.js` | Glitter pointer trail, sparkle bursts, and win confetti on one overlay canvas |
| `dist/runway.js` | Spotlight sequence, replay, input checking, and rehearsal reward |
| `dist/icons.js` | Interface icons |
| `dist/assets/` | Doll bases, item sprites, scenes, wordmark, and island art |
| `art/` | Source sheets and the slicing scripts that produce the sprites |
| `serve.cjs` | Dependency-free local HTTP server |
| `wrangler.jsonc` | Cloudflare Workers static-assets configuration |

To add a wearable, put its sprite in `dist/assets/items/`, add an entry with its fit to `catalog.js`, and give it a price in `shop.js` if it should be sold. Option thumbnails are drawn lazily, one per frame, and cached for the visit. Choosing an option rebuilds only the controls and repaints the existing doll canvas, so the doll never blinks out. The studio’s turn control appears only when `CATALOG.views` lists more than the front view.

Island Life uses three illustrated JPEG backgrounds. Each scene composes the active doll once in her current look. Movement updates her transform with requestAnimationFrame, scales her with depth, and stops scheduling frames on arrival. The reduced-motion setting moves her directly to the destination. Scene coordinates are normalized so saved positions work on different screen sizes.

## Saves and compatibility

The game stores character looks, stars, stamps, challenge progress, delivered bouquets, best memory score, audio preference, and scrapbook in the browser’s `localStorage` under `hibiscus-club-v1`. The shop adds `spent` (stars spent, while `stars` stays the lifetime total), `owned` (bought option keys such as `item:butterfly-clip`, `tint:gold-hoops:rose-gold`, `hair-color:lilac` or `lips:cherry`) and `favorites` (up to six looks per character). Everything read back is validated. Older saves keep working: integer-style looks are mapped to the catalog, and anything a saved look or favorite already wears stays owned. An unfinished memory round, bouquet, or rehearsal lasts for the current page session. Leaving the runway ends that rehearsal.

Each browser profile and site address has its own save. Using a different port gives you a separate game. Private browsing or clearing site data can erase progress. If the browser blocks storage, the current session remains playable. Exported PNGs remain wherever you downloaded them.

## Verification

The game was exercised in Chromium at 1440 × 960 and with a 375 × 812 phone viewport. The checks covered every tab and option type on both characters, with keyboard focus kept on the chosen option. They also covered trying on and leaving (reverted), trying on and buying (the balance drops and persists after a reload), refusing a purchase without enough stars, and Golden hour staying unlocked after spending. Surprise me was run hundreds of times, using owned options only. Favorites were saved, worn and removed. Three style challenges were completed, and a postcard PNG was downloaded. An old integer-format save was migrated with stars and photos. The runway and Island Life were checked for the current look. All rooms and tabs were checked for horizontal overflow at phone width, with no console errors.

Hibiscus Club is an independent game inspired by the era’s dress-up games.

