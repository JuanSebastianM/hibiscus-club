/* Paper-doll renderer. composeDoll() layers the base doll, outfit, shoes, hair, jewelry and makeup
   onto one cached offscreen canvas; paintPortrait() frames it for every screen and the postcard PNG.
   Fit numbers live in catalog.js and are in "doll-local" pixels: the coordinates of the cropped base
   picture assets/dolls/<doll>-<view>.webp of the view being drawn. Pixel work (warps, tints, hair
   colour, makeup, bodysuit cover-up) is done once per item/look/view and cached, so it needs the page
   to be served over http. Views are CATALOG.views (front, left = faces viewer-left, right, back); a
   view's sprites are only fetched the first time that view is composed. */
const frameNames = () => [0,1,2,3].map(i => t('frame.'+i)); // labels follow the current language
const frameColors = [['#fff1f6','#ffc1d9'],['#ecfff9','#aae8df'],['#f8f1ff','#d9c7f4'],['#fff6d9','#fbd56f']];
const stickerNames = () => [0,1,2,3].map(i => t('sticker.'+i));
/* Draws one line of text centered on x, shrinking the font (never squashing letters) until it fits. */
function fitText(c,text,x,y,maxWidth,size,font){
  let px=size;
  c.font=font.replace('{size}',px);
  while(px>size*.6&&c.measureText(text).width>maxWidth){px-=1;c.font=font.replace('{size}',px);}
  c.fillText(text,x,y,maxWidth);
}
/* Every composed doll uses this transparent canvas. Feet (bare soles) rest on `baseline`. */
const DOLL_CANVAS = {width:600, height:1060, baseline:1010};
const images = new Map();
function asset(src) {
  if (!images.has(src)) images.set(src,new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>{images.delete(src);reject(new Error('Image unavailable: '+src))};
    img.src=src;
  }));
  return images.get(src);
}
/* Small LRU map used for every renderer cache. */
function lruCache(limit){
  const map=new Map();
  return {
    get(k){if(!map.has(k))return undefined;const v=map.get(k);map.delete(k);map.set(k,v);return v},
    set(k,v){map.delete(k);map.set(k,v);while(map.size>limit)map.delete(map.keys().next().value);return v},
    clear(){map.clear()}, get size(){return map.size}
  };
}
const dollCaches={sprite:lruCache(64),layer:lruCache(28),body:lruCache(8),doll:lruCache(12)};
function makeCanvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c}
const ctx2d=c=>c.getContext('2d',{willReadFrequently:true});
function memo(cache,key,make){let p=cache.get(key);if(!p){p=Promise.resolve().then(make);cache.set(key,p);p.catch(()=>{if(cache.get(key)===p)cache.set(key,undefined)})}return p}

/* ---------- colour helpers ---------- */
const hexRgb=h=>{h=h.replace('#','');if(h.length===3)h=h.replace(/./g,'$&$&');const n=parseInt(h,16);return [n>>16&255,n>>8&255,n&255]};
function rgbToHsl(r,g,b){
  r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2;
  if(max===min)return [0,0,l];
  const d=max-min,s=l>.5?d/(2-max-min):d/(max+min);
  const h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;
  return [h*60,s,l];
}
function hslToRgb(h,s,l){
  h=((h%360)+360)%360/360;
  if(!s){const v=l*255;return [v,v,v]}
  const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q;
  const f=t=>{t<0&&(t+=1);t>1&&(t-=1);return t<1/6?p+(q-p)*6*t:t<1/2?q:t<2/3?p+(q-p)*(2/3-t)*6:p};
  return [f(h+1/3)*255,f(h)*255,f(h-1/3)*255];
}
const hueDist=(a,b)=>{const d=Math.abs(((a-b)%360+360)%360);return d>180?360-d:d};
/* Weight 0..1 of hue h inside a [from,to] range (degrees, may wrap) with a soft feather. */
function hueWeight(h,range,feather=12){
  if(!range)return 1;
  const [a,b]=range,span=((b-a)%360+360)%360,off=((h-a)%360+360)%360;
  if(off<=span)return 1;
  const d=Math.min(off-span,360-off);
  return d>=feather?0:1-d/feather;
}

/* ---------- sprite sources ---------- */
/* A sprite (or a manifest part) drawn into a canvas so its pixels can be read. */
function spriteCanvas(src){
  return memo(dollCaches.sprite,'img|'+src,async()=>{
    const img=await asset(src);const c=makeCanvas(img.naturalWidth,img.naturalHeight);
    ctx2d(c).drawImage(img,0,0);return c;
  });
}
/* Per-pixel hue/saturation/lightness shift for outfit, shoe and metal tints (no ctx.filter). */
function tintCanvas(src,t){
  if(!t||t.id==='original')return src;
  const c=makeCanvas(src.width,src.height),g=ctx2d(c);g.drawImage(src,0,0);
  const im=g.getImageData(0,0,c.width,c.height),d=im.data;
  for(let i=0;i<d.length;i+=4){
    if(!d[i+3])continue;
    const [h,s,l]=rgbToHsl(d[i],d[i+1],d[i+2]);
    let w=hueWeight(h,t.range,t.feather);
    if(t.minSat!==undefined)w*=Math.min(1,Math.max(0,(s-t.minSat)/.08));
    if(t.maxLight!==undefined)w*=Math.min(1,Math.max(0,(t.maxLight-l)/.06));
    if(t.minLight!==undefined)w*=Math.min(1,Math.max(0,(l-t.minLight)/.06));
    if(w<=0)continue;
    const nh=t.hueTo!==undefined?t.hueTo+(t.hueKeep?(h-(t.hueFrom??h))*t.hueKeep:0):h+(t.hue||0);
    let ns=Math.min(1,s*(t.sat??1)+(t.satAdd||0));
    let nl=l;
    if(t.gamma)nl=Math.pow(nl,t.gamma);
    nl=Math.min(1,Math.max(0,nl*(t.lightMul??1)+(t.light||0)));
    const [r,gg,b]=hslToRgb(nh,ns,nl);
    d[i]+=(r-d[i])*w;d[i+1]+=(gg-d[i+1])*w;d[i+2]+=(b-d[i+2])*w;
  }
  g.putImageData(im,0,0);return c;
}
/* Hair colour: luminance gradient map so dark hair can become light shades with highlights. Every
   colour, the default espresso included, is a gradient map stretched over the style's luminance
   range (`range` = [lo, hi], catalog item.lum, the same for all four views of a style), so a colour
   lands the same on every style and view whatever brown the sprite was painted in. */
function hairColorCanvas(src,color,range){
  if(!color||!color.stops)return src;
  const c=makeCanvas(src.width,src.height),g=ctx2d(c);g.drawImage(src,0,0);
  const im=g.getImageData(0,0,c.width,c.height),d=im.data,lut=hairLut(d,color,range);
  for(let i=0;i<d.length;i+=4){
    if(!d[i+3])continue;
    const v=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
    d[i]=lut[v*3];d[i+1]=lut[v*3+1];d[i+2]=lut[v*3+2];
  }
  g.putImageData(im,0,0);return c;
}
/* The gradient-map lookup (luminance -> rgb) for a hair colour, stretched over `range` or else over
   the sprite pixels d. */
function hairLut(d,color,range){
  let lo,hi;
  if(range)[lo,hi]=range;
  else{
    const hist=new Uint32Array(256);let n=0;
    for(let i=0;i<d.length;i+=4)if(d[i+3]>200){hist[Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2])]++;n++}
    const pct=p=>{let acc=0;for(let v=0;v<256;v++){acc+=hist[v];if(acc>=n*p)return v}return 255};
    lo=pct(.02);hi=pct(.995);
  }
  hi=Math.max(lo+1,hi);
  const stops=color.stops.map(([t,hex])=>[t,hexRgb(hex)]);
  const lut=new Uint8ClampedArray(256*3);
  for(let v=0;v<256;v++){
    const t=Math.pow(Math.min(1,Math.max(0,(v-lo)/(hi-lo))),color.gamma||1);
    let k=0;while(k<stops.length-2&&t>stops[k+1][0])k++;
    const [t0,c0]=stops[k],[t1,c1]=stops[k+1],u=Math.min(1,Math.max(0,(t-t0)/(t1-t0)));
    for(let j=0;j<3;j++)lut[v*3+j]=c0[j]+(c1[j]-c0[j])*u;
  }
  return lut;
}
/* Sprite for an item part (main sprite or manifest part), tinted and hair-coloured as asked. */
function itemSprite(item,view,part,tintId,hairColorId){
  const art=item.art[view];if(!art)return Promise.reject(new Error('No '+view+' art for '+item.id));
  const src=part&&part!=='main'?art.parts?.[part]:art.main;
  if(!src)return Promise.reject(new Error('No '+view+' '+part+' art for '+item.id));
  const tint=(item.tints||[]).find(t=>t.id===tintId);
  const hair=hairColorId?CATALOG.hairColors.find(h=>h.id===hairColorId):null;
  const key=['spr',src,tint&&tint.id!=='original'?tint.id:'',hair?.stops?hair.id:''].join('|');
  return memo(dollCaches.sprite,key,async()=>{
    let c=await spriteCanvas(src);
    if(tint)c=tintCanvas(c,tint);
    if(hair)c=hairColorCanvas(c,hair,item.lum);
    return c;
  });
}

/* ---------- geometry ---------- */
function pathPoly(g,pts){g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath()}
function shapePath(g,s){
  if(s.poly)pathPoly(g,s.poly);
  else if(s.rect){g.beginPath();g.rect(...s.rect)}
  else if(s.ellipse){const [x,y,rx,ry,rot]=s.ellipse;g.beginPath();g.ellipse(x,y,rx,ry,(rot||0)*Math.PI/180,0,Math.PI*2)}
}
/* Remove (or keep only) polygon regions of a sprite; `feather` (sprite px) softens the cut edges. */
function maskSprite(src,{cut,keep,feather}){
  if(!cut&&!keep)return src;
  const c=makeCanvas(src.width,src.height),g=c.getContext('2d');g.drawImage(src,0,0);
  if(keep){ // union of keep polygons
    const m=makeCanvas(src.width,src.height),mg=m.getContext('2d');mg.fillStyle='#000';keep.forEach(p=>{pathPoly(mg,p);mg.fill()});
    g.globalCompositeOperation='destination-in';g.drawImage(m,0,0);g.globalCompositeOperation='source-over';}
  if(cut){g.globalCompositeOperation='destination-out';g.fillStyle='#000';
    if(feather){g.shadowColor='#000';g.shadowBlur=feather*2;g.shadowOffsetX=4000;g.translate(-4000,0)}
    cut.forEach(p=>{pathPoly(g,p);g.fill()})}
  return c;
}
/* Row warp: rows are [spriteY, dollY, spriteXa, dollXa, spriteXb, dollXb]. Between rows the vertical
   position and the horizontal scale/offset are interpolated, which lets one sprite follow a body's
   shoulders, waist, hips and legs with smooth non-uniform scaling. Bilinear, premultiplied. */
function warpSprite(src,rows){
  let R=rows.map(([sy,dy,a,da,b,db])=>{const k=(db-da)/(b-a);return {sy,dy,k,o:da-a*k}}).sort((p,q)=>p.sy-q.sy);
  const maxK=Math.max(...R.map(r=>r.k)),vs=R.length>1?Math.max(...R.slice(1).map((r,i)=>(r.dy-R[i].dy)/(r.sy-R[i].sy))):1;
  let s=src,f=Math.min(1,Math.max(maxK,vs)*1.35);
  if(f<.95){s=makeCanvas(src.width*f,src.height*f);const g=s.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(src,0,0,s.width,s.height);
    R=R.map(r=>({sy:r.sy*f,dy:r.dy,k:r.k/f,o:r.o}));}
  const W=s.width,H=s.height;
  const at=sy=>{
    let i=0;while(i<R.length-2&&sy>R[i+1].sy)i++;
    const p=R[i],q=R[i+1],t=(sy-p.sy)/(q.sy-p.sy),tc=Math.min(1,Math.max(0,t));
    return [p.dy+(q.dy-p.dy)*t,p.k+(q.k-p.k)*tc,p.o+(q.o-p.o)*tc];
  };
  const table=[];for(let sy=0;sy<=H;sy+=.5)table.push(at(sy));
  let x0=Infinity,x1=-Infinity;
  for(const [,k,o] of table){x0=Math.min(x0,o);x1=Math.max(x1,o+W*k)}
  const y0=Math.floor(table[0][0]),y1=Math.ceil(table[table.length-1][0]);
  x0=Math.floor(x0);x1=Math.ceil(x1);
  const out=makeCanvas(x1-x0,y1-y0),og=ctx2d(out),oim=og.createImageData(out.width,out.height),od=oim.data;
  const sd=ctx2d(s).getImageData(0,0,W,H).data;
  // premultiply source
  const pm=new Float32Array(sd.length);
  for(let i=0;i<sd.length;i+=4){const a=sd[i+3]/255;pm[i]=sd[i]*a;pm[i+1]=sd[i+1]*a;pm[i+2]=sd[i+2]*a;pm[i+3]=sd[i+3]}
  let ti=0;
  for(let Y=0;Y<out.height;Y++){
    const dy=y0+Y+.5;
    while(ti<table.length-2&&table[ti+1][0]<dy)ti++;
    const a=table[ti],b=table[ti+1];if(!b)break;
    const u=b[0]===a[0]?0:Math.min(1,Math.max(0,(dy-a[0])/(b[0]-a[0])));
    if(dy<a[0]-.5||dy>b[0]+.5&&ti>=table.length-2)continue;
    const sy=(ti+u)*.5-.5,k=a[1]+(b[1]-a[1])*u,o=a[2]+(b[2]-a[2])*u;
    const yy=Math.floor(sy),wy=sy-yy;
    if(yy<-1||yy>=H)continue;
    for(let X=0;X<out.width;X++){
      const sx=(x0+X+.5-o)/k-.5;if(sx<-1||sx>=W)continue;
      const xx=Math.floor(sx),wx=sx-xx;
      let r=0,g=0,bl=0,al=0;
      for(let j=0;j<4;j++){
        const px=xx+(j&1),py=yy+(j>>1);if(px<0||py<0||px>=W||py>=H)continue;
        const w=((j&1)?wx:1-wx)*((j>>1)?wy:1-wy);if(!w)continue;
        const i=(py*W+px)*4;r+=pm[i]*w;g+=pm[i+1]*w;bl+=pm[i+2]*w;al+=pm[i+3]*w;
      }
      if(al<.5)continue;
      const o4=(Y*out.width+X)*4,inv=255/al;
      od[o4]=r*inv;od[o4+1]=g*inv;od[o4+2]=bl*inv;od[o4+3]=al;
    }
  }
  og.putImageData(oim,0,0);
  return {canvas:out,x:x0,y:y0};
}
/* Draw a sprite into doll-local space using a fit: {warp:rows} or {x,y,w,h,rot} (rect of the
   whole sprite, rotation in degrees about the rect centre). */
