/* Геометрия плана, проверки размещения и перенос формата проекта.
   Модуль не зависит от DOM и Three.js: его можно тестировать в Node. */
import {
  GW, GD, H, TYPES, WALLS, FLOORS, FLIST, FACADES, ROOF_TYPES, ROOF_MATS, FRAMES, OPENING_KINDS, OPEN_MARGIN, OPEN_GAP,
  EXTRA_KINDS, MAX_ROOMS, MAX_FURN, INT_WALL_DEFAULT, WALL_FINISHES, FIN_MATS, PRE, MODELS, facadeById, defaultFacadeFor, matById, SIDES,
  FACADE_TINTS, READY_HOMES
} from './data.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let _uid = 0;
export const nextId = () => ++_uid;
const r2 = n => Math.round(n * 100) / 100;
const r3 = n => Math.round(n * 1000) / 1000;

/* ---------- комнаты ---------- */
export const roomType = r => TYPES[r.type] || TYPES.liv;
export const isOpen = r => !!roomType(r).open;
export const roomArea = r => r.w * r.d;
export const totalArea = house => house.rooms.reduce((a, r) => a + r.w * r.d, 0);
export const closedArea = house => house.rooms.reduce((a, r) => a + (isOpen(r) ? 0 : r.w * r.d), 0);
export function bbox(house) {
  if (!house.rooms.length) return null;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  house.rooms.forEach(r => { x0 = Math.min(x0, r.x); z0 = Math.min(z0, r.z); x1 = Math.max(x1, r.x + r.w); z1 = Math.max(z1, r.z + r.d) });
  return { x0, z0, x1, z1, w: x1 - x0, d: z1 - z0 };
}

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.z < b.z + b.d && b.z < a.z + a.d;

/* Почему прямоугольник нельзя поставить сюда ('' — можно). */
export function whyNotFree(house, x, z, w, d, ex) {
  if (x < 0 || z < 0 || x + w > GW || z + d > GD) return `Выходит за границу участка ${GW}×${GD} м.`;
  const hit = house.rooms.find(o => o !== ex && overlap({ x, z, w, d }, o));
  return hit ? `Пересекается с комнатой «${roomType(hit).n}». Сдвиньте соседнюю комнату или выберите другой размер.` : '';
}
export const free = (house, x, z, w, d, ex) => !whyNotFree(house, x, z, w, d, ex);

/* Ближайшее к центру дома свободное место (как в прежней версии) */
export function spot(house, w, d) {
  let cx = GW / 2, cz = GD / 2;
  const n = house.rooms.length;
  if (n) { cx = house.rooms.reduce((a, o) => a + o.x + o.w / 2, 0) / n; cz = house.rooms.reduce((a, o) => a + o.z + o.d / 2, 0) / n }
  let best = null, bd = 1e9;
  for (let x = 0; x <= GW - w; x++) for (let z = 0; z <= GD - d; z++) if (free(house, x, z, w, d)) {
    const q = (x + w / 2 - cx) ** 2 + (z + d / 2 - cz) ** 2;
    if (q < bd) { bd = q; best = [x, z] }
  }
  return best;
}

export function makeRoom(type, w, d, x, z) {
  const T = TYPES[type];
  return { id: nextId(), type, x, z, w: w || T.w, d: d || T.d, floor: null, fin: { wall: INT_WALL_DEFAULT }, open: [], furn: [], x0: x, z0: z };
}

export function neighbors(house, r) {
  return house.rooms.filter(o => o !== r && (
    ((o.x === r.x + r.w || o.x + o.w === r.x) && o.z < r.z + r.d && r.z < o.z + o.d) ||
    ((o.z === r.z + r.d || o.z + o.d === r.z) && o.x < r.x + r.w && r.x < o.x + o.w)));
}

/* ---------- стены и проёмы ---------- */
function edgeDef(r, s) {
  const { x, z, w, d } = r;
  switch (s) {
    case 'n': return { len: w, a0: x, a1: x + w, sign: -1, opp: o => o.z + o.d === z, rng: o => [o.x, o.x + o.w] };
    case 's': return { len: w, a0: x, a1: x + w, sign: 1, opp: o => o.z === z + d, rng: o => [o.x, o.x + o.w] };
    case 'e': return { len: d, a0: z, a1: z + d, sign: -1, opp: o => o.x === x + w, rng: o => [o.z, o.z + o.d] };
    default: return { len: d, a0: z, a1: z + d, sign: 1, opp: o => o.x + o.w === x, rng: o => [o.z, o.z + o.d] };
  }
}
/* Участки стены: shared — граничат с другой закрытой комнатой (внутренняя стена), exposed — наружные.
   Координаты — вдоль стены (м) в локальной системе стены: для зрителя снаружи слева направо. */
