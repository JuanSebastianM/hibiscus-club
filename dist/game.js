const places = [
  {id:'wardrobe',name:'Dress-Up Studio',icon:'hanger',color:'#e55095',x:24,y:38},
  {id:'salon',name:'Beauty Salon',icon:'wand',color:'#a272cb',x:65,y:30},
  {id:'arcade',name:'Star Arcade',icon:'gamepad',color:'#548cd5',x:80,y:58},
  {id:'garden',name:'Flower Garden',icon:'flower',color:'#6aaf81',x:20,y:68},
  {id:'booth',name:'Photo Booth',icon:'camera',color:'#e3924f',x:49,y:81}
];
const dollNames={adult:'Grown-up',little:'Little Me'};
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
    visits:places.filter(p=>Array.isArray(raw.visits)&&raw.visits.includes(p.id)).map(p=>p.id),
    missions:smallInt(raw.missions,Number.MAX_SAFE_INTEGER),
    bouquets:smallInt(raw.bouquets,Number.MAX_SAFE_INTEGER),
    best:smallInt(raw.best,Number.MAX_SAFE_INTEGER),
    photos:(Array.isArray(raw.photos)?raw.photos:[]).filter(p=>p&&Object.hasOwn(dollNames,p.doll)&&typeof p.id==='string'&&/^[\w-]+$/.test(p.id)).slice(0,24).map(p=>({...readLook(p,p.doll),doll:p.doll,id:p.id})),
    /* Star shop (save format additions): `stars` stays the lifetime total earned, `spent` is what the
       shop has taken, `owned` lists bought option keys, `favorites` holds up to six looks per doll. */
    spent:0,
    owned:Shop.readOwned(raw.owned),
    favorites:{adult:readFavorites(raw.favorites?.adult,'adult'),little:readFavorites(raw.favorites?.little,'little')}
  };
  game.spent=Math.min(smallInt(raw.spent,Number.MAX_SAFE_INTEGER),game.stars);
  // Anything already in her saved wardrobe stays hers (saves from before the shop wore everything free).
  for(const doll of ['adult','little'])for(const l of [game.looks[doll],...game.favorites[doll]])
    for(const k of Shop.lookKeys(l))if(Shop.price(k)&&!game.owned.includes(k))game.owned.push(k);
  return game;
}
const state=loadGame();
const main=document.querySelector('#game');
const help=document.querySelector('#help');
const announcer=document.querySelector('#announcer');
let route='',timer,announceTimer,round=null,stems=[],gardenNote='',storageFailed=false;
function persist(){
  try{localStorage.setItem(saveKey,JSON.stringify(state));storageFailed=false}
  catch{storageFailed=true;}
}
function say(msg){
  announcer.textContent=msg+(storageFailed?' Progress lasts for this session.':'');
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
  const links=[['map','map','Island Map'],['life','compass','Island Life'],['wardrobe','hanger','Dress-Up'],['scrapbook','book','Scrapbook']];
  document.querySelector('#navigation').innerHTML=links.map(([id,s,label])=>`<a href="#${id}" ${route===id?'aria-current="page"':''}>${icon(s)}<span>${label}</span></a>`).join('');
  const wallet=document.querySelector('#wallet');wallet.innerHTML=`${icon('star',19)} <b>${balance()}</b> <span>stars</span>`;
  wallet.title=`${balance()} stars to spend · ${state.stars} earned in all`;
  const b=document.querySelector('.sound');b.innerHTML=icon(state.sound?'volume':'mute',18);
  b.title=b.ariaLabel=state.sound?'Turn sound off':'Turn sound on';b.setAttribute('aria-pressed',String(state.sound));
  const fx=document.querySelector('.sparkle-toggle');fx.innerHTML=icon(state.sparkle?'sparkle':'sparkle-off',18);
  fx.title=fx.ariaLabel=state.sparkle?'Turn sparkles off':'Turn sparkles on';fx.setAttribute('aria-pressed',String(state.sparkle));
}
function dollSwitch(){
  return `<div class="switch" aria-label="Choose character">${Object.entries(dollNames).map(([id,n])=>`<button data-doll="${id}" aria-pressed="${id===state.doll}">${n}</button>`).join('')}</div>`;
}
function sectionTitle(title,sub,room=false){
  return `<div class="heading"><div>${room?'<a class="back" href="#map">‹ &nbsp; Island map</a>':''}<h1>${title}<span class="heading-sparks" aria-hidden="true">✦<small>✧</small></span></h1><p>${sub}</p></div>${room?'':`<button class="guide" data-action="help">${icon('help',17)} How to play</button>`}</div>`;
}
function passport(){
  return `<section class="passport"><div class="pass-title"><span class="pass-icon">${icon('book',23)}</span><div><h2>Island Passport</h2><p>Visit each spot to collect its stamp.</p></div><b>${state.visits.length} / 5</b></div><div class="stamps">${places.map(p=>`<a href="#${p.id}" style="--ink:${p.color}" class="stamp ${state.visits.includes(p.id)?'earned':''}" aria-label="${p.name}, ${state.visits.includes(p.id)?'stamp collected':'visit to collect stamp'}"><span>${icon(p.icon,21)}</span>${p.name}</a>`).join('')}</div></section>`;
}
/* Style challenges: each brief names two things to wear (catalog ids, per doll where they differ).
   Every brief can be met by both dolls with free starter options. */
