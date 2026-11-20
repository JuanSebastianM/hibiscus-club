# Hibiscus Club

Hibiscus Club is a single-player browser game inspired by early-2000s fashion-doll CD-ROMs. Dress the same character at two ages from head to toe, spend the stars you earn in the island shop, rehearse a runway routine, and turn a favorite look into a downloadable postcard. The five buildings on Hibiscus Island are playable destinations.

## Play locally

Use Node.js 16.14 or later and a modern browser. From the project directory, run the following command.

```sh
node serve.cjs
```

Open [Hibiscus Club on this computer](http://127.0.0.1:4173). The server binds to your computer’s loopback address. Stop it with Ctrl+C. If that port is busy, run `node serve.cjs 4180` and open the address printed in the terminal. The game uses bundled artwork and runs offline while the local server is running. There are no packages to install. Play statistics are switched off on a local address, so `serve.cjs` never sends anything.

You can also put the contents of `dist/` on a static web host. Serve the files together from the same origin so the browser can export postcard images.

## Deploy to Cloudflare Workers

`wrangler.jsonc` configures a Worker named `hibiscus-club`. The game is the static assets in `dist/`, and rooms use URL hashes, so no routing rules are needed. A small Worker script, `worker/index.js`, runs only for `/api/*` and `/stats` (the anonymous play statistics, below). `assets.run_worker_first` lists those two paths, so every game file is served straight from static assets without invoking the script. The game keeps working even if the script fails or runs out of free requests. From the project directory, run the following command. Wrangler asks you to sign in to Cloudflare the first time.

```sh
npx wrangler deploy
```

Add `--dry-run` to check the configuration without uploading anything. It should list the `EVENTS` Analytics Engine dataset and the `ASSETS` binding.

The repository can also be connected to Cloudflare with Workers Builds (Workers & Pages → Create → Import a repository). Cloudflare then reads `wrangler.jsonc` and redeploys on every push to `main`. The Worker's page lists its public address under Settings → Domains & Routes. Preview builds of other branches get no Analytics Engine dataset or secrets (the `previews` block is empty), so on a Preview URL events are accepted and dropped, and `/stats` shows its setup page.

## Visitor and play statistics

The game counts visits and play anonymously, so the owner can see how many people visit, when, from which countries, and what they play. There are two parts. Cloudflare Web Analytics, which is optional, counts page views. The game’s own events go to a Workers Analytics Engine dataset named `hibiscus_club_events`, and the private page at `/stats` shows them.

### What is collected

Each event stores the event name, a short detail from a fixed list, the character (`adult` or `little`), the game language (`en` or `es`), a count, the two-letter country Cloudflare derives for the request, and a coarse device class (`phone`, `tablet` or `desktop`). The Worker works out the device class from the browser’s User-Agent and then discards the User-Agent. Analytics Engine adds a timestamp. Purchases also store a price band.

Nothing else is stored or logged: no IP addresses, User-Agents, referrers, player-chosen names, cookies, local-storage identifiers, fingerprints, or any value that could link two visits by the same person. Visits are page loads, not people. The Worker rejects a request whole if it contains anything outside the lists below (`worker/events.js`), if it comes from another site, or if it is larger than 4 KB.

| Event | Detail | When |
| --- | --- | --- |
| `visit` | the room the page opened on | page load |
| `room` | `map`, `wardrobe`, `salon`, `booth`, `scrapbook`, `arcade`, `garden`, `runway`, `life` | a room opens |
| `district` | `boardwalk`, `market`, `pavilion` | Island Life travel |
| `lang` | `en`, `es` | language switched |
| `character` | `adult`, `little` | character switched |
| `makeover` | `outfit`, `shoes`, `jewelry`, `hair`, `hair-color`, `makeup`, `nails`, `accessory` | something she owns is put on (counted per category, sent with a count) |
| `tryon` | the same categories | a locked option is tried on (counted like `makeover`) |
| `purchase` | the same categories, plus price band `1-9`, `10-19` or `20-plus` | each option bought |
| `surprise` | `wardrobe`, `salon` | Surprise me! |
| `favorite` | `saved`, `worn` | a favorite look is saved or worn |
| `game-start`, `game-done` | `memory`, `bouquet`, `runway` | first card, first flower or rehearsal start; win |
| `chat` | `boardwalk`, `market`, `pavilion` | she walks up to a resident |
| `errand` | `story-1`, `story-2`, `story-3` | an Island Life errand is finished |
| `photo` | `studio`, `boardwalk`, `market`, `pavilion` (the scenery) | a postcard is taken |
| `challenge` | the brief: `picnic`, `disco`, `seashell`, `mall`, `rosy`, `midnight`, `homecoming`, `bob` | a style challenge is completed |
| `postcard` | `png` | a postcard is downloaded |
| `sound`, `sparkle` | `on`, `off` | the top-bar toggles |

`dist/analytics.js` checks every event against the same lists, adds up makeover and try-on changes, and sends batches with `navigator.sendBeacon` (or `fetch` with `keepalive`) when the page is hidden or every 20 seconds. Sending never delays the game, and a failed request is dropped. Nothing is sent from `localhost`, `127.0.0.1` or a `file:` page, when the browser sends Global Privacy Control or Do Not Track, or when the player turns sharing off. A small **Privacy** link at the bottom of every page opens a dialog that explains this in plain words in both languages and has the on/off switch. The island guide (**How to play**) points to it. The switch is saved with the game as `state.analytics` and is on by default.

To add an event, add it to `SCHEMA` in both `worker/events.js` and `dist/analytics.js`, call `track('event','detail')` in the game, and run the tests. The tests fail if the two lists differ or if the game uses a name that is not listed.

Analytics Engine keeps events for three months. It is available on the Workers Free plan (100,000 data points written and 10,000 read queries a day). The dataset is created on the first write. Each `/stats` page view runs three read queries.

### Set up the stats page

1. Create an API token: My Profile → API Tokens → Create Token → Create Custom Token. Give it one permission, **Account → Account Analytics → Read**, limited to your account.
2. In Workers & Pages → hibiscus-club → Settings → Variables and Secrets, add three variables of type **Secret**:
   - `STATS_KEY`: a long random password of at least 16 characters, for example from `openssl rand -base64 24`
   - `CF_ACCOUNT_ID`: your account ID (shown on the Workers & Pages overview)
   - `CF_API_TOKEN`: the token from step 1

   Alternatively, run `npx wrangler secret put STATS_KEY` (and the same for the other two). Never put them in `wrangler.jsonc`.
3. Open `https://<your worker address>/stats` and enter the stats key. A private cookie (HttpOnly, Secure, SameSite=Strict, limited to `/stats`) keeps you signed in for seven days. It holds a signed expiry, not the key. **Sign out** removes it. Changing `STATS_KEY` signs everyone out.

Until all three secrets are set, `/stats` shows these steps and no data. The page shows visits per day (per hour for 24 hours), top countries, devices, the game language, rooms, mini-game starts against completions, makeover changes and try-ons by category, purchases by category and price band, postcards, challenges, favorites, Surprise me!, Island Life, and settings, for 24 hours, 7 days, 30 days or 90 days. It is server-rendered, makes no third-party requests and is marked `noindex`. Analytics Engine may sample busy events. Every stored row stands for `_sample_interval` real events, so the page counts `SUM(_sample_interval * double1)` and says so when any figure is an estimate.

### Cloudflare Web Analytics (optional)

1. In the Cloudflare dashboard, open Web Analytics → Add a site, and enter the game’s hostname (for example `hibiscus-club.<your-subdomain>.workers.dev`).
2. In Manage site, copy the `token` value from the JS snippet. It is 32 hexadecimal characters.
3. In `dist/index.html`, paste it between the quotes of `<meta name="cf-web-analytics-token" content="">` in the `<head>`, then deploy.

`analytics.js` loads Cloudflare’s beacon only when that token is present, and under the same rules as the game’s events: not on a local address, not with Global Privacy Control or Do Not Track, and not when the player turned sharing off. Turning the switch off takes effect for the beacon at the next page load. The beacon follows single-page navigation automatically. Room changes are also counted by the game’s own `room` events.

### Run it locally

`node serve.cjs` plays the whole game with statistics silently off. To exercise the Worker, run `npx wrangler dev --port 8790` and open `http://localhost:8790`. To try `/stats`, put test values for the three secrets in a `.dev.vars` file next to `wrangler.jsonc` (it is git-ignored). Locally, Analytics Engine writes are discarded, and the stats page calls the real SQL API with whatever account and token you give it. The browser side stays off on `localhost`, so test it under another hostname. Run `node --test` to check the event lists, validation and translation keys.

### Turn it off

- One player: the switch in the **Privacy** dialog (link at the bottom of every page), Global Privacy Control, or Do Not Track.
- Web Analytics: empty the token in `index.html`, or remove the site in the dashboard.
- Everything: remove `main`, `binding`, `run_worker_first` and `analytics_engine_datasets` from `wrangler.jsonc` to return to an assets-only Worker. The game then sends to a missing `/api/e`, which is harmless. Alternatively, also remove the `analytics.js` script tag from `index.html`. Delete the secrets and the API token when you no longer need them.

## A first trip around the island

1. Pick **Grown-up** or **Little Me** on the player card. Each character remembers her own look.
2. Open **Dress-Up Studio**. The tabs hold **Outfits**, **Shoes**, **Jewelry** (earrings and necklaces) and **Scenery**. Choose a card to put it on. The selected item’s color swatches appear under the rack. The stage zooms in on the part you are styling. **Front**, **Left**, **Right** and **Back** under the stage turn her around in whatever she is wearing.
3. Visit the **Beauty Salon** for **Hair** (style and color), **Makeup** (lips, blush, eyeshadow and face gems), **Nails** and **Accessories** (clips and bows). Little Me sees only the options made for her age, so she has no Nails tab or eyeshadow.
4. Tap **Surprise me!** in either room for a random look built from what you own, usually around one color family. **Save look** keeps up to six favorite looks per character. Tap a favorite to wear it again, or tap its × to remove it after a confirmation.
5. From the studio or salon, choose **Walk the island runway** to rehearse. Watch the three marks, then repeat them in order. **Replay cues** repeats the same routine.
6. In the **Photo Booth**, choose scenery, a frame, and a corner sticker, then take a photo. The style challenge card lists exactly what to wear, ticks off what she already has on, and links to the right room and tab. A successful photo advances the challenge.
7. Open **Scrapbook** to download a 640 × 860 PNG. The album holds 24 postcards. Removing a postcard asks for confirmation and frees one space. Download favorites before clearing browser data.

Use a mouse or touch, or Tab and Shift+Tab to move between controls. Enter activates links and buttons. Space also activates buttons. In the studio and salon, the arrow keys move between tabs. Escape closes dialogs. Sound starts on: an endless, cheerful background tune begins with your first click or key press and keeps playing as you move between rooms, with sparkles for clicks and a fanfare for wins. The speaker in the top bar turns the music and sound effects off or on together, and the game remembers your choice.

## English and Spanish

The whole game is bilingual. **EN | ES** in the top bar (and in the island guide) switches every screen, dialog, announcement, item name and new postcard caption at once, without reloading or losing the current room, try-on or game round. The choice is saved with the game. With no saved choice, the game starts in Spanish when the browser's preferred language begins with `es`, and in English otherwise. Player-chosen names are never translated. In Spanish, Grown-up is **Yo Grande** and Little Me is **Yo Chiquita**.

## Island Life

Choose **Explore Island Life** on the player card, pick either age, and use **Choose a name**. Click or tap the ground to walk. She turns to a side view while she walks and faces you when she stops. A second click redirects her. You can also focus the scene and use the arrow keys. Select a resident or object to walk within reach and interact. Use the three travel cards to change districts.

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

The original project supplied a page shell, a flower emblem, and an icon library. The finished game uses HTML, CSS, and browser JavaScript with no build step or dependencies. Every script shares the page’s global scope, in the order `index.html` loads them. A URL hash identifies each room, so links, refresh, and the browser’s Back button work with static hosting.

Each character is a layered paper doll with four views: front, left, right and back. A bald base doll picture per age and view sits under transparent sprites for the outfit, shoes, hairstyle, jewelry and hair accessories. The catalog stores a fit for every item on every doll and view. Outfits are warped row by row to the body, long sleeves are placed along the arms, and in side views the near arm is cut from the base and drawn over the outfit. The base dolls wear a lilac bodysuit, which is repainted in skin tone wherever an outfit would let it show, and an outfit is always drawn. Because the base dolls are bald, each hairstyle is drawn over a scalp layer: hair in the same color, combed in the style's direction, painted on the skull above a natural hairline so no bare scalp shows around the sprite. Side and back view art loads only when a view is first used. Makeup, nail polish, hair color and colorways are pixel recolors done once and cached. `composeDoll()` builds a dressed doll on one transparent canvas. The player card, studio, salon, booth, runway, Island Life walker, favorites and postcards all draw from it. A saved postcard records the character and every look choice, so the renderer recreates it for display and PNG export. The artwork is AI-generated. The dolls and wearables arrived as sheets: a four-view turnaround of each base doll, front-view sheets of the outfits, hair, shoes and jewelry, and four-view sheets of the same items. `art/slice.py` and `art/slice_views.py` cut the sheets into trimmed sprites by following the alpha channel, clean the edges, and write a manifest of sizes and parts. `art/crop_dolls.py` crops the base figures onto a shared foot baseline. `art/fit_views.py` generates the side and back outfit warps, and `art/lab.html` renders contact sheets of every item on every doll, which is how the fits were tuned by eye. The source sheets are kept in `art/source/` and are not deployed.

The music is synthesized live in the browser by `dist/music.js` with the Web Audio API. There are no audio files or samples. An original tune in C major at 118 beats per minute is written as note strings, one character per sixteenth note, and arranged in six sections (sparkle intro, verse, chorus, second verse, bridge, second chorus) that make a 44-bar cycle of about 90 seconds and repeat for as long as the game is open. A look-ahead scheduler wakes every 25 ms and queues the notes for the next 160 ms on the audio clock, so timing stays steady. Bell lead, plucked chords, pad, bass, kick, clap, hat and shaker are built from oscillators and filtered noise, and pass through a delay, a generated reverb, a compressor and a limiter. Click sparkles and the win fanfare use the same audio context and output chain. Browsers require a user gesture before audio, so the music fades in on the first click or key press. It pauses while the tab is hidden, and the speaker button fades everything out and remembers the choice.

`dist/fx.js` draws the glitter pointer trail, click bursts and win confetti on one overlay canvas that ignores pointer input. Its animation loop stops when no particles are left. The sparkle button in the top bar turns the effects off, and the reduced-motion setting replaces them with a brief still sparkle.

The island is an original AI-generated illustration with five HTML links positioned over its buildings. The gingham, paper frames, stamps, and game controls are drawn with CSS and vector icons.

| File | Responsibility |
| --- | --- |
| `dist/index.html` | Page shell, navigation, Privacy footer link, accessible dialogs, script loading, Web Analytics token |
| `dist/analytics.js` | Anonymous play statistics: event lists, batching, privacy checks, optional Web Analytics beacon |
| `dist/i18n.js` | Translation layer (`t()`, plurals, language choice) and the English dictionary |
| `dist/i18n-es.js` | Spanish dictionary |
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
| `art/` | Source sheets, the slicing, cropping and fitting scripts, and the contact-sheet lab |
| `serve.cjs` | Dependency-free local HTTP server |
| `wrangler.jsonc` | Cloudflare Workers configuration: static assets, the Worker routes and the Analytics Engine dataset |
| `worker/index.js` | Worker script for `/api/e` (event intake) and `/stats` |
| `worker/events.js` | Event lists and validation shared by the Worker and the tests |
| `worker/stats.js` | Private stats page: sign-in, SQL API queries, server-rendered HTML |
| `test/analytics.test.mjs` | `node --test`: event lists in sync, validation, privacy rules, translation keys |

To add a wearable, put its sprite in `dist/assets/items/`, add an entry with its fit to `catalog.js`, and give it a price in `shop.js` if it should be sold. Option thumbnails are drawn lazily, one per frame, and cached for the visit. Choosing an option rebuilds only the controls and repaints the existing doll canvas, so the doll never blinks out. The studio’s turn control lists the views in `CATALOG.views`.

Island Life uses three illustrated JPEG backgrounds. Each scene composes the active doll’s front, left and right views once in her current look and shows the side view that matches her walking direction. Movement updates her transform with requestAnimationFrame, scales her with depth, and stops scheduling frames on arrival. The reduced-motion setting moves her directly to the destination. Scene coordinates are normalized so saved positions work on different screen sizes.

### Credits

The first version of the game, with the six original looks, the mini-games, Island Life and the scrapbook, was built with GPT Astra 6.2. Development then continued with Claude: Fable 5.2 planned and reviewed the work as orchestrator, and Opus 5.5 agents implemented it. That stage added the music, the sparkle effects, the layered four-view doll and its art pipeline, the makeover rooms, the star shop, favorites, the Spanish translation and the Cloudflare Workers deployment.

## Translations (i18n)

`dist/i18n.js` loads before every other script and defines the global `I18N` and its shortcut `t(key, vars)`. Strings live in two dictionaries with identical keys, grouped by screen: `nav.*`, `map.*`, `challenge.*`, `booth.*`, `arcade.*`, `garden.*`, `scrapbook.*`, `tab.*`, `group.*`, `room.*`, `fav.*`, `shop.*`, `runway.*`, `life.*`, `district.<id>.*`, `story.<n>.*` and `catalog.*`. English is in `i18n.js`, except the catalog display names, which stay next to their art in `catalog.js` and are registered at load as `catalog.item.<id>`, `catalog.tint.<slug of the English name>`, `catalog.hairColor.<id>` and `catalog.<lips|blush|shadow|gem|nails>.<id>`. Spanish is in `i18n-es.js`.

- `{name}` interpolates a variable. Numbers are formatted for the language. `{name|lc}` lower-cases the first letter, for a catalog name used mid-sentence.
- A plural entry is `{one:'…', other:'…'}` and is chosen by `vars.count`, for example `t('arcade.bestTurns', {count: 3})`.
- Write whole sentences with variables instead of joining fragments, so each language keeps its own word order.
- A key missing from Spanish falls back to English and logs one warning in the console on a local server. An unknown key renders as an empty string, never as the key.
- Static markup in `index.html` carries `data-i18n` (text), `data-i18n-html` (trusted dictionary markup) or `data-i18n-attr="aria-label:key;title:key"`.
- Data tables (places, districts, stories, catalog items) expose `name` and similar fields as getters, so cached lists read the current language. Changing language fires a `langchange` event. `game.js` then redraws the room in place, and open dialogs redraw their text.

To add a string, add the same key to both dictionaries and call `t('group.key', {vars})` where it is shown. To add a language, create `dist/i18n-<code>.js` with `I18N.add('<code>', {…})` holding every key, load it in `index.html` after `i18n.js`, add the code to `SUPPORTED` in `i18n.js`, and add a button with `data-lang="<code>"`, `lang` and the language's own name as its `aria-label` to both `.lang-switch` groups in `index.html`.

## Saves and compatibility

The game stores character looks, stars, stamps, challenge progress, delivered bouquets, best memory score, audio preference, and scrapbook in the browser’s `localStorage` under `hibiscus-club-v1`. `lang` holds the language the player picked (`en` or `es`), or `null` until the player chooses one. The shop adds `spent` (stars spent, while `stars` stays the lifetime total), `owned` (bought option keys such as `item:butterfly-clip`, `tint:gold-hoops:rose-gold`, `hair-color:lilac` or `lips:cherry`) and `favorites` (up to six looks per character). `analytics` is `false` when the player has turned off anonymous play counts (anything else counts as on). Everything read back is validated. Older saves keep working: integer-style looks are mapped to the catalog, and anything a saved look or favorite already wears stays owned. An unfinished memory round, bouquet, or rehearsal lasts for the current page session. Leaving the runway ends that rehearsal.

Each browser profile and site address has its own save. Using a different port gives you a separate game. Private browsing or clearing site data can erase progress. If the browser blocks storage, the current session remains playable. Exported PNGs remain wherever you downloaded them.

## Verification

The game was exercised in Chromium at 1440 × 960 and with a 375 × 812 phone viewport, in English and Spanish. It has not been tested in Safari or Firefox, or on phone hardware. The checks covered every tab and option type on both characters, with keyboard focus kept on the chosen option. They also covered trying on and leaving (reverted), trying on and buying (the balance drops and persists after a reload), refusing a purchase without enough stars, and Golden hour staying unlocked after spending. Surprise me was run hundreds of times, using owned options only. Favorites were saved, worn and removed. Three style challenges were completed, and a postcard PNG was downloaded. An old integer-format save was migrated with stars and photos. The runway and Island Life were checked for the current look. All rooms and tabs were checked for horizontal overflow at phone width, with no console errors. Every item was reviewed on contact sheets in all four views on both dolls. The music was checked to keep scheduling across room changes and to stop and restart cleanly from the speaker button. In each language, a scripted walk through every room, tab, dialog and mini-game looked for text left in the other language, and the two dictionaries were checked for matching keys and variables.

## License

Hibiscus Club is released under the [MIT License](LICENSE).

Hibiscus Club is an independent game inspired by the era’s dress-up games.

