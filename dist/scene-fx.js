// Living scenes: the island map and the Island Life districts drawn through WebGL (three.js) with water,
// wind, lights, sky and a few particles, driven by the per-scene data in scene-data.js.
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
  const TAU=Math.PI*2,MOTION_MAX=8,SPEED_MAX=8,MAX_RIPPLES=4;
  const config={allowSoftwareGL:false,maxPixelRatio:2,quality:'auto',debug:0};
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
    r=Math.round(r);const tmp=new Float32Array(src.length),out=new Float32Array(src.length),pick=grow?Math.max:Math.min;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=src[y*w+x];for(let i=Math.max(0,x-r),e=Math.min(w-1,x+r);i<=e;i++)m=pick(m,src[y*w+i]);tmp[y*w+x]=m}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){let m=tmp[y*w+x];for(let i=Math.max(0,y-r),e=Math.min(h-1,y+r);i<=e;i++)m=pick(m,tmp[i*w+x]);out[y*w+x]=m}
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
        const r=d[i*4]/255,g=d[i*4+1]/255,b=d[i*4+2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),c=mx-mn;
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
  function keyMask(pic,specs,pxScale){
    const n=pic.w*pic.h,out=new Float32Array(n);
    for(const s of specs){
      const soft=s.soft||{},sh=soft.h||14,ss=soft.s||.07,sv=soft.v||.07;
      const pk=s.peak&&pic.blurredLum(Math.max(1,Math.round(s.peak[0]*pxScale))),dk=s.dark&&pic.blurredLum(Math.max(1,Math.round(s.dark[0]*pxScale)));
      for(let i=0;i<n;i++){
        let m=1;
        if(s.h)m*=hueBand(pic.hue[i],s.h[0],s.h[1],sh);
        if(m&&s.s)m*=band(pic.sat[i],s.s[0],s.s[1],ss);
        if(m&&s.v)m*=band(pic.val[i],s.v[0],s.v[1],sv);
        if(m&&s.bmr)m*=band(pic.b[i]-pic.r[i],s.bmr[0],s.bmr[1],.06);
        if(m&&pk)m*=clamp((pic.lum[i]-pk[i]-s.peak[1])/(s.peak[1]*.8),0,1);
        if(m&&dk)m*=clamp((dk[i]-pic.lum[i]-s.dark[1])/(s.dark[1]*.8),0,1);
        if(m>out[i])out[i]=m;
      }
    }
    return out;
  }
  function shapeMask(shapes,w,h){
    const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true});
    g.fillStyle='#fff';
    for(const s of shapes){
      g.beginPath();
      if(s.poly){const p=s.poly;g.moveTo(p[0]*w,p[1]*h);for(let i=2;i<p.length;i+=2)g.lineTo(p[i]*w,p[i+1]*h);g.closePath()}
      else if(s.ellipse){const e=s.ellipse;g.ellipse(e[0]*w,e[1]*h,e[2]*w,e[3]*h,0,0,TAU)}
      else if(s.rect){const r=s.rect;g.rect(r[0]*w,r[1]*h,(r[2]-r[0])*w,(r[3]-r[1])*h)}
      g.fill();
    }
    const d=g.getImageData(0,0,w,h).data,out=new Float32Array(w*h);
    for(let i=0;i<out.length;i++)out[i]=d[i*4+3]/255;
    return out;
  }
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
  function motionVector(m,px,py,ref){
    if(Array.isArray(m)){let x=0,y=0;for(const part of m){const v=motionVector(part,px,py,ref);x+=v[0];y+=v[1]}return [x,y]}
    if(m.rotate){const [cx,cy,deg]=m.rotate,a=deg*Math.PI/180,dx=px-cx*ref[0],dy=py-cy*ref[1];
      return [dx*Math.cos(a)-dy*Math.sin(a)-dx,dx*Math.sin(a)+dy*Math.cos(a)-dy]}
    if(m.shift)return m.shift;
    if(m.bend){const [y0,y1,dx,dy]=m.bend,t=clamp((py/ref[1]-y0)/(y1-y0),0,1),k=t*t*(3-2*t)*.6+t*.4;return [dx*k,dy*k]}
    return [0,0];
  }
  async function buildMasks(scene,img,overlays){
    const ref=scene.size||[img.naturalWidth,img.naturalHeight],ms=scene.mask||.5;
    const w=Math.max(8,Math.round(img.naturalWidth*ms)),h=Math.max(8,Math.round(img.naturalHeight*ms)),n=w*h;
    const pxs=w/ref[0];  // mask pixels per reference-image pixel
    const pic=new Picture(img,w,h);await later();
    const ch={water:new Float32Array(n),flow:new Float32Array(n),flicker:new Float32Array(n),stars:new Float32Array(n),
      wind:new Float32Array(n),foam:new Float32Array(n),parallax:new Float32Array(n),dapple:new Float32Array(n)};
    const vx=new Float32Array(n),vy=new Float32Array(n),ps=new Float32Array(n),pc=new Float32Array(n),sp=new Float32Array(n),sw=new Float32Array(n);
    const keys=Object.assign({},typeof HibiscusSceneData!=='undefined'?HibiscusSceneData.keys:null,scene.keys);
    const keyCache={};
    const resolveKey=k=>{
      if(!k)return null;
      if(typeof k==='string'){
        if(overlays[k])return overlays[k];
        if(keyCache[k])return keyCache[k];
        const spec=keys[k];if(!spec)return null;
        return keyCache[k]=keyMask(pic,spec,pxs);
      }
      if(Array.isArray(k)&&k.some(x=>typeof x==='string')){
        const out=new Float32Array(n);
        for(const part of k){const m=resolveKey(part);if(m)for(let i=0;i<n;i++)if(m[i]>out[i])out[i]=m[i]}
        return out;
      }
      return keyMask(pic,Array.isArray(k)?k:[k],pxs);
    };
    scene.layers.forEach((L,index)=>{L._index=index});
    for(const L of scene.layers){
      let m;const shapes=shapesOf(L);
      if(shapes.length){m=shapeMask(shapes,w,h);if(L.feather)m=boxBlur(m,w,h,L.feather*pxs*.5)}
      else m=new Float32Array(n).fill(1);
      let k=resolveKey(L.key);
      if(k){
        if(L.grow)k=morph(k,w,h,L.grow*pxs,true);
        if(L.shrink)k=morph(k,w,h,L.shrink*pxs,false);
        for(let i=0;i<n;i++)m[i]*=k[i];
      }
      const not=resolveKey(L.not);
      if(not)for(let i=0;i<n;i++)m[i]*=1-not[i];
      if(L.cut){const c=boxBlur(shapeMask(L.cut,w,h),w,h,(L.cutFeather??L.feather??4)*pxs*.5);for(let i=0;i<n;i++)m[i]*=1-c[i]}
      if(L.soften)m=boxBlur(m,w,h,L.soften*pxs*.5);
      const amt=L.amount??1;
      if(L.motion){
        const phase=(L.phase??(L._index*.618034)%1)*TAU,speed=L.speed??1.2;
        for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i++){
          const a=m[i]*amt;if(a<.002)continue;
          const v=motionVector(L.motion,(x+.5)/pxs,(y+.5)/pxs,ref);
          vx[i]+=v[0]*a;vy[i]+=v[1]*a;
          const wt=a*(Math.hypot(v[0],v[1])+.05);ps[i]+=Math.sin(phase)*wt;pc[i]+=Math.cos(phase)*wt;sp[i]+=speed*wt;sw[i]+=wt;
        }
      }else if(L.type==='flicker'){
        const phase=(L.phase??(L._index*.618034)%1)*TAU,speed=L.speed??1.7;
        for(let i=0;i<n;i++){const a=m[i]*amt*.05;if(a<1e-4)continue;ps[i]+=Math.sin(phase)*a;pc[i]+=Math.cos(phase)*a;sp[i]+=speed*a;sw[i]+=a}
      }
      const target=ch[{water:'water',flow:'flow',flicker:'flicker',stars:'stars',wind:'wind',foam:'foam',parallax:'parallax',dapple:'dapple'}[L.type]];
      if(target){const v=L.type==='parallax'?(L.depth??1):1;for(let i=0;i<n;i++){const a=m[i]*amt*v;if(a>target[i])target[i]=a}}
      await later();
    }
    const fx=new Uint8Array(n*4),mo=new Uint8Array(n*4),aux=new Uint8Array(n*4);
    const b=v=>Math.round(clamp(v,0,1)*255);
    for(let i=0;i<n;i++){
      fx[i*4]=b(ch.water[i]);fx[i*4+1]=b(ch.flow[i]);fx[i*4+2]=b(ch.flicker[i]);fx[i*4+3]=b(ch.stars[i]);
      mo[i*4]=Math.round(128+clamp(vx[i]/MOTION_MAX,-1,1)*127);mo[i*4+1]=Math.round(128+clamp(vy[i]/MOTION_MAX,-1,1)*127);
      const ph=sw[i]?(Math.atan2(ps[i],pc[i])/TAU+1)%1:0;mo[i*4+2]=b(ph);mo[i*4+3]=sw[i]?b(sp[i]/sw[i]/SPEED_MAX):0;
      aux[i*4]=b(ch.wind[i]);aux[i*4+1]=b(ch.foam[i]);aux[i*4+2]=b(ch.parallax[i]);aux[i*4+3]=b(ch.dapple[i]);
    }
    return {w,h,fx,mo,aux,water:ch.water};
  }
  async function masksFor(id,scene,img,src){
    const key=id+'|'+src;
    if(maskCache.has(key)){const v=maskCache.get(key);maskCache.delete(key);maskCache.set(key,v);return v}
    const overlays={};
    for(const [name,url] of Object.entries(scene.overlays||{})){
      try{const o=await loadImage(new URL(url,base).href);overlays[name]=overlayMask(o,Math.round(img.naturalWidth*(scene.mask||.5)),Math.round(img.naturalHeight*(scene.mask||.5)))}catch{}
    }
    const p=buildMasks(scene,img,overlays);
    maskCache.set(key,p);
    while(maskCache.size>2)maskCache.delete(maskCache.keys().next().value);
    return p;
  }

  /* ---------- shaders ---------- */
  const VERT_BG=`varying vec2 vUv;void main(){vUv=vec2(position.x*.5+.5,.5-position.y*.5);gl_Position=vec4(position.xy,0.,1.);}`;
  const FRAG_BG=`
precision highp float;
uniform sampler2D uImg,uFx,uMo,uAux,uNoise;
uniform vec2 uImgSize,uView,uPointer;
uniform vec4 uRect,uWater,uWater2,uRip[${MAX_RIPPLES}];
uniform vec3 uHover;
uniform float uTime,uAmp,uParallax,uWindPx,uFlowSpeed,uFlowLen,uRipAspect,uDebug,uFoam;
varying vec2 vUv;
float hash(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 uv=(vUv*uView-uRect.xy)/uRect.zw;
  if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.){gl_FragColor=vec4(0.);return;}
  vec2 p=uv*uImgSize;
  vec4 fx=texture2D(uFx,uv),mo=texture2D(uMo,uv),aux=texture2D(uAux,uv);
  if(uDebug>.5){vec3 m=uDebug<1.5?fx.rgb+vec3(fx.a):uDebug<2.5?vec3(abs(mo.r*255.-128.)/24.,abs(mo.g*255.-128.)/24.,mo.a*4.):aux.rgb+vec3(aux.a*.5);
    gl_FragColor=vec4(texture2D(uImg,uv).rgb*.3+min(m,1.)*.75,1.);return;}
  vec2 off=aux.b*uPointer*uParallax;
  vec2 v=(mo.rg*255.-128.)/127.*${MOTION_MAX.toFixed(1)};
  float ph=mo.b*6.2831853,sp=mo.a*${SPEED_MAX.toFixed(1)};
  float osc=sin(uTime*sp+ph)*.78+sin(uTime*sp*2.31+ph*1.7)*.22;
  off+=v*osc*uAmp;
  if(aux.r>.002){vec2 wn=texture2D(uNoise,p/vec2(420.,330.)+uTime*vec2(.011,.005)).rg-.5;off+=aux.r*wn*2.2*uWindPx*uAmp;}
  float wm=fx.r,f=1.,shim=0.;vec2 q=vec2(0.);
  if(wm>.002){
    if(uWater2.x>0.)f=clamp((uv.y-uWater2.x)/uWater2.y,.1,1.);
    q=p/(uWater.y*f)*vec2(1./uWater2.z,1.);
    vec2 n1=texture2D(uNoise,q*.05+uTime*vec2(.006,.014)).rg-.5;
    vec2 n2=texture2D(uNoise,q*.083+vec2(.37,.11)-uTime*vec2(.011,.009)).gr-.5;
    vec2 wv=(n1+n2*.8);shim=wv.y;
    off+=wm*wv*uWater.x*f*uAmp;
    for(int i=0;i<${MAX_RIPPLES};i++){
      vec4 r=uRip[i];if(r.w<=0.)continue;
      vec2 d=(p-r.xy)*vec2(1.,uRipAspect);float dist=length(d),x=dist-r.z*70.;
      float env=exp(-x*x/500.)*r.w;
      off+=wm*(d/max(dist,1.))*sin(x*.3)*env*3.;shim+=env*cos(x*.3)*.8;
    }
  }
  vec2 sp2=p+off;vec3 col;
  if(fx.g>.002){
    float ft=uTime*uFlowSpeed+texture2D(uNoise,p/140.).a*2.;
    float f1=fract(ft),f2=fract(ft+.5),w=abs(1.-2.*f1);
    vec3 c1=texture2D(uImg,(sp2-vec2(0.,f1*uFlowLen*fx.g))/uImgSize).rgb,c2=texture2D(uImg,(sp2-vec2(0.,f2*uFlowLen*fx.g))/uImgSize).rgb;
    col=mix(c1,c2,w);
  }else col=texture2D(uImg,sp2/uImgSize).rgb;
  if(wm>.002){
    float lum=dot(col,vec3(.299,.587,.114));
    col*=1.+wm*shim*.07*uAmp;
    float g1=texture2D(uNoise,q*.21+uTime*vec2(.017,.031)).b,g2=texture2D(uNoise,q*.17+vec2(.5,.2)-uTime*vec2(.023,.012)).b;
    float pch=smoothstep(.38,.72,texture2D(uNoise,q*.012+uTime*vec2(.004,-.003)).r);
    float gl=smoothstep(uWater2.w,uWater2.w+.16,g1*g2+pch*.08)*pch*smoothstep(uWater.w-.25,uWater.w+.1,lum);
    col+=gl*wm*uWater.z*uAmp*(vec3(.55,.53,.5)+col*.5);
  }
  if(aux.g>.002){
    float br=sin(uTime*.9+ph+p.x*.012+p.y*.02)*.5+.5;
    col=mix(col,col+(1.-col)*.4,aux.g*br*uFoam*uAmp);
  }
  float hov=uHover.z*(1.-smoothstep(0.,110.,distance(p,uHover.xy)));
  if(fx.b>.002){
    float h=hash(floor(p/5.));
    float fl=sin(uTime*1.3+ph)*.45+sin(uTime*3.7+ph*2.+h*6.3)*.35+sin(uTime*(7.+5.*h)+h*40.)*.2;
    col*=1.+fx.b*(fl*.16*uAmp+hov*.3);
  }
  if(fx.a>.002){
    float h=hash(floor(p/7.)),tw=.5+.5*sin(uTime*(1.1+2.6*h)+h*61.);
    col*=mix(1.,.5+tw*tw*.95,fx.a*uAmp);
  }
  if(aux.a>.002){
    float n=texture2D(uNoise,p/260.+uTime*vec2(.009,.005)).g;
    col*=1.+aux.a*(n-.5)*.34*uAmp;
  }
  gl_FragColor=vec4(col,1.);
}`;
  const VERT_SPR=`
attribute vec2 aCenter;attribute vec2 aSize;attribute float aRot;attribute vec4 aColor;attribute vec4 aExtra;
uniform vec4 uRect;uniform vec2 uView,uImgSize;uniform float uTime,uAmp,uMinPx;uniform vec3 uHover;
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
  if(aExtra.w>0.)a*=1.+aExtra.w*uHover.z*(1.-smoothstep(0.,max(aSize.x,aSize.y)*1.4+60.,distance(aCenter,uHover.xy)));
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
    update(dt,t,pointer,actor,scale){
      const flee=(p,src,radius,force)=>{if(!src)return;const dx=p.x-src[0],dy=p.y-src[1],d=Math.hypot(dx,dy);if(d<radius&&d>.01){const f=(1-d/radius)*force;p.vx+=dx/d*f*dt;p.vy+=dy/d*f*dt;p.scare=Math.min(1,p.scare+dt*3)}};
      for(const p of this.list){
        const s=p.spec,a=this.area(s);p.age+=dt;
        if(p.age<0){p.alpha=0;continue}
        const k=s.kind,R=(s.scatter||120)*this.sx;
        if(k==='petal'){
          const wind=s.wind||[18,10];
          p.vx+=((wind[0]*this.sx+Math.sin(t*.7+p.seed*20)*14)-p.vx)*dt*.8;p.vy+=((wind[1]*this.sy+Math.sin(t*2.1+p.seed*9)*9)-p.vy)*dt*.8;
          flee(p,pointer,R,900);flee(p,actor,R*1.2,1100);
          p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=(p.vr+p.vx*.01)*dt;
          const t01=p.age/p.life;p.alpha=Math.min(1,p.age*1.5)*Math.min(1,(1-t01)*4);
          p.w=p.size*(.55+.45*Math.abs(Math.cos(t*2+p.seed*9)));p.h=p.size;
          if(p.age>p.life||p.x<-40||p.y<-40||p.x>this.ref[0]*this.sx+40||p.y>(s.floor||1)*this.ref[1]*this.sy)this.spawn(p);
        }else if(k==='butterfly'||k==='firefly'){
          if(Math.hypot(p.tx-p.x,p.ty-p.y)<12||Math.random()<dt*.25){p.tx=rand(a[0],a[2]);p.ty=rand(a[1],a[3])}
          const spd=(k==='butterfly'?42:14)*this.sx,dx=p.tx-p.x,dy=p.ty-p.y,d=Math.hypot(dx,dy)||1;
          p.vx+=(dx/d*spd-p.vx)*dt*(k==='butterfly'?1.6:.6)+Math.sin(t*3+p.seed*30)*(k==='butterfly'?40:6)*dt;
          p.vy+=(dy/d*spd-p.vy)*dt*(k==='butterfly'?1.6:.6)+Math.cos(t*2.6+p.seed*17)*(k==='butterfly'?50:6)*dt;
          flee(p,pointer,R,k==='butterfly'?700:260);flee(p,actor,R,k==='butterfly'?700:260);
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
      this.t=0;this.last=0;this.raf=0;this.amp=0;this.ripples=[];this.pointer=[0,0];this.pointerTarget=[0,0];this.hover=null;this.hoverAmt=0;
      this.actor=null;this.frameTimes=[];this.ema=16;this.level=0;this.stats={frames:0,slow:0};
      this.onVisibility=()=>this.kick();
      this.onPointer=e=>this.pointerEvent(e);
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
        uPointer:{value:new T.Vector2()},uHover:{value:new T.Vector3()},uTime:{value:0},uAmp:{value:0},
        uParallax:{value:0},uWindPx:{value:(d.wind?.px??1)*this.k},uFlowSpeed:{value:fl.speed??1.2},uFlowLen:{value:(fl.len??8)*this.k},
        uWater:{value:new T.Vector4((W.px??1.2)*this.k,(W.scale??40)*this.k,W.glint??.8,W.glintLum??.5)},
        uWater2:{value:new T.Vector4(W.horizon??0,W.depth??.3,W.stretch??1.6,W.glintAt??.4)},
        uRip:{value:Array.from({length:MAX_RIPPLES},()=>new T.Vector4())},uRipAspect:{value:d.rippleAspect??1},
        uDebug:{value:config.debug|0},uFoam:{value:d.foam??1}
      };
      const scene=this.scene=new T.Scene(),cam=this.camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
      const quad=this.quad=new T.BufferGeometry();quad.setAttribute('position',new T.BufferAttribute(new Float32Array([-1,-1,0,3,-1,0,-1,3,0]),3));
      this.bgMat=new T.ShaderMaterial({uniforms:this.bgUniforms,vertexShader:VERT_BG,fragmentShader:FRAG_BG,depthTest:false,depthWrite:false});
      const bg=new T.Mesh(quad,this.bgMat);bg.frustumCulled=false;scene.add(bg);
      this.sprUniforms={uRect:this.bgUniforms.uRect,uView:this.bgUniforms.uView,uImgSize:this.bgUniforms.uImgSize,uTime:this.bgUniforms.uTime,
        uAmp:this.bgUniforms.uAmp,uHover:this.bgUniforms.uHover,uMinPx:{value:3}};
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
      for(const t of ['pointermove','pointerdown','pointerleave','pointercancel'])this.el.addEventListener(t,this.onPointer,{passive:true});
    }
    resize(){
      if(!this.renderer)return;
      const f=this.frame=framing(this.el,this.img[0],this.img[1]);
      if(!f.W||!f.H)return;
      const dpr=Math.min(window.devicePixelRatio||1,config.maxPixelRatio)*[1,.8,.65,.5][this.level];
      this.renderer.setPixelRatio(dpr);this.renderer.setSize(f.W,f.H,false);
      this.bgUniforms.uView.value.set(f.W,f.H);this.bgUniforms.uRect.value.set(f.x,f.y,f.w,f.h);
      this.scale=Math.sqrt(f.w*f.h/(this.img[0]*this.img[1]));
      this.bgUniforms.uParallax.value=(this.data.parallax??3)/Math.max(.05,this.scale);
      if(this.state==='live'&&!this.raf)this.renderFrame(performance.now(),true);
    }
    toImage(cx,cy){const f=this.frame;return f?[(cx-f.x)/f.w*this.img[0],(cy-f.y)/f.h*this.img[1]]:null}
    pointerEvent(e){
      if(this.state!=='live')return;
      const r=this.el.getBoundingClientRect(),cx=e.clientX-r.left-this.el.clientLeft,cy=e.clientY-r.top-this.el.clientTop;
      if(e.type==='pointerleave'||e.type==='pointercancel'){this.hover=null;this.pointerTarget=[0,0];return}
      const p=this.toImage(cx,cy);if(!p)return;
      this.hover=p;this.pointerTarget=[clamp(cx/r.width*2-1,-1,1),clamp(cy/r.height*2-1,-1,1)];
      if(e.type==='pointerdown'){
        const m=this.masks,mx=clamp(Math.floor(p[0]/this.img[0]*m.w),0,m.w-1),my=clamp(Math.floor(p[1]/this.img[1]*m.h),0,m.h-1);
        if(m.water[my*m.w+mx]>.25){this.ripples.push({x:p[0],y:p[1],t:0});if(this.ripples.length>MAX_RIPPLES)this.ripples.shift()}
      }
      this.kick();
    }
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
      if(!once){this.t=(this.t+dt)%3600;this.amp=Math.min(1,this.amp+dt/1.2);this.stats.frames++}
      const U=this.bgUniforms,s=this.amp*this.amp*(3-2*this.amp);
      U.uTime.value=this.t;U.uAmp.value=this.opts.still?0:s;
      const k=1-Math.exp(-dt*3.5);this.pointer[0]+=(this.pointerTarget[0]-this.pointer[0])*k;this.pointer[1]+=(this.pointerTarget[1]-this.pointer[1])*k;
      U.uPointer.value.set(-this.pointer[0],-this.pointer[1]);
      this.hoverAmt+=((this.hover?1:0)-this.hoverAmt)*Math.min(1,dt*5);
      if(this.hover)U.uHover.value.set(this.hover[0],this.hover[1],this.hoverAmt);else U.uHover.value.z=this.hoverAmt;
      this.ripples=this.ripples.filter(r=>(r.t+=dt)<3.2);
      U.uRip.value.forEach((v,i)=>{const r=this.ripples[i];if(r)v.set(r.x,r.y,r.t,Math.exp(-r.t*1.1)*(1-r.t/3.2));else v.set(0,0,0,0)});
      if(this.parts&&dt){
        const actor=this.readActor();
        this.swarm.update(dt,this.t,this.hover,actor,this.scale);
        this.swarm.list.forEach((p,i)=>{const k=KIND[p.spec.kind];this.parts.set(i,p.x,p.y,p.w||p.size,p.h||p.size,p.rot,p.color[0],p.color[1],p.color[2],Math.max(0,p.alpha)*(p.spec.alpha??1),k,p.seed,0,0)});
        this.parts.flush();
      }
      this.renderer.render(this.scene,this.camera);
      if(this.shaderFailed){this.fail();return}
      if(this.renderer.domElement.style.visibility==='hidden')this.renderer.domElement.style.visibility='visible';
      if(!once){this.watchPerformance(dt);this.raf=requestAnimationFrame(n=>this.renderFrame(n))}
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
      for(const t of ['pointermove','pointerdown','pointerleave','pointercancel'])this.el.removeEventListener(t,this.onPointer);
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
