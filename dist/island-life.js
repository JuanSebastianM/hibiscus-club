/* Each story has one resident, a sequence of world interactions, and one reward. */
/* All display text is in i18n.js (district.<id>.* and story.<n>.*); the getters follow the language. */
const districts = [
  {id:'boardwalk',resident:'Mara',icon:'compass',person:[.60,.73],object:[.82,.49],approach:[.82,.72],floor:.69,color:'#67bdc9'},
  {id:'market',resident:'Rosa',icon:'flower',person:[.57,.73],object:[.82,.54],approach:[.82,.75],floor:.73,color:'#8ebd89'},
  {id:'pavilion',resident:'Kit',icon:'music',person:[.58,.70],object:[.28,.48],approach:[.28,.64],floor:.63,color:'#aa92c9'}
].map(d=>I18N.localize(d,'district.'+d.id,['name','role','spot','walkSpot','friend','new','greeting','topic','answer','welcome','objectLine']));
const islandStories=[
  {reward:6,steps:[{at:'boardwalk',target:'object',item:true},{at:'pavilion',target:'person'}]},
  {reward:8,steps:[{at:'market',target:'object',item:true},{at:'boardwalk',target:'person'}]},
  {reward:10,steps:[{at:'market',target:'object',item:true},{at:'pavilion',target:'object'},{at:'pavilion',target:'person'}]}
].map((story,i)=>{
  I18N.localize(story,'story.'+i,['title','offer']);
  story.steps.forEach((step,j)=>{const carried=step.item;delete step.item;I18N.localize(step,`story.${i}.step.${j}`,carried?['action','item','line']:['action','line'])});
  return story;
});
const sceneryNames=()=>[t('scenery.studio'),...districts.map(d=>d.name)];
const cleanName=name=>typeof name==='string'?Array.from(name.trim().replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,24).join(''):'';
const escapeText=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
function loadIslandLife(raw={}){
  const life={};
  for(const id of ['adult','little']){
    const saved=raw?.[id]||{};
    life[id]={
      name:cleanName(saved.name),scene:smallInt(saved.scene,2),
      x:Number.isFinite(saved.x)?clamp(saved.x,.07,.93):.46,
      y:Number.isFinite(saved.y)?clamp(saved.y,.60,.94):.84,
      topics:districts.map((_,i)=>saved.topics?.[i]===true),
      stages:islandStories.map((story,i)=>smallInt(saved.stages?.[i],story.steps.length+1))
    };
  }
  return life;
}
const lifePlayer=()=>state.life[state.doll];
const playerLabel=()=>lifePlayer().name||dollNames[state.doll];
const district=()=>districts[lifePlayer().scene];
const isComplete=(story,i)=>lifePlayer().stages[i]===story.steps.length+1;
function currentSteps(target){
  const p=lifePlayer();
  return islandStories.flatMap((s,i)=>{
    const step=s.steps[p.stages[i]-1];
    return step?.at===district().id&&step.target===target?[{i,step}]:[];
  });
}
function taskJournal(){
  const p=lifePlayer();
  const done=islandStories.filter(isComplete).length;
  return `<div class="journal-head">${icon('book',20)}<h2>${t('life.journal')}</h2><b>${t('common.ratio',{n:done,total:3})}</b></div><ol class="story-list">${islandStories.map((story,i)=>{
    const stage=p.stages[i],complete=isComplete(story,i),step=story.steps[stage-1];
    const detail=complete?t('life.completed',{count:story.reward}):step?t('life.stepAt',{action:step.action,place:districts.find(d=>d.id===step.at).name}):t('life.speakTo',{resident:districts[i].resident,place:districts[i].name});
    return `<li class="${complete?'finished':stage?'active':''}"><span class="story-seal">${icon(complete?'check':districts[i].icon,16)}</span><div><strong>${story.title}</strong><p>${detail}</p></div></li>`;
  }).join('')}</ol>`;
}
function inventory(){
  const carried=islandStories.flatMap((s,i)=>s.steps[lifePlayer().stages[i]-2]?.item||[]);
  return `<div class="inventory"><strong>${icon('ticket',16)} ${t('life.bag')}</strong><span>${carried.join(' · ')||t('life.bagEmpty')}</span></div>`;
}
function lifeScene(){
  const p=lifePlayer(),d=district(),slug=d.resident.toLowerCase();
  return sectionTitle(t('page.life'),t('life.sub'),true)+
  `<div class="life-layout"><div class="life-left"><section class="map-case"><div class="map-bar"><span>${icon(d.icon,16)} ${d.name}</span><span>✧</span></div>
    <div id="world" tabindex="0" role="group" aria-label="${t('life.world',{place:d.name})}" style="--scene:url('assets/scenes/${d.id}.jpg')">
      <div class="destination-ring" hidden></div>
      <button class="world-person" data-world-target="person" style="left:${d.person[0]*100}%;top:${d.person[1]*100}%;" aria-label="${t('life.walkTalk',{resident:d.resident})}"><img src="assets/scenes/${slug}.png" alt="" draggable="false"><span>${icon('heart',13)} ${d.resident}</span></button>
      <button class="world-object" data-world-target="object" style="left:${d.object[0]*100}%;top:${d.object[1]*100}%">${icon(d.icon,15)} ${d.spot}</button>
      <div class="walker" aria-hidden="true"><div class="walker-shadow"></div><div class="walker-body"><canvas class="walker-doll" width="${WALKER_CROP[2]}" height="${WALKER_CROP[3]}"></canvas></div><span class="walker-name">${escapeText(playerLabel())}</span></div>
    </div><div class="world-status" role="status" aria-live="polite">${icon('pin',16)} <span>${t('life.exploring',{place:d.name})}</span></div></section>
    <section class="destinations"><h2>${t('life.travel')}</h2><div class="travel-cards">${districts.map((place,i)=>`<button data-travel="${i}" aria-pressed="${i===p.scene}"><img src="assets/scenes/${place.id}.jpg" alt=""><span>${place.name}</span></button>`).join('')}</div></section></div>
    <aside class="life-right"><section class="life-profile"><div class="profile-title">${icon('id',20)}<h2>${escapeText(playerLabel())}</h2></div>${dollSwitch()}<div class="profile-actions"><button class="sub-link" data-life-action="name">${t(p.name?'life.editName':'life.chooseName')}</button><a href="#wardrobe" class="sub-link">${t('life.changeOutfit')}</a></div></section>
    <section class="journal"><div id="journal-body">${taskJournal()}</div><div id="bag">${inventory()}</div></section>
    <button class="guide scene-photo" data-life-action="photo">${icon('camera',17)} ${t('life.photo')}</button></aside></div>`;
}
let worldView=null;
/* The walker shows the composed doll (DOLL_CANVAS region below): the 'front' view standing and the
   real 'left' / 'right' view while walking (no mirroring, so her hair parting stays right). All three
   views are composed when the scene opens, so turning never waits on a load; a view that fails falls
   back to the front picture mirrored to face the walk. The .walking class adds a bob, sway and lean. */
