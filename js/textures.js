/* ============================================================
   Лиственница — процедурные природные текстуры (canvas → THREE)
   Дерево, камень, кирпич, штукатурка, бетон, плитка, металл,
   ткань, стекло. Без внешних изображений: нет проблем с правами
   и лишним сетевым трафиком. Текстуры кэшируются и очищаются.
   ============================================================ */
(function(){
'use strict';
const CACHE=new Map();

function mulberry(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}

function panel(w,h,draw,seed){
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');draw(g,w,h,mulberry(seed||7));
  return c;
}
/* лёгкий шум поверх всего холста */
function noise(g,w,h,rnd,amt){
  const img=g.getImageData(0,0,w,h),d=img.data;
  for(let i=0;i<d.length;i+=4){const n=(rnd()-.5)*amt;d[i]+=n;d[i+1]+=n;d[i+2]+=n}
  g.putImageData(img,0,0);
}
function shade(hex,f){ // умножить яркость цвета
  const n=parseInt(hex.slice(1),16),r=Math.min(255,(n>>16)*f)|0,gg=Math.min(255,((n>>8)&255)*f)|0,b=Math.min(255,(n&255)*f)|0;
  return `rgb(${r},${gg},${b})`;
}

/* ---- дерево: вертикальные доски (фасад) ---- */
function woodVertical(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    const planks=6,pw=w/planks;
    for(let p=0;p<planks;p++){
      const x=p*pw,tone=.9+rnd()*.2;
      g.fillStyle=shade(base,tone);g.fillRect(x,0,pw-1.5,h);
      // волокна
      g.strokeStyle='rgba(0,0,0,.10)';g.lineWidth=1;
      for(let f=0;f<7;f++){const fx=x+2+rnd()*(pw-5);
        g.beginPath();g.moveTo(fx,0);
        for(let y=0;y<=h;y+=32)g.lineTo(fx+Math.sin(y*.05+f)*1.6,y);
        g.stroke();}
      // сучки
      if(rnd()>.6){const kx=x+pw*.5,ky=rnd()*h;
        g.fillStyle='rgba(60,38,18,.35)';g.beginPath();g.ellipse(kx,ky,3.2,4.6,0,0,7);g.fill();
        g.strokeStyle='rgba(60,38,18,.22)';g.beginPath();g.ellipse(kx,ky,6,8,0,0,7);g.stroke();}
      // тень стыка
      g.fillStyle='rgba(0,0,0,.22)';g.fillRect(x+pw-1.5,0,1.5,h);
      g.fillStyle='rgba(255,255,255,.06)';g.fillRect(x+1,0,1,h);
    }
    noise(g,w,h,rnd,14);
  },seed);
}
/* ---- дерево: горизонтальный планкен ---- */
function woodHorizontal(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    const rows=8,rh=h/rows;
    for(let p=0;p<rows;p++){
      const y=p*rh,tone=.88+rnd()*.22;
      g.fillStyle=shade(base,tone);g.fillRect(0,y,w,rh-1.5);
      g.strokeStyle='rgba(0,0,0,.08)';g.lineWidth=1;
      for(let f=0;f<5;f++){const fy=y+2+rnd()*(rh-5);
        g.beginPath();g.moveTo(0,fy);
        for(let x=0;x<=w;x+=40)g.lineTo(x,fy+Math.sin(x*.04+f)*1.2);
        g.stroke();}
      g.fillStyle='rgba(0,0,0,.20)';g.fillRect(0,y+rh-1.5,w,1.5);
    }
    noise(g,w,h,rnd,12);
  },seed);
}
/* ---- паркет/доска пола ---- */
function woodFloor(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    const rows=5,rh=h/rows;
    for(let r0=0;r0<rows;r0++){
      const y=r0*rh,off=rnd()*w*.5;
      let x=-off;
      while(x<w){
        const pw=60+rnd()*90,tone=.86+rnd()*.26;
        g.fillStyle=shade(base,tone);g.fillRect(x+1,y+1,Math.min(pw,w-x)-2,rh-2);
        g.strokeStyle='rgba(0,0,0,.07)';
        for(let f=0;f<3;f++){const fy=y+3+rnd()*(rh-6);
          g.beginPath();g.moveTo(x+2,fy);for(let xx=x+2;xx<x+pw&&xx<w;xx+=24)g.lineTo(xx,fy+Math.sin(xx*.06)*1.1);g.stroke();}
        x+=pw;
      }
      g.fillStyle='rgba(0,0,0,.16)';g.fillRect(0,y,w,1.5);
    }
    noise(g,w,h,rnd,10);
  },seed);
}
/* ---- камень: известняк/песчаник ---- */
function stoneTex(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    // мягкие тёплые пятна
    for(let i=0;i<60;i++){const x=rnd()*w,y=rnd()*h,r=6+rnd()*26;
      g.fillStyle=`rgba(${rnd()>.5?'255,255,250':'90,80,60'},${.03+rnd()*.05})`;
      g.beginPath();g.ellipse(x,y,r,r*.6,rnd()*3,0,7);g.fill();}
    // прожилки
    g.strokeStyle='rgba(120,105,80,.16)';g.lineWidth=1.4;
    for(let v=0;v<4;v++){let x=rnd()*w,y=0;g.beginPath();g.moveTo(x,y);
      while(y<h){x+=(rnd()-.5)*26;y+=18+rnd()*20;g.lineTo(x,y)}g.stroke();}
    noise(g,w,h,rnd,16);
  },seed);
}
/* ---- кирпич ---- */
function brickTex(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle='#cfc6b4';g.fillRect(0,0,w,h); // раствор
    const bh=24,bw=56,gap=3;
    for(let row=0;row<bh!=0&&row*bh<h;row++){
      const y=row*bh,off=(row%2)*(bw/2);
      for(let x=-bw;x<w+bw;x+=bw){
        const tone=.82+rnd()*.3;
        g.fillStyle=shade(base,tone);
        g.fillRect(x+off+gap/2,y+gap/2,bw-gap,bh-gap);
        g.fillStyle=`rgba(0,0,0,${.04+rnd()*.08})`;g.fillRect(x+off+gap/2,y+gap/2,bw-gap,bh-gap);
      }
    }
    noise(g,w,h,rnd,18);
  },seed);
}
/* ---- матовая штукатурка ---- */
function plasterTex(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    for(let i=0;i<120;i++){const x=rnd()*w,y=rnd()*h,r=4+rnd()*20;
      g.fillStyle=`rgba(${rnd()>.5?'255,255,255':'70,66,58'},${.02+rnd()*.035})`;
      g.beginPath();g.arc(x,y,r,0,7);g.fill();}
    // следы терки
    g.strokeStyle='rgba(255,255,255,.05)';g.lineWidth=6;
    for(let i=0;i<10;i++){g.beginPath();const y=rnd()*h;g.moveTo(0,y);g.bezierCurveTo(w*.3,y+(rnd()-.5)*30,w*.7,y+(rnd()-.5)*30,w,y+(rnd()-.5)*20);g.stroke();}
    noise(g,w,h,rnd,9);
  },seed);
}
/* ---- бетон ---- */
function concreteTex(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    for(let i=0;i<40;i++){const x=rnd()*w,y=rnd()*h,r=10+rnd()*40;
      g.fillStyle=`rgba(${rnd()>.5?'255,255,255':'40,42,40'},${.02+rnd()*.04})`;
      g.beginPath();g.ellipse(x,y,r,r*.7,0,0,7);g.fill();}
    // поры
    for(let i=0;i<260;i++){g.fillStyle=`rgba(30,32,30,${.05+rnd()*.1})`;g.fillRect(rnd()*w,rnd()*h,1.4,1.4);}
    // опалубочные швы
    g.fillStyle='rgba(0,0,0,.10)';g.fillRect(0,h*.5-1,w,2);g.fillRect(w*.5-1,0,2,h);
    noise(g,w,h,rnd,14);
  },seed);
}
/* ---- керамическая плитка ---- */
function tileTex(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle='#d8d5cc';g.fillRect(0,0,w,h);
    const n=3,tw=w/n,gap=4;
    for(let i=0;i<n;i++)for(let j=0;j<n;j++){
      const tone=.94+rnd()*.1;
      g.fillStyle=shade(base,tone);g.fillRect(i*tw+gap/2,j*tw+gap/2,tw-gap,tw-gap);
      // блиск глазури
      const gr=g.createLinearGradient(i*tw,j*tw,i*tw+tw,j*tw+tw);
      gr.addColorStop(0,'rgba(255,255,255,.10)');gr.addColorStop(.5,'rgba(255,255,255,0)');gr.addColorStop(1,'rgba(0,0,0,.05)');
      g.fillStyle=gr;g.fillRect(i*tw+gap/2,j*tw+gap/2,tw-gap,tw-gap);
    }
    noise(g,w,h,rnd,7);
  },seed);
}
/* ---- тёмный металл ---- */
function metalTex(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    for(let i=0;i<400;i++){const y=rnd()*h;
      g.strokeStyle=`rgba(255,255,255,${.015+rnd()*.03})`;g.beginPath();g.moveTo(0,y);g.lineTo(w,y+(rnd()-.5)*3);g.stroke();}
    noise(g,w,h,rnd,8);
  },seed);
}
/* ---- ткань (лён) ---- */
function fabricTex(base,seed){
  return panel(256,256,(g,w,h,rnd)=>{
    g.fillStyle=base;g.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=4){g.fillStyle=`rgba(0,0,0,${.03+rnd()*.03})`;g.fillRect(0,y,w,1.6)}
    for(let x=0;x<w;x+=4){g.fillStyle=`rgba(255,255,255,${.03+rnd()*.04})`;g.fillRect(x,0,1.6,h)}
    noise(g,w,h,rnd,10);
  },seed);
}

