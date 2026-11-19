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
function readLook(v={}){return {outfit:smallInt(v?.outfit,2),clip:smallInt(v?.clip,3),gem:smallInt(v?.gem,2),frame:smallInt(v?.frame,3),sticker:smallInt(v?.sticker,3),backdrop:smallInt(v?.backdrop,3)}}
function loadGame(){
  let raw={};
  try{raw=JSON.parse(localStorage.getItem(saveKey))||{}}catch{}
  return {
    doll:raw.doll==='little'?'little':'adult',
    life:loadIslandLife(raw.life),
    looks:{adult:readLook(raw.looks?.adult),little:readLook(raw.looks?.little)},
    stars:smallInt(raw.stars,Number.MAX_SAFE_INTEGER),sound:raw.sound!==false,
    visits:places.filter(p=>Array.isArray(raw.visits)&&raw.visits.includes(p.id)).map(p=>p.id),
    missions:smallInt(raw.missions,Number.MAX_SAFE_INTEGER),
    bouquets:smallInt(raw.bouquets,Number.MAX_SAFE_INTEGER),
    best:smallInt(raw.best,Number.MAX_SAFE_INTEGER),
    photos:(Array.isArray(raw.photos)?raw.photos:[]).filter(p=>p&&Object.hasOwn(dollNames,p.doll)&&typeof p.id==='string'&&/^[\w-]+$/.test(p.id)).slice(0,24).map(p=>({...readLook(p),doll:p.doll,id:p.id}))
  };
}
const state=loadGame();
const main=document.querySelector('#game');
const help=document.querySelector('#help');
const announcer=document.querySelector('#announcer');
let route='',timer,announceTimer,angle=null,round=null,stems=[],gardenNote='',storageFailed=false;
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
  if(!state.sound)return;
  try{HibiscusMusic.effect(win)}catch{}
}
function look(){return state.looks[state.doll]}
function currentShot(){return {...look(),doll:state.doll}}
function navBar(){
  const links=[['map','map','Island Map'],['life','compass','Island Life'],['wardrobe','hanger','Dress-Up'],['scrapbook','book','Scrapbook']];
  document.querySelector('#navigation').innerHTML=links.map(([id,s,label])=>`<a href="#${id}" ${route===id?'aria-current="page"':''}>${icon(s)}<span>${label}</span></a>`).join('');
  document.querySelector('#wallet').innerHTML=`${icon('star',19)} <b>${state.stars}</b> <span>stars</span>`;
  const b=document.querySelector('.sound');b.innerHTML=icon(state.sound?'volume':'mute',18);
  b.title=b.ariaLabel=state.sound?'Turn sound off':'Turn sound on';b.setAttribute('aria-pressed',String(state.sound));
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
const briefs=[
  {title:'Picnic in paradise',outfit:1,clip:1}, {title:'Disco by the sea',outfit:2,clip:3}, {title:'Island homecoming',outfit:0,clip:2}
];
const brief=()=>briefs[state.missions%briefs.length];
function challenge(){
  const b=brief();
  return `<aside class="challenge"><div class="eyeline">${icon('ticket',18)} STYLE CHALLENGE</div><h2>${b.title}</h2><p>Photograph the ${wardrobes[state.doll][b.outfit].toLowerCase()} with the ${clips[b.clip].toLowerCase()} clip.</p><a class="challenge-link" href="#wardrobe">Plan my look <span>✧</span></a><span class="ticket-star" aria-hidden="true">☆</span></aside>`;
}
function mapScreen(){
  return sectionTitle('Hibiscus Island','Pick a place on the map and let’s play!')+`<div class="map-layout"><div class="map-column"><section class="map-case" aria-label="Interactive island map"><div class="map-bar"><span>${icon('compass',16)} Island Explorer</span><span aria-hidden="true">✧ &nbsp; ✦ &nbsp; ✧</span></div><div class="map-art">${places.map(p=>`<a class="pin pin-${p.id}" style="--x:${p.x}%;--y:${p.y}%;--ink:${p.color}" href="#${p.id}"><i>${icon(p.icon,20)}</i><strong>${p.name}</strong></a>`).join('')}<span class="compass" aria-label="North">N<span>✥</span></span></div></section>${passport()}</div><div class="rail"><section class="player"><header>${icon('id',20)} <h2>My Player Card</h2><span aria-hidden="true">✦</span></header><div class="player-body"><div class="portrait-print"><div class="card-portrait"><canvas id="card-preview" aria-label="${dollNames[state.doll]} in ${wardrobes[state.doll][look().outfit]}"></canvas></div><span class="tape" aria-hidden="true"></span><img class="flower-sticker" src="assets/flower.svg" alt=""><span class="caption">${escapeText(playerLabel())} <i>♡</i></span></div>${dollSwitch()}<a class="primary wide" href="#life">${icon('compass',17)} Explore Island Life</a><a class="sub-link" href="#wardrobe">Dress me up</a></div></section>${challenge()}</div></div>`;
}
function group(label,body){return `<section class="option-group"><h3>${label}</h3>${body}</section>`}
function options(field,names){
  return `<div class="choices">${names.map((name,i)=>`<button data-field="${field}" data-value="${i}" aria-pressed="${look()[field]===i}" ${field==='frame'&&i===3&&state.stars<10?'disabled':''}>${field==='frame'?`<span class="swatch" style="background:${frameColors[i][1]}"></span>`:''}${name}${field==='frame'&&i===3&&state.stars<10?' · 10 stars':''}</button>`).join('')}</div>`;
}
function studio(){
  const p=places.find(p=>p.id===route);
  const booth=route==='booth',salon=route==='salon';
  const hint=booth?'Frame your portrait and save it to your scrapbook.':salon?'Pick a finishing touch for her hair.':'Try on a look for your next island adventure.';
  const signature=state.doll==='adult'&&look().outfit===0;
  const viewName=['front','side','back'][angle];
  const viewFile=signature&&(!look().backdrop||angle===2)?'assets/adult-0-'+viewName+'.jpg':spritePath(state.doll,look().outfit,viewName);
  const stand=angle!==null&&route==='wardrobe'?`<img class="angle" src="${viewFile}" alt="${wardrobes[state.doll][look().outfit]}, ${viewName} view">`:'<canvas id="preview" aria-label="Current styled doll portrait"></canvas>';
  const rotate=route==='wardrobe'?`<div class="turns">${(signature?[null,0,1,2]:[null,0,1]).map((a,i)=>`<button data-angle="${a??'pose'}" aria-pressed="${angle===a}">${['Pose','Front','Side','Back'][i]}</button>`).join('')}</div>`:'';
  const outfits=`<div class="outfits">${wardrobes[state.doll].map((name,i)=>`<button data-field="outfit" data-value="${i}" aria-pressed="${look().outfit===i}"><img src="assets/${state.doll}-${i}.jpg" alt=""><span>${name}</span></button>`).join('')}</div>`;
  let controls=group('Character',dollSwitch());
  if(booth) controls+=group('Postcard frame',options('frame',frames))+group('Corner sticker',options('sticker',['None','Flower','Bow','Star']));
  else if(salon) controls+=group('Hair accessory',options('clip',clips))+group('Face gems',options('gem',gems));
  else controls+=group('Outfit rack',outfits);
  if(!salon)controls+=group('Scenery',options('backdrop',sceneryNames));
  const backdropStyle=look().backdrop?` style="background: center / cover url('assets/scenes/${districts[look().backdrop-1].id}.jpg')"`:'';
  let next=booth?`<button class="primary wide" data-action="snap">${icon('camera')} Take photo</button>`:`<a class="primary wide" href="#${salon?'booth':'salon'}">${icon(salon?'camera':'wand')}${salon?'Visit photo booth':'Visit beauty salon'}</a>`;
  return sectionTitle(p.name,hint,true)+`<div class="workbench"><section class="display"><div class="map-bar"><span>${icon(p.icon,16)} ${dollNames[state.doll]}</span><span>✧</span></div><div class="doll-stage ${booth?'photo-stage':salon?'salon-stage':''}"${angle!==null?backdropStyle:''}>${stand}</div>${rotate}</section><div class="controls"><div class="panel">${controls}${next}${booth?'<a class="sub-link" href="#scrapbook">Open scrapbook</a>':'<a class="sub-link" href="#runway">Walk the island runway</a>'}</div>${challenge()}</div></div>`;
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
  return sectionTitle('My Scrapbook','Your island memories, one postcard at a time.',true)+`<div class="album-head"><b>${state.photos.length} / 24 postcards</b><a class="primary" href="#booth">${icon('camera',17)} Photo booth</a></div>`+(state.photos.length?`<div class="album-grid">${state.photos.map((s,i)=>`<article class="album-card"><canvas data-photo="${s.id}" aria-label="Photo ${i+1}, ${dollNames[s.doll]} in ${wardrobes[s.doll][s.outfit]}"></canvas><div><button data-download="${s.id}" aria-label="Download postcard ${i+1}">${icon('download',17)} PNG</button><button data-remove="${s.id}" aria-label="Remove postcard ${i+1}">Remove</button></div></article>`).join('')}</div>`:`<section class="album-empty"><span>${icon('book',48)}</span><h2>Your first page is waiting</h2><p>Take a picture at the photo booth to start your collection.</p><a class="primary" href="#booth">Take my first photo</a></section>`);
}
function draw(){
  const focused=document.activeElement;
  const key=focused?.dataset&&Object.keys(focused.dataset)[0];
  const val=key?focused.dataset[key]:null;
  detachWorld();
  navBar();
  main.innerHTML=route==='life'?lifeScene():route==='map'?mapScreen():route==='arcade'?arcade():route==='garden'?garden():route==='scrapbook'?scrapbook():route==='runway'?runway():studio();
  if(route==='life')attachWorld();
  const c=document.querySelector('#preview, #card-preview');
  if(c)paintPortrait(c,currentShot(),route==='booth').catch(()=>say('The portrait could not load.'));
  main.querySelectorAll('[data-photo]').forEach(el=>paintPortrait(el,state.photos.find(s=>s.id===el.dataset.photo),true).catch(()=>say('The postcard could not load.')));
  if(key&&val!==null){
    const buttons=Array.from(main.querySelectorAll('button'));
    buttons.find(b=>b.dataset[key]===val&&(!focused.hasAttribute('data-value')||b.dataset.value===focused.dataset.value))?.focus({preventScroll:true});
  }
}
function navigate(){
  detachWorld();
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  const id=location.hash.slice(1);
  route=[...places.map(p=>p.id),'scrapbook','runway','life'].includes(id)?id:'map';
  clearTimeout(timer);if(round)round.up=[];resetRunway();
  angle=null;
  if(places.some(p=>p.id===route)&&!state.visits.includes(route)){state.visits.push(route);persist();}
  document.title=(places.find(p=>p.id===route)?.name|| (route==='map'?'Island Map':route==='life'?'Island Life':route==='runway'?'Island Runway':'My Scrapbook'))+' · Hibiscus Club';
  draw();window.scrollTo(0,0);
}
function takePhoto(){
  if(state.photos.length>=24){say('Your scrapbook is full. Remove a postcard to make space.');return;}
  const shot=currentShot();
  shot.id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  state.photos.unshift(shot);
  const b=brief(),won=b.outfit===shot.outfit&&b.clip===shot.clip;
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
  const d=b.dataset;
  if(d.pose!==undefined){performPose(Number(d.pose));return;}
  if(route==='life'&&(d.travel!==undefined||d.lifeAction||d.taskStep!==undefined)){handleLifeAction(b);return;}
  if(d.doll){detachWorld();state.doll=d.doll;angle=null;persist();draw();return;}
  if(d.field){look()[d.field]=Number(d.value);angle=null;persist();draw();return;}
  if(d.angle){angle=d.angle==='pose'?null:Number(d.angle);draw();return;}
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
navigate();
