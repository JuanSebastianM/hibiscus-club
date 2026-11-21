/* Puppets: the dressed doll (and the residents) brought to life through WebGL with three.js, as a
   cut-out puppet built from the still pictures. Rig data and the animation math are in puppet-rig.js.

     const p = HibiscusPuppet.create(canvas, {shot, view, layout, onActive})   // a doll
     const r = HibiscusPuppet.create(canvas, {resident:'mara', layout, onActive}) // a resident
     p.setLook(shot) p.setView('left') p.emote('cheer') p.talk(2.5) p.walking(true) p.advance(dollPx)
     p.setPaused(bool) p.destroy()   HibiscusPuppet.supported()  HibiscusPuppet.stats()

   How it works. composeDollLayers() (portrait.js) gives the doll as aligned layers (hair behind, body,
   shoes, outfit, near arm, sleeves, jewelry, hair in front ...). Each layer is cut into pieces by
   region labels measured on the bald base picture (torso, head, each arm, each leg, the skirt below
   skirtTop for skirts and dresses). Pieces that are drawn first reach 2 px under their neighbours, so
   no seam shows. Each piece becomes a textured grid mesh (2 px on the face, 8 px elsewhere); each
   vertex carries a chain of up to eight (bone, fraction) pairs and is skinned on the GPU by composing
   the bones' local transforms at those fractions (angle interpolation: joints bend, nothing tears).
   Pieces are drawn group by group: hair behind, the far limbs (side views: shaded copies of the near
   ones), torso and head, legs, skirt, arms, then hair in front and the head jewelry. At rest the
   pieces put every pixel back where composeDoll() drew it.
   The face is a fine mesh with a displacement basis (jaw, smile, wide, squint) plus an overlay canvas
   with the eyelids (skin sampled above each eye, a lash line) and the inside of the open mouth.

   One WebGL context renders every puppet into an offscreen canvas that is copied into each puppet's
   own 2D canvas, so the page keeps its ordinary canvases and the still picture stays the fallback.
   Nothing is loaded until a puppet is created and supported(): sparkles on, no reduced motion, WebGL2
   and three.js available. If any of that changes or fails, onActive(false) asks the page to show the
   still picture again. */
