/* Dress-Up Studio and Beauty Salon: tabbed makeover controls, try-on, star-shop purchases,
   favorite looks and "Surprise me". makeoverRoom() returns the room's HTML for draw() in game.js;
   choosing an option calls refreshRoom(), which keeps the doll canvas, swaps the controls and
   repaints the doll so she never blinks out. */
const roomTabs={
  wardrobe:[
    {id:'outfits',label:'Outfits',icon:'hanger',zoom:'full'},
    {id:'shoes',label:'Shoes',icon:'shoe',zoom:'feet'},
    {id:'jewelry',label:'Jewelry',icon:'gem',zoom:'bust'},
    {id:'scenery',label:'Scenery',icon:'pin',zoom:'full'}],
  salon:[
    {id:'hair',label:'Hair',icon:'comb',zoom:'hair'},
    {id:'makeup',label:'Makeup',icon:'lipstick',zoom:'face'},
    {id:'nails',label:'Nails',icon:'polish',zoom:'hands'},
    {id:'accessories',label:'Accessories',aria:'Hair accessories',icon:'bow',zoom:'hair'}]
};
const roomTab={wardrobe:'outfits',salon:'hair'};
const viewNames={front:'Front',left:'Left',right:'Right',back:'Back'};
const compliments=['Totally fabulous!','That’s so you! ✦','Major sparkle alert!','Runway ready!','Cute overload!','Ooh, what a look!','Picture perfect!','Style star status!','She’s glowing!','Fashion-forward and fun!'];
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
  return {keys,cost:keys.reduce((s,k)=>s+Shop.price(k),0),names:listNames(keys.map(Shop.keyName))};
}
function listNames(n){return n.length<2?n.join(''):n.slice(0,-1).join(', ')+' and '+n[n.length-1]}
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
/* Ends a try-on (leaving the room, switching character, taking a photo) and says why. */
function dropTrial(reason){
  const bill=trialBill();
  trial=null;
  if(bill.keys.length&&reason)say(`${reason}: the ${bill.names} went back to the shop. Buy a try-on to keep it.`);
  return !!bill.keys.length;
}

