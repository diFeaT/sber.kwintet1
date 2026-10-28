/* Конструктор: состояние интерфейса, взаимодействие с мышью/касанием/клавиатурой, правки с проверками,
   черновик, сводка и обучение. Проект хранится в store (js/store.js), 3D рисует js/scene.js,
   HTML панелей строит js/panels.js. Серверные вызовы (отправка дизайнеру) остаются в js/app.js. */
import {
  GW, GD, H, MODES, TYPES, FLIST, OPENING_KINDS, EXTRA_KINDS, OPEN_MARGIN, FLOORS, FACADES, FRAMES, ROOF_TYPES, ROOF_MATS, WALL_FINISHES, FIN_MATS,
  facadeById, matById, MODELS, READY_HOMES, MAX_ROOMS, MAX_FURN, FGRID, MAX_AREA_INPUT, MCATS, SIDES
} from './data.js';
import * as L from './layout.js';
import { createStore } from './store.js';
import { renderLeft, renderProps, renderTotal, summaryHTML, compareHTML, projectNumbers, roomName } from './panels.js';
import { drawPlan } from './plan2d.js';
import { ICON } from './icons.js';
import { $, $$, esc, fmt, clamp, gtoast, ask } from './util.js';
import { ensureThree, THREEMSG } from './three-loader.js';
import { createScene, webglAvailable, FY } from './scene.js';

const r2 = L.r2;
const S = {
  mode: 'exterior', sel: null, activeRoom: null, cut: 'cut', iview: 'iso', env: true, shadows: true, time: 'day', autoRotate: false, lock: false,
  matTarget: 'facade', matCat: 'all', cmp: [], furnCat: 'sofa', tab: 'tools', bad: false, readOnly: false,
  meta: { title: '', projectId: null, status: null, model: 'oz' }, saveState: 'clean', savedAt: 0, submittedRev: 0, loaded: false
};
let store = null, sc = null, hooks = {}, bound = false, fallback = false, noteT = 0, saveT = 0, panelsRaf = 0, planMap = null;
let canvas, stage;
const H0 = () => store.house;
const getRoom = id => H0().rooms.find(r => r.id === id) || null;
const activeRoom = () => getRoom(S.activeRoom);
const ctx = () => ({ h: H0(), S, room: activeRoom() });

/* ---------- сообщения ---------- */
function note(msg, kind = 'info') {
  const el = $('#stuToast'); if (!el) return gtoast(msg);
  el.textContent = msg; el.dataset.kind = kind; el.classList.add('on'); clearTimeout(noteT);
  noteT = setTimeout(() => el.classList.remove('on'), kind === 'warn' ? 5200 : 3200);
}

/* ---------- представление сцены ---------- */
function viewFor() {
  const m = S.mode, h = H0(), inside = m === 'interior' && S.iview === 'inside';
  return {
    mode: m, showRoof: m === 'plan' ? false : m === 'interior' ? inside : !!h.roof, cut: m === 'interior' ? (inside ? 'full' : S.cut) : 'full',
    env: m === 'overview' && S.env, shadows: S.shadows, time: S.time, autoRotate: m === 'overview' && S.autoRotate, activeRoom: S.activeRoom, plan: m === 'plan'
  };
}
const hlSel = () => { const s = S.sel; if (!s) return null; if (s.t === 'roof') return { t: 'room', id: s.roomId }; return s };
function syncScene() { if (sc) { sc.sync(H0(), viewFor()); sc.setHighlight(hlSel(), S.bad) } else if (fallback) drawFallback() }

/* ---------- панели ---------- */
function renderPanels(only) {
  const c = ctx(), act = document.activeElement, fid = act && act.closest && act.closest('#stuLeft,#stuProps,#stuTotal') ? act.id : '';
  if (!only || only === 'left') $('#stuLeft').innerHTML = renderLeft(c);
  if (!only || only === 'props') $('#stuProps').innerHTML = renderProps(c);
  if (!only || only === 'total') $('#stuTotal').innerHTML = renderTotal(c);
  if (fid) { const el = document.getElementById(fid); if (el && el !== document.activeElement) { try { el.focus({ preventScroll: true }) } catch (e) { } } }
  $('#stuTabs').classList.toggle('has-sel', !!S.sel);
}
function schedulePanels(only) { cancelAnimationFrame(panelsRaf); panelsRaf = requestAnimationFrame(() => renderPanels(only)) }

