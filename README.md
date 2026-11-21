# Hibiscus Club

Hibiscus Club is a single-player browser game inspired by early-2000s fashion-doll CD-ROMs. Dress the same character at two ages from head to toe, walk around the island helping its residents, spend the stars you earn in the island shop, rehearse a runway routine, and turn a favorite look into a downloadable postcard. The island map is the single home: its five buildings open rooms, and its three walk-in places let you explore on foot.

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
| `room` | `map`, `wardrobe`, `salon`, `booth`, `scrapbook`, `arcade`, `garden`, `runway`, `life` (any walk-in place) | a room opens; moving between walk-in places is not counted again |
| `district` | `boardwalk`, `market`, `pavilion` | a walk-in place is entered |
| `lang` | `en`, `es` | language switched |
| `character` | `adult`, `little` | character switched |
| `makeover` | `outfit`, `shoes`, `jewelry`, `hair`, `hair-color`, `makeup`, `nails`, `accessory` | something she owns is put on (counted per category, sent with a count) |
| `tryon` | the same categories | a locked option is tried on (counted like `makeover`) |
| `purchase` | the same categories, plus price band `1-9`, `10-19` or `20-plus` | each option bought |
| `surprise` | `wardrobe`, `salon` | Surprise me! |
| `favorite` | `saved`, `worn` | a favorite look is saved or worn |
| `game-start`, `game-done` | `memory`, `bouquet`, `runway` | first card, first flower or rehearsal start; win |
| `chat` | `boardwalk`, `market`, `pavilion` | she walks up to a resident |
| `errand` | `story-1` to `story-4` | a story is finished (each character has her own four; the character field tells them apart) |
| `daily` | `deliver`, `find`, `greet`, `compliment`, `tidy` | a daily errand is finished (the template, never its details) |
| `findable` | `boardwalk`, `market`, `pavilion` | a hidden treasure is picked up |
| `tutorial` | `done`, `skipped` | the first-visit tour of a walk-in place ends |
| `name` | `yes`, `no` | a name is set, or the first name prompt is skipped. The name itself is never sent. |
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

Until all three secrets are set, `/stats` shows these steps and no data. The page shows visits per day (per hour for 24 hours), top countries, devices, the game language, rooms, mini-game starts against completions, makeover changes and try-ons by category, purchases by category and price band, postcards, challenges, favorites, Surprise me!, walk-in places (trips, conversations, treasures), stories and daily errands, the first-visit tour and name prompt, and settings, for 24 hours, 7 days, 30 days or 90 days. It is server-rendered, makes no third-party requests and is marked `noindex`. Analytics Engine may sample busy events. Every stored row stands for `_sample_interval` real events, so the page counts `SUM(_sample_interval * double1)` and says so when any figure is an estimate.

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

1. Pick **Grown-up** or **Little Me** on the player card. Each character remembers her own look, name and adventure. The card shows where she is and her next step, with **Start the adventure** (later **Continue the adventure**) to go straight there. **Give her a name** (later **Change name**) is on the card too.
2. The map has two kinds of pins. Round icons are **rooms**; picture bubbles of a scene are **walk-in places** (Pearl Boardwalk, Flower Market, Starlight Pavilion). The yellow **Next step** bar under the map and a **★ Next** flag on a pin show where to go. On a narrow screen the pins show only their icons; hover or focus a pin to see its name, and the passport under the map lists every place by kind.
3. Open **Dress-Up Studio**. The tabs hold **Outfits**, **Shoes**, **Jewelry** (earrings and necklaces) and **Scenery**. Choose a card to put it on. The selected item’s color swatches appear under the rack. The stage zooms in on the part you are styling. **Front**, **Left**, **Right** and **Back** under the stage turn her around in whatever she is wearing.
4. Visit the **Beauty Salon** for **Hair** (style and color), **Makeup** (lips, blush, eyeshadow and face gems), **Nails** and **Accessories** (clips and bows). Little Me sees only the options made for her age, so she has no Nails tab or eyeshadow.
5. Tap **Surprise me!** in either room for a random look built from what you own, usually around one color family. **Save look** keeps up to six favorite looks per character. Tap a favorite to wear it again, or tap its × to remove it after a confirmation.
6. From the studio or salon, choose **Walk the island runway** to rehearse. Watch the three marks, then repeat them in order. **Replay cues** repeats the same routine.
7. In the **Photo Booth**, choose scenery, a frame, and a corner sticker, then take a photo. The style challenge card lists exactly what to wear, ticks off what she already has on, and links to the right room and tab. A successful photo advances the challenge.
8. Open **Scrapbook** to download a 640 × 860 PNG. The album holds 24 postcards. Removing a postcard asks for confirmation and frees one space. Download favorites before clearing browser data.