export function sideInfo(house, r, s) {
  const e = edgeDef(r, s), sh = [];
  if (!isOpen(r)) house.rooms.forEach(o => {
    if (o === r || isOpen(o) || !e.opp(o)) return;
    const [lo, hi] = e.rng(o), a = Math.max(lo, e.a0), b = Math.min(hi, e.a1);
    if (b > a) sh.push(e.sign > 0 ? [a - e.a0, b - e.a0] : [e.a1 - b, e.a1 - a]);
  });
  sh.sort((p, q) => p[0] - q[0]);
  const merged = [];
  sh.forEach(i => { const l = merged[merged.length - 1]; if (l && i[0] <= l[1]) l[1] = Math.max(l[1], i[1]); else merged.push([i[0], i[1]]) });
  const exposed = []; let cur = 0;
  merged.forEach(i => { if (i[0] > cur) exposed.push([cur, i[0]]); cur = i[1] });
  if (cur < e.len) exposed.push([cur, e.len]);
  return { len: e.len, shared: merged, exposed: isOpen(r) ? [] : exposed };
}

export function openingKind(op) { return OPENING_KINDS[op.k] || OPENING_KINDS.win }

/* Проверка проёма: '' — всё в порядке, иначе причина. */
export function openingProblem(house, r, op, ignoreSelf = true) {
  const K = openingKind(op);
  if (isOpen(r)) return 'У террасы нет стен.';
  const info = sideInfo(house, r, op.s), a = op.p - op.w / 2, b = op.p + op.w / 2;
  if (op.w < K.wMin - 1e-6 || op.w > K.wMax + 1e-6) return `Ширина — от ${K.wMin} до ${K.wMax} м.`;
  if (op.h < K.hMin - 1e-6 || op.h > K.hMax + 1e-6) return `Высота — от ${K.hMin} до ${K.hMax} м.`;
  if (op.y < K.ymin - 1e-6) return `Низ проёма не ниже ${K.ymin} м от пола.`;
  if (op.y + op.h > H - 0.1 + 1e-6) return `Проём выше стены: верх не выше ${r2(H - 0.1)} м.`;
  if (info.len < op.w + OPEN_MARGIN * 2) return 'Стена слишком короткая для такого проёма.';
  const inside = info.exposed.some(([lo, hi]) => a >= lo + OPEN_MARGIN - 1e-6 && b <= hi - OPEN_MARGIN + 1e-6);
  if (!inside) {
    if (a < OPEN_MARGIN - 1e-6 || b > info.len - OPEN_MARGIN + 1e-6) return `Проём слишком близко к углу: отступ не меньше ${OPEN_MARGIN} м.`;
    return 'Проём попадает на внутреннюю стену между комнатами или слишком близко к ней: окна и двери — только на наружных стенах.';
  }
  const other = r.open.find(o => o !== op && (!ignoreSelf || o.id !== op.id) && o.s === op.s && a < o.p + o.w / 2 + OPEN_GAP && o.p - o.w / 2 < b + OPEN_GAP);
  if (other) return `Пересекается с проёмом «${openingKind(other).n}».`;
  return '';
}
export const openingOk = (house, r, op) => !openingProblem(house, r, op);

/* Положение нового проёма: ближайшее к центру наружного участка свободное место. */
export function findOpeningPos(house, r, s, kind, w) {
  const info = sideInfo(house, r, s), K = OPENING_KINDS[kind];
  w = w || K.w;
  const probe = { id: -1, k: kind, s, w, h: K.h, y: K.y, p: 0 };
  let best = null, bd = 1e9;
  info.exposed.forEach(([lo, hi]) => {
    for (let p = lo + OPEN_MARGIN + w / 2; p <= hi - OPEN_MARGIN - w / 2 + 1e-6; p += 0.1) {
      probe.p = r2(p);
      if (!openingProblem(house, r, probe)) {
        const q = Math.abs(p - info.len / 2);
        if (q < bd) { bd = q; best = r2(p) }
      }
    }
  });
  return best;
}

