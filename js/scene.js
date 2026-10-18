/* 3D-сцена конструктора (Three.js r128, глобальный THREE из vendor/three.min.js).
   Сцена создаётся один раз и обновляется инкрементально: sync(house, view) пересобирает только то,
   что изменилось (по ключам), а перемещение комнаты — это просто смена позиции группы.
   Рендер по требованию: кадры рисуются, когда движется камера или изменилась сцена. */
import { GW, GD, H, FLOORS, FACADES, FLIST, EXTRA_KINDS, OPENING_KINDS, matById, facadeById, FRAMES } from './data.js';
import { sideInfo, openingProblem, isOpen, furnFoot, bbox, neighbors } from './layout.js';
import { createMats } from './mats.js';
import { createFurnitureFactory } from './furniture.js';

export const FY = 0.06;            // уровень пола над землёй (цоколь)
const rm = o => { if (o && o.parent) o.parent.remove(o) };   // Object3D.removeFromParent появился позже r128
const WT_IN = 0.1, WT_OUT = 0.1;   // толщина внутреннего и наружного слоя стены
const SIDE_XFORM = side => ({ s: [0, 0, 1, 0], n: [Math.PI, 0, -1, 0], e: [Math.PI / 2, 1, 0, 1], w: [-Math.PI / 2, 0, 0, -1] }[side]);

const LIGHTS = {
  morning: { az: 105, el: 20, color: 0xffd7ae, I: 1.7, hemi: .5, sky: ['#9dbbd6', '#f0d9c4', '#f7e8d0'], fog: 0xf0e0cc },
  day: { az: 150, el: 52, color: 0xfff2dc, I: 1.8, hemi: .5, sky: ['#8fb7d9', '#d3e4ec', '#f1ede0'], fog: 0xe6eee9 },
  evening: { az: 250, el: 11, color: 0xffb06e, I: 1.6, hemi: .4, sky: ['#5f7096', '#e2a57c', '#f2d3a8'], fog: 0xe8c9a6 }
};

