/* Hibiscus Club anonymous analytics. Loaded early; game.js calls HibiscusAnalytics.init() once the save
   is read, and track(event, detail) where something happens. Events are checked against SCHEMA (the
   same lists the Worker enforces, see worker/events.js), batched, and sent to /api/e with sendBeacon
   when the page is hidden or every 20 seconds. Nothing is sent on localhost, 127.0.0.1 or file:, when
   the browser sends Global Privacy Control or Do Not Track, or when the player turns sharing off.
   No cookies, no stored identifier, nothing about the player beyond the fields below.

   Cloudflare Web Analytics (page views) loads only when <meta name="cf-web-analytics-token"> in
   index.html holds a token, under the same conditions. */
const HibiscusAnalytics=(()=>{
  /* Keep identical to SCHEMA in worker/events.js (test/analytics.test.mjs checks). */
  const ROOMS=['map','wardrobe','salon','booth','scrapbook','arcade','garden','runway','life'];
  const DISTRICTS=['boardwalk','market','pavilion'];
  const CATEGORIES=['outfit','shoes','jewelry','hair','hair-color','makeup','nails','accessory'];
  const GAMES=['memory','bouquet','runway'];
  const SCHEMA={
    events:{
      'visit':ROOMS,'room':ROOMS,'district':DISTRICTS,'lang':['en','es'],'character':['adult','little'],
      'makeover':CATEGORIES,'tryon':CATEGORIES,'surprise':['wardrobe','salon'],'favorite':['saved','worn'],
      'purchase':CATEGORIES,'game-start':GAMES,'game-done':GAMES,'chat':DISTRICTS,
      'errand':['story-1','story-2','story-3','story-4'],'photo':['studio',...DISTRICTS],
      'daily':['deliver','find','greet','compliment','tidy'],'findable':DISTRICTS,'tutorial':['done','skipped'],'name':['yes','no'],
      'challenge':['picnic','disco','seashell','mall','rosy','midnight','homecoming','bob'],
      'postcard':['png'],'sound':['on','off'],'sparkle':['on','off']
    },
    counted:['makeover','tryon'],
    bands:['1-9','10-19','20-plus'],
    characters:['adult','little'],
    langs:['en','es']
  };
  const ENDPOINT='/api/e',MAX_BATCH=20,MAX_COUNT=100,FLUSH_MS=20000;
  const local=location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
  let browserOptOut=false;
  try{browserOptOut=navigator.globalPrivacyControl===true||[navigator.doNotTrack,window.doNotTrack,navigator.msDoNotTrack].some(v=>v==='1'||v==='yes')}catch{}
  let playerOn=false,context=null,timer=0,beaconLoaded=false;
  const queue=[],counts=new Map();
  const active=()=>!local&&!browserOptOut&&playerOn&&!!context;

  function clear(){queue.length=0;counts.clear();clearTimeout(timer);timer=0}
  function schedule(){if(!timer)timer=setTimeout(flush,FLUSH_MS)}
  function valid(e,d,band){
    return Object.hasOwn(SCHEMA.events,e)&&SCHEMA.events[e].includes(d)&&(e!=='purchase'||SCHEMA.bands.includes(band));
  }
  /* track('room','salon'); track('purchase','outfit','20-plus'). Makeover and try-on events are only
     counted here and sent as one event per category with a count `n` at the next flush. */
  function track(e,d,band){
    try{
      if(!active())return;
      if(!valid(e,d,band)){if(local)console.warn('[analytics] not in schema:',e,d,band);return}
      const {c,l}=context();
      if(!SCHEMA.characters.includes(c)||!SCHEMA.langs.includes(l))return;
      if(SCHEMA.counted.includes(e)){const k=[e,d,c,l].join('|');counts.set(k,(counts.get(k)||0)+1)}
      else queue.push(e==='purchase'?{e,d,c,l,b:band}:{e,d,c,l});
      if(queue.length>=MAX_BATCH)flush();else schedule();
    }catch{}
  }
  function send(body){
    try{if(navigator.sendBeacon&&navigator.sendBeacon(ENDPOINT,body))return}catch{}
    try{fetch(ENDPOINT,{method:'POST',body,keepalive:true,credentials:'omit',headers:{'Content-Type':'text/plain'}}).catch(()=>{})}catch{}
  }
  function flush(){
    try{
      clearTimeout(timer);timer=0;
      if(!active()){clear();return}
      for(const [k,total] of counts){
        const [e,d,c,l]=k.split('|');
        for(let left=total;left>0;left-=MAX_COUNT)queue.push({e,d,c,l,n:Math.min(left,MAX_COUNT)});
      }
      counts.clear();
      while(queue.length)send(JSON.stringify({v:1,ev:queue.splice(0,MAX_BATCH)}));
    }catch{}
  }
  /* Cloudflare Web Analytics: only with a well-formed token and the same consent as above. */
  function loadBeacon(){
    try{
      if(beaconLoaded||!active())return;
      const token=(document.querySelector('meta[name="cf-web-analytics-token"]')?.content||'').trim();
      if(!/^[0-9a-f]{32}$/i.test(token))return;
      const s=document.createElement('script');
      s.type='module';s.defer=true;s.src='https://static.cloudflareinsights.com/beacon.min.js';
      s.setAttribute('data-cf-beacon',JSON.stringify({token}));
      document.head.appendChild(s);beaconLoaded=true;
    }catch{}
  }
  /* `getContext` returns {c: character, l: language} at the moment of each event. */
  function init(enabled,getContext){context=getContext;setEnabled(enabled)}
  function setEnabled(on){
    playerOn=on===true;
    if(!playerOn)clear();else loadBeacon();
  }
  addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});
  return {track,init,setEnabled,flush,SCHEMA,
    get active(){return active()},get browserOptOut(){return browserOptOut},get local(){return local}};
})();
