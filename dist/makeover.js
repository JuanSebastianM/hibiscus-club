/* Dress-Up Studio and Beauty Salon: tabbed makeover controls, try-on, star-shop purchases,
   favorite looks and "Surprise me". makeoverRoom() returns the room's HTML for draw() in game.js;
   choosing an option calls refreshRoom(), which keeps the doll canvas, swaps the controls and
   repaints the doll so she never blinks out. */
const roomTabs={
  wardrobe:[
    {id:'outfits',icon:'hanger',zoom:'full'},
    {id:'shoes',icon:'shoe',zoom:'feet'},
    {id:'jewelry',icon:'gem',zoom:'bust'},
    {id:'extras',aria:'tab.extrasLabel',icon:'hat',zoom:'full'}, // hats, glasses, a bag (Grown-up) or a toy (Little Me)
    {id:'scenery',icon:'pin',zoom:'full'}],
  salon:[
    {id:'hair',icon:'comb',zoom:'hair'},
    {id:'makeup',icon:'lipstick',zoom:'face'},
    {id:'nails',icon:'polish',zoom:'hands'},
    {id:'accessories',aria:'tab.accessoriesLabel',icon:'bow',zoom:'hair'}]
}; // tab labels are i18n keys tab.<id>
const roomTab={wardrobe:'outfits',salon:'hair'};
const COMPLIMENTS=10; // i18n keys compliment.0 … compliment.9
const FAVORITE_SLOTS=6;
let trial=null;          // {doll, patch}: options shown on the doll but not bought yet
let stageView='front';
const freshKeys=new Set(); // bought this session: "new!" shimmer
let equipCount=0,lastCompliment=0;

const isMakeoverRoute=()=>route==='wardrobe'||route==='salon';
function balance(){return Math.max(0,state.stars-state.spent)}
function availableViews(){
  const v=Array.isArray(CATALOG.views)&&CATALOG.views.length?CATALOG.views:['front'];
  return ['front','left','right','back'].filter(n=>v.includes(n));
}
function displayLook(){return trial&&trial.doll===state.doll?readLook({...look(),...trial.patch},state.doll):look()}
function displayShot(){return {...displayLook(),doll:state.doll}}
function styleOf(l){return Object.fromEntries(Shop.STYLE_FIELDS.map(f=>[f,l[f]]))}
function trialBill(){
  if(!trial||trial.doll!==state.doll)return {keys:[],cost:0,names:''};
  const keys=Shop.missing(displayLook());
  return {keys,cost:keys.reduce((s,k)=>s+Shop.price(k),0),get names(){return I18N.list(keys.map(Shop.keyName))}};
}
/* Owned changes go straight onto her saved look; anything not bought yet stays a try-on. */
function settle(target){
  const real=look(),commit={...real},patch={};
  let committed=false;
  for(const g of Shop.GROUPS){
    if(!g.some(f=>target[f]!==real[f]))continue;
    if(Shop.groupOwned(target,g)){g.forEach(f=>commit[f]=target[f]);committed=true}
    else g.forEach(f=>patch[f]=target[f]);
  }
  state.looks[state.doll]=readLook(commit,state.doll);
  trial=Object.keys(patch).length?{doll:state.doll,patch}:null;
  return committed;
}
/* Ends a try-on (leaving the room, switching character, taking a photo); `reason` is the i18n key
   of the full sentence that says why. */
function dropTrial(reason){
  const bill=trialBill();
  trial=null;
  if(bill.keys.length&&reason)say(t(reason,{names:bill.names}));
  return !!bill.keys.length;
}