const WALKER_CROP=[0,60,600,970];
function showWalkerView(view){
  const w=worldView;if(!w)return;
  const want=w.views[view]?view:w.views.front?'front':null;
  if(!want||w.shown===view)return;
  const g=w.canvas.getContext('2d');g.clearRect(0,0,w.canvas.width,w.canvas.height);
  g.drawImage(w.views[want],...WALKER_CROP,0,0,w.canvas.width,w.canvas.height);
  // fallback: the front picture mirrored toward the walk
  w.actor.style.setProperty('--facing',want===view||view==='front'?1:view==='left'?-1:1);
  w.shown=view;
}
function positionWalker(moving=false,side){
  if(!worldView)return;
  const w=worldView,p=lifePlayer();
  const depth=.83+(p.y-.60)*.94;
  w.actor.style.transform=`translate3d(${p.x*w.width}px,${p.y*w.height}px,0) scale(${depth})`;
  w.actor.style.zIndex=String(Math.round(p.y*100));
  if(side)w.actor.style.setProperty('--lean',side);
  w.actor.classList.toggle('walking',moving);
  showWalkerView(moving&&side?(side<0?'left':'right'):'front');
}
function stopWalk(save=false){
  if(!worldView)return;
  const w=worldView;
  cancelAnimationFrame(w.frame);w.frame=0;w.ring.hidden=true;
  positionWalker();
  if(save)persist();
}
function detachWorld(){
  if(!worldView)return;
  stopWalk(true);worldView.observer.disconnect();worldView=null;
}
function setWorldStatus(text){
  const label=document.querySelector('.world-status span');
  if(label)label.textContent=text;
}
function walkTo(x,y,target){
  const w=worldView;
  if(!w)return;
  stopWalk();
  const p=lifePlayer(),fromX=p.x,fromY=p.y;
  x=clamp(x,.07,.93);y=clamp(y,district().floor,.94);
  const dx=x-fromX,dy=y-fromY,side=dx<0?-1:1;
  const duration=Math.hypot(dx,dy*w.height/w.width)*2400;
  w.ring.style.left=(x*100)+'%';w.ring.style.top=(y*100)+'%';w.ring.hidden=false;
  setWorldStatus(target==='person'?t('life.walkingTo',{resident:district().resident}):target==='object'?district().walkSpot:t('life.walking'));
  const start=performance.now();
  function move(time){
    const progress=duration<16||w.reduced.matches?1:Math.min(1,(time-start)/duration);
    p.x=fromX+dx*progress;p.y=fromY+dy*progress;
    if(progress<1){
      positionWalker(true,side);
      w.frame=requestAnimationFrame(move);
    }else{
      positionWalker();w.frame=0;w.ring.hidden=true;persist();setWorldStatus(t('life.exploring',{place:district().name}));
      if(target)openEncounter(target);
      if(target==='person')track('chat',district().id);
    }
  }
  w.frame=requestAnimationFrame(move);
}
function attachWorld(){
  const el=document.querySelector('#world'),actor=el.querySelector('.walker');
  const canvas=actor.querySelector('canvas');
  const w=worldView={el,actor,canvas,views:{},shown:null,ring:el.querySelector('.destination-ring'),width:el.clientWidth,height:el.clientHeight,frame:0,reduced:matchMedia('(prefers-reduced-motion: reduce)')};
  el.querySelector('.world-person').style.zIndex=String(Math.round(district().person[1]*100));
  const shot=currentShot();
  composeDoll(shot,'front').then(doll=>{
    if(w!==worldView)return;
    w.views.front=doll;const now=w.shown||'front';w.shown=null;showWalkerView(now);
  }).catch(()=>say(t('life.outfitError')));
  // the walking views load in the background right away; until one is ready the front stands in
  if((CATALOG.views||[]).includes('left'))for(const view of ['left','right'])composeDoll(shot,view).then(doll=>{
    if(w!==worldView)return;
    w.views[view]=doll;if(w.shown===view){w.shown=null;showWalkerView(view)}
  }).catch(()=>{});
  const size=()=>actor.style.setProperty('--size',((state.doll==='adult'?.325:.225)*w.height)+'px');
  size();
  positionWalker();
  w.observer=new ResizeObserver(()=>{w.width=el.clientWidth;w.height=el.clientHeight;size();if(!w.frame)positionWalker()});
  w.observer.observe(el);
  el.addEventListener('click',e=>{
    const target=e.target.closest('[data-world-target]')?.dataset.worldTarget;
    if(target){
      const d=district(),point=target==='person'?[d.person[0]-.12,d.person[1]+.04]:d.approach;
      walkTo(point[0],point[1],target);
    }else{
      const rect=el.getBoundingClientRect();
      walkTo((e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height);
    }
  });
  el.addEventListener('keydown',e=>{
    if(e.target!==el)return;
    const delta={ArrowLeft:[-.09,0],ArrowRight:[.09,0],ArrowUp:[0,-.07],ArrowDown:[0,.07]}[e.key];
    if(delta){e.preventDefault();if(!e.repeat)walkTo(lifePlayer().x+delta[0],lifePlayer().y+delta[1]);}
  });
}
function refreshJournal(){
  document.querySelector('#journal-body').innerHTML=taskJournal();
  document.querySelector('#bag').innerHTML=inventory();
}
function finishStep(i,target){
  const p=lifePlayer(),available=currentSteps(target).find(entry=>entry.i===i);
  if(!available)return;
  p.stages[i]++;
  if(isComplete(islandStories[i],i)){state.stars+=islandStories[i].reward;track('errand','story-'+(i+1));tone(true);say(t('life.taskDone',{count:islandStories[i].reward}));navBar();}
  persist();refreshJournal();openEncounter(target,()=>available.step.line);
}
/* What the open conversation shows, kept so a language switch can redraw it: `line` is a function
   returning the current-language text, `offer` marks the "can I help" card. */
let encounterView=null;
function openEncounter(target,customLine,focus=true){
  const dialog=document.querySelector('#encounter'),p=lifePlayer(),d=district(),i=p.scene,person=target==='person';
  encounterView={target,line:customLine,offer:false};
  const line=customLine?customLine():person?(p.topics[i]?d.welcome:d.greeting):d.objectLine;
  const speech=person&&!customLine&&p.name?t('life.hi',{name:p.name,line}):line;
  const options=currentSteps(target).map(({i,step})=>`<button data-task-step="${i}">${icon('check',15)} ${step.action}</button>`);
  if(person){
    if(p.stages[i]===0)options.push(`<button data-life-action="offer">${icon('ticket',15)} ${t('life.lend')}</button>`);
    options.push(`<button data-life-action="topic">${d.topic}</button>`);
  }
  dialog.dataset.target=target;
  dialog.innerHTML=`<div class="encounter-head">${person?`<div class="resident-photo"><img alt="" src="assets/scenes/${d.resident.toLowerCase()}.png"></div>`:icon(d.icon,30)}<div><h2>${person?d.resident:d.spot}</h2><span>${person?t('life.roleStatus',{role:d.role,status:p.topics[i]?d.friend:d.new}):d.name}</span></div></div><p class="speech">${escapeText(speech)}</p><div class="responses">${options.join('')}<button data-life-action="bye">${t(person?'life.bye':'life.keepExploring')}</button></div>`;
  if(!dialog.open)dialog.showModal();
  if(focus)dialog.querySelector('button')?.focus({preventScroll:true});
}
function showOffer(focus=true){
  const p=lifePlayer(),i=p.scene,s=islandStories[i],dialog=document.querySelector('#encounter');
  if(!dialog.open||dialog.dataset.target!=='person'||p.stages[i]!==0)return;
  encounterView.offer=true;
  dialog.querySelector('.speech').textContent=s.offer;
  dialog.querySelector('.responses').innerHTML=`<button class="primary" data-life-action="accept">${t('life.accept',{count:s.reward})}</button><button data-life-action="bye">${t('life.later')}</button>`;
  if(focus)dialog.querySelector('[data-life-action="accept"]').focus();
}
/* Language change while talking: redraw the same card and keep focus on the same response. */
function relocalizeEncounter(){
  const dialog=document.querySelector('#encounter');
  if(!dialog.open||!encounterView)return;
  const f=document.activeElement,was=dialog.contains(f)?f.dataset.lifeAction||'step-'+f.dataset.taskStep:null;
  const v=encounterView;
  openEncounter(v.target,v.line,false);
  if(v.offer)showOffer(false);
  const again=was&&[...dialog.querySelectorAll('button')].find(b=>(b.dataset.lifeAction||'step-'+b.dataset.taskStep)===was);
  (again||dialog.querySelector('button'))?.focus({preventScroll:true});
}
function handleLifeAction(button){
  const d=button.dataset,p=lifePlayer(),dialog=document.querySelector('#encounter'),nameDialog=document.querySelector('#name-dialog');
  if(d.travel!==undefined){
    const destination=Number(d.travel);
    if(destination===p.scene)return;
    detachWorld();p.scene=destination;p.x=.43;p.y=.86;persist();draw();track('district',districts[destination].id);return;
  }
  if(d.taskStep!==undefined){if(dialog.open)finishStep(Number(d.taskStep),dialog.dataset.target);return;}
  switch(d.lifeAction){
    case 'offer':showOffer();break;
    case 'accept':
      if(dialog.open&&dialog.dataset.target==='person'&&p.stages[p.scene]===0){
        p.stages[p.scene]=1;persist();refreshJournal();const first=islandStories[p.scene].steps[0];
        openEncounter('person',()=>t('life.thanks',{action:first.action,place:districts.find(place=>place.id===first.at).name}));
      }break;
    case 'topic':
      p.topics[p.scene]=true;persist();openEncounter('person',()=>district().answer);break;
    case 'bye':dialog.close();break;
    case 'name':
      stopWalk(true);nameDialog.querySelector('input').value=p.name;nameDialog.showModal();nameDialog.querySelector('input').focus();break;
    case 'photo':look().backdrop=p.scene+1;persist();location.hash='booth';break;
  }
}
document.addEventListener('submit',e=>{
  if(e.target.id!=='name-form')return;
  e.preventDefault();
  const input=e.target.querySelector('input'),name=cleanName(input.value);
  if(!name){input.setCustomValidity(t('name.empty'));input.reportValidity();return;}
  lifePlayer().name=name;persist();document.querySelector('#name-dialog').close();draw();say(t('name.saved'));
});
document.addEventListener('input',e=>{if(e.target.id==='character-name')e.target.setCustomValidity('')});
// The browser's own "required" bubble would speak the browser's language, not the game's.
document.addEventListener('invalid',e=>{if(e.target.id==='character-name'&&!e.target.value.trim())e.target.setCustomValidity(t('name.empty'))},true);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&worldView?.frame){stopWalk(true);setWorldStatus(t('life.exploring',{place:district().name}))}});
window.addEventListener('pagehide',()=>{if(worldView?.frame)stopWalk(true)});

