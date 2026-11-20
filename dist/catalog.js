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
              only these doll-local regions again in front), cut:[sprite polys], clip:{x,y,rot,scale}
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
               limb([[345,36],[241,30],[235,90],[231,130],[239,165],[279,312],[345,330]],[267,50],[312,300],[306,196],[372,470],1.4,{under:true,cut:[[345,36],[263,36],[255,90],[247,130],[249,165],[283,312],[345,330]]})]}],
      skin:[{rect:[100,168,200,50]}],behind:[{poly:[[140,120],[260,120],[257,184],[246,195],[154,195],[143,184]]}]}}}},
  {id:'green-hibiscus-sundress',category:'outfit',dolls:['adult'],art:art('outfits-adult','green-hibiscus-sundress'),
    tints:[original,H('sky','Sky','#9cc9ee',[70,175],205),H('lavender','Lavender','#c3aee8',[70,175],268)],
    fit:{adult:{front:{pieces:[{part:'main',warp:[[12,182,99,134,231,265],[60,242,101,124,230,276],[84,262.0,90,106.2,240,293.8],[98,275.2,92,108.8,237,290.0],[112,288.4,98,116.2,232,283.8],[126,301.7,103,121.5,227,276.5],[140,314.9,107,126.5,223,271.5],[154,328.1,110,130.2,220,267.8],[168,345.6,109,130.0,221,270.0],[182,363.9,103,119.0,227,280.0],[196,382.1,95,108.7,234,289.0],[210,400.4,87,100.7,242,296.0],[224,418.6,80,92.8,248,302.8],[238,436.8,73,83.5,255,311.0],[252,455.1,66,74.8,261,318.5],[266,473.3,60,67.8,266,325.2],[280,491.5,55,61.5,271,331.5],[294,509.8,50,55.2,277,339.0],[308,528.0,44,47.8,281,344.0],[322,546.3,39,41.0,286,349.8],[336,564.5,34,34.8,290,354.8],[350,582.7,29,28.5,295,361.0],[364,601.0,24,22.2,299,366.0],[378,619.2,20,17.2,303,371.0],[392,637.5,16,12.2,308,377.2],[406,655.7,11,5.5,311,380.5],[420,673.9,7,0.5,315,385.5],[434,692.2,3,-4.5,320,391.8],[448,707.5,30,29.8,308,377.2],[462,720.6,47,50.5,277,338.0],[476,733.8,120,141.8,197,238.0]]}],
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
  {id:'black-platform-sandals',category:'shoes',dolls:['adult'],art:art('shoes-adult','black-platform-sandals',['left','right']),
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
    fit:{adult:{front:hf('long-waves',[150,250,36],1,{backFill:{sx:.62,dy:6},clip:{x:160,y:36,rot:-25}})},
         little:{front:hf('long-waves',[124,278,58],1,{backFill:{sx:.62,dy:6},clip:{x:140,y:60,rot:-25}})}}},
  {id:'side-ponytail',category:'hair',dolls:['adult','little'],art:art('hair','side-ponytail'),
    fit:{adult:{front:hf('side-ponytail',[150,266,36],.95,{backFill:{sx:.7,dy:4},clip:{x:244,y:28,rot:20}})},
         little:{front:hf('side-ponytail',[124,292,58],.95,{backFill:{sx:.7,dy:4},clip:{x:266,y:48,rot:20}})}}},
  {id:'half-up-curls',category:'hair',dolls:['adult','little'],art:art('hair','half-up-curls'),
    fit:{adult:{front:hf('half-up-curls',[150,250,36],1,{backFill:{sx:.62,dy:6},clip:{x:166,y:28,rot:-20}})},
         little:{front:hf('half-up-curls',[124,278,58],1,{backFill:{sx:.62,dy:6},clip:{x:146,y:46,rot:-20}})}}},
  {id:'ringlet-pigtails',category:'hair',dolls:['adult','little'],art:art('hair','ringlet-pigtails'),
    fit:{adult:{front:hf('ringlet-pigtails',[138,262,30],1,{clip:{x:146,y:8,rot:-20}})},
         little:{front:hf('ringlet-pigtails',[112,290,52],1,{clip:{x:132,y:22,rot:-20}})}}},
  {id:'curly-buns',category:'hair',dolls:['adult','little'],art:art('hair','curly-buns'),
    fit:{adult:{front:hf('curly-buns',[146,254,34],1,{clip:{x:150,y:16,rot:-20}})},
         little:{front:hf('curly-buns',[120,282,56],1,{clip:{x:130,y:32,rot:-20}})}}},
  {id:'curly-bob',category:'hair',dolls:['adult','little'],art:art('hair','curly-bob'),
    fit:{adult:{front:hf('curly-bob',[146,254,34],1,{backFill:{sx:.72,dy:4},clip:{x:176,y:24,rot:-15}})},
         little:{front:hf('curly-bob',[120,282,56],1,{backFill:{sx:.72,dy:4},clip:{x:154,y:48,rot:-15}})}}},
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
    fit:{adult:{front:{x:142,y:142,w:116,h:73,keep:[[[0,138],[443,138],[443,304],[0,304]]]}},little:{front:{x:141,y:180,w:120,h:76,keep:[[[0,138],[443,138],[443,304],[0,304]]]}}}},
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
return {version:2,views:['front'],dolls,items:byId,itemList:items,makeup,hairColors,defaults,legacy,
  categories:['outfit','shoes','hair','earrings','necklace','clip'],
  optional:['shoes','earrings','necklace','clip']};
})();

/* ---------- catalog helpers ---------- */
function catalogItem(id){return Object.hasOwn(CATALOG.items,id)?CATALOG.items[id]:null}
function itemName(id){return catalogItem(id)?.name||(id==='none'?'None':'')}
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