/* ---------- option markup ---------- */
function optInfo(key){
  const price=Shop.price(key);
  return {price,locked:!!price&&!Shop.owned(key),fresh:!!key&&freshKeys.has(key)};
}
function badge(info){
  return info.locked?`<span class="price-tag" aria-hidden="true">${icon('lock',11)}${info.price}</span>`:info.fresh?`<span class="new-badge" aria-hidden="true">${t('opt.new')}</span>`:'';
}
function optLabel(name,info,pressed){
  const label=info.locked?t(pressed?'opt.lockedTrying':'opt.lockedChoose',{name,count:info.price}):name;
  return info.fresh?t('opt.fresh',{label}):label;
}
function itemCard(field,value,name,picture,shown){
  const key=Shop.keyFor(field,value,shown),info=optInfo(key),pressed=shown[field]===value;
  return `<button class="item-card${info.locked?' is-locked':''}${info.fresh?' is-new':''}${pressed&&info.locked?' is-trying':''}" data-fid="pick-${field}-${value}" data-pick="${field}" data-value="${value}" aria-pressed="${pressed}" aria-label="${escapeText(optLabel(name,info,pressed))}"><span class="thumb">${picture}</span><span class="item-name">${escapeText(name)}</span>${badge(info)}</button>`;
}
function noneCard(field,name,shown){
  return itemCard(field,'none',name,`<span class="none-mark">${icon('x',24)}</span>`,shown);
}
function chip(field,value,name,swatch,shown){
  const key=Shop.keyFor(field,value,shown),info=optInfo(key),pressed=shown[field]===value;
  return `<button class="chip${info.locked?' is-locked':''}${info.fresh?' is-new':''}${pressed&&info.locked?' is-trying':''}" data-fid="pick-${field}-${value}" data-pick="${field}" data-value="${value}" aria-pressed="${pressed}" aria-label="${escapeText(optLabel(name,info,pressed))}"><span class="chip-swatch${value==='none'||value==='original'?' '+value+'-swatch':''}" ${swatch?`style="${swatch}"`:''}>${value==='original'?'✦':''}</span><span class="chip-name">${escapeText(name)}</span>${badge(info)}</button>`;
}
function cardGrid(cards,cls=''){return `<div class="item-grid ${cls}">${cards.join('')}</div>`}
function chipGrid(chips){return `<div class="chip-grid">${chips.join('')}</div>`}
function itemCards(field,shown,{tinted=true,hair=false}={}){
  return catalogOptions(field,state.doll).map(it=>itemCard(field,it.id,it.name,
    Shop.itemImg(it.id,tinted&&shown[field]===it.id?shown[field+'Tint']:'original',hair?shown.hairColor:null),shown));
}
/* The outfit rack grows long on a phone: a row of theme filters (only themes the doll has) narrows it.
   The filter is per visit; the outfit she has on always stays in the list. */