function drawFitted(g,src,fit){
  if(fit.warp){const w=warpSprite(src,fit.warp);g.drawImage(w.canvas,w.x,w.y);return}
  g.save();
  const w=fit.w??src.width*(fit.h/src.height),h=fit.h??src.height*(fit.w/src.width);
  g.translate(fit.x+w/2,fit.y+h/2);if(fit.rot)g.rotate(fit.rot*Math.PI/180);
  g.drawImage(src,-w/2,-h/2,w,h);g.restore();
}
/* Draw a cut-out part (e.g. a sleeve) with an affine transform around a pivot. */
function drawPiece(g,src,p){
  g.save();
  g.translate(p.to[0],p.to[1]);g.rotate((p.rot||0)*Math.PI/180);g.scale(p.scale[0],p.scale[1]);g.translate(-p.pivot[0],-p.pivot[1]);
  pathPoly(g,p.poly);g.clip();g.drawImage(src,0,0);g.restore();
}
/* Per-view base doll info: {art, origin, face, nails, arm, lobes...} (front = the doll's own fields). */
function dollView(doll,view='front'){
  const d=CATALOG.dolls[doll];
  return d.views?.[view]||{art:d.art[view],origin:d.origin,face:d.face,nails:d.nails};
}
const sideView=view=>view==='left'||view==='right';
/* A full doll-canvas sized layer, drawn in doll-local coordinates of the view's base picture. */
function dollLayer(doll,view='front'){
  const c=makeCanvas(DOLL_CANVAS.width,DOLL_CANVAS.height),g=c.getContext('2d');
  const [ox,oy]=dollView(doll,view).origin;g.translate(ox,oy);g.imageSmoothingQuality='high';
  return [c,g];
}
/* Copy the parts of a layer inside doll-local shapes into a new layer (and clear them in the source). */
function splitLayer(doll,view,c,shapes){
  const [out,og]=dollLayer(doll,view),g=c.getContext('2d');
  og.save();og.beginPath();shapes.forEach(s=>shapePathInto(og,s));og.clip();og.setTransform(1,0,0,1,0,0);og.drawImage(c,0,0);og.restore();
  const [ox,oy]=dollView(doll,view).origin;
  g.save();g.setTransform(1,0,0,1,ox,oy);g.beginPath();shapes.forEach(s=>shapePathInto(g,s));g.clip();g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);g.restore();
  return out;
}
/* Erase doll-local shapes from a layer. */
function eraseShapes(doll,view,c,shapes){
  const g=c.getContext('2d'),[ox,oy]=dollView(doll,view).origin;
  for(const s of shapes){ // s.feather: soft edge (px), drawn as an offset shadow so no ctx.filter is needed
    g.save();g.globalCompositeOperation='destination-out';g.fillStyle='#000';
    if(s.feather){g.shadowColor='#000';g.shadowBlur=s.feather*2;g.shadowOffsetX=4000;g.setTransform(1,0,0,1,ox-4000,oy)}else g.setTransform(1,0,0,1,ox,oy);
    g.beginPath();shapePathInto(g,s);g.fill();g.restore();
  }
}

/* ---------- item layers ---------- */
/* Outfit: {front, back, over}. `back` = pixels inside fit.behind (hoods, back collars) drawn behind the
   body; `over` = cut-out parts flagged over:true (side-view sleeves) drawn after the near arm. */
function outfitLayer(doll,view,id,tintId){
  const item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit)return Promise.reject(new Error('Outfit '+id+' does not fit '+doll+' '+view));
  return memo(dollCaches.layer,['outfit',doll,view,id,tintId].join('|'),async()=>{
    const [c,g]=dollLayer(doll,view);let over=null,og=null;
    for(const piece of fit.pieces){
      let src=await itemSprite(item,view,piece.part,tintId);
      const parts=piece.parts||[];
      // a part may take its pixels from another view's sprite of the same piece (p.view, e.g. plain
      // body fabric from the back to fill in behind a side sleeve that was moved onto the arm)
      const psrc=new Map();for(const p of parts)psrc.set(p,p.view?await itemSprite(item,p.view,piece.part,tintId):src);
      const body=maskSprite(src,{cut:parts.filter(p=>!p.view).map(p=>p.cut||p.poly).concat(piece.cut||[]),keep:piece.keep,feather:piece.cutFeather});
      for(const p of parts.filter(p=>p.under))drawPiece(g,psrc.get(p),p);
      drawFitted(g,body,piece);
      for(const p of parts.filter(p=>!p.under&&!p.over))drawPiece(g,psrc.get(p),p);
      for(const p of parts.filter(p=>p.over)){if(!over)[over,og]=dollLayer(doll,view);drawPiece(og,psrc.get(p),p)}
    }
    if(fit.erase)eraseShapes(doll,view,c,fit.erase);
    const res={front:c,back:null,over};
    if(fit.behind)res.back=splitLayer(doll,view,c,fit.behind);
    if(fit.overRegion){const o=splitLayer(doll,view,c,fit.overRegion);if(over)o.getContext('2d').drawImage(over,0,0);res.over=o}
    return res;
  });
}
/* Shoes: {back, front}. `back` is the whole shoe, drawn behind the body: its sole, insole and lining sit
   under the foot. `front` holds only the parts that are in front of the foot and leg: below the collar
   line (fraction of the shoe height; above it the heel counter is behind the ankle), or inside the
   part's `front` polygon, plus its `over` polygons (e.g. the front band of an ankle strap), minus its
   `open` polygons (insole between sandal straps, a mary-jane throat), where the foot shows through.
   Polygons are in sprite fractions [u, v]. Pairs: fit.left/right = {x,y,w,h,rot,front,over,open} for
   the sprite parts. Side views: fit.near = the same for the single main sprite, optional
   fit.far = {dx,dy,shade} draws it again behind the body for the far foot. `mask` = where the bare foot
   may show (the shoe's silhouette plus each part's `keep` polygons: the open sides of a sandal), used
   with fit.foot and fit.trim by fitFeet (the bare foot is moved into the shoe). */
function shoeLayers(doll,view,id,tintId){
  const item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit)return Promise.resolve(null);
  return memo(dollCaches.layer,['shoes',doll,view,id,tintId].join('|'),async()=>{
    const [back,bg]=dollLayer(doll,view),[front,fg]=dollLayer(doll,view),[mask,mg]=dollLayer(doll,view);
    const place=(g,src,f)=>{const w=f.w,h=f.h??src.height*w/src.width;g.translate(f.x,f.y);if(f.rot)g.rotate(f.rot*Math.PI/180);return [w,h]};
    const scaled=(poly,w,h)=>poly.map(([u,v])=>[u*w,v*h]);
    // an open shoe drawn in two layers (f.over = {x,y,w,h,rot} of its `over` sprite part): the part
    // under the foot (sole, insole) whole into `back`, the part over it (straps, uppers) whole into
    // `front`, so the foot lies between them; both count for the mask
    // The mask of an open shoe is its outline filled row by row (both layers of that foot), so the foot
    // shows through every gap between the straps but nothing of it sticks out past the shoe: no toes
    // over a closed toe cage, no instep bulging above it, no heel hanging off the sole.
    const layered=(under,over,f)=>{
      const [m,tg]=dollLayer(doll,view);
      for(const [g,src,q] of [[bg,under,f],[fg,over,f.over],[tg,under,f],[tg,over,f.over]]){
        g.save();const [w,h]=place(g,src,q);g.drawImage(src,0,0,w,h);
        if(g===tg){g.fillStyle='#000';for(const p of q.keep||[]){pathPoly(g,scaled(p,w,h));g.fill()}}
        g.restore();
      }
      const md=ctx2d(m),im=md.getImageData(0,0,m.width,m.height),d=im.data,W=m.width;
      for(let y=0;y<m.height;y++){let l=-1,r=-1;for(let x=0;x<W;x++)if(d[(y*W+x)*4+3]>60){if(l<0)l=x;r=x}
        if(l>=0)for(let x=l;x<=r;x++)d[(y*W+x)*4+3]=255}
      md.putImageData(im,0,0);
      mg.save();mg.setTransform(1,0,0,1,0,0);mg.drawImage(m,0,0);mg.restore();
    };
    // one shoe sprite: whole into `back`, its over-the-foot parts into `front`
    const shoe=(src,f)=>{
      bg.save();const [w,h]=place(bg,src,f);bg.drawImage(src,0,0,w,h);bg.restore();
      mg.save();place(mg,src,f);mg.drawImage(src,0,0,w,h);mg.fillStyle='#000';for(const p of f.keep||[]){pathPoly(mg,scaled(p,w,h));mg.fill()}mg.restore();
      const t=makeCanvas(DOLL_CANVAS.width,DOLL_CANVAS.height),tg=t.getContext('2d');
      tg.setTransform(fg.getTransform());place(tg,src,f);
      tg.beginPath();
      if(f.front)pathPoly(tg,scaled(f.front,w,h));else tg.rect(-5,h*(fit.collar||0),w+10,h*2);
      for(const p of f.over||[]){const q=scaled(p,w,h);q.forEach(([x,y],i)=>i?tg.lineTo(x,y):tg.moveTo(x,y));tg.closePath()}
      tg.save();tg.clip();tg.drawImage(src,0,0,w,h);tg.restore();
      if(f.open){ // soft-edged holes where the foot shows through
        tg.globalCompositeOperation='destination-out';tg.fillStyle='#000';
        const m=tg.getTransform();tg.shadowColor='#000';tg.shadowBlur=(f.openFeather??1.2)*2;tg.shadowOffsetX=4000;
        tg.setTransform(m.a,m.b,m.c,m.d,m.e-4000,m.f);
        for(const p of f.open){pathPoly(tg,scaled(p,w,h));tg.fill()}
      }
      fg.save();fg.setTransform(1,0,0,1,0,0);fg.drawImage(t,0,0);fg.restore();
    };
    if(fit.near?.over?.part){ // open shoe, side view
      layered(await itemSprite(item,view,fit.near.part,tintId),await itemSprite(item,view,fit.near.over.part,tintId),fit.near);
      return {back,front,mask};
    }
    if(fit.left?.over?.part||fit.right?.over?.part){ // open shoes, front and back views
      for(const side of ['left','right']){const f=fit[side];if(!f)continue;
        layered(await itemSprite(item,view,f.part,tintId),await itemSprite(item,view,f.over.part,tintId),f)}
      return {back,front,mask};
    }
    if(fit.near){
      const src=await itemSprite(item,view,'main',tintId);
      if(fit.far){
        const f={...fit.near,x:fit.near.x+(fit.far.dx||0),y:fit.near.y+(fit.far.dy||0)};
        const t=makeCanvas(DOLL_CANVAS.width,DOLL_CANVAS.height),tg=t.getContext('2d');tg.translate(...dollView(doll,view).origin);
        const [w,h]=place(tg,src,f);tg.drawImage(src,0,0,w,h);
        tg.setTransform(1,0,0,1,0,0);tg.globalCompositeOperation='source-atop';tg.fillStyle=`rgba(30,12,30,${fit.far.shade??.3})`;tg.fillRect(0,0,t.width,t.height);
        bg.save();bg.setTransform(1,0,0,1,0,0);bg.drawImage(t,0,0);bg.restore();
      }
      shoe(src,fit.near);
      return {back,front,mask};
    }
    for(const side of ['left','right']){
      const f=fit[side];if(!f)continue;
      shoe(await itemSprite(item,view,side,tintId),f);
    }
    return {back,front,mask};
  });
}
/* Hair: {back, front, shade}. The sprites are painted on these very heads (art/fit_hair_pack2.py
   registers each one from its worn proof), so a style is drawn as it is, at its fit {x,y,w,h,rot}.
   fit.front shapes = doll-local regions drawn again in front of the body (the whole style is then
   also drawn behind it: lengths behind the shoulders and arms); fit.behind = the reverse, doll-local
   shapes where the style passes behind the body (e.g. the near arm in a side view, feathered);
   fit.cut = sprite polys removed; fit.scalpFill = doll-local shapes for scalpShow's force;
   fit.cutDoll = doll-local shapes removed; fit.soften = feathered hairline over skin (opt-in, see
   softenHairline); fit.shade = contact shadow (opt-in, see hairShade); fit.scalp=false turns off
   the scalp shown through partings (scalpShow); fit.open = the face kept clear (openFace);
   fit.under = hair behind the head where the style covers the ears (underHair). */
function hairLayers(doll,view,id,colorId){
  const item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit)return Promise.reject(new Error('Hair '+id+' does not fit '+doll+' '+view));
  return memo(dollCaches.layer,['hair',doll,view,id,colorId].join('|'),async()=>{
    let src=await itemSprite(item,view,'main',null,colorId);
    if(fit.cut)src=maskSprite(src,{cut:fit.cut});
    const [full,g]=dollLayer(doll,view);drawFitted(g,src,fit);
    if(fit.open)openFace(full,dollView(doll,view).origin,fit.open);
    if(fit.scalp!==false){const dv=dollView(doll,view);let force=null;
      if(fit.scalpFill){force=makeCanvas(full.width,full.height);const fg=ctx2d(force);fg.translate(...dv.origin);fg.fillStyle='#000';fg.beginPath();fit.scalpFill.forEach(sh=>shapePathInto(fg,sh));fg.fill()}
      scalpShow(full,await spriteCanvas(dv.art),dv.origin,CATALOG.dolls[doll].skin,force)}
    if(fit.holeFill)holeFill(full,dollView(doll,view).origin,fit.holeFill);
    if(fit.cutDoll)eraseShapes(doll,view,full,fit.cutDoll);
    if(fit.soften){const dv=dollView(doll,view);softenHairline(full,await spriteCanvas(dv.art),dv.origin,fit.soften)}
    const under=fit.under?underHair(full,await spriteCanvas(dollView(doll,view).art),dollView(doll,view).origin,fit.under):null;
    const done=r=>{if(under){const b=r.back||makeCanvas(full.width,full.height),bg=b.getContext('2d');
      if(r.back){const c=makeCanvas(full.width,full.height),cg=c.getContext('2d');cg.drawImage(under,0,0);cg.drawImage(b,0,0);r={...r,back:c}}else{bg.drawImage(under,0,0);r={...r,back:b}}}
      return {...r,shade:hairShade(r.front,fit.shade)}};
    if(fit.behind){ // the style is in front of the body except inside these shapes (e.g. the near arm)
      const [front,fg]=dollLayer(doll,view);fg.setTransform(1,0,0,1,0,0);fg.drawImage(full,0,0);
      eraseShapes(doll,view,front,fit.behind);
      return done({back:full,front});
    }
    if(!fit.front)return done({back:null,front:full});
    // Only the given doll-local regions of the style are drawn again in front of the body (a shape's
    // feather softens where the hair passes behind, e.g. behind the arms in the front view).
    if(fit.front.some(s=>s.feather)){const [ox,oy]=dollView(doll,view).origin;return done({back:full,front:softClip(full,ox,oy,fit.front)})}
    const [front,fg]=dollLayer(doll,view);
    fg.save();fg.beginPath();fit.front.forEach(s=>shapePathInto(fg,s));fg.clip();
    fg.setTransform(1,0,0,1,0,0);fg.drawImage(full,0,0);fg.restore();
    return done({back:full,front});
  });
}
/* fit.holeFill: doll-local shapes inside which the hair's see-through pixels are backed with its own
   colour, shadowed (a gap the style leaves at the temple, off her head, reads as hair behind it rather
   than as a hole). The colour is the mean of the opaque hair round the shapes. */