Use a mouse or touch, or Tab and Shift+Tab to move between controls. Enter activates links and buttons. Space also activates buttons. In the studio and salon, the arrow keys move between tabs. Escape closes dialogs. Sound starts on: an endless, cheerful background tune begins with your first click or key press and keeps playing as you move between rooms, with sparkles for clicks and a fanfare for wins. The speaker in the top bar turns the music and sound effects off or on together, and the game remembers your choice.

## English and Spanish

The whole game is bilingual. **EN | ES** in the top bar (and in the island guide) switches every screen, dialog, announcement, item name and new postcard caption at once, without reloading or losing the current room, try-on or game round. The choice is saved with the game. With no saved choice, the game starts in Spanish when the browser's preferred language begins with `es`, and in English otherwise. Player-chosen names are never translated. In Spanish, Grown-up is **Yo Grande** and Little Me is **Yo Chiquita**.

## Walk-in places

Choose a picture-bubble pin on the map, or **Go to …** on the Next step bar. Each place has its own address (`#boardwalk`, `#market`, `#pavilion`), so it can be shared and the Back button works. The old `#life` link opens the place where she last was. Click or tap the ground to walk; she glides there at a steady pace, turning to a side view while she walks and facing you when she stops. A second click redirects her. You can also focus the scene and use the arrow keys, or Tab to a resident, object or treasure and press Enter. The strip under the scene goes back to the **Island map** or to the other two places in one tap.

The first time each character arrives without a name, a friendly dialog offers six names to pick with one tap, a box to type her own, and **Not now**. It is never asked again; **Change name** in the scene header and on the player card is always there. Names are cleaned the same way as before (control characters removed, 24 characters at most) and are never sent anywhere. Residents greet her by name and sometimes mention it in their small talk.

The first visit also shows a three-tip tour (how to walk, what the ★ marker means, where the next step and journal are). It moves on by itself as she does each thing, can be skipped at any time, and is remembered in the save.

**Always know what to do.** The yellow bar over the scene shows the next step in one line ("Pick a striped shell from the basket"), who or what it is at, and, when it is in another place, **Go to …** to travel there. Over the right resident or object a ★ with the word **Next** bobs; a smaller **!** with **Task** marks anything else to do there (a daily errand). With reduced motion or the sparkle button off, the markers stand still and the target's name tag gets a thick ring, so neither motion nor colour alone carries them. **Today x/3 · ✦ y/6** on the bar opens the **Journal**, which lists every story (done, in progress and coming up) and today's errands, treasures and bag. When a step or story is done, the conversation celebrates (confetti and fanfare) and shows the next step with a button to go there; the same news is announced once through the live region.

Mara collects shells on Pearl Boardwalk, Rosa tends the Flower Market, and Kit runs the Starlight Pavilion. Ask about their work to become friends; after that, **What's new?** brings rotating small talk (eight lines each, plus a few about her name or the outfit she has on), which changes from visit to visit and day to day.

**Stories.** Each character has her own four stories, one at a time, offered by a resident with a ★ **Can I lend a hand?** button:

| Grown-up | Steps | Stars | Little Me | Steps | Stars |
| --- | --- | --- | --- | --- | --- |
| A shell for the show (Mara) | shell basket, Kit | 6 | A drink for the seedling (Rosa) | watering can, water it with Rosa | 6 |
| A window-box wish (Rosa) | potting bench, Mara | 8 | Mara's lost starfish (Mara) | shell basket, lantern stand, Mara | 6 |
| Opening-night lights (Kit) | potting bench, lantern, Kit | 10 | A drawing for Kit (Kit) | Rosa's crayons, draw with Mara, Kit | 8 |
| The lantern concert (Kit) | Mara, garlands at the bench, Rosa's bells, lantern, Kit | 12 | A lullaby for the lanterns (Kit) | wave song from Mara, lavender from Rosa, sing to the lantern, Kit | 10 |