/* ---------- дополнительные элементы (ступени, навес) ---------- */
export function extraProblem(house, ex) {
  const K = EXTRA_KINDS[ex.k]; if (!K) return 'Неизвестный элемент.';
  if (ex.x < 0 || ex.z < 0 || ex.x + ex.w > GW || ex.z + ex.d > GD) return `Выходит за границу участка ${GW}×${GD} м.`;
  if (!K.free) {
    const hit = house.rooms.find(o => overlap(ex, o));
    if (hit) return `«${K.n}» не могут находиться внутри комнаты «${roomType(hit).n}».`;
  }
  return '';
}
export function extraSpot(house, ex) {
  const probe = { ...ex };
  const near = house.rooms[0] ? { x: house.rooms[0].x + house.rooms[0].w / 2, z: house.rooms[0].z + house.rooms[0].d / 2 } : { x: GW / 2, z: GD / 2 };
  let best = null, bd = 1e9;
  for (let x = 0; x <= GW - ex.w; x++) for (let z = 0; z <= GD - ex.d; z++) {
    probe.x = x; probe.z = z;
    if (extraProblem(house, probe)) continue;
    // ступени логично ставить у стены дома
    const touch = house.rooms.some(o => !isOpen(o) && ((x + ex.w === o.x || x === o.x + o.w) && z < o.z + o.d && o.z < z + ex.d || (z + ex.d === o.z || z === o.z + o.d) && x < o.x + o.w && o.x < x + ex.w));
    const q = (x - near.x) ** 2 + (z - near.z) ** 2 + (touch ? 0 : 400);
    if (q < bd) { bd = q; best = [x, z] }
  }
  return best;
}

/* ---------- мебель ---------- */
export const furnFoot = f => {
  const b = FLIST[f.key] || { w: 1, d: 1 }, odd = (f.r || 0) % 2 === 1;
  return { w: odd ? b.d : b.w, d: odd ? b.w : b.d };
};
export function clampFurn(room, f) {
  const { w, d } = furnFoot(f);
  f.x = r2(clamp(f.x, 0, Math.max(0, room.w - w)));
  f.z = r2(clamp(f.z, 0, Math.max(0, room.d - d)));
}
export function furnCollision(room, f) {
  const b = FLIST[f.key]; if (!b || b.nocollide || b.flat) return null;
  const a = furnFoot(f);
  return room.furn.find(o => {
    if (o === f || o.id === f.id) return false;
    const ob = FLIST[o.key]; if (!ob || ob.nocollide || ob.flat) return false;
    const c = furnFoot(o);
    return f.x < o.x + c.w - 1e-4 && o.x < f.x + a.w - 1e-4 && f.z < o.z + c.d - 1e-4 && o.z < f.z + a.d - 1e-4;
  }) || null;
}
export function findFurnSpot(room, key) {
  const probe = { id: -1, key, r: 0, x: 0, z: 0 }, { w, d } = furnFoot(probe);
  if (w > room.w + 1e-6 || d > room.d + 1e-6) return null;
  let best = null, bd = 1e9;
  for (let x = 0; x <= room.w - w + 1e-6; x += 0.1) for (let z = 0; z <= room.d - d + 1e-6; z += 0.1) {
    probe.x = r2(x); probe.z = r2(z);
    if (furnCollision(room, probe)) continue;
    const q = (x + w / 2 - room.w / 2) ** 2 + (z + d / 2 - room.d / 2) ** 2;
    if (q < bd) { bd = q; best = { x: probe.x, z: probe.z } }
  }
  return best;
}

/* ---------- проект: создание, нормализация, сериализация ---------- */
export function emptyHouse() {
  return { wall: 'wood', facade: 'larch-v', floor: 'oak', roof: true, roofType: 'flat', roofMat: 'metal-dark', frame: 'graphite', rooms: [], extras: [] };
}

export function presetHouse(id, overrides) {
  const m = MODELS.find(x => x.id === id), house = emptyHouse();
  if (m) { house.facade = m.facade; house.wall = facadeById(m.facade).priceClass; house.roofType = m.roofType }
  (PRE[id] || PRE.oz).forEach(a => {
    const p = spot(house, a[1], a[2]);
    if (p) house.rooms.push(makeRoom(a[0], a[1], a[2], p[0], p[1]));
  });
  // стартовые окна и входная дверь: чтобы дом сразу выглядел как дом
  starterOpenings(house);
  return Object.assign(house, overrides || {});
}

