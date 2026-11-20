/* Display text comes from i18n.js: `name` getters and dollNames follow the current language. */
const places = [
  {id:'wardrobe',icon:'hanger',color:'#e55095',x:24,y:38},
  {id:'salon',icon:'wand',color:'#a272cb',x:65,y:30},
  {id:'arcade',icon:'gamepad',color:'#548cd5',x:80,y:58},
  {id:'garden',icon:'flower',color:'#6aaf81',x:20,y:68},
  {id:'booth',icon:'camera',color:'#e3924f',x:49,y:81}
].map(p=>Object.defineProperty(p,'name',{get(){return t('place.'+p.id)},enumerable:true}));
const dollNames={get adult(){return t('doll.adult')},get little(){return t('doll.little')}};
const saveKey='hibiscus-club-v1';

const smallInt=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max?n:0;
const FAVORITE_ID=/^[\w-]{1,40}$/;
function readFavorites(raw,doll){
  return (Array.isArray(raw)?raw:[]).filter(f=>f&&typeof f==='object'&&typeof f.id==='string'&&FAVORITE_ID.test(f.id)).slice(0,6).map(f=>({...readLook(f,doll),id:f.id}));
}
function loadGame(){
  let raw={};
  try{raw=JSON.parse(localStorage.getItem(saveKey))||{}}catch{}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))raw={};
  const game={
    doll:raw.doll==='little'?'little':'adult',
    life:loadIslandLife(raw.life),
    looks:{adult:readLook(raw.looks?.adult,'adult'),little:readLook(raw.looks?.little,'little')},
    stars:smallInt(raw.stars,Number.MAX_SAFE_INTEGER),sound:raw.sound!==false,sparkle:raw.sparkle!==false,
    analytics:raw.analytics!==false, // anonymous play counts (analytics.js); the Privacy dialog has the switch
    visits:places.filter(p=>Array.isArray(raw.visits)&&raw.visits.includes(p.id)).map(p=>p.id),
    missions:smallInt(raw.missions,Number.MAX_SAFE_INTEGER),
    bouquets:smallInt(raw.bouquets,Number.MAX_SAFE_INTEGER),
    best:smallInt(raw.best,Number.MAX_SAFE_INTEGER),
    photos:(Array.isArray(raw.photos)?raw.photos:[]).filter(p=>p&&Object.hasOwn(dollNames,p.doll)&&typeof p.id==='string'&&/^[\w-]+$/.test(p.id)).slice(0,24).map(p=>({...readLook(p,p.doll),doll:p.doll,id:p.id})),
    /* Star shop (save format additions): `stars` stays the lifetime total earned, `spent` is what the
       shop has taken, `owned` lists bought option keys, `favorites` holds up to six looks per doll. */
    spent:0,
    owned:Shop.readOwned(raw.owned),
    favorites:{adult:readFavorites(raw.favorites?.adult,'adult'),little:readFavorites(raw.favorites?.little,'little')},
    lang:I18N.SUPPORTED.includes(raw.lang)?raw.lang:null // only set once the player picks a language
  };
  game.spent=Math.min(smallInt(raw.spent,Number.MAX_SAFE_INTEGER),game.stars);
  // Anything already in her saved wardrobe stays hers (saves from before the shop wore everything free).
  for(const doll of ['adult','little'])for(const l of [game.looks[doll],...game.favorites[doll]])
    for(const k of Shop.lookKeys(l))if(Shop.price(k)&&!game.owned.includes(k))game.owned.push(k);
  return game;
}
const state=loadGame();
/* Anonymous play counts: event and detail must be listed in analytics.js (and worker/events.js). */
const track=(e,d,band)=>{try{HibiscusAnalytics.track(e,d,band)}catch{}}; // a missing analytics.js never breaks play
const main=document.querySelector('#game');
const help=document.querySelector('#help');
const announcer=document.querySelector('#announcer');
let route='',timer,announceTimer,round=null,stems=[],gardenNote='',storageFailed=false,bouquetStarted=false;
function persist(){
  try{localStorage.setItem(saveKey,JSON.stringify(state));storageFailed=false}
  catch{storageFailed=true;}
}
function say(msg){
  announcer.textContent=storageFailed?t('say.sessionOnly',{msg}):msg;
  announcer.classList.add('shown');clearTimeout(announceTimer);
  announceTimer=setTimeout(()=>announcer.classList.remove('shown'),3200);
}
function tone(win=false){
  // Sparkle blip for ordinary clicks, fanfare with shimmer for wins. Shares music.js's AudioContext.
  if(win)try{HibiscusFx.confetti()}catch{}
  if(!state.sound)return;
  try{HibiscusMusic.effect(win)}catch{}
}
function look(){return state.looks[state.doll]}
function currentShot(){return {...look(),doll:state.doll}}
function navBar(){
  const links=[['map','map'],['life','compass'],['wardrobe','hanger'],['scrapbook','book']];
  document.querySelector('#navigation').innerHTML=links.map(([id,s])=>`<a href="#${id}" ${route===id?'aria-current="page"':''}>${icon(s)}<span>${t('nav.'+id)}</span></a>`).join('');
  const wallet=document.querySelector('#wallet'),spend=t('wallet.toSpend',{count:balance()});
  wallet.innerHTML=`${icon('star',19)} <b aria-hidden="true">${I18N.num(balance())}</b> <span class="wallet-unit" aria-hidden="true">${t('wallet.unit',{count:balance()})}</span><span class="sr-only">${spend}</span>`;
  wallet.title=t('wallet.title',{spend,earned:t('wallet.earned',{count:state.stars})});
  const b=document.querySelector('.sound');b.innerHTML=icon(state.sound?'volume':'mute',18);
  b.title=b.ariaLabel=t(state.sound?'sound.off':'sound.on');b.setAttribute('aria-pressed',String(state.sound));
  const fx=document.querySelector('.sparkle-toggle');fx.innerHTML=icon(state.sparkle?'sparkle':'sparkle-off',18);
  fx.title=fx.ariaLabel=t(state.sparkle?'sparkle.off':'sparkle.on');fx.setAttribute('aria-pressed',String(state.sparkle));
}
function dollSwitch(){
  return `<div class="switch" role="group" aria-label="${t('common.chooseCharacter')}">${Object.entries(dollNames).map(([id,n])=>`<button data-doll="${id}" aria-pressed="${id===state.doll}">${n}</button>`).join('')}</div>`;
}
function sectionTitle(title,sub,room=false){
  return `<div class="heading"><div>${room?`<a class="back" href="#map">‹ &nbsp; ${t('common.backToMap')}</a>`:''}<h1>${title}<span class="heading-sparks" aria-hidden="true">✦<small>✧</small></span></h1><p>${sub}</p></div>${room?'':`<button class="guide" data-action="help">${icon('help',17)} ${t('common.howToPlay')}</button>`}</div>`;
}
function passport(){
  return `<section class="passport"><div class="pass-title"><span class="pass-icon">${icon('book',23)}</span><div><h2>${t('passport.title')}</h2><p>${t('passport.sub')}</p></div><b>${t('common.ratio',{n:state.visits.length,total:5})}</b></div><div class="stamps">${places.map(p=>`<a href="#${p.id}" style="--ink:${p.color}" class="stamp ${state.visits.includes(p.id)?'earned':''}" aria-label="${t(state.visits.includes(p.id)?'passport.collected':'passport.todo',{place:p.name})}"><span>${icon(p.icon,21)}</span>${p.name}</a>`).join('')}</div></section>`;
}
/* Style challenges: each brief names two things to wear (catalog ids, per doll where they differ).
   Every brief can be met by both dolls with free starter options. */
