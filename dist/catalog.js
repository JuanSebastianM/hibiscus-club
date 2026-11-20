/* Hibiscus Club wardrobe catalog: every wearable, its art, tints and per-doll fit, plus the
   makeup/nail/hair-colour option lists and the look model (readLook, defaultLook).

   Coordinates in `fit` are doll-local pixels: positions in the cropped base picture
   CATALOG.dolls[doll].art[view]. Fit and art are keyed by view; only 'front' exists today, and a
   later 'left' / 'right' / 'back' view only needs new art + fit entries.

   Fit shapes (see portrait.js):
   - outfit: {pieces:[{part, warp:[[spriteY, dollY, spriteXa, dollXa, spriteXb, dollXb], ...],
              parts:[{poly, pivot, to, rot, scale:[kx,ky], under}], cut:[poly]}],
              skin:[{poly|rect|ellipse}] (bodysuit pixels repainted as skin there), shoesOver}
   - shoes:  {left:{x,y,w,rot}, right:{...}, collar} (sprite part top-left; collar = fraction of
              the shoe height above which the shoe is drawn behind the leg)
   - hair:   {x,y,w,h,rot} or {warp}, front:[shapes] (if set: whole style drawn behind the body and
              only these doll-local regions again in front; feather softens them), cut:[sprite polys],
              clip:{x,y,rot,scale}, scalp:{to,part} (scalp underlayer flow, from SCALP_FLOW)
   - earrings (pairs): {left:{x,y,w,rot}, right:{...}} with item.anchor = hook point (0..1) per side
   - necklace / other sprites: {x,y,w,h,rot} or {warp}, keep/cut: sprite-space polygons
   - clip sprites: item.size[doll] = width in doll px, item.anchor = [0..1, 0..1]; placed at the
              hair style's fit.clip. Procedural clips (proc 1..3) are drawn by drawCharm. */