/* ---------- option markup ---------- */
function optInfo(key){
  const price=Shop.price(key);
  return {price,locked:!!price&&!Shop.owned(key),fresh:!!key&&freshKeys.has(key)};
}
function badge(info){
  return info.locked?`<span class="price-tag" aria-hidden="true">${icon('lock',11)}${info.price}</span>`:info.fresh?'<span class="new-badge" aria-hidden="true">new!</span>':'';
}
function optLabel(name,info,pressed){
  return name+(info.locked?`, locked, ${info.price} stars${pressed?', trying on':', choose to try it on'}`:'')+(info.fresh?', new':'');
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
function tintGroup(field,shown){
  const id=shown[field],tints=tintOptions(id);
  if(id==='none'||tints.length<2)return '';
  return group(`Color <span class="group-note">${escapeText(itemName(id))}</span>`,chipGrid(tints.map(t=>chip(field+'Tint',t.id,t.name,t.swatch?`--c:${t.swatch}`:'',shown))));
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
    case 'outfits':return group('Outfit rack',cardGrid(itemCards('outfit',shown)))+tintGroup('outfit',shown);
    case 'shoes':return group('Shoes',cardGrid([...itemCards('shoes',shown),noneCard('shoes','Barefoot',shown)]))+tintGroup('shoes',shown);
    case 'jewelry':return (catalogOptions('earrings',d).length?group('Earrings',cardGrid([...itemCards('earrings',shown),noneCard('earrings','No earrings',shown)],'compact'))+tintGroup('earrings',shown):'')+
      (catalogOptions('necklace',d).length?group('Necklaces',cardGrid([...itemCards('necklace',shown),noneCard('necklace','No necklace',shown)],'compact')):'');
    case 'scenery':return group('Scenery',options('backdrop',sceneryNames));
    case 'hair':return group('Hairstyle',cardGrid(itemCards('hair',shown,{hair:true})))+
      group('Hair color',chipGrid(hairColorOptions().map(h=>chip('hairColor',h.id,h.name,hairColorSwatch(h),shown))));
    case 'makeup':return makeupGroup('lips','Lips',shown)+makeupGroup('blush','Blush',shown)+makeupGroup('shadow','Eyeshadow',shown)+makeupGroup('gem','Face gems',shown);
    case 'nails':return makeupGroup('nails','Nail polish',shown)+'<p class="group-hint">Polish shows on her fingers, and on her toes when she goes barefoot.</p>';
    case 'accessories':return group('Hair accessories',cardGrid([...itemCards('clip',shown),noneCard('clip','No clip',shown)],'compact'));
  }
  return '';
}
function roomControls(){
  const room=route,shown=displayLook(),tab=activeTab(room),tabs=visibleTabs(room);
  const salon=room==='salon';
  const tabList=`<div class="room-tabs" role="tablist" aria-label="${salon?'Salon':'Dress-up'} categories">${tabs.map(t=>`<button role="tab" id="tab-${t.id}" data-fid="tab-${t.id}" data-tab="${t.id}" aria-selected="${t===tab}" aria-controls="room-tabpanel" tabindex="${t===tab?0:-1}" ${t.aria?`aria-label="${t.aria}"`:''}>${icon(t.icon,18)}<span>${t.label}</span></button>`).join('')}</div>`;
  const next=salon?`<a class="primary wide" href="#booth">${icon('camera')} Visit photo booth</a>`:`<a class="primary wide" href="#salon">${icon('wand')} Visit beauty salon</a>`;
  return `<div class="panel makeover-panel"><div class="panel-top"><h2 class="sr-only">Character</h2>${dollSwitch()}</div>${tabList}<div id="room-tabpanel" class="tab-body" role="tabpanel" aria-labelledby="tab-${tab.id}">${tabBody(room,tab,shown)}</div>${next}<a class="sub-link" href="#runway">Walk the island runway</a></div>${favoritesCard()}${challenge()}`;
}
function favoritesCard(){
  const list=state.favorites[state.doll];
  const slots=list.map((f,i)=>`<div class="fav-slot"><button class="fav-wear" data-fid="fav-${f.id}" data-fav="${f.id}" aria-label="Wear favorite look ${i+1}: ${escapeText(itemName(f.outfit))} with ${escapeText(itemName(f.hair))}">${Shop.dollImg(f,state.doll)}</button><button class="fav-remove" data-fid="unfav-${f.id}" data-unfav="${f.id}" aria-label="Remove favorite look ${i+1}">${icon('x',13)}</button></div>`);
  if(list.length<FAVORITE_SLOTS)slots.push(`<div class="fav-slot empty" aria-hidden="true"><span>♡</span><small>${FAVORITE_SLOTS-list.length} free</small></div>`);
  const body=list.length?`<div class="fav-grid">${slots.join('')}</div>`:`<div class="fav-empty"><span aria-hidden="true">♡</span><p>No favorites yet! Dress her up, then tap <b>Save look</b> to keep the whole outfit here, ready to wear again in one tap.</p></div>`;
  return `<section class="panel favorites" aria-labelledby="fav-title"><div class="fav-head"><h2 id="fav-title">${icon('heart',18)} Favorite looks</h2><b>${list.length} / ${FAVORITE_SLOTS}</b></div>${body}</section>`;
}
function stageTools(){
  const views=route==='wardrobe'?availableViews():['front'];
  if(!views.includes(stageView))stageView='front';
  const full=state.favorites[state.doll].length>=FAVORITE_SLOTS;
  const turn=views.length>1?`<div class="turn-control" role="group" aria-label="Turn her around">${views.map(v=>`<button data-fid="view-${v}" data-view="${v}" aria-pressed="${v===stageView}">${viewNames[v]}</button>`).join('')}</div>`:'';
  return `${turn}<div class="stage-tools"><button class="tool-btn surprise" data-fid="surprise" data-action="surprise">${icon('shuffle',18)} Surprise me!</button><button class="tool-btn" data-fid="save-fav" data-action="save-fav" ${full?'aria-disabled="true"':''}>${icon('heart',18)} ${full?'Favorites full':'Save look'}</button></div>`;
}
function tryOnBar(){
  const bill=trialBill();
  if(!bill.keys.length)return '';
  const short=bill.cost-balance();
  return `<div class="tryon"><p><span class="tryon-eyebrow">${icon('sparkle',13)} Trying on</span> <b>${escapeText(bill.names)}</b></p><div class="tryon-actions"><button class="primary" data-fid="buy" data-action="buy" ${short>0?'disabled':''}>${icon('star',16)} Buy for ${bill.cost}</button><button class="ghost" data-fid="put-back" data-action="put-back">Put back</button></div>${short>0?`<p class="tryon-note">You need ${short} more star${short===1?'':'s'}. Earn them in the Star Arcade, Flower Garden, on the runway or with style challenges.</p>`:''}</div>`;
}
function stageLabel(){return `${dollNames[state.doll]} in ${itemName(displayLook().outfit)}${trialBill().keys.length?', trying on '+trialBill().names:''}`}
function makeoverRoom(){
  const p=places.find(p=>p.id===route),salon=route==='salon';
  const hint=salon?'Hair, makeup, nails and sparkly finishing touches.':'Outfits, shoes and jewelry for your next island adventure.';
  return sectionTitle(p.name,hint,true)+`<div class="workbench makeover"><section class="display makeover-display" aria-label="Your doll"><div class="map-bar"><span>${icon(p.icon,16)} <span id="stage-name">${dollNames[state.doll]}</span></span><span class="stage-purse">${icon('star',13)} <b id="stage-balance">${balance()}</b> to spend</span></div><div class="doll-stage makeover-stage zoom-${activeTab(route).zoom} ${state.doll}" id="stage"><canvas id="preview" role="img" aria-label="${escapeText(stageLabel())}"></canvas><span class="stage-busy" aria-hidden="true">✦</span><div id="tryon-slot">${tryOnBar()}</div></div><div id="stage-tools">${stageTools()}</div></section><div class="controls" id="room-controls">${roomControls()}</div></div>`;
}
/* Partial re-render: everything around the canvas, then a repaint of the doll. */
function refreshRoom(focusFid){
  if(!isMakeoverRoute()||!document.querySelector('#stage')){draw();return}
  const fid=focusFid||document.activeElement?.dataset?.fid;
  const stage=document.querySelector('#stage');
  stage.className=`doll-stage makeover-stage zoom-${activeTab(route).zoom} ${state.doll}`;
  document.querySelector('#stage-name').textContent=dollNames[state.doll];
  document.querySelector('#stage-balance').textContent=balance();
  document.querySelector('#tryon-slot').innerHTML=tryOnBar();
  document.querySelector('#stage-tools').innerHTML=stageTools();
  document.querySelector('#room-controls').innerHTML=roomControls();
  const canvas=document.querySelector('#preview');canvas.setAttribute('aria-label',stageLabel());
  paintStage();
  if(fid)main.querySelector(`[data-fid="${CSS.escape(fid)}"]`)?.focus({preventScroll:true});
}
function paintStage(){
  const c=document.querySelector('#preview');
  if(c)paintCanvas(c,displayShot(),false,route==='wardrobe'?stageView:'front').catch(()=>say('The portrait could not load.'));
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
  const at={outfit:.5,outfitTint:.5,shoes:.86,shoesTint:.86,necklace:.33,earrings:.28,earringsTint:.28,hair:.2,hairColor:.2,clip:.16}[field]??.3;
  const y=zoom==='full'?at:.42;
  try{HibiscusFx.burst(r.left+r.width/2,r.top+r.height*y,power)}catch{}
}
function maybeCompliment(){
  equipCount++;
  if(equipCount<4||Date.now()-lastCompliment<15000||Math.random()<.45)return;
  equipCount=0;lastCompliment=Date.now();
  say(compliments[Math.floor(Math.random()*compliments.length)]);
}

