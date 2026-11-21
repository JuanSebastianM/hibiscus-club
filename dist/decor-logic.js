/* Dream House rules, free of the page: room geometry, where each kind of piece may stand, depth order,
   the save format and its validation, room-tour goals and "Surprise me" layouts. decorator.js draws and
   handles input on top of this; test/house.test.mjs runs it in Node.
   DecorLogic.setItems(manifest.items) must run once before anything else (decorator.js does it after
   fetching assets/decor/manifest.json; tests pass the file's items).

   Room coordinates are the 1536 x 1152 picture of a room (4:3). The room is a dollhouse cutaway:
     frame        30 px at the sides, 34 at the top, the floor slab's front edge at y 1108
     back wall    x 150..1386, from the top down to y 640 (where it meets the floor)
     side walls   from the back corners out to the frame, their floor edge running to (30|1506, 1108)
     floor        the trapezoid between y 640 (1236 px wide) and y 1108 (1476 px wide)
   A floor piece's position is the point where it touches the floor (its manifest anchor). Pieces
   further back are drawn smaller (depthScale) and earlier (depth order by that point's y). */
const DecorLogic=(()=>{
  const ROOM={W:1536,H:1152,frame:{l:30,r:1506,t:34,b:1108},back:{x0:150,x1:1386,y1:640}};
  const FLOOR={y0:652,y1:1094},RUG={y0:690,y1:1070};
  /* wall pieces stay between the crown moulding and the top of the skirting board (y 604) */
  const WALL={x0:160,x1:1376,y0:58,y1:598},WALL_OUT={x0:160,x1:1376,y0:236,y1:598};
  const SKIRT=36; // skirting board height on the back wall
  const SCALE={min:.5,max:1.8,step:.1};
  const Z_MAX=30;
  const DOLLS=['@adult','@little'];
  /* The characters as pieces: their picture is a fixed crop of composeDoll()'s 600 x 1060 canvas
     (x 80..520, y 0..1040, feet on y 1010). */
  const DOLL_ITEMS={
    '@adult':{id:'@adult',placement:'floor',width:440,height:1040,anchor:[.5,1010/1040],defaultScale:.5,mirror:true,footprint:{x0:150,x1:290,width:140},doll:'adult'},
    '@little':{id:'@little',placement:'floor',width:440,height:1040,anchor:[.5,1010/1040],defaultScale:.37,mirror:true,footprint:{x0:150,x1:290,width:140},doll:'little'}
  };
  let ITEMS=new Map(),ORDER=[];
  function setItems(list){
    ITEMS=new Map();ORDER=[];
    for(const it of Array.isArray(list)?list:[]){
      if(!it||typeof it.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(it.id))continue;
      if(!['floor','wall','surface','rug'].includes(it.placement))continue;
      ITEMS.set(it.id,it);ORDER.push(it.id);
    }
    return ITEMS.size;
  }
  const item=id=>ITEMS.get(id)||DOLL_ITEMS[id]||null;
  const isDoll=id=>DOLLS.includes(id);
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const roomDef=id=>DECOR.rooms.find(r=>r.id===id)||null;
  const ROOM_IDS=DECOR.rooms.map(r=>r.id);
  const price=id=>Object.hasOwn(DECOR.prices,id)?DECOR.prices[id]:0;

  /* ---------- geometry ---------- */
  const depthT=y=>clamp((y-ROOM.back.y1)/(ROOM.frame.b-ROOM.back.y1),0,1);
  function floorEdges(y){const t=depthT(y);return [ROOM.back.x0-120*t,ROOM.back.x1+120*t]}
  /* further back = smaller: 0.91 at the back wall, 1.09 at the front edge */
  const depthScale=y=>(1236+240*depthT(y))/1356;
  function wallZone(roomId){return roomDef(roomId)?.outdoor?WALL_OUT:WALL}
  /* The y that sets a piece's size and depth: its own floor point, or its host's for a piece on a tabletop. */
  const baseY=p=>p.host?p.host.y:p.y;
  function scaleOf(p){
    const it=item(p.id);if(!it)return 1;
    return it.defaultScale*p.s*(it.placement==='wall'?1:depthScale(baseY(p)));
  }
  /* Bounding box in room coordinates. */
  function box(p){
    const it=item(p.id),k=scaleOf(p),w=it.width*k,h=it.height*k;
    const ax=p.f?1-it.anchor[0]:it.anchor[0];
    const x=p.x-ax*w,y=p.y-it.anchor[1]*h;
    return {x,y,w,h,r:x+w,b:y+h};
  }
  const hits=(a,b)=>a.x<b.r&&b.x<a.r&&a.y<b.b&&b.y<a.b;
  function surfaceOf(host){
    const s=DECOR.surfaces[host.id];if(!s||host.host)return null;
    const b=box(host),[fy,fx0,fx1]=s;
    // a flipped host mirrors its usable width
    const x0=host.f?b.x+(1-fx1)*b.w:b.x+fx0*b.w,x1=host.f?b.x+(1-fx0)*b.w:b.x+fx1*b.w;
    return {y:b.y+fy*b.h,x0,x1,host};
  }

  /* How far above its front contact a standing piece's rear feet are, in room pixels. */
  function groundDepth(p){
    const it=item(p.id);if(!it||it.placement==='wall'||it.placement==='rug')return 0;
    const g=Object.hasOwn(DECOR.ground,p.id)?DECOR.ground[p.id]:.1;
    return g*it.height*scaleOf(p);
  }
  /* Where a piece touches what it stands on: front y (its anchor), rear y, and the left and right
     contact x (the manifest footprint band, mirrored with the piece). Rugs: their whole outline. */
  function footprint(p){
    const it=item(p.id),b=box(p),k=scaleOf(p);
    if(it.placement==='rug')return {front:b.b-b.h*.06,rear:b.y+b.h*.06,l:b.x+b.w*.04,r:b.r-b.w*.04};
    const fp=it.footprint||{},x0=Number.isFinite(fp.x0)?fp.x0:it.width*.1,x1=Number.isFinite(fp.x1)?fp.x1:it.width*.9;
    const l=p.f?b.r-x1*k:b.x+x0*k,r=p.f?b.r-x0*k:b.x+x1*k;
    return {front:p.y,rear:p.y-groundDepth(p),l,r};
  }
  /* Keep a piece where its kind belongs, and on screen. Mutates and returns p. */
  function constrain(p,roomId){
    const it=item(p.id);if(!it)return p;
    p.s=clamp(Number.isFinite(p.s)?p.s:1,SCALE.min,SCALE.max);
    if(!it.mirror)p.f=false;
    if(it.placement==='wall'){
      const z=wallZone(roomId);
      // a piece taller or wider than the wall is made to fit (the patio's garden wall is low)
      const fit=Math.min((z.y1-z.y0)/(it.height*it.defaultScale),(z.x1-z.x0)/(it.width*it.defaultScale));
      if(p.s>fit)p.s=Math.floor(fit*100)/100;
      const k=scaleOf(p),w=it.width*k,h=it.height*k;
      const ax=p.f?1-it.anchor[0]:it.anchor[0],ay=it.anchor[1];
      p.x=w>=z.x1-z.x0?(z.x0+z.x1)/2-(.5-ax)*w:clamp(p.x,z.x0+ax*w,z.x1-(1-ax)*w);
      p.y=h>=z.y1-z.y0?z.y0+ay*h:clamp(p.y,z.y0+ay*h,z.y1-(1-ay)*h);
      p.host=null;return p;
    }
    if(p.host&&it.placement!=='surface')p.host=null;
    if(p.host){
      const s=surfaceOf(p.host);
      if(s){p.y=s.y;p.x=clamp(p.x,s.x0,s.x1);return p}
      p.host=null;
    }
    if(it.placement==='rug'){
      // the whole rug lies on the floor: its far edge below the wall line, its near edge before the front edge
      const ay=it.anchor[1];let y=Number.isFinite(p.y)?p.y:RUG.y0;
      for(let i=0;i<3;i++){p.y=y;const h=it.height*scaleOf(p);y=clamp(y,ROOM.back.y1+6+ay*h,Math.max(ROOM.back.y1+6+ay*h,ROOM.frame.b-6-(1-ay)*h))}
      p.y=y;const b=box(p),[l,r]=floorEdges(b.y+b.h*.06),inset=b.w*.04;
      const lo=l+4-(b.x+inset-p.x),hi=r-4-(b.r-inset-p.x);
      p.x=lo<=hi?clamp(Number.isFinite(p.x)?p.x:(lo+hi)/2,lo,hi):(l+r)/2;
      return p;
    }
    // standing pieces: the whole footprint (front contact to rear feet, left to right foot) is on the floor
    let y=clamp(Number.isFinite(p.y)?p.y:FLOOR.y0,FLOOR.y0,FLOOR.y1);
    for(let i=0;i<8;i++){p.y=y;const n=clamp(Math.max(y,ROOM.back.y1+3+groundDepth(p)),FLOOR.y0,FLOOR.y1);if(Math.abs(n-y)<1e-3){y=n;break}y=n}
    p.y=y;
    const f=footprint(p),[l,r]=floorEdges(f.rear);
    const lo=l+4-(f.l-p.x),hi=r-4-(f.r-p.x);
    p.x=lo<=hi?clamp(Number.isFinite(p.x)?p.x:(lo+hi)/2,lo,hi):(l+r)/2;
    return p;
  }
  /* The tabletop under a point (a surface piece being dragged), topmost first; null if none. */
  function hostAt(x,y,pieces,self){
    const order=sortPieces(pieces).reverse();
    for(const q of order){
      if(q===self||q.host||!DECOR.surfaces[q.id])continue;
      const s=surfaceOf(q);if(!s)continue;
      if(x>=s.x0-8&&x<=s.x1+8&&y>=s.y-70&&y<=s.y+40)return q;
    }
    return null;
  }

  /* ---------- depth order ---------- */
  const layer=p=>{const pl=item(p.id)?.placement;return pl==='wall'?0:pl==='rug'?1:2};
  /* Wall pieces first, then rugs, then everything standing, back to front. `z` (bring forward /
     send back) lifts a piece above its depth neighbours; a piece on a tabletop draws just after its host. */
  function sortKey(p,i){
    if(p.host)return sortKey(p.host,0)+.01+(p.z+Z_MAX)*1e-4;
    const L=layer(p);
    return L*1e7+(p.z||0)*2e4+(L===0?i:p.y)+i*1e-6;
  }
  function sortPieces(pieces){
    return pieces.map((p,i)=>[sortKey(p,i),p]).sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
  }
  /* Bring forward (dir 1) or send back (dir -1) past the next overlapping piece in the same layer.
     Returns false when nothing overlaps in that direction. */
  function reorder(p,pieces,dir){
    const same=q=>q!==p&&layer(q)===layer(p)&&!!q.host===!!p.host&&q!==p.host&&q.host!==p;
    const order=sortPieces(pieces),i=order.indexOf(p),b=box(p);
    const other=(dir>0?order.slice(i+1):order.slice(0,i).reverse()).find(q=>same(q)&&hits(box(q),b));
    if(!other)return false;
    const before=p.z;
    for(let guard=0;guard<=2*Z_MAX;guard++){
      const o=sortPieces(pieces);
      if(Math.sign(o.indexOf(p)-o.indexOf(other))===dir)break;
      const next=clamp(p.z+dir,-Z_MAX,Z_MAX);if(next===p.z)break;p.z=next;
    }
    return p.z!==before;
  }

  /* ---------- save format ----------
     state.house = {v:1, at:<room id>, rooms:{<room id>:{w:<wall>, f:<floor>, b?:<backdrop>, p:[piece…]}},
                    owned:[<paid piece ids bought>], done:[<rooms rewarded as furnished>], goals:[<goal ids paid>]}
     piece = [id, x, y, scale %, flip 0|1, z?, host index?] (x, y whole room pixels; z and host only when set) */
  const ID=/^[a-z0-9@-]{1,40}$/;
  const num=(v,a,b,d)=>Number.isFinite(v)?clamp(Math.round(v),a,b):d;
  function emptyRoom(id){const r=roomDef(id);return {w:r.walls[0],f:r.floors[0],p:[]}}
  /* Raw saved room -> runtime pieces (validated, capped, constrained). `owns(id)` says whether a paid piece is bought. */
  function readPieces(list,roomId,owns=()=>false){
    const out=[],hostIx=[];let furniture=0;const dolls=new Set();
    for(const e of Array.isArray(list)?list.slice(0,DECOR.cap+DOLLS.length+20):[]){
      if(!Array.isArray(e)||typeof e[0]!=='string'||!ID.test(e[0]))continue;
      const id=e[0],it=item(id);if(!it)continue;
      if(isDoll(id)){if(dolls.has(id))continue;dolls.add(id)}
      else{if(furniture>=DECOR.cap)continue;if(price(id)&&!owns(id))continue;furniture++}
      out.push({id,x:num(e[1],0,ROOM.W,768),y:num(e[2],0,ROOM.H,900),s:num(e[3],SCALE.min*100,SCALE.max*100,100)/100,f:e[4]===1&&!!it.mirror,z:num(e[5],-Z_MAX,Z_MAX,0),host:null,trial:false});
      hostIx.push(Number.isInteger(e[6])?e[6]:-1);
    }
    // hosts: a surface piece may rest on a piece with a tabletop (not on another resting piece)
    out.forEach((p,i)=>{
      const h=hostIx[i],q=out[h];
      if(item(p.id).placement==='surface'&&q&&q!==p&&DECOR.surfaces[q.id]&&hostIx[h]<0)p.host=q;
    });
    out.forEach(p=>{if(!p.host)constrain(p,roomId)});
    out.forEach(p=>{if(p.host)constrain(p,roomId)});
    return settle(out,roomId);
  }
  /* Whole-pixel positions (as saved), with resting pieces re-seated on their rounded hosts, so a save
     reads back exactly. */
  function settle(pieces,roomId){
    for(const p of pieces)if(!p.host){p.x=Math.round(p.x);p.y=Math.round(p.y)}
    for(const p of pieces)if(p.host){constrain(p,roomId);p.x=Math.round(p.x)}
    return pieces;
  }
  function writePieces(pieces){
    const kept=pieces.filter(p=>!p.trial);
    return kept.map(p=>{
      const e=[p.id,Math.round(p.x),Math.round(p.y),Math.round(p.s*100),p.f?1:0];
      const h=p.host?kept.indexOf(p.host):-1;
      if(p.z||h>=0)e.push(p.z||0);
      if(h>=0)e.push(h);
      return e;
    });
  }
  /* Validate a whole saved house (anything unexpected falls back to an empty, default room). */
  function readHouse(raw){
    const src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    const listOf=(v,ok)=>Array.isArray(v)?[...new Set(v.filter(x=>typeof x==='string'&&ok(x)))]:[];
    const owned=listOf(src.owned,id=>price(id)>0);
    const house={v:1,at:ROOM_IDS.includes(src.at)?src.at:ROOM_IDS[0],rooms:{},owned,
      done:listOf(src.done,id=>ROOM_IDS.includes(id)),goals:listOf(src.goals,id=>DECOR.goals.some(g=>g.id===id))};
    const rooms=src.rooms&&typeof src.rooms==='object'&&!Array.isArray(src.rooms)?src.rooms:{};
    for(const r of DECOR.rooms){
      const s=rooms[r.id]&&typeof rooms[r.id]==='object'?rooms[r.id]:{};
      const room={w:r.walls.includes(s.w)?s.w:r.walls[0],f:r.floors.includes(s.f)?s.f:r.floors[0],p:[]};
      if(typeof s.b==='string'&&DECOR.backdrops.some(b=>b.room===r.id&&b.id===s.b))room.b=s.b;
      room.p=writePieces(readPieces(s.p,r.id,id=>owned.includes(id)));
      house.rooms[r.id]=room;
    }
    return house;
  }

  /* ---------- placing ---------- */
  /* A free spot for a new piece: the floor or wall position that overlaps least with what is there,
     preferring the back of the room for big furniture and the middle for small things. */
  function findSpot(id,pieces,roomId,rnd=Math.random){
    const it=item(id);const p={id,x:768,y:880,s:1,f:false,z:0,host:null};
    if(!it)return p;
    const others=pieces.filter(q=>q!==p);
    const cost=c=>{constrain(c,roomId);const b=box(c);let o=0;
      for(const q of others){if(layer(q)!==layer(c)&&!(it.placement==='wall'&&layer(q)===2))continue;const a=box(q);
        const w=Math.max(0,Math.min(a.r,b.r)-Math.max(a.x,b.x)),h=Math.max(0,Math.min(a.b,b.b)-Math.max(a.y,b.y));
        const depthNear=layer(c)===2?Math.max(0,1-Math.abs(baseY(q)-c.y)/220):1;o+=w*h*(layer(q)===layer(c)?1:.35)*depthNear}
      return o/(b.w*b.h);
    };
    const cands=[];
    if(it.placement==='wall'){const z=wallZone(roomId);for(const v of [.32,.5,.2])for(let u=.08;u<=.92;u+=.12)cands.push({x:z.x0+u*(z.x1-z.x0),y:z.y0+v*(z.y1-z.y0)})}
    else{
      const tall=it.height*it.defaultScale;
      const rows=it.placement==='rug'?[.52,.62,.4,.75]:tall>170?[.03,.12,.3,.5,.7]:[.45,.6,.3,.75,.12];
      for(const t of rows)for(let u=.12;u<=.88;u+=.08){const y=ROOM.back.y1+t*468,[l,r]=floorEdges(y);cands.push({x:l+u*(r-l),y})}
    }
    let best=null,bestCost=Infinity;
    // rugs like the middle of the room; everything else only mildly prefers earlier (back) rows
    const centre=c=>it.placement==='rug'?Math.abs(c.x-ROOM.W/2)/ROOM.W*.6:0;
    cands.forEach((c,i)=>{const q={...p,x:c.x,y:c.y};const k=cost(q)+centre(c)+i*.0015+rnd()*.002;if(k<bestCost){bestCost=k;best=q}});
    return constrain(best||p,roomId);
  }

  /* ---------- goals and rewards ---------- */
  function isFurnished(roomId,pieces){
    const r=roomDef(roomId),real=pieces.filter(p=>!isDoll(p.id)&&!p.trial);
    return real.length>=DECOR.furnished.pieces&&real.filter(p=>item(p.id)?.room===r.own).length>=DECOR.furnished.own;
  }
  /* Goal ids the house meets now (photo is paid when a photo is taken). `rooms` = {id: {w, f, pieces}}. */
  function goalsMet(rooms){
    const met=new Set();
    for(const [id,r] of Object.entries(rooms)){
      const def=roomDef(id);if(!def)continue;
      const ps=(r.pieces||[]).filter(p=>!p.trial);
      if(ps.some(p=>DECOR.beds.includes(p.id)))met.add('bed');
      if(ps.some(p=>item(p.id)?.placement==='wall'))met.add('wall');
      if(ps.some(p=>item(p.id)?.placement==='rug'))met.add('rug');
      if(ps.some(p=>p.host))met.add('top');
      if(ps.some(p=>isDoll(p.id)))met.add('friend');
      if(r.w!==def.walls[0]||r.f!==def.floors[0]||r.b)met.add('paint');
    }
    return met;
  }

  /* The x-range where a standing piece touches the floor (its manifest footprint, centred on its floor point). */
  function footprintRange(p){const fw=(item(p.id).footprint?.width||item(p.id).width)*scaleOf(p);return [p.x-fw/2,p.x+fw/2]}
  /* ---------- Surprise me ---------- */
  function shuffle(a,rnd){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  /* A tasteful layout for a room from owned pieces: clusters along the back wall, an arrangement in the
     middle, a couple of small things at the front corners, a few things on the wall and on tabletops.
     Returns runtime pieces; never more than the cap, never overlapping much at the same depth. */
  function surprise(roomId,owns,rnd=Math.random){
    const R=DECOR.recipes[roomId],out=[];if(!R)return out;
    const ok=id=>item(id)&&!isDoll(id)&&(!price(id)||owns(id));
    const choose=list=>shuffle(list,rnd).find(id=>ok(id)&&!out.some(p=>p.id===id&&item(id).placement!=='floor'));
    const used=new Set();
    const pickFresh=(list,allowRepeat)=>{const ids=shuffle(list,rnd).filter(ok);return ids.find(id=>!used.has(id))||(allowRepeat?ids[0]:undefined)};
    const flipFor=it=>it.mirror&&rnd()<.5;
    const mk=(id,x,y,extra={})=>({id,x,y,s:1,f:false,z:0,host:null,trial:false,...extra});
    /* back row */
    const backY=()=>ROOM.back.y1+16+rnd()*14;
    const clusters=[];
    for(const cl of R.back){
      const row=[];
      for(const slot of cl){
        if(slot.p!==undefined&&rnd()>slot.p)continue;
        const id=pickFresh(slot.pick,false);if(!id)continue;
        used.add(id);row.push({id,slot});
      }
      if(row.length)clusters.push(row);
    }
    // the first cluster is the room's centrepiece; the others are shuffled around it
    const order=clusters.length?[clusters[0],...shuffle(clusters.slice(1),rnd)]:[];
    const y0=ROOM.back.y1+22,[l0,r0]=floorEdges(y0),avail=r0-l0-40;
    const widthOf=id=>{const it=item(id);return it.footprint.width*it.defaultScale*depthScale(y0)+10};
    let rows=order.map(c=>c.map(e=>({...e,w:widthOf(e.id)})));
    const total=()=>rows.flat().reduce((s,e)=>s+e.w,0)+rows.length*30;
    // too wide: leave out optional clusters first (latest first), then the others
    const optional=row=>row.every(e=>e.slot.p!==undefined);
    while(rows.length>1&&total()>avail){const i=rows.map(optional).lastIndexOf(true);rows.splice(i>0?i:rows.length-1,1)}
    while(rows[0]&&rows[0].length>1&&total()>avail)rows[0].pop();
    // the centrepiece goes left, centre or right; the rest fill the remaining space in order
    const spare=Math.max(0,avail-total());
    const gaps=rows.map(()=>.3+rnd());const gsum=gaps.reduce((a,b)=>a+b,0)+.6;
    let x=l0+20+spare*(.3/gsum);
    const mirror=rnd()<.5;
    rows.forEach((row,ri)=>{
      row.forEach((e,ei)=>{
        const it=item(e.id),gap=ei&&e.slot.gap===0?-6:ei?8:0;x+=gap;
        const cx=x+e.w/2;x+=e.w;
        const p=mk(e.id,mirror?ROOM.W-cx:cx,backY(),{f:it.mirror?(mirror?rnd()<.75:rnd()<.25):false});
        out.push(constrain(p,roomId));
        if(e.slot.chair&&ok(e.slot.chair)){out.push(constrain(mk(e.slot.chair,p.x+(rnd()-.5)*40,p.y+70+rnd()*20,{f:item(e.slot.chair).mirror&&rnd()<.5}),roomId))}
      });
      x+=30+spare*(gaps[ri]/gsum);
    });
    /* middle arrangement */
    const mids=R.mid.filter(m=>m.some(s=>s.pick.some(ok)));
    const mid=mids.length?mids[Math.floor(rnd()*mids.length)]:[];
    const shift=(rnd()-.5)*.08,flipMid=rnd()<.5;
    for(const slot of mid){
      if(slot.p!==undefined&&rnd()>slot.p)continue;
      const id=shuffle(slot.pick,rnd).find(ok);if(!id)continue;
      const it=item(id),u=flipMid?1-slot.u:slot.u,y=ROOM.back.y1+slot.t*468,[l,r]=floorEdges(y);
      let f=it.mirror&&rnd()<.5;
      if(slot.face&&it.mirror)f=(flipMid?-slot.face:slot.face)<0; // seats turn toward the middle (art faces right)
      out.push(constrain(mk(id,l+(u+shift)*(r-l),y+(rnd()-.5)*16,{f}),roomId));
    }
    /* front corners: one or two small pieces */
    const fronts=shuffle(R.front.filter(ok),rnd).filter(id=>!out.some(p=>p.id===id)).slice(0,rnd()<.6?2:1);
    const corners=shuffle([.07,.93],rnd);
    fronts.forEach((id,i)=>{const y=ROOM.back.y1+(.8+rnd()*.12)*468,[l,r]=floorEdges(y);out.push(constrain(mk(id,l+corners[i]*(r-l),y,{f:flipFor(item(id))}),roomId))});
    /* drop anything that sits on top of an earlier piece at nearly the same depth */
    const kept=[];
    for(const p of out){
      const b=box(p);
      const clash=kept.some(q=>{if(layer(q)!==layer(p))return false;const a=box(q);
        const w=Math.min(a.r,b.r)-Math.max(a.x,b.x);if(w<=0)return false;
        if(layer(p)===1)return Math.min(a.b,b.b)>Math.max(a.y,b.y);
        if(Math.abs(q.y-p.y)>=55)return false;
        const [a0,a1]=footprintRange(q),[b0,b1]=footprintRange(p);
        return Math.min(a1,b1)-Math.max(a0,b0)>Math.min(a1-a0,b1-b0)*.3;});
      if(!clash)kept.push(p);
    }
    /* wall: two or three pieces where nothing tall stands in front */
    const z=wallZone(roomId),tall=kept.filter(p=>layer(p)===2&&p.y<ROOM.back.y1+140).map(box);
    const outdoor=!!roomDef(roomId).outdoor;
    const wallIds=shuffle(R.wall.filter(id=>ok(id)&&item(id).placement==='wall'),rnd).slice(0,2+(rnd()<.5?1:0));
    const wallBoxes=[];
    for(const id of wallIds){
      let placed=null;
      const us=shuffle([.12,.24,.36,.5,.64,.76,.88],rnd),vs=outdoor?[.04,.16,.3]:[.3,.42,.22,.5];
      outer:for(const v of vs)for(const u of us){
        const p=constrain(mk(id,z.x0+u*(z.x1-z.x0),z.y0+v*(z.y1-z.y0),{f:flipFor(item(id))}),roomId),b=box(p);
        if(tall.some(a=>a.x<b.r-10&&b.x<a.r-10&&a.y<b.b-30))continue;
        if(wallBoxes.some(a=>hits({x:a.x-30,y:a.y-30,r:a.r+30,b:a.b+30},b)))continue;
        placed=p;wallBoxes.push(b);break outer;
      }
      if(placed)kept.push(placed);
    }
    /* tabletops: one or two small pieces on whatever has a top */
    const hosts=shuffle(kept.filter(p=>DECOR.surfaces[p.id]),rnd);
    const tops=shuffle(R.top.filter(id=>ok(id)&&item(id).placement==='surface'),rnd);
    for(const host of hosts.slice(0,rnd()<.5?2:1)){
      const id=tops.shift();if(!id)break;
      const s=surfaceOf(host),it=item(id);
      const p=mk(id,s.x0+(s.x1-s.x0)*(.3+rnd()*.4),s.y,{host,f:flipFor(it)});
      // only if it fits the top comfortably
      if(it.footprint.width*scaleOf(p)<(s.x1-s.x0)*.95)kept.push(constrain(p,roomId));
    }
    return kept.slice(0,DECOR.cap);
  }

  return {ROOM,FLOOR,RUG,WALL,WALL_OUT,SCALE,DOLLS,DOLL_ITEMS,ROOM_IDS,
    setItems,item,isDoll,roomDef,price,get order(){return ORDER.slice()},
    depthT,depthScale,floorEdges,wallZone,scaleOf,box,hits,footprintRange,footprint,groundDepth,SKIRT,surfaceOf,constrain,hostAt,layer,sortPieces,reorder,
    emptyRoom,readPieces,writePieces,settle,readHouse,findSpot,isFurnished,goalsMet,surprise};
})();