const CATALOG=(()=>{
const A='assets/items/';
const art=(cat,id,parts)=>({front:{main:A+cat+'/'+id+'.webp',parts:parts?Object.fromEntries(parts.map(p=>[p,A+cat+'/'+id+'-'+p+'.webp'])):undefined}});
const original={id:'original',name:'Original'};
/* Hair: map the sprite's face window (from the slicer manifest) onto a doll face box [x0, x1, top];
   ky stretches vertically relative to the horizontal scale. */
const hairFaces={'long-waves':[112,72,130,349,536],'side-ponytail':[116,126,142,278,548],'half-up-curls':[114,112,130,356,534],
  'ringlet-pigtails':[66,134,306,424,417],'curly-buns':[110,154,232,445,362],'curly-bob':[118,128,202,437,359]};
/* Front view of long styles: the hair is in front of the body above the shoulders and over the torso
   only; where it hangs over the arms it falls behind them (fit.front, feathered). */
const ARMS_CLEAR={adult:[{poly:[[-300,-300],[700,-300],[700,186],[300,192],[285,240],[274,280],[268,300],[263,320],[264,340],[274,360],[285,380],[293,400],[299,420],[304,440],[307,460],[306,480],[303,500],[299,520],[294,540],[290,900],[110,900],[105,540],[100,520],[96,500],[93,480],[92,460],[94,440],[100,420],[106,400],[114,380],[126,360],[136,340],[136,320],[131,300],[125,280],[114,240],[98,192],[-300,186]],feather:2.5}],
  little:[{poly:[[-300,-300],[700,-300],[700,226],[306,232],[290,280],[281,330],[281,345],[284,400],[292,420],[298,440],[304,460],[309,480],[312,500],[311,520],[308,540],[303,560],[300,900],[105,900],[101,560],[96,540],[94,520],[93,500],[95,480],[100,460],[106,440],[113,420],[120,400],[123,345],[122,330],[112,280],[97,232],[-300,226]],feather:2.5}]};
const hf=(id,[x0,x1,top],ky=1,extra={})=>{const [fx,fy,fw,W,H]=hairFaces[id],k=(x1-x0)/fw;
  return {x:x0-fx*k,y:top-fy*k*ky,w:W*k,h:H*k*ky,...extra}};
/* A cut-out limb (sleeve, trouser leg) mapped from sprite points s0 (shoulder) -> s1 (cuff) onto doll
   points d0 -> d1, with kx = width scale. Produces {poly,pivot,to,rot,scale} for drawPiece. */
const limb=(poly,s0,s1,d0,d1,kx=1,extra={})=>{
  const sv=[s1[0]-s0[0],s1[1]-s0[1]],dv=[d1[0]-d0[0],d1[1]-d0[1]];
  const ky=Math.hypot(...dv)/Math.hypot(...sv);
  const rot=(Math.atan2(dv[1],dv[0])-Math.atan2(sv[1]*ky,sv[0]*kx))*180/Math.PI;
  return {poly,pivot:s0,to:d0,rot,scale:[kx,ky],...extra};
};
const dolls={
  adult:{name:'Grown-up',art:{front:'assets/dolls/adult-front.webp'},size:[397,873],origin:[100,145],
    skin:[226,144,92],suitLuma:146,
    face:{unit:26,
      lips:[[183,119.4],[187,117.2],[193,115.6],[200,115.3],[205,116.6],[210,115.3],[218,115.7],[226,116.8],[231.5,119],[228.5,124],[223,130],[215,134.6],[206,136],[196,134.8],[190,130],[186,124.5]],
      mouth:[[185,120.5],[194,119.4],[206,120],[218,119.4],[230,119.2],[226,124],[217,127.6],[206,128.4],[194,127.4],[187,124]],
      lipRef:120,lipBlur:1,
      lids:[{gradient:[188,80,17,6.5,1]},{gradient:[204,79,6,4,.7]},{gradient:[232,80.5,17,6.5,1]},{gradient:[247,79.5,6,4,.7]}],
      eyes:[[[175,85],[180,82],[188,80.5],[196,81.5],[202,85],[196,87.5],[186,88],[179,87]],[[219,86],[224,82.5],[232,81],[240,82],[245,85],[239,87.5],[229,88],[222,87.5]]],
      lidBlur:0,
      cheeks:[[170,107,17,11],[243,105,16,11]],cheekbones:[[171,101],[243,99]],
      gemAt:[246,103],crystals:[[244,92.5,1.6],[247.5,95.5,1.4],[249.5,99.5,1.2]],
      lobes:[[150,107],[254,105]]},
    nails:{ref:205,fingers:[[38,507.5,2.4,4.3,0],[355.5,507.5,2.4,4.3,0]],
      toes:[[118,858,2.2,1.8,0],[126,858.5,2.2,1.8,0],[133.5,859,2.4,2,0],[141.5,858.5,2.6,2.2,0],[151,857,3.4,2.6,0],
            [244,857,3.4,2.6,0],[254,858.5,2.6,2.2,0],[262,859,2.4,2,0],[269.5,858.5,2.2,1.8,0],[277,858,2.2,1.8,0]]}},
  little:{name:'Little Me',art:{front:'assets/dolls/little-front.webp'},size:[403,863],origin:[99,155],
    skin:[220,134,85],suitLuma:156,
    face:{unit:33,
      lips:[[183,176],[190,172.5],[198,170.6],[204,171],[208,172],[212,171],[218,170.6],[226,172.5],[233,176],[227,181],[218,185],[208,186.5],[197,185],[189,181]],
      lipRef:150,lipBlur:1.4,
      lids:null,
      cheeks:[[163,161,23,16],[255,159,22,16]],cheekbones:[[165,152],[253,150]],
      gemAt:[257,152],crystals:[[256,137,2],[260.5,141,1.8],[263.5,146,1.6]],
      lobes:[[139,161],[272,158]]},
    nails:null}
};
/* Tints: hue shift (deg) or hueTo (absolute), sat multiplier, light offset; `range` limits the
   source hues affected (so prints, skin-coloured trims and metals stay put). */
const T=(id,name,swatch,o)=>({id,name,swatch,...o});
/* Hue-shift tint for the source hue range [a,b] (wrapping), moving its centre to hue `to`. */
const H=(id,name,swatch,range,to,o={})=>{const [a,b]=range,span=((b-a)%360+360)%360,mid=a+span/2;
  return {id,name,swatch,range,hue:to-mid,minSat:.12,feather:14,...o}};
const items=[
  /* ----- outfits: adult ----- */
  {id:'hibiscus-flares',category:'outfit',dolls:['adult'],art:art('outfits-adult','hibiscus-flares'),
    tints:[original,H('lilac','Lilac','#b98ae8',[295,15],272),H('sunset','Sunset','#ff8a5c',[295,15],12,{sat:1.05}),H('aqua','Aqua','#44c2d0',[295,15],188,{sat:.85})],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,198,22,95,198,305],[36,222,3,74,215,326],[60,252,10,78,209,322],[72,290.0,40,109.5,172,281.1],[84,307.5,65,129.0,152,268.0],[96,325.0,68,133.0,149,265.0],[108,340.7,67,132.0,150,267.0],[120,356.3,62,124.0,156,276.6],[132,372.0,58,115.0,160,285.7],[144,387.7,52,107.0,166,292.6],[156,403.3,47,101.0,171,298.6],[168,419.0,43,96.0,174,302.0],[180,434.7,40,92.0,177,306.0],[192,450.3,39,89.0,179,310.6],[204,466.0,38,88.0,179,310.0],[216,486.5,39,90.0,179,308.6],[228,507.0,41,93.0,177,305.6],[240,527.5,43,98.0,174,300.0],[252,548.0,45,103.0,172,295.0],[264,568.5,47,107.0,170,289.0],[276,589.0,49,112.0,168,285.0],[288,609.5,50,114.0,167,282.0],[300,630.0,49,114.0,168,282.0],[312,644.3,47,112.0,170,284.0],[324,658.5,45,108.0,173,289.4],[336,672.8,42,106.0,176,292.4],[348,687.1,38,104.0,179,292.0],[360,701.4,35,102.5,182,293.6],[372,715.6,33,100.3,185,297.9],[384,729.9,30,96.5,188,301.9],[396,744.2,27,92.0,191,305.2],[408,758.5,25,89.5,194,309.1],[420,772.7,22,85.5,196,311.8],[432,787.0,20,83.0,199,315.6],[444,801.3,18,79.8,201,317.8],[456,815.6,16,77.2,203,320.4],[468,829.8,14,74.6,205,322.9],[480,844.1,14,74.6,205,322.9]]}],
      skin:[{rect:[110,170,180,70]}]}}}},
  {id:'lilac-satin-bow-dress',category:'outfit',dolls:['adult'],art:art('outfits-adult','lilac-satin-bow-dress'),
    tints:[original,H('rose','Rose','#f48cc0',[245,315],330),H('mint','Mint','#8fdcb6',[245,315],150,{sat:.8}),H('sky','Sky','#8cc4f2',[245,315],208,{sat:.9})],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,195,70,92,275,308],[60,240,41,72,301,326],[108,300.0,58,62.2,282,331.0],[122,316.3,118,131.0,227,267.2],[136,331.8,121,133.0,224,266.3],[150,345.0,123,130.0,254,315.8],[164,358.2,123,123.0,258,333.8],[178,371.7,114,115.0,258,324.8],[192,385.2,102,108.0,254,305.6],[206,398.8,93,103.0,257,302.3],[220,412.4,84,93.4,267,313.0],[234,425.9,76,83.8,274,321.4],[248,439.5,68,74.2,282,331.0],[262,453.1,61,65.8,289,339.4],[276,466.6,54,57.4,296,347.8],[290,480.2,47,49.0,302,355.0],[304,493.7,41,41.8,308,362.2],[318,507.3,34,32.9,314,368.9],[332,520.9,29,26.9,320,376.1],[346,534.4,23,19.7,325,382.1],[360,548.0,18,14.2,331,389.8],[374,561.5,13,7.7,335,394.1],[388,575.1,8,1.7,339,398.9],[402,588.7,4,-3.1,344,404.9],[416,602.2,13,7.7,330,388.1],[430,615.8,44,44.9,297,348.5],[444,629.3,87,96.5,257,300.5]]}],
      skin:[{rect:[110,170,180,80]}]}}}},
  {id:'denim-jacket-skirt',category:'outfit',dolls:['adult'],art:art('outfits-adult','denim-jacket-skirt'),
    tints:[original,H('lilac','Lilac denim','#a993d8',[185,250],268)],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,150,134,160,209,240],[48,188,75,96,270,304],[156,318.0,99,104.1,244,292.6],[170,332.5,101,106.7,242,290.0],[184,347.0,101,107.2,242,290.5],[198,361.5,100,106.4,243,292.3],[212,376.0,116,112.0,230,289.1],[226,384.0,111,109.0,234,291.5],[240,392.0,105,105.0,241,295.8],[254,404.1,101,101.0,246,301.1],[268,416.3,95,97.0,253,306.3],[282,428.4,89,90.6,259,311.6],[296,440.5,83,82.8,265,319.4],[310,452.7,76,74.2,272,329.0],[324,464.8,71,67.7,278,336.8],[338,479.5,70,66.4,275,332.9],[352,496.0,59,51.6,290,351.9],[366,512.5,54,45.1,295,358.4],[380,529.1,49,39.1,300,365.4],[394,545.6,43,30.8,306,372.7],[408,562.2,46,34.7,298,362.3],[422,578.7,79,77.6,271,327.2],[436,595.3,128,141.3,215,254.4]],
        parts:[limb([[0,36],[104,30],[110,90],[114,130],[106,165],[66,312],[0,330]],[78,50],[33,300],[94,196],[28,470],1.4,{under:true,cut:[[0,36],[82,36],[90,90],[98,130],[96,165],[62,312],[0,330]]}),
               limb([[345,36],[241,30],[235,90],[231,130],[239,165],[279,312],[345,330]],[267,50],[312,300],[306,196],[372,470],1.4,{under:true,cut:[[345,36],[263,36],[255,90],[247,130],[249,165],[283,312],[345,330]]})],
        cut:[[[141,31],[199,31],[198,60],[201,95],[186,99],[171,105],[156,99],[140,95],[142,60]]]}],
      /* the open collar shows her neck and chest down to the camisole: the jacket's inner back is cut
         away (piece cut), only the collar stand stays, behind the neck */
      skin:[{rect:[100,160,200,95],dir:'v'}],behind:[{poly:[[168,128],[232,128],[232,168],[220,182],[180,182],[168,168]]}]}}}},
  {id:'green-hibiscus-sundress',category:'outfit',dolls:['adult'],art:art('outfits-adult','green-hibiscus-sundress'),
    tints:[original,H('sky','Sky','#9cc9ee',[70,175],205),H('lavender','Lavender','#c3aee8',[70,175],268)],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,182,99,134,231,265],[60,242,101,124,230,276],[84,262.0,90,106.2,240,293.8],[98,275.2,92,108.8,237,290.0],[112,288.4,98,116.2,232,283.8],[126,301.7,103,121.5,227,276.5],[140,314.9,107,126.5,223,271.5],[154,328.1,110,130.2,220,267.8],[168,345.6,109,130.0,221,270.0],[182,359.9,103,119.6,227,279.5],[196,374.2,95,109.9,234,287.8],[210,388.6,87,102.7,242,294.0],[224,402.8,80,95.7,248,300.0],[238,417.1,73,87.5,255,307.2],[252,431.4,66,79.9,261,313.7],[266,445.7,60,74.1,266,319.2],[280,460.0,55,69.1,271,324.3],[294,474.3,50,64.1,277,330.5],[308,488.6,44,58.2,281,334.2],[322,502.9,39,52.9,286,338.6],[336,517.2,34,48.3,290,342.1],[350,531.5,29,43.7,295,346.7],[364,545.8,24,39.2,299,350.2],[378,560.1,20,35.9,303,353.5],[392,574.4,16,32.7,308,357.9],[406,588.7,11,28.0,311,359.6],[420,603.0,7,25.0,315,362.7],[434,617.3,3,22.0,320,367.0],[448,629.3,30,53.0,308,353.0],[462,639.6,47,71.9,277,318.2],[476,649.9,120,150.5,197,232.3]]}],
      skin:[{rect:[110,165,180,95]}]}}}},
  {id:'black-flares-set',category:'outfit',dolls:['adult'],art:art('outfits-adult','black-flares-set'),
    tints:[original],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[10,186,48,110,200,290],[84,280.0,77,120.3,169,276.0],[96,299.0,79,127.0,168,271.0],[108,318.0,82,132.0,165,266.0],[120,334.4,81,133.0,167,267.6],[132,350.9,77,128.0,171,273.5],[144,367.3,73,118.0,175,283.6],[156,383.8,70,109.0,179,293.4],[168,400.2,65,102.0,184,299.3],[180,416.7,61,97.0,187,302.6],[192,433.1,59,92.0,190,309.3],[204,449.6,57,89.0,192,312.3],[216,466.0,56,88.0,193,313.3],[228,489.4,57,90.0,192,310.3],[240,512.9,58,94.0,190,304.6],[252,536.3,60,100.0,188,299.6],[264,559.7,62,106.0,186,293.5],[276,583.1,64,111.0,184,287.5],[288,606.6,66,114.0,183,284.9],[300,630.0,67,114.0,182,285.0],[312,644.0,66,112.0,183,287.0],[324,658.0,64,108.0,185,291.0],[336,672.1,61,106.0,187,292.5],[348,686.1,58,104.0,190,293.4],[360,700.1,56,104.0,193,294.8],[372,714.1,53,105.0,196,293.6],[384,728.1,50,102.5,199,296.1],[396,742.2,47,98.5,202,300.1],[408,756.2,45,96.0,204,302.6],[420,770.2,42,92.0,207,306.6],[432,784.2,40,89.5,209,309.1],[444,798.3,37,85.5,212,313.1],[456,812.3,35,83.0,214,315.6],[468,826.3,33,80.3,216,318.2],[480,840.3,31,77.2,217,319.1],[490,852.0,50,102.5,200,297.4]],
        parts:[limb([[0,4],[70,4],[82,40],[94,84],[84,112],[44,222],[0,230]],[50,26],[17,212],[94,200],[27,468],1.85,{under:true,cut:[[0,4],[56,4],[64,40],[76,84],[68,112],[36,222],[0,230]]}),
               limb([[246,4],[176,4],[164,40],[152,84],[162,112],[202,222],[246,230]],[196,26],[229,212],[306,200],[373,468],1.85,{under:true,cut:[[246,4],[190,4],[182,40],[170,84],[178,112],[210,222],[246,230]]})]}],
      skin:[{rect:[100,168,200,50]}]}}}},
  {id:'pink-velour-cargo',category:'outfit',dolls:['adult'],art:art('outfits-adult','pink-velour-cargo'),
    tints:[original,H('lilac','Lilac','#b9a0dc',[295,15],278,{sat:.7,light:.04}),H('baby-blue','Baby blue','#8fc3ef',[295,15],205,{sat:.85}),H('mint','Mint','#86d9b8',[295,15],155,{sat:.75})],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,166,72,150,186,250],[30,190,55,100,203,300],[96,282.0,80,122.0,178,275.0],[108,300.0,81,127.0,177,271.0],[120,318.0,82,132.0,176,266.0],[132,332.8,79,133.0,179,266.0],[144,347.6,73,127.2,185,272.8],[156,362.4,73,119.6,184,279.0],[168,377.2,70,112.0,188,287.0],[180,392.0,68,105.0,190,293.0],[192,407.8,64,100.0,194,298.0],[204,423.5,62,95.0,196,303.0],[216,439.2,59,89.4,198,307.0],[228,455.0,58,88.0,201,310.6],[240,484.2,54,90.0,205,309.5],[252,513.3,51,94.0,207,303.0],[264,542.5,52,98.4,206,298.6],[276,571.7,51,96.6,208,300.7],[288,600.8,49,94.5,209,302.5],[300,630.0,49,94.0,210,303.3],[312,643.4,51,97.1,207,299.9],[324,656.8,50,95.8,208,301.2],[336,670.2,49,94.0,209,302.0],[348,683.6,46,90.1,212,305.9],[360,697.1,43,86.2,215,309.8],[372,710.5,43,86.2,214,308.5],[384,723.9,42,85.4,216,311.6],[396,737.3,40,82.3,218,313.7],[408,750.7,38,79.7,219,315.0],[420,764.1,39,81.0,219,315.0],[432,777.5,38,79.7,219,315.0],[444,790.9,37,77.9,221,317.1],[456,804.4,35,75.3,222,318.4],[468,817.8,33,73.2,224,321.5],[480,831.2,32,71.9,225,322.8],[492,844.6,32,71.4,225,322.3]],
        parts:[limb([[0,16],[84,10],[92,60],[96,95],[78,140],[56,224],[0,228]],[55,30],[29,213],[92,196],[27,470],1.75,{under:true,cut:[[0,16],[62,12],[70,60],[79,95],[73,140],[56,224],[0,228]]}),
               limb([[258,16],[174,10],[166,60],[162,95],[180,140],[202,224],[258,228]],[203,30],[229,213],[312,196],[373,470],1.75,{under:true,cut:[[258,16],[196,12],[188,60],[179,95],[185,140],[202,224],[258,228]]})]}],
      skin:[{rect:[100,168,200,50]}],behind:[{poly:[[140,120],[260,120],[257,184],[246,195],[154,195],[143,184]]}]}}}},
  /* ----- outfits: little ----- */
  {id:'yellow-dot-dress',category:'outfit',dolls:['little'],art:art('outfits-little','yellow-dot-dress'),
    tints:[original,H('mint','Mint','#a7e3c0',[30,75],145,{sat:.8}),H('sky','Sky','#a9d2f2',[30,75],205,{sat:.85}),H('peach','Peach','#ffc4a0',[30,75],25)],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,226,118,124,319,278],[96,300,116,121,320,285],[176,380.0,121,120.0,315,283.0],[190,392.6,108,113.5,327,288.7],[204,405.2,98,106.0,338,298.0],[218,417.8,88,98.0,347,305.2],[232,430.4,80,91.1,356,311.9],[246,443.0,72,85.2,364,318.8],[260,455.6,64,78.3,371,323.9],[274,468.2,57,72.7,379,330.3],[288,480.8,51,68.4,386,336.4],[302,493.4,45,63.1,392,340.7],[316,506.0,39,58.8,398,346.0],[330,518.5,33,54.0,404,350.8],[344,531.1,28,50.0,410,355.6],[358,543.7,23,45.5,415,359.1],[372,556.3,17,40.7,421,363.9],[386,568.9,13,37.5,426,367.9],[400,581.5,7,32.7,432,372.7],[414,594.1,4,29.8,423,365.0],[428,606.7,26,47.4,411,355.4],[442,619.3,52,68.7,367,320.7],[456,631.9,100,107.1,342,300.7],[465,640.0,180,171.1,255,231.1]]}],skin:[{rect:[105,205,190,70]}]}}}},
  {id:'lilac-cord-pinafore',category:'outfit',dolls:['little'],art:art('outfits-little','lilac-cord-pinafore'),
    tints:[original,H('pink','Pink','#f29ac4',[245,305],332),H('denim','Denim blue','#7fa3d6',[245,305],214),H('mint','Mint','#8fd6b2',[245,305],152,{sat:.8})],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,212,133,140,293,262],[96,268,32,62,392,342],[160,332,72,84,348,320],[176,345.0,104,116.5,321,285.7],[190,359.0,102,114.9,324,288.1],[204,373.1,101,113.6,324,287.6],[218,387.1,98,111.3,328,290.7],[232,401.2,86,102.4,340,300.6],[246,415.2,77,95.9,349,308.1],[260,429.3,69,89.2,357,313.8],[274,443.3,62,84.2,364,319.8],[288,457.4,55,78.3,371,324.7],[302,471.4,49,73.6,377,329.4],[316,485.5,43,68.9,383,334.1],[330,499.5,37,64.7,388,338.5],[344,513.6,32,60.3,394,342.7],[358,527.6,26,56.1,399,347.1],[372,541.7,21,52.2,404,351.0],[386,555.7,16,47.8,409,354.4],[400,569.8,11,43.9,414,358.3],[414,583.8,5,39.8,419,362.7],[428,597.9,4,38.5,420,363.0],[442,611.9,26,55.1,401,347.6],[456,626.0,69,89.2,352,309.9],[470,640.0,144,147.7,250,230.4]]}],skin:[{rect:[105,205,190,60]}]}}}},
  {id:'pink-gingham-bow-dress',category:'outfit',dolls:['little'],art:art('outfits-little','pink-gingham-bow-dress'),
    tints:[original,H('teal','Teal','#5fc7bd',[295,15],176,{sat:.85}),H('lemon','Lemon','#f2d860',[295,15],50),H('lilac','Lilac','#b897e6',[295,15],270)],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,222,131,127,316,278],[64,262,138,132,309,270],[112,300,112,118,334,290],[128,315.0,115,112.8,330,284.8],[142,330.3,118,115.2,327,282.4],[156,345.6,121,116.5,324,284.0],[170,360.9,123,117.5,322,283.0],[184,376.2,123,117.5,322,282.0],[198,390.6,117,115.4,328,284.2],[212,403.7,104,105.5,342,295.9],[226,416.8,93,96.7,353,304.7],[240,429.8,83,88.7,363,312.7],[254,442.9,74,82.0,372,320.4],[268,456.0,66,75.1,380,326.3],[282,469.1,59,70.0,387,332.4],[296,482.1,52,64.4,395,338.8],[310,495.2,45,58.3,401,343.1],[324,508.3,39,54.0,408,349.2],[338,521.4,32,48.4,414,354.0],[352,534.5,27,43.9,420,358.3],[366,547.5,21,39.1,426,363.1],[380,560.6,15,34.3,431,367.1],[394,573.7,10,30.3,437,371.9],[408,586.8,4,25.5,442,375.9],[422,599.8,10,30.3,438,372.7],[436,612.9,46,58.6,404,345.0],[450,626.0,75,82.3,370,318.3],[464,639.1,161,151.1,287,251.9],[465,640.0,179,165.5,254,225.5]]}],skin:[{rect:[105,205,190,75]}]}}}},
  {id:'denim-overalls',category:'outfit',dolls:['little'],art:art('outfits-little','denim-overalls'),
    tints:[original,H('lilac','Lilac denim','#a28bd6',[190,250],268)],
    fit:{little:{front:{pieces:[{part:'main',warp:[[16,214,85,128,281,276],[96,275,5,58,360,342],[128,318,30,80,333,322],[144,330.0,47,96.6,314,299.6],[158,342.0,75,118.0,291,284.0],[172,354.0,74,118.2,293,284.6],[186,366.1,72,117.1,295,286.6],[200,378.1,70,115.6,296,287.4],[214,390.1,67,112.8,301,290.7],[228,402.1,62,110.0,306,295.5],[242,414.2,57,105.7,310,298.0],[256,426.2,53,102.7,314,301.1],[270,438.2,48,98.9,320,305.6],[284,450.2,43,95.1,324,308.7],[298,462.3,39,92.1,328,311.7],[312,474.3,36,89.8,331,314.0],[326,486.3,34,88.3,333,315.5],[340,498.3,31,86.0,335,317.0],[354,510.4,29,84.5,337,318.5],[368,522.4,27,83.4,339,320.6],[382,534.4,25,81.4,341,321.6],[396,546.4,23,79.9,343,323.1],[410,558.5,20,78.1,348,327.4],[424,570.5,13,72.3,354,331.5],[438,582.5,11,71.3,355,332.7],[452,594.5,21,77.9,345,324.1],[466,606.6,52,101.4,314,300.6],[470,610.0,65,105.0,301,297.0]]}],skin:[{rect:[105,205,190,60]}]}}}},
  {id:'mint-cardigan-dress',category:'outfit',dolls:['little'],art:art('outfits-little','mint-cardigan-dress'),
    tints:[original,H('lilac','Lilac','#bba0e6',[120,180],268),H('sky','Sky','#9cc8ee',[120,180],205)],
    fit:{little:{front:{pieces:[{part:'main',warp:[[12,205,170,165,300,240],[48,238,99,110,374,292],[100,300.0,111,100.9,366,299.8],[114,312.6,110,100.2,367,300.6],[128,325.1,110,100.2,367,300.6],[142,337.7,109,99.4,368,301.4],[156,350.3,109,100.4,368,302.4],[170,362.8,108,99.6,369,303.2],[184,375.4,108,99.6,369,303.2],[198,387.9,107,98.8,370,304.0],[212,400.5,109,100.9,363,299.0],[226,413.1,105,98.3,372,306.5],[240,425.6,103,96.2,374,307.6],[254,438.2,102,95.4,375,308.4],[268,451.2,77,75.9,397,325.5],[282,464.3,70,70.5,404,331.0],[296,477.4,64,66.3,411,336.9],[310,490.5,58,61.6,417,341.6],[324,503.6,52,56.9,423,346.3],[338,516.6,47,52.5,428,349.7],[352,529.7,41,48.3,433,354.1],[366,542.8,36,44.4,438,358.0],[380,555.9,31,40.0,443,361.4],[394,569.0,26,36.1,448,365.3],[408,582.1,21,32.2,453,369.2],[422,595.1,17,28.6,452,367.9],[436,608.2,33,41.1,424,346.1],[450,621.3,93,88.4,391,320.8],[464,634.4,114,104.8,350,288.9],[470,640.0,175,152.4,238,201.5]],
        parts:[limb([[0,30],[130,26],[124,100],[118,200],[106,265],[0,270]],[110,50],[45,240],[110,234],[31,470],.97,{under:true,cut:[[0,30],[118,30],[110,100],[106,200],[100,265],[0,270]]}),limb([[477,30],[347,26],[353,100],[359,200],[371,265],[477,270]],[367,50],[432,240],[292,234],[371,470],.97,{under:true,cut:[[477,30],[359,30],[367,100],[371,200],[377,265],[477,270]]})]}],skin:[{rect:[110,205,180,60]}]}}}},
  {id:'star-pajamas',category:'outfit',dolls:['little'],art:art('outfits-little','star-pajamas',['top','trousers']),
    tints:[original,H('lilac','Lilac','#b48ee6',[295,15],272),H('sky','Sky','#8cc4f0',[295,15],206,{sat:.85}),H('mint','Mint','#88d8b4',[295,15],152,{sat:.75})],
    fit:{little:{front:{pieces:[{part:'trousers',warp:[[12,409.5,33,112.0,191,296.7],[24,424.0,30,107.0,195,302.9],[36,438.5,24,102.0,200,305.6],[48,453.0,20,97.0,204,310.6],[60,467.5,18,93.0,206,314.7],[72,482.0,15,90.0,208,317.5],[84,496.5,14,88.0,210,319.7],[96,511.0,13,88.0,211,319.7],[108,525.5,11,89.0,212,317.4],[120,540.0,10,91.0,213,315.3],[132,557.2,9,95.0,213,310.1],[144,574.5,9,99.0,214,307.0],[156,591.7,8,103.0,214,301.9],[168,609.0,7,104.0,215,299.9],[180,626.2,6,106.0,215,297.9],[192,643.5,5,105.0,216,298.9],[204,660.7,4,99.0,216,303.0],[216,678.0,4,94.0,216,307.0],[228,695.2,4,93.0,216,309.0],[240,712.5,5,93.0,215,308.0],[252,729.7,11,96.0,209,305.0],[264,746.9,16,98.9,203,301.0],[276,764.2,17,104.0,202,296.0]]},{part:'top',warp:[[10,210,95,146,240,256],[40,232,86,106,246,296],[128,338,88,116,244,288],[140,351.7,85,115.9,247,284.0],[152,365.3,83,119.0,251,284.0],[164,379.0,80,119.0,254,284.0],[176,392.7,76,116.1,257,286.0],[188,406.3,75,128.4,258,274.8],[200,420.0,173,206.3,176,208.7]],
        parts:[limb([[0,20],[66,20],[98,50],[102,80],[88,128],[60,195],[0,200]],[75,40],[35,180],[104,230],[31,470],1.28,{under:true,cut:[[0,20],[86,20],[90,80],[88,128],[66,195],[0,200]]}),limb([[332,20],[266,20],[234,50],[230,80],[244,128],[272,195],[332,200]],[257,40],[297,180],[298,230],[371,470],1.28,{under:true,cut:[[332,20],[246,20],[242,80],[244,128],[266,195],[332,200]]})]}],skin:[{rect:[110,205,180,60]}]}}}},
  /* ----- shoes ----- */
  {id:'black-platform-sandals',category:'shoes',dolls:['adult'],openToe:true,art:art('shoes-adult','black-platform-sandals',['left','right']),
    tints:[original],
    fit:{adult:{front:{left:{x:105,y:751,w:63},right:{x:228,y:751,w:63},collar:.3}}}},
  {id:'lilac-mary-jane-heels',category:'shoes',dolls:['adult'],art:art('shoes-adult','lilac-mary-jane-heels',['left','right']),
    tints:[original,H('pink','Pink','#f29cc8',[250,315],332),H('mint','Mint','#9ce0c0',[250,315],155,{sat:.8}),H('sky','Sky','#9ac8f0',[250,315],206)],
    fit:{adult:{front:{left:{x:106,y:757,w:61},right:{x:229,y:757,w:61},collar:.3}}}},
  {id:'pink-chunky-sneakers',category:'shoes',dolls:['adult'],art:art('shoes-adult','pink-chunky-sneakers',['left','right']),
    tints:[original,H('lilac','Lilac','#b897e6',[295,15],272),H('aqua','Aqua','#5fcfd6',[295,15],185,{sat:.85})],
    fit:{adult:{front:{left:{x:102,y:760,w:69},right:{x:225,y:760,w:69},collar:.3}}}},
  {id:'red-mary-janes',category:'shoes',dolls:['little'],art:art('shoes-little','red-mary-janes',['left','right']),
    tints:[original,H('teal','Teal','#3fb8b0',[335,25],176,{sat:.85,light:.03}),H('pink','Pink','#f07aae',[335,25],330,{light:.08}),H('navy','Navy','#3c5aa8',[335,25],225,{sat:.8})],
    fit:{little:{front:{left:{x:101,y:755,w:71},right:{x:230,y:755,w:71},collar:.32}}}},
  {id:'white-velcro-sneakers',category:'shoes',dolls:['little'],art:art('shoes-little','white-velcro-sneakers',['left','right']),
    tints:[original,H('lilac','Lilac','#b897e6',[295,15],272),H('aqua','Aqua','#5fcfd6',[295,15],185,{sat:.85})],
    fit:{little:{front:{left:{x:99,y:750,w:75},right:{x:228,y:750,w:75},collar:.3}}}},
  {id:'strawberry-rain-boots',category:'shoes',dolls:['little'],art:art('shoes-little','strawberry-rain-boots',['left','right']),
    tints:[original,H('sky','Sky','#9cd0f2',[35,75],205,{sat:.8}),H('mint','Mint','#9ce2c0',[35,75],150,{sat:.75}),H('lilac','Lilac','#c0a6ec',[35,75],270,{sat:.8,light:-.03})],
    fit:{little:{front:{left:{x:101,y:728,w:72},right:{x:229,y:728,w:72},collar:.12}}}},
  /* ----- hair ----- */
  {id:'long-waves',category:'hair',dolls:['adult','little'],art:art('hair','long-waves'),
    fit:{adult:{front:hf('long-waves',[150,250,43],1,{front:ARMS_CLEAR.adult,backFill:{sx:.62,dy:6},earsUnder:true,clip:{x:160,y:43,rot:-25}})},
         little:{front:hf('long-waves',[124,278,67],1,{front:ARMS_CLEAR.little,backFill:{sx:.62,dy:6},earsUnder:true,clip:{x:140,y:69,rot:-25}})}}},
  {id:'side-ponytail',category:'hair',dolls:['adult','little'],art:art('hair','side-ponytail'),
    fit:{adult:{front:hf('side-ponytail',[150,266,36],.9,{front:ARMS_CLEAR.adult,backFill:{sx:.7,dy:4},clip:{x:244,y:28,rot:20}})},
         little:{front:hf('side-ponytail',[124,292,58],.9,{front:ARMS_CLEAR.little,backFill:{sx:.7,dy:4},clip:{x:266,y:48,rot:20}})}}},
  {id:'half-up-curls',category:'hair',dolls:['adult','little'],art:art('hair','half-up-curls'),
    fit:{adult:{front:hf('half-up-curls',[150,250,43],1,{front:ARMS_CLEAR.adult,backFill:{sx:.62,dy:6},earsUnder:true,clip:{x:166,y:35,rot:-20}})},
         little:{front:hf('half-up-curls',[124,278,67],1,{front:ARMS_CLEAR.little,backFill:{sx:.62,dy:6},earsUnder:true,clip:{x:146,y:55,rot:-20}})}}},
  {id:'ringlet-pigtails',category:'hair',dolls:['adult','little'],art:art('hair','ringlet-pigtails'),
    fit:{adult:{front:hf('ringlet-pigtails',[134,266,41],1.08,{clip:{x:142,y:17,rot:-20}})},
         little:{front:hf('ringlet-pigtails',[112,290,63],1,{clip:{x:132,y:33,rot:-20}})}}},
  {id:'curly-buns',category:'hair',dolls:['adult','little'],art:art('hair','curly-buns'),
    fit:{adult:{front:hf('curly-buns',[140,260,43],1.04,{clip:{x:146,y:21,rot:-20}})},
         little:{front:hf('curly-buns',[120,282,66],1,{clip:{x:130,y:42,rot:-20}})}}},
  {id:'curly-bob',category:'hair',dolls:['adult','little'],art:art('hair','curly-bob'),
    fit:{adult:{front:hf('curly-bob',[146,254,41],1,{backFill:{sx:.72,dy:4},clip:{x:176,y:31,rot:-15}})},
         little:{front:hf('curly-bob',[120,282,65],1,{backFill:{sx:.72,dy:4},clip:{x:154,y:57,rot:-15}})}}},
  /* ----- earrings ----- */
  {id:'gold-hoops',category:'earrings',dolls:['adult','little'],art:art('jewelry','gold-hoops',['left','right']),anchor:{left:[.5,.04],right:[.5,.04]},
    tints:[original,T('silver','Silver','#d8dde6',{range:[20,60],sat:.08,light:.12}),T('rose-gold','Rose gold','#e9a39a',{hue:-28,range:[20,60],sat:.8,light:.04})],
    fit:{adult:{front:{left:{x:150,y:104,w:22},right:{x:254,y:102,w:22}}},little:{front:{left:{x:139,y:158,w:24},right:{x:272,y:155,w:24}}}}},
  {id:'pearl-studs',category:'earrings',dolls:['adult','little'],stud:'pearl',art:{}},
  {id:'heart-studs',category:'earrings',dolls:['adult','little'],stud:'heart',art:{}},
  {id:'star-studs',category:'earrings',dolls:['adult','little'],stud:'star',art:{}},
  /* ----- necklaces ----- */
  {id:'pearl-starfish-necklace',category:'necklace',dolls:['adult','little'],art:art('jewelry','pearl-starfish-necklace'),
    keepLower:true,
    /* worn as a choker: only the front arc of the strand, on the neck above any neckline */
    fit:{adult:{front:{x:170,y:137,w:60,keep:[[[0,138],[443,138],[443,304],[0,304]]]}},little:{front:{x:168.5,y:181.5,w:66,keep:[[[0,138],[443,138],[443,304],[0,304]]]}}}},
  {id:'butterfly-necklace',category:'necklace',dolls:['adult','little'],art:art('jewelry','butterfly-necklace'),
    fit:{adult:{front:{x:154,y:176,w:92,h:76,keep:[[[0,8],[393,8],[393,377],[0,377]]]}},little:{front:{x:159,y:209,w:84,h:64,keep:[[[0,8],[393,8],[393,377],[0,377]]]}}}},
  /* ----- hair accessories ----- */
  {id:'hibiscus-clip',category:'clip',dolls:['adult','little'],art:art('jewelry','hibiscus-clip'),anchor:[.4,.5],size:{adult:46,little:50}},
  {id:'butterfly-clip',category:'clip',dolls:['adult','little'],art:art('jewelry','butterfly-clip'),anchor:[.45,.5],size:{adult:40,little:46}},
  {id:'red-bow',category:'clip',dolls:['adult','little'],art:art('jewelry','red-bow'),anchor:[.5,.5],size:{adult:44,little:52}},
  {id:'peach-blossom',category:'clip',dolls:['adult','little'],proc:1,art:{}},
  {id:'satin-bow',category:'clip',dolls:['adult','little'],proc:2,art:{}},
  {id:'gold-star',category:'clip',dolls:['adult','little'],proc:3,art:{}}
];
/* Display names: sprite items use the names in assets/items/manifest.json. */
const names={'hibiscus-flares':"Hibiscus Flares",'lilac-satin-bow-dress':"Lilac Satin Bow Dress",'denim-jacket-skirt':"Double Denim Darling",'green-hibiscus-sundress':"Hibiscus Sundae Sundress",'black-flares-set':"Midnight Mall Flares",'pink-velour-cargo':"Pink Velour Weekend",'long-waves':"Beach Babe Waves",'side-ponytail':"Sassy Side Pony",'half-up-curls':"Half-Up Curl Cascade",'ringlet-pigtails':"Ringlet Pigtails",'curly-buns':"Cutie Curl Buns",'curly-bob':"Bouncy Curly Bob",'yellow-dot-dress':"Lemon Drop Dot Dress",'lilac-cord-pinafore':"Lilac Daisy Pinafore",'pink-gingham-bow-dress':"Pink Picnic Gingham Dress",'denim-overalls':"Peachy Heart Overalls",'mint-cardigan-dress':"Mint Blossom Cardi Dress",'star-pajamas':"Starry Sleepover PJs",'gold-hoops':"Golden Glam Hoops",'pearl-starfish-necklace':"Pearl & Starfish Necklace",'butterfly-necklace':"Butterfly Kisses Necklace",'hibiscus-clip':"Hibiscus Hair Clip",'butterfly-clip':"Flutter Butterfly Clip",'red-bow':"Cherry Red Bow",'black-platform-sandals':"Black Platform Sandals",'lilac-mary-jane-heels':"Lilac Mary Jane Heels",'pink-chunky-sneakers':"Pink Chunky Sneakers",'red-mary-janes':"Cherry Mary Janes",'white-velcro-sneakers':"Sweetheart Velcro Sneakers",'strawberry-rain-boots':"Strawberry Puddle Boots",'pearl-studs':'Pearl Studs','heart-studs':'Sweetheart Studs','star-studs':'Twinkle Star Studs','peach-blossom':'Peach Blossom Clip','satin-bow':'Satin Bow','gold-star':'Golden Star Clip'};
/* ===== side and back views =====
   Base pictures assets/dolls/<doll>-<view>.webp are cropped from the turnarounds on the front's rows
   (art/crop_dolls.py), so doll-local y is shared by all views; each view has its own origin so the
   figure's centroid lands on the front's. The right figure and the right item sprites are near-exact
   mirrors of the left ones, so right fits are generated from left fits (mirrorFit) unless an entry
   gives its own. Side/back item art lives in assets/items/views/ (see its manifest.json). */
