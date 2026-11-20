/* Walk-in places: the scene of one district (route #boardwalk, #market or #pavilion), the walker, the
   quest HUD and markers, sparkles to find, conversations, the name prompt and the first-visit tour.
   The rules and data are in quests.js; display text in i18n.js (life.*, quest.*, daily.*, tour.*). */
const isDistrictRoute=r=>DISTRICT_IDS.includes(r);
/* The route decides where she is: arriving somewhere new puts her at the entrance. */
function enterDistrict(id){
  const p=lifePlayer(),i=DISTRICT_IDS.indexOf(id);
  if(i>=0&&p.scene!==i){p.scene=i;p.x=.43;p.y=.86;}
}
const here=()=>district().id;
function travelStrip(o){
  const items=districts.map(d=>`<a href="#${d.id}" class="travel-chip" ${d.id===here()?'aria-current="page"':''} aria-label="${escapeText(t(d.id===here()?'life.travelHere':o.at===d.id?'life.travelNext':'life.travelTo',{place:d.name}))}"><img src="assets/scenes/${d.id}.jpg" alt=""><span>${d.name}</span>${o.at===d.id&&d.id!==here()?'<b class="chip-next" aria-hidden="true">★</b>':''}</a>`).join('');
  return `<nav class="travel-strip" aria-label="${t('life.travel')}"><a href="#map" class="travel-map">${icon('map',18)}<span>${t('common.backToMap')}</span></a>${items}</nav>`;
}
/* The quest HUD over the scene: the next step in one line, where it is, one tap to travel there. */
function hud(){
  const o=objective(),s=dailySummary(),elsewhere=o.at&&o.at!==here();
  const where=o.kind==='rest'?t('quest.sparklesLeft',{count:s.spots-s.found}):elsewhere?objectiveWhere(o):o.target==='token'?t('quest.lookAround'):objectiveWhere(o);
  return `<div class="hud-main"><span class="hud-badge" aria-hidden="true">${o.kind==='rest'?icon('check',16):'★'}</span><div class="hud-text"><span class="hud-label">${t(o.kind==='rest'?'quest.restLabel':'quest.label')}</span><strong>${escapeText(o.text)}</strong>${where?`<span class="hud-where">${icon('pin',13)} ${escapeText(where)}</span>`:''}</div>${elsewhere?`<a class="primary hud-go" href="#${o.at}">${t('quest.go',{place:districtOf(o.at).name})} ›</a>`:''}</div><button class="hud-today" data-life-action="journal" aria-label="${escapeText(t('quest.todayLabel',{done:s.done,total:s.total,found:s.found,spots:s.spots}))}">${icon('ticket',14)} ${t('quest.today',{done:s.done,total:s.total})} <span aria-hidden="true">·</span> ✦ ${I18N.num(s.found)}/${I18N.num(s.spots)}</button>`;
}
/* Sparkles (one star each) and the things a "find" errand hides, as buttons on the ground. */
function tokens(){
  const i=district().id,idx=lifePlayer().scene,s=dailySummary(),out=[];
  s.plan.sparkles[idx].forEach(([x,y],k)=>{
    if(s.day.found&1<<(idx*SPARKLES_PER_PLACE+k))return;
    out.push(`<button class="token sparkle-token" data-token="s${k}" style="left:${x*100}%;top:${y*100}%;--z:${Math.round(y*100)}" aria-label="${escapeText(t('life.sparkleLabel',{thing:district().sparkleName}))}"><span aria-hidden="true">${icon('sparkle',18)}</span></button>`);
  });
  s.plan.errands.forEach((e,n)=>{
    if(e.type!=='find'||e.at!==idx||dailyDone(e,s.day.prog[n]))return;
    s.plan.tokens[idx].forEach(([x,y],k)=>{
      if(s.day.prog[n]&1<<k)return;
      out.push(`<button class="token find-token" data-token="f${k}" style="left:${x*100}%;top:${y*100}%;--z:${Math.round(y*100)}" aria-label="${escapeText(t('life.findLabel.'+i))}"><span aria-hidden="true">${icon(i==='pavilion'?'music':i==='market'?'flower':'gem',17)}</span></button>`);
    });
  });
  return out.join('');
}
/* Which targets in this scene have something to do: 'next' (the HUD's objective) or 'task' (another
   story or daily step). Markers are a glyph plus a word, so neither motion nor colour carries them. */
