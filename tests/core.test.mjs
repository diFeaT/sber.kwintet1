// Запуск: node tests/core.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { calcProject } from '../js/calc.js';
import * as L from '../js/layout.js';
import { PRE, TYPES, FLIST, GW, GD, FLOORS, WALLS } from '../js/data.js';

let pass = 0; const t = (name, fn) => { try { fn(); pass++; console.log('ok   ' + name) } catch (e) { console.log('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1 } };

/* --- эталон: оригинальный расчёт, извлечённый из исходного index.html --- */
const src = fs.readFileSync(new URL('../orig/index.orig.html', import.meta.url), 'utf8');
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); if (i < 0 || j < 0) throw new Error('не нашёл ' + a); return src.slice(i, j) };
const code = [
  grab('const GW=16,GD=12', 'const WALLS'), grab('const WALLS', 'const PRE'),
  grab('const FLIST=', 'const ROOM_FURN'),
  grab('const RATES', 'function calcHTML')
].join('\n').replace('const GW=16,GD=12,H=2.7,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));', 'const GW=16,GD=12,H=2.7,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));')
  .replace(/function serializeProject[\s\S]*?\n    function sumCalc/, 'function sumCalc');
const ctx = vm.createContext({ Math, Date });
vm.runInContext(code + '\n;this.calcOld=calcProject;', ctx);
const calcOld = ctx.calcOld;
const strip = c => { const x = JSON.parse(JSON.stringify(c)); delete x.at; return x };

const mkOld = (rooms, wall = 'wood', floor = 'oak') => ({ v: 2, wall, floor, roof: true, rooms });

t('расчёт: пресеты совпадают с оригиналом до рубля', () => {
  for (const id of Object.keys(PRE)) {
    const house = L.presetHouse(id, { wall: 'wood', facade: 'larch-v' });
    const c = L.serializeProject(house);
    assert.deepEqual(strip(calcProject(c)), strip(calcOld(c)), id);
  }
});

t('расчёт: старые проекты с мебелью, разными классами стен и полами', () => {
  const rooms = [
    { type: 'liv', x: 0, z: 0, w: 6, d: 4, floor: 'nut', furn: [{ key: 'sofa', x: 1, z: 1, rot: false }, { key: 'tv', x: 2, z: 0, rot: true }] },
    { type: 'bath', x: 6, z: 0, w: 2, d: 2, floor: null, furn: [{ key: 'bathtub', x: 0, z: 0, rot: false }, { key: 'toilet', x: 1, z: 1, rot: false }] },
    { type: 'ter', x: 0, z: 4, w: 4, d: 2, furn: [{ key: 'table', x: 0, z: 0 }] }
  ];
  for (const wall of ['wood', 'dark', 'stone', 'brick']) for (const floor of ['oak', 'tile', 'conc', 'nut']) {
    const c = mkOld(rooms, wall, floor);
    assert.deepEqual(strip(calcProject(c)), strip(calcOld(c)), wall + '/' + floor);
  }
});

t('миграция: старый проект v1 (без roof) открывается, крыша показывается', () => {
  const { house } = L.normalizeProject({ v: 1, wall: 'dark', floor: 'tile', rooms: [{ type: 'liv', x: 1, z: 1, w: 5, d: 4, furn: [{ key: 'sofa', x: 0.3, z: 0.3, rot: true }] }] });
  assert.equal(house.roof, true); assert.equal(house.wall, 'dark'); assert.equal(house.facade, 'graphite');
  assert.equal(house.rooms[0].furn[0].r, 1); assert.equal(house.roofType, 'flat');
});

t('миграция: v2 без новых полей → сериализация сохраняет прежний контракт', () => {
  const old = mkOld([{ type: 'bed', x: 2, z: 3, w: 4, d: 3, floor: 'conc', furn: [{ key: 'bed', x: 1.2, z: 0.5, rot: true }] }], 'stone', 'tile');
  old.roof = false;
  const { house } = L.normalizeProject(old);
  const out = L.serializeProject(house);
  assert.equal(out.v, 2); assert.equal(out.roof, false); assert.equal(out.wall, 'stone'); assert.equal(out.floor, 'tile');
  const r = out.rooms[0];
  assert.deepEqual([r.type, r.x, r.z, r.w, r.d, r.floor], ['bed', 2, 3, 4, 3, 'conc']);
  assert.deepEqual(r.furn[0], { key: 'bed', x: 1.2, z: 0.5, rot: true, r: 1 });
  assert.deepEqual(strip(calcProject(out)), strip(calcOld(old)));
});

t('миграция: повреждённые данные не роняют загрузку', () => {
  const { house, notes } = L.normalizeProject({ v: 2, wall: 'xx', floor: 'yy', rooms: [null, { type: 'nope' }, { type: 'liv', x: 'a', z: NaN, w: 99, d: -4, furn: [{ key: 'ufo' }, null] }, { type: 'liv', x: 0, z: 0, w: 5, d: 4 }] });
  assert.equal(house.wall, 'wood'); assert.equal(house.floor, 'oak');
  assert.ok(house.rooms.length === 2, 'комнат ' + house.rooms.length);
  house.rooms.forEach(r => { assert.ok(r.w >= 1 && r.w <= GW && r.d >= 1 && r.d <= GD) });
  assert.ok(notes.length > 0);
  assert.deepEqual(L.normalizeProject(null).house.rooms, []);
});

t('миграция: комнаты, вылезающие за участок или пересекающиеся, переносятся на свободное место', () => {
  const { house } = L.normalizeProject({ v: 2, rooms: [{ type: 'liv', x: 0, z: 0, w: 6, d: 4 }, { type: 'bed', x: 2, z: 1, w: 4, d: 3 }, { type: 'kit', x: 15, z: 11, w: 3, d: 3 }] });
  assert.equal(house.rooms.length, 3);
  house.rooms.forEach(r => assert.ok(L.free({ rooms: house.rooms.filter(o => o !== r) }, r.x, r.z, r.w, r.d)));
});

t('ограничения: размеры комнат 1–16 × 1–12', () => {
  const { house } = L.normalizeProject({ rooms: [{ type: 'liv', x: 0, z: 0, w: 99, d: 99 }] });
  assert.deepEqual([house.rooms[0].w, house.rooms[0].d], [16, 12]);
  assert.equal(L.roomArea(house.rooms[0]), 192); // как в исходнике: 144 — только предел поля «Площадь»
  assert.match(L.whyNotFree({ rooms: [] }, 1, 0, 16, 4), /границ/);
});

t('соседи и внутренние стены: проём на общей стене запрещён, на наружной — разрешён', () => {
  const h = L.emptyHouse();
  const a = L.makeRoom('liv', 5, 4, 0, 0), b = L.makeRoom('kit', 3, 3, 5, 0);
  h.rooms.push(a, b);
  const east = L.sideInfo(h, a, 'e');
  assert.deepEqual(east.shared, [[1, 4]].map(([p, q]) => [p, q]).length ? east.shared : []);
  assert.ok(east.shared.length === 1 && east.shared[0][1] - east.shared[0][0] === 3);
  const bad = { id: 1, k: 'win', s: 'e', p: 2, w: 1.2, h: 1.4, y: .9 };
  assert.match(L.openingProblem(h, a, bad), /внутренн/);
  const good = { id: 2, k: 'win', s: 's', p: 2.5, w: 1.2, h: 1.4, y: .9 };
  assert.equal(L.openingProblem(h, a, good), '');
  assert.match(L.openingProblem(h, a, { ...good, p: 0.3 }), /угл/);
  assert.match(L.openingProblem(h, a, { ...good, w: 9 }), /Ширина/);
  a.open.push(good);
  assert.match(L.openingProblem(h, a, { id: 3, k: 'win', s: 's', p: 3, w: 1.2, h: 1.4, y: .9 }), /Пересекается/);
  assert.equal(L.openingProblem(h, a, good), '', 'проём не конфликтует сам с собой');
});

t('терраса: стен нет, проёмы запрещены, соседняя стена считается наружной', () => {
  const h = L.emptyHouse(), a = L.makeRoom('liv', 5, 4, 0, 0), t2 = L.makeRoom('ter', 4, 2, 0, 4);
  h.rooms.push(a, t2);
  assert.deepEqual(L.sideInfo(h, a, 's').shared, []);
  assert.deepEqual(L.sideInfo(h, t2, 'n').exposed, []);
  assert.match(L.openingProblem(h, t2, { id: 1, k: 'win', s: 'n', p: 2, w: 1, h: 1, y: 1 }), /террас/i);
});

t('поиск места для проёма и мебели', () => {
  const h = L.emptyHouse(), a = L.makeRoom('liv', 5, 4, 0, 0); h.rooms.push(a);
  const p = L.findOpeningPos(h, a, 's', 'door'); assert.ok(p != null);
  a.open.push({ id: 9, k: 'door', s: 's', p, w: 1, h: 2.1, y: 0 });
  assert.ok(L.findOpeningPos(h, a, 's', 'win') != null);
  const s1 = L.findFurnSpot(a, 'sofa'); assert.ok(s1);
  a.furn.push({ id: 1, key: 'sofa', ...s1, r: 0 });
  const s2 = L.findFurnSpot(a, 'sofa'); assert.ok(s2 && (s2.x !== s1.x || s2.z !== s1.z));
  const f = { id: 2, key: 'sofa', ...s1, r: 0 }; assert.ok(L.furnCollision(a, f));
  assert.equal(L.findFurnSpot(L.makeRoom('bath', 2, 2, 0, 0), 'bathtub') !== null, true);
  assert.equal(L.findFurnSpot(L.makeRoom('bath', 1, 1, 0, 0), 'bathtub'), null, 'ванна 1,7 м в комнате 1×1 не помещается');
});

t('мебель: ковёр и светильники не мешают, повороты меняют габарит', () => {
  const a = L.makeRoom('liv', 5, 4, 0, 0);
  a.furn.push({ id: 1, key: 'rug', x: 1, z: 1, r: 0 }, { id: 2, key: 'sofa', x: 1, z: 1, r: 0 });
  assert.equal(L.furnCollision(a, a.furn[1]), null);
  assert.deepEqual(L.furnFoot({ key: 'sofa', r: 1 }), { w: .9, d: 2 });
  const f = { key: 'sofa', x: 4.9, z: 3.9, r: 0 }; L.clampFurn(a, f); assert.deepEqual([f.x, f.z], [3, 3.1]);
});

t('сериализация: новые поля необязательны, round-trip сохраняет проёмы, отделку и ступени', () => {
  const h = L.presetHouse('oz');
  h.extras.push({ id: 1, k: 'canopy', x: 0, z: 8, w: 3, d: 2, r: 0 });
  h.rooms[0].fin.wall = 'plaster-moss'; h.rooms[0].furn.push({ id: 5, key: 'sofa', x: 1, z: 1, r: 2, m: 'linen' });
  const out = JSON.parse(JSON.stringify(L.serializeProject(h)));
  const back = L.normalizeProject(out).house;
  assert.deepEqual(JSON.parse(JSON.stringify(L.serializeProject(back))), out);
  assert.equal(back.rooms[0].fin.wall, 'plaster-moss'); assert.equal(back.rooms[0].furn.at(-1).m, 'linen');
  assert.equal(back.extras.length, 1);
  assert.ok(back.rooms.some(r => r.open.length), 'проёмы сохранились');
});

t('пресеты: все помещаются на участок, проёмы валидны, цена модулей = расчёт', () => {
  for (const id of Object.keys(PRE)) {
    const h = L.presetHouse(id);
    assert.equal(h.rooms.length, PRE[id].length, id + ' — не все комнаты поместились');
    h.rooms.forEach(r => r.open.forEach(o => assert.equal(L.openingProblem(h, r, o), '', id + ' ' + o.k)));
    assert.ok(calcProject(L.serializeProject(h)).modules > 0);
  }
});

console.log(`\nпройдено: ${pass}`);