let rackTheme='all';
function outfitRack(shown){
  const all=catalogOptions('outfit',state.doll),themes=CATALOG.themes.filter(th=>all.some(it=>it.theme===th));
  if(rackTheme!=='all'&&!themes.includes(rackTheme))rackTheme='all';
  const pick=['all',...themes].map(th=>`<button class="rack-filter" data-fid="rack-${th}" data-rack="${th}" aria-pressed="${th===rackTheme}">${t('rack.'+th)}</button>`).join('');
  const list=all.filter(it=>rackTheme==='all'||it.theme===rackTheme||it.id===shown.outfit);
  return `<div class="rack-filters" role="group" aria-label="${t('rack.label')}">${pick}</div>`+
    cardGrid(list.map(it=>itemCard('outfit',it.id,it.name,Shop.itemImg(it.id,shown.outfit===it.id?shown.outfitTint:'original'),shown)));
}
function tintGroup(field,shown){
  const id=shown[field],tints=tintOptions(id);
  if(id==='none'||tints.length<2)return '';
  return group(`${t('group.color')} <span class="group-note">${escapeText(itemName(id))}</span>`,chipGrid(tints.map(tn=>chip(field+'Tint',tn.id,tn.name,tn.swatch?`--c:${tn.swatch}`:'',shown))));
}
function makeupSwatch(field,o){
  if(o.id==='none')return '';
  if(field==='gem')return '';
  return `--c:${o.color}`;
}
function makeupGroup(field,title,shown){
  const opts=makeupOptions(field,state.doll);
  if(opts.length<2)return '';
  if(field==='gem')return group(title,cardGrid(opts.map(o=>o.id==='none'?noneCard('gem',o.name,shown):itemCard('gem',o.id,o.name,Shop.gemImg(state.doll,o.id),shown)),'compact'));
  return group(title,chipGrid(opts.map(o=>chip(field,o.id,o.name,makeupSwatch(field,o),shown))));
}
function hairColorSwatch(h){
  return h.stops?`--c:${h.swatch};--g:linear-gradient(160deg,${h.stops.slice().reverse().map(([t,c])=>c+' '+Math.round((1-t)*100)+'%').join(',')})`:`--c:${h.swatch}`;
}
/* Which tabs make sense for the current doll (e.g. Little Me has no nail polish). */
function visibleTabs(room){
  const d=state.doll;
  return roomTabs[room].filter(t=>{
    if(t.id==='shoes')return catalogOptions('shoes',d).length>0;
    if(t.id==='jewelry')return catalogOptions('earrings',d).length+catalogOptions('necklace',d).length>0;
    if(t.id==='nails')return makeupOptions('nails',d).length>1;
    if(t.id==='makeup')return ['lips','blush','shadow','gem'].some(f=>makeupOptions(f,d).length>1);
    if(t.id==='accessories')return catalogOptions('clip',d).length>0;
    if(t.id==='extras')return CATALOG.accessories.some(f=>catalogOptions(f,d).length>0);
    return true;
  });
}
function activeTab(room){
  const tabs=visibleTabs(room);
  return tabs.find(t=>t.id===roomTab[room])||tabs[0];
}
function tabBody(room,tab,shown){
  const d=state.doll;
  switch(tab.id){
    case 'outfits':return group(t('group.outfits'),outfitRack(shown))+tintGroup('outfit',shown);
    case 'shoes':return group(t('group.shoes'),cardGrid([...itemCards('shoes',shown),noneCard('shoes',t('none.shoes'),shown)]))+tintGroup('shoes',shown);
    case 'jewelry':return (catalogOptions('earrings',d).length?group(t('group.earrings'),cardGrid([...itemCards('earrings',shown),noneCard('earrings',t('none.earrings'),shown)],'compact'))+tintGroup('earrings',shown):'')+
      (catalogOptions('necklace',d).length?group(t('group.necklaces'),cardGrid([...itemCards('necklace',shown),noneCard('necklace',t('none.necklace'),shown)],'compact')):'');
    case 'extras':return CATALOG.accessories.filter(f=>catalogOptions(f,d).length).map(f=>
      group(t('group.'+f),cardGrid([...itemCards(f,shown),noneCard(f,t('none.'+f),shown)],'compact'))).join('');
    case 'scenery':return group(t('group.scenery'),options('backdrop',sceneryNames));
    case 'hair':return group(t('group.hairstyle'),cardGrid(itemCards('hair',shown,{hair:true})))+
      group(t('group.hairColor'),chipGrid(hairColorOptions().map(h=>chip('hairColor',h.id,h.name,hairColorSwatch(h),shown))));
    case 'makeup':return makeupGroup('lips',t('group.lips'),shown)+makeupGroup('blush',t('group.blush'),shown)+makeupGroup('shadow',t('group.shadow'),shown)+makeupGroup('gem',t('group.gems'),shown);
    case 'nails':return makeupGroup('nails',t('group.nails'),shown)+`<p class="group-hint">${t('group.nailsHint')}</p>`;
    case 'accessories':return group(t('group.clips'),cardGrid([...itemCards('clip',shown),noneCard('clip',t('none.clip'),shown)],'compact'));
  }
  return '';
}
function roomControls(){
  const room=route,shown=displayLook(),tab=activeTab(room),tabs=visibleTabs(room);
  const salon=room==='salon';
  const tabList=`<div class="room-tabs" role="tablist" aria-label="${t(salon?'tabs.salon':'tabs.studio')}">${tabs.map(tb=>`<button role="tab" id="tab-${tb.id}" data-fid="tab-${tb.id}" data-tab="${tb.id}" aria-selected="${tb===tab}" aria-controls="room-tabpanel" tabindex="${tb===tab?0:-1}" ${tb.aria?`aria-label="${t(tb.aria)}"`:''}>${icon(tb.icon,18)}<span>${t('tab.'+tb.id)}</span></button>`).join('')}</div>`;
  const next=salon?`<a class="primary wide" href="#booth">${icon('camera')} ${t('room.visitBooth')}</a>`:`<a class="primary wide" href="#salon">${icon('wand')} ${t('room.visitSalon')}</a>`;
  return `<div class="panel makeover-panel"><div class="panel-top"><h2 class="sr-only">${t('common.character')}</h2>${dollSwitch()}</div>${tabList}<div id="room-tabpanel" class="tab-body" role="tabpanel" aria-labelledby="tab-${tab.id}">${tabBody(room,tab,shown)}</div>${next}<a class="sub-link" href="#runway">${t('room.runway')}</a></div>${favoritesCard()}${challenge()}`;
}
function favoritesCard(){
  const list=state.favorites[state.doll];
  const slots=list.map((f,i)=>`<div class="fav-slot"><button class="fav-wear" data-fid="fav-${f.id}" data-fav="${f.id}" aria-label="${escapeText(t('fav.wear',{n:i+1,outfit:itemName(f.outfit),hair:itemName(f.hair)}))}">${Shop.dollImg(f,state.doll)}</button><button class="fav-remove" data-fid="unfav-${f.id}" data-unfav="${f.id}" aria-label="${t('fav.remove',{n:i+1})}">${icon('x',13)}</button></div>`);
  if(list.length<FAVORITE_SLOTS)slots.push(`<div class="fav-slot empty" aria-hidden="true"><span>♡</span><small>${t('fav.free',{count:FAVORITE_SLOTS-list.length})}</small></div>`);
  const body=list.length?`<div class="fav-grid">${slots.join('')}</div>`:`<div class="fav-empty"><span aria-hidden="true">♡</span><p>${t('fav.empty')}</p></div>`;
  return `<section class="panel favorites" aria-labelledby="fav-title"><div class="fav-head"><h2 id="fav-title">${icon('heart',18)} ${t('fav.title')}</h2><b>${t('common.ratio',{n:list.length,total:FAVORITE_SLOTS})}</b></div>${body}</section>`;
}
function stageTools(){
  const views=route==='wardrobe'?availableViews():['front'];
  if(!views.includes(stageView))stageView='front';
  const full=state.favorites[state.doll].length>=FAVORITE_SLOTS;
  const turn=views.length>1?`<div class="turn-control" role="group" aria-label="${t('view.group')}">${views.map(v=>`<button data-fid="view-${v}" data-view="${v}" aria-pressed="${v===stageView}">${t('view.'+v)}</button>`).join('')}</div>`:'';
  return `${turn}<div class="stage-tools"><button class="tool-btn surprise" data-fid="surprise" data-action="surprise">${icon('shuffle',18)} ${t('room.surprise')}</button><button class="tool-btn" data-fid="save-fav" data-action="save-fav" ${full?'aria-disabled="true"':''}>${icon('heart',18)} ${t(full?'room.favFull':'room.saveLook')}</button></div>`;
}
function tryOnBar(){
  const bill=trialBill();
  if(!bill.keys.length)return '';
  const short=bill.cost-balance();
  return `<div class="tryon"><p><span class="tryon-eyebrow">${icon('sparkle',13)} ${t('shop.tryingOn')}</span> <b>${escapeText(bill.names)}</b></p><div class="tryon-actions"><button class="primary" data-fid="buy" data-action="buy" ${short>0?'disabled':''}>${icon('star',16)} ${t('shop.buyFor',{cost:bill.cost})}</button><button class="ghost" data-fid="put-back" data-action="put-back">${t('shop.putBack')}</button></div>${short>0?`<p class="tryon-note">${t('shop.short',{count:short})}</p>`:''}</div>`;
}
function stageLabel(){
  const bill=trialBill(),vars={doll:dollNames[state.doll],outfit:itemName(displayLook().outfit)};
  return bill.keys.length?t('room.stageTrying',{...vars,names:bill.names}):t('common.dollIn',vars);
}
function makeoverHeading(){
  return sectionTitle(places.find(p=>p.id===route).name,t(route==='salon'?'salon.sub':'studio.sub'),true);
}
function stagePurse(){return `${icon('star',13)} ${t('room.purse',{balance:`<b id="stage-balance">${I18N.num(balance())}</b>`})}`}
function makeoverRoom(){
  const p=places.find(p=>p.id===route);
  return makeoverHeading()+`<div class="workbench makeover"><section class="display makeover-display" aria-label="${t('room.yourDoll')}"><div class="map-bar"><span>${icon(p.icon,16)} <span id="stage-name">${dollNames[state.doll]}</span></span><span class="stage-purse">${stagePurse()}</span></div><div class="doll-stage makeover-stage zoom-${activeTab(route).zoom} ${state.doll}" id="stage"><canvas id="preview" role="img" aria-label="${escapeText(stageLabel())}"></canvas><span class="stage-busy" aria-hidden="true">✦</span><div id="tryon-slot">${tryOnBar()}</div></div><div id="stage-tools">${stageTools()}</div></section><div class="controls" id="room-controls">${roomControls()}</div></div>`;
}
/* Partial re-render: everything around the canvas, then a repaint of the doll. */
function refreshRoom(focusFid){
  if(!isMakeoverRoute()||!document.querySelector('#stage')){draw();return}
  const fid=focusFid||document.activeElement?.dataset?.fid;
  const stage=document.querySelector('#stage');
  stage.className=`doll-stage makeover-stage zoom-${activeTab(route).zoom} ${state.doll}`;
  document.querySelector('#stage-name').textContent=dollNames[state.doll];
  document.querySelector('#stage-balance').textContent=I18N.num(balance());
  document.querySelector('#tryon-slot').innerHTML=tryOnBar();
  document.querySelector('#stage-tools').innerHTML=stageTools();
  document.querySelector('#room-controls').innerHTML=roomControls();
  const canvas=document.querySelector('#preview');canvas.setAttribute('aria-label',stageLabel());
  paintStage();
  if(fid)main.querySelector(`[data-fid="${CSS.escape(fid)}"]`)?.focus({preventScroll:true});
}
/* Language change: the heading and stage labels, then the usual partial refresh (the doll stays). */
function relocalizeRoom(){
  const heading=main.querySelector('.heading');
  if(heading)heading.outerHTML=makeoverHeading();
  main.querySelector('.makeover-display')?.setAttribute('aria-label',t('room.yourDoll'));
  const purse=main.querySelector('.stage-purse');if(purse)purse.innerHTML=stagePurse();
  refreshRoom();
}
/* The stage doll is a moving puppet (puppet.js) when it can be: the still picture is painted first and
   stays whenever the puppet is off. `stageEmote` is a reaction to play once the new look is on. */