function targetState(target){
  const o=objective(),at=here();
  if(o.at===at&&o.target===target)return 'next';
  if(storySteps(at,target).length||dailySteps(at,target).length)return 'task';
  if(target==='person'){
    const offer=offerable();if(offer>=0&&storiesOf()[offer].giver===at)return 'task';
    const {plan,day}=dailySummary(),g=plan.errands.findIndex(e=>e.type==='greet');
    if(g>=0&&!dailyDone(plan.errands[g],day.prog[g])&&!(day.prog[g]&1<<lifePlayer().scene))return 'task';
  }
  return '';
}
function marker(state){
  return state?`<span class="marker marker-${state}" aria-hidden="true"><b>${state==='next'?'★':'!'}</b><em>${t(state==='next'?'life.markerNext':'life.markerTask')}</em></span>`:'';
}
function personLabel(st){const d=district();return t('life.walkTalk',{resident:d.resident})+(st?t(st==='next'?'life.isNext':'life.hasTask'):'')}
function objectLabel(st){const d=district();return t('life.walkLook',{spot:d.spot})+(st?t(st==='next'?'life.isNext':'life.hasTask'):'')}
function storyList(){
  const p=lifePlayer(),stories=storiesOf(),offer=offerable();
  return `<ol class="story-list">${stories.map((story,i)=>{
    const stage=p.quests[i],done=storyDone(p,state.doll,i),step=story.steps[stage-1],giver=districtOf(story.giver);
    const detail=done?t('life.completed',{count:story.reward}):step?t('life.stepAt',{action:step.action,place:districtOf(step.at).name}):i===offer?t('life.speakTo',{resident:giver.resident,place:giver.name}):t('life.storyWaiting');
    return `<li class="${done?'finished':stage?'active':i===offer?'ready':'waiting'}"><span class="story-seal">${icon(done?'check':giver.icon,16)}</span><div><strong>${story.title}</strong><p>${escapeText(detail)}</p></div><span class="story-reward">${done?'':`★ ${I18N.num(storyPayout(i))}`}</span></li>`;
  }).join('')}</ol>`;
}
function dailyList(){
  const s=dailySummary();
  const rows=s.plan.errands.map((e,i)=>{
    const done=dailyDone(e,s.day.prog[i]),o=done?null:dailyObjective(e,s.day.prog[i]);
    const progress=!done&&(e.type==='find'||e.type==='greet')?t('common.ratio',{n:bits(s.day.prog[i]),total:3})+' · ':'';
    return `<li class="${done?'finished':''}"><span class="story-seal">${icon(done?'check':'star',15)}</span><div><strong>${escapeText(dailyTitle(e))}</strong><p>${done?t('life.dailyDone',{count:e.reward}):escapeText(progress+objectiveWhere(o))}</p></div><span class="story-reward">${done?'':`★ ${I18N.num(e.reward)}`}</span></li>`;
  }).join('');
  const rest=s.done===s.total?`<p class="tomorrow">${icon('check',15)} ${t('life.tomorrow',{count:hoursToMidnight()})}</p>`:'';
  return `<ol class="story-list daily-list">${rows}</ol>${rest}<p class="sparkle-count">✦ ${t('life.sparkles',{n:s.found,total:s.spots})}</p>`;
}
function journal(){
  const bag=bagItems();
  return `<div class="journal-head">${icon('book',20)}<h2>${t('life.journal')}</h2></div>
    <h3 class="journal-sub">${t('life.stories',{doll:dollNames[state.doll]})} <b>${t('common.ratio',{n:storiesOf().filter((s,i)=>storyDone(lifePlayer(),state.doll,i)).length,total:storiesOf().length})}</b></h3>${storyList()}
    <h3 class="journal-sub">${t('life.today')} <b>${t('common.ratio',{n:dailySummary().done,total:DAILY_COUNT})}</b></h3>${dailyList()}
    <div class="inventory"><strong>${icon('ticket',16)} ${t('life.bag')}</strong><span>${escapeText(bag.join(' · ')||t('life.bagEmpty'))}</span></div>`;
}
function nameBadge(){
  const p=lifePlayer();
  return `<div class="name-badge"><span class="name-badge-text"><small>${dollNames[state.doll]}</small><b>${escapeText(p.name||t('life.noName'))}</b></span><button class="name-change" data-life-action="name">${icon('id',16)} ${t(p.name?'life.changeName':'life.nameHer')}</button></div>`;
}
function lifeScene(){
  enterDistrict(route);
  const d=district(),slug=d.resident.toLowerCase(),o=objective(),ps=targetState('person'),os=targetState('object');
  return `<div class="heading scene-heading"><div><a class="back" href="#map">‹ &nbsp; ${t('common.backToMap')}</a><h1>${d.name}<span class="heading-sparks" aria-hidden="true">✦<small>✧</small></span></h1><p>${t('life.sub')}</p></div>${nameBadge()}</div>
  <div class="life-layout"><div class="life-left"><section class="map-case scene-case" aria-label="${escapeText(d.name)}">
    <div class="hud" id="hud">${hud()}</div>
    <div id="world" tabindex="0" role="group" aria-label="${t('life.world',{place:d.name})}" style="--scene:url('assets/scenes/${d.id}.jpg')">
      <div class="destination-ring" hidden></div>
      <button class="world-person ${ps?'is-'+ps:''}" data-world-target="person" style="left:${d.person[0]*100}%;top:${d.person[1]*100}%;" aria-label="${escapeText(personLabel(ps))}"><img src="assets/scenes/${slug}.png" alt="" draggable="false"><span class="tag">${icon('heart',13)} ${d.resident}</span>${marker(ps)}</button>
      <button class="world-object ${os?'is-'+os:''}" data-world-target="object" style="left:${d.object[0]*100}%;top:${d.object[1]*100}%" aria-label="${escapeText(objectLabel(os))}"><span class="tag">${icon(d.icon,15)}<span class="tag-text">${d.spot}</span></span>${marker(os)}</button>
      <div class="tokens">${tokens()}</div><div class="coach-slot"></div>
      <div class="walker" aria-hidden="true"><div class="walker-shadow"></div><div class="walker-body"><canvas class="walker-doll" width="${WALKER_CROP[2]}" height="${WALKER_CROP[3]}"></canvas></div><span class="walker-name">${escapeText(playerLabel())}</span></div>
    </div><p class="sr-only world-status" role="status"></p>
    <div id="coach"></div>
    ${travelStrip(o)}</section></div>
    <aside class="life-right"><section class="journal" id="journal" tabindex="-1">${journal()}</section>
    <section class="life-profile"><h2 class="sr-only">${t('common.character')}</h2>${dollSwitch()}<div class="profile-actions"><a href="#wardrobe" class="sub-link">${t('life.changeOutfit')}</a><button class="sub-link" data-life-action="photo">${icon('camera',16)} ${t('life.photo')}</button></div></section></aside></div>`;
}
/* Redraws everything that depends on progress without rebuilding the scene (she keeps walking). */
function refreshQuestUI(){
  if(!isDistrictRoute(route)||!worldView)return;
  const el=worldView.el,d=district();
  document.querySelector('#hud').innerHTML=hud();
  for(const target of ['person','object']){
    const b=el.querySelector(`[data-world-target="${target}"]`),st=targetState(target);
    b.classList.toggle('is-next',st==='next');b.classList.toggle('is-task',st==='task');
    b.querySelector('.marker')?.remove();if(st)b.insertAdjacentHTML('beforeend',marker(st));
    b.setAttribute('aria-label',target==='person'?personLabel(st):objectLabel(st));
  }
  const focusToken=document.activeElement?.dataset?.token;
  el.querySelector('.tokens').innerHTML=tokens();
  if(focusToken)(el.querySelector(`[data-token="${focusToken}"]`)||el).focus({preventScroll:true});
  document.querySelector('#journal').innerHTML=journal();
  document.querySelector('.travel-strip').outerHTML=travelStrip(objective());
  document.querySelector('.name-badge').outerHTML=nameBadge();
  el.querySelector('.walker-name').textContent=playerLabel();
  void d;
}

