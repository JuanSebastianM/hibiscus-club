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
/* Hair colour: luminance gradient map so dark hair can become light shades with highlights. */
function hairColorCanvas(src,color){
  if(!color||!color.stops)return src;
  const c=makeCanvas(src.width,src.height),g=ctx2d(c);g.drawImage(src,0,0);
  const im=g.getImageData(0,0,c.width,c.height),d=im.data,lut=hairLut(d,color);
  for(let i=0;i<d.length;i+=4){
    if(!d[i+3])continue;
    const v=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);
    d[i]=lut[v*3];d[i+1]=lut[v*3+1];d[i+2]=lut[v*3+2];
  }
  g.putImageData(im,0,0);return c;
}
/* The gradient-map lookup (luminance -> rgb) for a hair colour, stretched over the sprite pixels d. */
function hairLut(d,color){
  const hist=new Uint32Array(256);let n=0;
  for(let i=0;i<d.length;i+=4)if(d[i+3]>200){hist[Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2])]++;n++}
  const pct=p=>{let acc=0;for(let v=0;v<256;v++){acc+=hist[v];if(acc>=n*p)return v}return 255};
  const lo=pct(.02),hi=Math.max(lo+1,pct(.995));
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
  // side/back hair art is a lighter, warmer drawing: match it to the front sprite first
  const match=item.category==='hair'&&view!=='front'&&item.art.front?.main;
  const key=['spr',src,tint&&tint.id!=='original'?tint.id:'',hair?.stops?hair.id:'',match?'m':''].join('|');
  return memo(dollCaches.sprite,key,async()=>{
    let c=await spriteCanvas(src);
    if(match)c=await hairMatched(src,c,match);
    if(tint)c=tintCanvas(c,tint);
    if(hair)c=hairColorCanvas(c,hair);
    return c;
  });
}
/* Luminance histogram match + colour-by-luminance transfer from the front hair sprite, so a side or
   back drawing has the front's tones (default espresso) and every gradient-map colour lands the same. */