function holeFill(full,[ox,oy],shapes){
  const W=full.width,H=full.height,g=full.getContext('2d'),im=g.getImageData(0,0,W,H),d=im.data;
  const m=makeCanvas(W,H),mg=ctx2d(m);mg.translate(ox,oy);mg.fillStyle='#000';mg.beginPath();shapes.forEach(s=>shapePathInto(mg,s));mg.fill();
  const md=mg.getImageData(0,0,W,H).data;
  let n=0;const c=[0,0,0];
  for(let i=0;i<W*H;i++){if(!md[i*4+3])continue;for(let k=-6;k<=6;k+=3){const q=(i+k)*4;if(d[q+3]>240){c[0]+=d[q];c[1]+=d[q+1];c[2]+=d[q+2];n++}}}
  if(!n)return;
  for(let i=0;i<W*H;i++){const w=md[i*4+3]/255;if(!w)continue;const q=i*4,a=d[q+3]/255;if(a>.99)continue;
    const na=a+(1-a)*w;for(let k=0;k<3;k++)d[q+k]=(d[q+k]*a+c[k]/n*.68*(1-a)*w)/na;d[q+3]=na*255}
  g.putImageData(im,0,0);
}
/* Hair behind the head (styles that cover the ears, front view). Between her cheek, ear, jaw and neck
   and the inner edge of the hair hanging beside them the art shows nothing, so the backdrop would read as
   a pale band. In rows y0..y1 (doll-local), on each side where the hair's inner edge is no more than
   `gap` px outside her silhouette, a darker copy of that hair's own colour fills from the hair edge in to
   her centre line; it is drawn behind the body, so only the strip between skin and hair shows, as the
   shadowed hair at the back of her head and neck. Rows are smoothed so the fill follows the hair. */
function underHair(full,base,[ox,oy],{y0,y1,gap=24,dark=.55}){
  const W=full.width,H=full.height,d=ctx2d(full).getImageData(0,0,W,H).data;
  const BW=base.width,bd=ctx2d(base).getImageData(0,0,BW,base.height).data,X0=Math.round(ox),Y0=Math.round(oy);
  const body=(x,Y)=>{const bx=x-X0,by=Y-Y0;return bx>=0&&by>=0&&bx<BW&&by<base.height?bd[(by*BW+bx)*4+3]>100:false};
  const A=Math.max(0,Math.round(y0+oy)),B=Math.min(H-1,Math.round(y1+oy)),n=B-A+1;if(n<=0)return null;
  const side=[0,1].map(()=>({edge:new Float32Array(n).fill(NaN),col:new Float32Array(n*3)}));
  for(let j=0;j<n;j++){
    const Y=A+j;let l=-1,r=-1;
    for(let x=0;x<W;x++)if(body(x,Y)){if(l<0)l=x;r=x}
    if(l<0)continue;const cx=(l+r)/2;
    for(const [s,start,dir] of [[0,l-1,-1],[1,r+1,1]]){
      let x=start;while(Math.abs(x-start)<=gap&&x>=0&&x<W&&d[(Y*W+x)*4+3]<128)x+=dir;
      if(Math.abs(x-start)>gap||x<0||x>=W)continue;
      let n2=0,c=[0,0,0];for(let k=1;k<=8;k++){const q=(Y*W+x+dir*k)*4;if(x+dir*k<0||x+dir*k>=W||d[q+3]<200)continue;c[0]+=d[q];c[1]+=d[q+1];c[2]+=d[q+2];n2++}
      if(!n2)continue;
      side[s].edge[j]=x;for(let k=0;k<3;k++)side[s].col[j*3+k]=c[k]/n2;
      side[s].cx=cx;
    }
  }
  const out=makeCanvas(W,H),g=out.getContext('2d'),im=g.createImageData(W,H),o=im.data;let any=false;
  for(const [s,S] of side.entries()){
    for(let j=0;j<n;j++){
      // a row without a measured edge between rows with one (a gap between curls) is filled from them
      if(isNaN(S.edge[j])){let up=-1,dn=-1;for(let k=1;k<=16;k++){if(up<0&&j-k>=0&&!isNaN(S.edge[j-k]))up=j-k;if(dn<0&&j+k<n&&!isNaN(S.edge[j+k]))dn=j+k}
        if(up<0||dn<0)continue}
      // smoothed edge and colour over the rows around j that have hair
      let e=0,w=0,c=[0,0,0];for(let k=-16;k<=16;k++){const q=j+k;if(q<0||q>=n||isNaN(S.edge[q]))continue;const ww=Math.max(.05,6-Math.abs(k));e+=S.edge[q]*ww;for(let m=0;m<3;m++)c[m]+=S.col[q*3+m]*ww;w+=ww}
      e/=w;const raw=isNaN(S.edge[j])?e:S.edge[j],dir=s?1:-1,Y=A+j,cx=Math.round(S.cx??W/2);
      // reach at least the row's own hair edge (no gap), tucked 2 px under it
      const x1=Math.round(s?Math.max(raw,e):Math.min(raw,e))+dir*2;
      const [xa,xb]=s?[cx,x1]:[x1,cx];
      for(let x=Math.max(0,xa);x<=Math.min(W-1,xb);x++){
        // texture: the row's own hair mirrored inward from its edge (12 px period), darkened
        const k=Math.abs(x-raw)%24,xs=Math.round(raw)+dir*(k<12?k:24-k),q=(Y*W+x)*4,qs=(Y*W+xs)*4;
        const ok=xs>=0&&xs<W&&d[qs+3]>200;
        for(let m=0;m<3;m++)o[q+m]=(ok?d[qs+m]*.7+c[m]/w*.3:c[m]/w)*dark;o[q+3]=255;any=true;
      }
    }
  }
  if(!any)return null;
  g.putImageData(im,0,0);return out;
}
/* Keep the face open. The styles were painted on heads a little narrower than hers, so the inner edges
   of the front curtains would cover her outer eye corners, cheeks and jaw. open = {rows:[[y, xl, xr],
   ...]} (doll-local; between rows linear): in each row of the face, where the window between the
   curtains is open at the face's centre (a fringe across the centre is left alone), the inner edge of
   the hair on each side is moved out to xl / xr. The hair between that edge and `band` px outside it is
   gently compressed toward the outside (tucked behind the cheek); the outer silhouette, the parting
   and everything above the first row and below the last stay where they are. The per-row amounts are
   smoothed along the face (and faded in over `ramp` px above and below), so curls stay curls. */
function openFace(full,[ox,oy],{rows,ramp=10,band=26}){
  const W=full.width,H=full.height,g=full.getContext('2d'),im=g.getImageData(0,0,W,H),d=im.data;
  const y0=rows[0][0],y1=rows[rows.length-1][0];
  const at=y=>{y=Math.min(y1,Math.max(y0,y));let k=0;while(k<rows.length-2&&y>rows[k+1][0])k++;const [a,l0,r0]=rows[k],[b,l1,r1]=rows[k+1],u=(y-a)/(b-a||1);return [l0+(l1-l0)*u,r0+(r1-r0)*u]};
  const Y0=Math.max(0,Math.floor(y0-ramp+oy)),Y1=Math.min(H-1,Math.ceil(y1+ramp+oy)),n=Y1-Y0+1;
  if(n<=0)return;
  const A=[new Float32Array(n),new Float32Array(n)],T=[new Float32Array(n),new Float32Array(n)],C=new Float32Array(n),closed=new Uint8Array(n);
  const al=(x,Y)=>x<0||x>=W?0:d[(Y*W+x)*4+3]/255;
  for(let j=0;j<n;j++){
    const Y=Y0+j,[l,r]=at(Y-oy),L=l+ox,Rr=r+ox,cx=(L+Rr)/2;T[0][j]=L;T[1][j]=Rr;C[j]=cx;
    if(al(Math.round(cx),Y)>.3||al(Math.round(cx)-6,Y)>.3||al(Math.round(cx)+6,Y)>.3){closed[j]=1;continue} // a fringe: left as drawn
    let x=Math.round(cx);while(x>L-band&&al(x,Y)<.5)x--;A[0][j]=Math.max(0,x+1-L);
    x=Math.round(cx);while(x<Rr+band&&al(x,Y)<.5)x++;A[1][j]=Math.max(0,Rr-x);
  }
  for(const a of A){ // max over +-4 rows, then a soft blur over +-7, faded in/out at the ends
    const m=a.map((_,j)=>{let v=0;for(let k=Math.max(0,j-4);k<=Math.min(n-1,j+4);k++)v=Math.max(v,a[k]);return v});
    for(let j=0;j<n;j++){let s=0,ws=0;for(let k=-7;k<=7;k++){const q=j+k;if(q<0||q>=n)continue;const w=1-Math.abs(k)/8;s+=m[q]*w;ws+=w}
      const y=Y0+j-oy,fade=Math.min(1,Math.max(0,Math.min(y-(y0-ramp),(y1+ramp)-y)/ramp));a[j]=s/ws*fade*fade*(3-2*fade)}
  }
  // rows of (and next to) a fringe stay as drawn: fade in over 8 rows away from the nearest closed row
  let last=-1e9;const near=new Float32Array(n).fill(1e9);
  for(let j=0;j<n;j++){if(closed[j])last=j;near[j]=j-last}
  last=1e9;for(let j=n-1;j>=0;j--){if(closed[j])last=j;near[j]=Math.min(near[j],last-j)}
  for(let j=0;j<n;j++){const k=Math.min(1,Math.max(0,(near[j]-2)/8));A[0][j]*=k;A[1][j]*=k}
  const src=new Float32Array(W*4); // one premultiplied source row
  for(let j=0;j<n;j++){
    const aL=A[0][j],aR=A[1][j];if(aL<.05&&aR<.05)continue;
    const Y=Y0+j,cx=C[j],row=Y*W*4;
    for(let x=0;x<W;x++){const i=row+x*4,a=d[i+3]/255;src[x*4]=d[i]*a;src[x*4+1]=d[i+1]*a;src[x*4+2]=d[i+2]*a;src[x*4+3]=d[i+3]}
    // output x -> source x (monotonic): left side then right side (mirrored)
    const map=(x,a,T0,dir)=>{ // dir -1: left curtain (hair at x < T0), +1: right
      // u: distance from T0 into the hair (> 0) or toward the face's centre (< 0); the source edge is at -a
      const u=(x-T0)*dir,B=Math.max(band,a*2.5),D=Math.abs(cx-T0);
      if(u>=B||D<=a+1)return x;
      const us=u>=0?-a+u*(B+a)/B:-a+u*(D-a)/D;
      return T0+dir*us;
    };
    for(let x=0;x<W;x++){
      let xs=x;
      if(x<cx&&aL>=.05)xs=map(x,aL,T[0][j],-1);
      else if(x>=cx&&aR>=.05)xs=map(x,aR,T[1][j],1);
      if(xs===x)continue;
      const x0=Math.floor(xs),f=xs-x0,o=row+x*4;
      const s0=x0>=0&&x0<W?x0*4:-1,s1=x0+1>=0&&x0+1<W?(x0+1)*4:-1;
      const p=k=>(s0<0?0:src[s0+k]*(1-f))+(s1<0?0:src[s1+k]*f);
      const a=p(3);if(a<.5){d[o+3]=0;continue}
      const inv=255/a;d[o]=p(0)*inv;d[o+1]=p(1)*inv;d[o+2]=p(2)*inv;d[o+3]=a;
    }
  }
  g.putImageData(im,0,0);
}
/* Scalp through the hair: partings and sheer hairlines are painted semi-transparent, over the
   painted head's scalp. Where her own head is a little smaller than the one the style was painted
   on, that scalp is missing and the backdrop would show through a parting. So inside the hair's
   closed silhouette (holes and partings narrower than ~2r px, not the face window or the outer
   edge), and only off her own picture, the hair is composited over her skin tone, slightly shaded.
   force = optional canvas: inside its shapes (fit.scalpFill, doll-local) this is done whatever the
   hair's shape there, for sheer hairlines painted over a forehead that is not quite where hers is. */
