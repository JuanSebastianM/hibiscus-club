/* The island adventure's data and rules: the three walk-in districts, each character's story errands,
   the daily errands and sparkles, the save format of `state.life`, and "what to do next". No DOM here:
   island-life.js draws the scenes, game.js the map. All display text is in i18n.js / i18n-es.js:
   district.<id>.*, story.<doll>.<n>.*, daily.*, quest.*, chat.*.

   Story stages (per story, per character): 0 = not started, k = on step k, steps+1 = complete.
   One story runs at a time: a resident offers the next story only when none is in progress. */
const districts = [
  {id:'boardwalk',resident:'Mara',icon:'compass',person:[.60,.73],object:[.82,.49],approach:[.82,.72],floor:.69,color:'#67bdc9',sparkle:'shell',
    spots:[[.12,.78],[.24,.9],[.31,.73],[.35,.82],[.57,.92],[.69,.84],[.92,.82],[.15,.93],[.77,.93],[.88,.9]]},
  {id:'market',resident:'Rosa',icon:'flower',person:[.57,.73],object:[.82,.54],approach:[.82,.75],floor:.73,color:'#8ebd89',sparkle:'petal',
    spots:[[.1,.8],[.2,.92],[.3,.77],[.36,.88],[.6,.91],[.7,.82],[.92,.86],[.13,.88],[.77,.93],[.47,.8]]},
  {id:'pavilion',resident:'Kit',icon:'music',person:[.58,.70],object:[.28,.48],approach:[.28,.64],floor:.63,color:'#aa92c9',sparkle:'star',
    spots:[[.1,.7],[.18,.86],[.34,.72],[.3,.92],[.6,.9],[.72,.78],[.9,.74],[.86,.9],[.45,.68],[.12,.93]]}
].map(d=>I18N.localize(d,'district.'+d.id,['name','role','spot','walkSpot','friend','new','greeting','topic','answer','objectLine','sparkleName','tokenName']));
const DISTRICT_IDS=districts.map(d=>d.id);
const districtOf=id=>districts.find(d=>d.id===id);
const sceneryNames=()=>[t('scenery.studio'),...districts.map(d=>d.name)];
const cleanName=name=>typeof name==='string'?Array.from(name.trim().replace(/[\u0000-\u001f\u007f]/g,'')).slice(0,24).join(''):'';
const escapeText=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

/* ---------- stories: different ones per character ----------
   `giver` offers the story; each step happens at a district's resident (person) or object. A step with
   `item` puts that thing in her bag until the next step. */
const STORIES={
  adult:[
    {giver:'boardwalk',reward:6,steps:[{at:'boardwalk',target:'object',item:1},{at:'pavilion',target:'person'}]},
    {giver:'market',reward:8,steps:[{at:'market',target:'object',item:1},{at:'boardwalk',target:'person'}]},
    {giver:'pavilion',reward:10,steps:[{at:'market',target:'object',item:1},{at:'pavilion',target:'object'},{at:'pavilion',target:'person'}]},
    {giver:'pavilion',reward:12,steps:[{at:'boardwalk',target:'person'},{at:'market',target:'object',item:1},{at:'market',target:'person',item:1},{at:'pavilion',target:'object'},{at:'pavilion',target:'person'}]}
  ],
  little:[
    {giver:'market',reward:6,steps:[{at:'market',target:'object',item:1},{at:'market',target:'person'}]},
    {giver:'boardwalk',reward:6,steps:[{at:'boardwalk',target:'object'},{at:'pavilion',target:'object',item:1},{at:'boardwalk',target:'person'}]},
    {giver:'pavilion',reward:8,steps:[{at:'market',target:'object',item:1},{at:'boardwalk',target:'person',item:1},{at:'pavilion',target:'person'}]},
    {giver:'pavilion',reward:10,steps:[{at:'boardwalk',target:'person',item:1},{at:'market',target:'person',item:1},{at:'pavilion',target:'object'},{at:'pavilion',target:'person'}]}
  ]
};
for(const doll of ['adult','little'])STORIES[doll].forEach((story,i)=>{
  const key=`story.${doll}.${i}`;
  I18N.localize(story,key,['title','offer']);
  story.steps.forEach((step,j)=>{const carries=step.item;delete step.item;I18N.localize(step,`${key}.step.${j}`,carries?['action','item','line']:['action','line'])});
});
/* The stories of saves made before each character had her own (the Grown-up's first three today). */
const LEGACY_REWARDS=[6,8,10];