let stagePuppet=null,stageEmote=null;
function paintStage(){
  const c=document.querySelector('#preview');if(!c)return;
  const shot=displayShot(),view=route==='wardrobe'?stageView:'front',emote=stageEmote;stageEmote=null;
  if(stagePuppet&&!stagePuppet.dead&&stagePuppet.canvas===c&&stagePuppet.active&&stagePuppet.doll===shot.doll){stagePuppet.setLookPortrait(shot,view,emote);return}
  if(stagePuppet?.doll!==shot.doll){stagePuppet?.destroy();stagePuppet=null}
  paintCanvas(c,shot,false,view).then(()=>{
    if(!c.isConnected||(stagePuppet&&!stagePuppet.dead&&stagePuppet.canvas===c))return;
    try{stagePuppet?.destroy();stagePuppet=HibiscusPuppet.portrait(c,{shot,view,role:'stage',onActive:on=>{if(!on){stagePuppet=null;paintStage()}}})}catch{stagePuppet=null}
  }).catch(()=>say(t('common.portraitError')));
}
/* Paints offscreen, then copies, so the visible doll only ever changes from one finished picture
   to the next, and a slow earlier paint can never overwrite a newer one. */
const paintTokens=new WeakMap();
function paintCanvas(canvas,shot,postcard=false,view='front'){
  const token={};paintTokens.set(canvas,token);
  const stage=canvas.closest('.doll-stage');
  const slow=setTimeout(()=>stage?.classList.add('is-busy'),160);
  const off=document.createElement('canvas');
  return paintPortrait(off,shot,postcard,view).then(()=>{
    if(paintTokens.get(canvas)!==token)return;
    canvas.width=off.width;canvas.height=off.height;canvas.getContext('2d').drawImage(off,0,0);
    canvas.classList.add('painted');
  }).finally(()=>{clearTimeout(slow);if(paintTokens.get(canvas)===token)stage?.classList.remove('is-busy')});
}

