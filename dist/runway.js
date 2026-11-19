const marks=['Left','Center','Right'];
let rehearsal, cueTimer;
function resetRunway(){
  clearTimeout(cueTimer);
  rehearsal={sequence:[],step:0,phase:'ready',mark:null,note:'Watch the three runway marks light up, then repeat the sequence.'};
}
function runway(){
  const r=rehearsal;
  const labels=marks.map((m,i)=>`<button data-pose="${i}" aria-label="Step to the ${m.toLowerCase()} mark" ${r.phase==='repeat'?'':'disabled'}>${m}</button>`).join('');
  return sectionTitle('Island Runway','Follow the spotlight in your studio look.',true)+`<div class="workbench"><section class="display"><div class="map-bar"><span>${icon('star',16)} Runway rehearsal</span><span>✦</span></div><div class="doll-stage runway-stage" data-mark="${r.mark??1}"><canvas id="preview" aria-label="Your current runway look"></canvas></div><div class="runway-marks">${marks.map((m,i)=>`<span class="${r.mark===i?'lit':''}">${m}</span>`).join('')}</div></section><section class="panel game-details"><div class="eyeline">${icon('music')} RUNWAY REHEARSAL</div><h2>Spotlight steps</h2><p role="status" aria-live="polite">${r.note}</p><div class="pose-buttons">${labels}</div><button class="primary wide" data-action="rehearse">${r.phase==='ready'?'Start rehearsal':r.phase==='won'?'New rehearsal':'Replay cues'}</button><a class="sub-link" href="#booth">Take a runway postcard</a></section></div>`;
}
function showCue(i){
  if(route!=='runway')return;
  const r=rehearsal;
  if(i>=r.sequence.length){
    r.phase='repeat';r.mark=null;r.note='Your turn. Choose the first runway mark.';draw();return;
  }
  r.mark=r.sequence[i];r.note='Cue '+(i+1)+' of 3 · '+marks[r.mark];tone();draw();
  cueTimer=setTimeout(()=>{
    r.mark=null;r.note='…';draw();
    cueTimer=setTimeout(()=>showCue(i+1),300);
  },1050);
}
function startRunway(){
  const previous=rehearsal;
  resetRunway();
  rehearsal.sequence=previous.sequence.length&&previous.phase!=='won'?previous.sequence:Array.from({length:3},()=>Math.floor(Math.random()*3));
  rehearsal.phase='watch';showCue(0);
}
function performPose(i){
  const r=rehearsal;
  if(r.phase!=='repeat')return;
  r.mark=i;
  if(i!==r.sequence[r.step]){
    r.phase='retry';r.note='That was a different mark. Replay the cues and try this routine again.';
  }else if(++r.step===r.sequence.length){
    r.phase='won';r.note='Rehearsal complete! You hit all three marks and earned 6 stars.';
    state.stars+=6;persist();tone(true);say('Runway complete! You earned 6 stars.');
  }else r.note='Correct! Choose mark '+(r.step+1)+' of 3.';
  draw();
}