const briefs=[
  {title:'Picnic in paradise',need:{outfit:{adult:'green-hibiscus-sundress',little:'pink-gingham-bow-dress'},clip:'peach-blossom'}},
  {title:'Disco by the sea',need:{outfit:{adult:'pink-velour-cargo',little:'denim-overalls'},hairColor:'honey'}},
  {title:'Seashell sweetheart',need:{necklace:'pearl-starfish-necklace',earrings:'pearl-studs'}},
  {title:'Mall crawl Saturday',need:{shoes:{adult:'pink-chunky-sneakers',little:'white-velcro-sneakers'},hair:'side-ponytail'}},
  {title:'Rosy glow-up',need:{blush:'rose',gem:'heart'}},
  {title:'Midnight boardwalk',need:{hairColor:'jet',clip:'gold-star'}},
  {title:'Island homecoming',need:{outfit:{adult:'hibiscus-flares',little:'yellow-dot-dress'},clip:'satin-bow'}},
  {title:'Bouncy bob bash',need:{hair:'curly-bob',earrings:'heart-studs'}}
];
const brief=()=>briefs[state.missions%briefs.length];
const briefPlan={outfit:['wardrobe','outfits'],shoes:['wardrobe','shoes'],earrings:['wardrobe','jewelry'],necklace:['wardrobe','jewelry'],
  hair:['salon','hair'],hairColor:['salon','hair'],clip:['salon','accessories'],lips:['salon','makeup'],blush:['salon','makeup'],shadow:['salon','makeup'],gem:['salon','makeup'],nails:['salon','nails']};