function scalpShow(full,base,[ox,oy],skin,force,r=4){
  const W=full.width,H=full.height,g=full.getContext('2d'),im=g.getImageData(0,0,W,H),d=im.data;
  const BW=base.width,BH=base.height,bd=ctx2d(base).getImageData(0,0,BW,BH).data,X0=Math.round(ox),Y0=Math.round(oy);
  const blur=(src,rad)=>{const t=new Float32Array(W*H),o=new Float32Array(W*H),k=2*rad+1;
    for(let y=0;y<H;y++){let s=0;const row=y*W;for(let x=-rad;x<=rad;x++)s+=src[row+Math.min(W-1,Math.max(0,x))];
      for(let x=0;x<W;x++){t[row+x]=s/k;s+=src[row+Math.min(W-1,x+rad+1)]-src[row+Math.max(0,x-rad)]}}
    for(let x=0;x<W;x++){let s=0;for(let y=-rad;y<=rad;y++)s+=t[Math.min(H-1,Math.max(0,y))*W+x];
      for(let y=0;y<H;y++){o[y*W+x]=s/k;s+=t[Math.min(H-1,y+rad+1)*W+x]-t[Math.max(0,y-rad)*W+x]}}
    return o};
  const m=new Float32Array(W*H);let any=false;
  for(let i=0;i<W*H;i++)if(d[i*4+3]>128){m[i]=1;any=true}
  if(!any)return;
  const dil=blur(m,r),dm=new Float32Array(W*H);for(let i=0;i<W*H;i++)dm[i]=dil[i]>.02?1:0;
  const ero=blur(dm,r);
  // never next to empty pixels: the outer edge (and its outline) stays as painted
  const empty=new Float32Array(W*H);for(let i=0;i<W*H;i++)if(d[i*4+3]<6)empty[i]=1;
  const nearEmpty=blur(empty,2);
  const sk=skin.map(c=>c*.82),fd=force&&ctx2d(force).getImageData(0,0,W,H).data;let changed=false;
  for(let i=0;i<W*H;i++){
    const a=d[i*4+3]/255;if(a>.98)continue;
    if(!(fd&&fd[i*4+3]>128)&&(ero[i]<.98||nearEmpty[i]>0))continue;
    const x=i%W,y=(i/W)|0,bx=x-X0,by=y-Y0;
    const body=bx>=0&&by>=0&&bx<BW&&by<BH?bd[(by*BW+bx)*4+3]/255:0;
    const forced=fd&&fd[i*4+3]>128,f=forced?1:1-body;if(f<=0)continue; // forced: fully, her own edge is antialiased there
    const na=a+(1-a)*f;
    for(let j=0;j<3;j++)d[i*4+j]=(d[i*4+j]*a+sk[j]*(1-a)*f)/na;
    d[i*4+3]=na*255;changed=true;
  }
  if(changed)g.putImageData(im,0,0);
}
/* Where the hair sprite ends over skin (the hairline round the face, sideburns, nape, a fringe) its
   cut-out edge is softened: alpha is multiplied by a ramp of the locally blurred alpha, so the edge
   fades over ~radius px and stray wisps turn translucent, like real baby hairs, instead of a hard
   painted line. Only pixels over the base doll are touched (the outer silhouette stays crisp).
   Within `reach` px of that edge the hair is also darkened by up to `root` (shadowed roots).
   opts = fit.soften: {radius, floor, root, reach} (floor = the least alpha factor at the very edge). */
function softenHairline(full,base,[ox,oy],opts={}){
  if(opts===false)return;
  const W=full.width,H=full.height,radius=opts.radius??1.8,floor=opts.floor??.35,root=opts.root??.24,reach=opts.reach??6;
  const blurred=r=>{const m=makeCanvas(W,H),mg=ctx2d(m);mg.shadowColor='#000';mg.shadowBlur=r*2;mg.shadowOffsetX=W;mg.drawImage(full,-W,0);return mg.getImageData(0,0,W,H).data};
  const bd=blurred(radius),wd=blurred(reach),rc=makeCanvas(W,H),rg=ctx2d(rc);rg.drawImage(full,0,0);
  const im=rg.getImageData(0,0,W,H),d=im.data,g=full.getContext('2d');
  const BW=base.width,BH=base.height,sk=ctx2d(base).getImageData(0,0,BW,BH).data;
  const X0=Math.round(ox),Y0=Math.round(oy);
  for(let y=0;y<H;y++){const by=y-Y0;if(by<0||by>=BH)continue;
    for(let x=0;x<W;x++){const o=(y*W+x)*4;if(!d[o+3])continue;const bx=x-X0;if(bx<0||bx>=BW)continue;
      const skin=sk[(by*BW+bx)*4+3]/255;if(!skin)continue;
      const b=bd[o+3]/255,t=Math.min(1,Math.max(0,(b-.3)/.55)),k=floor+(1-floor)*t*t*(3-2*t);
      d[o+3]*=1-(1-k)*skin;
      // roots: hair near its edge over skin is a little darker (shadowed, denser at the roots), so the
      // lighter wisps of the drawn hairline do not read as a pale painted band in light colours
      const e=Math.min(1,Math.max(0,(1-wd[o+3]/255)/.5))*root*skin; // warm shadow: blue darkens most
      d[o]*=1-e*.7;d[o+1]*=1-e;d[o+2]*=1-e*1.2;
    }}
  g.save();g.setTransform(1,0,0,1,0,0);g.putImageData(im,0,0);g.restore();
}
/* Contact shadow of the hair: a soft, slightly lowered blur of the front hair layer, outside the hair
   itself, drawn source-atop over the body and outfit (portrait composeDoll), so the hair sits on the
   forehead, temples, neck and shoulders instead of floating above them. Opt-in (the styles painted on
   the head carry their own shading, so none uses it now): opts = fit.shade
   {blur, dy, alpha}. */
function hairShade(front,opts){
  if(!opts)return null;
  const W=front.width,H=front.height,c=makeCanvas(W,H),g=c.getContext('2d');
  g.shadowColor=`rgba(58,26,20,${opts.alpha??.34})`;g.shadowBlur=(opts.blur??4)*2;g.shadowOffsetX=W;g.shadowOffsetY=opts.dy??1.5;
  g.drawImage(front,-W,0);
  g.shadowColor='transparent';g.globalCompositeOperation='destination-out';g.drawImage(front,0,0);
  return c;
}
function shapePathInto(g,s){
  if(s.poly){s.poly.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath()}
  else if(s.rect)g.rect(...s.rect);
  else if(s.ellipse){const [x,y,rx,ry,rot]=s.ellipse;g.moveTo(x+rx,y);g.ellipse(x,y,rx,ry,(rot||0)*Math.PI/180,0,Math.PI*2)}
}
/* A strand of a sprite laid along a doll-local path (side and back views of a necklace): rb.src is the
   strand's centre line in sprite px, rb.dst the path it is laid on (doll-local); both are resampled by
   length, and rb.ease foreshortens the ends where the strand turns toward or away from the viewer
   ('ring': both ends, 'in': the start, 'out': the end). A band rb.in px on the inner side of the strand
   and rb.out px on the outer side (pendants) is carried along, at rb.k doll px per sprite px; rb.hand
   (1 or -1, mirrored views flip it) says on which side of the path the outer side lies. Drawn as
   affine-mapped triangles. */
function drawRibbon(g,src,rb){
  const n=rb.n||28,f=Math.min(1,rb.k*2.2);
  let s=src;if(f<.98){s=makeCanvas(src.width*f,src.height*f);const sg=s.getContext('2d');sg.imageSmoothingQuality='high';sg.drawImage(src,0,0,s.width,s.height)}
  const resample=(pts,map)=>{const L=[0];for(let i=1;i<pts.length;i++)L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
    return Array.from({length:n+1},(_,j)=>{const at=map(j/n)*L[L.length-1];let i=1;while(i<L.length-1&&L[i]<at)i++;const u=(at-L[i-1])/((L[i]-L[i-1])||1);
      return [pts[i-1][0]+(pts[i][0]-pts[i-1][0])*u,pts[i-1][1]+(pts[i][1]-pts[i-1][1])*u]})};
  const ease={ring:t=>(1-Math.cos(Math.PI*t))/2,in:t=>1-Math.cos(Math.PI*t/2),out:t=>Math.sin(Math.PI*t/2)}[rb.ease]||(t=>t);
  const S=resample(rb.src.map(([x,y])=>[x*f,y*f]),t=>t),D=resample(rb.dst,ease);
  const normals=(P,turn)=>P.map((_,i)=>{const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)];let tx=b[0]-a[0],ty=b[1]-a[1];const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;return turn>0?[-ty,tx]:[ty,-tx]});
  const NS=normals(S,1),ND=normals(D,-(rb.hand??1)),ki=rb.in*f,ko=rb.out*f,kk=rb.k/f;
  const band=(P,N,a,b)=>P.map((p,i)=>[[p[0]-N[i][0]*a,p[1]-N[i][1]*a],[p[0]+N[i][0]*b,p[1]+N[i][1]*b]]);
  const BS=band(S,NS,ki,ko),BD=band(D,ND,ki*kk,ko*kk);
  const tri=(s0,s1,s2,d0,d1,d2)=>{
    const den=(s1[0]-s0[0])*(s2[1]-s0[1])-(s2[0]-s0[0])*(s1[1]-s0[1]);if(Math.abs(den)<1e-6)return;
    const a=((d1[0]-d0[0])*(s2[1]-s0[1])-(d2[0]-d0[0])*(s1[1]-s0[1]))/den,c=((d2[0]-d0[0])*(s1[0]-s0[0])-(d1[0]-d0[0])*(s2[0]-s0[0]))/den;
    const b=((d1[1]-d0[1])*(s2[1]-s0[1])-(d2[1]-d0[1])*(s1[1]-s0[1]))/den,d=((d2[1]-d0[1])*(s1[0]-s0[0])-(d1[1]-d0[1])*(s2[0]-s0[0]))/den;
    const cx=(d0[0]+d1[0]+d2[0])/3,cy=(d0[1]+d1[1]+d2[1])/3,grow=p=>{const dx=p[0]-cx,dy=p[1]-cy,l=Math.hypot(dx,dy)||1;return [p[0]+dx/l*.6,p[1]+dy/l*.6]};
    g.save();pathPoly(g,[d0,d1,d2].map(grow));g.clip();
    g.transform(a,b,c,d,d0[0]-a*s0[0]-c*s0[1],d0[1]-b*s0[0]-d*s0[1]);g.drawImage(s,0,0);g.restore();
  };
  for(let i=0;i<n;i++){
    const [sa,sb]=BS[i],[sc,sd]=BS[i+1],[da,db]=BD[i],[dc,dd]=BD[i+1];
    tri(sa,sc,sd,da,dc,dd);tri(sa,sd,sb,da,dd,db);
  }
}
/* Earrings (fit.left / fit.right, either may be absent in side views; f.part picks the sprite part)
   and plain sprite items such as necklaces. */
function spriteItemLayer(doll,view,id,tintId){
  const item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit)return Promise.resolve(null);
  return memo(dollCaches.layer,['item',doll,view,id,tintId].join('|'),async()=>{
    const [c,g]=dollLayer(doll,view);
    if(fit.left||fit.right){ // earrings: one sprite per ear, hook anchored to the earlobe
      for(const side of ['left','right']){
        const f=fit[side];if(!f)continue;
        const part=f.part||side,src=await itemSprite(item,view,part,tintId);
        const w=f.w,h=src.height*w/src.width,[ax,ay]=item.anchor?.[part]||[.5,0];
        g.save();g.translate(f.x,f.y);if(f.rot)g.rotate(f.rot*Math.PI/180);g.drawImage(src,-ax*w,-ay*h,w,h);g.restore();
      }
    }else if(fit.ribbons){ // necklaces seen from the side and behind (drawRibbon)
      for(const rb of fit.ribbons)drawRibbon(g,await itemSprite(item,rb.art||view,'main',tintId),rb);
      for(const p of fit.pendants||[]){
        const src=await itemSprite(item,p.art||view,'main',tintId),[sx,sy,sw,sh]=p.rect,w=p.w,h=sh*w/sw;
        g.save();g.translate(p.at[0],p.at[1]);if(p.flip)g.scale(-1,1);if(p.rot)g.rotate(p.rot*Math.PI/180);
        g.drawImage(src,sx,sy,sw,sh,-w/2,0,w,h);g.restore();
      }
    }else{
      let src=await itemSprite(item,view,'main',tintId);
      if(fit.keep||fit.cut)src=maskSprite(src,fit);
      if(fit.piece)drawPiece(g,src,fit.piece); // side views: a strand mapped sprite point -> doll point
      else drawFitted(g,src,fit);
    }
    if(fit.erase)eraseShapes(doll,view,c,fit.erase);
    return c;
  });
}
/* Side views: the near arm of the base doll as its own layer (bodysuit pixels inside the arm polygon
   dropped), so it can be drawn over the outfit. Uses the finished body canvas (nails, cover-up). */
function armLayer(shot,view,body){
  const dv=dollView(shot.doll,view);
  if(!dv.arm)return null;
  return memo(dollCaches.layer,'arm|'+bodyKey(shot,view),async()=>{
    const [c,g]=dollLayer(shot.doll,view);
    g.save();g.beginPath();shapePathInto(g,{poly:dv.arm});g.clip();g.drawImage(body,0,0);g.restore();
    const im=g.getImageData(0,0,c.width,c.height),d=im.data;
    for(let i=0;i<d.length;i+=4){
      if(!d[i+3])continue;
      const r=d[i],gg=d[i+1],b=d[i+2],w=Math.min(1,Math.max(0,(b/(r||1)-.62)/.2))*(gg<b+6?1:0);
      if(w>0)d[i+3]*=1-w;
    }
    g.putImageData(im,0,0);
    return c;
  });
}

