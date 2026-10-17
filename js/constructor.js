/* ============================================================
   Лиственница — 3D-конструктор (модуль)
   Единый источник данных: глобальный объект window.S (комнаты,
   фасад, полы, крыша, проёмы, мебель). Интерфейс, 2D-план,
   3D-сцена и расчёт стоимости читают одни и те же данные.

   Модуль НЕ трогает авторизацию/Supabase: наружу отдаёт только
   LT_* функции для index.html. Подключается ПОСЛЕ объявления
   S в index.html.
   ============================================================ */
(function(){
'use strict';

/* ---------- helpers ---------- */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
let tt=null;
function toast(t){const o=document.getElementById('toast');if(!o)return;o.textContent=t;o.style.opacity=1;clearTimeout(tt);tt=setTimeout(()=>o.style.opacity=0,3000)}
window.LT_toast=toast;
function markDirty(){if(window.LT_markDirty)LT_markDirty()}

/* ============================================================
   БИБЛИОТЕКА МАТЕРИАЛОВ (единая для фасада, крыши, полов, стен)
   p = ₽/м² — та же модель ценообразования, что и в исходном
   расчёте (наружные стены и пол считаются по площади комнат).
   ============================================================ */
const MATERIALS=[
 // --- дерево (фасад) ---
 {id:'woodV',cat:'Дерево',name:'Лиственница, вертикальная обшивка',desc:'Тёплый натуральный планкен',color:'#b9834a',tex:'woodV',target:'facade',p:0},
 {id:'woodH',cat:'Дерево',name:'Лиственница, горизонтальная обшивка',desc:'Современный горизонтальный ритм',color:'#c08d55',tex:'woodH',target:'facade',p:4000},
 {id:'woodDark',cat:'Дерево',name:'Термодерева, графит',desc:'Тёмная облицовка, брашированный дуб',color:'#4a423c',tex:'woodV',target:'facade',p:9000},
 {id:'oakFloor',cat:'Дерево',name:'Дуб, половая доска',desc:'Натуральный массив',color:'#b58b57',tex:'floor',target:'floor',p:4000},
 {id:'nutFloor',cat:'Дерево',name:'Орех, тонированный',desc:'Глубокий тёмный оттенок',color:'#5b4030',tex:'floor',target:'floor',p:7000},
 {id:'ashFloor',cat:'Дерево',name:'Ясень светлый',desc:'Скандинавский выбеленный пол',color:'#cdb491',tex:'floor',target:'floor',p:5200},
 // --- камень / кирпич ---
 {id:'stone',cat:'Камень',name:'Известняк светлый',desc:'Природный камень тёплого тона',color:'#d9d6cc',tex:'stone',target:'facade',p:9000},
 {id:'sandStone',cat:'Камень',name:'Песчаник',desc:'Мягкий песочный оттенок',color:'#cbb289',tex:'stone',target:'facade',p:11000},
 {id:'brick',cat:'Камень',name:'Кирпич ручной формовки',desc:'Насыщенный терракотовый',color:'#a4553d',tex:'brick',target:'facade',p:12000},
 {id:'stoneTile',cat:'Камень',name:'Каменный керамогранит',desc:'Для полов и мокрых зон',color:'#b9b2a4',tex:'tile',target:'floor',p:4600},
 // --- штукатурка ---
 {id:'plasterW',cat:'Штукатурка',name:'Матовая штукатурка, льняная',desc:'Светлая «дышащая» поверхность',color:'#e9e4d8',tex:'plaster',target:'facade',p:6000},
 {id:'plasterG',cat:'Штукатурка',name:'Штукатурка «графит»',desc:'Тёмная современная облицовка',color:'#565c58',tex:'plaster',target:'facade',p:8000},
 {id:'plasterInt',cat:'Штукатурка',name:'Интерьерная штукатурка',desc:'Тёплый белый, сатин',color:'#f1ede3',tex:'plaster',target:'interior',p:2500},
 // --- бетон ---
 {id:'conc',cat:'Бетон',name:'Бетон, шлифованный',desc:'Лофт-пол без лишней отделки',color:'#8d9296',tex:'conc',target:'floor',p:1500},
 {id:'concWall',cat:'Бетон',name:'Бетон опалубочный',desc:'Архитектурный бетон стен',color:'#9aa0a2',tex:'conc',target:'facade',p:7000},
 // --- плитка ---
 {id:'tile',cat:'Плитка',name:'Керамическая плитка, молочная',desc:'Практичная поверхность мокрых зон',color:'#cfd3d6',tex:'tile',target:'floor',p:3000},
 {id:'tileDark',cat:'Плитка',name:'Плитка «графит» крупноформатная',desc:'Сдержанный тёмный пол',color:'#5f6260',tex:'tile',target:'floor',p:3800},
 // --- металл (окна/двери/каркас) ---
 {id:'aluBlack',cat:'Металл',name:'Алюминий, чёрный матовый',desc:'Рамы окон и дверей',color:'#2e3230',tex:'metal',target:'frames',p:0},
 {id:'aluBronze',cat:'Металл',name:'Алюминий, бронза',desc:'Тёплые металлические рамы',color:'#7a5c3e',tex:'metal',target:'frames',p:15000},
 {id:'aluWhite',cat:'Металл',name:'Алюминий, светлый',desc:'Лаконтичные белые рамы',color:'#d8d8d4',tex:'metal',target:'frames',p:12000},
 // --- стекло ---
 {id:'glassClear',cat:'Стекло',name:'Стекло, просветлённое',desc:'Низкоэмиссионное, почти нейтральное',color:'#cfe0dd',tex:null,target:'glass',p:0},
 {id:'glassWarm',cat:'Стекло',name:'Стекло тонированное, тёплое',desc:'Лёгкая бронзовая защита от солнца',color:'#d8c4a8',tex:null,target:'glass',p:9000},
 // --- ткани ---
 {id:'linenSand',cat:'Текстиль',name:'Лён, песочный',desc:'Обивка и шторы природного тона',color:'#cfc3a5',tex:'fabric',target:'fabric',p:0},
 {id:'linenMoss',cat:'Текстиль',name:'Лён, мховый зелёный',desc:'Глубокий приглушённый акцент',color:'#6f7a60',tex:'fabric',target:'fabric',p:0},
];
const MAT=id=>MATERIALS.find(m=>m.id===id)||MATERIALS[0];
// совместимость с историей проектов: старые id материалов → новые
const LEGACY_WALL={wood:'woodV',dark:'plasterG',stone:'stone',brick:'brick'};
const LEGACY_FLOOR={oak:'oakFloor',tile:'tile',conc:'conc',nut:'nutFloor'};
const LEGACY_ROOF={flat:'#2e3230',gable:'#3b4448'};

/* Крыша: типы геометрии и цвета материалов */
const ROOF_TYPES={flat:{n:'Плоская кровля',p:0},gable:{n:'Двускатная кровля',p:120000}};
const ROOF_COLORS=[{id:'graphite',n:'Графит',c:'#333a37',p:0},{id:'forest',n:'Лесной зелёный',c:'#3d5043',p:18000},{id:'brown',n:'Коричневый',c:'#5c4634',p:18000}];

/* Проёмы: поддерживаемые типы */
const OPEN_TYPES={win:{n:'Окно',w:1.4,h:1.4,sill:.9,p:46000},pano:{n:'Панорамное окно',w:2.6,h:2.2,sill:.2,p:128000},door:{n:'Входная дверь',w:1.0,h:2.1,sill:0,p:68000},gdoor:{n:'Сдвидное остекление',w:3.0,h:2.3,sill:0,p:190000}};
const SIDE=['N','E','S','W']; // N=-z, E=+x, S=+z, W=-x

/* Мебель: категории, габариты (м), высота (м), цена (₽) */
const FLIST={
 sofa:{n:'Диван прямой',w:2.1,d:.92,h:.78,c:'#8a8378',ic:'🛋️',cat:'Гостиная',p:65000,tex:'fabric'},
 sofaCorner:{n:'Диван угловой',w:2.4,d:1.6,h:.78,c:'#7d7668',ic:'🛋️',cat:'Гостиная',p:98000,tex:'fabric'},
 armchair:{n:'Кресло',w:.85,d:.85,h:.8,c:'#b98a5a',ic:'🪑',cat:'Гостиная',p:28000,tex:'fabric'},
 tv:{n:'Телевизор с тумбой',w:1.2,d:.4,h:.95,c:'#2f3231',ic:'📺',cat:'Гостиная',p:55000},
 tableDine:{n:'Обеденный стол',w:1.6,d:.9,h:.75,c:'#a97c50',ic:'🍽️',cat:'Столы',p:42000,tex:'floor'},
 chair:{n:'Стул',w:.48,d:.5,h:.9,c:'#8d7356',ic:'💺',cat:'Столы',p:9000,tex:'floor'},
 coffeeTable:{n:'Журнальный столик',w:.9,d:.55,h:.42,c:'#9c8158',ic:'▬',cat:'Столы',p:16000,tex:'floor'},
 bedDouble:{n:'Кровать 160×200',w:1.6,d:2.05,h:.55,c:'#c7b6a5',ic:'🛏️',cat:'Спальня',p:78000,tex:'fabric'},
 bedSingle:{n:'Кровать 90×200',w:.9,d:2.0,h:.55,c:'#b7c0ad',ic:'🛏️',cat:'Спальня',p:42000,tex:'fabric'},
 nightstand:{n:'Тумба прикроватная',w:.5,d:.42,h:.5,c:'#8a7052',ic:'🕯️',cat:'Спальня',p:9000,tex:'floor'},
 wardrobe:{n:'Шкаф распашной',w:1.2,d:.6,h:2.05,c:'#6b5843',ic:'🚪',cat:'Хранение',p:62000,tex:'floor'},
 bookshelf:{n:'Стеллаж открытый',w:1.0,d:.32,h:1.9,c:'#7a5a3a',ic:'📚',cat:'Хранение',p:24000,tex:'floor'},
 desk:{n:'Письменный стол',w:1.2,d:.65,h:.75,c:'#9c8158',ic:'💻',cat:'Работа',p:26000,tex:'floor'},
 kitchen:{n:'Кухонный модуль',w:2.0,d:.62,h:2.1,c:'#7d9490',ic:'🍳',cat:'Кухня',p:180000},
 island:{n:'Кухонный остров',w:1.4,d:.8,h:.92,c:'#6e827e',ic:'▮',cat:'Кухня',p:96000},
 fridge:{n:'Холодильник',w:.7,d:.72,h:1.85,c:'#c9d2d3',ic:'🧊',cat:'Кухня',p:85000},
 sink:{n:'Раковина с тумбой',w:.62,d:.52,h:.85,c:'#cfd8da',ic:'🚰',cat:'Сантехника',p:22000},
 toilet:{n:'Унитаз',w:.42,d:.68,h:.42,c:'#e4e9ea',ic:'🚽',cat:'Сантехника',p:18000},
 bathtub:{n:'Ванна',w:1.7,d:.75,h:.5,c:'#dfe6e7',ic:'🛁',cat:'Сантехника',p:70000},
 shower:{n:'Душевая кабина',w:.9,d:.9,h:2.0,c:'#cfe0dd',ic:'🚿',cat:'Сантехника',p:88000,glass:1},
 lamp:{n:'Торшер',w:.35,d:.35,h:1.6,c:'#4c4a45',ic:'💡',cat:'Свет и декор',p:12000},
 pendant:{n:'Подвесной светильник',w:.4,d:.4,h:.5,c:'#3f4442',ic:'🔅',cat:'Свет и декор',p:8000,hang:1},
 plant:{n:'Растение в кашпо',w:.55,d:.55,h:1.3,c:'#5d7a5e',ic:'🌿',cat:'Свет и декор',p:6000},
 rug:{n:'Ковёр шерстяной',w:2.0,d:1.4,h:.02,c:'#cfc3a5',ic:'▭',cat:'Свет и декор',p:24000,tex:'fabric',flat:1},
};
const ROOM_FURN={liv:['sofa','sofaCorner','armchair','tv','tableDine','coffeeTable','bookshelf','lamp','plant','rug'],bed:['bedDouble','nightstand','wardrobe','desk','lamp','plant','rug'],kid:['bedSingle','wardrobe','desk','bookshelf','plant','rug'],kit:['kitchen','island','fridge','tableDine','chair'],bath:['sink','toilet','bathtub','shower'],off:['desk','bookshelf','armchair','lamp','plant'],hall:['wardrobe','sink'],wr:['wardrobe','bookshelf'],ter:['tableDine','chair','armchair','plant']};

/* Типы комнат (как в исходном проекте) */
const TYPES={liv:{n:'Гостиная',w:5,d:4},bed:{n:'Спальня',w:4,d:3},kit:{n:'Кухня',w:3,d:3,wet:1},bath:{n:'Ванная',w:2,d:2,wet:1},kid:{n:'Детская',w:3,d:3},off:{n:'Кабинет',w:3,d:3},hall:{n:'Прихожая',w:2,d:2},wr:{n:'Гардеробная',w:2,d:2},ter:{n:'Терраса',w:4,d:2,open:1}};

/* Пресеты готовых моделей: комнаты + проёмы + материалы */
const PRE={
 les:{wall:'woodV',roofType:'gable',rooms:[['liv',5,4],['kit',3,3],['bed',4,3],['bath',2,2],['hall',2,2]],opens:[['bed','S','win'],['liv','S','pano'],['kit','N','win']]},
 oz:{wall:'woodV',roofType:'gable',rooms:[['liv',6,4],['kit',4,3],['bed',4,3],['kid',3,3],['bath',3,2],['hall',2,2],['ter',4,2]],opens:[['liv','S','pano'],['bed','S','win'],['kid','E','win'],['kit','N','win'],['ter','S','gdoor']]},
 sem:{wall:'stone',roofType:'flat',rooms:[['liv',6,5],['kit',4,4],['bed',4,4],['kid',4,3],['off',3,3],['bath',3,2],['hall',3,2],['wr',2,2],['ter',5,2]],opens:[['liv','S','pano'],['bed','E','pano'],['kit','N','win'],['off','W','win'],['ter','S','gdoor']]}
};

/* ============================================================
   СОСТОЯНИЕ ПРОЕКТА — единый источник данных (window.S).
   S уже объявлен в index.html; дополняем полями новой
   функциональности, не ломая существующие.
   ============================================================ */
const S=window.S||(window.S={});
if(!S.rooms)S.rooms=[];
Object.assign(S,{wall:S.wall||'woodV',floor:S.floor||'oakFloor',roof:S.roof!==false,roofType:S.roofType||'gable',roofColor:S.roofColor||'graphite',frameMat:S.frameMat||'aluBlack',glassMat:S.glassMat||'glassClear',interiorWall:S.interiorWall||'plasterInt',fabricMat:S.fabricMat||'linenSand',opens:S.opens||[],canopy:!!S.canopy,steps:!!S.steps,env:S.env!==false,sel:S.sel||null});

/* ---------- undo/redo ---------- */
const HIST={undo:[],redo:[]};
let applying=false;
function snapshot(){return JSON.stringify({wall:S.wall,floor:S.floor,roof:S.roof,roofType:S.roofType,roofColor:S.roofColor,frameMat:S.frameMat,glassMat:S.glassMat,interiorWall:S.interiorWall,fabricMat:S.fabricMat,canopy:S.canopy,steps:S.steps,
 rooms:S.rooms.filter(r=>!r.gone).map(r=>({id:r.id,type:r.type,x:r.x,z:r.z,w:r.w,d:r.d,floorId:r.floorId||null,wallId:r.wallId||null,furn:(r.furn||[]).filter(f=>!f.dead).map(f=>({key:f.key,x:+(+f.x).toFixed(2),z:+(+f.z).toFixed(2),rot:!!f.rot}))})),
 opens:S.opens.map(o=>({...o}))})}
function pushHist(){if(applying)return;try{HIST.undo.push(snapshot());if(HIST.undo.length>80)HIST.undo.shift();HIST.redo.length=0;if(window.LT_onHistory)LT_onHistory()}catch(e){}}
function applySnap(js){
 applying=true;
 const d=JSON.parse(js);
 Object.assign(S,{wall:d.wall,floor:d.floor,roof:d.roof,roofType:d.roofType,roofColor:d.roofColor,frameMat:d.frameMat,glassMat:d.glassMat,interiorWall:d.interiorWall,fabricMat:d.fabricMat,canopy:d.canopy,steps:d.steps});
 const alive=new Set(d.rooms.map(r=>r.id));
 S.rooms.forEach(r=>{if(!alive.has(r.id)&&!r.gone){r.gone=true;dead.push(r)}});
 d.rooms.forEach(dr=>{
   let r=S.rooms.find(x=>x.id===dr.id&&!x.gone);
   if(!r){ // восстановить удалённую комнату с прежним id
     const T=TYPES[dr.type];if(!T)return;
     r=addRoomRaw(dr.type,dr.w,dr.d,dr.x,dr.z);r.id=dr.id;
     const idx=S.rooms.findIndex(x=>x.gone&&x!==r&&x.id===dr.id);
   }
   r.type=dr.type;r.x=dr.x;r.z=dr.z;r.w=dr.w;r.d=dr.d;
   r.floorId=dr.floorId||null;r.wallId=dr.wallId||null;
   r.furn=(dr.furn||[]).map(f=>window.LT_makeFurn(f.key,f.x,f.z,f.rot)).filter(Boolean);
   setFloor(r);applyRoomWall(r);drawLabel(r);rebuildOpenMeshes(r);rebuildFurnMeshes(r);
 });
 S.opens=d.opens;
 S.rooms.forEach(r=>{if(!r.gone)rebuildOpenMeshes(r)});
 updateCanopySteps();
 selOp=null;selFurn=null;
 if(S.sel&&S.sel.gone)S.sel=S.rooms.find(r=>!r.gone)||null;
 syncSceneMats();renderInteriorIfVisible();markDirty();
 applying=false;
 syncUI();
}
function renderInteriorIfVisible(){if(window.drawInterior)try{drawInterior()}catch(e){}}
function undo(){if(!HIST.undo.length)return toast('Нечего отменять');HIST.redo.push(snapshot());applySnap(HIST.undo.pop())}
function redo(){if(!HIST.redo.length)return toast('Нечего повторять');HIST.undo.push(snapshot());applySnap(HIST.redo.pop())}

/* ============================================================
   3D-СЦЕНА
   ============================================================ */
const GW=16,GD=12,H=2.7;
let R,scene,cam,el,stage,inited=false,uid=0,dead=[],drag=null,mode=null,pd=0,lw=0,lh=0;
let ray=null,plane=null,BOX;
let wallMat,roofMat,frameMat,glassMat,floorMats={},interiorMats={};
let envGroup,groundMesh,gridLines,skyMesh;
let selBox,outlineHelper=null;
let camGoal={th:.6,ph:1,d:24},camNow={th:.6,ph:1,d:24};
const P=new Map();
let MODE='layout'; // overview | exterior | layout | interior | materials
const viewState={ceilingHidden:true,wallHide:'auto'};

function tex(kind,color,rep){return window.LT_Tex?LT_Tex.texture(kind,color,rep):null}
function stdMat(color,texKind,opts){
 const o=Object.assign({roughness:.85,metalness:0},opts||{});
 const m=new THREE.MeshStandardMaterial(o);
 if(texKind){const t=tex(texKind,color,1.5);if(t)m.map=t;m.color.set(0xffffff)}else m.color.set(color);
 return m;
}

/* ---- окружение: земля, небо, ландшафт ---- */
function buildEnv(on){
 if(envGroup){scene.remove(envGroup);disposeGroup(envGroup);envGroup=null}
 if(!on)return;
 envGroup=new THREE.Group();
 // мягкая трава-диск
 const gc=document.createElement('canvas');gc.width=gc.height=256;const gg=gc.getContext('2d');
 const rad=gg.createRadialGradient(128,128,20,128,128,128);rad.addColorStop(0,'#7c9370');rad.addColorStop(.75,'#69765B');rad.addColorStop(1,'rgba(105,118,91,0)');
 gg.fillStyle='#8aa07b';gg.fillRect(0,0,256,256);gg.fillStyle=rad;gg.fillRect(0,0,256,256);
 for(let i=0;i<900;i++){gg.fillStyle=`rgba(${60+Math.random()*40|0},${90+Math.random()*40|0},${50+Math.random()*30|0},.25)`;gg.fillRect(Math.random()*256,Math.random()*256,2,2+Math.random()*3)}
 const gt=new THREE.CanvasTexture(gc);
 groundMesh=new THREE.Mesh(new THREE.CircleGeometry(46,48),new THREE.MeshStandardMaterial({map:gt,roughness:1}));
 groundMesh.rotation.x=-Math.PI/2;groundMesh.position.y=-.02;groundMesh.receiveShadow=true;envGroup.add(groundMesh);
 // дорожка к входу
 const path=new THREE.Mesh(new THREE.PlaneGeometry(1.6,9),stdMat('#c9c0ae',null,{roughness:.95}));
 path.rotation.x=-Math.PI/2;path.position.set(0,.005,GD/2+4.4);envGroup.add(path);
 // хвойные деревья (низкополигональные, лёгкие)
 const trunkM=new THREE.MeshStandardMaterial({color:0x5c4634,roughness:.95});
 const firM=new THREE.MeshStandardMaterial({color:0x365d4b,roughness:.92});
 const firM2=new THREE.MeshStandardMaterial({color:0x48705a,roughness:.92});
 const trG=new THREE.CylinderGeometry(.14,.2,1.1,6);const coG=new THREE.ConeGeometry(1,1.6,7);
 [[-13,-9],[-15,4],[-11,10],[12,-11],[15,2],[10,11],[17,-4],[-17,-2],[13,7],[-9,-13],[8,14],[-14,12]].forEach((p,i)=>{
   const g=new THREE.Group();
   const tr=new THREE.Mesh(trG,trunkM);tr.position.y=.55;g.add(tr);
   const mats=[firM,firM2];
   for(let k=0;k<3;k++){const c=new THREE.Mesh(coG,mats[(i+k)%2]);const sc=1-k*.22;
     c.scale.set(sc,sc*1.15,sc);c.position.y=1.5+k*1.05;c.castShadow=true;g.add(c)}
   g.position.set(p[0],0,p[1]);const s=.9+(i%4)*.25;g.scale.set(s,s,s);g.rotation.y=i;envGroup.add(g);
 });
 // валуны
 const rockM=new THREE.MeshStandardMaterial({color:0xa8a294,roughness:1});
 [[-8,8],[9,-7],[-6,-9]].forEach((p,i)=>{const r=new THREE.Mesh(new THREE.IcosahedronGeometry(.6+i*.15,0),rockM);
  r.position.set(p[0],.3,p[1]);r.scale.y=.7;r.castShadow=true;envGroup.add(r)});
 scene.add(envGroup);
}

/* ---- фон-градиент неба через CSS stage (лёгкий, без шейдеров) ---- */
function skyCSS(){
 stage.style.background='linear-gradient(180deg,#DCE6DF 0%,#C9D8CC 42%,#AEC3AE 72%,#9FB3A2 100%)';
}

/* ---- инициализация ---- */
function init(){
 BOX=new THREE.BoxGeometry(1,1,1);
 ray=new THREE.Raycaster();plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 el=document.getElementById('c3d');stage=document.getElementById('stage');
 R=new THREE.WebGLRenderer({canvas:el,antialias:true,alpha:true});
 R.setPixelRatio(Math.min(devicePixelRatio||1,2));
 R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;
 scene=new THREE.Scene();
 cam=new THREE.PerspectiveCamera(45,1,.1,220);
 // освещение: естественное, мягкие тени
 const hemi=new THREE.HemisphereLight(0xf3eee2,0x6b7a62,.85);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xfff2dd,1.05);sun.position.set(14,20,10);
 sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
 sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;
 sun.shadow.bias=-.0005;scene.add(sun);
 const fill=new THREE.DirectionalLight(0xdfe8ec,.3);fill.position.set(-10,8,-12);scene.add(fill);
 // строительная сетка участка (режим планировки)
 const pts=[];for(let i=0;i<=GW;i++)pts.push(i-GW/2,.14,-GD/2,i-GW/2,.14,GD/2);for(let j=0;j<=GD;j++)pts.push(-GW/2,.14,j-GD/2,GW/2,.14,j-GD/2);
 const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
 gridLines=new THREE.LineSegments(gg,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.5}));scene.add(gridLines);
 const gp=new THREE.Mesh(new THREE.PlaneGeometry(GW,GD),new THREE.MeshBasicMaterial({color:0xEDE9DE,transparent:true,opacity:.45}));
 gp.rotation.x=-Math.PI/2;gp.position.y=-.005;gp.receiveShadow=true;scene.add(gp);
 // общие материалы
 syncSceneMats(true);
 selBox=new THREE.LineSegments(new THREE.EdgesGeometry(BOX),new THREE.LineBasicMaterial({color:0xD5C5A5,depthTest:false,linewidth:2}));
 selBox.renderOrder=6;selBox.visible=false;scene.add(selBox);
 buildEnv(S.env);skyCSS();
 bindInput();bindHUD();
 loop();
}
function syncSceneMats(first){
 const wm=MAT(S.wall),rm=MAT(S.floor),fm=MAT(S.frameMat),gm=MAT(S.glassMat),im=MAT(S.interiorWall);
 const rc=ROOF_COLORS.find(c=>c.id===S.roofColor)||ROOF_COLORS[0];
 wallMat=stdMat(wm.color,wm.tex,{roughness:.82});
 roofMat=stdMat(rc.c,null,{roughness:.6,metalness:.25});
 frameMat=stdMat(fm.color,fm.tex,{roughness:.4,metalness:.6});
 glassMat=new THREE.MeshPhysicalMaterial({color:gm.color,roughness:.06,metalness:0,transparent:true,opacity:.32,transmission:0,side:THREE.DoubleSide});
 if(!first){S.rooms.forEach(r=>{applyFacade(r);setFloor(r);applyRoomWall(r);rebuildOpenMeshes(r)})}
 updateRoofGeom();
}