/* ---------- daily errands and sparkles ---------- */
const DAILY_REWARD={deliver:4,find:3,greet:3,compliment:2,tidy:2};
const DAILY_TYPES=Object.keys(DAILY_REWARD);
const DAILY_COUNT=3,SPARKLES_PER_PLACE=2,FIND_COUNT=3;
const DAY_RE=/^\d{4}-\d{2}-\d{2}$/;
function dayKey(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
/* The day the dailies belong to. If the clock goes back before a day already played, the last day stays
   (its errands stay done) until the clock catches up, so setting the date back never refills them. */
function currentDay(){
  const today=dayKey();
  if(state.dayMax&&today<state.dayMax)return state.dayMax;
  if(today!==state.dayMax){state.dayMax=today;if(typeof persist==='function')persist();}
  return today;
}
function hoursToMidnight(){const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);return Math.max(1,Math.ceil((next-now)/36e5))}
/* Small deterministic random numbers from a text seed (FNV-1a hash into mulberry32). */
function seededRandom(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)}
  return ()=>{h=(h+0x6D2B79F5)|0;let r=Math.imul(h^(h>>>15),1|h);r=(r+Math.imul(r^(r>>>7),61|r))^r;return((r^(r>>>14))>>>0)/4294967296};
}
function shuffled(list,rand){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const dailyCache=new Map();
/* The day's plan for one character: three errands from different templates, the sparkles hidden in each
   district (two each) and, for a "find" errand, where its three things are. Same day + character = same plan. */
function dailyPlan(day,doll){
  const key=day+'|'+doll;
  if(dailyCache.has(key))return dailyCache.get(key);
  const rand=seededRandom('hibiscus|'+key),pick=n=>Math.floor(rand()*n);
  const errands=shuffled(DAILY_TYPES,rand).slice(0,DAILY_COUNT).map(type=>{
    const e={type,reward:DAILY_REWARD[type]};
    if(type==='deliver'){e.from=pick(3);e.to=(e.from+1+pick(2))%3;e.item=pick(3)}
    else if(type==='find'||type==='tidy')e.at=pick(3);
    else if(type==='compliment')e.at=pick(3);
    return e;
  });
  const spots=districts.map(d=>shuffled(d.spots,rand));
  const plan={day,doll,errands,
    sparkles:spots.map(s=>s.slice(0,SPARKLES_PER_PLACE)),
    tokens:spots.map(s=>s.slice(SPARKLES_PER_PLACE,SPARKLES_PER_PLACE+FIND_COUNT))};
  dailyCache.set(key,plan);
  return plan;
}
const bits=n=>{let c=0;for(;n;n&=n-1)c++;return c};
/* Progress per errand: deliver 0 → 1 (picked up) → 2; find and greet are bit masks (all three = 7);
   compliment and tidy 0 → 1. */
function dailyDone(e,prog){return e.type==='deliver'?prog===2:e.type==='find'||e.type==='greet'?prog===7:prog===1}
/* This character's daily record for the current day (reset when the day changes). */
function today(p=lifePlayer()){
  const day=currentDay();
  if(p.daily.day!==day)p.daily={day,prog:Array(DAILY_COUNT).fill(0),found:0};
  return p.daily;
}

/* ---------- save ---------- */
const smallCount=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max?n:0;
function readDaily(raw){
  const ok=raw&&typeof raw==='object'&&DAY_RE.test(raw.day);
  return {day:ok?raw.day:'',prog:Array.from({length:DAILY_COUNT},(_,i)=>ok?smallCount(raw.prog?.[i],7):0),found:ok?smallCount(raw.found,(1<<(SPARKLES_PER_PLACE*3))-1):0};
}
/* `state.life[doll]`: name, scene (district index), x/y (normalized position), topics (asked each resident
   about her work), quests (story stages for this character's stories), credit (stars already paid by
   pre-0.2 stories, see below), asked (the name prompt was shown), talks (conversations per resident, for
   rotating lines), daily {day, prog, found}. Saves from before each character had her own stories carry
   `stages` (three stages of the shared stories): the Grown-up keeps them as they were, because her first
   three stories are those. Little Me's finished old stories become `credit`: her new stories pay out only
   what is left after that credit, so no stars are lost or paid twice. */
function loadIslandLife(raw){
  const life={};
  for(const id of ['adult','little']){
    const saved=raw&&typeof raw==='object'&&raw[id]&&typeof raw[id]==='object'?raw[id]:{};
    const stories=STORIES[id];
    let quests,credit=smallCount(saved.credit,1000);
    if(Array.isArray(saved.quests))quests=stories.map((s,i)=>smallCount(saved.quests[i],s.steps.length+1));
    else{
      const old=LEGACY_REWARDS.map((_,i)=>smallCount(saved.stages?.[i],[2,2,3][i]+1));
      if(id==='adult')quests=stories.map((s,i)=>i<old.length?old[i]:0);
      else{quests=stories.map(()=>0);credit=old.reduce((sum,stage,i)=>sum+(stage===[2,2,3][i]+1?LEGACY_REWARDS[i]:0),0);}
    }
    life[id]={
      name:cleanName(saved.name),scene:smallCount(saved.scene,2),
      x:Number.isFinite(saved.x)?clamp(saved.x,.07,.93):.43,
      y:Number.isFinite(saved.y)?clamp(saved.y,.60,.94):.86,
      topics:districts.map((_,i)=>saved.topics?.[i]===true),
      quests,credit,
      asked:saved.asked===true,
      talks:districts.map((_,i)=>smallCount(saved.talks?.[i],1e6)),
      daily:readDaily(saved.daily)
    };
  }
  return life;
}

/* ---------- reading the adventure ---------- */
const lifePlayer=()=>state.life[state.doll];
const playerLabel=()=>lifePlayer().name||dollNames[state.doll];
const district=()=>districts[lifePlayer().scene];
const storiesOf=(doll=state.doll)=>STORIES[doll];
const storyDone=(p,doll,i)=>p.quests[i]===STORIES[doll][i].steps.length+1;
/* Stars a story pays on completion: its reward less what is left of the credit from old saves, which the
   stories before it (played in order) use up first. */
function storyPayout(i,p=lifePlayer(),doll=state.doll){
  let credit=p.credit;
  STORIES[doll].forEach((s,j)=>{if(j<i&&!storyDone(p,doll,j))credit-=Math.min(credit,s.reward)});
  return STORIES[doll][i].reward-Math.min(credit,STORIES[doll][i].reward);
}
function activeStories(p=lifePlayer(),doll=state.doll){return STORIES[doll].map((s,i)=>i).filter(i=>p.quests[i]>0&&!storyDone(p,doll,i))}
/* The story a resident can offer now: the first not started, when none is in progress. */
function offerable(p=lifePlayer(),doll=state.doll){
  if(activeStories(p,doll).length)return -1;
  return STORIES[doll].findIndex((s,i)=>p.quests[i]===0);
}
/* Story steps that can be done here, at this target. */
function storySteps(at,target,p=lifePlayer(),doll=state.doll){
  return activeStories(p,doll).flatMap(i=>{const step=STORIES[doll][i].steps[p.quests[i]-1];return step.at===at&&step.target===target?[{i,step}]:[]});
}
function deliverItem(e){return t(`daily.item.${DISTRICT_IDS[e.from]}.${e.item}`)}
/* Daily errand steps that can be done here, at this target: {i, kind}. Greeting happens on its own. */
function dailySteps(at,target,p=lifePlayer(),doll=state.doll){
  const day=today(p),plan=dailyPlan(day.day,doll),idx=DISTRICT_IDS.indexOf(at);
  return plan.errands.flatMap((e,i)=>{
    const prog=day.prog[i];if(dailyDone(e,prog))return [];
    if(e.type==='deliver'&&target==='person'){
      if(prog===0&&e.from===idx)return [{i,kind:'pickup'}];
      if(prog===1&&e.to===idx)return [{i,kind:'give'}];
    }
    if(e.type==='compliment'&&target==='person'&&e.at===idx)return [{i,kind:'compliment'}];
    if(e.type==='tidy'&&target==='object'&&e.at===idx)return [{i,kind:'tidy'}];
    return [];
  });
}
/* One line describing an open daily errand and where it happens next: {text, at, target}. */
function dailyObjective(e,prog){
  const D=districts;
  switch(e.type){
    case 'deliver':return prog===0
      ?{text:t('daily.deliver.todo',{item:deliverItem(e),from:D[e.from].resident,to:D[e.to].resident}),at:D[e.from].id,target:'person'}
      :{text:t('daily.deliver.give',{item:deliverItem(e),to:D[e.to].resident}),at:D[e.to].id,target:'person'};
    case 'find':return {text:t('daily.find.todo',{count:FIND_COUNT,things:D[e.at].tokenName,place:D[e.at].name,n:bits(prog)}),at:D[e.at].id,target:'token'};
    case 'greet':{const next=[0,1,2].find(k=>!(prog&1<<k));return {text:t('daily.greet.todo',{n:bits(prog)}),at:D[next].id,target:'person'}}
    case 'compliment':return {text:t('daily.compliment.todo.'+D[e.at].id),at:D[e.at].id,target:'person'};
    case 'tidy':return {text:t('daily.tidy.todo.'+D[e.at].id),at:D[e.at].id,target:'object'};
  }
}
function dailyTitle(e){
  const D=districts;
  switch(e.type){
    case 'deliver':return t('daily.deliver.title',{item:deliverItem(e),from:D[e.from].resident,to:D[e.to].resident});
    case 'find':return t('daily.find.title',{count:FIND_COUNT,things:D[e.at].tokenName,place:D[e.at].name});
    case 'greet':return t('daily.greet.title');
    case 'compliment':return t('daily.compliment.todo.'+D[e.at].id);
    case 'tidy':return t('daily.tidy.todo.'+D[e.at].id);
  }
}
function dailySummary(p=lifePlayer(),doll=state.doll){
  const day=today(p),plan=dailyPlan(day.day,doll);
  const done=plan.errands.filter((e,i)=>dailyDone(e,day.prog[i])).length;
  return {done,total:plan.errands.length,found:bits(day.found),spots:SPARKLES_PER_PLACE*districts.length,plan,day};
}
/* What to do next, for the HUD, the map tracker and the player card:
   {kind:'story'|'offer'|'daily'|'rest', text, at (district id or null), target, story?} */
function objective(p=lifePlayer(),doll=state.doll){
  const stories=STORIES[doll];
  const active=activeStories(p,doll)[0];
  if(active!==undefined){
    const step=stories[active].steps[p.quests[active]-1];
    return {kind:'story',story:active,text:step.action,at:step.at,target:step.target};
  }
  const offer=offerable(p,doll);
  if(offer>=0){const giver=districtOf(stories[offer].giver);return {kind:'offer',story:offer,text:t('quest.startStory',{resident:giver.resident,title:stories[offer].title}),at:giver.id,target:'person'}}
  const {plan,day}=dailySummary(p,doll);
  const open=plan.errands.findIndex((e,i)=>!dailyDone(e,day.prog[i]));
  if(open>=0)return {kind:'daily',daily:open,...dailyObjective(plan.errands[open],day.prog[open])};
  return {kind:'rest',text:t('quest.allDone'),at:null,target:null};
}
/* Where an objective's target is, in words: "Kit, Starlight Pavilion" or "Shell basket, Pearl Boardwalk". */
function objectiveWhere(o){
  if(!o.at)return '';
  const d=districtOf(o.at);
  return o.target==='person'?t('quest.whereWho',{who:d.resident,place:d.name}):o.target==='object'?t('quest.whereWhat',{what:d.spot,place:d.name}):d.name;
}
/* Things in her bag: story items carried from the last finished step and a picked-up delivery. */
function bagItems(p=lifePlayer(),doll=state.doll){
  const story=STORIES[doll].flatMap((s,i)=>p.quests[i]>1&&!storyDone(p,doll,i)?[s.steps[p.quests[i]-2].item].filter(Boolean):[]);
  const {plan,day}=dailySummary(p,doll);
  return [...story,...plan.errands.flatMap((e,i)=>e.type==='deliver'&&day.prog[i]===1?[deliverItem(e)]:[])];
}
/* Rotating small talk: a resident's lines (general, a few with her name or outfit), picked by how many
   times she has talked to them and the day, so visits keep bringing something new. Returns {text, named}. */
const CHAT_LINES=8,CHAT_NAMED=2,CHAT_OUTFIT=2;
function chatLine(i,p=lifePlayer()){
  const d=districts[i],pool=[];
  for(let k=0;k<CHAT_LINES;k++)pool.push(()=>({text:t(`chat.${d.id}.${k}`),named:false}));
  if(p.name)for(let k=0;k<CHAT_NAMED;k++)pool.push(()=>({text:t(`chat.${d.id}.name.${k}`,{name:p.name}),named:true}));
  for(let k=0;k<CHAT_OUTFIT;k++)pool.push(()=>({text:t(`chat.${d.id}.outfit.${k}`,{outfit:itemName(look().outfit)}),named:false}));
  const dayNumber=Math.floor(Date.parse(today(p).day)/864e5)||0;
  return pool[(p.talks[i]*5+dayNumber*3)%pool.length]();
}