function updateChrome() {
  const h = H0(), n = projectNumbers(h);
  $('#stuUndo').disabled = !store.canUndo; $('#stuRedo').disabled = !store.canRedo;
  $('#stuInfo').innerHTML = `<span><b>${h.rooms.length}</b> комн.</span><span><b>${n.area}</b> м²</span>${n.bbox ? `<span>${n.bbox.w}×${n.bbox.d} м</span>` : ''}<span class="pr">≈ ${fmt(n.calc.modules)}</span>`;
  $$('#stuModes [data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === S.mode));
  $('#stuBody').dataset.mode = S.mode;
  status();
}

function status() {
  const el = $('#stuStatus'), t = $('#stuTitle'); if (!el) return;
  let txt, cls = 'info';
  const unsent = store.rev > S.submittedRev;
  if (S.readOnly) { txt = 'Просмотр проекта клиента: изменения не сохраняются'; cls = 'warn' }
  else if (S.saveState === 'error') { txt = 'Не удалось сохранить черновик на устройстве'; cls = 'err' }
  else if (S.saveState === 'pending') { txt = 'Есть несохранённые изменения…'; cls = 'warn' }
  else if (S.saveState === 'saved') { txt = 'Черновик сохранён на этом устройстве' + (S.savedAt ? ', ' + new Date(S.savedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '') + (unsent ? ' · не отправлен дизайнеру' : ''); cls = 'ok' }
  else if (S.saveState === 'sent' && !unsent) { txt = 'Отправлено дизайнеру'; cls = 'ok' }
  else if (S.meta.projectId && !unsent) { txt = 'Проект загружен с сервера: ' + ({ submitted: 'на согласовании', revision: 'на доработке', approved: 'согласован', paid: 'оплачен' }[S.meta.status] || '—'); cls = 'info' }
  else { txt = 'Новых изменений нет'; cls = 'info' }
  el.textContent = txt; el.dataset.kind = cls;
  $('#stuSave').hidden = S.readOnly; $('#toChat').hidden = S.readOnly;
  // «В готовые дома»: только владелец и креативный дизайнер, и только в собственном (не клиентском) проекте
  $('#toReady').hidden = S.readOnly || !(hooks.canManageReady && hooks.canManageReady());
  $('#stuDelete').hidden = S.readOnly || !S.meta.projectId || S.meta.status === 'paid';
  $('#stuBanner').hidden = !S.readOnly;
}

function afterChange(kind) {
  validateSel();
  syncScene(); updateChrome();
  if (kind === 'live') { if (S.drag) schedulePanels('props'); const a = document.activeElement; if (!(a && a.dataset && a.dataset.live)) { } $('#stuInfo') && 0; return }
  renderPanels();
  if (kind === 'change') scheduleSave();
}
function validateSel() {
  const h = H0(), s = S.sel;
  if (S.activeRoom != null && !getRoom(S.activeRoom)) S.activeRoom = h.rooms[0] ? h.rooms[0].id : null;
  if (S.activeRoom == null && h.rooms[0]) S.activeRoom = h.rooms[0].id;
  if (!s) return;
  const r = s.roomId != null ? getRoom(s.roomId) : s.t === 'room' ? getRoom(s.id) : null;
  let ok = true;
  if (s.t === 'extra') ok = h.extras.some(e => e.id === s.id);
  else if (!r) ok = false;
  else if (s.t === 'open') ok = r.open.some(o => o.id === s.id);
  else if (s.t === 'furn') ok = r.furn.some(f => f.id === s.id);
  else if (s.t === 'wall') ok = !L.isOpen(r);
  if (!ok) S.sel = null;
}

/* ---------- сохранение черновика ---------- */
const draftKey = () => 'kw_draft_v1:' + ((hooks.user && hooks.user()) ? hooks.user().id : 'guest');
function scheduleSave() {
  if (S.readOnly) return;
  S.saveState = 'pending'; status(); clearTimeout(saveT); saveT = setTimeout(saveDraftNow, 900);
}
function saveDraftNow() {
  clearTimeout(saveT); saveT = 0; if (S.readOnly || !S.loaded) return;
  S.saveState = 'saving';
  try {
    localStorage.setItem(draftKey(), JSON.stringify({ v: 1, t: Date.now(), title: S.meta.title, projectId: S.meta.projectId, model: S.meta.model, config: L.serializeProject(H0()) }));
    S.saveState = 'saved'; S.savedAt = Date.now();
  } catch (e) { S.saveState = 'error' }
  status();
}
function readDraft() {
  try { const d = JSON.parse(localStorage.getItem(draftKey()) || 'null'); return d && d.config && Array.isArray(d.config.rooms) && d.config.rooms.length ? d : null } catch (e) { return null }
}
window.addEventListener('beforeunload', e => {
  if (!S.loaded || S.readOnly || $('#view-config').hidden && !saveT) return;
  const unsavedLocal = !!saveT || S.saveState === 'error', unsentServer = !!S.meta.projectId && store.rev > S.submittedRev;
  if (unsavedLocal || unsentServer) { e.preventDefault(); e.returnValue = '' }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) saveDraftNow() });

/* ---------- загрузка проекта ---------- */
function setHouse(house, meta) {
  store.reset(house); S.sel = null; S.activeRoom = house.rooms[0] ? house.rooms[0].id : null; S.cmp = [];
  Object.assign(S.meta, meta || {}); S.submittedRev = 0; S.saveState = 'clean'; S.loaded = true;
  if (sc) sc.cam.fit(house); syncScene(); updateChrome(); renderPanels(); $('#stuTitle').value = S.meta.title || '';
}

function startModel(id) {
  const m = MODELS.find(x => x.id === id) || MODELS[1];
  S.readOnly = false; setHouse(L.presetHouse(m.id), { title: '', projectId: null, status: null, model: m.id });
  S.saveState = 'clean'; if (sc) { sc.cam.preset('iso', H0()); sc.cam.snap() }
}
/* Готовый дом с мебелью (READY_HOMES): открывается как новый проект, дальше его можно менять и отправить */
function startReady(id) {
  const v = READY_HOMES.find(x => x.id === id) || READY_HOMES[0];
  S.readOnly = false; setHouse(L.readyHouse(v.id), { title: '', projectId: null, status: null, model: v.base });
  S.saveState = 'clean'; if (sc) { sc.cam.preset('iso', H0()); sc.cam.snap() }
}
/* Готовый дом из базы (таблица ready_homes): config в формате проекта, открывается тем же загрузчиком */
function startReadyConfig(config, base) {
  const { house, notes } = L.normalizeProject(config);
  S.readOnly = false; setHouse(house, { title: '', projectId: null, status: null, model: base || 'proj' });
  S.saveState = 'clean'; if (sc) { sc.cam.preset('iso', H0()); sc.cam.snap() }
  return { notes };
}

/* ---------- правки ---------- */
const mut = fn => store.mutate(h => fn(h));
const findRoomIn = (h, id) => h.rooms.find(r => r.id === id);

function addRoom(type) {
  const h = H0(), T = TYPES[type]; if (!T) return;
  if (h.rooms.length >= MAX_ROOMS) return note(`Достигнут предел: не больше ${MAX_ROOMS} комнат.`, 'warn');
  const p = L.spot(h, T.w, T.d); if (!p) return note('На участке нет места. Уменьшите или удалите комнату.', 'warn');
  const r = L.makeRoom(type, T.w, T.d, p[0], p[1]);
  mut(x => x.rooms.push(r)); select({ t: 'room', id: r.id });
}
function resizeRoom(id, w, d) {
  const h = H0(), r = findRoomIn(h, id); if (!r) return false;
  w = clamp(Math.round(w) || 1, 1, GW); d = clamp(Math.round(d) || 1, 1, GD);
  const x = Math.min(r.x, GW - w), z = Math.min(r.z, GD - d), why = L.whyNotFree(h, x, z, w, d, r);
  if (why) { note(why, 'warn'); renderPanels(); return false }
  let moved = false;
  mut(hh => {
    const q = findRoomIn(hh, id); q.x = x; q.z = z; q.w = w; q.d = d;
    q.furn.forEach(f => { const a = f.x, b = f.z; L.clampFurn(q, f); if (a !== f.x || b !== f.z) moved = true });
    q.open.forEach(o => { const len = (o.s === 'n' || o.s === 's') ? q.w : q.d; o.p = r2(clamp(o.p, o.w / 2 + OPEN_MARGIN, Math.max(o.w / 2 + OPEN_MARGIN, len - o.w / 2 - OPEN_MARGIN))) });
  });
  if (moved) note('Часть мебели сдвинута внутрь уменьшенной комнаты.', 'info');
  const bad = findRoomIn(H0(), id).open.filter(o => L.openingProblem(H0(), findRoomIn(H0(), id), o)).length;
  if (bad) note(`Окон и дверей, которые больше не помещаются или закрыты соседней комнатой: ${bad}. Они не показываются: сдвиньте или удалите их.`, 'warn');
  return true;
}
function moveRoom(id, dx, dz) {
  const h = H0(), r = findRoomIn(h, id); if (!r) return;
  const why = L.whyNotFree(h, r.x + dx, r.z + dz, r.w, r.d, r); if (why) return note(why, 'warn');
  mut(hh => { const q = findRoomIn(hh, id); q.x += dx; q.z += dz });
}
async function deleteRoom(id) {
  const r = getRoom(id); if (!r) return;
  if (r.furn.length || r.open.length) { if (!(await ask(`Удалить комнату «${roomName(r)}»? Вместе с ней удалятся мебель (${r.furn.length}), окна и двери (${r.open.length}). Действие можно отменить.`, { ok: 'Удалить', danger: true, title: 'Удалить комнату' }))) return }
  mut(h => { h.rooms = h.rooms.filter(x => x.id !== id) }); S.sel = null; afterChange('change');
}
function duplicateRoom(id) {
  const h = H0(), r = findRoomIn(h, id); if (!r) return;
  if (h.rooms.length >= MAX_ROOMS) return note(`Достигнут предел: не больше ${MAX_ROOMS} комнат.`, 'warn');
  const p = L.spot(h, r.w, r.d); if (!p) return note('Для копии нет свободного места на участке.', 'warn');
  const c = JSON.parse(JSON.stringify(r)); c.id = L.nextId(); c.x = c.x0 = p[0]; c.z = c.z0 = p[1];
  c.furn.forEach(f => f.id = L.nextId()); c.open.forEach(o => o.id = L.nextId());
  mut(hh => hh.rooms.push(c)); select({ t: 'room', id: c.id });
}
function resetRoomPos(id) {
  const h = H0(), r = findRoomIn(h, id); if (!r) return;
  if (r.x === r.x0 && r.z === r.z0) return note('Комната уже на исходном месте.');
  const why = L.whyNotFree(h, r.x0, r.z0, r.w, r.d, r); if (why) return note('Исходное место занято: ' + why, 'warn');
  mut(hh => { const q = findRoomIn(hh, id); q.x = q.x0; q.z = q.z0 });
}
async function applyPreset(id) {
  const m = MODELS.find(x => x.id === id);
  if (H0().rooms.length && !(await ask(`Заменить текущие комнаты планировкой «${m.name}»? Мебель и окна текущего проекта будут потеряны. Это можно отменить.`, { ok: 'Заменить', title: 'Готовая планировка' }))) return;
  const nh = L.presetHouse(id); mut(h => { Object.keys(h).forEach(k => delete h[k]); Object.assign(h, nh) });
  S.meta.model = id; S.sel = null; S.activeRoom = H0().rooms[0] && H0().rooms[0].id; if (sc) sc.cam.fit(H0()); afterChange('change');
}

function findOpen(id) { const h = H0(); for (const r of h.rooms) { const o = r.open.find(x => x.id === id); if (o) return { room: r, op: o } } return {} }
function addOpening(roomId, side, kind) {
  const h = H0(), r = findRoomIn(h, roomId), K = OPENING_KINDS[kind]; if (!r) return;
  const p = L.findOpeningPos(h, r, side, kind); if (p == null) return note('На этой стене нет свободного места для такого проёма.', 'warn');
  const o = { id: L.nextId(), k: kind, s: side, p, w: K.w, h: K.h, y: K.y };
  mut(hh => findRoomIn(hh, roomId).open.push(o)); select({ t: 'open', roomId, id: o.id });
}
function patchOpening(id, patch) {
  const { room, op } = findOpen(id); if (!op) return;
  const cand = { ...op, ...patch };
  if (patch.k) { const K = OPENING_KINDS[patch.k]; cand.w = r2(clamp(cand.w, K.wMin, K.wMax)); cand.h = r2(clamp(cand.h, K.hMin, K.hMax)); cand.y = K.door ? 0 : r2(clamp(Math.max(cand.y, K.ymin), K.ymin, H - 0.1 - cand.h)) }
  ['p', 'w', 'h', 'y'].forEach(k => cand[k] = r2(+cand[k]));
  if ([cand.p, cand.w, cand.h, cand.y].some(v => !Number.isFinite(v))) return renderPanels();
  const why = L.openingProblem(H0(), room, cand); if (why) { note(why, 'warn'); renderPanels(); return }
  mut(h => Object.assign(findOpen2(h, id), cand));
}
const findOpen2 = (h, id) => { for (const r of h.rooms) { const o = r.open.find(x => x.id === id); if (o) return o } return {} };

function addExtra(kind) {
  const h = H0(), K = EXTRA_KINDS[kind]; if (h.extras.length >= 20) return note('Слишком много элементов участка.', 'warn');
  const ex = { id: L.nextId(), k: kind, x: 0, z: 0, w: K.w, d: K.d, r: 0 }, p = L.extraSpot(h, ex);
  if (!p) return note('На участке нет места для этого элемента.', 'warn');
  ex.x = p[0]; ex.z = p[1]; mut(hh => hh.extras.push(ex)); select({ t: 'extra', id: ex.id });
}
function patchExtra(id, patch) {
  const e = H0().extras.find(x => x.id === id); if (!e) return;
  const K = EXTRA_KINDS[e.k], cand = { ...e, ...patch };
  cand.w = clamp(Math.round(cand.w) || K.w, K.wMin, K.wMax); cand.d = clamp(Math.round(cand.d) || K.d, K.dMin, K.dMax); cand.x = Math.round(cand.x); cand.z = Math.round(cand.z);
  const why = L.extraProblem(H0(), cand); if (why) { note(why, 'warn'); renderPanels(); return false }
  mut(h => Object.assign(h.extras.find(x => x.id === id), cand)); return true;
}

function addFurn(key) {
  const r = activeRoom(); if (!r) return note('Сначала выберите комнату.', 'warn');
  if (r.furn.length >= MAX_FURN) return note(`В комнате уже ${MAX_FURN} предметов.`, 'warn');
  const p = L.findFurnSpot(r, key); if (!p) return note(`В комнате «${roomName(r)}» нет свободного места для «${FLIST[key].n}». Выберите комнату побольше или уберите лишнее.`, 'warn');
  const f = { id: L.nextId(), key, x: p.x, z: p.z, r: 0, m: null };
  mut(h => findRoomIn(h, r.id).furn.push(f)); select({ t: 'furn', roomId: r.id, id: f.id });
}
function patchFurn(roomId, id, patch, quiet) {
  const room = getRoom(roomId), f = room && room.furn.find(x => x.id === id); if (!f) return false;
  const cand = { ...f, ...patch }; L.clampFurn(room, cand);
  const col = L.furnCollision(room, cand);
  if (col) { if (!quiet) note(`Не помещается: пересекается с предметом «${FLIST[col.key].n}».`, 'warn'); renderPanels(); return false }
  mut(h => Object.assign(findRoomIn(h, roomId).furn.find(x => x.id === id), cand)); return true;
}
function rotateFurn(roomId, id) {
  const room = getRoom(roomId), f = room && room.furn.find(x => x.id === id); if (!f) return;
  const a = L.furnFoot(f), cx = f.x + a.w / 2, cz = f.z + a.d / 2, r = ((f.r || 0) + 1) % 4, b = L.furnFoot({ key: f.key, r });
  patchFurn(roomId, id, { r, x: cx - b.w / 2, z: cz - b.d / 2 });
}
function duplicateFurn(roomId, id) {
  const room = getRoom(roomId), f = room && room.furn.find(x => x.id === id); if (!f) return;
  if (room.furn.length >= MAX_FURN) return note(`В комнате уже ${MAX_FURN} предметов.`, 'warn');
  const probe = { ...f, id: -1 }; let best = null;
  for (let k = 1; k < 40 && !best; k++) for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1]]) {
    const q = { ...probe, x: f.x + dx * k * .25, z: f.z + dz * k * .25 }; L.clampFurn(room, q); if (!L.furnCollision(room, q)) { best = q; break }
  }
  if (!best) { const p = L.findFurnSpot(room, f.key); if (!p) return note('Для копии нет свободного места в комнате.', 'warn'); best = { ...probe, x: p.x, z: p.z } }
  const c = { id: L.nextId(), key: f.key, x: best.x, z: best.z, r: f.r || 0, m: f.m || null };
  mut(h => findRoomIn(h, roomId).furn.push(c)); select({ t: 'furn', roomId, id: c.id });
}
function duplicateOpen(id) {
  const { room, op } = findOpen(id); if (!op) return;
  const p = L.findOpeningPos(H0(), room, op.s, op.k, op.w); if (p == null) return note('На этой стене нет места для копии.', 'warn');
  const c = { ...op, id: L.nextId(), p }; mut(h => findRoomIn(h, room.id).open.push(c)); select({ t: 'open', roomId: room.id, id: c.id });
}
function duplicateExtra(id) {
  const e = H0().extras.find(x => x.id === id); if (!e) return;
  const p = L.extraSpot(H0(), { ...e }); if (!p) return note('На участке нет места для копии.', 'warn');
  const c = { ...e, id: L.nextId(), x: p[0], z: p[1] }; mut(h => h.extras.push(c)); select({ t: 'extra', id: c.id });
}