/* ---- комната: меш-структура ---- */
function addRoomRaw(type,w,d,px,pz){
 const T=TYPES[type];
 if(!inited){ // 3D ещё не загружен — комната хранится только в данных
   const r={id:++uid,type,x:px??0,z:pz??0,w,d,cw:w,cd:d,sc:1,gone:false,furn:[],opMeshes:[]};
   S.rooms.push(r);return r;
 }
 const r={id:++uid,type,x:px??0,z:pz??0,w,d,cw:w,cd:d,sc:0,g:new THREE.Group(),furn:[],opMeshes:[],furnG:new THREE.Group(),accG:new THREE.Group()};
 r.cx=r.x+w/2-GW/2;r.cz=r.z+d/2-GD/2;
 r.fl=new THREE.Mesh(BOX,new THREE.MeshStandardMaterial({roughness:.9}));
 r.ws=[0,1,2,3].map(()=>new THREE.Mesh(BOX,wallMat));
 r.rf=new THREE.Mesh(BOX,roofMat);
 r.gableL=null;r.gableR=null;
 drawLabel(r);
 r.g.add(r.fl,...r.ws,r.rf,r.lb,r.furnG,r.accG);scene.add(r.g);
 [r.fl,...r.ws].forEach(m=>m.userData.r=r);
 S.rooms.push(r);
 setFloor(r);applyFacade(r);applyRoomWall(r);buildOpeningsForRoom(r);updateRoofGeom(r);
 r.ws.forEach(m=>{m.castShadow=true;m.receiveShadow=true});r.fl.receiveShadow=true;
 return r;
}
function free(x,z,w,d,ex){return x>=0&&z>=0&&x+w<=GW&&z+d<=GD&&!S.rooms.some(o=>o!==ex&&!o.gone&&x<o.x+o.w&&o.x<x+w&&z<o.z+o.d&&o.z<z+d)}
function spot(w,d){let cx=GW/2,cz=GD/2;const n=S.rooms.filter(r=>!r.gone);if(n.length){cx=n.reduce((a,o)=>a+o.x+o.w/2,0)/n.length;cz=n.reduce((a,o)=>a+o.z+o.d/2,0)/n.length}
 let best=null,bd=1e9;for(let x=0;x<=GW-w;x++)for(let z=0;z<=GD-d;z++)if(free(x,z,w,d)){const q=(x+w/2-cx)**2+(z+d/2-cz)**2;if(q<bd){bd=q;best=[x,z]}}return best}
