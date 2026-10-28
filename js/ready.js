/* Вкладка «Готовые дома».
   Встроенные варианты (READY_HOMES, data.js) выводятся как раньше. Дополнительно из таблицы ready_homes
   (миграция 13) выводятся опубликованные дома, которые добавил креативный дизайнер или владелец.
   Стоимость считается существующим calcProject: модули — предварительная оценка, мебель без цены помечается
   «уточнит менеджер». Права на изменение проверяет база (RLS); интерфейс лишь скрывает кнопки. */
import { READY_HOMES, MODELS, FLIST, FACADES, FACADE_TINTS, FLOORS, PRE } from './data.js';
import { readyHouse, totalArea, normalizeProject, serializeProject } from './layout.js';
import { calcProject } from './calc.js';
import { $, esc, fmt, gtoast, ask } from './util.js';
import { houseSvg } from './site.js';

const FAC_COL = { 'larch-v': '#b9834a', 'larch-h': '#b9834a', graphite: '#3f484c', plaster: '#d9d6cc', 'wood-stone': '#b9834a' };
const BASE_NAME = { les: 'Лесной', oz: 'Озёрный', sem: 'Семейный' };

let SB = null, MANAGE = false, DB_HOMES = [], DB_OK = true;

/* Может ли текущий пользователь добавлять и менять готовые дома (владелец и креативный дизайнер) */
export const canManageReady = () => MANAGE;

/* ---------- встроенные варианты (как раньше) ---------- */

/* Сводка для карточки: площадь, спальни, предметы мебели по комнатам и оценка */
function summary(v) {
  const h = readyHouse(v.id), model = MODELS.find(m => m.id === v.base);
  const c = calcProject(serializeProject(h));
  const furn = {};
  h.rooms.forEach(r => r.furn.forEach(f => { furn[f.key] = (furn[f.key] || 0) + 1 }));
  const items = Object.entries(furn).map(([k, n]) => `${FLIST[k].n}${n > 1 ? ` × ${n}` : ''}`);
  const priceless = c.furniture.unpricedQty || 0;
  const facade = FACADES.find(f => f.id === v.facade), tint = FACADE_TINTS.find(t => t.id === v.tint && t.c);
  const floor = FLOORS.find(f => f.id === v.floor);
  return { h, model, c, items, priceless, facade, tint, floor, area: totalArea(h), rooms: h.rooms.length, bed: model.bedrooms };
}

function card(v) {
  const s = summary(v), fill = FAC_COL[v.facade] || '#b9834a';
  return `<article class="pcard ready-card">
    <div class="pic">${houseSvg(s.model, fill, s.model.roofType, PRE[v.base].some(a => a[0] === 'ter'))}</div>
    <div class="txt">
      <div class="hd"><h3>${esc(v.name)}</h3><span class="price">≈ ${fmt(s.c.modules + s.c.foundation.total)}</span></div>
      <p class="kit">${esc(v.note)}</p>
      <ul class="spec"><li><b>${s.area} м²</b><span>площадь</span></li><li><b>${s.bed}</b><span>${s.bed === 1 ? 'спальня' : 'спальни'}</span></li><li><b>${s.rooms}</b><span>комнат</span></li><li><b>${items_count(s)}</b><span>предметов</span></li></ul>
      <p class="plan"><b>Фасад:</b> ${esc(s.facade.n)}${s.tint ? `, цвет «${esc(s.tint.n)}»` : ''}. <b>Пол:</b> ${esc(s.floor.n)}.</p>
      <p class="plan"><b>Мебель:</b> ${esc(s.items.join(', '))}.${s.priceless ? ' Часть позиций без цены — её уточнит менеджер.' : ''}</p>
      <div class="ready-cost"><div><span>Модули (предварительная оценка)</span><b>≈ ${fmt(s.c.modules)}</b></div><div><span>Мебель из каталога</span><b>${fmt(s.c.furniture.total)}</b></div><div><span>Фундамент (считает менеджер)</span><b>≈ ${fmt(s.c.foundation.total)}</b></div></div>
      <button class="btn" data-go="config" data-ready="${v.id}">Открыть в конструкторе</button>
    </div>
  </article>`;
}
const items_count = s => s.h.rooms.reduce((a, r) => a + r.furn.length, 0);