function hairProfile(c){
  const d=ctx2d(c).getImageData(0,0,c.width,c.height).data;
  const hist=new Float64Array(256),sum=new Float64Array(256*3);let n=0;
  for(let i=0;i<d.length;i+=4){if(d[i+3]<200)continue;const v=Math.round(luma(d[i],d[i+1],d[i+2]));hist[v]++;sum[v*3]+=d[i];sum[v*3+1]+=d[i+1];sum[v*3+2]+=d[i+2];n++}
  const cdf=new Float64Array(256);let acc=0;for(let v=0;v<256;v++){acc+=hist[v];cdf[v]=acc/(n||1)}
  // mean colour per luminance bin, interpolated across sparse bins
  const col=new Float32Array(256*3),known=[];for(let v=0;v<256;v++)if(hist[v]>=3)known.push(v);
  let k=0;
  for(let v=0;v<256;v++){
    while(k<known.length-1&&known[k+1]<=v)k++;
    if(!known.length){col[v*3]=col[v*3+1]=col[v*3+2]=v;continue}
    const a=known[k]>v?known[k]:known[k],b=known[k]>=v||k===known.length-1?known[k]:known[k+1];
    const t=b===a?0:(v-a)/(b-a);
    for(let j=0;j<3;j++){const ca=sum[a*3+j]/hist[a],cb=sum[b*3+j]/hist[b];col[v*3+j]=ca+(cb-ca)*t}
  }
  return {cdf,col};
}
function hairMatched(src,c,frontSrc){
  return memo(dollCaches.sprite,'match|'+src,async()=>{
    const ref=hairProfile(await spriteCanvas(frontSrc)),own=hairProfile(c);
    const lut=new Uint8Array(256);
    for(let v=0,r=0;v<256;v++){while(r<255&&ref.cdf[r]<own.cdf[v])r++;lut[v]=r}
    const out=makeCanvas(c.width,c.height),g=ctx2d(out);g.drawImage(c,0,0);
    const im=g.getImageData(0,0,out.width,out.height),d=im.data;
    for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const v=lut[Math.round(luma(d[i],d[i+1],d[i+2]))];d[i]=ref.col[v*3];d[i+1]=ref.col[v*3+1];d[i+2]=ref.col[v*3+2]}
    g.putImageData(im,0,0);return out;
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
/* Shoes. Pairs: fit.left/right = {x,y,w,rot} for the sprite parts; the part below `collar` (fraction
   of the shoe height) is in front of the leg. Side views: fit.near = {x,y,w,rot} for the single main
   sprite, optional fit.far = {dx,dy,shade} draws it again behind the body for the far foot. */
function shoeLayers(doll,view,id,tintId){
  const item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit)return Promise.resolve(null);
  return memo(dollCaches.layer,['shoes',doll,view,id,tintId].join('|'),async()=>{
    const [back,bg]=dollLayer(doll,view),[front,fg]=dollLayer(doll,view);
    const place=(g,src,f)=>{const w=f.w,h=f.h??src.height*w/src.width;g.translate(f.x,f.y);if(f.rot)g.rotate(f.rot*Math.PI/180);return [w,h]};
    if(fit.near){
      const src=await itemSprite(item,view,'main',tintId);
      if(fit.far){
        const f={...fit.near,x:fit.near.x+(fit.far.dx||0),y:fit.near.y+(fit.far.dy||0)};
        const t=makeCanvas(DOLL_CANVAS.width,DOLL_CANVAS.height),tg=t.getContext('2d');tg.translate(...dollView(doll,view).origin);
        const [w,h]=place(tg,src,f);tg.drawImage(src,0,0,w,h);
        tg.setTransform(1,0,0,1,0,0);tg.globalCompositeOperation='source-atop';tg.fillStyle=`rgba(30,12,30,${fit.far.shade??.3})`;tg.fillRect(0,0,t.width,t.height);
        bg.save();bg.setTransform(1,0,0,1,0,0);bg.drawImage(t,0,0);bg.restore();
      }
      fg.save();const [w,h]=place(fg,src,fit.near);
      if(fit.collar){bg.save();place(bg,src,fit.near);bg.drawImage(src,0,0,w,h);bg.restore();fg.beginPath();fg.rect(-5,h*fit.collar,w+10,h);fg.clip()}
      fg.drawImage(src,0,0,w,h);fg.restore();
      return {back,front};
    }
    for(const side of ['left','right']){
      const f=fit[side];if(!f)continue;
      const src=await itemSprite(item,view,side,tintId);
      const w=f.w,h=f.h??src.height*w/src.width;
      bg.save();bg.translate(f.x,f.y);if(f.rot)bg.rotate(f.rot*Math.PI/180);bg.drawImage(src,0,0,w,h);bg.restore();
      // the part below the collar line is in front of the leg
      fg.save();fg.translate(f.x,f.y);if(f.rot)fg.rotate(f.rot*Math.PI/180);
      fg.beginPath();
      if(f.front)pathPoly(fg,f.front.map(([u,v])=>[u*w,v*h]));else fg.rect(-5,h*(fit.collar||0),w+10,h);
      fg.clip();fg.drawImage(src,0,0,w,h);fg.restore();
    }
    return {back,front};
  });
}
/* Hair: {back, front}. fit.front shapes = doll-local regions drawn again in front of the body (the
   rest is behind); fit.backFill = a squeezed shaded copy behind the neck; fit.cut = sprite polys
   removed; fit.cutDoll = doll-local shapes removed (keeps the profile face clear). */
/* Scalp underlayer: hair-textured coverage of the skull above the doll's natural hairline (the doll
   view's .scalp polygon, or fit.scalp.region), drawn under the hair sprite so that wherever a style's
   face window is larger than the real face the gap reads as hair, not bare scalp. It is painted in
   luminance with strands combed toward the style's fit.scalp.to points (with fit.scalp.part = x the
   head is split there between the first and the last point; otherwise each strand heads for the
   nearest point), then coloured through the style sprite's own palette and hair-colour gradient map,
   so it matches the sprite in every hair colour. The hairline contour is jittered, and in a band a
   few px wide inside it the coverage comes from the strands alone (combed away from the face), so the
   edge reads as a natural hairline rather than a painted cap. Seeded: the same on every render. */
function scalpLayer(doll,view,item,fit,colorId){
  const dv=dollView(doll,view),spec=fit.scalp,region=spec?.region||dv.scalp;
  if(!spec||!region)return Promise.resolve(null);
  return memo(dollCaches.layer,['scalp',doll,view,item.id,colorId].join('|'),async()=>{
    const poly=jitterPoly(region,spec.jitter??2);
    const [base,raw]=await Promise.all([spriteCanvas(dv.art),itemSprite(item,view,'main')]);
    const hair=colorId?CATALOG.hairColors.find(h=>h.id===colorId):null;
    const rd=ctx2d(raw).getImageData(0,0,raw.width,raw.height).data,prof=hairProfile(raw);
    const lut=hair?.stops?hairLut(rd,hair):null;
    const lum=p=>{for(let v=0;v<256;v++)if(prof.cdf[v]>=p)return v;return 255};
    const W=base.width,H=Math.min(base.height,Math.ceil(Math.max(...region.map(p=>p[1])))+8);
    let seed=spec.seed||1234567;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    const to=spec.to,target=(x,y)=>{
      if(spec.part!==undefined)return x<spec.part?to[0]:to[to.length-1];
      let best=to[0],bd=Infinity;for(const t of to){const dd=Math.hypot(t[0]-x,t[1]-y);if(dd<bd){bd=dd;best=t}}return best;
    };
    // soft: the region (lightly feathered) inside the doll's silhouette; core: the same region well
    // inside its edge. In the band between them the coverage comes from the strands alone, so the
    // hairline is made of hairs combed away from the face rather than a painted edge.
    const regionMask=(blur,clip)=>{const c=makeCanvas(W,H),cg=ctx2d(c);cg.fillStyle='#000';cg.shadowColor='#000';cg.shadowBlur=blur;cg.shadowOffsetX=W*2;cg.translate(-W*2,0);
      pathPoly(cg,poly);cg.fill();cg.setTransform(1,0,0,1,0,0);cg.shadowColor='transparent';if(clip){cg.globalCompositeOperation='destination-in';cg.drawImage(base,0,0)}return cg.getImageData(0,0,W,H).data};
    const md=regionMask((spec.feather??1.6)*2,true),cd=regionMask((spec.edge??5)*2),nd=regionMask(18);
    // near the hairline the hair is combed straight back from the face (up the gradient of nd)
    const ndA=(x,y)=>{x=Math.min(W-1,Math.max(0,x|0));y=Math.min(H-1,Math.max(0,y|0));return nd[(y*W+x)*4+3]/255};
    let x0=W,x1=0,y0=H,y1=0,cx=0,cy=0,area=0;
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=md[(y*W+x)*4+3];if(a<8)continue;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);cx+=x;cy+=y;area++}
    if(!area)return null;
    cx/=area;cy/=area;
    // luminance texture: dark base, combed strands (also drawn into a coverage canvas), sheen, rim
    const t=makeCanvas(W,H),tg=ctx2d(t),cov=makeCanvas(W,H),vg=ctx2d(cov),gray=(v,a)=>`rgba(${v},${v},${v},${a})`;
    tg.fillStyle=gray(lum(.3),1);tg.fillRect(0,0,W,H);tg.lineCap=vg.lineCap='round';
    const sheenY=spec.sheenY??(y0+(y1-y0)*.32),sheenR=(y1-y0)*.2,lo=lum(.06),mid=lum(.55),hi=lum(.97);
    const n=Math.round(area/(spec.density??4));
    for(let i=0,tries=0;i<n&&tries<n*20;tries++){
      const x=x0+rnd()*(x1-x0+1),y=y0+rnd()*(y1-y0+1);
      if(md[((y|0)*W+(x|0))*4+3]<8)continue;i++;
      const [tx,ty]=target(x,y);let dx=tx-x,dy=ty-y;const dist=Math.hypot(dx,dy)||1;dx/=dist;dy/=dist;
      const e=Math.min(1,Math.max(0,(.97-ndA(x,y))/.42));
      if(e>0){let gx=ndA(x+3,y)-ndA(x-3,y),gy=ndA(x,y+3)-ndA(x,y-3);const gl=Math.hypot(gx,gy);
        if(gl>1e-4){gx/=gl;gy/=gl;dx=dx*(1-e*.6)+gx*e;dy=dy*(1-e*.6)+gy*e;const l=Math.hypot(dx,dy)||1;dx/=l;dy/=l}}
      const L=Math.min(dist+6,(spec.strand??24)*(.6+rnd()*.8)*(1-.45*e)),a=e>.3?rnd()*.15:rnd()*.5,bend=(rnd()-.5)*L*.12;
      const sx=x-dx*L*a,sy=y-dy*L*a,ex=x+dx*L*(1-a),ey=y+dy*L*(1-a);
      const sh=Math.exp(-(((y-sheenY)/sheenR)**2));
      let v=lo+(mid-lo)*rnd();if(rnd()<sh*.55)v=mid+(hi-mid)*(.35+rnd()*.65);
      const al=(.3+rnd()*.4)*(1-.35*e),lw=e>.3?.4+rnd()*.6:.6+rnd()*1.3;
      for(const [g,col] of [[tg,gray(Math.round(v),al)],[vg,`rgba(0,0,0,${al})`]]){
        g.strokeStyle=col;g.lineWidth=lw;g.beginPath();g.moveTo(sx,sy);g.quadraticCurveTo((sx+ex)/2-dy*bend,(sy+ey)/2+dx*bend,ex,ey);g.stroke();
      }
    }
    const rim=Math.max(x1-x0,y1-y0)*.62,gr=tg.createRadialGradient(cx,cy-(y1-y0)*.15,rim*.4,cx,cy,rim);
    gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(1,`rgba(0,0,0,${spec.rim??.28})`);tg.fillStyle=gr;tg.fillRect(0,0,W,H);
    // colour through the sprite's palette (and the hair colour's gradient map), alpha from the masks
    const vd=vg.getImageData(0,0,W,H).data;
    const out=makeCanvas(W,H),og=ctx2d(out),im=tg.getImageData(0,0,W,H),d=im.data;
    for(let i=0;i<d.length;i+=4){
      const a=md[i+3];if(!a){d[i+3]=0;continue}
      const c=cd[i+3]/255,core=Math.min(1,Math.max(0,(c-.72)/.24)),ramp=Math.min(1,Math.max(0,(c-.3)/.6)),strands=Math.min(1,vd[i+3]/255*1.1);
      const v=d[i];
      if(lut){d[i]=lut[v*3];d[i+1]=lut[v*3+1];d[i+2]=lut[v*3+2]}
      else{d[i]=prof.col[v*3];d[i+1]=prof.col[v*3+1];d[i+2]=prof.col[v*3+2]}
      d[i+3]=a*(core+(1-core)*strands*ramp*ramp);
    }
    og.putImageData(im,0,0);
    return out;
  });
}
/* A polygon resampled every ~3px with its points pushed along the normal by a smooth deterministic
   noise of amplitude amp (px): an irregular, natural hairline contour. */
