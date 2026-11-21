/* Where the conversation bubbles go in a walk-in place (island-life.js draws them): pure geometry in
   scene pixels, no page access, so test/talk.test.mjs can check it.

   TalkPlace.place(scene, items, {avoid, soft}) puts every item's bubble (w × h) next to its speaker,
   trying the sides in the item's `prefer` order: 'above' the head (`head`, the rect the tail points
   at), 'left' or 'right' of it, or 'bottom' (a caption along the scene's bottom edge, no tail). Beside
   a figure the tail may also point lower, at the upper `body` (up to `reach` px below the face), when
   the face's side is taken. Every bubble stays inside the scene with PAD to spare, never touches a
   rect in `avoid` (the faces), never overlaps another bubble, and its tail always reaches its speaker.
   Rects in `soft` (bodies, the tour card) are only avoided when possible. All items are placed
   together (the cheapest combination wins); the result is [{side, x, y, w, h, tail}] in item order
   (`tail`: px along the bubble's edge), or null when they cannot all fit. */
const TalkPlace=(()=>{
  const PAD=8,GAP=12,SEP=8,TAIL_IN=22,STEPS=10;
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const hits=(a,b,pad=0)=>a.x<b.x+b.w+pad&&b.x<a.x+a.w+pad&&a.y<b.y+b.h+pad&&b.y<a.y+a.h+pad;
  const area=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  const inside=(r,s)=>r.x>=PAD-.5&&r.y>=PAD-.5&&r.x+r.w<=s.w-PAD+.5&&r.y+r.h<=s.h-PAD+.5;
  /* Every spot on each side: the tail slides along the bubble's edge, the bubble is pushed back into
     the scene, and spots whose tail would no longer reach the speaker are dropped. */
  function candidates(scene,item){
    const {w,h,head}=item,prefer=item.prefer||['above','left','right'],out=[];
    const cx=head.x+head.w/2,inH=Math.min(TAIL_IN,w/2),inV=Math.min(TAIL_IN,h/2);
    const aims=[0,.5,1].filter((f,i)=>i===0||item.reach>0).map(f=>({cy:head.y+head.h*.45+f*(item.reach||0),beside:f&&item.body?item.body:head}));
    prefer.forEach((side,rank)=>{
      for(let k=0;k<=STEPS;k++){
        if(side==='bottom'){
          const x=PAD+(scene.w-2*PAD-w)*k/STEPS;
          if(x<PAD-.5)return;
          out.push({side,x,y:scene.h-PAD-h,w,h,tail:0,shift:Math.abs(x+w/2-cx)/scene.w,rank});
        }else if(side==='above'){
          const want=inH+(w-2*inH)*k/STEPS,x=clamp(cx-want,PAD,scene.w-PAD-w),tail=cx-x;
          if(tail<inH-.5||tail>w-inH+.5)continue;
          const c={side,x,y:head.y-GAP-h,w,h,tail,shift:Math.abs(tail-w/2)/w,rank};
          if(inside(c,scene))out.push(c);
        }else if(side==='left'||side==='right'){
          aims.forEach(({cy,beside},a)=>{
            // the tail sits high on the bubble first: the bubble reads beside and above the face
            const want=h-inV-(h-2*inV)*k/STEPS,y=clamp(cy-want,PAD,scene.h-PAD-h),tail=cy-y;
            if(tail<inV-.5||tail>h-inV+.5)return;
            const c={side,x:side==='left'?beside.x-GAP-w:beside.x+beside.w+GAP,y,w,h,tail,shift:Math.abs(tail-(h-inV))/h+a*.6,rank};
            if(inside(c,scene))out.push(c);
          });
        }
      }
    });
    return out;
  }
  function place(scene,items,{avoid=[],soft=[]}={}){
    const lists=items.map(item=>candidates(scene,item).filter(c=>!avoid.some(r=>hits(c,r,4))).map(c=>{
      const penalty=soft.reduce((s,r)=>s+area(c,r),0)/(c.w*c.h);
      return Object.assign(c,{cost:c.rank*60+c.shift*25+penalty*120});
    }).sort((a,b)=>a.cost-b.cost).slice(0,60));
    if(lists.some(l=>!l.length))return null;
    let best=null,bestCost=Infinity;
    const pick=(i,chosen,cost)=>{
      if(cost>=bestCost)return;
      if(i===lists.length){best=chosen.slice();bestCost=cost;return}
      for(const c of lists[i]){
        if(chosen.some(o=>hits(c,o,SEP)))continue;
        chosen.push(c);pick(i+1,chosen,cost+c.cost);chosen.pop();
      }
    };
    pick(0,[],0);
    return best&&best.map(({side,x,y,w,h,tail})=>({side,x:Math.round(x),y:Math.round(y),w,h,tail:Math.round(tail)}));
  }
  return {place,hits,inside,PAD,GAP};
})();
