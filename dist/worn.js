/* Dressed dolls in high resolution (round 3, art/ART-REQUESTS-ROUND3.md; data in worn-data.js, generated
   by art/build_worn.py).

   For an outfit with "worn" art the body is not the bald base doll plus a warped outfit sprite: it is one
   picture of the doll already wearing the outfit, drawn at WORN_DATA.scale (2) shipped px per doll-local
   px (or the entry's own k) and laid exactly over the old base picture (each doll's new base registers to
   her old one to well under a doll pixel, so hair, faces, shoes, jewelry and accessories stay where they
   were fitted). Everything else she wears is drawn over it as on the old path.

   The outfits and views in ON are worn this way by default; ?worn=0 in the address draws everything on
   the old path (exactly as before), ?worn=1 uses every worn picture there is (review; Worn.setEnabled
   in the labs). Everything else uses the old path, and a picture that fails to load falls back to the old
   path for that outfit and view, so she is never drawn without an outfit and the bald base never shows.

   Hooks (marked "worn.js" in portrait.js and puppet.js):
   - dollOps(shot, view) asks Worn.ops(shot, view) first; it resolves to the same {ops, ...} as dollOps or
     null (old path).
   - composeDoll(raw, view, scale): scale 2 composes on a 1200 x 2120 canvas (the same doll coordinates,
     the worn picture at its full resolution; the 1x layers are upscaled).
   - paintPortrait / paintPortraitParts draw at Worn.portraitScale(shot) (2 for a worn look), so the studio
     stage, booth and player card show the sharp picture at the same size on screen.
   - composeDollLayers: an op may carry `layers` (the puppet's split: body, outfit, near arm). */