async function deleteSelection() {
  const s = S.sel; if (!s) return;
  if (s.t === 'room') return deleteRoom(s.id);
  if (s.t === 'open') { mut(h => { const r = findRoomIn(h, s.roomId); r.open = r.open.filter(o => o.id !== s.id) }); S.sel = { t: 'wall', roomId: s.roomId, side: findOpenSide(s) }; return afterChange('change') }
  if (s.t === 'furn') { mut(h => { const r = findRoomIn(h, s.roomId); r.furn = r.furn.filter(f => f.id !== s.id) }); S.sel = null; return afterChange('change') }
  if (s.t === 'extra') { mut(h => { h.extras = h.extras.filter(e => e.id !== s.id) }); S.sel = null; return afterChange('change') }
}
const findOpenSide = s => { const o = (getRoom(s.roomId) || { open: [] }).open.find(x => x.id === s.id); return o ? o.s : 's' };

/* ---------- выбор ---------- */
function select(sel) {
  S.sel = sel;
  if (sel) { if (sel.roomId != null) S.activeRoom = sel.roomId; else if (sel.t === 'room') S.activeRoom = sel.id }
  if (S.mode === 'materials' && sel) S.matTarget = { wall: sel.layer === 'in' ? 'wall' : 'facade', roof: 'roof', open: 'frame', furn: 'furn', room: 'floor' }[sel.t] || S.matTarget;
  if (S.mode === 'interior' && sel && sel.t !== 'furn' && (S.iview === 'room' || S.iview === 'inside') && sc) applyIview();
  validateSel(); syncScene(); renderPanels();
}