let worldView=null;
/* The walker shows the composed doll (DOLL_CANVAS region below): the 'front' view standing and the
   real 'left' / 'right' view while walking (no mirroring, so her hair parting stays right). All three
   views are composed when the scene opens, so turning never waits on a load; a view that fails falls
   back to the front picture mirrored to face the walk. She glides at a constant speed with a slight
   step sway (no hop); see .walking in island-life.css. */
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
  stopWalk(true);worldView.observer.disconnect();try{worldView.fx?.unmount()}catch{}worldView=null;
  hideCoach();
}
/* Polite announcements that are already on screen (the tour card, arrival): only for screen readers,
   so the visible toast is kept for news (a step done, a treasure found). */
function sceneSay(text){const s=document.querySelector('.world-status');if(!s)return;s.textContent='';setTimeout(()=>{s.textContent=text},120)}
function setWorldStatus(text){
  const label=document.querySelector('.world-status');
  if(label)label.textContent=text;
}
/* Walks at a constant speed to (x, y), then calls `arrive`. */
function walkTo(x,y,arrive,status){
  const w=worldView;
  if(!w)return;
  stopWalk();
  const p=lifePlayer(),fromX=p.x,fromY=p.y;
  x=clamp(x,.07,.93);y=clamp(y,district().floor,.94);
  const dx=x-fromX,dy=y-fromY,side=dx<0?-1:1;
  const duration=Math.hypot(dx,dy*w.height/w.width)*2600;
  w.ring.style.left=(x*100)+'%';w.ring.style.top=(y*100)+'%';w.ring.hidden=false;
  setWorldStatus(status||t('life.walking'));
  const start=performance.now();
  function move(time){
    const progress=duration<16||w.reduced.matches?1:Math.min(1,(time-start)/duration);
    p.x=fromX+dx*progress;p.y=fromY+dy*progress;
    if(progress<1){
      positionWalker(true,side);
      w.frame=requestAnimationFrame(move);
    }else{
      positionWalker();w.frame=0;w.ring.hidden=true;persist();setWorldStatus('');
      coachEvent('walked');
      if(arrive)arrive();
    }
  }
  w.frame=requestAnimationFrame(move);
}
function walkToTarget(target){
  const d=district(),point=target==='person'?[d.person[0]-.12,d.person[1]+.04]:d.approach;
  walkTo(point[0],point[1],()=>{
    if(target==='person'){
      const p=lifePlayer();p.talks[p.scene]++;
      track('chat',d.id);greet();
    }
    openEncounter(target);
  },target==='person'?t('life.walkingTo',{resident:d.resident}):d.walkSpot);
}
function walkToToken(id){
  const b=worldView?.el.querySelector(`[data-token="${id}"]`);if(!b)return;
  const x=parseFloat(b.style.left)/100,y=parseFloat(b.style.top)/100;
  walkTo(x,y,()=>collectToken(id),t('life.walkingToSparkle'));
}
function attachWorld(){
  const el=document.querySelector('#world'),actor=el.querySelector('.walker');
  const canvas=actor.querySelector('canvas');
  const w=worldView={el,actor,canvas,views:{},shown:null,ring:el.querySelector('.destination-ring'),width:el.clientWidth,height:el.clientHeight,frame:0,reduced:matchMedia('(prefers-reduced-motion: reduce)')};
  try{w.fx=HibiscusScenes.mount(el,district().id,{actor:'.walker'})}catch{} // living scene behind the walker
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
    if(e.target.closest('.coach-slot'))return; // the tour card floats over the sky
    const token=e.target.closest('[data-token]')?.dataset.token;
    if(token){walkToToken(token);return}
    const target=e.target.closest('[data-world-target]')?.dataset.worldTarget;
    if(target)walkToTarget(target);
    else{
      const rect=el.getBoundingClientRect();
      walkTo((e.clientX-rect.left)/rect.width,(e.clientY-rect.top)/rect.height);
    }
  });
  el.addEventListener('keydown',e=>{
    if(e.target!==el)return;
    const delta={ArrowLeft:[-.09,0],ArrowRight:[.09,0],ArrowUp:[0,-.07],ArrowDown:[0,.07]}[e.key];
    if(delta){e.preventDefault();if(!e.repeat)walkTo(lifePlayer().x+delta[0],lifePlayer().y+delta[1]);}
  });
  setTimeout(()=>{if(w===worldView)welcome()},350);
}
/* On arrival: ask her name the first time (once per character), then the first-visit tour. */
function welcome(){
  const p=lifePlayer();
  if(!p.name&&!p.asked){openNameDialog(true);return}
  startCoach();
}

