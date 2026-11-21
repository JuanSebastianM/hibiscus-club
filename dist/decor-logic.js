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
   further back are drawn smaller (depthScale) and earlier (depth order by that point's y).
   A room with a painted backdrop (DECOR.backdrops, measured by art/measure_rooms.py) has its own
   geometry instead: its floor quadrilateral, vanishing point and scale, its wall zones and the
   window/door openings on them. Everything that depends on geometry takes a `where` argument:
   a backdrop id for a painted room, a room id (or nothing) for the procedural one. */
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
  /* A geometry: the back floor line and corners, the front edge and its corners, the scale at the
     back and at the front (pieces scale linearly with their floor y between the two, which is exact
     in one-point perspective), the wall zones and the openings on them, the floor kept clear in
     front of doors, and which way the light falls. The procedural room is one fixed geometry. */
  const PROC={painted:false,back:ROOM.back,front:ROOM.frame.b,fl:ROOM.frame.l,fr:ROOM.frame.r,sB:1236/1356,sF:1476/1356,wallK:1,rugK:1,rugEdge:ROOM.frame.b-6,
    floor:FLOOR,rug:RUG,zones:[WALL],openings:[],clear:[],light:.04,skirt:SKIRT,xmin:-Infinity,xmax:Infinity,outdoor:false};
  const PROC_OUT={...PROC,zones:[WALL_OUT],outdoor:true};
  const geos=new Map();
  const backdrop=id=>typeof id==='string'&&DECOR.backdrops.find(b=>b.id===id)||null;
  /* a room's painted schemes, and the one a room that was never decorated starts with */
  const schemes=roomId=>DECOR.backdrops.filter(b=>b.room===roomId);
  const defaultScheme=roomId=>schemes(roomId)[0]?.id||null;
  function geo(where){
    if(geos.has(where))return geos.get(where);
    const b=backdrop(where);let g;
    if(!b)g=roomDef(where)?.outdoor?PROC_OUT:PROC;
    else{
      const [bl,br,fr,fl]=b.floor,yb=bl[1],front=fr[1],vy=b.vp[1];
      g={painted:true,id:b.id,back:{x0:bl[0],x1:br[0],y1:yb},front,fl:fl[0],fr:fr[0],vp:b.vp,
        // (toward the viewer pieces grow with the floor, but no more than 1.5 times: the paintings are
        // wide-angle, and full perspective growth makes front pieces look blown up)
        sB:b.scale,sF:b.scale*Math.min(1.5,(front-vy)/(yb-vy)),wallK:b.scale,
        // rugs lie flatter on these floors, seen from lower down than the procedural room's
        rugK:clamp((front-yb)/468*1.15,.45,1),
        // a margin before the front edge, so nothing is cut off by the picture's bottom
        floor:{y0:yb+4,y1:front-24},rug:{y0:yb+6,y1:front-30},rugEdge:front-30,
        zones:b.wall.map(z=>({x0:z[0],y0:z[1],x1:z[2],y1:z[3],hang:z[4]==='hang'})),
        openings:b.openings.map(o=>({x0:o[0],y0:o[1],x1:o[2],y1:o[3],kind:o[4]})),
        clear:b.clear.map(c=>({x0:c[0],y0:c[1],x1:c[2],y1:c[3]})),
        light:Number.isFinite(b.light)?b.light:.04,skirt:b.skirt||0,xmin:6,xmax:ROOM.W-6,outdoor:!!b.outdoor};
    }
    geos.set(where,g);return g;
  }
  /* The room a place belongs to (a backdrop id names its room). */
  const roomOf=where=>backdrop(where)?.room||where;
  const depthT=(y,w)=>{const g=geo(w);return clamp((y-g.back.y1)/(g.front-g.back.y1),0,1)};
  function floorEdges(y,w){const g=geo(w),t=depthT(y,w);return [Math.max(g.xmin,g.back.x0+(g.fl-g.back.x0)*t),Math.min(g.xmax,g.back.x1+(g.fr-g.back.x1)*t)]}
  /* further back = smaller: in the procedural room 0.91 at the back wall, 1.09 at the front edge */
  const depthScale=(y,w)=>{const g=geo(w);return g.sB+(g.sF-g.sB)*depthT(y,w)};
  /* The wall band: the bounding box of the zones that take any wall piece. */
  function wallZone(w){
    const zs=geo(w).zones.filter(z=>!z.hang);if(zs.length===1)return zs[0];
    return {x0:Math.min(...zs.map(z=>z.x0)),y0:Math.min(...zs.map(z=>z.y0)),x1:Math.max(...zs.map(z=>z.x1)),y1:Math.max(...zs.map(z=>z.y1))};
  }
  /* The y that sets a piece's size and depth: its own floor point, or its host's for a piece on a tabletop. */
  const baseY=p=>p.host?p.host.y:p.y;
  function scaleOf(p,w){
    const it=item(p.id);if(!it)return 1;
    return it.defaultScale*p.s*(it.placement==='wall'?geo(w).wallK:depthScale(baseY(p),w));
  }
  /* Bounding box in room coordinates. */
  function box(p,w){
    const it=item(p.id),k=scaleOf(p,w),wd=it.width*k,h=it.height*k*(it.placement==='rug'?geo(w).rugK:1);
    const ax=p.f?1-it.anchor[0]:it.anchor[0];
    const x=p.x-ax*wd,y=p.y-it.anchor[1]*h;
    return {x,y,w:wd,h,r:x+wd,b:y+h};
  }
  const hits=(a,b)=>a.x<b.r&&b.x<a.r&&a.y<b.b&&b.y<a.b;
  function surfaceOf(host,w){
    const s=DECOR.surfaces[host.id];if(!s||host.host)return null;
    const b=box(host,w),[fy,fx0,fx1]=s;
    // a flipped host mirrors its usable width
    const x0=host.f?b.x+(1-fx1)*b.w:b.x+fx0*b.w,x1=host.f?b.x+(1-fx0)*b.w:b.x+fx1*b.w;
    return {y:b.y+fy*b.h,x0,x1,host};
  }

  /* How far above its front contact a standing piece's rear feet are, in room pixels. */
  function groundDepth(p,w){
    const it=item(p.id);if(!it||it.placement==='wall'||it.placement==='rug')return 0;
    const g=Object.hasOwn(DECOR.ground,p.id)?DECOR.ground[p.id]:.1;
    return g*it.height*scaleOf(p,w);
  }
  /* Where a piece touches what it stands on: front y (its anchor), rear y, and the left and right
     contact x (the manifest footprint band, mirrored with the piece). Rugs: their whole outline. */
  function footprint(p,w){
    const it=item(p.id),b=box(p,w),k=scaleOf(p,w);
    if(it.placement==='rug')return {front:b.b-b.h*.06,rear:b.y+b.h*.06,l:b.x+b.w*.04,r:b.r-b.w*.04};
    const fp=it.footprint||{},x0=Number.isFinite(fp.x0)?fp.x0:it.width*.1,x1=Number.isFinite(fp.x1)?fp.x1:it.width*.9;
    const l=p.f?b.r-x1*k:b.x+x0*k,r=p.f?b.r-x0*k:b.x+x1*k;
    return {front:p.y,rear:p.y-groundDepth(p,w),l,r};
  }
  /* Wall pieces in a painted room: inside one of its wall zones (a hanging piece may instead hang
     from a "hang" zone, such as a pergola beam: its top there, the rest below, above the floor),
     off the windows and doors unless the piece belongs over them (DECOR.overOpenings), as near as
     possible to where it was put, and shrunk only when no zone is big enough. */
  function placeWallPainted(p,it,g){
    const ax=p.f?1-it.anchor[0]:it.anchor[0],ay=it.anchor[1],k0=it.defaultScale*g.wallK;
    const over=DECOR.overOpenings[p.id]||[],hanger=DECOR.hangers.includes(p.id);
    const blocks=g.openings.filter(o=>!over.includes(o.kind));
    const x0=Number.isFinite(p.x)?p.x:ROOM.W/2,y0=Number.isFinite(p.y)?p.y:wallZone(g.id).y0,s0=p.s;
    const floorTop=g.back.y1-g.skirt-4;
    let best=null;
    // covering an opening costs far more than moving; a decor window over a painted one is never chosen
    // while any other place or size (down to the smallest) avoids it
    const strict=DECOR.decorWindows.includes(p.id),wOver=strict?1e6:50;
    for(const z of g.zones){
      if(z.hang&&!hanger)continue;
      const zh=z.hang?floorTop-z.y0:z.y1-z.y0;
      const fit=Math.min(zh/(it.height*k0),(z.x1-z.x0)/(it.width*k0));
      const s1=s0>fit?Math.floor(fit*100)/100:s0;
      for(const s of [s1,...[.85,.7,.55].map(f=>Math.round(s1*f*100)/100).filter(v=>v>=SCALE.min),...(s1>SCALE.min?[SCALE.min]:[])]){
        const wd=it.width*k0*s,h=it.height*k0*s;
        const lo={x:z.x0+ax*wd,y:z.y0+ay*h},hi={x:z.x1-(1-ax)*wd,y:z.hang?Math.min(z.y1+ay*h,floorTop-(1-ay)*h):z.y1-(1-ay)*h};
        const fitIn=(x,y)=>({x:hi.x<lo.x?(z.x0+z.x1)/2-(.5-ax)*wd:clamp(x,lo.x,hi.x),y:hi.y<lo.y?lo.y:clamp(y,lo.y,hi.y)});
        const overlap=c=>{const x=c.x-ax*wd,y=c.y-ay*h;let o=0;
          for(const q of blocks){const ow=Math.min(x+wd,q.x1)-Math.max(x,q.x0),oh=Math.min(y+h,q.y1)-Math.max(y,q.y0);if(ow>0&&oh>0)o+=ow*oh}return o};
        const xs=[x0],ys=[y0];
        for(const q of blocks){xs.push(q.x0-6-(1-ax)*wd,q.x1+6+ax*wd);ys.push(q.y0-6-(1-ay)*h,q.y1+6+ay*h)}
        for(const cx of xs)for(const cy of ys){
          const c=fitIn(cx,cy),cost=Math.hypot(c.x-x0,c.y-y0)+(s0-s)*4000+overlap(c)*wOver;
          if(!best||cost<best.cost-1e-9)best={cost,x:c.x,y:c.y,s};
        }
      }
    }
    if(best){p.x=best.x;p.y=best.y;p.s=best.s}
    return p;
  }
  /* ...settled: placed again from where it landed until it stays put, so placing is idempotent. */
  function placeWall(p,it,g){
    for(let i=0;i<6;i++){const x=p.x,y=p.y,s=p.s;placeWallPainted(p,it,g);if(Math.abs(p.x-x)<1e-6&&Math.abs(p.y-y)<1e-6&&p.s===s)break}
    return p;
  }
  /* Keep a piece where its kind belongs, and on screen. Mutates and returns p. */
  function constrain(p,w){
    const it=item(p.id);if(!it)return p;
    const g=geo(w);
    p.s=clamp(Number.isFinite(p.s)?p.s:1,SCALE.min,SCALE.max);
    if(!it.mirror)p.f=false;
    if(it.placement==='wall'){
      p.host=null;
      if(g.painted)return placeWall(p,it,g);
      const z=g.zones[0];
      // a piece taller or wider than the wall is made to fit (the patio's garden wall is low)
      const fit=Math.min((z.y1-z.y0)/(it.height*it.defaultScale),(z.x1-z.x0)/(it.width*it.defaultScale));
      if(p.s>fit)p.s=Math.floor(fit*100)/100;
      const k=scaleOf(p,w),wd=it.width*k,h=it.height*k;
      const ax=p.f?1-it.anchor[0]:it.anchor[0],ay=it.anchor[1];
      p.x=wd>=z.x1-z.x0?(z.x0+z.x1)/2-(.5-ax)*wd:clamp(p.x,z.x0+ax*wd,z.x1-(1-ax)*wd);
      p.y=h>=z.y1-z.y0?z.y0+ay*h:clamp(p.y,z.y0+ay*h,z.y1-(1-ay)*h);
      return p;
    }
    if(p.host&&it.placement!=='surface')p.host=null;
    if(p.host){
      const s=surfaceOf(p.host,w);
      if(s){p.y=s.y;p.x=clamp(p.x,s.x0,s.x1);return p}
      p.host=null;
    }
    const yb=g.back.y1;
    if(it.placement==='rug'){
      // the whole rug lies on the floor: its far edge below the wall line, its near edge before the front edge
      const ay=it.anchor[1];let y=Number.isFinite(p.y)?p.y:g.rug.y0;
      // (a rug deeper than the floor is made smaller; its size changes with its depth, so iterate)
      for(let i=0;i<4;i++){p.y=(yb+g.front)/2;const h=box(p,w).h;if(h<=g.rugEdge-yb-14)break;p.s=Math.max(SCALE.min,Math.floor(p.s*(g.rugEdge-yb-14)/h*100)/100)}
      for(let i=0;i<30;i++){p.y=y;const h=box(p,w).h,n=clamp(y,yb+6+ay*h,Math.max(yb+6+ay*h,g.rugEdge-(1-ay)*h));if(Math.abs(n-y)<1e-4)break;y=n}
      p.y=y;const b=box(p,w),[l,r]=floorEdges(b.y+b.h*.06,w),inset=b.w*.04;
      const lo=l+4-(b.x+inset-p.x),hi=r-4-(b.r-inset-p.x);
      p.x=lo<=hi?clamp(Number.isFinite(p.x)?p.x:(lo+hi)/2,lo,hi):(l+r)/2;
      return p;
    }
    // standing pieces: the whole footprint (front contact to rear feet, left to right foot) is on the floor
    const F=g.floor;
    let y=clamp(Number.isFinite(p.y)?p.y:F.y0,F.y0,F.y1);
    // a piece deeper than the floor (a big canopy bed in a shallow painted room) is made smaller
    for(let i=0;i<4;i++){p.y=F.y1;const d=groundDepth(p,w);if(F.y1-d>=yb+3||p.s<=SCALE.min)break;p.s=Math.max(SCALE.min,Math.floor(p.s*(F.y1-yb-4)/d*100)/100)}
    for(let i=0;i<30;i++){p.y=y;const n=clamp(Math.max(y,yb+3+groundDepth(p,w)),F.y0,F.y1);if(Math.abs(n-y)<1e-4){y=n;break}y=n}
    p.y=y;
    const f=footprint(p,w),[l,r]=floorEdges(f.rear,w);
    const lo=l+4-(f.l-p.x),hi=r-4-(f.r-p.x);
    p.x=lo<=hi?clamp(Number.isFinite(p.x)?p.x:(lo+hi)/2,lo,hi):(l+r)/2;
    return p;
  }
  /* The tabletop under a point (a surface piece being dragged), topmost first; null if none. */
  function hostAt(x,y,pieces,self,w){
    const order=sortPieces(pieces).reverse();
    for(const q of order){
      if(q===self||q.host||!DECOR.surfaces[q.id])continue;
      const s=surfaceOf(q,w);if(!s)continue;
      if(x>=s.x0-8&&x<=s.x1+8&&y>=s.y-70&&y<=s.y+40)return q;
    }
    return null;
  }
  /* Moves a room's pieces from one geometry to another (a change of painted scheme, or between
     painted and procedural): a floor point keeps its place across and along the floor (as fractions
     of the floor's width and depth there), a wall piece its place on the wall band; then each is
     grounded in the new room, and pieces on tabletops follow their hosts. Never drops a piece.
     Mutates and returns `pieces`. */
  function regeo(pieces,from,to){
    const zf=wallZone(from),zt=wallZone(to),gt=geo(to);
    const across=new Map();
    for(const p of pieces)if(p.host){const s=surfaceOf(p.host,from);across.set(p,s?clamp((p.x-s.x0)/Math.max(1,s.x1-s.x0),0,1):.5)}
    for(const p of pieces){
      const it=item(p.id);if(!it||p.host)continue;
      if(it.placement==='wall'){
        const u=(p.x-zf.x0)/Math.max(1,zf.x1-zf.x0),v=(p.y-zf.y0)/Math.max(1,zf.y1-zf.y0);
        p.x=zt.x0+u*(zt.x1-zt.x0);p.y=zt.y0+v*(zt.y1-zt.y0);
      }else{
        const t=depthT(p.y,from),[l,r]=floorEdges(p.y,from),u=(p.x-l)/Math.max(1,r-l);
        const y=gt.back.y1+t*(gt.front-gt.back.y1),[l2,r2]=floorEdges(y,to);
        p.x=l2+u*(r2-l2);p.y=y;
      }
      constrain(p,to);
    }
    for(const p of pieces)if(p.host){const s=surfaceOf(p.host,to);if(s)p.x=s.x0+across.get(p)*(s.x1-s.x0);constrain(p,to)}
    return pieces;
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
  function reorder(p,pieces,dir,w){
    const same=q=>q!==p&&layer(q)===layer(p)&&!!q.host===!!p.host&&q!==p.host&&q.host!==p;
    const order=sortPieces(pieces),i=order.indexOf(p),b=box(p,w);
    const other=(dir>0?order.slice(i+1):order.slice(0,i).reverse()).find(q=>same(q)&&hits(box(q,w),b));
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
     state.house = {v:1, at:<room id>, rooms:{<room id>:{w:<wall>, f:<floor>, b?:<painted scheme id | ''>, p:[piece…]}},
                    owned:[<paid piece ids bought>], done:[<rooms rewarded as furnished>], goals:[<goal ids paid>]}
     piece = [id, x, y, scale %, flip 0|1, z?, host index?] (x, y whole room pixels; z and host only when set) */
  const ID=/^[a-z0-9@-]{1,40}$/;
  const num=(v,a,b,d)=>Number.isFinite(v)?clamp(Math.round(v),a,b):d;
  function emptyRoom(id){const r=roomDef(id),b=defaultScheme(id);return {w:r.walls[0],f:r.floors[0],...(b?{b}:{}),p:[]}}
  /* Raw saved room -> runtime pieces (validated, capped, constrained). `owns(id)` says whether a paid piece is bought. */
  function readPieces(list,where,owns=()=>false){
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
    out.forEach(p=>{if(!p.host)constrain(p,where)});
    out.forEach(p=>{if(p.host)constrain(p,where)});
    return settle(out,where);
  }
  /* Whole-pixel positions (as saved), with resting pieces re-seated on their rounded hosts, so a save
     reads back exactly. */
  function settle(pieces,where){
    for(const p of pieces)if(!p.host){p.x=Math.round(p.x);p.y=Math.round(p.y)}
    for(const p of pieces)if(p.host){constrain(p,where);p.x=Math.round(p.x)}
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
      const s=rooms[r.id]&&typeof rooms[r.id]==='object'&&!Array.isArray(rooms[r.id])?rooms[r.id]:{};
      const room={w:r.walls.includes(s.w)?s.w:r.walls[0],f:r.floors.includes(s.f)?s.f:r.floors[0],p:[]};
      // b: a painted scheme of this room; '' = the paint and floor were chosen over the painted schemes
      let b=s.b===''?'':typeof s.b==='string'&&schemes(r.id).some(x=>x.id===s.b)?s.b:null;
      const pieces=readPieces(s.p,b||r.id,id=>owned.includes(id));
      // a room never decorated (nothing in it, the starting paint and floor) starts painted
      if(b===null&&!pieces.length&&room.w===r.walls[0]&&room.f===r.floors[0])b=defaultScheme(r.id);
      if(b!==null)room.b=b;
      room.p=writePieces(pieces);
      house.rooms[r.id]=room;
    }
    return house;
  }

  /* ---------- placing ---------- */
  /* A free spot for a new piece: the floor or wall position that overlaps least with what is there,
     preferring the back of the room for big furniture and the middle for small things. */
  /* How much of a standing piece's footprint lies on floor kept clear (in front of a door), 0..1. */
  function inClear(p,w){
    const g=geo(w);if(!g.clear.length||layer(p)!==2||p.host)return 0;
    const f=footprint(p,w),fw=Math.max(1,f.r-f.l);let o=0;
    for(const c of g.clear){if(f.front<c.y0||f.rear>c.y1)continue;o=Math.max(o,Math.max(0,Math.min(f.r,c.x1)-Math.max(f.l,c.x0))/fw)}
    return o;
  }
  function findSpot(id,pieces,where,rnd=Math.random){
    const it=item(id);const p={id,x:768,y:880,s:1,f:false,z:0,host:null};
    if(!it)return p;
    const g=geo(where),depth=g.front-g.back.y1;
    const others=pieces.filter(q=>q!==p);
    const cost=c=>{constrain(c,where);const b=box(c,where);let o=0;
      for(const q of others){if(layer(q)!==layer(c)&&!(it.placement==='wall'&&layer(q)===2))continue;const a=box(q,where);
        const w=Math.max(0,Math.min(a.r,b.r)-Math.max(a.x,b.x)),h=Math.max(0,Math.min(a.b,b.b)-Math.max(a.y,b.y));
        // (a painted floor is shallow on screen: a piece further forward hides one behind it, so any overlap counts)
        const depthNear=layer(c)===2?Math.max(g.painted?.5:0,1-Math.abs(baseY(q)-c.y)/(depth*.47)):1;o+=w*h*(layer(q)===layer(c)?1:.35)*depthNear}
      return o/(b.w*b.h)+inClear(c,where)*.6;
    };
    const cands=[];
    if(it.placement==='wall'){for(const z of g.zones.filter(z=>!z.hang))for(const v of [.32,.5,.2])for(let u=.08;u<=.92;u+=.12)cands.push({x:z.x0+u*(z.x1-z.x0),y:z.y0+v*(z.y1-z.y0)})}
    else{
      const tall=it.height*it.defaultScale;
      const rows=it.placement==='rug'?[.52,.62,.4,.75]:tall>170?[.03,.12,.3,.5,.7]:[.45,.6,.3,.75,.12];
      for(const t of rows)for(let u=.12;u<=.88;u+=.08){const y=g.back.y1+t*depth,[l,r]=floorEdges(y,where);cands.push({x:l+u*(r-l),y})}
    }
    let best=null,bestCost=Infinity;
    // rugs like the middle of the room; everything else only mildly prefers earlier (back) rows
    const centre=c=>it.placement==='rug'?Math.abs(c.x-ROOM.W/2)/ROOM.W*.6:0;
    cands.forEach((c,i)=>{const q={...p,x:c.x,y:c.y};const k=cost(q)+centre(c)+i*.0015+rnd()*.002;if(k<bestCost){bestCost=k;best=q}});
    return constrain(best||p,where);
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
      // a new look: another painted scheme than the room starts with, or other paint or flooring
      if(r.b?r.b!==defaultScheme(id):r.w!==def.walls[0]||r.f!==def.floors[0])met.add('paint');
    }
    return met;
  }

  /* The x-range where a standing piece touches the floor (its manifest footprint, centred on its floor point). */
  function footprintRange(p,w){const fw=(item(p.id).footprint?.width||item(p.id).width)*scaleOf(p,w);return [p.x-fw/2,p.x+fw/2]}
  /* ---------- Surprise me ---------- */
  function shuffle(a,rnd){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  /* A tasteful layout for a room from owned pieces: clusters along the back wall, an arrangement in the
     middle, a couple of small things at the front corners, a few things on the wall and on tabletops.
     In a painted room the back row leaves the floor in front of a door free, and nothing stands in
     front of a side door. Returns runtime pieces; never more than the cap, never overlapping much at
     the same depth. `where` is the room id (procedural) or its painted scheme's id. */
  function surprise(where,owns,rnd=Math.random){
    const roomId=roomOf(where),g=geo(where),yb=g.back.y1,depth=g.front-yb,dk=depth/468;
    const R=DECOR.recipes[roomId],out=[];if(!R)return out;
    const ok=id=>item(id)&&!isDoll(id)&&(!price(id)||owns(id));
    const used=new Set(),floats=new Set();
    const pickFresh=(list,allowRepeat)=>{const ids=shuffle(list,rnd).filter(ok);return ids.find(id=>!used.has(id))||(allowRepeat?ids[0]:undefined)};
    const flipFor=it=>it.mirror&&rnd()<.5;
    const mk=(id,x,y,extra={})=>({id,x,y,s:1,f:false,z:0,host:null,trial:false,...extra});
    /* back row */
    const backY=()=>yb+(16+rnd()*14)*dk;
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
    const y0=yb+22*dk,[l0,r0]=floorEdges(y0,where),mid0=(l0+r0)/2;
    const widthOf=id=>{const it=item(id);return it.footprint.width*it.defaultScale*depthScale(y0,where)+10};
    const optional=row=>row.every(e=>e.slot.p!==undefined);
    const mirror=rnd()<.5;
    const placeRow=(row,x,flip=mirror)=>{
      row.forEach((e,ei)=>{
        const it=item(e.id),gap=ei&&e.slot.gap===0?-6:ei?8:0;x+=gap;
        const cx=x+e.w/2;x+=e.w;
        const p=mk(e.id,flip?2*mid0-cx:cx,backY(),{f:it.mirror?(mirror?rnd()<.75:rnd()<.25):false});
        out.push(constrain(p,where));
        if(e.slot.chair&&ok(e.slot.chair)){out.push(constrain(mk(e.slot.chair,p.x+(rnd()-.5)*40,p.y+(70+rnd()*20)*dk,{f:item(e.slot.chair).mirror&&rnd()<.5}),where))}
      });
      return x;
    };
    // the back wall's floor, less what lies in front of a door at the back wall
    const cut=(segs,a,b)=>{const next=[];for(const [s0,s1] of segs){if(b<=s0||a>=s1){next.push([s0,s1]);continue}if(a>s0)next.push([s0,a]);if(b<s1)next.push([b,s1])}return next};
    let segs=[[l0+20,r0-20]];
    for(const c of g.clear.filter(c=>c.y0<=yb+6))segs=cut(segs,c.x0-10,c.x1+10);
    let rows=order.map(c=>c.map(e=>({...e,w:widthOf(e.id)})));
    // in a painted room the furniture also stands beside a window (overlapping its frame a little)
    // rather than in front of it, when the room's centrepiece still fits beside one
    // (the stretch under the window stays open to the other, lower clusters)
    let under=[];
    if(g.painted){
      let soft=segs;const spans=[];
      for(const o of g.openings.filter(o=>o.kind==='window'&&o.y1>yb-260)){const k=(o.x1-o.x0)*.22;soft=cut(soft,o.x0+k,o.x1-k);spans.push([o.x0+k,o.x1-k,yb-o.y1+(o.y1-o.y0)*.2])}
      const need=rows[0]?rows[0].reduce((s,e)=>s+e.w,0)+30:0;
      if(soft.length>segs.length&&soft.some(([a,b])=>b-a>=need)){segs=soft;under=spans}
    }
    if(segs.length===1){
      const avail=segs[0][1]-segs[0][0];
      const total=()=>rows.flat().reduce((s,e)=>s+e.w,0)+rows.length*30;
      // too wide: leave out optional clusters first (latest first), then the others
      while(rows.length>1&&total()>avail){const i=rows.map(optional).lastIndexOf(true);rows.splice(i>0?i:rows.length-1,1)}
      while(rows[0]&&rows[0].length>1&&total()>avail)rows[0].pop();
      // the centrepiece goes left, centre or right; the rest fill the remaining space in order
      const spare=Math.max(0,avail-total());
      const gaps=rows.map(()=>.3+rnd());const gsum=gaps.reduce((a,b)=>a+b,0)+.6;
      let x=segs[0][0]+spare*(.3/gsum);
      rows.forEach((row,ri)=>{x=placeRow(row,x);x+=30+spare*(gaps[ri]/gsum)});
    }else{
      // a door in the back wall: each cluster goes where there is room for it, beside the door
      const room=[...shuffle(segs.map(([a,b])=>({a,b,rows:[],left:b-a})),rnd),...under.map(([a,b,maxH])=>({a,b,rows:[],left:b-a,under:true,maxH}))];
      const w=r=>r.reduce((s,e)=>s+e.w,0)+30;
      let floating=null;
      rows.forEach((row,ri)=>{
        // under a window only what is low enough to leave most of it showing
        const tallest=r=>Math.max(...r.map(e=>item(e.id).height*item(e.id).defaultScale*g.sB));
        const fit=r=>room.filter(s=>s.left>=w(r)&&!(s.under&&(ri===0||tallest(r)>s.maxH))).sort((a,b)=>(a.under-b.under)||b.left-a.left)[0];
        // a cluster too wide for the wall beside the door keeps only its main piece (the widest)
        const main=row.reduce((a,e)=>e.w>a.w?e:a,row[0]);
        let seg=fit(row);
        if(!seg&&row.length>1){row=[main];seg=fit(row)}
        if(seg){seg.rows.push(row);seg.left-=w(row)}
        else if(ri===0)floating=[main]; // the centrepiece does not fit beside the door
      });
      for(const s of room){
        if(!s.rows.length)continue;
        // a lone cluster leans toward the side wall, away from the door
        const gap=s.left/(s.rows.length+1);let x=s.a+(s.rows.length===1?(s.a<mid0?gap*.5:gap*1.5):gap);
        for(const row of s.rows){x=placeRow(row,x,false);x+=30+gap}
      }
      if(floating){
        // it stands out in the room instead, just in front of the floor kept clear before the door
        const c=g.clear.find(c=>c.y0<=yb+6),n=out.length;
        const fw=w(floating)-30,side=rnd()<.5?c.x0:c.x1;
        placeRow(floating,side-fw/2+(side===c.x0?-.3:.3)*fw,false);
        for(const p of out.slice(n)){const f=footprint(p,where);if(f.rear<c.y1+4){p.y+=c.y1+4-f.rear;constrain(p,where)}floats.add(p)}
      }
    }
    /* middle arrangement */
    const mids=R.mid.filter(m=>m.some(s=>s.pick.some(ok)));
    const mid=mids.length?mids[Math.floor(rnd()*mids.length)]:[];
    const shift=(rnd()-.5)*.08,flipMid=rnd()<.5;
    for(const slot of mid){
      if(slot.p!==undefined&&rnd()>slot.p)continue;
      const id=shuffle(slot.pick,rnd).find(ok);if(!id)continue;
      const it=item(id),u=flipMid?1-slot.u:slot.u,y=yb+slot.t*depth,[l,r]=floorEdges(y,where);
      let f=it.mirror&&rnd()<.5;
      if(slot.face&&it.mirror)f=(flipMid?-slot.face:slot.face)<0; // seats turn toward the middle (art faces right)
      out.push(constrain(mk(id,l+(u+shift)*(r-l),y+(rnd()-.5)*16*dk,{f}),where));
    }
    /* front corners: one or two small pieces (the other corner when one is in front of a side door) */
    // (a painted room, with its furniture at true size, has room for a third, in the middle)
    const fronts=shuffle(R.front.filter(ok),rnd).filter(id=>!out.some(p=>p.id===id)).slice(0,g.painted?(rnd()<.6?3:2):rnd()<.6?2:1);
    const corners=[...shuffle([.07,.93],rnd),.5+(rnd()-.5)*.3];
    fronts.forEach((id,i)=>{
      // (in a painted room, whose floor grows fast toward the viewer, a little further back)
      const y=yb+(g.painted?.56+rnd()*.14:.8+rnd()*.12)*depth,[l,r]=floorEdges(y,where),f=flipFor(item(id));
      let p=constrain(mk(id,l+corners[i]*(r-l),i===2?y+(g.front-y)*.45:y,{f}),where);
      // a corner in front of a side door: the other corner, or if that is taken, a little way in
      if(i<2&&inClear(p,where)>.2)p=constrain(mk(id,l+(fronts.length>1?(corners[i]<.5?.3:.7):corners[1-i])*(r-l),y,{f}),where);
      out.push(p);
    });
    /* drop anything that sits on top of an earlier piece at nearly the same depth, or blocks a door */
    const kept=[];
    for(const p of out){
      // a piece on the walkway to a back-wall door steps forward, just past it (or is left out)
      if(!floats.has(p)&&!p.host&&inClear(p,where)>.25){
        const c=g.clear.find(c=>c.y0<=yb+6&&footprint(p,where).rear<=c.y1);
        if(c){const f=footprint(p,where);p.y+=c.y1+6-f.rear;constrain(p,where)}
      }
      if(!floats.has(p)&&inClear(p,where)>.25)continue;
      const b=box(p,where);
      const clash=kept.some(q=>{if(layer(q)!==layer(p))return false;const a=box(q,where);
        const w=Math.min(a.r,b.r)-Math.max(a.x,b.x);if(w<=0)return false;
        if(layer(p)===1)return Math.min(a.b,b.b)>Math.max(a.y,b.y);
        if(Math.abs(q.y-p.y)>=55*Math.max(dk,.45))return false;
        const [a0,a1]=footprintRange(q,where),[b0,b1]=footprintRange(p,where);
        return Math.min(a1,b1)-Math.max(a0,b0)>Math.min(a1-a0,b1-b0)*.3;});
      if(!clash)kept.push(p);
    }
    /* wall: two or three pieces where nothing tall stands in front */
    const tall=kept.filter(p=>layer(p)===2&&p.y<yb+140*dk).map(p=>box(p,where));
    const noWin=g.painted&&g.openings.length>0; // the painting has its own windows and doors
    const wallIds=shuffle(R.wall.filter(id=>ok(id)&&item(id).placement==='wall'&&!(noWin&&DECOR.decorWindows.includes(id))),rnd).slice(0,g.painted?3:2+(rnd()<.5?1:0));
    const wallBoxes=[];
    for(const id of wallIds){
      let placed=null;
      const hanger=DECOR.hangers.includes(id);
      const zones=g.painted?g.zones.filter(z=>!z.hang||hanger):[g.zones[0]];
      const us=shuffle([.12,.24,.36,.5,.64,.76,.88],rnd),vs=g.outdoor&&!g.painted?[.04,.16,.3]:[.3,.42,.22,.5];
      outer:for(const z of shuffle(zones,rnd))for(const v of z.hang?[0]:vs)for(const u of us){
        const p=constrain(mk(id,z.x0+u*(z.x1-z.x0),z.y0+v*(z.y1-z.y0),{f:flipFor(item(id))}),where),b=box(p,where);
        if(g.painted&&p.s<.75)continue; // too small to read where it fits
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
      const s=surfaceOf(host,where),it=item(id);
      const p=mk(id,s.x0+(s.x1-s.x0)*(.3+rnd()*.4),s.y,{host,f:flipFor(it)});
      // only if it fits the top comfortably
      if(it.footprint.width*scaleOf(p,where)<(s.x1-s.x0)*.95)kept.push(constrain(p,where));
    }
    return kept.slice(0,DECOR.cap);
  }

  return {ROOM,FLOOR,RUG,WALL,WALL_OUT,SCALE,DOLLS,DOLL_ITEMS,ROOM_IDS,
    setItems,item,isDoll,roomDef,price,get order(){return ORDER.slice()},
    geo,backdrop,schemes,defaultScheme,roomOf,regeo,inClear,
    depthT,depthScale,floorEdges,wallZone,scaleOf,box,hits,footprintRange,footprint,groundDepth,SKIRT,surfaceOf,constrain,hostAt,layer,sortPieces,reorder,
    emptyRoom,readPieces,writePieces,settle,readHouse,findSpot,isFurnished,goalsMet,surprise};
})();