/* ---------- режимы и камера ---------- */
function applyIview() {
  if (!sc) return; const r = activeRoom();
  if (S.iview === 'top') sc.cam.preset('top', H0());
  else if (S.iview === 'iso') sc.cam.preset('iso', H0());
  else if (S.iview === 'room' && r) sc.cam.focusRoom(r);
  else if (S.iview === 'inside' && r) sc.cam.enterRoom(r);
  else sc.cam.preset('iso', H0());
}
function setMode(m) {
  if (!MODES.some(x => x.id === m)) return;
  const prev = S.mode; S.mode = m;
  const s = S.sel;
  if (m === 'overview') S.sel = null;
  else if (s) { const okT = { exterior: ['wall', 'open', 'extra', 'roof', 'room'], plan: ['room', 'extra'], interior: ['room', 'furn'], materials: ['wall', 'open', 'roof', 'room', 'furn', 'extra'] }[m]; if (!okT.includes(s.t)) S.sel = null }
  if (sc) {
    if (m === 'plan') sc.cam.preset('top', H0());
    else if (m === 'interior') applyIview();
    else if (prev === 'plan' || prev === 'interior' || sc.cam.mode === 'fp') sc.cam.preset('iso', H0());
    else if (m === 'overview') sc.cam.preset('iso', H0());
  }
  syncScene(); updateChrome(); renderPanels(); renderOpts(); showHint();
}
function renderOpts() {
  const el = $('#stuOpts'); if (!el) return;
  el.innerHTML = S.mode === 'interior' ? `<button type="button" class="b sm" data-act="iview" data-v="top" aria-pressed="${S.iview === 'top'}">Сверху</button><button type="button" class="b sm" data-act="iview" data-v="iso" aria-pressed="${S.iview === 'iso'}">Изометрия</button><button type="button" class="b sm" data-act="iview" data-v="room" aria-pressed="${S.iview === 'room'}">Комната</button><button type="button" class="b sm" data-act="iview" data-v="inside" aria-pressed="${S.iview === 'inside'}">Изнутри</button>` : '';
}

const HINTS = {
  exterior: 'Щёлкните по стене, окну или двери, чтобы изменить. Окна и двери можно перетаскивать вдоль стены. Вращение: тяните пустое место; сдвиг: правая кнопка или Shift; масштаб: колесо или щипок.',
  plan: 'Тяните комнату, чтобы переместить её (шаг 1 м). Тяните пустое место — вращение. Размеры, поворот и копию ищите справа.',
  interior: 'Щёлкните по комнате, затем добавьте мебель слева. Предметы перетаскиваются по полу. «Изнутри» — вид из комнаты.',
  materials: 'Щёлкните по поверхности на модели — слева появятся подходящие материалы. Можно сравнить два образца.',
  overview: 'Режим просмотра: настройте свет слева и сделайте снимок. Объекты здесь не выбираются.'
};
function showHint() {
  const el = $('#stuHint'); if (!el) return;
  let off = false; try { off = localStorage.getItem('kw_hint_' + S.mode) === '1' } catch (e) { }
  el.hidden = off; $('#stuHintT').textContent = HINTS[S.mode];
}