/* Готовый дом: модель + фасад/цвет/пол из READY_HOMES + мебель. Мебель ставится в свободное место;
   то, что не поместилось в комнату, пропускается. */
export function readyHouse(id) {
  const v = READY_HOMES.find(x => x.id === id); if (!v) return null;
  const house = presetHouse(v.base);
  house.facade = v.facade; house.wall = facadeById(v.facade).priceClass;
  if (FACADE_TINTS.some(t => t.id === v.tint && t.c)) house.facadeTint = v.tint;
  if (FLOORS.some(f => f.id === v.floor)) house.floor = v.floor;
  house.rooms.forEach(r => {
    (v.furn[r.type] || []).forEach(item => {
      const [key, mat] = Array.isArray(item) ? item : [item, null];
      const b = FLIST[key]; if (!b) return;
      const p = findFurnSpot(r, key); if (!p) return;
      const f = { id: nextId(), key, x: p.x, z: p.z, r: 0, m: null };
      const fin = b.fin && FIN_MATS[b.fin];
      if (mat && fin && fin.includes(mat)) f.m = mat;
      r.furn.push(f);
    });
  });
  return house;
}

/* Окна на наружных стенах и входная дверь в прихожей (или в первой комнате). Только там, где проверки проходят. */
export function starterOpenings(house) {
  const tryAdd = (r, s, k) => {
    const K = OPENING_KINDS[k], p = findOpeningPos(house, r, s, k);
    if (p == null) return false;
    r.open.push({ id: nextId(), k, s, p, w: K.w, h: K.h, y: K.y });
    return true;
  };
  const door = house.rooms.find(r => r.type === 'hall') || house.rooms.find(r => !isOpen(r));
  if (door) ['s', 'w', 'e', 'n'].some(s => tryAdd(door, s, 'door'));
  house.rooms.forEach(r => {
    if (isOpen(r)) return;
    const want = r.type === 'bath' ? ['win-s'] : r.type === 'liv' ? ['win-pan'] : ['win'];
    want.forEach(k => ['s', 'e', 'n', 'w'].some(s => (r.open.some(o => o.s === s) ? false : tryAdd(r, s, k))));
  });
}

function cleanOpening(o) {
  const K = OPENING_KINDS[o && o.k]; if (!K || !SIDES[o.s]) return null;
  return { id: nextId(), k: o.k, s: o.s, p: r2(+o.p || 0), w: r2(clamp(+o.w || K.w, K.wMin, K.wMax)), h: r2(clamp(+o.h || K.h, K.hMin, K.hMax)), y: r2(clamp(o.y == null ? K.y : +o.y, K.ymin, H - 0.1 - K.hMin)) };
}

/* Из JSON проекта (любой версии, включая старую v1/v2 без новых полей) во внутреннюю модель.
   Возвращает { house, notes: [] }. Ничего не бросает на повреждённых данных: сообщает, что было пропущено. */
