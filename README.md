# Hibiscus Club

Hibiscus Club is a single-player browser game inspired by early-2000s fashion-doll CD-ROMs. Dress the same character at two ages, rehearse a runway routine, and turn a favorite look into a downloadable postcard. The five buildings on Hibiscus Island are playable destinations.

## Play locally

Use Node.js 16.14 or later and a modern browser. From the project directory, run the following command.

```sh
node serve.cjs
```

Open [Hibiscus Club on this computer](http://127.0.0.1:4173). The server binds to your computer’s loopback address. Stop it with Ctrl+C. If that port is busy, run `node serve.cjs 4180` and open the address printed in the terminal. The game uses bundled artwork and runs offline while the local server is running. There are no packages to install.

You can also put the contents of `dist/` on a static web host. Serve the files together from the same origin so the browser can export postcard images. The existing Sites project uses the static directory specified in `.openai/hosting.json`.

## A first trip around the island

1. Pick **Grown-up** or **Little Me** on the player card. Each character remembers her own look.
2. Open **Dress-Up Studio** and pick an outfit. Every outfit has front and side views. Grown-up’s signature look also has a back reference. Choose **Pose** to return to the styled portrait.
3. Visit the **Beauty Salon** to add a hair clip and face gems. From the studio or salon, choose **Walk the island runway** to rehearse. Watch the three marks, then repeat them in order. **Replay cues** repeats the same routine.
4. In the **Photo Booth**, choose scenery, a frame, and a corner sticker, then take a photo. For the first style challenge, use the second outfit and the peach blossom clip. A successful photo advances the challenge.
5. Open **Scrapbook** to download a 640 × 860 PNG. The album holds 24 postcards. Removing a postcard asks for confirmation and frees one space. Download favorites before clearing browser data.

Use a mouse or touch, or Tab and Shift+Tab to move between controls. Enter activates links and buttons. Space also activates buttons. Escape closes dialogs. The speaker in the top bar toggles game chimes. Sound starts off.

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
| Style challenge | Photograph the requested outfit and hair clip together. The three briefs cycle. | 10 stars and the next brief |

At 10 total stars, **Golden hour** becomes available in the booth for both characters. Stars accumulate across activities. Visiting each map destination adds its stamp to the island passport.

## How the game was built

The original project supplied a page shell, a flower emblem, an icon library, and a static hosting manifest. The finished game uses HTML, CSS, and browser JavaScript. A URL hash identifies each room, so links, refresh, and the browser’s Back button work with static hosting.

The three supplied images shaped the character art. The two portraits provide the signature outfits. Crops from the turnaround sheet provide the three reference angles. Four additional outfits were generated from the portraits, cropped, and compressed as JPEGs. The island is an original AI-generated illustration with five HTML links positioned over its buildings. The gingham, paper frames, stamps, and game controls are drawn with CSS and vector icons.

| File | Responsibility |
| --- | --- |
| `dist/index.html` | Page shell, navigation, accessible dialogs, script loading |
| `dist/style.css` | Responsive island layout, studio, game tables, and scrapbook |
| `dist/game.js` | Room navigation, character choices, memory game, bouquet orders, challenges, rewards, and saves |
| `dist/portrait.js` | Image loading, accessory placement, face gems, postcard frames, and Canvas 2D rendering |
| `dist/island-life.js` and `dist/island-life.css` | Movement, scene layout, character naming, conversations, inventory, and task progression |
| `dist/runway.js` | Spotlight sequence, replay, input checking, and rehearsal reward |
| `dist/icons.js` and `dist/assets/` | Interface icons, character portraits, turnaround views, wordmark, and island art |
| `serve.cjs` | Dependency-free local HTTP server |

The player card, studio pose, runway portrait, and postcards share the same drawing code. A saved postcard records the character and outfit, accessory, gem, sticker, and frame selections. The renderer recreates it from those selections for display and PNG export. To add an outfit, supply a portrait with the same framing, extend the wardrobe list and allowed outfit index, and set its normalized hair-clip coordinates in `portrait.js`.

Island Life uses three illustrated JPEG backgrounds and transparent front, side, and stride sprites for all six outfits. Each scene prepares the active doll’s frames with her accessories once. Movement updates her transform with requestAnimationFrame, scales her with depth, and stops scheduling frames on arrival. The reduced-motion setting moves her directly to the destination. Scene coordinates are normalized so saved positions work on different screen sizes.

## Saves and compatibility

The game stores character choices, stars, stamps, challenge progress, delivered bouquets, best memory score, audio preference, and scrapbook in the browser’s `localStorage` under `hibiscus-club-v1`. An unfinished memory round, bouquet, or rehearsal lasts for the current page session. Leaving the runway ends that rehearsal.

Each browser profile and site address has its own save. Using a different port gives you a separate game. Private browsing or clearing site data can erase progress. If the browser blocks storage, the current session remains playable. Exported PNGs remain wherever you downloaded them.

## Verification

The game was exercised in desktop Chrome at 1440 × 960 and with a 375 × 812 phone viewport. The checks covered character switching, wardrobe angles, salon details, the style challenge and frame unlock, a completed runway rehearsal, correct and incorrect bouquet orders, memory matches, postcard creation and PNG generation, removal, and restoration after a reload. All rooms were checked for horizontal overflow at phone width.

Additional browser checks covered old-save migration, interrupting a walk, keyboard movement, reduced motion, naming both characters, all three errands and their rewards, all twelve wardrobe angles, and scenic postcard rendering after saving.

Hibiscus Club is an independent game inspired by the era’s dress-up games.

