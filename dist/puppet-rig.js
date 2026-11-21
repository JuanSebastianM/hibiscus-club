/* Puppet rig data and the pure animation math for puppet.js (no DOM, no three.js; test/puppet.test.mjs
   loads it in node).

   Coordinates. Joints and landmarks are measured in doll-local pixels of each view's base picture
   (assets/dolls/<doll>-<view>.webp, the same space as the fits in catalog.js) and converted at load to
   normalized DOLL_CANVAS coordinates ([0..1] of the 600 x 1060 composed canvas, x right, y down):
   rig(doll, view).joints.hips = [x, y]. ORIGINS repeats CATALOG.dolls[doll].views[view].origin (a test
   checks they agree). The right view is the left view mirrored (the base pictures are mirrors).

   Skeleton. BONES lists the bones in parent-before-child order: root (ground point between the feet),
   hips, spine, chest, neck, head, hair (secondary motion of the hair), arm0/arm1 (upper, fore, hand),
   leg0/leg1 (thigh, shin, foot), skirt0/skirt1. Front and back views: limb 0 is the one on the
   viewer's left. Side views: limb 0 is the near limb; limb 1 is the far limb, drawn as a shaded copy
   of the near one behind the body (the base pictures show only one arm and one leg in profile).
   A bone's local transform rotates (r, radians, clockwise on screen), scales (sx, sy) about its joint
   and translates (x, y, doll px). puppet.js skins each mesh vertex as a chain of FRACTIONS of these
   transforms (angle interpolation, so joints bend without the collapse of matrix blending).

   Animation. Clips are pure functions of time and a per-character seed: idlePose, walkPose (side
   views: a gait with two-bone IK so the stance foot stays planted while the body travels; front and
   back views: legs foreshortened toward and away from the camera), talkFace, emotePose (smile, laugh,
   wave, cheer, sway, shy, pose). mixPose / addPose blend them. Face parameters ride along with the
   pose: blink [0..1] per eye, jaw (mouth open, doll px), smile, wide, squint, glance (-1..1).

   Expression art (art/ART-REQUESTS.md section 2) plugs in through EXPRESSION_ART below. */
