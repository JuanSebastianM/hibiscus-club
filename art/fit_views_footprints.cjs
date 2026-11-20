// Export composed front outfit layers (DOLL_CANVAS space) for art/fit_views.py. Needs the repo root served on 4193.
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{
  const b=await chromium.launch();const p=await b.newPage();
  await p.goto('http://127.0.0.1:4193/art/lab.html?sheet=one&ids=none');
  await p.waitForFunction(()=>window.labDone);
  const res=await p.evaluate(async()=>{
    // full front outfit, and its torso only (sleeve limb parts and their cuts left out)
    const out={};
    for(const it of CATALOG.itemList.filter(i=>i.category==='outfit')){
      const d=it.dolls[0];const l=await outfitLayer(d,'front',it.id,'original');
      const c=document.createElement('canvas');c.width=600;c.height=1060;const g=c.getContext('2d');
      if(l.back)g.drawImage(l.back,0,0);g.drawImage(l.front,0,0);if(l.over)g.drawImage(l.over,0,0);
      out[it.id]=c.toDataURL();
      const [t,tg]=dollLayer(d,'front');
      for(const piece of it.fit[d].front.pieces){const src=await itemSprite(it,'front',piece.part,'original');
        drawFitted(tg,maskSprite(src,{cut:(piece.parts||[]).map(p=>p.cut||p.poly)}),piece)}
      out[it.id+'.core']=t.toDataURL();
    }
    return out;
  });
  for(const [k,v] of Object.entries(res))fs.writeFileSync(process.argv[2]+'/'+k+'.png',Buffer.from(v.split(',')[1],'base64'));
  await b.close();
})();