**Every day.** Each real-world day (local midnight to midnight) each character gets three short errands, chosen from five templates and worth a few stars each: deliver something from one resident to another (4), find three hidden things in one place (3), say hi to all three residents (3), pay a resident a compliment (2) and tidy a resident's stall (2). Six treasures (two shells, petals or fallen stars per place, 1 star each) also sparkle on the ground. The set is worked out from the date and the character, so a reload never rerolls it and the two characters have different sets. When all three are done, the bar and journal say so and when new ones arrive. If the computer's clock is turned back to an earlier day, the latest day played stays in place until the clock catches up, so errands are never refilled that way.

**Take a scenic postcard** uses your current location in the photo booth. The studio and booth also let you select any district or the original pink studio. Saved postcards retain the scenery you chose.

## Stars and stamps

| Activity | How to finish | Reward |
| --- | --- | --- |
| Star Arcade | Find all six pairs in Memory Match. Each two-card attempt counts as a turn. | 8 stars and a personal best if you improve |
| Flower Garden | Pick the three flowers on the order, including any repeated stems. Selection order is flexible. Wrap the bouquet to deliver it. | 5 stars and the next order |
| Island Runway | Repeat all three spotlight marks in order. | 6 stars |
| Stories | Finish each of a character's four stories, once. | Grown-up 6, 8, 10, 12 (36); Little Me 6, 6, 8, 10 (30) |
| Daily errands | Three a day per character, new every day. | 2 to 4 stars each, usually 7 to 9 a day |
| Treasures | Six a day per character, hidden in the walk-in places. | 1 star each |
| Style challenge | Photograph the two pieces the brief names. Eight briefs rotate, and each one can be met by both characters with free starter options. | 10 stars and the next brief |

At 10 stars earned in all, **Golden hour** becomes available in the booth for both characters. Spending stars never locks it again. Visiting each of the eight places on the map adds its stamp to the island passport.

The eleven star-shop items cost 156 stars together. The stories give 66 once, and the walk-in places give each character about 13 to 15 stars a day (both characters about 28), so the whole shop is reachable in three or four days of walk-in play alone, sooner with the mini-games, which pay every time.

## The star shop

Both characters share one wallet. The top bar shows the stars you can spend. Hover over it to see the lifetime total. Most of the wardrobe is free to choose. About a quarter or less of each category is kept as a star reward, from 6 to 25 stars:

| Category | Free for both characters | Costs stars |
| --- | --- | --- |
| Outfits | Five per character, including both default looks | Lilac Satin Bow Dress 20, Starry Sleepover PJs 25 |
| Colorways | Every colorway of every outfit, shoe and earring, except one | Rose gold hoops 6 |
| Shoes | All the others, and barefoot | Lilac Mary Jane Heels 12 |
| Hair | Beach Babe Waves, Sassy Side Pony, Ringlet Pigtails, Cutie Curl Buns, Bouncy Curly Bob (Little Me wears Ringlet Pigtails, Cutie Curl Buns and Bouncy Curly Bob) | Half-Up Curl Cascade 15 |
| Hair color | Espresso, Jet Black, Chestnut, Honey Blonde, Strawberry Blonde | Bubblegum Pink 20, Lilac 20 |
| Jewelry | All earrings (Golden Glam Hoops, Pearl Studs, Sweetheart Studs, Twinkle Star Studs), Pearl & Starfish Necklace, or none | Butterfly Kisses Necklace 12 |
| Hair accessories | Five clips and bows, or none | Flutter Butterfly Clip 10 |
| Makeup | Every lip color and blush; Pink Frost, Lilac Dream, Aqua Splash and Bronze eyeshadow; four face gems | Gold Shimmer eyeshadow 8, Crystal tears 8 |
| Nails (Grown-up) | All six | None |

