/* Hibiscus Club wardrobe catalog: every wearable, its art, tints and per-doll fit, plus the
   makeup/nail/hair-colour option lists and the look model (readLook, defaultLook).

   Coordinates in `fit` are doll-local pixels: positions in the cropped base picture
   CATALOG.dolls[doll].art[view]. Fit and art are keyed by view; only 'front' exists today, and a
   later 'left' / 'right' / 'back' view only needs new art + fit entries.

   Fit shapes (see portrait.js):
   - outfit: {pieces:[{part, warp:[[spriteY, dollY, spriteXa, dollXa, spriteXb, dollXb], ...],
              parts:[{poly, pivot, to, rot, scale:[kx,ky], under}], cut:[poly]}],
              skin:[{poly|rect|ellipse}] (bodysuit pixels repainted as skin there), shoesOver}
   - shoes:  {left:{x,y,w,rot}, right:{...}, collar} (sprite part top-left; collar = fraction of
              the shoe height above which the shoe is drawn behind the leg)
   - hair:   {x,y,w,h,rot} or {warp}, front:[shapes] (if set: whole style drawn behind the body and
              only these doll-local regions again in front), cut:[sprite polys], clip:{x,y,rot,scale}
   - earrings (pairs): {left:{x,y,w,rot}, right:{...}} with item.anchor = hook point (0..1) per side
   - necklace / other sprites: {x,y,w,h,rot} or {warp}, keep/cut: sprite-space polygons
   - clip sprites: item.size[doll] = width in doll px, item.anchor = [0..1, 0..1]; placed at the
              hair style's fit.clip. Procedural clips (proc 1..3) are drawn by drawCharm. */