/* ---------- progress ---------- */
function award(stars){state.stars+=stars;navBar();}
function announceNext(prefix){
  const o=objective();
  say(prefix?t('quest.doneNext',{done:prefix,next:o.text}):t('quest.nextSay',{next:o.text}));
}
/* A greeting counts toward a "say hi to everyone" errand. */
function greet(){
  const p=lifePlayer(),{plan,day}=dailySummary(),g=plan.errands.findIndex(e=>e.type==='greet');
  if(g<0||dailyDone(plan.errands[g],day.prog[g])||day.prog[g]&1<<p.scene)return;
  day.prog[g]|=1<<p.scene;
  if(dailyDone(plan.errands[g],day.prog[g]))finishDaily(g);
  else{persist();refreshQuestUI();say(t('daily.greet.progress',{n:bits(day.prog[g])}))}
}
function finishDaily(i){
  const e=dailySummary().plan.errands[i];
  award(e.reward);track('daily',e.type);tone(true);persist();refreshQuestUI();
  announceNext(t('quest.dailyDone',{count:e.reward}));
}
function collectToken(id){
  const p=lifePlayer(),s=dailySummary(),idx=p.scene,k=Number(id.slice(1));
  const b=worldView?.el.querySelector(`[data-token="${id}"]`);
  if(b){const r=b.getBoundingClientRect();try{HibiscusFx.burst(r.left+r.width/2,r.top+r.height/2,1.4)}catch{}}
  if(id[0]==='s'){
    const bit=1<<(idx*SPARKLES_PER_PLACE+k);if(s.day.found&bit)return;
    s.day.found|=bit;award(1);track('findable',district().id);tone();persist();refreshQuestUI();
    say(t('life.sparkleFound',{thing:district().sparkleName,n:bits(s.day.found),total:s.spots}));
    return;
  }
  const n=s.plan.errands.findIndex(e=>e.type==='find'&&e.at===idx);
  if(n<0||s.day.prog[n]&1<<k)return;
  s.day.prog[n]|=1<<k;
  if(dailyDone(s.plan.errands[n],s.day.prog[n]))finishDaily(n);
  else{tone();persist();refreshQuestUI();say(t('daily.find.progress',{n:bits(s.day.prog[n]),count:FIND_COUNT}))}
}
function finishStory(i,target){
  const p=lifePlayer(),available=storySteps(here(),target).find(entry=>entry.i===i);
  if(!available)return;
  p.quests[i]++;
  let done=null;
  if(storyDone(p,state.doll,i)){
    const pay=storyPayout(i);p.credit-=Math.min(p.credit,storiesOf()[i].reward);
    award(pay);track('errand','story-'+(i+1));tone(true);
    done=pay?t('life.storyDone',{count:pay}):t('life.storyDoneCredit');
  }
  persist();refreshQuestUI();
  openEncounter(target,()=>available.step.line,true,done||'');
  announceNext(done||t('quest.stepDone'));
}
function finishDailyStep(i,kind,target){
  const p=lifePlayer(),step=dailySteps(here(),target).find(s=>s.i===i&&s.kind===kind);
  if(!step)return;
  const s=dailySummary(),e=s.plan.errands[i],D=districts;
  s.day.prog[i]=kind==='pickup'?1:kind==='give'?2:1;
  const line=kind==='pickup'?()=>t('daily.deliver.pickupLine',{from:D[e.from].resident,item:deliverItem(e),to:D[e.to].resident})
    :kind==='give'?()=>t('daily.deliver.giveLine.'+D[e.to].id,{from:D[e.from].resident,item:deliverItem(e)})
    :kind==='compliment'?()=>t('daily.compliment.line.'+D[e.at].id)
    :()=>t('daily.tidy.line.'+D[e.at].id);
  if(dailyDone(e,s.day.prog[i])){finishDaily(i);openEncounter(target,line,true,t('quest.dailyDone',{count:e.reward}));}
  else{persist();refreshQuestUI();openEncounter(target,line,true,'');announceNext(t('quest.stepDone'));}
}