function addRoom(type,w,d,px,pz,extra){const T=TYPES[type];w=w||T.w;d=d||T.d;
 const p=(px!=null&&!isNaN(px)&&!isNaN(pz)&&free(px,pz,w,d))?[px,pz]:spot(w,d);
 if(!p){toast('На участке нет места. Уменьшите или удалите другую комнату.');return}
 const r=addRoomRaw(type,w,d,p[0],p[1]);
 if(extra){
   if(extra.floor&&MAT(extra.floor))r.floorId=extra.floor;
   else if(extra.floor&&LEGACY_FLOOR[extra.floor])r.floorId=LEGACY_FLOOR[extra.floor];
   (extra.opens||[]).forEach(o=>{if(TYPES[o.room]==null){}});
   r.furn=(extra.furn||[]).filter(f=>f&&FLIST[f.key]).slice(0,60).map(f=>{const b=FLIST[f.key],rot=!!f.rot,fw=rot?b.d:b.w,fd=rot?b.w:b.d;
     return{key:f.key,n:b.n,w:b.w,d:b.d,h:b.h,c:b.c,ic:b.ic,p:b.p,tex:b.tex,glass:b.glass,hang:b.hang,flat:b.flat,rot,rang:rot?Math.PI/2:0,sc:1,x:clamp(+f.x||0,0,Math.max(0,w-fw)),z:clamp(+f.z||0,0,Math.max(0,d-fd))}});
   rebuildFurnMeshes(r);
 }
 setFloor(r);select(r);pushHist();markDirty();
 return r;
}
function select(r){S.sel=r;syncUI()}

/* ---- применение материалов к комнате ---- */
function applyFacade(r){r.ws.forEach(m=>{m.material=wallMat})}
function setFloor(r){const T=TYPES[r.type];
 if(T.open){r.fl.material=stdMat('#8a6a44','floor',{roughness:.9});return}
 const fid=r.floorId||S.floor;
 if(!floorMats[fid]){const m=MAT(fid);floorMats[fid]=stdMat(m.color,m.tex,{roughness:.8})}
 r.fl.material=floorMats[fid];
}
function applyRoomWall(r){const T=TYPES[r.type];if(T.open)return;
 if(!r.inws){r.inws=[0,1,2,3].map(()=>{const m=new THREE.Mesh(BOX,new THREE.MeshStandardMaterial({roughness:.95,side:THREE.BackSide}));r.g.add(m);m.userData.r=r;m.userData.inner=1;return m});
  r.inws.forEach(m=>[r.fl,...r.ws].length);}
 const iid=r.wallId||S.interiorWall;
 if(!interiorMats[iid]){const m=MAT(iid);interiorMats[iid]=stdMat(m.color,m.tex,{roughness:.95})}
 r.inws.forEach(m=>m.material=interiorMats[iid]);
 updInner(r);
}
function updInner(r){if(!r.inws)return;const o=TYPES[r.type].open,t=.06,h=H*(r.sc||1);
 const [n,s,e,w]=r.inws;
 n.scale.set(r.cw-.1,h,t);n.position.set(0,h/2,-r.cd/2+t);s.scale.set(r.cw-.1,h,t);s.position.set(0,h/2,r.cd/2-t);
 e.scale.set(t,h,r.cd-.1);e.position.set(r.cw/2-t,h/2,0);w.scale.set(t,h,r.cd-.1);w.position.set(-r.cw/2+t,h/2,0);
 const showI=MODE==='interior'&&!o;r.inws.forEach(m=>m.visible=showI);
}

/* ---- проёмы (окна/двери) ---- */
function roomByNameOrId(op){return S.rooms.find(r=>!r.gone&&r.id===op.room)}
function openingsOf(r){return S.opens.filter(o=>o.room===r.id)}
function buildOpeningsForRoom(r){rebuildOpenMeshes(r)}
function openGeom(r,op){
 const T=OPEN_TYPES[op.type];if(!T)return null;
 const along=(op.side==='N'||op.side==='S')?'w':'d';
 const span=along==='w'?r.w:r.d;
 const ww=Math.min(T.w,Math.max(.6,span-.4));
 return{T,ww,along,span};
}
function rebuildOpenMeshes(r){
 (r.opMeshes||[]).forEach(m=>{r.g.remove(m);m.traverse(o=>{if(o.geometry&&o.geometry!==BOX)o.geometry.dispose()})});
 r.opMeshes=[];
 openingsOf(r).forEach(op=>{
   const g=openGeom(r,op);if(!g)return;const {T,ww,along}=g;
   const grp=new THREE.Group();
   const fr=.07;
   // рама: 4 бруска
   const mk=(sx,sy,sz,px,py,pz)=>{const m=new THREE.Mesh(BOX,frameMat);m.scale.set(sx,sy,sz);m.position.set(px,py,pz);m.userData.r=r;m.userData.op=op;grp.add(m);return m};
   mk(ww+fr*2,fr,.16,0,T.sill+T.h+fr/2,0);mk(ww+fr*2,fr,.16,0,T.sill-fr/2,0);
   mk(fr,T.h,.16,-ww/2-fr/2,T.sill+T.h/2,0);mk(fr,T.h,.16,ww/2+fr/2,T.sill+T.h/2,0);
   // стекло или полотно двери
   const infill=(op.type==='door')?stdMat('#4a3b2c','floor',{roughness:.7}):glassMat;
   const gl=new THREE.Mesh(BOX,infill);gl.scale.set(ww,T.h,.04);gl.position.set(0,T.sill+T.h/2,op.type==='door'?0.01:0);grp.add(gl);gl.userData.r=r;gl.userData.op=op;
   if(op.type==='door'){const hn=new THREE.Mesh(new THREE.SphereGeometry(.04,8,8),frameMat);hn.position.set(ww/2-.12,T.sill+1.0,.06);grp.add(hn)}
   // позиционирование на стене
   const off=op.off||0;
   const y=0;
   if(along==='w'){ // стена N/S
     grp.position.set(clamp(off,-(r.w-ww)/2,(r.w-ww)/2),y,op.side==='N'?-(r.d/2+.02):(r.d/2+.02));
     if(op.side==='N')grp.rotation.y=Math.PI;
   }else{
     grp.position.set(op.side==='E'?(r.w/2+.02):-(r.w/2+.02),y,clamp(off,-(r.d-ww)/2,(r.d-ww)/2));
     grp.rotation.y=op.side==='E'?Math.PI/2:-Math.PI/2;
   }
   grp.userData.opRef=op;
   r.g.add(grp);r.opMeshes.push(grp);
 });
}
function moveOpening(op,delta){
 const r=roomByNameOrId(op);if(!r)return false;
 const g=openGeom(r,op);if(!g)return false;
 const lim=(g.span-g.ww)/2;
 op.off=clamp((op.off||0)+delta,-lim,lim);
 rebuildOpenMeshes(r);return true;
}

 /* ---- крыша: тип геометрии ---- */