/* ---------- joy ---------- */
function sparkleOnDoll(field,power){
  const stage=document.querySelector('#stage');if(!stage)return;
  const r=stage.getBoundingClientRect(),zoom=activeTab(route).zoom;
  const at={outfit:.5,outfitTint:.5,shoes:.86,shoesTint:.86,necklace:.33,earrings:.28,earringsTint:.28,hair:.2,hairColor:.2,clip:.16,hat:.12,glasses:.16,bag:.55,toy:.6}[field]??.3;
  const y=zoom==='full'?at:.42;
  try{HibiscusFx.burst(r.left+r.width/2,r.top+r.height*y,power)}catch{}
}
function maybeCompliment(){
  equipCount++;
  if(equipCount<4||Date.now()-lastCompliment<15000||Math.random()<.45)return;
  equipCount=0;lastCompliment=Date.now();
  say(t('compliment.'+Math.floor(Math.random()*COMPLIMENTS)));
}

/* ---------- actions ---------- */
/* Analytics category of a look field or an ownership key (see analytics.js). */
const FIELD_CATEGORY={outfit:'outfit',outfitTint:'outfit',shoes:'shoes',shoesTint:'shoes',earrings:'jewelry',earringsTint:'jewelry',necklace:'jewelry',
  hair:'hair',hairColor:'hair-color',lips:'makeup',blush:'makeup',shadow:'makeup',gem:'makeup',nails:'nails',clip:'accessory',
  hat:'accessory',glasses:'accessory',bag:'accessory',toy:'accessory'}; // no new event details: worn things count as accessories