/* ---------- ввод: действия ---------- */
/* На телефоне нижнюю панель можно скрыть, чтобы сцена занимала весь экран; выбор вкладки панель снова открывает */
function setPanel(open) {
  const body = $('#stuBody'), t = $('#stuPanelT'); if (!body) return;
  body.classList.toggle('panel-off', !open);
  if (t) { t.setAttribute('aria-expanded', String(open)); t.querySelector('span').textContent = open ? 'Скрыть панель' : 'Показать панель' }
}
/* Полоса режимов (Экстерьер / Планировка / Интерьер…) тоже скрывается на телефоне; сцена занимает освободившееся место */
function setModes(open) {
  const body = $('#stuBody'), t = $('#stuModesT'); if (!body) return;
  body.classList.toggle('modes-off', !open);
  if (t) { t.setAttribute('aria-expanded', String(open)); t.querySelector('span').textContent = open ? 'Скрыть вид' : 'Показать вид' }
}
const ACT = {
  mode: v => setMode(v), panel: () => setPanel($('#stuBody').classList.contains('panel-off')), modes: () => setModes($('#stuBody').classList.contains('modes-off')), tab: v => { S.tab = v; setPanel(true); $('#stuBody').dataset.tab = v; $$('#stuTabs [data-v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); sc && sc.resize() },
  facade: v => { const f = facadeById(v); mut(h => { h.facade = v; h.wall = f.priceClass }); },
  roofshow: () => mut(h => { h.roof = !h.roof }), rooftype: v => mut(h => { h.roofType = v }), roofmat: v => mut(h => { h.roofMat = v }), frame: v => mut(h => { h.frame = v }),
  facadetint: v => mut(h => { h.facadeTint = v === 'natural' ? null : v }),
  addextra: v => addExtra(v), selextra: v => select({ t: 'extra', id: +v }),
  addroom: v => addRoom(v), selroom: v => { const id = +v; if (S.mode === 'interior' || S.mode === 'materials' || S.mode === 'plan') { S.activeRoom = id; S.sel = S.mode === 'plan' ? { t: 'room', id } : (S.sel && S.sel.t === 'furn' ? null : S.sel); if (S.mode === 'plan') S.sel = { t: 'room', id }; if (S.mode === 'interior' && sc && (S.iview === 'room' || S.iview === 'inside')) applyIview(); validateSel(); syncScene(); renderPanels() } else select({ t: 'room', id }) },
  preset: v => applyPreset(v), furncat: v => { S.furnCat = v; renderPanels('left') }, addfurn: v => addFurn(v),
  iview: v => { S.iview = v; applyIview(); syncScene(); renderPanels('left'); renderOpts() }, cut: v => { S.cut = v; syncScene(); renderPanels('left') },
  mattarget: v => { S.matTarget = v; S.matCat = 'all'; renderPanels('left') }, matcat: v => { S.matCat = v; renderPanels('left') },
  floor: v => { const r = activeRoom(); if (r) mut(h => { findRoomIn(h, r.id).floor = v === h.floor ? null : v; if (v === h.floor) findRoomIn(h, r.id).floor = null }) },
  floorall: v => mut(h => { h.floor = v; h.rooms.forEach(r => { r.floor = null }) }),
  wallfin: v => { const r = activeRoom(); if (r) mut(h => { findRoomIn(h, r.id).fin.wall = v }) },
  furnfin: v => { const s = S.sel; if (s && s.t === 'furn') mut(h => { findRoomIn(h, s.roomId).furn.find(f => f.id === s.id).m = v || null }) },
  matinfo: v => { toggleCmp(v) }, cmp: () => openCompare(), cmpclear: () => { S.cmp = []; renderPanels('left') },
  env: () => { S.env = !S.env; syncScene(); renderPanels('left') }, shadows: () => { S.shadows = !S.shadows; syncScene(); renderPanels('left') }, autorot: () => { S.autoRotate = !S.autoRotate; syncScene(); renderPanels('left') },
  time: v => { S.time = v; syncScene(); renderPanels('left') },
  shot: () => exportPng(), summary: () => openSummary(),
  rotate: () => { const s = S.sel; if (!s) return; if (s.t === 'room') { const r = getRoom(s.id); resizeRoom(r.id, r.d, r.w) } else if (s.t === 'furn') rotateFurn(s.roomId, s.id); else if (s.t === 'extra') { const e = H0().extras.find(x => x.id === s.id); patchExtra(e.id, { r: ((e.r || 0) + 1) % 4, w: e.d, d: e.w }) } },
  dup: () => { const s = S.sel; if (!s) return; ({ room: () => duplicateRoom(s.id), furn: () => duplicateFurn(s.roomId, s.id), open: () => duplicateOpen(s.id), extra: () => duplicateExtra(s.id) })[s.t === 'room' ? 'room' : s.t]?.() },
  del: () => deleteSelection(), resetpos: () => S.sel && S.sel.t === 'room' && resetRoomPos(S.sel.id),
  nudge: (v, el) => { const s = S.sel, dx = +el.dataset.dx, dz = +el.dataset.dz; if (!s) return; if (s.t === 'room') moveRoom(s.id, dx, dz); else if (s.t === 'extra') { const e = H0().extras.find(x => x.id === s.id); patchExtra(e.id, { x: e.x + dx, z: e.z + dz }) } },
  step: (v, el) => stepInput(el.dataset.k, +el.dataset.d),
  addopen: v => { const s = S.sel; if (s && s.t === 'wall') addOpening(s.roomId, s.side, v) }, selopen: v => select({ t: 'open', roomId: S.sel.roomId, id: +v }), selwall: v => select({ t: 'wall', roomId: S.sel.roomId, side: v }),
  undo: () => doUndo(), redo: () => doRedo(), save: () => { saveDraftNow(); if (S.saveState === 'saved') note('Черновик сохранён на этом устройстве. Чтобы передать проект дизайнеру, нажмите «Отправить дизайнеру».', 'ok'); else note('Не удалось сохранить черновик: браузер не дал доступ к хранилищу.', 'err') },
  help: () => showTour(true), hintx: () => { try { localStorage.setItem('kw_hint_' + S.mode, '1') } catch (e) { } showHint() },
  camtop: () => camPreset('top'), camfront: () => camPreset('front'), camside: () => camPreset('side'), camiso: () => camPreset('iso'), camfit: () => { sc && (sc.cam.fit(H0())) }, camreset: () => camPreset('iso'),
  camin: () => sc && sc.cam.zoom(.8), camout: () => sc && sc.cam.zoom(1.25),
  lock: () => { S.lock = !S.lock; $('#stuLock').setAttribute('aria-pressed', S.lock); note(S.lock ? 'Объекты закреплены: мышь и пальцы только двигают камеру.' : 'Объекты можно перемещать.') },
  tourgo: v => tourGo(+v), tourx: () => closeTour()
};
function camPreset(n) { if (!sc) return; if (sc.cam.mode === 'fp') S.iview = 'iso'; sc.cam.preset(n, H0()); renderOpts() }
function doUndo() { if (store.undo()) note('Отменено') }
function doRedo() { if (store.redo()) note('Возвращено') }
function toggleCmp(id) { S.cmp = S.cmp.includes(id) ? S.cmp.filter(x => x !== id) : [...S.cmp, id].slice(-2); renderPanels('left') }

const INP = {
  'room.type': (v) => { const s = S.sel; if (s && s.t === 'room') mut(h => { const r = findRoomIn(h, s.id); r.type = v; if (L.isOpen(r)) r.open = [] }) },
  'room.w': v => { const r = getRoom(S.sel.id); resizeRoom(r.id, +v, r.d) }, 'room.d': v => { const r = getRoom(S.sel.id); resizeRoom(r.id, r.w, +v) },
  'room.a': v => { const r = getRoom(S.sel.id); resizeRoom(r.id, r.w, Math.ceil(clamp(+v || 1, 1, MAX_AREA_INPUT) / r.w)) },
  'open.k': v => patchOpening(S.sel.id, { k: v }), 'open.p': v => patchOpening(S.sel.id, { p: +v }), 'open.w': v => patchOpening(S.sel.id, { w: +v }), 'open.h': v => patchOpening(S.sel.id, { h: +v }), 'open.y': v => patchOpening(S.sel.id, { y: +v }),
  'extra.w': v => patchExtra(S.sel.id, { w: +v }), 'extra.d': v => patchExtra(S.sel.id, { d: +v }),
  'furn.x': v => patchFurn(S.sel.roomId, S.sel.id, { x: +v }), 'furn.z': v => patchFurn(S.sel.roomId, S.sel.id, { z: +v }),
  cmp: (v, el) => { if (el.checked && S.cmp.length >= 2 && !S.cmp.includes(v)) note('Сравниваются два образца: первый заменён.'); toggleCmp(v) }
};
function stepInput(key, d) {
  const el = document.getElementById('in-' + key) || document.querySelector(`[data-in="${key}"]`), cur = +(el ? el.value : 0), step = Math.abs(d) < 1 ? 100 : 1;
  const nv = Math.round((cur + d) * step * 10) / (step * 10);
  if (INP[key]) INP[key](String(r2(nv)), el);
}

/* ---------- мышь и касания ---------- */
function mapHit(pk) {
  const m = S.mode, R = pk.roomId; if (m === 'overview') return null;
  if (pk.t === 'extra') return (m === 'exterior' || m === 'plan' || m === 'materials') ? { sel: { t: 'extra', id: pk.id }, drag: m === 'materials' ? null : 'extra' } : null;
  if (m === 'exterior') {
    if (pk.t === 'wall') return { sel: { t: 'wall', roomId: R, side: pk.side } };
    if (pk.t === 'open') return { sel: { t: 'open', roomId: R, id: pk.id }, drag: 'open' };
    if (pk.t === 'roof') return { sel: { t: 'roof', roomId: R } };
    if (pk.t === 'floor') return { sel: { t: 'room', id: R } };
    return null;
  }
  if (m === 'plan') return pk.t === 'furn' ? null : { sel: { t: 'room', id: R }, drag: 'room' };
  if (m === 'interior') return pk.t === 'furn' ? { sel: { t: 'furn', roomId: R, id: pk.id }, drag: 'furn' } : { sel: { t: 'room', id: R } };
  if (m === 'materials') {
    if (pk.t === 'wall') return { sel: { t: 'wall', roomId: R, side: pk.side, layer: pk.layer } };
    if (pk.t === 'roof') return { sel: { t: 'roof', roomId: R } };
    if (pk.t === 'open') return { sel: { t: 'open', roomId: R, id: pk.id } };
    if (pk.t === 'furn') return { sel: { t: 'furn', roomId: R, id: pk.id } };
    return { sel: { t: 'room', id: R } };
  }
  return null;
}
function pickAt(x, y) { if (!sc) return null; const h = sc.raycast(x, y, pk => !!mapHit(pk)); return h ? { ...mapHit(h.pick), pk: h.pick, point: h.point } : null }

const P = new Map(); let G = null;
function startDrag(hit, e) {
  const kind = hit.drag, s = hit.sel; let d = null;
  if (kind === 'room') { const r = getRoom(s.id), gp = sc.groundPoint(e.clientX, e.clientY); if (!gp) return false; d = { kind, id: r.id, ox: gp.x - (r.x + r.w / 2 - GW / 2), oz: gp.z - (r.z + r.d / 2 - GD / 2) } }
  else if (kind === 'furn') { const r = getRoom(s.roomId), f = r.furn.find(x => x.id === s.id), gp = sc.groundPoint(e.clientX, e.clientY); if (!gp) return false; d = { kind, roomId: r.id, id: f.id, ox: gp.x + GW / 2 - r.x - f.x, oz: gp.z + GD / 2 - r.z - f.z } }
  else if (kind === 'open') d = { kind, roomId: s.roomId, id: s.id };
  else if (kind === 'extra') { const ex = H0().extras.find(x => x.id === s.id), gp = sc.groundPoint(e.clientX, e.clientY); if (!gp) return false; d = { kind, id: ex.id, ox: gp.x - (ex.x + ex.w / 2 - GW / 2), oz: gp.z - (ex.z + ex.d / 2 - GD / 2) } }
  if (!d) return false;
  S.drag = d; store.begin(); canvas.style.cursor = 'grabbing'; return true;
}
function doDrag(e) {
  const d = S.drag, h = H0(); let bad = false;
  if (d.kind === 'room') {
    const gp = sc.groundPoint(e.clientX, e.clientY); if (!gp) return; const r = findRoomIn(h, d.id);
    const x = clamp(Math.round(gp.x - d.ox - r.w / 2 + GW / 2), 0, GW - r.w), z = clamp(Math.round(gp.z - d.oz - r.d / 2 + GD / 2), 0, GD - r.d);
    let nx = r.x, nz = r.z;
    if (L.free(h, x, z, r.w, r.d, r)) { nx = x; nz = z } else { bad = true; if (L.free(h, x, r.z, r.w, r.d, r)) nx = x; else if (L.free(h, r.x, z, r.w, r.d, r)) nz = z }
    if (nx !== r.x || nz !== r.z) store.live(hh => { const q = findRoomIn(hh, d.id); q.x = nx; q.z = nz });
  } else if (d.kind === 'furn') {
    const gp = sc.groundPoint(e.clientX, e.clientY); if (!gp) return; const room = findRoomIn(h, d.roomId), f = room.furn.find(x => x.id === d.id);
    const cand = { ...f, x: Math.round((gp.x + GW / 2 - room.x - d.ox) / FGRID) * FGRID, z: Math.round((gp.z + GD / 2 - room.z - d.oz) / FGRID) * FGRID }; L.clampFurn(room, cand);
    if (L.furnCollision(room, cand)) bad = true; else if (cand.x !== f.x || cand.z !== f.z) store.live(hh => { const q = findRoomIn(hh, d.roomId).furn.find(x => x.id === d.id); q.x = cand.x; q.z = cand.z });
  } else if (d.kind === 'open') {
    const room = findRoomIn(h, d.roomId), op = room.open.find(x => x.id === d.id), t = sc.wallCoord(e.clientX, e.clientY, d.roomId, op.s); if (t == null) return;
    const cand = { ...op, p: r2(Math.round(t / 0.05) * 0.05) };
    if (L.openingProblem(h, room, cand)) bad = true; else if (cand.p !== op.p) store.live(hh => { findOpen2(hh, d.id).p = cand.p });
  } else if (d.kind === 'extra') {
    const gp = sc.groundPoint(e.clientX, e.clientY); if (!gp) return; const ex = h.extras.find(x => x.id === d.id);
    const cand = { ...ex, x: clamp(Math.round(gp.x - d.ox - ex.w / 2 + GW / 2), 0, GW - ex.w), z: clamp(Math.round(gp.z - d.oz - ex.d / 2 + GD / 2), 0, GD - ex.d) };
    if (L.extraProblem(h, cand)) bad = true; else if (cand.x !== ex.x || cand.z !== ex.z) store.live(hh => { const q = hh.extras.find(x => x.id === d.id); q.x = cand.x; q.z = cand.z });
  }
  if (bad !== S.bad) { S.bad = bad; sc.setHighlight(hlSel(), bad) }
}
function endDrag(cancel) {
  if (!S.drag) return; S.drag = null; S.bad = false; canvas.style.cursor = '';
  if (cancel) store.cancel(); else store.end();
  afterChange('change');
}
let hoverT = 0;
function bindCanvas() {
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true });
    P.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (P.size === 2) { if (S.drag) endDrag(true); const [a, b] = [...P.values()]; G = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; return }
    if (P.size > 2) return;
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey)) { G = { type: 'pan' }; return }
    const hit = pickAt(e.clientX, e.clientY);
    G = { type: 'press', hit, sx: e.clientX, sy: e.clientY, moved: false };
    if (hit && !S.lock) { const same = S.sel && JSON.stringify(S.sel) === JSON.stringify(hit.sel); if (!same) select(hit.sel) }
  });
  canvas.addEventListener('pointermove', e => {
    const p = P.get(e.pointerId);
    if (!p) { if (!e.buttons && e.pointerType === 'mouse' && performance.now() - hoverT > 60) { hoverT = performance.now(); const h = S.mode === 'overview' ? null : pickAt(e.clientX, e.clientY); canvas.style.cursor = h ? (h.drag && !S.lock ? 'grab' : 'pointer') : '' } return }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (!G) return;
    if (G.type === 'pinch' && P.size === 2) { const [a, b] = [...P.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; sc.cam.zoom(G.d / d); sc.cam.pan(cx - G.cx, cy - G.cy); G.d = d; G.cx = cx; G.cy = cy; return }
    if (G.type === 'pan') return sc.cam.pan(dx, dy);
    if (G.type === 'press') {
      if (!G.moved && Math.hypot(e.clientX - G.sx, e.clientY - G.sy) > 5) {
        G.moved = true;
        if (G.hit && G.hit.drag && !S.lock && startDrag(G.hit, e)) G.type = 'drag'; else G.type = 'orbit';
      } else return;
    }
    if (G.type === 'drag' && S.drag) doDrag(e); else if (G.type === 'orbit') sc.cam.orbit(dx, dy);
  });
  const up = e => {
    P.delete(e.pointerId);
    if (G && G.type === 'drag') endDrag(false);
    else if (G && G.type === 'press' && !G.moved) { if (S.mode !== 'overview') { if (G.hit) { if (S.lock) select(G.hit.sel) } else if (S.sel) select(null) } }
    if (P.size < 2) G = null;
    sc && sc.cam.snap && 0;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { if (S.drag) endDrag(true); up(e) });
  canvas.addEventListener('wheel', e => { e.preventDefault(); sc.cam.zoom(1 + clamp(e.deltaY, -120, 120) * .0012) }, { passive: false });
}