const VIEW_DIR={outfit:d=>'outfits-'+d,shoes:d=>'shoes-'+d,hair:()=>'hair',earrings:()=>'jewelry',necklace:()=>'jewelry',clip:()=>'jewelry'};
const VS={'hibiscus-flares':{left:[101,355],right:[102,355],back:[177,355]},
  'lilac-satin-bow-dress':{left:[238,347],right:[240,347],back:[279,346]},
  'denim-jacket-skirt':{left:[194,355],right:[194,356],back:[317,352]},
  'green-hibiscus-sundress':{left:[184,296],right:[184,295],back:[222,296]},
  'black-flares-set':{left:[106,347],right:[105,346],back:[189,344]},
  'pink-velour-cargo':{left:[102,396],right:[100,396],back:[220,395]},
  'yellow-dot-dress':{left:[242,320],right:[243,320],back:[306,322]},
  'lilac-cord-pinafore':{left:[259,338],right:[258,338],back:[314,340]},
  'pink-gingham-bow-dress':{left:[277,353],right:[278,350],back:[348,355]},
  'denim-overalls':{left:[140,305],right:[142,304],back:[233,305]},
  'mint-cardigan-dress':{left:[224,300],right:[227,300],back:[306,302]},
  'star-pajamas':{left:[113,418],right:[116,418],back:[263,417]},
  'long-waves':{left:[190,348],right:[190,349],back:[235,354]},
  'side-ponytail':{left:[221,364],right:[220,364],back:[167,362]},
  'half-up-curls':{left:[229,361],right:[226,360],back:[245,358]},
  'ringlet-pigtails':{left:[231,341],right:[230,341],back:[325,333]},
  'curly-buns':{left:[243,314],right:[244,313],back:[363,302]},
  'curly-bob':{left:[279,311],right:[280,310],back:[352,311]},
  'black-platform-sandals':{left:[312,304],right:[311,304],back:[322,312]},
  'lilac-mary-jane-heels':{left:[321,294],right:[321,294],back:[330,310]},
  'pink-chunky-sneakers':{left:[335,258],right:[333,258],back:[361,282]},
  'red-mary-janes':{left:[325,184],right:[325,184],back:[326,210]},
  'white-velcro-sneakers':{left:[335,219],right:[336,218],back:[347,253]},
  'strawberry-rain-boots':{left:[278,313],right:[277,312],back:[344,315]},
  'gold-hoops':{left:[114,185],right:[113,185],back:[326,182]},
  'pearl-starfish-necklace':{left:[99,280],right:[99,280],back:[377,280]},
  'butterfly-necklace':{left:[40,330],right:[38,330],back:[309,327]},
  'hibiscus-clip':{left:[238,309],right:[234,309],back:[363,315]},
  'butterfly-clip':{left:[213,296],right:[208,296],back:[352,290]},
  'red-bow':{left:[215,325],right:[214,325],back:[422,310]}};
/* part sprites of the side/back art: pairs are -l / -r, the pyjamas are -top / -trousers */
const VPARTS={'star-pajamas':{left:['top','trousers'],right:['top','trousers'],back:['top','trousers']},
  'gold-hoops':{left:['left','right'],right:['left','right'],back:['left','right']}};
for(const id of ['black-platform-sandals','lilac-mary-jane-heels','pink-chunky-sneakers','red-mary-janes','white-velcro-sneakers','strawberry-rain-boots'])VPARTS[id]={back:['left','right']};
const VPSIZE={'star-pajamas':{left:{top:[112,176],trousers:[108,263]},right:{top:[114,176],trousers:[110,263]}}};
const viewArt=(it,view)=>{
  const dir=A+'views/'+VIEW_DIR[it.category](it.dolls[0])+'/'+it.id+'-'+view;
  const parts=VPARTS[it.id]?.[view];
  return {main:dir+'.webp',parts:parts?Object.fromEntries(parts.map(p=>[p,dir+'-'+(p==='left'?'l':p==='right'?'r':p)+'.webp'])):undefined};
};
/* Mirror a left-view fit into the right view. M = doll-local mirror constant (x_right = M - x_left),
   size(part) = [left width, right width] of the sprite (part) the coordinates refer to. */
function mirrorFit(fit,M,size){
  const mx=x=>M-x,sp=(pts,W)=>pts.map(([x,y])=>[W-x,y]);
  const shape=s=>s.poly?{...s,poly:s.poly.map(([x,y])=>[M-x,y])}:s.rect?{...s,rect:[M-s.rect[0]-s.rect[2],s.rect[1],s.rect[2],s.rect[3]]}:s.ellipse?{...s,ellipse:[M-s.ellipse[0],s.ellipse[1],s.ellipse[2],s.ellipse[3],-(s.ellipse[4]||0)]}:s;
  const rect=(f,part)=>{const [wl,wr]=size(part),w=wr*f.w/wl;return {...f,x:M-f.x-w,w,h:f.h===undefined?undefined:f.h*wr/wl,rot:f.rot?-f.rot:undefined}};
  const piece=p=>{const [,wr]=size(p.part);const q={...(p.warp?p:rect(p,p.part))};
    if(p.warp)q.warp=p.warp.map(([sy,dy,a,da,b,db])=>[sy,dy,wr-b,M-db,wr-a,M-da]);
    if(p.parts)q.parts=p.parts.map(l=>{const w=l.srcW||wr;return {...l,poly:sp(l.poly,w),cut:l.cut&&sp(l.cut,w),pivot:[w-l.pivot[0],l.pivot[1]],to:[M-l.to[0],l.to[1]],rot:-(l.rot||0)}});
    if(p.cut)q.cut=p.cut.map(c=>sp(c,wr));if(p.keep)q.keep=p.keep.map(c=>sp(c,wr));return q};
  const out={...fit};
  for(const key of ['skin','behind','front','cutDoll','armClip','overRegion','erase'])if(fit[key])out[key]=fit[key].map(shape);
  if(fit.pieces)out.pieces=fit.pieces.map(piece);
  else if(fit.near){const fp=l=>l&&l.map(p=>p.map(([u,v])=>[1-u,v]));
    out.near={...fit.near,x:M-fit.near.x-fit.near.w,rot:fit.near.rot?-fit.near.rot:undefined,front:fp(fit.near.front&&[fit.near.front])?.[0],over:fp(fit.near.over),open:fp(fit.near.open),keep:fp(fit.near.keep)};
    if(fit.far)out.far={...fit.far,dx:-(fit.far.dx||0)}}
  if(fit.foot)out.foot={...fit.foot,bed:fit.foot.bed.map(([x,y])=>[M-x,y]).reverse(),cx:fit.foot.cx===undefined?undefined:M-fit.foot.cx};
  else if(fit.left||fit.right){delete out.left;delete out.right;
    for(const s of ['left','right'])if(fit[s])out[s]={...fit[s],x:mx(fit[s].x),rot:fit[s].rot?-fit[s].rot:undefined}}
  else if(fit.x!==undefined){const r=rect(fit,'main');Object.assign(out,{x:r.x,w:r.w,h:r.h,rot:r.rot});if(fit.cut)out.cut=fit.cut.map(c=>sp(c,size('main')[1]));if(fit.keep)out.keep=fit.keep.map(c=>sp(c,size('main')[1]))}
  if(fit.clip)out.clip={...fit.clip,x:mx(fit.clip.x),rot:-(fit.clip.rot||0),behind:!fit.clip.behind};
  return out;
}
/* Uniformly scaled placement {x,y,w} of a view sprite: k = doll px per sprite px. */
const U=(id,view,x,y,k,extra={})=>({x,y,w:VS[id][view][0]*k,...extra});
/* Row warp from a uniform placement plus per-row adjustments [spriteY, dy, dx, sx]: the row is moved
   by (dx, dy) and scaled horizontally by sx about the sprite's centre line. Rows interpolate. */
const UW=(W,x,y,k,adj)=>({warp:adj.map(([sy,dy=0,dx=0,sx=1])=>{const c=x+dx+W*k/2,h=W*k*sx/2;return [sy,y+sy*k+dy,0,c-h,W,c+h]})});
const UWv=(id,view,x,y,k,adj,extra={})=>({...UW(VS[id][view][0],x,y,k,adj),...extra});

/* Base doll views. face: makeup landmarks visible from that side (lips, near cheek, near eyelid),
   lobes = visible earlobes; arm = near-arm polygon (side views) drawn over the outfit. */
const MIRROR={adult:181,little:207};
const sideDolls={
  adult:{rightOrigin:[211.3,145],left:{origin:[205.3,145],
    face:{unit:26,
      lips:[[33,114],[40,112],[48,113],[56,115],[57,119],[55,125],[48,129],[39,130],[33,127],[35,121]],
      mouth:[[37,118],[48,117],[56,118],[52,123],[43,124],[37,123]],lipRef:120,lipBlur:1,
      lids:[{gradient:[49,77,10,4.5,1]}],eyes:[[[40,82],[45,79],[52,78],[58,80],[57,85],[50,87],[43,86]]],
      cheeks:[[61,102,13,9]],cheekbones:[[61,96]],gemAt:[64,99],crystals:[[60,91,1.6],[63,94.5,1.4],[66,98,1.2]],
      lobes:[[104,108]]},
    nails:{ref:205,fingers:[[58.3,531.5,2.2,3.4,0],[65,533,2.3,3.5,0],[73,531.5,2.2,3.4,0]],toes:[[4,862,2.4,2,0],[11,863,2.2,1.8,0]]},footTop:834,
    arm:[[92,180],[110,175],[127,177],[141,188],[149,205],[150,222],[145,245],[138,275],[130,300],[124,330],[119,360],[115,390],[110,410],[104,430],[103,460],[103,495],[101,515],[93,527],[83,537],[70,542],[58,536],[52,516],[46,500],[51,480],[56,455],[60,430],[64,400],[70,370],[76,340],[79,310],[76,280],[73,255],[71,232],[75,212],[82,195]]},
    back:{origin:[100.7,145],face:{unit:26,lobes:[[153,103],[243,103]]},nails:null}},
  little:{rightOrigin:[198.5,155],left:{origin:[195.1,155],
    face:{unit:33,
      lips:[[10,159],[15,157],[20,161],[23,167],[25,174],[21,178],[14,177],[11,171],[12,165]],lipRef:150,lipBlur:1.4,
      lids:null,cheeks:[[46,155,20,14]],cheekbones:[[46,147]],gemAt:[48,150],crystals:[[36,135,2],[39.5,139,1.8],[42.5,144,1.6]],
      lobes:[[104,160]]},
    nails:null,footTop:822,
    arm:[[110,222],[130,219],[150,224],[165,238],[172,258],[168,285],[162,315],[155,345],[150,375],[148,405],[146,440],[145,470],[142,500],[135,525],[126,545],[112,553],[98,552],[86,545],[78,525],[73,505],[76,480],[88,455],[96,430],[98,400],[96,370],[92,340],[86,310],[82,285],[86,260],[96,235]]},
    back:{origin:[98.9,155],face:{unit:33,lobes:[[137,156],[266,156]]},nails:null}}
};
/* Fits per item: VF[id][doll][view]; 'right' defaults to mirrorFit(left). */
const VF={};
const vf=(id,doll,views)=>{(VF[id]??={})[doll]={...VF[id]?.[doll],...views}};

