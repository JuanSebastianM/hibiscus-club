/* Star shop, ownership, "Surprise me" looks and option thumbnails for the makeover rooms.
   Everything here reads the wardrobe through catalog.js and draws with portrait.js helpers; it never
   changes either. Ownership keys:
     item:<itemId>              outfits, shoes, hair styles, earrings, necklaces, hair accessories
     tint:<itemId>:<tintId>     a colourway of an item
     hair-color:<id>            a hair colour
     lips:<id> blush:<id> shadow:<id> gem:<id> nails:<id>   makeup shades and face gems
   An option without a price is free. The default looks of both dolls are always free. */
const Shop=(()=>{
  /* Most of the wardrobe is free; a few clearly special pieces are star rewards (about a quarter or
     less of each category). Every other option, including every colourway, is free. */
  const explicit={
    // one outfit per character
    'item:lilac-satin-bow-dress':20,'item:star-pajamas':25,
    // shoes, hair, jewelry, hair accessories
    'item:lilac-mary-jane-heels':12,'item:half-up-curls':15,
    // hair: at most two styles per character cost stars (see the wardrobe test)
    'item:space-buns':15,'item:short-braids':12,'item:top-ponytail':12,
    'item:butterfly-necklace':12,'tint:gold-hoops:rose-gold':6,'item:butterfly-clip':10,
    // fantasy hair colours
    'hair-color:bubblegum':20,'hair-color:lilac':20,
    // sparkly makeup
    'shadow:gold':8,'gem:crystals':8
  };
  const ITEM_FIELDS=['outfit','shoes','hair','earrings','necklace','clip'];
  const MAKEUP_FIELDS=['lips','blush','shadow','gem','nails'];
  /* Fields that are bought and tried on together (an item and its colourway). */
  const GROUPS=[['outfit','outfitTint'],['shoes','shoesTint'],['earrings','earringsTint'],['hair'],['hairColor'],['necklace'],['clip'],['lips'],['blush'],['shadow'],['gem'],['nails']];
  const STYLE_FIELDS=GROUPS.flat();

  function keyFor(field,value,look){
    if(value==null||value==='none')return null;
    if(ITEM_FIELDS.includes(field))return 'item:'+value;
    if(field.endsWith('Tint'))return value==='original'?null:'tint:'+look[field.slice(0,-4)]+':'+value;
    if(field==='hairColor')return 'hair-color:'+value;
    if(MAKEUP_FIELDS.includes(field))return field+':'+value;
    return null;
  }
  /* Full price list, including generated colourway prices; the defaults are forced free. */
  const prices={};
  for(const it of CATALOG.itemList){
    if(explicit['item:'+it.id])prices['item:'+it.id]=explicit['item:'+it.id];
    for(const t of it.tints||[]){const k='tint:'+it.id+':'+t.id;if(explicit[k])prices[k]=explicit[k]}
  }
  for(const h of CATALOG.hairColors)if(explicit['hair-color:'+h.id])prices['hair-color:'+h.id]=explicit['hair-color:'+h.id];
  for(const f of MAKEUP_FIELDS)for(const o of CATALOG.makeup[f])if(explicit[f+':'+o.id])prices[f+':'+o.id]=explicit[f+':'+o.id];
  for(const doll of ['adult','little'])lookKeys(defaultLook(doll)).forEach(k=>delete prices[k]);

  function price(key){return key&&Object.hasOwn(prices,key)?prices[key]:0}
  function owned(key){return !price(key)||state.owned.includes(key)} // `state` is game.js's save
  function lookKeys(look){
    return STYLE_FIELDS.map(f=>keyFor(f,look[f],look)).filter(Boolean);
  }
  function missing(look){return [...new Set(lookKeys(look).filter(k=>!owned(k)))]}
  function groupOwned(look,group){return group.every(f=>owned(keyFor(f,look[f],look)))}
  /* Display name of an ownership key, in the current language (see shop.* in i18n.js). */
  function keyName(key){
    const [kind,a,b]=key.split(':');
    if(kind==='item')return itemName(a);
    if(kind==='tint'){const tn=tintOptions(a).find(o=>o.id===b);return t('shop.tint',{tint:tn?tn.name:b,item:itemName(a)});}
    if(kind==='hair-color')return t('shop.hairColor',{name:CATALOG.hairColors.find(h=>h.id===a)?.name||a});
    const o=CATALOG.makeup[kind]?.find(o=>o.id===a);
    return o?(['nails','shadow','blush'].includes(kind)?t('shop.'+kind,{name:o.name}):o.name):a;
  }
  /* Saved ownership: keys of real options. Keys of options that are free now (they cost stars in
     earlier versions) are kept, so a purchase is never forgotten if prices change again. */
  function realKey(key){
    const [kind,a,b,...rest]=key.split(':');if(rest.length)return false;
    if(kind==='item')return !!catalogItem(a)&&b===undefined;
    if(kind==='tint')return tintOptions(a).some(t=>t.id===b&&t.id!=='original');
    if(kind==='hair-color')return CATALOG.hairColors.some(h=>h.id===a)&&b===undefined;
    return MAKEUP_FIELDS.includes(kind)&&CATALOG.makeup[kind].some(o=>o.id===a)&&b===undefined;
  }
  function readOwned(raw){return Array.isArray(raw)?[...new Set(raw.filter(k=>typeof k==='string'&&k.length<120&&realKey(k)))]:[]}

  /* ---------- colour families for coordinated surprises ---------- */
  const baseFamily={'hibiscus-flares':'pink','lilac-satin-bow-dress':'lilac','denim-jacket-skirt':'blue','green-hibiscus-sundress':'mint','black-flares-set':'neutral','pink-velour-cargo':'pink',
    'yellow-dot-dress':'gold','lilac-cord-pinafore':'lilac','pink-gingham-bow-dress':'pink','denim-overalls':'blue','mint-cardigan-dress':'mint','star-pajamas':'pink',
    'black-platform-sandals':'neutral','lilac-mary-jane-heels':'lilac','pink-chunky-sneakers':'pink','red-mary-janes':'warm','white-velcro-sneakers':'neutral','strawberry-rain-boots':'warm',
    'gold-hoops':'gold','pearl-studs':'neutral','heart-studs':'pink','star-studs':'gold','pearl-starfish-necklace':'neutral','butterfly-necklace':'lilac',
    'hibiscus-clip':'pink','butterfly-clip':'lilac','red-bow':'warm','peach-blossom':'warm','satin-bow':'pink','gold-star':'gold'};
  const gemFamily={heart:'pink','star-freckles':'gold',glitter:'neutral',crystals:'blue',butterfly:'lilac'};
  const themes=['pink','warm','gold','mint','blue','lilac']; // named by i18n keys theme.<family>
  function familyOfHex(hex){
    const [h,s,l]=rgbToHsl(...hexRgb(hex));
    if(s<.2||l>.9||l<.14)return 'neutral';
    if(h>=300&&h<346)return 'pink';
    if(h>=346||h<36)return 'warm';
    if(h<70)return 'gold';if(h<170)return 'mint';if(h<255)return 'blue';return 'lilac';
  }
  function family(field,value,look){
    if(value==='none')return 'neutral';
    if(field.endsWith('Tint')){const t=tintOptions(look[field.slice(0,-4)]).find(t=>t.id===value);return t&&t.swatch?familyOfHex(t.swatch):baseFamily[look[field.slice(0,-4)]]||'neutral';}
    if(field==='gem')return gemFamily[value]||'neutral';
    if(MAKEUP_FIELDS.includes(field)){const o=CATALOG.makeup[field].find(o=>o.id===value);return o?.color?familyOfHex(o.color):'neutral';}
    return baseFamily[value]||'neutral';
  }
  const naturalHair=['espresso','jet','chestnut','honey','strawberry'];
  function weighted(list,rnd){
    const total=list.reduce((s,o)=>s+o.w,0);let r=rnd()*total;
    for(const o of list){r-=o.w;if(r<=0)return o.v}
    return list[list.length-1]?.v;
  }
  /* Item + colourway combinations the player owns, for a category. */
  function ownedCombos(field,doll){
    return catalogOptions(field,doll).filter(it=>owned('item:'+it.id)).flatMap(it=>(it.tints||[{id:'original'}]).filter(t=>owned(keyFor(field+'Tint',t.id,{[field]:it.id}))).map(t=>({item:it.id,tint:t.id})));
  }
  let lastTheme='';
  /* A complete random look from owned options only. Usually built around one colour family. */
  function surprise(doll,current,rnd=Math.random){
    let best=null;
    for(let attempt=0;attempt<6;attempt++){
      const look={...current};
      const outfits=ownedCombos('outfit',doll);
      const o=outfits[Math.floor(rnd()*outfits.length)];
      look.outfit=o.item;look.outfitTint=o.tint;
      let theme=family('outfitTint',o.tint,look);
      if(theme==='neutral')theme=themes[Math.floor(rnd()*themes.length)];
      const chaotic=rnd()<.15;
      const w=(fam,match=5,neutral=2.5)=>chaotic?1:fam===theme?match:fam==='neutral'||fam==='gold'&&theme==='warm'?neutral:.6;
      for(const field of ['shoes','earrings']){
        const combos=ownedCombos(field,doll);
        const list=combos.map(c=>({v:c,w:w(family(field+'Tint',c.tint,{[field]:c.item}))}));
        if(field==='earrings')list.push({v:{item:'none',tint:'original'},w:1.4});
        const pick=list.length?weighted(list,rnd):{item:'none',tint:'original'};
        look[field]=pick.item;look[field+'Tint']=pick.tint;
      }
      const singles={necklace:2,clip:1.2};
      for(const [field,noneW] of Object.entries(singles)){
        const list=catalogOptions(field,doll).filter(it=>owned('item:'+it.id)).map(it=>({v:it.id,w:w(family(field,it.id,look))}));
        list.push({v:'none',w:noneW});
        look[field]=weighted(list,rnd);
      }
      const hairs=catalogOptions('hair',doll).filter(it=>owned('item:'+it.id));
      look.hair=hairs[Math.floor(rnd()*hairs.length)].id;
      look.hairColor=weighted(CATALOG.hairColors.filter(h=>owned('hair-color:'+h.id)).map(h=>({v:h.id,w:naturalHair.includes(h.id)?3:h.id===theme?4:chaotic?1:.4})),rnd);
      const noneW={lips:1.2,blush:1,shadow:1.6,gem:2.4,nails:1.2};
      for(const field of MAKEUP_FIELDS){
        const opts=makeupOptions(field,doll).filter(m=>owned(keyFor(field,m.id,look)));
        look[field]=weighted(opts.map(m=>({v:m.id,w:m.id==='none'?noneW[field]:w(family(field,m.id,look),4,2)})),rnd);
      }
      const clean=readLook(look,doll);
      if(missing(clean).length)continue; // never happens with owned pools; belt and braces
      best={look:clean,theme:chaotic?'chaos':theme}; // an i18n key suffix: theme.<id>
      if(lookKey({...clean,doll})!==lookKey({...current,doll})&&(theme!==lastTheme||attempt>2)){lastTheme=theme;break}
    }
    return best;
  }

  /* ---------- thumbnails: generated one per frame, cached as data URLs ---------- */
  const thumbs=new Map(),queue=[];let pumping=false;
  /* Returns the cached URL, '' if it failed, or null while it is being drawn (the <img data-thumb>
     elements carrying `key` are filled in when it is ready). */
  function img(key,make){
    const url=thumb(key,make);
    return `<img data-thumb="${key}" ${url?`src="${url}" class="ready"`:url===''?'class="failed"':''} alt="">`;
  }
  function thumb(key,make){
    if(thumbs.has(key))return thumbs.get(key);
    thumbs.set(key,null);queue.push({key,make});pump();
    return null;
  }
  function pump(){
    if(pumping||!queue.length)return;
    pumping=true;
    const job=queue.shift();
    Promise.resolve().then(job.make).then(c=>c.toDataURL('image/png')).catch(()=>'').then(url=>{
      thumbs.set(job.key,url);
      document.querySelectorAll('img[data-thumb]').forEach(img=>{if(img.dataset.thumb===job.key){if(url){img.src=url;img.classList.add('ready')}else img.classList.add('failed')}});
      setTimeout(()=>{pumping=false;pump()},16);
    });
  }
  const T=160; // item thumbnails are drawn at 2x for a ~80px card picture
  function fitInto(src,size=T,pad=.08){
    const c=makeCanvas(size,size),g=c.getContext('2d'),k=Math.min(size*(1-pad*2)/src.width,size*(1-pad*2)/src.height);
    g.imageSmoothingQuality='high';g.drawImage(src,(size-src.width*k)/2,(size-src.height*k)/2,src.width*k,src.height*k);
    return c;
  }
  function itemImg(id,tintId='original',hairColorId=null){
    const it=catalogItem(id);if(!it)return '';
    const key=['item',id,tintId,hairColorId||''].join('|');
    return img(key,async()=>{
      if(it.stud){const c=makeCanvas(T,T),g=c.getContext('2d');drawStud(g,it.stud,T*.32,T*.5,T*.13);drawStud(g,it.stud,T*.68,T*.5,T*.13);return c}
      if(it.proc){const c=makeCanvas(T,T),g=c.getContext('2d');drawCharm(g,it.proc,T/2,T/2,T*({1:.44,2:.62,3:.5}[it.proc]||.45),-.19);return c}
      const src=it.thumb||it.art?.front?.main;if(!src)throw new Error('no art');
      let c=fitInto(await asset(src),T,it.category==='hair'?.04:.08);
      const tint=(it.tints||[]).find(t=>t.id===tintId);
      if(tint&&tint.id!=='original')c=tintCanvas(c,tint);
      if(hairColorId){const hc=CATALOG.hairColors.find(h=>h.id===hairColorId);if(hc?.stops)c=hairColorCanvas(c,hc,it.lum)}
      return c;
    });
  }
  function gemImg(doll,gem){
    return img('gem|'+doll+'|'+gem,()=>{
      const c=makeCanvas(T,T),g=c.getContext('2d'),info=CATALOG.dolls[doll],face=info.face,k=3.3*26/face.unit;
      const [r,gg,b]=info.skin,sk=g.createRadialGradient(T*.42,T*.4,T*.05,T/2,T/2,T*.5);
      sk.addColorStop(0,`rgb(${Math.min(255,r+28)},${Math.min(255,gg+30)},${Math.min(255,b+30)})`);sk.addColorStop(1,`rgb(${r},${gg},${b})`);
      g.fillStyle=sk;g.beginPath();g.arc(T/2,T/2,T*.44,0,Math.PI*2);g.fill();
      g.save();g.beginPath();g.arc(T/2,T/2,T*.44,0,Math.PI*2);g.clip();
      // centre the thumbnail on the gem itself (crystals sit above the cheek, glitter on the cheekbone)
      const mean=pts=>[pts.reduce((s,p)=>s+p[0],0)/pts.length,pts.reduce((s,p)=>s+p[1],0)/pts.length];
      const near=face.cheekbones.reduce((a,b)=>Math.hypot(b[0]-face.gemAt[0],b[1]-face.gemAt[1])<Math.hypot(a[0]-face.gemAt[0],a[1]-face.gemAt[1])?b:a);
      const [cx,cy]=gem==='crystals'?mean(face.crystals):gem==='glitter'?near:face.gemAt;
      const zoom=k*(gem==='glitter'?1.25:gem==='crystals'?1.9:2.1);
      g.translate(T/2,T/2);g.scale(zoom,zoom);g.translate(-cx,-cy);drawGem(g,{doll,gem});g.restore();
      return c;
    });
  }
  /* A small full-length doll picture of a look (favorites). */
  function dollImg(look,doll){
    const shot={...readLook(look,doll),doll};
    return img('doll|'+lookKey(shot),async()=>{
      const d=await composeDoll(shot);
      const c=makeCanvas(120,212),g=c.getContext('2d');g.imageSmoothingQuality='high';
      g.drawImage(d,40,90,520,940,1.5,0,117,212); // head room above the hair down to just under the feet
      return c;
    });
  }
  /* Style challenges (`briefs` in game.js, which loads after this file) must stay achievable by both
     characters with free options. A brief that names one hairstyle for both, now that each doll has
     her own styles, gets a per-character need instead: her counterpart from COUNTERPART_HAIR, else
     her default style. Done once the page's scripts have run; an open challenge card is redrawn. */
  const COUNTERPART_HAIR={little:{'side-ponytail':'curly-buns','long-waves':'curly-bob','half-up-curls':'ringlet-pigtails','flip-bob':'chin-bob-bangs','long-braids':'short-braids','space-buns':'curly-buns'},
    adult:{'curly-bob':'flip-bob','curly-buns':'space-buns','ringlet-pigtails':'long-braids','chin-bob-bangs':'flip-bob','short-braids':'long-braids','wavy-crop':'long-waves'}};
  function fitBriefs(){
    if(typeof briefs==='undefined'||!Array.isArray(briefs))return;
    let changed=false;
    for(const b of briefs){
      const h=b.need?.hair;if(typeof h!=='string')continue;
      const per={},wears=(doll,id)=>catalogOptions('hair',doll).some(i=>i.id===id)&&!price('item:'+id);
      for(const doll of ['adult','little']){const c=COUNTERPART_HAIR[doll][h];per[doll]=wears(doll,h)?h:c&&wears(doll,c)?c:defaultLook(doll).hair}
      if(per.adult!==h||per.little!==h){b.need.hair=per;changed=true}
    }
    if(changed&&typeof challenge==='function')try{document.querySelectorAll('aside.challenge').forEach(el=>{el.outerHTML=challenge()})}catch{}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fitBriefs,{once:true});else setTimeout(fitBriefs);
  return {price,owned,keyFor,lookKeys,missing,groupOwned,keyName,readOwned,surprise,itemImg,gemImg,dollImg,
    GROUPS,STYLE_FIELDS,ITEM_FIELDS,MAKEUP_FIELDS,themes,
    get prices(){return {...prices}}};
})();