function updateRoofGeom(one){
 S.rooms.filter(r=>!r.gone).forEach(r=>{if(one&&r!==one)return;
   const o=TYPES[r.type].open;
   const flat=S.roofType==='flat';
   if(r.gableL){r.gableL.forEach(m=>{r.g.remove(m);m.geometry.dispose()});r.gableL=null}
   r.rf.visible=S.roof&&!o&&flat;
   if(!flat&&!o&&S.roof){
     // двускатная кровля: 2 ската + треугольные фронтоны
     const pw=r.cw,pd=r.cd,rise=.9,th=.12;
     const slopeLen=Math.hypot(pw/2,rise)+.3;
     const tri=new THREE.Shape();tri.moveTo(-pw/2+.05,0);tri.lineTo(pw/2-.05,0);tri.lineTo(0,rise);tri.closePath();
     const triG=new THREE.ExtrudeGeometry(tri,{depth:.14,bevelEnabled:false});
     const f1=new THREE.Mesh(triG,roofMat);f1.position.set(0,H*r.sc,-pd/2);
     const f2=new THREE.Mesh(triG,roofMat);f2.position.set(0,H*r.sc,pd/2-.14);
     const s1=new THREE.Mesh(BOX,roofMat);s1.scale.set(slopeLen,th,pd+.4);s1.position.set(-pw/4,H*r.sc+rise/2,0);s1.rotation.z=Math.atan2(rise,pw/2);
     const s2=new THREE.Mesh(BOX,roofMat);s2.scale.set(slopeLen,th,pd+.4);s2.position.set(pw/4,H*r.sc+rise/2,0);s2.rotation.z=-Math.atan2(rise,pw/2);
     [f1,f2,s1,s2].forEach(m=>{m.castShadow=true;m.userData.r=r});
     r.gableL=[f1,f2,s1,s2];r.g.add(...r.gableL);
   }
 });
}

/* ---- терраса-навес и ступени (экстерьер) ---- */
let canopyMesh=null,stepsMesh=null;
function houseBounds(){
 const rs=S.rooms.filter(r=>!r.gone&&!TYPES[r.type].open);
 if(!rs.length)return null;
 let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
 rs.forEach(r=>{minX=Math.min(minX,r.x);maxX=Math.max(maxX,r.x+r.w);minZ=Math.min(minZ,r.z);maxZ=Math.max(maxZ,r.z+r.d)});
 return{minX,maxX,minZ,maxZ,cx:(minX+maxX)/2-GW/2,cz:(minZ+maxZ)/2-GD/2,w:maxX-minX,d:maxZ-minZ,south:maxZ-GD/2};
}
function updateCanopySteps(){
 if(canopyMesh){scene.remove(canopyMesh);disposeGroup(canopyMesh);canopyMesh=null}
 if(stepsMesh){scene.remove(stepsMesh);disposeGroup(stepsMesh);stepsMesh=null}
 const bb=houseBounds();if(!bb)return;
 if(S.canopy){
   const g=new THREE.Group();const w=Math.min(bb.w*.6,5),dep=2.6,hgt=H+.15;
   const roof=new THREE.Mesh(BOX,roofMat);roof.scale.set(w,.1,dep);roof.position.set(0,hgt,bb.south+dep/2);roof.castShadow=true;g.add(roof);
   const postM=stdMat('#4a423c','metal',{roughness:.5,metalness:.4});
   [-w/2+.15,w/2-.15].forEach(px=>{const p=new THREE.Mesh(BOX,postM);p.scale.set(.12,hgt,.12);p.position.set(px,hgt/2,bb.south+dep-.2);p.castShadow=true;g.add(p)});
   g.position.x=bb.cx;scene.add(g);canopyMesh=g;
 }
 if(S.steps){
   const g=new THREE.Group();const stM=stdMat('#8a6a44','floor',{roughness:.9});
   for(let i=0;i<3;i++){const s=new THREE.Mesh(BOX,stM);s.scale.set(2.2,.14,.35+i*.35);s.position.set(0,.07+i*.14*-1+ .14*(2-i)*-1,bb.south+.35+i*.35);s.position.y=.07+(2-i)*.14;g.add(s);s.castShadow=true;s.receiveShadow=true}
   g.position.x=bb.cx;scene.add(g);stepsMesh=g;
 }
}

/* ---- мебель: корректная геометрия каждого предмета ---- */
function shade(hex,amt){const c=new THREE.Color(hex);c.lerp(new THREE.Color(amt>0?0xffffff:0x000000),Math.abs(amt));return c}
function furnMat(f,colorOverride){
 const col=colorOverride||f.c;
 if(f.tex){const t=tex(f.tex,col,1.2);const m=new THREE.MeshStandardMaterial({roughness:.85});if(t)m.map=t;else m.color.set(col);return m}
 return new THREE.MeshStandardMaterial({color:col,roughness:.78});
}
function buildFurniture(f){
 const g=new THREE.Group();const w=f.w,d=f.d,h=f.h||.8;
 const c=f.c,dark=shade(c,-.35),light=shade(c,.25);
 const mk=(sx,sy,sz,px,py,pz,mat)=>{const m=new THREE.Mesh(BOX,mat||furnMat(f));m.scale.set(Math.max(.02,sx),Math.max(.02,sy),Math.max(.02,sz));m.position.set(px,py,pz);m.castShadow=true;g.add(m);return m};
 const cy=(r,hh,px,py,pz,mat)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,Math.max(.02,hh),14),mat||furnMat(f));m.position.set(px,py,pz);m.castShadow=true;g.add(m);return m};
 const leg=(lr,mat)=>[[w/2-lr*1.8,d/2-lr*1.8],[-w/2+lr*1.8,d/2-lr*1.8],[w/2-lr*1.8,-d/2+lr*1.8],[-w/2+lr*1.8,-d/2+lr*1.8]];
 switch(f.key){
  case 'sofa':case 'sofaCorner':{const sh=h*.45;mk(w,sh,d*.82,0,sh/2,0);mk(w,h*.55,d*.2,0,h-h*.275,-d/2+d*.1);
    mk(w*.12,h*.75,d,-w/2+w*.06,h*.375,0,dark);mk(w*.12,h*.75,d,w/2-w*.06,h*.375,0,dark);
    if(f.key==='sofaCorner')mk(w*.45,sh,d*.5,-w/2+w*.22,sh/2,d*.15);break}
  case 'armchair':{const sh=h*.5;mk(w,sh,d*.85,0,sh/2,0);mk(w,h*.6,d*.22,0,h-h*.3,-d/2+d*.11,dark);
    mk(w*.16,h*.7,d,-w/2+w*.08,h*.35,0,dark);mk(w*.16,h*.7,d,w/2-w*.08,h*.35,0,dark);break}
  case 'tv':{mk(w,h*.6,.06,0,h*.68,0,new THREE.MeshStandardMaterial({color:0x101211,roughness:.2}));mk(w*.9,h*.28,d*.8,0,h*.14,0);break}
  case 'tableDine':case 'table':case 'coffeeTable':{mk(w,h*.07,d,0,h-h*.035,0);const lr=Math.min(w,d)*.05;
    leg(lr).forEach(([x,z])=>cy(lr,h*.93,x,h*.46,z,dark));break}
  case 'chair':{mk(w,h*.06,d,0,h*.45,0);mk(w*.92,h*.45,.05,0,h*.72,-d/2+.05);const lr=.03;
    [[w/2-lr,d/2-lr],[-w/2+lr,d/2-lr],[w/2-lr,-d/2+lr],[-w/2+lr,-d/2+lr]].forEach(([x,z])=>cy(lr,h*.45,x,h*.22,z,dark));break}
  case 'bookshelf':{mk(w,h,d*.06,0,h/2,-d/2+d*.03);mk(.05,h,d,-w/2+.03,h/2,0);mk(.05,h,d,w/2-.03,h/2,0);
    for(let i=0;i<4;i++)mk(w*.94,.04,d,0,h*i/4+.02,0,dark);break}
  case 'bedDouble':case 'bedSingle':{mk(w,h*.55,d,0,h*.27,0,furnMat(f,undefined));mk(w*.96,.16,d*.9,0,h*.62,.02,light);
    mk(w,h*.9,.06,0,h*.45,-d/2+.03,dark); // изголовье
    mk(w*.3,.12,d*.22,-w*.2,h*.72,-d*.3,light);mk(w*.3,.12,d*.22,w*.2,h*.72,-d*.3,light);break} // подушки
  case 'wardrobe':{mk(w,h,d,0,h/2,0);mk(w*.02,h*.9,.02,0,h/2,d/2+.01,dark);mk(w*.48,h*.94,.03,-w*.25,h/2,d/2-.02,light);mk(w*.48,h*.94,.03,w*.25,h/2,d/2-.02,light);break}
  case 'nightstand':{mk(w,h,d,0,h/2,0);mk(w*.6,h*.06,.02,0,h*.5,d/2+.01,dark);break}
  case 'desk':{mk(w,h*.06,d,0,h-.03,0);mk(.05,h*.9,d*.9,-w/2+.04,h*.45,0,dark);mk(.05,h*.9,d*.9,w/2-.04,h*.45,0,dark);mk(w*.7,h*.5,.04,0,h*.5,-d/2+.03,dark);break}
  case 'kitchen':{mk(w,h*.55,d,0,h*.28,0);mk(w,h*.04,d*1.02,0,h*.57,0,light);mk(w*.9,h*.45,d*.5,0,h*.78,-d/2+d*.28,dark);
    mk(.5,.5,.03,-w*.2,h*.9,d/2-.02,new THREE.MeshStandardMaterial({color:0x202422,roughness:.3}));break}
  case 'island':{mk(w,h*.6,d,0,h*.3,0);mk(w*1.04,h*.05,d*1.06,0,h*.63,0,light);break}
  case 'fridge':{mk(w,h,d,0,h/2,0);mk(w*.03,h*.35,.02,w*.3,h*.75,d/2+.01,dark);mk(w*.03,h*.5,.02,w*.3,h*.3,d/2+.01,dark);break}
  case 'sink':{mk(w,h*.75,d,0,h*.37,0);mk(w*.7,.05,d*.6,0,h*.78,0,new THREE.MeshStandardMaterial({color:0xe9eef0,roughness:.25}));cy(.03,.25,0,h*.9,-d*.2,dark);break}
  case 'toilet':{mk(w*.55,h*.45,d*.3,0,h*.72,-d/2+d*.15);cy(w*.42,h*.45,0,h*.22,d*.05);mk(w*.5,.05,d*.4,0,h*.46,-d*.05);break}
  case 'bathtub':{mk(w,h,d,0,h/2,0);mk(w*.86,h*.6,d*.78,0,h*.62,0,new THREE.MeshStandardMaterial({color:0xeef3f3,roughness:.2}));break}
  case 'shower':{const gl=new THREE.MeshPhysicalMaterial({color:0xcfe0dd,roughness:.05,transparent:true,opacity:.28,side:THREE.DoubleSide});
    mk(w,.05,d,0,.02,0,new THREE.MeshStandardMaterial({color:0xdde3e2}));mk(w,h,.03,0,h/2,-d/2,gl);mk(.03,h,d,-w/2,h/2,0,gl);mk(.03,h,d,w/2,h/2,0,gl);cy(.03,.3,0,h-.15,-d/2+.1,dark);break}
  case 'lamp':{cy(.16,.02,0,.02,0,dark);cy(.025,h*.8,0,h*.4,0,dark);cy(.16,.24,0,h-.1,0,light);break}
  case 'pendant':{cy(.008,.6,0,h-.3,0,dark);cy(.18,.2,0,h-.65,0,light);break}
  case 'plant':{cy(.2,.3,0,.15,0,new THREE.MeshStandardMaterial({color:0xb9ac93,roughness:.9}));
    for(let i=0;i<5;i++){const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.16,0),new THREE.MeshStandardMaterial({color:shade('#5d7a5e',i%2?.1:-.1),roughness:.9}));
      leaf.position.set((Math.sin(i*2.4)*.18),.45+i*.14,(Math.cos(i*2.4)*.18));leaf.scale.set(1,1.3,1);g.add(leaf)}break}
  case 'rug':{mk(w,.02,d,0,.012,0,furnMat(f));break}
  default:mk(w,h,d,0,h/2,0);
 }
 return g;
}
function rebuildFurnMeshes(r){
 while(r.furnG.children.length){const m=r.furnG.children.pop();r.furnG.remove(m);m.traverse(o=>{if(o.geometry&&o.geometry!==BOX)o.geometry.dispose();if(o.material&&o.material.dispose&&o.material!==frameMat&&o.material!==glassMat)o.material.dispose()})}
 (r.furn||[]).filter(f=>!f.dead).forEach(f=>{
   const fw=f.rot?f.d:f.w,fd=f.rot?f.w:f.d;
   const grp=buildFurniture(f);grp.rotation.y=f.rot?Math.PI/2:0;
   grp.position.set(f.x+fw/2-r.w/2,0,f.z+fd/2-r.d/2);
   if(f.hang)grp.position.y=H-(f.h||.5);
   grp.userData.f=f;grp.traverse(o=>{o.userData.r=r;o.userData.fgrp=grp});
   r.g.add(grp);r.furnMeshes=r.furnMeshes||[];r.furnMeshes.push(grp);
 });
}

 /* ---- метки комнат ---- */