/* ----- outfits ----- */
/* @generated outfit view warps (art/fit_views.py) */
vf("hibiscus-flares","adult",{"left":{"pieces":[{"part":"main","warp":[[0,187.9,0,-44.6,101,186.4],[6,199.3,0,-47.2,101,187.9],[12,210.6,0,-36.6,101,179.4],[18,222.0,0,-38.7,101,176.3],[24,233.4,0,-27.0,101,165.7],[30,244.7,0,-19.6,101,159.3],[36,256.1,0,-15.5,101,158.2],[42,267.4,0,-11.0,101,158.3],[48,278.8,0,-9.7,101,162.8],[54,290.2,0,-9.7,101,168.9],[60,301.5,0,-10.8,101,176.7],[66,312.9,0,-14.0,101,186.1],[72,324.3,0,-18.5,101,197.3],[78,335.6,0,-19.9,101,203.4],[84,347.0,0,-19.2,101,209.0],[90,358.4,0,-18.9,101,214.6],[96,369.7,0,-17.9,101,218.8],[102,381.1,0,-15.9,101,219.4],[108,392.5,0,-12.8,101,217.4],[114,403.8,0,-11.4,101,214.8],[120,415.2,0,-11.1,101,211.3],[126,426.5,0,-12.0,101,208.0],[132,437.9,0,-12.0,101,204.1],[138,449.3,0,-12.0,101,200.4],[144,460.6,0,-12.8,101,198.5],[150,472.0,0,-11.7,101,197.8],[156,483.4,0,-10.8,101,199.7],[162,494.7,0,-11.1,101,202.6],[168,506.1,0,-11.6,101,207.5],[174,517.5,0,-11.5,101,210.3],[180,528.8,0,-11.3,101,211.9],[186,540.2,0,-10.7,101,211.9],[192,551.5,0,-10.2,101,212.0],[198,562.9,0,-9.3,101,210.4],[204,574.3,0,-7.6,101,206.4],[210,585.6,0,-5.8,101,202.4],[216,597.0,0,-4.5,101,200.3],[222,608.4,0,-3.3,101,198.5],[228,619.7,0,-2.0,101,196.0],[234,631.1,0,-0.9,101,192.5],[240,642.5,0,-1.1,101,193.4],[246,653.8,0,-1.1,101,193.6],[252,665.2,0,-0.6,101,191.8],[258,676.6,0,-0.4,101,190.9],[264,687.9,0,-0.4,101,190.9],[270,699.3,0,-0.4,101,190.9],[276,710.6,0,-0.4,101,190.9],[282,722.0,0,-0.4,101,190.9],[288,733.4,0,-0.4,101,190.9],[294,744.7,0,-0.4,101,190.9],[300,756.1,0,-0.4,101,190.9],[306,767.5,0,-0.4,101,190.9],[312,778.8,0,-0.4,101,190.9],[318,790.2,0,-0.4,101,190.9],[324,801.6,0,-0.4,101,190.9],[330,812.9,0,-0.4,101,190.9],[336,824.3,0,-0.4,101,190.9],[342,835.6,0,-0.4,101,190.9],[348,847.0,0,-0.4,101,190.9],[354,858.4,0,-0.4,101,190.9]]}]},"back":{"pieces":[{"part":"main","warp":[[0,187.9,0,34.7,177,370.0],[6,199.3,0,62.9,177,341.7],[12,210.6,0,65.7,177,338.7],[18,222.0,0,64.1,177,340.2],[24,233.4,0,66.8,177,338.6],[30,244.7,0,69.5,177,337.2],[36,256.1,0,76.8,177,333.1],[42,267.4,0,82.0,177,330.0],[48,278.8,0,76.8,177,336.6],[54,290.2,0,71.4,177,342.6],[60,301.5,0,65.5,177,348.2],[66,312.9,0,29.8,177,382.2],[72,324.3,0,17.6,177,392.7],[78,335.6,0,13.3,177,396.4],[84,347.0,0,9.3,177,399.5],[90,358.4,0,4.6,177,405.0],[96,369.7,0,2.0,177,408.7],[102,381.1,0,2.8,177,408.6],[108,392.5,0,3.7,177,408.1],[114,403.8,0,6.3,177,406.1],[120,415.2,0,8.9,177,403.9],[126,426.5,0,10.2,177,403.3],[132,437.9,0,11.4,177,402.1],[138,449.3,0,12.4,177,401.0],[144,460.6,0,13.2,177,400.4],[150,472.0,0,14.4,177,398.8],[156,483.4,0,16.2,177,396.5],[162,494.7,0,17.6,177,394.7],[168,506.1,0,18.9,177,393.5],[174,517.5,0,20.0,177,392.5],[180,528.8,0,21.5,177,391.4],[186,540.2,0,23.1,177,390.0],[192,551.5,0,24.9,177,387.9],[198,562.9,0,26.9,177,386.2],[204,574.3,0,29.4,177,383.8],[210,585.6,0,32.8,177,380.5],[216,597.0,0,36.9,177,376.5],[222,608.4,0,40.9,177,372.3],[228,619.7,0,45.2,177,367.5],[234,631.1,0,48.8,177,363.7],[240,642.5,0,51.4,177,360.6],[246,653.8,0,53.5,177,357.9],[252,665.2,0,55.9,177,356.1],[258,676.6,0,57.8,177,354.3],[264,687.9,0,59.5,177,352.1],[270,699.3,0,60.5,177,350.6],[276,710.6,0,61.2,177,349.5],[282,722.0,0,61.0,177,349.3],[288,733.4,0,60.5,177,350.0],[294,744.7,0,59.9,177,350.0],[300,756.1,0,59.5,177,350.7],[306,767.5,0,58.9,177,351.5],[312,778.8,0,58.3,177,352.2],[318,790.2,0,57.5,177,352.8],[324,801.6,0,57.0,177,353.4],[330,812.9,0,56.4,177,353.9],[336,824.3,0,54.0,177,356.8],[342,835.6,0,53.0,177,357.4],[348,847.0,0,52.1,177,358.4],[354,858.4,0,37.8,177,373.1]],"keep":[[[58.5,150],[88.5,150],[88.5,355],[58.5,355]]]},{"part":"main","warp":[[0,187.9,0,22.7,177,358.0],[6,199.3,0,50.9,177,329.7],[12,210.6,0,53.7,177,326.7],[18,222.0,0,52.1,177,328.2],[24,233.4,0,54.8,177,326.6],[30,244.7,0,57.5,177,325.2],[36,256.1,0,64.8,177,321.1],[42,267.4,0,70.0,177,318.0],[48,278.8,0,64.8,177,324.6],[54,290.2,0,59.4,177,330.6],[60,301.5,0,53.5,177,336.2],[66,312.9,0,17.8,177,370.2],[72,324.3,0,5.6,177,380.7],[78,335.6,0,1.3,177,384.4],[84,347.0,0,-2.7,177,387.5],[90,358.4,0,-7.4,177,393.0],[96,369.7,0,-10.0,177,396.7],[102,381.1,0,-9.2,177,396.6],[108,392.5,0,-8.3,177,396.1],[114,403.8,0,-5.7,177,394.1],[120,415.2,0,-3.1,177,391.9],[126,426.5,0,-1.8,177,391.3],[132,437.9,0,-0.6,177,390.1],[138,449.3,0,0.4,177,389.0],[144,460.6,0,1.2,177,388.4],[150,472.0,0,2.4,177,386.8],[156,483.4,0,4.2,177,384.5],[162,494.7,0,5.6,177,382.7],[168,506.1,0,6.9,177,381.5],[174,517.5,0,8.0,177,380.5],[180,528.8,0,9.5,177,379.4],[186,540.2,0,11.1,177,378.0],[192,551.5,0,12.9,177,375.9],[198,562.9,0,14.9,177,374.2],[204,574.3,0,17.4,177,371.8],[210,585.6,0,20.8,177,368.5],[216,597.0,0,24.9,177,364.5],[222,608.4,0,28.9,177,360.3],[228,619.7,0,33.2,177,355.5],[234,631.1,0,36.8,177,351.7],[240,642.5,0,39.4,177,348.6],[246,653.8,0,41.5,177,345.9],[252,665.2,0,43.9,177,344.1],[258,676.6,0,45.8,177,342.3],[264,687.9,0,47.5,177,340.1],[270,699.3,0,48.5,177,338.6],[276,710.6,0,49.2,177,337.5],[282,722.0,0,49.0,177,337.3],[288,733.4,0,48.5,177,338.0],[294,744.7,0,47.9,177,338.0],[300,756.1,0,47.5,177,338.7],[306,767.5,0,46.9,177,339.5],[312,778.8,0,46.3,177,340.2],[318,790.2,0,45.5,177,340.8],[324,801.6,0,45.0,177,341.4],[330,812.9,0,44.4,177,341.9],[336,824.3,0,42.0,177,344.8],[342,835.6,0,41.0,177,345.4],[348,847.0,0,40.1,177,346.4],[354,858.4,0,25.8,177,361.1]],"keep":[[[88.5,150],[118.5,150],[118.5,355],[88.5,355]]]},{"part":"main","warp":[[0,187.9,0,28.7,177,364.0],[6,199.3,0,56.9,177,335.7],[12,210.6,0,59.7,177,332.7],[18,222.0,0,58.1,177,334.2],[24,233.4,0,60.8,177,332.6],[30,244.7,0,63.5,177,331.2],[36,256.1,0,70.8,177,327.1],[42,267.4,0,76.0,177,324.0],[48,278.8,0,70.8,177,330.6],[54,290.2,0,65.4,177,336.6],[60,301.5,0,59.5,177,342.2],[66,312.9,0,23.8,177,376.2],[72,324.3,0,11.6,177,386.7],[78,335.6,0,7.3,177,390.4],[84,347.0,0,3.3,177,393.5],[90,358.4,0,-1.4,177,399.0],[96,369.7,0,-4.0,177,402.7],[102,381.1,0,-3.2,177,402.6],[108,392.5,0,-2.3,177,402.1],[114,403.8,0,0.3,177,400.1],[120,415.2,0,2.9,177,397.9],[126,426.5,0,4.2,177,397.3],[132,437.9,0,5.4,177,396.1],[138,449.3,0,6.4,177,395.0],[144,460.6,0,7.2,177,394.4],[150,472.0,0,8.4,177,392.8],[156,483.4,0,10.2,177,390.5],[162,494.7,0,11.6,177,388.7],[168,506.1,0,12.9,177,387.5],[174,517.5,0,14.0,177,386.5],[180,528.8,0,15.5,177,385.4],[186,540.2,0,17.1,177,384.0],[192,551.5,0,18.9,177,381.9],[198,562.9,0,20.9,177,380.2],[204,574.3,0,23.4,177,377.8],[210,585.6,0,26.8,177,374.5],[216,597.0,0,30.9,177,370.5],[222,608.4,0,34.9,177,366.3],[228,619.7,0,39.2,177,361.5],[234,631.1,0,42.8,177,357.7],[240,642.5,0,45.4,177,354.6],[246,653.8,0,47.5,177,351.9],[252,665.2,0,49.9,177,350.1],[258,676.6,0,51.8,177,348.3],[264,687.9,0,53.5,177,346.1],[270,699.3,0,54.5,177,344.6],[276,710.6,0,55.2,177,343.5],[282,722.0,0,55.0,177,343.3],[288,733.4,0,54.5,177,344.0],[294,744.7,0,53.9,177,344.0],[300,756.1,0,53.5,177,344.7],[306,767.5,0,52.9,177,345.5],[312,778.8,0,52.3,177,346.2],[318,790.2,0,51.5,177,346.8],[324,801.6,0,51.0,177,347.4],[330,812.9,0,50.4,177,347.9],[336,824.3,0,48.0,177,350.8],[342,835.6,0,47.0,177,351.4],[348,847.0,0,46.1,177,352.4],[354,858.4,0,31.8,177,367.1]]}]}});
vf("lilac-satin-bow-dress","adult",{"left":{"pieces":[{"part":"main","warp":[[0,181.1,0,-138.0,238,305.1],[6,189.0,0,-148.9,238,313.9],[12,196.9,0,-135.6,238,300.1],[18,204.8,0,-141.9,238,299.5],[24,212.7,0,-126.5,238,280.7],[30,220.5,0,-124.8,238,272.5],[36,228.4,0,-121.7,238,265.4],[42,236.3,0,-117.0,238,259.1],[48,244.2,0,-109.6,238,253.2],[54,252.1,0,-101.4,238,247.9],[60,260.0,0,-92.3,238,243.8],[66,267.9,0,-86.0,238,243.1],[72,275.8,0,-81.3,238,243.5],[78,283.7,0,-82.7,238,253.4],[84,291.6,0,-85.6,238,265.5],[90,299.4,0,-90.7,238,280.0],[96,307.3,0,-97.3,238,294.9],[102,315.2,0,-91.1,238,300.9],[108,323.1,0,-76.9,238,291.7],[114,331.0,0,-62.5,238,282.2],[120,338.9,0,-50.4,238,274.4],[126,346.8,0,-40.5,238,267.9],[132,354.7,0,-39.6,238,268.7],[138,362.6,0,-41.5,238,271.2],[144,370.5,0,-43.2,238,272.6],[150,378.4,0,-43.1,238,272.1],[156,386.2,0,-40.4,238,266.9],[162,394.1,0,-36.8,238,262.0],[168,402.0,0,-37.6,238,263.0],[174,409.9,0,-38.4,238,264.1],[180,417.8,0,-39.3,238,265.1],[186,425.7,0,-40.1,238,266.2],[192,433.6,0,-40.9,238,267.2],[198,441.5,0,-41.7,238,268.2],[204,449.4,0,-42.6,238,269.3],[210,457.2,0,-43.1,238,269.9],[216,465.1,0,-43.1,238,269.9],[222,473.0,0,-43.1,238,269.9],[228,480.9,0,-43.1,238,269.9],[234,488.8,0,-43.1,238,269.9],[240,496.7,0,-43.1,238,269.9],[246,504.6,0,-43.1,238,269.9],[252,512.5,0,-43.1,238,269.9],[258,520.4,0,-43.1,238,269.9],[264,528.3,0,-43.1,238,269.9],[270,536.1,0,-43.1,238,269.9],[276,544.0,0,-43.1,238,269.9],[282,551.9,0,-43.1,238,269.9],[288,559.8,0,-43.1,238,269.9],[294,567.7,0,-43.1,238,269.9],[300,575.6,0,-43.1,238,269.9],[306,583.5,0,-43.1,238,269.9],[312,591.4,0,-43.1,238,269.9],[318,599.3,0,-43.1,238,269.9],[324,607.2,0,-43.1,238,269.9],[330,615.0,0,-43.1,238,269.9],[336,622.9,0,-43.1,238,269.9],[342,630.8,0,-43.1,238,269.9],[346,636.1,0,-43.1,238,269.9]]}]},"back":{"pieces":[{"part":"main","warp":[[0,183.8,0,11.2,279,378.1],[6,191.7,0,1.8,279,387.3],[12,199.6,0,3.4,279,385.9],[18,207.5,0,5.5,279,384.1],[24,215.4,0,8.6,279,381.5],[30,223.2,0,12.5,279,378.6],[36,231.1,0,15.3,279,376.7],[42,239.0,0,16.2,279,376.9],[48,246.9,0,14.9,279,379.3],[54,254.8,0,11.0,279,384.1],[60,262.7,0,8.6,279,387.7],[66,270.6,0,3.1,279,393.6],[72,278.5,0,-6.3,279,403.5],[78,286.4,0,-33.2,279,430.3],[84,294.3,0,-50.3,279,446.0],[90,302.1,0,-69.1,279,462.6],[96,310.0,0,-88.0,279,480.2],[102,317.9,0,-99.9,279,489.8],[108,325.8,0,-81.1,279,460.9],[114,333.7,0,-89.4,279,458.9],[120,341.6,0,-110.7,279,468.1],[126,349.5,0,-120.7,279,466.8],[132,357.4,0,-124.0,279,462.5],[138,365.3,0,-101.6,279,445.3],[144,373.2,0,-74.0,279,426.7],[150,381.1,0,-47.1,279,410.7],[156,388.9,0,-27.6,279,401.4],[162,396.8,0,-15.0,279,395.4],[168,404.7,0,-8.6,279,392.6],[174,412.6,0,-7.7,279,392.1],[180,420.5,0,-7.9,279,392.8],[186,428.4,0,-8.9,279,394.1],[192,436.3,0,-9.1,279,394.5],[198,444.2,0,-9.7,279,395.3],[204,452.1,0,-10.3,279,396.2],[210,459.9,0,-11.2,279,396.7],[216,467.8,0,-11.5,279,397.3],[222,475.7,0,-12.1,279,398.1],[228,483.6,0,-12.1,279,398.4],[234,491.5,0,-11.9,279,398.9],[240,499.4,0,-11.9,279,399.5],[246,507.3,0,-11.8,279,400.1],[252,515.2,0,-11.6,279,400.5],[258,523.1,0,-11.6,279,400.9],[264,531.0,0,-11.5,279,400.8],[270,538.9,0,-11.5,279,401.1],[276,546.7,0,-11.2,279,401.0],[282,554.6,0,-10.8,279,401.1],[288,562.5,0,-10.4,279,401.2],[294,570.4,0,-11.6,279,402.6],[300,578.3,0,-13.3,279,404.8],[306,586.2,0,-15.2,279,408.2],[312,594.1,0,-15.9,279,411.4],[318,602.0,0,-16.4,279,416.8],[324,609.9,0,-17.7,279,419.4],[330,617.8,0,-19.6,279,433.4],[336,625.6,0,-20.2,279,438.0],[342,633.5,0,-25.9,279,448.5],[345,637.5,0,26.3,279,393.2]]}]}});
vf("denim-jacket-skirt","adult",{"left":{"pieces":[{"part":"main","warp":[[0,132.0,0,-28.2,194,221.8],[6,139.9,0,-26.9,194,220.7],[12,147.9,0,-25.5,194,219.6],[18,155.8,0,-24.1,194,218.5],[24,163.7,0,-22.8,194,217.4],[30,171.6,0,-21.4,194,216.4],[36,179.6,0,-10.8,194,209.4],[42,187.5,0,-5.0,194,204.7],[48,195.4,0,-9.2,194,206.1],[54,203.3,0,-16.1,194,208.8],[60,211.3,0,-23.6,194,212.0],[66,219.2,0,-31.0,194,215.0],[72,227.1,0,-37.0,194,217.6],[78,235.0,0,-41.5,194,219.7],[84,243.0,0,-44.1,194,220.2],[90,250.9,0,-45.5,194,219.9],[96,258.8,0,-44.6,194,218.6],[102,266.7,0,-41.5,194,216.1],[108,274.7,0,-37.2,194,212.8],[114,282.6,0,-32.9,194,209.7],[120,290.5,0,-28.7,194,206.7],[126,298.4,0,-24.7,194,203.4],[132,306.4,0,-21.7,194,200.4],[138,314.3,0,-19.3,194,197.9],[144,322.2,0,-17.5,194,198.6],[150,330.1,0,-20.2,194,204.1],[156,338.1,0,-25.6,194,213.7],[162,346.0,0,-33.5,194,227.3],[168,353.9,0,-42.9,194,242.7],[174,361.9,0,-51.1,194,255.0],[180,369.8,0,-52.0,194,260.8],[186,377.7,0,-50.2,194,262.8],[192,385.6,0,-46.1,194,261.4],[198,393.6,0,-41.2,194,259.1],[204,401.5,0,-35.6,194,255.0],[210,409.4,0,-30.2,194,248.3],[216,417.3,0,-24.2,194,241.8],[222,425.3,0,-23.6,194,241.1],[228,433.2,0,-23.0,194,240.4],[234,441.1,0,-22.4,194,239.7],[240,449.0,0,-21.8,194,239.1],[246,457.0,0,-21.2,194,238.4],[252,464.9,0,-20.6,194,237.7],[258,472.8,0,-19.9,194,237.1],[264,480.7,0,-19.6,194,236.7],[270,488.7,0,-19.6,194,236.7],[276,496.6,0,-19.6,194,236.7],[282,504.5,0,-19.6,194,236.7],[288,512.4,0,-19.6,194,236.7],[294,520.4,0,-19.6,194,236.7],[300,528.3,0,-19.6,194,236.7],[306,536.2,0,-19.6,194,236.7],[312,544.2,0,-19.6,194,236.7],[318,552.1,0,-19.6,194,236.7],[324,560.0,0,-19.6,194,236.7],[330,567.9,0,-19.6,194,236.7],[336,575.9,0,-19.6,194,236.7],[342,583.8,0,-19.6,194,236.7],[348,591.7,0,-19.6,194,236.7],[354,599.6,0,-19.6,194,236.7]]}]},"back":{"pieces":[{"part":"main","warp":[[0,136.0,0,-12.5,317,406.3],[6,143.9,0,-40.4,317,434.2],[12,151.9,0,-31.2,317,425.0],[18,159.8,0,-35.7,317,429.2],[24,167.7,0,-43.3,317,436.5],[30,175.6,0,-48.8,317,441.8],[36,183.6,0,-53.7,317,446.2],[42,191.5,0,-64.4,317,456.8],[48,199.4,0,-71.1,317,463.4],[54,207.3,0,-73.8,317,466.1],[60,215.3,0,-76.2,317,468.5],[66,223.2,0,-78.7,317,470.9],[72,231.1,0,-80.0,317,472.0],[78,239.0,0,-79.4,317,471.5],[84,247.0,0,-78.5,317,470.8],[90,254.9,0,-76.6,317,469.1],[96,262.8,0,-74.3,317,466.0],[102,270.7,0,-71.8,317,461.5],[108,278.7,0,-71.1,317,457.8],[114,286.6,0,-70.8,317,454.0],[120,294.5,0,-72.1,317,450.7],[126,302.4,0,-71.3,317,445.8],[132,310.4,0,-69.7,317,440.8],[138,318.3,0,-71.4,317,446.1],[144,326.2,0,-81.2,317,459.5],[150,334.1,0,-91.1,317,474.3],[156,342.1,0,-103.4,317,492.5],[162,350.0,0,-118.7,317,515.3],[168,357.9,0,-123.1,317,519.2],[174,365.9,0,-109.7,317,505.3],[180,373.8,0,-98.5,317,493.4],[186,381.7,0,-88.8,317,483.1],[192,389.6,0,-77.4,317,471.0],[198,397.6,0,-68.8,317,461.9],[204,405.5,0,-64.6,317,457.1],[210,413.4,0,-59.7,317,451.9],[216,421.3,0,-55.8,317,448.0],[222,429.3,0,-54.3,317,446.2],[228,437.2,0,-54.4,317,445.7],[234,445.1,0,-74.3,317,466.3],[240,453.0,0,-75.3,317,466.9],[246,461.0,0,-75.9,317,467.1],[252,468.9,0,-75.7,317,466.6],[258,476.8,0,-74.7,317,465.6],[264,484.7,0,-57.4,317,447.2],[270,492.7,0,-56.0,317,445.8],[276,500.6,0,-54.8,317,444.0],[282,508.5,0,-53.4,317,442.9],[288,516.4,0,-52.4,317,441.6],[294,524.4,0,-51.4,317,440.4],[300,532.3,0,-50.2,317,439.4],[306,540.2,0,-49.0,317,439.2],[312,548.2,0,-47.6,317,439.2],[318,556.1,0,-45.9,317,439.2],[324,564.0,0,-45.0,317,438.8],[330,571.9,0,-44.5,317,439.7],[336,579.9,0,-51.7,317,448.1],[342,587.8,0,-54.8,317,451.1],[348,595.7,0,-61.4,317,457.7],[351,599.7,0,-11.4,317,407.3]]}]}});
vf("green-hibiscus-sundress","adult",{"left":{"pieces":[{"part":"main","warp":[[0,168.9,0,-182.7,184,310.0],[6,180.1,0,-208.1,184,327.7],[12,191.2,0,-195.3,184,317.4],[18,202.4,0,-191.5,184,312.8],[24,213.6,0,-173.2,184,297.1],[30,224.7,0,-157.8,184,287.3],[36,235.9,0,-140.7,184,277.7],[42,247.1,0,-118.4,184,265.8],[48,258.2,0,-92.8,184,253.4],[54,269.4,0,-70.5,184,242.6],[60,280.6,0,-54.5,184,234.3],[66,291.7,0,-44.9,184,229.5],[72,302.9,0,-38.9,184,226.8],[78,314.1,0,-37.1,184,226.1],[84,325.2,0,-39.1,184,229.1],[90,336.4,0,-49.4,184,239.5],[96,347.6,0,-59.4,184,250.8],[102,358.1,0,-70.9,184,263.4],[108,367.2,0,-81.6,184,274.7],[114,376.4,0,-87.2,184,280.2],[120,385.6,0,-78.1,184,272.2],[126,394.8,0,-68.0,184,264.1],[132,404.0,0,-65.9,184,261.9],[138,413.2,0,-63.9,184,259.8],[144,422.3,0,-61.8,184,257.6],[150,431.5,0,-59.7,184,255.5],[156,440.7,0,-57.6,184,253.4],[162,449.9,0,-55.5,184,251.2],[168,459.1,0,-54.4,184,250.1],[174,468.3,0,-54.4,184,250.1],[180,477.4,0,-54.4,184,250.1],[186,486.6,0,-54.4,184,250.1],[192,495.8,0,-54.4,184,250.1],[198,505.0,0,-54.4,184,250.1],[204,514.2,0,-54.4,184,250.1],[210,523.4,0,-54.4,184,250.1],[216,532.6,0,-54.4,184,250.1],[222,541.7,0,-54.4,184,250.1],[228,550.9,0,-54.4,184,250.1],[234,560.1,0,-54.4,184,250.1],[240,569.3,0,-54.4,184,250.1],[246,578.5,0,-54.4,184,250.1],[252,587.7,0,-54.4,184,250.1],[258,596.8,0,-54.4,184,250.1],[264,606.0,0,-54.4,184,250.1],[270,615.2,0,-54.4,184,250.1],[276,624.4,0,-54.4,184,250.1],[282,633.6,0,-54.4,184,250.1],[288,642.8,0,-54.4,184,250.1],[294,651.9,0,-54.4,184,250.1],[295,653.5,0,-54.4,184,250.1]]}]},"back":{"pieces":[{"part":"main","warp":[[0,182.0,0,-22.5,222,409.8],[6,192.4,0,25.5,222,363.2],[12,202.8,0,24.0,222,364.8],[18,213.1,0,21.1,222,367.7],[24,223.5,0,13.9,222,374.7],[30,233.9,0,-1.3,222,389.2],[36,244.3,0,-13.4,222,400.5],[42,254.7,0,-23.5,222,410.0],[48,265.0,0,-30.1,222,416.4],[54,275.4,0,-31.1,222,417.4],[60,285.8,0,-25.2,222,412.1],[66,296.2,0,-22.2,222,410.2],[72,306.6,0,-21.1,222,409.5],[78,316.9,0,-23.2,222,411.5],[84,327.3,0,-27.9,222,416.1],[90,337.7,0,-34.2,222,422.2],[96,348.1,0,-41.3,222,428.7],[102,358.1,0,-45.4,222,433.2],[108,367.2,0,-46.7,222,435.1],[114,376.4,0,-44.0,222,433.2],[120,385.6,0,-38.4,222,429.1],[126,394.8,0,-32.1,222,423.8],[132,404.0,0,-26.0,222,418.4],[138,413.2,0,-21.0,222,414.6],[144,422.3,0,-16.8,222,411.7],[150,431.5,0,-13.1,222,408.9],[156,440.7,0,-10.0,222,406.4],[162,449.9,0,-7.5,222,404.5],[168,459.1,0,-5.1,222,402.4],[174,468.3,0,-3.2,222,400.4],[180,477.4,0,-1.0,222,398.4],[186,486.6,0,1.7,222,396.8],[192,495.8,0,4.1,222,395.0],[198,505.0,0,6.7,222,393.1],[204,514.2,0,9.3,222,391.3],[210,523.4,0,11.6,222,389.7],[216,532.6,0,13.6,222,388.1],[222,541.7,0,15.3,222,386.4],[228,550.9,0,17.2,222,384.7],[234,560.1,0,19.0,222,382.9],[240,569.3,0,20.8,222,381.2],[246,578.5,0,22.5,222,379.3],[252,587.7,0,24.3,222,378.4],[258,596.8,0,22.8,222,380.0],[264,606.0,0,15.0,222,387.9],[270,615.2,0,11.1,222,392.8],[276,624.4,0,-3.0,222,408.0],[282,633.6,0,19.3,222,379.3],[288,642.8,0,42.5,222,350.2],[294,651.9,0,-19.7,222,412.5],[295,653.5,0,-19.7,222,412.5]]}]}});
vf("black-flares-set","adult",{"left":{"pieces":[{"part":"main","warp":[[0,165.3,0,-43.1,106,231.9],[6,177.3,0,-46.9,106,235.0],[12,189.4,0,-37.1,106,228.6],[18,201.4,0,-29.5,106,224.6],[24,213.5,0,-21.4,106,218.3],[30,225.5,0,-18.8,106,217.4],[36,237.6,0,-18.4,106,217.7],[42,249.6,0,-21.4,106,220.6],[48,261.7,0,-24.8,106,224.5],[54,273.7,0,-27.2,106,228.0],[60,285.8,0,-28.2,106,230.3],[66,297.8,0,-27.3,106,231.4],[72,309.9,0,-23.5,106,229.3],[78,321.9,0,-21.1,106,226.0],[84,334.0,0,-19.4,106,222.9],[90,346.0,0,-17.9,106,219.6],[96,358.1,0,-17.5,106,217.7],[102,370.1,0,-17.3,106,215.9],[108,382.2,0,-16.9,106,215.0],[114,394.2,0,-16.3,106,215.1],[120,406.3,0,-15.6,106,215.8],[126,418.3,0,-14.7,106,216.1],[132,430.4,0,-14.7,106,216.9],[138,442.4,0,-14.5,106,217.1],[144,454.5,0,-14.4,106,216.2],[150,466.5,0,-15.2,106,215.6],[156,478.5,0,-16.8,106,217.8],[162,490.6,0,-18.1,106,219.0],[168,502.6,0,-19.8,106,220.4],[174,514.7,0,-21.7,106,223.7],[180,526.7,0,-22.4,106,226.6],[186,538.8,0,-21.8,106,227.5],[192,550.8,0,-21.0,106,227.6],[198,562.9,0,-17.9,106,223.0],[204,574.9,0,-11.5,106,213.8],[210,587.0,0,-9.0,106,208.6],[216,599.0,0,-7.9,106,207.3],[222,611.1,0,-6.8,106,206.1],[228,623.1,0,-6.8,106,206.1],[234,635.2,0,-6.8,106,206.1],[240,647.2,0,-6.8,106,206.1],[246,659.3,0,-6.8,106,206.1],[252,671.3,0,-6.8,106,206.1],[258,683.4,0,-6.8,106,206.1],[264,695.4,0,-6.8,106,206.1],[270,707.5,0,-6.8,106,206.1],[276,719.5,0,-6.8,106,206.1],[282,731.6,0,-6.8,106,206.1],[288,743.6,0,-6.8,106,206.1],[294,755.7,0,-6.8,106,206.1],[300,767.7,0,-6.8,106,206.1],[306,779.7,0,-6.8,106,206.1],[312,791.8,0,-6.8,106,206.1],[318,803.8,0,-6.8,106,206.1],[324,815.9,0,-6.8,106,206.1],[330,827.9,0,-6.8,106,206.1],[336,840.0,0,-6.8,106,206.1],[342,852.0,0,-26.1,106,209.6],[346,860.1,0,-6.8,106,206.1]]}]},"back":{"pieces":[{"part":"main","warp":[[0,171.3,0,13.5,189,393.0],[6,183.3,0,-17.1,189,423.3],[12,195.4,0,-21.0,189,427.2],[18,207.4,0,-23.4,189,429.6],[24,219.5,0,-28.1,189,434.3],[30,231.5,0,-32.7,189,439.0],[36,243.6,0,-37.8,189,444.3],[42,255.6,0,-43.9,189,449.9],[48,267.7,0,-53.2,189,458.0],[54,279.7,0,-62.2,189,466.3],[60,291.8,0,-70.4,189,473.5],[66,303.8,0,-76.5,189,478.6],[72,315.9,0,-77.8,189,478.7],[78,327.9,0,-75.2,189,475.6],[84,340.0,0,-73.0,189,472.2],[90,352.0,0,-72.3,189,469.8],[96,364.1,0,-69.9,189,466.6],[102,376.1,0,-65.6,189,462.3],[108,388.2,0,-59.7,189,456.7],[114,400.2,0,-53.7,189,450.5],[120,412.3,0,-46.3,189,443.8],[126,424.3,0,-41.0,189,438.8],[132,436.4,0,-38.3,189,436.4],[138,448.4,0,-37.3,189,435.2],[144,460.5,0,-37.3,189,435.8],[150,472.5,0,-36.9,189,436.4],[156,484.5,0,-37.5,189,436.9],[162,496.6,0,-37.7,189,436.8],[168,508.6,0,-37.9,189,436.9],[174,520.7,0,-36.6,189,435.6],[180,532.7,0,-35.5,189,433.9],[186,544.8,0,-32.7,189,431.2],[192,556.8,0,-28.4,189,427.5],[198,568.9,0,-22.3,189,422.0],[204,580.9,0,-15.3,189,415.2],[210,593.0,0,-7.8,189,407.7],[216,605.0,0,-0.2,189,400.7],[222,617.1,0,6.8,189,394.0],[228,629.1,0,12.0,189,389.6],[234,641.2,0,15.5,189,386.4],[240,653.2,0,19.0,189,383.4],[246,665.3,0,21.5,189,380.5],[252,677.3,0,24.1,189,378.0],[258,689.4,0,28.0,189,373.7],[264,701.4,0,31.8,189,369.8],[270,713.5,0,34.5,189,367.1],[276,725.5,0,37.1,189,365.0],[282,737.6,0,38.3,189,363.9],[288,749.6,0,38.6,189,363.6],[294,761.7,0,38.4,189,364.1],[300,773.7,0,38.2,189,364.2],[306,785.7,0,37.7,189,364.5],[312,797.8,0,37.8,189,364.1],[318,809.8,0,37.3,189,364.7],[324,821.9,0,32.3,189,369.3],[330,833.9,0,31.1,189,370.5],[336,846.0,0,28.8,189,372.5],[342,858.0,0,10.6,189,390.1],[343,860.0,0,10.6,189,390.1]],"keep":[[[64.5,150],[94.5,150],[94.5,344],[64.5,344]]]},{"part":"main","warp":[[0,171.3,0,1.5,189,381.0],[6,183.3,0,-29.1,189,411.3],[12,195.4,0,-33.0,189,415.2],[18,207.4,0,-35.4,189,417.6],[24,219.5,0,-40.1,189,422.3],[30,231.5,0,-44.7,189,427.0],[36,243.6,0,-49.8,189,432.3],[42,255.6,0,-55.9,189,437.9],[48,267.7,0,-65.2,189,446.0],[54,279.7,0,-74.2,189,454.3],[60,291.8,0,-82.4,189,461.5],[66,303.8,0,-88.5,189,466.6],[72,315.9,0,-89.8,189,466.7],[78,327.9,0,-87.2,189,463.6],[84,340.0,0,-85.0,189,460.2],[90,352.0,0,-84.3,189,457.8],[96,364.1,0,-81.9,189,454.6],[102,376.1,0,-77.6,189,450.3],[108,388.2,0,-71.7,189,444.7],[114,400.2,0,-65.7,189,438.5],[120,412.3,0,-58.3,189,431.8],[126,424.3,0,-53.0,189,426.8],[132,436.4,0,-50.3,189,424.4],[138,448.4,0,-49.3,189,423.2],[144,460.5,0,-49.3,189,423.8],[150,472.5,0,-48.9,189,424.4],[156,484.5,0,-49.5,189,424.9],[162,496.6,0,-49.7,189,424.8],[168,508.6,0,-49.9,189,424.9],[174,520.7,0,-48.6,189,423.6],[180,532.7,0,-47.5,189,421.9],[186,544.8,0,-44.7,189,419.2],[192,556.8,0,-40.4,189,415.5],[198,568.9,0,-34.3,189,410.0],[204,580.9,0,-27.3,189,403.2],[210,593.0,0,-19.8,189,395.7],[216,605.0,0,-12.2,189,388.7],[222,617.1,0,-5.2,189,382.0],[228,629.1,0,0.0,189,377.6],[234,641.2,0,3.5,189,374.4],[240,653.2,0,7.0,189,371.4],[246,665.3,0,9.5,189,368.5],[252,677.3,0,12.1,189,366.0],[258,689.4,0,16.0,189,361.7],[264,701.4,0,19.8,189,357.8],[270,713.5,0,22.5,189,355.1],[276,725.5,0,25.1,189,353.0],[282,737.6,0,26.3,189,351.9],[288,749.6,0,26.6,189,351.6],[294,761.7,0,26.4,189,352.1],[300,773.7,0,26.2,189,352.2],[306,785.7,0,25.7,189,352.5],[312,797.8,0,25.8,189,352.1],[318,809.8,0,25.3,189,352.7],[324,821.9,0,20.3,189,357.3],[330,833.9,0,19.1,189,358.5],[336,846.0,0,16.8,189,360.5],[342,858.0,0,-1.4,189,378.1],[343,860.0,0,-1.4,189,378.1]],"keep":[[[94.5,150],[124.5,150],[124.5,344],[94.5,344]]]},{"part":"main","warp":[[0,171.3,0,7.5,189,387.0],[6,183.3,0,-23.1,189,417.3],[12,195.4,0,-27.0,189,421.2],[18,207.4,0,-29.4,189,423.6],[24,219.5,0,-34.1,189,428.3],[30,231.5,0,-38.7,189,433.0],[36,243.6,0,-43.8,189,438.3],[42,255.6,0,-49.9,189,443.9],[48,267.7,0,-59.2,189,452.0],[54,279.7,0,-68.2,189,460.3],[60,291.8,0,-76.4,189,467.5],[66,303.8,0,-82.5,189,472.6],[72,315.9,0,-83.8,189,472.7],[78,327.9,0,-81.2,189,469.6],[84,340.0,0,-79.0,189,466.2],[90,352.0,0,-78.3,189,463.8],[96,364.1,0,-75.9,189,460.6],[102,376.1,0,-71.6,189,456.3],[108,388.2,0,-65.7,189,450.7],[114,400.2,0,-59.7,189,444.5],[120,412.3,0,-52.3,189,437.8],[126,424.3,0,-47.0,189,432.8],[132,436.4,0,-44.3,189,430.4],[138,448.4,0,-43.3,189,429.2],[144,460.5,0,-43.3,189,429.8],[150,472.5,0,-42.9,189,430.4],[156,484.5,0,-43.5,189,430.9],[162,496.6,0,-43.7,189,430.8],[168,508.6,0,-43.9,189,430.9],[174,520.7,0,-42.6,189,429.6],[180,532.7,0,-41.5,189,427.9],[186,544.8,0,-38.7,189,425.2],[192,556.8,0,-34.4,189,421.5],[198,568.9,0,-28.3,189,416.0],[204,580.9,0,-21.3,189,409.2],[210,593.0,0,-13.8,189,401.7],[216,605.0,0,-6.2,189,394.7],[222,617.1,0,0.8,189,388.0],[228,629.1,0,6.0,189,383.6],[234,641.2,0,9.5,189,380.4],[240,653.2,0,13.0,189,377.4],[246,665.3,0,15.5,189,374.5],[252,677.3,0,18.1,189,372.0],[258,689.4,0,22.0,189,367.7],[264,701.4,0,25.8,189,363.8],[270,713.5,0,28.5,189,361.1],[276,725.5,0,31.1,189,359.0],[282,737.6,0,32.3,189,357.9],[288,749.6,0,32.6,189,357.6],[294,761.7,0,32.4,189,358.1],[300,773.7,0,32.2,189,358.2],[306,785.7,0,31.7,189,358.5],[312,797.8,0,31.8,189,358.1],[318,809.8,0,31.3,189,358.7],[324,821.9,0,26.3,189,363.3],[330,833.9,0,25.1,189,364.5],[336,846.0,0,22.8,189,366.5],[342,858.0,0,4.6,189,384.1],[343,860.0,0,4.6,189,384.1]]}]}});
vf("pink-velour-cargo","adult",{"left":{"pieces":[{"part":"main","warp":[[0,146.4,0,6.1,102,173.7],[6,157.2,0,8.9,102,171.7],[12,168.0,0,11.7,102,169.7],[18,178.9,0,14.6,102,167.7],[24,189.7,0,17.4,102,165.7],[30,200.5,0,19.5,102,166.4],[36,211.3,0,19.3,102,167.6],[42,222.1,0,12.7,102,171.1],[48,232.9,0,5.2,102,178.7],[54,243.8,0,-1.4,102,186.8],[60,254.6,0,-6.1,102,194.3],[66,265.4,0,-7.7,102,200.4],[72,276.2,0,-7.4,102,205.2],[78,287.0,0,-4.1,102,202.8],[84,297.9,0,0.4,102,199.8],[90,308.7,0,5.2,102,196.7],[96,319.5,0,8.7,102,192.5],[102,330.3,0,10.5,102,191.2],[108,341.1,0,10.3,102,192.2],[114,351.9,0,9.6,102,194.7],[120,362.8,0,7.9,102,199.6],[126,373.6,0,5.5,102,206.4],[132,384.4,0,4.1,102,211.1],[138,395.2,0,4.6,102,214.4],[144,406.0,0,5.1,102,217.0],[150,416.9,0,5.4,102,218.1],[156,427.7,0,5.6,102,219.3],[162,438.5,0,5.3,102,220.0],[168,449.3,0,4.7,102,222.9],[174,460.1,0,4.3,102,225.8],[180,470.9,0,2.8,102,224.2],[186,481.8,0,3.6,102,221.9],[192,492.6,0,5.5,102,219.2],[198,503.4,0,7.5,102,216.5],[204,514.2,0,8.9,102,214.0],[210,525.0,0,11.5,102,211.0],[216,535.8,0,14.1,102,208.0],[222,546.7,0,17.7,102,205.9],[228,557.5,0,20.0,102,205.1],[234,568.3,0,20.9,102,204.8],[240,579.1,0,20.9,102,204.8],[246,589.9,0,20.9,102,204.8],[252,600.8,0,20.9,102,204.8],[258,611.6,0,20.9,102,204.8],[264,622.4,0,20.9,102,204.8],[270,633.2,0,20.9,102,204.8],[276,644.0,0,20.9,102,204.8],[282,654.8,0,20.9,102,204.8],[288,665.7,0,20.9,102,204.8],[294,676.5,0,20.9,102,204.8],[300,687.3,0,20.9,102,204.8],[306,698.1,0,20.9,102,204.8],[312,708.9,0,20.9,102,204.8],[318,719.8,0,20.9,102,204.8],[324,730.6,0,20.9,102,204.8],[330,741.4,0,20.9,102,204.8],[336,752.2,0,20.9,102,204.8],[342,763.0,0,20.9,102,204.8],[348,773.8,0,20.9,102,204.8],[354,784.7,0,20.9,102,204.8],[360,795.5,0,20.9,102,204.8],[366,806.3,0,20.9,102,204.8],[372,817.1,0,20.9,102,204.8],[378,827.9,0,20.9,102,204.8],[384,838.8,0,20.9,102,204.8],[390,849.6,0,-10.9,102,210.4],[395,858.6,0,20.9,102,204.8]]}]},"back":{"pieces":[{"part":"main","warp":[[0,148.2,0,-2.1,220,394.6],[6,159.0,0,20.9,220,371.7],[12,169.8,0,0.6,220,391.8],[18,180.7,0,-11.6,220,403.9],[24,191.5,0,-34.5,220,426.2],[30,202.3,0,-52.8,220,444.8],[36,213.1,0,-60.1,220,452.1],[42,223.9,0,-59.5,220,452.0],[48,234.7,0,-58.3,220,451.2],[54,245.6,0,-55.1,220,448.2],[60,256.4,0,-51.2,220,445.0],[66,267.2,0,-45.6,220,440.3],[72,278.0,0,-39.1,220,434.3],[78,288.8,0,-32.3,220,427.6],[84,299.7,0,-25.5,220,420.7],[90,310.5,0,-17.1,220,411.6],[96,321.3,0,-10.4,220,404.7],[102,332.1,0,-11.6,220,405.4],[108,342.9,0,-14.3,220,407.9],[114,353.7,0,-19.8,220,413.4],[120,364.6,0,-29.1,220,422.8],[126,375.4,0,-38.1,220,431.5],[132,386.2,0,-40.9,220,435.0],[138,397.0,0,-44.0,220,438.5],[144,407.8,0,-46.1,220,441.2],[150,418.6,0,-46.8,220,442.7],[156,429.5,0,-47.5,220,443.4],[162,440.3,0,-45.4,220,441.4],[168,451.1,0,-40.4,220,436.1],[174,461.9,0,-34.0,220,429.0],[180,472.7,0,-27.9,220,422.1],[186,483.6,0,-20.3,220,414.5],[192,494.4,0,-13.7,220,408.1],[198,505.2,0,-7.5,220,402.5],[204,516.0,0,-2.1,220,397.6],[210,526.8,0,4.0,220,392.2],[216,537.6,0,8.6,220,388.3],[222,548.5,0,9.7,220,387.0],[228,559.3,0,9.3,220,387.7],[234,570.1,0,7.7,220,388.9],[240,580.9,0,6.0,220,390.8],[246,591.7,0,4.4,220,392.0],[252,602.6,0,6.3,220,390.5],[258,613.4,0,9.9,220,386.7],[264,624.2,0,15.1,220,381.4],[270,635.0,0,19.8,220,376.3],[276,645.8,0,23.2,220,373.0],[282,656.6,0,25.4,220,370.7],[288,667.5,0,25.3,220,370.9],[294,678.3,0,23.5,220,373.3],[300,689.1,0,22.5,220,374.5],[306,699.9,0,22.2,220,374.6],[312,710.7,0,22.1,220,375.2],[318,721.6,0,21.7,220,375.9],[324,732.4,0,21.6,220,376.4],[330,743.2,0,21.5,220,376.8],[336,754.0,0,21.8,220,377.2],[342,764.8,0,22.1,220,376.9],[348,775.6,0,23.2,220,376.0],[354,786.5,0,24.3,220,375.1],[360,797.3,0,24.1,220,375.2],[366,808.1,0,23.8,220,375.8],[372,818.9,0,22.4,220,377.8],[378,829.7,0,13.4,220,386.9],[384,840.6,0,10.3,220,389.9],[390,851.4,0,5.8,220,395.3],[394,858.6,0,2.2,220,398.9]]}]}});
vf("yellow-dot-dress","little",{"left":{"pieces":[{"part":"main","warp":[[0,209.8,0,-154.0,242,340.0],[6,217.9,0,-168.3,242,351.6],[12,226.1,0,-151.1,242,339.2],[18,234.2,0,-139.8,242,331.3],[24,242.4,0,-118.8,242,316.8],[30,250.5,0,-109.2,242,310.3],[36,258.7,0,-103.7,242,307.2],[42,266.8,0,-99.7,242,304.8],[48,275.0,0,-96.3,242,302.5],[54,283.1,0,-93.9,242,300.2],[60,291.3,0,-91.6,242,297.2],[66,299.4,0,-88.4,242,293.3],[72,307.6,0,-86.7,242,290.0],[78,315.7,0,-86.2,242,287.3],[84,323.9,0,-86.6,242,285.1],[90,332.0,0,-88.4,242,284.1],[96,340.2,0,-90.9,242,284.0],[102,348.3,0,-93.0,242,283.5],[108,356.5,0,-93.7,242,281.7],[114,364.6,0,-90.6,242,276.4],[120,372.8,0,-84.5,242,269.1],[126,380.9,0,-76.3,242,260.3],[132,389.1,0,-66.8,242,250.1],[138,397.2,0,-57.4,242,240.5],[144,405.4,0,-59.4,242,242.6],[150,413.5,0,-61.5,242,244.7],[156,421.6,0,-63.6,242,246.8],[162,429.8,0,-65.7,242,248.9],[168,437.9,0,-67.8,242,251.0],[174,446.1,0,-69.8,242,253.1],[180,454.2,0,-71.9,242,255.2],[186,462.4,0,-72.7,242,256.0],[192,470.5,0,-72.7,242,256.0],[198,478.7,0,-72.7,242,256.0],[204,486.8,0,-72.7,242,256.0],[210,495.0,0,-72.7,242,256.0],[216,503.1,0,-72.7,242,256.0],[222,511.3,0,-72.7,242,256.0],[228,519.4,0,-72.7,242,256.0],[234,527.6,0,-72.7,242,256.0],[240,535.7,0,-72.7,242,256.0],[246,543.9,0,-72.7,242,256.0],[252,552.0,0,-72.7,242,256.0],[258,560.2,0,-72.7,242,256.0],[264,568.3,0,-72.7,242,256.0],[270,576.5,0,-72.7,242,256.0],[276,584.6,0,-72.7,242,256.0],[282,592.8,0,-72.7,242,256.0],[288,600.9,0,-72.7,242,256.0],[294,609.1,0,-72.7,242,256.0],[300,617.2,0,-72.7,242,256.0],[306,625.3,0,-72.7,242,256.0],[312,633.5,0,-72.7,242,256.0],[318,641.6,0,-72.7,242,256.0],[319,643.0,0,-72.7,242,256.0]]}]},"back":{"pieces":[{"part":"main","warp":[[0,209.8,0,-9.2,306,406.3],[6,217.9,0,19.2,306,378.6],[12,226.1,0,19.5,306,378.3],[18,234.2,0,19.7,306,377.9],[24,242.4,0,18.0,306,379.6],[30,250.5,0,17.2,306,380.1],[36,258.7,0,18.1,306,378.6],[42,266.8,0,17.2,306,379.1],[48,275.0,0,16.3,306,379.6],[54,283.1,0,15.7,306,379.6],[60,291.3,0,15.9,306,379.2],[66,299.4,0,16.4,306,378.5],[72,307.6,0,15.1,306,379.8],[78,315.7,0,13.0,306,382.2],[84,323.9,0,11.0,306,384.3],[90,332.0,0,9.1,306,386.6],[96,340.2,0,6.8,306,389.4],[102,348.3,0,6.9,306,389.7],[108,356.5,0,9.1,306,387.5],[114,364.6,0,14.5,306,382.6],[120,372.8,0,20.1,306,377.6],[126,380.9,0,25.2,306,373.0],[132,389.1,0,28.5,306,369.9],[138,397.2,0,30.1,306,368.5],[144,405.4,0,29.1,306,369.6],[150,413.5,0,27.4,306,371.2],[156,421.6,0,25.9,306,372.6],[162,429.8,0,25.1,306,373.1],[168,437.9,0,24.5,306,374.1],[174,446.1,0,24.3,306,374.4],[180,454.2,0,23.8,306,374.6],[186,462.4,0,23.6,306,374.8],[192,470.5,0,23.1,306,375.3],[198,478.7,0,23.0,306,375.1],[204,486.8,0,22.8,306,375.3],[210,495.0,0,23.1,306,375.0],[216,503.1,0,23.1,306,374.8],[222,511.3,0,23.2,306,374.3],[228,519.4,0,23.5,306,374.1],[234,527.6,0,23.7,306,373.9],[240,535.7,0,23.9,306,373.7],[246,543.9,0,24.3,306,373.7],[252,552.0,0,24.7,306,373.7],[258,560.2,0,25.1,306,373.6],[264,568.3,0,25.2,306,373.9],[270,576.5,0,25.8,306,375.4],[276,584.6,0,25.1,306,377.6],[282,592.8,0,23.3,306,380.6],[288,600.9,0,23.4,306,381.5],[294,609.1,0,20.3,306,384.9],[300,617.2,0,16.7,306,387.9],[306,625.3,0,9.4,306,394.0],[312,633.5,0,7.4,306,395.6],[318,641.6,0,-6.1,306,408.3],[321,645.7,0,-6.7,306,408.9]]}]}});
vf("lilac-cord-pinafore","little",{"left":{"pieces":[{"part":"main","warp":[[0,200.8,0,-100.3,259,300.3],[6,208.7,0,-106.2,259,305.2],[12,216.5,0,-112.1,259,310.1],[18,224.4,0,-99.4,259,301.6],[24,232.3,0,-70.7,259,280.8],[30,240.1,0,-63.8,259,276.6],[36,248.0,0,-64.4,259,276.5],[42,255.9,0,-68.0,259,278.4],[48,263.7,0,-72.5,259,279.7],[54,271.6,0,-75.4,259,279.2],[60,279.5,0,-76.7,259,277.7],[66,287.3,0,-75.4,259,274.9],[72,295.2,0,-73.3,259,272.1],[78,303.1,0,-71.1,259,270.5],[84,310.9,0,-70.6,259,270.7],[90,318.8,0,-69.6,259,270.9],[96,326.7,0,-69.6,259,271.7],[102,334.5,0,-69.6,259,271.7],[108,342.4,0,-70.1,259,271.2],[114,350.3,0,-70.7,259,270.5],[120,358.1,0,-73.2,259,271.0],[126,366.0,0,-75.0,259,271.0],[132,373.9,0,-77.1,259,271.9],[138,381.7,0,-78.8,259,273.3],[144,389.6,0,-77.9,259,270.4],[150,397.4,0,-73.5,259,264.3],[156,405.3,0,-73.6,259,264.5],[162,413.2,0,-73.7,259,264.6],[168,421.0,0,-73.8,259,264.7],[174,428.9,0,-73.9,259,264.8],[180,436.8,0,-74.0,259,264.9],[186,444.6,0,-74.1,259,265.0],[192,452.5,0,-74.2,259,265.2],[198,460.4,0,-74.3,259,265.2],[204,468.2,0,-74.3,259,265.2],[210,476.1,0,-74.3,259,265.2],[216,484.0,0,-74.3,259,265.2],[222,491.8,0,-74.3,259,265.2],[228,499.7,0,-74.3,259,265.2],[234,507.6,0,-74.3,259,265.2],[240,515.4,0,-74.3,259,265.2],[246,523.3,0,-74.3,259,265.2],[252,531.2,0,-74.3,259,265.2],[258,539.0,0,-74.3,259,265.2],[264,546.9,0,-74.3,259,265.2],[270,554.8,0,-74.3,259,265.2],[276,562.6,0,-74.3,259,265.2],[282,570.5,0,-74.3,259,265.2],[288,578.4,0,-74.3,259,265.2],[294,586.2,0,-74.3,259,265.2],[300,594.1,0,-74.3,259,265.2],[306,602.0,0,-74.3,259,265.2],[312,609.8,0,-74.3,259,265.2],[318,617.7,0,-74.3,259,265.2],[324,625.6,0,-74.3,259,265.2],[330,633.4,0,-74.3,259,265.2],[336,641.3,0,-74.3,259,265.2],[337,642.6,0,-74.3,259,265.2]]}]},"back":{"pieces":[{"part":"main","warp":[[0,200.8,0,-5.3,314,406.4],[6,208.7,0,-30.3,314,431.2],[12,216.5,0,-20.9,314,421.6],[18,224.4,0,-13.6,314,413.9],[24,232.3,0,-9.5,314,409.0],[30,240.1,0,-5.2,314,404.1],[36,248.0,0,6.7,314,391.7],[42,255.9,0,11.3,314,386.4],[48,263.7,0,15.4,314,382.1],[54,271.6,0,19.0,314,378.1],[60,279.5,0,20.0,314,376.7],[66,287.3,0,19.0,314,377.5],[72,295.2,0,18.6,314,377.4],[78,303.1,0,20.5,314,375.6],[84,310.9,0,24.1,314,372.8],[90,318.8,0,35.9,314,364.0],[96,326.7,0,48.7,314,351.8],[102,334.5,0,58.2,314,343.0],[108,342.4,0,58.5,314,343.2],[114,350.3,0,56.1,314,345.7],[120,358.1,0,44.0,314,355.8],[126,366.0,0,30.1,314,369.9],[132,373.9,0,16.6,314,383.9],[138,381.7,0,14.3,314,386.3],[144,389.6,0,11.6,314,389.1],[150,397.4,0,9.8,314,390.6],[156,405.3,0,8.2,314,392.5],[162,413.2,0,9.5,314,391.4],[168,421.0,0,12.0,314,389.1],[174,428.9,0,14.8,314,386.4],[180,436.8,0,17.5,314,383.9],[186,444.6,0,19.4,314,381.8],[192,452.5,0,21.3,314,380.3],[198,460.4,0,22.8,314,379.3],[204,468.2,0,24.4,314,378.1],[210,476.1,0,25.5,314,377.0],[216,484.0,0,26.5,314,376.0],[222,491.8,0,27.2,314,374.8],[228,499.7,0,28.1,314,374.0],[234,507.6,0,28.7,314,373.2],[240,515.4,0,29.3,314,372.4],[246,523.3,0,30.0,314,371.6],[252,531.2,0,30.7,314,371.1],[258,539.0,0,31.2,314,370.4],[264,546.9,0,31.8,314,370.2],[270,554.8,0,32.5,314,369.7],[276,562.6,0,33.1,314,369.5],[282,570.5,0,33.3,314,369.4],[288,578.4,0,33.4,314,369.0],[294,586.2,0,33.3,314,369.2],[300,594.1,0,32.4,314,370.4],[306,602.0,0,31.6,314,370.6],[312,609.8,0,32.6,314,370.2],[318,617.7,0,31.4,314,369.4],[324,625.6,0,33.5,314,370.2],[330,633.4,0,35.4,314,368.4],[336,641.3,0,38.1,314,366.9],[339,645.2,0,-3.6,314,408.0]]}]}});
vf("pink-gingham-bow-dress","little",{"left":{"pieces":[{"part":"main","warp":[[0,208.7,0,-153.8,277,370.3],[6,216.0,0,-167.2,277,382.7],[12,223.4,0,-154.3,277,370.2],[18,230.8,0,-146.5,277,362.7],[24,238.1,0,-131.8,277,348.8],[30,245.4,0,-130.5,277,346.6],[36,252.8,0,-121.0,277,340.4],[42,260.1,0,-114.1,277,337.2],[48,267.5,0,-107.9,277,334.4],[54,274.9,0,-99.7,277,327.6],[60,282.2,0,-91.2,277,320.0],[66,289.6,0,-89.1,277,315.9],[72,296.9,0,-86.7,277,312.4],[78,304.2,0,-85.1,277,309.6],[84,311.6,0,-84.8,277,309.8],[90,318.9,0,-86.2,277,311.3],[96,326.3,0,-88.5,277,313.7],[102,333.6,0,-90.7,277,314.8],[108,341.0,0,-83.3,277,310.3],[114,348.4,0,-74.7,277,305.2],[120,355.7,0,-66.1,277,299.9],[126,363.1,0,-56.6,277,293.5],[132,370.4,0,-48.1,277,286.6],[138,377.8,0,-47.7,277,282.1],[144,385.1,0,-46.2,277,276.3],[150,392.4,0,-43.1,277,267.3],[156,399.8,0,-39.7,277,258.0],[162,407.1,0,-41.9,277,260.9],[168,414.5,0,-44.2,277,263.7],[174,421.9,0,-46.4,277,266.6],[180,429.2,0,-48.6,277,269.4],[186,436.6,0,-50.9,277,272.3],[192,443.9,0,-53.1,277,275.2],[198,451.2,0,-55.4,277,278.0],[204,458.6,0,-57.6,277,280.9],[210,465.9,0,-58.0,277,281.3],[216,473.3,0,-58.0,277,281.3],[222,480.7,0,-58.0,277,281.3],[228,488.0,0,-58.0,277,281.3],[234,495.4,0,-58.0,277,281.3],[240,502.7,0,-58.0,277,281.3],[246,510.1,0,-58.0,277,281.3],[252,517.4,0,-58.0,277,281.3],[258,524.8,0,-58.0,277,281.3],[264,532.1,0,-58.0,277,281.3],[270,539.5,0,-58.0,277,281.3],[276,546.8,0,-58.0,277,281.3],[282,554.2,0,-58.0,277,281.3],[288,561.5,0,-58.0,277,281.3],[294,568.9,0,-58.0,277,281.3],[300,576.2,0,-58.0,277,281.3],[306,583.5,0,-58.0,277,281.3],[312,590.9,0,-58.0,277,281.3],[318,598.2,0,-58.0,277,281.3],[324,605.6,0,-58.0,277,281.3],[330,613.0,0,-58.0,277,281.3],[336,620.3,0,-58.0,277,281.3],[342,627.7,0,-58.0,277,281.3],[348,635.0,0,-58.0,277,281.3],[352,639.9,0,-58.0,277,281.3]]}]},"back":{"pieces":[{"part":"main","warp":[[0,208.7,0,-8.4,348,417.9],[6,216.0,0,12.1,348,396.4],[12,223.4,0,14.1,348,394.2],[18,230.8,0,15.2,348,393.0],[24,238.1,0,19.0,348,389.5],[30,245.4,0,19.6,348,389.0],[36,252.8,0,20.3,348,388.5],[42,260.1,0,20.7,348,388.1],[48,267.5,0,15.0,348,393.8],[54,274.9,0,13.0,348,394.9],[60,282.2,0,10.2,348,396.7],[66,289.6,0,12.0,348,394.5],[72,296.9,0,15.2,348,392.0],[78,304.2,0,23.5,348,385.0],[84,311.6,0,27.7,348,382.3],[90,318.9,0,31.6,348,380.0],[96,326.3,0,31.5,348,381.1],[102,333.6,0,29.1,348,383.4],[108,341.0,0,26.1,348,385.7],[114,348.4,0,23.4,348,387.9],[120,355.7,0,21.8,348,389.1],[126,363.1,0,21.0,348,389.8],[132,370.4,0,21.8,348,388.9],[138,377.8,0,23.5,348,386.8],[144,385.1,0,24.9,348,384.7],[150,392.4,0,25.9,348,382.8],[156,399.8,0,26.1,348,381.8],[162,407.1,0,25.6,348,381.2],[168,414.5,0,24.6,348,381.9],[174,421.9,0,23.8,348,382.4],[180,429.2,0,23.0,348,382.5],[186,436.6,0,22.9,348,382.3],[192,443.9,0,22.6,348,382.3],[198,451.2,0,22.4,348,381.7],[204,458.6,0,22.4,348,381.1],[210,465.9,0,22.3,348,381.0],[216,473.3,0,21.9,348,380.7],[222,480.7,0,22.1,348,380.5],[228,488.0,0,21.9,348,380.7],[234,495.4,0,21.8,348,380.6],[240,502.7,0,21.9,348,380.5],[246,510.1,0,22.0,348,380.4],[252,517.4,0,21.9,348,380.3],[258,524.8,0,22.0,348,380.2],[264,532.1,0,22.1,348,380.3],[270,539.5,0,22.1,348,380.5],[276,546.8,0,22.0,348,380.4],[282,554.2,0,22.1,348,380.3],[288,561.5,0,22.2,348,380.2],[294,568.9,0,22.2,348,380.4],[300,576.2,0,22.1,348,380.9],[306,583.5,0,21.3,348,382.4],[312,590.9,0,20.1,348,384.4],[318,598.2,0,18.7,348,386.3],[324,605.6,0,16.2,348,392.1],[330,613.0,0,12.1,348,399.9],[336,620.3,0,2.1,348,413.3],[342,627.7,0,-3.9,348,421.9],[348,635.0,0,-14.8,348,438.2],[354,642.4,0,-2.0,348,424.3]]}]}});
vf("denim-overalls","little",{"left":{"pieces":[{"part":"main","warp":[[0,200.4,0,-28.7,140,215.4],[6,208.6,0,-34.7,140,219.3],[12,216.8,0,-40.6,140,223.2],[18,225.1,0,-30.8,140,218.9],[24,233.3,0,-7.3,140,207.3],[30,241.5,0,-1.0,140,205.3],[36,249.7,0,0.9,140,205.0],[42,257.9,0,1.7,140,205.9],[48,266.2,0,2.0,140,206.7],[54,274.4,0,3.3,140,207.4],[60,282.6,0,5.4,140,207.8],[66,290.8,0,7.6,140,207.8],[72,299.0,0,11.0,140,207.2],[78,307.3,0,13.5,140,206.3],[84,315.5,0,14.4,140,205.4],[90,323.7,0,14.5,140,204.6],[96,331.9,0,14.0,140,204.2],[102,340.1,0,12.7,140,204.3],[108,348.4,0,11.6,140,204.3],[114,356.6,0,10.1,140,204.9],[120,364.8,0,8.8,140,206.0],[126,373.0,0,7.4,140,206.8],[132,381.2,0,6.7,140,207.5],[138,389.5,0,6.1,140,208.8],[144,397.7,0,6.3,140,210.1],[150,405.9,0,7.1,140,212.0],[156,414.1,0,8.9,140,215.1],[162,422.3,0,10.6,140,217.8],[168,430.6,0,12.8,140,219.7],[174,438.8,0,15.2,140,220.9],[180,447.0,0,17.8,140,220.0],[186,455.2,0,20.7,140,217.7],[192,463.4,0,23.7,140,215.2],[198,471.7,0,26.7,140,212.4],[204,479.9,0,28.7,140,209.0],[210,488.1,0,30.2,140,205.4],[216,496.3,0,30.9,140,200.8],[222,504.5,0,31.2,140,195.9],[228,512.8,0,30.8,140,191.6],[234,521.0,0,31.0,140,187.9],[240,529.2,0,31.1,140,185.0],[246,537.4,0,32.1,140,182.7],[252,545.6,0,32.1,140,182.3],[258,553.9,0,33.1,140,180.5],[264,562.1,0,30.0,140,183.5],[270,570.3,0,27.0,140,186.6],[276,578.5,0,23.9,140,189.6],[282,586.7,0,20.8,140,192.6],[288,595.0,0,17.8,140,195.6],[294,603.2,0,14.7,140,198.6],[300,611.4,0,11.7,140,201.6],[304,616.9,0,10.7,140,202.5]]}]},"back":{"pieces":[{"part":"main","warp":[[0,201.8,0,41.4,233,360.7],[6,210.0,0,50.2,233,351.9],[12,218.2,0,49.7,233,352.2],[18,226.5,0,49.3,233,352.6],[24,234.7,0,49.1,233,353.3],[30,242.9,0,48.2,233,354.7],[36,251.1,0,47.5,233,355.9],[42,259.3,0,48.3,233,355.7],[48,267.6,0,50.9,233,353.7],[54,275.8,0,53.3,233,351.7],[60,284.0,0,55.4,233,349.9],[66,292.2,0,57.3,233,348.0],[72,300.4,0,57.3,233,348.1],[78,308.7,0,56.7,233,349.4],[84,316.9,0,56.6,233,350.5],[90,325.1,0,56.0,233,350.6],[96,333.3,0,56.4,233,350.0],[102,341.5,0,58.1,233,348.3],[108,349.8,0,58.3,233,346.9],[114,358.0,0,57.9,233,346.1],[120,366.2,0,57.7,233,346.3],[126,374.4,0,57.4,233,346.0],[132,382.6,0,56.7,233,346.1],[138,390.9,0,56.5,233,345.9],[144,399.1,0,56.3,233,345.9],[150,407.3,0,56.8,233,345.4],[156,415.5,0,57.5,233,344.9],[162,423.7,0,58.2,233,344.4],[168,432.0,0,59.1,233,344.4],[174,440.2,0,60.0,233,343.7],[180,448.4,0,60.7,233,343.0],[186,456.6,0,61.3,233,342.6],[192,464.8,0,62.0,233,342.1],[198,473.1,0,62.7,233,341.1],[204,481.3,0,63.4,233,340.5],[210,489.5,0,64.2,233,339.9],[216,497.7,0,64.9,233,339.1],[222,505.9,0,65.5,233,338.3],[228,514.2,0,65.7,233,337.9],[234,522.4,0,66.0,233,337.4],[240,530.6,0,65.7,233,337.0],[246,538.8,0,65.9,233,336.3],[252,547.0,0,66.0,233,335.8],[258,555.3,0,65.9,233,335.7],[264,563.5,0,65.7,233,335.6],[270,571.7,0,65.7,233,335.6],[276,579.9,0,65.1,233,336.8],[282,588.1,0,64.9,233,337.6],[288,596.4,0,62.1,233,341.2],[294,604.6,0,76.4,233,327.0],[300,612.8,0,77.7,233,326.2],[304,618.3,0,42.5,233,361.7]]}]}});
vf("mint-cardigan-dress","little",{"left":{"pieces":[{"part":"main","warp":[[0,192.5,0,-83.6,224,284.8],[6,201.5,0,-87.3,224,287.9],[12,210.5,0,-91.1,224,291.1],[18,219.5,0,-80.3,224,285.0],[24,228.5,0,-54.4,224,268.8],[30,237.5,0,-45.0,224,264.5],[36,246.5,0,-42.4,224,263.1],[42,255.5,0,-45.8,224,264.4],[48,264.5,0,-48.9,224,265.3],[54,273.5,0,-51.8,224,265.1],[60,282.5,0,-53.4,224,263.9],[66,291.5,0,-53.2,224,261.7],[72,300.5,0,-52.1,224,259.2],[78,309.5,0,-51.3,224,256.2],[84,318.5,0,-51.2,224,253.8],[90,327.5,0,-52.5,224,251.9],[96,336.5,0,-53.4,224,249.8],[102,345.5,0,-53.0,224,246.7],[108,354.5,0,-53.1,224,243.8],[114,363.5,0,-52.7,224,240.9],[120,372.5,0,-52.5,224,239.1],[126,381.5,0,-53.5,224,239.7],[132,390.5,0,-53.3,224,242.8],[138,399.5,0,-50.9,224,245.9],[144,408.5,0,-47.3,224,245.9],[150,417.5,0,-42.5,224,245.1],[156,426.5,0,-46.0,224,248.8],[162,435.5,0,-49.5,224,252.6],[168,444.5,0,-53.1,224,256.3],[174,453.5,0,-56.6,224,260.1],[180,462.5,0,-60.1,224,263.8],[186,471.5,0,-63.6,224,267.6],[192,480.5,0,-65.9,224,270.1],[198,489.5,0,-65.9,224,270.1],[204,498.5,0,-65.9,224,270.1],[210,507.5,0,-65.9,224,270.1],[216,516.5,0,-65.9,224,270.1],[222,525.5,0,-65.9,224,270.1],[228,534.5,0,-65.9,224,270.1],[234,543.5,0,-65.9,224,270.1],[240,552.5,0,-65.9,224,270.1],[246,561.5,0,-65.9,224,270.1],[252,570.5,0,-65.9,224,270.1],[258,579.5,0,-65.9,224,270.1],[264,588.5,0,-65.9,224,270.1],[270,597.5,0,-65.9,224,270.1],[276,606.5,0,-65.9,224,270.1],[282,615.5,0,-65.9,224,270.1],[288,624.5,0,-65.9,224,270.1],[294,633.5,0,-65.9,224,270.1],[299,641.0,0,-65.9,224,270.1]]}]},"back":{"pieces":[{"part":"main","warp":[[0,194.0,0,-29.5,306,429.5],[6,203.0,0,31.9,306,367.9],[12,212.0,0,26.7,306,372.8],[18,221.0,0,21.5,306,377.9],[24,230.0,0,13.3,306,386.4],[30,239.0,0,6.2,306,393.6],[36,248.0,0,-3.8,306,403.7],[42,257.0,0,-12.2,306,412.8],[48,266.0,0,-20.7,306,421.8],[54,275.0,0,-28.5,306,430.2],[60,284.0,0,-36.0,306,438.3],[66,293.0,0,-41.0,306,443.7],[72,302.0,0,-45.0,306,447.8],[78,311.0,0,-46.7,306,449.7],[84,320.0,0,-47.3,306,450.3],[90,329.0,0,-47.4,306,450.2],[96,338.0,0,-48.4,306,450.6],[102,347.0,0,-48.3,306,450.1],[108,356.0,0,-48.7,306,450.0],[114,365.0,0,-49.0,306,450.0],[120,374.0,0,-47.6,306,448.4],[126,383.0,0,-43.5,306,444.7],[132,392.0,0,-40.8,306,442.1],[138,401.0,0,-37.9,306,438.9],[144,410.0,0,-34.8,306,435.6],[150,419.0,0,-31.9,306,432.8],[156,428.0,0,-30.9,306,431.2],[162,437.0,0,-21.8,306,415.8],[168,446.0,0,-16.8,306,411.7],[174,455.0,0,-12.5,306,408.3],[180,464.0,0,-9.1,306,405.8],[186,473.0,0,-6.2,306,403.5],[192,482.0,0,-7.0,306,410.7],[198,491.0,0,-6.0,306,409.7],[204,500.0,0,-5.2,306,408.7],[210,509.0,0,-4.1,306,407.6],[216,518.0,0,-3.0,306,407.2],[222,527.0,0,-1.8,306,406.8],[228,536.0,0,-0.8,306,406.1],[234,545.0,0,0.2,306,405.6],[240,554.0,0,0.9,306,405.1],[246,563.0,0,1.3,306,404.3],[252,572.0,0,1.6,306,403.9],[258,581.0,0,3.8,306,403.3],[264,590.0,0,8.4,306,401.4],[270,599.0,0,14.9,306,397.5],[276,608.0,0,17.1,306,393.8],[282,617.0,0,15.0,306,397.5],[288,626.0,0,52.8,306,365.7],[294,635.0,0,58.8,306,359.7],[300,644.0,0,-19.9,306,439.1],[301,645.5,0,-19.9,306,439.1]]}]}});
vf("star-pajamas","little",{"left":{"pieces":[{"part":"trousers","warp":[[0,416.4,0,7.9,108,213.0],[6,424.8,0,3.7,108,217.6],[12,433.1,0,6.4,108,216.6],[18,441.4,0,11.0,108,217.8],[24,449.8,0,16.6,108,216.5],[30,458.1,0,21.4,108,214.4],[36,466.4,0,26.7,108,212.2],[42,474.7,0,30.5,108,209.8],[48,483.1,0,32.3,108,207.5],[54,491.4,0,33.2,108,204.6],[60,499.7,0,33.2,108,201.4],[66,508.0,0,32.6,108,198.7],[72,516.4,0,32.2,108,197.1],[78,524.7,0,32.5,108,195.8],[84,533.0,0,33.3,108,194.9],[90,541.4,0,34.9,108,195.1],[96,549.7,0,36.6,108,195.0],[102,558.0,0,38.5,108,194.4],[108,566.3,0,40.5,108,193.8],[114,574.7,0,42.6,108,192.8],[120,583.0,0,44.7,108,190.9],[126,591.3,0,46.7,108,188.1],[132,599.7,0,48.0,108,185.2],[138,608.0,0,49.2,108,182.1],[144,616.3,0,50.5,108,179.2],[150,624.6,0,51.7,108,176.8],[156,633.0,0,53.1,108,176.5],[162,641.3,0,55.7,108,177.6],[168,649.6,0,58.2,108,180.0],[174,658.0,0,60.7,108,183.5],[180,666.3,0,62.4,108,187.7],[186,674.6,0,63.7,108,191.3],[192,682.9,0,64.3,108,193.9],[198,691.3,0,64.5,108,195.6],[204,699.6,0,64.3,108,196.8],[210,707.9,0,64.6,108,197.5],[216,716.2,0,64.6,108,197.5],[222,724.6,0,63.3,108,198.9],[228,732.9,0,60.8,108,201.3],[234,741.2,0,58.3,108,203.6],[240,749.6,0,55.5,108,205.6],[246,757.9,0,49.9,108,211.5],[252,766.2,0,47.7,108,213.4],[258,774.5,0,46.7,108,214.3],[262,780.1,0,47.5,108,213.4]]},{"part":"top","warp":[[0,201.3,0,-18.5,112,197.9],[6,209.6,0,-28.7,112,203.7],[12,218.0,0,-15.4,112,200.2],[18,226.3,0,-9.2,112,198.7],[24,234.6,0,4.4,112,196.1],[30,242.9,0,8.3,112,195.5],[36,251.3,0,8.4,112,195.4],[42,259.6,0,6.8,112,196.0],[48,267.9,0,5.9,112,196.1],[54,276.3,0,5.4,112,196.1],[60,284.6,0,5.3,112,195.6],[66,292.9,0,5.4,112,194.9],[72,301.2,0,6.0,112,193.5],[78,309.6,0,6.5,112,191.9],[84,317.9,0,6.8,112,190.1],[90,326.2,0,6.8,112,187.9],[96,334.5,0,6.8,112,185.7],[102,342.9,0,6.4,112,183.6],[108,351.2,0,6.2,112,181.5],[114,359.5,0,6.4,112,179.4],[120,367.9,0,6.7,112,177.7],[126,376.2,0,7.2,112,176.8],[132,384.5,0,8.2,112,175.5],[138,392.8,0,9.0,112,175.0],[144,401.2,0,10.1,112,173.9],[150,409.5,0,11.2,112,172.8],[156,417.8,0,12.3,112,171.7],[162,426.2,0,13.4,112,170.6],[168,434.5,0,14.3,112,169.7],[174,442.8,0,14.3,112,169.7],[175,444.2,0,14.3,112,169.7]]}]},"back":{"pieces":[{"part":"trousers","warp":[[0,419.2,0,71.1,181,322.3],[6,427.6,0,47.6,181,345.2],[12,435.9,0,48.7,181,344.6],[18,444.2,0,47.3,181,346.1],[24,452.5,0,48.8,181,344.8],[30,460.9,0,50.4,181,343.8],[36,469.2,0,52.6,181,341.4],[42,477.5,0,54.4,181,339.6],[48,485.9,0,56.3,181,338.2],[54,494.2,0,58.3,181,336.8],[60,502.5,0,60.9,181,334.9],[66,510.8,0,63.8,181,332.7],[72,519.2,0,66.7,181,330.5],[78,527.5,0,70.0,181,327.7],[84,535.8,0,73.6,181,324.9],[90,544.1,0,76.8,181,321.9],[96,552.5,0,79.9,181,319.2],[102,560.8,0,83.2,181,316.4],[108,569.1,0,86.2,181,313.9],[114,577.5,0,89.1,181,311.3],[120,585.8,0,91.7,181,309.3],[126,594.1,0,93.9,181,307.3],[132,602.4,0,95.9,181,305.7],[138,610.8,0,97.6,181,304.4],[144,619.1,0,98.4,181,303.5],[150,627.4,0,99.1,181,303.1],[156,635.8,0,99.3,181,303.4],[162,644.1,0,98.5,181,304.5],[168,652.4,0,97.1,181,306.3],[174,660.7,0,95.5,181,308.6],[180,669.1,0,93.7,181,310.6],[186,677.4,0,92.1,181,312.2],[192,685.7,0,91.0,181,313.4],[198,694.1,0,90.4,181,314.3],[204,702.4,0,90.1,181,314.7],[210,710.7,0,89.8,181,315.0],[216,719.0,0,89.9,181,314.9],[222,727.4,0,88.5,181,316.3],[228,735.7,0,87.2,181,317.6],[234,744.0,0,86.5,181,318.5],[240,752.3,0,86.8,181,318.4],[246,760.7,0,85.7,181,319.8],[252,769.0,0,86.7,181,318.9],[258,777.3,0,77.3,181,328.5],[260,780.1,0,77.3,181,328.5]]},{"part":"top","warp":[[0,202.7,0,19.1,263,384.2],[6,211.0,0,-4.6,263,407.8],[12,219.4,0,-8.3,263,411.1],[18,227.7,0,-9.8,263,412.5],[24,236.0,0,-13.8,263,415.8],[30,244.3,0,-14.5,263,416.3],[36,252.7,0,-15.6,263,417.2],[42,261.0,0,-14.0,263,415.3],[48,269.3,0,-12.8,263,413.9],[54,277.7,0,-11.3,263,412.3],[60,286.0,0,-10.2,263,411.0],[66,294.3,0,-9.2,263,409.8],[72,302.6,0,-8.3,263,408.8],[78,311.0,0,-6.7,263,406.7],[84,319.3,0,-4.0,263,403.8],[90,327.6,0,0.3,263,399.6],[96,335.9,0,6.2,263,394.3],[102,344.3,0,13.2,263,387.8],[108,352.6,0,17.8,263,381.9],[114,360.9,0,22.5,263,374.9],[120,369.3,0,25.9,263,368.8],[126,377.6,0,28.9,263,362.4],[132,385.9,0,25.6,263,364.4],[138,394.2,0,22.9,263,367.6],[144,402.6,0,15.9,263,376.0],[150,410.9,0,8.8,263,384.1],[156,419.2,0,-1.3,263,398.3],[162,427.6,0,15.9,263,380.9],[165,431.7,0,15.9,263,380.9]]}]}});
/* @end generated */
/* hand-tuned extras merged into the generated outfit fits: vfx(id, doll, view, fields) for the view,
   vfp(id, doll, view, pieceIndex, fields) for one piece (sleeve limbs and their cuts). */