(function(root){
'use strict';
const TAU=Math.PI*2,DEG=Math.PI/180;
const CANVAS=[600,1060];
const BONES=['root','hips','spine','chest','neck','head','hair',
  'arm0','fore0','hand0','arm1','fore1','hand1',
  'thigh0','shin0','foot0','thigh1','shin1','foot1','skirt0','skirt1'];
const PARENT={root:null,hips:'root',spine:'hips',chest:'spine',neck:'chest',head:'neck',hair:'head',
  arm0:'chest',fore0:'arm0',hand0:'fore0',arm1:'chest',fore1:'arm1',hand1:'fore1',
  thigh0:'hips',shin0:'thigh0',foot0:'shin0',thigh1:'hips',shin1:'thigh1',foot1:'shin1',skirt0:'hips',skirt1:'hips'};
const B=Object.fromEntries(BONES.map((n,i)=>[n,i]));
/* joint of each bone (its pivot) */
const PIVOT={root:'root',hips:'hips',spine:'spine',chest:'chest',neck:'neck',head:'head',hair:'head',
  arm0:'sh0',fore0:'el0',hand0:'wr0',arm1:'sh1',fore1:'el1',hand1:'wr1',
  thigh0:'hip0',shin0:'kn0',foot0:'an0',thigh1:'hip1',shin1:'kn1',foot1:'an1',skirt0:'waist0',skirt1:'waist1'};
const ORIGINS={adult:{front:[100,145],left:[205.3,145],right:[211.3,145],back:[100.7,145]},
  little:{front:[99,155],left:[195.1,155],right:[198.5,155],back:[98.9,155]}};
const MIRROR={adult:181,little:207};
/* Per doll: front and left views in doll-local px (back = front unless given; right = mirrored left).
   Joints: see PIVOT; hand*, toe* are limb ends. Regions (puppet.js): armCut* = [shoulder top, armpit]
   (front/back: the arm is what lies outside that line and, below the armpit, outside the middle of
   the gap between arm and body); hipLine = outer hip, crotch, outer hip (legs are below it, split at
   the crotch); side views: the near arm is the catalog's arm polygon, the leg is below hipLine
   [front point, back point]. skirtTop: below it a skirt or dress is the swinging skirt piece. neckCut:
   above it the body picture is the head piece (fine mesh, face warp). Face: eyes = closed polygons,
   mouth = the line where the mouth opens (adult: under the upper teeth; Little Me: between the
   lips) with an opening weight per point, corners = mouth corners, cheeks = [x,y,r], chin = y. */
const DOLL={
  adult:{
    legLength:375,
    front:{
      joints:{root:[199,873],hips:[199,440],spine:[199,350],chest:[199,262],neck:[199,172],head:[199,146],
        sh0:[104,232],el0:[62,378],wr0:[28,478],hand0:[25,545],sh1:[294,232],el1:[336,378],wr1:[370,478],hand1:[373,545],
        hip0:[152,452],kn0:[143,690],an0:[141,828],toe0:[141,872],hip1:[246,452],kn1:[255,690],an1:[257,828],toe1:[257,872],
        waist0:[160,360],waist1:[238,360]},
      armCut0:[[122,186],[125,286]],armCut1:[[276,186],[273,286]],hipLine:[[86,425],[199,464],[312,425]],
      skirtTop:362,neckCut:166,
      face:{eyes:[[[175,85],[180,82],[188,80.5],[196,81.5],[202,85],[196,87.5],[186,88],[179,87]],[[219,86],[224,82.5],[232,81],[240,82],[245,85],[239,87.5],[229,88],[222,87.5]]],
        mouth:[[183,120.5,0],[189,124,.45],[195,126,.85],[200,126.8,1],[206,127,1],[212,126.8,1],[218,126,.85],[224,124,.45],[230.5,120,0]],
        corners:[[183,120.5],[230.5,120]],cheeks:[[172,104,13],[242,102,13]],chin:147,jawMax:4.2,teeth:true,
        lash:[.85,1.6],lidSample:3.2,lidGap:.8}},
    left:{
      joints:{root:[92,873],hips:[92,440],spine:[86,350],chest:[84,262],neck:[106,170],head:[100,150],
        sh0:[110,218],el0:[94,372],wr0:[79,492],hand0:[72,540],
        hip0:[96,462],kn0:[107,690],an0:[108,826],toe0:[18,862],waist0:[60,370],waist1:[120,370]},
      hipLine:[[30,452],[152,494]],skirtTop:362,neckCut:166,dir:-1,
      face:{eyes:[[[43,80],[47,77.5],[53,77],[59,78.5],[63,81],[58,83.5],[51,84.5],[45,83]]],
        mouth:[[30,124,1],[36,123.8,1],[42,123.5,.95],[48,123,.7],[53,121.6,.35],[56,118.5,0]],
        corners:[[56,118.5]],cheeks:[[62,101,11]],chin:140,jawMax:3.8,teeth:true,lash:[.85,1.5],lidSample:3}},
    back:{joints:null,armCut0:[[124,182],[126,276]],armCut1:[[274,182],[271,276]],hipLine:[[86,420],[198,463],[312,420]],face:null}
  },
  little:{
    legLength:275,
    front:{
      joints:{root:[201,863],hips:[201,520],spine:[201,432],chest:[201,330],neck:[201,222],head:[201,202],
        sh0:[110,274],el0:[64,410],wr0:[34,490],hand0:[30,548],sh1:[292,274],el1:[338,410],wr1:[368,490],hand1:[372,548],
        hip0:[152,548],kn0:[140,705],an0:[139,818],toe0:[139,862],hip1:[250,548],kn1:[262,705],an1:[264,818],toe1:[264,862],
        waist0:[160,440],waist1:[242,440]},
      armCut0:[[126,230],[122,342]],armCut1:[[276,230],[282,342]],hipLine:[[92,505],[201,552],[310,505]],
      skirtTop:440,neckCut:214,
      face:{eyes:[[[160,124],[164,118],[170,115],[177,113.5],[184,115],[190,119],[193,124],[188,128],[181,130],[173,130.5],[166,129]],
          [[222,123],[226,118],[232,115],[239,114],[246,116],[251,119],[254,123],[249,127],[242,129.5],[234,130],[227,128]]],
        mouth:[[186,176.5,0],[192,176.3,.5],[198,176.1,.9],[204,176,1],[210,176.1,1],[216,176,.9],[223,175.7,.5],[230,175.4,0]],
        corners:[[186,176.5],[230,175.4]],cheeks:[[166,160,17],[253,158,17]],chin:200,jawMax:4.6,teeth:false,
        lash:[.75,1.2],lidSample:4,lidGap:3}},
    left:{
      joints:{root:[106,863],hips:[108,520],spine:[100,432],chest:[104,330],neck:[114,218],head:[108,198],
        sh0:[126,252],el0:[123,402],wr0:[113,496],hand0:[108,548],
        hip0:[112,550],kn0:[122,700],an0:[120,812],toe0:[24,850],waist0:[70,450],waist1:[150,450]},
      hipLine:[[38,530],[180,520]],skirtTop:440,neckCut:212,dir:-1,
      face:{eyes:[[[23,117],[25,111],[30,108.5],[35,110],[39,114],[38,119],[32,122],[26,121.5]]],
        mouth:[[10,168.4,1],[14,168.6,1],[18,169.3,.75],[22,170,.35],[24.5,170.4,0]],
        corners:[[24.5,170.4]],cheeks:[[46,152,14]],chin:186,jawMax:4,teeth:false,lash:[.75,1.1],lidSample:4,lidGap:2.2}},
    back:{joints:null,armCut0:[[126,226],[122,346]],armCut1:[[276,226],[282,346]],hipLine:[[92,505],[201,556],[310,505]],face:null}
  }
};
/* How a garment moves: 'trousers' (legs split and follow the legs), 'skirt' (below skirtTop it sways
   as one piece and the legs swing beneath; dresses too). An outfit not listed counts as a skirt, which
   never tears. SKIRT_TOP moves the skirt line (doll-local y, every view) for outfits whose top hangs
   below the usual waist (a jacket or cardigan over the skirt: its hem must not sway apart from its
   sleeves). */
/* Sleeves that cannot be lifted overhead convincingly from a flat picture (long sleeves, jackets,
   cardigans): these outfits get gentler arm emotes (see GENTLE). */
const LONG_SLEEVES=new Set(['denim-jacket-skirt','black-flares-set','pink-velour-cargo','mint-cardigan-dress','star-pajamas']);
/* How a garment's sleeves move with the arm (puppet.js): 'long' = the whole sleeve follows the arm;
   'puff' = short puffed or tee sleeves stay on the shoulder and the arm comes out from under them;
   anything else is sleeveless (a wide bodice is kept to the body, only what hugs the arm moves). */
const SLEEVES={'hibiscus-flares':'puff','lilac-satin-bow-dress':'puff','lilac-cord-pinafore':'puff','denim-overalls':'puff'};
for(const id of LONG_SLEEVES)SLEEVES[id]='long';
/* emote -> its gentle variant, used with LONG_SLEEVES */
const GENTLE={wave:'waveLow',cheer:'wiggle',pose:'poseSoft'};
/* RAISED_ARM_EMOTES: the full wave, cheer and hand-on-hip pose lift the upper arm away from the body,
   which the cut-out shoulders cannot show cleanly yet. While false, every outfit in every view plays
   the arm-safe versions (ARM_SAFE: the upper arm stays against the body); set it to true once the
   shoulder joints are fixed. Arms still swing when walking. */
const RAISED_ARM_EMOTES=false;
/* the emotes the game asks for (the rest of DURATION are variants chosen by emoteFor) */
const EMOTES=['smile','laugh','wave','cheer','sway','shy','pose','nod'];
const ARM_SAFE={wave:'waveSafe',cheer:'wiggle',pose:'poseSafe'};
/* the largest upper-arm rotation (degrees) an arm-safe emote may use */
const ARM_SAFE_MAX=4;
const SKIRT_TOP={'denim-jacket-skirt':{adult:415},'mint-cardigan-dress':{little:462}};
const OUTFIT_KIND={'hibiscus-flares':'trousers','black-flares-set':'trousers','pink-velour-cargo':'trousers',
  'lilac-satin-bow-dress':'skirt','denim-jacket-skirt':'skirt','green-hibiscus-sundress':'skirt',
  'yellow-dot-dress':'skirt','lilac-cord-pinafore':'skirt','pink-gingham-bow-dress':'skirt','mint-cardigan-dress':'skirt',
  'denim-overalls':'trousers','star-pajamas':'trousers'};
/* Residents: one flat picture each (assets/scenes/<id>.png, 176 x 432), image px. Only the torso chain,
   breathing, sway, blink and the talking mouth. */
const RESIDENTS={
  mara:{size:[176,432],joints:{root:[88,425],hips:[88,215],spine:[90,170],chest:[92,125],neck:[96,94],head:[96,86]},neckCut:92,
    face:{eyes:[[[84,56.5],[86,55],[89,54.8],[92,55.8],[93,57.5],[90,58.6],[86.5,58.4]],[[101.5,59.5],[104,58.6],[107,58.6],[110,59.5],[109,61],[105.5,61.4],[102.5,61]]],
      mouth:[[89,73.2,0],[92,74.6,.6],[95,75,1],[98,75,1],[100.5,74.2,.5],[102,73.5,0]],corners:[[89,73.2],[102,73.5]],cheeks:[[86,64,5],[104,66,5]],chin:84,jawMax:1.5,teeth:true,lash:[.5,.75],lidSample:1.5}},
  rosa:{size:[176,432],joints:{root:[88,425],hips:[88,215],spine:[87,165],chest:[87,115],neck:[94,80],head:[94,72]},neckCut:78,
    face:{eyes:[[[84,47.5],[86,46],[89.5,45.6],[92.5,46.6],[93.5,48],[90,49.2],[86.5,49]],[[101,43],[103,41.4],[106,41.2],[108.5,42],[109,43.6],[106,44.6],[103,44.4]]],
      mouth:[[86.5,61.4,0],[90,62.5,.6],[94,62.9,1],[98,62.6,1],[101,61.8,.5],[104,60.6,0]],corners:[[86.5,61.4],[104,60.6]],cheeks:[[86,56,5],[104,55,5]],chin:71,jawMax:1.5,teeth:true,lash:[.5,.75],lidSample:1.5}},
  kit:{size:[176,432],joints:{root:[97,425],hips:[97,205],spine:[98,160],chest:[100,110],neck:[103,76],head:[103,68]},neckCut:74,
    face:{eyes:[[[92,37.5],[94.5,36],[98,35.7],[101,36.5],[102,38],[98,39.2],[94.5,39]],[[110,39.5],[112.5,38.2],[116,38],[119,39],[119.5,40.8],[116,41.6],[112.5,41.3]]],
      mouth:[[94,53.6,0],[98,55.8,.6],[102,56.6,1],[106,56.5,1],[110,55.8,.6],[113,54,0]],corners:[[94,53.6],[113,54]],cheeks:[[92,47,5],[112,48,5]],chin:66,jawMax:1.6,teeth:true,lash:[.55,.8],lidSample:1.5}},
  /* Pack-2 residents (art/build_residents_pack2.py). Their talk and smile pictures register with the
     neutral one, so `frames` makes the mouth real: puppet.js blends the lower face of <id>-talk.png and
     <id>-smile.png inside the feathered ellipse face.patch [cx, cy, rx, ry] instead of drawing a mouth. */
  sol:{size:[176,432],joints:{root:[88,425],hips:[96,205],spine:[99,170],chest:[100,135],neck:[101,102],head:[101,95]},neckCut:100,frames:true,
    face:{eyes:[[[86.5,66.5],[89,64.6],[92,63.9],[95,64.5],[98,66.4],[95,68.4],[90,68.3]],[[109,69.5],[111,68],[114,67.6],[117,68.5],[118.5,70],[115,71.4],[111.5,71.3]]],
      mouth:[[95,84.4,0],[98,85.3,.6],[101,85.8,1],[104,85.7,1],[106.5,85.3,.5],[108,84.8,0]],corners:[[95,84.4],[108,84.8]],cheeks:[[93,76,5],[112,78,5]],chin:92,jawMax:1.5,teeth:true,lash:[.5,.75],lidSample:1.5,
      patch:[101.5,85.5,10,6.5]}},
  teo:{size:[176,432],joints:{root:[88,425],hips:[88,220],spine:[88,165],chest:[88,120],neck:[88,89],head:[88,79]},neckCut:87,frames:true,
    face:{eyes:[[[73.5,51],[75.5,49.6],[78,49.2],[80.5,49.8],[81.5,51],[79,52.4],[76,52.3]],[[94.5,51],[96.5,49.5],[99,49.2],[101.5,49.8],[102.5,51.2],[100,52.4],[97,52.3]]],
      mouth:[[77,68.6,0],[81,69.4,.6],[86,69.8,1],[91,69.8,1],[96,69.4,.5],[100,68.8,0]],corners:[[77,68.6],[100,68.8]],cheeks:[[74,62,5],[102,62,5]],chin:80,jawMax:1.5,teeth:true,lash:[.45,.65],lidSample:1,lidGap:.4,
      patch:[88.5,70,15,6.5]}},
  gigi:{size:[176,432],joints:{root:[96,425],hips:[82,215],spine:[81,175],chest:[80,130],neck:[81,92],head:[81,85]},neckCut:90,frames:true,
    face:{eyes:[[[68,55.5],[70,53.5],[73.5,52.5],[77,53],[79.5,55.5],[76.5,58],[71,57.8]],[[89.5,56],[91.5,54],[94.5,53.3],[97.5,54.3],[99,56.3],[96.5,58.8],[92,58.5]]],
      mouth:[[75,69.6,0],[78.5,71,.6],[82,71.6,1],[85.5,71.5,1],[88,70.8,.5],[89.5,70.2,0]],corners:[[75,69.6],[89.5,70.2]],cheeks:[[71,64,5],[93,65,5]],chin:82,jawMax:1.5,teeth:true,lash:[.5,.75],lidSample:.8,lidGap:.4,
      patch:[82,73.5,11,6.5],blinkFrame:'smile',blinkPatch:[[74,55.5,8.5,5.2],[94.5,56,8,5.2]]}},
  nina:{size:[176,432],joints:{root:[87,425],hips:[80,230],spine:[79,185],chest:[78,140],neck:[77,106],head:[77,99]},neckCut:104,frames:true,
    face:{eyes:[[[60,71],[62.5,69],[66,68.3],[69.5,69],[71,71],[68,73.5],[63,73.3]],[[81,71],[83,69],[86.5,68.3],[90,69],[91.5,71],[89,73.5],[84,73.3]]],
      mouth:[[69.5,85.8,0],[73,87.2,.6],[77,87.8,1],[81,87.6,1],[83.5,86.8,.5],[84.8,86,0]],corners:[[69.5,85.8],[84.8,86]],cheeks:[[63,80,5],[89,80,5]],chin:96,jawMax:1.5,teeth:true,lash:[.5,.75],lidSample:1.5,lidGap:2.2,
      patch:[77,88.5,10.5,6.5]}}
};
/* Drawn expression heads (art/ART-REQUESTS.md section 2), made game-ready by art/build_faces.py from
   art/source/pack2/02-faces: each sheet is a 4 x 3 grid in EXPRESSIONS order, cells of `cell` doll-local
   px drawn at `scale`, registered and colour-matched to the base doll's head and placed with their
   top-left at doll-local `at`; the alpha is the blend mask (only the region EXPRESSION_REGION names),
   and `lips` marks each cell's lips for the makeup pass. The side sheet serves the left view and,
   mirrored, the right. Little Me's side sheet is drawn in three-quarter view and cannot sit on her
   strict profile, so her side views keep the procedural face. Adding a sheet = its files + one entry. */
/* Sideways glances (the drawn look-left / look-right eyes) read as side-eye on these faces, so they
   are off: idle and emotes never pick them while this is false. */
const SIDE_GLANCES=false;
const EXPRESSIONS=['neutral','soft-smile','big-smile','laugh','blink','half-closed','talk-eh','talk-oh','talk-ah','surprised','look-left','look-right'];
const EXPRESSION_REGION={'neutral':'face','soft-smile':'face','big-smile':'face','laugh':'face','surprised':'face',
  'blink':'eyes','half-closed':'eyes','look-left':'eyes','look-right':'eyes','talk-eh':'mouth','talk-oh':'mouth','talk-ah':'mouth'};
const EXPRESSION_ART={
  adult:{front:{file:'assets/faces/faces-adult-front.webp',lips:'assets/faces/faces-adult-front-lips.webp',at:[156,56],cell:[104,100],scale:2},
    side:{file:'assets/faces/faces-adult-side.webp',lips:'assets/faces/faces-adult-side-lips.webp',at:[12,54],cell:[86,100],scale:2}},
  little:{front:{file:'assets/faces/faces-little-front.webp',lips:'assets/faces/faces-little-front-lips.webp',at:[140,94],cell:[134,116],scale:2},
    side:null}
};
/* The expression shown for a set of face parameters (one name; used for single-texture swaps). */
function expressionFor(f){
  const blink=Math.max(...(f.blink||[0]));
  if(f.laugh>.5)return 'laugh';
  if(f.jaw>.62*(f.jawMax||4))return f.wide<-.3?'talk-oh':'talk-ah';
  if(f.jaw>.22*(f.jawMax||4))return f.wide<-.3?'talk-oh':'talk-eh';
  if(blink>.75)return 'blink';
  if(blink>.35)return 'half-closed';
  if(f.surprise>.5)return 'surprised';
  if(f.smile>.6)return 'big-smile';
  if(f.smile>.25)return 'soft-smile';
  if(SIDE_GLANCES&&f.glance<-.5)return 'look-left';
  if(SIDE_GLANCES&&f.glance>.5)return 'look-right';
  return 'neutral';
}
/* Drawn heads play on two channels that cover different parts of the face, so a blink can happen while
   she talks: `eye` (blink, half closed, glances) and `mouth` (talking visemes chosen by how far the jaw
   is open, or a whole-face laugh, surprise or, for Little Me, smile). null = the live doll's own face
   (the rest pose). fade = cross-fade seconds for that channel. The Grown-up's own face already smiles,
   so her smiles stay her own. */
function expressionTargets(f,doll){
  const b=Math.max(...(f.blink||[0])),jm=f.jawMax||4,jf=(f.jaw||0)/jm;
  const g=SIDE_GLANCES?f.glance:0;
  // the Grown-up's drawn half-closed eyes read as a sideways, sleepy look: her blinks go straight to closed
  const eye=b>(doll==='adult'?.35:.6)?'blink':b>.12&&doll!=='adult'?'half-closed':g<-.35?'look-left':g>.35?'look-right':null;
  let mouth=null,full=false;
  if(f.laugh>.3){mouth='laugh';full=true}
  else if(f.surprise>.3){mouth='surprised';full=true}
  else if(jf>.18)mouth=jf>.55?'talk-ah':f.wide<-.3?'talk-oh':'talk-eh';
  else if(doll==='little'&&f.smile>.35){mouth=f.smile>.75?'big-smile':'soft-smile';full=true}
  return {eye,mouth,eyeFade:.045,mouthFade:full?.16:.06};
}
/* ---------- measured data -> normalized canvas coordinates ---------- */
const views=['front','left','right','back'];
function toCanvas(doll,view,[x,y]){const o=ORIGINS[doll][view];return [(x+o[0])/CANVAS[0],(y+o[1])/CANVAS[1]]}
function mirrorX(doll,x){ // canvas px of the left view -> canvas px of the right view
  const ol=ORIGINS[doll].left[0],or=ORIGINS[doll].right[0];return or+MIRROR[doll]-(x-ol);
}
const cache={};
/* rig(doll, view): {doll, view, side, dir, joints:{name:[nx,ny]}, px:{name:[x,y]} (canvas px), armCut,
   hipLine, skirtTop, neckCut, face (canvas px), legLength}. */
function rig(doll,view){
  const key=doll+'|'+view;if(cache[key])return cache[key];
  const D=DOLL[doll];
  const side=view==='left'||view==='right';
  const src=side?D.left:view==='back'?{...D.front,...Object.fromEntries(Object.entries(D.back).filter(([,v])=>v!==null)),face:null}:D.front;
  const srcView=side?'left':view;
  const P=p=>{const [x,y]=p;const o=ORIGINS[doll][srcView];let X=x+o[0];if(view==='right')X=mirrorX(doll,X);return [X,y+o[1]]};
  const px={};for(const [k,v] of Object.entries(src.joints))px[k]=P(v);
  if(side){ // the far limbs start as copies of the near ones
    for(const [a,b] of [['sh0','sh1'],['el0','el1'],['wr0','wr1'],['hand0','hand1'],['hip0','hip1'],['kn0','kn1'],['an0','an1'],['toe0','toe1']])px[b]=px[a].slice();
  }
  const pts=list=>list&&list.map(P);
  let face=null;
  if(src.face){
    const f=src.face;
    face={eyes:f.eyes.map(pts),mouth:f.mouth.map(([x,y,w])=>[...P([x,y]),w]),corners:pts(f.corners),cheeks:f.cheeks.map(([x,y,r])=>[...P([x,y]),r]),
      chin:f.chin+ORIGINS[doll][srcView][1],jawMax:f.jawMax,teeth:f.teeth,lash:f.lash,lidSample:f.lidSample,lidGap:f.lidGap};
    if(view==='right')face.mouth.reverse();
  }
  const dir=side?(view==='left'?-1:1):0;
  const o=ORIGINS[doll][srcView][1];
  const out={doll,view,side,dir,px,
    joints:Object.fromEntries(Object.entries(px).map(([k,[x,y]])=>[k,[x/CANVAS[0],y/CANVAS[1]]])),
    armCut:side?null:[pts(src.armCut0),pts(src.armCut1)],
    hipLine:pts(src.hipLine),skirtTop:src.skirtTop+o,neckCut:src.neckCut+o,face,legLength:D.legLength,
    flip:view==='right'};
  return cache[key]=out;
}
function residentRig(id){
  const key='res|'+id;if(cache[key])return cache[key];
  const R=RESIDENTS[id];if(!R)return null;
  const f=R.face;
  return cache[key]={doll:'resident',view:'front',side:false,dir:0,resident:id,size:R.size,px:{...R.joints},frames:!!R.frames,
    joints:Object.fromEntries(Object.entries(R.joints).map(([k,[x,y]])=>[k,[x/R.size[0],y/R.size[1]]])),
    neckCut:R.neckCut,face:{...f,mouth:f.mouth.map(p=>p.slice()),eyes:f.eyes,corners:f.corners,cheeks:f.cheeks},legLength:0};
}

/* ---------- seeded randomness ---------- */
function hashSeed(str){let h=2166136261;for(const ch of String(str)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0)||1}
function rand(seed,i){ // deterministic value in [0,1) for (seed, index)
  let x=(seed^Math.imul(i+1,0x9E3779B1))>>>0;x=Math.imul(x^(x>>>16),0x85EBCA6B)>>>0;x=Math.imul(x^(x>>>13),0xC2B2AE35)>>>0;return ((x^(x>>>16))>>>0)/4294967296;
}
/* smooth 1D value noise in [-1, 1] */
function noise(seed,t){const i=Math.floor(t),f=t-i,u=f*f*(3-2*f);return (rand(seed,i)*(1-u)+rand(seed,i+1)*u)*2-1}
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const lerp=(a,b,t)=>a+(b-a)*t;
/* Events at random intervals: the event index and its start time for time t. Intervals lie in
   [min, max] seconds and depend only on (seed, index). */
function eventAt(seed,t,min,max){
  // walk forward from 0 using a fixed sequence; cache per seed for speed
  const key=seed+'|'+min+'|'+max;let c=eventCache.get(key);
  if(!c){c={times:[rand(seed,7)*min]};eventCache.set(key,c);if(eventCache.size>64)eventCache.delete(eventCache.keys().next().value)}
  const T=c.times;
  while(T[T.length-1]<=t)T.push(T[T.length-1]+min+(max-min)*rand(seed,T.length*13+5));
  let lo=0,hi=T.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(T[m]<=t)lo=m;else hi=m-1}
  return T[lo]<=t?{i:lo,start:T[lo],next:T[lo+1]}:{i:-1,start:-Infinity,next:T[0]};
}
const eventCache=new Map();

/* ---------- poses ---------- */
const NB=BONES.length;
function restPose(){
  const bones=[];for(let i=0;i<NB;i++)bones.push({r:0,x:0,y:0,sx:1,sy:1});
  return {bones,face:{blink:[0,0],jaw:0,smile:0,wide:0,squint:0,glance:0,laugh:0,surprise:0},farAlpha:0,turn:0};
}
function copyPose(p){return {bones:p.bones.map(b=>({...b})),face:{...p.face,blink:p.face.blink.slice()},farAlpha:p.farAlpha,turn:p.turn}}
/* a + w * (b - rest): adds a clip's deviation from rest */
function addPose(a,b,w=1){
  if(!w)return a;
  for(let i=0;i<NB;i++){const x=a.bones[i],y=b.bones[i];x.r+=y.r*w;x.x+=y.x*w;x.y+=y.y*w;x.sx+=(y.sx-1)*w;x.sy+=(y.sy-1)*w}
  const f=a.face,g=b.face;
  f.jaw=Math.max(f.jaw,g.jaw*w);f.smile=clamp(f.smile+g.smile*w,0,1.2);f.wide+=g.wide*w;f.squint=clamp(f.squint+g.squint*w,0,1);
  f.glance=clamp(f.glance+g.glance*w,-1,1);f.laugh=Math.max(f.laugh,g.laugh*w);f.surprise=Math.max(f.surprise,g.surprise*w);
  f.blink[0]=Math.max(f.blink[0],g.blink[0]*w);f.blink[1]=Math.max(f.blink[1],g.blink[1]*w);
  a.farAlpha=Math.max(a.farAlpha,b.farAlpha*w);
  return a;
}
/* (1 - t) * a + t * b for the bones (faces add), in place into a */
function mixPose(a,b,t){
  if(t<=0)return a;
  for(let i=0;i<NB;i++){const x=a.bones[i],y=b.bones[i];for(const k of ['r','x','y','sx','sy'])x[k]=lerp(x[k],y[k],t)}
  a.farAlpha=lerp(a.farAlpha,b.farAlpha,t);
  return a;
}
function bone(p,name){return p.bones[B[name]]}

/* ---------- forward kinematics ---------- */
/* Affine 2D matrices [a,b,c,d,e,f]: x' = a x + c y + e, y' = b x + d y + f. */
const mul=(m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
const apply=(m,[x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
/* Local transform of a bone at fraction f (0 = rest, 1 = full): about joint J,
   T(J + f t) R(f r) S(1 + f (s - 1)) T(-J). */
function localMatrix(b,J,f=1){
  const r=b.r*f,c=Math.cos(r),s=Math.sin(r),sx=1+(b.sx-1)*f,sy=1+(b.sy-1)*f,tx=J[0]+b.x*f,ty=J[1]+b.y*f;
  const a=c*sx,bb=s*sx,cc=-s*sy,d=c*sy;
  return [a,bb,cc,d,tx-(a*J[0]+cc*J[1]),ty-(bb*J[0]+d*J[1])];
}
/* World matrices of every bone for a pose and a rig (canvas px). */
function forward(rg,pose){
  const out=new Array(NB);
  for(let i=0;i<NB;i++){
    const name=BONES[i],J=rg.px[PIVOT[name]]||rg.px.root,L=localMatrix(pose.bones[i],J);
    out[i]=PARENT[name]?mul(out[B[PARENT[name]]],L):L;
  }
  return out;
}

/* ---------- clips ---------- */
/* ctx: {seed, doll ('adult' | 'little' | 'resident'), view, rig, energy (0..1, idle amplitude)} */
function idlePose(t,ctx){
  const p=restPose(),s=ctx.seed,kid=ctx.doll==='little',side=ctx.rig?.side,dir=ctx.rig?.dir||0,e=ctx.energy??1;
  const breathT=kid?2.6:3.4,ph=t/breathT*TAU+rand(s,1)*TAU,br=Math.sin(ph)*.5+.5;
  // breathing: chest rises and widens a touch, shoulders lift, head rides along
  const chest=bone(p,'chest');chest.y=-br*(kid?1.1:1.0)*e;chest.sx=1+br*.007*e;chest.sy=1+br*.004*e;
  for(const a of ['arm0','arm1']){bone(p,a).y=-br*.5*e}
  // weight shift: slow sway of the hips and counter-sway of the chest
  const ws=noise(s+11,t/(kid?2.3:3.4)),ws2=noise(s+23,t/(kid?1.4:2.2));
  const hips=bone(p,'hips');hips.x=ws*(kid?2.2:2.4)*e;hips.r=ws*(kid?.8:.55)*DEG*e*(side?.4:1);
  bone(p,'spine').r=-ws*(kid?.5:.35)*DEG*e;chest.r=-ws*.3*DEG*e;
  bone(p,'root').r=ws2*(kid?.55:.25)*DEG*e*(side?.5:1);
  // occasional head tilt (toddler: bigger, curious)
  const ev=eventAt(s+31,t,kid?3:4,kid?7:9),u=t-ev.start,hold=kid?1.8:1.6;
  const tiltAmt=ev.i<0?0:(rand(s,ev.i*3+2)*2-1)*(kid?5.5:3.2)*DEG*smooth(0,.55,u)*(1-smooth(hold,hold+.7,u));
  const head=bone(p,'head');head.r=tiltAmt*e+noise(s+41,t/2.7)*.6*DEG*e;head.x=0;
  bone(p,'neck').r=tiltAmt*.25*e;
  // arms: tiny drift
  bone(p,'arm0').r=noise(s+51,t/3.1)*.8*DEG*e+(side?0:br*.25*DEG);bone(p,'arm1').r=noise(s+57,t/3.3)*.8*DEG*e-(side?0:br*.25*DEG);
  bone(p,'fore0').r=noise(s+61,t/2.6)*1.2*DEG*e;bone(p,'fore1').r=noise(s+67,t/2.9)*1.2*DEG*e;
  if(kid){bone(p,'arm0').r+=(side?0:1.5*DEG);bone(p,'arm1').r-=(side?0:1.5*DEG)}
  // blinking at natural random intervals (sometimes twice)
  const f=p.face;
  f.blink[0]=f.blink[1]=blinkAt(t,s);
  // now and then a warm moment (warmMoment): a soft smile held a little, a slow blink or a small head tilt
  const w=warmMoment(t,s,kid);
  f.smile=Math.max(f.smile,w.smile*e);
  f.blink[0]=f.blink[1]=Math.max(f.blink[0],w.blink);
  head.r+=w.tilt*e;bone(p,'neck').r+=w.tilt*.25*e;
  // glances left / right (only if SIDE_GLANCES)
  if(SIDE_GLANCES&&!side&&ctx.doll!=='resident'){
    const g=eventAt(s+71,t,5,11),gu=t-g.start,dirG=rand(s,g.i*5+3)<.5?-1:1;
    f.glance=g.i<0||rand(s,g.i*5+4)<.35?0:dirG*smooth(0,.18,gu)*(1-smooth(1.1,1.3,gu));
  }
  return p;
}
/* Idle variety every 5 to 11 s: {smile, blink, tilt (radians)}. Half the moments are a soft smile held
   about 2.4 s, a quarter a slow blink (the eyes rest closed for half a second), a quarter a small
   head tilt with a smile. */
function warmMoment(t,seed,kid){
  const ev=eventAt(seed+71,t,5,11),u=t-ev.start,out={smile:0,blink:0,tilt:0};
  if(ev.i<0)return out;
  const k=rand(seed,ev.i*5+3),sgn=rand(seed,ev.i*5+4)<.5?-1:1;
  if(k<.5){out.smile=.55*smooth(0,.5,u)*(1-smooth(2.4,3,u))}
  else if(k<.75){out.blink=u<.12?smooth(0,.12,u):u<.62?1:1-smooth(.62,.82,u);out.smile=.3*smooth(0,.4,u)*(1-smooth(1.4,1.9,u))}
  else{const a=smooth(0,.6,u)*(1-smooth(1.9,2.5,u));out.tilt=sgn*(kid?4:2.5)*DEG*a;out.smile=.4*a}
  return out;
}
/* Eyelid closure at time t: a quick close-open every 2.5 to 6 s, one in five doubled. */
function blinkAt(t,seed){
  const ev=eventAt(seed+101,t,2.4,6),u=t-ev.start;
  if(ev.i<0)return 0;
  const one=x=>x<0||x>.2?0:x<.07?smooth(0,.07,x):1-smooth(.07,.2,x);
  return Math.max(one(u),rand(seed,ev.i*7+1)<.2?one(u-.26):0);
}
/* Talking: syllable-like jaw motion in [0, 1] x jawMax, with pauses and light nods. */
function talkPose(t,ctx){
  const p=restPose(),s=ctx.seed,f=p.face,max=ctx.rig?.face?.jawMax||3;
  const syl=Math.abs(Math.sin(t*TAU*2.6+noise(s+3,t*1.3)*2)),open=clamp(.25+.75*(noise(s+5,t*3.1)*.5+.5),0,1);
  const pause=smooth(.55,.75,noise(s+7,t*.7)*.5+.5);
  f.jaw=max*syl*open*(1-pause);
  f.wide=noise(s+9,t*2.2)*.8;
  bone(p,'head').r=noise(s+13,t*1.6)*1.4*DEG;bone(p,'head').y=-Math.abs(noise(s+17,t*2.4))*.8;
  bone(p,'neck').r=noise(s+19,t*1.1)*.6*DEG;
  return p;
}
/* Emotes: one-shot clips. emotePose(name, t, ctx) -> {pose, done}. DURATION in seconds. */
const DURATION={smile:1.8,laugh:1.9,wave:2.2,cheer:1.9,sway:1.7,shy:2.2,pose:1.5,nod:1,waveLow:2.2,wiggle:1.9,poseSoft:1.5,waveSafe:2,poseSafe:1.5};
/* The emote actually played: long sleeves always use the gentle variants; puffed sleeves in profile too
   (the near arm is only drawn below their hem there, so it cannot rise out from under them). */
function emoteFor(name,outfit,view){
  if(!RAISED_ARM_EMOTES&&ARM_SAFE[name])return ARM_SAFE[name];
  const sl=SLEEVES[outfit]||'none',side=view==='left'||view==='right';
  return GENTLE[name]&&(sl==='long'||(sl==='puff'&&side))?GENTLE[name]:name;
}
function envelope(t,dur,a=.25,b=.4){return smooth(0,a,t)*(1-smooth(dur-b,dur,t))}
function emotePose(name,t,ctx){
  const p=restPose(),kid=ctx.doll==='little',rg=ctx.rig||{},side=rg.side,dir=rg.dir||0,f=p.face;
  const dur=DURATION[name]||1.5,e=envelope(t,dur);
  const out=(i)=>side?-dir:i===0?1:-1; // rotation sign that lifts arm i outward (side: forward)
  switch(name){
    case 'smile':f.smile=e;f.squint=.6*e;bone(p,'head').r=(kid?3:1.5)*DEG*e;break;
    case 'laugh':{
      const b=Math.abs(Math.sin(t*TAU*3.2));f.smile=e;f.laugh=e;f.squint=e;f.jaw=(rg.face?.jawMax||3)*(.45+.45*b)*e;
      bone(p,'chest').y=-1.6*b*e;bone(p,'arm0').y=bone(p,'arm1').y=-1.4*b*e;
      bone(p,'head').r=(side?dir*-5:3)*DEG*e;bone(p,'head').y=-1.2*b*e;bone(p,'neck').r=(side?dir*-2:1)*DEG*e;
      break;
    }
    case 'wave':{
      const i=side?0:1,o=out(i),w=Math.sin(t*TAU*2.6)*e;
      // profile: the arm goes up above the shoulder, the hand waves above the head, clear of the face
      bone(p,'arm'+i).r=o*(side?152:kid?95:112)*DEG*e;bone(p,'fore'+i).r=o*(side?12:kid?55:48)*DEG*e+o*w*(side?12:16)*DEG;bone(p,'hand'+i).r=o*w*10*DEG;
      f.smile=.8*e;f.squint=.4*e;bone(p,'head').r=(side?0:(i?1:-1)*2.5)*DEG*e;
      break;
    }
    case 'cheer':{
      const b=Math.abs(Math.sin(t*TAU*2.2)),wig=Math.sin(t*TAU*4.4);
      // profile: the near arm goes straight up behind the face, never across it
      for(const i of [0,1]){const o=out(i);bone(p,'arm'+i).r=o*(side?170:kid?132:146)*DEG*e+o*wig*5*DEG*e;bone(p,'fore'+i).r=o*(side?4:kid?20:14)*DEG*e}
      f.smile=e;f.jaw=(rg.face?.jawMax||3)*.65*e;f.squint=.8*e;f.laugh=e*.6;p.farAlpha=side?e:0;
      bone(p,'root').y=-b*(kid?7:9)*e;bone(p,'head').r=(side?dir*-4:0)*DEG*e;
      break;
    }
    case 'sway':{
      const w=Math.sin(t/dur*TAU*2)*e;
      bone(p,'root').r=w*(kid?3.2:2.6)*DEG;bone(p,'hips').x=w*(kid?5:6);bone(p,'chest').r=-w*1.4*DEG;bone(p,'head').r=-w*2.4*DEG;
      bone(p,'skirt0').r=w*4*DEG;bone(p,'skirt1').r=w*4*DEG;
      if(!side){bone(p,'arm0').r=(2.5+w*1.2)*DEG*e;bone(p,'arm1').r=-(2.5-w*1.2)*DEG*e}
      f.smile=e;f.squint=.5*e;
      break;
    }
    case 'shy':{
      f.smile=.65*e;f.squint=.3*e;bone(p,'head').r=(side?dir*-6:7)*DEG*e;bone(p,'neck').r=(side?0:2)*DEG*e;bone(p,'chest').y=-2.2*e;
      if(!side){bone(p,'arm0').r=-3*DEG*e;bone(p,'arm1').r=3*DEG*e;bone(p,'fore0').r=-18*DEG*e;bone(p,'fore1').r=18*DEG*e}
      bone(p,'root').r=Math.sin(t*TAU*.9)*1.2*DEG*e;
      if(SIDE_GLANCES)f.glance=side?0:-.7*e;
      break;
    }
    case 'pose':{ // runway: weight on one hip, head tilt, smile
      bone(p,'hips').x=7*e;bone(p,'hips').r=-1.8*DEG*e;bone(p,'chest').r=1.6*DEG*e;bone(p,'head').r=-3.5*DEG*e;
      if(!side){bone(p,'arm1').r=-24*DEG*e;bone(p,'fore1').r=72*DEG*e;bone(p,'hand1').r=10*DEG*e} // hand on the hip
      f.smile=e;f.squint=.5*e;
      break;
    }
    case 'nod':bone(p,'head').r=Math.sin(t*TAU*2)*3*DEG*e;f.smile=.4*e;break;
    // gentle variants (long sleeves): arms stay low, the face and a bounce carry the feeling
    case 'waveLow':{ // the arm lifted a little, the hand waving
      const i=side?0:1,o=out(i),w=Math.sin(t*TAU*2.6)*e;
      bone(p,'arm'+i).r=o*(side?30:35)*DEG*e;bone(p,'fore'+i).r=o*(side?18:14)*DEG*e+o*w*6*DEG;bone(p,'hand'+i).r=o*(10+w*20)*DEG*e;
      f.smile=.8*e;f.squint=.4*e;bone(p,'head').r=(side?0:(i?1:-1)*3)*DEG*e;
      break;
    }
    case 'wiggle':{ // a happy bounce: elbows in, hands up a little, shoulders and head bob, big smile
      const b=Math.abs(Math.sin(t*TAU*2.2)),sw=Math.sin(t*TAU*1.1);
      for(const i of [0,1]){const o=out(i);bone(p,'arm'+i).r=o*(side?-3:3)*DEG*e;bone(p,'fore'+i).r=o*(side?14:-6)*DEG*e}
      bone(p,'root').y=-b*(kid?6:7)*e;bone(p,'head').r=(side?dir*-3:sw*4)*DEG*e;bone(p,'hips').x=(side?0:sw*4)*e;
      f.smile=e;f.jaw=(rg.face?.jawMax||3)*.6*e;f.laugh=.8*e;f.squint=.8*e;
      break;
    }
    case 'waveSafe':{ // a friendly hello without lifting the arm: head tilt, a little bob, a big smile
      const i=side?0:1,b=Math.abs(Math.sin(t*TAU*1.6));
      bone(p,'head').r=(side?dir*-4:(i?1:-1)*5.5)*DEG*e;bone(p,'neck').r=(side?0:(i?1:-1)*1.5)*DEG*e;
      bone(p,'root').y=-b*(kid?3:2.5)*e; // the whole body bobs: no part moves against another
      f.smile=e;f.squint=.6*e;
      break;
    }
    case 'poseSafe':{ // weight on one hip, head tilt, smile; arms as at rest
      bone(p,'hips').x=7*e;bone(p,'hips').r=-1.8*DEG*e;bone(p,'chest').r=1.6*DEG*e;bone(p,'head').r=-3.5*DEG*e;
      f.smile=e;f.squint=.5*e;
      break;
    }
    case 'poseSoft':{ // runway pose without the bent elbow: weight on one hip, head tilt, arm a little out
      bone(p,'hips').x=7*e;bone(p,'hips').r=-1.8*DEG*e;bone(p,'chest').r=1.6*DEG*e;bone(p,'head').r=-3.5*DEG*e;
      if(!side){bone(p,'arm1').r=-8*DEG*e;bone(p,'arm0').r=3*DEG*e}
      f.smile=e;f.squint=.5*e;
      break;
    }
  }
  return {pose:p,done:t>=dur};
}
/* ---------- walking ---------- */
/* Gait per doll: stride (foot travel during stance, in leg lengths), stance fraction, lift, hip drop and
   bob (doll px), arm swing and lean (degrees), cycle (seconds per two steps). GAIT is the easy stroll of
   a short hop; GAIT_FAST the brisk, slightly stylised walk of a long one (longer strides, quicker
   steps; Little Me scampers). pace k in [0, 1] blends them (gait(doll, k)). */
const GAIT={adult:{stride:.62,stance:.6,lift:.075,drop:7,bob:2.2,arm:15,fore:12,lean:2.5,cycle:.66},
  little:{stride:.5,stance:.58,lift:.08,drop:6,bob:2.4,arm:9,fore:8,lean:1.2,cycle:.48}};
const GAIT_FAST={adult:{stride:.92,stance:.56,lift:.09,drop:7,bob:2.4,arm:24,fore:22,lean:4.5,cycle:.5},
  little:{stride:.96,stance:.55,lift:.1,drop:6,bob:2.6,arm:16,fore:14,lean:3,cycle:.36}};
function gait(doll,k=0){
  const a=GAIT[doll],b=GAIT_FAST[doll];if(!k)return a;
  const out={};for(const key in a)out[key]=lerp(a[key],b[key],clamp(k,0,1));
  // the cycle follows the cadence (steps per second), not the period, so speed grows smoothly
  out.cycle=1/lerp(1/a.cycle,1/b.cycle,clamp(k,0,1));
  return out;
}
/* Doll px travelled per gait cycle (one step of each foot). */
function cycleLength(doll,view,k=0){const g=gait(doll,k),L=DOLL[doll].legLength;const side=view==='left'||view==='right';return g.stride*L/g.stance*(side?1:.42)}
/* Travel speed (doll px per second) at pace k. */
function walkSpeed(doll,view='left',k=0){return cycleLength(doll,view,k)/gait(doll,k).cycle}
/* Pace for a walk of `dist` doll px: short hops stroll, long walks are brisk. */
function paceFor(doll,dist){const L=DOLL[doll].legLength;return smooth(L*2,L*9,dist)}
function solveIK(H,T,l1,l2,bend){
  let vx=T[0]-H[0],vy=T[1]-H[1],d=Math.hypot(vx,vy);
  const dc=clamp(d,Math.abs(l1-l2)+1e-3,(l1+l2)*.9995);
  const base=Math.atan2(vy,vx),g=Math.acos(clamp((l1*l1+dc*dc-l2*l2)/(2*l1*dc),-1,1));
  const a1=base+bend*g,K=[H[0]+Math.cos(a1)*l1,H[1]+Math.sin(a1)*l1];
  const a2=Math.atan2(T[1]-K[1],T[0]-K[0]);
  return {a1,a2,K,reach:d};
}
/* Foot path of a leg at gait phase q in [0,1): {fx, fy, rot} relative to the rest ankle (fx along the
   facing direction, fy up negative), rot = foot pitch (positive = toes down / heel up). */
function footPath(q,g,D,L){
  q=((q%1)+1)%1;
  if(q<g.stance){
    const u=q/g.stance;
    return {fx:D/2-D*u,fy:0,rot:-14*DEG*(1-smooth(0,.18,u))+26*DEG*smooth(.72,1,u),stance:true,u};
  }
  const u=(q-g.stance)/(1-g.stance),ease=u*u*(3-2*u);
  return {fx:-D/2+D*ease,fy:-g.lift*L*Math.sin(Math.PI*Math.pow(u,.85))*(1-.25*u),rot:26*DEG*(1-smooth(0,.45,u))-14*DEG*smooth(.6,1,u),stance:false,u};
}
/* walkPose(phase, ctx) -> pose. phase in cycles (grows with distance travelled / cycleLength).
   ctx.rig is the view's rig; front view = coming toward the camera, back view = going away. */
function walkPose(phase,ctx){
  const rg=ctx.rig,doll=ctx.doll,k=ctx.pace||0,g=gait(doll,k),L=rg.legLength,p=restPose(),kid=doll==='little';
  const ph=((phase%1)+1)%1,D=g.stride*L;
  if(rg.side){
    const d=rg.dir;
    // hips: lowest at heel strike (double support), highest at mid stance
    const hips=bone(p,'hips');hips.y=g.drop+g.bob*Math.cos(TAU*2*(ph-.02));
    hips.r=Math.sin(TAU*ph)*(kid?1.4:1)*DEG;
    bone(p,'spine').r=d*g.lean*DEG;bone(p,'chest').r=-Math.sin(TAU*ph)*1.1*DEG;
    bone(p,'head').r=-d*g.lean*.8*DEG-bone(p,'chest').r*.8-hips.r;bone(p,'neck').r=0;
    bone(p,'hair').r=d*1.5*DEG;
    const W=forward(rg,p),hipsM=W[B.hips];
    const legs=[];
    for(const i of [0,1]){
      const q=ph+(i?.5:0),fp=footPath(q,g,D,L);
      const H=apply(hipsM,rg.px['hip'+i]),A0=rg.px['an'+i],K0=rg.px['kn'+i],T0=rg.px['toe'+i];
      const l1=Math.hypot(K0[0]-rg.px['hip'+i][0],K0[1]-rg.px['hip'+i][1]),l2=Math.hypot(A0[0]-K0[0],A0[1]-K0[1]);
      // the ankle: on the path, then (heel up / toes down) rotated about the toe or the heel on the ground
      let A=[A0[0]+d*fp.fx,A0[1]+fp.fy];
      const toe=[T0[0]+d*fp.fx,T0[1]+fp.fy],rot=d*fp.rot; // screen rotation of the foot (toes down > 0)
      if(fp.rot>0){const c=Math.cos(rot),s=Math.sin(rot),vx=A[0]-toe[0],vy=A[1]-toe[1];A=[toe[0]+c*vx-s*vy,toe[1]+s*vx+c*vy]}
      else{const heel=[A0[0]-d*10+d*fp.fx,rg.px.root[1]-4+fp.fy],c=Math.cos(rot),s=Math.sin(rot),vx=A[0]-heel[0],vy=A[1]-heel[1];A=[heel[0]+c*vx-s*vy,heel[1]+s*vx+c*vy]}
      // long strides: the leg may stretch a little (up to 10%) rather than the hips dropping (no crouch, no hop)
      const st=clamp(Math.hypot(A[0]-H[0],A[1]-H[1])/((l1+l2)*.99),1,1.1);
      const ik=solveIK(H,A,l1*st,l2*st,-d);
      const restA1=Math.atan2(K0[1]-rg.px['hip'+i][1],K0[0]-rg.px['hip'+i][0]),restA2=Math.atan2(A0[1]-K0[1],A0[0]-K0[0]);
      const thigh=bone(p,'thigh'+i),shin=bone(p,'shin'+i),foot=bone(p,'foot'+i);
      const hipRot=hips.r+bone(p,'root').r;
      thigh.r=ik.a1-restA1-hipRot;shin.r=(ik.a2-restA2)-(ik.a1-restA1);foot.r=rot-(ik.a2-restA2);
      if(st>1){thigh.sy=st;foot.sy=1/st}
      legs.push(fp);
    }
    // arms swing opposite to the legs; the far arm mirrors the near one
    for(const i of [0,1]){
      const sw=Math.cos(TAU*(ph+(i?.5:0)));      // +1: this side's leg is forward -> its arm is back
      bone(p,'arm'+i).r=d*g.arm*DEG*sw+(kid?-d*3*DEG:0);
      bone(p,'fore'+i).r=-d*(g.fore*.55+g.fore*.45*Math.max(0,-sw))*DEG;
      bone(p,'hand'+i).r=-d*3*DEG*Math.max(0,-sw);
    }
    // skirt: the front flares with the leading knee, the back with the trailing one
    const fwd=Math.max(...[0,1].map(i=>-d*bone(p,'thigh'+i).r)),back=Math.max(...[0,1].map(i=>d*bone(p,'thigh'+i).r));
    bone(p,'skirt0').r=-d*fwd*.6;bone(p,'skirt1').r=d*back*.45;
    p.farAlpha=1;
    return p;
  }
  // front (toward the camera) / back (away): the legs pitch in depth, seen as foreshortening
  const toward=rg.view!=='back',stanceTravel=cycleLength(doll,rg.view,k)*g.stance;
  const hips=bone(p,'hips');
  hips.y=g.drop*.6+g.bob*.8*Math.cos(TAU*2*ph);
  const sway=Math.sin(TAU*ph);
  hips.x=sway*(kid?3.6:2.8);hips.r=-sway*(kid?1.8:1.2)*DEG;
  bone(p,'chest').r=sway*.7*DEG;bone(p,'head').r=sway*.5*DEG+(kid?Math.sin(TAU*ph*2)*1.2*DEG:0);
  bone(p,'root').r=kid?Math.sin(TAU*ph)*1.4*DEG:0;
  const W0=forward(rg,p);
  for(const i of [0,1]){
    const q=((ph+(i?.5:0))%1+1)%1,A0=rg.px['an'+i],H0=rg.px['hip'+i],Hw=apply(W0[B.hips],H0),legLen=A0[1]-H0[1];
    let off,lift=0,bend=0;
    if(q<g.stance){const u=q/g.stance;off=(toward?1:-1)*(stanceTravel/2-stanceTravel*u)}
    else{const u=(q-g.stance)/(1-g.stance),ease=u*u*(3-2*u);off=(toward?1:-1)*(-stanceTravel/2+stanceTravel*ease);lift=Math.sin(Math.PI*u)*g.lift*L*.55;bend=Math.sin(Math.PI*u)}
    // off > 0: the foot is in front (lower on screen, the leg comes toward us); lift raises the foot.
    // The leg is foreshortened so the ankle lands there wherever the bobbing hip is.
    const th=bone(p,'thigh'+i),sh=1-bend*.05;
    th.r=(kid?(i?-1:1)*2.2*DEG:0);
    const sy=(A0[1]+off-lift-Hw[1])/(legLen*Math.cos(th.r));
    bone(p,'shin'+i).sy=sh;th.sy=sy/sh;bone(p,'foot'+i).sy=1/sy;
  }
  for(const i of [0,1]){
    const sw=Math.cos(TAU*(ph+(i?.5:0))),o=i?-1:1;
    bone(p,'arm'+i).r=o*(kid?7:2.5)*DEG+o*Math.max(0,sw)*1.5*DEG;bone(p,'arm'+i).sy=1-Math.abs(sw)*.03;
    bone(p,'fore'+i).r=o*(kid?-6:-3)*DEG*(.5+.5*Math.max(0,-sw));
  }
  bone(p,'skirt0').r=sway*2*DEG;bone(p,'skirt1').r=sway*2*DEG;
  return p;
}
/* Damped spring (critically damped-ish) step: state {x, v} toward target. */
function springStep(st,target,dt,freq=2.2,damp=.55){
  const w=TAU*freq,a=w*w*(target-st.x)-2*damp*w*st.v;
  st.v+=a*dt;st.x+=st.v*dt;return st.x;
}

/* ---------- face displacement (procedural face) ---------- */
/* Mouth line at x (canvas px): its y and opening weight (0 at the corners). Side views: beyond the
   front of the face the weight stays 1. */
function mouthAt(face,x){
  const m=face.mouth;const asc=m[0][0]<m[m.length-1][0];
  const pts=asc?m:m.slice().reverse();
  if(x<=pts[0][0])return [pts[0][1],pts[0][2]];
  if(x>=pts[pts.length-1][0])return [pts[pts.length-1][1],pts[pts.length-1][2]];
  for(let i=1;i<pts.length;i++)if(x<=pts[i][0]){const a=pts[i-1],b=pts[i],t=(x-a[0])/(b[0]-a[0]);return [lerp(a[1],b[1],t),lerp(a[2],b[2],t)]}
  return [pts[pts.length-1][1],0];
}
/* Displacement [dx, dy] of the rest point (x, y) of the head for face parameters f. `below` tells
   which side of the mouth line the point belongs to (mesh rows straddle the line). */
function faceDisplace(face,f,x,y,below){
  let dx=0,dy=0;
  const [my,w]=mouthAt(face,x);
  const xs=face.mouth.map(p=>p[0]),x0=Math.min(...xs),x1=Math.max(...xs),cx=(x0+x1)/2,hw=(x1-x0)/2;
  // jaw: below the mouth line the lower lip and chin drop; the opening tapers to the corners
  if(f.jaw&&below){
    const v=y-my,chinW=smooth(hw*1.5,hw*.6,Math.abs(x-cx));
    const shape=lerp(w,Math.max(w,chinW),smooth(0,7,v));
    const taper=1-smooth(face.chin,face.chin+(face.neckGap||12),y);
    dy+=f.jaw*shape*taper;
  }
  const sm=f.smile||0,wide=f.wide||0;
  if(sm||wide){
    for(const [kx,ky] of face.corners){
      const r=Math.max(4,hw*.42),d2=((x-kx)**2+(y-ky)**2)/(r*r),g=Math.exp(-d2*1.6);
      const out=face.corners.length>1?Math.sign(kx-cx):(kx>face.mouth[0][0]?1:-1);
      dx+=g*out*(sm*hw*.07+wide*hw*.05);dy+=g*(-sm*hw*.11);
    }
    for(const [kx,ky,r] of face.cheeks){const d2=((x-kx)**2+(y-ky)**2)/(r*r),g=Math.exp(-d2*1.3);dy-=g*sm*r*.1}
  }
  const sq=f.squint||0;
  if(sq)for(const eye of face.eyes){
    let ex=0,ey=0,ymax=-1e9;for(const [px,py] of eye){ex+=px;ey+=py;if(py>ymax)ymax=py}ex/=eye.length;ey/=eye.length;
    const ew=Math.max(...eye.map(p=>p[0]))-Math.min(...eye.map(p=>p[0]));
    const d2=((x-ex)/(ew*.6))**2+((y-ymax-ew*.08)/(ew*.28))**2,g=Math.exp(-d2*1.5)*(y>ey?1:.2);
    dy-=g*sq*ew*.05;
  }
  return [dx,dy];
}

const api={SIDE_GLANCES,warmMoment,TAU,DEG,CANVAS,BONES,PARENT,PIVOT,B,NB,ORIGINS,MIRROR,DOLL,OUTFIT_KIND,RESIDENTS,EXPRESSIONS,EXPRESSION_ART,EXPRESSION_REGION,GAIT,DURATION,
  views,rig,residentRig,toCanvas,expressionFor,expressionTargets,hashSeed,rand,noise,clamp,smooth,lerp,eventAt,
  restPose,copyPose,addPose,mixPose,localMatrix,forward,mul,apply,
  idlePose,blinkAt,talkPose,emotePose,envelope,walkPose,footPath,solveIK,cycleLength,walkSpeed,springStep,GAIT_FAST,gait,paceFor,
  mouthAt,faceDisplace,outfitKind:id=>OUTFIT_KIND[id]||'skirt',SKIRT_TOP,LONG_SLEEVES,RAISED_ARM_EMOTES,EMOTES,ARM_SAFE,ARM_SAFE_MAX,SLEEVES,sleevesOf:id=>SLEEVES[id]||'none',GENTLE,emoteFor,
  /* the rig of a view as dressed in an outfit (its own skirt line, canvas px) */
  dressedRig(doll,view,outfit){const rg=rig(doll,view),y=SKIRT_TOP[outfit]?.[doll];if(y===undefined)return rg;
    const srcView=view==='right'?'left':view;return {...rg,skirtTop:y+ORIGINS[doll][srcView][1]}}};
root.HibiscusPuppetRig=api;
if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