const briefs=[
  {key:'picnic',need:{outfit:{adult:'green-hibiscus-sundress',little:'pink-gingham-bow-dress'},clip:'peach-blossom'}},
  {key:'disco',need:{outfit:{adult:'pink-velour-cargo',little:'denim-overalls'},hairColor:'honey'}},
  {key:'seashell',need:{necklace:'pearl-starfish-necklace',earrings:'pearl-studs'}},
  {key:'mall',need:{shoes:{adult:'pink-chunky-sneakers',little:'white-velcro-sneakers'},hair:'side-ponytail'}},
  {key:'rosy',need:{blush:'rose',gem:'heart'}},
  {key:'midnight',need:{hairColor:'jet',clip:'gold-star'}},
  {key:'homecoming',need:{outfit:{adult:'hibiscus-flares',little:'yellow-dot-dress'},clip:'satin-bow'}},
  {key:'bob',need:{hair:'curly-bob',earrings:'heart-studs'}}
];
const brief=()=>briefs[state.missions%briefs.length];
const briefPlan={outfit:['wardrobe','outfits'],shoes:['wardrobe','shoes'],earrings:['wardrobe','jewelry'],necklace:['wardrobe','jewelry'],
  hair:['salon','hair'],hairColor:['salon','hair'],clip:['salon','accessories'],lips:['salon','makeup'],blush:['salon','makeup'],shadow:['salon','makeup'],gem:['salon','makeup'],nails:['salon','nails']};