function jitterPoly(pts,amp){
  if(!amp)return pts;
  const out=[];
  for(let i=0;i<pts.length;i++){
    const [ax,ay]=pts[i],[bx,by]=pts[(i+1)%pts.length],len=Math.hypot(bx-ax,by-ay),nx=(ay-by)/(len||1),ny=(bx-ax)/(len||1);
    for(let s=0;s<len;s+=3){const x=ax+(bx-ax)*s/len,y=ay+(by-ay)*s/len,k=amp*(Math.sin(x*.71+y*.37)*.55+Math.sin(x*.23-y*1.13+1.7)*.45);out.push([x+nx*k,y+ny*k])}
  }
  return out;
}
function hairLayers(doll,view,id,colorId){
  const item=catalogItem(id),fit=item?.fit?.[doll]?.[view];
  if(!fit)return Promise.reject(new Error('Hair '+id+' does not fit '+doll+' '+view));
  return memo(dollCaches.layer,['hair',doll,view,id,colorId].join('|'),async()=>{
    let src=await itemSprite(item,view,'main',null,colorId);
    if(fit.cut)src=maskSprite(src,{cut:fit.cut});
    const scalp=await scalpLayer(doll,view,item,fit,colorId);
    const [full,g]=dollLayer(doll,view);if(scalp)g.drawImage(scalp,0,0);drawFitted(g,src,fit);
    if(fit.cutDoll)eraseShapes(doll,view,full,fit.cutDoll);
    let back=null;
    if(fit.backFill||fit.front){
      const [b,bg]=dollLayer(doll,view);back=b;
      if(fit.backFill){ // a squeezed, shaded copy behind the neck and shoulders: the hair at the back
        // plus a narrower copy (inner, default .55 of sx) right behind the neck, so no background shows
        // between the jaw, the neck and the face window of the style
        const f=fit.backFill,cx=fit.x+fit.w/2;
        for(const sx of [(f.sx||.6)*(f.inner??.55),f.sx||.6]){
          bg.save();bg.translate(cx,fit.y+(f.dy||0));bg.scale(sx,f.sy||1);bg.translate(-cx,-fit.y);drawFitted(bg,src,fit);bg.restore();
        }
        bg.save();bg.setTransform(1,0,0,1,0,0);bg.globalCompositeOperation='source-atop';bg.fillStyle=`rgba(25,10,18,${f.shade??.32})`;bg.fillRect(0,0,b.width,b.height);bg.restore();
      }
      if(fit.front){bg.save();bg.setTransform(1,0,0,1,0,0);bg.drawImage(full,0,0);bg.restore();}
    }
    if(!fit.front)return {back,front:full};
    // Only the given doll-local regions of the style are drawn again in front of the body (a shape's
    // feather softens where the hair passes behind, e.g. behind the arms in the front view).
    if(fit.front.some(s=>s.feather)){const [ox,oy]=dollView(doll,view).origin;return {back,front:softClip(full,ox,oy,fit.front)}}
    const [front,fg]=dollLayer(doll,view);
    fg.save();fg.beginPath();fit.front.forEach(s=>shapePathInto(fg,s));fg.clip();
    fg.setTransform(1,0,0,1,0,0);fg.drawImage(full,0,0);fg.restore();
    return {back,front};
  });
}
function shapePathInto(g,s){
  if(s.poly){s.poly.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath()}
  else if(s.rect)g.rect(...s.rect);
  else if(s.ellipse){const [x,y,rx,ry,rot]=s.ellipse;g.moveTo(x+rx,y);g.ellipse(x,y,rx,ry,(rot||0)*Math.PI/180,0,Math.PI*2)}
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
function bodyKey(shot,view){return [shot.doll,view,shot.outfit,shot.lips,shot.blush,shot.shadow,shot.nails,shot.shoes].join('|')}
function bodyLayer(shot,view){
  const doll=shot.doll,info=CATALOG.dolls[doll];
  return memo(dollCaches.body,bodyKey(shot,view),async()=>{
    const dv=dollView(doll,view),base=await spriteCanvas(dv.art);
    const w=base.width,h=base.height,c=makeCanvas(w,h),g=ctx2d(c);g.drawImage(base,0,0);
    const im=g.getImageData(0,0,w,h),d=im.data;
    const outfitFit=catalogItem(shot.outfit)?.fit?.[doll]?.[view];
    if(outfitFit?.skin?.length)coverBodysuit(d,w,h,outfitFit.skin,info);
    const face=dv.face||{};
    const opt=(list,id)=>CATALOG.makeup[list].find(o=>o.id===id);
    const shadow=opt('shadow',shot.shadow);
    if(shadow?.color&&face.lids){
      const m=shapeMask(w,h,face.lids,face.lidBlur||0);
      if(face.eyes){const e=shapeMask(w,h,face.eyes.map(p=>({poly:p})),.6);for(let i=0;i<m.length;i++)m[i]=Math.max(0,m[i]-e[i]*1.2)}
      applyColor(d,m,hexRgb(shadow.color),shadow.strength||.5,'color',{ref:150,contrast:1,skipDark:60});
      if(shadow.shimmer)applyColor(d,m,hexRgb(shadow.shimmer),.22,'screen');
    }
    const blush=opt('blush',shot.blush);
    if(blush?.color&&face.cheeks)applyColor(d,shapeMask(w,h,face.cheeks.map(([x,y,rx,ry])=>({gradient:[x,y,rx,ry,1]}))),hexRgb(blush.color),blush.strength||.4,'multiply');
    const lips=opt('lips',shot.lips);
    if(lips?.color&&face.lips){
      const m=shapeMask(w,h,[{poly:face.lips}],face.lipBlur||1.2);
      if(face.mouth){const inner=shapeMask(w,h,[{poly:face.mouth}],.8);for(let i=0;i<m.length;i++)m[i]=Math.max(0,m[i]-inner[i])}
      applyColor(d,m,hexRgb(lips.color),lips.strength||.8,'color',{ref:face.lipRef||130,contrast:lips.contrast||1.1,gloss:lips.gloss,skipBright:.3,lift:lips.lift||1});
    }
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
  return [shot.doll,view,shot.outfit,shot.outfitTint,shot.shoes,shot.shoesTint,shot.hair,shot.hairColor,shot.earrings,shot.earringsTint,shot.necklace,shot.clip,shot.lips,shot.blush,shot.shadow,shot.gem,shot.nails].join('|');
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
  const shot={...readLook(raw,raw.doll==='little'?'little':'adult'),doll:raw.doll==='little'?'little':'adult'};
  return memo(dollCaches.doll,lookKey(shot,view),async()=>{
    const doll=shot.doll,dv=dollView(doll,view),[ox,oy]=dv.origin;
    const hairFit=catalogItem(shot.hair).fit[doll][view];
    const earItem=catalogItem(shot.earrings),clipItem=catalogItem(shot.clip);
    const [body,outfit,shoes,hair,necklace,earrings,clipLayer]=await Promise.all([
      bodyLayer(shot,view),outfitLayer(doll,view,shot.outfit,shot.outfitTint),
      shot.shoes==='none'?null:shoeLayers(doll,view,shot.shoes,shot.shoesTint),
      hairLayers(doll,view,shot.hair,shot.hairColor),
      shot.necklace==='none'?null:spriteItemLayer(doll,view,shot.necklace),
      !earItem||earItem.stud?null:spriteItemLayer(doll,view,shot.earrings,shot.earringsTint),
      !clipItem||clipItem.proc||hairFit.clip?.hide?null:clipSprite(shot,view)
    ]);
    const arm=sideView(view)?await armLayer(shot,view,body):null;
    const bodyPic=shoes&&dv.footTop!==undefined?trimFeet(body,shoes,ox,oy,dv.footTop):body;
    const c=makeCanvas(DOLL_CANVAS.width,DOLL_CANVAS.height),g=c.getContext('2d');
    g.imageSmoothingQuality='high';
    const clipAt=hairFit.clip||{},clipBehind=!!clipAt.behind;
    const proc=clipItem?.proc&&!clipAt.hide?clipItem.proc:0;
    const drawProc=()=>{g.save();g.translate(ox,oy);drawCharmView(g,proc,clipAt,dv,view);g.restore()};
    const stud=earItem?.stud&&dv.face?.lobes?earItem.stud:null;
    const drawStuds=()=>{g.save();g.translate(ox,oy);for(const [x,y] of dv.face.lobes)drawStud(g,view==='back'?'clutch':stud,x,y+dv.face.unit*(view==='back'?.02:.06),dv.face.unit*(view==='back'?.09:.15));g.restore()};
    // back view: earrings sit under the hair, so only show where the style leaves the ears free
    const earsUnder=!!hairFit.earsUnder||view==='back';
    if(clipBehind){if(clipLayer)g.drawImage(clipLayer,0,0);if(proc)drawProc()}
    if(hair.back)g.drawImage(hair.back,0,0);
    if(outfit.back)g.drawImage(outfit.back,0,0);
    if(shoes)g.drawImage(shoes.back,0,0);
    g.drawImage(bodyPic,ox,oy);
    g.save();g.translate(ox,oy);drawGem(g,shot,view);g.restore();
    const outfitFit=catalogItem(shot.outfit).fit[doll][view];
    if(shoes&&!outfitFit.shoesOver)g.drawImage(shoes.front,0,0);
    g.drawImage(outfit.front,0,0);
    if(shoes&&outfitFit.shoesOver)g.drawImage(shoes.front,0,0);
    if(arm&&outfitFit.arm!=='hidden'){
      if(outfitFit.armClip?.some(s=>s.feather))g.drawImage(softClip(arm,ox,oy,outfitFit.armClip),0,0);
      else if(outfitFit.armClip){g.save();g.translate(ox,oy);g.beginPath();outfitFit.armClip.forEach(s=>shapePathInto(g,s));g.setTransform(1,0,0,1,0,0);g.clip();g.drawImage(arm,0,0);g.restore()}
      else g.drawImage(arm,0,0);
    }
    if(outfit.over)g.drawImage(outfit.over,0,0);
    if(necklace)g.drawImage(necklace,0,0);
    if(earsUnder){if(earrings)g.drawImage(earrings,0,0);if(stud)drawStuds()}
    g.drawImage(hair.front,0,0);
    if(!earsUnder){if(earrings)g.drawImage(earrings,0,0);if(stud)drawStuds()}
    if(!clipBehind){if(clipLayer)g.drawImage(clipLayer,0,0);if(proc)drawProc()}
    return c;
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
/* Side views: the base foot is flat, a heeled shoe is shorter, so below the ankle (doll y footTop) the
   bare foot is kept only within each row's span of the shoe (bare heel/toes would poke out). */
function trimFeet(body,shoes,ox,oy,footTop){
  const c=makeCanvas(body.width,body.height),g=ctx2d(c);g.drawImage(body,0,0);
  const im=g.getImageData(0,0,c.width,c.height),d=im.data,W=c.width;
  const sd=ctx2d(shoes.front).getImageData(0,0,shoes.front.width,shoes.front.height).data,SW=shoes.front.width;
  for(let y=Math.max(0,Math.floor(footTop));y<c.height;y++){
    const Y=y+oy;let a=-1,b=-1;
    if(Y>=0&&Y<shoes.front.height)for(let X=0;X<SW;X++)if(sd[(Y*SW+X)*4+3]>40){if(a<0)a=X;b=X}
    for(let x=0;x<W;x++){const X=x+ox;if(a>=0&&X>=a+1&&X<=b-1)continue;d[(y*W+x)*4+3]=0}
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
async function paintPortrait(canvas, shot, postcard=false, view='front') {
  const scenic=shot.backdrop>0,scene=scenic?districts[shot.backdrop-1]:null;
  const [doll,background]=await Promise.all([composeDoll(shot,view),scenic?asset('assets/scenes/'+scene.id+'.jpg'):null]);
  const w=canvas.width=postcard?640:480,h=canvas.height=postcard?860:720;
  const c=canvas.getContext('2d');
  const x=postcard?70:0,y=postcard?21:0,width=postcard?500:w,height=postcard?750:h;
  if(postcard){
    const colors=frameColors[shot.frame]||frameColors[0];
    c.fillStyle=colors[0];c.fillRect(0,0,w,h);c.fillStyle=colors[1];
    for(let i=-h;i<w;i+=32) {
      if(shot.frame===2){c.fillRect(i,0,14,h);c.fillRect(0,i,w,14);}
      else {c.beginPath();c.moveTo(i,0);c.lineTo(i+14,0);c.lineTo(i+h+14,h);c.lineTo(i+h,h);c.fill();}
    }
    c.fillStyle='#fffefa';c.fillRect(x-9,y-9,width+18,h-y-19);
  }
  const lay=portraitLayout[shot.doll]||portraitLayout.adult;
  const k=lay.scale*width/480,footY=y+height*lay.foot;
  if(scenic){
    const cropWidth=background.height*width/height;
    const cropX=(background.width-cropWidth)*(shot.backdrop===3?.74:.52);
    c.drawImage(background,cropX,0,cropWidth,background.height,x,y,width,height);
    c.fillStyle='rgba(70,42,58,.24)';c.beginPath();
    c.ellipse(x+width/2,footY+k*6,k*120,k*20,0,0,Math.PI*2);c.fill();
  }else{
    studioBackdrop(c,x,y,width,height);
    drawPedestal(c,x+width/2,footY+k*10,k*190);
    c.fillStyle='rgba(110,50,105,.28)';c.beginPath();c.ellipse(x+width/2,footY+k*8,k*110,k*16,0,0,Math.PI*2);c.fill();
  }
  c.save();c.beginPath();c.rect(x,y,width,height);c.clip();
  c.imageSmoothingQuality='high';
  c.drawImage(doll,x+width/2-DOLL_CANVAS.width/2*k,footY-DOLL_CANVAS.baseline*k,DOLL_CANVAS.width*k,DOLL_CANVAS.height*k);
  c.restore();
  if(postcard){
    drawCharm(c,shot.sticker,x+width-16,y+height-30,60);
    // The caption is drawn in the current language; longer names shrink to fit the card.
    c.fillStyle='#7a305e';c.textAlign='center';
    fitText(c,itemName(shot.outfit),w/2,809,560,32,'italic bold {size}px Georgia');
    c.fillStyle='#965677';
    fitText(c,t('postcard.line',{doll:t('doll.caption.'+(shot.doll==='adult'?'adult':'little'))}),w/2,836,580,15,'{size}px Trebuchet MS, sans-serif');
  }
}