Locked options show a lock and their price. Choosing one puts it on her as a try-on, and the stage shows **Buy** and **Put back**. Buying asks for confirmation, takes the stars, and keeps the item. A **new!** tag marks it for the rest of the visit. If you don’t have enough stars, the Buy button says how many more you need. Try-ons are never saved. They are left out of saved looks, favorites and postcards, and her look reverts when you leave the room or switch characters. The prices live in `dist/shop.js`.

## How the game was built

The original project supplied a page shell, a flower emblem, and an icon library. The finished game uses HTML, CSS, and browser JavaScript with no build step or dependencies. Every script shares the page’s global scope, in the order `index.html` loads them. A URL hash identifies each room, so links, refresh, and the browser’s Back button work with static hosting.

Each character is a layered paper doll with four views: front, left, right and back. A bald base doll picture per age and view sits under transparent sprites for the outfit, shoes, hairstyle, jewelry and hair accessories. The catalog stores a fit for every item on every doll and view. Outfits are warped row by row to the body, long sleeves are placed along the arms, and in side views the near arm is cut from the base and drawn over the outfit. The base dolls wear a lilac bodysuit, which is repainted in skin tone wherever an outfit would let it show, and an outfit is always drawn. The hairstyles were painted directly on these bald heads, in all four views, and then cut out, so each one is placed from its art rather than fitted by eye: `art/fit_hair_pack2.py` registers every worn proof (the hair shown on the head, `art/proofs/pack2/`) onto the game's base doll by matching the face, ears, jaw and neck that the hair leaves bare, and writes where each sprite sits in `dist/hair-fit.js`. A few corrections judged against the proofs (which parts hang behind the shoulders, where clips sit, which styles cover the ears) are in `HAIR_TUNE` in `catalog.js`, and `art/lab.html?sheet=proofs` shows every style on her head next to its proof. Each doll has her own list of hairstyles (`HAIR_STYLES` in `catalog.js`): the Grown-up has nine adult styles and Little Me nine toddler styles. Shoes are layered around the foot: the sole and insole sit behind it, straps and closed parts in front, and the bare foot is lifted onto a heeled or platform footbed and trimmed to the shoe's outline, so toes, polish and the top of the foot show through sandals and mary janes and no heel or ankle pokes out in any view. Side and back view art loads only when a view is first used. Makeup, nail polish, hair color and colorways are pixel recolors done once and cached. Hair colors, the default espresso included, are gradient maps over the style's own brightness range, so each color looks the same on every style and view. `composeDoll()` builds a dressed doll on one transparent canvas. The player card, studio, salon, booth, runway, walk-in place walker, favorites and postcards all draw from it. A saved postcard records the character and every look choice, so the renderer recreates it for display and PNG export. The artwork is AI-generated. The dolls and wearables arrived as sheets: a four-view turnaround of each base doll, front-view sheets of the outfits, hair, shoes and jewelry, and four-view sheets of the same items. `art/slice.py` and `art/slice_views.py` cut the sheets into trimmed sprites by following the alpha channel, clean the edges, and write a manifest of sizes and parts. `art/crop_dolls.py` crops the base figures onto a shared foot baseline. `art/fit_views.py` generates the side and back outfit warps, and `art/lab.html` renders contact sheets of every item on every doll, which is how the fits were tuned by eye. The source sheets are kept in `art/source/` and are not deployed.

The music is synthesized live in the browser by `dist/music.js` with the Web Audio API. There are no audio files or samples. An original tune in C major at 118 beats per minute is written as note strings, one character per sixteenth note, and arranged in six sections (sparkle intro, verse, chorus, second verse, bridge, second chorus) that make a 44-bar cycle of about 90 seconds and repeat for as long as the game is open. A look-ahead scheduler wakes every 25 ms and queues the notes for the next 160 ms on the audio clock, so timing stays steady. Bell lead, plucked chords, pad, bass, kick, clap, hat and shaker are built from oscillators and filtered noise, and pass through a delay, a generated reverb, a compressor and a limiter. Click sparkles and the win fanfare use the same audio context and output chain. Browsers require a user gesture before audio, so the music fades in on the first click or key press. It pauses while the tab is hidden, and the speaker button fades everything out and remembers the choice.