const Worn=(()=>{
  /* Which worn art is used: ON lists, per doll and outfit, the views judged clearly better than the flat
     outfit (they are used by default); ?worn=1 uses every worn picture there is (review), ?worn=0 none. */
  const ALL4=['front','left','right','back'];
  const ON={adult:{'tennis-dress':ALL4,'denim-jacket-skirt':ALL4,'crochet-cover-up':ALL4,'hibiscus-flares':ALL4,
    // block C2 (redrawn bodies, fitted to the base at import)
    'aqua-velour-tracksuit':ALL4,'baby-tee-cargo':ALL4,'black-flares-set':ALL4,'butterfly-satin-skirt':ALL4,'green-hibiscus-sundress':ALL4,
    'lilac-satin-bow-dress':ALL4,'pink-velour-cargo':ALL4,'sarong-swimsuit':ALL4,'sequin-halter-dress':ALL4,'tankini-board-shorts':ALL4},
    little:{'dino-romper':ALL4,'rainbow-tutu-tee':ALL4}};
  const q=typeof location!=='undefined'?location.search:'';
  let mode=/[?&]worn=1\b/.test(q)?'all':/[?&]worn=0\b/.test(q)?'off':'default';
  let on=mode!=='off';
  const allowed=(doll,outfit,view)=>mode==='all'||(mode==='default'&&!!ON[doll]?.[outfit]?.includes(view));
  const config={sharpPuppet:true}; // the puppet's garment textures at full resolution
  const failed=new Set();
  const data=()=>typeof WORN_DATA!=='undefined'?WORN_DATA:null;
  const cache=lruCache(8); // full-resolution bodies (about 5.5 MB each): the worn picture and its feet in shoes
  function entry(doll,outfit,view){const D=data();return D?.[doll]?.[outfit]?.[view]||null}
  /* The worn art for this look and view, or null (old path). */
  function use(shot,view){
    if(!on||!allowed(shot.doll,shot.outfit,view))return null;
    const e=entry(shot.doll,shot.outfit,view);
    return e&&!failed.has(e.src)?e:null;
  }
  /* Portrait canvas scale for a look: 2 when its outfit uses worn art (in any view), else 1. */
  function portraitScale(shot){if(!on)return 1;let s=1;for(const v of CATALOG_VIEWS)if(allowed(shot.doll,shot.outfit,v)){const e=entry(shot.doll,shot.outfit,v);if(e)s=Math.max(s,e.k||data().scale)}return s}
  const CATALOG_VIEWS=['front','left','right','back'];
  /* With the flag on, the outfit cards show the garment as it is now drawn (the worn front view's
     garment), not the old flat sprite, so the card matches what she puts on. */
  const oldThumbs=new Map();
  function cards(){
    if(typeof CATALOG==='undefined'||!data()?.thumbs)return;
    for(const [doll,list] of Object.entries(data().thumbs))for(const [id,src] of Object.entries(list)){const it=CATALOG.items[id];if(!it||!it.dolls?.includes(doll))continue;
      if(!oldThumbs.has(id))oldThumbs.set(id,it.thumb);it.thumb=on&&allowed(doll,id,"front")?src:oldThumbs.get(id)}
  }
  cards();

  /* ---------- the body picture ---------- */
  const scaleFace=(f,k,dx,dy)=>{
    const P=p=>p.map(([x,y])=>[(x+dx)*k,(y+dy)*k]);
    return {...f,lids:f.lids&&f.lids.map(g=>({...g,gradient:[(g.gradient[0]+dx)*k,(g.gradient[1]+dy)*k,g.gradient[2]*k,g.gradient[3]*k,...g.gradient.slice(4)]})),
      eyes:f.eyes&&f.eyes.map(P),cheeks:f.cheeks&&f.cheeks.map(([x,y,rx,ry])=>[(x+dx)*k,(y+dy)*k,rx*k,ry*k]),
      lips:f.lips&&P(f.lips),mouth:f.mouth&&P(f.mouth),lipBlur:(f.lipBlur??1.2)*k,lidBlur:(f.lidBlur||0)*k};
  };
  /* The worn picture with the colourway (garment pixels only, the mask), her makeup and nail polish, at
     full resolution; cached per look like the old body layer. */
  function wornBody(shot,view,e){
    const k=e.k||data().scale,item=catalogItem(shot.outfit),tint=(item.tints||[]).find(t=>t.id===shot.outfitTint);
    const tinted=tint&&tint.id!=='original';
    return memo(cache,['worn',bodyKey(shot,view),tinted?tint.id:''].join('|'),async()=>{
      const [img,mask]=await Promise.all([asset(e.src),tinted?asset(e.mask):null]);
      const c=makeCanvas(img.naturalWidth,img.naturalHeight),g=ctx2d(c);g.drawImage(img,0,0);
      if(tinted){ // the colourway on the garment only (skin, lips and eyes stay)
        const t=tintCanvas(c,tint),tg=ctx2d(t);
        tg.globalCompositeOperation='destination-in';tg.imageSmoothingQuality='high';tg.drawImage(mask,0,0,t.width,t.height);
        // never the skin: a mask can take in skin where the base had bodysuit (an off-shoulder neckline), and
        // a red or pink colourway's hue range reaches skin tones
        const ti=tg.getImageData(0,0,t.width,t.height),td=ti.data,od=g.getImageData(0,0,c.width,c.height).data;
        for(let i=0;i<td.length;i+=4){if(!td[i+3])continue;const r=od[i],gg=od[i+1],b=od[i+2];if(r>gg&&gg>b&&r>90&&(gg-b)>(r-gg)*.35&&(r-b)>40)td[i+3]=0}
        tg.putImageData(ti,0,0);
        g.drawImage(t,0,0);
      }
      const dv=dollView(shot.doll,view),[ax,ay]=e.at;
      // makeup on a crop round the face (the landmarks are doll-local; here k px per doll px)
      const face=dv.face||{};
      const pts=[...(face.lips||[]),...(face.eyes||[]).flat(),...(face.cheeks||[]).flatMap(([x,y,rx,ry])=>[[x-rx,y-ry],[x+rx,y+ry]]),...(face.lids||[]).flatMap(l=>[[l.gradient[0]-l.gradient[2],l.gradient[1]-l.gradient[3]],[l.gradient[0]+l.gradient[2],l.gradient[1]+l.gradient[3]]])];
      if(pts.length){
        const m=12,x0=Math.max(0,Math.floor((Math.min(...pts.map(p=>p[0]))-m-ax)*k)),y0=Math.max(0,Math.floor((Math.min(...pts.map(p=>p[1]))-m-ay)*k));
        const x1=Math.min(c.width,Math.ceil((Math.max(...pts.map(p=>p[0]))+m-ax)*k)),y1=Math.min(c.height,Math.ceil((Math.max(...pts.map(p=>p[1]))+m-ay)*k));
        const im=g.getImageData(x0,y0,x1-x0,y1-y0);
        applyFaceMakeup(im.data,im.width,im.height,shot,scaleFace(face,k,-ax-x0/k,-ay-y0/k));
        g.putImageData(im,x0,y0);
      }
      const nails=CATALOG.makeup.nails.find(o=>o.id===shot.nails);
      if(nails?.color&&dv.nails){
        const shoe=catalogItem(shot.shoes),toes=!shoe||shoe.openToe;
        const shapes=dv.nails.fingers.concat(toes?dv.nails.toes:[]).map(([x,y,rx,ry,r])=>({ellipse:[(x-ax)*k,(y-ay)*k,rx*k,ry*k,r]}));
        if(shapes.length){const im=g.getImageData(0,0,c.width,c.height);
          applyColor(im.data,shapeMask(c.width,c.height,shapes,.7*k),hexRgb(nails.color),.9,'color',{ref:dv.nails.ref||200,contrast:.8,gloss:225,lift:1});
          g.putImageData(im,0,0)}
      }
      return c;
    });
  }
  /* The bare feet inside shoes: portrait.js fitFeet at k px per doll px (the body's top-left corner at
     doll-local `at`). Same rules: below foot.top each column is stretched so the sole lands on the shoe's
     footbed, sx lengthens the foot about cx, and below trim nothing shows outside the shoe's mask. */
  function fitFeetK(body,shoes,fit,dv,doll,k,at,baseW){
    const foot=fit?.foot,trimY=fit?.trim??dollView(doll,'left').footTop;
    if(!foot&&trimY===undefined)return body;
    const [ox,oy]=dv.origin,W=body.width,H=body.height,X=u=>(u-at[0])*k,Y=v=>(v-at[1])*k;
    const c=makeCanvas(W,H),g=ctx2d(c);g.drawImage(body,0,0);
    const im=g.getImageData(0,0,W,H),d=im.data;
    if(foot){
      const src=new Uint8ClampedArray(d),top=Math.max(0,Math.floor(Y(foot.top))),ramp=(foot.ramp??30)*k,sx=foot.sx??1,cx=X(foot.cx??baseW/2);
      const sole=new Float32Array(W).fill(-1);
      for(let x=0;x<W;x++)for(let y=H-1;y>=top;y--)if(src[(y*W+x)*4+3]>128){sole[x]=y+.5;break}
      if(foot.bed.every(p=>p[1]===foot.bed[0][1])){const lo=Math.max(...sole);if(lo>top)sole.fill(lo)}
      const bed=foot.bed.map(([x,y])=>[X(x),Y(y)]),bedAt=x=>{if(x<=bed[0][0])return bed[0][1];for(let i=1;i<bed.length;i++)if(x<=bed[i][0]){const [x0,y0]=bed[i-1],[x1,y1]=bed[i];return y0+(y1-y0)*(x-x0)/(x1-x0)}return bed[bed.length-1][1]};
      const px=(x,y,j)=>x<0||y<0||x>=W||y>=H?0:src[(y*W+x)*4+j];
      for(let y=top;y<H;y++){
        const kk=1+(sx-1)*Math.min(1,(y-top)/ramp);
        for(let x=0;x<W;x++){
          const o=(y*W+x)*4,xs=cx+(x+.5-cx)/kk-.5,xi=Math.round(Math.min(W-1,Math.max(0,xs)));
          const yb=sole[xi],yt=bedAt(x+.5);
          let ys=-1;
          if(yb>top&&yt>top)ys=yb<yt-k?y:top+(y+.5-top)*(yb-top)/(yt-top)-.5;
          if(ys<0||ys>H){d[o+3]=0;continue}
          const x0=Math.floor(xs),y0=Math.floor(ys),fx=xs-x0,fy=ys-y0;let r=0,gg=0,b=0,a=0;
          for(let j=0;j<4;j++){const qx=x0+(j&1),qy=y0+(j>>1),w=((j&1)?fx:1-fx)*((j>>1)?fy:1-fy),al=px(qx,qy,3)*w;
            r+=px(qx,qy,0)*al;gg+=px(qx,qy,1)*al;b+=px(qx,qy,2)*al;a+=al}
          if(a<.5){d[o+3]=0;continue}
          d[o]=r/a;d[o+1]=gg/a;d[o+2]=b/a;d[o+3]=a;
        }
      }
    }
    if(trimY!==undefined){
      const ms=shoes.mask||shoes.back,mk=makeCanvas(ms.width,ms.height),mkg=ctx2d(mk);mkg.drawImage(ms,0,0);
      const SW=mk.width,SH=mk.height,sd=mkg.getImageData(0,0,SW,SH).data,lim=fit?.trimAlpha??60;
      for(let y=Math.max(0,Math.floor(Y(trimY)));y<H;y++)for(let x=0;x<W;x++){
        const o=(y*W+x)*4;if(!d[o+3])continue;
        const Xc=Math.round(at[0]+(x+.5)/k-.5+ox),Yc=Math.round(at[1]+(y+.5)/k-.5+oy);
        const sa=Xc<0||Yc<0||Xc>=SW||Yc>=SH?0:sd[(Yc*SW+Xc)*4+3];
        if(sa<lim)d[o+3]=0;else if(sa<255)d[o+3]=d[o+3]*Math.min(1,(sa-lim)/(255-lim)*1.6);
      }
    }
    g.putImageData(im,0,0);return c;
  }
  /* The same on the band of rows it changes only (the feet), cached per look: a quarter of the pixel work. */
  function fittedFeet(shot,view,e,body,shoes,baseW){
    const doll=shot.doll,fit=catalogItem(shot.shoes).fit[doll][view],dv=dollView(doll,view),k=e.k||data().scale;
    return memo(cache,['feet',bodyKey(shot,view),shot.outfitTint,shot.shoesTint].join('|'),async()=>{
      const foot=fit?.foot,trimY=fit?.trim??dollView(doll,'left').footTop;
      const v0=Math.min(foot?foot.top:Infinity,trimY??Infinity);
      if(!isFinite(v0))return body;
      const y0=Math.max(0,Math.floor((v0-e.at[1])*k)-4),band=makeCanvas(body.width,body.height-y0);
      band.getContext('2d').drawImage(body,0,-y0);
      const done=fitFeetK(band,shoes,fit,dv,doll,k,[e.at[0],e.at[1]+y0/k],baseW);
      const c=makeCanvas(body.width,body.height),g=c.getContext('2d');
      g.drawImage(body,0,0,body.width,y0,0,0,body.width,y0);g.drawImage(done,0,y0);
      return c;
    });
  }

  /* Trousers that reach the floor: the garment below the knees (the worn picture as delivered, its mask),
     drawn again over the shoes, so the hem lies over the shoe as on the flat path for trousers (the feet
     inside the shoes are fitted on the body picture, which also trims the hem; this puts it back). null
     when the garment stops above the knees (skirts, shorts). */
  function hemLayer(shot,view,e,body){
    const k=e.k||data().scale,[,ay]=e.at,cut=KNEE[shot.doll]||640;
    return memo(cache,['hem',bodyKey(shot,view),shot.outfitTint].join('|'),async()=>{
      const mask=await asset(e.mask),W=body.width,H=body.height,y0=Math.max(0,Math.round((cut-ay)*k));
      const m=makeCanvas(W,H),mg=ctx2d(m);mg.drawImage(mask,0,0,W,H);
      const md=mg.getImageData(0,y0,W,H-y0).data;let any=0;for(let i=3;i<md.length;i+=4)if(md[i]>128){any++;if(any>W)break}
      if(any<=W)return null; // nothing of the garment below the knees
      const c=makeCanvas(W,H),g=c.getContext('2d');g.drawImage(body,0,0);g.globalCompositeOperation='destination-in';g.drawImage(m,0,0);
      g.globalCompositeOperation='destination-out';g.fillRect(0,0,W,y0);
      return c;
    });
  }
  const KNEE={adult:640,little:700}; // doll-local y just above the knees

  /* The garment behind the arms where they rest on it. The footprint: the worn picture's pixels that are
     not garment within the arm's reach of its bones (puppet-rig.js: elbow, wrist, hand and the fingertips
     beyond; front and back views below the armpit, both arms; side views the near arm from the shoulder),
     grown 3 px so the hand's soft rim on the garment goes too. Filled with the no-arm view's garment where
     it has one (side views), then row by row from the fabric beside it: across the whole run where there
     is garment on both sides, else from the garment's side out to its edge, which is interpolated from
     the rows above and below where the edge shows (a skirt's side edge passing behind the hand). Mirrored
     texture, then a short vertical blur. Returns the pixels filled (Uint8Array, canvas px) or null. */
  /* Her arm's own pixels where it lies over the garment or the body: opaque, not garment (the garment's
     soft edge is not), within the arm's reach of its bones (puppet-rig.js: shoulder or armpit, elbow,
     wrist, hand and 40 px past the hand for the fingers; the hand a little wider in side views). From the
     segment `from` on (1: from the elbow down). null if none. */
  function armFootprint(fd,md,rg,doll,from=0){
    const px=rg.px,W=DOLL_CANVAS.width,H=DOLL_CANVAS.height;
    const rad=doll==='little'?27:30,F=new Uint8Array(W*H);let any=false;
    for(const a of rg.side?[0]:[0,1]){
      const c=[px['sh'+a],px['el'+a],px['wr'+a],px['hand'+a]],[hx,hy]=[c[3][0]-c[2][0],c[3][1]-c[2][1]],hl=Math.hypot(hx,hy)||1;
      c.push([c[3][0]+hx/hl*40,c[3][1]+hy/hl*40]);
      const yTop=rg.side?c[0][1]:rg.armCut[a][1][1];
      const xs=c.map(p=>p[0]),ys=c.map(p=>p[1]);
      const x0=Math.max(0,Math.floor(Math.min(...xs)-rad-10)),x1=Math.min(W-1,Math.ceil(Math.max(...xs)+rad+10)),y0=Math.max(0,Math.floor(Math.max(yTop,Math.min(...ys)-rad))),y1=Math.min(H-1,Math.ceil(Math.max(...ys)+rad+10));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*W+x;if(fd[i*4+3]<200||md[i*4+3]>60)continue; // her opaque skin (the garment's soft edge is not)
        let near=false;for(let k=from;k<c.length-1&&!near;k++){const [p,q]=[c[k],c[k+1]],vx=q[0]-p[0],vy=q[1]-p[1],t=Math.max(0,Math.min(1,((x-p[0])*vx+(y-p[1])*vy)/(vx*vx+vy*vy||1)));near=Math.hypot(x-p[0]-vx*t,y-p[1]-vy*t)<(k>=2&&rg.side?rad+10:rad)} // (the hand is wider than the arm)
        if(near)F[i]=1}
    }
    // only what joins the wrist or hand through her skin (a thigh below a hem, within reach of the fingers, is not
    // the arm)
    const G=new Uint8Array(W*H),stack=[];
    for(const a of rg.side?[0]:[0,1])for(const jn of ['wr','hand']){const [wx,wy]=px[jn+a].map(Math.round);
      for(let r=0;r<=12&&!stack.length;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const i=(wy+dy)*W+wx+dx;if(i>=0&&i<W*H&&F[i]&&!G[i]){G[i]=1;stack.push(i)}}
      while(stack.length){const i=stack.pop();for(const j of [i-1,i+1,i-W,i+W])if(j>=0&&j<W*H&&F[j]&&!G[j]){G[j]=1;stack.push(j);any=true}}}
    return any?G:null;
  }
  function fillUnderArms(outfit,full,md,view,doll,nd){
    const R=typeof HibiscusPuppetRig!=='undefined'?HibiscusPuppetRig:null;if(!R)return null;
    const rg=R.rig(doll,view),px=rg.px,W=DOLL_CANVAS.width,H=DOLL_CANVAS.height;
    const fd=ctx2d(full).getImageData(0,0,W,H).data,og=ctx2d(outfit),oi=og.getImageData(0,0,W,H),od=oi.data;
    const F=armFootprint(fd,md,rg,doll);
    if(!F)return null;
    const F2=new Uint8Array(W*H);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){if(!F[y*W+x])continue;for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<W&&Y<H&&(Math.abs(dx)<=1&&Math.abs(dy)<=1||md[(Y*W+X)*4+3]<250))F2[Y*W+X]=1}} // (into the garment only where its mask is soft: the hand's rim; the garment seen at rest stays)
    const done=new Uint8Array(W*H);
    const orig=new Uint8ClampedArray(od); // (puppet.js puts back what the arm does not take along)
    const blend=new Uint8Array(W*H);
    if(nd){
      for(let i=0;i<W*H;i++)if(F2[i]&&nd[i*4+3]>200){for(let c=0;c<4;c++)od[i*4+c]=nd[i*4+c];done[i]=1}
      // the no-arm view to the worn picture's shade where they meet: the difference on a 12 px band of the
      // garment round the patch, spread over the patch (a separately drawn view is a little off)
      let x0=W,y0=H,x1=0,y1=0;for(let i=0;i<W*H;i++)if(done[i]){const x=i%W,y=(i/W)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
      if(x1>=x0){const r=36;x0=Math.max(0,x0-2*r);y0=Math.max(0,y0-2*r);x1=Math.min(W-1,x1+2*r);y1=Math.min(H-1,y1+2*r);
        const bw=x1-x0+1,bh=y1-y0+1,A=[0,1,2,3].map(()=>new Float32Array(bw*bh)),B=[0,1,2,3].map(()=>new Float32Array(bw*bh));
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*W+x,q=(y-y0)*bw+x-x0;
          if(!F2[i]&&od[i*4+3]>200&&md[i*4+3]>=250){for(let c=0;c<3;c++)A[c][q]=od[i*4+c];A[3][q]=1}
          if(nd[i*4+3]>200){for(let c=0;c<3;c++)B[c][q]=nd[i*4+c];B[3][q]=1}}
        const blur=a=>{const t=new Float32Array(a.length);for(let y=0;y<bh;y++){let s=0;for(let x=-r;x<bw+r;x++){if(x+r<bw)s+=a[y*bw+x+r];if(x-r-1>=0)s-=a[y*bw+x-r-1];if(x>=0)t[y*bw+x]=s}}
          const u=new Float32Array(a.length);for(let x=0;x<bw;x++){let s=0;for(let y=-r;y<bh+r;y++){if(y+r<bh)s+=t[(y+r)*bw+x];if(y-r-1>=0)s-=t[(y-r-1)*bw+x];if(y>=0)u[y*bw+x]=s}}return u};
        const a=A.map(blur),b=B.map(blur);
        const outside=i=>!F2[i]&&od[i*4+3]>200&&md[i*4+3]>=250;
        // the no-arm view's fine texture (folds, sheen) on the worn picture's own light and shade there
        // (its broad light differs: a separately drawn view), the latter spread in from round the patch
        const base=(q,c)=>a[3][q]>=1?a[c][q]/a[3][q]:null;
        const patch=(i,q,c)=>{const v=base(q,c);return v!==null&&b[3][q]>=1?nd[i*4+c]-b[c][q]/b[3][q]+v:nd[i*4+c]};
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*W+x,q=(y-y0)*bw+x-x0;if(!done[i])continue;
          for(let c=0;c<3;c++)od[i*4+c]=Math.max(0,Math.min(255,patch(i,q,c)))}
        // and no edge in the shape of the arm: over its outer 12 px the patch starts as the garment just
        // outside it, carried in ring by ring (the garment outside, seen at rest, stays as it is)
        const prop=new Float32Array(W*H*3),dist=new Uint8Array(W*H);
        for(let step=1;step<=12;step++)for(let y=Math.max(1,y0);y<Math.min(H-1,y1);y++)for(let x=Math.max(1,x0);x<Math.min(W-1,x1);x++){const i=y*W+x;if(!done[i]||dist[i])continue;
          let n=0,acc0=0,acc1=0,acc2=0;
          for(const j of [i-1,i+1,i-W,i+W,i-W-1,i-W+1,i+W-1,i+W+1]){
            if(step===1?outside(j):dist[j]===step-1&&step>1){if(step===1){acc0+=od[j*4];acc1+=od[j*4+1];acc2+=od[j*4+2]}else{acc0+=prop[j*3];acc1+=prop[j*3+1];acc2+=prop[j*3+2]}n++}}
          if(n){dist[i]=step;prop[i*3]=acc0/n;prop[i*3+1]=acc1/n;prop[i*3+2]=acc2/n}}
        for(let i=0;i<W*H;i++)if(dist[i]){const t=dist[i]/13;for(let c=0;c<3;c++)od[i*4+c]=prop[i*3+c]*(1-t)+od[i*4+c]*t}}
    }
    const src=new Uint8ClampedArray(od),open=i=>F2[i]&&!done[i],ok=i=>!open(i)&&src[i*4+3]>200;
    // the garment's edge on side `dir` near row y, from the nearest rows above and below where it shows
    const edgeAt=(y,c0,dir)=>{const sample=y2=>{const row=y2*W;if(!ok(row+c0))return null;let x=c0;while(x+dir>=0&&x+dir<W&&ok(row+x+dir))x+=dir;
        return open(row+x+dir)?null:x};
      let up=null,dn=null,yu=0,yd=0;
      for(let k=1;k<=60&&up===null;k++)if(y-k>=0){up=sample(y-k);yu=y-k}
      for(let k=1;k<=60&&dn===null;k++)if(y+k<H){dn=sample(y+k);yd=y+k}
      if(up===null&&dn===null)return null;
      if(up!==null&&dn!==null)return up+(dn-up)*(y-yu)/(yd-yu);
      // one side only: carry the edge's slope on (a skirt flaring out below the hand)
      const [y1,x1,st]=up!==null?[yu,up,-1]:[yd,dn,1],y2=y1+st*16,x2=y2>=0&&y2<H?sample(y2):null;
      return x2===null?x1:x1+(x2-x1)*(y-y1)/(y2-y1)};
    const filled=new Uint8Array(W*H);
    // first down the columns: the hole with garment above and below (folds run down a skirt, so they carry
    // on behind the hand), texture mirrored from both ends and cross-faded
    for(let x=0;x<W;x++){let y=0;
      while(y<H){if(!open(y*W+x)){y++;continue}
        const s=y;while(y<H&&open(y*W+x))y++;const e=y-1,n=e-s+1;
        if(n>240||s<1||e>=H-1||!ok((s-1)*W+x)||!ok((e+1)*W+x))continue;
        for(let k=s;k<=e;k++){const t=(k-s+.5)/n,o=(k*W+x)*4;
          const pick=(edge,dirn)=>{let q=edge+dirn*(dirn<0?k-s:e-k);for(let tries=0;tries<3&&!(q>=0&&q<H&&ok(q*W+x));tries++)q=Math.round((q+edge)/2);return ok(q*W+x)?q*W+x:edge*W+x};
          const a=pick(s-1,-1),b=pick(e+1,1);
          for(let c=0;c<3;c++)od[o+c]=src[a*4+c]*(1-t)+src[b*4+c]*t;od[o+3]=255;filled[k*W+x]=1}}}
    // (what the columns filled is garment now, for the rows)
    for(let i=0;i<W*H;i++)if(filled[i])done[i]=1;src.set(od);
    for(let y=0;y<H;y++){const row=y*W;let x=0;
      while(x<W){if(!open(row+x)||filled[row+x]){x++;continue}
        const s=x;while(x<W&&open(row+x)&&!filled[row+x])x++;const e=x-1,n=e-s+1;
        const L=s>0&&(ok(row+s-1)||filled[row+s-1]),Rr=e<W-1&&(ok(row+e+1)||filled[row+e+1]);if(!L&&!Rr)continue;
        let a=s,b=e,frac=0;
        if(!(L&&Rr)){const dir=L?1:-1,edge=edgeAt(y,L?s-1:e+1,dir);if(edge===null)continue;
          if(L){b=Math.min(e,Math.floor(edge));frac=edge-Math.floor(edge)}else{a=Math.max(s,Math.ceil(edge));frac=Math.ceil(edge)-edge}}
        for(let k=a;k<=b;k++){const o=(row+k)*4,t=(k-s+.5)/n;
          let wl=L?(Rr?1-t:1):0,wr=Rr?(L?t:1):0;
          const pick=(edge,dirn)=>{let q=edge+dirn*(dirn<0?k-s:e-k);for(let tries=0;tries<3&&!(q>=0&&q<W&&ok(row+q));tries++)q=Math.round((q+edge)/2);return ok(row+q)?row+q:row+edge};
          const pl=L?pick(s-1,-1):0,pr=Rr?pick(e+1,1):0;
          for(let c=0;c<3;c++)od[o+c]=(L?src[pl*4+c]*wl:0)+(Rr?src[pr*4+c]*wr:0);
          od[o+3]=255;filled[row+k]=1}
        // the edge pixel, partly covered
        const ex=L&&!Rr?b+1:!L&&Rr?a-1:-1;
        if(ex>=s&&ex<=e&&frac>0){const o=(row+ex)*4,q=(row+(L?b:a))*4;for(let c=0;c<3;c++)od[o+c]=od[q+c];od[o+3]=Math.round(255*frac);filled[row+ex]=1}
      }}
    const f=new Uint8ClampedArray(od);
    for(let y=2;y<H-2;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!filled[i])continue;for(let c=0;c<3;c++){let s=0;for(let k=-2;k<=2;k++)s+=f[(i+k*W)*4+c];od[i*4+c]=s/5}}
    // what the arm uncovers and nothing fills is not garment (the hand's rim on it, or the arm itself)
    for(let i=0;i<W*H;i++)if(open(i)&&!filled[i]&&md[i*4+3]<250)od[i*4+3]=0;
    og.putImageData(oi,0,0);
    for(let i=0;i<W*H;i++)if(done[i]||blend[i])filled[i]=1;
    filled.orig=orig;
    return filled;
  }

  /* ---------- the puppet's split (composeDollLayers) ---------- */
  /* The puppet cuts the doll into pieces by layer (puppet.js), so the worn picture is handed over as the
     layers of the old path: body = the worn picture outside the garment (her new head, face and limbs) and,
     under the garment, the old body layer (the base doll with this outfit's own skin repaint and the feet in
     the shoes), outfit = the garment (worn x mask), and in side views arm = the near arm (its skin; for long
     sleeves also the sleeve round its bones), drawn over the outfit, and the short sleeve as `over`. Behind
     the near arm the garment comes from the delivery drawn without it (`noarm`), else from the fabric
     beside it. So a swinging skirt or arm uncovers the body or the dress, never a hole, and the old path's
     rules for sleeves, skirts and the arm in side views apply unchanged. At rest they draw the still
     picture (lab.diff). */
  async function splitLayers(shot,view,e,shoes,draw,sharp=config.sharpPuppet){
    const D=DOLL_CANVAS,doll=shot.doll,dv=dollView(doll,view),[ox,oy]=dv.origin,[ax,ay]=e.at,[sw,sh]=e.size;
    let [mask,old,noarm,sleeveArt]=await Promise.all([asset(e.mask),bodyLayer(shot,view),e.noarm&&sideView(view)?asset(e.noarm).catch(()=>null):null,
      e.sleeve&&sideView(view)?asset(e.sleeve).catch(()=>null):null]);
    // the colourway on the garment-only pictures too (all of them is garment)
    const tint=(catalogItem(shot.outfit).tints||[]).find(t=>t.id===shot.outfitTint);
    const tinted=img=>{if(!img||!tint||tint.id==='original')return img;const c=makeCanvas(img.naturalWidth||img.width,img.naturalHeight||img.height);c.getContext('2d').drawImage(img,0,0);return tintCanvas(c,tint)};
    const rawNoarm=noarm;noarm=tinted(noarm);sleeveArt=tinted(sleeveArt);
    const oldPic=shoes?fitFeet(old,shoes,catalogItem(shot.shoes).fit[doll][view],dv,doll):old;
    const full=makeCanvas(D.width,D.height),fg=full.getContext('2d');fg.imageSmoothingQuality='high';draw(fg);
    const m=makeCanvas(D.width,D.height),mg=ctx2d(m);mg.imageSmoothingQuality='high';mg.drawImage(mask,ox+ax,oy+ay,sw,sh);
    const md=mg.getImageData(0,0,D.width,D.height).data;
    // under the garment (its mask at full strength) the old body; everywhere else the worn picture
    const hard=makeCanvas(D.width,D.height),hg=ctx2d(hard),hi=hg.createImageData(D.width,D.height);
    for(let i=3;i<md.length;i+=4)if(md[i]>=250)hi.data[i]=255;
    hg.putImageData(hi,0,0);
    let rest=makeCanvas(D.width,D.height),rg0=rest.getContext('2d');rg0.drawImage(full,0,0);rg0.globalCompositeOperation='destination-out';rg0.drawImage(hard,0,0);
    // only inside the old body's outline: the puppet's pieces are cut by labels measured on it, so a rim
    // of a slightly wider redrawn limb would stay behind when the limb moves
    rg0.globalCompositeOperation='destination-in';rg0.drawImage(oldPic,ox,oy);
    {const ri=ctx2d(rest).getImageData(0,0,D.width,D.height),rd0=ri.data;for(let i=3;i<rd0.length;i+=4)if(rd0[i]<230)rd0[i]=0;ctx2d(rest).putImageData(ri,0,0)} // its soft rim too: the old body's own rim (under it) matches the labels
    // (and the old body only inside the worn figure's outline: a garment can be slimmer than the bald body,
    // close-fitting jeans for one, and the body round it must not show)
    const body=makeCanvas(D.width,D.height),bg=body.getContext('2d');bg.drawImage(oldPic,ox,oy);bg.globalCompositeOperation='destination-in';bg.drawImage(full,0,0);bg.globalCompositeOperation='source-over';bg.drawImage(rest,0,0);
    const outfit=makeCanvas(D.width,D.height),og=outfit.getContext('2d');og.drawImage(full,0,0);og.globalCompositeOperation='destination-in';og.drawImage(m,0,0);
    const out=[{kind:'body',canvas:body},{kind:'outfit',canvas:outfit}];
    if(sideView(view)&&dv.arm){
      // the garment behind the near arm: the worn picture has none (the arm is painted over it), so each
      // row's run under the arm (its polygon, grown 5 px) that has garment on both sides is filled with the
      // fabric beside it (mirrored, cross-faded), so a swinging arm uncovers fabric, not the body
      const W=D.width,H=D.height,rc=makeCanvas(W,H),rg=ctx2d(rc);rg.translate(ox,oy);rg.fillStyle=rg.strokeStyle='#000';rg.lineWidth=10;rg.lineJoin='round';
      rg.beginPath();shapePathInto(rg,{poly:dv.arm});rg.fill();rg.stroke();
      // and all of her forearm and hand as drawn (the rig's polygon was fitted to the old picture: fingers
      // past it would stay behind on the skirt when the arm swings)
      {const R=typeof HibiscusPuppetRig!=='undefined'?HibiscusPuppetRig:null,Fa=R&&armFootprint(ctx2d(full).getImageData(0,0,W,H).data,md,R.rig(doll,view),doll,1);
        if(Fa){rg.setTransform(1,0,0,1,0,0);const ri=rg.getImageData(0,0,W,H);for(let i=0;i<Fa.length;i++)if(Fa[i])ri.data[i*4+3]=255;rg.putImageData(ri,0,0);rg.translate(ox,oy)}}
      // the body keeps the old body there (the worn arm's own rim, a pixel off the old one, would stay behind)
      {const r2=makeCanvas(W,H),r2g=r2.getContext('2d');r2g.drawImage(rest,0,0);r2g.globalCompositeOperation='destination-out';r2g.drawImage(rc,0,0);
        rest=r2;bg.clearRect(0,0,W,H);bg.globalCompositeOperation='source-over';bg.drawImage(oldPic,ox,oy);bg.globalCompositeOperation='destination-in';bg.drawImage(full,0,0);bg.globalCompositeOperation='source-over';bg.drawImage(rest,0,0)}
      // with the near sleeve delivered alone, the sleeve goes with the arm: its pixels leave the outfit too
      // (the garment under it comes from the no-arm view)
      if(sleeveArt){rg.setTransform(1,0,0,1,0,0);rg.drawImage(sleeveArt,ox+ax,oy+ay,sw,sh)}
      const rd=rg.getImageData(0,0,W,H).data,oi=ctx2d(outfit).getImageData(0,0,W,H),od=oi.data;
      if(sleeveArt){const sc=makeCanvas(W,H),sg=ctx2d(sc);sg.drawImage(sleeveArt,ox+ax,oy+ay,sw,sh);const sd=sg.getImageData(0,0,W,H).data;
        for(let i=3;i<sd.length;i+=4)if(sd[i]>40)od[i]=0}
      const src=new Uint8ClampedArray(od);
      let ok=q=>src[q*4+3]>200;
      if(noarm){ // the garment the delivery drew without the near arm, where the arm hides it
        // (under the arm the no-arm view is the truth, even where the worn garment shows a little)
        const nc=makeCanvas(W,H),ng=ctx2d(nc);ng.drawImage(noarm,ox+ax,oy+ay,sw,sh);const nd=ng.getImageData(0,0,W,H).data;
        // (its skin is not garment: the shoulder the no-arm view shows stays the body's)
        const rc0=makeCanvas(W,H),rg1=ctx2d(rc0);rg1.drawImage(rawNoarm,ox+ax,oy+ay,sw,sh);const rn=rg1.getImageData(0,0,W,H).data;
        const skin=i=>{const r=rn[i],g=rn[i+1],b=rn[i+2];return r>g&&g>b&&r>90&&(g-b)>(r-g)*.35&&(r-b)>40};
        for(let q=0;q<W*H;q++){if(!rd[q*4+3]||nd[q*4+3]<=200||skin(q*4))continue;for(let c=0;c<4;c++)od[q*4+c]=nd[q*4+c]}
        src.set(od)}
      for(let y=0;y<H;y++){let x=0;const row=y*W;
        while(x<W){if(!rd[(row+x)*4+3]||ok(row+x)){x++;continue}
          const s=x;while(x<W&&rd[(row+x)*4+3]&&!ok(row+x))x++;const e=x-1,n=e-s+1;
          if(s<1||e>=W-1||!ok(row+s-1)||!ok(row+e+1))continue;
          for(let k=s;k<=e;k++){const t=(k-s+.5)/n,o=(row+k)*4;
            let a=s-1-(k-s),b=e+1+(e-k);if(a<0||!ok(row+a))a=s-1;if(b>=W||!ok(row+b))b=e+1;
            for(let c=0;c<3;c++)od[o+c]=src[(row+a)*4+c]*(1-t)+src[(row+b)*4+c]*t;od[o+3]=255}}}
      // then down the columns: gaps (up to 90 px) with fabric above and below (the rows where the arm
      // reached the garment's edge, the thin rows round the hand)
      const s2=new Uint8ClampedArray(od),ok2=q=>s2[q*4+3]>200;
      for(let x=0;x<W;x++){let y=0;
        while(y<H){const q=y*W+x;if(!rd[q*4+3]||ok2(q)){y++;continue}
          const s=y;while(y<H&&rd[(y*W+x)*4+3]&&!ok2(y*W+x))y++;const e=y-1,n=e-s+1;
          if(n>90||s<1||e>=H-1||!ok2((s-1)*W+x)||!ok2((e+1)*W+x))continue;
          for(let k=s;k<=e;k++){const t=(k-s+.5)/n,o=(k*W+x)*4,a=((s-1)*W+x)*4,b=((e+1)*W+x)*4;
            for(let c=0;c<3;c++)od[o+c]=s2[a+c]*(1-t)+s2[b+c]*t;od[o+3]=255}}}
      ctx2d(outfit).putImageData(oi,0,0);
      // the near arm (skin) and its sleeve: a long sleeve round all the arm's bones goes with the arm; a short
      // one (round the upper arm) is an `over` layer drawn after the arm, which the puppet also moves with it
      // (with the sleeve delivered alone it is the `over` layer, so the arm keeps only its skin: else the
      // fabric round the hand, the trousers behind it, would go with the arm)
      const R=typeof HibiscusPuppetRig!=='undefined'?HibiscusPuppetRig:null,long=!sleeveArt&&R?.sleevesOf(shot.outfit)==='long',px=R?.rig(doll,view).px;
      const segs=px?(long?[['sh0','el0'],['el0','wr0'],['wr0','hand0']]:[['sh0','el0']]).map(([a,b])=>[px[a],px[b]]):[];
      const near=(x,y)=>segs.some(([a,b])=>{const vx=b[0]-a[0],vy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*vx+(y-a[1])*vy)/(vx*vx+vy*vy||1)));return Math.hypot(x-a[0]-vx*t,y-a[1]-vy*t)<26});
      const arm=makeCanvas(W,H),ag=ctx2d(arm),over=makeCanvas(W,H),vg=ctx2d(over);
      ag.drawImage(full,0,0);ag.globalCompositeOperation='destination-in';ag.drawImage(rc,0,0);ag.globalCompositeOperation='source-over'; // the same grown polygon
      const im=ag.getImageData(0,0,W,H),d=im.data,vi=vg.createImageData(W,H),vd=vi.data;let anyOver=false;
      for(let i=0,p=0;i<d.length;i+=4,p++){if(!d[i+3])continue;const g=md[i+3]/255;if(!g)continue;
        const sleeve=near(p%W,Math.floor(p/W));
        if(sleeve&&!long){for(let c=0;c<4;c++)vd[i+c]=d[i+c];anyOver=true}
        if(!(long&&sleeve))d[i+3]=d[i+3]*(1-g)}
      ag.putImageData(im,0,0);
      out.push({kind:'arm',canvas:arm});
      if(sleeveArt){ // the delivery's near sleeve alone: it goes with the arm, drawn over it
        const sc=makeCanvas(W,H),sg=sc.getContext('2d');sg.imageSmoothingQuality='high';sg.drawImage(sleeveArt,ox+ax,oy+ay,sw,sh);
        out.push({kind:'over',canvas:sc,sleeveArt})}
      else if(anyOver){vg.putImageData(vi,0,0);out.push({kind:'over',canvas:over})}
    }
    // the garment behind the resting hands and arms, in every view (a swinging arm uncovers it): the
    // no-arm view where there is one, else rebuilt from the fabric beside it; puppet.js keeps these pixels
    // with the garment and does not paint over them
    {let nd=null;
      if(noarm&&sideView(view)){const nc=makeCanvas(D.width,D.height),ng=ctx2d(nc);ng.drawImage(noarm,ox+ax,oy+ay,sw,sh);nd=ng.getImageData(0,0,D.width,D.height).data}
      const fill=fillUnderArms(outfit,full,md,view,doll,nd);
      if(fill){out[1].fill=fill;
        // and in side views the old body's own arm and fingers under it go (they would stay behind where the
        // rig's labels miss them; the arm layer takes all of the arm): the rebuilt garment is what lies there
        if(sideView(view)){const bgc=ctx2d(body),bi=bgc.getImageData(0,0,D.width,D.height);for(let i=0;i<fill.length;i++)if(fill[i])bi.data[i*4+3]=0;bgc.putImageData(bi,0,0)}}}
    // sharper twins (k x) of the garment layers, for the puppet's textures: the worn picture at full
    // resolution, masked by the garment (outfit) or by the layer's own alpha (sleeve, arm)
    if(sharp&&(e.k||data().scale)>1){const k=e.k||data().scale,fullK=makeCanvas(D.width*k,D.height*k),fk=fullK.getContext('2d');
      fk.setTransform(k,0,0,k,0,0);fk.imageSmoothingQuality='high';draw(fk);
      for(const l of out){
        const c=makeCanvas(D.width*k,D.height*k),g=c.getContext('2d');g.drawImage(fullK,0,0);g.imageSmoothingQuality='high';
        // body: the worn picture outside the garment (under it the 1x old body is used); outfit: the garment
        g.globalCompositeOperation='destination-in';
        if(l.sleeveArt){g.globalCompositeOperation='copy';g.setTransform(k,0,0,k,0,0);g.drawImage(l.sleeveArt,ox+ax,oy+ay,sw,sh);g.setTransform(1,0,0,1,0,0);delete l.sleeveArt}
        else if(l.kind==='body')g.drawImage(rest,0,0,c.width,c.height); // only where the worn picture is used at 1x (else the old body)
        else if(l.kind==='outfit'){g.drawImage(mask,(ox+ax)*k,(oy+ay)*k,sw*k,sh*k);
          if(sleeveArt&&sideView(view)){g.globalCompositeOperation='destination-out';g.drawImage(sleeveArt,(ox+ax)*k,(oy+ay)*k,sw*k,sh*k)}
          if(l.fill){ // the garment rebuilt behind the arms, over the sharp picture there (one texture, not two)
            const fc=makeCanvas(D.width,D.height),fg=ctx2d(fc),fi=fg.createImageData(D.width,D.height),src=ctx2d(l.canvas).getImageData(0,0,D.width,D.height).data;
            for(let i=0;i<l.fill.length;i++)if(l.fill[i])for(let c=0;c<4;c++)fi.data[i*4+c]=src[i*4+c];
            fg.putImageData(fi,0,0);g.globalCompositeOperation='destination-out';g.drawImage(fc,0,0,c.width,c.height);
            g.globalCompositeOperation='source-over';g.drawImage(fc,0,0,c.width,c.height)}}
        else g.drawImage(l.canvas,0,0,c.width,c.height);
        l.hd=c}}
    return out;
  }

  /* ---------- the dressed doll as draw operations (as dollOps in portrait.js) ---------- */
  async function build(shot,view,e){
    const doll=shot.doll,dv=dollView(doll,view),[ox,oy]=dv.origin,k=e.k||data().scale,[ax,ay]=e.at,[sw,sh]=e.size;
    const hairFit=catalogItem(shot.hair).fit[doll][view];
    const earItem=catalogItem(shot.earrings),clipItem=catalogItem(shot.clip);
    let [body,base,shoes,hair,necklace,earrings,clipLayer]=await Promise.all([
      wornBody(shot,view,e),spriteCanvas(dv.art),
      shot.shoes==='none'?null:shoeLayers(doll,view,shot.shoes,shot.shoesTint),
      hairLayers(doll,view,shot.hair,shot.hairColor),
      shot.necklace==='none'?null:spriteItemLayer(doll,view,shot.necklace),
      !earItem||earItem.stud||(hairFit.earsUnder&&view==='front')?null:spriteItemLayer(doll,view,shot.earrings,shot.earringsTint),
      !clipItem||clipItem.proc||hairFit.clip?.hide?null:clipSprite(shot,view)
    ]);
    const bodyPic=shoes?await fittedFeet(shot,view,e,body,shoes,base.width):body;
    const drawBody=g=>g.drawImage(bodyPic,ox+ax,oy+ay,sw,sh);
    const ops=[],put=(kind,layer)=>ops.push({kind,layer,draw:g=>g.drawImage(layer,0,0)});
    const acc=f=>shot[f]&&shot[f]!=='none'?catalogItem(shot[f]):null;
    const hatItem=acc('hat'),hatFit=hatItem?.fit?.[doll]?.[view],glassItem=acc('glasses'),bagItem=acc('bag')||acc('toy');
    const heldFit=bagItem?.fit?.[doll]?.[view];
    const [hat,glasses,lens,held]=await Promise.all([
      hatFit?accLayer(doll,view,hatItem.id):null,
      glassItem?accLayer(doll,view,glassItem.id):null,
      glassItem?.fit?.[doll]?.[view]?.lens?accLayer(doll,view,glassItem.id,'lens'):null,
      heldFit?accLayer(doll,view,bagItem.id):null]);
    if(hatFit?.cut)hair=await hatHair(doll,view,hair,shot,hatFit.cut,hat,base,hatFit.hairTune?.[shot.hair]);
    const clipAt={...hairFit.clip,...(hatFit&&hatFit.clip===false?{hide:true}:{})},clipBehind=!!clipAt.behind;
    const proc=clipItem?.proc&&!clipAt.hide?clipItem.proc:0;
    const drawProc=g=>{g.save();g.translate(ox,oy);drawCharmView(g,proc,clipAt,dv,view);g.restore()};
    const stud=earItem?.stud&&dv.face?.lobes&&!(hairFit.earsUnder&&view==='front')?earItem.stud:null;
    const drawStuds=g=>{g.save();g.translate(ox,oy);for(const [x,y] of dv.face.lobes)drawStud(g,view==='back'?'clutch':stud,x,y+dv.face.unit*(view==='back'?.02:.06),dv.face.unit*(view==='back'?.09:.15));g.restore()};
    const earsUnder=!!hairFit.earsUnder||view==='back';
    const clips=kind=>{if(clipLayer)put(kind,clipLayer);if(proc)ops.push({kind:'charm',behind:kind==='clipBehind',draw:drawProc})};
    if(clipBehind&&!clipAt.hide)clips('clipBehind');
    if(hair.back)put('hairBack',hair.back);
    if(shoes)put('shoesBack',shoes.back);
    ops.push({kind:'body',draw:drawBody,layers:()=>splitLayers(shot,view,e,shoes,drawBody),hd:{canvas:bodyPic,rect:[ox+ax,oy+ay,sw,sh]}});
    ops.push({kind:'gem',draw:g=>{g.save();g.translate(ox,oy);drawGem(g,shot,view);g.restore()}});
    if(shoes)put('shoesFront',shoes.front);
    // floor-length trousers: the hem over the shoes
    const hem=shoes?await hemLayer(shot,view,e,body):null;
    if(hem)ops.push({kind:'outfit',draw:g=>g.drawImage(hem,ox+ax,oy+ay,sw,sh),
      hdLayer:k>1&&config.sharpPuppet?()=>{const c=makeCanvas(DOLL_CANVAS.width*k,DOLL_CANVAS.height*k),g=c.getContext('2d');g.setTransform(k,0,0,k,0,0);g.imageSmoothingQuality='high';g.drawImage(hem,ox+ax,oy+ay,sw,sh);return c}:null});
    if(held&&bagItem.kind==='pack')put('pack',held);
    if(held&&bagItem.kind!=='pack'){
      // her fingers over the handle (fit.grip), from the worn picture at full resolution; side views only
      // inside the near arm (not the thigh behind the hand)
      const grip=heldFit.grip,arm=sideView(view)?dv.arm:null;
      ops.push({kind:'held',draw:g=>{g.drawImage(held,0,0);if(!grip)return;
        g.save();g.translate(ox,oy);g.beginPath();shapePathInto(g,{poly:grip});g.clip();
        if(arm){g.beginPath();shapePathInto(g,{poly:arm});g.clip()}
        g.drawImage(bodyPic,ax,ay,sw,sh);g.restore()}});
    }
    if(necklace)put('necklace',necklace);
    const ears=()=>{if(earrings)put('earrings',earrings);if(stud)ops.push({kind:'studs',draw:drawStuds})};
    if(earsUnder)ears();
    if(glasses&&lens)put('glassesUnder',glasses);
    if(hair.shade)ops.push({kind:'shade',draw:g=>{g.save();g.globalCompositeOperation='source-atop';g.drawImage(hair.shade,0,0);g.restore()}});
    if(hair.front)put('hairFront',hair.front);
    if(!earsUnder)ears();
    if(!clipBehind&&!clipAt.hide)clips('clip');
    if(glasses)put('glasses',lens||glasses);
    if(hat)put('hat',hat);
    return {ops,doll,view,origin:[ox,oy],shoes,worn:e};
  }
  async function ops(shot,view){
    const e=use(shot,view);if(!e)return null;
    try{return await build(shot,view,e)}
    catch(err){failed.add(e.src);if(typeof console!=='undefined')console.warn('worn art unavailable, old path:',e.src,err);return null}
  }
  return {use,ops,portraitScale,entry,fitFeetK,scaleFace,config,
    enabled:()=>on,mode:()=>mode,ON,setEnabled(v){mode=v===true?"all":v===false?"off":v;on=mode!=="off";cards();for(const c of Object.values(dollCaches))c.clear();cache.clear()},
    _failed:failed};
})();
