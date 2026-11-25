/* Hibiscus Club ambience: the sound of each place, synthesized live with the Web Audio API like the music
   (music.js). No recordings, no files, nothing fetched. Every layer is generated from filtered noise and
   oscillators with randomized timing, so it never repeats as a loop.

   The wind you hear is the wind you see: the palm and leaf layers follow HibiscusNature.wind() for the
   place, the same signal that bends the plants in scene-fx.js, and the surf swells when the foam washes in
   (HibiscusNature.wash). Gusts travel across the picture, so they also travel across the stereo field.

     HibiscusAmbience.setEnabled(on)      follows the speaker button (with the music)
     HibiscusAmbience.setPlace(id)        'island' (the map), a walk-in place id, or a room id (silent)
     HibiscusAmbience.render(id, seconds) an OfflineAudioContext render of one place (tests, listening)

   It shares the music's AudioContext and joins its output after the music's compressor (HibiscusMusic
   .ambienceBus()), well under the music, with its own soft limiter; it dips while a click sparkle or a
   fanfare plays, cross-fades over 1.2 s between places, stops with the tab hidden and fades out with the
   sound off. Only starts after a click or key press (browsers require it). */
const HibiscusAmbience=(()=>{
  const LEVEL=.9,FADE=1.2,AHEAD=.5,TICK=120,CTRL=.1;
  /* Per place: which layers play and how loud (0..1 of each layer's own level). Rooms are silent. */
  const MIXES={
    island:{wind:{level:.55,palms:.35},surf:{level:.5,far:1},gulls:{level:.45,every:[10,24]}},
    beach:{surf:{level:.75,far:0},gulls:{level:.8,every:[6,15]},wind:{level:.7,palms:1}},
    boardwalk:{surf:{level:.65,far:.5},gulls:{level:.65,every:[8,20]},wind:{level:.5,palms:.5},flutter:{level:.6},murmur:{level:.35}},
    market:{wind:{level:.75,palms:.35},leaves:{level:.6},songbirds:{level:1,every:[3,8]},chimes:{level:.8},murmur:{level:.8}},
    pavilion:{crickets:{level:1,count:3,pitch:4600},surf:{level:.4,far:1},wind:{level:.55,palms:.3}},
    park:{songbirds:{level:1,every:[2.5,7]},leaves:{level:.8},wind:{level:.75,palms:.5},flutter:{level:.9},bubbles:{level:.45}},
    icecream:{surf:{level:.45,far:1},murmur:{level:.8},cart:{level:.8,every:[35,80]},wind:{level:.55,palms:.45},gulls:{level:.4,every:[16,36]}},
    treehouse:{waterfall:{level:.8},bubbles:{level:.25},jungle:{level:.8,every:[4,11]},parrot:{level:.5,every:[25,60]},crickets:{level:.4,count:2,pitch:6200},leaves:{level:.8},wind:{level:.45,palms:.6}},
    garden:{songbirds:{level:.6,every:[5,13]},wind:{level:.5,palms:0}},
    wardrobe:null,salon:null,arcade:null,booth:null,house:null,scrapbook:null,runway:null
  };
  const nature=()=>typeof HibiscusNature!=='undefined'?HibiscusNature:null;
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const pick=a=>a[Math.random()*a.length|0];
  const hz=m=>440*2**((m-69)/12);
  const windDirOf=id=>{try{const s=HibiscusSceneData.scenes[id];return s.windDir||Math.sign(s.particles.find(p=>p.kind==='petal')?.wind?.[0]||1)||1}catch{return 1}};
  /* Where the scheduler may write next: never before now (plus a small margin), never past the horizon. */
  function window_(until,now,ahead=AHEAD){const from=Math.max(until,now+.03);return {from,to:Math.max(from,now+ahead)}}

  /* ---------- node helpers: every node is tracked, transient ones are released when they end ---------- */
  const mk=(E,n)=>{E.nodes.add(n);return n};
  function release(E,list){for(const n of list){try{n.disconnect()}catch{}E.nodes.delete(n)}}
  function after(E,src,list){src.onended=()=>release(E,list)}
  const G=(E,v)=>{const g=mk(E,E.c.createGain());g.gain.value=v;return g};
  const F=(E,type,f,q)=>{const n=mk(E,E.c.createBiquadFilter());n.type=type;n.frequency.value=f;if(q!=null)n.Q.value=q;return n};
  const P=(E,p)=>{if(!E.c.createStereoPanner)return G(E,1);const n=mk(E,E.c.createStereoPanner());n.pan.value=Math.max(-1,Math.min(1,p));return n};
  const O=(E,type,f)=>{const o=mk(E,E.c.createOscillator());o.type=type;o.frequency.value=f;return o};
  const S=(E,buf,loop)=>{const s=mk(E,E.c.createBufferSource());s.buffer=buf;s.loop=!!loop;return s};
  const wire=(...n)=>{for(let i=0;i<n.length-1;i++)n[i].connect(n[i+1]);return n[n.length-1]};
  const ctl=(param,v,t,tc=.08)=>param.setTargetAtTime(v,t,tc);
  function env(param,t,peak,a,d){param.setValueAtTime(0,t);param.linearRampToValueAtTime(peak,t+a);param.exponentialRampToValueAtTime(.0001,t+a+d)}
  /* A persistent looping noise source (started with the place, stopped with it). */
  function bed(E,buf,rate=1){const s=S(E,buf,true);s.playbackRate.value=rate;s.loopStart=0;E.persist.push(s);s.start(E.t0,rnd(0,buf.duration*.9));return s}

  function noiseBuffers(c){
    const make=(sec,kind)=>{
      const n=Math.floor(c.sampleRate*sec),buf=c.createBuffer(1,n,c.sampleRate),d=buf.getChannelData(0);
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0,last=0;
      for(let i=0;i<n;i++){
        const w=Math.random()*2-1;
        if(kind==='white')d[i]=w*.5;
        else if(kind==='pink'){b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;d[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.09;b6=w*.115926}
        else{last=(last+.02*w)/1.02;d[i]=last*3}
      }
      // fade the seam so the loop point never clicks
      const k=Math.min(2000,n>>3);for(let i=0;i<k;i++){const f=i/k;d[n-1-i]=d[n-1-i]*f+d[i]*(1-f)}
      return buf;
    };
    return {white:make(5,'white'),pink:make(7,'pink'),brown:make(7,'brown')};
  }

  /* ---------- layers: each returns {ctl(t,clk), ev(from,to)} ---------- */
  const L={};
  // Wind: a broad breath that rises and brightens with each gust, left and right following the gust across
  // the picture; and the dry rustle of palm fronds on top, which only comes in when the wind picks up.
  L.wind=(E,o)=>{
    const sides=[-1,1].map(side=>{
      const src=bed(E,E.buf.pink,side<0?1:.93),bp=F(E,'bandpass',400,.6),g=G(E,0),pan=P(E,side*.55);
      wire(src,bp,g,pan,E.out);
      const hs=bed(E,E.buf.white,side<0?1:1.07),hp=F(E,'highpass',1800,.5),pk=F(E,'lowpass',6500,.5),hg=G(E,0),hpan=P(E,side*.7);
      wire(hs,hp,pk,hg,hpan,E.out);
      return {side,bp,g,hg};
    });
    return {ctl(t,clk){
      for(const s of sides){
        const x=s.side<0?.15:.85,w=E.wind(clk,x);
        ctl(s.bp.frequency,260+620*w,t,.12);
        ctl(s.g.gain,o.level*(.012+.07*w**1.7),t,.15);
        const r=Math.max(0,w-.32);
        ctl(s.hg.gain,o.level*o.palms*(.0006+.05*r**1.3)*rnd(.55,1.45),t,.035);
      }
    }};
  };
  // Leaves: tiny grains of rustle, more of them in a gust.
  L.leaves=(E,o)=>({ev(from,to){
    const w=E.wind(E.clock(from),.5),rate=1.5+16*Math.max(0,w-.18);
    for(let t=from+rnd(0,1/rate);t<to;t+=rnd(.3,1.7)/rate){
      const len=rnd(.04,.13),src=S(E,E.buf.white),bp=F(E,'bandpass',rnd(2600,6800),rnd(.8,1.6)),g=G(E,0),pan=P(E,rnd(-.8,.8));
      wire(src,bp,g,pan,E.out);env(g.gain,t,o.level*rnd(.014,.04)*(.4+w),.012,len);
      src.start(t,rnd(0,4));src.stop(t+len+.05);after(E,src,[src,bp,g,pan]);
    }
  }});
  // Surf: a low bed of distant sea, and a wave that rushes up the sand and slides back each time the foam
  // washes in (HibiscusNature.wash, the same cycle the picture shows); now and then a bigger one.
  L.surf=(E,o)=>{
    const far=o.far||0;
    for(const side of [-1,1]){const s=bed(E,E.buf.brown,side<0?1:.9),lp=F(E,'lowpass',far?380:620,.5),g=G(E,o.level*(far?.028:.04)),pan=P(E,side*.6);wire(s,lp,g,pan,E.out)}
    return {ev(from,to){
      const N=nature();if(!N)return;
      const c0=E.clock(from),c1=E.clock(to),start=N.washStart(c1,.5);
      if(start<c0||start>=c1)return;
      const t=from+(start-c0),A=N.washAmp(Math.floor(N.washPhase(c1,.5))),peak=o.level*(far?.014:.034)*A,dur=7.6;
      const pan=P(E,rnd(-.35,.35));
      const s1=S(E,E.buf.pink),lp=F(E,'lowpass',300,.7),g1=G(E,0);wire(s1,lp,g1,pan);
      lp.frequency.setValueAtTime(300,t);lp.frequency.exponentialRampToValueAtTime(far?900:2600,t+2.3);lp.frequency.exponentialRampToValueAtTime(far?300:500,t+dur);
      g1.gain.setValueAtTime(0,t);g1.gain.linearRampToValueAtTime(peak*.35,t+1.2);g1.gain.linearRampToValueAtTime(peak,t+2.4);g1.gain.exponentialRampToValueAtTime(.0001,t+dur);
      // the hiss of foam sliding back over the sand
      const s2=S(E,E.buf.white),hp=F(E,'bandpass',far?2200:3400,.6),g2=G(E,0);wire(s2,hp,g2,pan);
      g2.gain.setValueAtTime(0,t+2);g2.gain.linearRampToValueAtTime(peak*(far?.12:.28),t+2.8);g2.gain.exponentialRampToValueAtTime(.0001,t+dur-.3);
      pan.connect(E.out);
      s1.start(t,rnd(0,5));s1.stop(t+dur+.1);s2.start(t+2,rnd(0,3));s2.stop(t+dur);
      after(E,s1,[s1,lp,g1,pan]);after(E,s2,[s2,hp,g2]);
    }};
  };
  /* Sparse calls: a scheduler that fires `call(t)` at random gaps from `every` seconds. */
  const sparse=(E,every,call,first=.3)=>{let next=null;return {ev(from,to){
    if(next==null)next=from+rnd(every[0]*first,every[1]*first);
    while(next<to){if(next>=from)call(next);next+=rnd(every[0],every[1])}
  }}};
  // One bird note: a sine (or a buzzier wave) gliding between pitches with a soft attack.
  function note(E,t,{f0,f1,f2,dur,peak,pan,type='sine',bp,rev=.25,vib}){
    const o=O(E,type,f0),g=G(E,0),p=P(E,pan),list=[o,g,p];
    o.frequency.setValueAtTime(f0,t);
    if(f2){o.frequency.exponentialRampToValueAtTime(f1,t+dur*.3);o.frequency.exponentialRampToValueAtTime(f2,t+dur)}else o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    let head=o;
    if(bp){const b=F(E,'bandpass',bp,2.2);list.push(b);o.connect(b);head=b}
    if(vib){const lfo=O(E,'sine',vib[0]),d=G(E,vib[1]);lfo.connect(d);d.connect(o.frequency);lfo.start(t);lfo.stop(t+dur+.05);list.push(lfo,d)}
    wire(head,g,p,E.out);
    if(rev){const s=G(E,rev);list.push(s);p.connect(s);s.connect(E.rev)}
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+Math.min(.025,dur*.25));g.gain.setValueAtTime(peak,t+dur*.6);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.start(t);o.stop(t+dur+.05);after(E,o,list);
  }
  // Gulls: a few soft "kyow" calls, far off over the water.
  L.gulls=(E,o)=>sparse(E,o.every,t=>{
    const n=pick([1,2,2,3,4]),base=rnd(900,1250),pan=rnd(-.8,.8),far=rnd(.45,1);
    for(let i=0;i<n;i++){const tt=t+i*rnd(.3,.42),f=base*rnd(.95,1.05);
      note(E,tt,{f0:f*.85,f1:f*1.3,f2:f*.78,dur:rnd(.26,.36),peak:o.level*.032*far,pan,type:'sawtooth',bp:rnd(1700,2100),rev:.4,vib:[rnd(22,30),f*.03]})}
  });
  // Songbirds: three kinds of phrase (falling whistles, a quick trill, a two-note "tsee-too").
  function songPhrase(E,t,level,pan){
    const kind=pick(['whistle','whistle','trill','tseetoo']),peak=level*.012;
    if(kind==='whistle'){const f=rnd(2600,4000),n=pick([2,3,3,4]);for(let i=0;i<n;i++)note(E,t+i*rnd(.17,.24),{f0:f*rnd(1.05,1.15),f1:f*rnd(.78,.88),dur:rnd(.1,.17),peak,pan})}
    else if(kind==='trill'){const f=rnd(4000,5200),n=pick([7,9,11,13]),gap=rnd(.045,.065);for(let i=0;i<n;i++)note(E,t+i*gap,{f0:f*1.12,f1:f*.9,dur:gap*.8,peak:peak*(1-i/n*.4),pan})}
    else{note(E,t,{f0:5200,f1:4800,dur:.12,peak,pan});note(E,t+.2,{f0:3400,f1:3100,f2:3300,dur:.22,peak:peak*.9,pan})}
  }
  L.songbirds=(E,o)=>sparse(E,o.every,t=>songPhrase(E,t,o.level,rnd(-.9,.9)));
  // Jungle: slow rising whistles, a dove's soft "hoo hoo-hoo", and songbird phrases.
  L.jungle=(E,o)=>sparse(E,o.every,t=>{
    const r=Math.random(),pan=rnd(-.9,.9);
    if(r<.35){const f=rnd(900,1300);note(E,t,{f0:f,f1:f*1.6,dur:rnd(.35,.5),peak:o.level*.01,pan,rev:.4});note(E,t+rnd(.55,.7),{f0:f*1.5,f1:f*.95,dur:.4,peak:o.level*.008,pan,rev:.4})}
    else if(r<.6){const f=rnd(430,520);[[0,.32],[.55,.18],[.8,.36]].forEach(([d,len],i)=>note(E,t+d,{f0:f*(i===1?1.06:1),f1:f*.92,dur:len,peak:o.level*.02,pan,rev:.35}))}
    else songPhrase(E,t,o.level*.8,pan);
  });
  // Parrot: now and then a short squawk from the canopy, kept soft.
  L.parrot=(E,o)=>sparse(E,o.every,t=>{
    const pan=rnd(-.7,.7),n=pick([1,2]),f=rnd(650,800);
    for(let i=0;i<n;i++)note(E,t+i*.28,{f0:f,f1:f*1.45,f2:f*1.05,dur:rnd(.18,.24),peak:o.level*.02,pan,type:'sawtooth',bp:rnd(1300,1700),rev:.35,vib:[rnd(55,75),f*.08]});
  });
  // Crickets and evening insects: steady little pulse trains, each insect its own pitch and rhythm.
  L.crickets=(E,o)=>{
    const bugs=Array.from({length:o.count||2},()=>{
      const osc=O(E,'sine',(o.pitch||4600)*rnd(.92,1.08)),g=G(E,0),pan=P(E,rnd(-.85,.85));
      wire(osc,g,pan,E.out);E.persist.push(osc);osc.start(E.t0);
      return {g,next:null,period:rnd(.55,.95),pulses:pick([2,3,3,4]),peak:o.level*rnd(.006,.011)};
    });
    return {ev(from,to){
      for(const b of bugs){
        if(b.next==null)b.next=from+rnd(0,1);
        while(b.next<to){
          if(b.next>=from)for(let k=0;k<b.pulses;k++){const t=b.next+k*.042;b.g.gain.setValueAtTime(0,t);b.g.gain.linearRampToValueAtTime(b.peak,t+.006);b.g.gain.linearRampToValueAtTime(0,t+.024)}
          b.next+=Math.random()<.06?rnd(2,5):b.period*rnd(.95,1.05);
        }
      }
    }};
  };
  // Waterfall: a steady rush, a low rumble and a bright spray, wandering a little.
  L.waterfall=(E,o)=>{
    const parts=[];
    for(const side of [-1,1]){const s=bed(E,E.buf.pink,side<0?1:1.04),hp=F(E,'highpass',180,.5),lp=F(E,'lowpass',2600,.5),g=G(E,o.level*.036),pan=P(E,side*.35);wire(s,hp,lp,g,pan,E.out);parts.push(g)}
    const r=bed(E,E.buf.brown),rl=F(E,'lowpass',260,.6),rg=G(E,o.level*.03);wire(r,rl,rg,E.out);
    const sp=bed(E,E.buf.white,.97),sb=F(E,'bandpass',4800,.6),sg=G(E,o.level*.007);wire(sp,sb,sg,E.out);
    return {ctl(t){for(const g of parts)ctl(g.gain,o.level*.036*rnd(.85,1.12),t,.4)}};
  };
  // Bubbles: a stream or a fountain basin, little rising "plinks" over a soft trickle.
  L.bubbles=(E,o)=>{
    const s=bed(E,E.buf.white,.9),bp=F(E,'bandpass',1900,.9),g=G(E,o.level*.012);wire(s,bp,g,E.out);
    return {ev(from,to){
      for(let t=from+rnd(0,.15);t<to;t+=rnd(.04,.22)){const f=rnd(500,1400);note(E,t,{f0:f,f1:f*rnd(1.4,1.9),dur:rnd(.025,.05),peak:o.level*rnd(.006,.016),pan:rnd(-.6,.6),rev:.15})}
    }};
  };
  // Murmur: people chatting far away, without words: noise shaped by moving vowel-like resonances.
  L.murmur=(E,o)=>{
    const lp=F(E,'lowpass',1500,.5),out=G(E,o.level*.9);wire(lp,out,E.out);
    const voices=Array.from({length:3},(_,i)=>{
      const s=bed(E,E.buf.pink,1+i*.03),f1=F(E,'bandpass',500,4),f2=F(E,'bandpass',1500,5),g=G(E,0),pan=P(E,(i-1)*.6);
      s.connect(f1);s.connect(f2);f1.connect(g);f2.connect(g);wire(g,pan,lp);
      return {f1,f2,g,next:0};
    });
    return {ev(from,to){
      for(const v of voices){
        if(v.next<from)v.next=from;
        while(v.next<to){const t=v.next,talk=Math.random()<.8;
          ctl(v.f1.frequency,rnd(300,800),t,.03);ctl(v.f2.frequency,rnd(900,2300),t,.03);
          ctl(v.g.gain,talk?o.level*rnd(.05,.12):0,t,.04);
          v.next+=talk?rnd(.1,.24):rnd(.4,1.6)}
      }
    }};
  };
  // Bell tone (like the music's): a sine with two quickly dying inharmonic partials.
  function bell(E,t,m,peak,decay,pan,rev=.5){
    const f=hz(m),g=G(E,1),p=P(E,pan),list=[g,p];wire(g,p,E.out);
    if(rev){const s=G(E,rev);p.connect(s);s.connect(E.rev);list.push(s)}
    let first=null;
    [[1,1,decay],[2.76,.22,decay*.35],[5.4,.07,decay*.15]].forEach(([k,v,d])=>{const o=O(E,'sine',f*k),e=G(E,0);wire(o,e,g);env(e.gain,t,peak*v,.003,d);o.start(t);o.stop(t+d+.05);list.push(o,e);first=first||o});
    after(E,first,list);// the fundamental rings longest: release everything when it ends
  }
  // A distant ice-cream cart chime: a short tune now and then.
  const TUNES=[[79,84,88,84,91,88],[84,86,88,91,88,84],[91,88,86,84,86,79]];
  L.cart=(E,o)=>sparse(E,o.every,t=>{const tune=pick(TUNES),pan=rnd(.2,.6);tune.forEach((m,i)=>bell(E,t+i*.24,m,o.level*.012,.9,pan,.7))},.15);
  // Wind chimes: struck by the gusts.
  const CHIME=[84,86,88,91,93,96];
  L.chimes=(E,o)=>({ctl(t,clk){const w=E.wind(clk,.5),p=Math.max(0,w-.42)*2.6*CTRL;if(Math.random()<p)bell(E,t+rnd(0,CTRL),pick(CHIME),o.level*rnd(.004,.009),rnd(1.8,2.8),rnd(-.5,.5),.5)}});
  // Flutter: bunting, kites and awnings flapping in the gusts.
  L.flutter=(E,o)=>{
    const s=bed(E,E.buf.pink,1.1),bp=F(E,'bandpass',320,1.1),am=G(E,.5),g=G(E,0),lfo=O(E,'sine',10),depth=G(E,.5);
    wire(s,bp,am,g,E.out);wire(lfo,depth,am.gain);E.persist.push(lfo);lfo.start(E.t0);
    return {ctl(t,clk){const w=E.wind(clk,.6);ctl(g.gain,o.level*.09*Math.max(0,w-.35)**1.2,t,.12);ctl(lfo.frequency,7+8*w,t,.3)}};
  };

  /* ---------- one place playing: its layers, its gain for the cross-fade ---------- */
  function instance(core,id,clock){
    const mix=MIXES[id];if(!mix)return null;
    const c=core.c,N=nature(),seed=N?N.seed(id):0,dir=windDirOf(id);
    const E={c,buf:core.buf,rev:core.rev,nodes:new Set(),persist:[],t0:c.currentTime+.02,clock,
      wind:(clk,x)=>N?N.wind(seed,clk,dir>0?x:1-x):.3};
    const out=E.out=G(E,0);out.connect(core.master);
    out.gain.setValueAtTime(0,E.t0);out.gain.linearRampToValueAtTime(1,E.t0+FADE);
    const layers=Object.entries(mix).map(([k,o])=>L[k](E,o));
    let until=0,ctlAt=0;
    return {id,E,
      tick(now){
        const w=window_(until,now);if(w.to<=w.from)return;
        if(ctlAt<w.from)ctlAt=w.from;
        for(;ctlAt<w.to;ctlAt+=CTRL){const clk=clock(ctlAt);for(const l of layers)l.ctl&&l.ctl(ctlAt,clk)}
        for(const l of layers)l.ev&&l.ev(w.from,w.to);
        until=w.to;
      },
      fadeOut(now){out.gain.cancelScheduledValues(now);out.gain.setValueAtTime(out.gain.value,now);out.gain.linearRampToValueAtTime(0,now+FADE);
        for(const s of E.persist)try{s.stop(now+FADE+.05)}catch{}},
      dispose(){release(E,[...E.nodes])},
      get nodes(){return E.nodes.size}
    };
  }
  /* The ambience's own output: master fade, a dip under sound effects, and a soft limiter. */
  function core(c,dest){
    const master=c.createGain(),duck=c.createGain(),lim=c.createDynamicsCompressor();
    master.gain.value=0;duck.gain.value=1;
    lim.threshold.value=-20;lim.knee.value=6;lim.ratio.value=12;lim.attack.value=.003;lim.release.value=.25;
    master.connect(duck);duck.connect(lim);lim.connect(dest);
    // a short generated room for the birds and chimes
    const len=Math.floor(c.sampleRate*1.6),ir=c.createBuffer(2,len,c.sampleRate);
    for(let ch=0;ch<2;ch++){const d=ir.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len)**3*.5}
    const rev=c.createConvolver();rev.buffer=ir;const revOut=c.createGain();revOut.gain.value=.5;rev.connect(revOut);revOut.connect(master);
    return {c,master,duck,lim,rev,buf:noiseBuffers(c)};
  }

  /* ---------- live control ---------- */
  let wanted=false,unlocked=false,place=null,live=null,cur=null,timer=null;
  const fading=new Set();
  const stats={started:0,crossfades:0};
  function ensure(){
    if(live)return live;
    let bus=null;try{bus=HibiscusMusic.ambienceBus()}catch{}
    if(!bus)return null;
    live=core(bus.context,bus);
    try{HibiscusMusic.onEffect(()=>{const d=live.duck.gain,n=live.c.currentTime;d.cancelScheduledValues(n);d.setTargetAtTime(.45,n,.03);d.setTargetAtTime(1,n+.4,.35)})}catch{}
    return live;
  }
  const liveClock=()=>{const N=nature(),c=live.c,base=(N?N.now():performance.now()/1000)-c.currentTime;return t=>base+t};
  function pump(){
    if(!live)return;
    const now=live.c.currentTime;
    if(cur)cur.tick(now);
    for(const f of fading)f.tick(now);
  }
  function startTimer(){if(!timer&&!document.hidden){timer=setInterval(pump,TICK);pump()}}
  function stopTimer(){if(timer){clearInterval(timer);timer=null}}
  function drop(inst){
    if(!inst)return;
    inst.fadeOut(live.c.currentTime);fading.add(inst);
    setTimeout(()=>{fading.delete(inst);inst.dispose()},(FADE+.4)*1000);
  }
  function apply(){
    if(!wanted||!unlocked||!place||!MIXES[place]){
      if(live){
        const n=live.c.currentTime,g=live.master.gain;g.cancelScheduledValues(n);g.setValueAtTime(g.value,n);g.linearRampToValueAtTime(0,n+(wanted&&unlocked?FADE:.45));
        if(cur){drop(cur);cur=null}
        if(!(wanted&&unlocked))setTimeout(()=>{if(!(wanted&&unlocked))stopTimer()},600);
      }
      return;
    }
    if(!ensure())return;
    const n=live.c.currentTime,g=live.master.gain;
    g.cancelScheduledValues(n);g.setValueAtTime(g.value,n);g.linearRampToValueAtTime(LEVEL,n+.6);
    if(!cur||cur.id!==place){if(cur){drop(cur);stats.crossfades++}cur=instance(live,place,liveClock());stats.started++}
    startTimer();
  }
  function unlock(){if(unlocked)return;unlocked=true;apply()}
  if(typeof window!=='undefined'&&window.addEventListener)['pointerdown','keydown','touchend','click'].forEach(type=>window.addEventListener(type,unlock,{capture:true}));
  if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTimer();else if(wanted&&unlocked&&cur)startTimer()});

  /* Offline render of one place (no music): resolves to an AudioBuffer. */
  function render(id,seconds=20,{rate=44100,clock0=1000}={}){
    const oc=new OfflineAudioContext(2,Math.ceil(rate*seconds),rate),k=core(oc,oc.destination);
    k.master.gain.value=LEVEL;
    const inst=instance(k,id,t=>clock0+t);
    if(inst)for(let t=0;t<seconds;t+=TICK/1000)inst.tick(t);
    return oc.startRendering();
  }
  return {
    MIXES,window:window_,instance,core,render,stats,
    setEnabled(on){wanted=!!on;apply()},
    setPlace(id){const p=Object.hasOwn(MIXES,id)?id:null;if(p===place)return;place=p;apply()},
    get place(){return place},
    get playing(){return !!(timer&&cur)},
    info:()=>({place,playing:!!(timer&&cur),nodes:(cur?cur.nodes:0)+[...fading].reduce((a,f)=>a+f.nodes,0),fading:fading.size,...stats})
  };
})();