const HibiscusPuppet=(()=>{
  const R=HibiscusPuppetRig;
  const base=(document.currentScript&&document.currentScript.src)||location.href;
  const THREE_URL=new URL('vendor/three/three.module.min.js',base).href;
  const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  // allowSoftwareGL: also run on a software renderer (?softgl in the address, for automated checks)
  const config={maxLive:4,grid:8,headGrid:2,hairGrid:10,maxModels:8,warmModels:5,allowSoftwareGL:/[?&]softgl\b/.test(location.search),quality:'auto',debugPieces:false};
  const W=600,H=1060,NB=R.NB,B=R.B;
  let enabled=true,threeP=null,T=null,ctxGL=null,webgl2=null,raf=0,ticker=0,lastNow=0,frameEma=16,costEma=0,level=0;
  const instances=new Set(),models=new Map(),building=new Map();
  const later=()=>new Promise(r=>setTimeout(r,0));
  const clamp=R.clamp,smooth=R.smooth,lerp=R.lerp;

  const sparkleOn=()=>{try{return typeof HibiscusFx==='undefined'||HibiscusFx.isEnabled()!==false}catch{return true}};
  const wanted=()=>enabled&&!reducedQuery.matches&&sparkleOn();
  function hasWebGL2(){
    if(webgl2!==null)return webgl2;
    try{const c=document.createElement('canvas'),gl=c.getContext('webgl2',{failIfMajorPerformanceCaveat:!config.allowSoftwareGL});
      webgl2=!!gl;if(gl)gl.getExtension('WEBGL_lose_context')?.loseContext()}catch{webgl2=false}
    return webgl2;
  }
  const supported=()=>wanted()&&hasWebGL2()&&typeof composeDollLayers==='function';
  const loadThree=()=>threeP||(threeP=import(THREE_URL).then(m=>(T=m)).catch(e=>{threeP=null;throw e}));

  /* ---------- small raster helpers ---------- */
  function mk(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c}
  const g2=c=>c.getContext('2d',{willReadFrequently:true});
  let scratch=null;
  /* pixels of any canvas (read through one scratch canvas, so shared canvases keep their GPU backing) */
  function pixelsOf(src){
    if(!scratch||scratch.width!==src.width||scratch.height!==src.height){scratch=mk(src.width,src.height)}
    const g=g2(scratch);g.clearRect(0,0,scratch.width,scratch.height);g.drawImage(src,0,0);return g.getImageData(0,0,src.width,src.height);
  }
  function maskOf(w,h,paint){const c=mk(w,h),g=g2(c);g.fillStyle='#000';paint(g);const d=g.getImageData(0,0,w,h).data,m=new Uint8Array(w*h);for(let i=0;i<m.length;i++)m[i]=d[i*4+3]>127?1:0;return m}
  function polyPath(g,pts){g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath()}
  function dilate(m,w,h,r){ // square max filter
    const t=new Uint8Array(m.length),o=new Uint8Array(m.length);
    for(let y=0;y<h;y++){const row=y*w;for(let x=0;x<w;x++){let v=0;for(let k=Math.max(0,x-r),e=Math.min(w-1,x+r);k<=e;k++)if(m[row+k]){v=1;break}t[row+x]=v}}
    for(let x=0;x<w;x++)for(let y=0;y<h;y++){let v=0;for(let k=Math.max(0,y-r),e=Math.min(h-1,y+r);k<=e;k++)if(t[k*w+x]){v=1;break}o[y*w+x]=v}
    return o;
  }
  const segDist=(p,a,b)=>{const vx=b[0]-a[0],vy=b[1]-a[1],t=clamp(((p[0]-a[0])*vx+(p[1]-a[1])*vy)/(vx*vx+vy*vy||1),0,1);return Math.hypot(p[0]-a[0]-vx*t,p[1]-a[1]-vy*t)};
  const unit=(a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],l=Math.hypot(x,y)||1;return [x/l,y/l]};
  const dot=(p,o,u)=>(p[0]-o[0])*u[0]+(p[1]-o[1])*u[1];

  /* ---------- region labels (canvas px) ---------- */
  // L_PUFF: a puffed sleeve that stays on the shoulder, drawn over the arm that comes out from under it
  const L_TORSO=0,L_ARM0=1,L_ARM1=2,L_LEG0=3,L_LEG1=4,L_SKIRT=5,L_HEAD=6,L_PUFF=7;
  const ORDER=[L_TORSO,L_HEAD,L_LEG0,L_LEG1,L_SKIRT,L_ARM0,L_ARM1,L_PUFF];
  const GROUP_OF={[L_TORSO]:'torso',[L_HEAD]:'torso',[L_LEG0]:'legs',[L_LEG1]:'legs',[L_SKIRT]:'skirt',[L_ARM0]:'arms',[L_ARM1]:'arms',[L_PUFF]:'over'};
  function hipLineY(rg,x){
    const P=rg.hipLine;
    if(P.length===2){const [a,b]=P;return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])}
    if(x<=P[1][0]){const [a,b]=[P[0],P[1]];return x<a[0]?a[1]:a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0])}
    const [a,b]=[P[1],P[2]];return x>b[0]?b[1]:a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
  }
  /* ball: arms are ball joints (bare arms, puffed sleeves); otherwise (long sleeves) the whole shoulder
     beyond the cut line belongs to the arm and bends smoothly. */
  async function baseLabels(rg,dv,ball=true){
    const img=await spriteCanvas(dv.art),[ox,oy]=dv.origin,bw=img.width,bh=img.height;
    const bd=pixelsOf(img).data;
    const lab=new Uint8Array(W*H);
    let armMask=null;
    if(rg.side){
      const poly=dv.arm.map(([x,y])=>[x+ox,y+oy]);
      armMask=maskOf(W,H,g=>{polyPath(g,poly);g.fill()});
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(armMask[i])lab[i]=L_ARM0;else if(y>hipLineY(rg,x))lab[i]=L_LEG0}
      return {lab,armMask};
    }
    // front / back: below the armpit an arm is what lies beyond the middle of its gap to the body
    const gap=[new Float32Array(H).fill(NaN),new Float32Array(H).fill(NaN)];
    const px=rg.px;
    for(const i of [0,1]){
      const [top,pit]=rg.armCut[i],anchorX=px['hip'+i][0];let last=NaN;
      for(let y=Math.floor(pit[1]);y<H;y++){
        const by=Math.round(y-oy);let val=NaN;
        if(by>=0&&by<bh){
          const runs=[];let x=0;
          while(x<bw){if(bd[(by*bw+x)*4+3]>100){const s=x;while(x<bw&&bd[(by*bw+x)*4+3]>100)x++;runs.push([s+ox,x-1+ox])}x++}
          const k=runs.findIndex(r=>r[0]<=anchorX&&r[1]>=anchorX);
          if(k>=0){
            if(i===0){const arms=runs.slice(0,k);if(arms.length)val=(arms[arms.length-1][1]+runs[k][0])/2}
            else{const arms=runs.slice(k+1);if(arms.length)val=(arms[0][0]+runs[k][1])/2}
          }
        }
        if(isNaN(val))val=last;
        if(!isNaN(val))last=val;
        gap[i][y]=val;
      }
      // rows between the armpit and the first gap found: the armpit x
      for(let y=Math.floor(pit[1]);y<H&&isNaN(gap[i][y]);y++)gap[i][y]=pit[0];
    }
    const capR=rg.legLength*.1;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=y*W+x;let l=L_TORSO;
      for(const a of [0,1]){
        // an arm is a ball joint: round the shoulder only a disc (capR) about the joint belongs to it;
        // below the armpit, everything beyond the gap, down to the fingertips
        const [top,pit]=rg.armCut[a],sgn=a?1:-1,J=px['sh'+a];
        if(y>px['hand'+a][1]+14)continue;
        let edge;
        if(y<pit[1]){if(ball?Math.hypot(x-J[0],y-J[1])>capR:y<top[1]-30)continue;edge=y<top[1]?top[0]:top[0]+(pit[0]-top[0])*(y-top[1])/(pit[1]-top[1])}
        else edge=gap[a][y];
        if(sgn<0?x<edge:x>edge){l=a?L_ARM1:L_ARM0;break}
      }
      if(l===L_TORSO&&y>hipLineY(rg,x))l=x<rg.px.root[0]?L_LEG0:L_LEG1;
      lab[i]=l;
    }
    return {lab,armMask:null};
  }

  /* ---------- side views: fill under the near arm from the body on either side ---------- */
  /* Each masked run of a row is filled with the texture just beside it (copied from one run length to
     the left and to the right, cross-faded), so prints and satin sheen carry on behind the arm instead
     of smearing; then a short vertical blur inside the mask evens out row-to-row jumps. Alpha keeps
     the silhouette (raised to the sides' where both sides are opaque). */
  function inpaintUnder(d,mask){
    const src=new Uint8ClampedArray(d),ok=i=>i>=0&&src[i*4+3]>200&&!mask[i];
    for(let y=0;y<H;y++){
      let x=0;
      while(x<W){
        if(!mask[y*W+x]){x++;continue}
        const s=x;while(x<W&&mask[y*W+x])x++;const e=x-1,n=e-s+1;
        const row=y*W,okL=s>0&&ok(row+s-1),okR=e<W-1&&ok(row+e+1);
        if(!okL&&!okR)continue;
        for(let k=s;k<=e;k++){
          const o=(row+k)*4,t=(k-s+.5)/n;
          let wl=okL?1-t:0,wr=okR?t:0;const sum=wl+wr;wl/=sum;wr/=sum;
          // texture source: mirrored about the run's edge, falling back to the edge pixel
          const pick=(edge,dirn)=>{let q=edge+dirn*(dirn<0?k-s:e-k);for(let tries=0;tries<3&&!(q>=0&&q<W&&ok(row+q));tries++)q=Math.round((q+edge)/2);return ok(row+q)?row+q:row+edge};
          const a=okL?pick(s-1,-1):0,b=okR?pick(e+1,1):0;
          for(let c=0;c<3;c++)d[o+c]=(okL?src[a*4+c]*wl:0)+(okR?src[b*4+c]*wr:0);
          if(okL&&okR)d[o+3]=Math.max(src[o+3],Math.min(src[(row+s-1)*4+3],src[(row+e+1)*4+3]));
        }
      }
    }
    const f=new Uint8ClampedArray(d);
    for(let y=2;y<H-2;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!mask[i])continue;
      for(let c=0;c<3;c++){let s=0;for(let k=-2;k<=2;k++)s+=f[(i+k*W)*4+c];d[i*4+c]=s/5}}
  }

  /* ---------- pieces and meshes ---------- */
  /* Bounding box [x0, y0, x1, y1] (inclusive) of the opaque pixels of layer data d. */
  function alphaBox(d){
    let x0=W,y0=H,x1=-1,y1=-1;
    for(let y=0;y<H;y++){const row=y*W;for(let x=0;x<W;x++)if(d[(row+x)*4+3]){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
    return x1<0?null:[x0,y0,x1,y1];
  }
  /* A piece: the layer pixels inside `box` for which member(i) holds (cropped, padded), plus later a
     grid mesh over them. */
  /* The colour texture holds the real layer pixels a few px beyond the piece (so filtering at a cut
     never pulls in transparency); a separate hard mask (sampled nearest, in rest space) says which
     pixels are the piece's. Pieces of one layer partition it exactly, so at rest no pixel is drawn
     twice or missed and no seam can show, at any scale. `whole`: the piece is the whole layer. */
  function makePiece(d,box,member,spec,whole=false){
    let bx0=W,by0=H,bx1=-1,by1=-1;
    for(let y=box[1];y<=box[3];y++)for(let x=box[0];x<=box[2];x++){const i=y*W+x;if(d[i*4+3]&&member(i)){if(x<bx0)bx0=x;if(x>bx1)bx1=x;if(y<by0)by0=y;if(y>by1)by1=y}}
    if(bx1<0)return null;
    const R2=3,pad=(spec.grid||config.grid)+R2+2,x0=Math.max(0,bx0-pad),y0=Math.max(0,by0-pad),x1=Math.min(W,bx1+1+pad),y1=Math.min(H,by1+1+pad);
    const cw=x1-x0,ch=y1-y0;
    const own=new Uint8Array(cw*ch);
    for(let y=by0;y<=by1;y++)for(let x=bx0;x<=bx1;x++){const i=y*W+x;if(d[i*4+3]&&member(i))own[(y-y0)*cw+x-x0]=1}
    // the hard mask reaches 1 px past the piece where the layer is fully opaque: neighbouring pieces of
    // the layer then overlap by identical pixels, so no hairline can open between them at any scale
    const msk=new Uint8Array(own);
    if(!whole)for(let y=1;y<ch-1;y++)for(let x=1;x<cw-1;x++){const k=y*cw+x;if(own[k])continue;
      if(!(own[k-1]||own[k+1]||own[k-cw]||own[k+cw]))continue;const i=(y+y0)*W+x+x0;if(d[i*4+3]===255)msk[k]=1}
    const reach=whole?own:dilateBox(own,cw,ch,R2);
    const c=mk(cw,ch),g=g2(c),im=g.createImageData(cw,ch),o=im.data;
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){if(!reach[y*cw+x])continue;const i=(y+y0)*W+x+x0,k=(y*cw+x)*4;o[k]=d[i*4];o[k+1]=d[i*4+1];o[k+2]=d[i*4+2];o[k+3]=d[i*4+3]}
    g.putImageData(im,0,0);
    let mask=null;
    if(!whole){mask=mk(cw,ch);const mg=mask.getContext('2d'),mi=mg.createImageData(cw,ch);for(let k=0;k<msk.length;k++)if(msk[k]){mi.data[k*4]=mi.data[k*4+1]=mi.data[k*4+2]=mi.data[k*4+3]=255}mg.putImageData(mi,0,0)}
    return {...spec,canvas:c,mask,box:[x0,y0,cw,ch],alpha:reach};
  }
  function dilateBox(m,w,h,r){
    const t=new Uint8Array(m.length),o=new Uint8Array(m.length);
    for(let y=0;y<h;y++){const row=y*w;let last=-1e9;for(let x=0;x<w;x++){if(m[row+x])last=x;if(x-last<=r)t[row+x]=1}last=1e9;for(let x=w-1;x>=0;x--){if(m[row+x])last=x;if(last-x<=r)t[row+x]=1}}
    for(let x=0;x<w;x++){let last=-1e9;for(let y=0;y<h;y++){if(t[y*w+x])last=y;if(y-last<=r)o[y*w+x]=1}last=1e9;for(let y=h-1;y>=0;y--){if(t[y*w+x])last=y;if(last-y<=r)o[y*w+x]=1}}
    return o;
  }
  /* Grid vertices over a piece; cells without any pixel are dropped. rows(x), when given, returns the
     row positions of the column at x (all columns the same count) with .split = index of the first
     row below the mouth line (the face: two rows hug the line so the lips part cleanly). */
  function gridMesh(piece,s,rows){
    const [x0,y0,cw,ch]=piece.box,a=piece.alpha;
    const S=new Uint32Array((cw+1)*(ch+1)); // summed area of alpha: "any pixel in this cell?"
    for(let y=0;y<ch;y++){let run=0;for(let x=0;x<cw;x++){run+=a[y*cw+x];S[(y+1)*(cw+1)+x+1]=S[y*(cw+1)+x+1]+run}}
    const any=(ax,ay,bx,by)=>{ax=clamp(Math.floor(ax),0,cw);bx=clamp(Math.ceil(bx),0,cw);ay=clamp(Math.floor(ay),0,ch);by=clamp(Math.ceil(by),0,ch);if(bx<=ax||by<=ay)return false;
      return S[by*(cw+1)+bx]-S[ay*(cw+1)+bx]-S[by*(cw+1)+ax]+S[ay*(cw+1)+ax]>0};
    const nx=Math.ceil((cw-2)/s)+1,cols=[];for(let i=0;i<nx;i++)cols.push(Math.min(cw-1,1+i*s));
    const colRows=rows?cols.map(cx=>rows(cx+x0)):null,split=rows?colRows[0].split:0;
    const ny=rows?colRows[0].length:Math.ceil((ch-2)/s)+1;
    const vy=(i,j)=>rows?colRows[i][j]-y0:Math.min(ch-1,1+j*s);
    const index=new Int32Array(nx*ny).fill(-1),pos=[],tri=[],below=[];
    const vid=(i,j)=>{const k=j*nx+i;if(index[k]<0){index[k]=pos.length/2;pos.push(cols[i]+x0,vy(i,j)+y0);below.push(rows&&j>=split?1:0)}return index[k]};
    for(let j=0;j<ny-1;j++)for(let i=0;i<nx-1;i++){
      const ya=Math.min(vy(i,j),vy(i+1,j)),yb=Math.max(vy(i,j+1),vy(i+1,j+1));
      if(!any(cols[i]-1.5,ya-1.5,cols[i+1]+1.5,yb+1.5))continue;
      const a1=vid(i,j),b1=vid(i+1,j),c1=vid(i,j+1),d1=vid(i+1,j+1);
      tri.push(a1,b1,c1,b1,d1,c1);
    }
    return {pos:new Float32Array(pos),index:new Uint32Array(tri),below};
  }

  /* ---------- skinning chains ---------- */
  function torsoFr(rg,y,fr){
    const p=rg.px;fr[B.root]=1;
    fr[B.hips]=rg.resident?smooth(p.hips[1]+95,p.hips[1]-5,y):1;
    fr[B.spine]=smooth(p.spine[1]+40,p.spine[1]-40,y);
    fr[B.chest]=smooth(p.chest[1]+45,p.chest[1]-35,y);
    fr[B.neck]=smooth(p.neck[1]+(rg.resident?5:10),p.neck[1]-(rg.resident?5:10),y);
    fr[B.head]=smooth(p.head[1]+(rg.resident?4:10),p.head[1]-(rg.resident?4:8),y);
  }
  function chainFor(rg,kind,x,y,limb,fan=false){
    const fr=new Float32Array(NB),p=rg.px,P=[x,y];
    torsoFr(rg,y,fr);
    if(kind==='hair'||kind==='headItem'){
      fr[B.spine]=fr[B.chest]=fr[B.neck]=1;
      const chin=rg.face?rg.face.chin:p.head[1]+8;
      fr[B.head]=kind==='headItem'?1:1-.62*smooth(chin+10,chin+240,y);
      if(kind==='hair')fr[B.hair]=smooth(p.head[1]-30,p.head[1]+230,y);
    }else if(kind==='arm'){
      const i=limb,sh=p['sh'+i],el=p['el'+i],wr=p['wr'+i],u1=unit(sh,el),u2=unit(el,wr);
      let f;
      // bare arms and puffed sleeves: rigid about the shoulder (a ball joint; the torso keeps its own
      // shoulder underneath); long sleeves: the shoulder bends smoothly away from the cut line
      if(rg.side||!fan)f=1;
      else{const [top,pit]=rg.armCut[i],n=unit(top,pit);f=smooth(3,24,Math.abs((x-top[0])*n[1]-(y-top[1])*n[0]))}
      for(const b of [B.spine,B.chest])fr[b]=lerp(fr[b],1,f);
      fr[B.neck]*=1-f;fr[B.head]*=1-f;
      fr[B['arm'+i]]=f;fr[B['fore'+i]]=smooth(-10,10,dot(P,el,u1));fr[B['hand'+i]]=smooth(-6,6,dot(P,wr,u2));
    }else if(kind==='leg'){
      const i=limb,hp=p['hip'+i],kn=p['kn'+i],an=p['an'+i],u1=unit(hp,kn),u2=unit(kn,an);
      const sdist=y-hipLineY(rg,x);
      fr[B['thigh'+i]]=smooth(2,26,sdist);fr[B['shin'+i]]=smooth(-14,14,dot(P,kn,u1));fr[B['foot'+i]]=smooth(-8,6,dot(P,an,u2));
    }else if(kind==='skirt'){
      const f=smooth(rg.skirtTop,rg.skirtTop+80,y);let w0;
      if(rg.side){const hx=p.hips[0];w0=rg.dir<0?smooth(hx+20,hx-20,x):smooth(hx-20,hx+20,x)}
      else w0=smooth(p.root[0]+25,p.root[0]-25,x);
      fr[B.skirt0]=f*w0;fr[B.skirt1]=f*(1-w0);
    }
    return fr;
  }
  /* Pack a fraction vector into 8 (bone, fraction) slots, parents first. */
  function pack(fr,bones,frs,k){
    let n=0;
    for(let b=0;b<NB&&n<8;b++){const f=fr[b];if(f>.002){bones[k*8+n]=b;frs[k*8+n]=Math.min(1,f);n++}}
    for(;n<8;n++){bones[k*8+n]=0;frs[k*8+n]=0}
  }
  const FAR_MAP={[B.arm0]:B.arm1,[B.fore0]:B.fore1,[B.hand0]:B.hand1,[B.thigh0]:B.thigh1,[B.shin0]:B.shin1,[B.foot0]:B.foot1};

  /* ---------- the procedural face overlay ---------- */
  class FaceOverlay{
    constructor(rg,src,k=3){
      const f=rg.face;this.f=f;this.rg=rg;this.k=k;
      const all=[...f.eyes.flat(),...f.mouth.map(p=>[p[0],p[1]])];
      const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]),u=rg.resident?3:8;
      this.box=[Math.floor(Math.min(...xs)-u),Math.floor(Math.min(...ys)-u*1.5),0,0];
      this.box[2]=Math.ceil(Math.max(...xs)+u)-this.box[0];this.box[3]=Math.ceil(Math.max(...ys)+u*1.4+(f.jawMax||3))-this.box[1];
      this.canvas=mk(this.box[2]*k,this.box[3]*k);this.g=this.canvas.getContext('2d');
      this.src=src;this.sd=pixelsOf(src);
      this.eyes=f.eyes.map(e=>this.prepEye(e));
      // the face's own silhouette (slightly inset): nothing drawn here may leave it
      const fm=mk(this.canvas.width,this.canvas.height),fg=fm.getContext('2d');
      fg.imageSmoothingQuality='high';fg.drawImage(src,this.box[0],this.box[1],this.box[2],this.box[3],0,0,fm.width,fm.height);
      const fd=fg.getImageData(0,0,fm.width,fm.height);for(let i=3;i<fd.data.length;i+=4)fd.data[i]=fd.data[i]>235?255:0;fg.putImageData(fd,0,0);
      this.faceMask=fm;
      const m=f.mouth,cx=(Math.min(...m.map(p=>p[0]))+Math.max(...m.map(p=>p[0])))/2;
      this.mouthCx=cx;
      this.state='';
    }
    pixel(x,y){const d=this.sd.data,w=this.sd.width,i=(Math.round(clamp(y,0,this.sd.height-1))*w+Math.round(clamp(x,0,w-1)))*4;return [d[i],d[i+1],d[i+2],d[i+3]]}
    prepEye(poly){
      // split the polygon at its left- and right-most points into upper and lower contours
      let li=0,ri=0;poly.forEach((p,i)=>{if(p[0]<poly[li][0])li=i;if(p[0]>poly[ri][0])ri=i});
      const walk=(a,b)=>{const out=[];for(let i=a;;i=(i+1)%poly.length){out.push(poly[i]);if(i===b)break}return out};
      let c1=walk(li,ri),c2=walk(ri,li).reverse();
      const avg=c=>c.reduce((s,p)=>s+p[1],0)/c.length;
      const [top,bot]=avg(c1)<avg(c2)?[c1,c2]:[c2,c1];
      const at=(c,x)=>{if(x<=c[0][0])return c[0][1];for(let i=1;i<c.length;i++)if(x<=c[i][0]){const a=c[i-1],b=c[i],t=(x-a[0])/((b[0]-a[0])||1);return a[1]+(b[1]-a[1])*t}return c[c.length-1][1]};
      const x0=poly[li][0],x1=poly[ri][0],h=Math.max(...bot.map(p=>p[1]))-Math.min(...top.map(p=>p[1]));
      // outer corner: away from the face's middle (front) / toward the back of the head (side views)
      const faceMid=this.rg.side?null:(this.f.eyes.length>1?(this.f.eyes[0][0][0]+this.f.eyes[1][0][0])/2:x0);
      const outerRight=this.rg.side?this.rg.dir<0:(x0+x1)/2>faceMid;
      // the closed lid: the skin strip above the eye stretched down over it (keeps eyeshadow and shading)
      // (skipping `lidGap` px of lashes right above the eye)
      const k=this.k,sample=this.f.lidSample||3,gap=this.f.lidGap??1,[bx,by]=this.box;
      const lid=mk((x1-x0+2)*k,(h+sample+gap+4)*k),lg=lid.getContext('2d');lg.imageSmoothingQuality='high';
      const yTop=Math.min(...top.map(p=>p[1]))-sample-gap-1;
      for(let X=0;X<lid.width;X++){
        const x=x0-1+X/k,t=at(top,x)-gap,b=at(bot,x);
        lg.drawImage(this.src,x,t-sample,1/k,sample,X,(t-sample-yTop)*k,1,(b+.8-(t-sample))*k);
      }
      // smooth across (no streaks from single columns), then a soft convex shading of the lid
      const sm=mk(Math.max(2,lid.width/(4*k)),lid.height),sg=sm.getContext('2d');sg.imageSmoothingQuality='high';sg.drawImage(lid,0,0,sm.width,sm.height);
      lg.globalAlpha=.8;lg.imageSmoothingQuality='high';lg.drawImage(sm,0,0,lid.width,lid.height);lg.globalAlpha=1;
      const sh=lg.createLinearGradient(0,0,0,lid.height);sh.addColorStop(0,'rgba(60,25,20,.10)');sh.addColorStop(.55,'rgba(255,235,220,.06)');sh.addColorStop(1,'rgba(60,25,20,.14)');
      lg.globalCompositeOperation='source-atop';lg.fillStyle=sh;lg.fillRect(0,0,lid.width,lid.height);lg.globalCompositeOperation='source-over';
      // lash colour: the darkest pixels along the upper contour
      let best=[60,40,40],bl=1e9;
      for(let x=x0;x<=x1;x+=.5){const p=this.pixel(x,at(top,x)+.6),l=p[0]+p[1]+p[2];if(p[3]>200&&l<bl){bl=l;best=p}}
      // a soft lash colour: the darkest lash pixel taken a third of the way toward the lid's skin
      const sk=this.pixel((x0+x1)/2,Math.min(...top.map(p=>p[1]))-gap-sample/2),mixL=(a,b)=>Math.round(a*.67+b*.33);
      const lash=`rgba(${mixL(best[0]*.8,sk[0])},${mixL(best[1]*.75,sk[1])},${mixL(best[2]*.8,sk[2])},.92)`;
      return {poly,top,bot,at,x0,x1,h:h+gap,gap,outerRight,lid,lidX:x0-1,lidY:yTop,lash};
    }
    /* Redraws for face params f and the mouth points displaced by disp(x,y,below). Returns false when
       nothing needs drawing. */
    draw(f,disp){
      const key=[...f.blink.map(v=>v.toFixed(3)),f.jaw.toFixed(2),f.smile.toFixed(2),f.wide.toFixed(2),f.squint.toFixed(2)].join();
      if(key===this.state)return this.visible;
      this.state=key;this.changed=true;
      const g=this.g,k=this.k,[bx,by]=this.box;
      g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,this.canvas.width,this.canvas.height);
      g.setTransform(k,0,0,k,-bx*k,-by*k);
      let any=false;
      this.eyes.forEach((e,i)=>{const b=f.blink[Math.min(i,f.blink.length-1)];if(b>.02){this.drawLid(e,b);any=true}});
      if(f.jaw>.05){this.drawMouth(f,disp);any=true}
      if(any){g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-in';g.drawImage(this.faceMask,0,0);g.globalCompositeOperation='source-over'}
      this.visible=any;return any;
    }
    drawLid(e,b){
      const g=this.g,N=24,pts=[],edge=[];
      for(let i=0;i<=N;i++){const x=e.x0+(e.x1-e.x0)*i/N,t=e.at(e.top,x),bt=e.at(e.bot,x);edge.push([x,t+(bt+.35-t)*b])}
      // lid skin above the moving edge
      g.save();
      g.beginPath();g.moveTo(e.x0-.6,e.at(e.top,e.x0)-.4);
      for(let i=0;i<=N;i++){const x=e.x0+(e.x1-e.x0)*i/N,u=Math.sin(Math.PI*i/N);g.lineTo(x,e.at(e.top,x)-.9-e.gap*u*smooth(0,.35,b))}
      g.lineTo(e.x1+.6,e.at(e.top,e.x1)-.4);
      for(let i=N;i>=0;i--)g.lineTo(edge[i][0],edge[i][1]+.15);
      g.closePath();g.clip();
      g.drawImage(e.lid,e.lidX,e.lidY-(1-b)*e.h*.85,e.lid.width/this.k,e.lid.height/this.k);
      g.restore();
      // lash line along the edge, thicker toward the outer corner
      const [w0,w1]=(this.f.lash||[.8,1.4]).map(v=>v*.72);
      g.fillStyle=e.lash;g.beginPath();
      const wAt=i=>{const t=i/N,o=e.outerRight?t:1-t;return lerp(w0,w1,o*o)*(.55+.45*smooth(0,.5,b))};
      for(let i=0;i<=N;i++){const [x,y]=edge[i];i?g.lineTo(x,y-wAt(i)*.35):g.moveTo(x,y-wAt(i)*.35)}
      for(let i=N;i>=0;i--){const [x,y]=edge[i];g.lineTo(x,y+wAt(i)*.65)}
      g.closePath();g.fill();
      if(b>.6&&!this.rg.resident&&this.rg.doll==='adult'){ // a few lashes at the outer end when closed
        g.strokeStyle=e.lash;g.lineWidth=.45;g.lineCap='round';
        for(let j=0;j<3;j++){const i=e.outerRight?N-1-j*2:1+j*2,[x,y]=edge[i],dx=(e.outerRight?1:-1)*(.6+j*.15);g.beginPath();g.moveTo(x,y+.3);g.lineTo(x+dx,y+1.1+(2-j)*.15);g.stroke()}
      }
    }
    drawMouth(f,disp){
      const g=this.g,m=this.f.mouth,top=[],bot=[];
      const N=20,xs=m.map(p=>p[0]),xa=Math.min(...xs),xb=Math.max(...xs);
      for(let i=0;i<=N;i++){
        const x=xa+(xb-xa)*i/N,[y]=R.mouthAt(this.f,x);
        const d0=disp(x,y-.25,false),d1=disp(x,y+.25,true);
        top.push([x+d0[0],y-.25+d0[1]]);bot.push([x+d1[0],y+.25+d1[1]]);
      }
      const gapMax=Math.max(...bot.map((p,i)=>p[1]-top[i][1]));
      if(gapMax<.35)return;
      g.save();
      g.beginPath();top.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));for(let i=N;i>=0;i--)g.lineTo(bot[i][0],bot[i][1]);g.closePath();
      g.clip();
      const yt=Math.min(...top.map(p=>p[1])),yb=Math.max(...bot.map(p=>p[1]));
      const gr=g.createLinearGradient(0,yt,0,yb);
      const kid=!this.f.teeth;
      gr.addColorStop(0,kid?'#5a1c26':'#3b1218');gr.addColorStop(.6,kid?'#6e2632':'#4a1820');gr.addColorStop(1,kid?'#8a3442':'#5c2228');
      g.fillStyle=gr;g.fillRect(xa-2,yt-1,xb-xa+4,yb-yt+2);
      if(gapMax>1.6){ // tongue
        const cx=(xa+xb)/2,w=(xb-xa)*(this.rg.side?.35:.28);
        g.fillStyle=kid?'rgba(214,112,124,.85)':'rgba(196,96,110,.75)';g.beginPath();g.ellipse(this.rg.side?xa+w*.9:cx,yb+gapMax*.1,w,gapMax*.42,0,Math.PI,0);g.fill();
      }
      if(!kid&&gapMax>1.2){ // the edge of the lower teeth
        g.fillStyle='rgba(240,232,226,.55)';g.beginPath();
        for(let i=3;i<=N-3;i++){const [x,y]=bot[i];i>3?g.lineTo(x,y-.55):g.moveTo(x,y-.55)}
        for(let i=N-3;i>=3;i--){const [x,y]=bot[i];g.lineTo(x,y+.1)}
        g.closePath();g.fill();
      }
      g.restore();
    }
  }

  /* ---------- models (built once per look and view, shared by instances) ---------- */
  /* model = {key, rig, pieces:[{canvas, box, pos, index, bones, frs, face, tint, alpha:'far'|..., shift}],
     overlay, gpu} */
  async function buildDollModel(shot,view){
    const layers=await composeDollLayers(shot,view);await later();
    const rg=R.dressedRig(layers.doll,view,layers.shot.outfit),dv=dollView(layers.doll,view);
    const fan=R.sleevesOf(layers.shot.outfit)==='long';
    const {lab,armMask}=await baseLabels(rg,dv,!fan);await later();
    const kindOutfit=R.outfitKind(layers.shot.outfit),outfitFit=catalogItem(layers.shot.outfit)?.fit?.[layers.doll]?.[view]||{};
    const armIdx=layers.layers.findIndex(l=>l.kind==='arm');
    const groups={hairB:[],far:[],torso:[],legs:[],skirt:[],arms:[],over:[],hairF:[]};
    let overlaySrc=null,headPiece=null;
    const armR=layers.doll==='little'?27:26,sleeveR=layers.doll==='little'?24:22,px=rg.px;
    // x of arm a's axis (shoulder, elbow, wrist, hand) at canvas row y
    const armAxisX=(a,y)=>{const ch=[px['sh'+a],px['el'+a],px['wr'+a],px['hand'+a]];if(y<=ch[0][1])return ch[0][0];
      for(let k=1;k<ch.length;k++)if(y<=ch[k][1]){const [p,q]=[ch[k-1],ch[k]];return p[0]+(q[0]-p[0])*(y-p[1])/(q[1]-p[1])}return ch[3][0]};
    const armNear=armMask&&dilate(armMask,W,H,1),overArm=armMask&&dilate(armMask,W,H,4);
    // side views: how far the torso reaches under the top of the leg (deeper at the back: the seat)
    const shoulderBelow=Math.max(rg.armCut?rg.armCut[0][1][1]:0,rg.armCut?rg.armCut[1][1][1]:0);
    const hipBand=new Float32Array(W);
    if(rg.side){const [a,b]=rg.hipLine,k=layers.doll==='little'?.75:1;for(let x=0;x<W;x++){const t=clamp((x-a[0])/(b[0]-a[0]),0,1);hipBand[x]=hipLineY(rg,x)+k*lerp(45,120,t)}}
    for(let li=0;li<layers.layers.length;li++){
      const L=layers.layers[li];
      let canvas=L.canvas;
      if(L.kind==='shoesBack'&&layers.nearShoe)canvas=layers.nearShoe;
      let d=pixelsOf(canvas).data;
      const box=alphaBox(d);if(!box)continue;
      const hairKind=['hairBack','hairFront','clipBehind'].includes(L.kind)||(L.kind==='charm'&&L.behind);
      const headKind=['earrings','studs','clip','charm'].includes(L.kind)&&!hairKind;
      if(hairKind||headKind){
        const pc=makePiece(d,box,()=>true,{kind:hairKind?'hair':'headItem',grid:hairKind?config.hairGrid:6,layer:L.kind},true);
        if(pc)(L.kind==='hairBack'||L.kind==='clipBehind'||L.behind?groups.hairB:groups.hairF).push(pc);
        continue;
      }
      const ex=[Math.max(0,box[0]-3),Math.max(0,box[1]-3),Math.min(W-1,box[2]+3),Math.min(H-1,box[3]+3)];
      // labels for this layer
      const lb=new Uint8Array(lab);
      let sleeve=null;
      const underArm=rg.side&&li<armIdx;
      if(underArm){
        if(L.kind==='outfit'&&outfitFit.armClip){ // the sleeve above the hem moves with the arm
          const [ox,oy]=dv.origin;
          const clipM=maskOf(W,H,g=>{g.translate(ox,oy);g.beginPath();outfitFit.armClip.forEach(s=>shapePathInto(g,s));g.fill()});
          sleeve=i=>armMask[i]&&!clipM[i];
        }
        for(let i=0;i<lb.length;i++)if(lb[i]===L_ARM0)lb[i]=L_TORSO;
        if(['body','outfit','outfitBack'].includes(L.kind)){const orig=d;d=new Uint8ClampedArray(d);inpaintUnder(d,armNear);if(sleeve){const s=sleeve,o=orig;sleeve={test:s,data:o}}}
      }
      // front/back: a garment wider than the bare arm crosses the arm/body line measured on the bald
      // doll; below the armpit only what lies within a sleeve's reach of the arm bones goes with the arm
      const sleeves=R.sleevesOf(layers.shot.outfit);
      if(!rg.side&&L.kind!=='body'&&sleeves!=='long'){
        for(let y=ex[1];y<H;y++)for(let x=ex[0];x<=ex[2];x++){
          const i=y*W+x,l=lb[i];if(l!==L_ARM0&&l!==L_ARM1)continue;
          const a=l===L_ARM0?0:1;
          if(y<rg.armCut[a][1][1]){if(sleeves==='puff')lb[i]=L_PUFF;continue}
          // outward of the arm's axis everything is sleeve; toward the body only a sleeve's half-width;
          // puffed sleeves stay on the shoulder down to the elbow (the arm comes out from under them)
          if(sleeves==='puff'&&y<px['el'+a][1]-6)lb[i]=L_PUFF;
          else if((x-armAxisX(a,y))*(a?-1:1)>sleeveR)lb[i]=y>hipLineY(rg,x)?(x<px.root[0]?L_LEG0:L_LEG1):L_TORSO;
        }
      }
      if(rg.side&&li>armIdx&&L.kind==='over')for(let i=0;i<lb.length;i++)if(overArm[i])lb[i]=L_ARM0;
      if(kindOutfit==='skirt'&&['outfit','outfitBack','over'].includes(L.kind)){
        // below skirtTop the garment is skirt, except a long sleeve's cuff round the forearm
        const cuffEnd=[0,1].map(a=>[lerp(px['wr'+a][0],px['hand'+a][0],.3),lerp(px['wr'+a][1],px['hand'+a][1],.3)]);
        const sleeveTo=[0,1].map(a=>{if(rg.side)return false;const m=[(px['el'+a][0]+px['wr'+a][0])/2,(px['el'+a][1]+px['wr'+a][1])/2];
          return d[(Math.round(m[1])*W+Math.round(m[0]))*4+3]>200});
        for(let y=Math.ceil(rg.skirtTop);y<H;y++)for(let x=0;x<W;x++){
          const i=y*W+x,l=lb[i];
          if(l===L_TORSO||l===L_LEG0||l===L_LEG1)lb[i]=L_SKIRT;
          else if(!rg.side&&(l===L_ARM0||l===L_ARM1)){const a=l===L_ARM0?0:1;if(!sleeveTo[a]||y>cuffEnd[a][1]+6||(x-armAxisX(a,y))*(a?-1:1)>armR*.8)lb[i]=L_SKIRT}
        }
      }
      if(L.kind==='body')for(let y=0;y<Math.ceil(rg.neckCut);y++)for(let x=0;x<W;x++){const i=y*W+x;if(lb[i]===L_TORSO)lb[i]=L_HEAD}
      if(L.kind==='arm')lb.fill(L_ARM0);
      for(const P of ORDER){
        // side views: the torso keeps the top of the thigh under the leg, so a swinging leg never
        // opens a hole at the hip (at rest the leg piece covers it exactly)
        // front/back: the torso keeps the shoulder disc under each arm, so a raised arm never opens a gap
        const member=P!==L_TORSO?i=>lb[i]===P:rg.side?i=>lb[i]===P||(lb[i]===L_LEG0&&Math.floor(i/W)<hipBand[i%W])
          :fan?i=>lb[i]===P:i=>lb[i]===P||((lb[i]===L_ARM0||lb[i]===L_ARM1)&&Math.floor(i/W)<shoulderBelow);
        const kind=P===L_ARM0||P===L_ARM1?'arm':P===L_LEG0||P===L_LEG1?'leg':P===L_SKIRT?'skirt':'torso';
        const pc=makePiece(d,ex,member,{kind,limb:P===L_ARM1||P===L_LEG1?1:0,fan:fan&&kind==='arm',layer:L.kind,grid:P===L_HEAD?config.headGrid:config.grid,face:P===L_HEAD&&!!rg.face});
        if(!pc)continue;
        groups[GROUP_OF[P]].push(pc);
        if(P===L_HEAD&&rg.face){overlaySrc=canvas;headPiece=pc;groups.torso.push({overlay:true})}
      }
      if(sleeve){const pc=makePiece(sleeve.data,ex,i=>sleeve.test(i),{kind:'arm',limb:0,layer:'sleeve',grid:config.grid});if(pc)groups.arms.unshift(pc)}
      await later();
    }
    let farOffset=[0,0];
    if(rg.side){ // the far arm and leg: shaded copies of the near ones; the far shoe follows the far foot
      for(const pc of [...groups.legs,...groups.arms])groups.far.push({copyOf:pc});
      if(layers.farShoe){
        const f=catalogItem(layers.shot.shoes).fit[layers.doll][view].far||{};farOffset=[f.dx||0,f.dy||0];
        const d=pixelsOf(layers.farShoe).data,box=alphaBox(d);
        const pc=box&&makePiece(d,box,()=>true,{kind:'leg',limb:1,layer:'farShoe',grid:config.grid,farShoe:true,shift:farOffset},true);
        if(pc)groups.far.unshift(pc);
      }
    }
    // front and back: a flared skirt lies over the hands (as in the still picture); side views: the near arm is in front
    const order=[...groups.hairB,...groups.far,...groups.torso,...groups.legs,...(rg.side?[...groups.skirt,...groups.arms]:[...groups.arms,...groups.skirt]),...groups.over,...groups.hairF];
    // drawn expression heads (puppet-rig.js EXPRESSION_ART), when a sheet exists for this doll and view
    const expr=headPiece&&await expressionHeads(layers.doll,view,headPiece,layers.shot).catch(e=>{if(config.debug)console.warn(e);return null});
    if(expr){headPiece.expr=expr;overlaySrc=null}
    return finishModel(rg,order,overlaySrc,{farOffset,look:layers.shot,doll:layers.doll,expr:!!expr});
  }
  /* Drawn heads (puppet-rig.js EXPRESSION_ART, built by art/build_faces.py): for each expression the
     bare base head gets the drawn cell blended in (its alpha is the region mask), then the game's own
     makeup pass (applyFaceMakeup: the cell's lips, eyeshadow on a closed lid, blush), and the result is
     laid over the live head piece through the same mask, so outside the region it is the live doll
     exactly. Side sheets are drawn for the left view and mirrored for the right. Returns
     {name: canvas in the head piece's crop}, or null when there is no sheet for this doll and view. */
  async function expressionHeads(doll,view,piece,shot){
    if(view==='back')return null;
    const spec=R.EXPRESSION_ART[doll]?.[view==='front'?'front':'side'];
    if(!spec?.file||typeof applyFaceMakeup!=='function')return null;
    const srcView=view==='right'?'left':view,dv=dollView(doll,srcView);
    const [sheet,lipsSheet,base]=await Promise.all([asset(spec.file),spec.lips?asset(spec.lips):null,spriteCanvas(dv.art)]);
    const [cw,ch]=spec.cell,k=spec.scale||1,[ax,ay]=spec.at,o=R.ORIGINS[doll][srcView];
    const face=shiftFace(dv.face||{},-ax,-ay),[bx,by]=piece.box,out={};
    // where the crop goes in the head piece (canvas px of this view)
    const right=view==='right',px=right?R.ORIGINS[doll].right[0]+R.MIRROR[doll]-(ax+cw):ax+o[0],py=ay+o[1];
    R.EXPRESSIONS.forEach((name,n)=>{
      if(name==='neutral')return; // the rest pose is the live doll's own face
      const sx=(n%4)*cw*k,sy=Math.floor(n/4)*ch*k;
      const c=mk(cw,ch),g=g2(c);g.imageSmoothingQuality='high';
      g.drawImage(base,ax,ay,cw,ch,0,0,cw,ch);g.drawImage(sheet,sx,sy,cw*k,ch*k,0,0,cw,ch);
      const im=g.getImageData(0,0,cw,ch);
      const region=R.EXPRESSION_REGION[name];
      let lipsMask=null;
      if(lipsSheet&&region!=='eyes'){const lc=mk(cw,ch),lg=g2(lc);lg.imageSmoothingQuality='high';lg.drawImage(lipsSheet,sx,sy,cw*k,ch*k,0,0,cw,ch);
        const ld=lg.getImageData(0,0,cw,ch).data;lipsMask=new Float32Array(cw*ch);for(let i=0;i<lipsMask.length;i++)lipsMask[i]=ld[i*4]/255}
      applyFaceMakeup(im.data,cw,ch,shot,face,{lipsMask,eyesClosed:name==='blink'?1:name==='half-closed'?.6:name==='laugh'?.7:0});
      g.putImageData(im,0,0);
      // keep it only where the cell blends (its alpha), over the live head piece
      g.globalCompositeOperation='destination-in';g.drawImage(sheet,sx,sy,cw*k,ch*k,0,0,cw,ch);
      const v=mk(piece.canvas.width,piece.canvas.height),vg=v.getContext('2d');vg.drawImage(piece.canvas,0,0);vg.imageSmoothingQuality='high';
      vg.save();vg.beginPath();vg.rect(0,0,v.width,v.height);vg.clip();
      if(right){vg.translate(px-bx+cw,py-by);vg.scale(-1,1)}else vg.translate(px-bx,py-by);
      vg.drawImage(c,0,0);vg.restore();
      out[name]=v;
    });
    return out;
  }
  async function buildResidentModel(id){
    const rg=R.residentRig(id),img=await asset('assets/scenes/'+id+'.png');
    const [w,h]=rg.size,bc=mk(W,H),g=g2(bc);g.drawImage(img,0,0,w,h);
    const d=g.getImageData(0,0,W,H).data,box=alphaBox(d);
    const pieces=[];
    const pb=makePiece(d,box,i=>Math.floor(i/W)>=rg.neckCut,{kind:'torso',grid:6});if(pb)pieces.push(pb);
    const ph=makePiece(d,box,i=>Math.floor(i/W)<rg.neckCut,{kind:'torso',grid:1,face:true});if(ph)pieces.push(ph);
    pieces.push({overlay:true});
    return finishModel(rg,pieces,bc,{resident:id,size:[w,h]});
  }
  /* Meshes, skinning chains and face bases for every piece (far copies share their source's mesh). */
  function finishModel(rg,order,overlaySrc,extra){
    let overlay=null;
    for(const pc of order)if(!pc.overlay&&!pc.copyOf)Object.assign(pc,meshFor(rg,pc));
    const pieces=[];
    for(const pc of order){
      if(pc.overlay){
        if(!overlaySrc||!rg.face)continue;
        overlay=overlay||new FaceOverlay(rg,overlaySrc,rg.resident?5:3);
        const ob=overlay.box,obj={kind:'torso',overlay:true,box:ob.slice(),alpha:new Uint8Array(ob[2]*ob[3]).fill(1),canvas:overlay.canvas,grid:4};
        Object.assign(obj,meshFor(rg,obj));pieces.push(obj);continue;
      }
      if(pc.copyOf){
        const src=pc.copyOf,bones=src.bones.slice();for(let i=0;i<bones.length;i++)if(FAR_MAP[bones[i]]!==undefined)bones[i]=FAR_MAP[bones[i]];
        pieces.push({...src,bones,far:true,copyOf:src});continue;
      }
      pieces.push(pc);
    }
    for(const pc of pieces){delete pc.alpha}
    return {rig:rg,pieces,overlay,...extra,gpu:null,refs:0};
  }
  function meshFor(rg,pc){
    const s=pc.grid||config.grid;
    let rows=null;
    if(pc.face&&rg.face){ // rows follow the mouth line; two of them hug it (y - .25, y + .25)
      const [,y0,,ch]=pc.box,top=y0-s,bot=y0+ch+s;
      const raw=x=>{const [my]=R.mouthAt(rg.face,x),a=[],b=[];for(let v=-.25;my+v>top;v-=s)a.unshift(my+v);for(let v=.25;my+v<bot;v+=s)b.push(my+v);return [a,b]};
      let na=0,nb=0;for(let x=pc.box[0];x<=pc.box[0]+pc.box[2]+s;x+=s){const [a,b]=raw(x);na=Math.max(na,a.length);nb=Math.max(nb,b.length)}
      rows=x=>{const [a,b]=raw(x);while(a.length<na)a.unshift(a[0]-s);while(b.length<nb)b.push(b[b.length-1]+s);const out=[...a,...b];out.split=na;return out};
    }
    return withChains(rg,pc,gridMesh(pc,s,rows));
  }
  function withChains(rg,pc,m){
    const n=m.pos.length/2,bones=new Float32Array(n*8),frs=new Float32Array(n*8),uv=new Float32Array(n*2);
    const face=pc.face&&rg.face?new Float32Array(n*8):null;
    const [bx,by,bw,bh]=pc.box;
    for(let v=0;v<n;v++){
      const x=m.pos[v*2],y=m.pos[v*2+1];
      uv[v*2]=(x-bx)/bw;uv[v*2+1]=(y-by)/bh;
      pack(chainFor(rg,pc.kind,x,y,pc.limb||0,!!pc.fan),bones,frs,v);
      if(face){
        const below=m.below[v]===1;
        ['jaw','smile','wide','squint'].forEach((k,j)=>{const [dx,dy]=R.faceDisplace(rg.face,{[k]:1},x,y,below);face[v*8+j*2]=dx;face[v*8+j*2+1]=dy});
      }
    }
    return {pos:m.pos,index:m.index,uv,bones,frs,faceBasis:face};
  }

  /* ---------- GPU ---------- */
  const VERT=`
in vec2 position;in vec2 uv;in vec4 aB0;in vec4 aB1;in vec4 aF0;in vec4 aF1;in vec4 aD0;in vec4 aD1;
uniform vec4 uCam;uniform vec2 uJ[${NB}];uniform vec4 uP[${NB}];uniform vec2 uS[${NB}];uniform vec4 uFace;uniform vec2 uShift;
out vec2 vUv;
mat3 boneM(int b,float f){
  vec2 J=uJ[b];vec4 P=uP[b];vec2 S=uS[b];
  float r=P.x*f,c=cos(r),s=sin(r),sx=1.+(S.x-1.)*f,sy=1.+(S.y-1.)*f;
  mat2 A=mat2(c*sx,s*sx,-s*sy,c*sy);
  vec2 o=J+P.yz*f-A*J;
  return mat3(vec3(A[0],0.),vec3(A[1],0.),vec3(o,1.));
}
void main(){
  vec2 p=position+aD0.xy*uFace.x+aD0.zw*uFace.y+aD1.xy*uFace.z+aD1.zw*uFace.w-uShift;
  mat3 M=mat3(1.);
  for(int i=0;i<4;i++){float f=aF0[i];if(f>0.)M=M*boneM(int(aB0[i]+.5),f);}
  for(int i=0;i<4;i++){float f=aF1[i];if(f>0.)M=M*boneM(int(aB1[i]+.5),f);}
  vec2 q=(M*vec3(p,1.)).xy;
  vUv=uv;
  gl_Position=vec4((q.x-uCam.x)/uCam.z*2.-1.,1.-(q.y-uCam.y)/uCam.w*2.,0.,1.);
}`;
  const FRAG=`
precision highp float;
uniform sampler2D map;uniform sampler2D mask;uniform vec4 uTint;
in vec2 vUv;out vec4 outColor;
void main(){vec4 c=texture(map,vUv)*texture(mask,vUv).a;outColor=vec4(c.rgb*uTint.rgb,c.a)*uTint.a;}`;
  /* the head piece with drawn expressions: the rest head plus weighted differences of up to two eye and
     two mouth variants (each differs from the rest head only in its own region) */
  const FRAG_EXPR=`
precision highp float;
uniform sampler2D map;uniform sampler2D mask;uniform vec4 uTint;
uniform sampler2D mapE0;uniform sampler2D mapE1;uniform sampler2D mapM0;uniform sampler2D mapM1;uniform vec4 uW;
in vec2 vUv;out vec4 outColor;
void main(){
  vec4 r=texture(map,vUv);
  vec4 c=r+uW.x*(texture(mapE0,vUv)-r)+uW.y*(texture(mapE1,vUv)-r)+uW.z*(texture(mapM0,vUv)-r)+uW.w*(texture(mapM1,vUv)-r);
  c*=texture(mask,vUv).a;outColor=vec4(c.rgb*uTint.rgb,c.a)*uTint.a;}`;
  function getGL(){
    if(ctxGL&&!ctxGL.renderer.getContext().isContextLost())return ctxGL;
    const canvas=document.createElement('canvas');
    const renderer=new T.WebGLRenderer({canvas,alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'default',failIfMajorPerformanceCaveat:!config.allowSoftwareGL});
    renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.setPixelRatio(1);
    renderer.autoClear=true;renderer.sortObjects=false;
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();for(const m of models.values())m.gpu=null;ctxGL=null;for(const p of instances)p.fail('context lost')});
    ctxGL={renderer,canvas,w:0,h:0,camera:new T.OrthographicCamera(0,1,0,1,-1,1)};
    return ctxGL;
  }
  function uploadModel(m){
    if(m.gpu)return m.gpu;
    const scene=new T.Scene(),shared={uCam:{value:new T.Vector4(0,0,W,H)},uJ:{value:[]},uP:{value:[]},uS:{value:[]},uFace:{value:new T.Vector4()}};
    for(let b=0;b<NB;b++){const J=m.rig.px[R.PIVOT[R.BONES[b]]]||m.rig.px.root||[0,0];shared.uJ.value.push(new T.Vector2(J[0],J[1]));shared.uP.value.push(new T.Vector4());shared.uS.value.push(new T.Vector2(1,1))}
    const textures=new Map(),geos=new Map(),mats=[],meshes=[];
    m.pieces.forEach((pc,i)=>{
      const src=pc.copyOf||pc;
      let tex=textures.get(src.canvas);
      if(!tex){tex=new T.CanvasTexture(src.canvas);tex.flipY=false;tex.premultiplyAlpha=true;tex.colorSpace=T.NoColorSpace;tex.generateMipmaps=true;
        tex.minFilter=T.LinearMipmapLinearFilter;tex.magFilter=T.LinearFilter;tex.wrapS=tex.wrapT=T.ClampToEdgeWrapping;textures.set(src.canvas,tex)}
      if(pc.overlay){tex.generateMipmaps=false;tex.minFilter=T.LinearFilter}
      let mtex=src.mask?textures.get(src.mask):whiteTex();
      if(!mtex){mtex=new T.CanvasTexture(src.mask);mtex.flipY=false;mtex.premultiplyAlpha=false;mtex.colorSpace=T.NoColorSpace;mtex.generateMipmaps=false;
        mtex.minFilter=mtex.magFilter=T.NearestFilter;mtex.wrapS=mtex.wrapT=T.ClampToEdgeWrapping;textures.set(src.mask,mtex)}
      const geo=new T.BufferGeometry();
      geo.setAttribute('position',new T.BufferAttribute(src.pos,2));geo.setAttribute('uv',new T.BufferAttribute(src.uv,2));
      const pair=(a,b,arr)=>{const ib=new T.InterleavedBuffer(arr,8);geo.setAttribute(a,new T.InterleavedBufferAttribute(ib,4,0));geo.setAttribute(b,new T.InterleavedBufferAttribute(ib,4,4))};
      pair('aB0','aB1',pc.bones);pair('aF0','aF1',src.frs);pair('aD0','aD1',src.faceBasis||zeros(src.pos.length/2*8));
      geo.setIndex(new T.BufferAttribute(src.index,1));geo.boundingSphere=new T.Sphere(new T.Vector3(),1e5);
      const shade=pc.far&&!pc.farShoe;
      const dbg=config.debugPieces&&({arm:[1,.55,.55],leg:[.55,.7,1],skirt:[.6,1,.6],hair:[1,1,.5],headItem:[1,.6,1],torso:pc.face?[1,.85,.6]:[1,1,1]}[pc.kind]);
      const mat=new T.RawShaderMaterial({glslVersion:T.GLSL3,vertexShader:VERT,fragmentShader:pc.expr?FRAG_EXPR:FRAG,
        uniforms:{...shared,map:{value:tex},mask:{value:mtex},...(pc.expr?{mapE0:{value:tex},mapE1:{value:tex},mapM0:{value:tex},mapM1:{value:tex},uW:{value:new T.Vector4()}}:{}),uTint:{value:dbg?new T.Vector4(...dbg,1):new T.Vector4(shade?.74:1,shade?.68:1,shade?.76:1,1)},uShift:{value:new T.Vector2(...(pc.shift||[0,0]))}},
        transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide,
        blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.OneFactor,blendDst:T.OneMinusSrcAlphaFactor,blendSrcAlpha:T.OneFactor,blendDstAlpha:T.OneMinusSrcAlphaFactor});
      const mesh=new T.Mesh(geo,mat);mesh.frustumCulled=false;mesh.renderOrder=i;mesh.userData.piece=pc;
      scene.add(mesh);meshes.push(mesh);mats.push(mat);geos.set(geo,1);
    });
    const exprTex={};
    for(const pc of m.pieces)if(pc.expr)for(const [name,c] of Object.entries(pc.expr)){const t=new T.CanvasTexture(c);t.flipY=false;t.premultiplyAlpha=true;t.colorSpace=T.NoColorSpace;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;textures.set(c,t);exprTex[name]=t}
    return m.gpu={scene,shared,textures,meshes,mats,geos:[...geos.keys()],exprTex,overlayTex:m.overlay?textures.get(m.overlay.canvas):null};
  }
  let white=null;
  function whiteTex(){if(!white){white=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1,T.RGBAFormat);white.needsUpdate=true}return white}
  const zeroCache=new Map();
  function zeros(n){let z=zeroCache.get(n);if(!z){z=new Float32Array(n);zeroCache.set(n,z);if(zeroCache.size>64)zeroCache.delete(zeroCache.keys().next().value)}return z}
  function disposeModel(m){
    const g=m.gpu;if(!g)return;
    for(const t of g.textures.values())t.dispose();for(const geo of g.geos)geo.dispose();for(const mat of g.mats)mat.dispose();
    m.gpu=null;
  }
  /* Models are shared; unreferenced ones stay cached (LRU) up to config.maxModels. */
  function acquire(key,make){
    let p=models.get(key);
    if(p){models.delete(key);models.set(key,p)}
    else{
      p=building.get(key);
      const t0=performance.now();
      if(!p){p=make().then(m=>{building.delete(key);m.key=key;m.buildMs=performance.now()-t0;models.set(key,m);trimModels();return m},e=>{building.delete(key);throw e});building.set(key,p);return p}
      return p;
    }
    return Promise.resolve(p);
  }
  /* Unused models keep their GPU objects only while they are among the few most recent (turning back
     and forth stays instant); beyond config.maxModels they are dropped altogether. */
  function trimModels(){
    const idle=[...models].filter(([,m])=>m.refs<=0);
    idle.slice(0,Math.max(0,idle.length-config.warmModels)).forEach(([,m])=>disposeModel(m));
    for(const [k,m] of idle){if(models.size<=config.maxModels)break;disposeModel(m);models.delete(k)}
  }
  function modelFor(opts,view){
    if(opts.resident)return acquire('res|'+opts.resident,()=>buildResidentModel(opts.resident));
    const shot=normalShot(opts.shot);
    return acquire(lookKey(shot,view),()=>buildDollModel(shot,view));
  }

  /* ---------- instances ---------- */
  let serial=0;
  class Puppet{
    constructor(canvas,opts){
      this.canvas=canvas;this.opts=opts;this.id=++serial;
      this.kind=opts.resident?'resident':'doll';this.doll=opts.resident?'resident':(opts.shot?.doll==='little'?'little':'adult');
      this.seed=R.hashSeed(opts.seed||(opts.resident||this.doll)+'|'+(opts.role||'')+'|'+this.id%3);
      this.t=R.rand(this.seed,1)*40;this.view=opts.view||'front';this.model=null;this.active=false;this.paused=false;this.visible=true;this.dead=false;
      this.walk={on:false,w:0,phase:0,idle:0};this.emoteQ=null;this.talkUntil=0;this.talkW=0;
      this.springs={hair:{x:0,v:0},skirt:{x:0,v:0},sway:{x:0,v:0}};this.prevHipsX=0;
      this.turn=null;this.energy=opts.energy??1;
      this.io=new IntersectionObserver(es=>{for(const e of es)this.visible=e.isIntersecting;kick()});this.io.observe(canvas);
      this.ready=this.load(this.view).then(()=>true,e=>{this.fail(e);return false});
    }
    get seconds(){return this.t}
    async load(view){
      if(!supported())throw new Error('unsupported');
      if(instances.size>config.maxLive)throw new Error('too many puppets');
      await loadThree();if(this.dead)return;
      getGL();
      const m=await modelFor(this.opts,view);if(this.dead)return;
      if(this.model===m)return;
      this.setModel(m,view);
      if(!this.active){this.active=true;this.lastBack=null;this.opts.onActive?.(true);kick()}
    }
    setModel(m,view){
      if(this.model===m)return;
      if(this.model){this.model.refs--;}
      m.refs++;this.model=m;this.view=view;this.rig=m.rig;trimModels();
    }
    /* New look (or backdrop): the old picture keeps moving until the new one is ready. */
    setLook(shot,opts={}){
      if(this.dead||this.kind!=='doll')return this.ready;
      this.opts.shot=shot;if(opts.view)this.view=opts.view;
      const view=this.view;
      this.loading=modelFor(this.opts,view).then(m=>{if(this.dead||this.opts.shot!==shot)return;this.setModel(m,view);this.lastBack=null;if(opts.emote)this.emote(opts.emote);kick()}).catch(e=>this.fail(e));
      return this.loading;
    }
    /* Turn to another view: squash to the edge, swap, open again (no pop). */
    setView(view,turn=true){
      if(this.dead||this.kind!=='doll'||view===this.wantView)return;
      this.wantView=view;
      modelFor(this.opts,view).then(m=>{
        if(this.dead||this.wantView!==view)return;
        if(!turn||!this.model||!this.active){this.setModel(m,view);return}
        if(this.model===m)return;
        this.turn={t:0,dur:.2,to:m,view};m.refs++;kick();
      }).catch(e=>this.fail(e));
    }
    prefetch(views){if(this.kind==='doll'&&supported())for(const v of views)modelFor(this.opts,v).catch(()=>{})}
    emote(name){if(this.dead)return;this.emoteQ={name,t:0};kick()}
    talk(seconds){this.talkUntil=Math.max(this.talkUntil,this.t+seconds);kick()}
    /* walk in place at the natural pace for a while (the runway: the page moves the canvas) */
    strut(seconds){this.strutUntil=this.t+seconds;kick()}
    walking(on){this.walk.on=!!on;if(on)this.walk.idle=0;kick()}
    /* travel in doll px (screen distance / display scale) advances the walk cycle exactly, so the
       stance foot stays planted */
    advance(dist,pace=0){if(this.kind!=='doll')return;const w=this.walk;w.on=true;w.idle=0;w.pace=pace;w.phase+=Math.abs(dist)/R.cycleLength(this.doll,this.view,pace);kick()}
    setPaused(p){this.paused=!!p;kick()}
    shouldRun(){return this.active&&!this.dead&&!this.paused&&this.visible&&!document.hidden&&this.canvas.isConnected}
    fail(e){
      if(this.dead)return;
      if(config.debug)console.warn('puppet off:',e);
      const was=this.active;this.destroy();
      // a canvas that left the page needs no still picture; anything else gets it back
      if(was&&e!=='detached')try{this.opts.onActive?.(false)}catch{}
    }
    destroy(){
      if(this.dead)return;
      this.dead=true;this.active=false;this.io.disconnect();instances.delete(this);
      if(this.model)this.model.refs--;if(this.turn)this.turn.to.refs--;
      this.model=null;trimModels();
    }
    /* Drawn heads: per channel the current and the previous expression with cross-fade weights. */
    exprWeights(f){
      const tg=R.expressionTargets({...f,jawMax:this.rig.face?.jawMax},this.doll),now=this.t;
      const st=this.expr||(this.expr={eye:{cur:null,prev:null,at:-9},mouth:{cur:null,prev:null,at:-9}});
      const step=(c,key,fade)=>{if(key!==c.cur){c.prev=c.cur;c.cur=key;c.at=now;c.fade=fade}const u=clamp((now-c.at)/(c.fade||.05),0,1);return [c.cur,u,c.prev,1-u]};
      const [e0,we0,e1,we1]=step(st.eye,tg.eye,tg.eyeFade),[m0,wm0,m1,wm1]=step(st.mouth,tg.mouth,tg.mouthFade);
      return {e0,we0,e1,we1,m0,wm0,m1,wm1};
    }
    retarget(canvas){this.io.unobserve(this.canvas);this.canvas=canvas;this.io.observe(canvas);this.lastBack=null;kick()}
    /* ---- animation ---- */
    update(dt){
      this.t+=dt;
      const rg=this.rig,ctx={seed:this.seed,doll:this.doll,rig:rg,energy:this.energy};
      if(this.turn){this.turn.t+=dt;if(this.turn.t>=this.turn.dur/2&&this.turn.to!==this.model){const to=this.turn.to;to.refs--;this.setModel(to,this.turn.view);this.lastBack=null}if(this.turn.t>=this.turn.dur)this.turn=null}
      const pose=R.idlePose(this.t,{...ctx,rig:this.rig});
      // walking weight: on while advances arrive, eases out after
      const w=this.walk;
      if(this.t<this.strutUntil&&this.kind==='doll'){w.pace=0;w.phase+=dt*R.walkSpeed(this.doll,this.view)/R.cycleLength(this.doll,this.view);w.on=true;w.idle=0}
      w.idle+=dt;if(w.idle>.12)w.on=false;
      w.w=clamp(w.w+(w.on?dt/.18:-dt/.28),0,1);
      if(w.w>0&&this.kind==='doll'){const wp=R.walkPose(w.phase,{...ctx,pace:w.pace||0});R.mixPose(pose,wp,smooth(0,1,w.w));pose.farAlpha=w.w}
      else if(!w.on)w.phase=Math.round(w.phase*2)/2; // settle on a double-support phase
      this.talkW=clamp(this.talkW+(this.t<this.talkUntil?dt/.15:-dt/.2),0,1);
      if(this.talkW>0)R.addPose(pose,R.talkPose(this.t,ctx),this.talkW);
      if(this.emoteQ){const e=this.emoteQ;e.t+=dt;const r=R.emotePose(R.emoteFor(e.name,this.opts.shot?.outfit,this.view),e.t,ctx);R.addPose(pose,r.pose,1);if(r.done)this.emoteQ=null}
      // follow-through: hair lags the head, the skirt lags the hips
      const head=pose.bones[B.head],hips=pose.bones[B.hips];
      const hv=(hips.x-this.prevHipsX)/Math.max(dt,1e-3);this.prevHipsX=hips.x;
      const hairT=-(head.r+pose.bones[B.neck].r)*.55-clamp(hv,-60,60)*.0009;
      pose.bones[B.hair].r+=R.springStep(this.springs.hair,hairT,dt,1.6,.42);
      const sk=R.springStep(this.springs.skirt,-clamp(hv,-60,60)*.0012+pose.bones[B.root].r*-.4,dt,1.9,.38);
      pose.bones[B.skirt0].r+=sk;pose.bones[B.skirt1].r+=sk;
      if(rg.face)pose.face.jaw=Math.min(pose.face.jaw,rg.face.jawMax||4);
      if(this.kind==='doll'&&this.model?.farOffset){const t=pose.bones[B.thigh1];t.x+=this.model.farOffset[0];t.y+=this.model.farOffset[1]}
      this.pose=pose;
    }
    render(){
      const m=this.model;if(!m)return;
      const gpu=uploadModel(m),G=getGL(),pose=this.pose;
      const lay=this.opts.layout?this.opts.layout(this):{};
      if(!lay)return;
      const canvas=this.canvas;
      if(lay.size){const [cw,ch]=lay.size;if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;this.lastBack=null}}
      const crop=lay.crop||(m.resident?[0,0,...m.size]:[0,0,W,H]),dest=lay.dest||[0,0,canvas.width,canvas.height];
      const q=[1,.8,.65][level]*(lay.quality||1);
      const pw=Math.max(1,Math.round(dest[2]*q)),ph=Math.max(1,Math.round(dest[3]*q));
      if(G.w<pw||G.h<ph){G.w=Math.max(G.w,pw);G.h=Math.max(G.h,ph);G.renderer.setSize(G.w,G.h,false)}
      // bones -> uniforms
      const S=gpu.shared;
      for(let b=0;b<NB;b++){const p=pose.bones[b];S.uP.value[b].set(p.r,p.x,p.y,0);S.uS.value[b].set(p.sx,p.sy)}
      const f=pose.face;S.uFace.value.set(f.jaw,f.smile,f.wide,f.squint);
      if(m.expr){ // drawn heads take over from the procedural face (only the Grown-up's own smile stays a warp)
        S.uFace.value.set(0,this.doll==='adult'?f.smile:0,0,this.doll==='adult'?f.squint*.5:0);
        const w=this.exprWeights(f),U=w&&gpu.meshes.find(x=>x.userData.piece.expr)?.material.uniforms;
        if(U){const tx=k=>k&&gpu.exprTex[k]||U.map.value;U.mapE0.value=tx(w.e0);U.mapE1.value=tx(w.e1);U.mapM0.value=tx(w.m0);U.mapM1.value=tx(w.m1);
          U.uW.value.set(w.e0?w.we0:0,w.e1?w.we1:0,w.m0?w.wm0:0,w.m1?w.wm1:0)}
      }
      // turning: squash about the body's middle
      let sq=1;if(this.turn){const u=this.turn.t/this.turn.dur;sq=Math.max(.06,Math.abs(Math.cos(Math.PI*u)))}
      const cx=crop[0]+crop[2]/2,cw2=crop[2]/sq;
      S.uCam.value.set(cx-cw2/2,crop[1],cw2,crop[3]);
      // far copies fade in as the limbs part
      for(const mesh of gpu.meshes){const pc=mesh.userData.piece;
        if(pc.far&&!pc.farShoe){mesh.material.uniforms.uTint.value.w=pose.farAlpha;mesh.visible=pose.farAlpha>.01}
        if(pc.overlay)mesh.visible=false;}
      if(m.overlay&&gpu.overlayTex){
        const fd=m.rig.face,disp=(x,y,below)=>{const a=R.faceDisplace(fd,{jaw:below?f.jaw:0,smile:f.smile,wide:f.wide,squint:f.squint},x,y,below);return a};
        const vis=m.overlay.draw(f,disp);
        if(m.overlay.changed){gpu.overlayTex.needsUpdate=true;m.overlay.changed=false}
        for(const mesh of gpu.meshes)if(mesh.userData.piece.overlay)mesh.visible=vis;
      }
      const r=G.renderer;
      r.setViewport(0,0,pw,ph);r.setScissor(0,0,pw,ph);r.setScissorTest(true);
      r.render(gpu.scene,G.camera);
      r.setScissorTest(false);
      // into the page's canvas
      const g=canvas.getContext('2d');
      g.save();
      if(lay.back){g.globalCompositeOperation='copy';g.drawImage(lay.back,0,0);g.globalCompositeOperation='source-over'}
      else g.clearRect(0,0,canvas.width,canvas.height);
      if(lay.clip){g.beginPath();g.rect(...lay.clip);g.clip()}
      g.imageSmoothingQuality='high';
      g.drawImage(G.canvas,0,G.h-ph,pw,ph,dest[0],dest[1],dest[2],dest[3]);
      g.restore();
      if(lay.front)g.drawImage(lay.front,0,0);
      m.used=performance.now();
    }
  }

  /* ---------- the shared loop ---------- */
  function kick(){if(!raf&&[...instances].some(p=>p.shouldRun()))raf=requestAnimationFrame(frame)}
  function frame(now){
    raf=0;
    const dt=lastNow?Math.min(.1,(now-lastNow)/1000):1/60;lastNow=now;
    const t0=performance.now();let ran=0;
    for(const p of [...instances]){
      if(!p.canvas.isConnected){p.fail('detached');continue}
      if(!p.shouldRun())continue;
      try{p.update(dt);p.render();ran++}catch(e){p.fail(e)}
    }
    if(ran){
      const cost=performance.now()-t0;frameEma+=(Math.max(cost,dt*1000)-frameEma)*.05;costEma+=(cost-costEma)*.05;
      if(config.quality==='auto'&&frameEma>24&&level<2){level++;frameEma=16}
      raf=requestAnimationFrame(frame);
    }else lastNow=0;
  }
  function tick(){
    for(const p of [...instances]){
      if(!p.canvas.isConnected){p.fail('detached');continue}
      if(p.active&&!wanted())p.fail('switched off');
    }
    if(!instances.size&&ticker){clearInterval(ticker);ticker=0}
    kick();
  }
  document.addEventListener('visibilitychange',()=>{lastNow=0;kick()});
  const onReduced=()=>tick();
  if(reducedQuery.addEventListener)reducedQuery.addEventListener('change',onReduced);else reducedQuery.addListener(onReduced);

  return {
    /* create(canvas, opts) -> puppet, or null when puppets are off. opts: shot + view (doll) or
       resident ('mara' | 'rosa' | 'kit'); layout(p) -> {size:[w,h] canvas px to set, crop:[x,y,w,h]
       of the doll canvas, dest:[x,y,w,h] in the canvas, clip, back (canvas drawn first), front
       (drawn last)}; onActive(on): true when it starts drawing, false when the page must show the
       still picture again; energy (idle amplitude 0..1); seed. */
    create(canvas,opts={}){
      if(!canvas||!supported())return null;
      for(const p of [...instances])if(!p.canvas.isConnected)p.fail('detached');
      if(instances.size>=config.maxLive)return null;
      const p=new Puppet(canvas,opts);instances.add(p);
      if(!ticker)ticker=setInterval(tick,1000);
      return p;
    },
    /* A doll on a portrait canvas (studio and salon stage, player card, booth preview): the backdrop
       (and the postcard's sticker and caption) come from paintPortraitParts, the doll moves between
       them. setLook(shot, view, emote) swaps look and view (a view change alone turns her). */
    portrait(canvas,opts={}){
      let parts=null,shown=normalShot(opts.shot),view=opts.view||'front',token=0;
      const partsKey=s=>[s.doll,s.backdrop,s.frame,s.sticker,s.outfit,opts.postcard?1:0].join('|');
      const p=this.create(canvas,{...opts,layout:()=>parts&&{size:[parts.geo.w,parts.geo.h],back:parts.back,front:parts.front,dest:parts.geo.doll,
        clip:[parts.geo.x,parts.geo.y,parts.geo.width,parts.geo.height]}});
      if(!p)return null;
      const load=s=>paintPortraitParts(s,!!opts.postcard).then(r=>r);
      p.ready=Promise.all([p.ready,load(shown).then(r=>{parts=r})]).then(([ok])=>ok,()=>{p.fail('backdrop');return false});
      p.setLookPortrait=(shot,v=view,emote)=>{
        const next=normalShot(shot),same=lookKey(next,'x')===lookKey(shown,'x'),my=++token;
        const turnOnly=same&&v!==view;view=v;
        if(turnOnly){p.setView(v,true);if(emote)p.emote(emote);return}
        if(same){if(emote)p.emote(emote);return}
        const needParts=partsKey(next)!==partsKey(shown);shown=next;
        (needParts?load(next):Promise.resolve(null)).then(r=>{if(my!==token||p.dead)return;if(r)parts=r;p.wantView=v;p.setLook(next,{view:v,emote});p.lastBack=null;kick()}).catch(e=>p.fail(e));
      };
      return p;
    },
    supported,setEnabled(on){enabled=!!on;tick()},config,
    stats:()=>({live:instances.size,active:[...instances].filter(p=>p.active).length,models:models.size,building:building.size,level,frameMs:+frameEma.toFixed(1),puppetMs:+costEma.toFixed(2),buildMs:[...models.values()].map(m=>m.buildMs|0),
      gpuModels:[...models.values()].filter(m=>m.gpu).length,three:T?'loaded':threeP?'loading':'not loaded',
      memory:ctxGL?{...ctxGL.renderer.info.memory}:null}),
    /* lab and tests: build a model and render one pose into a canvas (no animation loop) */
    async debugRender(canvas,opts,poseFn,layout){
      await loadThree();getGL();
      const m=await modelFor(opts,opts.view||'front');
      const p=Object.create(Puppet.prototype);Object.assign(p,{canvas,opts:{...opts,layout:()=>layout},model:m,rig:m.rig,turn:null});
      p.pose=poseFn(m.rig);p.t=0;p.doll=m.doll||"resident";if(m.expr)p.exprWeights(p.pose.face);p.t=10;p.render();return m; // cross-fades settled
    },
    _models:models,_instances:instances
  };
})();