/* ---------- procedural accessories ---------- */
function drawCharm(ctx, style, x, y, size, rot=-0.19) {
  if (!style) return;
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(size,size);
  ctx.rotate(rot);
  ctx.shadowColor='rgba(58,21,54,.42)';
  ctx.shadowBlur=4;
  ctx.shadowOffsetY=2;
  ctx.lineJoin='round';
  ctx.strokeStyle='#fff5e7';
  ctx.lineWidth=.055;
  if(style===1) {
    for(let i=0;i<5;i++){
      ctx.rotate(Math.PI*2/5);
      ctx.beginPath();ctx.ellipse(0,-.39,.28,.39,0,0,Math.PI*2);
      ctx.fillStyle=['#ff8d91','#ffb394'][i%2];ctx.fill();ctx.stroke();
    }
    ctx.beginPath();ctx.arc(0,0,.19,0,Math.PI*2);ctx.fillStyle='#ffe577';ctx.fill();
  } else if(style===2) {
    ctx.fillStyle='#f75da4';ctx.beginPath();ctx.moveTo(0,0);
    ctx.bezierCurveTo(-.85,-.84,-1,.68,-.08,.16);
    ctx.bezierCurveTo(.9,.7,.9,-.85,0,0);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,.16,0,Math.PI*2);ctx.fillStyle='#ffbedc';ctx.fill();
  } else {
    ctx.beginPath();
    for(let i=0;i<10;i++) {
      const a=-Math.PI/2+i*Math.PI/5,r=i%2?.35:.78;
      ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
    }
    ctx.closePath();ctx.fillStyle='#ffcf4e';ctx.fill();ctx.stroke();
  }
  ctx.restore();
}
/* Stud earrings drawn at the earlobes. */
function drawStud(g,kind,x,y,r){
  g.save();g.translate(x,y);
  g.shadowColor='rgba(70,30,50,.45)';g.shadowBlur=r*.6;g.shadowOffsetY=r*.15;
  if(kind==='pearl'){
    const gr=g.createRadialGradient(-r*.35,-r*.35,r*.1,0,0,r);gr.addColorStop(0,'#ffffff');gr.addColorStop(.55,'#f6ece6');gr.addColorStop(1,'#cdb8b4');
    g.fillStyle=gr;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();
  }else if(kind==='heart'){
    g.scale(r*1.25,r*1.25);g.fillStyle='#f04f95';g.beginPath();g.moveTo(0,.55);g.bezierCurveTo(-1.1,-.15,-.45,-.95,0,-.35);g.bezierCurveTo(.45,-.95,1.1,-.15,0,.55);g.fill();
    g.shadowColor='transparent';g.fillStyle='rgba(255,255,255,.75)';g.beginPath();g.ellipse(-.32,-.25,.14,.09,-.6,0,Math.PI*2);g.fill();
  }else if(kind==='clutch'){ // the earring back, seen from behind
    const gr=g.createRadialGradient(-r*.3,-r*.3,r*.1,0,0,r);gr.addColorStop(0,'#fff4c0');gr.addColorStop(.6,'#dcae4a');gr.addColorStop(1,'#9b6a1c');
    g.fillStyle=gr;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();
  }else{ // crystal star
    g.scale(r*1.3,r*1.3);g.beginPath();
    for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?.42:1;g.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}
    g.closePath();const gr=g.createLinearGradient(-1,-1,1,1);gr.addColorStop(0,'#fff8c9');gr.addColorStop(.5,'#ffd44f');gr.addColorStop(1,'#d79a1a');g.fillStyle=gr;g.fill();
  }
  g.restore();
}

/* ---------- face, nails and bodysuit cover-up (pixel work on the base doll) ---------- */
/* Paints a soft-edged mask for a list of shapes into an offscreen canvas and returns its alpha. */
function shapeMask(w,h,shapes,blur=0,alpha=1){
  const m=makeCanvas(w,h),g=ctx2d(m);
  g.fillStyle=`rgba(0,0,0,${alpha})`;
  if(blur){g.shadowColor=`rgba(0,0,0,${alpha})`;g.shadowBlur=blur;g.shadowOffsetX=w*2;g.translate(-w*2,0)}
  for(const s of shapes){
    if(s.gradient){ // radial soft blob: [x,y,rx,ry,strength]
      const [x,y,rx,ry,st=1]=s.gradient;
      g.save();g.shadowColor='transparent';g.setTransform(1,0,0,ry/rx,0,y-y*ry/rx);
      const gr=g.createRadialGradient(x,y,0,x,y,rx);gr.addColorStop(0,`rgba(0,0,0,${st})`);gr.addColorStop(.55,`rgba(0,0,0,${st*.55})`);gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=gr;g.fillRect(x-rx,y-rx,rx*2,rx*2);g.restore();continue;
    }
    shapePath(g,s);g.fill();
  }
  const out=g.getImageData(0,0,w,h).data,a=new Float32Array(w*h);
  for(let i=0;i<a.length;i++)a[i]=out[i*4+3]/255;
  return a;
}
function luma(r,g,b){return .299*r+.587*g+.114*b}
/* Recolour pixels weighted by mask m. mode 'color' keeps the shading of the original pixel. */
function applyColor(d,m,rgb,strength,mode,opts={}){
  const [cr,cg,cb]=rgb,cl=luma(cr,cg,cb)||1;
  for(let i=0,p=0;p<m.length;p++,i+=4){
    let w=m[p];if(w<=0||!d[i+3])continue;
    w*=strength;
    const r=d[i],g=d[i+1],b=d[i+2],l=luma(r,g,b);
    if(opts.skipBright){const [,sat,li]=rgbToHsl(r,g,b);if(sat<opts.skipBright&&li>.55)w*=Math.max(0,(sat-opts.skipBright+.12)/.12)}
    if(opts.skipDark&&l<opts.skipDark)w*=Math.max(0,l/opts.skipDark);
    let nr,ng,nb;
    if(mode==='multiply'){nr=r*cr/255;ng=g*cg/255;nb=b*cb/255}
    else if(mode==='screen'){nr=255-(255-r)*(255-cr)/255;ng=255-(255-g)*(255-cg)/255;nb=255-(255-b)*(255-cb)/255}
    else { // colour with relative luminance (lipstick, polish)
      const ref=opts.ref||150,k=Math.pow(l/ref,opts.contrast||1)*(opts.lift||1);
      nr=cr*k;ng=cg*k;nb=cb*k;
      if(opts.gloss&&l>opts.gloss){const t=Math.min(1,(l-opts.gloss)/(255-opts.gloss));nr+=(255-nr)*t*.8;ng+=(255-ng)*t*.8;nb+=(255-nb)*t*.8}
    }
    d[i]=r+(Math.min(255,nr)-r)*w;d[i+1]=g+(Math.min(255,ng)-g)*w;d[i+2]=b+(Math.min(255,nb)-b)*w;
  }
}
/* Bodysuit cover-up: inside an outfit's `skin` regions, lilac bodysuit pixels (and a 2px fringe)
   are inpainted with the skin on either side of each run (dir 'h': left/right neighbours, 'v': the
   pixels below/above), so straps or a shorts hem that would peek out read as bare skin. Only these
   regions are touched and the outfit is always drawn over the result. */
function coverBodysuit(d,w,h,shapes,info){
  const lilac=i=>{const r=d[i],g=d[i+1],b=d[i+2];if(d[i+3]<40)return 0;return Math.min(1,Math.max(0,(b/(r||1)-.6)/.24))*(g<b+6?1:0)};
  for(const shape of shapes){
    const m=shapeMask(w,h,[shape],0),W=new Float32Array(w*h);
    for(let p=0;p<m.length;p++)if(m[p]>0)W[p]=lilac(p*4);
    // dilate by 2px so the soft strap edges are replaced too
    const D=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let dy=-2;dy<=2;dy++){const yy=y+dy;if(yy<0||yy>=h)continue;for(let dx=-2;dx<=2;dx++){const xx=x+dx;if(xx<0||xx>=w)continue;const q=W[yy*w+xx];if(q>v)v=q}}if(v>.04&&m[y*w+x]>0)D[y*w+x]=Math.min(1,v*1.4)}
    const vert=shape.dir==='v',outer=vert?w:h,inner=vert?h:w,idx=(o,i)=>vert?i*w+o:o*w+i;
    const ok=p=>p>=0&&d[p*4+3]>200&&W[p]===0&&lilac(p*4)<.05;
    const fallback=(p)=>{const i=p*4,l=luma(d[i],d[i+1],d[i+2]),k=1+(l-info.suitLuma)/info.suitLuma*1.9;return info.skin.map(c=>c*k)};
    for(let o=0;o<outer;o++){
      for(let i=0;i<inner;i++){
        if(!D[idx(o,i)])continue;
        let j=i;while(j<inner&&D[idx(o,j)])j++;
        const a=i-2>=0?idx(o,i-2):-1,b=j+1<inner?idx(o,j+1):-1;
        const ca=ok(a)?[d[a*4],d[a*4+1],d[a*4+2]]:null,cb=ok(b)?[d[b*4],d[b*4+1],d[b*4+2]]:null;
        for(let t=i;t<j;t++){
          const p=idx(o,t),q=p*4,f=(t-i+1)/(j-i+1);
          const c=ca&&cb?ca.map((v,k)=>v+(cb[k]-v)*f):ca||cb||fallback(p);
          const wgt=D[p];d[q]+=(c[0]-d[q])*wgt;d[q+1]+=(c[1]-d[q+1])*wgt;d[q+2]+=(c[2]-d[q+2])*wgt;
        }
        i=j;
      }
    }
  }
}
/* The bodysuit's lilac below doll y `y0` recoloured `color` (shading kept), so under a short cover-up it
   reads as the swim shorts the outfit comes with rather than as bare skin. */
function tintSuit(d,w,h,{color,y0=0},info){
  const [cr,cg,cb]=hexRgb(color),ref=info.suitLuma;
  for(let y=Math.max(0,y0|0);y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4;if(d[i+3]<40)continue;
    const r=d[i],g=d[i+1],b=d[i+2],wt=Math.min(1,Math.max(0,(b/(r||1)-.6)/.24))*(g<b+6?1:0);if(!wt)continue;
    const k=luma(r,g,b)/ref;
    d[i]=r+(Math.min(255,cr*k)-r)*wt;d[i+1]=g+(Math.min(255,cg*k)-g)*wt;d[i+2]=b+(Math.min(255,cb*k)-b)*wt;
  }
}
/* Bare thighs under short outfits (swimsuits, tutus, ponchos): the base doll's bodysuit ends in a hemmed
   short leg, which a skin repaint leaves as a flat band with a seam. Here rows y0..y1 (doll-local, from
   under the outfit to just below that hem) are redrawn from the thigh below the hem, mirrored about y1
   (so the shading continues smoothly) and stretched across each leg's width at that row: left and right
   of the centre line c (front, back), or the widest run (side views, where the near arm is kept). */
function bareThighs(d,w,h,{y0,y1,band=36},c,arm){
  const A=(x,y)=>d[(y*w+x)*4+3];
  let keep=null;
  if(arm){const m=makeCanvas(w,h),g=ctx2d(m);pathPoly(g,arm);g.fill();keep=g.getImageData(0,0,w,h).data}
  const runs=y=>{const r=[];let s=-1;for(let x=0;x<=w;x++){const on=x<w&&A(x,y)>100;if(on&&s<0)s=x;else if(!on&&s>=0){r.push([s,x]);s=-1}}return r};
  const legs=y=>{const r=runs(y);if(!r.length)return [];
    if(c==null){const b=r.reduce((p,q)=>q[1]-q[0]>p[1]-p[0]?q:p);return [b]}
    const L=r.filter(q=>q[0]<c),R=r.filter(q=>q[1]>c);if(!L.length||!R.length)return [];
    const l=L[L.length-1],rr=R[0];return [[l[0],Math.min(l[1],c)],[Math.max(rr[0],c),rr[1]]]};
  const src=new Uint8ClampedArray(d);
  for(let y=Math.max(0,y0|0);y<Math.min(h,y1|0);y++){
    const ys=Math.min(h-1,Math.round(y1+(y1-y)*band/(y1-y0)));
    const dl=legs(y),sl=legs(ys);if(dl.length!==sl.length)continue;
    dl.forEach(([a,b],i)=>{const [sa,sb]=sl[i];
      for(let x=a;x<b;x++){const o=(y*w+x)*4;if(keep&&keep[o+3]>0)continue;
        const xs=Math.min(w-1,Math.max(0,Math.round(sa+(x+.5-a)*(sb-sa)/(b-a)-.5))),q=(ys*w+xs)*4;
        if(!src[q+3])continue;d[o]=src[q];d[o+1]=src[q+1];d[o+2]=src[q+2]}});
  }
}
function bodyKey(shot,view){return [shot.doll,view,shot.outfit,shot.lips,shot.blush,shot.shadow,shot.nails,shot.shoes].join('|')}
/* Eyeshadow, blush and lipstick on pixels d (w x h) whose coordinates match `face` (the doll view's
   landmarks, see shiftFace). puppet.js runs it again on drawn expression heads: opts.lipsMask (Float32
   per pixel) replaces the lips polygon there, opts.eyesClosed (0..1) puts the shadow on the closed lid. */