/* ---------- клавиатура ---------- */
document.addEventListener('keydown', e => {
  if ($('#view-config').hidden || !S.loaded) return;
  if ($$('.modal:not([hidden])').length) return;
  const tag = (e.target.tagName || '').toLowerCase(); const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z') { if (typing && tag !== 'input') return; e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return }
  if (mod && k === 'y') { e.preventDefault(); doRedo(); return }
  if (mod && k === 's') { e.preventDefault(); ACT.save(); return }
  if (typing) return;
  const s = S.sel, step = e.shiftKey ? 3 : 1;
  if (k === 'escape') { if (S.drag) endDrag(true); else if (s) select(null); return }
  if ((k === 'delete' || k === 'backspace') && s) { e.preventDefault(); deleteSelection(); return }
  if (mod && k === 'd' && s) { e.preventDefault(); ACT.dup(); return }
  if (k === 'r' && s) { ACT.rotate(); return }
  if (k.startsWith('arrow')) {
    const dx = k === 'arrowleft' ? -1 : k === 'arrowright' ? 1 : 0, dz = k === 'arrowup' ? -1 : k === 'arrowdown' ? 1 : 0;
    if (s && (s.t === 'room' || s.t === 'extra' || s.t === 'furn') && S.mode !== 'overview') {
      e.preventDefault();
      if (s.t === 'room') moveRoom(s.id, dx * step, dz * step);
      else if (s.t === 'extra') { const ex = H0().extras.find(x => x.id === s.id); patchExtra(ex.id, { x: ex.x + dx * step, z: ex.z + dz * step }) }
      else { const f = getRoom(s.roomId).furn.find(x => x.id === s.id); patchFurn(s.roomId, s.id, { x: f.x + dx * .1 * step, z: f.z + dz * .1 * step }, true) }
    } else if (sc && document.activeElement === canvas) { e.preventDefault(); if (e.altKey) sc.cam.nudge(dx * .8, dz * .8); else sc.cam.orbit(-dx * 24, -dz * 24) }
    return;
  }
  if (!sc) return;
  if (k === '+' || k === '=') sc.cam.zoom(.85); else if (k === '-' || k === '_') sc.cam.zoom(1.18); else if (k === '0') camPreset('iso'); else if (k === 'f') sc.cam.fit(H0());
  else if (k === '1') camPreset('top'); else if (k === '2') camPreset('front'); else if (k === '3') camPreset('side');
});

