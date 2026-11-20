// Living-scene data for scene-fx.js (HibiscusScenes). Generated from pixel-authored sources; coordinates are
// normalized image coordinates (0..1 of the picture's width / height). Displacements (motion shift / bend,
// water.px, wind.px, flow.len) and radii are in pixels of the scene's reference "size".
//
// Layer: {type, shapes, key, ...}
//   type     water (refraction + glints + ripples) | foam (breathing surf) | flow (waterfall, scrolls down) |
//            flicker (painted lights that glow) | stars (twinkle) | sway (displacement with "motion") |
//            wind (noise rustle) | parallax (pointer depth, "depth") | dapple (leaf-shadow light)
//   shapes   poly:[x,y,...] | polys:[[...]] | ellipse:[cx,cy,rx,ry] | rect:[x0,y0,x1,y1]; none = whole picture
//   feather  softens the shape edge (px); cut:[shapes] removes areas (cutFeather px)
//   key      colour key name (from keys below or the scene's keys) or inline spec list; not: key to exclude.
//            Spec fields are ANDed: h:[deg,deg] (may wrap), s:[0..1], v:[0..1], bmr:[blue-red], peak:[r,min]
//            (brighter than surroundings), dark:[r,min]; specs in a list are ORed.
//   grow / shrink / soften   dilate / erode / blur the keyed mask (px)
//   motion   {rotate:[cx,cy,deg]} | {shift:[dx,dy]} | {bend:[yAnchor,yTip,dx,dy]} (or a list, summed);
//            speed (rad/s) and phase (0..1) set the oscillation
// Supplied overlay art: scene.overlays = {water:'assets/scenes/fx/boardwalk-water.png', ...}. An overlay with
// the same name as a key replaces that key for this scene (its alpha, or its brightness if opaque, is the mask);
// shapes, motion and all other parameters still apply.
const HibiscusSceneData={"version":1,"keys":{"water":[{"h":[168,236],"s":[0.2,1],"v":[0.28,1]}],"foam":[{"v":[0.8,1],"s":[0,0.24],"bmr":[-0.03,1]}],"sky":[{"h":[192,245],"s":[0.1,1],"v":[0.5,1]},{"s":[0,0.3],"v":[0.83,1]}],"foliage":[{"h":[52,160],"s":[0.22,1],"v":[0.12,1]}],"magenta":[{"h":[295,352],"s":[0.3,1],"v":[0.3,1]}],"red":[{"h":[348,12],"s":[0.55,1],"v":[0.35,1]}],"cream":[{"h":[10,60],"s":[0.06,0.45],"v":[0.6,1]}],"awning":[{"h":[345,28],"s":[0.18,0.75],"v":[0.6,1]}],"terracotta":[{"h":[12,34],"s":[0.35,0.85],"v":[0.4,0.95]}]},"scenes":{
  "boardwalk":{"image":"assets/scenes/boardwalk.jpg","size":[1152,720],"mask":0.5,"water":{"px":1.3,"scale":26,"horizon":0.3917,"depth":0.2222,"stretch":3.2,"glint":0.75,"glintLum":0.55,"glintAt":0.42},"wind":{"px":1},"parallax":3,"rippleAspect":2.6,"foam":1,
   "layers":[
    {"name":"sea","type":"water","poly":[0.0313,0.3889,0.4861,0.3889,0.4861,0.4167,0.4618,0.4472,0.4531,0.5833,0.434,0.6222,0.1979,0.6278,0.0313,0.6278],"feather":4,"key":"water","shrink":3,"soften":5},
    {"name":"surf","type":"foam","poly":[0.1866,0.5167,0.408,0.5,0.4644,0.4444,0.4688,0.5833,0.4384,0.6278,0.1866,0.6278],"feather":10,"key":"foam","shrink":1,"soften":3,"motion":{"shift":[0,1.4]},"speed":0.75},
    {"name":"clouds","type":"sway","poly":[0,0,0.4861,0,0.4861,0.1944,0.4167,0.2361,0.3819,0.25,0.3472,0.25,0.2865,0.2986,0.2257,0.3639,0.204,0.3889,0,0.3889],"feather":6,"key":"sky","not":"magenta","shrink":2,"soften":8,"cut":[{"ellipse":[0.1632,0.3403,0.0399,0.0861]}],"cutFeather":16,"motion":{"shift":[6,0]},"speed":0.05},
    {"name":"sailboat","type":"sway","ellipse":[0.1632,0.3417,0.0451,0.0917],"feather":30,"motion":[{"rotate":[0.1632,0.4125,0.9]},{"shift":[0,0.9]}],"speed":1.05,"phase":0.2},
    {"name":"bougainvillea canopy","type":"sway","poly":[0,0,0.3819,0,0.3819,0.1806,0.2604,0.2083,0.1302,0.2083,0.0868,0.2917,0,0.2917],"feather":10,"key":["magenta","foliage","sky"],"soften":4,"motion":{"rotate":[-0.026,-0.0417,0.55]},"speed":1.25,"phase":0.1},
    {"name":"bougainvillea trunk side","type":"sway","poly":[0,0.1944,0.0868,0.2083,0.0911,0.4167,0.026,0.4306,0,0.4167],"feather":14,"key":["magenta","foliage"],"grow":2,"soften":4,"motion":{"rotate":[0.013,0.4583,0.5]},"speed":1.1,"phase":0.55},
    {"name":"bougainvillea at the rail","type":"sway","poly":[0.0347,0.4167,0.2274,0.4167,0.2274,0.6194,0.0347,0.6194],"feather":8,"key":["magenta","foliage"],"not":"cream","shrink":1,"soften":3,"motion":{"bend":[0.6194,0.4167,1.4,-0.3]},"speed":1.6,"phase":0.35},
    {"name":"palm fronds","type":"sway","poly":[0.4818,0,1,0,1,0.0347,0.9028,0.0764,0.8333,0.1042,0.7465,0.1042,0.6771,0.0972,0.6207,0.1944,0.5556,0.2083,0.5035,0.1736,0.4818,0.0972],"feather":12,"key":["foliage","sky"],"not":"awning","soften":4,"motion":{"rotate":[0.8767,-0.0625,-0.5]},"speed":0.95,"phase":0.8},
    {"name":"hill palm","type":"sway","ellipse":[0.5278,0.1611,0.0417,0.05],"feather":16,"key":["foliage","sky"],"soften":2,"motion":{"rotate":[0.5278,0.1667,1.6]},"speed":1.5,"phase":0.4},
    {"name":"hill palm 2","type":"sway","ellipse":[0.5017,0.2667,0.0347,0.0417],"feather":14,"key":["foliage","sky"],"soften":2,"motion":{"rotate":[0.5017,0.2722,-1.6]},"speed":1.35,"phase":0.7},
    {"name":"hillside","type":"wind","poly":[0.2127,0.2083,0.4861,0.125,0.625,0.1111,0.625,0.4167,0.2127,0.4167],"feather":20,"key":["foliage","magenta"],"shrink":1,"soften":2,"amount":0.7},
    {"name":"shell chimes","type":"sway","polys":[[0.6267,0.2583,0.6667,0.2583,0.6667,0.4194,0.6267,0.4194],[0.7188,0.2583,0.7795,0.2583,0.7795,0.4167,0.7188,0.4167]],"feather":6,"key":[{"v":[0.72,1],"s":[0,0.4]}],"grow":2,"soften":3,"motion":{"bend":[0.2639,0.4167,1.6,0]},"speed":1.9,"phase":0.6},
    {"name":"planter","type":"sway","poly":[0.5972,0.3639,0.6988,0.3639,0.6988,0.4972,0.5972,0.4972],"feather":10,"key":["magenta","foliage","red"],"not":"terracotta","soften":3,"motion":{"bend":[0.4972,0.3694,1.4,0]},"speed":1.7,"phase":0.9},
    {"name":"arch vines","type":"wind","poly":[0.5208,0.2083,0.612,0.2083,0.612,0.4167,0.5208,0.4167],"feather":10,"key":["magenta","foliage"],"soften":2},
    {"name":"far layer","type":"parallax","poly":[0.026,0,0.4861,0,0.4861,0.4,0.026,0.4],"feather":34,"not":"magenta","depth":1}],
   "lights":[{"kind":"star","at":[0.9583,0.2861],"r":16,"color":"#ffffff","i":0.55,"flicker":1},{"kind":"star","at":[0.8403,0.2972],"r":10,"color":"#fff6f0","i":0.4,"flicker":1},{"kind":"star","at":[0.8872,0.2722],"r":9,"color":"#fff6f0","i":0.35,"flicker":1},{"kind":"star","at":[0.7865,0.4167],"r":9,"color":"#fff6f0","i":0.35,"flicker":1},{"kind":"star","at":[0.7639,0.2944],"r":8,"color":"#fff6f0","i":0.3,"flicker":1}],
   "particles":[{"kind":"petal","n":7,"area":[0.0347,0.0139,0.3733,0.2083],"color":["#e8338f","#f25aa8","#d42c84"],"size":[6,9],"wind":[20,16],"life":10,"floor":0.9722,"scatter":110},{"kind":"gull","n":3,"area":[0.2257,0.0556,0.4861,0.1806],"color":"#fbfbfb","size":[10,14],"speed":9,"alpha":0.85},{"kind":"butterfly","n":1,"area":[0.5208,0.3333,0.7292,0.5833],"color":["#ffb347"],"size":[12,14],"scatter":120}]}}};