const CATALOG=(()=>{
const A='assets/items/';
const art=(cat,id,parts)=>({front:{main:A+cat+'/'+id+'.webp',parts:parts?Object.fromEntries(parts.map(p=>[p,A+cat+'/'+id+'-'+p+'.webp'])):undefined}});
const original={id:'original',name:'Original'};
const dolls={
  adult:{name:'Grown-up',art:{front:'assets/dolls/adult-front.webp'},size:[397,873],origin:[100,145],
    skin:[226,144,92],suitLuma:146,
    face:{unit:26,
      lips:[[181,119],[186,117],[193,115.5],[200,115.2],[205,116.6],[210,115.2],[218,115.6],[226,116.6],[233,118.5],[230,123],[224,130],[215,135],[206,136.6],[196,135.3],[188,130],[183,124]],
      mouth:[[185,120.5],[194,119.4],[206,120],[218,119.4],[230,119.2],[226,124],[217,127.6],[206,128.4],[194,127.4],[187,124]],
      lipRef:120,lipBlur:1,
      lids:[{poly:[[174,85],[176,80],[182,77],[190,76],[198,77],[204,80],[206,85],[201,81.4],[194,79.6],[186,79.6],[179,81.2]]},
            {poly:[[217,86],[219,81],[225,78],[233,77.2],[241,78.5],[247,82],[249,87],[243,82.4],[236,80.6],[228,80.6],[221,82.4]]}],
      lidBlur:2,
      cheeks:[[170,107,17,11],[243,105,16,11]],cheekbones:[[171,101],[243,99]],
      gemAt:[246,103],crystals:[[244,92.5,1.6],[247.5,95.5,1.4],[249.5,99.5,1.2]],
      lobes:[[150,107],[254,105]]},
    nails:{ref:205,fingers:[[38,507.5,2.4,4.3,0],[355.5,507.5,2.4,4.3,0]],
      toes:[[118,858,2.2,1.8,0],[126,858.5,2.2,1.8,0],[133.5,859,2.4,2,0],[141.5,858.5,2.6,2.2,0],[151,857,3.4,2.6,0],
            [244,857,3.4,2.6,0],[254,858.5,2.6,2.2,0],[262,859,2.4,2,0],[269.5,858.5,2.2,1.8,0],[277,858,2.2,1.8,0]]}},
  little:{name:'Little Me',art:{front:'assets/dolls/little-front.webp'},size:[403,863],origin:[99,155],
    skin:[220,134,85],suitLuma:156,
    face:{unit:33,
      lips:[[183,176],[190,172.5],[198,170.6],[204,171],[208,172],[212,171],[218,170.6],[226,172.5],[233,176],[227,181],[218,185],[208,186.5],[197,185],[189,181]],
      lipRef:150,lipBlur:1.4,
      lids:null,
      cheeks:[[163,161,23,16],[255,159,22,16]],cheekbones:[[165,152],[253,150]],
      gemAt:[257,152],crystals:[[256,137,2],[260.5,141,1.8],[263.5,146,1.6]],
      lobes:[[139,161],[272,158]]},
    nails:null}
};
/* Tints: hue shift (deg) or hueTo (absolute), sat multiplier, light offset; `range` limits the
   source hues affected (so prints, skin-coloured trims and metals stay put). */
const T=(id,name,swatch,o)=>({id,name,swatch,...o});
const items=[
  /* ----- outfits: adult ----- */
  {id:'hibiscus-flares',category:'outfit',dolls:['adult'],art:art('outfits-adult','hibiscus-flares'),
    tints:[original,T('lilac','Lilac','#b98ae8',{hue:-55,range:[300,360],minSat:.2}),T('sunset','Sunset','#ff8a5c',{hue:30,range:[300,360],minSat:.2}),T('aqua','Aqua','#44c2d0',{hueTo:185,range:[300,360],minSat:.2,sat:.85})],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,198,22,95,198,305],[36,222,3,74,215,326],[60,252,10,78,209,322],[84,300,65,137,152,262],[96,318,68,140,149,258],[192,445,39,94,179,304],[204,460,38,93,179,305],[300,630,49,117,168,280],[490,858,14,80,205,318]]}],
      skin:[{rect:[110,170,180,70]}]}}}},
  {id:'lilac-satin-bow-dress',category:'outfit',dolls:['adult'],art:art('outfits-adult','lilac-satin-bow-dress'),
    tints:[original],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,190,70,90,275,310],[160,330,123,137,256,261],[408,620,3,40,343,360]]}],skin:[]}}}},
  {id:'denim-jacket-skirt',category:'outfit',dolls:['adult'],art:art('outfits-adult','denim-jacket-skirt'),
    tints:[original],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,180,134,165,209,235],[60,215,66,80,277,318],[340,470,66,95,283,305],[430,560,104,110,239,290]]}],skin:[]}}}},
  {id:'green-hibiscus-sundress',category:'outfit',dolls:['adult'],art:art('outfits-adult','green-hibiscus-sundress'),
    tints:[original],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,180,96,135,234,268],[84,262,90,123,240,275],[156,330,110,137,220,261],[440,700,4,60,319,340]]}],skin:[{rect:[110,170,180,90]}]}}}},
  {id:'black-flares-set',category:'outfit',dolls:['adult'],art:art('outfits-adult','black-flares-set'),
    tints:[original],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,185,48,120,200,280],[96,318,79,140,168,258],[204,460,57,93,192,305],[490,858,31,80,217,318]]}],skin:[]}}}},
  {id:'pink-velour-cargo',category:'outfit',dolls:['adult'],art:art('outfits-adult','pink-velour-cargo'),
    tints:[original],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,170,72,150,186,250],[228,450,58,93,201,305],[500,858,32,90,225,310]]}],skin:[]}}}},
  /* ----- outfits: little ----- */
  {id:'yellow-dot-dress',category:'outfit',dolls:['little'],art:art('outfits-little','yellow-dot-dress'),
    tints:[original],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,228,118,128,319,275],[176,370,121,120,315,282],[416,610,5,20,419,385]]}],skin:[]}}}},
  {id:'lilac-cord-pinafore',category:'outfit',dolls:['little'],art:art('outfits-little','lilac-cord-pinafore'),
    tints:[original],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,215,133,150,293,253],[96,270,32,80,392,325],[176,370,104,120,321,282],[432,610,8,20,416,385]]}],skin:[]}}}},
  {id:'pink-gingham-bow-dress',category:'outfit',dolls:['little'],art:art('outfits-little','pink-gingham-bow-dress'),
    tints:[original],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,220,131,128,316,275],[192,380,123,120,323,282],[416,610,3,20,443,385]]}],skin:[]}}}},
  {id:'denim-overalls',category:'outfit',dolls:['little'],art:art('outfits-little','denim-overalls'),
    tints:[original],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,225,85,120,281,282],[96,290,5,70,360,332],[208,420,70,105,297,300],[470,620,46,95,320,310]]}],skin:[]}}}},
  {id:'mint-cardigan-dress',category:'outfit',dolls:['little'],art:art('outfits-little','mint-cardigan-dress'),
    tints:[original],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,220,153,150,321,253],[208,500,14,20,460,385],[470,640,114,90,350,312]]}],skin:[]}}}},
  {id:'star-pajamas',category:'outfit',dolls:['little'],art:art('outfits-little','star-pajamas',['top','trousers']),
    tints:[original],
    fit:{little:{front:{pieces:[{part:'trousers',warp:[[0,450,32,95,192,310],[287,840,4,95,216,310]]},{part:'top',warp:[[16,225,95,130,240,272],[204,500,3,10,328,392]]}],skin:[]}}}},
  /* ----- shoes ----- */
  {id:'black-platform-sandals',category:'shoes',dolls:['adult'],openToe:true,art:art('shoes-adult','black-platform-sandals',['left','right']),
    tints:[original],
    fit:{adult:{front:{left:{x:100,y:790,w:72},right:{x:224,y:790,w:72},collar:.35}}}},
  {id:'lilac-mary-jane-heels',category:'shoes',dolls:['adult'],art:art('shoes-adult','lilac-mary-jane-heels',['left','right']),
    tints:[original],
    fit:{adult:{front:{left:{x:100,y:790,w:72},right:{x:224,y:790,w:72},collar:.35}}}},
  {id:'pink-chunky-sneakers',category:'shoes',dolls:['adult'],art:art('shoes-adult','pink-chunky-sneakers',['left','right']),
    tints:[original],
    fit:{adult:{front:{left:{x:98,y:790,w:80},right:{x:222,y:790,w:80},collar:.35}}}},
  {id:'red-mary-janes',category:'shoes',dolls:['little'],art:art('shoes-little','red-mary-janes',['left','right']),
    tints:[original],
    fit:{little:{front:{left:{x:95,y:790,w:80},right:{x:225,y:790,w:80},collar:.35}}}},
  {id:'white-velcro-sneakers',category:'shoes',dolls:['little'],art:art('shoes-little','white-velcro-sneakers',['left','right']),
    tints:[original],
    fit:{little:{front:{left:{x:95,y:780,w:84},right:{x:222,y:780,w:84},collar:.35}}}},
  {id:'strawberry-rain-boots',category:'shoes',dolls:['little'],art:art('shoes-little','strawberry-rain-boots',['left','right']),
    tints:[original],
    fit:{little:{front:{left:{x:98,y:730,w:76},right:{x:226,y:730,w:76},collar:.2}}}},
  /* ----- hair ----- */
  {id:'long-waves',category:'hair',dolls:['adult','little'],art:art('hair','long-waves'),
    fit:{adult:{front:{x:200-349*.8/2,y:40-72*.8,w:349*.8,h:536*.8,clip:{x:168,y:40,rot:-20}}},
         little:{front:{x:200-349*1.12/2,y:70-72*1.12,w:349*1.12,h:536*1.12,clip:{x:160,y:70,rot:-20}}}}},
  {id:'side-ponytail',category:'hair',dolls:['adult','little'],art:art('hair','side-ponytail'),
    fit:{adult:{front:{x:200-(116+71)*.8,y:40-126*.8,w:278*.8,h:548*.8,clip:{x:230,y:30,rot:20}}},
         little:{front:{x:200-(116+71)*1.1,y:70-126*1.1,w:278*1.1,h:548*1.1,clip:{x:240,y:60,rot:20}}}}},
  {id:'half-up-curls',category:'hair',dolls:['adult','little'],art:art('hair','half-up-curls'),
    fit:{adult:{front:{x:200-(114+66)*.8,y:40-112*.8,w:356*.8,h:534*.8,clip:{x:200,y:20,rot:0}}},
         little:{front:{x:200-(114+66)*1.12,y:70-112*1.12,w:356*1.12,h:534*1.12,clip:{x:200,y:50,rot:0}}}}},
  {id:'ringlet-pigtails',category:'hair',dolls:['adult','little'],art:art('hair','ringlet-pigtails'),
    fit:{adult:{front:{x:200-212*.42,y:40-134*.42,w:424*.42,h:417*.42,clip:{x:160,y:30,rot:-20}}},
         little:{front:{x:200-212*.62,y:70-134*.62,w:424*.62,h:417*.62,clip:{x:150,y:60,rot:-20}}}}},
  {id:'curly-buns',category:'hair',dolls:['adult','little'],art:art('hair','curly-buns'),
    fit:{adult:{front:{x:200-(110+116)*.5,y:40-154*.5,w:445*.5,h:362*.5,clip:{x:160,y:30,rot:-20}}},
         little:{front:{x:200-(110+116)*.68,y:70-154*.68,w:445*.68,h:362*.68,clip:{x:150,y:60,rot:-20}}}}},
  {id:'curly-bob',category:'hair',dolls:['adult','little'],art:art('hair','curly-bob'),
    fit:{adult:{front:{x:200-(118+101)*.55,y:40-128*.55,w:437*.55,h:359*.55,clip:{x:165,y:35,rot:-20}}},
         little:{front:{x:200-(118+101)*.75,y:70-128*.75,w:437*.75,h:359*.75,clip:{x:150,y:60,rot:-20}}}}},
  /* ----- earrings ----- */
  {id:'gold-hoops',category:'earrings',dolls:['adult','little'],art:art('jewelry','gold-hoops',['left','right']),anchor:{left:[.5,.04],right:[.5,.04]},
    tints:[original,T('silver','Silver','#d8dde6',{range:[20,60],sat:.08,light:.12}),T('rose-gold','Rose gold','#e9a39a',{hue:-28,range:[20,60],sat:.8,light:.04})],
    fit:{adult:{front:{left:{x:150,y:104,w:22},right:{x:254,y:102,w:22}}},little:{front:{left:{x:139,y:158,w:24},right:{x:272,y:155,w:24}}}}},
  {id:'pearl-studs',category:'earrings',dolls:['adult','little'],stud:'pearl',art:{}},
  {id:'heart-studs',category:'earrings',dolls:['adult','little'],stud:'heart',art:{}},
  {id:'star-studs',category:'earrings',dolls:['adult','little'],stud:'star',art:{}},
  /* ----- necklaces ----- */
  {id:'pearl-starfish-necklace',category:'necklace',dolls:['adult','little'],art:art('jewelry','pearl-starfish-necklace'),
    fit:{adult:{front:{x:150,y:150,w:100,h:70}},little:{front:{x:150,y:200,w:100,h:70}}}},
  {id:'butterfly-necklace',category:'necklace',dolls:['adult','little'],art:art('jewelry','butterfly-necklace'),
    fit:{adult:{front:{x:160,y:160,w:80,h:80}},little:{front:{x:160,y:210,w:80,h:80}}}},
  /* ----- hair accessories ----- */
  {id:'hibiscus-clip',category:'clip',dolls:['adult','little'],art:art('jewelry','hibiscus-clip'),anchor:[.4,.5],size:{adult:46,little:50}},
  {id:'butterfly-clip',category:'clip',dolls:['adult','little'],art:art('jewelry','butterfly-clip'),anchor:[.45,.5],size:{adult:40,little:46}},
  {id:'red-bow',category:'clip',dolls:['adult','little'],art:art('jewelry','red-bow'),anchor:[.5,.5],size:{adult:44,little:52}},
  {id:'peach-blossom',category:'clip',dolls:['adult','little'],proc:1,art:{}},
  {id:'satin-bow',category:'clip',dolls:['adult','little'],proc:2,art:{}},
  {id:'gold-star',category:'clip',dolls:['adult','little'],proc:3,art:{}}
];
const names={'pearl-studs':'Pearl Studs','heart-studs':'Sweetheart Studs','star-studs':'Twinkle Star Studs','peach-blossom':'Peach Blossom Clip','satin-bow':'Satin Bow','gold-star':'Golden Star Clip'};
const byId={};
for(const it of items){it.name=it.name||names[it.id]||'';it.price=0;it.tints=it.tints||[original];byId[it.id]=it;}
const makeup={
  lips:[{id:'none',name:'Natural',dolls:['adult','little']},
    {id:'rose-nude',name:'Rose Nude',color:'#c9787a',strength:.55,dolls:['adult']},
    {id:'bubblegum',name:'Bubblegum Gloss',color:'#ff6fae',strength:.65,gloss:170,dolls:['adult']},
    {id:'cherry',name:'Cherry Red',color:'#d8203c',strength:.8,dolls:['adult']},
    {id:'berry',name:'Berry Crush',color:'#9c2f62',strength:.72,dolls:['adult']},
    {id:'peach-gloss',name:'Peach Gloss',color:'#f59a7c',strength:.55,gloss:165,dolls:['adult']},
    {id:'strawberry-tint',name:'Strawberry Tint',color:'#f0697e',strength:.32,gloss:185,dolls:['little']},
    {id:'cherry-gloss',name:'Cherry Gloss',color:'#e9415f',strength:.28,gloss:180,dolls:['little']}],
  blush:[{id:'none',name:'No blush',dolls:['adult','little']},
    {id:'peach',name:'Peach',color:'#ffa98a',strength:.32,dolls:['adult','little']},
    {id:'rose',name:'Rose',color:'#f58aa6',strength:.36,dolls:['adult','little']},
    {id:'berry',name:'Berry',color:'#d45d8d',strength:.3,dolls:['adult']}],
  shadow:[{id:'none',name:'No shadow',dolls:['adult','little']},
    {id:'pink',name:'Pink Frost',color:'#f19ac8',strength:.55,shimmer:'#ffd9ef',dolls:['adult']},
    {id:'lilac',name:'Lilac Dream',color:'#b58ae6',strength:.6,shimmer:'#eedcff',dolls:['adult']},
    {id:'gold',name:'Gold Shimmer',color:'#e8b860',strength:.5,shimmer:'#fff0b8',dolls:['adult']},
    {id:'aqua',name:'Aqua Splash',color:'#5ec9d6',strength:.5,shimmer:'#d9fbff',dolls:['adult']},
    {id:'bronze',name:'Bronze',color:'#9c5a3c',strength:.55,dolls:['adult']}],
  gem:[{id:'none',name:'Bare cheeks',dolls:['adult','little']},
    {id:'heart',name:'Rose heart',dolls:['adult','little']},
    {id:'star-freckles',name:'Star freckles',dolls:['adult','little']},
    {id:'glitter',name:'Glitter glow',dolls:['adult','little']},
    {id:'crystals',name:'Crystal tears',dolls:['adult','little']},
    {id:'butterfly',name:'Butterfly gem',dolls:['adult','little']}],
  nails:[{id:'none',name:'Bare nails',dolls:['adult','little']},
    {id:'bubblegum',name:'Bubblegum',color:'#ff5fa8',dolls:['adult']},
    {id:'cherry',name:'Cherry',color:'#d61f3c',dolls:['adult']},
    {id:'lilac',name:'Lilac',color:'#b48be8',dolls:['adult']},
    {id:'coral',name:'Coral',color:'#ff7a5c',dolls:['adult']},
    {id:'pearl',name:'Pearl White',color:'#fbeef0',dolls:['adult']}]
};
const hairColors=[
  {id:'espresso',name:'Espresso',swatch:'#3b2524'},
  {id:'jet',name:'Jet Black',swatch:'#1d1a22',stops:[[0,'#050407'],[.45,'#17141c'],[.8,'#3c3646'],[1,'#8c86a0']]},
  {id:'chestnut',name:'Chestnut',swatch:'#8a4a2c',stops:[[0,'#1f0d08'],[.4,'#5b2a17'],[.75,'#9a5531'],[1,'#e2a676']]},
  {id:'honey',name:'Honey Blonde',swatch:'#d9a45a',stops:[[0,'#4a2c12'],[.35,'#9c6a2f'],[.7,'#d9a75c'],[1,'#fbe7b4']]},
  {id:'strawberry',name:'Strawberry Blonde',swatch:'#e08a5e',stops:[[0,'#4f1f12'],[.35,'#a24c2f'],[.7,'#e08b5f'],[1,'#ffd9b8']]},
  {id:'bubblegum',name:'Bubblegum Pink',swatch:'#f27ab6',stops:[[0,'#4f1033'],[.35,'#a83a77'],[.7,'#f27ab6'],[1,'#ffd8ec']]},
  {id:'lilac',name:'Lilac',swatch:'#b79ae8',stops:[[0,'#2c1d4a'],[.35,'#6d55a3'],[.7,'#b79ae8'],[1,'#f0e6ff']]}
];
const defaults={
  adult:{outfit:'hibiscus-flares',outfitTint:'original',shoes:'black-platform-sandals',shoesTint:'original',hair:'long-waves',hairColor:'espresso',earrings:'gold-hoops',earringsTint:'original',necklace:'pearl-starfish-necklace',clip:'hibiscus-clip',lips:'rose-nude',blush:'peach',shadow:'none',gem:'none',nails:'none',frame:0,sticker:0,backdrop:0},
  little:{outfit:'yellow-dot-dress',outfitTint:'original',shoes:'red-mary-janes',shoesTint:'original',hair:'ringlet-pigtails',hairColor:'espresso',earrings:'none',earringsTint:'original',necklace:'none',clip:'red-bow',lips:'none',blush:'rose',shadow:'none',gem:'none',nails:'none',frame:0,sticker:0,backdrop:0}
};
/* Old saves stored integer indexes into three baked pictures per doll. */
const legacy={
  outfit:{adult:[{outfit:'hibiscus-flares',shoes:'black-platform-sandals'},{outfit:'green-hibiscus-sundress',shoes:'lilac-mary-jane-heels'},{outfit:'pink-velour-cargo',outfitTint:'lilac',shoes:'pink-chunky-sneakers'}],
          little:[{outfit:'yellow-dot-dress',shoes:'red-mary-janes'},{outfit:'pink-gingham-bow-dress',shoes:'red-mary-janes'},{outfit:'denim-overalls',shoes:'white-velcro-sneakers'}]},
  clip:{adult:['hibiscus-clip','peach-blossom','satin-bow','gold-star'],little:['red-bow','peach-blossom','satin-bow','gold-star']},
  gem:['none','heart','star-freckles']
};
return {version:2,views:['front'],dolls,items:byId,itemList:items,makeup,hairColors,defaults,legacy,
  categories:['outfit','shoes','hair','earrings','necklace','clip'],
  optional:['shoes','earrings','necklace','clip']};
})();