export function createScene(canvas, opts = {}) {
  const T = THREE, mobile = matchMedia('(pointer:coarse)').matches;
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .82;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.localClippingEnabled = true;

  const scene = new T.Scene(), camera = new T.PerspectiveCamera(40, 1, 0.1, 400);
  const mats = createMats(renderer), furn = createFurnitureFactory(mats);
  const own = [];                                  // геометрии/текстуры уровня сцены
  const track = o => { own.push(o); return o };
  const EDIT_BG = new T.Color('#e4dfd1');

  /* ----- освещение и окружение ----- */
  const hemi = new T.HemisphereLight(0xe3edf2, 0x8b8572, .55); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff2dc, 2.1); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 70 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
  const fpLight = new T.PointLight(0xfff0d8, 0, 9, 1.6); fpLight.visible = false; scene.add(fpLight);

  (function env() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#8fb7d9'); gr.addColorStop(.48, '#e9f0f1'); gr.addColorStop(.5, '#c9c3b0'); gr.addColorStop(1, '#8b8572');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    const t = new T.CanvasTexture(c); t.mapping = T.EquirectangularReflectionMapping; t.encoding = T.sRGBEncoding;
    const pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(t).texture; t.dispose(); pm.dispose();
  })();

  function skyTexture(cols) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, cols[0]); gr.addColorStop(.55, cols[1]); gr.addColorStop(.78, cols[2]); gr.addColorStop(1, cols[2]);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }
  let skyTex = null;

  const ground = new T.Mesh(track(new T.CircleGeometry(90, 48)), new T.MeshStandardMaterial({ color: 0xc9c2ae, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grassMap = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#82926c'; g.fillRect(0, 0, 256, 256);
    let s = 7; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
    for (let i = 0; i < 7000; i++) { g.fillStyle = `rgba(${r() > .5 ? '60,86,44' : '176,196,138'},${.08 + r() * .14})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 2 + r() * 4) }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(26, 26); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return mats.texture(t);
  })();
  const grassMat = new T.MeshStandardMaterial({ map: grassMap, roughness: 1 }), editGroundMat = ground.material;
  const plot = new T.Mesh(track(new T.PlaneGeometry(GW, GD)), new T.MeshStandardMaterial({ color: 0xeee9da, roughness: 1 }));
  plot.rotation.x = -Math.PI / 2; plot.position.y = 0.004; plot.receiveShadow = true; scene.add(plot);
  const plotLawn = new T.MeshStandardMaterial({ map: grassMap, color: 0xd8e2c6, roughness: 1 }), plotEdit = plot.material;
  const grid = (() => {
    const p = []; for (let i = 0; i <= GW; i++) p.push(i - GW / 2, .012, -GD / 2, i - GW / 2, .012, GD / 2); for (let j = 0; j <= GD; j++) p.push(-GW / 2, .012, j - GD / 2, GW / 2, .012, j - GD / 2);
    const g = track(new T.BufferGeometry()); g.setAttribute('position', new T.Float32BufferAttribute(p, 3));
    const m = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xa79f88, transparent: true, opacity: .55 })); scene.add(m); return m;
  })();

  const nature = new T.Group(); nature.visible = false; scene.add(nature);
  (function trees() {
    let s = 20260; const r = () => (s = s * 16807 % 2147483647) / 2147483647;
    const trunkG = track(new T.CylinderGeometry(.12, .18, 1, 6)), c1 = track(new T.ConeGeometry(1.15, 2.6, 8)), c2 = track(new T.ConeGeometry(.85, 2.1, 8)), crown = track(new T.IcosahedronGeometry(1, 1));
    const NP = mobile ? 28 : 46, NB = mobile ? 14 : 24;
    const trunkM = new T.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }), pineM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, envMapIntensity: .3 }), leafM = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 1, envMapIntensity: .3 }), birchM = new T.MeshStandardMaterial({ color: 0xe8e4da, roughness: .9 });
    own.push(trunkM, pineM, leafM, birchM);
    const iT = new T.InstancedMesh(trunkG, trunkM, NP + NB), iC1 = new T.InstancedMesh(c1, pineM, NP), iC2 = new T.InstancedMesh(c2, pineM, NP), iCr = new T.InstancedMesh(crown, leafM, NB);
    const m = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    const place = () => { for (let k = 0; k < 40; k++) { const a = r() * 6.283, d = 14 + r() * 36, x = Math.cos(a) * d * 1.25, z = Math.sin(a) * d; if (Math.abs(x) > 11 || Math.abs(z) > 9) return [x, z] } return [30, 30] };
    for (let i = 0; i < NP; i++) {
      const [x, z] = place(), h = .8 + r() * .9;
      m.compose(v.set(x, 1.2 * h, z), q, sc.set(1, 2.4 * h, 1)); iT.setMatrixAt(i, m);
      m.compose(v.set(x, 2.4 * h + .9 * h, z), q, sc.set(h, h, h)); iC1.setMatrixAt(i, m);
      m.compose(v.set(x, 2.4 * h + 2.1 * h, z), q, sc.set(h * .9, h * .9, h * .9)); iC2.setMatrixAt(i, m);
      col.setHSL(.32 + r() * .05, .38 + r() * .1, .075 + r() * .05); iC1.setColorAt(i, col); iC2.setColorAt(i, col);
    }
    for (let i = 0; i < NB; i++) {
      const [x, z] = place(), h = .8 + r() * .7;
      m.compose(v.set(x, 1.6 * h, z), q, sc.set(.8, 3.2 * h, .8)); iT.setMatrixAt(NP + i, m);
      m.compose(v.set(x, 3.4 * h + 1, z), q, sc.set(1.5 * h, 1.7 * h, 1.5 * h)); iCr.setMatrixAt(i, m);
      col.setHSL(.24 + r() * .06, .42, .12 + r() * .06); iCr.setColorAt(i, col);
    }
    [iT, iC1, iC2, iCr].forEach(i => { i.castShadow = true; i.receiveShadow = false; i.instanceMatrix.needsUpdate = true; nature.add(i) });
    const bushG = track(new T.IcosahedronGeometry(.7, 1)), bushM = new T.MeshStandardMaterial({ color: 0x2f4a25, roughness: 1, envMapIntensity: .25 }); own.push(bushM);
    for (let i = 0; i < 16; i++) { const a = r() * 6.283, b = new T.Mesh(bushG, bushM), d = 9 + r() * 4; b.position.set(Math.cos(a) * d * 1.25, .35, Math.sin(a) * d * .85); b.scale.set(1 + r(), .7 + r() * .4, 1 + r()); if (Math.abs(b.position.x) < 9.6 && Math.abs(b.position.z) < 7.6) continue; b.castShadow = true; nature.add(b) }
  })();

  /* ----- содержимое ----- */
  const root = new T.Group(); scene.add(root);                      // комнаты
  const extrasG = new T.Group(); scene.add(extrasG);
  const overlay = new T.Group(); scene.add(overlay);                // подсветки и служебные маркеры
  const rooms = new Map(), extrasMap = new Map();
  let pickables = [], pickDirty = true;

  const V = { mode: 'exterior', showRoof: true, cut: 'full', env: false, shadows: true, time: 'day', autoRotate: false, activeRoom: null, plan: false };
  let house = null;

  const mk = (geo, mat, opts2 = {}) => { const m = new T.Mesh(geo, mat); m.castShadow = opts2.cast !== false; m.receiveShadow = opts2.receive !== false; return m };

  function disposeList(list) { list.forEach(g => g.dispose && g.dispose()); list.length = 0 }

  /* --- стены --- */
  function rectShape(x0, x1, y1, notches, holes) {
    const s = new T.Shape(); s.moveTo(x0, 0);
    notches.forEach(([a, b, top]) => { s.lineTo(a, 0); s.lineTo(a, top); s.lineTo(b, top); s.lineTo(b, 0) });
    s.lineTo(x1, 0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.closePath();
    holes.forEach(([a, b, y0, y1b]) => { const p = new T.Path(); p.moveTo(a, y0); p.lineTo(a, y1b); p.lineTo(b, y1b); p.lineTo(b, y0); p.closePath(); s.holes.push(p) });
    return s;
  }
  function extrude(shape, depth, z0) {
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
    if (z0) g.translate(0, 0, z0); return g;
  }
  const facadeMatFor = (room, f) => {
    const spec = f.accent && f.accent.types.includes(room.type) ? f.accent.mat : f.base;
    return mats.get(spec, { dir: f.dir === 'h' ? 'h' : 'v', wall: true });
  };

  function buildWall(room, s, rv, sigInfo) {
    const f = facadeById(house.facade) || FACADES[0], info = sigInfo, L = info.len;
    const g = new T.Group(), [rot, , , ] = SIDE_XFORM(s);
    const half = s === 'n' || s === 's' ? room.w / 2 : room.d / 2;
    const pos = { s: [-room.w / 2, FY, room.d / 2], n: [room.w / 2, FY, -room.d / 2], e: [room.w / 2, FY, room.d / 2], w: [-room.w / 2, FY, -room.d / 2] }[s];
    g.position.set(...pos); g.rotation.y = rot; g.userData.wall = { roomId: room.id, side: s, len: L };
    const ops = room.open.filter(o => o.s === s && !openingProblem(house, room, o));
    const holesOf = (a, b) => ops.filter(o => o.p - o.w / 2 >= a - 1e-6 && o.p + o.w / 2 <= b + 1e-6);
    const toHN = list => ({
      notches: list.filter(o => o.y < .02).map(o => [o.p - o.w / 2, o.p + o.w / 2, o.h]).sort((p, q) => p[0] - q[0]),
      holes: list.filter(o => o.y >= .02).map(o => [o.p - o.w / 2, o.p + o.w / 2, o.y, o.y + o.h])
    });
    const innerMat = mats.get(room.fin.wall, { wall: true }), outMat = facadeMatFor(room, f);
    const ns = s === 'n' || s === 's';
    // внутренний слой
    { const hn = toHN(ops), x0 = ns ? 0 : WT_IN, x1 = ns ? L : L - WT_IN;
      const geo = extrude(rectShape(x0, x1, H, hn.notches, hn.holes), WT_IN, -WT_IN); rv.struct.push(geo);
      const m = mk(geo, [innerMat, innerMat]); m.userData.pick = { t: 'wall', roomId: room.id, side: s, layer: 'in' }; g.add(m) }
    // наружный слой — только на наружных участках
    info.exposed.forEach(([a, b]) => {
      const x0 = a - (ns && a < 1e-6 ? WT_OUT : 0), x1 = b + (ns && b > L - 1e-6 ? WT_OUT : 0), hn = toHN(holesOf(a, b));
      const geo = extrude(rectShape(x0, x1, H, hn.notches, hn.holes), WT_OUT, 0); rv.struct.push(geo);
      const m = mk(geo, [outMat, outMat]); m.userData.pick = { t: 'wall', roomId: room.id, side: s, layer: 'out' }; g.add(m);
      if (f.band) {
        const bm = mats.get(f.band.mat, { dir: 'v', wall: true });
        const cuts = ops.filter(o => o.p - o.w / 2 >= a - 1e-6 && o.p + o.w / 2 <= b + 1e-6 && o.y < f.band.h - 1e-6).map(o => [o.p - o.w / 2, o.p + o.w / 2]).sort((p, q) => p[0] - q[0]);
        let cur = x0; const segs = [];
        cuts.forEach(([ca, cb]) => { if (ca > cur + .05) segs.push([cur, ca]); cur = cb }); if (x1 > cur + .05) segs.push([cur, x1]);
        segs.forEach(([sa, sb]) => { const bg = extrude(rectShape(sa, sb, f.band.h, [], []), WT_OUT + .014, 0); rv.struct.push(bg); const bmesh = mk(bg, [bm, bm]); bmesh.userData.pick = { t: 'wall', roomId: room.id, side: s, layer: 'out' }; g.add(bmesh) });
      }
    });
    // окна и двери
    const fm = mats.frame(house.frame), gl = mats.glass();
    ops.forEach(o => {
      const K = OPENING_KINDS[o.k], og = new T.Group(); og.position.set(o.p, o.y, 0); og.userData.pick = { t: 'open', roomId: room.id, id: o.id };
      const ft = .06, fd = .13, add = (sx, sy, sz, x, y, z, mat, cast = false) => { const geo = new T.BoxGeometry(sx, sy, sz); rv.struct.push(geo); const m = mk(geo, mat, { cast }); m.position.set(x, y, z); m.userData.pick = og.userData.pick; og.add(m); return m };
      add(o.w, ft, fd, o.w / 2, ft / 2, 0, fm); add(o.w, ft, fd, o.w / 2, o.h - ft / 2, 0, fm);
      add(ft, o.h, fd, ft / 2, o.h / 2, 0, fm); add(ft, o.h, fd, o.w - ft / 2, o.h / 2, 0, fm);
      if (K.door && o.k === 'door') {
        add(o.w - ft * 2, o.h - ft * 2, .06, o.w / 2, o.h / 2, 0, fm, true);
        add(.03, .14, .05, o.w - ft - .09, o.h * .48, .06, mats.solid('handle', '#c9c3b2', { r: .3, m: .8 }));
        const sl = add(.14, o.h * .5, .062, ft + .14, o.h * .55, 0, gl); sl.castShadow = false;
      } else {
        add(o.w - ft * 2, o.h - ft * 2, .012, o.w / 2, o.h / 2, 0, gl).renderOrder = 2;
        const nm = o.w > 1.5 ? Math.round(o.w / 1.2) - 1 : 0; for (let i = 1; i <= nm; i++) add(.04, o.h - ft * 2, fd * .8, ft + (o.w - ft * 2) * i / (nm + 1), o.h / 2, 0, fm);
        if (!K.door) add(o.w + .1, .035, .24, o.w / 2, -.0, WT_OUT + .02, mats.get('limestone', { wall: true }));
        if (K.door) add(.03, .3, .05, o.w - ft - .08, o.h * .45, .05, mats.solid('handle', '#c9c3b2', { r: .3, m: .8 }));
      }
      g.add(og);
    });
    return g;
  }

  /* --- кровля --- */
  function buildRoof(room, rv) {
    const type = house.roofType, w = room.w, d = room.d, y = FY + H, g = new T.Group();
    const roofM = mats.get(house.roofMat || 'metal-dark', { dir: 'v' });
    const f = facadeById(house.facade) || FACADES[0], capM = facadeMatFor(room, f);
    let mesh;
    if (type === 'flat') {
      const geo = new T.BoxGeometry(w + .3, .18, d + .3); rv.struct.push(geo); mesh = mk(geo, roofM); mesh.position.y = .09;
      const bx = mats.get('concrete', {}); const ed = new T.BoxGeometry(w + .3, .06, d + .3); rv.struct.push(ed);
      // небольшой парапет-кант
      const cant = mk(ed, bx); cant.position.y = .0; g.add(cant);
    } else {
      const longX = w >= d, long = Math.max(w, d), short = Math.min(w, d), hs = short / 2, ov = .35, ovE = .15, rise = Math.max(.5, Math.min(1.6, short * .32));
      const sh = new T.Shape();
      if (type === 'gable') { sh.moveTo(-hs - ov, 0); sh.lineTo(hs + ov, 0); sh.lineTo(0, rise + rise * ov / hs * .6); sh.closePath() }
      else { sh.moveTo(-hs - ov, 0); sh.lineTo(hs + ov, 0); sh.lineTo(hs + ov, rise); sh.lineTo(-hs - ov, rise * .15); sh.closePath() }
      const geo = new T.ExtrudeGeometry(sh, { depth: long + ovE * 2, bevelEnabled: false, curveSegments: 1 }); geo.translate(0, 0, -(long / 2 + ovE)); rv.struct.push(geo);
      mesh = mk(geo, [capM, roofM]); if (longX) mesh.rotation.y = Math.PI / 2;
    }
    mesh.userData.pick = { t: 'roof', roomId: room.id }; g.add(mesh); g.position.y = y; return g;
  }

  function floorGeo(w, d, tile) {
    const geo = new T.PlaneGeometry(w, d), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
    return geo;
  }

  function newRV(room) {
    const g = new T.Group(); root.add(g);
    return { id: room.id, g, struct: [], floorGeo: [], walls: new Map(), roofG: null, ceil: null, floor: null, plinth: null, furnG: new T.Group(), furnViews: new Map(), key: '', fkey: '', furnKey: '' };
  }
  function disposeRV(rv) { disposeList(rv.struct); disposeList(rv.floorGeo); rm(rv.g) }

  function updateRV(rv, room) {
    const open = isOpen(room);
    rv.g.position.set(room.x + room.w / 2 - GW / 2, 0, room.z + room.d / 2 - GD / 2);
    const sig = ['n', 'e', 's', 'w'].map(s => sideInfo(house, room, s));
    const key = JSON.stringify([room.type, room.w, room.d, room.open, house.facade, house.frame, house.roofType, house.roofMat, room.fin.wall, sig.map(i => i.exposed)]);
    if (key !== rv.key) {
      rv.key = key; disposeList(rv.struct);
      rv.walls.forEach(w => rm(w)); rv.walls.clear();
      if (rv.roofG) { rm(rv.roofG); rv.roofG = null }
      if (rv.ceil) { rm(rv.ceil); rv.ceil = null }
      if (rv.plinth) { rm(rv.plinth); rv.plinth = null }
      const pg = new T.BoxGeometry(room.w + .2, FY, room.d + .2); rv.struct.push(pg);
      rv.plinth = mk(pg, mats.get('concrete-dark', {}), { cast: false }); rv.plinth.position.y = FY / 2 - .001; rv.g.add(rv.plinth);
      if (!open) {
        ['n', 'e', 's', 'w'].forEach((s, i) => { const w = buildWall(room, s, rv, sig[i]); rv.walls.set(s, w); rv.g.add(w) });
        rv.roofG = buildRoof(room, rv); rv.g.add(rv.roofG);
        const cg = new T.PlaneGeometry(room.w, room.d); rv.struct.push(cg);
        rv.ceil = mk(cg, mats.solid('ceil', '#ece9e0', { r: .95 }), { cast: false }); rv.ceil.rotation.x = Math.PI / 2; rv.ceil.position.y = FY + H - .002; rv.g.add(rv.ceil);
      }
      pickDirty = true;
    }
    const fid = open ? 'deck' : (room.floor || house.floor), fkey = [room.type, room.w, room.d, fid].join('|');
    if (fkey !== rv.fkey) {
      rv.fkey = fkey; disposeList(rv.floorGeo); if (rv.floor) rm(rv.floor);
      const fl = FLOORS.find(f => f.id === fid), m = open ? mats.get('larch', { dir: 'h' }) : mats.get(fl.mat);
      const geo = floorGeo(room.w, room.d, open ? 1.2 : 1.2); rv.floorGeo.push(geo);
      rv.floor = mk(geo, m, { cast: false }); rv.floor.rotation.x = -Math.PI / 2; rv.floor.position.y = FY + .002;
      rv.floor.userData.pick = { t: 'floor', roomId: room.id }; rv.g.add(rv.floor); pickDirty = true;
    }
    // мебель: сравнение по id
    if (!rv.furnG.parent) rv.g.add(rv.furnG);
    const fk = JSON.stringify(room.furn) + room.w + 'x' + room.d;
    if (fk !== rv.furnKey) {
      rv.furnKey = fk; const seen = new Set();
      room.furn.forEach(f => {
        seen.add(f.id); const sig2 = f.key + '|' + (f.m || ''); let fv = rv.furnViews.get(f.id);
        if (fv && fv.sig !== sig2) { rm(fv.g); rv.furnViews.delete(f.id); fv = null }
        if (!fv) {
          const inst = furn.make(f.key, f.m ? mats.get(f.m) : null); if (!inst) return;
          inst.traverse(o => { if (o.isMesh) o.userData.pick = { t: 'furn', roomId: room.id, id: f.id } });
          rv.furnG.add(inst); fv = { g: inst, sig: sig2 }; rv.furnViews.set(f.id, fv); pickDirty = true;
        }
        const fp = furnFoot(f); fv.g.position.set(f.x + fp.w / 2 - room.w / 2, FY + .002, f.z + fp.d / 2 - room.d / 2); fv.g.rotation.y = -(f.r || 0) * Math.PI / 2;
      });
      rv.furnViews.forEach((fv, id) => { if (!seen.has(id)) { rm(fv.g); rv.furnViews.delete(id); pickDirty = true } });
    }
  }

  /* --- ступени и навес --- */
  function buildExtra(ex) {
    const g = new T.Group(), geoms = [], lw = ex.r % 2 ? ex.d : ex.w, ld = ex.r % 2 ? ex.w : ex.d;
    const add = (geo, mat, x, y, z, userPick = true) => { geoms.push(geo); const m = mk(geo, mat); m.position.set(x, y, z); if (userPick) m.userData.pick = { t: 'extra', id: ex.id }; g.add(m); return m };
    if (ex.k === 'steps') {
      const n = Math.max(2, Math.min(6, Math.round(ld / .33))), tread = ld / n, rise = .5 / n, cm = mats.get('concrete', {});
      for (let i = 0; i < n; i++) { const h = FY + rise * (n - i); add(new T.BoxGeometry(lw, h, tread), cm, 0, h / 2, -ld / 2 + tread * (i + .5)) }
      add(new T.BoxGeometry(lw, .04, tread * .98), mats.get('larch', { dir: 'h' }), 0, FY + rise * n + .02, -ld / 2 + tread * .5);
    } else {
      const pm = mats.solid('post', '#2f3431', { r: .4, m: .7, env: 1 }), hh = 2.55;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => add(new T.BoxGeometry(.09, hh, .09), pm, a * (lw / 2 - .12), hh / 2 + FY, b * (ld / 2 - .12)));
      add(new T.BoxGeometry(lw + .3, .12, ld + .3), mats.get('metal-dark', {}), 0, hh + FY + .06, 0);
      add(new T.BoxGeometry(lw + .1, .03, ld + .1), mats.get('larch', { dir: 'h' }), 0, hh + FY - .02, 0);
    }
    g.rotation.y = -(ex.r || 0) * Math.PI / 2; const outer = new T.Group(); outer.add(g);
    outer.position.set(ex.x + ex.w / 2 - GW / 2, 0, ex.z + ex.d / 2 - GD / 2); outer.userData.geoms = geoms; return outer;
  }
  function updateExtras() {
    const seen = new Set();
    house.extras.forEach(ex => {
      seen.add(ex.id); const k = [ex.k, ex.w, ex.d, ex.r, house.roofMat].join('|'); let ev = extrasMap.get(ex.id);
      if (ev && ev.k !== k) { rm(ev.g); disposeList(ev.g.userData.geoms); extrasMap.delete(ex.id); ev = null; pickDirty = true }
      if (!ev) { ev = { g: buildExtra(ex), k }; extrasMap.set(ex.id, ev); extrasG.add(ev.g); pickDirty = true }
      ev.g.position.set(ex.x + ex.w / 2 - GW / 2, 0, ex.z + ex.d / 2 - GD / 2);
    });
    extrasMap.forEach((ev, id) => { if (!seen.has(id)) { rm(ev.g); disposeList(ev.g.userData.geoms); extrasMap.delete(id); pickDirty = true } });
  }

  /* --- служебные маркеры: выбранная комната и общие стены --- */
  const markGeo = track(new T.PlaneGeometry(1, 1));
  const roomMark = new T.Mesh(markGeo, new T.MeshBasicMaterial({ color: 0x69765b, transparent: true, opacity: .26, depthWrite: false })); roomMark.rotation.x = -Math.PI / 2; roomMark.renderOrder = 3; roomMark.visible = false; overlay.add(roomMark);
  const sharedG = new T.Group(); overlay.add(sharedG); let sharedKey = '';
  const sharedMat = new T.MeshBasicMaterial({ color: 0xa87850, transparent: true, opacity: .95, depthWrite: false }); own.push(sharedMat);
  function updateShared() {
    const rs = house.rooms.filter(r => !isOpen(r)), segs = [];
    rs.forEach((a, i) => rs.slice(i + 1).forEach(b => {
      const zo0 = Math.max(a.z, b.z), zo1 = Math.min(a.z + a.d, b.z + b.d), xo0 = Math.max(a.x, b.x), xo1 = Math.min(a.x + a.w, b.x + b.w);
      if ((a.x + a.w === b.x || b.x + b.w === a.x) && zo1 > zo0) segs.push([a.x + a.w === b.x ? b.x : a.x, zo0, 0, zo1 - zo0]);
      if ((a.z + a.d === b.z || b.z + b.d === a.z) && xo1 > xo0) segs.push([xo0, a.z + a.d === b.z ? b.z : a.z, xo1 - xo0, 0]);
    }));
    const key = JSON.stringify(segs) + V.plan; if (key === sharedKey) return; sharedKey = key;
    sharedG.children.slice().forEach(c => { c.geometry.dispose(); rm(c) });
    if (!V.plan) return;
    segs.forEach(([x, z, lx, lz]) => {
      const geo = new T.BoxGeometry(lx || .14, .03, lz || .14), m = new T.Mesh(geo, sharedMat);
      m.position.set(x + lx / 2 - GW / 2, FY + .03, z + lz / 2 - GD / 2); m.renderOrder = 4; sharedG.add(m);
    });
  }

  /* --- подсветка выбранного --- */
  const hl = new T.Group(); hl.visible = false; overlay.add(hl);
  const hlEdges = new T.LineSegments(track(new T.EdgesGeometry(new T.BoxGeometry(1, 1, 1))), new T.LineBasicMaterial({ color: 0xe39b3b, depthTest: false, transparent: true })); hlEdges.renderOrder = 10;
  const hlFill = new T.Mesh(track(new T.BoxGeometry(1, 1, 1)), new T.MeshBasicMaterial({ color: 0xe39b3b, transparent: true, opacity: .1, depthTest: false, depthWrite: false })); hlFill.renderOrder = 9;
  hl.add(hlFill, hlEdges); own.push(hlEdges.material, hlFill.material);
  let hlSel = null, hlBad = false;

  function highlightBox(sel) {
    if (!sel || !house) return null;
    const room = sel.roomId != null ? house.rooms.find(r => r.id === sel.roomId) : sel.t === 'room' ? house.rooms.find(r => r.id === sel.id) : null;
    if (sel.t === 'room' && room) { const rv = rooms.get(room.id); const p = rv ? rv.g.position : new T.Vector3(); return { c: [p.x, FY + H / 2, p.z], s: [room.w + .3, H + .12, room.d + .3], ry: 0 } }
    if (sel.t === 'wall' && room) { const rv = rooms.get(room.id), wg = rv && rv.walls.get(sel.side); if (!wg) return null; wg.updateWorldMatrix(true, false); const L = wg.userData.wall.len, p = wg.localToWorld(new T.Vector3(L / 2, H / 2, 0)); return { c: [p.x, p.y, p.z], s: [L + .06, H + .06, .42], wg } }
    if (sel.t === 'open' && room) {
      const op = room.open.find(o => o.id === sel.id), rv = rooms.get(room.id), wg = op && rv && rv.walls.get(op.s); if (!wg) return null;
      wg.updateWorldMatrix(true, false); const p = wg.localToWorld(new T.Vector3(op.p, op.y + op.h / 2, 0)); return { c: [p.x, p.y, p.z], s: [op.w + .14, op.h + .14, .4], wg };
    }
    if (sel.t === 'extra') { const ex = house.extras.find(e => e.id === sel.id); if (!ex) return null; const hh = ex.k === 'canopy' ? 2.8 : .6; return { c: [ex.x + ex.w / 2 - GW / 2, hh / 2, ex.z + ex.d / 2 - GD / 2], s: [ex.w + .1, hh + .1, ex.d + .1], ry: 0 } }
    if (sel.t === 'furn' && room) {
      const f = room.furn.find(x => x.id === sel.id); if (!f) return null; const fp = furnFoot(f), hh = FLIST[f.key].h, rv = rooms.get(room.id), p = rv ? rv.g.position : new T.Vector3();
      return { c: [p.x + f.x + fp.w / 2 - room.w / 2, FY + hh / 2, p.z + f.z + fp.d / 2 - room.d / 2], s: [fp.w + .06, hh + .04, fp.d + .06], ry: 0 };
    }
    return null;
  }
  function applyHighlight() {
    const b = highlightBox(hlSel);
    if (!b) { hl.visible = false; return }
    hl.visible = true; hl.position.set(...b.c); hl.scale.set(...b.s);
    if (b.wg) { const q = new T.Quaternion(); b.wg.getWorldQuaternion(q); hl.quaternion.copy(q) } else hl.quaternion.identity();
    const col = hlBad ? 0xc0503a : 0xe39b3b; hlEdges.material.color.setHex(col); hlFill.material.color.setHex(col);
  }

  /* ----- камера ----- */
  const cam = {
    mode: 'orbit', th: .7, ph: 1.0, dist: 24, tx: 0, ty: 1, tz: 0,
    g: { th: .7, ph: 1.0, dist: 24, tx: 0, ty: 1, tz: 0 },
    fp: { x: 0, z: 0, yaw: 0, pitch: 0, fov: 70, gyaw: 0, gpitch: 0, gfov: 70 }, rooms: null
  };
  const LIM = { phMin: .02, phMax: 1.52, dMin: 2.5, dMax: 48, tx: GW / 2 + 3, tz: GD / 2 + 3 };
  const clampG = () => {
    const g = cam.g; g.ph = Math.max(LIM.phMin, Math.min(LIM.phMax, g.ph)); g.dist = Math.max(LIM.dMin, Math.min(LIM.dMax, g.dist));
    g.tx = Math.max(-LIM.tx, Math.min(LIM.tx, g.tx)); g.tz = Math.max(-LIM.tz, Math.min(LIM.tz, g.tz)); g.ty = Math.max(0, Math.min(3, g.ty));
  };
  function exitFp() { if (cam.mode === 'fp') { cam.mode = 'orbit'; camera.fov = 40; camera.updateProjectionMatrix(); fpLight.visible = false; invalidate() } }
  const cameraApi = {
    get mode() { return cam.mode },
    orbit(dx, dy) { if (cam.mode === 'fp') { cam.fp.gyaw -= dx * .005; cam.fp.gpitch = Math.max(-1.2, Math.min(1.2, cam.fp.gpitch - dy * .005)) } else { cam.g.th -= dx * .0065; cam.g.ph -= dy * .0065; clampG() } invalidate() },
    pan(dx, dy) {
      if (cam.mode === 'fp') return;
      const k = cam.dist * 0.0016, th = cam.th, rx = Math.cos(th), rz = -Math.sin(th), fx = -Math.sin(th), fz = -Math.cos(th);
      const sc = 1 / Math.max(.25, Math.cos(cam.ph));      // на пологом ракурсе вертикальный сдвиг экрана соответствует большему пути по земле
      cam.g.tx += -dx * rx * k + dy * fx * k * sc; cam.g.tz += -dx * rz * k + dy * fz * k * sc; clampG(); invalidate();
    },
    zoom(f) { if (cam.mode === 'fp') { cam.fp.gfov = Math.max(35, Math.min(85, cam.fp.gfov * f)) } else { cam.g.dist *= f; clampG() } invalidate() },
    set(p) { exitFp(); Object.assign(cam.g, p); clampG(); invalidate() },
    snap() { Object.assign(cam, { th: cam.g.th, ph: cam.g.ph, dist: cam.g.dist, tx: cam.g.tx, ty: cam.g.ty, tz: cam.g.tz }); cam.fp.yaw = cam.fp.gyaw; cam.fp.pitch = cam.fp.gpitch; cam.fp.fov = cam.fp.gfov; updateCamera(1); invalidate() },
    fitDist(b, ph) {
      const w = b ? b.w : GW, d = b ? b.d : GD, r = Math.hypot(w, d, 3) / 2, vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
      return Math.max(LIM.dMin, Math.min(LIM.dMax, r / Math.sin(Math.min(vf, hf) / 2) * 1.02));
    },
    fit(h) {
      const b = bbox(h || house); exitFp();
      const cx = b ? b.x0 + b.w / 2 - GW / 2 : 0, cz = b ? b.z0 + b.d / 2 - GD / 2 : 0;
      Object.assign(cam.g, { tx: cx, ty: 1, tz: cz, dist: cameraApi.fitDist(b) }); clampG(); invalidate();
    },
    preset(name, h) {
      exitFp(); cameraApi.fit(h);
      const p = { iso: { th: .72, ph: 1.0 }, top: { th: 0, ph: .02 }, front: { th: 0, ph: 1.42 }, side: { th: Math.PI / 2, ph: 1.42 }, back: { th: Math.PI, ph: 1.42 } }[name] || { th: .72, ph: 1.0 };
      Object.assign(cam.g, p); if (name === 'top') cam.g.dist *= .92; if (name === 'front' || name === 'side') cam.g.dist *= .95; clampG(); invalidate();
    },
    focusRoom(room, ph) {
      exitFp(); const cx = room.x + room.w / 2 - GW / 2, cz = room.z + room.d / 2 - GD / 2, r = Math.max(room.w, room.d);
      Object.assign(cam.g, { tx: cx, ty: .8, tz: cz, dist: Math.max(LIM.dMin + 1.5, r * 1.9 + 2), ph: ph == null ? .95 : ph, th: cam.g.th }); clampG(); invalidate();
    },
    enterRoom(room) {
      const cx = room.x + room.w / 2 - GW / 2, cz = room.z + room.d / 2 - GD / 2, off = room.d >= 3 ? room.d * .3 : 0;
      cam.mode = 'fp'; Object.assign(cam.fp, { x: cx, z: cz + off, yaw: Math.PI, gyaw: Math.PI, pitch: -.05, gpitch: -.05, fov: 68, gfov: 68 });
      fpLight.position.set(cx, FY + H - .35, cz); fpLight.visible = true; fpLight.intensity = 1.1; invalidate();
    },
    reset(h) { cameraApi.preset('iso', h) },
    state: () => ({ ...cam.g, mode: cam.mode }),
    stateNow: () => ({ th: cam.th, ph: cam.ph, dist: cam.dist, tx: cam.tx, ty: cam.ty, tz: cam.tz }),
    nudge(dx, dz) { cam.g.tx += dx; cam.g.tz += dz; clampG(); invalidate() }
  };

  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 11); let moving = false;
    if (cam.mode === 'fp') {
      const f = cam.fp, d = (a, b) => Math.abs(a - b) > 1e-3;
      if (d(f.yaw, f.gyaw) || d(f.pitch, f.gpitch) || d(f.fov, f.gfov)) moving = true;
      f.yaw += (f.gyaw - f.yaw) * k; f.pitch += (f.gpitch - f.pitch) * k; f.fov += (f.gfov - f.fov) * k;
      camera.position.set(f.x, FY + 1.55, f.z);
      camera.lookAt(f.x + Math.sin(f.yaw) * Math.cos(f.pitch), FY + 1.55 + Math.sin(f.pitch), f.z + Math.cos(f.yaw) * Math.cos(f.pitch));
      if (Math.abs(camera.fov - f.fov) > .01) { camera.fov = f.fov; camera.updateProjectionMatrix() }
      return moving;
    }
    if (V.autoRotate) { cam.g.th += dt * .12; cam.th = cam.g.th; moving = true }
    for (const key of ['th', 'ph', 'dist', 'tx', 'ty', 'tz']) { const dlt = cam.g[key] - cam[key]; if (Math.abs(dlt) > 1e-4) { moving = true; cam[key] += dlt * k } else cam[key] = cam.g[key] }
    const sp = Math.sin(cam.ph);
    camera.position.set(cam.tx + cam.dist * sp * Math.sin(cam.th), cam.ty + cam.dist * Math.cos(cam.ph), cam.tz + cam.dist * sp * Math.cos(cam.th));
    camera.position.y = Math.max(.35, camera.position.y);      // не уходит под землю
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    return moving;
  }

  /* ----- свет / окружение / вид ----- */
  const cutPlane = new T.Plane(new T.Vector3(0, -1, 0), 100);
  function applyView() {
    const L = LIGHTS[V.time] || LIGHTS.day, az = L.az * Math.PI / 180, el = L.el * Math.PI / 180;
    sun.position.set(Math.sin(az) * Math.cos(el) * 30, Math.sin(el) * 30, Math.cos(az) * Math.cos(el) * 30); sun.color.setHex(L.color); sun.intensity = L.I; hemi.intensity = L.hemi;
    sun.castShadow = V.shadows; renderer.shadowMap.needsUpdate = true;
    const nat = V.env;
    nature.visible = nat; ground.material = nat ? grassMat : editGroundMat; plot.material = nat ? plotLawn : plotEdit; grid.visible = !nat;
    if (nat) { if (skyTex) skyTex.dispose(); skyTex = skyTexture(L.sky); scene.background = skyTex; scene.fog = new T.Fog(L.fog, 55, 150) } else { scene.background = EDIT_BG; scene.fog = null }
    cutPlane.constant = V.cut === 'cut' ? FY + 1.25 : V.cut === 'hidden' ? FY + .08 : 100;
    mats.setCut(V.cut === 'full' ? null : cutPlane);
    rooms.forEach((rv, id) => { const room = house && house.rooms.find(r => r.id === id); const closed = room && !isOpen(room); if (rv.roofG) rv.roofG.visible = V.showRoof && closed; if (rv.ceil) rv.ceil.visible = V.showRoof && closed });
    pickDirty = true; invalidate();
  }

  /* ----- sync ----- */
  function sync(h, view) {
    house = h; let viewChanged = false;
    if (view) for (const k in view) if (V[k] !== view[k]) { V[k] = view[k]; viewChanged = true }
    const seen = new Set();
    h.rooms.forEach(room => { seen.add(room.id); let rv = rooms.get(room.id); if (!rv) { rv = newRV(room); rooms.set(room.id, rv) } updateRV(rv, room) });
    rooms.forEach((rv, id) => { if (!seen.has(id)) { disposeRV(rv); rooms.delete(id); pickDirty = true } });
    updateExtras(); updateShared();
    const ar = V.activeRoom != null ? h.rooms.find(r => r.id === V.activeRoom) : null;
    if (ar && (V.mode === 'plan' || V.mode === 'interior')) { roomMark.visible = true; roomMark.scale.set(ar.w, ar.d, 1); roomMark.position.set(ar.x + ar.w / 2 - GW / 2, FY + .012, ar.z + ar.d / 2 - GD / 2) } else roomMark.visible = false;
    rooms.forEach((rv, id) => { const room = h.rooms.find(r => r.id === id); const closed = room && !isOpen(room); if (rv.roofG) rv.roofG.visible = V.showRoof && closed; if (rv.ceil) rv.ceil.visible = V.showRoof && closed });
    if (viewChanged) applyView();
    applyHighlight(); renderer.shadowMap.needsUpdate = true; invalidate();
  }

  /* ----- выбор лучом ----- */
  const ray = new T.Raycaster(), ndc = new T.Vector2(), tmpV = new T.Vector3(), gplane = new T.Plane(new T.Vector3(0, 1, 0), -FY);
  const isVisible = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true };
  function collectPick() { pickables = []; [root, extrasG].forEach(r => r.traverse(o => { if (o.isMesh && o.userData.pick) pickables.push(o) })); pickDirty = false }
  function setNdc(cx, cy) { const b = canvas.getBoundingClientRect(); ndc.set((cx - b.left) / b.width * 2 - 1, -(cy - b.top) / b.height * 2 + 1); ray.setFromCamera(ndc, camera) }
  function raycast(cx, cy, accept) {
    if (pickDirty) collectPick(); setNdc(cx, cy);
    const hits = ray.intersectObjects(pickables, false), cutY = V.cut === 'full' ? 1e9 : cutPlane.constant;
    for (const h of hits) {
      const pk = h.object.userData.pick; if (!pk || !isVisible(h.object)) continue;
      if (h.point.y > cutY + 1e-3 && (pk.t === 'wall' || pk.t === 'open')) continue;
      if (accept && !accept(pk)) continue;
      return { pick: pk, point: h.point.clone(), distance: h.distance };
    }
    return null;
  }
  /* точка на плоскости пола (в мировых координатах), либо null */
  function groundPoint(cx, cy, y = FY) { setNdc(cx, cy); gplane.constant = -y; return ray.ray.intersectPlane(gplane, tmpV.set(0, 0, 0)) ? tmpV.clone() : null }
  /* координата вдоль стены (м) под курсором: для перетаскивания окон/дверей */
  function wallCoord(cx, cy, roomId, side) {
    const rv = rooms.get(roomId), wg = rv && rv.walls.get(side); if (!wg) return null;
    setNdc(cx, cy); wg.updateWorldMatrix(true, false);
    const o = new T.Vector3(0, 0, 0).applyMatrix4(wg.matrixWorld), nrm = new T.Vector3(0, 0, 1).transformDirection(wg.matrixWorld), pl = new T.Plane().setFromNormalAndCoplanarPoint(nrm, o), p = new T.Vector3();
    if (!ray.ray.intersectPlane(pl, p)) return null;
    return wg.worldToLocal(p).x;
  }
  function project(x, y, z) {
    const v = new T.Vector3(x, y, z).project(camera), b = canvas.getBoundingClientRect();
    return { x: (v.x + 1) / 2 * b.width, y: (1 - v.y) / 2 * b.height, visible: v.z < 1 && v.z > -1 };
  }

  /* ----- цикл рендера ----- */
  let raf = 0, need = true, last = performance.now(), active = true, onFrame = opts.onFrame, lastW = 0, lastH = 0, disposed = false;
  function invalidate() { need = true }
  function resize(force) {
    const p = canvas.parentElement, w = Math.max(2, Math.floor(p.clientWidth)), h = Math.max(2, Math.floor(p.clientHeight));
    if (!force && w === lastW && h === lastH) return; lastW = w; lastH = h;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); invalidate();
  }
  function frame(now) {
    if (disposed) return; raf = requestAnimationFrame(frame);
    if (!active) { last = now; return }
    const dt = Math.min(.1, (now - last) / 1000); last = now;
    const moving = updateCamera(dt);
    if (need || moving) {
      need = false; renderer.render(scene, camera);
      if (onFrame) onFrame(moving);
    }
  }
  raf = requestAnimationFrame(frame);

  function snapshot(w = 1600, h = 1000, type = 'image/png') {
    const prev = { w: lastW, h: lastH }, pr = renderer.getPixelRatio();
    const hlv = hl.visible, gv = grid.visible, mv = roomMark.visible, sv = sharedG.visible;
    hl.visible = false; mv && (roomMark.visible = false); sharedG.visible = false;
    renderer.setPixelRatio(1); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera);
    const url = canvas.toDataURL(type, .92);
    hl.visible = hlv; grid.visible = gv; roomMark.visible = mv; sharedG.visible = sv; renderer.setPixelRatio(pr);
    renderer.setSize(prev.w, prev.h, false); camera.aspect = prev.w / prev.h; camera.updateProjectionMatrix(); renderer.shadowMap.needsUpdate = true; invalidate();
    return url;
  }

  function dispose() {
    disposed = true; cancelAnimationFrame(raf);
    rooms.forEach(disposeRV); rooms.clear();
    extrasMap.forEach(ev => disposeList(ev.g.userData.geoms)); extrasMap.clear();
    sharedG.children.forEach(c => c.geometry.dispose());
    furn.dispose(); mats.dispose(); own.forEach(o => o.dispose && o.dispose());
    if (skyTex) skyTex.dispose();
    if (scene.environment) scene.environment.dispose();
    renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss();
  }

  return {
    renderer, scene, camera, cam: cameraApi, sync, raycast, groundPoint, wallCoord, project, resize, invalidate, snapshot, dispose, applyView,
    setActive(v) { active = v; if (v) { last = performance.now(); invalidate() } },
    setHighlight(sel, bad) { hlSel = sel; hlBad = !!bad; applyHighlight(); invalidate() },
    setOnFrame(f) { onFrame = f },
    view: () => ({ ...V }),
    stats: () => ({ ...renderer.info.memory, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, ...mats.stats(), rooms: rooms.size })
  };
}

export const webglAvailable = () => { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))) } catch (e) { return false } };
