/* Puppet lab (art/puppet-lab.html): renders puppets of both dolls in any view, look and animation
   at a chosen time, contact sheets of key poses, and the rest pose against composeDoll.
   URL: ?doll=adult&look=0&view=front&anim=idle&t=1.2&scale=.6&crop=x,y,w,h (doll canvas px)
        &sheet=anim|looks|rest|walk  (window.labDone is set when a sheet is finished)
   window.lab.frame(opts) / lab.sheet(opts) / lab.diff(look, view) are used by the capture scripts. */
(()=>{
const q=new URLSearchParams(location.search);
const R=HibiscusPuppetRig;
HibiscusPuppet.config.allowSoftwareGL=true;
const D=CATALOG.defaults;
const LOOKS={
  adult:[
    {...D.adult,outfit:'hibiscus-flares',hair:'long-waves',shoes:'black-platform-sandals'},
    {...D.adult,outfit:'black-flares-set',hair:'curly-bob',shoes:'pink-chunky-sneakers',necklace:'none',clip:'none',earrings:'pearl-studs'},
    {...D.adult,outfit:'denim-jacket-skirt',hair:'side-ponytail',shoes:'pink-chunky-sneakers',earrings:'gold-hoops'},
    {...D.adult,outfit:'lilac-satin-bow-dress',hair:'half-up-curls',shoes:'lilac-mary-jane-heels',hairColor:'honey',shadow:'lilac',lips:'bubblegum'},
    {...D.adult,outfit:'green-hibiscus-sundress',hair:'curly-buns',shoes:'lilac-mary-jane-heels',clip:'peach-blossom'},
    {...D.adult,outfit:'pink-velour-cargo',hair:'ringlet-pigtails',shoes:'pink-chunky-sneakers',hairColor:'bubblegum'},
    // second wardrobe (6..): trousers + long sleeves, short dress over leg warmers, skirt + puffs, shorts, sleeveless dress
    {...D.adult,outfit:'aqua-velour-tracksuit',hair:'long-waves',shoes:'platform-boots'},
    {...D.adult,outfit:'hoodie-dress-leg-warmers',hair:'side-ponytail',shoes:'fuzzy-slippers'},
    {...D.adult,outfit:'tennis-dress',hair:'high-bun-tendrils',shoes:'pink-chunky-sneakers'},
    {...D.adult,outfit:'tankini-board-shorts',hair:'long-braids',shoes:'flower-flip-flops'},
    {...D.adult,outfit:'sequin-halter-dress',hair:'flip-bob',shoes:'wedge-sandals',necklace:'butterfly-necklace'}],
  little:[
    {...D.little},
    {...D.little,outfit:'denim-overalls',hair:'curly-buns',shoes:'white-velcro-sneakers'},
    {...D.little,outfit:'star-pajamas',hair:'curly-bob',shoes:'strawberry-rain-boots',hairColor:'chestnut'},
    {...D.little,outfit:'mint-cardigan-dress',hair:'curly-bob',shoes:'red-mary-janes',hairColor:'honey'},
    {...D.little,outfit:'pink-gingham-bow-dress',hair:'ringlet-pigtails'},
    {...D.little,outfit:'lilac-cord-pinafore',hair:'curly-buns',shoes:'white-velcro-sneakers'},
    // second wardrobe (6..)
    {...D.little,outfit:'raincoat-set',hair:'curly-buns',shoes:'cowboy-boots'},
    {...D.little,outfit:'tulle-party-dress',hair:'ringlet-pigtails',shoes:'jelly-shoes'},
    {...D.little,outfit:'ballet-wrap-set',hair:'top-ponytail',shoes:'ballet-slippers'},
    {...D.little,outfit:'dino-romper',hair:'curly-bob',shoes:'light-up-sneakers'},
    {...D.little,outfit:'beach-poncho',hair:'tiny-pigtails',shoes:'toddler-sandals'}]
};
const lookOf=(doll,i)=>({...LOOKS[doll][i%LOOKS[doll].length],doll});
/* The pose of an animation at time t (seconds). walk: t in seconds at the natural speed. */
function poseFor(rig,anim,t,doll,seed=7,outfit){
  anim=R.emoteFor(anim,outfit,rig.view);
  const ctx={seed,doll,rig,energy:1};
  if(anim==='rest')return R.restPose();
  const p=R.idlePose(t,ctx);
  if(anim==='idle')return p;
  if(anim==='walk'){const ph=t*R.walkSpeed(doll==='resident'?'adult':doll,rig.view)/R.cycleLength(doll,rig.view);const w=R.walkPose(ph,ctx);R.mixPose(p,w,1);p.farAlpha=1;return p}
  if(anim==='talk'){R.addPose(p,R.talkPose(t,ctx),1);return p}
  if(anim==='blink'){p.face.blink=[t,t];return p}
  if(anim==='jaw'){p.face.jaw=t*(rig.face?.jawMax||3);return p}
  if(anim==='smileface'){p.face.smile=t;p.face.squint=t*.6;return p}
  const e=R.emotePose(anim,t,ctx);R.addPose(p,e.pose,1);if(e.pose.raise)p.raise=e.pose.raise;
  return p;
}
async function frame({doll='adult',look=0,view='front',anim='idle',t=0,crop=null,scale=.6,bg='#cfe6d4',resident=null,pose=null,shot=null}={}){
  const opts=resident?{resident}:{shot:shot?{...shot,doll}:lookOf(doll,look),view};
  const cr=crop||(resident?[0,0,176,432]:[0,0,600,1060]);
  const c=document.createElement('canvas');c.width=Math.round(cr[2]*scale);c.height=Math.round(cr[3]*scale);
  const back=document.createElement('canvas');back.width=c.width;back.height=c.height;const bg2=back.getContext('2d');bg2.fillStyle=bg;bg2.fillRect(0,0,c.width,c.height);
  await HibiscusPuppet.debugRender(c,{...opts,view},rig=>pose?pose(rig):poseFor(rig,anim,t,resident?'resident':doll,7,opts.shot?.outfit),{crop:cr,dest:[0,0,c.width,c.height],back});
  return c;
}
/* The still picture at the same framing. */
async function still({doll='adult',look=0,view='front',crop=null,scale=.6,bg='#cfe6d4',resident=null}={}){
  const cr=crop||(resident?[0,0,176,432]:[0,0,600,1060]);
  const src=resident?await asset('assets/scenes/'+resident+'.png'):await composeDoll(lookOf(doll,look),view);
  const c=document.createElement('canvas');c.width=Math.round(cr[2]*scale);c.height=Math.round(cr[3]*scale);
  const g=c.getContext('2d');g.fillStyle=bg;g.fillRect(0,0,c.width,c.height);g.imageSmoothingQuality='high';
  g.drawImage(src,cr[0],cr[1],cr[2],cr[3],0,0,c.width,c.height);
  return c;
}
/* Rest pose against composeDoll: returns stats and a difference picture (x4). */
async function diff(doll,look,view,{resident=null,scale=1,crop=null}={}){
  const a=await frame({doll,look,view,anim:'rest',scale,resident,crop,bg:'#808080'}),b=await still({doll,look,view,scale,resident,crop,bg:'#808080'});
  const da=a.getContext('2d').getImageData(0,0,a.width,a.height).data,db=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
  const c=document.createElement('canvas');c.width=a.width;c.height=a.height;const g=c.getContext('2d'),im=g.createImageData(c.width,c.height),o=im.data;
  let sum=0,max=0,over=0,n=0;
  for(let i=0;i<da.length;i+=4){const d=Math.max(Math.abs(da[i]-db[i]),Math.abs(da[i+1]-db[i+1]),Math.abs(da[i+2]-db[i+2]));
    sum+=d;n++;if(d>max)max=d;if(d>16)over++;o[i]=o[i+1]=o[i+2]=Math.min(255,d*4);o[i+3]=255}
  g.putImageData(im,0,0);
  return {mean:+(sum/n).toFixed(3),max,over16:over,pixels:n,canvas:c,puppet:a,still:b};
}
const out=document.querySelector('#out');
function figure(c,label){const f=document.createElement('figure'),cap=document.createElement('figcaption');cap.textContent=label;cap.style.maxWidth=c.width-10+'px';f.append(c,cap);out.append(f);return f}
async function sheet({doll='adult',looks=[0],views=['front'],anim='idle',times=[0],crop=null,scale=.4,resident=null}={}){
  for(const look of looks)for(const view of views)for(const t of times){
    const c=await frame({doll,look,view,anim,t,crop,scale,resident});
    figure(c,`${resident||doll} ${resident?'':lookOf(doll,look).outfit} ${view} ${anim} t=${(+t).toFixed(2)}`);
  }
}
window.lab={LOOKS,lookOf,poseFor,frame,still,diff,sheet,figure,out};

/* ---------- interactive controls ---------- */
const bar=document.querySelector('#bar');
const sel=(name,opts,val)=>{const l=document.createElement('label');l.textContent=name+' ';const s=document.createElement('select');s.name=name;for(const o of opts){const op=document.createElement('option');op.value=o;op.textContent=o;s.append(op)}s.value=val;l.append(s);bar.append(l);return s};
const state={doll:q.get('doll')||'adult',look:+(q.get('look')||0),view:q.get('view')||'front',anim:q.get('anim')||'idle',t:+(q.get('t')||0),scale:+(q.get('scale')||.6)};
const sDoll=sel('doll',['adult','little','mara','rosa','kit','sol','teo','gigi','nina'],state.doll),sLook=sel('look',[0,1,2,3,4,5],state.look),sView=sel('view',CATALOG.views,state.view);
const sAnim=sel('anim',['rest','idle','walk','talk','blink','jaw','smileface','smile','laugh','wave','cheer','sway','shy','pose','nod'],state.anim);
const lt=document.createElement('label');lt.textContent='t ';const slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=4;slider.step=.01;slider.value=state.t;lt.append(slider);bar.append(lt);
const play=document.createElement('label');play.innerHTML='<input type="checkbox"> play';bar.append(play);
const view=document.createElement('canvas');
let busy=false,pending=false;
async function draw(){
  if(busy){pending=true;return}busy=true;
  try{
    const res=['mara','rosa','kit','sol','teo','gigi','nina'].includes(sDoll.value)?sDoll.value:null;
    const c=await frame({doll:res?'adult':sDoll.value,look:+sLook.value,view:sView.value,anim:sAnim.value,t:+slider.value,scale:state.scale,resident:res});
    view.width=c.width;view.height=c.height;view.getContext('2d').drawImage(c,0,0);
  }catch(e){console.error(e)}
  busy=false;if(pending){pending=false;draw()}
}
if(!q.get('sheet')){out.append(view);for(const s of [sDoll,sLook,sView,sAnim,slider])s.addEventListener('input',draw);draw();
  let last=0;const loop=now=>{if(play.querySelector('input').checked){const dt=last?(now-last)/1000:0;slider.value=(+slider.value+dt)%4;draw()}last=now;requestAnimationFrame(loop)};requestAnimationFrame(loop);}
else (async()=>{
  const s=q.get('sheet');if(s==='none'){window.labDone=true;return}
  const dolls=(q.get('dolls')||'adult,little').split(','),views=(q.get('views')||'front,left,right,back').split(','),looks=(q.get('looks')||'0').split(',').map(Number);
  const times=(q.get('times')||'0,0.5,1,1.5').split(',').map(Number),scale=+(q.get('scale')||.3),crop=q.get('crop')?q.get('crop').split(',').map(Number):null;
  for(const doll of dolls)await sheet({doll,looks,views,anim:q.get('anim')||'idle',times,scale,crop,resident:['mara','rosa','kit','sol','teo','gigi','nina'].includes(doll)?doll:null});
  window.labDone=true;
})().catch(e=>{console.error(e);window.labDone=true});
})();
