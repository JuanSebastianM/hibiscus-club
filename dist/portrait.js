/* The preview and the exported postcard use the same drawing functions. */
const wardrobes = {
  adult: ['Hibiscus denim', 'Daisy sundress', 'Velour tracksuit'],
  little: ['Rosebud dress', 'Picnic gingham', 'Playtime overalls']
};
const clips = ['Original', 'Peach blossom', 'Satin bow', 'Golden star'];
const gems = ['Bare cheeks', 'Rose heart', 'Star freckles'];
const frames = ['Candy stripes', 'Lagoon blue', 'Lilac gingham', 'Golden hour'];
const frameColors = [['#fff1f6','#ffc1d9'],['#ecfff9','#aae8df'],['#f8f1ff','#d9c7f4'],['#fff6d9','#fbd56f']];
const images = new Map();
function asset(src) {
  if (!images.has(src)) images.set(src,new Promise((resolve,reject)=>{
    const img = new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>{images.delete(src);reject(new Error('Image unavailable'))};
    img.src=src;
  }));
  return images.get(src);
}
function drawCharm(ctx, style, x, y, size) {
  if (!style) return;
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(size,size);
  ctx.rotate(-0.19);
  ctx.shadowColor='rgba(58,21,54,.42)';
  ctx.shadowBlur=4;
  ctx.shadowOffsetY=2;
  ctx.lineJoin='round';
  ctx.strokeStyle='#fff5e7';
  ctx.lineWidth=.055;
  if(style===1) {
    for(let i=0;i<5;i++){
      ctx.rotate(Math.PI*2/5);
      ctx.beginPath();ctx.ellipse(0,-.39,.28,.39,0,0,Math.PI*2);
      ctx.fillStyle=['#ff8d91','#ffb394'][i%2];ctx.fill();ctx.stroke();
    }
    ctx.beginPath();ctx.arc(0,0,.19,0,Math.PI*2);ctx.fillStyle='#ffe577';ctx.fill();
  } else if(style===2) {
    ctx.fillStyle='#f75da4';ctx.beginPath();ctx.moveTo(0,0);
    ctx.bezierCurveTo(-.85,-.84,-1,.68,-.08,.16);
    ctx.bezierCurveTo(.9,.7,.9,-.85,0,0);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.arc(0,0,.16,0,Math.PI*2);ctx.fillStyle='#ffbedc';ctx.fill();
  } else {
    ctx.beginPath();
    for(let i=0;i<10;i++) {
      const a=-Math.PI/2+i*Math.PI/5,r=i%2?.35:.78;
      ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);
    }
    ctx.closePath();ctx.fillStyle='#ffcf4e';ctx.fill();ctx.stroke();
  }
  ctx.restore();
}
const clipPositions={adult:[[.434,.061],[.44,.09],[.44,.09]],little:[[.370,.082],[.375,.09],[.375,.09]]};
function drawCheekDetail(c,shot,x,y,width,height){
  if(!shot.gem)return;
  const adult=shot.doll==='adult';
  const px=x+width*(adult?.507:.445),py=y+height*(adult?.112:.25);
  c.save();c.translate(px,py);c.scale(width*.038,width*.038);
  c.shadowColor='#753d5a';c.shadowBlur=1;c.fillStyle=shot.gem===1?'#ec618b':'#ffdd90';
  if(shot.gem===1){
    c.beginPath();c.moveTo(0,.35);c.bezierCurveTo(-1,-.22,-.37,-.75,0,-.31);c.bezierCurveTo(.43,-.78,.9,-.19,0,.35);c.fill();
  }else{
    for(const [dx,dy,size] of [[-.42,0,.22],[0,-.2,.31],[.44,.05,.15]]){
      c.beginPath();c.moveTo(dx,dy-size);c.lineTo(dx+size*.5,dy);c.lineTo(dx,dy+size);c.lineTo(dx-size*.5,dy);c.closePath();c.fill();
    }
  }
  c.restore();
}
async function paintPortrait(canvas, shot, postcard=false) {
  const img=await asset('assets/'+shot.doll+'-'+shot.outfit+'.jpg');
  const w=canvas.width=postcard?640:480,h=canvas.height=postcard?860:720;
  const c=canvas.getContext('2d');
  const x=postcard?70:0,y=postcard?21:0,width=postcard?500:w,height=postcard?750:h;
  if(postcard){
    const colors=frameColors[shot.frame];
    c.fillStyle=colors[0];c.fillRect(0,0,w,h);c.fillStyle=colors[1];
    for(let i=-h;i<w;i+=32) {
      if(shot.frame===2){c.fillRect(i,0,14,h);c.fillRect(0,i,w,14);}
      else {c.beginPath();c.moveTo(i,0);c.lineTo(i+14,0);c.lineTo(i+h+14,h);c.lineTo(i+h,h);c.fill();}
    }
    c.fillStyle='#fffefa';c.fillRect(x-9,y-9,width+18,h-y-19);
  }
  c.drawImage(img,x,y,width,height);
  const pos=clipPositions[shot.doll][shot.outfit];
  drawCharm(c,shot.clip,x+pos[0]*width,y+pos[1]*height,width*.108);
  drawCheekDetail(c,shot,x,y,width,height);
  if(postcard){
    drawCharm(c,shot.sticker,x+width-16,y+height-30,60);
    c.fillStyle='#7a305e';c.font='italic bold 32px Georgia';c.textAlign='center';
    c.fillText(wardrobes[shot.doll][shot.outfit],w/2,809);
    c.fillStyle='#965677';c.font='15px Trebuchet MS, sans-serif';
    c.fillText('HIBISCUS ISLAND   ✦   '+(shot.doll==='adult'?'GROWN-UP':'LITTLE ME'),w/2,836);
  }
}
