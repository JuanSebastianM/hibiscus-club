/* Dream House decorator (route #house): six rooms to furnish from scratch. Loaded on demand by
   game.js (houseRoom) together with decor-data.js, decor-logic.js and decor-paint.js; nothing here
   runs or downloads on other screens.
   The room is two stacked canvases: the empty room (painted once per wall/floor choice at full
   1536 x 1152 and scaled by CSS) and the pieces, redrawn in one requestAnimationFrame only when
   something changed. Every piece is reachable without a pointer: the "In this room" list selects
   it, the stage takes arrow keys, and the toolbar under the stage does the rest. Changes are written
   to state.house (see decor-logic.js for the format) and saved with the rest of the game. */
const Decorator=(()=>{
  const L=DecorLogic,{ROOM}=L;
  const MANIFEST='assets/decor/manifest.json',BASE='assets/decor/';
  const CATS=['bedroom','kitchen','living','bathroom','playroom','patio','walls','floor']; // manifest `room` values
  const HISTORY=60;
  let ready=null,items=[];          // manifest items
  let house=null;                   // runtime: {at, rooms:{id:{w,f,b,pieces}}, owned:Set, done:[], goals:[]}
  let sel=null,tab='room',other='all',ui=null,dirty=false,raf=0,uidSeq=1;
  const hist={};                    // per room {undo:[], redo:[]}
  const sprites=new Map();          // id -> {img, mask, w, h} (full sprites, for the stage)
  const thumbImgs=new Map();        // id -> Image (128 px thumbnails, for room cards)
  const dollSprites=new Map();      // look key -> {img, mask}
  const bgCache=new Map();          // room|wall|floor|backdrop -> canvas

  /* ---------- small helpers ---------- */
  const lang=()=>I18N.lang==='es'?'es':'en';
  const it=id=>L.item(id);
  function nameOf(id){
    if(L.isDoll(id))return playerName(id.slice(1));
    const i=it(id);return i?.name?.[lang()]||i?.name?.en||id;
  }
  function playerName(doll){try{const n=state.life?.[doll]?.name;return n?n:dollNames[doll]}catch{return dollNames[doll]}}
  const roomName=id=>t('house.room.'+id),theRoom=id=>t('house.the.'+id);
  const esc=s=>escapeText(String(s));
  const SVG={
    flip:'<path d="M12 3v18M8 7 3 12l5 5V7Zm8 0 5 5-5 5V7Z"/>',
    minus:'<circle cx="11" cy="11" r="7"/><path d="M8 11h6m3 6 4 4"/>',
    plus:'<circle cx="11" cy="11" r="7"/><path d="M8 11h6m-3-3v6m6 3 4 4"/>',
    up:'<rect x="8" y="3" width="13" height="13" rx="2"/><path d="M3 9v12h12" stroke-dasharray="2 3"/>',
    down:'<rect x="3" y="8" width="13" height="13" rx="2"/><path d="M8 3h13v13" stroke-dasharray="2 3"/>',
    copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/>',
    undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
    redo:'<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
    reset:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    sofa:'<path d="M4 11V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v3"/><path d="M2 13a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 18v2m14-2v2"/>',
    wall:'<rect x="4" y="4" width="16" height="12" rx="1"/><path d="m7 13 3-4 3 3 2-2 2 3M12 16v4"/>',
    rug:'<ellipse cx="12" cy="13" rx="9" ry="5"/><ellipse cx="12" cy="13" rx="5" ry="2.5"/>',
    paint:'<path d="M4 4h12v5H4zM16 6h3v6h-8v3"/><rect x="9.5" y="15" width="3" height="6" rx="1"/>',
    friend:'<circle cx="12" cy="7" r="4"/><path d="M5 21c1-5 4-7 7-7s6 2 7 7"/>',
    door:'<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18"/><circle cx="15" cy="12" r="1"/>'
  };
  const sv=(n,s=18)=>`<svg aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${SVG[n]||''}</svg>`;
  const ic=(n,s)=>SVG[n]?sv(n,s):icon(n,s);

  /* ---------- loading ---------- */
  function load(){
    if(ready)return ready;
    ready=fetch(MANIFEST).then(r=>{if(!r.ok)throw new Error('manifest');return r.json()}).then(m=>{
      items=(m.items||[]).filter(i=>CATS.includes(i.room));L.setItems(items);
      state.house=L.readHouse(state.house);
      const owned=new Set(state.house.owned);
      house={at:state.house.at,owned,done:state.house.done.slice(),goals:state.house.goals.slice(),rooms:{}};
      for(const r of DECOR.rooms){const s=state.house.rooms[r.id];
        house.rooms[r.id]={w:s.w,f:s.f,b:typeof s.b==='string'?s.b:null,pieces:L.readPieces(s.p,s.b||r.id,id=>owned.has(id)).map(withUid)};}
    });
    ready.catch(()=>{ready=null});
    return ready;
  }
  function withUid(p){p.uid=uidSeq++;return p}
  function image(src){return new Promise((ok,no)=>{const i=new Image();i.decoding='async';i.onload=()=>ok(i);i.onerror=no;i.src=src})}
  /* An alpha mask (at most 96 px) for picking a piece by its painted pixels, not its box. */
  function maskOf(src){
    const k=Math.min(1,96/Math.max(src.width,src.height)),w=Math.max(1,Math.round(src.width*k)),h=Math.max(1,Math.round(src.height*k));
    const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});
    g.drawImage(src,0,0,w,h);let d;try{d=g.getImageData(0,0,w,h).data}catch{return null}
    const a=new Uint8Array(w*h);for(let i=0;i<w*h;i++)a[i]=d[i*4+3];
    return {a,w,h};
  }
  function sprite(id){
    if(L.isDoll(id))return dollSprite(id.slice(1));
    let s=sprites.get(id);
    if(!s){const i=it(id);s={img:null,mask:null};sprites.set(id,s);
      s.p=image(BASE+i.file).then(img=>{s.img=img;s.mask=maskOf(img);paint()}).catch(()=>{});}
    return s;
  }
  function thumbImg(id){
    if(L.isDoll(id))return dollSprite(id.slice(1)).img;
    let s=thumbImgs.get(id);if(s)return s.img;
    const i=it(id);s={img:null};thumbImgs.set(id,s);
    image(BASE+i.thumb).then(img=>{s.img=img;drawCardsSoon()}).catch(()=>{});
    return null;
  }
  /* The character as a piece: her saved look (never a try-on), cropped from composeDoll()'s canvas. */
  function dollKey(doll){return lookKey({...state.looks[doll],doll})}
  function dollSprite(doll){
    const key=dollKey(doll);let s=dollSprites.get(key);
    if(!s){s={img:null,mask:null};dollSprites.set(key,s);
      s.p=composeDoll({...state.looks[doll],doll}).then(full=>{
        const c=document.createElement('canvas');c.width=440;c.height=1040;c.getContext('2d').drawImage(full,80,0,440,1040,0,0,440,1040);
        s.img=c;s.mask=maskOf(c);paint();drawCardsSoon();
      }).catch(()=>{});}
    return s;
  }

  /* ---------- the house model ---------- */
  const cur=()=>house.rooms[house.at];
  const pieces=()=>cur().pieces;
  /* Where a room's pieces stand: its painted scheme's geometry, or the procedural room's.
     (A room's `b` is a scheme id when painted; '' or null when it has paint and flooring.) */
  const whereOf=id=>house.rooms[id].b||id;
  const W=()=>whereOf(house.at);
  const owns=id=>!L.price(id)||house.owned.has(id);
  const furnitureCount=list=>list.filter(p=>!L.isDoll(p.id)).length;
  function snapshot(room=cur()){return {w:room.w,f:room.f,b:room.b,p:room.pieces.map(p=>({...p,hostIx:p.host?room.pieces.indexOf(p.host):-1}))}}
  function restore(snap,room=cur()){
    room.w=snap.w;room.f=snap.f;room.b=snap.b;
    const list=snap.p.map(p=>({...p,host:null}));
    list.forEach((p,i)=>{p.host=snap.p[i].hostIx>=0?list[snap.p[i].hostIx]:null;delete p.hostIx;p.trial=!!L.price(p.id)&&!house.owned.has(p.id);p.uid=snap.p[i].uid});
    room.pieces=list;
  }
  function hs(){return hist[house.at]||(hist[house.at]={undo:[],redo:[]})}
  function remember(){const h=hs();h.undo.push(snapshot());if(h.undo.length>HISTORY)h.undo.shift();h.redo.length=0}
  /* Writes the house to the save (try-on pieces are never written) and pays any new rewards. */
  function save(){
    const out={v:1,at:house.at,rooms:{},owned:[...house.owned],done:house.done.slice(),goals:house.goals.slice()};
    for(const r of DECOR.rooms){const s=house.rooms[r.id];L.settle(s.pieces,whereOf(r.id));out.rooms[r.id]={w:s.w,f:s.f,...(typeof s.b==='string'?{b:s.b}:{}),p:L.writePieces(s.pieces)}}
    state.house=out;persist();
  }
  function commit(msg){save();rewards();refresh();if(msg)say(msg)}

  /* ---------- rewards: first furnished room, room-tour goals ---------- */
  function rewards(photo=false){
    const news=[];
    for(const r of DECOR.rooms){
      if(house.done.includes(r.id)||!L.isFurnished(r.id,house.rooms[r.id].pieces))continue;
      house.done.push(r.id);state.stars+=DECOR.furnished.reward;track('decor-done',r.id);
      news.push(t('house.furnishedSay',{room:theRoom(r.id),count:DECOR.furnished.reward}));
    }
    const met=L.goalsMet(Object.fromEntries(Object.entries(house.rooms).map(([id,r])=>[id,{w:r.w,f:r.f,b:r.b,pieces:r.pieces}])));
    if(photo)met.add('photo');
    const goals=[];let paid=0;
    for(const g of DECOR.goals){
      if(!met.has(g.id)||house.goals.includes(g.id))continue;
      house.goals.push(g.id);state.stars+=g.reward;paid+=g.reward;track('decor-goal',g.id);goals.push(t('house.goal.'+g.id));
    }
    if(goals.length)news.push(t('house.goalSay',{goal:I18N.list(goals),count:paid}));
    if(!news.length)return;
    save();navBar();
    tone(true);setTimeout(()=>say(news.join(' ')),60);
  }

  /* ---------- markup ---------- */
  function heading(){return sectionTitle(places.find(p=>p.id==='house').name,t('house.sub'),true)}
  function roomCards(){
    return `<nav class="house-rooms" aria-label="${t('house.roomsLabel')}"><ul>${DECOR.rooms.map(r=>{const n=furnitureCount(house.rooms[r.id].pieces.filter(p=>!p.trial)),on=r.id===house.at,done=house.done.includes(r.id);
      return `<li><button class="room-card${on?' is-on':''}" data-dec="room" data-room="${r.id}" data-fid="room-${r.id}" aria-pressed="${on}" aria-label="${esc(t('house.roomCard',{room:roomName(r.id),count:n})+(done?' '+t('house.roomDone'):''))}"><canvas class="room-thumb" data-thumb-room="${r.id}" width="192" height="144" aria-hidden="true"></canvas><span class="room-card-name">${esc(roomName(r.id))}</span><span class="room-card-meta" aria-hidden="true">${done?'✓ ':''}${t('house.pieces',{count:n})}</span></button></li>`}).join('')}</ul></nav>`;
  }
  function stageLabel(){
    const s=sel&&pieces().includes(sel)?t('house.stageSelected',{name:nameOf(sel.id)}):t('house.stageNone');
    return t('house.stageLabel',{room:roomName(house.at)})+' '+s;
  }
  function toolbar(){
    const has=!!sel&&pieces().includes(sel),i=has?it(sel.id):null,h=hs();
    const b=(dec,svg,key,dis,extra='')=>`<button class="dec-tool" data-dec="${dec}" data-fid="tool-${dec}" ${dis?'disabled':''} title="${esc(t('house.tool.'+key+'.hint'))}" aria-label="${esc(t('house.tool.'+key+'.label'))}" ${extra}>${sv(svg,20)}<span>${t('house.tool.'+key)}</span></button>`;
    return `<div class="dec-toolbar" role="toolbar" aria-label="${t('house.toolbar')}" aria-controls="house-stage">${b('flip','flip','flip',!has||!i.mirror)}${b('smaller','minus','smaller',!has||sel.s<=L.SCALE.min+.001)}${b('bigger','plus','bigger',!has||sel.s>=L.SCALE.max-.001)}${b('back','down','back',!has)}${b('forward','up','forward',!has)}${b('copy','copy','copy',!has||L.isDoll(sel.id))}${b('remove','trash','remove',!has)}<span class="dec-sep" aria-hidden="true"></span>${b('undo','undo','undo',!h.undo.length)}${b('redo','redo','redo',!h.redo.length)}</div>`;
  }
  function tryBar(){
    const trial=pieces().filter(p=>p.trial);if(!trial.length)return '';
    const ids=[...new Set(trial.map(p=>p.id))],cost=ids.reduce((s,id)=>s+L.price(id),0),short=cost-balance(),names=I18N.list(ids.map(nameOf));
    return `<div class="tryon"><p><span class="tryon-eyebrow">${icon('sparkle',13)} ${t('house.previewing')}</span> <b>${esc(names)}</b></p><div class="tryon-actions"><button class="primary" data-dec="buy" data-fid="buy" ${short>0?'disabled':''}>${icon('star',16)} ${t('shop.buyFor',{cost})}</button><button class="ghost" data-dec="put-back" data-fid="put-back">${t('shop.putBack')}</button></div>${short>0?`<p class="tryon-note">${t('shop.short',{count:short})}</p>`:''}</div>`;
  }
  const TABS=[{id:'room',icon:'sofa'},{id:'other',icon:'door'},{id:'walls',icon:'wall'},{id:'floor',icon:'rug'},{id:'paint',icon:'paint'},{id:'friends',icon:'friend'}];
  function card(id){
    const i=it(id),price=L.price(id),locked=price&&!house.owned.has(id),fresh=price&&!locked;
    const label=locked?t('house.addLocked',{name:nameOf(id),count:price}):t('house.add',{name:nameOf(id)});
    return `<button class="item-card dec-card${locked?' is-locked':''}" data-dec="add" data-id="${id}" data-fid="add-${id}" aria-label="${esc(label)}"><span class="thumb"><img src="${BASE+i.thumb}" alt="" loading="lazy" decoding="async" width="128" height="128" draggable="false"></span><span class="item-name">${esc(nameOf(id))}</span>${locked?`<span class="price-tag" aria-hidden="true">${icon('lock',11)}${price}</span>`:fresh?`<span class="owned-tag" aria-hidden="true">★</span>`:''}</button>`;
  }
  function cards(ids){return `<div class="item-grid dec-grid">${ids.map(card).join('')}</div>`}
  const byCat=c=>items.filter(i=>i.room===c).map(i=>i.id);
  function tabBody(){
    const def=L.roomDef(house.at);
    switch(tab){
      case 'room':return group(t('house.group.own',{room:theRoom(house.at)}),cards(byCat(def.own)));
      case 'other':{const others=DECOR.rooms.filter(r=>r.id!==house.at).map(r=>r.own);
        const chips=`<div class="dec-filter" role="group" aria-label="${t('house.filter')}">${['all',...others].map(c=>`<button data-dec="filter" data-cat="${c}" data-fid="filter-${c}" aria-pressed="${other===c}">${c==='all'?t('house.filterAll'):esc(roomName(c))}</button>`).join('')}</div>`;
        const show=other==='all'?others:[other];
        return chips+show.map(c=>group(esc(roomName(c)),cards(byCat(c)))).join('');}
      case 'walls':return group(t('house.group.walls'),cards(byCat('walls')))+`<p class="group-hint">${t('house.hint.walls')}</p>`;
      case 'floor':return group(t('house.group.floor'),cards(byCat('floor')))+`<p class="group-hint">${t('house.hint.floor')}</p>`;
      case 'paint':{const r=cur(),bds=DECOR.backdrops.filter(b=>b.room===house.at);
        const sw=(kind,id,pressed)=>`<button class="chip dec-swatch" data-dec="${kind}" data-value="${id}" data-fid="${kind}-${id}" aria-pressed="${pressed}"><span class="dec-swatch-pic" style="background-image:url('${DecorPaint.swatch(kind==='set-wall'?'wall':'floor',id)}')"></span><span class="chip-name">${esc(t('house.'+(kind==='set-wall'?'wall':'floor')+'.'+id))}</span></button>`;
        return (bds.length?group(t('house.group.schemes'),`<div class="dec-schemes">${bds.map(b=>`<button class="dec-scheme" data-dec="set-scheme" data-value="${b.id}" data-fid="scheme-${b.id}" aria-pressed="${r.b===b.id}"><img src="${b.thumb}" alt="" width="192" height="144" loading="lazy" decoding="async" draggable="false" style="background:${b.swatch||'#fff'}"><span class="chip-name">${esc(t('house.scheme.'+b.id))}</span></button>`).join('')}</div>`)+`<p class="group-hint">${t('house.hint.schemes')}</p>`:'')+
          group(t(def.outdoor?'house.group.wallOut':'house.group.wall'),`<div class="chip-grid">${def.walls.map(id=>sw('set-wall',id,!r.b&&r.w===id)).join('')}</div>`)+
          group(t(def.outdoor?'house.group.floorOut':'house.group.floorIn'),`<div class="chip-grid">${def.floors.map(id=>sw('set-floor',id,!r.b&&r.f===id)).join('')}</div>`);}
      case 'friends':{const dolls=[state.doll,state.doll==='adult'?'little':'adult'];
        return group(t('house.group.friends'),`<p class="group-hint">${t('house.hint.friends')}</p><div class="item-grid dec-grid friends">${dolls.map(d=>{const here=pieces().some(p=>p.id==='@'+d);
          return `<button class="item-card dec-card${here?' is-here':''}" data-dec="friend" data-id="@${d}" data-fid="friend-${d}" aria-pressed="${here}" aria-label="${esc(t(here?'house.friendHere':'house.friendInvite',{name:playerName(d)}))}"><span class="thumb">${Shop.dollImg(state.looks[d],d)}</span><span class="item-name">${esc(playerName(d))}</span><span class="friend-state" aria-hidden="true">${t(here?'house.friendRemove':'house.friendAdd')}</span></button>`}).join('')}</div>`);}
    }
    return '';
  }
  function panel(){
    const tabs=`<div class="room-tabs dec-tabs" role="tablist" aria-label="${t('house.tabs')}">${TABS.map(tb=>`<button role="tab" id="dec-tab-${tb.id}" data-dec="tab" data-tab-id="${tb.id}" data-fid="tab-${tb.id}" aria-selected="${tb.id===tab}" aria-controls="dec-tabpanel" tabindex="${tb.id===tab?0:-1}">${ic(tb.icon,18)}<span>${t('house.tab.'+tb.id)}</span></button>`).join('')}</div>`;
    return `<div class="panel makeover-panel dec-panel"><div class="panel-top dec-actions"><button class="tool-btn surprise" data-dec="surprise" data-fid="surprise">${icon('shuffle',18)} ${t('house.surprise')}</button><button class="tool-btn" data-dec="photo" data-fid="photo">${icon('camera',18)} ${t('house.photo')}</button><button class="tool-btn" data-dec="reset" data-fid="reset">${sv('reset',18)} ${t('house.reset')}</button></div>${tabs}<div id="dec-tabpanel" class="tab-body" role="tabpanel" aria-labelledby="dec-tab-${tab}">${tabBody()}</div></div>`;
  }
  function placeWord(p){
    const i=it(p.id);
    if(p.host)return t('house.where.on',{name:nameOf(p.host.id)});
    const across=p.x<ROOM.W*.36?'left':p.x>ROOM.W*.64?'right':'middle';
    if(i.placement==='wall'){const z=L.wallZone(W()),v=(p.y-z.y0)/(z.y1-z.y0);return t('house.where.wall',{across:t('house.across.'+across),height:t('house.height.'+(v<.4?'high':v>.7?'low':'mid'))})}
    const tt=L.depthT(p.y,W());
    return t(i.placement==='rug'?'house.where.rug':'house.where.floor',{across:t('house.across.'+across),depth:t('house.depth.'+(tt<.34?'back':tt>.68?'front':'middle'))});
  }
  function listPanel(){
    const ps=pieces(),order=L.sortPieces(ps).reverse();
    const body=ps.length?`<ul class="dec-list">${order.map(p=>`<li><button data-dec="select" data-uid="${p.uid}" data-fid="sel-${p.uid}" aria-pressed="${p===sel}"><span class="dec-list-name">${esc(nameOf(p.id))}${p.trial?` <span class="dec-list-tag">${t('house.preview')}</span>`:''}</span><span class="dec-list-where">${esc(placeWord(p))}</span></button></li>`).join('')}</ul>`:`<p class="dec-empty">${t('house.listEmpty')}</p>`;
    return `<section class="panel dec-inroom" aria-labelledby="dec-inroom-title"><div class="fav-head"><h2 id="dec-inroom-title">${sv('sofa',18)} ${t('house.inRoom')}</h2><b>${t('common.ratio',{n:furnitureCount(ps),total:DECOR.cap})}</b></div><p class="dec-keys">${t('house.keys')}</p>${body}</section>`;
  }
  function tourPanel(){
    const goals=DECOR.goals.map(g=>{const done=house.goals.includes(g.id);return `<li class="${done?'met':''}"><span aria-hidden="true">${done?icon('check',14):'♡'}</span>${t('house.goal.'+g.id)} <small>+${g.reward} ★</small><span class="sr-only">${t(done?'house.goalDone':'house.goalTodo')}</span></li>`}).join('');
    const rooms=DECOR.rooms.filter(r=>house.done.includes(r.id)).length;
    return `<aside class="challenge dec-tour"><div class="eyeline">${icon('ticket',18)} ${t('house.tour')}</div><p>${t('house.tourText',{count:DECOR.furnished.reward,pieces:DECOR.furnished.pieces})}</p><ul class="brief-list">${goals}</ul><p class="dec-furnished">${t('house.furnishedCount',{n:rooms,total:DECOR.rooms.length})}</p><span class="ticket-star" aria-hidden="true">☆</span></aside>`;
  }
  function screen(){
    if(!house)return heading()+`<div class="house-loading" role="status"><span aria-hidden="true">✦</span> ${t('house.loading')}</div>`;
    return heading()+roomCards()+`<div class="workbench house-bench"><section class="display house-display" aria-label="${esc(roomName(house.at))}"><div class="map-bar"><span>${sv('door',16)} <span id="dec-room-name">${esc(roomName(house.at))}</span></span><span class="stage-purse">${icon('star',13)} ${t('room.purse',{balance:`<b id="dec-balance">${I18N.num(balance())}</b>`})}</span></div><div class="house-stage" id="house-stage" tabindex="0" role="application" aria-roledescription="${t('house.stageRole')}" aria-label="${esc(stageLabel())}" aria-describedby="dec-keys-hint"><canvas class="dec-bg" width="1536" height="1152" aria-hidden="true"></canvas><canvas class="dec-fg" aria-hidden="true"></canvas><div id="dec-tryon">${tryBar()}</div></div><p id="dec-keys-hint" class="sr-only">${t('house.keys')}</p><div id="dec-toolbar">${toolbar()}</div></section><div class="controls"><div id="dec-panel">${panel()}</div><div id="dec-inroom">${listPanel()}</div>${tourPanel()}</div></div>`;
  }

  /* ---------- mounting ---------- */
  function html(){
    if(!house){load().then(()=>{if(route==='house')mountFresh()}).catch(()=>{const m=main.querySelector('.house-loading');if(m)m.textContent=t('house.loadError')});}
    else setTimeout(attach);
    return screen();
  }
  function mountFresh(){
    const y=scrollY;main.innerHTML=screen();scrollTo(scrollX,y);attach();
  }
  let opened=false,resizer=null;
  function attach(){
    if(route!=='house'||!house)return;
    const stage=main.querySelector('#house-stage');if(!stage)return;
    ui={stage,bg:stage.querySelector('.dec-bg'),fg:stage.querySelector('.dec-fg')};
    if(!opened){opened=true;track('decor-room',house.at)}
    // keep the save valid and clean on the first look at the house
    paintBg();sizeFg();paint();drawCards();
    resizer?.disconnect();resizer=new ResizeObserver(()=>{sizeFg();paint()});resizer.observe(stage);
    stage.addEventListener('pointerdown',down);
    stage.addEventListener('keydown',keys);
    stage.addEventListener('touchmove',e=>{if(drag)e.preventDefault()},{passive:false});
    stage.addEventListener('lostpointercapture',()=>{if(drag)up()});
    main.querySelector('.dec-panel')?.addEventListener('pointerdown',cardDown);
    pieces().forEach(p=>sprite(p.id));
  }
  /* Partial refresh around the canvases (the room picture never blinks). */
  function refresh(focusFid){
    if(route!=='house'||!ui||!document.contains(ui.stage)){return}
    const fid=focusFid||document.activeElement?.dataset?.fid;
    main.querySelector('#dec-room-name').textContent=roomName(house.at);
    main.querySelector('.house-display').setAttribute('aria-label',roomName(house.at));
    main.querySelector('#dec-balance').textContent=I18N.num(balance());
    main.querySelector('#dec-tryon').innerHTML=tryBar();
    main.querySelector('#dec-toolbar').innerHTML=toolbar();
    main.querySelector('#dec-inroom').innerHTML=listPanel();
    const scrollPanel=main.querySelector('#dec-tabpanel')?.scrollTop;
    main.querySelector('#dec-panel').innerHTML=panel();
    main.querySelector('.house-rooms').outerHTML=roomCards();
    main.querySelector('.dec-tour').outerHTML=tourPanel();
    ui.stage.setAttribute('aria-label',stageLabel());
    main.querySelector('.dec-panel')?.addEventListener('pointerdown',cardDown);
    drawCards();paint();
    if(fid&&fid!=='stage')main.querySelector(`[data-fid="${CSS.escape(fid)}"]`)?.focus({preventScroll:true});
  }
  /* small refresh while only the selection or toolbar state changed */
  function refreshSel(){
    if(!ui)return;
    const fid=document.activeElement?.dataset?.fid;
    main.querySelector('#dec-toolbar').innerHTML=toolbar();
    main.querySelector('#dec-inroom').innerHTML=listPanel();
    ui.stage.setAttribute('aria-label',stageLabel());
    if(fid)main.querySelector(`[data-fid="${CSS.escape(fid)}"]`)?.focus({preventScroll:true});
  }

  /* ---------- drawing ---------- */
  /* Painted backdrops: the full picture (only for a room being shown or photographed) and the small
     thumbnail (room cards, and a stand-in while the picture loads). Loaded on first use, then kept. */
  const backdrops=new Map();
  function backdropPic(id,full){
    const b=L.backdrop(id);if(!b)return null;
    const key=(full?'full:':'thumb:')+id;let s=backdrops.get(key);
    if(!s){s={img:null};backdrops.set(key,s);
      s.p=image(full?b.file:b.thumb).then(i=>{s.img=i;for(const k of [...bgCache.keys()])if(k.includes('|'+id))bgCache.delete(k);paintBg();drawCardsSoon()}).catch(()=>{});}
    return s;
  }
  /* The empty room as a 1536 x 1152 canvas: procedural paint and floor, or the painted picture
     (`full` false: from its thumbnail, for the room cards). */
  function roomBg(roomId,r,full=r===cur()){
    let bd=null,tag='';
    if(r.b&&L.backdrop(r.b)){
      const big=full?backdropPic(r.b,true).img:null,small=backdropPic(r.b,false).img;
      bd=big||small;tag=(big?'full':small?'thumb':'none')+'|'+r.b;
    }
    const key=[roomId,r.w,r.f,tag].join('|');
    let c=bgCache.get(key);
    if(!c){c=document.createElement('canvas');c.width=ROOM.W;c.height=ROOM.H;const g=c.getContext('2d');
      if(r.b&&!bd){g.fillStyle=L.backdrop(r.b).swatch||'#f4ebe6';g.fillRect(0,0,ROOM.W,ROOM.H)}
      else DecorPaint.room(g,roomId,r.w,r.f,bd);
      bgCache.set(key,c);if(bgCache.size>16)bgCache.delete(bgCache.keys().next().value)}
    return c;
  }
  function paintBg(){if(!ui)return;const g=ui.bg.getContext('2d');g.clearRect(0,0,ROOM.W,ROOM.H);g.drawImage(roomBg(house.at,cur()),0,0)}
  function sizeFg(){
    if(!ui)return;const r=ui.stage.getBoundingClientRect();if(!r.width)return;
    const w=Math.min(ROOM.W,Math.round(r.width*Math.min(2,devicePixelRatio||1)));
    if(ui.fg.width!==w){ui.fg.width=w;ui.fg.height=Math.round(w*ROOM.H/ROOM.W)}
  }
  function paint(){dirty=true;if(!raf)raf=requestAnimationFrame(frame)}
  let frameHook=null;
  function frame(ts){
    raf=0;if(!dirty||!ui)return;dirty=false;
    if(pendingMove){const m=pendingMove;pendingMove=null;moveTo(m)}
    const g=ui.fg.getContext('2d'),k=ui.fg.width/ROOM.W;
    g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,ui.fg.width,ui.fg.height);g.setTransform(k,0,0,k,0,0);
    drawPieces(g,pieces(),false,k,null,W());
    if(sel&&pieces().includes(sel))drawSelection(g,sel,k);
    if(frameHook)frameHook(ts);
  }
  /* Draws pieces in depth order with soft contact shadows. `thumbs` uses the small pictures (room
     cards); `where` is the room's geometry (see whereOf). */
  function drawPieces(g,list,thumbs,k=1,imgOf=null,where){
    g.imageSmoothingEnabled=true;g.imageSmoothingQuality=thumbs?'medium':'high';
    const order=L.sortPieces(list),pic=p=>imgOf?imgOf(p):thumbs?thumbImg(p.id):sprite(p.id).img,geo=L.geo(where);
    let cast=false;
    for(const p of order){
      const i=it(p.id);if(!i)continue;
      // after the wall pieces: tall pieces standing against the back wall cast a faint shadow on it
      if(!cast&&i.placement!=='wall'){cast=true;wallCast(g,order,pic,where)}
      const img=pic(p),b=L.box(p,where);
      if(i.placement==='wall')mountShadow(g,p,b,img);
      else if(i.placement==='rug')rugShadow(g,p,b,img);
      else groundShadow(g,p,i,b,img,where);
      if(!img)continue;
      if(p.trial)g.globalAlpha=.9;
      if(i.placement==='rug'&&geo.painted)drawRug(g,p,b,img,where);
      else if(p.f){g.save();g.translate(b.x+b.w,b.y);g.scale(-1,1);g.drawImage(img,0,0,b.w,b.h);g.restore()}
      else g.drawImage(img,b.x,b.y,b.w,b.h);
      g.globalAlpha=1;
      if(p.trial&&!thumbs){g.save();g.setLineDash([10/k,7/k]);g.strokeStyle='#dba92a';g.lineWidth=3/k;g.strokeRect(b.x,b.y,b.w,b.h);g.restore()}
    }
    if(!cast)wallCast(g,order,pic,where);
  }
  /* A rug in a painted room lies flat in that room's perspective: drawn in thin bands, each as wide
     as the floor's scale at its depth (narrower toward the back wall). */
  function drawRug(g,p,b,img,where){
    const n=28,s0=L.depthScale(p.y,where),cx=b.x+b.w/2,sh=img.height/n,bh=b.h/n;
    g.save();if(p.f){g.translate(2*cx,0);g.scale(-1,1)}
    for(let j=0;j<n;j++){
      const y=b.y+j*bh,wj=b.w*L.depthScale(y+bh/2,where)/s0;
      g.drawImage(img,0,j*sh,img.width,sh+.5,cx-wj/2,y,wj,bh+.6);
    }
    g.restore();
  }
  /* A blurred silhouette of a sprite (made once per picture, at most ~200 px) for shadows. */
  const silhouettes=new WeakMap();
  function silhouette(img){
    if(!img)return null;let s=silhouettes.get(img);if(s)return s;
    const w=img.width,h=img.height,k=Math.min(1,200/Math.max(w,h)),sw=Math.max(1,Math.round(w*k)),sh=Math.max(1,Math.round(h*k)),pad=Math.ceil(Math.max(sw,sh)*.05)+3;
    const c=document.createElement('canvas');c.width=sw+pad*2;c.height=sh+pad*2;const g=c.getContext('2d');
    g.shadowColor='rgb(52,26,48)';g.shadowBlur=pad*.7;g.shadowOffsetX=4000;g.drawImage(img,pad-4000,pad,sw,sh);
    s={c,pad:pad/k};silhouettes.set(img,s);return s;
  }
  /* Draws a piece's blurred silhouette over its box (mirrored with it), shifted by dx,dy. */
  function drawSil(g,p,b,img,dx,dy,alpha){
    const s=silhouette(img);if(!s)return;
    const sc=b.w/img.width,pd=s.pad*sc;
    g.save();g.globalAlpha=alpha;
    if(p.f){g.translate(b.x+b.w+dx,0);g.scale(-1,1);g.drawImage(s.c,-pd,b.y-pd+dy,b.w+2*pd,b.h+2*pd)}
    else g.drawImage(s.c,b.x-pd+dx,b.y-pd+dy,b.w+2*pd,b.h+2*pd);
    g.restore();
  }
  /* Grounding for anything that stands: a soft pool of shade over the whole footprint (wider and
     lighter outward), and the darker, tighter shadow of the piece's own base right at its feet.
     Shade leans the way the room's light falls: a little to the right in the procedural rooms (the
     art is lit from the upper left), and as measured from each painting (its windows and sun). */
  function groundShadow(g,p,i,b,img,where){
    const light=L.geo(where).light;
    const f=L.footprint(p,where),fw=Math.max(8,f.r-f.l),fd=Math.max(4,f.front-f.rear),lean=fw*light;
    const cx=(f.l+f.r)/2+lean,cy=(f.front+f.rear)/2+1,rx=fw*.56+8,ry=fd*.5+Math.max(6,fw*.05);
    g.save();g.translate(cx,cy);g.scale(1,ry/rx);
    const gr=g.createRadialGradient(0,0,0,0,0,rx);gr.addColorStop(0,'rgba(60,30,55,.32)');gr.addColorStop(.55,'rgba(60,30,55,.18)');gr.addColorStop(1,'rgba(60,30,55,0)');
    g.fillStyle=gr;g.beginPath();g.arc(0,0,rx,0,Math.PI*2);g.fill();g.restore();
    if(!img)return;
    // contact: only the base of the silhouette (from just above the rear feet down)
    const top=f.rear-Math.min(b.h*.08,30),side=Math.sign(light)||0;
    // the base, laid flat on the floor away from the light
    g.save();g.beginPath();g.rect(b.x-b.w,f.rear-6,b.w*3,b.b-f.rear+60);g.clip();
    g.translate(0,f.front);g.scale(1,.42);g.translate(0,-f.front);
    drawSil(g,p,b,img,b.w*light*.875+3*side,fd*.2+6,.42);
    g.restore();
    // and the dark contact right at the feet
    g.save();g.beginPath();g.rect(b.x-b.w,top,b.w*3,b.b-top+40);g.clip();
    drawSil(g,p,b,img,b.w*light*.3+1.5*side,2.5,.85);
    g.restore();
  }
  function rugShadow(g,p,b,img){if(img)drawSil(g,p,b,img,1.5,3,.22)}
  function mountShadow(g,p,b,img){if(img)drawSil(g,p,b,img,Math.max(3,b.w*.018),Math.max(4,b.h*.025),.3)}
  /* Tall pieces whose back is against the back wall throw a faint shadow up and to the side onto it
     (not on a painted patio, whose back is open arches and garden). */
  function wallCast(g,order,pic,where){
    const geo=L.geo(where),back=geo.back;if(geo.painted&&geo.outdoor)return;
    const reach=70*(geo.front-back.y1)/468,dir=Math.sign(geo.light)||1;
    for(const p of order){
      const i=it(p.id);if(!i||i.placement==='wall'||i.placement==='rug'||p.host)continue;
      const f=L.footprint(p,where),b=L.box(p,where),near=f.rear-back.y1;
      if(near>reach||b.y>back.y1-60)continue;
      const img=pic(p);if(!img)continue;
      g.save();g.beginPath();g.rect(back.x0,0,back.x1-back.x0,back.y1);g.clip();
      drawSil(g,p,b,img,dir*(b.w*.05+6),-Math.max(4,b.h*.02),.16*(1-near/reach));
      g.restore();
    }
  }
  const HANDLE=19; // css px radius of the on-item handles
  function handles(p,k){
    const b=L.box(p,W()),cssK=k/(Math.min(2,devicePixelRatio||1)),r=HANDLE/cssK;
    return {r,remove:{x:Math.min(b.r,ROOM.W-r-4),y:Math.max(b.y,r+4)},size:{x:Math.min(b.r,ROOM.W-r-4),y:Math.min(b.b,ROOM.H-r-4)}};
  }
  function drawSelection(g,p,k){
    const b=L.box(p,W()),hd=handles(p,k),lw=2.5*hd.r/HANDLE;
    g.save();
    g.strokeStyle='#fff';g.lineWidth=lw*2.4;g.setLineDash([]);g.strokeRect(b.x,b.y,b.w,b.h);
    g.strokeStyle='#a4245e';g.lineWidth=lw;g.setLineDash([lw*4,lw*3]);g.strokeRect(b.x,b.y,b.w,b.h);g.setLineDash([]);
    const dot=(h,draw)=>{g.fillStyle='#fff';g.strokeStyle='#a4245e';g.lineWidth=lw;g.beginPath();g.arc(h.x,h.y,hd.r,0,Math.PI*2);g.fill();g.stroke();g.strokeStyle='#a4245e';g.lineWidth=lw*1.1;g.beginPath();draw(h.x,h.y,hd.r*.42);g.stroke()};
    dot(hd.remove,(x,y,s)=>{g.moveTo(x-s,y-s);g.lineTo(x+s,y+s);g.moveTo(x+s,y-s);g.lineTo(x-s,y+s)});
    dot(hd.size,(x,y,s)=>{g.moveTo(x-s,y-s);g.lineTo(x+s,y+s);g.moveTo(x+s*.1,y+s);g.lineTo(x+s,y+s);g.lineTo(x+s,y+s*.1);g.moveTo(x-s*.1,y-s);g.lineTo(x-s,y-s);g.lineTo(x-s,y-s*.1)});
    g.restore();
  }
  /* Room cards: live miniatures of every room from the small thumbnails. */
  let cardsTimer=0;
  function drawCardsSoon(){if(!cardsTimer)cardsTimer=setTimeout(()=>{cardsTimer=0;drawCards()},120)}
  function drawCards(){
    if(route!=='house')return;
    main.querySelectorAll('canvas[data-thumb-room]').forEach(c=>{
      const id=c.dataset.thumbRoom,r=house.rooms[id],g=c.getContext('2d'),k=c.width/ROOM.W;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);g.setTransform(k,0,0,k,0,0);
      g.drawImage(roomBg(id,r,false),0,0);drawPieces(g,r.pieces.filter(p=>!p.trial),true,k,null,whereOf(id));
    });
  }

  /* ---------- picking and dragging on the stage ---------- */
  function roomPoint(e){const r=ui.fg.getBoundingClientRect();return {x:(e.clientX-r.left)*ROOM.W/r.width,y:(e.clientY-r.top)*ROOM.H/r.height}}
  function hitPiece(pt){
    for(const p of L.sortPieces(pieces()).reverse()){
      const b=L.box(p,W());if(pt.x<b.x||pt.x>b.r||pt.y<b.y||pt.y>b.b)continue;
      const m=sprite(p.id).mask;if(!m)return p;
      let u=(pt.x-b.x)/b.w;if(p.f)u=1-u;const v=(pt.y-b.y)/b.h;
      if(m.a[Math.min(m.h-1,Math.floor(v*m.h))*m.w+Math.min(m.w-1,Math.floor(u*m.w))]>40)return p;
    }
    return null;
  }
  let drag=null,pendingMove=null;
  function down(e){
    if(e.button>0||e.target.closest("#dec-tryon")&&e.target.closest("button,.tryon"))return; // the Buy / Put back bar sits over the room
    const pt=roomPoint(e),k=ui.fg.width/ROOM.W;
    if(sel&&pieces().includes(sel)){
      const hd=handles(sel,k),near=h=>Math.hypot(pt.x-h.x,pt.y-h.y)<=hd.r*1.25;
      if(near(hd.remove)){e.preventDefault();removeSel();return}
      if(near(hd.size)){e.preventDefault();remember();drag={p:sel,mode:'size',s0:sel.s,d0:Math.max(30,Math.hypot(pt.x-sel.x,pt.y-sel.y)),moved:false,id:e.pointerId,x0:e.clientX,y0:e.clientY};listen(e);return}
    }
    const p=hitPiece(pt);
    if(!p){if(sel){sel=null;refreshSel();paint()}return}
    e.preventDefault();ui.stage.focus({preventScroll:true});
    if(sel!==p){sel=p;refreshSel()}
    drag={p,mode:'move',dx:pt.x-p.x,dy:pt.y-p.y,snap:snapshot(),moved:false,id:e.pointerId,x0:e.clientX,y0:e.clientY};
    listen(e);paint();
  }
  function listen(e){
    try{ui.stage.setPointerCapture(e.pointerId)}catch{}
    ui.stage.addEventListener('pointermove',move);ui.stage.addEventListener('pointerup',up);ui.stage.addEventListener('pointercancel',up);
  }
  function move(e){
    if(!drag||e.pointerId!==drag.id)return;
    if(!drag.moved&&Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<3)return;
    drag.moved=true;pendingMove=roomPoint(e);paint();
  }
  /* Applies the latest pointer position once per frame. */
  function moveTo(pt){
    if(!drag)return;const p=drag.p;
    if(drag.mode==='size'){p.s=Math.round(Math.max(L.SCALE.min,Math.min(L.SCALE.max,drag.s0*Math.hypot(pt.x-p.x,pt.y-p.y)/drag.d0))*100)/100;L.constrain(p,W());return}
    placeAt(p,pt.x-drag.dx,pt.y-drag.dy);
  }
  /* Moves a piece to a room point: a surface piece snaps onto a tabletop under it, everything else
     stays where its kind belongs. Pieces resting on a moved host travel with it. */
  function placeAt(p,x,y){
    const ox=p.x,oy=p.y,i=it(p.id);
    if(i.placement==='surface'){const h=L.hostAt(x,y,pieces(),p,W());p.host=h&&!pieces().some(q=>q.host===p)?h:null}
    p.x=x;p.y=y;L.constrain(p,W());
    for(const q of pieces())if(q.host===p){q.x+=p.x-ox;L.constrain(q,W())}
    void oy;
  }
  function up(e){
    if(!drag)return;
    if(e&&e.pointerId!==undefined&&e.pointerId!==drag.id)return;
    if(pendingMove){moveTo(pendingMove);pendingMove=null}
    const d=drag;drag=null;
    ui.stage.removeEventListener('pointermove',move);ui.stage.removeEventListener('pointerup',up);ui.stage.removeEventListener('pointercancel',up);
    if(d.moved||d.mode==='size'){
      if(d.mode==='move'){const h=hs();h.undo.push(d.snap);if(h.undo.length>HISTORY)h.undo.shift();h.redo.length=0}
      if(d.mode==='size'&&d.p.s===d.s0)hs().undo.pop();
      commit();
      if(d.mode==='move')say(t('house.movedSay',{name:nameOf(d.p.id),where:placeWord(d.p)}));
    }else paint();
  }

  /* ---------- picker: tap to add, or drag a card onto the room ---------- */
  let cardDrag=null,suppressClick=false;
  function cardDown(e){
    const b=e.target.closest('[data-dec="add"],[data-dec="friend"]');if(!b||e.button>0)return;
    const c={b,id:b.dataset.id,x0:e.clientX,y0:e.clientY,armed:e.pointerType==='mouse',active:false,pid:e.pointerId,ghost:null,timer:0};
    b.addEventListener('dragstart',ev=>ev.preventDefault(),{once:true}); // no native image drag
    if(e.pointerType!=='mouse')c.timer=setTimeout(()=>{c.armed=true;b.classList.add('is-armed')},260);
    cardDrag=c;
    addEventListener('pointermove',cardMove,{passive:false});addEventListener('pointerup',cardUp);addEventListener('pointercancel',cardCancel);
    addEventListener('touchmove',cardTouch,{passive:false});
  }
  function cardTouch(e){if(cardDrag&&cardDrag.armed)e.preventDefault()}
  function cardMove(e){
    const c=cardDrag;if(!c||e.pointerId!==c.pid)return;
    const dist=Math.hypot(e.clientX-c.x0,e.clientY-c.y0);
    if(!c.armed){if(dist>8){clearTimeout(c.timer);cardCancel()}return}
    if(!c.active&&dist>6){c.active=true;const img=c.b.querySelector('img');c.ghost=document.createElement('div');c.ghost.className='dec-ghost';c.ghost.setAttribute('aria-hidden','true');
      if(img)c.ghost.appendChild(img.cloneNode());document.body.appendChild(c.ghost)}
    if(c.active){e.preventDefault();c.ghost.style.transform=`translate(${e.clientX-48}px,${e.clientY-48}px)`;
      const r=ui.stage.getBoundingClientRect();ui.stage.classList.toggle('is-drop',e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)}
  }
  function cardUp(e){
    const c=cardDrag;if(!c||e.pointerId!==c.pid)return;
    if(c.active){
      suppressClick=true;setTimeout(()=>{suppressClick=false},0);
      const r=ui.stage.getBoundingClientRect();
      if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)add(c.id,roomPoint(e));
    }
    cardCancel();
  }
  function cardCancel(){
    const c=cardDrag;if(!c)return;clearTimeout(c.timer);c.b.classList.remove('is-armed');c.ghost?.remove();ui?.stage.classList.remove('is-drop');cardDrag=null;
    removeEventListener('pointermove',cardMove);removeEventListener('pointerup',cardUp);removeEventListener('pointercancel',cardCancel);removeEventListener('touchmove',cardTouch);
  }

  /* ---------- actions ---------- */
  function add(id,at){
    const doll=L.isDoll(id);
    if(doll&&pieces().some(p=>p.id===id))return;
    if(!doll&&furnitureCount(pieces())>=DECOR.cap){say(t('house.cap',{count:DECOR.cap}));return}
    remember();
    let p;
    if(at){p={id,x:0,y:0,s:1,f:false,z:0,host:null,trial:false};
      const i=it(id),b0=(()=>{p.x=at.x;p.y=at.y;return L.box(p,W())})();
      // drop point = the middle of the picture: put its floor point there instead
      placeAt(p,at.x,at.y+(i.placement==='wall'||i.placement==='rug'?(i.anchor[1]-.5)*b0.h:b0.h*.45));
    }else{
      p=L.findSpot(id,pieces(),W());
      if(it(id).placement==='surface'){const host=(sel&&DECOR.surfaces[sel.id]&&!sel.host?sel:null)||L.sortPieces(pieces()).find(q=>DECOR.surfaces[q.id]&&!q.host&&!pieces().some(r=>r.host===q));
        if(host){const s=L.surfaceOf(host,W());p.host=host;p.x=(s.x0+s.x1)/2;L.constrain(p,W())}}
    }
    p.trial=!doll&&!owns(id);
    withUid(p);pieces().push(p);sel=p;sprite(id);
    if(!p.trial&&!doll){const c=it(id).room;if(CATS.includes(c))track('decor-place',c)}
    if(p.trial)track('tryon','decor');
    commit(p.trial?t('house.previewSay',{name:nameOf(id),count:L.price(id)}):doll?t('house.friendSay',{name:nameOf(id),where:placeWord(p)}):t('house.addedSay',{name:nameOf(id),where:placeWord(p)}));
  }
  function removeSel(){
    if(!sel)return;const p=sel;remember();
    const room=cur();room.pieces=room.pieces.filter(q=>q!==p);
    for(const q of room.pieces)if(q.host===p){q.host=null;q.y=p.y+4;L.constrain(q,W())}
    sel=null;commit(t('house.removedSay',{name:nameOf(p.id)}));
    ui?.stage.focus({preventScroll:true});
  }
  function act(kind){
    const p=sel;if(!p||!pieces().includes(p))return;
    const i=it(p.id);
    switch(kind){
      case 'flip':if(!i.mirror)return;remember();p.f=!p.f;L.constrain(p,W());commit(t('house.flippedSay',{name:nameOf(p.id)}));break;
      case 'smaller':case 'bigger':{const s=Math.round((p.s+(kind==='bigger'?L.SCALE.step:-L.SCALE.step))*100)/100;
        if(s<L.SCALE.min-.001||s>L.SCALE.max+.001){say(t(kind==='bigger'?'house.maxSize':'house.minSize'));return}
        {const was=p.s;remember();p.s=s;L.constrain(p,W());if(Math.abs(p.s-was)<.001){hs().undo.pop();say(t(kind==="bigger"?"house.maxSize":"house.minSize"));return}}for(const q of pieces())if(q.host===p)L.constrain(q,W());
        commit(t('house.sizeSay',{name:nameOf(p.id),percent:Math.round(p.s*100)}));break}
      case 'forward':case 'back':{const snap=snapshot();if(!L.reorder(p,pieces(),kind==='forward'?1:-1,W())){say(t(kind==='forward'?'house.frontMost':'house.backMost',{name:nameOf(p.id)}));return}
        const h=hs();h.undo.push(snap);h.redo.length=0;commit(t(kind==='forward'?'house.forwardSay':'house.backSay',{name:nameOf(p.id)}));break}
      case 'copy':{if(L.isDoll(p.id))return;if(furnitureCount(pieces())>=DECOR.cap){say(t('house.cap',{count:DECOR.cap}));return}
        remember();const q=withUid({...p,x:p.x+40,y:p.y+(i.placement==='wall'?0:24),host:null,z:p.z});
        if(p.host){q.host=p.host}
        L.constrain(q,W());pieces().push(q);sel=q;
        if(!q.trial){const c=i.room;if(CATS.includes(c))track('decor-place',c)}
        commit(t('house.copySay',{name:nameOf(p.id)}));break}
      case 'remove':removeSel();break;
    }
  }
  function undo(redo=false){
    const h=hs(),from=redo?h.redo:h.undo,to=redo?h.undo:h.redo;
    if(!from.length)return;
    to.push(snapshot());restore(from.pop());
    if(sel&&!pieces().some(p=>p.uid===sel.uid))sel=null;else if(sel)sel=pieces().find(p=>p.uid===sel.uid);
    bgDirty();commit(t(redo?'house.redoSay':'house.undoSay'));
  }
  function bgDirty(){paintBg();}
  function setRoom(id){
    if(id===house.at||!house.rooms[id])return;
    const dropped=dropTrials();
    house.at=id;sel=null;save();paintBg();refresh('room-'+id);
    pieces().forEach(p=>sprite(p.id));
    track('decor-room',id);
    say((dropped?dropped+' ':'')+t('house.roomSay',{room:theRoom(id),count:furnitureCount(pieces())}));
  }
  /* Removes unbought previews from every room; returns the sentence that says so, or ''. */
  function dropTrials(){
    const names=[];
    for(const r of Object.values(house?.rooms||{})){const gone=r.pieces.filter(p=>p.trial);if(!gone.length)continue;
      gone.forEach(p=>names.push(nameOf(p.id)));r.pieces=r.pieces.filter(p=>!p.trial);
      for(const q of r.pieces)if(q.host&&!r.pieces.includes(q.host)){q.y=q.host.y+4;q.host=null;L.constrain(q,r.b||DECOR.rooms.find(x=>house.rooms[x.id]===r).id)}}
    if(sel&&sel.trial)sel=null;
    return names.length?t('house.droppedSay',{names:I18N.list([...new Set(names)])}):'';
  }
  /* A new wall, floor or painted scheme. Paint or flooring over a painted room turns it back into the
     procedural room (b = ''); a change of geometry carries every piece across (L.regeo), and Undo
     brings back the old look with every piece where it was. */
  function setTreatment(kind,id){
    const r=cur(),def=L.roomDef(house.at),from=W();
    if(kind==='set-wall'&&def.walls.includes(id)&&(r.w!==id||r.b)){remember();r.w=id;r.b=''}
    else if(kind==='set-floor'&&def.floors.includes(id)&&(r.f!==id||r.b)){remember();r.f=id;r.b=''}
    else if(kind==='set-scheme'&&L.schemes(house.at).some(b=>b.id===id)&&r.b!==id){remember();r.b=id}
    else return;
    const to=W();if(to!==from){L.regeo(r.pieces,from,to);L.settle(r.pieces,to)}
    paintBg();commit(kind==='set-scheme'?t('house.schemeSay',{name:t('house.scheme.'+id)}):t(kind==='set-floor'?'house.floorSay':'house.wallSay',{name:t(kind==='set-wall'?'house.wall.'+id:'house.floor.'+id)}));
  }
  function surpriseMe(){
    const keepDolls=pieces().filter(p=>L.isDoll(p.id));
    const next=L.surprise(W(),id=>owns(id));
    if(!next.length){say(t('house.surpriseNone'));return}
    remember();dropTrials();
    cur().pieces=[...next.map(withUid),...keepDolls];sel=null;
    pieces().forEach(p=>sprite(p.id));
    track('surprise','house');
    commit(t('house.surpriseSay',{room:theRoom(house.at),count:next.length}));
    if(state.sparkle)try{const r=ui.stage.getBoundingClientRect();HibiscusFx.burst(r.left+r.width/2,r.top+r.height/2,1)}catch{}
  }
  function startOver(){
    remember();const r=cur(),def=L.roomDef(house.at),from=W();
    // back to the room's starting look (its first painted scheme); the characters stay
    r.pieces=r.pieces.filter(p=>L.isDoll(p.id));r.w=def.walls[0];r.f=def.floors[0];r.b=L.defaultScheme(house.at);sel=null;
    if(W()!==from)L.regeo(r.pieces,from,W());
    paintBg();commit(t('house.resetSay',{room:theRoom(house.at)}));
  }
  function toggleFriend(id){
    const here=pieces().find(p=>p.id===id);
    if(here){sel=here;removeSel();return}
    add(id);
  }

  /* ---------- buying ---------- */
  function trialBill(){const ids=[...new Set(pieces().filter(p=>p.trial).map(p=>p.id))];return {ids,cost:ids.reduce((s,id)=>s+L.price(id),0)}}
  function dialog(){
    let d=document.querySelector('#decor-dialog');
    if(!d){d=document.createElement('dialog');d.id='decor-dialog';d.setAttribute('aria-labelledby','decor-dialog-title');
      d.innerHTML='<h2 id="decor-dialog-title"></h2><p id="decor-dialog-text"></p><form method="dialog" class="dialog-actions"><button type="button" class="primary" data-dec="dialog-yes"></button><button data-dec="dialog-no"></button></form>';
      document.body.appendChild(d);
      d.addEventListener('close',()=>{if(route==='house'&&(!document.activeElement||document.activeElement===document.body))main.querySelector('[data-fid="surprise"]')?.focus({preventScroll:true})});}
    return d;
  }
  let pending=null;
  function ask(kind){
    const d=dialog();pending=kind;fillDialog();d.showModal();
  }
  function fillDialog(){
    const d=document.querySelector('#decor-dialog');if(!d||!pending)return;
    const q=s=>d.querySelector(s);
    if(pending==='buy'){const b=trialBill(),left=balance()-b.cost;
      q('#decor-dialog-title').textContent=t('shop.buyTitle',{count:b.cost});
      q('#decor-dialog-text').textContent=t('house.buyText',{names:I18N.list(b.ids.map(nameOf)),wallet:t('shop.buyWallet',{balance:balance(),count:left})});
      q('[data-dec="dialog-yes"]').textContent=t('buy.confirm');q('[data-dec="dialog-no"]').textContent=t('buy.cancel');}
    else{q('#decor-dialog-title').textContent=t('house.resetTitle',{room:theRoom(house.at)});q('#decor-dialog-text').textContent=t('house.resetText');
      q('[data-dec="dialog-yes"]').textContent=t('house.resetYes');q('[data-dec="dialog-no"]').textContent=t('house.resetNo');}
  }
  function openBuy(){
    const b=trialBill();if(!b.ids.length)return;
    if(b.cost>balance()){say(t('house.needMore',{count:b.cost-balance(),names:I18N.list(b.ids.map(nameOf))}));return}
    ask('buy');
  }
  function confirmBuy(){
    const b=trialBill();if(!b.ids.length)return;
    if(b.cost>balance()){say(t('shop.fewMore'));refresh();return}
    state.spent+=b.cost;
    for(const id of b.ids){house.owned.add(id);const p=L.price(id);track('purchase','decor',p<10?'1-9':p<20?'10-19':'20-plus')}
    for(const r of Object.values(house.rooms))for(const p of r.pieces)if(house.owned.has(p.id))p.trial=false;
    for(const p of pieces()){const c=it(p.id)?.room;if(b.ids.includes(p.id)&&CATS.includes(c))track('decor-place',c)}
    navBar();
    const wallet=document.querySelector('#wallet');wallet.classList.remove('spent');void wallet.offsetWidth;wallet.classList.add('spent');
    tone(true);commit(t('house.boughtSay',{names:I18N.list(b.ids.map(nameOf)),count:balance()}));
  }
  function putBack(){
    const names=I18N.list(trialBill().ids.map(nameOf));
    remember();cur().pieces=pieces().filter(p=>!p.trial);for(const q of pieces())if(q.host&&!pieces().includes(q.host)){q.y=q.host.y+4;q.host=null;L.constrain(q,W())}
    if(sel&&sel.trial)sel=null;
    commit(t('house.putBackSay',{names}));
  }

  /* ---------- keyboard ---------- */
  let sayTimer=0;
  function keys(e){
    const mod=e.ctrlKey||e.metaKey;
    if(mod&&(e.key==='z'||e.key==='Z')){e.preventDefault();undo(e.shiftKey);return}
    if(mod&&(e.key==='y'||e.key==='Y')){e.preventDefault();undo(true);return}
    if(mod||e.altKey)return;
    const ps=L.sortPieces(pieces());
    if(e.key==='n'||e.key===']'||e.key==='p'||e.key==='['){
      if(!ps.length){say(t('house.listEmpty'));return}
      e.preventDefault();const back=e.key==='p'||e.key==='[';const i=ps.indexOf(sel);
      sel=ps[(i<0?(back?ps.length-1:0):(i+(back?-1:1)+ps.length)%ps.length)];refreshSel();paint();
      say(t('house.selectedSay',{name:nameOf(sel.id),where:placeWord(sel)}));return;
    }
    if(!sel||!pieces().includes(sel)){
      if(e.key.startsWith('Arrow')){e.preventDefault();say(t('house.selectFirst'))}
      return;
    }
    const step=e.shiftKey?48:12;
    const d={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]}[e.key];
    if(d){e.preventDefault();
      if(!keyMove){keyMove=snapshot()}
      const p=sel,i=it(p.id);let tx=p.x+d[0],ty=p.y+d[1];
      if(p.host&&d[1]){ // up/down lifts a piece off its tabletop
        ty=d[1]>0?p.host.y+20:p.y-80;p.host=null}
      else if(i.placement==='surface'&&!p.host&&d[1]<0){const h=L.hostAt(tx,ty-60,pieces(),p,W());if(h&&L.surfaceOf(h,W()).y<p.y){ty=L.surfaceOf(h,W()).y}}
      placeAt(p,tx,ty);paint();
      clearTimeout(sayTimer);sayTimer=setTimeout(()=>{finishKeyMove();say(t('house.movedSay',{name:nameOf(p.id),where:placeWord(p)}))},450);
      return;
    }
    const map={'+':'bigger','=':'bigger','-':'smaller','_':'smaller',f:'flip',F:'flip',PageUp:'forward',PageDown:'back',d:'copy',D:'copy',Delete:'remove',Backspace:'remove'};
    if(map[e.key]){e.preventDefault();finishKeyMove();act(map[e.key]);ui.stage.focus({preventScroll:true});return}
    if(e.key==='Escape'){sel=null;refreshSel();paint();say(t('house.deselectSay'))}
  }
  let keyMove=null;
  function finishKeyMove(){if(!keyMove)return;const h=hs();h.undo.push(keyMove);if(h.undo.length>HISTORY)h.undo.shift();h.redo.length=0;keyMove=null;save();rewards();refreshSel()}

  /* ---------- clicks (delegated; game.js plays the click sound) ---------- */
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-dec]');if(!b||b.disabled)return;
    const d=b.dataset;
    if(d.dec==='dialog-yes'){const k=pending;pending=null;document.querySelector('#decor-dialog').close();if(k==='buy')confirmBuy();else if(k==='reset')startOver();return}
    if(d.dec==='dialog-no'){pending=null;return}
    if(route!=='house'||!house)return;
    if(suppressClick&&(d.dec==='add'||d.dec==='friend'))return;
    switch(d.dec){
      case 'room':setRoom(d.room);break;
      case 'tab':tab=d.tabId;refresh('tab-'+tab);break;
      case 'filter':other=d.cat;refresh('filter-'+other);break;
      case 'add':add(d.id);break;
      case 'friend':toggleFriend(d.id);break;
      case 'select':{const p=pieces().find(q=>String(q.uid)===d.uid);if(p){sel=p;refreshSel();paint();ui.stage.focus({preventScroll:true});say(t('house.selectedSay',{name:nameOf(p.id),where:placeWord(p)})+' '+t('house.selectedHint'))}break}
      case 'flip':case 'smaller':case 'bigger':case 'forward':case 'back':case 'copy':case 'remove':act(d.dec);break;
      case 'undo':undo(false);break;
      case 'redo':undo(true);break;
      case 'set-wall':case 'set-floor':case 'set-scheme':setTreatment(d.dec,d.value);break;
      case 'surprise':surpriseMe();break;
      case 'reset':ask('reset');break;
      case 'photo':takePhoto();break;
      case 'buy':openBuy();break;
      case 'put-back':putBack();break;
    }
  });
  /* tabs: arrow keys move between them (as in the studio) */
  document.addEventListener('keydown',e=>{
    const tb=e.target.closest?.('[data-dec="tab"]');if(!tb||route!=='house')return;
    const all=[...tb.parentElement.querySelectorAll('[data-dec="tab"]')],i=all.indexOf(tb);
    const j={ArrowRight:i+1,ArrowLeft:i-1,Home:0,End:all.length-1}[e.key];if(j===undefined)return;
    e.preventDefault();tab=all[(j+all.length)%all.length].dataset.tabId;refresh('tab-'+tab);
  });

  /* ---------- room photo (PNG download, and a page in the scrapbook) ---------- */
  async function renderRoom(roomId,room,looks){
    const c=document.createElement('canvas');c.width=ROOM.W;c.height=ROOM.H;const g=c.getContext('2d');
    // a painted room: wait for its full picture (downloaded only now, for a room not on screen)
    if(room.b&&L.backdrop(room.b))await backdropPic(room.b,true).p;
    g.drawImage(roomBg(roomId,room,true),0,0);
    const list=room.pieces.filter(p=>!p.trial);
    await Promise.all(list.map(p=>{
      if(L.isDoll(p.id)){const doll=p.id.slice(1),look=looks?.[doll]||state.looks[doll];const key=lookKey({...look,doll});
        let s=dollSprites.get(key);if(!s){s={img:null};dollSprites.set(key,s);s.p=composeDoll({...look,doll}).then(full=>{const cc=document.createElement('canvas');cc.width=440;cc.height=1040;cc.getContext('2d').drawImage(full,80,0,440,1040,0,0,440,1040);s.img=cc;s.mask=maskOf(cc)})}
        return s.p;}
      return sprite(p.id).p;
    }).filter(Boolean)).catch(()=>{});
    // characters from a photo wear the looks they had then
    const saved=new Map();
    for(const p of list)if(L.isDoll(p.id)&&looks?.[p.id.slice(1)]){const doll=p.id.slice(1);saved.set(doll,lookKey({...looks[doll],doll}))}
    g.imageSmoothingQuality='high';
    drawPieces(g,list,false,1,p=>L.isDoll(p.id)?dollSprites.get(saved.get(p.id.slice(1))||dollKey(p.id.slice(1)))?.img:sprites.get(p.id)?.img,room.b||roomId);
    return c;
  }
  /* The postcard: the room on paper in a striped frame, like the doll postcards, with a caption. */
  function postcard(room,roomId,doll){
    const W=1280,H=1110,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
    const colors=frameColors[0];g.fillStyle=colors[0];g.fillRect(0,0,W,H);g.fillStyle=colors[1];
    for(let i=-H;i<W;i+=40){g.beginPath();g.moveTo(i,0);g.lineTo(i+18,0);g.lineTo(i+H+18,H);g.lineTo(i+H,H);g.fill()}
    g.fillStyle='#fffefa';g.fillRect(46,34,W-92,H-68);
    g.drawImage(room,64,52,W-128,(W-128)*ROOM.H/ROOM.W);
    try{drawCharm(g,1,W-96,52+(W-128)*.75-34,72)}catch{}
    g.fillStyle='#7a305e';g.textAlign='center';
    fitText(g,t('house.photoCaption',{room:roomName(roomId)}),W/2,H-82,W-200,40,'italic bold {size}px Georgia');
    g.fillStyle='#965677';fitText(g,t('house.photoLine',{doll:t('doll.caption.'+(doll==='little'?'little':'adult'))}),W/2,H-48,W-200,19,'{size}px Trebuchet MS, sans-serif');
    return c;
  }
  async function takePhoto(){
    const roomId=house.at,room=cur();
    if(room.pieces.some(p=>p.trial)){say(t('house.photoTrial'));}
    const looks={};for(const p of room.pieces)if(L.isDoll(p.id))looks[p.id.slice(1)]={...state.looks[p.id.slice(1)]};
    let png;
    try{png=postcard(await renderRoom(roomId,room,looks),roomId,state.doll)}catch{say(t('house.photoError'));return}
    const id=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    try{const a=document.createElement('a');a.download='hibiscus-dream-house-'+roomId+'-'+id+'.png';a.href=png.toDataURL('image/png');a.click()}catch{}
    track('photo','house');
    let msg;
    if(state.photos.length>=24)msg=t('house.photoFull');
    else{
      const snap={r:roomId,w:room.w,f:room.f,...(room.b?{b:room.b}:{}),p:L.writePieces(room.pieces),looks};
      state.photos.unshift({...currentShot(),id,kind:'room',room:snap});
      persist();msg=t('house.photoSaved');
    }
    tone(true);
    rewards(true);
    say(msg);
  }
  /* Scrapbook: draws a saved room photo onto `canvas` (called by game.js). */
  async function paintRoomPhoto(canvas,photo){
    await load();
    const s=photo.room||{},roomId=L.ROOM_IDS.includes(s.r)?s.r:'bedroom',def=L.roomDef(roomId);
    // older snapshots have no painted scheme (b): they are drawn in the procedural room as before
    const b=L.backdrop(s.b)?.room===roomId?s.b:null;
    const room={w:def.walls.includes(s.w)?s.w:def.walls[0],f:def.floors.includes(s.f)?s.f:def.floors[0],b,pieces:L.readPieces(s.p,b||roomId,()=>true)};
    const looks={};for(const d of ['adult','little'])if(s.looks&&s.looks[d])looks[d]=readLook(s.looks[d],d);
    const pc=postcard(await renderRoom(roomId,room,looks),roomId,photo.doll);
    canvas.width=pc.width;canvas.height=pc.height;canvas.getContext('2d').drawImage(pc,0,0);
    return canvas;
  }

  /* ---------- leaving, language ---------- */
  function leave(){
    if(drag)up();cardCancel();
    const msg=dropTrials();
    if(msg){save();}
    sel=null;ui=null;
    return msg;
  }
  function relocalize(){
    if(!house||!ui)return false;
    const heading=main.querySelector('.heading');if(heading)heading.outerHTML=heading2();
    main.querySelector('.stage-purse').innerHTML=`${icon('star',13)} ${t('room.purse',{balance:`<b id="dec-balance">${I18N.num(balance())}</b>`})}`;
    ui.stage.setAttribute('aria-roledescription',t('house.stageRole'));
    main.querySelector('#dec-keys-hint').textContent=t('house.keys');
    refresh();if(document.querySelector('#decor-dialog')?.open)fillDialog();
    return true;
  }
  function heading2(){return heading()}
  /* test hooks for the verification scripts (no effect on play) */
  const debug={get house(){return house},get sel(){return sel},set sel(p){sel=p;refreshSel();paint()},pieces:()=>pieces(),setRoom,add,act,undo,surpriseMe,startOver,frame:fn=>{frameHook=fn},paint,
    box:p=>L.box(p,W()),
    grab:id=>{const p=pieces().find(q=>q.id===id);if(!p)return null;const b=L.box(p,W());
      for(const v of [.6,.5,.7,.4,.8,.3,.9])for(const u of [.5,.4,.6,.3,.7,.2,.8]){const pt={x:b.x+u*b.w,y:b.y+v*b.h};if(hitPiece(pt)===p){const r=ui.fg.getBoundingClientRect();return {x:r.left+pt.x*r.width/ROOM.W,y:r.top+pt.y*r.height/ROOM.H}}}return null},
    toScreen:(x,y)=>{const r=ui.fg.getBoundingClientRect();return {x:r.left+x*r.width/ROOM.W,y:r.top+y*r.height/ROOM.H}}};
  return {load,html,leave,relocalize,paintRoomPhoto,debug};
})();