The island map and the three district pictures are still paintings, brought to life by `dist/scene-fx.js`. It draws the picture through WebGL with three.js at exactly the framing the page would use, so the pins and the walking character stay aligned on top. `dist/scene-data.js` marks regions of each picture (water, surf, waterfalls, palms, flower beds, lanterns, sky) and how each moves: water refracts and glints and ripples where you click, plants sway from their base, lights glow and flicker, clouds drift, the sailboat bobs, and petals, butterflies, gulls or fireflies drift through. three.js is stored in `dist/vendor/three/` and is fetched only when one of these scenes is shown. With the sparkle button off, the reduced-motion setting on, or no WebGL, the plain picture is shown instead.

`dist/fx.js` draws the glitter pointer trail, click bursts and win confetti on one overlay canvas that ignores pointer input. Its animation loop stops when no particles are left. The sparkle button in the top bar turns the effects off, and the reduced-motion setting replaces them with a brief still sparkle.

The island is an original AI-generated illustration with eight HTML links positioned over it: five round icon pins on the buildings (rooms) and three photo-bubble pins on the dock, the flower beds and the bridge (walk-in places). The gingham, paper frames, stamps, and game controls are drawn with CSS and vector icons.

| File | Responsibility |
| --- | --- |
| `dist/index.html` | Page shell, navigation, page footer (Privacy link and “Built by jmendozaperez.dev” credit, which opens in a new tab), accessible dialogs, script loading, Web Analytics token |
| `dist/analytics.js` | Anonymous play statistics: event lists, batching, privacy checks, optional Web Analytics beacon |
| `dist/i18n.js` | Translation layer (`t()`, plurals, language choice) and the English dictionary |
| `dist/i18n-es.js` | Spanish dictionary |
| `dist/style.css` | Responsive island layout, booth, game tables, and scrapbook |
| `dist/makeover.css` | Studio and salon: sticky doll stage, tabs, item cards, swatches, shop tags, try-on bar, favorites |
| `dist/game.js` | Room navigation, character choices, memory game, bouquet orders, style challenges, rewards, and saves |
| `dist/catalog.js` | Wardrobe catalog: every item, its art, colorways and fit, makeup and hair-color lists, look validation |
| `dist/hair-fit.js` | Generated by `art/fit_hair_pack2.py`: where each hairstyle sprite sits on each doll and view, and each style's brightness range for recoloring |
| `dist/portrait.js` | Paper-doll compositing, recolors, makeup, face gems, postcard frames, and Canvas 2D rendering |
| `dist/shop.js` | Star-shop prices and ownership, coordinated Surprise me looks, cached option and favorite thumbnails |
| `dist/makeover.js` | Dress-Up Studio and Beauty Salon controls, try-on and buying, favorite looks, and the turn control |
| `dist/quests.js` | The island adventure's data and rules: districts, each character's stories, daily errands and treasures (seeded per day and character), the clock guard, the `state.life` save format and old-save migration, the next objective, rotating small talk |
| `dist/island-life.js` and `dist/island-life.css` | Walk-in places: the scene, walking, quest HUD and markers, treasures, travel strip, journal, conversations, the name dialog and the first-visit tour |
| `dist/music.js` | Procedural background music loop and sound effects synthesized with the Web Audio API |
| `dist/scene-fx.js`, `dist/scene-data.js` | Living scenes: the island map and district pictures drawn through WebGL with moving water, swaying plants, glowing lights and particles |
| `dist/vendor/three/` | three.js (MIT), bundled locally and loaded only when a living scene is shown |
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
| `test/wardrobe.test.mjs` | `node --test`: per-doll hairstyles, old looks falling back, style challenges achievable, shop balance, saved ownership |
| `test/island.test.mjs` | `node --test`: per-character stories, old saves migrating without lost or repeated stars, the next objective, daily errands deterministic per day and character, the clock guard, rotating small talk |