/* ---------- метки комнат ---------- */
const labels = new Map();
function updateLabels() {
  const box = $('#stuLabels'); if (!box || !sc) return;
  const show = (S.mode === 'plan' || S.mode === 'interior') && sc.cam.mode !== 'fp', h = H0(), seen = new Set();
  if (show) h.rooms.forEach(r => {
    seen.add(r.id); let el = labels.get(r.id);
    if (!el) { el = document.createElement('div'); el.className = 'rlabel'; box.appendChild(el); labels.set(r.id, el) }
    const txt = `<b>${roomName(r)}</b><span>${r.w}×${r.d} м · ${r.w * r.d} м²</span>`; if (el._t !== txt) { el.innerHTML = txt; el._t = txt }
    const p = sc.project(r.x + r.w / 2 - GW / 2, FY + (S.mode === 'plan' ? .1 : 1.2), r.z + r.d / 2 - GD / 2);
    el.style.transform = `translate(${p.x.toFixed(0)}px,${p.y.toFixed(0)}px) translate(-50%,-50%)`; el.hidden = !p.visible; el.classList.toggle('on', r.id === S.activeRoom);
  });
  labels.forEach((el, id) => { if (!seen.has(id)) { el.remove(); labels.delete(id) } });
}

/* ---------- экспорт ---------- */
function download(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove() }
const fileBase = () => 'listvennitsa-' + ((S.meta.title || 'dom').toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '') || 'dom');
function exportPng() {
  if (!sc) return note('Снимок недоступен: 3D-вид не запущен на этом устройстве. Откройте сводку проекта и распечатайте её: в ней есть план.', 'warn');
  try { download(sc.snapshot(1600, 1000), fileBase() + '.png'); note('Снимок сохранён файлом на устройство.', 'ok') } catch (e) { note('Не удалось сделать снимок: ' + (e.message || 'ошибка отрисовки'), 'err') }
}
function openSummary() {
  const m = $('#sumModal'); $('#sumBody').innerHTML = summaryHTML(ctx()); m.hidden = false;
  const img = $('#sumShot'); try { if (sc) img.src = sc.snapshot(960, 600, 'image/jpeg') } catch (e) { img.closest('figure').hidden = true }
  if (!sc) img.closest('figure').hidden = true;
  drawPlan($('#sumPlan'), H0(), {}); setTimeout(() => $('#sumX').focus(), 30);
}
function openCompare() { if (S.cmp.length < 2) return; $('#cmpBody').innerHTML = compareHTML(S.cmp); $('#cmpModal').hidden = false; setTimeout(() => $('#cmpX').focus(), 30) }

/* ---------- обучение ---------- */
const TOUR = [
  { t: 'Пять режимов', b: '<p>Переключайтесь между режимами в верхней панели:</p><ul><li><b>Экстерьер</b> — фасад, кровля, окна, двери, ступени, навес.</li><li><b>Планировка</b> — комнаты и их размеры.</li><li><b>Интерьер</b> — мебель и отделка комнат.</li><li><b>Материалы</b> — библиотека образцов.</li><li><b>Обзор</b> — дом в окружении, снимок.</li></ul>' },
  { t: 'Камера', b: '<ul><li><b>Вращение:</b> тяните пустое место (или одним пальцем).</li><li><b>Сдвиг:</b> правая кнопка мыши, Shift + мышь или двумя пальцами.</li><li><b>Масштаб:</b> колесо мыши или щипок двумя пальцами.</li><li>Кнопки «Сверху», «Спереди», «Сбоку», «Изометрия», «Весь дом» — в верхней левой части сцены.</li><li>Замок «Объекты закреплены» — мышь и пальцы только двигают камеру.</li></ul>' },
  { t: 'Редактирование', b: '<ul><li>Щёлкните по объекту — он подсветится, справа появятся его настройки.</li><li>Комнаты, мебель, окна и ступени можно перетаскивать. Если место занято, объект остаётся на последнем допустимом месте, а причина показывается в сообщении.</li><li><b>Ctrl+Z / Ctrl+Y</b> — отмена и повтор. <b>Delete</b> — удалить, <b>R</b> — повернуть, стрелки — сдвиг.</li></ul>' },
  { t: 'Сохранение и отправка', b: '<ul><li>Изменения автоматически сохраняются <b>черновиком на этом устройстве</b>.</li><li>Чтобы проект увидел дизайнер, нажмите <b>«Отправить дизайнеру»</b>: потребуется вход в аккаунт.</li><li>Цена в конструкторе — <b>предварительная оценка</b>. Подтверждённой она становится после согласования.</li></ul>' }
];
let tourI = 0;
function showTour(force) {
  let done = false; try { done = localStorage.getItem('kw_tour_v1') === '1' } catch (e) { }
  if (done && !force) return; tourI = 0; renderTour(); $('#tourModal').hidden = false; setTimeout(() => $('#tourNext').focus(), 30);
}
function renderTour() {
  const t = TOUR[tourI]; $('#tourT').textContent = t.t; $('#tourBody').innerHTML = t.b; $('#tourStep').textContent = `Шаг ${tourI + 1} из ${TOUR.length}`;
  $('#tourPrev').hidden = tourI === 0; $('#tourNext').textContent = tourI === TOUR.length - 1 ? 'Начать' : 'Дальше';
}
function tourGo(d) { if (d > 0 && tourI === TOUR.length - 1) return closeTour(); tourI = clamp(tourI + d, 0, TOUR.length - 1); renderTour() }
function closeTour() { $('#tourModal').hidden = true; try { localStorage.setItem('kw_tour_v1', '1') } catch (e) { } canvas && canvas.focus({ preventScroll: true }) }

/* ---------- запасной вид без WebGL ---------- */
function drawFallback() {
  const c = $('#plan2d'), b = stage.getBoundingClientRect(); c.width = Math.max(200, b.width); c.height = Math.max(200, b.height);
  planMap = drawPlan(c, H0(), { sel: S.sel });
}
function enableFallback(reason) {
  fallback = true; sc = null; canvas.hidden = true; $('#plan2d').hidden = false; $('#stuCam').hidden = true; $('#stuFallback').hidden = false; $('#stuFallbackMsg').textContent = reason;
  $('#plan2d').onclick = e => { const b = e.currentTarget.getBoundingClientRect(), r = planMap && planMap.roomAt(e.clientX - b.left, e.clientY - b.top); select(r ? { t: 'room', id: r.id } : null) };
  new ResizeObserver(() => drawFallback()).observe(stage); drawFallback();
}

