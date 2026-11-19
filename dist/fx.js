// Sparkle and confetti effects: glitter pointer trail, star bursts on activation, win confetti.
// One fixed, pointer-events:none canvas; a single requestAnimationFrame loop that runs only while particles live.
const HibiscusFx=(()=>{
  const MAX=340,MAX_TRAIL=56,TAU=Math.PI*2;
  const glowColors=['#f2559d','#d93a87','#a874e6','#efb21c','#ff7fb8'];
  const confettiColors=['#ff5fa5','#e2408b','#ff8fc2','#b98ae8','#9061d0','#f2b928','#ffd257','#ff8a6a'];
  const pinks=['#ff5fa5','#e2408b','#ff8fc2','#ff8a6a'],golds=['#f2b928','#ffd257','#b98ae8'];
  const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let enabled=true,reduced=reducedQuery.matches,canvas=null,ctx=null,W=0,H=0,dpr=1,dirty=true;
  let raf=0,last=0,trailCount=0,lastX=-1,lastY=-1,travel=0,anchor=null;
  const parts=[];
  const rand=(a,b)=>a+Math.random()*(b-a);
  const pick=list=>list[Math.random()*list.length|0];

  // Pre-rendered glowing four-point stars, one per palette colour, so the hot path is drawImage only.
  const sprites=glowColors.map(color=>{
    const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
    const halo=g.createRadialGradient(32,32,0,32,32,30);halo.addColorStop(0,color+'aa');halo.addColorStop(.3,color+'40');halo.addColorStop(1,color+'00');
    g.fillStyle=halo;g.fillRect(0,0,64,64);
    const star=(r,w)=>{g.beginPath();g.moveTo(32,32-r);g.quadraticCurveTo(32+w,32-w,32+r,32);g.quadraticCurveTo(32+w,32+w,32,32+r);g.quadraticCurveTo(32-w,32+w,32-r,32);g.quadraticCurveTo(32-w,32-w,32,32-r);g.fill()};
    g.fillStyle=color;star(30,3.2);g.fillStyle='#fff8ec';star(12,1.6);
    return c;
  });
  const heart=new Path2D('M0 .9C-.4 .55-1 .15-1-.35-1-.8-.45-1 0-.55.45-1 1-.8 1-.35 1 .15.4.55 0 .9Z');
  const petal=new Path2D('M0 1C-.9.3-.8-1 0-.82.8-1 .9.3 0 1Z');
  const star5=new Path2D();
  for(let i=0;i<10;i++){const r=i%2?.45:1,a=i*Math.PI/5-Math.PI/2;star5[i?'lineTo':'moveTo'](Math.cos(a)*r,Math.sin(a)*r)}
  star5.closePath();
  const flower=new Path2D();
  for(let i=0;i<5;i++){const a=i*TAU/5-Math.PI/2;flower.moveTo(Math.cos(a)*.5+Math.cos(a)*.5,Math.sin(a)*.5+Math.sin(a)*.5);flower.ellipse(Math.cos(a)*.5,Math.sin(a)*.5,.5,.34,a,0,TAU)}
  const shapes={heart,petal,star:star5,flower};

  function ensureCanvas(){
    if(canvas)return true;
    if(!document.body)return false;
    canvas=document.createElement('canvas');
    canvas.className='fx-layer';canvas.setAttribute('aria-hidden','true');canvas.setAttribute('role','presentation');
    canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:100;contain:strict';
    document.body.appendChild(canvas);ctx=canvas.getContext('2d');dirty=true;
    return true;
  }
  function resize(){
    dirty=false;dpr=Math.min(window.devicePixelRatio||1,2);
    W=canvas.clientWidth||innerWidth;H=canvas.clientHeight||innerHeight;
    const w=Math.round(W*dpr),h=Math.round(H*dpr);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  }
  function viewport(){if(dirty&&canvas)resize();return {w:W||innerWidth,h:H||innerHeight}}
  function wake(){
    if(raf||document.hidden||!parts.length||!ensureCanvas())return;
    last=performance.now();raf=requestAnimationFrame(frame);
  }
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0}
  function clearAll(){parts.length=0;trailCount=0;stop();if(ctx){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height)}}
  function add(p){
    if(parts.length>=MAX)return false;
    p.age=p.age||0;p.rot=p.rot||0;p.vr=p.vr||0;p.vx=p.vx||0;p.vy=p.vy||0;p.grav=p.grav||0;p.drag=p.drag??1;p.phase=Math.random()*TAU;
    parts.push(p);if(p.trail)trailCount++;return true;
  }

  function frame(now){
    raf=0;if(document.hidden)return;
    const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
    if(dirty)resize();
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    for(let i=parts.length-1;i>=0;i--){
      const p=parts[i];p.age+=dt;
      if(p.age>=p.life||p.y>H+60){parts[i]=parts[parts.length-1];parts.pop();if(p.trail)trailCount--;continue}
      if(p.age<0)continue;
      p.vy+=p.grav*dt;if(p.term&&p.vy>p.term)p.vy+=(p.term-p.vy)*Math.min(1,dt*4);
      if(p.drag!==1){const k=Math.pow(p.drag,dt*60);p.vx*=k;p.vy*=k}
      p.x+=(p.vx+(p.sway?Math.sin(p.age*p.swayF+p.phase)*p.sway:0))*dt;p.y+=p.vy*dt;p.rot+=p.vr*dt;
      draw(p);
    }
    ctx.globalAlpha=1;
    if(parts.length)raf=requestAnimationFrame(frame);
    else{ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height)}
  }
  function draw(p){
    const t=p.age/p.life;
    let a=p.fade==='late'?(t<.78?1:(1-t)/.22):p.fade==='swell'?Math.sin(Math.PI*t):1-t*t;
    let s=p.size;
    if(p.tw)s*=.62+.38*Math.sin(p.age*p.tw+p.phase);
    if(p.grow)s*=.4+.6*Math.sin(Math.PI*Math.min(1,t*1.15));
    if(a<=0||s<=0)return;
    const c=Math.cos(p.rot),n=Math.sin(p.rot);
    let flip=1;
    if(p.flip){flip=Math.cos(p.age*p.flip+p.phase);a*=.7+.3*Math.abs(flip)}
    ctx.globalAlpha=Math.min(1,a*(p.alpha||1));
    if(p.kind==='spark'){
      ctx.setTransform(dpr*c,dpr*n,-dpr*n,dpr*c,dpr*p.x,dpr*p.y);
      ctx.drawImage(sprites[p.sprite],-s,-s,s*2,s*2);return;
    }
    if(p.kind==='dot'){
      ctx.setTransform(dpr,0,0,dpr,dpr*p.x,dpr*p.y);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(0,0,s,0,TAU);ctx.fill();return;
    }
    ctx.setTransform(dpr*c*s,dpr*n*s,-dpr*n*s*flip,dpr*c*s*flip,dpr*p.x,dpr*p.y);
    if(p.kind==='ribbon'){
      const w=Math.sin(p.age*7+p.phase)*.55;
      ctx.strokeStyle=p.color;ctx.lineWidth=.38;ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(-1,0);ctx.bezierCurveTo(-.4,-w*1.6,.1,w*1.6,1,0);ctx.stroke();return;
    }
    ctx.fillStyle=p.color;ctx.fill(shapes[p.kind]);
    if(p.kind==='flower'){ctx.fillStyle='#ffd257';ctx.beginPath();ctx.arc(0,0,.24,0,TAU);ctx.fill()}
  }

  // Glitter that follows a mouse or pen.
  function trail(x,y,dx,dy){
    if(trailCount>=MAX_TRAIL)return;
    const star=Math.random()<.62;
    add(Object.assign(star?{kind:'spark',sprite:Math.random()*sprites.length|0,size:rand(5.5,9),tw:rand(12,20)}:{kind:'dot',color:pick(['#f27ab3','#b98ae8','#f2c23e','#ff9cc8']),size:rand(1.1,2)},{trail:true,x:x+rand(-5,5),y:y+rand(-5,5),vx:-dx*.9+rand(-14,14),vy:-dy*.9+rand(-6,18),grav:34,drag:.95,life:rand(.5,.9),rot:rand(0,.8)}));
  }
  function onMove(e){
    if(!enabled||reduced||(e.pointerType!=='mouse'&&e.pointerType!=='pen'))return;
    if(e.target&&e.target.closest&&e.target.closest('dialog[open]')){lastX=-1;return}
    const x=e.clientX,y=e.clientY;
    if(lastX<0){lastX=x;lastY=y;return}
    const dx=x-lastX,dy=y-lastY,d=Math.hypot(dx,dy);
    travel+=d;lastX=x;lastY=y;
    if(travel<15)return;
    let n=Math.min(3,travel/15|0);travel-=n*15;if(travel>15)travel=0;
    const ux=d?dx/d:0,uy=d?dy/d:0;
    while(n--){trail(x-ux*n*7,y-uy*n*7,ux*20,uy*20)}
    wake();
  }

  function burst(x,y,power=1){
    if(!enabled||reduced||!isFinite(x)||!isFinite(y))return;
    add({kind:'spark',sprite:3,x,y,size:20*power,grow:true,fade:'swell',life:.42,rot:Math.PI/4});
    const n=Math.round(11*power),off=Math.random()*TAU;
    for(let i=0;i<n;i++){
      const a=off+i*TAU/n+rand(-.18,.18),v=rand(200,340)*power,star=i%3!==2;
      add(Object.assign(star?{kind:'spark',sprite:Math.random()*sprites.length|0,size:rand(5.5,9),tw:rand(12,20)}:{kind:'dot',color:pick(['#f27ab3','#b98ae8','#f2c23e']),size:rand(1.4,2.3)},{x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:.91,grav:70,life:rand(.45,.75)}));
    }
    wake();
  }

  function confetti(){
    if(!enabled||!ensureCanvas())return;
    const {w,h}=viewport();
    const origin=anchor&&performance.now()-anchor.at<4000?anchor:{x:w/2,y:h*.6};
    if(reduced){
      // A brief, motionless shimmer instead of falling confetti.
      for(let i=0;i<7;i++){const a=i*TAU/7,r=rand(26,46);add({kind:'spark',sprite:i%sprites.length,x:origin.x+Math.cos(a)*r,y:origin.y+Math.sin(a)*r*.7,size:rand(6,10),fade:'swell',life:.8})}
      wake();return;
    }
    // A pop of stars and hearts from where the win happened.
    burst(origin.x,origin.y,1.35);
    for(let i=0;i<22;i++){
      const a=-Math.PI/2+rand(-1.05,1.05),v=rand(320,560)*Math.min(1.2,h/800+.3);
      add(makePiece(origin.x,origin.y,{vx:Math.cos(a)*v,vy:Math.sin(a)*v,drag:.965}));
    }
    // A shower from the top of the screen, staggered over about a second.
    const count=Math.max(60,Math.min(140,Math.round(w*h/9500)));
    for(let i=0;i<count;i++){
      add(makePiece(rand(-10,w+10),rand(-40,-12),{age:-rand(0,1.05),vy:rand(40,120)}));
    }
    wake();
  }
  function makePiece(x,y,extra){
    const r=Math.random(),h=H||innerHeight;
    const kind=r<.2?'heart':r<.38?'star':r<.56?'petal':r<.66?'flower':r<.82?'ribbon':'spark';
    const p={kind,x,y,life:rand(2.3,2.9),fade:'late',grav:600,term:rand(.4,.62)*Math.max(500,h),sway:rand(18,48),swayF:rand(2.2,4.2),rot:rand(0,TAU),vr:rand(-4,4)};
    if(kind==='spark')Object.assign(p,{sprite:Math.random()*sprites.length|0,size:rand(7,11),tw:rand(8,14),vr:rand(-1,1)});
    else if(kind==='ribbon')Object.assign(p,{color:pick(confettiColors),size:rand(9,14),flip:rand(3,6)});
    else if(kind==='star')Object.assign(p,{color:pick(golds),size:rand(6.5,9.5),flip:rand(4,8)});
    else if(kind==='flower')Object.assign(p,{color:pick(['#ff5fa5','#e2408b','#ff8a6a']),size:rand(7,10),vr:rand(-2,2)});
    else Object.assign(p,{color:pick(pinks.concat(kind==='petal'?['#b98ae8']:[])),size:kind==='heart'?rand(6.5,9):rand(7,10),flip:rand(3,7)});
    return Object.assign(p,extra);
  }

  // Bursts on every button or link activation; keyboard activation bursts from the element's centre.
  function onClick(e){
    const el=e.target&&e.target.closest&&e.target.closest('button,a[href],[role="button"],summary,input[type="submit"],input[type="button"]');
    if(!el||el.disabled)return;
    let x=e.clientX,y=e.clientY;
    if(!e.detail||(!x&&!y)){const r=el.getBoundingClientRect();x=r.left+r.width/2;y=r.top+r.height/2}
    anchor={x,y,at:performance.now()};
    if(el.closest('dialog[open]'))return;
    burst(x,y);
  }

  // Ambient: an occasional twinkle beside headings marked with ✦.
  function twinkle(){
    if(!enabled||reduced||document.hidden||parts.length>40)return;
    const marks=document.querySelectorAll('.heading-sparks');if(!marks.length)return;
    const r=pick(marks).getBoundingClientRect();
    if(r.bottom<0||r.top>innerHeight||!r.width)return;
    add({kind:'spark',sprite:pick([0,2,3,4]),x:r.left+rand(-4,r.width+10),y:r.top+rand(-8,r.height+4),size:rand(5,8),grow:true,fade:'swell',life:rand(.9,1.4),rot:Math.random()<.5?0:Math.PI/4});
    wake();
  }

  addEventListener('pointermove',onMove,{passive:true});
  addEventListener('pointerleave',()=>{lastX=-1},{passive:true});
  addEventListener('click',onClick,true);
  addEventListener('resize',()=>{dirty=true},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else{lastX=-1;wake()}});
  const onReduced=()=>{reduced=reducedQuery.matches;if(reduced)clearAll()};
  if(reducedQuery.addEventListener)reducedQuery.addEventListener('change',onReduced);else reducedQuery.addListener(onReduced);
  setInterval(twinkle,2600);

  return {
    burst(x,y){burst(x,y)},
    confetti,
    setEnabled(on){enabled=!!on;if(!enabled)clearAll()},
    isEnabled:()=>enabled,
    stats:()=>({particles:parts.length,running:!!raf,enabled,reduced})
  };
})();