/* ---------- conversations ----------
   What the open conversation shows, kept so a language switch can redraw it: `line` returns the
   current-language text, `offer` marks the "can I help" card, `after` the step-done note (or null). */
let encounterView=null;
function openEncounter(target,customLine,focus=true,after=null){
  const dialog=document.querySelector('#encounter'),p=lifePlayer(),d=district(),i=p.scene,person=target==='person';
  encounterView={target,line:customLine,offer:false,after};
  let line,named=false;
  if(customLine)line=customLine();
  else if(person&&p.topics[i]){const c=chatLine(i);line=c.text;named=c.named}
  else line=person?d.greeting:d.objectLine;
  const speech=person&&!customLine&&p.name&&!named?t('life.hi',{name:p.name,line}):line;
  const opts=[];
  if(after===null){
    for(const {i:s,step} of storySteps(d.id,target))opts.push(`<button class="is-story" data-task-step="${s}">★ ${escapeText(step.action)}</button>`);
    for(const {i:s,kind} of dailySteps(d.id,target))opts.push(`<button class="is-daily" data-daily-step="${s}" data-daily-kind="${kind}">${icon('ticket',15)} ${escapeText(dailyStepLabel(s,kind))}</button>`);
    if(person){
      const offer=offerable();
      if(offer>=0&&storiesOf()[offer].giver===d.id)opts.push(`<button class="is-story" data-life-action="offer">★ ${t('life.lend')}</button>`);
      opts.push(p.topics[i]?`<button data-life-action="chat">${icon('heart',15)} ${t('life.chat')}</button>`:`<button data-life-action="topic">${d.topic}</button>`);
    }
  }
  let next='';
  if(after!==null){
    const o=objective(),elsewhere=o.at&&o.at!==d.id;
    next=`<div class="next-up">${after?`<p class="next-done">${icon('check',16)} ${escapeText(after)}</p>`:''}<p><b>${t(o.kind==='rest'?'quest.restLabel':'quest.label')}</b> ${escapeText(o.text)}</p></div>`;
    if(elsewhere)opts.push(`<a class="primary" href="#${o.at}">${t('quest.go',{place:districtOf(o.at).name})} ›</a>`);
    else if(o.at===d.id&&o.target===target)opts.push(`<button class="is-story" data-life-action="again">${t('quest.continueHere')}</button>`);
  }
  dialog.dataset.target=target;
  dialog.innerHTML=`<div class="encounter-head">${person?`<div class="resident-photo"><img alt="" src="assets/scenes/${d.resident.toLowerCase()}.png"></div>`:`<span class="object-badge">${icon(d.icon,30)}</span>`}<div><h2>${person?d.resident:d.spot}</h2><span>${person?t('life.roleStatus',{role:d.role,status:p.topics[i]?d.friend:d.new}):d.name}</span></div></div><p class="speech">${escapeText(speech)}</p>${next}<div class="responses">${opts.join('')}<button data-life-action="bye">${t(after!==null?'life.ok':person?'life.bye':'life.keepExploring')}</button></div>`;
  if(!dialog.open)dialog.showModal();
  if(focus)dialog.querySelector('.responses a,.responses button')?.focus({preventScroll:true});
  coachEvent('talked');
}
function dailyStepLabel(i,kind){
  const e=dailySummary().plan.errands[i],D=districts;
  return kind==='pickup'?t('daily.deliver.pickup',{item:deliverItem(e)}):kind==='give'?t('daily.deliver.giveAction',{item:deliverItem(e),to:D[e.to].resident})
    :kind==='compliment'?t('daily.compliment.action.'+D[e.at].id):t('daily.tidy.action.'+D[e.at].id);
}
function showOffer(focus=true){
  const p=lifePlayer(),i=offerable(),dialog=document.querySelector('#encounter');
  if(!dialog.open||dialog.dataset.target!=='person'||i<0||storiesOf()[i].giver!==here())return;
  const s=storiesOf()[i];
  encounterView.offer=true;
  dialog.querySelector('.speech').textContent=s.offer;
  dialog.querySelector('.responses').innerHTML=`<button class="primary" data-life-action="accept">${storyPayout(i)?t('life.accept',{count:storyPayout(i)}):t('life.acceptFree')}</button><button data-life-action="bye">${t('life.later')}</button>`;
  if(focus)dialog.querySelector('[data-life-action="accept"]').focus();
  void p;
}
/* Language change while talking: redraw the same card and keep focus on the same response. */
function relocalizeEncounter(){
  const dialog=document.querySelector('#encounter');
  if(!dialog.open||!encounterView)return;
  const key=b=>b.dataset.lifeAction||(b.dataset.taskStep!==undefined?'step-'+b.dataset.taskStep:b.dataset.dailyStep!==undefined?'daily-'+b.dataset.dailyStep:b.getAttribute('href'));
  const f=document.activeElement,was=dialog.contains(f)?key(f):null;
  const v=encounterView;
  openEncounter(v.target,v.line,false,v.after);
  if(v.offer)showOffer(false);
  const again=was&&[...dialog.querySelectorAll('button,a')].find(b=>key(b)===was);
  (again||dialog.querySelector('button'))?.focus({preventScroll:true});
}
function handleLifeAction(button){
  const d=button.dataset,p=lifePlayer(),dialog=document.querySelector('#encounter');
  if(d.taskStep!==undefined){if(dialog.open)finishStory(Number(d.taskStep),dialog.dataset.target);return true}
  if(d.dailyStep!==undefined){if(dialog.open)finishDailyStep(Number(d.dailyStep),d.dailyKind,dialog.dataset.target);return true}
  switch(d.lifeAction){
    case 'offer':showOffer();return true;
    case 'accept':{
      const i=offerable();
      if(dialog.open&&dialog.dataset.target==='person'&&i>=0&&storiesOf()[i].giver===here()){
        p.quests[i]=1;persist();refreshQuestUI();
        openEncounter('person',()=>t('life.thanks'),true,'');
        announceNext('');
      }return true;
    }
    case 'topic':p.topics[p.scene]=true;persist();refreshQuestUI();openEncounter('person',()=>district().answer);return true;
    case 'chat':{p.talks[p.scene]++;persist();const c=chatLine(p.scene);openEncounter('person',()=>c.text);return true}
    case 'again':{const target=dialog.dataset.target;openEncounter(target);return true}
    case 'bye':dialog.close();return true;
    case 'name':stopWalk(true);openNameDialog(false);return true;
    case 'photo':look().backdrop=p.scene+1;persist();location.hash='booth';return true;
    case 'journal':{const j=document.querySelector('#journal');j?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});j?.focus({preventScroll:true});return true}
  }
  return false;
}
document.querySelector('#encounter').addEventListener('close',()=>{coachEvent('closed');if(worldView&&!document.activeElement?.closest?.('main'))worldView.el.focus({preventScroll:true})});