function briefNeeds(b,doll){return Object.entries(b.need).map(([field,v])=>[field,typeof v==='string'?v:v[doll]])}
function needName(field,id){
  if(field==='hairColor')return t('challenge.need.hairColor',{name:hairColorOptions().find(h=>h.id===id)?.name||id});
  if(Shop.MAKEUP_FIELDS.includes(field)){const name=CATALOG.makeup[field].find(o=>o.id===id)?.name||id;return I18N.has('challenge.need.'+field)?t('challenge.need.'+field,{name}):name;}
  return itemName(id);
}
const briefMet=(b,shot)=>briefNeeds(b,shot.doll).every(([f,v])=>shot[f]===v);
function challenge(){
  const b=brief(),shot=currentShot(),needs=briefNeeds(b,state.doll);
  const todo=needs.find(([f,v])=>shot[f]!==v),plan=todo&&briefPlan[todo[0]];
  const link=todo?`<a class="challenge-link" href="#${plan[0]}" data-plan-room="${plan[0]}" data-plan-tab="${plan[1]}">${t('challenge.plan')} <span>✧</span></a>`:route==='booth'?`<p class="challenge-ready">${icon('check',16)} ${t('challenge.ready')}</p>`:`<a class="challenge-link" href="#booth">${t('challenge.takePhoto')} <span>✧</span></a>`;
  return `<aside class="challenge"><div class="eyeline">${icon('ticket',18)} ${t('challenge.eyeline')}</div><h2>${t('brief.'+b.key)}</h2><p>${t('challenge.wear')}</p><ul class="brief-list">${needs.map(([f,v])=>`<li class="${shot[f]===v?'met':''}"><span aria-hidden="true">${shot[f]===v?icon('check',14):'♡'}</span>${escapeText(needName(f,v))}<span class="sr-only">${t(shot[f]===v?'challenge.wearing':'challenge.notYet')}</span></li>`).join('')}</ul>${link}<span class="ticket-star" aria-hidden="true">☆</span></aside>`;
}
function mapScreen(){
  return sectionTitle(t('map.title'),t('map.sub'))+`<div class="map-layout"><div class="map-column"><section class="map-case" aria-label="${t('map.label')}"><div class="map-bar"><span>${icon('compass',16)} ${t('map.explorer')}</span><span aria-hidden="true">✧ &nbsp; ✦ &nbsp; ✧</span></div><div class="map-art">${places.map(p=>`<a class="pin pin-${p.id}" style="--x:${p.x}%;--y:${p.y}%;--ink:${p.color}" href="#${p.id}"><i>${icon(p.icon,20)}</i><strong>${p.name}</strong></a>`).join('')}<span class="compass" role="img" aria-label="${t('map.north')}">N<span>✥</span></span></div></section>${passport()}</div><div class="rail"><section class="player"><header>${icon('id',20)} <h2>${t('card.title')}</h2><span aria-hidden="true">✦</span></header><div class="player-body"><div class="portrait-print"><div class="card-portrait"><canvas id="card-preview" aria-label="${escapeText(t('common.dollIn',{doll:dollNames[state.doll],outfit:itemName(look().outfit)}))}"></canvas></div><span class="tape" aria-hidden="true"></span><img class="flower-sticker" src="assets/flower.svg" alt=""><span class="caption">${escapeText(playerLabel())} <i>♡</i></span></div>${dollSwitch()}<a class="primary wide" href="#life">${icon('compass',17)} ${t('card.explore')}</a><a class="sub-link" href="#wardrobe">${t('card.dressMe')}</a></div></section>${challenge()}</div></div>`;
}
function group(label,body){return `<section class="option-group"><h3>${label}</h3>${body}</section>`}
/* `names` is a function so the option labels are read in the current language on every render. */
function options(field,names){
  return `<div class="choices">${names().map((name,i)=>{const locked=field==='frame'&&i===3&&state.stars<10;
    return `<button data-field="${field}" data-value="${i}" aria-pressed="${look()[field]===i}" ${locked?'disabled':''}>${field==='frame'?`<span class="swatch" style="background:${frameColors[i][1]}"></span>`:''}${locked?t('booth.goldenLocked',{name}):name}</button>`}).join('')}</div>`;
}
/* Photo Booth. The Dress-Up Studio and Beauty Salon are built by makeover.js. */
function studio(){
  const p=places.find(p=>p.id==='booth');
  const stand=`<canvas id="preview" role="img" aria-label="${escapeText(t('common.dollIn',{doll:dollNames[state.doll],outfit:itemName(look().outfit)}))}"></canvas>`;
  const controls=group(t('common.character'),dollSwitch())+group(t('booth.frame'),options('frame',frameNames))+group(t('booth.sticker'),options('sticker',stickerNames))+group(t('booth.scenery'),options('backdrop',sceneryNames));
  return sectionTitle(p.name,t('booth.sub'),true)+`<div class="workbench"><section class="display"><div class="map-bar"><span>${icon(p.icon,16)} ${dollNames[state.doll]}</span><span>✧</span></div><div class="doll-stage photo-stage">${stand}</div></section><div class="controls"><div class="panel">${controls}<button class="primary wide" data-action="snap">${icon('camera')} ${t('booth.snap')}</button><a class="sub-link" href="#scrapbook">${t('booth.openScrapbook')}</a><p class="booth-more">${t('booth.more',{studio:`<a href="#wardrobe">${t('place.wardrobe')}</a>`,salon:`<a href="#salon">${t('place.salon')}</a>`})}</p></div>${challenge()}</div></div>`;
}