To add a wearable, put its sprite in `dist/assets/items/`, add an entry with its fit to `catalog.js`, and give it a price in `shop.js` if it should be sold. A new hairstyle needs its four view sprites painted on the bald head with worn proofs: slice them with `art/slice_pack2.py`, run `python3 -I art/fit_hair_pack2.py --ship` to register them and write the fit and the game-size sprites, and add its id to `HAIR_STYLES` for the doll that wears it. A shoe's foot placement, open parts and trim line per view are in `SHOE_FIT` in `catalog.js`. Option thumbnails are drawn lazily, one per frame, and cached for the visit. Choosing an option rebuilds only the controls and repaints the existing doll canvas, so the doll never blinks out. The studio’s turn control lists the views in `CATALOG.views`.

The walk-in places use three illustrated JPEG backgrounds. Each scene composes the active doll’s front, left and right views once in her current look and shows the side view that matches her walking direction. Movement updates her transform with requestAnimationFrame at a constant speed, scales her with depth, and stops scheduling frames on arrival. While walking she only sways slightly from foot to foot around her feet (no hop); a leg animation is planned separately. The reduced-motion setting moves her directly to the destination. Scene coordinates are normalized so saved positions work on different screen sizes. Progress changes redraw only the HUD, markers, treasures, journal and travel strip, so she never stops or blinks. Treasures sit on hand-picked spots of walkable floor in each scene (`spots` in `quests.js`).

### Credits

The first version of the game, with the six original looks, the mini-games, Island Life and the scrapbook, was built with GPT Astra 6.2. Development then continued with Claude: Fable 5.2 planned and reviewed the work as orchestrator, and Opus 5.5 agents implemented it. That stage added the music, the sparkle effects, the layered four-view doll and its art pipeline, the makeover rooms, the star shop, favorites, the Spanish translation, the Cloudflare Workers deployment, the living scenes and the one-map island adventure (walk-in places, per-character stories, daily errands and treasures).

## Translations (i18n)

`dist/i18n.js` loads before every other script and defines the global `I18N` and its shortcut `t(key, vars)`. Strings live in two dictionaries with identical keys, grouped by screen: `nav.*`, `map.*`, `card.*`, `challenge.*`, `booth.*`, `arcade.*`, `garden.*`, `scrapbook.*`, `tab.*`, `group.*`, `room.*`, `fav.*`, `shop.*`, `runway.*`, `quest.*` (next-step bar), `life.*` (walk-in places), `name.*`, `tour.*`, `district.<id>.*`, `story.<doll>.<n>.*`, `daily.*`, `chat.<district>.*` and `catalog.*`. Daily errand texts are whole sentences with the item, people and place as variables (for example `daily.deliver.todo`: “Pick up {item} from {from} for {to}” / “Ve con {from} a recoger {item} para {to}”); item names carry their own article in each language. English is in `i18n.js`, except the catalog display names, which stay next to their art in `catalog.js` and are registered at load as `catalog.item.<id>`, `catalog.tint.<slug of the English name>`, `catalog.hairColor.<id>` and `catalog.<lips|blush|shadow|gem|nails>.<id>`. Spanish is in `i18n-es.js`.

- `{name}` interpolates a variable. Numbers are formatted for the language. `{name|lc}` lower-cases the first letter, for a catalog name used mid-sentence.
- A plural entry is `{one:'…', other:'…'}` and is chosen by `vars.count`, for example `t('arcade.bestTurns', {count: 3})`.
- Write whole sentences with variables instead of joining fragments, so each language keeps its own word order.
- A key missing from Spanish falls back to English and logs one warning in the console on a local server. An unknown key renders as an empty string, never as the key.
- Static markup in `index.html` carries `data-i18n` (text), `data-i18n-html` (trusted dictionary markup) or `data-i18n-attr="aria-label:key;title:key"`.
- Data tables (places, districts, stories, catalog items) expose `name` and similar fields as getters, so cached lists read the current language. Changing language fires a `langchange` event. `game.js` then redraws the room in place, and open dialogs redraw their text.

To add a string, add the same key to both dictionaries and call `t('group.key', {vars})` where it is shown. To add a language, create `dist/i18n-<code>.js` with `I18N.add('<code>', {…})` holding every key, load it in `index.html` after `i18n.js`, add the code to `SUPPORTED` in `i18n.js`, and add a button with `data-lang="<code>"`, `lang` and the language's own name as its `aria-label` to both `.lang-switch` groups in `index.html`.