const VFX=[],VFP=[];const vfx=(id,doll,view,extra)=>VFX.push([id,doll,view,extra]),vfp=(id,doll,view,i,extra)=>VFP.push([id,doll,view,i,extra]);
/* doll-local region below a (slanted) line: where the near arm shows over a sleeved side outfit */
const below=(y,y2=y)=>[{poly:[[-80,y],[300,y2],[300,950],[-80,950]]}];
/* the same below a curved hem line [[x,y],...] (left to right), with a soft edge so the arm fades in */
const hem=(pts,feather=2.5)=>[{poly:[[-80,pts[0][1]],...pts,[300,pts[pts.length-1][1]],[300,950],[-80,950]],feather}];
/* mirror sprite-space sleeve geometry for the other arm of a back sprite of width W */
const msp=(pts,W)=>pts.map(([x,y])=>[W-x,y]);
const backSleeves=(W,poly,cut,s0,s1,dl,dr,kx,under=false)=>[limb(poly,s0,s1,dl[0],dl[1],kx,{under,cut}),
  limb(msp(poly,W),[W-s0[0],s0[1]],[W-s1[0],s1[1]],dr[0],dr[1],kx,{under,cut:msp(cut,W)})];
const ADULT_BACK_ARMS=[[[100,194],[38,455]],[[296,194],[358,455]]],LITTLE_BACK_ARMS=[[[96,230],[36,466]],[[307,230],[367,466]]];
vfp('denim-jacket-skirt','adult','back',0,{parts:backSleeves(317,[[0,20],[110,20],[115,60],[112,100],[80,170],[58,240],[0,240]],[[0,20],[95,20],[100,60],[100,100],[75,170],[55,240],[0,240]],[88,40],[30,225],...ADULT_BACK_ARMS,1.6)});
vfp('black-flares-set','adult','back',2,{parts:backSleeves(189,[[0,0],[66,0],[68,25],[63,45],[60,55],[60,72],[60,84],[55,94],[44,106],[36,120],[30,140],[0,140]],[[0,0],[57,0],[59,25],[60,48],[59,60],[59,72],[59,84],[54,94],[43,106],[35,120],[28,140],[0,140]],[52,12],[14,130],[[98,194],[29,456]],[[298,194],[367,456]],2.5)});
vfp('pink-velour-cargo','adult','back',0,{parts:backSleeves(220,[[0,0],[75,0],[80,30],[74,60],[72,72],[70,80],[67,90],[64,100],[57,115],[49,135],[37,160],[30,165],[0,165]],[[0,0],[65,0],[70,25],[71,60],[70,72],[68,80],[66,90],[63,100],[55,115],[47,135],[35,160],[0,160]],[60,15],[22,148],[[91,186],[37,455]],[[305,186],[359,455]],1.95)});
vfp('mint-cardigan-dress','little','back',0,{parts:backSleeves(306,[[0,0],[95,0],[100,60],[95,125],[85,150],[78,172],[0,172]],[[0,0],[82,0],[88,60],[86,125],[80,150],[75,172],[0,172]],[68,25],[42,160],...LITTLE_BACK_ARMS,1.4)});
vfp('star-pajamas','little','back',1,{parts:backSleeves(263,[[0,0],[74,0],[76,40],[76,80],[72,100],[64,120],[52,140],[48,170],[0,170]],[[0,0],[71,0],[73,40],[73,80],[69,100],[61,120],[49,140],[46,170],[0,170]],[62,40],[28,150],[[96,262],[38,466]],[[307,262],[365,466]],1.6)});
/* the sundress back neckline is low: repaint the bodysuit there from the skin above, not the darker sides */
vfx('green-hibiscus-sundress','adult','back',{skin:[{rect:[158,200,82,70],dir:'v'},{rect:[0,140,397,580]}]});
/* side puff sleeves: the sprite draws them on the back half of the shoulder; move them onto the near arm */
vfx('hibiscus-flares','adult','left',{armClip:hem([[60,291],[75,290],[90,292],[105,294],[120,297],[135,299],[150,300]],3)});
vfx('lilac-satin-bow-dress','adult','left',{armClip:hem([[60,297],[75,298],[90,299],[105,299],[120,299],[135,298],[150,297]],3)});
vfx('denim-jacket-skirt','adult','left',{armClip:hem([[35,449],[50,450],[65,453],[80,455],[95,458],[115,461]])});
vfx('black-flares-set','adult','left',{armClip:hem([[45,446],[60,444],[80,441],[100,439],[115,438]])});
vfx('pink-velour-cargo','adult','left',{armClip:hem([[50,458],[58,447],[66,441],[76,438],[90,439],[110,440],[130,440]],3)});
vfx('lilac-cord-pinafore','little','left',{armClip:hem([[70,348],[90,349],[110,350],[130,349],[150,347],[170,346]],3)});
vfx('denim-overalls','little','left',{armClip:[{ellipse:[123,352,21,24],feather:2},...hem([[80,377],[170,377]],3)]});
vfx('mint-cardigan-dress','little','left',{armClip:hem([[70,457],[88,451],[100,443],[120,440],[150,440]],3)});
vfx('star-pajamas','little','left',{armClip:hem([[60,462],[85,462],[105,470],[125,476],[150,470]])});
vfp('star-pajamas','little','left',1,{cutFeather:2.5,parts:[limb([[38,4],[100,4],[106,60],[98,120],[76,168],[18,174],[14,150],[28,100],[32,40]],[64,12],[44,162],[132,226],[119,466],1.42,{over:true,
    /* the art's lower sleeve and cuff hang in front of the hem: cut them, the whole sleeve moves onto the arm */
    cut:[[28,46],[92,46],[95,60],[93,100],[86,124],[66,140],[62,176],[0,176],[0,146],[12,146],[16,128],[20,100],[24,60]]}),
  /* the hole left behind is filled, under the rest, with plain body fabric and hem rib from the back
     view's top (view/srcW: another view's sprite of this piece, and its width for mirroring) */
  limb([[116,28],[182,28],[182,160],[90,160],[90,148],[96,138],[100,90],[108,56]],[130,158],[130,70],[70,428],[70,306],1.388,{under:true,view:'back',srcW:263})]});