const deckIcons=['flower','star','heart','camera','music','hanger'];
function startRound(){
  const cards=[...deckIcons,...deckIcons];
  for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}
  round={cards,up:[],matched:[],turns:0,done:false};
}
function arcade(){
  if(!round)startRound();
  const r=round;
  return sectionTitle(t('place.arcade'),t('arcade.sub'),true)+`<div class="workbench"><section class="panel arcade"><div class="score"><b>${icon('gamepad')} ${t('arcade.game')}</b><span>${t('arcade.pairs',{found:r.matched.length/2})}</span></div><div class="memory-grid">${r.cards.map((name,i)=>{
    const shown=r.up.includes(i)||r.matched.includes(i);
    return `<button class="memory ${shown?'up':''} ${r.matched.includes(i)?'matched':''}" data-card="${i}" aria-label="${t('arcade.card',{n:i+1,face:shown?t('arcade.face.'+name):t('arcade.faceDown')})}" ${shown||r.up.length===2?'disabled':''}>${shown?icon(name,39):'<span>✧</span>'}</button>`;
  }).join('')}</div></section><div class="panel game-details"><div class="eyeline">${icon('star')} ${t('arcade.scorecard')}</div><h2>${t(r.done?'arcade.done':'arcade.game')}</h2><p>${t(r.done?'arcade.doneText':'arcade.intro')}</p><dl><div><dt>${t('arcade.turns')}</dt><dd>${I18N.num(r.turns)}</dd></div><div><dt>${t('arcade.best')}</dt><dd>${state.best?t('arcade.bestTurns',{count:state.best}):'—'}</dd></div><div><dt>${t('arcade.reward')}</dt><dd>${t('arcade.rewardValue')}</dd></div></dl><button class="primary wide" data-action="restart">${t('arcade.newGame')}</button></div></div>`;
}
const flowerKeys=['rose','daisy','hibiscus','tulip'];
const flowerName=i=>t('flower.'+flowerKeys[i]);
const flowerGlyph=['🌹','🌼','🌺','🌷'];
const orders=[[0,1,2],[3,2,2],[1,0,3],[0,0,2]];
function garden(){
  const order=orders[state.bouquets%orders.length];
  return sectionTitle(t('place.garden'),t('garden.sub'),true)+`<div class="workbench"><section class="panel garden"><div class="eyeline">${icon('flower')} ${t('garden.table')}</div><div class="bouquet" role="img" aria-label="${t('garden.preview')}">${[0,1,2].map(i=>`<span class="stem stem-${i} ${stems[i]===undefined?'empty':''}">${stems[i]===undefined?'✧':flowerGlyph[stems[i]]}</span>`).join('')}<div class="vase"></div></div><div class="flower-picks">${flowerKeys.map((_,i)=>`<button data-flower="${i}" ${stems.length===3?'disabled':''}><span>${flowerGlyph[i]}</span>${flowerName(i)}</button>`).join('')}</div></section><div class="panel game-details"><div class="eyeline">${icon('ticket')} ${t('garden.orderEyeline')}</div><h2>${t('garden.orderTitle')}</h2><p>${t('garden.orderText')}</p><ul class="order">${order.map(i=>`<li>${flowerGlyph[i]} ${flowerName(i)}</li>`).join('')}</ul><p class="garden-note" role="status">${gardenNote?t(gardenNote):t('garden.progress',{n:stems.length})}</p><button class="primary wide" data-action="wrap" ${stems.length!==3?'disabled':''}>${t('garden.wrap')}</button><button class="sub-link" data-action="undo" ${!stems.length?'disabled':''}>${t('garden.undo')}</button></div></div>`;
}
function scrapbook(){
  return sectionTitle(t('page.scrapbook'),t('scrapbook.sub'),true)+`<div class="album-head"><b>${t('scrapbook.count',{n:state.photos.length})}</b><a class="primary" href="#booth">${icon('camera',17)} ${t('scrapbook.booth')}</a></div>`+(state.photos.length?`<div class="album-grid">${state.photos.map((s,i)=>`<article class="album-card"><canvas data-photo="${s.id}" role="img" aria-label="${escapeText(t('scrapbook.photo',{n:i+1,doll:dollNames[s.doll],outfit:itemName(s.outfit)}))}"></canvas><div><button data-download="${s.id}" aria-label="${t('scrapbook.download',{n:i+1})}">${icon('download',17)} ${t('scrapbook.png')}</button><button data-remove="${s.id}" aria-label="${t('scrapbook.removeLabel',{n:i+1})}">${t('scrapbook.remove')}</button></div></article>`).join('')}</div>`:`<section class="album-empty"><span>${icon('book',48)}</span><h2>${t('scrapbook.emptyTitle')}</h2><p>${t('scrapbook.emptyText')}</p><a class="primary" href="#booth">${t('scrapbook.first')}</a></section>`);
}
function draw(){
  const focused=document.activeElement;
  const key=focused?.dataset&&Object.keys(focused.dataset)[0];
  const val=key?focused.dataset[key]:null;
  detachWorld();
  navBar();
  main.innerHTML=route==='life'?lifeScene():route==='map'?mapScreen():route==='arcade'?arcade():route==='garden'?garden():route==='scrapbook'?scrapbook():route==='runway'?runway():isMakeoverRoute()?makeoverRoom():studio();
  if(route==='life')attachWorld();
  if(isMakeoverRoute())paintStage();
  else{const c=document.querySelector('#preview, #card-preview');
    if(c)paintCanvas(c,currentShot(),route==='booth').catch(()=>say(t('common.portraitError')));}
  main.querySelectorAll('[data-photo]').forEach(el=>paintPortrait(el,state.photos.find(s=>s.id===el.dataset.photo),true).catch(()=>say(t('scrapbook.loadError'))));
  if(key&&val!==null){
    const buttons=Array.from(main.querySelectorAll('button'));
    buttons.find(b=>b.dataset[key]===val&&(!focused.hasAttribute('data-value')||b.dataset.value===focused.dataset.value))?.focus({preventScroll:true});
  }
}
function setPageTitle(){
  document.title=t('meta.title',{page:places.find(p=>p.id===route)?.name||t('page.'+route)});
}
function navigate(){
  detachWorld();
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  const id=location.hash.slice(1),leaving=route;
  const dropped=leaving&&leaving!==id&&dropTrial();
  route=[...places.map(p=>p.id),'scrapbook','runway','life'].includes(id)?id:'map';
  document.documentElement.dataset.room=route; // style.css: each room's pastel theme
  if(route!==leaving)track('room',route);
  clearTimeout(timer);if(round)round.up=[];resetRunway();
  if(places.some(p=>p.id===route)&&!state.visits.includes(route)){state.visits.push(route);persist();}
  setPageTitle();
  draw();window.scrollTo(0,0);
  if(dropped)say(t('shop.droppedLeave'));
}
function takePhoto(){
  if(state.photos.length>=24){say(t('booth.full'));return;}
  dropTrial('shop.droppedPhoto'); // try-ons never reach a postcard
  const shot=currentShot();
  shot.id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  state.photos.unshift(shot);
  const b=brief(),won=briefMet(b,shot);
  if(won){state.missions++;state.stars+=10;track('challenge',b.key);}
  track('photo',['studio',...districts.map(d=>d.id)][shot.backdrop]||'studio');
  persist();draw();tone(true);say(t(won?'booth.savedWon':'booth.saved'));
}
function flipCard(i){
  if(round.done||round.up.length===2||round.up.includes(i)||round.matched.includes(i))return;
  if(!round.turns&&!round.up.length)track('game-start','memory'); // first card of a round
  round.up.push(i);
  if(round.up.length===2){
    round.turns++;const [a,b]=round.up;
    if(round.cards[a]===round.cards[b]){
      round.matched.push(a,b);round.up=[];tone(true);
      if(round.matched.length===12){
        round.done=true;state.stars+=8;state.best=state.best?Math.min(state.best,round.turns):round.turns;
        persist();say(t('arcade.won'));track('game-done','memory');
      }
    }else timer=setTimeout(()=>{round.up=[];draw()},850);
  }
  draw();
}
function wrapBouquet(){
  if(stems.length!==3)return;
  const order=orders[state.bouquets%orders.length];
  if([...stems].sort().join()!==[...order].sort().join()){
    gardenNote='garden.wrong';draw();return; // gardenNote holds a key, so it follows the language
  }
  state.bouquets++;state.stars+=5;stems=[];gardenNote='garden.next';bouquetStarted=false;track('game-done','bouquet');
  persist();draw();tone(true);say(t('garden.delivered'));
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button,a');if(!b||b.disabled)return;
  if(!b.classList.contains('sound'))tone();
  if(b.classList.contains('sound')){state.sound=!state.sound;persist();HibiscusMusic.setEnabled(state.sound);navBar();tone();track('sound',state.sound?'on':'off');return;}
  if(b.classList.contains('sparkle-toggle')){state.sparkle=!state.sparkle;persist();track('sparkle',state.sparkle?'on':'off');try{HibiscusFx.setEnabled(state.sparkle);if(state.sparkle){const r=b.getBoundingClientRect();HibiscusFx.burst(r.left+r.width/2,r.top+r.height/2)}}catch{}navBar();return;}
  const d=b.dataset;
  if(d.lang){setLanguage(d.lang);return;}
  if(makeoverClick(b,d))return;
  if(d.pose!==undefined){performPose(Number(d.pose));return;}
  if(route==='life'&&(d.travel!==undefined||d.lifeAction||d.taskStep!==undefined)){handleLifeAction(b);return;}
  if(d.doll){detachWorld();if(d.doll!==state.doll)track('character',d.doll);state.doll=d.doll;persist();draw();return;}
  if(d.field){const v=['frame','sticker','backdrop'].includes(d.field)?Number(d.value):d.value;state.looks[state.doll]=readLook({...look(),[d.field]:v},state.doll);persist();draw();return;}
  if(d.card!==undefined){flipCard(Number(d.card));return;}
  if(d.flower!==undefined){if(!bouquetStarted){bouquetStarted=true;track('game-start','bouquet')}if(stems.length<3)stems.push(Number(d.flower));gardenNote='';draw();return;}
  if(d.download){
    try{
      const canvas=document.createElement('canvas');await paintPortrait(canvas,state.photos.find(p=>p.id===d.download),true);
      const link=document.createElement('a');link.download='hibiscus-postcard-'+d.download+'.png';
      link.href=canvas.toDataURL('image/png');link.click();track('postcard','png');
    }catch{say(t('scrapbook.downloadError'));}
    return;
  }
  if(d.remove){
    const dialog=document.querySelector('#remove-photo');dialog.dataset.id=d.remove;dialog.showModal();return;
  }
  switch(d.action){
    case 'help':help.showModal();break;
    case 'privacy':syncPrivacy();privacyDialog.showModal();break;
    case 'snap':takePhoto();break;
    case 'rehearse':startRunway();break;
    case 'restart':clearTimeout(timer);startRound();draw();break;
    case 'wrap':wrapBouquet();break;
    case 'undo':stems.pop();gardenNote='';draw();break;
    case 'confirm-remove':{
      const dialog=document.querySelector('#remove-photo');
      state.photos=state.photos.filter(p=>p.id!==dialog.dataset.id);dialog.close();persist();draw();say(t('scrapbook.removed'));break;
    }
  }
});
window.addEventListener('hashchange',()=>{navigate();main.focus({preventScroll:true})});
/* Language switch: saved with the game, then every visible string is rebuilt in place. The room,
   try-on, open game round, scroll position and keyboard focus (on the EN | ES button) all stay. */