const DRAWERS={
  woodV:(c,s)=>woodVertical(c,s), woodH:(c,s)=>woodHorizontal(c,s), floor:(c,s)=>woodFloor(c,s),
  stone:(c,s)=>stoneTex(c,s), brick:(c,s)=>brickTex(c,s), plaster:(c,s)=>plasterTex(c,s),
  conc:(c,s)=>concreteTex(c,s), tile:(c,s)=>tileTex(c,s), metal:(c,s)=>metalTex(c,s),
  fabric:(c,s)=>fabricTex(c,s), plain:null
};

/* Возвращает CanvasTexture для THREE (или null для «plain»). */
function texture(kind,color,repeatMeters,seed){
  if(!DRAWERS[kind])return null;
  const key=kind+'|'+color+'|'+(repeatMeters||0)+'|'+(seed||7);
  const T=(typeof THREE!=='undefined')?THREE:null;
  if(!T)return null;
  if(CACHE.has(key))return CACHE.get(key);
  const canvas=DRAWERS[kind](color,seed||7);
  const t=new T.CanvasTexture(canvas);
  t.wrapS=t.wrapT=T.RepeatWrapping;
  const rep=(repeatMeters||2.4)/256*64; // условный масштаб: текстура ≈ 1.5 м
  t.repeat.set(Math.max(.2,(repeatMeters||1.5)/1.5),Math.max(.2,(repeatMeters||1.5)/1.5));
  t.anisotropy=4;t.needsUpdate=true;
  CACHE.set(key,t);
  return t;
}
/* Превью для HTML-карточек: dataURL маленького образца. */
function swatchDataURL(kind,color,size){
  const d=DRAWERS[kind];
  const c=d?d(color,11):null;
  if(!c){ // plain / unknown: ровный цвет
    const p=document.createElement('canvas');p.width=p.height=size||64;
    const g=p.getContext('2d');g.fillStyle=color;g.fillRect(0,0,p.width,p.height);
    return p.toDataURL();
  }
  const p=document.createElement('canvas');p.width=p.height=size||64;
  p.getContext('2d').drawImage(c,0,0,c.width,c.height,0,0,p.width,p.height);
  return p.toDataURL();
}
function disposeTextures(){CACHE.forEach(t=>{try{t.dispose()}catch(e){}});CACHE.clear()}

window.LT_Tex={texture,swatchDataURL,disposeTextures,panel};
})();