function briefNeeds(b,doll){return Object.entries(b.need).map(([field,v])=>[field,typeof v==='string'?v:v[doll]])}
function needName(field,id){
  if(field==='hairColor')return (hairColorOptions().find(h=>h.id===id)?.name||id)+' hair';
  if(Shop.MAKEUP_FIELDS.includes(field)){const o=CATALOG.makeup[field].find(o=>o.id===id);return (o?.name||id)+(field==='blush'?' blush':field==='gem'?' face gem':field==='nails'?' nails':field==='shadow'?' eyeshadow':'');}
  return itemName(id);
}
const briefMet=(b,shot)=>briefNeeds(b,shot.doll).every(([f,v])=>shot[f]===v);
function challenge(){
  const b=brief(),shot=currentShot(),needs=briefNeeds(b,state.doll);
  const todo=needs.find(([f,v])=>shot[f]!==v),plan=todo&&briefPlan[todo[0]];
  const link=todo?`<a class="challenge-link" href="#${plan[0]}" data-plan-room="${plan[0]}" data-plan-tab="${plan[1]}">Plan my look <span>✧</span></a>`:route==='booth'?`<p class="challenge-ready">${icon('check',16)} All set! Take the photo to win 10 stars.</p>`:`<a class="challenge-link" href="#booth">Take the photo <span>✧</span></a>`;
  return `<aside class="challenge"><div class="eyeline">${icon('ticket',18)} STYLE CHALLENGE · 10 STARS</div><h2>${b.title}</h2><p>Wear these, then take a photo in the Photo Booth:</p><ul class="brief-list">${needs.map(([f,v])=>`<li class="${shot[f]===v?'met':''}"><span aria-hidden="true">${shot[f]===v?icon('check',14):'♡'}</span>${escapeText(needName(f,v))}<span class="sr-only">${shot[f]===v?', wearing it':', not yet'}</span></li>`).join('')}</ul>${link}<span class="ticket-star" aria-hidden="true">☆</span></aside>`;
}
function mapScreen(){
  return sectionTitle('Hibiscus Island','Pick a place on the map and let’s play!')+`<div class="map-layout"><div class="map-column"><section class="map-case" aria-label="Interactive island map"><div class="map-bar"><span>${icon('compass',16)} Island Explorer</span><span aria-hidden="true">✧ &nbsp; ✦ &nbsp; ✧</span></div><div class="map-art">${places.map(p=>`<a class="pin pin-${p.id}" style="--x:${p.x}%;--y:${p.y}%;--ink:${p.color}" href="#${p.id}"><i>${icon(p.icon,20)}</i><strong>${p.name}</strong></a>`).join('')}<span class="compass" aria-label="North">N<span>✥</span></span></div></section>${passport()}</div><div class="rail"><section class="player"><header>${icon('id',20)} <h2>My Player Card</h2><span aria-hidden="true">✦</span></header><div class="player-body"><div class="portrait-print"><div class="card-portrait"><canvas id="card-preview" aria-label="${dollNames[state.doll]} in ${escapeText(itemName(look().outfit))}"></canvas></div><span class="tape" aria-hidden="true"></span><img class="flower-sticker" src="assets/flower.svg" alt=""><span class="caption">${escapeText(playerLabel())} <i>♡</i></span></div>${dollSwitch()}<a class="primary wide" href="#life">${icon('compass',17)} Explore Island Life</a><a class="sub-link" href="#wardrobe">Dress me up</a></div></section>${challenge()}</div></div>`;
}
function group(label,body){return `<section class="option-group"><h3>${label}</h3>${body}</section>`}
function options(field,names){
  return `<div class="choices">${names.map((name,i)=>`<button data-field="${field}" data-value="${i}" aria-pressed="${look()[field]===i}" ${field==='frame'&&i===3&&state.stars<10?'disabled':''}>${field==='frame'?`<span class="swatch" style="background:${frameColors[i][1]}"></span>`:''}${name}${field==='frame'&&i===3&&state.stars<10?' · 10 stars':''}</button>`).join('')}</div>`;
}
/* Photo Booth. The Dress-Up Studio and Beauty Salon are built by makeover.js. */
function studio(){
  const p=places.find(p=>p.id==='booth');
  const stand=`<canvas id="preview" role="img" aria-label="${dollNames[state.doll]} in ${escapeText(itemName(look().outfit))}"></canvas>`;
  const controls=group('Character',dollSwitch())+group('Postcard frame',options('frame',frames))+group('Corner sticker',options('sticker',stickers))+group('Scenery',options('backdrop',sceneryNames));
  return sectionTitle(p.name,'Frame your portrait and save it to your scrapbook.',true)+`<div class="workbench"><section class="display"><div class="map-bar"><span>${icon(p.icon,16)} ${dollNames[state.doll]}</span><span>✧</span></div><div class="doll-stage photo-stage">${stand}</div></section><div class="controls"><div class="panel">${controls}<button class="primary wide" data-action="snap">${icon('camera')} Take photo</button><a class="sub-link" href="#scrapbook">Open scrapbook</a><p class="booth-more">Want a new look first? Visit the <a href="#wardrobe">Dress-Up Studio</a> or <a href="#salon">Beauty Salon</a>.</p></div>${challenge()}</div></div>`;
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
  return sectionTitle('Star Arcade','Flip two cards at a time to find all six matching pairs.',true)+`<div class="workbench"><section class="panel arcade"><div class="score"><b>${icon('gamepad')} Memory Match</b><span>${r.matched.length/2} / 6 pairs</span></div><div class="memory-grid">${r.cards.map((name,i)=>{
    const shown=r.up.includes(i)||r.matched.includes(i);
    return `<button class="memory ${shown?'up':''} ${r.matched.includes(i)?'matched':''}" data-card="${i}" aria-label="Card ${i+1}, ${shown?name:'face down'}" ${shown||r.up.length===2?'disabled':''}>${shown?icon(name,39):'<span>✧</span>'}</button>`;
  }).join('')}</div></section><div class="panel game-details"><div class="eyeline">${icon('star')} SCORECARD</div><h2>${r.done?'Perfect pairs!':'Memory Match'}</h2><p>${r.done?'You earned 8 stars. Play again to beat your best score.':'Match the island keepsakes in as few turns as you can.'}</p><dl><div><dt>Turns</dt><dd>${r.turns}</dd></div><div><dt>Best game</dt><dd>${state.best?state.best+' turns':'—'}</dd></div><div><dt>Reward</dt><dd>8 stars</dd></div></dl><button class="primary wide" data-action="restart">New game</button></div></div>`;
}
const flowers=['Rose','Daisy','Hibiscus','Tulip'];
const flowerGlyph=['🌹','🌼','🌺','🌷'];
const orders=[[0,1,2],[3,2,2],[1,0,3],[0,0,2]];
function garden(){
  const order=orders[state.bouquets%orders.length];
  return sectionTitle('Flower Garden','Pick three blooms to fill the bouquet order.',true)+`<div class="workbench"><section class="panel garden"><div class="eyeline">${icon('flower')} BOUQUET TABLE</div><div class="bouquet" aria-label="Bouquet preview">${[0,1,2].map(i=>`<span class="stem stem-${i} ${stems[i]===undefined?'empty':''}">${stems[i]===undefined?'✧':flowerGlyph[stems[i]]}</span>`).join('')}<div class="vase"></div></div><div class="flower-picks">${flowers.map((n,i)=>`<button data-flower="${i}" ${stems.length===3?'disabled':''}><span>${flowerGlyph[i]}</span>${n}</button>`).join('')}</div></section><div class="panel game-details"><div class="eyeline">${icon('ticket')} FLOWER ORDER</div><h2>Bouquet for a friend</h2><p>Use one stem for every flower on the order. Any order works.</p><ul class="order">${order.map(i=>`<li>${flowerGlyph[i]} ${flowers[i]}</li>`).join('')}</ul><p class="garden-note" role="status">${gardenNote||'Your bouquet has '+stems.length+' of 3 stems.'}</p><button class="primary wide" data-action="wrap" ${stems.length!==3?'disabled':''}>Wrap bouquet · 5 stars</button><button class="sub-link" data-action="undo" ${!stems.length?'disabled':''}>Remove last bloom</button></div></div>`;
}
function scrapbook(){
  return sectionTitle('My Scrapbook','Your island memories, one postcard at a time.',true)+`<div class="album-head"><b>${state.photos.length} / 24 postcards</b><a class="primary" href="#booth">${icon('camera',17)} Photo booth</a></div>`+(state.photos.length?`<div class="album-grid">${state.photos.map((s,i)=>`<article class="album-card"><canvas data-photo="${s.id}" aria-label="Photo ${i+1}, ${dollNames[s.doll]} in ${escapeText(itemName(s.outfit))}"></canvas><div><button data-download="${s.id}" aria-label="Download postcard ${i+1}">${icon('download',17)} PNG</button><button data-remove="${s.id}" aria-label="Remove postcard ${i+1}">Remove</button></div></article>`).join('')}</div>`:`<section class="album-empty"><span>${icon('book',48)}</span><h2>Your first page is waiting</h2><p>Take a picture at the photo booth to start your collection.</p><a class="primary" href="#booth">Take my first photo</a></section>`);
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
    if(c)paintCanvas(c,currentShot(),route==='booth').catch(()=>say('The portrait could not load.'));}
  main.querySelectorAll('[data-photo]').forEach(el=>paintPortrait(el,state.photos.find(s=>s.id===el.dataset.photo),true).catch(()=>say('The postcard could not load.')));
  if(key&&val!==null){
    const buttons=Array.from(main.querySelectorAll('button'));
    buttons.find(b=>b.dataset[key]===val&&(!focused.hasAttribute('data-value')||b.dataset.value===focused.dataset.value))?.focus({preventScroll:true});
  }
}
function navigate(){
  detachWorld();
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  const id=location.hash.slice(1),leaving=route;
  const dropped=leaving&&leaving!==id&&dropTrial();
  route=[...places.map(p=>p.id),'scrapbook','runway','life'].includes(id)?id:'map';
  clearTimeout(timer);if(round)round.up=[];resetRunway();
  if(places.some(p=>p.id===route)&&!state.visits.includes(route)){state.visits.push(route);persist();}
  document.title=(places.find(p=>p.id===route)?.name|| (route==='map'?'Island Map':route==='life'?'Island Life':route==='runway'?'Island Runway':'My Scrapbook'))+' · Hibiscus Club';
  draw();window.scrollTo(0,0);
  if(dropped)say('Try-ons stay in the shop until you buy them, so her look went back to what she owns.');
}
function takePhoto(){
  if(state.photos.length>=24){say('Your scrapbook is full. Remove a postcard to make space.');return;}
  dropTrial('Taking a photo'); // try-ons never reach a postcard
  const shot=currentShot();
  shot.id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  state.photos.unshift(shot);
  const b=brief(),won=briefMet(b,shot);
  if(won){state.missions++;state.stars+=10;}
  persist();draw();tone(true);say(won?'Challenge complete! Postcard saved and 10 stars earned.':'Postcard saved to your scrapbook!');
}
function flipCard(i){
  if(round.done||round.up.length===2||round.up.includes(i)||round.matched.includes(i))return;
  round.up.push(i);
  if(round.up.length===2){
    round.turns++;const [a,b]=round.up;
    if(round.cards[a]===round.cards[b]){
      round.matched.push(a,b);round.up=[];tone(true);
      if(round.matched.length===12){
        round.done=true;state.stars+=8;state.best=state.best?Math.min(state.best,round.turns):round.turns;
        persist();say('All six pairs matched! You earned 8 stars.');
      }
    }else timer=setTimeout(()=>{round.up=[];draw()},850);
  }
  draw();
}
function wrapBouquet(){
  if(stems.length!==3)return;
  const order=orders[state.bouquets%orders.length];
  if([...stems].sort().join()!==[...order].sort().join()){
    gardenNote='Check the order and replace a bloom.';draw();return;
  }
  state.bouquets++;state.stars+=5;stems=[];gardenNote='Bouquet delivered! Your next order is ready.';
  persist();draw();tone(true);say('Bouquet delivered! You earned 5 stars.');
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button,a');if(!b||b.disabled)return;
  if(!b.classList.contains('sound'))tone();
  if(b.classList.contains('sound')){state.sound=!state.sound;persist();HibiscusMusic.setEnabled(state.sound);navBar();tone();return;}
  if(b.classList.contains('sparkle-toggle')){state.sparkle=!state.sparkle;persist();try{HibiscusFx.setEnabled(state.sparkle);if(state.sparkle){const r=b.getBoundingClientRect();HibiscusFx.burst(r.left+r.width/2,r.top+r.height/2)}}catch{}navBar();return;}
  const d=b.dataset;
  if(makeoverClick(b,d))return;
  if(d.pose!==undefined){performPose(Number(d.pose));return;}
  if(route==='life'&&(d.travel!==undefined||d.lifeAction||d.taskStep!==undefined)){handleLifeAction(b);return;}
  if(d.doll){detachWorld();state.doll=d.doll;persist();draw();return;}
  if(d.field){const v=['frame','sticker','backdrop'].includes(d.field)?Number(d.value):d.value;state.looks[state.doll]=readLook({...look(),[d.field]:v},state.doll);persist();draw();return;}
  if(d.card!==undefined){flipCard(Number(d.card));return;}
  if(d.flower!==undefined){if(stems.length<3)stems.push(Number(d.flower));gardenNote='';draw();return;}
  if(d.download){
    try{
      const canvas=document.createElement('canvas');await paintPortrait(canvas,state.photos.find(p=>p.id===d.download),true);
      const link=document.createElement('a');link.download='hibiscus-postcard-'+d.download+'.png';
      link.href=canvas.toDataURL('image/png');link.click();
    }catch{say('Download is available when the game runs on a local or hosted web server.');}
    return;
  }
  if(d.remove){
    const dialog=document.querySelector('#remove-photo');dialog.dataset.id=d.remove;dialog.showModal();return;
  }
  switch(d.action){
    case 'help':help.showModal();break;
    case 'snap':takePhoto();break;
    case 'rehearse':startRunway();break;
    case 'restart':clearTimeout(timer);startRound();draw();break;
    case 'wrap':wrapBouquet();break;
    case 'undo':stems.pop();gardenNote='';draw();break;
    case 'confirm-remove':{
      const dialog=document.querySelector('#remove-photo');
      state.photos=state.photos.filter(p=>p.id!==dialog.dataset.id);dialog.close();persist();draw();say('Postcard removed.');break;
    }
  }
});
window.addEventListener('hashchange',()=>{navigate();main.focus({preventScroll:true})});
HibiscusMusic.setEnabled(state.sound);
try{HibiscusFx.setEnabled(state.sparkle)}catch{}
navigate();
