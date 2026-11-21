/* Dream House: paints an empty room (back wall, side walls, floor, the dollhouse frame) in room
   coordinates (1536 x 1152, see decor-logic.js), procedurally in the game's pastels, or draws a
   painted backdrop picture instead when DECOR.backdrops lists one for the room and the player chose it.
   The perspective is gentle and one-point: lines along the room's depth meet far above the room
   (VP below), so the floor reads as seen from a little above, like looking into a dollhouse. */
const DecorPaint=(()=>{
  const {ROOM}=DecorLogic;
  const W=ROOM.W,H=ROOM.H,BX0=ROOM.back.x0,BX1=ROOM.back.x1,BY=ROOM.back.y1,FY=ROOM.frame.b,FL=ROOM.frame.l,FR=ROOM.frame.r;
  /* one-point perspective: screen y = YH + K / z with z = 1 at the floor's front edge and ZB at the back wall */
  const ZB=1.195,YH=-1760,K=2868,VX=768,DEPTH=556; // DEPTH: the room's depth in back-wall pixels
  const yAt=z=>YH+K/z;
  const xAt=(xFront,z)=>VX+(xFront-VX)/z;
  const ACCENT={bedroom:'#f29cc3',kitchen:'#8dd5ab',living:'#f5cf63',bathroom:'#94c6f0',playroom:'#c3a6f2',patio:'#7fd5cb'};
  function rng(seed){let s=seed%2147483647||1;return ()=>(s=s*16807%2147483647)/2147483647}
  function make(w,h){const c=document.createElement('canvas');c.width=Math.ceil(w);c.height=Math.ceil(h);return c}
  const shade=(hex,amt)=>{const n=parseInt(hex.slice(1),16);const f=v=>Math.max(0,Math.min(255,Math.round(amt<0?v*(1+amt):v+(255-v)*amt)));
    return '#'+[n>>16&255,n>>8&255,n&255].map(f).map(v=>v.toString(16).padStart(2,'0')).join('')};
  function poly(g,pts){g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath()}
  function flower(g,x,y,r,petal,center){
    g.fillStyle=petal;for(let i=0;i<5;i++){const a=i*Math.PI*2/5-Math.PI/2;g.beginPath();g.ellipse(x+Math.cos(a)*r*.62,y+Math.sin(a)*r*.62,r*.5,r*.38,a,0,Math.PI*2);g.fill()}
    g.fillStyle=center;g.beginPath();g.arc(x,y,r*.3,0,Math.PI*2);g.fill();
  }

  /* ---------- wall patterns (drawn flat, w x h, as seen on the back wall) ---------- */
  function wallPattern(id,w,h){
    const d=DECOR.walls[id]||DECOR.walls.blush,c=make(w,h),g=c.getContext('2d'),r=rng(7);
    g.fillStyle=d.base;g.fillRect(0,0,w,h);
    switch(d.kind){
      case 'stripes':{g.fillStyle=d.ink;for(let x=0;x<w;x+=d.width*2)g.fillRect(x,0,d.width,h);
        g.fillStyle='rgba(255,255,255,.55)';for(let x=d.width;x<w;x+=d.width*2)g.fillRect(x+d.width/2-1.5,0,3,h);break}
      case 'dots':{g.fillStyle=d.ink;for(let y=24,row=0;y<h+30;y+=52,row++)for(let x=(row%2)*36+18;x<w+30;x+=72){g.beginPath();g.arc(x,y,9,0,Math.PI*2);g.fill()}break}
      case 'gingham':{g.fillStyle=d.ink+'80';for(let x=0;x<w;x+=56)g.fillRect(x,0,28,h);for(let y=0;y<h;y+=56)g.fillRect(0,y,w,28);break}
      case 'florals':{
        for(let y=40,row=0;y<h+40;y+=92,row++)for(let x=(row%2)*70+30;x<w+40;x+=140){
          const jx=x+(r()-.5)*22,jy=y+(r()-.5)*18;
          g.fillStyle=d.leaf;for(const a of [-.6,2.5]){g.beginPath();g.ellipse(jx+Math.cos(a)*15,jy+Math.sin(a)*15,9,4.5,a,0,Math.PI*2);g.fill()}
          flower(g,jx,jy,13,r()<.5?d.ink:'#f9c69b','#fff2b8');
          g.fillStyle=d.ink+'99';g.beginPath();g.arc(jx+58,jy+40,3.2,0,Math.PI*2);g.fill();
        }break}
      case 'wainscot':{
        const rail=Math.round(h*.6);
        g.fillStyle=d.ink;g.fillRect(0,rail,w,h-rail);
        g.fillStyle='rgba(120,90,110,.12)';g.fillRect(0,rail,w,6);
        g.fillStyle='#fff';g.fillRect(0,rail-10,w,12);g.fillStyle='rgba(150,110,130,.25)';g.fillRect(0,rail+2,w,2);
        g.strokeStyle='rgba(170,140,150,.38)';g.lineWidth=3;
        for(let x=24;x<w-60;x+=150){g.strokeRect(x,rail+34,120,h-rail-80)}
        g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=2;for(let x=24;x<w-60;x+=150){g.strokeRect(x+3,rail+37,120,h-rail-80)}
        break}
      case 'siding':{
        for(let y=0;y<h;y+=34){g.fillStyle='rgba(255,255,255,.35)';g.fillRect(0,y,w,4);g.fillStyle='rgba(120,70,90,.14)';g.fillRect(0,y+30,w,4)}
        break}
      case 'trellis':{
        g.fillStyle='#b4dcae';for(let i=0;i<70;i++){const x=r()*w,y=r()*h;g.beginPath();g.arc(x,y,20+r()*26,0,Math.PI*2);g.fill()}
        g.strokeStyle=d.ink;g.lineWidth=9;g.lineCap='round';
        for(let x=-h;x<w+h;x+=70){g.beginPath();g.moveTo(x,0);g.lineTo(x+h,h);g.stroke();g.beginPath();g.moveTo(x+h,0);g.lineTo(x,h);g.stroke()}
        g.strokeStyle='rgba(150,180,150,.5)';g.lineWidth=2;
        for(let x=-h;x<w+h;x+=70){g.beginPath();g.moveTo(x+4,0);g.lineTo(x+h+4,h);g.stroke()}
        for(let i=0;i<46;i++){const x=r()*w,y=r()*h;g.fillStyle='#7fbf84';g.beginPath();g.ellipse(x,y,10,5,r()*3,0,Math.PI*2);g.fill();
          if(i%3===0)flower(g,x+8,y-6,9,['#f7a9c4','#fbd56f','#ffffff'][i%9/3|0],'#fff2b8')}
        break}
      case 'bamboo':{
        for(let x=0;x<w;x+=30){const tone=r();g.fillStyle=tone<.33?'#e8cf8e':tone<.66?'#efd9a2':'#e2c682';g.fillRect(x,0,27,h);
          g.fillStyle='rgba(255,255,255,.35)';g.fillRect(x+5,0,4,h);g.fillStyle=d.ink;
          for(let y=20+r()*60;y<h;y+=90+r()*30){g.fillRect(x,y,27,5)}
          g.fillStyle='rgba(120,90,40,.25)';g.fillRect(x+27,0,3,h)}
        g.fillStyle='#c4a15e';g.fillRect(0,h*.22,w,10);g.fillRect(0,h*.72,w,10);
        break}
      default:{ // paint: a soft brushed texture
        for(let i=0;i<260;i++){g.fillStyle=r()<.5?'rgba(255,255,255,.18)':'rgba(160,120,150,.05)';g.beginPath();g.ellipse(r()*w,r()*h,30+r()*80,8+r()*20,r()*3,0,Math.PI*2);g.fill()}
      }
    }
    return c;
  }

  /* ---------- floors (drawn straight onto the room, in perspective) ---------- */
  function floorPath(g){poly(g,[[BX0,BY],[BX1,BY],[FR,FY],[FL,FY]])}
  function paintFloor(g,id){
    const d=DECOR.floors[id]||DECOR.floors['honey-oak'],r=rng(11);
    g.save();floorPath(g);g.clip();
    g.fillStyle=d.base;g.fillRect(0,BY,W,FY-BY);
    const quad=(x0,x1,z0,z1)=>[[xAt(x0,z0),yAt(z0)],[xAt(x1,z0),yAt(z0)],[xAt(x1,z1),yAt(z1)],[xAt(x0,z1),yAt(z1)]];
    switch(d.kind){
      case 'planks':{
        const n=20,bw=(FR-FL)/n;
        for(let i=0;i<n;i++){
          const x0=FL+i*bw,x1=x0+bw;let z=ZB;
          while(z>1){const z1=Math.max(1,z-(.06+r()*.09));
            poly(g,quad(x0,x1,z,z1));g.fillStyle=shade(d.base,(r()-.5)*.12);g.fill();
            g.strokeStyle=d.ink;g.lineWidth=1.6;g.beginPath();g.moveTo(xAt(x0,z1),yAt(z1));g.lineTo(xAt(x1,z1),yAt(z1));g.stroke();
            // grain
            g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=1.2;g.beginPath();const gx=x0+bw*(.3+r()*.4);g.moveTo(xAt(gx,z),yAt(z));g.lineTo(xAt(gx+bw*.1,z1),yAt(z1));g.stroke();
            z=z1;}
          g.strokeStyle=d.ink;g.lineWidth=2.2;g.beginPath();g.moveTo(xAt(x0,ZB),yAt(ZB));g.lineTo(xAt(x0,1),yAt(1));g.stroke();
        }break}
      case 'tiles':{
        const cols=16,rows=7,tw=(FR-FL)/cols;
        for(let j=0;j<rows;j++){const z0=ZB-(ZB-1)*j/rows,z1=ZB-(ZB-1)*(j+1)/rows;
          for(let i=0;i<cols;i++){if((i+j)%2){poly(g,quad(FL+i*tw,FL+(i+1)*tw,z0,z1));g.fillStyle=d.ink;g.fill()}}}
        g.strokeStyle='rgba(255,255,255,.75)';g.lineWidth=2.4;
        for(let i=0;i<=cols;i++){g.beginPath();g.moveTo(xAt(FL+i*tw,ZB),yAt(ZB));g.lineTo(xAt(FL+i*tw,1),yAt(1));g.stroke()}
        for(let j=0;j<=rows;j++){const z=ZB-(ZB-1)*j/rows;g.beginPath();g.moveTo(xAt(FL,z),yAt(z));g.lineTo(xAt(FR,z),yAt(z));g.stroke()}
        // glaze
        for(let i=0;i<40;i++){const z=1+r()*(ZB-1),x=xAt(FL+r()*(FR-FL),z);g.fillStyle='rgba(255,255,255,.22)';g.beginPath();g.ellipse(x,yAt(z),18,4,0,0,Math.PI*2);g.fill()}
        break}
      case 'carpet':{
        for(let i=0;i<2600;i++){const z=1+r()*(ZB-1),x=xAt(FL+r()*(FR-FL),z),s=1.6/z;g.fillStyle=r()<.5?d.ink:'rgba(255,255,255,.35)';g.fillRect(x,yAt(z),2.4*s,2.4*s)}
        break}
      case 'lawn':{
        const n=12,bw=(FR-FL)/n;
        for(let i=0;i<n;i+=2){poly(g,quad(FL+i*bw,FL+(i+1)*bw,ZB,1));g.fillStyle=d.ink;g.fill()}
        for(let i=0;i<900;i++){const z=1+r()*(ZB-1),x=xAt(FL+r()*(FR-FL),z),y=yAt(z),s=1.3/z;
          g.strokeStyle=r()<.5?'#7fbf68':'#c3eaa8';g.lineWidth=2*s;g.beginPath();g.moveTo(x,y);g.lineTo(x-3*s,y-9*s);g.moveTo(x,y);g.lineTo(x+3*s,y-10*s);g.stroke()}
        for(let i=0;i<26;i++){const z=1+r()*(ZB-1),x=xAt(FL+r()*(FR-FL),z),y=yAt(z);flower(g,x,y,6/z,['#ffffff','#fbd56f','#f7a9c4'][i%3],'#f5cf63')}
        break}
      case 'deck':{
        const rows=15;
        for(let j=0;j<rows;j++){const z0=ZB-(ZB-1)*j/rows,z1=ZB-(ZB-1)*(j+1)/rows;
          poly(g,quad(FL-10,FR+10,z0,z1));g.fillStyle=shade(d.base,(r()-.5)*.1);g.fill();
          g.strokeStyle=d.ink;g.lineWidth=2.4;g.beginPath();g.moveTo(xAt(FL,z1),yAt(z1));g.lineTo(xAt(FR,z1),yAt(z1));g.stroke();
          for(let k=0;k<3;k++){const x=FL+r()*(FR-FL);g.lineWidth=1.6;g.beginPath();g.moveTo(xAt(x,z0),yAt(z0));g.lineTo(xAt(x,z1),yAt(z1));g.stroke()}
          g.fillStyle='rgba(255,255,255,.16)';poly(g,quad(FL,FR,z0,z0-(z0-z1)*.25));g.fill();}
        break}
      case 'pavers':{
        g.fillStyle='#bfe0a8';g.fillRect(0,BY,W,FY-BY);
        const rows=8,cols=9,tw=(FR-FL)/cols;
        for(let j=0;j<rows;j++){const z0=ZB-(ZB-1)*j/rows,z1=ZB-(ZB-1)*(j+1)/rows,off=j%2?tw/2:0;
          for(let i=-1;i<cols;i++){const x0=FL+i*tw+off+6,x1=x0+tw-12,za=z0-(z0-z1)*.1,zb=z1+(z0-z1)*.1;
            const q=quad(x0,x1,za,zb);g.fillStyle=shade(d.base,(r()-.5)*.1);
            g.beginPath();const c=q.map(p=>p);g.moveTo((c[0][0]+c[1][0])/2,c[0][1]);
            for(let k=0;k<4;k++){const a=c[(k+1)%4],b=c[(k+2)%4];g.quadraticCurveTo(a[0],a[1],(a[0]+b[0])/2,(a[1]+b[1])/2)}
            g.fill();g.strokeStyle=d.ink;g.lineWidth=2;g.stroke();}}
        break}
      case 'sand':{
        for(let i=0;i<2200;i++){const z=1+r()*(ZB-1),x=xAt(FL+r()*(FR-FL),z);g.fillStyle=r()<.5?d.ink:'#fff8e6';g.fillRect(x,yAt(z),2.4/z,2.4/z)}
        for(let i=0;i<9;i++){const z=1+r()*(ZB-1),x=xAt(FL+r()*(FR-FL),z),y=yAt(z),s=1/z;
          g.fillStyle=i%2?'#f9b9a9':'#fbe2ef';g.beginPath();g.moveTo(x-9*s,y);g.quadraticCurveTo(x,y-16*s,x+9*s,y);g.closePath();g.fill();
          g.strokeStyle='rgba(200,120,110,.5)';g.lineWidth=1.2;for(const dx of [-4,0,4]){g.beginPath();g.moveTo(x,y-1);g.lineTo(x+dx*s,y-9*s);g.stroke()}}
        break}
    }
    // light: brighter toward the front, a soft shadow along the back wall
    const lg=g.createLinearGradient(0,BY,0,FY);lg.addColorStop(0,'rgba(110,70,100,.16)');lg.addColorStop(.18,'rgba(110,70,100,.04)');lg.addColorStop(1,'rgba(255,255,255,.1)');
    g.fillStyle=lg;g.fillRect(0,BY,W,FY-BY);
    const sp=g.createRadialGradient(W*.45,FY-120,40,W*.45,FY-120,820);sp.addColorStop(0,'rgba(255,250,235,.28)');sp.addColorStop(1,'rgba(255,250,235,0)');
    g.fillStyle=sp;g.fillRect(0,BY,W,FY-BY);
    g.restore();
  }

  /* ---------- walls ---------- */
  function paintWalls(g,id,outdoor){
    const top=outdoor?DecorLogic.WALL_OUT.y0-6:0,ph=BY-top;
    const pat=wallPattern(id,BX1-BX0+DEPTH+40,ph);
    if(outdoor)paintSky(g);
    g.drawImage(pat,0,0,BX1-BX0,ph,BX0,top,BX1-BX0,ph);
    // side walls: vertical strips, each the wall pattern seen at its depth
    for(const side of [-1,1]){
      const xf=side<0?FL:FR,xb=side<0?BX0:BX1,strip=4;
      for(let x=Math.min(xf,xb);x<Math.max(xf,xb);x+=strip){
        const za=(xf-VX)/(x-VX),zb=(xf-VX)/(x+strip-VX),z=(za+zb)/2,yb=yAt(z),yt=YH+(top-YH)*ZB/z;
        const s0=(ZB-za)/(ZB-1)*DEPTH,s1=(ZB-zb)/(ZB-1)*DEPTH,sw=Math.max(1,Math.abs(s1-s0));
        const src=20+Math.min(s0,s1);
        if(!outdoor)g.drawImage(pat,Math.min(pat.width-sw,src),0,sw,ph,x,yt,strip+.6,yb-yt);
      }
      // shading: side walls a touch darker, darkest at the back corner
      const gx=g.createLinearGradient(xb,0,xf,0);gx.addColorStop(0,'rgba(90,50,90,.2)');gx.addColorStop(1,'rgba(90,50,90,.06)');
      g.fillStyle=gx;poly(g,[[xb,top],[xb,BY],[xf,FY],[xf,YH+(top-YH)*ZB]]);g.fill();
      if(outdoor)paintHedge(g,side,xf,xb,top);
    }
    if(!outdoor){
      // crown moulding and baseboard on the back wall, baseboards along the side walls
      g.fillStyle='#fffdf8';g.fillRect(BX0,34,BX1-BX0,16);g.fillStyle='rgba(150,110,130,.22)';g.fillRect(BX0,50,BX1-BX0,3);
      // skirting board: a cap moulding, a flat face lit from above, a shadow line where it meets the floor
      const SK=DecorLogic.SKIRT,sk=g.createLinearGradient(0,BY-SK,0,BY);sk.addColorStop(0,'#fffefb');sk.addColorStop(.25,'#fbf6f0');sk.addColorStop(1,'#efe5dc');
      g.fillStyle='rgba(90,50,90,.16)';g.fillRect(BX0,BY-SK-5,BX1-BX0,5);
      g.fillStyle=sk;g.fillRect(BX0,BY-SK,BX1-BX0,SK);
      g.fillStyle='#ffffff';g.fillRect(BX0,BY-SK,BX1-BX0,4);g.fillStyle='rgba(150,110,130,.3)';g.fillRect(BX0,BY-SK+5,BX1-BX0,1.5);
      g.fillStyle='rgba(110,70,90,.35)';g.fillRect(BX0,BY-2,BX1-BX0,2);
      for(const side of [-1,1]){const xf=side<0?FL:FR,xb=side<0?BX0:BX1,h0=DecorLogic.SKIRT,h1=DecorLogic.SKIRT*ZB;
        poly(g,[[xb,BY-h0],[xb,BY],[xf,FY],[xf,FY-h1]]);g.fillStyle='#f4ece4';g.fill();
        g.strokeStyle='rgba(150,110,130,.3)';g.lineWidth=2.5;g.beginPath();g.moveTo(xb,BY-h0);g.lineTo(xf,FY-h1);g.stroke()}
      // a soft window light on the back wall and darker corners
      const lt=g.createRadialGradient(BX0+300,140,30,BX0+300,140,700);lt.addColorStop(0,'rgba(255,255,245,.32)');lt.addColorStop(1,'rgba(255,255,245,0)');
      g.fillStyle=lt;g.fillRect(BX0,0,BX1-BX0,BY);
    }
    for(const [x,dir] of [[BX0,1],[BX1,-1]]){const cg=g.createLinearGradient(x,0,x+dir*90,0);cg.addColorStop(0,'rgba(90,50,90,.16)');cg.addColorStop(1,'rgba(90,50,90,0)');g.fillStyle=cg;g.fillRect(Math.min(x,x+dir*90),top,90,BY-top)}
    const ao=g.createLinearGradient(0,BY-60,0,BY);ao.addColorStop(0,'rgba(90,50,90,0)');ao.addColorStop(1,'rgba(90,50,90,.1)');g.fillStyle=ao;g.fillRect(BX0,BY-60,BX1-BX0,60);
    if(outdoor){ // the wall's cap: a little roof edge for siding, a top rail for the others
      const d=DECOR.walls[id]||{};
      if(d.kind==='siding'){g.fillStyle='#fffaf6';g.fillRect(BX0-20,top-18,BX1-BX0+40,30);g.fillStyle=shade(d.base,-.25);
        for(let x=BX0-20;x<BX1+20;x+=44){g.beginPath();g.arc(x+22,top+12,22,0,Math.PI);g.fill()}
        g.fillStyle='rgba(90,50,90,.15)';g.fillRect(BX0,top+34,BX1-BX0,10)}
      else{g.fillStyle=d.kind==='bamboo'?'#c39b55':'#fffdf8';g.fillRect(BX0-10,top-10,BX1-BX0+20,18);g.fillStyle='rgba(90,50,90,.15)';g.fillRect(BX0,top+8,BX1-BX0,6)}
    }
  }
  function paintSky(g){
    const sk=g.createLinearGradient(0,0,0,BY);sk.addColorStop(0,'#a9daf6');sk.addColorStop(.55,'#d7efff');sk.addColorStop(1,'#fff1e4');
    g.fillStyle=sk;g.fillRect(0,0,W,BY);
    const r=rng(5);
    g.fillStyle='rgba(255,246,200,.9)';g.beginPath();g.arc(1180,120,52,0,Math.PI*2);g.fill();
    g.fillStyle='rgba(255,246,200,.35)';g.beginPath();g.arc(1180,120,86,0,Math.PI*2);g.fill();
    for(const [cx,cy,s] of [[330,110,1],[760,70,.8],[1000,180,.7],[560,190,.6]]){
      g.fillStyle='rgba(255,255,255,.92)';
      for(let i=0;i<6;i++){g.beginPath();g.ellipse(cx+(i-2.5)*34*s,cy+(i%2?-10:6)*s,40*s,(26+r()*12)*s,0,0,Math.PI*2);g.fill()}
    }
    // palm crowns peeking over the garden wall
    for(const [x,top,lean] of [[250,150,24],[1300,190,-20],[1440,120,-30]]){
      g.strokeStyle='#c59a68';g.lineWidth=16;g.lineCap='round';g.beginPath();g.moveTo(x,BY);g.quadraticCurveTo(x+lean*.2,(BY+top)/2,x+lean,top);g.stroke();
      g.strokeStyle='rgba(120,80,40,.25)';g.lineWidth=2;for(let y=top+20;y<BY;y+=22){g.beginPath();g.moveTo(x+lean*(1-(y-top)/(BY-top))-8,y);g.lineTo(x+lean*(1-(y-top)/(BY-top))+8,y+4);g.stroke()}
      for(let i=0;i<8;i++){const a=-Math.PI+i*Math.PI/7+(i%2?.1:-.1);g.save();g.translate(x+lean,top);g.rotate(a);
        g.fillStyle=i%2?'#6fbf7a':'#83cc84';g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(40,-22,96,10);g.quadraticCurveTo(44,4,0,0);g.fill();g.restore()}
    }
  }
  function paintHedge(g,side,xf,xb,top){
    const r=rng(side<0?3:4);
    g.save();poly(g,[[xb,top-60],[xb,BY],[xf,FY],[xf,top-60]]);g.clip();
    g.fillStyle='#86c47a';g.fillRect(Math.min(xf,xb),0,Math.abs(xf-xb),FY);
    for(let i=0;i<90;i++){const t=r(),x=xb+(xf-xb)*t,yb=yAt((xf-VX)/(x-VX)),y=top+40+r()*(yb-top-40);
      g.fillStyle=r()<.5?'#9fd18f':'#74b56a';g.beginPath();g.arc(x,y,18+r()*22,0,Math.PI*2);g.fill();
      if(i%7===0)flower(g,x,y,8,'#f7a9c4','#fff2b8')}
    g.restore();
  }

  /* ---------- frame ---------- */
  function paintFrame(g,roomId,outdoor){
    const wood=outdoor?'#fbfff9':'#fff8ef',edge=outdoor?'#cfe4cf':'#ecd8c4',acc=ACCENT[roomId]||'#f29cc3';
    g.fillStyle=wood;
    g.fillRect(0,0,W,34);g.fillRect(0,0,FL,H);g.fillRect(FR,0,W-FR,H);g.fillRect(0,FY,W,H-FY);
    // the top of each side wall seen from above: the dollhouse's side panel
    for(const side of [-1,1]){const xf=side<0?FL:FR,xb=side<0?BX0:BX1,yt=outdoor?null:YH+(0-YH)*ZB;
      if(!outdoor){poly(g,[[xf,0],[xb,0],[xf,yt]]);g.fillStyle=wood;g.fill();g.strokeStyle=edge;g.lineWidth=3;g.beginPath();g.moveTo(xb,0);g.lineTo(xf,yt);g.stroke()}}
    // floor slab front face
    const sf=g.createLinearGradient(0,FY,0,H);sf.addColorStop(0,shade(edge,.2));sf.addColorStop(1,edge);g.fillStyle=sf;g.fillRect(FL-8,FY,FR-FL+16,H-FY);
    g.fillStyle=acc;for(let x=FL+26;x<FR-10;x+=52){g.beginPath();g.arc(x,FY+22,6,0,Math.PI*2);g.fill()}
    g.fillStyle='rgba(255,255,255,.7)';g.fillRect(FL-8,FY,FR-FL+16,4);
    // inner lip and an accent line around the opening
    g.strokeStyle=edge;g.lineWidth=4;g.strokeRect(FL-2,32,FR-FL+4,FY-30);
    g.strokeStyle=acc;g.lineWidth=5;g.strokeRect(10,10,W-20,H-20);
    g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=2;g.strokeRect(16,16,W-32,H-32);
    // the room's inner shadow under the frame
    const ts=g.createLinearGradient(0,34,0,64);ts.addColorStop(0,'rgba(90,50,90,.18)');ts.addColorStop(1,'rgba(90,50,90,0)');g.fillStyle=ts;g.fillRect(FL,34,FR-FL,30);
  }

  /* Paints a whole empty room into `g`, whose transform maps room coordinates (1536 x 1152). */
  function room(g,roomId,wallId,floorId,backdrop){
    const def=DecorLogic.roomDef(roomId)||DECOR.rooms[0],outdoor=!!def.outdoor;
    g.save();
    g.beginPath();g.roundRect?g.roundRect(0,0,W,H,28):g.rect(0,0,W,H);g.clip();
    if(backdrop){g.drawImage(backdrop,0,0,W,H);g.restore();return}
    g.fillStyle='#fff8ef';g.fillRect(0,0,W,H);
    paintWalls(g,wallId,outdoor);
    paintFloor(g,floorId);
    // ambient occlusion where the floor meets the back and side walls
    g.save();g.beginPath();g.moveTo(BX0,BY);g.lineTo(BX1,BY);g.lineTo(FR,FY);g.lineTo(FL,FY);g.closePath();g.clip();
    const fa=g.createLinearGradient(0,BY,0,BY+46);fa.addColorStop(0,'rgba(80,45,75,.3)');fa.addColorStop(.35,'rgba(80,45,75,.12)');fa.addColorStop(1,'rgba(80,45,75,0)');
    g.fillStyle=fa;g.fillRect(0,BY,W,46);
    g.strokeStyle='rgba(80,45,75,.22)';g.lineWidth=14;g.shadowColor='rgba(80,45,75,.35)';g.shadowBlur=22;
    for(const [xb,xf] of [[BX0,FL],[BX1,FR]]){g.beginPath();g.moveTo(xb,BY);g.lineTo(xf,FY);g.stroke()}
    g.shadowBlur=0;
    g.restore();
    paintFrame(g,roomId,outdoor);
    g.restore();
  }
  /* A small square picture of a wall or floor treatment for its picker button. */
  const swatches=new Map();
  function swatch(kind,id,size=96){
    const key=kind+':'+id+':'+size;if(swatches.has(key))return swatches.get(key);
    const c=make(size,size),g=c.getContext('2d');let url='';
    try{
      if(kind==='wall'){const p=wallPattern(id,360,360);const d=DECOR.walls[id];const sy=d&&['siding','trellis','bamboo'].includes(d.kind)?0:0;g.drawImage(p,0,sy,240,240,0,0,size,size)}
      else{g.save();g.scale(size/300,size/300);g.translate(-618,-760);paintFloor(g,id);g.restore()}
      url=c.toDataURL('image/png');
    }catch{}
    swatches.set(key,url);return url;
  }
  return {room,swatch,wallPattern};
})();
