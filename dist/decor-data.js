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
  /* Painted backdrops (none yet). When the owner supplies painted empty rooms, list them here, one
     entry per room and colour scheme, and the room offers them above the paint and floor choices:
       {room:'bedroom', id:'pink', file:'assets/decor/rooms/bedroom-pink.webp', swatch:'#f9d6e4'}
     The picture is drawn over the whole 1536 x 1152 room and must follow the same layout as the
     procedural rooms (see ROOM in decor-logic.js): back wall bottom at y 640, back corners at
     x 150 and 1386, floor front edge at y 1108, frame 30 px at the sides. Its name is the
     i18n key house.scheme.<id>. A save remembers the chosen backdrop; if its entry is removed the
     room falls back to its paint and floor. */
  backdrops:[],
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
