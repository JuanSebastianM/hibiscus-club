/* Dream House data: the six rooms, their wall and floor treatments, the few furniture prices, the
   tabletops other pieces can sit on, the room-tour goals and the "Surprise me" recipes.
   Loaded only when the Dream House opens (game.js loads it with decor-logic.js, decor-paint.js and
   decorator.js). The furniture itself (sprites, names, anchors, scales) is described by
   assets/decor/manifest.json, which art/slice_decor.py writes; nothing here repeats it.
   Display text lives in i18n.js / i18n-es.js under house.* (item names come from the manifest). */
const DECOR={
  /* The six rooms. `walls`/`floors` list the treatments offered (ids in WALLS/FLOORS below); the
     first of each is the starting look of an empty room. `own` is the manifest's `room` value. */
  rooms:[
    {id:'bedroom', own:'bedroom', icon:'heart',   walls:['candy-stripes','blush','lilac','mint','butter','sky','peach','mint-stripes','polka-dots','gingham','florals','wainscot'],floors:['honey-oak','whitewash','cherry','lilac-carpet','cream-carpet','pink-check','mint-check','butter-check']},
    {id:'kitchen', own:'kitchen', icon:'star',    walls:['mint-stripes','butter','mint','blush','sky','peach','lilac','candy-stripes','polka-dots','gingham','florals','wainscot'],floors:['pink-check','mint-check','butter-check','honey-oak','whitewash','cherry','cream-carpet','lilac-carpet']},
    {id:'living',  own:'living',  icon:'sparkle', walls:['florals','butter','peach','blush','lilac','mint','sky','candy-stripes','mint-stripes','polka-dots','gingham','wainscot'],floors:['whitewash','honey-oak','cherry','cream-carpet','lilac-carpet','pink-check','mint-check','butter-check']},
    {id:'bathroom',own:'bathroom',icon:'gem',     walls:['wainscot','sky','mint','blush','lilac','butter','peach','candy-stripes','mint-stripes','polka-dots','gingham','florals'],floors:['mint-check','pink-check','butter-check','whitewash','honey-oak','cherry','cream-carpet','lilac-carpet']},
    {id:'playroom',own:'playroom',icon:'gamepad', walls:['polka-dots','sky','butter','lilac','mint','blush','peach','candy-stripes','mint-stripes','gingham','florals','wainscot'],floors:['lilac-carpet','cream-carpet','honey-oak','whitewash','cherry','pink-check','mint-check','butter-check']},
    {id:'patio',   own:'patio',   icon:'flower',  outdoor:true, walls:['pink-siding','mint-siding','trellis','bamboo'],floors:['lawn','deck','pavers','sand']}
  ],
  /* Wall treatments. kind: paint | stripes | dots | gingham | florals | wainscot (indoor);
     siding | trellis | bamboo (the patio's garden wall under an open sky). Colours are the game's pastels. */
  walls:{
    'blush':{kind:'paint',base:'#f9d6e4'},
    'lilac':{kind:'paint',base:'#e8dcf8'},
    'mint':{kind:'paint',base:'#d5f1e2'},
    'butter':{kind:'paint',base:'#fcf0c8'},
    'sky':{kind:'paint',base:'#d8ebf9'},
    'peach':{kind:'paint',base:'#fde2d2'},
    'candy-stripes':{kind:'stripes',base:'#fff1f6',ink:'#f9d0e0',width:40},
    'mint-stripes':{kind:'stripes',base:'#f3fbf6',ink:'#cfeedd',width:34},
    'polka-dots':{kind:'dots',base:'#e8dcf8',ink:'#fffaff'},
    'gingham':{kind:'gingham',base:'#fff6f8',ink:'#f6b9cf'},
    'florals':{kind:'florals',base:'#fff5dc',ink:'#f7a9c4',leaf:'#9fd4b0'},
    'wainscot':{kind:'wainscot',base:'#d9edf9',ink:'#fffdf8'},
    'pink-siding':{kind:'siding',base:'#f8cddd',ink:'#fff7fa'},
    'mint-siding':{kind:'siding',base:'#cdeedc',ink:'#f6fffa'},
    'trellis':{kind:'trellis',base:'#c9e8c4',ink:'#fffdf8'},
    'bamboo':{kind:'bamboo',base:'#ecd59c',ink:'#c7a764'}
  },
  /* Floor treatments. kind: planks | tiles | carpet (indoor); lawn | deck | pavers | sand (patio). */
  floors:{
    'honey-oak':{kind:'planks',base:'#e3b077',ink:'#c88f55'},
    'whitewash':{kind:'planks',base:'#f1e4d2',ink:'#d9c4a8'},
    'cherry':{kind:'planks',base:'#dca089',ink:'#bb7d68'},
    'pink-check':{kind:'tiles',base:'#fff6f8',ink:'#f8cbdb'},
    'mint-check':{kind:'tiles',base:'#fbfffc',ink:'#c9ecda'},
    'butter-check':{kind:'tiles',base:'#fffaf0',ink:'#fbe6a6'},
    'lilac-carpet':{kind:'carpet',base:'#dccbf2',ink:'#cdb8ec'},
    'cream-carpet':{kind:'carpet',base:'#f6ead9',ink:'#ead9c2'},
    'lawn':{kind:'lawn',base:'#a9dc8e',ink:'#93cf78'},
    'deck':{kind:'deck',base:'#deb489',ink:'#c39469'},
    'pavers':{kind:'pavers',base:'#efe3d3',ink:'#d8c6b0'},
    'sand':{kind:'sand',base:'#f7e3b8',ink:'#ecd29c'}
  },
  /* Painted backdrops: three painted colour schemes per room (art/build_rooms.py makes the 1536 x 1152
     pictures and 192 x 144 thumbnails; art/measure_rooms.py measures them and writes this list).
     The first scheme of a room is the look of a room that was never decorated. Per entry, in room px:
       floor     the floor quadrilateral: back-left, back-right, front-right, front-left (the side
                 lines run to the vanishing point; the front corners may lie outside the picture)
       vp        the vanishing point [x, horizon y]
       scale     furniture scale at the back wall (1 = the manifest's 280 px per metre), growing
                 toward the viewer as (y - horizon) / (backY - horizon)
       wall      zones for wall decor [x0, y0, x1, y1] ('hang': only for hanging pieces, by their top)
       openings  windows, doors and arches on the back wall [x0, y0, x1, y1, kind]: wall decor keeps
                 off them unless overOpenings below allows it
       skirt, rail, ceil  skirting height, chair rail / tile cap y, ceiling line y
       clear     floor kept free in front of doors (Surprise me and free spots avoid it)
       light     which way contact shadows lean (+ right, - left)
     A room's names are i18n keys house.scheme.<id>. A save remembers the scheme; an unknown id falls
     back to the room's paint and floor. */
  /* BEGIN generated backdrops: art/measure_rooms.py writes this block; do not edit by hand */
  backdrops:[
    {"room":"bedroom","id":"bedroom-1","file":"assets/decor/rooms/bedroom-1.webp","thumb":"assets/decor/rooms/thumbs/bedroom-1.webp","swatch":"#ca8875","floor":[[302,902],[1232,902],[1537,1152],[-1,1152]],"vp":[766,519],"scale":0.931,"wall":[[314,262,1220,688]],"openings":[[396,298,766,772,"window"]],"skirt":30,"rail":688,"ceil":250,"clear":[],"light":0.05},
    {"room":"bedroom","id":"bedroom-2","file":"assets/decor/rooms/bedroom-2.webp","thumb":"assets/decor/rooms/thumbs/bedroom-2.webp","swatch":"#c5adb0","floor":[[302,902],[1232,902],[1538,1152],[-1,1152]],"vp":[765,520],"scale":0.931,"wall":[[314,262,1220,688]],"openings":[[912,312,1198,770,"window"]],"skirt":30,"rail":688,"ceil":250,"clear":[],"light":0.05},
    {"room":"bedroom","id":"bedroom-3","file":"assets/decor/rooms/bedroom-3.webp","thumb":"assets/decor/rooms/thumbs/bedroom-3.webp","swatch":"#c4d0bd","floor":[[300,902],[1235,902],[1538,1152],[-4,1152]],"vp":[768,517],"scale":0.923,"wall":[[312,300,1223,652]],"openings":[[377,357,648,902,"door"]],"skirt":30,"rail":652,"ceil":250,"clear":[[377,902,648,997]],"light":-0.05},
    {"room":"kitchen","id":"kitchen-1","file":"assets/decor/rooms/kitchen-1.webp","thumb":"assets/decor/rooms/thumbs/kitchen-1.webp","swatch":"#ecce8f","floor":[[303,901],[1232,901],[1543,1152],[-6,1152]],"vp":[766,525],"scale":0.93,"wall":[[315,262,1220,686]],"openings":[[871,312,1173,748,"window"]],"skirt":30,"rail":686,"ceil":250,"clear":[],"light":0.05},
    {"room":"kitchen","id":"kitchen-2","file":"assets/decor/rooms/kitchen-2.webp","thumb":"assets/decor/rooms/thumbs/kitchen-2.webp","swatch":"#cad5c1","floor":[[301,902],[1232,902],[1541,1152],[-2,1152]],"vp":[762,522],"scale":0.909,"wall":[[313,262,1220,686]],"openings":[[366,367,634,902,"door"]],"skirt":30,"rail":686,"ceil":250,"clear":[[366,902,634,997]],"light":-0.05},
    {"room":"kitchen","id":"kitchen-3","file":"assets/decor/rooms/kitchen-3.webp","thumb":"assets/decor/rooms/thumbs/kitchen-3.webp","swatch":"#e2b29b","floor":[[302,902],[1233,902],[1540,1152],[-7,1152]],"vp":[768,524],"scale":0.931,"wall":[[314,262,1221,686]],"openings":[[876,315,1177,775,"window"]],"skirt":30,"rail":686,"ceil":250,"clear":[],"light":0.05},
    {"room":"living","id":"living-1","file":"assets/decor/rooms/living-1.webp","thumb":"assets/decor/rooms/thumbs/living-1.webp","swatch":"#e0cead","floor":[[302,902],[1233,902],[1538,1152],[-5,1152]],"vp":[768,522],"scale":0.931,"wall":[[314,262,1221,692]],"openings":[[855,305,1133,775,"window"]],"skirt":30,"rail":692,"ceil":250,"clear":[],"light":0.05},
    {"room":"living","id":"living-2","file":"assets/decor/rooms/living-2.webp","thumb":"assets/decor/rooms/thumbs/living-2.webp","swatch":"#adc0c6","floor":[[303,903],[1232,903],[1537,1152],[-4,1152]],"vp":[768,525],"scale":0.907,"wall":[[315,262,1220,686]],"openings":[[385,367,632,902,"door"]],"skirt":30,"rail":686,"ceil":250,"clear":[[385,903,632,998]],"light":-0.05},
    {"room":"living","id":"living-3","file":"assets/decor/rooms/living-3.webp","thumb":"assets/decor/rooms/thumbs/living-3.webp","swatch":"#e7c88e","floor":[[303,902],[1232,902],[1536,1152],[-1,1152]],"vp":[768,520],"scale":0.931,"wall":[[315,262,1220,676]],"openings":[[869,320,1170,770,"window"]],"skirt":30,"rail":676,"ceil":250,"clear":[],"light":0.0},
    {"room":"bathroom","id":"bathroom-1","file":"assets/decor/rooms/bathroom-1.webp","thumb":"assets/decor/rooms/thumbs/bathroom-1.webp","swatch":"#e4b6a7","floor":[[301,903],[1234,903],[1531,1152],[4,1152]],"vp":[768,512],"scale":0.933,"wall":[[313,262,1222,686]],"openings":[[371,315,682,775,"window"]],"skirt":30,"rail":686,"ceil":250,"clear":[],"light":-0.05},
    {"room":"bathroom","id":"bathroom-2","file":"assets/decor/rooms/bathroom-2.webp","thumb":"assets/decor/rooms/thumbs/bathroom-2.webp","swatch":"#e0c5ad","floor":[[303,903],[1232,903],[1540,1152],[-6,1152]],"vp":[768,528],"scale":0.933,"wall":[[315,262,1220,638]],"openings":[[866,320,1168,765,"window"]],"skirt":30,"rail":638,"ceil":250,"clear":[],"light":0.0},
    {"room":"bathroom","id":"bathroom-3","file":"assets/decor/rooms/bathroom-3.webp","thumb":"assets/decor/rooms/thumbs/bathroom-3.webp","swatch":"#e7d7bb","floor":[[303,904],[1234,904],[1537,1152],[-2,1152]],"vp":[770,524],"scale":0.936,"wall":[[315,262,1222,622]],"openings":[[375,349,654,902,"door"]],"skirt":30,"rail":622,"ceil":250,"clear":[[375,904,654,998]],"light":-0.05},
    {"room":"playroom","id":"playroom-1","file":"assets/decor/rooms/playroom-1.webp","thumb":"assets/decor/rooms/thumbs/playroom-1.webp","swatch":"#b8cdd3","floor":[[301,903],[1232,903],[1539,1152],[-2,1152]],"vp":[764,523],"scale":0.933,"wall":[[313,262,1220,688]],"openings":[[873,316,1171,768,"window"]],"skirt":30,"rail":688,"ceil":250,"clear":[],"light":0.05},
    {"room":"playroom","id":"playroom-2","file":"assets/decor/rooms/playroom-2.webp","thumb":"assets/decor/rooms/thumbs/playroom-2.webp","swatch":"#c5afb7","floor":[[303,902],[1232,902],[1539,1152],[-5,1152]],"vp":[768,524],"scale":0.938,"wall":[[315,262,1220,688]],"openings":[[385,350,647,902,"door"]],"skirt":30,"rail":688,"ceil":250,"clear":[[385,902,647,997]],"light":-0.05},
    {"room":"playroom","id":"playroom-3","file":"assets/decor/rooms/playroom-3.webp","thumb":"assets/decor/rooms/thumbs/playroom-3.webp","swatch":"#e9c5b1","floor":[[299,903],[1233,903],[1540,1152],[-2,1152]],"vp":[762,521],"scale":0.933,"wall":[[311,262,1221,688]],"openings":[[866,325,1155,770,"window"]],"skirt":30,"rail":688,"ceil":250,"clear":[],"light":0.05},
    {"room":"patio","id":"patio-1","file":"assets/decor/rooms/patio-1.webp","thumb":"assets/decor/rooms/thumbs/patio-1.webp","swatch":"#f0ceb7","floor":[[304,905],[1232,905],[1542,1152],[-8,1152]],"vp":[770,536],"scale":0.936,"wall":[[322,290,1212,770],[300,215,1225,262,"hang"]],"openings":[[370,328,690,904,"arch"]],"skirt":0,"rail":null,"ceil":null,"clear":[[370,905,690,999]],"light":-0.04,"outdoor":true},
    {"room":"patio","id":"patio-2","file":"assets/decor/rooms/patio-2.webp","thumb":"assets/decor/rooms/thumbs/patio-2.webp","swatch":"#b0bb9b","floor":[[303,903],[1230,903],[1543,1152],[-10,1152]],"vp":[766,534],"scale":0.936,"wall":[[318,282,1222,770],[305,228,1230,256,"hang"]],"openings":[[873,333,1158,902,"arch"]],"skirt":30,"rail":null,"ceil":254,"clear":[[873,903,1158,998]],"light":-0.04,"outdoor":true},
    {"room":"patio","id":"patio-3","file":"assets/decor/rooms/patio-3.webp","thumb":"assets/decor/rooms/thumbs/patio-3.webp","swatch":"#f4dca4","floor":[[309,903],[1227,903],[1538,1152],[-5,1152]],"vp":[770,537],"scale":0.979,"wall":[[262,272,1278,780]],"openings":[[388,352,654,902,"arch"]],"skirt":0,"rail":null,"ceil":null,"clear":[[388,903,654,998]],"light":-0.04,"outdoor":true}
  ],
  /* END generated backdrops */
  /* Wall pieces that may cover an opening of a painted room, and which kinds: only bunting, which
     hangs across above a window, door or arch. Everything else keeps off them. */
  overOpenings:{'pennant-banner':['window','door','arch']},
  /* Decor windows: never over a painted opening, and Surprise me leaves them out of a painted room
     that has windows or doors of its own. */
  decorWindows:['curtain-window','round-window'],
  /* Pieces that hang by their top and may hang from a painted patio's pergola beam ('hang' zones). */
  hangers:['pennant-banner','fairy-lights','hanging-plant'],
  /* The few showpieces that cost stars (about a tenth of the 96 pieces), priced like the wardrobe's
     star rewards. Everything else is free. */
  prices:{'canopy-bed':20,'fireplace':15,'dollhouse':15,'fish-tank':15,'ball-pit':12,'kiddie-pool':12,
    'teepee':12,'porch-swing':12,'disco-ball':10,'heart-mirror':8},
  /* Tabletops a `surface` piece can sit on: [y, x0, x1] as fractions of the host sprite (y = where the
     small piece's base rests, x0..x1 = the usable width). */
  surfaces:{
    'bedside-table':[.34,.1,.9],'desk':[.3,.06,.94],'vanity-dresser':[.53,.1,.9],'bookshelf':[.05,.12,.88],
    'dining-table':[.28,.06,.94],'kitchen-island':[.13,.05,.95],'sink-counter':[.3,.05,.95],'corner-counter':[.27,.05,.95],
    'coffee-table':[.36,.08,.92],'side-table':[.5,.1,.9],'fireplace':[.3,.06,.94],'trinket-shelf':[.05,.1,.9],
    'sink-vanity':[.34,.08,.92],'bath-stool':[.12,.12,.88],'toy-shelf':[.15,.08,.92],'kids-table-set':[.42,.32,.68],
    'toy-piano':[.07,.12,.88]
  },
  /* How deep each standing piece is on the floor, as a fraction of its sprite's height: the art is in
     3/4 view, so the rear feet (or the back of the base) sit this far above the front contact point
     (the manifest anchor). A piece may stand with its rear feet against the back wall line, never
     above it. Read by eye from the sprites (an automatic estimate from the alpha outline was
     unreliable for pots, baskets and anything with overhangs); pieces not listed use 0.1. */
  ground:{
    'canopy-bed':.18,'single-bed':.25,'bunk-bed':.17,'wardrobe':.07,'vanity-dresser':.08,'bedside-table':.1,'desk':.2,'desk-chair':.12,
    'bookshelf':.06,'toy-chest':.17,'beanbag':.14,'floor-lamp':.04,
    'fridge':.06,'stove':.08,'sink-counter':.13,'corner-counter':.2,'kitchen-island':.2,'dining-table':.22,'dining-chair':.12,'bar-stool':.12,
    'toaster-kettle':.06,'fruit-bowl':.08,
    'sofa':.2,'loveseat':.2,'armchair':.14,'coffee-table':.22,'tv-stand':.12,'fireplace':.14,'tall-plant':.06,'side-table':.1,
    'floor-cushion':.2,'record-player':.14,'trinket-shelf':.06,'standing-mirror':.07,
    'bathtub':.2,'shower':.16,'sink-vanity':.12,'toilet':.14,'towel-rack':.1,'laundry-basket':.1,'bottle-shelf':.1,'rubber-duck':.1,
    'potted-fern':.06,'bath-stool':.15,
    'dollhouse':.1,'play-kitchen':.08,'rocking-horse':.1,'toy-shelf':.06,'art-easel':.12,'kids-table-set':.24,'ball-pit':.2,'teepee':.14,
    'plush-pile':.2,'toy-piano':.1,'building-blocks':.2,
    'lounge-chair':.3,'umbrella-table':.16,'grill':.12,'porch-swing':.18,'kiddie-pool':.2,'flower-planter':.15,'string-light-pole':.03,
    'garden-gnome':.05,'bird-bath':.06,'lemonade-stand':.1,'potted-palm':.06,
    'kitten-bed':.2,'puppy-bed':.22,'fish-tank':.1,'flower-vase':.05,'disco-ball':.06,'lava-lamp':.03,'gift-boxes':.12,
    'balloon-bunch':.02,'potted-hibiscus':.06,
    '@adult':.02,'@little':.02
  },
  /* A room counts as furnished (a one-time reward per room) with at least this many pieces, `own` of
     them from the room's own collection. */
  furnished:{pieces:6,own:3,reward:5},
  /* Room tour: light goals, each paid once (any room counts). */
  goals:[
    {id:'bed',reward:3},{id:'wall',reward:3},{id:'rug',reward:3},{id:'paint',reward:2},
    {id:'top',reward:3},{id:'friend',reward:3},{id:'photo',reward:3}
  ],
  beds:['canopy-bed','single-bed','bunk-bed'],
  cap:40,
  /* "Surprise me" recipes. back: clusters placed side by side along the back wall (a cluster's pieces
     stay together; `p` = chance to include, `pick` = candidates, the first owned one in a shuffled
     order wins; `chair` = a seat set just in front). mid: a few arrangements for the middle of the
     room in floor coordinates (u across 0..1, t back 0 .. front 1; `face` turns a seat toward the
     middle). front: small pieces for the front corners. wall: what may hang on the wall. top: small
     pieces for tabletops. */
  recipes:{
    bedroom:{
      back:[[{pick:['canopy-bed','single-bed','bunk-bed']},{pick:['bedside-table'],p:.85}],[{pick:['wardrobe','vanity-dresser','bookshelf']}],[{pick:['desk'],p:.45,chair:'desk-chair'}],[{pick:['floor-lamp','tall-plant','standing-mirror'],p:.5}],[{pick:['vanity-dresser','bookshelf','toy-chest'],p:.35}]],
      mid:[[{pick:['round-rug','heart-rug','rect-rug'],u:.5,t:.5},{pick:['beanbag','floor-cushion'],u:.62,t:.52,p:.7}],
           [{pick:['heart-rug','round-rug'],u:.42,t:.55},{pick:['toy-chest','beanbag'],u:.72,t:.45,p:.8}]],
      front:['kitten-bed','puppy-bed','potted-hibiscus','balloon-bunch','gift-boxes','flower-vase','beanbag'],
      wall:['curtain-window','framed-picture','poster','fairy-lights','wall-clock','star-decals','pennant-banner','round-window','wall-shelf'],
      top:['lava-lamp','disco-ball','fruit-bowl']
    },
    kitchen:{
      back:[[{pick:['fridge']},{pick:['sink-counter'],gap:0},{pick:['stove'],gap:0,p:.9}],[{pick:['corner-counter','fridge'],p:.5}],[{pick:['tall-plant','potted-palm'],p:.35}]],
      mid:[[{pick:['dining-table'],u:.5,t:.5},{pick:['dining-chair'],u:.31,t:.52,face:1},{pick:['dining-chair'],u:.69,t:.52,face:-1}],
           [{pick:['kitchen-island'],u:.5,t:.42},{pick:['bar-stool'],u:.4,t:.62},{pick:['bar-stool'],u:.6,t:.62}],
           [{pick:['rect-rug','round-rug'],u:.5,t:.58},{pick:['dining-table'],u:.5,t:.55},{pick:['dining-chair'],u:.31,t:.56,face:1},{pick:['dining-chair'],u:.69,t:.56,face:-1}]],
      front:['potted-hibiscus','flower-vase','puppy-bed','kitten-bed','bar-stool'],
      wall:['wall-cabinets','pot-rack','wall-clock','curtain-window','wall-shelf','round-window','framed-picture','hanging-plant'],
      top:['fruit-bowl','toaster-kettle','flower-vase']
    },
    living:{
      back:[[{pick:['side-table'],p:.7},{pick:['sofa','loveseat']},{pick:['side-table','tall-plant'],p:.6}],[{pick:['fireplace','tv-stand','trinket-shelf']}],[{pick:['tall-plant','standing-mirror','record-player','floor-lamp'],p:.6}]],
      mid:[[{pick:['round-rug','rect-rug','heart-rug'],u:.48,t:.55},{pick:['coffee-table'],u:.48,t:.55},{pick:['armchair'],u:.18,t:.5,face:1,p:.8}],
           [{pick:['rect-rug','round-rug'],u:.5,t:.5},{pick:['coffee-table'],u:.5,t:.5},{pick:['armchair'],u:.17,t:.48,face:1},{pick:['armchair','loveseat'],u:.84,t:.48,face:-1,p:.6}]],
      front:['floor-cushion','potted-hibiscus','kitten-bed','puppy-bed','flower-vase','fish-tank'],
      wall:['framed-picture','curtain-window','wall-shelf','wall-lamp','wall-clock','heart-mirror','hanging-plant','fairy-lights'],
      top:['flower-vase','fruit-bowl','lava-lamp','record-player']
    },
    bathroom:{
      back:[[{pick:['bathtub','shower']}],[{pick:['sink-vanity']}],[{pick:['toilet'],p:.8}],[{pick:['towel-rack','bottle-shelf'],p:.7}],[{pick:['shower','potted-fern'],p:.35}]],
      mid:[[{pick:['bath-mat'],u:.3,t:.48},{pick:['bath-stool'],u:.62,t:.55,p:.6}],
           [{pick:['bath-mat','round-rug'],u:.5,t:.55}]],
      front:['potted-fern','laundry-basket','bath-stool','potted-hibiscus'],
      wall:['mirror-cabinet','round-window','wall-shelf','hanging-plant','wall-lamp','heart-mirror','framed-picture'],
      top:['rubber-duck','flower-vase']
    },
    playroom:{
      back:[[{pick:['dollhouse','play-kitchen']}],[{pick:['toy-shelf','teepee']}],[{pick:['toy-piano','art-easel','play-kitchen'],p:.8}],[{pick:['art-easel','teepee'],p:.45}]],
      mid:[[{pick:['round-rug','rect-rug'],u:.5,t:.55},{pick:['kids-table-set'],u:.5,t:.55}],
           [{pick:['ball-pit','train-set'],u:.5,t:.55}],
           [{pick:['train-set'],u:.45,t:.6},{pick:['rocking-horse'],u:.78,t:.45,p:.7}]],
      front:['plush-pile','building-blocks','rocking-horse','balloon-bunch','gift-boxes','beanbag'],
      wall:['pennant-banner','star-decals','poster','round-window','wall-clock','fairy-lights','framed-picture'],
      top:['building-blocks','lava-lamp']
    },
    patio:{
      back:[[{pick:['porch-swing','lemonade-stand']}],[{pick:['grill','flower-planter']}],[{pick:['string-light-pole','potted-palm'],p:.85}],[{pick:['flower-planter','bird-bath','lemonade-stand'],p:.5}]],
      mid:[[{pick:['umbrella-table'],u:.5,t:.5},{pick:['lounge-chair'],u:.82,t:.55,p:.6}],
           [{pick:['picnic-blanket'],u:.45,t:.56},{pick:['kiddie-pool','lounge-chair'],u:.78,t:.45,p:.7}],
           [{pick:['kiddie-pool'],u:.42,t:.52},{pick:['lounge-chair'],u:.8,t:.52}]],
      front:['garden-gnome','bird-bath','potted-palm','flower-planter','potted-hibiscus','puppy-bed'],
      wall:['pennant-banner','fairy-lights','wall-lamp','round-window','hanging-plant','curtain-window'],
      top:['fruit-bowl','flower-vase']
    }
  }
};
