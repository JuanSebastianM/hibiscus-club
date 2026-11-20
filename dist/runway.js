/* Mark labels are i18n keys runway.mark.<i>; the note is stored as a key (+ vars) so it follows the language. */
const marks=[0,1,2];
const markName=i=>t('runway.mark.'+i);
let rehearsal, cueTimer;
function resetRunway(){
  clearTimeout(cueTimer);
  rehearsal={sequence:[],step:0,phase:'ready',mark:null,note:['runway.note.ready']};
}
function runway(){
  const r=rehearsal;
  const labels=marks.map(i=>`<button data-pose="${i}" aria-label="${t('runway.step.'+i)}" ${r.phase==='repeat'?'':'disabled'}>${markName(i)}</button>`).join('');
  return sectionTitle(t('page.runway'),t('runway.sub'),true)+`<div class="workbench"><section class="display"><div class="map-bar"><span>${icon('star',16)} ${t('runway.bar')}</span><span>✦</span></div><div class="doll-stage runway-stage" data-mark="${r.mark??1}"><canvas id="preview" role="img" aria-label="${t('runway.look')}"></canvas></div><div class="runway-marks">${marks.map(i=>`<span class="${r.mark===i?'lit':''}">${markName(i)}</span>`).join('')}</div></section><section class="panel game-details"><div class="eyeline">${icon('music')} ${t('runway.eyeline')}</div><h2>${t('runway.title')}</h2><p role="status" aria-live="polite">${t(...r.note)}</p><div class="pose-buttons">${labels}</div><button class="primary wide" data-action="rehearse">${t(r.phase==='ready'?'runway.start':r.phase==='won'?'runway.again':'runway.replay')}</button><a class="sub-link" href="#booth">${t('runway.postcard')}</a></section></div>`;
}
function showCue(i){
  if(route!=='runway')return;
  const r=rehearsal;
  if(i>=r.sequence.length){
    r.phase='repeat';r.mark=null;r.note=['runway.note.turn'];draw();return;
  }
  r.mark=r.sequence[i];r.note=['runway.note.cue',{n:i+1,get mark(){return markName(r.sequence[i])}}];tone();draw();
  cueTimer=setTimeout(()=>{
    r.mark=null;r.note=['runway.note.wait'];draw();
    cueTimer=setTimeout(()=>showCue(i+1),300);
  },1050);
}
function startRunway(){
  const previous=rehearsal;
  resetRunway();
  rehearsal.sequence=previous.sequence.length&&previous.phase!=='won'?previous.sequence:Array.from({length:3},()=>Math.floor(Math.random()*3));
  rehearsal.phase='watch';showCue(0);track('game-start','runway');
}
function performPose(i){
  const r=rehearsal;
  if(r.phase!=='repeat')return;
  r.mark=i;
  if(i!==r.sequence[r.step]){
    r.phase='retry';r.note=['runway.note.retry'];
  }else if(++r.step===r.sequence.length){
    r.phase='won';r.note=['runway.note.won'];
    state.stars+=6;persist();tone(true);say(t('runway.won'));track('game-done','runway');
  }else r.note=['runway.note.correct',{n:r.step+1}];
  draw();
}