/* ---------- инициализация DOM ---------- */
function bindDom() {
  if (bound) return; bound = true;
  canvas = $('#c3d'); stage = $('#stuStage');
  $('#stuModes').innerHTML = MODES.map(m => `<button type="button" data-mode="${m.id}" data-act="mode" data-v="${m.id}" aria-pressed="false" title="${m.hint}">${ICON[m.id]}<span>${m.n}</span></button>`).join('');
  $('#stuUndo').innerHTML = ICON.undo; $('#stuRedo').innerHTML = ICON.redo;
  $('#stuSave').innerHTML = ICON.save + '<span>Сохранить черновик</span>'; $('#stuShot').innerHTML = ICON.shot + '<span>Снимок</span>'; $('#stuSummary').innerHTML = ICON.doc + '<span>Сводка</span>'; $('#stuHelp').innerHTML = ICON.help;
  const camBtns = [['camtop', 'top', 'Сверху'], ['camfront', 'front', 'Спереди'], ['camside', 'side', 'Сбоку'], ['camiso', 'iso', 'Изометрия'], ['camfit', 'fit', 'Весь дом'], ['camreset', 'reset', 'Сбросить вид'], ['camin', 'plus', 'Ближе'], ['camout', 'x', 'Дальше']];
  $('#stuCam').innerHTML = camBtns.map(([a, ic, t]) => `<button type="button" class="b icon" data-act="${a}" aria-label="${t}" title="${t}">${a === 'camout' ? '<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 12h14"/></svg>' : ICON[ic]}</button>`).join('') + `<button type="button" class="b icon" id="stuLock" data-act="lock" aria-pressed="false" aria-label="Закрепить объекты: мышь двигает только камеру" title="Закрепить объекты">${ICON.lock}</button>`;
  $('#stuTabs').innerHTML = [['tools', 'Каталог'], ['props', 'Свойства'], ['info', 'Итог']].map(([v, n]) => `<button type="button" data-act="tab" data-v="${v}" aria-pressed="${v === 'tools'}">${n}</button>`).join('');
  $('#stuBody').dataset.tab = 'tools';
  const root = $('#view-config');
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = ACT[b.dataset.act]; if (a) { if (b.dataset.act === 'matinfo' && e.target.closest('.cmp')) return; a(b.dataset.v, b) }
  });
  const onInp = (e, live) => {
    const el = e.target.closest('[data-in]'); if (!el) return;
    const k = el.dataset.in, h = INP[k]; if (!h) return;
    if (k === 'cmp') { if (!live) h(el.dataset.v, el); return }
    if (el.type === 'range') {
      if (live) { if (!store.inTx) store.begin(); const s = S.sel; const room = getRoom(s.roomId), op = room.open.find(o => o.id === s.id), cand = { ...op, p: r2(+el.value) }; if (!L.openingProblem(H0(), room, cand)) store.live(hh => { findOpen2(hh, s.id).p = cand.p }); const num = $('#stuProps input[type=number][data-in="open.p"]'); if (num) num.value = cand.p; return }
      if (store.inTx) { store.end(); afterChange('change') } return;
    }
    if (live) return; h(el.value, el);
  };
  root.addEventListener('input', e => onInp(e, true)); root.addEventListener('change', e => onInp(e, false));
  $('#stuTitle').addEventListener('input', e => { S.meta.title = e.target.value.slice(0, 80); if (!S.readOnly) scheduleSave() });
  const ro = new ResizeObserver(() => { sc && sc.resize(); if (fallback) drawFallback() }); ro.observe(stage);
  $('#sumPrint').onclick = () => { document.body.classList.add('print-summary'); const done = () => { document.body.classList.remove('print-summary'); window.removeEventListener('afterprint', done) }; window.addEventListener('afterprint', done); window.print() };
  $('#sumPng').onclick = exportPng; $('#sumX').onclick = () => $('#sumModal').hidden = true; $('#cmpX').onclick = () => $('#cmpModal').hidden = true;
  $('#tourX').onclick = closeTour; $('#tourNext').onclick = () => tourGo(1); $('#tourPrev').onclick = () => tourGo(-1);
  $('#stuBannerBack').onclick = () => hooks.go && hooks.go('staff');
  $('#stuRetry').onclick = () => { location.reload() };
}

async function ensure() {
  if (store) return true;
  bindDom();
  store = createStore(L.emptyHouse()); store.subscribe(k => { if (k === 'reset') return; afterChange(k) });
  const load = $('#stuLoad'); load.hidden = false;
  const ok = await ensureThree(); load.hidden = true;
  if (!ok) { enableFallback(THREEMSG); return true }
  if (!webglAvailable()) { enableFallback('В этом браузере не включён WebGL, поэтому 3D-вид недоступен. Планировку можно редактировать на плоском плане, все панели работают.'); return true }
  try { sc = createScene(canvas); sc.setOnFrame(updateLabels); bindCanvas(); sc.resize(true) }
  catch (e) { console.error(e); enableFallback('Не удалось запустить 3D-отрисовку (' + (e.message || 'ошибка WebGL') + '). Планировку можно редактировать на плоском плане.') }
  return true;
}

/* ---------- публичный интерфейс для js/app.js ---------- */
export const studio = {
  init(h) { hooks = h || {} },
  get meta() { return S.meta },
  get isOpen() { return !!store && !$('#view-config').hidden },
  async open(o = {}) {
    document.body.classList.add('studio-on'); await ensure();
    if (o.model || o.ready || o.readyConfig) {
      if (S.loaded && store.rev > 0 && !S.readOnly && !(await ask('В конструкторе есть несохранённые правки. Открыть выбранную модель вместо них? Текущий вариант сохранён в черновике на этом устройстве.', { ok: 'Открыть модель', title: 'Заменить текущий проект?' }))) { /* остаёмся */ }
      else { saveDraftNow(); if (o.readyConfig) { const r = startReadyConfig(o.readyConfig.config, o.readyConfig.base); if (r.notes.length) note(r.notes.join(' '), 'warn') } else if (o.ready) startReady(o.ready); else startModel(o.model) }
    } else if (!S.loaded) {
      const d = readDraft();
      if (d && await ask(`Найден черновик проекта${d.title ? ' «' + d.title + '»' : ''} от ${new Date(d.t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. Продолжить с ним?`, { ok: 'Продолжить', cancel: 'Начать заново', title: 'Черновик на этом устройстве' })) {
        const { house, notes } = L.normalizeProject(d.config); S.readOnly = false; setHouse(house, { title: d.title || '', projectId: d.projectId || null, status: null, model: d.model || 'proj' }); S.saveState = 'saved'; S.savedAt = d.t; if (sc) { sc.cam.preset('iso', house); sc.cam.snap() } status(); if (notes.length) note(notes.join(' '), 'warn');
      } else startModel('oz');
    }
    if (o.mode) S.mode = o.mode;
    setMode(S.mode); if (sc) { sc.setActive(true); sc.resize(true); sc.cam.snap() } updateChrome(); showTour(false);
    setTimeout(() => sc && sc.resize(), 60);
  },
  pause() { document.body.classList.remove('studio-on'); sc && sc.setActive(false); if (saveT) saveDraftNow() },
  /* Загрузка сохранённого проекта (из кабинета клиента или «Открыть в 3D» у сотрудника). Возвращает сообщение или ''. */
  async loadProject(config, meta, preview) {
    if (!config || !Array.isArray(config.rooms)) return { error: 'Проект повреждён и не может быть открыт.' };
    document.body.classList.add('studio-on'); await ensure();
    const { house, notes } = L.normalizeProject(config);
    S.readOnly = !!preview; setHouse(house, { title: preview ? '' : (meta && meta.title) || '', projectId: preview ? null : (meta && meta.id) || null, status: preview ? null : (meta && meta.status) || null, model: 'proj' });
    S.mode = 'exterior'; S.submittedRev = 0; S.saveState = 'clean';
    if (sc) { sc.cam.preset('iso', house); sc.cam.snap() } setMode('exterior');
    return { notes };
  },
  serialize: () => L.serializeProject(store ? store.house : L.emptyHouse()),
  /* Текущий дом для сохранения в готовые дома: конфиг в формате проекта (v:2) и базовая модель */
  readyDraft: () => ({ config: L.serializeProject(store ? store.house : L.emptyHouse()), base: S.meta.model || 'proj', rooms: store ? store.house.rooms.length : 0 }),
  info() { const h = store.house, n = projectNumbers(h); return { rooms: h.rooms.length, area: n.area, price: n.calc.modules } },
  price: () => projectNumbers(store.house).calc.modules,
  hasRooms: () => !!store && store.house.rooms.length > 0,
  markSubmitted(id, title) { S.meta.projectId = id; S.meta.title = title; S.submittedRev = store.rev; S.saveState = 'sent'; S.meta.status = 'submitted'; $('#stuTitle').value = title; status() },
  resetSession() { if (!store) return; S.meta.projectId = null; S.meta.status = null; S.meta.title = ''; S.submittedRev = store.rev; $('#stuTitle').value = ''; status() },
  getSession: () => ({ projectId: S.meta.projectId, title: S.meta.title }),
  debug: () => ({ S, store, sc }),
  stats: () => sc && sc.stats()
};
window.__studio = studio;   // доступ для автоматических проверок
