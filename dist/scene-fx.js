// Living scenes: the island map and the Island Life districts drawn through WebGL (three.js) with water,
// wind, lights, sky and a few particles, driven by the per-scene data in scene-data.js.
//
// Nothing here follows the pointer: the picture moves the same whether or not a pointer or finger is over
// it. Plants, lanterns and bunting are moved by one wind signal per scene (nature.js: a slow breeze plus
// gusts every 6 to 15 s that travel across the picture), each layer through its own damped spring, so a
// palm crown bends downwind in a gust and settles back with a little overshoot. The ambience hears the
// same wind. Water carries a slow travelling swell, and the surf washes in and slides back.
//
//   const fx = HibiscusScenes.mount(containerEl, 'boardwalk')   // 'island' | 'boardwalk' | 'market' | 'pavilion'
//   fx.setActor(x, y)        // the walking character, as fractions of the container (same as island-life p.x/p.y)
//   fx.setPaused(bool)  fx.resize()  fx.unmount()
//
// The canvas is inserted as the container's first child (absolute, pointer-events:none), under every overlay,
// and reproduces the container's CSS background framing (background-size / -position, read from computed style),
// so pins, the walker and buttons stay where they are. Nothing is fetched until a scene is mounted; three.js is
// loaded with import() from vendor/three/ next to this script. Any failure (no WebGL2, import error, lost context)
// leaves the plain CSS background showing, silently. Reduced motion, the sparkle toggle (HibiscusFx.isEnabled())
// or HibiscusScenes.setEnabled(false) also leave the still CSS picture.
const HibiscusScenes=(()=>{
  const base=(document.currentScript&&document.currentScript.src)||location.href;
  const THREE_URL=new URL('vendor/three/three.module.min.js',base).href;
  const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const TAU=Math.PI*2,MOTION_MAX=8,MAX_DRIVERS=48,WIND_SAMPLES=9;
  // allowSoftwareGL: also run on a software renderer (?softgl in the address, for automated checks, as puppet.js)
  const config={allowSoftwareGL:/[?&]softgl\b/.test(location.search),maxPixelRatio:2,quality:'auto',debug:0,lodBias:-.5};
  const nature=()=>typeof HibiscusNature!=='undefined'?HibiscusNature:null;
  let enabled=true,threePromise=null,webgl2=null,noise=null,ticker=0;
  const mounts=new Set(),byElement=new WeakMap(),pool=[],maskCache=new Map();

  const loadThree=()=>threePromise||(threePromise=import(THREE_URL).catch(e=>{threePromise=null;throw e}));
  const sparkleOn=()=>{try{return typeof HibiscusFx==='undefined'||HibiscusFx.isEnabled()!==false}catch{return true}};
  const wanted=()=>enabled&&!reducedQuery.matches&&sparkleOn();
  const sceneData=id=>{try{return HibiscusSceneData.scenes[id]||null}catch{return null}};
  const rand=(a,b)=>a+Math.random()*(b-a);
  const clamp=(x,a,b)=>x<a?a:x>b?b:x;
  const later=()=>new Promise(r=>setTimeout(r,0));

  function hasWebGL2(){
    if(webgl2!==null)return webgl2;
    try{
      const c=document.createElement('canvas'),gl=c.getContext('webgl2',{failIfMajorPerformanceCaveat:!config.allowSoftwareGL});
      webgl2=!!gl;if(gl)gl.getExtension('WEBGL_lose_context')?.loseContext();
    }catch{webgl2=false}
    return webgl2;
  }

  /* ---------- framing: where the CSS background puts the picture inside the container ---------- */
  function framing(el,iw,ih){
    const cs=getComputedStyle(el),W=el.clientWidth,H=el.clientHeight;
    const size=(cs.backgroundSize||'auto').split(',')[0].trim(),pos=(cs.backgroundPosition||'50% 50%').split(',')[0].trim();
    const len=(v,ref)=>!v||v==='auto'?null:v.endsWith('%')?ref*parseFloat(v)/100:v.endsWith('px')?parseFloat(v):null;
    let w,h;
    if(size==='cover'||size==='contain'){const s=(size==='cover'?Math.max:Math.min)(W/iw,H/ih);w=iw*s;h=ih*s}
    else{
      const [a,b]=size.split(/\s+/);w=len(a,W);h=len(b||'auto',H);
      if(w==null&&h==null){w=iw;h=ih}else if(w==null)w=h*iw/ih;else if(h==null)h=w*ih/iw;
    }
    const at=(v,free)=>{if(!v)return free/2;if(v.endsWith('%'))return free*parseFloat(v)/100;if(v.endsWith('px'))return parseFloat(v);return free/2};
    const [px,py]=pos.split(/\s+/);
    return {x:at(px,W-w),y:at(py||'50%',H-h),w,h,W,H};
  }
  function backgroundURL(el){
    const m=/url\(\s*["']?([^"')]+)["']?\s*\)/.exec(getComputedStyle(el).backgroundImage||'');
    return m?m[1]:null;
  }
  function loadImage(src){
    return new Promise((ok,fail)=>{const im=new Image();im.decoding='async';im.onload=()=>ok(im);im.onerror=()=>fail(new Error('image '+src));im.src=src});
  }

  /* ---------- noise texture (tileable value noise; R,G smooth, B fine, A coarse) ---------- */
  function makeNoise(){
    if(noise)return noise;
    const N=256,out=new Uint8Array(N*N*4);
    const channel=(cells,octaves,seed)=>{
      const f=new Float32Array(N*N);let amp=1,total=0;
      for(let o=0;o<octaves;o++){
        const c=cells<<o,lat=new Float32Array(c*c);let s=seed*9973+o*7919+1;
        for(let i=0;i<lat.length;i++){s=(s*16807)%2147483647;lat[i]=s/2147483647}
        for(let y=0;y<N;y++){const gy=y*c/N,y0=gy|0,ty=gy-y0,sy=ty*ty*(3-2*ty),y1=(y0+1)%c;
          for(let x=0;x<N;x++){const gx=x*c/N,x0=gx|0,tx=gx-x0,sx=tx*tx*(3-2*tx),x1=(x0+1)%c;
            const a=lat[y0*c+x0],b=lat[y0*c+x1],d=lat[y1*c+x0],e=lat[y1*c+x1];
            f[y*N+x]+=amp*((a+(b-a)*sx)+((d+(e-d)*sx)-(a+(b-a)*sx))*sy)}}
        total+=amp;amp*=.5;
      }
      let lo=1e9,hi=-1e9;for(const v of f){if(v<lo)lo=v;if(v>hi)hi=v}
      return f.map(v=>(v-lo)/(hi-lo));
    };
    const ch=[channel(8,3,1),channel(8,3,2),channel(48,2,3),channel(4,2,4)];
    for(let i=0;i<N*N;i++)for(let k=0;k<4;k++)out[i*4+k]=Math.round(ch[k][i]*255);
    return noise={data:out,size:N};
  }

  /* ---------- masks: built once per scene from the picture + the data's shapes and colour keys ---------- */
  function boxBlur(src,w,h,r){
    if(r<.5)return src;
    r=Math.round(r);const tmp=new Float32Array(src.length),out=new Float32Array(src.length),k=1/(2*r+1);
    for(let pass=0;pass<2;pass++){
      const a=pass?out:src;
      for(let y=0;y<h;y++){const o=y*w;let s=0;for(let i=-r;i<=r;i++)s+=a[o+clamp(i,0,w-1)];
        for(let x=0;x<w;x++){tmp[o+x]=s*k;s+=a[o+Math.min(w-1,x+r+1)]-a[o+Math.max(0,x-r)]}}
      for(let x=0;x<w;x++){let s=0;for(let i=-r;i<=r;i++)s+=tmp[clamp(i,0,h-1)*w+x];
        for(let y=0;y<h;y++){out[y*w+x]=s*k;s+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x]}}
    }
    return out;
  }
  function morph(src,w,h,r,grow){
    if(r<.5)return src;
    r=Math.round(r);const tmp=new Float32Array(src.length),out=new Float32Array(src.length);
    for(let y=0;y<h;y++){const o=y*w;for(let x=0;x<w;x++){let m=src[o+x];const e=Math.min(w-1,x+r);
      if(grow){for(let i=Math.max(0,x-r);i<=e;i++)if(src[o+i]>m)m=src[o+i]}else{for(let i=Math.max(0,x-r);i<=e;i++)if(src[o+i]<m)m=src[o+i]}tmp[o+x]=m}}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=tmp[y*w+x];const e=Math.min(h-1,y+r);
      if(grow){for(let i=Math.max(0,y-r);i<=e;i++)if(tmp[i*w+x]>m)m=tmp[i*w+x]}else{for(let i=Math.max(0,y-r);i<=e;i++)if(tmp[i*w+x]<m)m=tmp[i*w+x]}out[y*w+x]=m}
    return out;
  }
  function pixelsOf(img,w,h){
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const g=c.getContext('2d',{willReadFrequently:true});g.imageSmoothingQuality='high';g.drawImage(img,0,0,w,h);
    return g.getImageData(0,0,w,h).data;
  }
  class Picture{
    constructor(img,w,h){
      const d=pixelsOf(img,w,h),n=w*h;this.w=w;this.h=h;
      this.r=new Float32Array(n);this.g=new Float32Array(n);this.b=new Float32Array(n);
      this.hue=new Float32Array(n);this.sat=new Float32Array(n);this.val=new Float32Array(n);this.lum=new Float32Array(n);this.local={};
      for(let i=0;i<n;i++){
        const r=d[i*4]/255,g=d[i*4+1]/255,b=d[i*4+2]/255,mx=r>g?(r>b?r:b):(g>b?g:b),mn=r<g?(r<b?r:b):(g<b?g:b),c=mx-mn;
        let hh=0;if(c>1e-6){hh=mx===r?((g-b)/c+6)%6:mx===g?(b-r)/c+2:(r-g)/c+4;hh*=60}
        this.r[i]=r;this.g[i]=g;this.b[i]=b;this.hue[i]=hh;this.sat[i]=mx?c/mx:0;this.val[i]=mx;this.lum[i]=.299*r+.587*g+.114*b;
      }
    }
    blurredLum(r){return this.local[r]||(this.local[r]=boxBlur(this.lum,this.w,this.h,r))}
  }
  const band=(x,lo,hi,soft)=>x<lo?Math.max(0,1-(lo-x)/soft):x>hi?Math.max(0,1-(x-hi)/soft):1;
  function hueBand(x,lo,hi,soft){
    if(lo<=hi)return band(x,lo,hi,soft);
    if(x>=lo||x<=hi)return 1;
    return Math.max(0,1-Math.min(x-hi,lo-x)/soft);
  }
  // A key spec is {h:[lo,hi], s:[lo,hi], v:[lo,hi], bmr:[lo,hi] (blue minus red), peak:[radius,min], dark:[radius,min], soft}
  // with all its fields ANDed; a key is a list of specs ORed together. Radii are in reference-image pixels.
  // Everything below works on a window R={x,y,w,h} of the mask (a layer's bounding box plus margin).
  function keyMask(pic,specs,pxScale,R){
    const out=new Float32Array(R.w*R.h);
    for(const s of specs){
      const soft=s.soft||{},sh=soft.h||14,ss=soft.s||.07,sv=soft.v||.07;
      const pk=s.peak&&pic.blurredLum(Math.max(1,Math.round(s.peak[0]*pxScale))),dk=s.dark&&pic.blurredLum(Math.max(1,Math.round(s.dark[0]*pxScale)));
      for(let y=0,j=0;y<R.h;y++)for(let x=0,i=(R.y+y)*pic.w+R.x;x<R.w;x++,i++,j++){
        let m=1;
        if(s.h)m*=hueBand(pic.hue[i],s.h[0],s.h[1],sh);
        if(m&&s.s)m*=band(pic.sat[i],s.s[0],s.s[1],ss);
        if(m&&s.v)m*=band(pic.val[i],s.v[0],s.v[1],sv);
        if(m&&s.bmr)m*=band(pic.b[i]-pic.r[i],s.bmr[0],s.bmr[1],.06);
        if(m&&pk)m*=clamp((pic.lum[i]-pk[i]-s.peak[1])/(s.peak[1]*.8),0,1);
        if(m&&dk)m*=clamp((dk[i]-pic.lum[i]-s.dark[1])/(s.dark[1]*.8),0,1);
        if(m>out[j])out[j]=m;
      }
    }
    return out;
  }
  function shapeMask(shapes,w,h,R){
    const c=document.createElement('canvas');c.width=R.w;c.height=R.h;const g=c.getContext('2d',{willReadFrequently:true});
    g.fillStyle='#fff';g.translate(-R.x,-R.y);
    for(const s of shapes){
      g.beginPath();
      if(s.poly){const p=s.poly;g.moveTo(p[0]*w,p[1]*h);for(let i=2;i<p.length;i+=2)g.lineTo(p[i]*w,p[i+1]*h);g.closePath()}
      else if(s.ellipse){const e=s.ellipse;g.ellipse(e[0]*w,e[1]*h,e[2]*w,e[3]*h,0,0,TAU)}
      else if(s.rect){const r=s.rect;g.rect(r[0]*w,r[1]*h,(r[2]-r[0])*w,(r[3]-r[1])*h)}
      g.fill();
    }
    const d=g.getImageData(0,0,R.w,R.h).data,out=new Float32Array(R.w*R.h);
    for(let i=0;i<out.length;i++)out[i]=d[i*4+3]/255;
    return out;
  }
  function boundsOf(shapes,w,h){
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;const add=(x,y)=>{if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y};
    for(const s of shapes){
      if(s.poly)for(let i=0;i<s.poly.length;i+=2)add(s.poly[i]*w,s.poly[i+1]*h);
      else if(s.ellipse){const e=s.ellipse;add((e[0]-e[2])*w,(e[1]-e[3])*h);add((e[0]+e[2])*w,(e[1]+e[3])*h)}
      else if(s.rect){add(s.rect[0]*w,s.rect[1]*h);add(s.rect[2]*w,s.rect[3]*h)}
    }
    return [x0,y0,x1,y1];
  }
  const cropOf=(full,w,R)=>{const out=new Float32Array(R.w*R.h);for(let y=0;y<R.h;y++)out.set(full.subarray((R.y+y)*w+R.x,(R.y+y)*w+R.x+R.w),y*R.w);return out};
  const shapesOf=L=>{
    const list=[];
    if(L.poly)list.push({poly:L.poly});if(L.polys)for(const p of L.polys)list.push({poly:p});
    if(L.ellipse)list.push({ellipse:L.ellipse});if(L.rect)list.push({rect:L.rect});if(L.shapes)list.push(...L.shapes);
    return list;
  };
  function overlayMask(img,w,h){
    const d=pixelsOf(img,w,h),out=new Float32Array(w*h);let opaque=true;
    for(let i=0;i<out.length;i++)if(d[i*4+3]<250){opaque=false;break}
    for(let i=0;i<out.length;i++)out[i]=opaque?(.299*d[i*4]+.587*d[i*4+1]+.114*d[i*4+2])/255:d[i*4+3]/255;
    return out;
  }
  // motion → [{rx,ry,cos,sin} | {sx,sy} | {y0,y1,dx,dy}] in reference pixels, summed per pixel
  function motionParts(m,ref){
    return [].concat(m).map(p=>p.rotate?{kind:0,cx:p.rotate[0]*ref[0],cy:p.rotate[1]*ref[1],c:Math.cos(p.rotate[2]*Math.PI/180)-1,s:Math.sin(p.rotate[2]*Math.PI/180)}
      :p.shift?{kind:1,dx:p.shift[0],dy:p.shift[1]}:p.bend?{kind:2,y0:p.bend[0]*ref[1],y1:p.bend[1]*ref[1],dx:p.bend[2],dy:p.bend[3]}:{kind:1,dx:0,dy:0});
  }
  /* What drives a layer's motion: the scene's wind (plants, lanterns, bunting: a damped spring per layer),
     the shoreline wash (surf), or a slow independent oscillation (clouds, the sailboat's bob). */
  function driveOf(L){
    if(L.drive)return L.drive;
    if(L.type==='foam')return 'wash';
    if(/sailboat/i.test(L.name||'')||(L.speed??1.2)<.2)return 'osc';
    return 'wind';
  }
  const windDirOf=scene=>scene.windDir||Math.sign((scene.particles||[]).find(p=>p.kind==='petal')?.wind?.[0]||1)||1;
  async function buildMasks(scene,img,overlays){
    const ref=scene.size||[img.naturalWidth,img.naturalHeight],ms=scene.mask||.5,dir=windDirOf(scene);
    const w=Math.max(8,Math.round(img.naturalWidth*ms)),h=Math.max(8,Math.round(img.naturalHeight*ms)),n=w*h;
    const pxs=w/ref[0];  // mask pixels per reference-image pixel
    const pic=new Picture(img,w,h);await later();
    const ch={water:new Float32Array(n),flow:new Float32Array(n),flicker:new Float32Array(n),stars:new Float32Array(n),
      wind:new Float32Array(n),foam:new Float32Array(n),dapple:new Float32Array(n)};
    const vx=new Float32Array(n),vy=new Float32Array(n),flut=new Float32Array(n),dom=new Int16Array(n).fill(-1),domW=new Float32Array(n),drivers=[];
    const keys=Object.assign({},typeof HibiscusSceneData!=='undefined'?HibiscusSceneData.keys:null,scene.keys);
    const resolveKey=(k,R)=>{
      if(!k)return null;
      if(typeof k==='string'){
        if(overlays[k])return cropOf(overlays[k],w,R);
        const spec=keys[k];return spec?keyMask(pic,spec,pxs,R):null;
      }
      if(Array.isArray(k)&&k.some(x=>typeof x==='string')){
        const out=new Float32Array(R.w*R.h);
        for(const part of k){const m=resolveKey(part,R);if(m)for(let i=0;i<m.length;i++)if(m[i]>out[i])out[i]=m[i]}
        return out;
      }
      return keyMask(pic,Array.isArray(k)?k:[k],pxs,R);
    };
    let index=0;
    for(const L of scene.layers){
      const li=index++,shapes=shapesOf(L);
      let R={x:0,y:0,w,h};
      if(shapes.length){
        const b=boundsOf(shapes,w,h),pad=Math.ceil(((L.feather||0)+(L.grow||0)+(L.soften||0))*pxs)+4;
        const x0=clamp(Math.floor(b[0])-pad,0,w),y0=clamp(Math.floor(b[1])-pad,0,h),x1=clamp(Math.ceil(b[2])+pad,0,w),y1=clamp(Math.ceil(b[3])+pad,0,h);
        if(x1-x0<1||y1-y0<1)continue;
        R={x:x0,y:y0,w:x1-x0,h:y1-y0};
      }
      const rn=R.w*R.h;
      let m;
      if(shapes.length){m=shapeMask(shapes,w,h,R);if(L.feather)m=boxBlur(m,R.w,R.h,L.feather*pxs*.5)}
      else m=new Float32Array(rn).fill(1);
      let k=resolveKey(L.key,R);
      if(k){
        if(L.grow)k=morph(k,R.w,R.h,L.grow*pxs,true);
        if(L.shrink)k=morph(k,R.w,R.h,L.shrink*pxs,false);
        for(let i=0;i<rn;i++)m[i]*=k[i];
      }
      const not=resolveKey(L.not,R);
      if(not)for(let i=0;i<rn;i++)m[i]*=1-not[i];
      if(L.cut){const c=boxBlur(shapeMask(L.cut,w,h,R),R.w,R.h,(L.cutFeather??L.feather??4)*pxs*.5);for(let i=0;i<rn;i++)m[i]*=1-c[i]}
      if(L.soften)m=boxBlur(m,R.w,R.h,L.soften*pxs*.5);
      const amt=L.amount??1,phase=(L.phase??(li*.618034)%1)*TAU;
      if((L.motion||L.type==='flicker')&&drivers.length<MAX_DRIVERS){
        const di=drivers.length,kind=L.motion?driveOf(L):'none';
        let parts=L.motion?motionParts(L.motion,ref):[];
        const field=(px,py,q)=>{
          if(q.kind===0){const dx=px-q.cx,dy=py-q.cy;return [dx*q.c-dy*q.s,dx*q.s+dy*q.c]}
          if(q.kind===1)return [q.dx,q.dy];
          const t=clamp((py-q.y0)/(q.y1-q.y0),0,1),f=t*t*(3-2*t)*.6+t*.4;return [q.dx*f,q.dy*f];
        };
        // A wind-driven layer bends downwind: judge its upper part (where a crown or a tip is) and flip if needed.
        if(kind==='wind'&&parts.length){
          let s=0;
          for(let y=0,j=0;y<R.h;y++){const py=(R.y+y+.5)/pxs,top=1.25-y/R.h;
            for(let x=0;x<R.w;x++,j++){const a=m[j];if(a<.05)continue;const px=(R.x+x+.5)/pxs;for(const q of parts)s+=field(px,py,q)[0]*a*top}}
          if(s*dir<0)parts=parts.map(q=>q.kind===0?{...q,c:-q.c,s:-q.s}:{...q,dx:-q.dx,dy:-q.dy});
        }
        let cx=0,cw=0;
        for(let y=0,j=0;y<R.h;y++){
          const py=(R.y+y+.5)/pxs;
          for(let x=0,i=(R.y+y)*w+R.x;x<R.w;x++,i++,j++){
            const a=m[j]*amt;if(a<.002)continue;
            const px=(R.x+x+.5)/pxs;let ux=0,uy=0;
            for(const q of parts){const u=field(px,py,q);ux+=u[0];uy+=u[1]}
            vx[i]+=ux*a;vy[i]+=uy*a;
            const wt=a*(Math.sqrt(ux*ux+uy*uy)+.05);
            if(wt>domW[i]){domW[i]=wt;dom[i]=di}
            if(kind==='wind'&&a>flut[i])flut[i]=a;
            cx+=(R.x+x)*a;cw+=a;
          }
        }
        drivers.push({kind,name:L.name||'',x:cw?cx/cw/w:.5,speed:L.speed??(L.type==='flicker'?1.7:1.2),phase,gust:L.gust??1});
      }
      const target=ch[L.type];
      if(target){for(let y=0,j=0;y<R.h;y++)for(let x=0,i=(R.y+y)*w+R.x;x<R.w;x++,i++,j++){const a=m[j]*amt;if(a>target[i])target[i]=a}}
      await later();
    }
    // Spread each layer's index a few texels past its edge, so the soft rim of a layer reads its own driver.
    for(let pass=0;pass<3;pass++){
      const src=dom.slice();
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(src[i]>=0)continue;
        const v=x>0&&src[i-1]>=0?src[i-1]:x<w-1&&src[i+1]>=0?src[i+1]:y>0&&src[i-w]>=0?src[i-w]:y<h-1&&src[i+w]>=0?src[i+w]:-1;if(v>=0)dom[i]=v}
    }
    const fx=new Uint8Array(n*4),mo=new Uint8Array(n*4),aux=new Uint8Array(n*4);
    const b=v=>v<=0?0:v>=1?255:Math.round(v*255);
    for(let i=0;i<n;i++){
      fx[i*4]=b(ch.water[i]);fx[i*4+1]=b(ch.flow[i]);fx[i*4+2]=b(ch.flicker[i]);fx[i*4+3]=b(ch.stars[i]);
      mo[i*4]=Math.round(128+clamp(vx[i]/MOTION_MAX,-1,1)*127);mo[i*4+1]=Math.round(128+clamp(vy[i]/MOTION_MAX,-1,1)*127);
      mo[i*4+2]=dom[i]<0?0:dom[i];mo[i*4+3]=b(flut[i]);
      aux[i*4]=b(ch.wind[i]);aux[i*4+1]=b(ch.foam[i]);aux[i*4+2]=0;aux[i*4+3]=b(ch.dapple[i]);
    }
    return {w,h,fx,mo,aux,drivers,dir};
  }
  async function masksFor(id,scene,img,src){
    const key=id+'|'+src;
    if(maskCache.has(key)){const v=maskCache.get(key);maskCache.delete(key);maskCache.set(key,v);return v}
    const overlays={},mw=Math.max(8,Math.round(img.naturalWidth*(scene.mask||.5))),mh=Math.max(8,Math.round(img.naturalHeight*(scene.mask||.5)));
    for(const [name,url] of Object.entries(scene.overlays||{})){
      try{const o=await loadImage(new URL(url,base).href);overlays[name]=overlayMask(o,mw,mh)}catch{}
    }
    const p=buildMasks(scene,img,overlays);
    maskCache.set(key,p);
    p.catch(()=>maskCache.delete(key));
    while(maskCache.size>4)maskCache.delete(maskCache.keys().next().value);
    return p;
  }

  /* ---------- shaders ---------- */
  const VERT_BG=`varying vec2 vUv;void main(){vUv=vec2(position.x*.5+.5,.5-position.y*.5);gl_Position=vec4(position.xy,0.,1.);}`;
  const FRAG_BG=`
precision highp float;
uniform sampler2D uImg,uFx,uMo,uAux,uNoise;
uniform vec2 uImgSize,uView,uMaskSize;
uniform vec4 uRect,uWater,uWater2;
uniform float uBias,uTime,uClock,uWindT,uAmp,uWindPx,uFlowSpeed,uFlowLen,uDebug,uFoam,uSwell;
uniform float uDrive[${MAX_DRIVERS}],uWind[${WIND_SAMPLES}];
varying vec2 vUv;
float windAt(float x){float f=clamp(x,0.,1.)*${(WIND_SAMPLES-1).toFixed(1)};int i=int(floor(f));int j=min(i+1,${WIND_SAMPLES-1});return mix(uWind[i],uWind[j],f-float(i));}
float hash1(float c,float i){return fract(sin(7.*127.1+c*311.7+i*74.7)*43758.5453);}
// the shoreline wash, the same shape as HibiscusNature.wash (fast push in, slow slide back)
float washAt(float t,float x){
  float p=t/8.5+clamp(x,0.,1.)*.35,c=floor(p),f=p-c;
  float s=f<.3?smoothstep(0.,1.,f/.3):1.-smoothstep(0.,1.,(f-.3)/.7);
  float a=hash1(c,6.)>.82?1.15:.6+.4*hash1(c,8.);
  return s*a;
}
void main(){
  vec2 uv=(vUv*uView-uRect.xy)/uRect.zw;
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.){gl_FragColor=vec4(0.);return;}
  vec2 p=uv*uImgSize;
  vec4 fx=texture2D(uFx,uv),mo=texture2D(uMo,uv),aux=texture2D(uAux,uv);
  float idx=floor(texture2D(uMo,(floor(uv*uMaskSize)+.5)/uMaskSize).b*255.+.5);
  if(uDebug>.5){vec3 m=uDebug<1.5?fx.rgb+vec3(fx.a):uDebug<2.5?vec3(abs(mo.r*255.-128.)/24.,abs(mo.g*255.-128.)/24.,mo.a*.6+fract(idx*.618)*.4):aux.rgb+vec3(aux.a*.5);
    gl_FragColor=vec4(texture2D(uImg,uv).rgb*.3+min(m,1.)*.75,1.);return;}
  float wHere=windAt(uv.x);
  vec2 v=(mo.rg*255.-128.)/127.*${MOTION_MAX.toFixed(1)};
  float ph=idx*2.39996;
  vec2 off=v*uDrive[int(idx)]*uAmp;
  // leaf flutter toward the tips of wind-driven plants (|v| is largest there), stronger in a gust
  if(mo.a>.01){vec2 fn=texture2D(uNoise,p/vec2(70.,55.)+uWindT*vec2(.05,.031)).rg-.5;off+=fn*length(v)*mo.a*(.15+.5*wHere)*.55*uAmp;}
  if(aux.r>.002){vec2 wn=texture2D(uNoise,p/vec2(420.,330.)+uWindT*vec2(.011,.005)).rg-.5;off+=aux.r*wn*2.2*uWindPx*(.3+.85*wHere)*uAmp;}
  float wm=fx.r,f=1.,shim=0.,sw=0.;vec2 q=vec2(0.);
  if(wm>.002){
    if(uWater2.x>0.)f=clamp((uv.y-uWater2.x)/uWater2.y,.1,1.);
    q=p/(uWater.y*f)*vec2(1./uWater2.z,1.);
    // fine ripples: two slow noise fields drifting past each other
    vec2 n1=texture2D(uNoise,q*.05+uTime*vec2(.004,.009)).rg-.5;
    vec2 n2=texture2D(uNoise,q*.083+vec2(.37,.11)-uTime*vec2(.007,.006)).gr-.5;
    vec2 wv=(n1+n2*.8)*.75;shim=wv.y;
    // swell: long crests rolling toward the viewer, bent by a slow noise so they never line up
    float bendc=texture2D(uNoise,q*.012+vec2(.2,.7)+uTime*.0015).r*5.;
    float sph=q.y*1.15+q.x*.08+bendc-uTime*.75;
    sw=sin(sph)*(.7+.3*sin(sph*.37+q.x*.05));
    off+=wm*(wv+vec2(0.,sw*.55*uSwell))*uWater.x*f*uAmp;
  }
  vec2 sp2=p+off;vec3 col;
  if(fx.g>.002){
    float ft=uTime*uFlowSpeed+texture2D(uNoise,p/140.).a*2.;
    float f1=fract(ft),f2=fract(ft+.5),w=abs(1.-2.*f1),L=uFlowLen*fx.g*uAmp;
    vec3 c1=texture2D(uImg,(sp2-vec2(0.,f1*L))/uImgSize,uBias).rgb,c2=texture2D(uImg,(sp2-vec2(0.,f2*L))/uImgSize,uBias).rgb;
    col=mix(c1,c2,w);
  }else col=texture2D(uImg,sp2/uImgSize,uBias).rgb;
  if(wm>.002){
    float lum=dot(col,vec3(.299,.587,.114));
    col*=1.+wm*(shim*.06+sw*.035*uSwell)*uAmp;
    float g1=texture2D(uNoise,q*.21+uTime*vec2(.012,.022)).b,g2=texture2D(uNoise,q*.17+vec2(.5,.2)-uTime*vec2(.016,.009)).b;
    float pch=smoothstep(.38,.72,texture2D(uNoise,q*.012+uTime*vec2(.003,-.002)).r);
    float gl=smoothstep(uWater2.w,uWater2.w+.16,g1*g2+pch*.08)*pch*smoothstep(uWater.w-.25,uWater.w+.1,lum);
    col+=gl*wm*uWater.z*uAmp*(vec3(.55,.53,.5)+col*.5);
  }
  if(aux.g>.002){
    float br=washAt(uClock,uv.x)*(.7+.6*texture2D(uNoise,p/90.+vec2(uClock*.004,0.)).g);
    col=mix(col,col+(1.-col)*.42,aux.g*clamp(br,0.,1.3)*uFoam*uAmp);
  }
  if(fx.b>.002){
    float h=texture2D(uNoise,p*.0035+vec2(uTime*.021,0.)).b;
    float fl=sin(uTime*1.3+ph)*.45+sin(uTime*3.7+ph*2.)*.25+(h-.5)*.9;
    col*=1.+fx.b*fl*.16*uAmp;
  }
  if(fx.a>.002){
    float tw=texture2D(uNoise,p*.0042+vec2(uTime*.03,uTime*.011)).b*texture2D(uNoise,p*.0031-vec2(uTime*.017,0.)).b*2.4;
    col*=mix(1.,.45+tw*tw*.8,fx.a*uAmp);
  }
  if(aux.a>.002){
    float n=texture2D(uNoise,p/260.+vec2(uWindT*.012,uWindT*.006)).g;
    col*=1.+aux.a*(n-.5)*.34*uAmp;
  }
  gl_FragColor=vec4(col,1.);
}`;
  const VERT_SPR=`
attribute vec2 aCenter;attribute vec2 aSize;attribute float aRot;attribute vec4 aColor;attribute vec4 aExtra;
uniform vec4 uRect;uniform vec2 uView,uImgSize;uniform float uTime,uAmp,uMinPx;
varying vec2 vC;varying vec4 vColor;varying float vKind;
void main(){
  vec2 sc=uRect.zw/uImgSize;float s=sqrt(sc.x*sc.y);
  vec2 sz=aSize*s;float big=max(sz.x,sz.y);if(big<uMinPx&&aExtra.x>1.5)sz*=uMinPx/big;
  vec2 d=position.xy*sz*.5;float c=cos(aRot),n=sin(aRot);d=vec2(d.x*c-d.y*n,d.x*n+d.y*c);
  vec2 css=uRect.xy+aCenter*sc+d;
  gl_Position=vec4(css.x/uView.x*2.-1.,1.-css.y/uView.y*2.,0.,1.);
  vC=position.xy;vKind=aExtra.x;
  float a=aColor.a;
  if(aExtra.z>0.&&aExtra.x>.5&&aExtra.x<1.5){float h=aExtra.y,w=.5+.5*sin(uTime*(.55+h*.9)+h*40.);a*=mix(1.,pow(w,7.)*2.6,aExtra.z);}
  else if(aExtra.z>0.){float h=aExtra.y;a*=1.+aExtra.z*(sin(uTime*(1.1+h*1.7)+h*40.)*.55+sin(uTime*(3.3+h*3.1)+h*13.)*.3+sin(uTime*(9.+h*6.)+h*7.)*.15);}
  vColor=vec4(aColor.rgb,a*uAmp);
}`;
  const FRAG_SPR=`
precision highp float;
varying vec2 vC;varying vec4 vColor;varying float vKind;
float seg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
void main(){
  vec2 q=vC;float r=length(q),a=0.;vec3 c=vColor.rgb;float add=0.;
  if(vKind<.5){a=exp(-r*r*5.)*(1.-smoothstep(.85,1.,r));add=1.;}                       // glow
  else if(vKind<1.5){a=exp(-r*r*16.)*.8+exp(-abs(q.x)*22.)*exp(-abs(q.y)*3.2)*.7+exp(-abs(q.y)*22.)*exp(-abs(q.x)*3.2)*.7;a*=1.-smoothstep(.8,1.,r);add=1.;} // star glint
  else if(vKind<2.5){float d=length(q*vec2(1.,1.75));a=1.-smoothstep(.72,1.,d);c*=.82+.25*(.5-q.y*.5);}      // petal
  else if(vKind<3.5){vec2 p=vec2(abs(q.x),q.y);                                                               // butterfly
    float w1=length((p-vec2(.45,-.18))/vec2(.46,.4)),w2=length((p-vec2(.3,.32))/vec2(.3,.27));
    float wing=1.-smoothstep(.85,1.,min(w1,w2));float body=(1.-smoothstep(.05,.1,p.x))*(1.-smoothstep(.45,.55,abs(q.y)));
    a=max(wing,body);c=mix(c,c*.55,smoothstep(.5,.95,min(w1,w2)));c=mix(c,vec3(.25,.15,.2),body);}
  else if(vKind<4.5){a=exp(-r*r*18.)+exp(-r*r*4.)*.35;a*=1.-smoothstep(.8,1.,r);add=1.;}               // firefly
  else{vec2 p=vec2(abs(q.x),q.y);float d=min(seg(p,vec2(0.,.12),vec2(.45,-.22)),seg(p,vec2(.45,-.22),vec2(.95,.05)));a=1.-smoothstep(.06,.13,d);} // gull
  a*=vColor.a;
  gl_FragColor=vec4(c*a,a*(1.-add));
}`;

  /* ---------- particles (CPU simulated, image pixels) ---------- */
  const KIND={glow:0,star:1,petal:2,butterfly:3,firefly:4,gull:5,sparkle:1};
  const hex=s=>{const v=parseInt(String(s).replace('#',''),16);return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255]};
  class Swarm{
    constructor(specs,ref,img,lowFactor){
      this.list=[];this.ref=ref;this.sx=img[0]/ref[0];this.sy=img[1]/ref[1];
      for(const s of specs||[]){const count=Math.max(1,Math.round(s.n*lowFactor));for(let i=0;i<count;i++)this.list.push(this.spawn({spec:s,seed:Math.random()},true))}
    }
    area(s){const a=s.area||[0,0,1,1];return [a[0]*this.ref[0]*this.sx,a[1]*this.ref[1]*this.sy,a[2]*this.ref[0]*this.sx,a[3]*this.ref[1]*this.sy]}
    spawn(p,first){
      const s=p.spec,a=this.area(s),colors=s.color?[].concat(s.color):['#ffffff'],size=s.size||[6,9],k=(this.sx+this.sy)/2;
      Object.assign(p,{x:rand(a[0],a[2]),y:rand(a[1],a[3]),vx:0,vy:0,age:first?-rand(0,s.kind==='petal'?(s.life||8)*.35:1):-rand(.3,s.kind==='petal'?4:2),
        life:(s.life||8)*rand(.75,1.25),size:rand(size[0],size[1])*k,rot:rand(0,TAU),vr:rand(-1.5,1.5),color:hex(colors[Math.random()*colors.length|0]),
        tx:0,ty:0,flap:rand(0,TAU),alpha:0,scare:0});
      if(s.kind==='gull'){p.dir=Math.random()<.5?-1:1;p.x=first?rand(a[0],a[2]):p.dir>0?a[0]:a[2];p.life=1e9;p.age=first?1:-rand(2,10)}
      if(s.kind==='firefly'||s.kind==='butterfly'){p.tx=rand(a[0],a[2]);p.ty=rand(a[1],a[3]);p.life=s.kind==='firefly'?rand(4,9):1e9}
      if(s.kind==='sparkle'){p.life=rand(.35,.9);p.age=-rand(0,s.gap||1.5)}
      return p;
    }
    update(dt,t,actor,gust){
      const flee=(p,src,radius,force)=>{if(!src)return;const dx=p.x-src[0],dy=p.y-src[1],d=Math.hypot(dx,dy);if(d<radius&&d>.01){const f=(1-d/radius)*force;p.vx+=dx/d*f*dt;p.vy+=dy/d*f*dt;p.scare=Math.min(1,p.scare+dt*3)}};
      for(const p of this.list){
        const s=p.spec,a=this.area(s);p.age+=dt;
        if(p.age<0){p.alpha=0;continue}
        const k=s.kind,R=(s.scatter||120)*this.sx;
        if(k==='petal'){
          const wind=s.wind||[18,10];
          p.vx+=((wind[0]*this.sx*gust+Math.sin(t*.7+p.seed*20)*14)-p.vx)*dt*.8;p.vy+=((wind[1]*this.sy+Math.sin(t*2.1+p.seed*9)*9)-p.vy)*dt*.8;
          flee(p,actor,R*1.2,1100);
          p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=(p.vr+p.vx*.01)*dt;
          const t01=p.age/p.life;p.alpha=Math.min(1,p.age*1.5)*Math.min(1,(1-t01)*4);
          p.w=p.size*(.55+.45*Math.abs(Math.cos(t*2+p.seed*9)));p.h=p.size;
          if(p.age>p.life||p.x<-40||p.y<-40||p.x>this.ref[0]*this.sx+40||p.y>(s.floor||1)*this.ref[1]*this.sy)this.spawn(p);
        }else if(k==='butterfly'||k==='firefly'){
          if(Math.hypot(p.tx-p.x,p.ty-p.y)<12||Math.random()<dt*.25){p.tx=rand(a[0],a[2]);p.ty=rand(a[1],a[3])}
          const spd=(k==='butterfly'?42:14)*this.sx,dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy)||1;
          p.vx+=(dx/d*spd-p.vx)*dt*(k==='butterfly'?1.6:.6)+Math.sin(t*3+p.seed*30)*(k==='butterfly'?40:6)*dt;
          p.vy+=(dy/d*spd-p.vy)*dt*(k==='butterfly'?1.6:.6)+Math.cos(t*2.6+p.seed*17)*(k==='butterfly'?50:6)*dt;
          flee(p,actor,R,k==='butterfly'?700:260);
          const vmax=spd*(2.5+p.scare*2);const v=Math.hypot(p.vx,p.vy);if(v>vmax){p.vx*=vmax/v;p.vy*=vmax/v}
          p.x+=p.vx*dt;p.y+=p.vy*dt;p.scare=Math.max(0,p.scare-dt);
          if(k==='butterfly'){p.flap+=dt*(11+p.scare*8);p.alpha=Math.min(1,p.age);p.w=p.size*(.2+.8*Math.abs(Math.cos(p.flap)));p.h=p.size*.8;p.rot=clamp(p.vx*.004,-.5,.5)}
          else{const t01=p.age/p.life;p.alpha=Math.max(0,Math.sin(Math.PI*t01))*(.55+.45*Math.sin(t*2.3+p.seed*40));p.w=p.h=p.size;if(p.age>p.life)this.spawn(p)}
        }else if(k==='gull'){
          p.x+=p.dir*(s.speed||9)*this.sx*dt;p.flap+=dt*(Math.sin(t*.4+p.seed*10)>.3?6:0);
          p.y=(a[1]+a[3])/2+(a[3]-a[1])/2*Math.sin(t*.13+p.seed*20)+Math.sin(p.flap)*.6;
          const edge=Math.min(p.x-a[0],a[2]-p.x)/Math.max(1,(a[2]-a[0])*.15);p.alpha=Math.min(1,p.age*.5)*clamp(edge,0,1)*(s.alpha||.85);p.w=p.size;p.h=p.size*(.55+.25*Math.sin(p.flap));p.rot=p.dir*.06*Math.sin(t*.5+p.seed);
          if(p.x<a[0]||p.x>a[2])this.spawn(p);
        }else if(k==='sparkle'){
          const t01=p.age/p.life;p.alpha=Math.sin(Math.PI*Math.min(1,t01));p.w=p.h=p.size*(.5+.5*p.alpha);p.rot=.3;
          if(p.age>p.life)this.spawn(p);
        }
      }
    }
  }
  class SpriteBatch{
    constructor(T,material,count){
      this.T=T;this.count=count;const n=count*4,g=new T.BufferGeometry();
      const pos=new Float32Array(n*3),idx=new Uint16Array(count*6);
      for(let i=0;i<count;i++){const c=[[-1,-1],[1,-1],[1,1],[-1,1]];for(let k=0;k<4;k++){pos[(i*4+k)*3]=c[k][0];pos[(i*4+k)*3+1]=c[k][1]}
        idx.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6)}
      g.setAttribute('position',new T.BufferAttribute(pos,3));g.setIndex(new T.BufferAttribute(idx,1));
      this.attr={};
      for(const [name,size] of [['aCenter',2],['aSize',2],['aRot',1],['aColor',4],['aExtra',4]]){
        const a=new T.BufferAttribute(new Float32Array(n*size),size);a.setUsage(T.DynamicDrawUsage);g.setAttribute(name,a);this.attr[name]=a;
      }
      this.geometry=g;this.mesh=new T.Mesh(g,material);this.mesh.frustumCulled=false;
    }
    set(i,cx,cy,w,h,rot,r,g,b,a,kind,seed,flick,hover){
      const A=this.attr;
      for(let k=0;k<4;k++){const v=i*4+k;
        A.aCenter.array[v*2]=cx;A.aCenter.array[v*2+1]=cy;A.aSize.array[v*2]=w;A.aSize.array[v*2+1]=h;A.aRot.array[v]=rot;
        A.aColor.array.set([r,g,b,a],v*4);A.aExtra.array.set([kind,seed,flick,hover],v*4)}
    }
    flush(){for(const a of Object.values(this.attr))a.needsUpdate=true}
    dispose(){this.geometry.dispose()}
  }

  /* ---------- renderer pool (one WebGL context reused across room changes) ---------- */
  function takeRenderer(T){
    const r=pool.pop();if(r)return r;
    const canvas=document.createElement('canvas');
    const renderer=new T.WebGLRenderer({canvas,alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,
      preserveDrawingBuffer:false,powerPreference:'default',failIfMajorPerformanceCaveat:!config.allowSoftwareGL});
    renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.LinearSRGBColorSpace;
    return renderer;
  }
  function releaseRenderer(renderer){
    const c=renderer.domElement;c.remove();
    if(pool.length<1&&!renderer.getContext().isContextLost())pool.push(renderer);
    else{renderer.dispose();renderer.forceContextLoss()}
  }

  /* ---------- one mounted scene ---------- */
  class Scene{
    constructor(el,id,opts){
      this.el=el;this.id=id;this.opts=opts||{};this.data=sceneData(id);this.state='idle';this.paused=false;this.visible=true;
      this.t=0;this.last=0;this.raf=0;this.amp=0;this.windT=0;this.springs=[];
      this.actor=null;this.frameTimes=[];this.ema=16;this.level=0;this.stats={frames:0,slow:0};
      this.onVisibility=()=>this.kick();
      if(this.data)this.start();
    }
    async start(){
      if(!wanted()||!hasWebGL2()||!this.el.isConnected){this.state='still';return}
      this.state='loading';
      try{
        const [T]=await Promise.all([loadThree()]);
        if(this.state!=='loading')return;
        const src=backgroundURL(this.el)||new URL(this.data.image,base).href;
        const img=await loadImage(src);if(this.state!=='loading')return;
        const masks=await masksFor(this.id,this.data,img,src);if(this.state!=='loading')return;
        this.build(T,img,masks);
        if(this.renderer.compileAsync&&this.renderer.extensions.has('KHR_parallel_shader_compile'))await this.renderer.compileAsync(this.scene,this.camera);
        if(this.state!=='loading')return;
        if(this.shaderFailed)throw new Error('shader');
        this.state='live';
        this.observe();
        this.kick();
      }catch(e){
        if(this.state==='loading'){this.state='failed';this.teardown()}
        if(this.opts.onError)this.opts.onError(e);
      }
    }
    build(T,img,masks){
      this.T=T;const d=this.data,ref=d.size||[img.naturalWidth,img.naturalHeight];
      this.img=[img.naturalWidth,img.naturalHeight];this.ref=ref;this.k=img.naturalWidth/ref[0];this.masks=masks;
      const r=this.renderer=takeRenderer(T),canvas=r.domElement;
      this.shaderFailed=false;r.debug.onShaderError=()=>{this.shaderFailed=true};
      canvas.setAttribute('aria-hidden','true');canvas.className='scene-fx-canvas';
      canvas.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none;visibility:hidden';
      this.el.insertBefore(canvas,this.el.firstChild);
      this.contextLost=e=>{e.preventDefault();this.fail()};canvas.addEventListener('webglcontextlost',this.contextLost);
      const tex=this.tex=[];
      const imgTex=new T.Texture(img);imgTex.flipY=false;imgTex.colorSpace=T.NoColorSpace;imgTex.generateMipmaps=true;
      imgTex.minFilter=T.LinearMipmapLinearFilter;imgTex.magFilter=T.LinearFilter;imgTex.anisotropy=Math.min(4,r.capabilities.getMaxAnisotropy());imgTex.needsUpdate=true;tex.push(imgTex);
      const dataTex=(arr,w,h,filter,wrap)=>{const t=new T.DataTexture(arr,w,h,T.RGBAFormat,T.UnsignedByteType);t.flipY=false;t.colorSpace=T.NoColorSpace;
        t.minFilter=t.magFilter=filter;t.wrapS=t.wrapT=wrap;t.generateMipmaps=false;t.needsUpdate=true;tex.push(t);return t};
      const nz=makeNoise();
      const W=d.water||{},fl=d.flow||{};
      this.bgUniforms={
        uImg:{value:imgTex},uFx:{value:dataTex(masks.fx,masks.w,masks.h,T.LinearFilter,T.ClampToEdgeWrapping)},
        uMo:{value:dataTex(masks.mo,masks.w,masks.h,T.LinearFilter,T.ClampToEdgeWrapping)},uAux:{value:dataTex(masks.aux,masks.w,masks.h,T.LinearFilter,T.ClampToEdgeWrapping)},
        uNoise:{value:dataTex(nz.data,nz.size,nz.size,T.LinearFilter,T.RepeatWrapping)},
        uImgSize:{value:new T.Vector2(this.img[0],this.img[1])},uView:{value:new T.Vector2(1,1)},uRect:{value:new T.Vector4(0,0,1,1)},
        uTime:{value:0},uClock:{value:0},uWindT:{value:0},uAmp:{value:0},uMaskSize:{value:new T.Vector2(masks.w,masks.h)},
        uDrive:{value:new Float32Array(MAX_DRIVERS)},uWind:{value:new Float32Array(WIND_SAMPLES)},uSwell:{value:W.swell??1},
        uWindPx:{value:(d.wind?.px??1)*this.k},uFlowSpeed:{value:fl.speed??1.2},uFlowLen:{value:(fl.len??8)*this.k},
        uWater:{value:new T.Vector4((W.px??1.2)*this.k,(W.scale??40)*this.k,W.glint??.8,W.glintLum??.5)},
        uWater2:{value:new T.Vector4(W.horizon??0,W.depth??.3,W.stretch??1.6,W.glintAt??.4)},
        uDebug:{value:config.debug|0},uBias:{value:config.lodBias},uFoam:{value:d.foam??1}
      };
      const scene=this.scene=new T.Scene(),cam=this.camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
      const quad=this.quad=new T.BufferGeometry();quad.setAttribute('position',new T.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));
      this.bgMat=new T.ShaderMaterial({uniforms:this.bgUniforms,vertexShader:VERT_BG,fragmentShader:FRAG_BG,depthTest:false,depthWrite:false});
      const bg=new T.Mesh(quad,this.bgMat);bg.frustumCulled=false;scene.add(bg);
      this.sprUniforms={uRect:this.bgUniforms.uRect,uView:this.bgUniforms.uView,uImgSize:this.bgUniforms.uImgSize,uTime:this.bgUniforms.uTime,
        uAmp:this.bgUniforms.uAmp,uMinPx:{value:3}};
      this.sprMat=new T.ShaderMaterial({uniforms:this.sprUniforms,vertexShader:VERT_SPR,fragmentShader:FRAG_SPR,side:T.DoubleSide,transparent:true,depthTest:false,depthWrite:false,
        blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.OneFactor,blendDst:T.OneMinusSrcAlphaFactor,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneMinusSrcAlphaFactor});
      const lights=d.lights||[];
      if(lights.length){
        this.lights=new SpriteBatch(T,this.sprMat,lights.length);
        lights.forEach((L,i)=>{const c=hex(L.color||'#ffd590'),rr=(L.r||20)*this.k,asp=L.aspect||1;
          this.lights.set(i,L.at[0]*this.img[0],L.at[1]*this.img[1],rr*2,rr*2/asp,L.rot||0,c[0],c[1],c[2],L.i??.5,KIND[L.kind||'glow'],Math.random(),L.flicker??.35,L.hover??.8)});
        this.lights.flush();scene.add(this.lights.mesh);
      }
      this.buildSwarm(1);
      this.resize();
    }
    buildSwarm(factor){
      const T=this.T;
      if(this.parts){this.scene.remove(this.parts.mesh);this.parts.dispose();this.parts=null}
      this.swarm=new Swarm(this.data.particles,this.ref,this.img,factor);
      if(this.swarm.list.length){this.parts=new SpriteBatch(T,this.sprMat,this.swarm.list.length);this.scene.add(this.parts.mesh)}
    }
    observe(){
      this.io=new IntersectionObserver(es=>{for(const e of es)this.visible=e.isIntersecting;if(!this.el.isConnected)this.unmount();else this.kick()});
      this.io.observe(this.el);
      this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(this.el);
      document.addEventListener('visibilitychange',this.onVisibility);
    }
    resize(){
      if(!this.renderer)return;
      const f=this.frame=framing(this.el,this.img[0],this.img[1]);
      if(!f.W||!f.H)return;
      const dpr=Math.min(window.devicePixelRatio||1,config.maxPixelRatio)*[1,.8,.65,.5][this.level];
      this.renderer.setPixelRatio(dpr);this.renderer.setSize(f.W,f.H,false);
      this.bgUniforms.uView.value.set(f.W,f.H);this.bgUniforms.uRect.value.set(f.x,f.y,f.w,f.h);
      this.scale=Math.sqrt(f.w*f.h/(this.img[0]*this.img[1]));
      if(this.state==='live'&&!this.raf)this.renderFrame(performance.now(),true);
    }
    toImage(cx,cy){const f=this.frame;return f?[(cx-f.x)/f.w*this.img[0],(cy-f.y)/f.h*this.img[1]]:null}
    shouldRun(){return this.state==='live'&&!this.paused&&this.visible&&!document.hidden&&this.el.isConnected}
    kick(){
      if(this.state!=='live')return;
      const still=!wanted();
      if(still!==!!this.still){this.still=still;this.renderer.domElement.style.display=still?'none':'block';if(!still){this.amp=0;this.last=0}}
      if(still||!this.shouldRun()){if(this.raf){cancelAnimationFrame(this.raf);this.raf=0}return}
      if(!this.raf){this.last=0;this.raf=requestAnimationFrame(n=>this.renderFrame(n))}
    }
    renderFrame(now,once){
      if(!once)this.raf=0;
      if(this.state!=='live')return;
      if(!once&&!this.shouldRun())return;
      const dt=this.last?Math.min(.1,(now-this.last)/1000):0;this.last=now;
      if(!once)this.advance(dt);
      this.draw();
      if(this.state!=='live')return;
      if(!once){this.watchPerformance(dt);this.raf=requestAnimationFrame(n=>this.renderFrame(n))}
    }
    /* One step of the weather: the wind across the picture, each layer's spring, the wash, the particles. */
    advance(dt){
      this.t=(this.t+dt)%3600;this.amp=Math.min(1,this.amp+dt/1.2);this.stats.frames++;
      const U=this.bgUniforms,N=nature(),clk=config.clock?config.clock():N?N.now():this.t,dir=this.masks.dir||1,seed=N?N.seed(this.id):0;
      const windAt=x=>N?N.wind(seed,clk,dir>0?x:1-x):.3;
      for(let i=0;i<WIND_SAMPLES;i++)U.uWind.value[i]=windAt(i/(WIND_SAMPLES-1));
      const mid=U.uWind.value[(WIND_SAMPLES-1)>>1];
      this.windT=(this.windT+dt*(.45+mid))%1000;
      U.uWindT.value=this.windT;U.uClock.value=clk%(8.5*400);U.uTime.value=this.t;
      const drive=U.uDrive.value;
      this.masks.drivers.forEach((d,i)=>{
        if(d.kind==='wind'){
          const sp=this.springs[i]||(this.springs[i]={x:0,v:0}),w=windAt(d.x),om=clamp(d.speed*1.6,1.3,3.4),z=.3,ph=d.phase,t=this.t;
          const turb=.5*Math.sin(t*2.83+ph)+.3*Math.sin(t*5.21+ph*2.1)+.2*Math.sin(t*8.6+ph*.6);
          const F=d.gust*((w-.3)*1.5+turb*(.1+.35*w));
          const n=Math.max(1,Math.ceil(dt*90)),h=dt/n;
          for(let k=0;k<n;k++){sp.v+=(om*om*(F-sp.x)-2*z*om*sp.v)*h;sp.x+=sp.v*h}
          drive[i]=sp.x;
        }else if(d.kind==='osc')drive[i]=Math.sin(this.t*d.speed+d.phase)*.78+Math.sin(this.t*d.speed*2.31+d.phase*1.7)*.22;
        else if(d.kind==='wash')drive[i]=N?(N.wash(clk,d.x)*2-1)*.9:0;
        else drive[i]=0;
      });
      if(this.parts&&dt){
        this.swarm.update(dt,this.t,this.readActor(),.5+mid);
        this.swarm.list.forEach((p,i)=>{const k=KIND[p.spec.kind];this.parts.set(i,p.x,p.y,p.w||p.size,p.h||p.size,p.rot,p.color[0],p.color[1],p.color[2],Math.max(0,p.alpha)*(p.spec.alpha??1),k,p.seed,0,0)});
        this.parts.flush();
      }
    }
    draw(){
      const s=this.amp*this.amp*(3-2*this.amp);
      this.bgUniforms.uAmp.value=this.opts.still?0:s;
      this.renderer.render(this.scene,this.camera);
      if(this.shaderFailed){this.fail();return}
      if(this.renderer.domElement.style.visibility==='hidden')this.renderer.domElement.style.visibility='visible';
    }
    readActor(){
      if(this.actorXY){const f=this.frame;return f?this.toImage(this.actorXY[0]*f.W,this.actorXY[1]*f.H):null}
      const a=this.opts.actor;if(!a)return null;
      const el=typeof a==='string'?this.el.querySelector(a):a;if(!el||!el.isConnected)return null;
      const r=el.getBoundingClientRect(),c=this.el.getBoundingClientRect();
      return this.toImage(r.left-c.left-this.el.clientLeft,r.bottom-c.top-this.el.clientTop);
    }
    watchPerformance(dt){
      if(!dt||config.quality!=='auto')return;
      this.ema+=(dt*1000-this.ema)*.05;
      if(this.stats.frames>90&&this.ema>26&&this.level<3){
        this.stats.slow++;this.level++;this.ema=16;this.stats.frames=0;
        if(this.level===2)this.buildSwarm(.5);
        this.resize();
      }
    }
    setPaused(p){this.paused=!!p;this.kick()}
    fail(){if(this.state==='live'||this.state==='loading'){this.state='failed';this.teardown()}}
    teardown(){
      if(this.raf)cancelAnimationFrame(this.raf);this.raf=0;
      this.io?.disconnect();this.ro?.disconnect();this.io=this.ro=null;
      document.removeEventListener('visibilitychange',this.onVisibility);
      if(this.renderer){
        this.scene?.traverse(o=>{if(o.isMesh){o.geometry.dispose()}});
        this.bgMat?.dispose();this.sprMat?.dispose();this.lights?.dispose();this.parts?.dispose();this.quad?.dispose();
        for(const t of this.tex||[])t.dispose();
        this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);
        this.renderer.renderLists.dispose();
        releaseRenderer(this.renderer);
      }
      this.renderer=this.scene=this.tex=this.lights=this.parts=this.swarm=this.masks=null;
    }
    unmount(){
      if(this.state==='disposed')return;
      this.state='disposed';this.teardown();mounts.delete(this);
      if(byElement.get(this.el)===this)byElement.delete(this.el);
      if(!mounts.size&&ticker){clearInterval(ticker);ticker=0}
    }
  }

  function tick(){
    for(const m of [...mounts]){
      if(!m.el.isConnected){m.unmount();continue}
      if(m.state==='still'&&wanted()&&m.data){m.start();continue}
      m.kick();
    }
  }
  const onReduced=()=>tick();
  if(reducedQuery.addEventListener)reducedQuery.addEventListener('change',onReduced);else reducedQuery.addListener(onReduced);

  function handleFor(m){
    return {
      unmount:()=>m.unmount(),
      setPaused:p=>m.setPaused(p),
      resize:()=>m.resize(),
      setActor:(x,y)=>{m.actorXY=x==null?null:[x,y]},
      get state(){return m.state==='live'&&m.still?'still':m.state},
      get _scene(){return m},
      /* Tests: advance the weather by dt seconds and draw once (use while paused, with config.clock set). */
      _step:dt=>{if(m.state==='live'){m.advance(dt);m.draw()}},
      info:()=>({state:m.state,still:!!m.still,level:m.level,frame:m.frame,ema:m.ema,frames:m.stats.frames,
        memory:m.renderer?{...m.renderer.info.memory}:null,render:m.renderer?{...m.renderer.info.render}:null,particles:m.swarm?.list.length||0})
    };
  }

  return {
    mount(el,sceneId,opts){
      if(!el)return null;
      const prev=byElement.get(el);if(prev)prev.unmount();
      const m=new Scene(el,sceneId,opts);mounts.add(m);byElement.set(el,m);
      if(!ticker)ticker=setInterval(tick,1000);
      return handleFor(m);
    },
    setEnabled(on){enabled=!!on;tick()},
    isEnabled:()=>enabled,
    config,
    scenes:()=>{try{return Object.keys(HibiscusSceneData.scenes)}catch{return []}},
    stats:()=>({mounted:mounts.size,pooled:pool.length,pooledMemory:pool.map(r=>({...r.info.memory})),cachedMasks:maskCache.size,three:threePromise?'requested':'not loaded'})
  };
})();