function keyCategory(key){
  const [kind,id]=key.split(':');
  if(kind==='item'||kind==='tint')return FIELD_CATEGORY[catalogItem(id)?.category];
  return kind==='hair-color'?'hair-color':FIELD_CATEGORY[kind];
}
function choose(field,value){
  const shown=displayLook();
  if(shown[field]===value)return;
  const before=trialBill().keys.join();
  const next={...shown,[field]:value};
  if(Shop.ITEM_FIELDS.includes(field)&&(field+'Tint') in next)next[field+'Tint']='original';
  const committed=settle(readLook(next,state.doll));
  stageEmote=field==='outfit'||field==='outfitTint'?'sway':state.doll==='little'?'shy':'smile';
  persist();refreshRoom();
  const bill=trialBill();
  if(bill.keys.length&&bill.keys.join()!==before){
    say(t('shop.trySay',{names:bill.names,count:bill.cost}));sparkleOnDoll(field);track('tryon',FIELD_CATEGORY[field]);
  }else if(committed){sparkleOnDoll(field);maybeCompliment();track('makeover',FIELD_CATEGORY[field]);}
}
function openBuy(){
  const bill=trialBill();if(!bill.keys.length)return;
  const dialog=document.querySelector('#buy-dialog'),left=balance()-bill.cost;
  if(left<0){say(t('shop.needMore',{count:-left,names:bill.names}));return}
  fillBuyDialog();
  dialog.showModal();
}
function fillBuyDialog(){
  const bill=trialBill(),dialog=document.querySelector('#buy-dialog'),left=balance()-bill.cost;
  dialog.querySelector('#buy-title').textContent=t('shop.buyTitle',{count:bill.cost});
  dialog.querySelector('#buy-text').textContent=t('shop.buyText',{names:bill.names,wallet:t('shop.buyWallet',{balance:balance(),count:left})});
}
function relocalizeBuyDialog(){if(document.querySelector('#buy-dialog').open&&trialBill().keys.length)fillBuyDialog()}
function confirmBuy(){
  const dialog=document.querySelector('#buy-dialog');dialog.close();
  const bill=trialBill();
  if(!bill.keys.length)return;
  if(bill.cost>balance()){say(t('shop.fewMore'));refreshRoom();return}
  state.spent+=bill.cost;
  bill.keys.forEach(k=>{if(!state.owned.includes(k))state.owned.push(k);freshKeys.add(k);
    const p=Shop.price(k);track('purchase',keyCategory(k),p<10?'1-9':p<20?'10-19':'20-plus')});
  state.looks[state.doll]=displayLook();trial=null;stageEmote='cheer';
  persist();navBar();
  const wallet=document.querySelector('#wallet');wallet.classList.remove('spent');void wallet.offsetWidth;wallet.classList.add('spent');
  refreshRoom();
  (main.querySelector('.is-new[aria-pressed="true"]')||main.querySelector('[data-fid="surprise"]'))?.focus({preventScroll:true});
  tone(true);say(t('shop.bought',{names:bill.names,count:balance()}));
}
function surpriseMe(){
  trial=null;
  const res=Shop.surprise(state.doll,look());
  if(!res)return;
  const keep=look();
  state.looks[state.doll]=readLook({...res.look,frame:keep.frame,sticker:keep.sticker,backdrop:keep.backdrop},state.doll);
  stageEmote='sway';persist();refreshRoom();
  const stage=document.querySelector('#stage');
  if(stage){stage.classList.remove('twirl');void stage.offsetWidth;stage.classList.add('twirl');}
  [0,140,280].forEach((t,i)=>setTimeout(()=>sparkleOnDoll(['hair','outfit','shoes'][i],.8),t));
  say(t('surprise.say',{theme:t('theme.'+res.theme)}));track('surprise',route);
}
function saveFavorite(){
  const list=state.favorites[state.doll];
  if(list.length>=FAVORITE_SLOTS){say(t('fav.full'));return}
  const style=styleOf(look());
  if(list.some(f=>Shop.STYLE_FIELDS.every(k=>f[k]===style[k]))){say(t('fav.already'));return}
  list.push({...readLook(style,state.doll),id:Date.now().toString(36)+Math.random().toString(36).slice(2,6)});
  persist();refreshRoom('save-fav');track('favorite','saved');
  const slot=main.querySelectorAll('.fav-wear');slot[slot.length-1]?.closest('.fav-slot')?.classList.add('just-saved');
  const bill=trialBill();
  say(bill.keys.length?t('fav.savedSkipped',{names:bill.names}):t('fav.saved'));
}
function wearFavorite(id){
  const f=state.favorites[state.doll].find(f=>f.id===id);if(!f)return;
  trial=null;
  settle(readLook({...look(),...styleOf(f)},state.doll));trial=null; // a favorite only ever holds owned options
  persist();refreshRoom();sparkleOnDoll('outfit',1);track('favorite','worn');
  say(t('fav.wearing',{n:state.favorites[state.doll].indexOf(f)+1}));
}
function confirmUnfavorite(){
  const dialog=document.querySelector('#remove-favorite');dialog.close();
  const list=state.favorites[state.doll];
  state.favorites[state.doll]=list.filter(f=>f.id!==dialog.dataset.id);
  persist();refreshRoom('save-fav');say(t('fav.removed'));
}
function switchDoll(doll){
  if(doll===state.doll)return;
  dropTrial('shop.droppedSwitch');track('character',doll);
  state.doll=doll;stageView='front';persist();refreshRoom();
}
/* Click handling for the makeover rooms; returns true when the click was handled. */
function makeoverClick(b,d){
  if(d.planTab&&roomTab[d.planRoom])roomTab[d.planRoom]=d.planTab; // challenge "plan my look" link; navigation continues
  if(d.action==='confirm-buy'){confirmBuy();return true}
  if(d.action==='confirm-unfav'){confirmUnfavorite();return true}
  if(!isMakeoverRoute())return false;
  if(d.doll){switchDoll(d.doll);return true}
  if(d.tab){roomTab[route]=d.tab;refreshRoom();return true}
  if(d.pick){choose(d.pick,d.value);return true}
  if(d.rack){rackTheme=d.rack;refreshRoom('rack-'+d.rack);return true}
  if(d.view){stageView=d.view;refreshRoom();return true}
  if(d.fav){wearFavorite(d.fav);return true}
  if(d.unfav){const dialog=document.querySelector('#remove-favorite');dialog.dataset.id=d.unfav;dialog.showModal();return true}
  if(d.field){const v=['frame','sticker','backdrop'].includes(d.field)?Number(d.value):d.value;state.looks[state.doll]=readLook({...look(),[d.field]:v},state.doll);persist();refreshRoom();return true}
  switch(d.action){
    case 'surprise':surpriseMe();return true;
    case 'save-fav':saveFavorite();return true;
    case 'buy':openBuy();return true;
    case 'put-back':{const bill=trialBill();trial=null;refreshRoom();main.querySelector('[data-fid="surprise"]')?.focus({preventScroll:true});say(t('shop.putBackSay',{names:bill.names}));return true}
  }
  return false;
}
/* Arrow keys move between tabs (WAI-ARIA tabs pattern with automatic activation). */
document.addEventListener('keydown',e=>{
  const tab=e.target.closest?.('[role="tab"]');if(!tab||!isMakeoverRoute())return;
  const tabs=[...tab.parentElement.querySelectorAll('[role="tab"]')],i=tabs.indexOf(tab);
  const j={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:tabs.length-1}[e.key];
  if(j===undefined)return;
  e.preventDefault();
  const next=tabs[(j+tabs.length)%tabs.length];
  roomTab[route]=next.dataset.tab;refreshRoom(next.dataset.fid);
});
