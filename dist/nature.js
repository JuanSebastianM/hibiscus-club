/* Hibiscus Club weather: one wind signal and one shoreline wash per place, shared by the living scenes
   (scene-fx.js, what you see) and the ambience (ambience.js, what you hear), so a gust that bends the
   palms is heard in the leaves at the same moment, and the surf sounds when the foam washes in.

   Everything here is a pure function of time (seconds on the page clock, `now()`), a place's seed and a
   position across the picture (x from 0 at the left edge to 1 at the right), so it needs no state, never
   drifts, and gives the same values for the same arguments every time.

     HibiscusNature.wind(seed, t, x)   0 .. WIND_MAX: a slow, gently wandering base breeze (about 0.15 to
                                       0.45) plus gusts every 6 to 15 s that rise over 2 to 3 s, die away
                                       over 2 to 4 s and travel across the picture with the wind
     HibiscusNature.wash(t, x)         0 .. WASH_MAX: the shoreline wash, a wave every 8.5 s that pushes in
                                       quickly and slides back slowly; now and then a bigger one
     HibiscusNature.washStart(t, x)    when the wave washing in at x at time t started
     HibiscusNature.seed(placeId)      a small stable number per place */
const HibiscusNature=(()=>{
  const WIND_MAX=1.5,WASH_MAX=1.15,GUST_SLOT=10.5,GUST_JITTER=4.5,TRAVEL=1.4,WASH_PERIOD=8.5,WASH_SPREAD=.35;
  const fract=x=>x-Math.floor(x);
  const hash=(seed,k,i)=>fract(Math.sin(seed*127.1+k*311.7+i*74.7)*43758.5453);
  const smooth=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
  /* One gust: rise, then a long soft decay with a little flutter inside it. */
  function gustShape(seed,k,tau){
    if(tau<=0)return 0;
    const rise=1.8+1.4*hash(seed,k,4),decay=2+2*hash(seed,k,5);
    const env=tau<rise?smooth(tau/rise):Math.exp(-(tau-rise)/decay);
    if(tau>rise+decay*5)return 0;
    return env*(1+.16*Math.sin(tau*3.7+k)*smooth(tau/rise));
  }
  function gustStrength(seed,k){
    const s=.4+.6*hash(seed,k,2);
    return hash(seed,k,3)<.18?s*.3:s; // now and then a lull instead of a gust
  }
  function wind(seed,t,x=.5){
    const s=seed||0,T=t-clamp01(x)*TRAVEL; // the gust reaches the right side a little after the left
    const base=.29+.07*Math.sin(T*.071+s)+.05*Math.sin(T*.031+s*2.3)+.025*Math.sin(T*.17+s*.7);
    let g=0;
    const k0=Math.floor(T/GUST_SLOT);
    for(let k=k0-2;k<=k0+1;k++){
      const start=k*GUST_SLOT+(hash(s,k,1)-.5)*GUST_JITTER;
      g+=gustStrength(s,k)*gustShape(s,k,T-start);
    }
    const w=base+g*.72;
    return w<0?0:w>WIND_MAX?WIND_MAX:w;
  }
  /* The start time of gust k (for tests and the lab). */
  const gustStart=(seed,k)=>k*GUST_SLOT+(hash(seed||0,k,1)-.5)*GUST_JITTER;
  function clamp01(x){return x<0?0:x>1?1:x}
  /* Shoreline wash: a fast push in (first 30 % of the cycle) and a slow slide back. */
  function washPhase(t,x){return t/WASH_PERIOD+clamp01(x)*WASH_SPREAD}
  function washAmp(c){const h=hash(7,c,6);return h>.82?WASH_MAX:.6+.4*hash(7,c,8)}
  function wash(t,x=.5){
    const p=washPhase(t,x),c=Math.floor(p),f=p-c;
    const shape=f<.3?smooth(f/.3):1-smooth((f-.3)/.7);
    return shape*washAmp(c);
  }
  function washStart(t,x=.5){return (Math.floor(washPhase(t,x))-clamp01(x)*WASH_SPREAD)*WASH_PERIOD}
  function seed(id){let h=7;for(const ch of String(id||''))h=(h*31+ch.charCodeAt(0))%9973;return h/97}
  const now=()=>(typeof performance!=='undefined'?performance.now():Date.now())/1000;
  return {wind,wash,washStart,washAmp,washPhase,gustStart,seed,now,WIND_MAX,WASH_MAX,WASH_PERIOD,GUST_SLOT,TRAVEL};
})();