/* ----- shoes ----- */
vf('black-platform-sandals','adult',{left:{near:{x:10,y:752.8,w:127.5}},back:{left:{x:109.8,y:755.7,w:61.4},right:{x:225.7,y:755.7,w:61}}});
vf('lilac-mary-jane-heels','adult',{left:{near:{x:11,y:760,w:123}},back:{left:{x:110.3,y:760.7,w:59.7},right:{x:226.3,y:760.3,w:60.1}}});
vf('pink-chunky-sneakers','adult',{left:{near:{x:7,y:772,w:126.5}},back:{left:{x:107.6,y:772.6,w:65.8},right:{x:222.4,y:772.6,w:66.1}}});
vf('red-mary-janes','little',{left:{near:{x:19.7,y:775.3,w:140.1}},back:{left:{x:103.2,y:763.2,w:71.1},right:{x:230,y:763.2,w:70.3}}});
vf('white-velcro-sneakers','little',{left:{near:{x:10.5,y:763.8,w:136.3}},back:{left:{x:103.5,y:754.9,w:70.8},right:{x:229.1,y:754.9,w:71.6}}});
vf('strawberry-rain-boots','little',{left:{near:{x:20,y:706,w:140}},back:{left:{x:102.8,y:728,w:72.2},right:{x:227.9,y:728,w:73}}});
/* ----- hair ----- */
const HV=(id,view,x,y,w,extra={})=>({x,y,w,h:w*VS[id][view][1]/VS[id][view][0],...extra});
/* side views: the head region is in front of the body, hair below the neck hangs behind the back and
   shoulders (FRONT_SIDE); fringes that would hang in front of the profile are trimmed (cutDoll);
   earsUnder = the style covers the ear, so earrings are drawn under it. Back views: all in front. */