function applyFaceMakeup(d,w,h,shot,face,opts={}){
  const opt=(list,id)=>CATALOG.makeup[list].find(o=>o.id===id);
  const shadow=opt('shadow',shot.shadow);
  if(shadow?.color&&face.lids){
    const m=shapeMask(w,h,face.lids,face.lidBlur||0),open=1-(opts.eyesClosed||0);
    if(face.eyes){const e=shapeMask(w,h,face.eyes.map(p=>({poly:p})),.6);for(let i=0;i<m.length;i++)m[i]=Math.max(0,m[i]-e[i]*1.2*open)}
    applyColor(d,m,hexRgb(shadow.color),shadow.strength||.5,'color',{ref:150,contrast:1,skipDark:60});
    if(shadow.shimmer)applyColor(d,m,hexRgb(shadow.shimmer),.22,'screen');
  }
  const blush=opt('blush',shot.blush);
  if(blush?.color&&face.cheeks)applyColor(d,shapeMask(w,h,face.cheeks.map(([x,y,rx,ry])=>({gradient:[x,y,rx,ry,1]}))),hexRgb(blush.color),blush.strength||.4,'multiply');
  const lips=opt('lips',shot.lips);
  if(lips?.color&&(face.lips||opts.lipsMask)){
    let m;
    if(opts.lipsMask)m=opts.lipsMask;
    else{
      m=shapeMask(w,h,[{poly:face.lips}],face.lipBlur||1.2);
      if(face.mouth){const inner=shapeMask(w,h,[{poly:face.mouth}],.8);for(let i=0;i<m.length;i++)m[i]=Math.max(0,m[i]-inner[i])}
    }
    applyColor(d,m,hexRgb(lips.color),lips.strength||.8,'color',{ref:face.lipRef||130,contrast:lips.contrast||1.1,gloss:lips.gloss,skipBright:.3,lift:lips.lift||1});
  }
}
/* A view's face landmarks moved by (dx, dy), for makeup on a crop of the base picture. */
function shiftFace(face,dx,dy){
  const P=p=>p.map(([x,y])=>[x+dx,y+dy]);
  return {...face,lids:face.lids&&face.lids.map(g=>({...g,gradient:[g.gradient[0]+dx,g.gradient[1]+dy,...g.gradient.slice(2)]})),
    eyes:face.eyes&&face.eyes.map(P),cheeks:face.cheeks&&face.cheeks.map(([x,y,...r])=>[x+dx,y+dy,...r]),lips:face.lips&&P(face.lips),mouth:face.mouth&&P(face.mouth)};
}
function bodyLayer(shot,view){
  const doll=shot.doll,info=CATALOG.dolls[doll];
  return memo(dollCaches.body,bodyKey(shot,view),async()=>{
    const dv=dollView(doll,view),base=await spriteCanvas(dv.art);
    const w=base.width,h=base.height,c=makeCanvas(w,h),g=ctx2d(c);g.drawImage(base,0,0);
    const im=g.getImageData(0,0,w,h),d=im.data;
    const outfitFit=catalogItem(shot.outfit)?.fit?.[doll]?.[view];
    if(outfitFit?.suit)tintSuit(d,w,h,outfitFit.suit,info);
    if(outfitFit?.skin?.length)coverBodysuit(d,w,h,outfitFit.skin,info);
    if(outfitFit?.thighs)bareThighs(d,w,h,outfitFit.thighs,view==='front'||view==='back'?outfitFit.thighs.c:null,dv.arm);
    applyFaceMakeup(d,w,h,shot,dv.face||{});
    const opt=(list,id)=>CATALOG.makeup[list].find(o=>o.id===id);
    const nails=opt('nails',shot.nails);
    if(nails?.color&&dv.nails){
      const shoe=catalogItem(shot.shoes),toes=!shoe||shoe.openToe;
      const shapes=dv.nails.fingers.concat(toes?dv.nails.toes:[]).map(e=>({ellipse:e}));
      if(shapes.length)applyColor(d,shapeMask(w,h,shapes,.7),hexRgb(nails.color),.9,'color',{ref:dv.nails.ref||200,contrast:.8,gloss:225,lift:1});
    }
    g.putImageData(im,0,0);
    return c;
  });
}
/* Face gems and glitter, drawn as small vector shapes on the face. */
function drawGem(g,shot,view='front'){
  const gem=CATALOG.makeup.gem.find(o=>o.id===shot.gem),face=dollView(shot.doll,view).face;
  if(!gem||gem.id==='none'||!face?.gemAt)return;
  const u=face.unit; // size unit, about an eye width
  g.save();
  if(gem.id==='heart'){
    const [x,y]=face.gemAt;g.translate(x,y);g.rotate(.18);g.scale(u*.2,u*.2);
    g.shadowColor='rgba(117,61,90,.55)';g.shadowBlur=1.5;g.fillStyle='#ec4f86';
    g.beginPath();g.moveTo(0,.42);g.bezierCurveTo(-1.05,-.2,-.42,-.9,0,-.33);g.bezierCurveTo(.42,-.9,1.05,-.2,0,.42);g.fill();
    g.shadowColor='transparent';g.fillStyle='rgba(255,255,255,.7)';g.beginPath();g.ellipse(-.33,-.28,.13,.08,-.6,0,Math.PI*2);g.fill();
  }else if(gem.id==='star-freckles'){
    const [x,y]=face.gemAt;g.translate(x,y);g.scale(u*.11,u*.11);g.fillStyle='#ffd77a';g.shadowColor='rgba(117,61,90,.5)';g.shadowBlur=1;
    for(const [dx,dy,sz] of [[-1.3,.2,.75],[0,-.5,1],[1.25,.35,.6],[.3,1.15,.5]]){
      g.beginPath();for(let i=0;i<8;i++){const a=-Math.PI/2+i*Math.PI/4,r=i%2?sz*.35:sz;g.lineTo(dx+Math.cos(a)*r,dy+Math.sin(a)*r)}g.closePath();g.fill();
    }
  }else if(gem.id==='glitter'){
    let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(const [cx,cy] of face.cheekbones){
      for(let i=0;i<26;i++){
        const a=rnd()*Math.PI*2,r=Math.sqrt(rnd()),x=cx+Math.cos(a)*r*u*.55,y=cy+Math.sin(a)*r*u*.28,sz=u*(.018+rnd()*.03);
        g.fillStyle=['rgba(255,250,235,.95)','rgba(255,214,120,.9)','rgba(255,170,215,.9)','rgba(200,230,255,.9)'][i%4];
        g.beginPath();g.arc(x,y,sz,0,Math.PI*2);g.fill();
        if(i%6===0){g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=sz*.45;g.beginPath();g.moveTo(x-sz*2.6,y);g.lineTo(x+sz*2.6,y);g.moveTo(x,y-sz*2.6);g.lineTo(x,y+sz*2.6);g.stroke()}
      }
    }
  }else if(gem.id==='crystals'){
    for(const [x,y,r] of face.crystals){
      const gr=g.createRadialGradient(x-r*.3,y-r*.3,r*.1,x,y,r);gr.addColorStop(0,'#ffffff');gr.addColorStop(.5,'#cdeaff');gr.addColorStop(1,'#8fb4e6');
      g.fillStyle=gr;g.shadowColor='rgba(80,60,110,.45)';g.shadowBlur=1;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
    }
  }else if(gem.id==='butterfly'){
    const [x,y]=face.gemAt;g.translate(x,y);g.rotate(-.25);g.scale(u*.16,u*.16);
    g.shadowColor='rgba(117,61,90,.5)';g.shadowBlur=1;
    for(const sx of [-1,1]){g.fillStyle='#b67ff0';g.beginPath();g.ellipse(sx*.55,-.3,.55,.45,sx*.5,0,Math.PI*2);g.fill();g.fillStyle='#f39ad0';g.beginPath();g.ellipse(sx*.42,.38,.38,.3,-sx*.4,0,Math.PI*2);g.fill()}
    g.fillStyle='#6b3a7a';g.beginPath();g.ellipse(0,0,.1,.55,0,0,Math.PI*2);g.fill();
  }
  g.restore();
}

/* ---------- composition ---------- */
function lookKey(shot,view='front'){
  return [shot.doll,view,shot.outfit,shot.outfitTint,shot.shoes,shot.shoesTint,shot.hair,shot.hairColor,shot.earrings,shot.earringsTint,shot.necklace,shot.clip,shot.lips,shot.blush,shot.shadow,shot.gem,shot.nails,
    shot.hat,shot.glasses,shot.bag,shot.toy].join('|');
}
/* ---------- accessories (catalog.js ACC, art/fit_acc.py) ----------
   accLayer: the item's sprite at its fit as a doll-canvas layer; `lens` (glasses, side views) = only
   the frame front, which is drawn again over the hair. Undefined when the item has no fit for the view
   (glasses from behind). */
function accLayer(doll,view,id,part='all'){
  const item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit)return Promise.resolve(null);
  return memo(dollCaches.layer,['acc',doll,view,id,part].join('|'),async()=>{
    const src=await itemSprite(item,view,'main');
    const [c,g]=dollLayer(doll,view);
    if(part==='lens'){g.beginPath();shapePathInto(g,{poly:fit.lens});g.clip()}
    drawFitted(g,src,fit);
    return c;
  });
}
/* Hair under a hat: the style's layers with everything above the hat's lower edge (fit.cut) erased,
   so buns, ponytails and volume never poke through the crown (the hat covers the rest). Before the cut
   the volume beside the head is pressed in under the hat (hatSqueeze), so the lengths come out from
   under its edge instead of standing out beside it in tufts. tune = the hat fit's hairTune[style]
   ({off, R, inset}). */
function hatHair(doll,view,hair,shot,cut,hat,body,tune={}){
  return memo(dollCaches.layer,['hathair',doll,view,shot.hair,shot.hairColor,shot.hat].join('|'),async()=>{
    const out={};
    for(const k of ['back','front','shade']){
      if(!hair[k]){out[k]=hair[k];continue}
      const c=makeCanvas(hair[k].width,hair[k].height),g=c.getContext('2d');g.drawImage(hair[k],0,0);out[k]=c;
    }
    // Little Me's bonnet and beanie sit low over her short styles and were drawn for them: unchanged
    if(hat&&body&&!(tune.off??doll==='little'))hatSqueeze([out.back,out.front,out.shade].filter(Boolean),hat,body,dollView(doll,view).origin,{R:doll==='little'?62:54,...tune});
    for(const k of ['back','front','shade'])if(out[k])eraseShapes(doll,view,out[k],[{poly:cut,feather:1.5}]);
    return out;
  });
}
/* Press the hair's volume in under a hat, row by row (doll-canvas layers, changed in place). On each
   side of the head the hair's outer edge is moved in to the hat's own edge (a little inside it) on every
   row the hat spans down to its widest point there (where the hair comes out from under it); below
   that the edge eases back out to the style's own over R px. Only the hair outside the bald head's
   silhouette moves (remapped linearly between its outer edge and the head), so the face, bangs and the
   hair lying on the head are untouched; nothing moves where the hair is already inside the target.
   Hair above the hat's top is removed. */
function hatSqueeze(layers,hat,body,[ox,oy],{R=54,inset=3}={}){
  const W=layers[0].width,H=layers[0].height;
  const alpha=c=>ctx2d(c).getImageData(0,0,c.width,c.height).data;
  const ha=alpha(hat),ba=alpha(body),BW=body.width,BH=body.height;
  const datas=layers.map(c=>{const g=ctx2d(c);return {g,im:g.getImageData(0,0,W,H)}});
  // per row: hat, head and hair extents
  const HL=new Float32Array(H).fill(NaN),HR=new Float32Array(H).fill(NaN),BL=new Float32Array(H).fill(NaN),BR=new Float32Array(H).fill(NaN),hl=new Float32Array(H).fill(NaN),hr=new Float32Array(H).fill(NaN);
  let top=-1,bottom=-1;
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++)if(ha[(y*W+x)*4+3]>110){if(isNaN(HL[y]))HL[y]=x;HR[y]=x+1}
    if(!isNaN(HL[y])){if(top<0)top=y;bottom=y}
    const by=y-oy;if(by>=0&&by<BH)for(let x=0;x<BW;x++)if(ba[(by*BW+x)*4+3]>110){if(isNaN(BL[y]))BL[y]=x+ox;BR[y]=x+ox+1}
    for(const {im} of datas){const d=im.data;for(let x=0;x<W;x++)if(d[(y*W+x)*4+3]>40){if(isNaN(hl[y])||x<hl[y])hl[y]=x;break}
      for(let x=W-1;x>=0;x--)if(d[(y*W+x)*4+3]>40){if(isNaN(hr[y])||x+1>hr[y])hr[y]=x+1;break}}
  }
  if(top<0)return;
  // where the hair comes out on each side: the lowest row of the hat's widest part on that side
  let minL=Infinity,maxR=-Infinity;for(let y=top;y<=bottom;y++){if(HL[y]<minL)minL=HL[y];if(HR[y]>maxR)maxR=HR[y]}
  let eL=top,eR=top;for(let y=top;y<=bottom;y++){if(HL[y]<=minL+3)eL=y;if(HR[y]>=maxR-3)eR=y}
  const ease=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
  const win=(a,y,f)=>{let v=NaN;for(let j=y-4;j<=y+4;j++)if(j>=0&&j<H&&!isNaN(a[j]))v=isNaN(v)?a[j]:f(v,a[j]);return v};
  const tL=new Float32Array(H).fill(NaN),tR=new Float32Array(H).fill(NaN);
  // below the hat the edge also widens to cover the head (an ear) as soon as it can: at most `slope` px
  // a row, so it never steps out
  const slope=1.1;
  for(let y=top;y<H&&y<=Math.max(eL,eR)+R;y++){
    if(y<=eL)tL[y]=HL[y]+inset;else{const s=ease((y-eL)/R);let v=(HL[eL]+inset)*(1-s)+(isNaN(hl[y])?HL[eL]:hl[y])*s;
      if(!isNaN(BL[y]))v=Math.min(v,Math.max(BL[y]-1,tL[y-1]-slope));tL[y]=v}
    if(y<=eR)tR[y]=HR[y]-inset;else{const s=ease((y-eR)/R);let v=(HR[eR]-inset)*(1-s)+(isNaN(hr[y])?HR[eR]:hr[y])*s;
      if(!isNaN(BR[y]))v=Math.max(v,Math.min(BR[y]+1,tR[y-1]+slope));tR[y]=v}
  }
  for(const [t,e0] of [[tL,eL],[tR,eR]]){ // a smooth edge below the hat (the head's edge steps a pixel at a time)
    const c=Float32Array.from(t);
    for(let y=e0+1;y<H;y++){if(isNaN(c[y]))break;let s=0,n=0;for(let j=y-3;j<=y+3;j++)if(j>e0&&!isNaN(c[j])){s+=c[j];n++}t[y]=s/n}
  }
  // the hair's own edge, smoothed over a few rows (curls), where each row is read from
  const smooth=(a,f)=>{const m=Float32Array.from({length:H},(_,y)=>win(a,y,f)),o=new Float32Array(H).fill(NaN);
    for(let y=0;y<H;y++){let s=0,n=0;for(let j=y-3;j<=y+3;j++)if(j>=0&&j<H&&!isNaN(m[j])){s+=m[j];n++}if(n)o[y]=s/n}return o};
  const sL=smooth(hl,Math.min),sR=smooth(hr,Math.max);
  for(const {g,im} of datas){
    const d=im.data,row=new Uint8ClampedArray(W*4);
    for(let y=0;y<top;y++)for(let x=0;x<W;x++)d[(y*W+x)*4+3]=0; // nothing of the style above the hat
    for(let y=top;y<H;y++){
      if(isNaN(tL[y])&&isNaN(tR[y]))break;
      row.set(d.subarray(y*W*4,(y+1)*W*4));
      const cx=isNaN(HL[y])?(HL[Math.min(eL,eR)]+HR[Math.min(eL,eR)])/2:(HL[y]+HR[y])/2;
      const aL=isNaN(BL[y])?cx:BL[y],aR=isNaN(BR[y])?cx:BR[y];
      for(const side of [-1,1]){
        const t=side<0?tL[y]:tR[y],e=side<0?sL[y]:sR[y];
        if(isNaN(t)||isNaN(e))continue;
        if(side<0?t<=e+.5:t>=e-.5)continue; // already inside
        // the hair between its edge and the head moves; where the head (an ear) reaches out past the
        // target, the hair lies inside the target and the ear shows beside it
        const a=side<0?Math.max(aL,t+6):Math.min(aR,t-6);
        const x0=side<0?0:Math.floor(a),x1=side<0?Math.ceil(a):W;
        for(let x=x0;x<x1;x++){
          const o=(y*W+x)*4,X=x+.5,cov=Math.min(1,Math.max(0,side<0?X+.5-t:t-(X-.5))); // antialiased edge
          if(!cov){d[o+3]=0;continue}
          const sx=e+(X-t)*(a-e)/(a-t)-.5,xi=Math.floor(sx),f=sx-xi;
          let r=0,gg=0,b=0,al=0;
          for(const [px,w] of [[xi,1-f],[xi+1,f]]){if(px<0||px>=W||!w)continue;const i=px*4,A=row[i+3]*w;r+=row[i]*A;gg+=row[i+1]*A;b+=row[i+2]*A;al+=A}
          if(al<.5){d[o+3]=0;continue}
          d[o]=r/al;d[o+1]=gg/al;d[o+2]=b/al;d[o+3]=al*cov;
        }
      }
    }
    g.putImageData(im,0,0);
  }
}
/* Something she holds: the sprite, then her fingers (fit.grip) redrawn over its handle from the body
   picture (front, back) or the near arm (side views, so the thigh behind the hand is not). */
