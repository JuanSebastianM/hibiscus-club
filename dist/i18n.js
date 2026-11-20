/* Hibiscus Club i18n: every string a player can read or hear lives in a dictionary here (English) or
   in i18n-es.js (Spanish). Loaded before the other game scripts; no modules, no dependencies.

     t('shop.buyFor',{count:5})      look up a key in the current language
     {name}                          interpolates vars.name (numbers are formatted for the language)
     {name|lc}                       the same, with its first letter lower-cased (for names mid-sentence)
     {one:'…',other:'…'}             plural entry, chosen by vars.count
     I18N.lang / I18N.setLang('es')  current language; setLang fires a 'langchange' event on window
     I18N.list(['a','b','c'])        "a, b and c" / "a, b y c"

   A key missing from the current language falls back to English (and is logged once on a local
   server); a key missing everywhere renders as '' rather than leaking the key. Static markup in
   index.html carries data-i18n (text), data-i18n-html (trusted markup) or data-i18n-attr
   ("aria-label:key;title:key"), applied by I18N.applyStatic(). Catalog display names (items,
   colorways, hair colors, makeup) are written in catalog.js and registered as catalog.* keys. */
const I18N=(()=>{
  const SUPPORTED=['en','es'];
  const dicts={en:{
    'meta.description':'Visit Hibiscus Island for dress-up, a beauty salon, arcade games, flower arranging, and a photo scrapbook.',
    'meta.title':'{page} · Hibiscus Club',
    'lang.group':'Language',
    'lang.changed':'Now playing in English.',

    /* ---- top bar, navigation and shared bits ---- */
    'app.skip':'Skip to game',
    'app.home':'Hibiscus Club home',
    'app.brand':'Hibiscus Club',
    'nav.label':'Club navigation',
    'nav.map':'Island Map',
    'nav.life':'Island Life',
    'nav.wardrobe':'Dress-Up',
    'nav.scrapbook':'Scrapbook',
    'wallet.unit':{one:'star',other:'stars'},
    'wallet.toSpend':{one:'{count} star to spend',other:'{count} stars to spend'},
    'wallet.earned':{one:'{count} earned in all',other:'{count} earned in all'},
    'wallet.title':'{spend} · {earned}',
    'sound.on':'Turn sound on',
    'sound.off':'Turn sound off',
    'sparkle.on':'Turn sparkles on',
    'sparkle.off':'Turn sparkles off',
    'say.sessionOnly':'{msg} Progress lasts for this session.',
    'common.backToMap':'Island map',
    'common.howToPlay':'How to play',
    'common.character':'Character',
    'common.chooseCharacter':'Choose character',
    'common.dollIn':'{doll} in {outfit}',
    'common.portraitError':'The portrait could not load.',
    'common.ratio':'{n} / {total}',
    'doll.adult':'Grown-up',
    'doll.little':'Little Me',
    'doll.caption.adult':'GROWN-UP',
    'doll.caption.little':'LITTLE ME',
    'postcard.line':'HIBISCUS ISLAND   ✦   {doll}',

    /* ---- places and page titles ---- */
    'place.wardrobe':'Dress-Up Studio',
    'place.salon':'Beauty Salon',
    'place.arcade':'Star Arcade',
    'place.garden':'Flower Garden',
    'place.booth':'Photo Booth',
    'page.map':'Island Map',
    'page.life':'Island Life',
    'page.runway':'Island Runway',
    'page.scrapbook':'My Scrapbook',

    /* ---- map, passport, player card ---- */
    'map.title':'Hibiscus Island',
    'map.sub':'Pick a place on the map and let’s play!',
    'map.label':'Interactive island map',
    'map.explorer':'Island Explorer',
    'map.north':'North',
    'passport.title':'Island Passport',
    'passport.sub':'Visit each spot to collect its stamp.',
    'passport.collected':'{place}, stamp collected',
    'passport.todo':'{place}, visit to collect stamp',
    'card.title':'My Player Card',
    'card.explore':'Explore Island Life',
    'card.dressMe':'Dress me up',

    /* ---- style challenges ---- */
    'challenge.eyeline':'STYLE CHALLENGE · 10 STARS',
    'challenge.wear':'Wear these, then take a photo in the Photo Booth:',
    'challenge.plan':'Plan my look',
    'challenge.ready':'All set! Take the photo to win 10 stars.',
    'challenge.takePhoto':'Take the photo',
    'challenge.wearing':', wearing it',
    'challenge.notYet':', not yet',
    'challenge.need.hairColor':'{name} hair',
    'challenge.need.blush':'{name} blush',
    'challenge.need.gem':'{name} face gem',
    'challenge.need.nails':'{name} nails',
    'challenge.need.shadow':'{name} eyeshadow',
    'brief.picnic':'Picnic in paradise',
    'brief.disco':'Disco by the sea',
    'brief.seashell':'Seashell sweetheart',
    'brief.mall':'Mall crawl Saturday',
    'brief.rosy':'Rosy glow-up',
    'brief.midnight':'Midnight boardwalk',
    'brief.homecoming':'Island homecoming',
    'brief.bob':'Bouncy bob bash',

    /* ---- photo booth ---- */
    'booth.sub':'Frame your portrait and save it to your scrapbook.',
    'booth.frame':'Postcard frame',
    'booth.sticker':'Corner sticker',
    'booth.scenery':'Scenery',
    'booth.goldenLocked':'{name} · 10 stars',
    'booth.snap':'Take photo',
    'booth.openScrapbook':'Open scrapbook',
    'booth.more':'Want a new look first? Visit the {studio} or {salon}.',
    'booth.full':'Your scrapbook is full. Remove a postcard to make space.',
    'booth.savedWon':'Challenge complete! Postcard saved and 10 stars earned.',
    'booth.saved':'Postcard saved to your scrapbook!',
    'frame.0':'Candy stripes',
    'frame.1':'Lagoon blue',
    'frame.2':'Lilac gingham',
    'frame.3':'Golden hour',
    'sticker.0':'None',
    'sticker.1':'Flower',
    'sticker.2':'Bow',
    'sticker.3':'Star',
    'scenery.studio':'Pink studio',

    /* ---- star arcade ---- */
    'arcade.sub':'Flip two cards at a time to find all six matching pairs.',
    'arcade.game':'Memory Match',
    'arcade.pairs':'{found} / 6 pairs',
    'arcade.card':'Card {n}, {face}',
    'arcade.faceDown':'face down',
    'arcade.face.flower':'flower',
    'arcade.face.star':'star',
    'arcade.face.heart':'heart',
    'arcade.face.camera':'camera',
    'arcade.face.music':'music note',
    'arcade.face.hanger':'hanger',
    'arcade.scorecard':'SCORECARD',
    'arcade.done':'Perfect pairs!',
    'arcade.doneText':'You earned 8 stars. Play again to beat your best score.',
    'arcade.intro':'Match the island keepsakes in as few turns as you can.',
    'arcade.turns':'Turns',
    'arcade.best':'Best game',
    'arcade.bestTurns':{one:'{count} turn',other:'{count} turns'},
    'arcade.reward':'Reward',
    'arcade.rewardValue':'8 stars',
    'arcade.newGame':'New game',
    'arcade.won':'All six pairs matched! You earned 8 stars.',

    /* ---- flower garden ---- */
    'garden.sub':'Pick three blooms to fill the bouquet order.',
    'garden.preview':'Bouquet preview',
    'garden.table':'BOUQUET TABLE',
    'garden.orderEyeline':'FLOWER ORDER',
    'garden.orderTitle':'Bouquet for a friend',
    'garden.orderText':'Use one stem for every flower on the order. Any order works.',
    'garden.progress':'Your bouquet has {n} of 3 stems.',
    'garden.wrap':'Wrap bouquet · 5 stars',
    'garden.undo':'Remove last bloom',
    'garden.wrong':'Check the order and replace a bloom.',
    'garden.next':'Bouquet delivered! Your next order is ready.',
    'garden.delivered':'Bouquet delivered! You earned 5 stars.',
    'flower.rose':'Rose',
    'flower.daisy':'Daisy',
    'flower.hibiscus':'Hibiscus',
    'flower.tulip':'Tulip',

    /* ---- scrapbook ---- */
    'scrapbook.sub':'Your island memories, one postcard at a time.',
    'scrapbook.count':'{n} / 24 postcards',
    'scrapbook.booth':'Photo booth',
    'scrapbook.photo':'Photo {n}, {doll} in {outfit}',
    'scrapbook.download':'Download postcard {n}',
    'scrapbook.png':'PNG',
    'scrapbook.removeLabel':'Remove postcard {n}',
    'scrapbook.remove':'Remove',
    'scrapbook.emptyTitle':'Your first page is waiting',
    'scrapbook.emptyText':'Take a picture at the photo booth to start your collection.',
    'scrapbook.first':'Take my first photo',
    'scrapbook.loadError':'The postcard could not load.',
    'scrapbook.downloadError':'Download is available when the game runs on a local or hosted web server.',
    'scrapbook.removed':'Postcard removed.',

    /* ---- dialogs (index.html) ---- */
    'help.title':'Island guide',
    'help.p1':'Choose a map pin to play. Each first visit adds a stamp to your island passport. Switch between Grown-up and Little Me on your player card. Each keeps her own look.',
    'help.p2':'<b>Dress-Up Studio:</b> outfits, shoes and jewelry, each with color swatches. <b>Beauty Salon:</b> hairstyles, hair color, makeup, nails and hair accessories. Tap <b>Surprise me!</b> for a random look from your wardrobe, and <b>Save look</b> to keep up to six favorites per character.',
    'help.p3':'Earn stars by matching cards, delivering bouquets, rehearsing on the runway, helping islanders and photographing style challenges. Spend them on anything with a lock: tap it to try it on, then choose <b>Buy</b> to keep it. Try-ons go back to the shop when you leave the room. Golden hour, the gold postcard frame, unlocks once you have earned 10 stars in all.',
    'help.p4':'Use a mouse, touch, or Tab and Enter. Arrow keys move between room tabs. EN | ES in the top bar switches the language. Your looks, stars, wardrobe and scrapbook save in this browser.',
    'help.back':'Back to the island',
    'removePhoto.title':'Remove this postcard?',
    'removePhoto.text':'This frees one space in your scrapbook.',
    'removePhoto.keep':'Keep photo',
    'removePhoto.confirm':'Remove photo',
    'buy.title':'Buy this?',
    'buy.confirm':'Buy it!',
    'buy.cancel':'Not now',
    'unfav.title':'Remove this favorite?',
    'unfav.text':'This frees one favorite slot. Everything in the look stays in your wardrobe.',
    'unfav.keep':'Keep it',
    'unfav.confirm':'Remove',
    'name.title':'Choose her name',
    'name.label':'Character name',
    'name.save':'Save name',
    'name.cancel':'Cancel',
    'name.empty':'Enter a name.',
    'name.saved':'Name saved.',

    /* ---- Dress-Up Studio and Beauty Salon ---- */
    'studio.sub':'Outfits, shoes and jewelry for your next island adventure.',
    'salon.sub':'Hair, makeup, nails and sparkly finishing touches.',
    'tab.outfits':'Outfits',
    'tab.shoes':'Shoes',
    'tab.jewelry':'Jewelry',
    'tab.scenery':'Scenery',
    'tab.hair':'Hair',
    'tab.makeup':'Makeup',
    'tab.nails':'Nails',
    'tab.accessories':'Accessories',
    'tab.accessoriesLabel':'Hair accessories',
    'tabs.studio':'Dress-up categories',
    'tabs.salon':'Salon categories',
    'view.front':'Front',
    'view.left':'Left',
    'view.right':'Right',
    'view.back':'Back',
    'view.group':'Turn her around',
    'group.outfits':'Outfit rack',
    'group.shoes':'Shoes',
    'group.earrings':'Earrings',
    'group.necklaces':'Necklaces',
    'group.scenery':'Scenery',
    'group.hairstyle':'Hairstyle',
    'group.hairColor':'Hair color',
    'group.lips':'Lips',
    'group.blush':'Blush',
    'group.shadow':'Eyeshadow',
    'group.gems':'Face gems',
    'group.nails':'Nail polish',
    'group.clips':'Hair accessories',
    'group.color':'Color',
    'group.nailsHint':'Polish shows on her fingers, and on her toes when she goes barefoot.',
    'none.shoes':'Barefoot',
    'none.earrings':'No earrings',
    'none.necklace':'No necklace',
    'none.clip':'No clip',
    'none.item':'None',
    'room.visitBooth':'Visit photo booth',
    'room.visitSalon':'Visit beauty salon',
    'room.runway':'Walk the island runway',
    'room.yourDoll':'Your doll',
    'room.purse':'{balance} to spend',
    'room.surprise':'Surprise me!',
    'room.saveLook':'Save look',
    'room.favFull':'Favorites full',
    'room.stageTrying':'{doll} in {outfit}, trying on {names}',
    'opt.new':'new!',
    'opt.fresh':'{label}, new',
    'opt.lockedTrying':{one:'{name}, locked, {count} star, trying on',other:'{name}, locked, {count} stars, trying on'},
    'opt.lockedChoose':{one:'{name}, locked, {count} star, choose to try it on',other:'{name}, locked, {count} stars, choose to try it on'},
    'fav.title':'Favorite looks',
    'fav.wear':'Wear favorite look {n}: {outfit} with {hair}',
    'fav.remove':'Remove favorite look {n}',
    'fav.free':{one:'{count} free',other:'{count} free'},
    'fav.empty':'No favorites yet! Dress her up, then tap <b>Save look</b> to keep the whole outfit here, ready to wear again in one tap.',
    'fav.full':'All six favorite slots are full. Remove one to make room.',
    'fav.already':'This look is already one of your favorites ♡',
    'fav.savedSkipped':'Saved! The {names} stayed out because it’s only a try-on.',
    'fav.saved':'Saved to your favorite looks ♡',
    'fav.wearing':'Wearing favorite look {n} ♡',
    'fav.removed':'Favorite removed.',
    'compliment.0':'Totally fabulous!',
    'compliment.1':'That’s so you! ✦',
    'compliment.2':'Major sparkle alert!',
    'compliment.3':'Runway ready!',
    'compliment.4':'Cute overload!',
    'compliment.5':'Ooh, what a look!',
    'compliment.6':'Picture perfect!',
    'compliment.7':'Style star status!',
    'compliment.8':'She’s glowing!',
    'compliment.9':'Fashion-forward and fun!',
    'surprise.say':'Surprise! {theme} ✦',
    'theme.pink':'Bubblegum dream',
    'theme.warm':'Sunset sorbet',
    'theme.gold':'Golden hour glow',
    'theme.mint':'Mint chip chill',
    'theme.blue':'Lagoon cool',
    'theme.lilac':'Lilac daydream',
    'theme.chaos':'Mix & match madness',

    /* ---- star shop: try-ons and buying ---- */
    'shop.tint':'{tint} {item}',
    'shop.hairColor':'{name} hair color',
    'shop.nails':'{name} nail polish',
    'shop.shadow':'{name} eyeshadow',
    'shop.blush':'{name} blush',
    'shop.tryingOn':'Trying on',
    'shop.buyFor':'Buy for {cost}',
    'shop.putBack':'Put back',
    'shop.short':{one:'You need {count} more star. Earn it in the Star Arcade, Flower Garden, on the runway or with style challenges.',other:'You need {count} more stars. Earn them in the Star Arcade, Flower Garden, on the runway or with style challenges.'},
    'shop.trySay':{one:'Trying on the {names}! Buy it for {count} star to keep it.',other:'Trying on the {names}! Buy it for {count} stars to keep it.'},
    'shop.needMore':{one:'You need {count} more star for the {names}.',other:'You need {count} more stars for the {names}.'},
    'shop.buyTitle':{one:'Buy for {count} star?',other:'Buy for {count} stars?'},
    'shop.buyText':'The {names} will be yours to wear any time. {wallet}',
    'shop.buyWallet':{one:'You have {balance} stars to spend, so you’ll have {count} left.',other:'You have {balance} stars to spend, so you’ll have {count} left.'},
    'shop.fewMore':'You need a few more stars first.',
    'shop.bought':{one:'Yay! You bought the {names}. {count} star left to spend.',other:'Yay! You bought the {names}. {count} stars left to spend.'},
    'shop.putBackSay':'Put the {names} back.',
    'shop.droppedLeave':'Try-ons stay in the shop until you buy them, so her look went back to what she owns.',
    'shop.droppedPhoto':'Taking a photo: the {names} went back to the shop. Buy a try-on to keep it.',
    'shop.droppedSwitch':'Switching characters: the {names} went back to the shop. Buy a try-on to keep it.',

    /* ---- island runway ---- */
    'runway.sub':'Follow the spotlight in your studio look.',
    'runway.bar':'Runway rehearsal',
    'runway.eyeline':'RUNWAY REHEARSAL',
    'runway.title':'Spotlight steps',
    'runway.look':'Your current runway look',
    'runway.start':'Start rehearsal',
    'runway.again':'New rehearsal',
    'runway.replay':'Replay cues',
    'runway.postcard':'Take a runway postcard',
    'runway.mark.0':'Left',
    'runway.mark.1':'Center',
    'runway.mark.2':'Right',
    'runway.step.0':'Step to the left mark',
    'runway.step.1':'Step to the center mark',
    'runway.step.2':'Step to the right mark',
    'runway.note.ready':'Watch the three runway marks light up, then repeat the sequence.',
    'runway.note.turn':'Your turn. Choose the first runway mark.',
    'runway.note.cue':'Cue {n} of 3 · {mark}',
    'runway.note.wait':'…',
    'runway.note.retry':'That was a different mark. Replay the cues and try this routine again.',
    'runway.note.won':'Rehearsal complete! You hit all three marks and earned 6 stars.',
    'runway.note.correct':'Correct! Choose mark {n} of 3.',
    'runway.won':'Runway complete! You earned 6 stars.',

    /* ---- Island Life ---- */
    'life.sub':'Click the ground to walk, or choose a resident to start a conversation.',
    'life.world':'{place}. Click to walk or use the arrow keys. Select a person or place to interact.',
    'life.walkTalk':'Walk to {resident} and talk',
    'life.exploring':'Exploring {place}',
    'life.walking':'Walking…',
    'life.walkingTo':'Walking to {resident}…',
    'life.travel':'Travel to',
    'life.editName':'Edit name',
    'life.chooseName':'Choose a name',
    'life.changeOutfit':'Change outfit',
    'life.photo':'Take a scenic postcard',
    'life.journal':'Task journal',
    'life.completed':{one:'Completed · {count} star',other:'Completed · {count} stars'},
    'life.stepAt':'{action} · {place}',
    'life.speakTo':'Speak to {resident} at {place}.',
    'life.bag':'In your bag',
    'life.bagEmpty':'Empty',
    'life.outfitError':'Her outfit could not load.',
    'life.taskDone':{one:'Task complete! You earned {count} star.',other:'Task complete! You earned {count} stars.'},
    'life.hi':'Hi, {name}! {line}',
    'life.lend':'Can I lend a hand?',
    'life.bye':'See you around',
    'life.keepExploring':'Keep exploring',
    'life.accept':{one:'I’ll help · {count} star',other:'I’ll help · {count} stars'},
    'life.later':'Maybe later',
    'life.thanks':'Thank you! {action} at {place}.',
    'life.dialog':'Island conversation',
    'life.roleStatus':'{role} · {status}',
    'district.boardwalk.name':'Pearl Boardwalk',
    'district.boardwalk.role':'Shell collector',
    'district.boardwalk.spot':'Shell basket',
    'district.boardwalk.walkSpot':'Walking to the shell basket…',
    'district.boardwalk.friend':'Island friend',
    'district.boardwalk.new':'New acquaintance',
    'district.boardwalk.greeting':'Have you ever held a shell to your ear? I keep trying to find one that sounds like this beach.',
    'district.boardwalk.topic':'What do you listen for?',
    'district.boardwalk.answer':'The little hush between waves. Kit says it would make a lovely opening for the pavilion show.',
    'district.boardwalk.welcome':'Did the tide bring anything interesting today?',
    'district.boardwalk.objectLine':'A basket of polished shells sits in the shade. One has a stripe like a ribbon.',
    'district.market.name':'Flower Market',
    'district.market.role':'Market gardener',
    'district.market.spot':'Potting bench',
    'district.market.walkSpot':'Walking to the potting bench…',
    'district.market.friend':'Island friend',
    'district.market.new':'New acquaintance',
    'district.market.greeting':'I saved a little space on my potting bench. There’s always room for another gardener here.',
    'district.market.topic':'What grows best here?',
    'district.market.answer':'Hibiscus loves our sunny mornings. I turn the pots a little each day so every side gets its share.',
    'district.market.welcome':'There’s a new leaf on the cutting we planted last week!',
    'district.market.objectLine':'There are little pots, fresh cuttings, and a drawer full of supplies.',
    'district.pavilion.name':'Starlight Pavilion',
    'district.pavilion.role':'Stagehand',
    'district.pavilion.spot':'Lantern stand',
    'district.pavilion.walkSpot':'Walking to the lantern stand…',
    'district.pavilion.friend':'Island friend',
    'district.pavilion.new':'New acquaintance',
    'district.pavilion.greeting':'Listen to that echo! I’m getting the pavilion ready for tonight’s lantern concert.',
    'district.pavilion.topic':'What’s tonight’s show?',
    'district.pavilion.answer':'A sound postcard of the island. Waves for the intro, market bells in the middle, and everyone humming the last note.',
    'district.pavilion.welcome':'You’re just in time for sound check. The acoustics are wonderful tonight.',
    'district.pavilion.objectLine':'A lantern hangs from a brass hook. It sways gently above the stage.',
    'story.0.title':'A shell for the show',
    'story.0.offer':'Could you pick a striped shell from my basket and take it to Kit? We need a little ocean music at the concert.',
    'story.0.step.0.action':'Pick a striped shell',
    'story.0.step.0.item':'Striped shell',
    'story.0.step.0.line':'You find a striped shell with a soft, low whistle.',
    'story.0.step.1.action':'Give Kit the shell',
    'story.0.step.1.line':'That’s the sound! I’ll open the concert with it. Thank you for bringing the beach to our stage.',
    'story.1.title':'A window-box wish',
    'story.1.offer':'Mara’s kiosk needs a little green. Will you pot a hibiscus cutting and take it to her?',
    'story.1.step.0.action':'Pot a hibiscus cutting',
    'story.1.step.0.item':'Hibiscus cutting',
    'story.1.step.0.line':'You tuck the cutting into a little pot and press the soil around its stem.',
    'story.1.step.1.action':'Give Mara the cutting',
    'story.1.step.1.line':'For my window? I’ll put it where it catches the morning sun. Rosa always knows what a place needs.',
    'story.2.title':'Opening-night lights',
    'story.2.offer':'Our lantern is missing its ribbon. Rosa keeps spares at her potting bench. Can you find one and hang it here before the show?',
    'story.2.step.0.action':'Find the gold ribbon',
    'story.2.step.0.item':'Gold ribbon',
    'story.2.step.0.line':'There’s a spool of gold ribbon in the drawer. You cut a length for Kit.',
    'story.2.step.1.action':'Tie the lantern ribbon',
    'story.2.step.1.line':'You tie a bow beneath the lantern. The gold catches the light from the stage.',
    'story.2.step.2.action':'Tell Kit the lights are ready',
    'story.2.step.2.line':'Look at it glow! Now we’re ready for opening night. I saved you a place in the front row.'
  }};
  const PREF_KEY='hibiscus-club-v1';
  const warned=new Set();
  const devLog=/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname);
  const pluralRules={};
  function savedLang(){
    try{const raw=JSON.parse(localStorage.getItem(PREF_KEY));return raw&&SUPPORTED.includes(raw.lang)?raw.lang:null}catch{return null}
  }
  function detect(){
    const prefs=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||''];
    return String(prefs[0]||'').toLowerCase().startsWith('es')?'es':'en';
  }
  let lang=savedLang()||detect();
  function entry(key){
    const own=dicts[lang]?.[key];
    if(own!==undefined)return own;
    const en=dicts.en[key];
    if(!warned.has(lang+':'+key)&&devLog){warned.add(lang+':'+key);console.warn(`[i18n] missing ${lang==='en'||en===undefined?'key':lang} "${key}"`+(en!==undefined?' (using English)':''));}
    return en===undefined?'':en;
  }
  function pluralForm(n){
    if(!pluralRules[lang])pluralRules[lang]=new Intl.PluralRules(lang);
    return pluralRules[lang].select(n);
  }
  function num(n){return typeof n==='number'?n.toLocaleString(lang):String(n)}
  function t(key,vars={}){
    let s=entry(key);
    if(s&&typeof s==='object')s=s[pluralForm(Number(vars.count))]??s.other;
    return String(s).replace(/\{(\w+)(\|lc)?\}/g,(m,name,lc)=>{
      if(!(name in vars))return m;
      const v=num(vars[name]);
      return lc?v.charAt(0).toLocaleLowerCase(lang)+v.slice(1):v;
    });
  }
  function has(key){return Object.hasOwn(dicts[lang]||{},key)||Object.hasOwn(dicts.en,key)}
  function list(items){
    try{return new Intl.ListFormat(lang,{style:'long',type:'conjunction'}).format(items)}
    catch{return items.join(', ')}
  }
  function add(code,entries){dicts[code]=Object.assign(dicts[code]||{},entries)}
  /* Turns obj[field] into a getter for t(prefix+'.'+field), so data tables read in the current language. */
  function localize(obj,prefix,fields){
    for(const f of fields)Object.defineProperty(obj,f,{get:()=>t(prefix+'.'+f),enumerable:true,configurable:true});
    return obj;
  }
  function applyStatic(root=document){
    root.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});
    root.querySelectorAll('[data-i18n-html]').forEach(el=>{el.innerHTML=t(el.dataset.i18nHtml)});
    root.querySelectorAll('[data-i18n-attr]').forEach(el=>{
      for(const pair of el.dataset.i18nAttr.split(';')){const [attr,key]=pair.split(':');if(attr&&key)el.setAttribute(attr.trim(),t(key.trim()))}
    });
    document.documentElement.lang=lang;
    document.querySelectorAll('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lang===lang)));
  }
  function setLang(code){
    if(!SUPPORTED.includes(code)||code===lang)return false;
    lang=code;applyStatic();
    window.dispatchEvent(new CustomEvent('langchange',{detail:{lang}}));
    return true;
  }
  return {t,has,list,num,add,localize,applyStatic,setLang,detect,SUPPORTED,
    get lang(){return lang},
    keys:code=>Object.keys(dicts[code]||{}),
    raw:(code,key)=>dicts[code]?.[key]};
})();
const t=I18N.t;