function drawLabel(r){const k=r.cv||(r.cv=document.createElement('canvas'));k.width=256;k.height=128;const g=k.getContext('2d');
 g.clearRect(0,0,256,128);g.fillStyle='rgba(52,60,53,.82)';
 const rr=14;if(g.roundRect){g.beginPath();g.roundRect(8,20,240,88,rr);g.fill()}else{g.fillRect(8,20,240,88)}
 g.fillStyle='#F3F0E8';g.textAlign='center';g.font='700 34px Onest,Arial,sans-serif';g.fillText(TYPES[r.type].n,128,62);
 g.font='500 28px Onest,Arial,sans-serif';g.fillText(r.w*r.d+' м²',128,96);
 if(!r.lb){r.lb=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(k),depthTest:false,transparent:true}));r.lb.renderOrder=5}
 else r.lb.material.map.needsUpdate=true;
}

/* ---- анимация/几何 обновление ---- */
function upd(r){const k=.14;
 r.cw+=(r.w-r.cw)*k;r.cd+=(r.d-r.cd)*k;r.cx+=(r.x+r.w/2-GW/2-r.cx)*k;r.cz+=(r.z+r.d/2-GD/2-r.cz)*k;r.sc+=((r.gone?0:1)-r.sc)*.08;
 const h=H*r.sc,t=.15,o=TYPES[r.type].open,[n,s,e,w]=r.ws;
 r.g.position.set(r.cx,0,r.cz);
 r.fl.scale.set(r.cw,.12,r.cd);r.fl.position.y=.06;
 n.scale.set(r.cw,h,t);n.position.set(0,h/2,-r.cd/2);s.scale.set(r.cw,h,t);s.position.set(0,h/2,r.cd/2);
 e.scale.set(t,h,r.cd);e.position.set(r.cw/2,h/2,0);w.scale.set(t,h,r.cd);w.position.set(-r.cw/2,h/2,0);
 const hideWalls=(MODE==='interior')||(MODE==='overview'&&viewState.ceilingHidden);
 r.ws.forEach(m=>m.visible=!o&&!hideWalls);
 r.rf.visible=S.roof&&!o&&S.roofType==='flat'&&!hideWalls;
 if(r.gableL)r.gableL.forEach(m=>m.visible=S.roof&&!o&&S.roofType==='gable'&&!hideWalls);
 if(r.inws)updInner(r);
 // прозрачность стен в режиме экстерьера: показываем внешние
 if(MODE==='exterior'||MODE==='layout'||(MODE==='overview'&&!viewState.ceilingHidden)){r.ws.forEach(m=>m.visible=!o)}
 const q=clamp(Math.min(r.cw,r.cd)*.9,1.4,2.6);r.lb.scale.set(q*2,q,1);r.lb.position.y=h*.45+.3;
 r.lb.visible=MODE==='layout'||MODE==='overview';
 // проёмы видимы только снаружи
 r.opMeshes.forEach(g=>g.visible=!o&&(MODE!=='interior'));
 r.furnG.visible=true;
}
function resize(r,w,d){w=clamp(Math.round(w)||1,1,GW);d=clamp(Math.round(d)||1,1,GD);
 const x=Math.min(r.x,GW-w),z=Math.min(r.z,GD-d);
 if(!free(x,z,w,d,r)){toast('Здесь тесно: сдвиньте соседние комнаты или выберите другой размер.');syncUI();return false}
 r.x=x;r.z=z;r.w=w;r.d=d;
 r.opensClamp&&0;
 drawLabel(r);
 (r.furn||[]).forEach(f=>{const fw=f.rot?f.d:f.w,fd=f.rot?f.w:f.d;f.x=clamp(f.x,0,Math.max(0,w-fw));f.z=clamp(f.z,0,Math.max(0,d-fd))});
 rebuildOpenMeshes(r);rebuildFurnMeshes(r);updateRoofGeom(r);updateCanopySteps();syncUI();markDirty();return true}
function move(r,dx,dz){if(free(r.x+dx,r.z+dz,r.w,r.d,r)){r.x+=dx;r.z+=dz;updateCanopySteps();syncUI();markDirty();return true}return false}
function del(r){if(!r)return;
 if(!confirm('Удалить комнату «'+TYPES[r.type].n+'» вместе с её мебелью и проёмами? Действие можно отменить (Ctrl+Z).'))return;
 S.rooms=S.rooms.filter(o=>o!==r);S.opens=S.opens.filter(o=>o.room!==r.id);r.gone=true;dead.push(r);
 S.sel=S.rooms.find(o=>!o.gone)||null;pushHist();updateCanopySteps();syncUI();markDirty()}
function duplicateRoom(r){if(!r)return;addRoom(r.type,r.w,r.d)}

/* ============================================================
   КАМЕРА
   ============================================================ */
function camSet(th,ph,d){camGoal.th=th;camGoal.ph=ph;camGoal.d=d}
function camFitAll(){
 const bb=houseBounds();
 if(!bb){camSet(.6,1,24);return}
 const span=Math.max(bb.w,bb.d,8);
 camNow.th=camGoal.th; // без анимации прыжка угла
 camGoal.d=clamp(span*1.5+8,12,44);
}
const CAM_PRESETS={iso:()=>camSet(.6,1,clamp(camGoal.d,16,30)),top:()=>camSet(0,.08,clamp(camGoal.d,18,32)),front:()=>camSet(0,1.35,clamp(camGoal.d,16,30)),side:()=>camSet(Math.PI/2,1.3,clamp(camGoal.d,16,30)),reset:()=>{camSet(.6,1,24)},fit:camFitAll};

/* ============================================================
   ВВОД: выбор, перетаскивание, орбита, pinch
   ============================================================ */
const ndc=e=>{const b=el.getBoundingClientRect();return new THREE.Vector2((e.clientX-b.left)/b.width*2-1,-(e.clientY-b.top)/b.height*2+1)};
function hitRooms(e){ray.setFromCamera(ndc(e),cam);const t=[];
 S.rooms.forEach(r=>{if(r.gone)return;t.push(r.fl);if(!TYPES[r.type].open&&(MODE!=='interior'||viewState.wallHide==='none'))t.push(...r.ws)});
 const i=ray.intersectObjects(t,false)[0];return i?i.object.userData.r:null}
function hitAny(e){
 ray.setFromCamera(ndc(e),cam);
 // мебель (в режимах interior/layout)
 if(MODE==='interior'||MODE==='layout'){
   const fm=[];S.rooms.forEach(r=>{if(r.gone)return;(r.furnMeshes||[]).forEach(g=>g.children.forEach(c=>fm.push(c)))});
   const im=ray.intersectObjects(fm,false)[0];
   if(im){const g=im.object.parent;return{kind:'furn',f:g.userData.f,r:g.userData.r||S.sel}}
 }
 // проёмы: выбор/перемещение — в режимах экстерьера и обзора
 if(MODE==='exterior'||MODE==='overview'){
   const om=[];S.rooms.forEach(r=>{if(r.gone)return;r.opMeshes.forEach(g=>g.children.forEach(c=>om.push(c)))});
   const io=ray.intersectObjects(om,false)[0];
   if(io){const grp=io.object.parent;return{kind:'open',op:grp.userData.opRef}}
 }
 const r=hitRooms(e);return r?{kind:'room',r}:null;
}
function gpt(e){ray.setFromCamera(ndc(e),cam);const p=new THREE.Vector3();ray.ray.intersectPlane(plane,p);return p}
const dist2=()=>{const a=[...P.values()];return Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1])||1};