function heldLayer(shot,view,id,bodyPic,arm){
  const doll=shot.doll,item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit)return Promise.resolve(null);
  return memo(dollCaches.layer,['held',bodyKey(shot,view),id].join('|'),async()=>{
    const src=await itemSprite(item,view,'main');
    const [c,g]=dollLayer(doll,view);
    drawFitted(g,src,fit);
    if(fit.grip){g.save();g.beginPath();shapePathInto(g,{poly:fit.grip});g.clip();
      if(arm){g.setTransform(1,0,0,1,0,0);g.drawImage(arm,0,0)}else g.drawImage(bodyPic,0,0);g.restore()}
    return c;
  });
}
/* composeDoll(shot, view) resolves to a DOLL_CANVAS sized transparent canvas of the dressed doll seen
   from `view` (one of CATALOG.views; anything else means 'front'). `shot` is a look (see readLook in
   catalog.js) plus `doll`. The result is cached by look and view; treat it as read-only. An outfit is
   always drawn: a look without a valid outfit falls back to the default. Every view keeps the feet on
   DOLL_CANVAS.baseline and the body centred on the same x, so turning does not move the doll.
   Layer order: far clip, hair back, outfit back, shoes back, body (+gem), shoes, outfit, near arm
   (side views), sleeves over the arm, necklace, earrings under hair, hair front, earrings, clip. */
function composeDoll(raw,view='front'){
  if(!CATALOG.views.includes(view))view='front';
  const shot=normalShot(raw);
  return memo(dollCaches.doll,lookKey(shot,view),async()=>{
    const {ops}=await dollOps(shot,view);
    const c=makeCanvas(DOLL_CANVAS.width,DOLL_CANVAS.height),g=c.getContext('2d');
    g.imageSmoothingQuality='high';
    for(const op of ops)op.draw(g);
    return c;
  });
}
function normalShot(raw){const doll=raw.doll==='little'?'little':'adult';return {...readLook(raw,doll),doll}}
/* The dressed doll as an ordered list of draw operations; composeDoll() runs them in order on one
   canvas, composeDollLayers() runs each on its own canvas. op = {kind, draw(g), layer?} where `layer`
   (when set) is a DOLL_CANVAS sized canvas the op draws unchanged at 0,0. Kinds: clipBehind, hairBack,
   outfitBack, shoesBack, body, gem, shoesFront, outfit, pack (backpack), arm, over, held (a bag or
   toy in her hand), necklace, earrings, studs, glassesUnder (side views: the whole glasses, under the
   hair), shade (hair contact shadow, drawn source-atop), hairFront, clip, charm, glasses (the frame),
   hat. */
async function dollOps(shot,view){
  const doll=shot.doll,dv=dollView(doll,view),[ox,oy]=dv.origin;
  const hairFit=catalogItem(shot.hair).fit[doll][view];
  const earItem=catalogItem(shot.earrings),clipItem=catalogItem(shot.clip);
  let [body,outfit,shoes,hair,necklace,earrings,clipLayer]=await Promise.all([
    bodyLayer(shot,view),outfitLayer(doll,view,shot.outfit,shot.outfitTint),
    shot.shoes==='none'?null:shoeLayers(doll,view,shot.shoes,shot.shoesTint),
    hairLayers(doll,view,shot.hair,shot.hairColor),
    shot.necklace==='none'?null:spriteItemLayer(doll,view,shot.necklace),
    !earItem||earItem.stud||(hairFit.earsUnder&&view==='front')?null:spriteItemLayer(doll,view,shot.earrings,shot.earringsTint), // ears covered (front): no earrings at all
    !clipItem||clipItem.proc||hairFit.clip?.hide?null:clipSprite(shot,view)
  ]);
  const arm=sideView(view)?await armLayer(shot,view,body):null;
  const bodyPic=shoes?fitFeet(body,shoes,catalogItem(shot.shoes).fit[doll][view],dv,doll):body;
  const ops=[],put=(kind,layer)=>ops.push({kind,layer,draw:g=>g.drawImage(layer,0,0)});
  // accessories (none on every look saved before them, so those draw exactly as before)
  const acc=f=>shot[f]&&shot[f]!=='none'?catalogItem(shot[f]):null;
  const hatItem=acc('hat'),hatFit=hatItem?.fit?.[doll]?.[view],glassItem=acc('glasses'),bagItem=acc('bag')||acc('toy');
  const [hat,glasses,lens,held]=await Promise.all([
    hatFit?accLayer(doll,view,hatItem.id):null,
    glassItem?accLayer(doll,view,glassItem.id):null,
    glassItem?.fit?.[doll]?.[view]?.lens?accLayer(doll,view,glassItem.id,'lens'):null,
    bagItem?(bagItem.kind==='pack'?accLayer(doll,view,bagItem.id):heldLayer(shot,view,bagItem.id,bodyPic,arm)):null]);
  if(hatFit?.cut)hair=await hatHair(doll,view,hair,shot,hatFit.cut,hat,body,hatFit.hairTune?.[shot.hair]);
  const clipAt={...hairFit.clip,...(hatFit&&hatFit.clip===false?{hide:true}:{})},clipBehind=!!clipAt.behind;
  const proc=clipItem?.proc&&!clipAt.hide?clipItem.proc:0;
  const drawProc=g=>{g.save();g.translate(ox,oy);drawCharmView(g,proc,clipAt,dv,view);g.restore()};
  const stud=earItem?.stud&&dv.face?.lobes&&!(hairFit.earsUnder&&view==='front')?earItem.stud:null;
  const drawStuds=g=>{g.save();g.translate(ox,oy);for(const [x,y] of dv.face.lobes)drawStud(g,view==='back'?'clutch':stud,x,y+dv.face.unit*(view==='back'?.02:.06),dv.face.unit*(view==='back'?.09:.15));g.restore()};
  // back view: earrings sit under the hair, so only show where the style leaves the ears free
  const earsUnder=!!hairFit.earsUnder||view==='back';
  const clips=kind=>{if(clipLayer)put(kind,clipLayer);if(proc)ops.push({kind:'charm',behind:kind==='clipBehind',draw:drawProc})};
  if(clipBehind&&!clipAt.hide)clips('clipBehind');
  if(hair.back)put('hairBack',hair.back);
  if(outfit.back)put('outfitBack',outfit.back);
  if(shoes)put('shoesBack',shoes.back);
  ops.push({kind:'body',draw:g=>g.drawImage(bodyPic,ox,oy)});
  ops.push({kind:'gem',draw:g=>{g.save();g.translate(ox,oy);drawGem(g,shot,view);g.restore()}});
  const outfitFit=catalogItem(shot.outfit).fit[doll][view];
  if(shoes&&!outfitFit.shoesOver)put('shoesFront',shoes.front);
  put('outfit',outfit.front);
  if(shoes&&outfitFit.shoesOver)put('shoesFront',shoes.front);
  // a backpack: its straps over the outfit, under the near arm in side views
  if(held&&bagItem.kind==='pack')put('pack',held);
  if(arm&&outfitFit.arm!=='hidden'){
    if(outfitFit.armClip?.some(s=>s.feather))put('arm',softClip(arm,ox,oy,outfitFit.armClip));
    else if(outfitFit.armClip)ops.push({kind:'arm',draw:g=>{g.save();g.translate(ox,oy);g.beginPath();outfitFit.armClip.forEach(s=>shapePathInto(g,s));g.setTransform(1,0,0,1,0,0);g.clip();g.drawImage(arm,0,0);g.restore()}});
    else put('arm',arm);
  }
  if(outfit.over)put('over',outfit.over);
  // a bag or toy in her hand, her fingers over its handle
  if(held&&bagItem.kind!=='pack')put('held',held);
  if(necklace)put('necklace',necklace);
  const ears=()=>{if(earrings)put('earrings',earrings);if(stud)ops.push({kind:'studs',draw:drawStuds})};
  if(earsUnder)ears();
  // glasses: in side views the arms run under the hair to the ear and only the frame front is drawn
  // again over it; from the front the whole frame sits on the face, over the hair beside it
  if(glasses&&lens)put('glassesUnder',glasses);
  if(hair.shade)ops.push({kind:'shade',draw:g=>{g.save();g.globalCompositeOperation='source-atop';g.drawImage(hair.shade,0,0);g.restore()}});
  put('hairFront',hair.front);
  if(!earsUnder)ears();
  if(!clipBehind&&!clipAt.hide)clips('clip');
  if(glasses)put('glasses',lens||glasses);
  if(hat)put('hat',hat);
  return {ops,doll,view,origin:[ox,oy],shoes};
}
/* The same dressed doll as separate aligned layers (puppet.js): resolves to {doll, view, origin, layers}
   with layers = [{kind, canvas}] in drawing order, every canvas DOLL_CANVAS sized and in the same
   coordinates, so drawing them in order with source-over gives composeDoll's picture (the hair
   contact shadow is returned already clipped to what is under it). Side views also give the far shoe
   alone (farShoe) and the near shoe alone (nearShoe), so the two feet can move apart. Nothing here is
   cached: the caller keeps what it needs. Canvases that are shared renderer cache entries are
   read-only. */
async function composeDollLayers(raw,view='front'){
  if(!CATALOG.views.includes(view))view='front';
  const shot=normalShot(raw);
  const {ops,doll,origin,shoes}=await dollOps(shot,view);
  const acc=makeCanvas(DOLL_CANVAS.width,DOLL_CANVAS.height),ag=acc.getContext('2d');ag.imageSmoothingQuality='high';
  const layers=[];
  for(const op of ops){
    let canvas=op.layer;
    if(op.kind==='shade'){ // source-atop: keep only what lies over the layers drawn so far
      canvas=makeCanvas(acc.width,acc.height);const g=canvas.getContext('2d');
      op.draw(g);g.globalCompositeOperation='destination-in';g.drawImage(acc,0,0);
    }else if(!canvas){canvas=makeCanvas(acc.width,acc.height);const g=canvas.getContext('2d');g.imageSmoothingQuality='high';op.draw(g)}
    layers.push({kind:op.kind,canvas,behind:!!op.behind});
    op.draw(ag);
  }
  const out={doll,view,origin,layers,shot};
  if(shoes&&sideView(view)){const parts=await shoeSideParts(doll,view,shot.shoes,shot.shoesTint);if(parts){out.farShoe=parts.far;out.nearShoe=parts.near}}
  return out;
}
/* Side views: the near shoe's back layer without the far shoe, and the far shoe alone (see shoeLayers). */
const shoeSideCache=lruCache(4);
function shoeSideParts(doll,view,id,tintId){
  const item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit?.near||!fit.far)return Promise.resolve(null);
  return memo(shoeSideCache,[doll,view,id,tintId].join('|'),async()=>{
    const src=await itemSprite(item,view,'main',tintId),o=dollView(doll,view).origin;
    const draw=(f,shade)=>{
      const t=makeCanvas(DOLL_CANVAS.width,DOLL_CANVAS.height),tg=t.getContext('2d');tg.imageSmoothingQuality='high';tg.translate(...o);
      const w=f.w,h=f.h??src.height*w/src.width;tg.translate(f.x,f.y);if(f.rot)tg.rotate(f.rot*Math.PI/180);tg.drawImage(src,0,0,w,h);
      if(shade!==undefined){tg.setTransform(1,0,0,1,0,0);tg.globalCompositeOperation='source-atop';tg.fillStyle=`rgba(30,12,30,${shade})`;tg.fillRect(0,0,t.width,t.height)}
      return t;
    };
    return {near:draw(fit.near),far:draw({...fit.near,x:fit.near.x+(fit.far.dx||0),y:fit.near.y+(fit.far.dy||0)},fit.far.shade??.3),farOffset:[fit.far.dx||0,fit.far.dy||0]};
  });
}
/* Keep only the parts of a layer inside doll-local shapes; a shape's `feather` (px) softens its edge
   (offset-shadow blur, so no ctx.filter), letting the near arm fade in under a sleeve hem. */
function softClip(src,ox,oy,shapes){
  const c=makeCanvas(src.width,src.height),g=c.getContext('2d');
  for(const s of shapes){
    g.save();g.fillStyle='#000';
    if(s.feather){g.shadowColor='#000';g.shadowBlur=s.feather*2;g.shadowOffsetX=4000;g.setTransform(1,0,0,1,ox-4000,oy)}else g.setTransform(1,0,0,1,ox,oy);
    g.beginPath();shapePathInto(g,s);g.fill();g.restore();
  }
  g.globalCompositeOperation='source-in';g.drawImage(src,0,0);
  return c;
}
/* The bare foot inside a shoe (doll-local fit.foot / fit.trim of the shoe's view fit; the trim defaults
   to the doll's footTop, just under the ankle, in every view):
   - foot = {top, bed:[[x,y],...], sx, cx, ramp}: below doll y `top` every column of the body is
     stretched vertically so the sole (the lowest opaque pixel of the column) lands on the shoe's
     footbed line `bed` (piecewise linear in x), which raises the heel onto a heeled insole and puts the
     toes on a platform; sx scales the foot horizontally about x = cx (fading in over `ramp` px below
     top) so it is as long as the shoe. Toe polish moves with it (it is painted before this).
   - trim = doll y below which body pixels outside the shoe's silhouette (alpha > trimAlpha) are
     removed, so no heel, toe or calf pokes out of the shoe; above it the leg is untouched. The open
     parts of a sandal are kept through the shoe layers' mask (shoe silhouette plus `keep` polygons). */