/* ---------- дома, добавленные командой (таблица ready_homes) ---------- */

/* Оценка по сохранённому конфигу: тот же calcProject, что и для проектов клиентов */
function dbSummary(row) {
  const { house } = normalizeProject(row.config);
  const c = calcProject(serializeProject(house));
  return {
    area: totalArea(house), bedrooms: house.rooms.filter(r => r.type === 'bed').length, rooms: house.rooms.length,
    items: house.rooms.reduce((a, r) => a + r.furn.length, 0), c, priceless: c.furniture.unpricedQty || 0
  };
}

function dbCard(row) {
  const s = dbSummary(row), model = MODELS.find(m => m.id === row.base) || MODELS[0];
  const fac = FACADES.find(f => f.id === row.config.facade), fill = FAC_COL[row.config.facade] || '#b9834a';
  const admin = MANAGE ? `<div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="chip" type="button" data-rh-edit="${row.id}">Изменить</button>
      <button class="chip" type="button" data-rh-pub="${row.id}" data-on="${row.published ? 0 : 1}">${row.published ? 'Скрыть' : 'Опубликовать'}</button>
      <button class="chip danger" type="button" data-rh-del="${row.id}">Удалить</button></div>` : '';
  return `<article class="pcard ready-card${row.published ? '' : ' is-hidden'}" data-rh="${row.id}">
    <div class="pic">${houseSvg(model, fill, model.roofType, false)}</div>
    <div class="txt">
      <div class="hd"><h3>${esc(row.name)}</h3><span class="price">≈ ${fmt(s.c.modules + s.c.foundation.total)}</span></div>
      ${row.note ? `<p class="kit">${esc(row.note)}</p>` : ''}
      <ul class="spec"><li><b>${s.area} м²</b><span>площадь</span></li><li><b>${s.bedrooms}</b><span>${s.bedrooms === 1 ? 'спальня' : 'спальни'}</span></li><li><b>${s.rooms}</b><span>комнат</span></li><li><b>${s.items}</b><span>предметов</span></li></ul>
      <p class="plan"><b>Фасад:</b> ${esc(fac ? fac.n : '—')}. <b>Основа:</b> ${esc(BASE_NAME[row.base] || row.base)}.</p>
      <div class="ready-cost"><div><span>Модули (предварительная оценка)</span><b>≈ ${fmt(s.c.modules)}</b></div><div><span>Мебель из каталога</span><b>${fmt(s.c.furniture.total)}</b></div><div><span>Фундамент (считает менеджер)</span><b>≈ ${fmt(s.c.foundation.total)}</b></div></div>
      ${s.priceless ? '<p class="plan">Часть позиций без цены — её уточнит менеджер.</p>' : ''}
      <button class="btn" type="button" data-rh-open="${row.id}">Открыть в конструкторе</button>
      ${admin}
    </div>
  </article>`;
}

async function loadDbHomes() {
  if (!SB) { DB_HOMES = []; DB_OK = false; return }
  const sel = 'id,name,note,base,config,published,created_at';
  const { data, error } = await SB.from('ready_homes').select(sel).order('created_at', { ascending: true });
  if (error) { DB_HOMES = []; DB_OK = false; return }
  DB_OK = true;
  // посетители видят только опубликованные (база это тоже проверяет); управляющие — все
  DB_HOMES = (data || []).filter(r => r.published || MANAGE);
}

function renderGrid() {
  const grid = $('#readyGrid'); if (!grid) return;
  grid.innerHTML = READY_HOMES.map(card).join('') + DB_HOMES.map(dbCard).join('');
  const msg = $('#readyDbNote'); if (msg) msg.textContent = DB_OK ? '' : 'Дома, добавленные командой, сейчас не загрузились. Встроенные варианты доступны.';
  renderManage();
}

/* Вызывается из app.js при открытии вкладки и после входа/выхода */
export async function initReady(sb, role) {
  if (sb) SB = sb;
  MANAGE = role === 'owner' || role === 'creative';
  const grid = $('#readyGrid'); if (!grid) return;
  bindReady();
  await loadDbHomes();
  renderGrid();
}

/* ---------- панель управления списком ---------- */