## Saves and compatibility

The game stores character looks, stars, stamps, challenge progress, delivered bouquets, best memory score, audio preference, and scrapbook in the browser’s `localStorage` under `hibiscus-club-v1`. `lang` holds the language the player picked (`en` or `es`), or `null` until the player chooses one. The shop adds `spent` (stars spent, while `stars` stays the lifetime total), `owned` (bought option keys such as `item:butterfly-clip`, `tint:gold-hoops:rose-gold`, `hair-color:lilac` or `lips:cherry`) and `favorites` (up to six looks per character). `analytics` is `false` when the player has turned off anonymous play counts (anything else counts as on). The island adventure adds `tutorial` (`done` or `skipped` once the first-visit tour is over), `dayMax` (the latest day the dailies were played, `YYYY-MM-DD`) and, in each character's `life` record, `quests` (her story stages), `credit`, `asked` (the name prompt was shown), `talks` (conversations per resident) and `daily` (`day`, `prog` per errand, and `found`, a bit mask of treasures). `stages`, the three shared story stages of older saves, is read once and migrated: the Grown-up keeps them as her first three stories, and Little Me's finished old stories become `credit` (6, 8 and 10 stars), which her new stories use up in order before paying out, so no star is lost or paid twice; her unfinished old story starts over as one of her own. Players who already had story progress or friendships skip the tour. Everything read back is validated. Older saves keep working: integer-style looks are mapped to the catalog, and anything a saved look or favorite already wears stays owned. Bought options that are free now stay in `owned` (stars spent are not refunded). A saved look, favorite or postcard in a hairstyle the character no longer has shows her default style (Beach Babe Waves for the Grown-up, Ringlet Pigtails for Little Me), keeping the hair color and everything else; the Grown-up's old kid styles fall back this way. Styles that were redrawn keep their ids, so old looks show the new art. An unfinished memory round, bouquet, or rehearsal lasts for the current page session. Leaving the runway ends that rehearsal.

Each browser profile and site address has its own save. Using a different port gives you a separate game. Private browsing or clearing site data can erase progress. If the browser blocks storage, the current session remains playable. Exported PNGs remain wherever you downloaded them.

## Verification

The game was exercised in Chromium at 1440 × 960 and with a 375 × 812 phone viewport, in English and Spanish. It has not been tested in Safari or Firefox, or on phone hardware. The checks covered every tab and option type on both characters, with keyboard focus kept on the chosen option. They also covered trying on and leaving (reverted), trying on and buying (the balance drops and persists after a reload), refusing a purchase without enough stars, and Golden hour staying unlocked after spending. Surprise me was run hundreds of times, using owned options only. Favorites were saved, worn and removed. Three style challenges were completed, and a postcard PNG was downloaded. An old integer-format save was migrated with stars and photos. The runway and Island Life were checked for the current look. All rooms and tabs were checked for horizontal overflow at phone width, with no console errors. Every item was reviewed on contact sheets in all four views on both dolls. The music was checked to keep scheduling across room changes and to stop and restart cleanly from the speaker button. In each language, a scripted walk through every room, tab, dialog and mini-game looked for text left in the other language, and the two dictionaries were checked for matching keys and variables.

The one-map rework was checked the same way in both languages and both sizes: a new player going from the map into a place, getting named, taking the tour and finishing the first story by following the bar and markers; every story of both characters played to the end with each reward paid once (36 and 30 stars); a day's errands and treasures completed, the "come back tomorrow" state, a reload keeping the set, a faked next day bringing new sets for both characters and a clock set back not refilling them; crafted old saves (fresh, mid-story, all three old stories done, pre-shop, junk); every pin by mouse, touch and keyboard, `#life`, old hashes and Back/Forward; the living scenes mounting and unmounting; the name dialog's suggestions, typing, skipping, changing and hostile input, with no name in any `/api/e` payload; reduced motion, sparkles off and no WebGL; and no horizontal overflow or text under 13 px on any route.

## License

Hibiscus Club is released under the [MIT License](LICENSE).

Hibiscus Club is an independent game inspired by the era’s dress-up games.