function fitFeet(body,shoes,fit,dv,doll){
  const foot=fit?.foot,trimY=fit?.trim??dollView(doll,'left').footTop;
  if(!foot&&trimY===undefined)return body;
  const [ox,oy]=dv.origin,W=body.width,H=body.height;
  const c=makeCanvas(W,H),g=ctx2d(c);g.drawImage(body,0,0);
  const im=g.getImageData(0,0,W,H),d=im.data;
  if(foot){
    const src=new Uint8ClampedArray(d),top=Math.max(0,Math.floor(foot.top)),ramp=foot.ramp??30,sx=foot.sx??1,cx=foot.cx??W/2;
    const sole=new Float32Array(W).fill(-1);
    for(let x=0;x<W;x++)for(let y=H-1;y>=top;y--)if(src[(y*W+x)*4+3]>128){sole[x]=y+.5;break}
    // a level bed (front and back views) lifts the whole foot by one row map from its lowest point, so the
    // leg keeps its outline; a sloped one (side views) is matched column by column
    if(foot.bed.every(p=>p[1]===foot.bed[0][1])){const lo=Math.max(...sole);if(lo>top)sole.fill(lo)}
    const bed=foot.bed,bedAt=x=>{if(x<=bed[0][0])return bed[0][1];for(let i=1;i<bed.length;i++)if(x<=bed[i][0]){const [x0,y0]=bed[i-1],[x1,y1]=bed[i];return y0+(y1-y0)*(x-x0)/(x1-x0)}return bed[bed.length-1][1]};
    const at=(x,y,j)=>x<0||y<0||x>=W||y>=H?0:src[(y*W+x)*4+j];
    for(let y=top;y<H;y++){
      const k=1+(sx-1)*Math.min(1,(y-top)/ramp);
      for(let x=0;x<W;x++){
        const o=(y*W+x)*4,xs=cx+(x+.5-cx)/k-.5,xi=Math.round(Math.min(W-1,Math.max(0,xs)));
        const yb=sole[xi],yt=bedAt(x+.5);
        let ys=-1;
        if(yb>top&&yt>top)ys=yb<yt-1?y:top+(y+.5-top)*(yb-top)/(yt-top)-.5; // a column that ends above the bed (the calf's edge, not the foot) stays
        if(ys<0||ys>H){d[o+3]=0;continue}
        // bilinear, premultiplied
        const x0=Math.floor(xs),y0=Math.floor(ys),fx=xs-x0,fy=ys-y0;let r=0,gg=0,b=0,a=0;
        for(let j=0;j<4;j++){const px=x0+(j&1),py=y0+(j>>1),w=((j&1)?fx:1-fx)*((j>>1)?fy:1-fy),al=at(px,py,3)*w;
          r+=at(px,py,0)*al;gg+=at(px,py,1)*al;b+=at(px,py,2)*al;a+=al}
        if(a<.5){d[o+3]=0;continue}
        d[o]=r/a;d[o+1]=gg/a;d[o+2]=b/a;d[o+3]=a;
      }
    }
  }
  if(trimY!==undefined){
    const mk=makeCanvas((shoes.mask||shoes.back).width,(shoes.mask||shoes.back).height),mkg=ctx2d(mk);mkg.drawImage(shoes.mask||shoes.back,0,0);
    const SW=mk.width,sd=mkg.getImageData(0,0,SW,mk.height).data,lim=fit?.trimAlpha??60;
    for(let y=Math.max(0,Math.floor(trimY));y<H;y++)for(let x=0;x<W;x++){
      const X=Math.round(x+ox),Y=Math.round(y+oy),o=(y*W+x)*4;if(!d[o+3])continue;
      const sa=X<0||Y<0||X>=SW||Y>=mk.height?0:sd[(Y*SW+X)*4+3];
      if(sa<lim)d[o+3]=0;else if(sa<255)d[o+3]=d[o+3]*Math.min(1,(sa-lim)/(255-lim)*1.6);
    }
  }
  g.putImageData(im,0,0);return c;
}
/* Procedural clips: flat charms. Side views squash them (seen edge-on, at.squash), the back view
   shows the clip's underside: the charm shaded with a small gold clasp across it. */
function drawCharmView(g,proc,at,dv,view){
  const size=dv.face.unit*.92*(at.scale||1),rot=((at.rot||0)-11)*Math.PI/180;
  if(view==='front'){drawCharm(g,proc,at.x,at.y,size,rot);return}
  g.save();g.translate(at.x,at.y);g.rotate((at.rot||0)*Math.PI/180);g.scale(at.squash??(sideView(view)?.42:1),1);
  drawCharm(g,proc,0,0,size,-11*Math.PI/180);
  if(view==='back'){
    g.globalCompositeOperation='source-atop';g.fillStyle='rgba(60,25,50,.28)';g.fillRect(-size,-size,size*2,size*2);g.globalCompositeOperation='source-over';
    const gr=g.createLinearGradient(0,-size*.12,0,size*.12);gr.addColorStop(0,'#fff0b0');gr.addColorStop(.5,'#d9a640');gr.addColorStop(1,'#9b6a1c');
    g.fillStyle=gr;g.beginPath();g.roundRect?g.roundRect(-size*.55,-size*.1,size*1.1,size*.2,size*.1):g.rect(-size*.55,-size*.1,size*1.1,size*.2);g.fill();
  }
  g.restore();
}
/* Hair clips sit where the hair style says (hair fit .clip = {x, y, rot, scale, flip, behind, hide}). */
function clipSprite(shot,view){
  const doll=shot.doll,item=catalogItem(shot.clip),at=catalogItem(shot.hair).fit[doll][view].clip;
  return memo(dollCaches.layer,['clip',doll,view,shot.clip,shot.hair].join('|'),async()=>{
    const src=await itemSprite(item,view,'main');
    const [c,g]=dollLayer(doll,view);
    const size=item.size[doll]*(item.viewSize?.[view]??1);
    const w=size*(at.scale||1),h=src.height*w/src.width,[ax,ay]=item.anchors?.[view]||item.anchor||[.5,.5];
    g.save();g.translate(at.x,at.y);g.rotate((at.rot||0)*Math.PI/180);if(at.flip)g.scale(-1,1);g.drawImage(src,-ax*w,-ay*h,w,h);
    if(at.behind){g.globalCompositeOperation='source-atop';g.fillStyle='rgba(40,15,35,.25)';g.fillRect(-ax*w,-ay*h,w,h)}
    g.restore();
    return c;
  });
}
/* Visible bounds of the doll in DOLL_CANVAS space (for framing). */
function dollFrame(doll){return CATALOG.dolls[doll].frame}

/* ---------- backdrops and portrait ---------- */
function studioBackdrop(c,x,y,w,h){
  c.save();c.beginPath();c.rect(x,y,w,h);c.clip();
  const bg=c.createLinearGradient(x,y,x,y+h);bg.addColorStop(0,'#f6c4e6');bg.addColorStop(.5,'#e5a9e0');bg.addColorStop(1,'#c88fd8');
  c.fillStyle=bg;c.fillRect(x,y,w,h);
  // soft spotlight
  const sp=c.createRadialGradient(x+w*.5,y+h*.38,0,x+w*.5,y+h*.38,w*.75);sp.addColorStop(0,'rgba(255,240,250,.75)');sp.addColorStop(.6,'rgba(255,220,245,.18)');sp.addColorStop(1,'rgba(255,220,245,0)');
  c.fillStyle=sp;c.fillRect(x,y,w,h);
  // sweeping light arcs
  c.lineWidth=w*.012;
  for(const [r,a] of [[.95,.22],[1.25,.16],[1.6,.1]]){c.strokeStyle=`rgba(255,255,255,${a})`;c.beginPath();c.arc(x-w*.25,y+h*.95,w*r,-Math.PI*.55,-Math.PI*.05);c.stroke()}
  // sparkles
  let seed=11;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=0;i<34;i++){
    const sx=x+rnd()*w,sy=y+rnd()*h*.78,r=w*(.004+rnd()*.012),a=.35+rnd()*.6;
    c.fillStyle=`rgba(255,255,255,${a})`;c.beginPath();
    c.moveTo(sx,sy-r*2.6);c.quadraticCurveTo(sx,sy,sx+r*2.6,sy);c.quadraticCurveTo(sx,sy,sx,sy+r*2.6);c.quadraticCurveTo(sx,sy,sx-r*2.6,sy);c.quadraticCurveTo(sx,sy,sx,sy-r*2.6);c.fill();
    if(i%3===0){c.fillStyle=`rgba(255,255,255,${a*.5})`;c.beginPath();c.arc(sx,sy,r*.9,0,Math.PI*2);c.fill()}
  }
  // floor
  const fl=c.createLinearGradient(x,y+h*.78,x,y+h);fl.addColorStop(0,'rgba(196,120,200,0)');fl.addColorStop(1,'rgba(160,90,175,.45)');
  c.fillStyle=fl;c.fillRect(x,y+h*.78,w,h*.22);
  c.restore();
}
function drawPedestal(c,cx,top,rx){
  const ry=rx*.2,depth=rx*.16;
  c.save();
  c.fillStyle='rgba(90,40,90,.25)';c.beginPath();c.ellipse(cx,top+depth+ry*.6,rx*1.06,ry*1.15,0,0,Math.PI*2);c.fill();
  const side=c.createLinearGradient(cx-rx,0,cx+rx,0);side.addColorStop(0,'#c96fb7');side.addColorStop(.35,'#f3b6e3');side.addColorStop(.6,'#e894d4');side.addColorStop(1,'#b45fa6');
  c.fillStyle=side;c.beginPath();c.ellipse(cx,top+depth,rx,ry,0,0,Math.PI);c.lineTo(cx-rx,top);c.ellipse(cx,top,rx,ry,0,Math.PI,0,true);c.closePath();c.fill();
  const face=c.createRadialGradient(cx-rx*.25,top-ry*.4,rx*.05,cx,top,rx);face.addColorStop(0,'#fff0fb');face.addColorStop(.6,'#f7c4ea');face.addColorStop(1,'#e59ad6');
  c.fillStyle=face;c.beginPath();c.ellipse(cx,top,rx,ry,0,0,Math.PI*2);c.fill();
  c.strokeStyle='rgba(255,255,255,.85)';c.lineWidth=rx*.018;c.beginPath();c.ellipse(cx,top,rx*.97,ry*.9,0,Math.PI*1.05,Math.PI*1.95);c.stroke();
  c.strokeStyle='rgba(255,235,250,.6)';c.beginPath();c.ellipse(cx,top+depth*.55,rx*.995,ry,0,Math.PI*.15,Math.PI*.85);c.stroke();
  c.restore();
}
/* Display scale (portrait px per doll px at a 480 x 720 frame) and frame position. */
const portraitLayout={adult:{scale:.71,foot:.925},little:{scale:.6,foot:.915}};
/* Where paintPortrait puts things: canvas size, picture rect and the doll's DOLL_CANVAS rect. */
function portraitGeometry(shot,postcard=false){
  const w=postcard?640:480,h=postcard?860:720;
  const x=postcard?70:0,y=postcard?21:0,width=postcard?500:w,height=postcard?750:h;
  const lay=portraitLayout[shot.doll]||portraitLayout.adult;
  const k=lay.scale*width/480,footY=y+height*lay.foot;
  return {w,h,x,y,width,height,k,footY,doll:[x+width/2-DOLL_CANVAS.width/2*k,footY-DOLL_CANVAS.baseline*k,DOLL_CANVAS.width*k,DOLL_CANVAS.height*k]};
}
async function paintPortrait(canvas, shot, postcard=false, view='front') {
  const scenic=shot.backdrop>0,scene=scenic?districts[shot.backdrop-1]:null;
  const [doll,background]=await Promise.all([composeDoll(shot,view),scenic?asset('assets/scenes/'+scene.id+'.jpg'):null]);
  const geo=portraitGeometry(shot,postcard);
  canvas.width=geo.w;canvas.height=geo.h;
  const c=canvas.getContext('2d');
  portraitBackground(c,shot,postcard,geo,background);
  const {x,y,width,height}=geo;
  c.save();c.beginPath();c.rect(x,y,width,height);c.clip();
  c.imageSmoothingQuality='high';
  c.drawImage(doll,...geo.doll);
  c.restore();
  portraitExtras(c,shot,postcard,geo);
}
/* The portrait without the doll, as two canvases around it (puppet.js draws a moving doll between
   them): back = frame, scenery or studio backdrop; front = the postcard's sticker and caption (null
   for a plain portrait). Resolves to {back, front, geo}. */
async function paintPortraitParts(shot,postcard=false){
  const scenic=shot.backdrop>0,scene=scenic?districts[shot.backdrop-1]:null;
  const background=scenic?await asset('assets/scenes/'+scene.id+'.jpg'):null;
  const geo=portraitGeometry(shot,postcard);
  const back=makeCanvas(geo.w,geo.h);portraitBackground(back.getContext('2d'),shot,postcard,geo,background);
  let front=null;
  if(postcard){front=makeCanvas(geo.w,geo.h);portraitExtras(front.getContext('2d'),shot,postcard,geo)}
  return {back,front,geo};
}
function portraitBackground(c,shot,postcard,geo,background){
  const scenic=shot.backdrop>0;
  const {w,h,x,y,width,height,k,footY}=geo;
  if(postcard){
    const colors=frameColors[shot.frame]||frameColors[0];
    c.fillStyle=colors[0];c.fillRect(0,0,w,h);c.fillStyle=colors[1];
    for(let i=-h;i<w;i+=32) {
      if(shot.frame===2){c.fillRect(i,0,14,h);c.fillRect(0,i,w,14);}
      else {c.beginPath();c.moveTo(i,0);c.lineTo(i+14,0);c.lineTo(i+h+14,h);c.lineTo(i+h,h);c.fill();}
    }
    c.fillStyle='#fffefa';c.fillRect(x-9,y-9,width+18,h-y-19);
  }
  if(scenic){
    const cropWidth=background.height*width/height;
    const cropX=(background.width-cropWidth)*(districts[shot.backdrop-1]?.postcard??.52); // each place's own crop (quests.js)
    c.drawImage(background,cropX,0,cropWidth,background.height,x,y,width,height);
    c.fillStyle='rgba(70,42,58,.24)';c.beginPath();
    c.ellipse(x+width/2,footY+k*6,k*120,k*20,0,0,Math.PI*2);c.fill();
  }else{
    studioBackdrop(c,x,y,width,height);
    drawPedestal(c,x+width/2,footY+k*10,k*190);
    c.fillStyle='rgba(110,50,105,.28)';c.beginPath();c.ellipse(x+width/2,footY+k*8,k*110,k*16,0,0,Math.PI*2);c.fill();
  }
}
function portraitExtras(c,shot,postcard,geo){
  const {w,x,y,width,height}=geo;
  if(postcard){
    drawCharm(c,shot.sticker,x+width-16,y+height-30,60);
    // The caption is drawn in the current language; longer names shrink to fit the card.
    c.fillStyle='#7a305e';c.textAlign='center';
    fitText(c,itemName(shot.outfit),w/2,809,560,32,'italic bold {size}px Georgia');
    c.fillStyle='#965677';
    fitText(c,t('postcard.line',{doll:t('doll.caption.'+(shot.doll==='adult'?'adult':'little'))}),w/2,836,580,15,'{size}px Trebuchet MS, sans-serif');
  }
}