/* ---------- actions ---------- */
function choose(field,value){
  const shown=displayLook();
  if(shown[field]===value)return;
  const before=trialBill().keys.join();
  const next={...shown,[field]:value};
  if(Shop.ITEM_FIELDS.includes(field)&&(field+'Tint') in next)next[field+'Tint']='original';
  const committed=settle(readLook(next,state.doll));
  persist();refreshRoom();
  const bill=trialBill();
  if(bill.keys.length&&bill.keys.join()!==before){
    say(`Trying on the ${bill.names}! Buy it for ${bill.cost} stars to keep it.`);sparkleOnDoll(field);
  }else if(committed){sparkleOnDoll(field);maybeCompliment();}
}
function openBuy(){
  const bill=trialBill();if(!bill.keys.length)return;
  const dialog=document.querySelector('#buy-dialog'),left=balance()-bill.cost;
  if(left<0){say(`You need ${-left} more stars for the ${bill.names}.`);return}
  dialog.querySelector('#buy-title').textContent=`Buy for ${bill.cost} stars?`;
  dialog.querySelector('#buy-text').textContent=`The ${bill.names} will be yours to wear any time. You have ${balance()} stars to spend, so you’ll have ${left} left.`;
  dialog.showModal();
}
function confirmBuy(){
  const dialog=document.querySelector('#buy-dialog');dialog.close();
  const bill=trialBill();
  if(!bill.keys.length)return;
  if(bill.cost>balance()){say('You need a few more stars first.');refreshRoom();return}
  state.spent+=bill.cost;
  bill.keys.forEach(k=>{if(!state.owned.includes(k))state.owned.push(k);freshKeys.add(k)});
  state.looks[state.doll]=displayLook();trial=null;
  persist();navBar();
  const wallet=document.querySelector('#wallet');wallet.classList.remove('spent');void wallet.offsetWidth;wallet.classList.add('spent');
  refreshRoom();
  (main.querySelector('.is-new[aria-pressed="true"]')||main.querySelector('[data-fid="surprise"]'))?.focus({preventScroll:true});
  tone(true);say(`Yay! You bought the ${bill.names}. ${balance()} stars left to spend.`);
}
function surpriseMe(){
  trial=null;
  const res=Shop.surprise(state.doll,look());
  if(!res)return;
  const keep=look();
  state.looks[state.doll]=readLook({...res.look,frame:keep.frame,sticker:keep.sticker,backdrop:keep.backdrop},state.doll);
  persist();refreshRoom();
  const stage=document.querySelector('#stage');
  if(stage){stage.classList.remove('twirl');void stage.offsetWidth;stage.classList.add('twirl');}
  [0,140,280].forEach((t,i)=>setTimeout(()=>sparkleOnDoll(['hair','outfit','shoes'][i],.8),t));
  say(`Surprise! ${res.theme} ✦`);
}
function saveFavorite(){
  const list=state.favorites[state.doll];
  if(list.length>=FAVORITE_SLOTS){say('All six favorite slots are full. Remove one to make room.');return}
  const style=styleOf(look());
  if(list.some(f=>Shop.STYLE_FIELDS.every(k=>f[k]===style[k]))){say('This look is already one of your favorites ♡');return}
  list.push({...readLook(style,state.doll),id:Date.now().toString(36)+Math.random().toString(36).slice(2,6)});
  persist();refreshRoom('save-fav');
  const slot=main.querySelectorAll('.fav-wear');slot[slot.length-1]?.closest('.fav-slot')?.classList.add('just-saved');
  const bill=trialBill();
  say(bill.keys.length?`Saved! The ${bill.names} stayed out because it’s only a try-on.`:'Saved to your favorite looks ♡');
}
function wearFavorite(id){
  const f=state.favorites[state.doll].find(f=>f.id===id);if(!f)return;
  trial=null;
  settle(readLook({...look(),...styleOf(f)},state.doll));trial=null; // a favorite only ever holds owned options
  persist();refreshRoom();sparkleOnDoll('outfit',1);
  say(`Wearing favorite look ${state.favorites[state.doll].indexOf(f)+1} ♡`);
}
function confirmUnfavorite(){
  const dialog=document.querySelector('#remove-favorite');dialog.close();
  const list=state.favorites[state.doll];
  state.favorites[state.doll]=list.filter(f=>f.id!==dialog.dataset.id);
  persist();refreshRoom('save-fav');say('Favorite removed.');
}
function switchDoll(doll){
  if(doll===state.doll)return;
  dropTrial('Switching characters');
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
  if(d.view){stageView=d.view;refreshRoom();return true}
  if(d.fav){wearFavorite(d.fav);return true}
  if(d.unfav){const dialog=document.querySelector('#remove-favorite');dialog.dataset.id=d.unfav;dialog.showModal();return true}
  if(d.field){const v=['frame','sticker','backdrop'].includes(d.field)?Number(d.value):d.value;state.looks[state.doll]=readLook({...look(),[d.field]:v},state.doll);persist();refreshRoom();return true}
  switch(d.action){
    case 'surprise':surpriseMe();return true;
    case 'save-fav':saveFavorite();return true;
    case 'buy':openBuy();return true;
    case 'put-back':{const bill=trialBill();trial=null;refreshRoom();main.querySelector('[data-fid="surprise"]')?.focus({preventScroll:true});say(`Put the ${bill.names} back.`);return true}
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