/* ---------- catalog helpers ---------- */
function catalogItem(id){return Object.hasOwn(CATALOG.items,id)?CATALOG.items[id]:null}
function itemName(id){return catalogItem(id)?.name||'Barefoot'}
/* Items of a category the doll can wear (and that have art + fit for the view). */
function catalogOptions(category,doll,view='front'){
  return CATALOG.itemList.filter(it=>it.category===category&&it.dolls.includes(doll)&&(it.proc||it.stud||it.category==='clip'||it.fit?.[doll]?.[view]));
}
function makeupOptions(field,doll){return CATALOG.makeup[field].filter(o=>o.dolls.includes(doll))}
function hairColorOptions(){return CATALOG.hairColors}
function tintOptions(id){return catalogItem(id)?.tints||[]}
function defaultLook(doll){return {...CATALOG.defaults[doll==='little'?'little':'adult']}}
/* Validate any stored look (new string-id shape or the old integer shape) against the catalog.
   Unknown or unwearable values fall back to the doll's default, field by field. */
function readLook(raw,doll){
  doll=doll==='little'?'little':'adult';
  const v=raw&&typeof raw==='object'?{...raw}:{};
  const def=defaultLook(doll),out={};
  const int=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max?n:0;
  if(typeof v.outfit==='number'){ // legacy save: outfit 0-2, clip 0-3, gem 0-2
    const o=CATALOG.legacy.outfit[doll][int(v.outfit,2)];
    Object.assign(v,{outfitTint:'original',shoesTint:'original'},o,{
      clip:CATALOG.legacy.clip[doll][int(v.clip,3)],gem:CATALOG.legacy.gem[int(v.gem,2)]});
  }
  const wearable=(cat,id)=>{const it=catalogItem(id);return !!it&&it.category===cat&&catalogOptions(cat,doll).includes(it)};
  for(const cat of CATALOG.categories){
    const id=v[cat];
    out[cat]=id==='none'&&CATALOG.optional.includes(cat)?'none':wearable(cat,id)?id:def[cat];
  }
  for(const [field,item] of [['outfitTint','outfit'],['shoesTint','shoes'],['earringsTint','earrings']]){
    const tints=tintOptions(out[item]);out[field]=tints.some(t=>t.id===v[field])?v[field]:'original';
  }
  out.hairColor=CATALOG.hairColors.some(h=>h.id===v.hairColor)?v.hairColor:def.hairColor;
  for(const field of ['lips','blush','shadow','gem','nails'])
    out[field]=makeupOptions(field,doll).some(o=>o.id===v[field])?v[field]:(makeupOptions(field,doll).some(o=>o.id===def[field])?def[field]:'none');
  out.frame=int(v.frame,3);out.sticker=int(v.sticker,3);out.backdrop=int(v.backdrop,3);
  return out;
}
