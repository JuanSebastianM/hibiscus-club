// Hibiscus Club background music and sound effects.
// Everything is synthesized with the Web Audio API: no files, no samples.
// One AudioContext is shared by the endless music loop and the game's tone() effects.
const HibiscusMusic=(()=>{
  const BPM=118,STEP=60/BPM/4,BAR=16,AHEAD=.16,TICK=25,LEVEL=.2,SFX_LEVEL=.8;
  const SCALE=[0,2,4,5,7,9,11];
  const hz=m=>440*2**((m-69)/12);
  const deg=(d,base)=>base+12*Math.floor(d/7)+SCALE[((d%7)+7)%7];
  // Lead lines: one string per bar, one character per sixteenth note.
  // 5 6 7 = G4 A4 B4, c..b = C5..B5, C..A = C6..A6, '-' holds, '.' rests.
  const NOTE='567cdefgabCDEFGA';
  const A=['e-g-C---b-a-g---','d-g-b-D-C-b-g---','c-e-a---g-e-a-C-','C---a---g-f-e---',
           'e-g-C---b-C-D-E-','D---b-g-d-g-b-D-','C-a-e-a-C-D-E---','F-E-D-C-a---g---'];
  const A2=['e.e.g.C.E-D-C---','b.b.D.G.D-C-b---','C.C.E.A.G-E-C---','a-C-F---E-D-C-a-',
            'e.e.g.C.E-D-C-D-','E-D-b-g-D---b---','C-E-a-C-E-G-E-C-','D-C-a-g-f-e-d---'];
  const B=['a---C---a-g-f---','g---b---D-C-b---','b-g-e-g-b---E---','C---a---e---a---',
           'f-a-C-F-E-D-C-a-','b-D-G-F-E-D-b-g-','C-------e-g-C-E-','G-------E---C---'];
  const BRIDGE=['E-------C-------','D-------C---a---','g-------C---E---','D---------------',
                'E-------G-------','F-------E---D---','D-------F---E---','D---b---g---G---'];
  const parse=bars=>bars&&bars.map(s=>{
    const ev={};
    for(let i=0;i<16;i++){const k=NOTE.indexOf(s[i]);if(k<0)continue;let n=1;while(s[i+n]==='-')n++;ev[i]={d:k-3,len:n};}
    return ev;
  });
  // Chords are scale degrees of C major (0 = C, 4 = G, 5 = Am ...), one per bar.
  const SECTIONS=[
    {name:'sparkle intro',chords:[0,3,0,4],arp:1,pad:1,drums:'intro',bass:'long'},
    {name:'verse',chords:[0,4,5,3,0,4,5,3],lead:parse(A),pluck:1,drums:'four',bass:'bounce'},
    {name:'chorus',chords:[3,4,2,5,3,4,0,0],lead:parse(B),pad:1,pluck:1,drums:'pop',bass:'eighths'},
    {name:'verse 2',chords:[0,4,5,3,0,4,5,3],lead:parse(A2),pluck:1,pad:.6,shaker:1,drums:'four',bass:'bounce'},
    {name:'bridge',chords:[5,3,0,4,5,3,1,4],lead:parse(BRIDGE),pad:1,arp:1,drums:'half',bass:'long'},
    {name:'chorus 2',chords:[3,4,2,5,3,4,0,0],lead:parse(B),harmony:1,pad:1,pluck:1,shaker:1,drums:'pop',bass:'eighths'}
  ];
  let at=0;SECTIONS.forEach(s=>{s.start=at;s.bars=s.chords.length;at+=s.bars;});
  const CYCLE_BARS=at,CYCLE_STEPS=CYCLE_BARS*BAR;
  const BASS={bounce:{0:[0,2],3:[0,2],6:[0,2],8:[0,2],10:[7,2],12:[0,2],14:[4,2]},
    eighths:{0:[0,2],2:[0,2],4:[7,2],6:[0,2],8:[0,2],10:[0,2],12:[7,2],14:[4,2]},
    long:{0:[0,7],8:[4,7]}};

  let ctx=null,chain=null,timer=null,offTimer=null,wanted=false,unlocked=false,step=0,nextTime=0,sfxCount=0;
  const stats={steps:0,notes:0,cycles:0,timersStarted:0,activeTimers:0,starts:0,stops:0};

  // ---- signal chain -------------------------------------------------------
  function makeReverb(c,seconds){
    const len=Math.floor(c.sampleRate*seconds),buf=c.createBuffer(2,len,c.sampleRate);
    for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len)**3.2;}
    const r=c.createConvolver();r.buffer=buf;return r;
  }
  function makeFx(c,out){
    const rev=makeReverb(c,2.2),revOut=c.createGain();revOut.gain.value=.35;rev.connect(revOut);revOut.connect(out);
    const dly=c.createDelay(1),fb=c.createGain(),tone=c.createBiquadFilter(),wet=c.createGain();
    dly.delayTime.value=STEP*3;fb.gain.value=.32;tone.type='lowpass';tone.frequency.value=3600;wet.gain.value=.22;
    dly.connect(tone);tone.connect(fb);fb.connect(dly);tone.connect(wet);wet.connect(out);wet.connect(rev);
    return {dry:out,rev,dly};
  }
  function buildChain(c,musicLevel){
    const comp=c.createDynamicsCompressor();
    comp.threshold.value=-20;comp.knee.value=12;comp.ratio.value=4;comp.attack.value=.01;comp.release.value=.2;
    const limit=c.createDynamicsCompressor();
    limit.threshold.value=-4;limit.knee.value=0;limit.ratio.value=20;limit.attack.value=.002;limit.release.value=.1;
    const out=c.createGain();out.gain.value=.9;
    comp.connect(limit);limit.connect(out);out.connect(c.destination);
    const music=c.createGain();music.gain.value=musicLevel;music.connect(comp);
    const sfx=c.createGain();sfx.gain.value=SFX_LEVEL;sfx.connect(comp);
    const noise=c.createBuffer(1,c.sampleRate,c.sampleRate),nd=noise.getChannelData(0);
    for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
    return {c,music,sfx,m:makeFx(c,music),s:makeFx(c,sfx),noise};
  }

  // ---- instruments --------------------------------------------------------
  function osc(c,type,f,t,end,dest,detune=0){
    const o=c.createOscillator();o.type=type;o.frequency.setValueAtTime(f,t);o.detune.value=detune;o.connect(dest);o.start(t);o.stop(end);return o;
  }
  function env(c,t,peak,attack,decay,dest){
    const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+attack);
    g.gain.exponentialRampToValueAtTime(.0001,t+attack+decay);if(dest)g.connect(dest);return g;
  }
  function sends(fx,node,rev,dly){
    node.connect(fx.dry);
    if(rev){const g=fx.dry.context.createGain();g.gain.value=rev;node.connect(g);g.connect(fx.rev);}
    if(dly){const g=fx.dry.context.createGain();g.gain.value=dly;node.connect(g);g.connect(fx.dly);}
  }
  // Glockenspiel-style bell: sine fundamental plus inharmonic partials that die quickly.
  function bell(fx,t,m,vel,decay=1){
    const c=fx.dry.context,f=hz(m),bus=c.createGain();sends(fx,bus,.5,.6);
    const end=t+decay+.05;
    osc(c,'sine',f,t,end,env(c,t,vel,.003,decay,bus));
    const ny=c.sampleRate*.45;
    if(f*2.76<ny)osc(c,'sine',f*2.76,t,end,env(c,t,vel*.22,.002,decay*.35,bus));
    if(f*5.4<ny)osc(c,'sine',f*5.4,t,end,env(c,t,vel*.08,.001,decay*.15,bus));
    stats.notes++;
  }
  function pluck(fx,t,ms,vel){
    const c=fx.dry.context,lp=c.createBiquadFilter();lp.type='lowpass';lp.Q.value=2;
    lp.frequency.setValueAtTime(3200,t);lp.frequency.exponentialRampToValueAtTime(700,t+.16);
    const g=env(c,t,vel,.004,.22,lp);sends(fx,lp,.25,0);
    ms.forEach((m,i)=>osc(c,'triangle',hz(m),t,t+.3,g,i?4:-4));
    stats.notes++;
  }
  function pad(fx,t,ms,dur,vel){
    const c=fx.dry.context,lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=1500;
    const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vel,t+.3);
    g.gain.setValueAtTime(vel,t+dur-.1);g.gain.linearRampToValueAtTime(0,t+dur+.35);
    g.connect(lp);sends(fx,lp,.6,0);
    ms.forEach(m=>{osc(c,'triangle',hz(m),t,t+dur+.4,g,-7);osc(c,'triangle',hz(m),t,t+dur+.4,g,7);});
    stats.notes++;
  }
  function bass(fx,t,m,dur,vel){
    const c=fx.dry.context,lp=c.createBiquadFilter();lp.type='lowpass';lp.frequency.value=650;
    const g=c.createGain();g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vel,t+.006);
    g.gain.exponentialRampToValueAtTime(vel*.5,t+dur*.8);g.gain.linearRampToValueAtTime(0,t+dur);
    g.connect(lp);lp.connect(fx.dry);
    osc(c,'triangle',hz(m),t,t+dur+.02,g);osc(c,'sine',hz(m),t,t+dur+.02,g);
    stats.notes++;
  }
  function kick(fx,t,vel){
    const c=fx.dry.context,o=c.createOscillator(),g=env(c,t,vel,.002,.26,fx.dry);
    o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(46,t+.12);o.connect(g);o.start(t);o.stop(t+.3);
    stats.notes++;
  }
  function noiseHit(fx,t,vel,type,freq,decay,rev=0,q=.7){
    const c=fx.dry.context,src=c.createBufferSource(),f=c.createBiquadFilter();
    src.buffer=chainOf(fx).noise;src.playbackRate.value=.8+((t*997)%1)*.4;
    f.type=type;f.frequency.value=freq;f.Q.value=q;
    const g=env(c,t,vel,.001,decay,null);src.connect(f);f.connect(g);sends(fx,g,rev,0);
    src.start(t);src.stop(t+decay+.05);
    stats.notes++;
  }
  function clap(fx,t,vel){
    for(let i=0;i<3;i++)noiseHit(fx,t+i*.011,vel*(i===2?1:.6),'bandpass',1500,i===2?.16:.02,.4,.9);
  }
  const hat=(fx,t,vel,open)=>noiseHit(fx,t,vel,'highpass',7500,open?.22:.045);
  const shaker=(fx,t,vel)=>noiseHit(fx,t,vel,'bandpass',6200,.06,0,1.2);
  const chainOf=fx=>fx.chain;

  // ---- arrangement --------------------------------------------------------
  function sectionAt(bar){for(let i=SECTIONS.length-1;i>=0;i--)if(bar>=SECTIONS[i].start)return SECTIONS[i];return SECTIONS[0];}
  function voicing(root,base){return [0,2,4].map(k=>{let m=deg(root+k,base);while(m>base+10)m-=12;return m;}).sort((a,b)=>a-b);}
  function scheduleStep(ch,s,t){
    const fx=ch.m,cs=((s%CYCLE_STEPS)+CYCLE_STEPS)%CYCLE_STEPS,barInCycle=Math.floor(cs/BAR),i=cs%BAR;
    const sec=sectionAt(barInCycle),b=barInCycle-sec.start,root=sec.chords[b],last=b===sec.bars-1;
    const sway=1+.08*Math.sin(s*1.7);// light humanised velocity
    // chords
    if(sec.pad&&i===0)pad(fx,t,voicing(root,57),BAR*STEP,.05*sec.pad);
    if(sec.pluck&&i%4===2)pluck(fx,t,voicing(root,64),.06*sway);
    if(sec.arp&&i%2===0){const tones=voicing(root,76).concat(voicing(root,76)[0]+12),order=[0,1,2,3,2,1,3,1];bell(fx,t,tones[order[(i/2)%8]],.035*sway,.45);}
    // lead
    const ev=sec.lead&&sec.lead[b][i];
    if(ev){const dur=Math.min(1.4,.35+ev.len*STEP);bell(fx,t,deg(ev.d,72),.11*sway,dur);if(sec.harmony)bell(fx,t,deg(ev.d-2,72),.05,dur);}
    // bass
    const bp=BASS[sec.bass][i];
    if(bp&&!(sec.drums==='intro'&&i))bass(fx,t,deg(root+bp[0],36),bp[1]*STEP,.2);
    // drums
    const d=sec.drums;
    if(d==='four'||d==='pop'){
      if(i%4===0)kick(fx,t,.32);
      if(i===4||i===12)clap(fx,t,.16);
      if(i%4===2)hat(fx,t,.06,d==='pop'&&i===14);
      else if(i%2===1)hat(fx,t,.025*sway,false);
      if(last&&i>=12)hat(fx,t,.05,false);
      if(last&&d==='pop'&&(i===14||i===15))clap(fx,t,.1);
    }else if(d==='half'){
      if(i===0||i===10)kick(fx,t,.26);
      if(i===8)clap(fx,t,.15);
      if(i%2===0)hat(fx,t,i%4===2?.045:.025,false);
      if(last&&i>=8&&i%2===0)clap(fx,t,.05+i*.006);
    }else if(d==='intro'){
      if(i%4===2)hat(fx,t,.03,false);
      if(last&&i>=8)clap(fx,t,.03+(i-8)*.012);
      if(b>=2&&i===0)kick(fx,t,.2);
    }
    if(sec.shaker&&i%2===1)shaker(fx,t,.03*sway);
    stats.steps++;
    if(cs===CYCLE_STEPS-1)stats.cycles++;
  }
  function wrapChain(ch){ch.m.chain=ch;ch.s.chain=ch;return ch;}

  // ---- live scheduler -----------------------------------------------------
  function pump(){
    if(!ctx)return;
    const now=ctx.currentTime;
    if(nextTime<now-.05)nextTime=now+.05;// fell behind (throttled tab): skip ahead, never burst
    while(nextTime<now+AHEAD){scheduleStep(chain,step,nextTime);step++;nextTime+=STEP;}
  }
  function startTimer(){
    if(timer||!ctx||document.hidden)return;
    nextTime=Math.max(nextTime,ctx.currentTime+.06);
    timer=setInterval(pump,TICK);stats.timersStarted++;stats.activeTimers++;pump();
  }
  function stopTimer(){if(timer){clearInterval(timer);timer=null;stats.activeTimers--;}}
  function ensureCtx(){
    if(ctx)return ctx;
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
    ctx=new AC();chain=wrapChain(buildChain(ctx,0));return ctx;
  }
  function fade(to,seconds){
    const g=chain.music.gain,now=ctx.currentTime;
    g.cancelScheduledValues(now);g.setValueAtTime(g.value,now);g.linearRampToValueAtTime(to,now+seconds);
  }
  function apply(){
    if(!unlocked&&!ctx)return;
    clearTimeout(offTimer);offTimer=null;
    if(wanted){
      if(!ensureCtx())return;
      if(!document.hidden)ctx.resume().catch(()=>{});
      const fresh=!timer;startTimer();
      if(fresh)stats.starts++;
      fade(LEVEL,stats.starts===1&&fresh?1.5:.6);
    }else if(ctx){
      fade(0,.45);
      offTimer=setTimeout(()=>{offTimer=null;if(wanted)return;stopTimer();stats.stops++;ctx.suspend().catch(()=>{});},520);
    }
  }
  function unlock(){if(unlocked)return;unlocked=true;if(wanted)apply();}
  ['pointerdown','keydown','touchend','click'].forEach(type=>window.addEventListener(type,unlock,{capture:true}));
  document.addEventListener('visibilitychange',()=>{
    if(!ctx)return;
    if(document.hidden){stopTimer();ctx.suspend().catch(()=>{});}
    else if(wanted&&!offTimer){ctx.resume().catch(()=>{});startTimer();}
  });

  // ---- sound effects ------------------------------------------------------
  const SPARK=[88,91,93,96,91,93];
  function sparkle(fx,t){
    const c=fx.dry.context,m=SPARK[sfxCount++%SPARK.length];
    [[m,0,.16],[m+7,.055,.09]].forEach(([n,dt,v])=>{
      const o=c.createOscillator(),g=env(c,t+dt,v,.003,.18,null);sends(fx,g,.35,.25);
      o.type='sine';o.frequency.setValueAtTime(hz(n)*.94,t+dt);o.frequency.exponentialRampToValueAtTime(hz(n),t+dt+.025);
      o.connect(g);o.start(t+dt);o.stop(t+dt+.22);
      osc(c,'triangle',hz(n)*2,t+dt,t+dt+.1,env(c,t+dt,v*.15,.002,.06,g));
    });
    noiseHit(fx,t,.025,'highpass',9000,.08,.3);
  }
  function fanfare(fx,t){
    const c=fx.dry.context;
    [72,76,79,84].forEach((m,i)=>{bell(fx,t+i*.075,m,.16,.5);osc(c,'triangle',hz(m),t+i*.075,t+i*.075+.2,env(c,t+i*.075,.05,.004,.15,fx.dry));});
    const ct=t+.3,lfo=c.createOscillator(),depth=c.createGain();lfo.frequency.value=6;depth.gain.value=12;lfo.connect(depth);lfo.start(ct);lfo.stop(ct+1.1);
    const g=c.createGain();g.gain.setValueAtTime(0,ct);g.gain.linearRampToValueAtTime(.07,ct+.03);g.gain.exponentialRampToValueAtTime(.0001,ct+1);sends(fx,g,.6,.3);
    [84,88,91].forEach(m=>{const o=osc(c,'triangle',hz(m),ct,ct+1.05,g);depth.connect(o.detune);});
    const sh=[96,98,100,103,105,108,105,103,100,108];
    sh.forEach((m,i)=>bell(fx,ct+.05+i*.045,m,.06*(1-i/14),.35));
    const src=c.createBufferSource(),hp=c.createBiquadFilter(),ng=env(c,ct,.03,.05,.5,null);
    src.buffer=fx.chain.noise;hp.type='highpass';hp.frequency.setValueAtTime(3000,ct);hp.frequency.exponentialRampToValueAtTime(11000,ct+.5);
    src.connect(hp);hp.connect(ng);sends(fx,ng,.5,0);src.start(ct);src.stop(ct+.6);
  }

  return {
    BPM,CYCLE_BARS,CYCLE_SECONDS:CYCLE_STEPS*STEP,sections:SECTIONS.map(s=>s.name),stats,
    get context(){return ctx},
    get running(){return !!timer},
    setEnabled(on){wanted=!!on;apply();},
    effect(win){
      if(!ensureCtx())return;
      if(ctx.state!=='running')ctx.resume().catch(()=>{});
      (win?fanfare:sparkle)(chain.s,ctx.currentTime+.01);
    },
    // Debug helpers for testing: jump to a bar of the cycle, render offline.
    seek(bar){step=Math.floor(step/CYCLE_STEPS)*CYCLE_STEPS+bar*BAR;},
    position(){const cs=step%CYCLE_STEPS,bar=Math.floor(cs/BAR);return {step,bar,section:sectionAt(bar).name};},
    render(seconds=20,fromBar=0,withEffects=false){
      const rate=44100,oc=new OfflineAudioContext(2,Math.ceil(rate*seconds),rate),ch=wrapChain(buildChain(oc,LEVEL)),saved={...stats};
      for(let s=fromBar*BAR,t=.05;t<seconds;s++,t+=STEP)scheduleStep(ch,s,t);
      if(withEffects)for(let t=.5;t<seconds;t+=2){sparkle(ch.s,t);if(Math.round(t)%6===4)fanfare(ch.s,t+.7);}
      Object.assign(stats,saved);// offline renders do not count as live scheduling
      return oc.startRendering();
    }
  };
})();