function bindInput(){
 el.addEventListener('pointerdown',e=>{
   el.setPointerCapture(e.pointerId);P.set(e.pointerId,[e.clientX,e.clientY]);
   if(P.size===2){mode='pinch';pd=dist2();drag=null;return}
   const h=hitAny(e);
   if(h&&h.kind==='furn'&&(MODE==='interior'||MODE==='layout')&&h.f){
     selectFurn(h.r,h.f);const r0=h.r||S.sel;
     if(r0){const p=gptLocal(r0,e);drag={furn:h.f,r:r0,ox:p.x-h.f.x,oz:p.z-h.f.z,startX:h.f.x,startZ:h.f.z}}
     mode='furnDrag';return;
   }
   if(h&&h.kind==='open'&&h.op){selectOpening(h.op);mode=null;return}
   const r=hitRooms(e);
   if(r&&(MODE==='exterior'||MODE==='overview')){ // в экстерьере клик по стене = орбита (стены не двигают)
     mode='orbit';return;
   }
   if(r){select(r);
     if(MODE==='layout'||MODE==='interior'){const p=gpt(e);drag={r,ox:p.x-r.cx,oz:p.z-r.cz,fx:r.x,fz:r.z};mode='drag'}
     else mode='orbit';
   }else mode='orbit';
 });
 el.addEventListener('pointermove',e=>{
   if(!P.has(e.pointerId))return;
   const o=P.get(e.pointerId),dx=e.clientX-o[0],dy=e.clientY-o[1];P.set(e.pointerId,[e.clientX,e.clientY]);
   if(mode==='pinch'&&P.size===2){const n=dist2();camGoal.d=clamp(camGoal.d*pd/n,8,46);pd=n}
   else if(mode==='furnDrag'&&drag&&drag.furn){
     const p=gptLocal(drag.r,e),f=drag.furn;
     const fw=f.rot?f.d:f.w,fd=f.rot?f.w:f.d;
     f.x=clamp(p.x-drag.ox,0,Math.max(0,drag.r.w-fw));f.z=clamp(p.z-drag.oz,0,Math.max(0,drag.r.d-fd));
     positionFurnMesh(drag.r,f);if(window.intLiveDraw)intLiveDraw();
   }
   else if(mode==='drag'&&drag){
     const r=drag.r,p=gpt(e);
     const x=clamp(Math.round(p.x-drag.ox-r.w/2+GW/2),0,GW-r.w),z=clamp(Math.round(p.z-drag.oz-r.d/2+GD/2),0,GD-r.d);
     if(free(x,z,r.w,r.d,r)){r.x=x;r.z=z}
     else if(free(x,r.z,r.w,r.d,r))r.x=x;else if(free(r.x,z,r.w,r.d,r))r.z=z;
     syncUIInfoOnly();
   }
   else if(mode==='orbit'){camGoal.th-=dx*.006;camGoal.ph=clamp(camGoal.ph-dy*.006,.06,1.45)}
 });
 const up=e=>{
   if(mode==='drag'&&drag&&drag.r){const r=drag.r;if(r.x!==drag.fx||r.z!==drag.fz){pushHist();markDirty();if(window.intLiveDraw)intLiveDraw()}}
   if(mode==='furnDrag'&&drag&&drag.furn){const f=drag.furn;if((f.x!==drag.startX||f.z!==drag.startZ)&&window.LT_furnMoved)LT_furnMoved();}
   P.delete(e.pointerId);if(!P.size){mode=null;drag=null}else if(mode==='pinch')mode=null};
 el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
 el.addEventListener('wheel',e=>{e.preventDefault();camGoal.d=clamp(camGoal.d*(1+e.deltaY*.0012),8,46)},{passive:false});
 // клавиатура
 document.addEventListener('keydown',e=>{
   if(document.querySelector('.modal:not([hidden])'))return;
   if(document.getElementById('view-config').hidden)return;
   const tag=(document.activeElement.tagName||'').toLowerCase();
   if(tag==='input'||tag==='textarea'||tag==='select')return;
   const mod=e.ctrlKey||e.metaKey;
   if(mod&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
   if(mod&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return}
   const r=S.sel;
   if(e.key==='Delete'&&r){del(r);return}
   if(!r)return;
   if(e.key==='ArrowLeft'&&move(r,-1,0))e.preventDefault();
   if(e.key==='ArrowRight'&&move(r,1,0))e.preventDefault();
   if(e.key==='ArrowUp'&&move(r,0,-1))e.preventDefault();
   if(e.key==='ArrowDown'&&move(r,0,1))e.preventDefault();
 });
}
/* локальные координаты внутри комнаты (для мебели) */
function gptLocal(r,e){const p=gpt(e);return{x:p.x-r.cx+r.w/2,z:p.z-r.cz+r.d/2}}
function positionFurnMesh(r,f){
 (r.furnMeshes||[]).forEach(g=>{if(g.userData.f===f){
   const fw=f.rot?f.d:f.w,fd=f.rot?f.w:f.d;
   g.position.set(f.x+fw/2-r.w/2,0,f.z+fd/2-r.d/2);g.rotation.y=f.rang||0;}});
}

/* ============================================================
   HUD камеры + режимы
   ============================================================ */
function bindHUD(){
 document.querySelectorAll('[data-cam]').forEach(b=>b.addEventListener('click',()=>{const f=CAM_PRESETS[b.dataset.cam];f&&f();
   document.querySelectorAll('[data-cam]').forEach(x=>x.setAttribute('aria-pressed','false'));
   if(['top','front','side','iso'].includes(b.dataset.cam))b.setAttribute('aria-pressed','true')}));
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
 const chBtn=document.getElementById('ceilToggle');
 if(chBtn)chBtn.addEventListener('click',()=>{viewState.ceilingHidden=!viewState.ceilingHidden;chBtn.setAttribute('aria-pressed',String(viewState.ceilingHidden));
   S.rooms.forEach(r=>upd(r));toast(viewState.ceilingHidden?'Потолок и верх стен скрыты — видно интерьер':'Стены показаны полностью')});
 const envBtn=document.getElementById('envToggle');
 if(envBtn)envBtn.addEventListener('click',()=>{S.env=!S.env;envBtn.setAttribute('aria-pressed',String(S.env));buildEnv(S.env);markDirty()});
}
function setMode(m){
 MODE=m;
 document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-selected',String(x.dataset.mode===m)));
 ['panel-exterior','panel-layout','panel-interior','panel-materials','panel-overview'].forEach(id=>{const el2=document.getElementById(id);if(el2)el2.hidden=true});
 const map={exterior:'panel-exterior',layout:'panel-layout',interior:'panel-interior',materials:'panel-materials',overview:'panel-overview'};
 const box=document.getElementById(map[m]);if(box)box.hidden=false;
 gridLines.visible=(m==='layout');
 S.rooms.forEach(r=>{if(!r.gone){upd(r);updInner(r);r.opMeshes.forEach(g=>g.visible=m!=='interior')}});
 if(m==='interior'){const r=S.sel&&!S.sel.gone?S.sel:S.rooms.find(x=>!x.gone&&!TYPES[x.type].open);if(r){select(r);focusRoom(r)}}
 syncUI();
}
function focusRoom(r){if(!r)return;
 camNow.th=camGoal.th;camNow.ph=camGoal.ph;
 camGoal.d=clamp(Math.max(r.w,r.d)*1.9+4,6,20);camGoal.ph=.9;}

/* ============================================================
   ВЫБОР ПРОЁМА / МЕБЕЛИ — панель свойств
   ============================================================ */
let selOp=null,selFurn=null,selFurnRoom=null;
function selectOpening(op){selOp=op;selFurn=null;
 const r=S.rooms.find(x=>x.id===op.room);if(r)select(r);
 renderOpPanel();syncUI()}
function selectFurn(r,f){selFurn=f;selFurnRoom=r||S.sel;selOp=null;
 if(r)select(r);
 document.querySelectorAll('#furnProps,#furnSel').forEach(x=>{if(x)x.hidden=false});
 renderFurnPanel();syncUI();
 if(window.drawInterior)drawInterior();
}
function renderOpPanel(){
 const box=document.getElementById('opProps');if(!box)return;
 if(!selOp){box.hidden=true;return}
 box.hidden=false;
 const r=S.rooms.find(x=>x.id===selOp.room);if(!r){box.hidden=true;return}
 document.getElementById('opTitle').textContent=OPEN_TYPES[selOp.type].n+' · '+TYPES[r.type].n;
 document.getElementById('opSideVal').textContent={N:'северная (задняя)',E:'восточная',S:'южная (фронтальная)',W:'западная'}[selOp.side];
}
function renderFurnPanel(){
 const box=document.getElementById('furnProps');if(!box)return;
 if(!selFurn){box.hidden=true;return}
 box.hidden=false;
 document.getElementById('fpName').textContent=selFurn.n;
}
window.LT_furnMoved=function(){pushHist();markDirty();if(window.drawInterior)drawInterior()};

/* добавление проёма */
function addOpening(roomId,side,type){
 const r=S.rooms.find(x=>x.id==roomId&&!x.gone);if(!r)return;
 if(TYPES[r.type].open){toast('На террасе проёмы не ставятся.');return}
 const T=OPEN_TYPES[type];const span=(side==='N'||side==='S')?r.w:r.d;
 if(span<T.w+.4){toast(`Стена слишком короткая (${span} м) для «${T.n}». Выберите другую стену или комнату побольше.`);return}
 const overlaps=S.opens.filter(o=>o.room===r.id&&o.side===side);
 if(overlaps.length){toast('На этой стене уже есть проём. В этом конструкторе на одну стену — один проём (по правилам модульной сборки).');return}
 S.opens.push({room:r.id,side,type,off:0});
 rebuildOpenMeshes(r);pushHist();markDirty();toast(T.n+' добавлен: '+TYPES[r.type].n);
}
function removeOpening(op){S.opens=S.opens.filter(o=>o!==op);selOp=null;
 const r=S.rooms.find(x=>x.id===op.room);if(r)rebuildOpenMeshes(r);
 renderOpPanel();pushHist();markDirty()}

/* ============================================================
   ЦИКЛ РЕНДЕРА
   ============================================================ */
function loop(){requestAnimationFrame(loop);
 const cfgView=document.getElementById('view-config'),intView=document.getElementById('view-interior');
 const inCfg=!cfgView.hidden&&!document.getElementById('cfgBox').hidden;
 const inInt=!intView.hidden&&window.ImodeIs3D&&window.ImodeIs3D();
 if(!inCfg&&!inInt)return;
 if(inCfg){
   const b=stage.getBoundingClientRect();
   if(b.width&&(b.width!==lw||b.height!==lh)){lw=b.width;lh=b.height;R.setSize(lw,lh,false);cam.aspect=lw/lh;cam.updateProjectionMatrix()}
   for(const k of['th','ph','d'])camNow[k]+=(camGoal[k]-camNow[k])*.12;
   cam.position.set(camNow.d*Math.sin(camNow.ph)*Math.sin(camNow.th),camNow.d*Math.cos(camNow.ph),camNow.d*Math.sin(camNow.ph)*Math.cos(camNow.th));
   cam.lookAt(0,H*.32,0);
   S.rooms.forEach(upd);dead.forEach(upd);
   dead=dead.filter(r=>{if(r.sc<.04){scene.remove(r.g);disposeGroup(r.g);return false}return true});
   const r=S.sel;selBox.visible=!!r&&!r.gone&&r.sc>.05;
   if(r){selBox.position.set(r.cx,H*r.sc/2+.05,r.cz);selBox.scale.set(r.cw+.12,H*r.sc+.1,r.cd+.12)}
   R.render(scene,cam);
 }
}
function disposeGroup(g){g.traverse(o=>{if(o.geometry&&o.geometry!==BOX)o.geometry.dispose();
 if(o.material&&o.material.map&&o.material.map.dispose&&!o.material.map._cached)o.material.map.dispose()})}

/* снимок сцены для сводки проекта */
function snapshotDataURL(){
 if(!inited)return null;
 try{R.render(scene,cam);const url=R.domElement.toDataURL('image/jpeg',.7);return url}catch(e){return null}
}

/* ============================================================
   ПАНЕЛИ (syncUI) — заполняет контейнеры, определённые в HTML
   ============================================================ */
function chips(container,arr,cur,attr,fmtFn){
 container.innerHTML=arr.map(i=>`<button class="chip" data-${attr}="${i.id}" aria-pressed="${cur===i.id}">${i.name||i.n}<small>${fmtFn?fmtFn(i):(i.p?'+ '+i.p.toLocaleString('ru-RU')+' ₽/м²':'входит в цену')}</small></button>`).join('');
}
function matCards(container,ids,cur,attr){
 const fmtPrice=m=>m.p?((m.p>=1000?'+ '+m.p.toLocaleString('ru-RU')+' ₽/м²':'+ '+m.p+' ₽')):'входит в цену';
 container.innerHTML='<div class="mat-grid">'+ids.map(id=>{const m=MAT(id);
  return `<button class="mat-card" data-${attr}="${m.id}" aria-pressed="${cur===m.id}" title="${m.desc}">
   <span class="mat-sw"><img src="${LT_Tex.swatchDataURL(m.tex||'plain',m.color,96)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></span>
   <span class="mat-meta"><b>${m.name}</b><span>${m.cat} · ${fmtPrice(m)}</span></span></button>`}).join('')+'</div>';
}
function priceCalc(){return window.calcProject?calcProject(window.LT_serialize?LT_serialize({rooms:[]}):{rooms:[]},[]):0}
function totalArea(){return S.rooms.filter(r=>!r.gone).reduce((a,o)=>a+o.w*o.d,0)}

function syncUI(){
 if(!window.S)return; // до инициализации сцены панели строятся из index.html
 const r=S.sel&&!S.sel.gone?S.sel:null;
 // инфо-строка
 const ta=document.getElementById('tArea');if(ta)ta.textContent=`Комнат: ${S.rooms.filter(x=>!x.gone).length}`;
 const tar=document.getElementById('tAreaNum');if(tar)tar.textContent=totalArea()+' м²';
 const tp=document.getElementById('tPrice');if(tp)tp.textContent='≈ '+priceCalc().toLocaleString('ru-RU')+' ₽';
 const fs=document.getElementById('footStrip');if(fs)fs.innerHTML=`<span class="cell"><span class="lbl">Комнат</span><span class="val">${S.rooms.filter(x=>!x.gone).length}</span></span><span class="cell"><span class="lbl">Площадь</span><span class="val">${totalArea()} <small>м²</small></span></span><span class="cell"><span class="lbl">Модули</span><span class="val"><small>≈</small> ${priceCalc().toLocaleString('ru-RU')} <small>₽</small></span></span>`;
 // панель выбранной комнаты (планировка)
 const selT=document.getElementById('selT');if(selT)selT.textContent=r?`${TYPES[r.type].n} · ${r.w}×${r.d} м · ${r.w*r.d} м²`:'Выберите комнату кликом';
 const empty=document.getElementById('selEmpty');if(empty)empty.hidden=!!r;
 const props=document.getElementById('roomProps');if(props)props.hidden=!r;
 if(r){
   const rt=document.getElementById('rType');if(rt)rt.value=r.type;
   const rw=document.getElementById('rw');if(rw)rw.value=r.w;
   const rd=document.getElementById('rd');if(rd)rd.value=r.d;
   const ra=document.getElementById('ra');if(ra)ra.value=r.w*r.d;
 }
 // список комнат
 const rl=document.getElementById('roomList');
 if(rl){const rs=S.rooms.filter(x=>!x.gone);
  rl.innerHTML=rs.length?rs.map(x=>`<button class="chip" style="width:100%;margin-bottom:6px" data-selroom="${x.id}" aria-pressed="${x===r}">${TYPES[x.type].n}<small>${x.w}×${x.d} м · ${(x.furn||[]).filter(f=>!f.dead).length} предм.</small></button>`).join(''):'<p class="who">Комнат пока нет — добавьте их кнопками выше.</p>'}
 // панели материалов
 const fw=MATERIALS.filter(m=>m.target==='facade').map(m=>m.id);
 const mc1=document.getElementById('mFacade');if(mc1)matCards(mc1,fw,S.wall,'wall');
 const mc2=document.getElementById('mRoofC');if(mc2)mc2.innerHTML='<div class="mat-grid">'+ROOF_COLORS.map(c=>`<button class="mat-card" data-roofc="${c.id}" aria-pressed="${S.roofColor===c.id}"><span class="mat-sw" style="background:${c.c}"></span><span class="mat-meta"><b>${c.n}</b><span>${c.p?'+'+c.p.toLocaleString('ru-RU')+' ₽':'входит в цену'}</span></span></button>`).join('')+'</div>';
 const rt2=document.getElementById('mRoofT');if(rt2)chips(rt2,Object.entries(ROOF_TYPES).map(([id,v])=>({id,name:v.n,p:v.p})),S.roofType,'rooft',m=>m.p?'+'+m.p.toLocaleString('ru-RU')+' ₽':'входит в цену');
 const fl=MATERIALS.filter(m=>m.target==='floor').map(m=>m.id);
 const mc3=document.getElementById('mFloor');if(mc3)matCards(mc3,fl,S.floor,'floor');
 const mc4=document.getElementById('mFrame');if(mc4)matCards(mc4,MATERIALS.filter(m=>m.target==='frames').map(m=>m.id),S.frameMat,'frame');
 const mc5=document.getElementById('mGlass');if(mc5)matCards(mc5,MATERIALS.filter(m=>m.target==='glass').map(m=>m.id),S.glassMat,'glass');
 const mc6=document.getElementById('mIntWall');if(mc6)matCards(mc6,['plasterInt','oakFloor','ashFloor','nutFloor','conc','tile','stoneTile'],S.interiorWall,'intwall');
 const mc7=document.getElementById('mFabric');if(mc7)matCards(mc7,MATERIALS.filter(m=>m.target==='fabric').map(m=>m.id),S.fabricMat,'fabric');
 // отделка выбранной комнаты
 const rw2=document.getElementById('mRoomWall');if(rw2){rw2.hidden=!r;
   if(r)matCards(rw2,['plasterInt','oakFloor','ashFloor','nutFloor','conc','tile','stoneTile'],r.wallId||S.interiorWall,'roomwall')}
 const rf2=document.getElementById('mRoomFloor');if(rf2){rf2.hidden=!r;
   if(r)matCards(rf2,fl,r.floorId||S.floor,'roomfloor')}
 // проёмы: кнопки сторон для выбранной комнаты
 const opAdd=document.getElementById('opAddRow');
 if(opAdd&&r){opAdd.querySelectorAll('[data-opside]').forEach(b=>{
   const has=S.opens.find(o=>o.room===r.id&&o.side===b.dataset.opside);
   b.disabled=!!has||TYPES[r.type].open;})}
 renderOpPanel();
 // панель свойств мебели
 renderFurnPanel();
 // статус истории
 const ub=document.getElementById('undoBtn'),rb=document.getElementById('redoBtn');
 if(ub)ub.disabled=!HIST.undo.length;if(rb)rb.disabled=!HIST.redo.length;
 // подсказка режима
 const hints={overview:'Осматривайте дом: тяните фон, чтобы повернуть; колесо — приблизить. Кнопки сверху дают готовые ракурсы.',
  exterior:'Кликните окно или дверь, чтобы выбрать проём; двигайте его кнопками ←/→ в панели свойств.',
  layout:'Тяните комнату, чтобы переместить по сетке 1 м. Стрелки на клавиатуре тоже двигают выбранную комнату.',
  interior:'Кликните предмет мебели и перетащите его. Поворот и удаление — в панели справа.',
  materials:'Выберите материал — он сразу применится к поверхностям дома.'};
 const h=document.getElementById('hint');if(h&&hints[MODE])h.textContent=hints[MODE];
}
function syncUIInfoOnly(){
 const tar=document.getElementById('tAreaNum');if(tar)tar.textContent=totalArea()+' м²';
 const tp=document.getElementById('tPrice');if(tp)tp.textContent='≈ '+priceCalc().toLocaleString('ru-RU')+' ₽';
 const fs=document.getElementById('footStrip');
 if(fs)fs.innerHTML=`<span class="cell"><span class="lbl">Комнат</span><span class="val">${S.rooms.filter(x=>!x.gone).length}</span></span><span class="cell"><span class="lbl">Площадь</span><span class="val">${totalArea()} <small>м²</small></span></span><span class="cell"><span class="lbl">Модули</span><span class="val"><small>≈</small> ${priceCalc().toLocaleString('ru-RU')} <small>₽</small></span></span>`;
}

 /* делегирование кликов панелей */
function bindPanels(){
 document.addEventListener('click',e=>{
   const b=e.target.closest('[data-wall],[data-floor],[data-rooft],[data-roofc],[data-frame],[data-glass],[data-intwall],[data-fabric],[data-roomwall],[data-roomfloor],[data-opside],[data-opmove],[data-opdel],[data-selroom],[data-extra],[data-addfurn],[data-frot],[data-fdup],[data-fdel],[data-freset]');
   if(!b)return;
   const r=S.sel&&!S.sel.gone?S.sel:null;
   const d=b.dataset;
   const one=k=>{if(d[k]){const box=b.closest('.mat-grid')||b.parentElement;box.querySelectorAll('[aria-pressed="true"]').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');return d[k]}};
   let v;
   if((v=one('wall'))){S.wall=v;pushHist();syncSceneMats();syncUI();markDirty();toast('Фасад: '+MAT(v).name);return}
   if((v=one('floor'))){S.floor=v;S.rooms.forEach(setFloor);pushHist();syncUI();markDirty();toast('Пол: '+MAT(v).name);return}
   if((v=one('rooft'))){S.roofType=v;updateRoofGeom();pushHist();syncUI();markDirty();return}
   if((v=one('roofc'))){S.roofColor=v;syncSceneMats();pushHist();syncUI();markDirty();return}
   if((v=one('frame'))){S.frameMat=v;pushHist();syncSceneMats();syncUI();markDirty();return}
   if((v=one('glass'))){S.glassMat=v;pushHist();syncSceneMats();syncUI();markDirty();return}
   if((v=one('intwall'))){S.interiorWall=v;S.rooms.forEach(x=>{x.wallId=null;applyRoomWall(x)});pushHist();syncUI();markDirty();return}
   if((v=one('fabric'))){S.fabricMat=v;pushHist();syncUI();if(window.drawInterior)drawInterior();markDirty();return}
   if((v=one('roomwall'))&&r){r.wallId=v;applyRoomWall(r);pushHist();syncUI();markDirty();return}
   if((v=one('roomfloor'))&&r){r.floorId=v;setFloor(r);pushHist();syncUI();markDirty();if(window.drawInterior)drawInterior();return}
   if(d.extra){const k=d.extra;S[k]=!S[k];b.setAttribute('aria-pressed',String(S[k]));updateCanopySteps();pushHist();markDirty();return}
   if(d.opside&&r){ // добавить проём указанного типа на указанную сторону
     const typeSel=document.getElementById('opTypeSel');
     addOpening(r.id,d.opside,(typeSel&&typeSel.value)||window.OP_TYPE||'win');return}
   if(d.opmove&&selOp){moveOpening(selOp,+d.opmove);pushHist();markDirty();renderOpPanel();return}
   if(d.opdel&&selOp){removeOpening(selOp);return}
   if(d.selroom){const rr=S.rooms.find(x=>x.id==d.selroom&&!x.gone);if(rr){select(rr);if(MODE==='interior')focusRoom(rr)}return}
   if(d.addfurn&&window.LT_addFurnFromModule){LT_addFurnFromModule(d.addfurn);return}
   if(d.frot&&selFurn){const f=selFurn,r0=selFurnRoom||r;if(r0){const of=f.rot?f.d:f.w,od=f.rot?f.w:f.d,cx0=f.x+of/2,cz0=f.z+od/2;
     f.rot=!f.rot;const fw=f.rot?f.d:f.w,fd=f.rot?f.w:f.d;
     f.x=clamp(cx0-fw/2,0,Math.max(0,r0.w-fw));f.z=clamp(cz0-fd/2,0,Math.max(0,r0.d-fd));
     positionFurnMesh(r0,f);rebuildFurnMeshes(r0);pushHist();markDirty();if(window.drawInterior)drawInterior()}return}
   if(d.fdup&&selFurn&&selFurnRoom){const f=selFurn,r0=selFurnRoom;
     const fw=f.w,fd=f.d; // дубликат без поворота, со сдвигом
     let nx=clamp(f.x+.4,0,Math.max(0,r0.w-fw)),nz=clamp(f.z+.4,0,Math.max(0,r0.d-fd));
     const nf=window.LT_makeFurn(f.key,nx,nz,false);
     r0.furn.push(nf);rebuildFurnMeshes(r0);pushHist();markDirty();if(window.drawInterior)drawInterior();return}
   if(d.fdel&&selFurn&&selFurnRoom){const f=selFurn;
     if(!confirm('Удалить «'+f.n+'»?'))return;
     selFurnRoom.furn=selFurnRoom.furn.filter(x=>x!==f);selFurn=null;document.getElementById('furnProps').hidden=true;
     rebuildFurnMeshes(selFurnRoom);pushHist();markDirty();if(window.drawInterior)drawInterior();return}
   if(d.freset&&selFurn&&selFurnRoom){const f=selFurn,b=FLIST[f.key];f.rot=false;f.rang=0;f.x=clamp(f.x,0,Math.max(0,selFurnRoom.w-b.w));f.z=clamp(f.z,0,Math.max(0,selFurnRoom.d-b.d));
     rebuildFurnMeshes(selFurnRoom);pushHist();markDirty();if(window.drawInterior)drawInterior();return}
 });
}

/* добавление мебели из модуля (используется интерьером index.html) */
window.LT_makeFurn=function(key,x,z,rot){const b=FLIST[key];if(!b)return null;
 return{key,n:b.n,w:b.w,d:b.d,h:b.h,c:b.c,ic:b.ic,p:b.p,tex:b.tex,glass:b.glass,hang:b.hang,flat:b.flat,rot:!!rot,rang:rot?Math.PI/2:0,sc:1,x,z}};
window.LT_rebuildFurn=rebuildFurnMeshes;

/* ============================================================
   ЗАГРУЗКА ПРЕСЕТОВ И ПРОЕКТОВ
   ============================================================ */
function clearRooms(){if(!inited){ // ещё нет 3D — просто чистим данные
   S.rooms=[];S.sel=null;S.opens=[];selOp=null;selFurn=null;return}
 S.rooms.forEach(r=>{r.gone=true;dead.push(r)});S.rooms=[];S.sel=null;S.opens=[];selOp=null;selFurn=null;
 if(canopyMesh){scene.remove(canopyMesh);canopyMesh=null}if(stepsMesh){scene.remove(stepsMesh);stepsMesh=null}}
function loadPreset(id){
 clearRooms();
 const pre=PRE[id]||PRE.oz;
 S.wall=pre.wall||'woodV';S.roofType=pre.roofType||'gable';S.canopy=false;S.steps=(id!=='les');
 syncSceneMats();
 pre.rooms.forEach(a=>addRoomRaw(a[0],a[1],a[2]));
 // проёмы: сопоставляем комнаты по типу (первая подходящая)
 (pre.opens||[]).forEach(o=>{
   const cand=S.rooms.filter(x=>x.type===o[0]);const r=cand[0];
   if(r)S.opens.push({room:r.id,side:o[1],type:o[2],off:0});
 });
 S.rooms.forEach(r=>{rebuildOpenMeshes(r);updateRoofGeom(r)});
 updateCanopySteps();
 HIST.undo.length=0;HIST.redo.length=0;
 select(S.rooms.find(r=>!r.gone)||null);
 markDirty();
}
window.LT_loadPreset=loadPreset;

/* загрузка сохранённого проекта (конфиг v2/v3) */
window.LT_loadConfig=function(c){
 clearRooms();
 const migrate=id=>LEGACY_WALL[id]||LEGACY_FLOOR[id]||id;
 const pick=(id,targets)=>{const m=MAT(migrate(id));return targets.includes(m.target)?m.id:null};
 const fw=pick(c.wall,['facade']);if(fw)S.wall=fw;
 const flr=pick(c.floor,['floor']);if(flr)S.floor=flr;
 S.roof=(+c.v>=2)?!!c.roof:true;
 S.roofType=c.roofType||(c.roof===false?'flat':(ROOF_TYPES[c.roof]?c.roof:'gable'));if(!ROOF_TYPES[S.roofType])S.roofType='gable';
 if(c.roof===false&&+c.v>=2)S.roof=false;
 S.roofColor=c.roofColor||(ROOF_COLORS.some(x=>x.id===c.roof)?c.roof:'graphite');if(!ROOF_COLORS.some(x=>x.id===S.roofColor))S.roofColor='graphite';
 const frm=pick(c.frameMat,['frames']);if(frm)S.frameMat=frm;
 const gls=pick(c.glassMat,['glass']);if(gls)S.glassMat=gls;
 const iw=pick(c.interiorWall,['interior','floor']);if(iw)S.interiorWall=iw;
 const fb=pick(c.fabricMat,['fabric']);if(fb)S.fabricMat=fb;
 S.canopy=!!c.canopy;S.steps=!!c.steps;
 syncSceneMats();
 (c.rooms||[]).forEach(o=>{
   const T=TYPES[o.type];if(!T)return;
   const r=addRoomRaw(o.type,clamp(Math.round(+o.w)||T.w,1,GW),clamp(Math.round(+o.d)||T.d,1,GD),clamp(Math.round(+o.x)||0,0,GW-1),clamp(Math.round(+o.z)||0,0,GD-1));
   const fid=migrate(o.floor);const fm2=MAT(fid);if(fm2&&fm2.target==='floor')r.floorId=fid;
   const wm2=MAT(migrate(o.wall));if(wm2&&(wm2.target==='interior'||wm2.target==='floor'))r.wallId=wm2.id;
   setFloor(r);applyRoomWall(r);
   r.furn=(o.furn||[]).map(f=>window.LT_makeFurn(f.key,f.x,f.z,f.rot)).filter(Boolean);
   rebuildFurnMeshes(r);
 });
 S.opens=(c.opens||[]).filter(o=>o.room!=null&&S.rooms.some(r=>r.id===o.room)&&OPEN_TYPES[o.type]).map(o=>({...o}));
 S.rooms.forEach(r=>{rebuildOpenMeshes(r)});
 updateRoofGeom();updateCanopySteps();
 S.sel=null;selOp=null;selFurn=null;HIST.undo.length=0;HIST.redo.length=0;
 syncUI();
};

/* сериализация — расширенный конфиг (совместимый с v2) */
window.LT_serialize=function(base){
 base.v=3;
 base.wall=S.wall;base.floor=S.floor;base.roof=!!S.roof;
 base.roofType=S.roofType;base.roofColor=S.roofColor;base.frameMat=S.frameMat;base.glassMat=S.glassMat;base.interiorWall=S.interiorWall;base.fabricMat=S.fabricMat;
 base.canopy=!!S.canopy;base.steps=!!S.steps;
 base.opens=S.opens.map(o=>({...o}));
 // комнаты — из актуального состояния (единый источник данных)
 base.rooms=S.rooms.filter(r=>!r.gone).map(r=>({type:r.type,x:r.x,z:r.z,w:r.w,d:r.d,floor:r.floorId||null,wall:r.wallId||null,
   furn:(r.furn||[]).filter(f=>!f.dead).map(f=>({key:f.key,x:+(+f.x).toFixed(2),z:+(+f.z).toFixed(2),rot:!!f.rot}))}));
 return base;
};

window.LT_undo=undo;window.LT_redo=redo;window.LT_snapshot=snapshot;window.LT_applySnap=applySnap;
window.LT_setMode=setMode;window.LT_getMode=()=>MODE;
window.LT_camPreset=k=>{const f=CAM_PRESETS[k];f&&f()};
window.LT_focusRoom=focusRoom;window.LT_selectRoomById=id=>{const r=S.rooms.find(x=>x.id==id&&!x.gone);if(r)select(r)};
window.LT_totalArea=totalArea;
window.LT_syncUI=syncUI;window.LT_bindPanelsDone=false;
window.LT_initIfNeeded=function(){if(!inited){inited=true;init();bindPanels();window.LT_bindPanelsDone=true}};
window.LT_clearHist=function(){HIST.undo.length=0;HIST.redo.length=0;syncUI()};
window.LT_delNoConfirm=function(r){S.rooms=S.rooms.filter(o=>o!==r);S.opens=S.opens.filter(o=>o.room!==r.id);r.gone=true;dead.push(r);S.sel=S.rooms.find(o=>!o.gone)||null;pushHist();syncUI()};
window.LT_resizeNoHist=resize;
window.LT_addRoomNoHist=function(type,w,d,px,pz,extra){
 const T=TYPES[type];w=w||T.w;d=d||T.d;
 const p=(px!=null&&!isNaN(px)&&!isNaN(pz)&&free(px,pz,w,d))?[px,pz]:spot(w,d);
 if(!p)return null;
 const r=addRoomRaw(type,w,d,p[0],p[1]);
 if(extra){
   const mig=id=>LEGACY_WALL[id]||LEGACY_FLOOR[id]||id;
   const fid=mig(extra.floor);if(fid&&MAT(fid)&&MAT(fid).target==='floor')r.floorId=fid;
   if(extra.wall&&MAT(extra.wall))r.wallId=MAT(extra.wall).target==='interior'?extra.wall:null;
   r.furn=(extra.furn||[]).filter(f=>f&&FLIST[f.key]).slice(0,60).map(f=>window.LT_makeFurn(f.key,f.x,f.z,f.rot)).filter(Boolean);
   rebuildFurnMeshes(r);
 }
 setFloor(r);select(r);return r;
};
window.LT_updateRoofGeom=updateRoofGeom;
window.LT_MAT=MAT;window.LT_MATERIALS=MATERIALS;window.LT_OPEN_TYPES=OPEN_TYPES;window.LT_ROOF_TYPES=ROOF_TYPES;window.LT_ROOF_COLORS=ROOF_COLORS;
window.LT_FLIST=FLIST;window.LT_ROOM_FURN=ROOM_FURN;window.LT_TYPES=TYPES;
window.LT_gptLocal=gptLocal;window.LT_positionFurnMesh=positionFurnMesh;
window.LT_sceneReady=()=>inited;
window.LT_snapshotURL=snapshotDataURL;
})();