/* in front: everything above a line from under the chin, past the ear lobe, to the back of the skull */
const FRONT_SIDE={adult:[{poly:[[-300,-300],[600,-300],[600,95],[166,104],[140,127],[118,140],[60,162],[-300,162]]}],
  little:[{poly:[[-300,-300],[600,-300],[600,128],[200,138],[172,172],[142,194],[70,216],[-300,216]]}]};
/* the fringe in front of the profile is trimmed along a rounded hairline: pts run from above the
   head down the front of the hair to the forehead edge and on below the brow (eye, nose, mouth clear) */
const trimFront=pts=>[{poly:[[-300,pts[0][1]],...pts,[pts[pts.length-1][0],400],[-300,400]],feather:1}];
const HAIRLINE={adult:[[-10,-40],[-2,-12],[6,4],[14,18],[22,30],[29,40],[34,49],[37,57],[39,66],[40,76]],
  little:[[-22,-40],[-10,-14],[0,4],[8,22],[14,38],[19,52],[23,64],[27,76],[29,88]]};
const SIDE=(doll,extra)=>({front:FRONT_SIDE[doll],...extra});
vf('long-waves','adult',{left:HV('long-waves','left',11.2,-28.1,217.5,SIDE('adult',{earsUnder:true,clip:{x:118,y:22,rot:0}})),back:HV('long-waves','back',64,-28.1,269.1,{earsUnder:true,clip:{x:236,y:40,rot:20,scale:.85}})});
vf('long-waves','little',{left:HV('long-waves','left',0,-38,290,SIDE('little',{earsUnder:true,clip:{x:140,y:50,rot:0}})),back:HV('long-waves','back',-5.7,-40.7,414.4,{earsUnder:true,clip:{x:258,y:62,rot:20,scale:.85}})});
vf('side-ponytail','adult',{left:HV('side-ponytail','left',-20,-60,205,SIDE('adult',{cutDoll:trimFront(HAIRLINE.adult),clip:{x:120,y:-2,rot:0}})),back:HV('side-ponytail','back',103.4,-69.9,190.2,{clip:{x:152,y:22}})});
vf('side-ponytail','little',{left:HV('side-ponytail','left',-35,-75,272,SIDE('little',{cutDoll:trimFront(HAIRLINE.little),clip:{x:140,y:10}})),back:HV('side-ponytail','back',63.7,-95.4,275.5,{clip:{x:136,y:40}})});
vf('half-up-curls','adult',{left:HV('half-up-curls','left',0,-55,215,SIDE('adult',{earsUnder:true,cutDoll:trimFront(HAIRLINE.adult),clip:{x:105,y:2}})),back:HV('half-up-curls','back',60.9,-67.4,275.3,{earsUnder:true,clip:{x:230,y:20}})});
vf('half-up-curls','little',{left:HV('half-up-curls','left',-12,-70,286,SIDE('little',{earsUnder:true,cutDoll:trimFront(HAIRLINE.little),clip:{x:125,y:20}})),back:HV('half-up-curls','back',-10.5,-101.2,423.9,{earsUnder:true,clip:{x:256,y:40}})});
vf('ringlet-pigtails','adult',{left:HV('ringlet-pigtails','left',12,-48,170,SIDE('adult',{clip:{x:118,y:2}})),back:HV('ringlet-pigtails','back',112,-24,172,{h:220,clip:{x:250,y:8}})});
vf('ringlet-pigtails','little',{left:HV('ringlet-pigtails','left',8,-60,226,SIDE('little',{clip:{x:135,y:14}})),back:HV('ringlet-pigtails','back',78,-26,246,{h:302.5,clip:{x:270,y:22}})});
vf('curly-buns','adult',{left:HV('curly-buns','left',18,-60,172,SIDE('adult',{clip:{x:112,y:6}})),back:HV('curly-buns','back',95,-38,206,{h:209,clip:{x:246,y:16}})});
vf('curly-buns','little',{left:HV('curly-buns','left',16,-78,229,SIDE('little',{clip:{x:130,y:20}})),back:HV('curly-buns','back',48,-52,306,{h:300,clip:{x:272,y:32}})});
vf('curly-bob','adult',{left:HV('curly-bob','left',20.2,-32.8,175.9,SIDE('adult',{earsUnder:true,clip:{x:110,y:18}})),back:HV('curly-bob','back',87.6,-33.4,221.9,{earsUnder:true,clip:{x:222,y:28,rot:15,scale:.85}})});
vf('curly-bob','little',{left:HV('curly-bob','left',12,-42,234,SIDE('little',{earsUnder:true,clip:{x:130,y:40}})),back:HV('curly-bob','back',35.1,-45.2,332.8,{earsUnder:true,clip:{x:248,y:52,rot:15,scale:.85}})});
/* ----- jewelry ----- */
vf('gold-hoops','adult',{left:{left:{x:104,y:107,w:8,part:'left'}},back:{left:{x:153,y:103,w:20},right:{x:243,y:103,w:20}}});
vf('gold-hoops','little',{left:{left:{x:104,y:159,w:9,part:'left'}},back:{left:{x:137,y:156,w:22},right:{x:266,y:156,w:22}}});
/* side necklaces: the edge-on strand runs from the clasp at the nape to the front of the neck/chest */
const strand=(W,H,s0,s1,d0,d1,kx)=>({piece:limb([[0,0],[W,0],[W,H],[0,H]],s0,s1,d0,d1,kx)});
vf('pearl-starfish-necklace','adult',{left:strand(99,280,[70,12],[30,262],[118,128],[74,160],.24),back:{x:150,y:128,w:99,keep:[[[0,0],[377,0],[377,128],[0,128]]]}});
vf('pearl-starfish-necklace','little',{left:strand(99,280,[70,12],[30,262],[136,170],[84,200],.26),back:{x:149,y:170,w:105,keep:[[[0,0],[377,0],[377,128],[0,128]]]}});
vf('butterfly-necklace','adult',{left:strand(40,330,[22,5],[20,325],[110,132],[46,226],.3),back:{x:158,y:136,w:80,keep:[[[0,0],[309,0],[309,52],[0,52]]]}});
vf('butterfly-necklace','little',{left:strand(40,330,[22,5],[20,325],[124,176],[50,258],.3),back:{x:160,y:176,w:84,keep:[[[0,0],[309,0],[309,52],[0,52]]]}});
/* merge into the catalog */
for(const [id,doll,view,extra] of VFX)Object.assign(VF[id][doll][view],extra);
for(const [id,doll,view,i,extra] of VFP)Object.assign(VF[id][doll][view].pieces[i],extra);
/* ----- shoes on the foot (portrait.js shoeLayers / fitFeet) -----
   SHOE_FIT[id][doll][view]: merged into the shoe's fit (left/right/near merged one level deeper).
   foot = how the bare foot is moved into the shoe (sole onto the footbed line `bed`, doll-local, length
   scaled by sx about cx), trim = doll y below which no skin shows outside the shoe (mask); per sprite
   part (sprite fractions [u, v]): over = drawn in front of the leg above the collar (front band of an
   ankle strap), open = holes in the front layer where the foot shows (insole between straps, the throat
   of a mary jane), keep = open sides where the foot shows outside the shoe's silhouette. The right view
   is mirrored from left unless given. */