function renderManage() {
  const box = $('#readyManage'); if (!box) return;
  box.hidden = !MANAGE;
  if (!MANAGE) return;
  const all = DB_HOMES.length
    ? DB_HOMES.map(r => `<div class="send" style="align-items:center;flex-wrap:wrap;margin-bottom:6px"><span style="flex:1;min-width:200px"><b>${esc(r.name)}</b> <span class="who">${r.published ? 'опубликован' : 'скрыт'} · ${esc(BASE_NAME[r.base] || r.base)}</span></span></div>`).join('')
    : '<p class="who" style="margin:0">Пока нет добавленных домов. Соберите дом в конструкторе и нажмите «В готовые дома».</p>';
  $('#readyManageList').innerHTML = all;
}

/* Сохранить текущий дом из конструктора как готовый. Вызывается из app.js через форму. */
export async function saveCurrentAsReady({ name, note, published }, draft) {
  if (!MANAGE || !SB) return { error: 'Нет прав на управление готовыми домами.' };
  if (!draft || !draft.rooms) return { error: 'В доме пока нет комнат.' };
  const base = ['les', 'oz', 'sem'].includes(draft.base) ? draft.base : 'oz';
  const row = { name: String(name).trim().slice(0, 80), note: String(note || '').trim().slice(0, 300), base, config: draft.config, published: !!published };
  const { error } = await SB.from('ready_homes').insert(row);
  if (error) return { error: error.message };
  await loadDbHomes(); renderGrid();
  return { ok: true };
}

/* Открыть дом из базы в конструкторе: возвращает {config, base} или null */
export function dbHomeConfig(id) {
  const row = DB_HOMES.find(x => x.id === id);
  return row ? { config: row.config, base: row.base } : null;
}

let BOUND = false;
function bindReady() {
  if (BOUND) return; BOUND = true;
  $('#readyGrid').addEventListener('click', async e => {
    const o = e.target.closest('[data-rh-open]');
    if (o) { const d = dbHomeConfig(o.dataset.rhOpen); if (d && window.__openReadyDb) window.__openReadyDb(d); return }
    const p = e.target.closest('[data-rh-pub]');
    if (p) return togglePublish(p.dataset.rhPub, p.dataset.on === '1');
    const del = e.target.closest('[data-rh-del]');
    if (del) return removeHome(del.dataset.rhDel);
    const ed = e.target.closest('[data-rh-edit]');
    if (ed) return editHome(ed.dataset.rhEdit);
  });
}

async function togglePublish(id, on) {
  if (!MANAGE) return;
  const { error } = await SB.from('ready_homes').update({ published: on, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return gtoast('Ошибка: ' + error.message);
  gtoast(on ? 'Дом опубликован' : 'Дом скрыт от посетителей', 'ok');
  await loadDbHomes(); renderGrid();
}

async function removeHome(id) {
  if (!MANAGE) return;
  const row = DB_HOMES.find(x => x.id === id);
  if (!(await ask('Удалить дом «' + (row ? row.name : '') + '» из готовых? Это действие нельзя отменить.', { ok: 'Удалить', danger: true, title: 'Удалить готовый дом' }))) return;
  const { error } = await SB.from('ready_homes').delete().eq('id', id);
  if (error) return gtoast('Ошибка: ' + error.message);
  gtoast('Дом удалён');
  await loadDbHomes(); renderGrid();
}

/* Название и описание меняются в окне; состав дома — пересохранением из конструктора */
async function editHome(id) {
  if (!MANAGE) return;
  const row = DB_HOMES.find(x => x.id === id); if (!row) return;
  const form = $('#readyEditForm'); if (!form) return;
  form.dataset.id = id;
  $('#readyEditName').value = row.name; $('#readyEditNote').value = row.note || '';
  $('#readyEditModal').hidden = false; setTimeout(() => $('#readyEditName').focus(), 30);
}
export async function saveReadyEdit(id, name, note) {
  if (!MANAGE) return { error: 'Нет прав.' };
  const n = String(name || '').trim();
  if (n.length < 2) return { error: 'Название должно быть не короче 2 символов.' };
  const { error } = await SB.from('ready_homes').update({ name: n.slice(0, 80), note: String(note || '').trim().slice(0, 300), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  await loadDbHomes(); renderGrid();
  return { ok: true };
}
