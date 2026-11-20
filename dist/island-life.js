/* Each story has one resident, a sequence of world interactions, and one reward. */
const districts = [
  {id:'boardwalk',name:'Pearl Boardwalk',resident:'Mara',role:'Shell collector',spot:'Shell basket',icon:'compass',person:[.60,.73],object:[.82,.49],approach:[.82,.72],floor:.69,color:'#67bdc9',
    greeting:'Have you ever held a shell to your ear? I keep trying to find one that sounds like this beach.',
    topic:'What do you listen for?',answer:'The little hush between waves. Kit says it would make a lovely opening for the pavilion show.',
    welcome:'Did the tide bring anything interesting today?'},
  {id:'market',name:'Flower Market',resident:'Rosa',role:'Market gardener',spot:'Potting bench',icon:'flower',person:[.57,.73],object:[.82,.54],approach:[.82,.75],floor:.73,color:'#8ebd89',
    greeting:'I saved a little space on my potting bench. There’s always room for another gardener here.',
    topic:'What grows best here?',answer:'Hibiscus loves our sunny mornings. I turn the pots a little each day so every side gets its share.',
    welcome:'There’s a new leaf on the cutting we planted last week!'},
  {id:'pavilion',name:'Starlight Pavilion',resident:'Kit',role:'Stagehand',spot:'Lantern stand',icon:'music',person:[.58,.70],object:[.28,.48],approach:[.28,.64],floor:.63,color:'#aa92c9',
    greeting:'Listen to that echo! I’m getting the pavilion ready for tonight’s lantern concert.',
    topic:'What’s tonight’s show?',answer:'A sound postcard of the island. Waves for the intro, market bells in the middle, and everyone humming the last note.',
    welcome:'You’re just in time for sound check. The acoustics are wonderful tonight.'}
];
const islandStories=[
  {title:'A shell for the show',offer:'Could you pick a striped shell from my basket and take it to Kit? We need a little ocean music at the concert.',reward:6,
    steps:[
      {at:'boardwalk',target:'object',action:'Pick a striped shell',item:'Striped shell',line:'You find a striped shell with a soft, low whistle.'},
      {at:'pavilion',target:'person',action:'Give Kit the shell',line:'That’s the sound! I’ll open the concert with it. Thank you for bringing the beach to our stage.'}
    ]},
  {title:'A window-box wish',offer:'Mara’s kiosk needs a little green. Will you pot a hibiscus cutting and take it to her?',reward:8,
    steps:[
      {at:'market',target:'object',action:'Pot a hibiscus cutting',item:'Hibiscus cutting',line:'You tuck the cutting into a little pot and press the soil around its stem.'},
      {at:'boardwalk',target:'person',action:'Give Mara the cutting',line:'For my window? I’ll put it where it catches the morning sun. Rosa always knows what a place needs.'}
    ]},
  {title:'Opening-night lights',offer:'Our lantern is missing its ribbon. Rosa keeps spares at her potting bench. Can you find one and hang it here before the show?',reward:10,
    steps:[
      {at:'market',target:'object',action:'Find the gold ribbon',item:'Gold ribbon',line:'There’s a spool of gold ribbon in the drawer. You cut a length for Kit.'},
      {at:'pavilion',target:'object',action:'Tie the lantern ribbon',line:'You tie a bow beneath the lantern. The gold catches the light from the stage.'},
      {at:'pavilion',target:'person',action:'Tell Kit the lights are ready',line:'Look at it glow! Now we’re ready for opening night. I saved you a place in the front row.'}
    ]}
];
const sceneryNames=['Pink studio',...districts.map(d=>d.name)];
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
  return `<div class="journal-head">${icon('book',20)}<h2>Task journal</h2><b>${done} / 3</b></div><ol class="story-list">${islandStories.map((story,i)=>{
    const stage=p.stages[i],complete=isComplete(story,i),step=story.steps[stage-1];
    const detail=complete?'Completed · '+story.reward+' stars':step?step.action+' · '+districts.find(d=>d.id===step.at).name:'Speak to '+districts[i].resident+' at '+districts[i].name+'.';
    return `<li class="${complete?'finished':stage?'active':''}"><span class="story-seal">${icon(complete?'check':districts[i].icon,16)}</span><div><strong>${story.title}</strong><p>${detail}</p></div></li>`;
  }).join('')}</ol>`;
}
function inventory(){
  const carried=islandStories.flatMap((s,i)=>s.steps[lifePlayer().stages[i]-2]?.item||[]);
  return `<div class="inventory"><strong>${icon('ticket',16)} In your bag</strong><span>${carried.join(' · ')||'Empty'}</span></div>`;
}
function lifeScene(){
  const p=lifePlayer(),d=district(),slug=d.resident.toLowerCase();
  return sectionTitle('Island Life','Click the ground to walk, or choose a resident to start a conversation.',true)+
  `<div class="life-layout"><div class="life-left"><section class="map-case"><div class="map-bar"><span>${icon(d.icon,16)} ${d.name}</span><span>✧</span></div>
    <div id="world" tabindex="0" role="group" aria-label="${d.name}. Click to walk or use the arrow keys. Select a person or place to interact." style="--scene:url('assets/scenes/${d.id}.jpg')">
      <div class="destination-ring" hidden></div>
      <button class="world-person" data-world-target="person" style="left:${d.person[0]*100}%;top:${d.person[1]*100}%;" aria-label="Walk to ${d.resident} and talk"><img src="assets/scenes/${slug}.png" alt="" draggable="false"><span>${icon('heart',13)} ${d.resident}</span></button>
      <button class="world-object" data-world-target="object" style="left:${d.object[0]*100}%;top:${d.object[1]*100}%">${icon(d.icon,15)} ${d.spot}</button>
      <div class="walker" aria-hidden="true"><div class="walker-shadow"></div><div class="walker-body"><canvas class="walker-doll" width="${WALKER_CROP[2]}" height="${WALKER_CROP[3]}"></canvas></div><span class="walker-name">${escapeText(playerLabel())}</span></div>
    </div><div class="world-status" role="status" aria-live="polite">${icon('pin',16)} <span>Exploring ${d.name}</span></div></section>
    <section class="destinations"><h2>Travel to</h2><div class="travel-cards">${districts.map((place,i)=>`<button data-travel="${i}" aria-pressed="${i===p.scene}"><img src="assets/scenes/${place.id}.jpg" alt=""><span>${place.name}</span></button>`).join('')}</div></section></div>
    <aside class="life-right"><section class="life-profile"><div class="profile-title">${icon('id',20)}<h2>${escapeText(playerLabel())}</h2></div>${dollSwitch()}<div class="profile-actions"><button class="sub-link" data-life-action="name">${p.name?'Edit name':'Choose a name'}</button><a href="#wardrobe" class="sub-link">Change outfit</a></div></section>
    <section class="journal"><div id="journal-body">${taskJournal()}</div><div id="bag">${inventory()}</div></section>
    <button class="guide scene-photo" data-life-action="photo">${icon('camera',17)} Take a scenic postcard</button></aside></div>`;
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
  setWorldStatus(target==='person'?'Walking to '+district().resident+'…':target==='object'?'Walking to the '+district().spot.toLowerCase()+'…':'Walking…');
  const start=performance.now();
  function move(time){
    const progress=duration<16||w.reduced.matches?1:Math.min(1,(time-start)/duration);
    p.x=fromX+dx*progress;p.y=fromY+dy*progress;
    if(progress<1){
      positionWalker(true,side);
      w.frame=requestAnimationFrame(move);
    }else{
      positionWalker();w.frame=0;w.ring.hidden=true;persist();setWorldStatus('Exploring '+district().name);
      if(target)openEncounter(target);
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
  }).catch(()=>say('Her outfit could not load.'));
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
  if(isComplete(islandStories[i],i)){state.stars+=islandStories[i].reward;tone(true);say('Task complete! You earned '+islandStories[i].reward+' stars.');navBar();}
  persist();refreshJournal();openEncounter(target,available.step.line);
}
function openEncounter(target,customLine){
  const dialog=document.querySelector('#encounter'),p=lifePlayer(),d=district(),i=p.scene,story=islandStories[i],person=target==='person';
  const line=customLine||(person?(p.name?'Hi, '+p.name+'! ':'')+(p.topics[i]?d.welcome:d.greeting):{
    boardwalk:'A basket of polished shells sits in the shade. One has a stripe like a ribbon.',
    market:'There are little pots, fresh cuttings, and a drawer full of supplies.',
    pavilion:'A lantern hangs from a brass hook. It sways gently above the stage.'
  }[d.id]);
  const options=currentSteps(target).map(({i,step})=>`<button data-task-step="${i}">${icon('check',15)} ${step.action}</button>`);
  if(person){
    if(p.stages[i]===0)options.push(`<button data-life-action="offer">${icon('ticket',15)} Can I lend a hand?</button>`);
    options.push(`<button data-life-action="topic">${d.topic}</button>`);
  }
  dialog.dataset.target=target;
  dialog.innerHTML=`<div class="encounter-head">${person?`<div class="resident-photo"><img alt="" src="assets/scenes/${d.resident.toLowerCase()}.png"></div>`:icon(d.icon,30)}<div><h2>${person?d.resident:d.spot}</h2><span>${person?d.role+' · '+(p.topics[i]?'Island friend':'New acquaintance'):d.name}</span></div></div><p class="speech">${escapeText(line)}</p><div class="responses">${options.join('')}<button data-life-action="bye">${person?'See you around':'Keep exploring'}</button></div>`;
  if(!dialog.open)dialog.showModal();
  dialog.querySelector('button')?.focus({preventScroll:true});
}
function showOffer(){
  const p=lifePlayer(),i=p.scene,s=islandStories[i],dialog=document.querySelector('#encounter');
  if(!dialog.open||dialog.dataset.target!=='person'||p.stages[i]!==0)return;
  dialog.querySelector('.speech').textContent=s.offer;
  dialog.querySelector('.responses').innerHTML=`<button class="primary" data-life-action="accept">I’ll help · ${s.reward} stars</button><button data-life-action="bye">Maybe later</button>`;
  dialog.querySelector('[data-life-action="accept"]').focus();
}
function handleLifeAction(button){
  const d=button.dataset,p=lifePlayer(),dialog=document.querySelector('#encounter'),nameDialog=document.querySelector('#name-dialog');
  if(d.travel!==undefined){
    const destination=Number(d.travel);
    if(destination===p.scene)return;
    detachWorld();p.scene=destination;p.x=.43;p.y=.86;persist();draw();return;
  }
  if(d.taskStep!==undefined){if(dialog.open)finishStep(Number(d.taskStep),dialog.dataset.target);return;}
  switch(d.lifeAction){
    case 'offer':showOffer();break;
    case 'accept':
      if(dialog.open&&dialog.dataset.target==='person'&&p.stages[p.scene]===0){
        p.stages[p.scene]=1;persist();refreshJournal();openEncounter('person','Thank you! '+islandStories[p.scene].steps[0].action+' at '+districts.find(place=>place.id===islandStories[p.scene].steps[0].at).name+'.');
      }break;
    case 'topic':
      p.topics[p.scene]=true;persist();openEncounter('person',district().answer);break;
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
  if(!name){input.setCustomValidity('Enter a name.');input.reportValidity();return;}
  lifePlayer().name=name;persist();document.querySelector('#name-dialog').close();draw();say('Name saved.');
});
document.addEventListener('input',e=>{if(e.target.id==='character-name')e.target.setCustomValidity('')});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&worldView?.frame){stopWalk(true);setWorldStatus('Exploring '+district().name)}});
window.addEventListener('pagehide',()=>{if(worldView?.frame)stopWalk(true)});