export function normalizeProject(c) {
  const notes = [], house = emptyHouse();
  c = c || {};
  const wall = WALLS.find(w => w.id === c.wall) ? c.wall : 'wood';
  house.wall = wall;
  const fc = facadeById(c.facade);
  house.facade = fc && fc.priceClass === wall ? fc.id : defaultFacadeFor(wall);
  // необязательный цвет фасада: у старых проектов поля нет — остаётся «натуральный»
  house.facadeTint = FACADE_TINTS.some(t => t.id === c.facadeTint && t.c) ? c.facadeTint : null;
  house.floor = FLOORS.some(f => f.id === c.floor) ? c.floor : 'oak';
  house.roof = (+c.v >= 2) ? !!c.roof : true;      // у проектов старой версии крыша не сохранялась: показываем её
  house.roofType = ROOF_TYPES.some(t => t.id === c.roofType) ? c.roofType : 'flat';
  house.roofMat = ROOF_MATS.includes(c.roofMat) ? c.roofMat : 'metal-dark';
  house.frame = FRAMES.some(f => f.id === c.frame) ? c.frame : 'graphite';
  let skippedRooms = 0, movedRooms = 0, skippedFurn = 0;
  (Array.isArray(c.rooms) ? c.rooms : []).slice(0, MAX_ROOMS).forEach(o => {
    const T = o && TYPES[o.type]; if (!T) { skippedRooms++; return }
    const w = clamp(Math.round(+o.w) || T.w, 1, GW), d = clamp(Math.round(+o.d) || T.d, 1, GD);
    let x = Math.round(+o.x), z = Math.round(+o.z), ok = Number.isFinite(x) && Number.isFinite(z) && free(house, x, z, w, d);
    if (!ok) { const p = spot(house, w, d); if (!p) { skippedRooms++; return } [x, z] = p; movedRooms++ }
    const r = makeRoom(o.type, w, d, x, z);
    r.floor = FLOORS.some(f => f.id === o.floor) ? o.floor : null;
    const fw = o.fin && o.fin.wall;
    r.fin = { wall: WALL_FINISHES.includes(fw) ? fw : INT_WALL_DEFAULT };
    r.open = (Array.isArray(o.open) ? o.open : []).slice(0, 24).map(cleanOpening).filter(Boolean);
    (Array.isArray(o.furn) ? o.furn : []).slice(0, MAX_FURN).forEach(f => {
      const b = f && FLIST[f.key]; if (!b) { skippedFurn++; return }
      const rq = f.r != null ? ((+f.r % 4) + 4) % 4 : (f.rot ? 1 : 0);
      const it = { id: nextId(), key: f.key, x: +f.x || 0, z: +f.z || 0, r: rq, m: null };
      const fin = b.fin && FIN_MATS[b.fin];
      if (fin && fin.includes(f.m)) it.m = f.m;
      clampFurn(r, it); r.furn.push(it);
    });
    house.rooms.push(r);
  });
  (Array.isArray(c.extras) ? c.extras : []).slice(0, 20).forEach(e => {
    const K = e && EXTRA_KINDS[e.k]; if (!K) return;
    const ex = { id: nextId(), k: e.k, x: Math.round(+e.x) || 0, z: Math.round(+e.z) || 0, w: clamp(Math.round(+e.w) || K.w, K.wMin, K.wMax), d: clamp(Math.round(+e.d) || K.d, K.dMin, K.dMax), r: ((+e.r % 4) + 4) % 4 || 0 };
    if (!extraProblem(house, ex)) house.extras.push(ex);
  });
  if (skippedRooms) notes.push(`Не удалось восстановить комнат: ${skippedRooms}.`);
  if (movedRooms) notes.push(`Комнат перенесено на свободное место: ${movedRooms}.`);
  if (skippedFurn) notes.push(`Предметов мебели не распознано: ${skippedFurn}.`);
  return { house, notes };
}

/* Модель → JSON, который читает серверная часть и панель сотрудников.
   Поля v/wall/floor/roof/rooms[].type,x,z,w,d,floor,furn[].key,x,z,rot — прежний контракт (v:2).
   Всё остальное — необязательные дополнения; прежние версии их просто игнорируют. */
export function serializeProject(house) {
  const out = {
    v: 2, wall: house.wall, floor: house.floor, roof: !!house.roof,
    rooms: house.rooms.map(r => {
      const o = {
        type: r.type, x: r.x, z: r.z, w: r.w, d: r.d, floor: r.floor || null,
        furn: r.furn.map(f => {
          const q = { key: f.key, x: r2(f.x), z: r2(f.z), rot: (f.r || 0) % 2 === 1 };
          if (f.r) q.r = f.r;
          if (f.m) q.m = f.m;
          return q;
        })
      };
      if (r.open.length) o.open = r.open.map(p => ({ k: p.k, s: p.s, p: r2(p.p), w: r2(p.w), h: r2(p.h), y: r2(p.y) }));
      if (r.fin && r.fin.wall !== INT_WALL_DEFAULT) o.fin = { wall: r.fin.wall };
      return o;
    }),
    facade: house.facade, roofType: house.roofType, roofMat: house.roofMat, frame: house.frame
  };
  if (house.facadeTint) out.facadeTint = house.facadeTint;
  if (house.extras.length) out.extras = house.extras.map(e => ({ k: e.k, x: e.x, z: e.z, w: e.w, d: e.d, r: e.r || 0 }));
  return out;
}

export const cloneHouse = h => JSON.parse(JSON.stringify(h));
export const houseKey = h => JSON.stringify(h);
export { r2, r3 };