function setLanguage(code){
  if(!I18N.SUPPORTED.includes(code))return;
  state.lang=code;persist();
  if(I18N.setLang(code))track('lang',code);
}
/* Privacy dialog (footer link on every page): the switch is saved with the game; off stops all counting at once. */
const privacyDialog=document.querySelector('#privacy');
function syncPrivacy(){
  const box=document.querySelector('#analytics-switch'),optOut=(()=>{try{return HibiscusAnalytics.browserOptOut}catch{return false}})();
  box.checked=state.analytics;box.disabled=optOut;
  document.querySelector('.privacy-browser').hidden=!optOut;
}
document.addEventListener('change',e=>{
  if(e.target.id!=='analytics-switch')return;
  state.analytics=e.target.checked;persist();
  try{HibiscusAnalytics.setEnabled(state.analytics)}catch{}
});
/* Focus goes back to the footer link, unless something else (a room change) already took it. */
privacyDialog.addEventListener('close',()=>{
  const a=document.activeElement;
  if(!a||a===document.body||privacyDialog.contains(a))document.querySelector('.footer-link').focus({preventScroll:true});
});
window.addEventListener('langchange',()=>{
  const y=window.scrollY,x=window.scrollX;
  setPageTitle();
  if(isMakeoverRoute()&&document.querySelector('#stage')){navBar();relocalizeRoom();}
  else draw();
  relocalizeBuyDialog();relocalizeEncounter();
  const nameInput=document.querySelector('#character-name');
  if(nameInput.validationMessage)nameInput.setCustomValidity(t('name.empty'));
  window.scrollTo(x,y);
  say(t('lang.changed'));
});
HibiscusMusic.setEnabled(state.sound);
try{HibiscusFx.setEnabled(state.sparkle)}catch{}
I18N.applyStatic(); // i18n.js picked the language: the saved choice, else the browser's
try{HibiscusAnalytics.init(state.analytics,()=>({c:state.doll,l:I18N.lang}))}catch{}
syncPrivacy();
navigate();
track('visit',route);