/* ---------- names ---------- */
const NAME_IDEAS={adult:['Coral','Marisol','Jasmine','Luna','Daisy','Valeria'],little:['Pearl','Lulu','Bea','Mimi','Coco','Sofi']};
const nameDialog=document.querySelector('#name-dialog');
let namePrompt=false; // true while the first-visit prompt is open (closing it unnamed counts as "not now")
function fillNameDialog(){
  const p=lifePlayer();
  nameDialog.querySelector('#name-title').textContent=t('name.title.'+state.doll);
  nameDialog.querySelector('.name-ideas').innerHTML=NAME_IDEAS[state.doll].map(n=>`<button type="button" data-name-pick="${n}" aria-pressed="${p.name===n}">${n}</button>`).join('');
  nameDialog.querySelector('[data-action="name-skip"]').textContent=t(namePrompt?'name.skip':'name.cancel');
}
function openNameDialog(first){
  namePrompt=first;
  const p=lifePlayer();
  if(first){p.asked=true;persist();}
  fillNameDialog();
  nameDialog.querySelector('input').value=p.name;
  nameDialog.showModal();
  nameDialog.querySelector(first?'.name-ideas button':'input').focus();
}
function saveName(raw){
  const name=cleanName(raw);
  if(!name)return false;
  const first=namePrompt;namePrompt=false;
  lifePlayer().name=name;lifePlayer().asked=true;persist();track('name','yes');
  nameDialog.close();
  if(isDistrictRoute(route)&&worldView){refreshQuestUI();}else draw();
  say(t('name.hello',{name}));
  if(first)setTimeout(startCoach,400);
  return true;
}
nameDialog.addEventListener('click',e=>{
  const pick=e.target.closest('[data-name-pick]');
  if(pick){saveName(pick.dataset.namePick);return}
  if(e.target.closest('[data-action="name-skip"]'))nameDialog.close();
});
nameDialog.addEventListener('close',()=>{
  if(!namePrompt)return;
  namePrompt=false;track('name','no');
  if(worldView)setTimeout(startCoach,200);
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='name-form')return;
  e.preventDefault();
  const input=e.target.querySelector('input');
  if(!saveName(input.value)){input.setCustomValidity(t('name.empty'));input.reportValidity();}
});
document.addEventListener('input',e=>{if(e.target.id==='character-name')e.target.setCustomValidity('')});
// The browser's own "required" bubble would speak the browser's language, not the game's.
document.addEventListener('invalid',e=>{if(e.target.id==='character-name'&&!e.target.value.trim())e.target.setCustomValidity(t('name.empty'))},true);