const SHOE_FIT={};
const shoeFit=(id,doll,view,extra)=>{((SHOE_FIT[id]??={})[doll]??={})[view]=extra};
/* a pair's right sprite is the mirror of its left one */
const flipU=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,['front','over','open','keep'].includes(k)?(k==='front'?v.map(([u,v])=>[1-u,v]):v.map(p=>p.map(([u,v])=>[1-u,v]))):v]));
const pair=(o,extra={})=>({left:o,right:flipU(o),...extra});
shoeFit('black-platform-sandals','adult','front',{...pair({
    over:[[[0,.12],[.35,.16],[.7,.19],[.95,.18],[1,.22],[1,.31],[0,.31]]],
    open:[[[.15,.3],[.85,.3],[.9,.58],[.1,.58]],[[.1,.705],[.9,.705],[.88,.77],[.12,.77]]]}),
  foot:{top:790,bed:[[0,848],[400,848]]},trim:796});
shoeFit('black-platform-sandals','adult','left',{near:{
    keep:[[[0,.45],[.16,.42],[.16,.75],[0,.75]],[[.42,-.1],[.9,-.1],[.9,.47],[.6,.55],[.42,.68]]]},
  foot:{top:772,bed:[[0,840],[50,839],[70,834],[100,808],[140,805]],sx:.93,cx:128,ramp:40},trim:772});
shoeFit('black-platform-sandals','adult','back',{collar:.12,...pair({keep:[[[.15,.05],[.85,.05],[.85,.4],[.15,.4]]]}),trim:790});

/* bodysuit straps / back neckline repainted as skin above every side/back outfit (only lilac pixels change) */
const SKIN_DEFAULT={adult:{left:[{rect:[0,140,182,580]}],back:[{rect:[0,140,397,580]}]},little:{left:[{rect:[0,180,208,500]}],back:[{rect:[0,180,403,500]}]}};
for(const id in VF)for(const doll in VF[id])for(const view of ['left','back'])if(VF[id][doll][view]?.pieces&&!VF[id][doll][view].skin)VF[id][doll][view].skin=SKIN_DEFAULT[doll][view];
for(const it of items){
  if(!VS[it.id])continue;
  for(const view of ['left','right','back'])it.art[view]=viewArt(it,view);
  for(const doll of it.dolls){
    const f=VF[it.id]?.[doll];if(!f)continue;
    const size=part=>{const p=VPSIZE[it.id];return p&&part!=='main'?[p.left[part][0],p.right[part][0]]:[VS[it.id].left[0],VS[it.id].right[0]]};
    const fit=it.fit[doll]??={};
    fit.left=f.left;fit.back=f.back;fit.right=f.right||(f.left&&mirrorFit(f.left,MIRROR[doll],size));
    for(const v of ['left','right','back'])if(!fit[v])delete fit[v];
  }
}
for(const it of items)if(SHOE_FIT[it.id])for(const [doll,views] of Object.entries(SHOE_FIT[it.id])){
  const fit=it.fit[doll];
  for(const [view,extra] of Object.entries(views)){
    const f=fit[view];
    for(const [k,v] of Object.entries(extra))f[k]=['left','right','near'].includes(k)?{...f[k],...v}:v;
    if(view==='left'&&!views.right)fit.right=mirrorFit(f,MIRROR[doll],()=>[1,1]);
  }
}
/* a clip on the far side of the head (seen from the left: her right side) goes behind the head */
for(const it of items)if(it.category==='hair')for(const doll of it.dolls){
  const fr=it.fit[doll]?.front?.clip,l=VF[it.id]?.[doll]?.left;
  if(fr&&l?.clip&&l.clip.behind===undefined&&!VF[it.id][doll].right){l.clip.behind=fr.x<(doll==='adult'?200:201);it.fit[doll].right=mirrorFit(l,MIRROR[doll],()=>[VS[it.id].left[0],VS[it.id].right[0]])}
}
/* ----- scalp underlayer (portrait.js scalpLayer) -----
   SCALP_REGION: per doll and view, the skull above a natural hairline (about a third of the way from
   the brow to the top of the skull for the adult, a little higher for the toddler, temples covered down
   to the top of the ears, ears left clear); right = mirrored left. The polygon is clipped to the doll's
   silhouette, so it only has to close somewhere off the head. SCALP_FLOW: per style, the points the
   underlayer's strands are combed toward (part = x of a parting that splits the head between the first
   and the last point). */
const SCALP_REGION={
  adult:{front:[[136,64],[150,66],[153,80],[157,83],[159,72],[163,62],[170,55],[180,50.5],[192,48],[203,47],[214,48],[226,50.5],[236,55],[243,62],[247,72],[249,83],[253,80],[256,66],[270,64],[270,-40],[136,-40]],
    left:[[0,46],[44,46],[56,49],[68,54],[80,61],[89,70],[94,80],[97,90],[101,86],[103,77],[110,72],[118,73],[124,80],[126,95],[128,112],[131,128],[160,132],[200,132],[200,-40],[0,-40]],
    back:[[136,66],[150,72],[153,92],[158,108],[166,120],[182,127],[200,129],[218,127],[234,120],[242,108],[247,92],[250,72],[264,66],[264,-40],[136,-40]]},
  little:{front:[[110,98],[126,100],[129,114],[134,120],[138,108],[142,96],[150,86],[163,78],[178,72],[192,70],[206,69],[220,70],[234,72],[249,78],[262,86],[270,96],[274,108],[278,120],[283,114],[286,100],[302,98],[302,-40],[110,-40]],
    left:[[-20,64],[22,66],[38,70],[54,76],[70,84],[84,94],[96,106],[103,118],[108,114],[112,108],[124,105],[136,108],[143,118],[146,138],[148,160],[150,182],[230,182],[230,-40],[-20,-40]],
    back:[[110,98],[128,106],[131,128],[138,146],[150,160],[170,168],[203,171],[236,168],[256,160],[268,146],[275,128],[278,106],[298,98],[298,-40],[110,-40]]}};
const SCALP_FLOW={
  'long-waves':{adult:{front:{part:203,to:[[128,130],[278,130]]},left:{to:[[150,150]]},back:{to:[[200,200]]}},
    little:{front:{part:206,to:[[110,170],[300,170]]},left:{to:[[160,200]]},back:{to:[[203,240]]}}},
  'side-ponytail':{adult:{front:{to:[[182,-28]]},left:{to:[[112,-28]]},back:{to:[[200,-30]]}},
    little:{front:{to:[[172,-40]]},left:{to:[[125,-40]]},back:{to:[[203,-40]]}}},
  'half-up-curls':{adult:{front:{to:[[203,-30]]},left:{to:[[110,-20]]},back:{to:[[200,10]]}},
    little:{front:{to:[[206,-30]]},left:{to:[[115,-30]]},back:{to:[[203,10]]}}},
  'ringlet-pigtails':{adult:{front:{part:203,to:[[146,7],[260,7]]},left:{to:[[115,-12]]},back:{part:200,to:[[150,0],[250,0]]}},
    little:{front:{part:206,to:[[130,11],[282,11]]},left:{to:[[130,-20]]},back:{part:203,to:[[135,0],[270,0]]}}},
  'curly-buns':{adult:{front:{part:203,to:[[146,-5],[260,-5]]},left:{to:[[120,-20]]},back:{part:200,to:[[150,-5],[250,-5]]}},
    little:{front:{part:206,to:[[132,-5],[280,-5]]},left:{to:[[135,-30]]},back:{part:203,to:[[135,-10],[270,-10]]}}},
  'curly-bob':{adult:{front:{part:236,to:[[130,60],[276,70]]},left:{to:[[130,80]]},back:{to:[[200,140]]}},
    little:{front:{part:255,to:[[110,90],[300,100]]},left:{to:[[150,110]]},back:{to:[[203,180]]}}}};
/* clips: side/back sprites; clips at the far side of the head are drawn behind it (hair fit .clip.behind) */
for(const it of items)if(it.category==='clip'&&VS[it.id])for(const view of ['left','right','back'])it.art[view]=viewArt(it,view);
for(const doll of ['adult','little']){
  const d=dolls[doll],s=sideDolls[doll],M=MIRROR[doll];
  d.art.left='assets/dolls/'+doll+'-left.webp';d.art.right='assets/dolls/'+doll+'-right.webp';d.art.back='assets/dolls/'+doll+'-back.webp';
  const mp=pts=>pts.map(([x,y])=>[M-x,y]),me=list=>list.map(([x,y,...r])=>[M-x,y,...r]);
  const lf=s.left.face,rf={...lf,lips:mp(lf.lips),mouth:lf.mouth&&mp(lf.mouth),lids:lf.lids&&lf.lids.map(g=>({gradient:[M-g.gradient[0],...g.gradient.slice(1)]})),
    eyes:lf.eyes&&lf.eyes.map(mp),cheeks:me(lf.cheeks),cheekbones:me(lf.cheekbones),gemAt:[M-lf.gemAt[0],lf.gemAt[1]],crystals:me(lf.crystals),lobes:me(lf.lobes)};
  const rightOrigin=s.rightOrigin;
  d.views={front:{art:d.art.front,origin:d.origin,face:d.face,nails:d.nails},
    left:{...s.left,art:d.art.left},
    right:{...s.left,art:d.art.right,origin:rightOrigin,face:rf,arm:s.left.arm&&mp(s.left.arm),
      nails:s.left.nails&&{...s.left.nails,fingers:me(s.left.nails.fingers),toes:me(s.left.nails.toes)}},
    back:{...s.back,art:d.art.back}};
  const sc=SCALP_REGION[doll];
  d.views.front.scalp=sc.front;d.views.left.scalp=sc.left;d.views.right.scalp=mp(sc.left);d.views.back.scalp=sc.back;
}
/* every hair style gets its scalp underlayer flow (right = mirrored left unless given) */
for(const it of items)if(it.category==='hair')for(const doll of it.dolls){
  const f=SCALP_FLOW[it.id]?.[doll],M=MIRROR[doll];if(!f)continue;
  for(const view of ['front','left','back'])if(f[view]&&it.fit[doll]?.[view])it.fit[doll][view].scalp=f[view];
  const r=f.right||(f.left&&{...f.left,to:f.left.to.map(([x,y])=>[M-x,y]),part:f.left.part===undefined?undefined:M-f.left.part,region:f.left.region&&f.left.region.map(([x,y])=>[M-x,y])});
  if(r&&it.fit[doll]?.right)it.fit[doll].right={...it.fit[doll].right,scalp:r};
}

const byId={};
for(const it of items){it.name=it.name||names[it.id]||'';it.price=0;it.tints=it.tints||[original];byId[it.id]=it;}
const makeup={
  lips:[{id:'none',name:'Natural',dolls:['adult','little']},
    {id:'rose-nude',name:'Rose Nude',color:'#c9787a',strength:.55,dolls:['adult']},
    {id:'bubblegum',name:'Bubblegum Gloss',color:'#f56aa6',strength:.5,contrast:1.25,gloss:170,dolls:['adult']},
    {id:'cherry',name:'Cherry Red',color:'#cf2340',strength:.68,contrast:1.2,dolls:['adult']},
    {id:'berry',name:'Berry Crush',color:'#a03566',strength:.62,contrast:1.2,dolls:['adult']},
    {id:'peach-gloss',name:'Peach Gloss',color:'#f59a7c',strength:.55,gloss:165,dolls:['adult']},
    {id:'strawberry-tint',name:'Strawberry Tint',color:'#f0697e',strength:.32,gloss:185,dolls:['little']},
    {id:'cherry-gloss',name:'Cherry Gloss',color:'#e9415f',strength:.28,gloss:180,dolls:['little']}],
  blush:[{id:'none',name:'No blush',dolls:['adult','little']},
    {id:'peach',name:'Peach',color:'#ffa98a',strength:.32,dolls:['adult','little']},
    {id:'rose',name:'Rose',color:'#f58aa6',strength:.36,dolls:['adult','little']},
    {id:'berry',name:'Berry',color:'#d45d8d',strength:.3,dolls:['adult']}],
  shadow:[{id:'none',name:'No shadow',dolls:['adult','little']},
    {id:'pink',name:'Pink Frost',color:'#f19ac8',strength:.55,shimmer:'#ffd9ef',dolls:['adult']},
    {id:'lilac',name:'Lilac Dream',color:'#b58ae6',strength:.6,shimmer:'#eedcff',dolls:['adult']},
    {id:'gold',name:'Gold Shimmer',color:'#e8b860',strength:.5,shimmer:'#fff0b8',dolls:['adult']},
    {id:'aqua',name:'Aqua Splash',color:'#5ec9d6',strength:.5,shimmer:'#d9fbff',dolls:['adult']},
    {id:'bronze',name:'Bronze',color:'#9c5a3c',strength:.55,dolls:['adult']}],
  gem:[{id:'none',name:'Bare cheeks',dolls:['adult','little']},
    {id:'heart',name:'Rose heart',dolls:['adult','little']},
    {id:'star-freckles',name:'Star freckles',dolls:['adult','little']},
    {id:'glitter',name:'Glitter glow',dolls:['adult','little']},
    {id:'crystals',name:'Crystal tears',dolls:['adult','little']},
    {id:'butterfly',name:'Butterfly gem',dolls:['adult','little']}],
  nails:[{id:'none',name:'Bare nails',dolls:['adult','little']},
    {id:'bubblegum',name:'Bubblegum',color:'#ff5fa8',dolls:['adult']},
    {id:'cherry',name:'Cherry',color:'#d61f3c',dolls:['adult']},
    {id:'lilac',name:'Lilac',color:'#b48be8',dolls:['adult']},
    {id:'coral',name:'Coral',color:'#ff7a5c',dolls:['adult']},
    {id:'pearl',name:'Pearl White',color:'#fbeef0',dolls:['adult']}]
};
const hairColors=[
  {id:'espresso',name:'Espresso',swatch:'#3b2524'},
  {id:'jet',name:'Jet Black',swatch:'#1d1a22',stops:[[0,'#050407'],[.45,'#17141c'],[.8,'#3c3646'],[1,'#8c86a0']]},
  {id:'chestnut',name:'Chestnut',swatch:'#8a4a2c',stops:[[0,'#1f0d08'],[.4,'#5b2a17'],[.75,'#9a5531'],[1,'#e2a676']]},
  {id:'honey',name:'Honey Blonde',swatch:'#d9a45a',gamma:.62,stops:[[0,'#4a2e14'],[.4,'#a8733a'],[.75,'#ddb06a'],[1,'#fff2cc']]},
  {id:'strawberry',name:'Strawberry Blonde',swatch:'#e08a5e',gamma:.75,stops:[[0,'#4f1f12'],[.38,'#a84f30'],[.72,'#e5946a'],[1,'#ffdcc0']]},
  {id:'bubblegum',name:'Bubblegum Pink',swatch:'#f27ab6',gamma:.66,stops:[[0,'#6a1a46'],[.4,'#c9549a'],[.75,'#f792c6'],[1,'#ffe3f2']]},
  {id:'lilac',name:'Lilac',swatch:'#b79ae8',gamma:.66,stops:[[0,'#3e2e66'],[.4,'#8c76c6'],[.75,'#c6b2f0'],[1,'#f6f0ff']]}
];
const defaults={
  adult:{outfit:'hibiscus-flares',outfitTint:'original',shoes:'black-platform-sandals',shoesTint:'original',hair:'long-waves',hairColor:'espresso',earrings:'gold-hoops',earringsTint:'original',necklace:'pearl-starfish-necklace',clip:'hibiscus-clip',lips:'rose-nude',blush:'peach',shadow:'none',gem:'none',nails:'none',frame:0,sticker:0,backdrop:0},
  little:{outfit:'yellow-dot-dress',outfitTint:'original',shoes:'red-mary-janes',shoesTint:'original',hair:'ringlet-pigtails',hairColor:'espresso',earrings:'none',earringsTint:'original',necklace:'none',clip:'red-bow',lips:'none',blush:'rose',shadow:'none',gem:'none',nails:'none',frame:0,sticker:0,backdrop:0}
};
/* Old saves stored integer indexes into three baked pictures per doll. */
const legacy={
  outfit:{adult:[{outfit:'hibiscus-flares',shoes:'black-platform-sandals'},{outfit:'green-hibiscus-sundress',shoes:'lilac-mary-jane-heels'},{outfit:'pink-velour-cargo',outfitTint:'lilac',shoes:'pink-chunky-sneakers'}],
          little:[{outfit:'yellow-dot-dress',shoes:'red-mary-janes'},{outfit:'pink-gingham-bow-dress',shoes:'red-mary-janes'},{outfit:'denim-overalls',shoes:'white-velcro-sneakers'}]},
  clip:{adult:['hibiscus-clip','peach-blossom','satin-bow','gold-star'],little:['red-bow','peach-blossom','satin-bow','gold-star']},
  gem:['none','heart','star-freckles']
};
return {version:2,views:['front','left','right','back'],dolls,items:byId,itemList:items,makeup,hairColors,defaults,legacy,
  categories:['outfit','shoes','hair','earrings','necklace','clip'],
  optional:['shoes','earrings','necklace','clip']};
})();

/* ---------- display names in the current language ----------
   The English names written above are registered as i18n keys and every `name` becomes a getter, so
   all screens (and cached option lists) read the current language: catalog.item.<id>,
   catalog.tint.<slug of the English name> (one id can carry different names, e.g. "Lilac" and
   "Lilac denim"), catalog.hairColor.<id>, catalog.<lips|blush|shadow|gem|nails>.<id>. */
(function localizeCatalog(){
  const done=new WeakSet(),en={};
  const slug=s=>s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  const named=(obj,key)=>{
    if(done.has(obj))return;done.add(obj);
    en[key]=obj.name;
    Object.defineProperty(obj,'name',{get:()=>t(key),enumerable:true,configurable:true});
  };
  for(const it of CATALOG.itemList){
    named(it,'catalog.item.'+it.id);
    for(const tn of it.tints)if(!done.has(tn))named(tn,'catalog.tint.'+slug(tn.name));
  }
  for(const h of CATALOG.hairColors)named(h,'catalog.hairColor.'+h.id);
  for(const [field,list] of Object.entries(CATALOG.makeup))for(const o of list)named(o,`catalog.${field}.${o.id}`);
  for(const [id,d] of Object.entries(CATALOG.dolls))Object.defineProperty(d,'name',{get:()=>t('doll.'+id),enumerable:true,configurable:true});
  I18N.add('en',en);
})();

/* ---------- catalog helpers ---------- */
function catalogItem(id){return Object.hasOwn(CATALOG.items,id)?CATALOG.items[id]:null}
function itemName(id){return catalogItem(id)?.name||(id==='none'?t('none.item'):'')}
/* Items of a category the doll can wear (and that have art + fit for the view). */
function catalogOptions(category,doll,view='front'){
  return CATALOG.itemList.filter(it=>it.category===category&&it.dolls.includes(doll)&&(it.proc||it.stud||it.category==='clip'||it.fit?.[doll]?.[view]));
}
function makeupOptions(field,doll){return CATALOG.makeup[field].filter(o=>o.dolls.includes(doll))}
function hairColorOptions(){return CATALOG.hairColors}
function tintOptions(id){return catalogItem(id)?.tints||[]}
function defaultLook(doll){return {...CATALOG.defaults[doll==='little'?'little':'adult']}}
/* Validate any stored look (new string-id shape or the old integer shape) against the catalog.
   Unknown or unwearable values fall back to the doll's default, field by field. */
function readLook(raw,doll){
  doll=doll==='little'?'little':'adult';
  const v=raw&&typeof raw==='object'?{...raw}:{};
  const def=defaultLook(doll),out={};
  const int=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max?n:0;
  if(typeof v.outfit==='number'){ // legacy save: outfit 0-2, clip 0-3, gem 0-2
    const o=CATALOG.legacy.outfit[doll][int(v.outfit,2)];
    Object.assign(v,{outfitTint:'original',shoesTint:'original'},o,{
      clip:CATALOG.legacy.clip[doll][int(v.clip,3)],gem:CATALOG.legacy.gem[int(v.gem,2)]});
  }
  const wearable=(cat,id)=>{const it=catalogItem(id);return !!it&&it.category===cat&&catalogOptions(cat,doll).includes(it)};
  for(const cat of CATALOG.categories){
    const id=v[cat];
    out[cat]=id==='none'&&CATALOG.optional.includes(cat)?'none':wearable(cat,id)?id:def[cat];
  }
  for(const [field,item] of [['outfitTint','outfit'],['shoesTint','shoes'],['earringsTint','earrings']]){
    const tints=tintOptions(out[item]);out[field]=tints.some(t=>t.id===v[field])?v[field]:'original';
  }
  out.hairColor=CATALOG.hairColors.some(h=>h.id===v.hairColor)?v.hairColor:def.hairColor;
  for(const field of ['lips','blush','shadow','gem','nails'])
    out[field]=makeupOptions(field,doll).some(o=>o.id===v[field])?v[field]:(makeupOptions(field,doll).some(o=>o.id===def[field])?def[field]:'none');
  out.frame=int(v.frame,3);out.sticker=int(v.sticker,3);out.backdrop=int(v.backdrop,3);
  return out;
}