/* ---------- first-visit tour: walk, the marker, the HUD. Skippable; remembered as state.tutorial. ---------- */
let coach=-1,coachWait=false; // the tour's step (-1 = not running); it carries on across places
const COACH_STEPS=3;
function startCoach(){
  if(state.tutorial||!worldView||document.querySelector('dialog[open]'))return;
  if(coach<0)coach=0;
  showCoach();
}
function showCoach(){
  hideCoach();
  // wide scenes: in the sky at the top of the picture, clear of the ground; phones: under the scene
  const box=document.querySelector(matchMedia('(min-width:761px)').matches?'#world .coach-slot':'#coach');if(!box)return;
  const o=objective(),who=o.at===here()?(o.target==='person'?district().resident:o.target==='object'?district().spot:''):'';
  const text=coach===0?t('tour.walk'):coach===1?(who?t('tour.marker',{who}):t('tour.markerAway')):t('tour.hud');
  box.innerHTML=`<div class="coach-card" role="group" aria-label="${t('tour.label')}"><span class="coach-step">${t('tour.step',{n:coach+1,total:COACH_STEPS})}</span><p>${escapeText(text)}</p><div class="coach-actions"><button class="primary" data-coach="next">${t(coach===COACH_STEPS-1?'tour.done':'tour.next')}</button><button data-coach="skip">${t('tour.skip')}</button></div></div>`;
  document.documentElement.dataset.tour=String(coach);
  sceneSay(text);
}
function hideCoach(){delete document.documentElement.dataset.tour;document.querySelectorAll('#coach,.coach-slot').forEach(box=>box.innerHTML='');}
function endCoach(how){
  if(coach<0)return;
  coach=-1;coachWait=false;
  state.tutorial=how;persist();track('tutorial',how==='done'?'done':'skipped');hideCoach();
  worldView?.el.focus({preventScroll:true});
}
function advanceCoach(){if(coach<0)return;coachWait=false;if(coach>=COACH_STEPS-1)endCoach('done');else{coach++;showCoach()}}
/* Steps move on by themselves when she does what they say (step 2 after the conversation closes). */
function coachEvent(what){
  if(coach===0&&what==='walked')advanceCoach();
  else if(coach===1&&what==='talked')coachWait=true;
  else if(coach===1&&coachWait&&what==='closed')advanceCoach();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-coach]');if(!b)return;
  if(b.dataset.coach==='skip')endCoach('skipped');else advanceCoach();
});

document.addEventListener('visibilitychange',()=>{if(document.hidden&&worldView?.frame){stopWalk(true);setWorldStatus('')}});
window.addEventListener('pagehide',()=>{if(worldView?.frame)stopWalk(true)});
