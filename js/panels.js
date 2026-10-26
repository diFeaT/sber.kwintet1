/* HTML панелей конструктора. Чистые функции: принимают контекст (проект, состояние интерфейса) и возвращают строку.
   Все действия описаны атрибутами data-act / data-in и обрабатываются в studio.js. */
import {
  TYPES, WALLS, FLOORS, FLIST, FCATS, ROOM_FURN, MATERIALS, MCATS, FACADES, ROOF_TYPES, ROOF_MATS, FRAMES, OPENING_KINDS, EXTRA_KINDS,
  SIDES, GW, GD, H, WALL_FINISHES, FIN_MATS, matById, facadeById, MODELS, PRE, PST, INCLUDED, OPEN_MARGIN, MAX_ROOMS, MAX_AREA_INPUT,
  FACADE_TINTS
} from './data.js';
import { esc, fmt, fmtM } from './util.js';
import { swatch } from './mats.js';
import { ICON } from './icons.js';
import { sideInfo, openingProblem, findOpeningPos, extraProblem, furnCollision, furnFoot, isOpen, roomType, neighbors, bbox, totalArea, closedArea } from './layout.js';
import { calcProject } from './calc.js';
import { serializeProject } from './layout.js';

const wallBy = id => WALLS.find(w => w.id === id);
const priceTxt = p => p ? '+ ' + fmt(p) + '/м²' : 'входит в цену';
const m1 = n => fmtM(Math.round(n * 100) / 100);
export const roomName = r => TYPES[r.type].n;

const sec = (title, body, sub) => `<section class="pnl-sec"><h3 class="pnl-h">${title}${sub ? `<small>${sub}</small>` : ''}</h3>${body}</section>`;
const btn = (act, label, o = {}) => `<button type="button" class="b${o.cls ? ' ' + o.cls : ''}" data-act="${act}"${o.v != null ? ` data-v="${esc(o.v)}"` : ''}${o.attrs ? ' ' + o.attrs : ''}${o.pressed != null ? ` aria-pressed="${o.pressed}"` : ''}${o.dis ? ' disabled' : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${o.icon ? ICON[o.icon] : ''}${label ? `<span>${label}</span>` : ''}</button>`;
const seg = (act, items, cur) => `<div class="seg" role="group">${items.map(i => `<button type="button" class="seg-b" data-act="${act}" data-v="${i.id}" aria-pressed="${cur === i.id}">${i.n}</button>`).join('')}</div>`;
const note = (t, kind) => `<p class="pnl-note${kind ? ' ' + kind : ''}">${t}</p>`;
const stepper = (key, val, min, max, step, label, unit) => `<div class="fld"><label for="in-${key}">${label}${unit ? `, ${unit}` : ''}</label><div class="stepper"><button type="button" class="b icon" data-act="step" data-k="${key}" data-d="${-step}" aria-label="${label}: меньше">−</button><input id="in-${key}" type="number" data-in="${key}" value="${val}" min="${min}" max="${max}" step="${step}" inputmode="decimal"><button type="button" class="b icon" data-act="step" data-k="${key}" data-d="${step}" aria-label="${label}: больше">+</button></div></div>`;

function facadeSwatch(f) {
  const b = swatch(f.base, 96, f.dir);
  let bg = `url(${b})`;
  if (f.band) bg = `url(${swatch(f.band.mat, 96)}) left bottom/100% 34% no-repeat, ${bg}`;
  if (f.accent) bg = `url(${swatch(f.accent.mat, 96)}) right top/42% 100% no-repeat, ${bg}`;
  return `style="background:${bg};background-size:cover"`;
}
const facadeCard = (f, cur) => `<button type="button" class="mcard" data-act="facade" data-v="${f.id}" aria-pressed="${cur === f.id}"><span class="sw" ${facadeSwatch(f)}></span><b>${f.n}</b><small>${priceTxt(wallBy(f.priceClass).p)}</small></button>`;
const matSw = (id, big) => `<span class="sw${big ? ' big' : ''}" style="background-image:url(${swatch(id, big ? 160 : 96)})"></span>`;

/* ---------- левая панель ---------- */
export function renderLeft(c) {
  const { h, S } = c;
  switch (S.mode) {
    case 'exterior': return leftExterior(c);
    case 'plan': return leftPlan(c);
    case 'interior': return leftInterior(c);
    case 'materials': return leftMaterials(c);
    default: return leftOverview(c);
  }
}

function roofControls(h) {
  return `<div class="opt">${btn('roofshow', 'Показывать крышу', { icon: 'eye', pressed: !!h.roof, cls: 'tog' })}</div>
  <div class="lbl">Тип кровли</div>${seg('rooftype', ROOF_TYPES, h.roofType)}
  <p class="pnl-note">${ROOF_TYPES.find(t => t.id === h.roofType).note}</p>
  <div class="lbl">Материал кровли</div><div class="mgrid sm">${ROOF_MATS.map(id => { const m = matById(id); return `<button type="button" class="mcard" data-act="roofmat" data-v="${id}" aria-pressed="${h.roofMat === id}">${matSw(id)}<b>${m.n}</b></button>` }).join('')}</div>
  ${note('Тип и материал кровли показываются в 3D, но в расчёт не входят: расчёт содержит только строку «Кровля» за м². Уточняет менеджер.')}`;
}
const tintControls = h => `<div class="lbl">Цвет фасада</div><div class="opt">${FACADE_TINTS.map(t => `<button type="button" class="chip" data-act="facadetint" data-v="${t.id}" aria-pressed="${(h.facadeTint || 'natural') === t.id}">${t.c ? `<i class="dot" style="background:${t.c}"></i>` : ''}${t.n}</button>`).join('')}</div>${note('Цвет меняет оттенок фасада в 3D. Цена не меняется: она зависит от класса отделки.')}`;
const frameControls = h => `<div class="lbl">Цвет рам</div><div class="opt">${FRAMES.map(f => `<button type="button" class="chip" data-act="frame" data-v="${f.id}" aria-pressed="${h.frame === f.id}"><i class="dot" style="background:${f.c}"></i>${f.n}</button>`).join('')}</div>`;

function leftExterior(c) {
  const { h } = c, wins = h.rooms.reduce((a, r) => a + r.open.filter(o => !OPENING_KINDS[o.k].door).length, 0), doors = h.rooms.reduce((a, r) => a + r.open.filter(o => OPENING_KINDS[o.k].door).length, 0);
  const f = facadeById(h.facade);
  return sec('Фасад', `<div class="mgrid">${FACADES.map(x => facadeCard(x, h.facade)).join('')}</div>${note(f.note)}${tintControls(h)}`, 'Наружные стены')
    + sec('Кровля', roofControls(h))
    + sec('Окна и двери', `${note(`Выберите наружную стену на модели — появятся кнопки добавления. Сейчас: окон ${wins}, дверей ${doors}.`)}${frameControls(h)}`)
    + sec('Элементы участка', `<div class="opt">${Object.entries(EXTRA_KINDS).map(([k, K]) => btn('addextra', K.n, { v: k, icon: 'plus' })).join('')}</div>
      ${h.extras.length ? `<div class="list">${h.extras.map(e => `<button type="button" class="row-b" data-act="selextra" data-v="${e.id}" aria-pressed="${c.S.sel && c.S.sel.t === 'extra' && c.S.sel.id === e.id}"><b>${EXTRA_KINDS[e.k].n}</b><small>${e.w}×${e.d} м</small></button>`).join('')}</div>` : note('Ступени и навес — настоящие 3D-объекты. Их можно двигать мышью по участку.')}
      ${note('Элементы участка не входят в расчёт и уточняются при согласовании.')}`);
}

function leftPlan(c) {
  const { h, S } = c, ar = c.room;
  const types = Object.entries(TYPES).map(([k, t]) => `<button type="button" class="chip tile" data-act="addroom" data-v="${k}"${h.rooms.length >= MAX_ROOMS ? ' disabled' : ''}>${ICON.plus}<span><b>${t.n}</b><small>${t.w}×${t.d} м</small></span></button>`).join('');
  const list = h.rooms.length ? h.rooms.map(r => `<button type="button" class="row-b" data-act="selroom" data-v="${r.id}" aria-pressed="${ar && ar.id === r.id}"><b>${roomName(r)}</b><small>${r.w}×${r.d} м · ${r.w * r.d} м²</small></button>`).join('') : '';
  return sec('Добавить комнату', `<div class="opt tiles">${types}</div>${note('Комната появится на ближайшем свободном месте. Затем перетащите её мышью или пальцем: шаг 1 м.')}`)
    + sec('Комнаты', h.rooms.length ? `<div class="list">${list}</div>` : `<div class="empty">${ICON.plan}<b>План пуст</b><span>Добавьте комнату или загрузите готовую планировку ниже.</span></div>`, `${h.rooms.length} шт.`)
    + sec('Готовые планировки', `<div class="list">${MODELS.map(m => `<button type="button" class="row-b" data-act="preset" data-v="${m.id}"><b>«${m.name}»</b><small>${PRE[m.id].length} комнат · ${m.rooms}</small></button>`).join('')}</div>${note('Заменяет текущие комнаты. Действие можно отменить кнопкой «Отменить».')}`);
}

function leftInterior(c) {
  const { h, S } = c, ar = c.room;
  if (!h.rooms.length) return sec('Интерьер', `<div class="empty">${ICON.interior}<b>Сначала нужны комнаты</b><span>Комнаты из планировки автоматически появляются в интерьере.</span>${btn('mode', 'Перейти к планировке', { v: 'plan', cls: 'primary' })}</div>`);
  const tabs = `<div class="opt">${h.rooms.map(r => `<button type="button" class="chip" data-act="selroom" data-v="${r.id}" aria-pressed="${ar && ar.id === r.id}">${roomName(r)}<small>${r.w}×${r.d}</small></button>`).join('')}</div>`;
  const rec = ar ? ROOM_FURN[ar.type] || [] : [];
  const keys = Object.keys(FLIST).filter(k => FLIST[k].cat === S.furnCat);
  const cats = `<div class="opt">${FCATS.map(x => `<button type="button" class="chip sm" data-act="furncat" data-v="${x.id}" aria-pressed="${S.furnCat === x.id}">${x.n}</button>`).join('')}</div>`;
  const cards = keys.map(k => { const f = FLIST[k]; return `<button type="button" class="fcard" data-act="addfurn" data-v="${k}"${ar ? '' : ' disabled'}><span class="fi" style="background:${f.c}"></span><b>${f.n}</b><small>${m1(f.w * 100 / 100)}×${m1(f.d)}×${m1(f.h)} м</small><small class="pr">${f.p ? fmt(f.p) : 'цена по запросу'}</small>${rec.includes(k) ? '<em>для этой комнаты</em>' : ''}</button>` }).join('');
  return sec('Комната', tabs, ar ? `${ar.w}×${ar.d} м` : '') + sec('Мебель', `${cats}<div class="fgrid">${cards}</div>${note('Предмет ставится на свободное место комнаты. Перетаскивайте его мышью, поворачивайте и удаляйте справа. Предметы не могут пересекаться.')}`)
    + sec('Ракурсы', `<div class="opt">${[['top', 'Сверху', 'top'], ['iso', 'Изометрия', 'iso'], ['room', 'Комната', 'fit'], ['inside', 'Изнутри', 'inside']].map(([id, n, ic]) => btn('iview', n, { v: id, icon: ic, pressed: S.iview === id })).join('')}</div>
      <div class="lbl">Стены и потолок</div>${seg('cut', [{ id: 'full', n: 'Целые' }, { id: 'cut', n: 'Срез' }, { id: 'hidden', n: 'Скрыть' }], S.cut)}`);
}

function matCard(m, cur, act, extra = '') {
  const apply = act && !m._na;
  return `<div class="mc${cur ? ' on' : ''}${m._na ? ' na' : ''}"><button type="button" class="mcard big" ${act ? `data-act="${act}" data-v="${m.id}"` : `data-act="matinfo" data-v="${m.id}"`} aria-pressed="${!!cur}"${m._na ? ' disabled' : ''}>${matSw(m.id, true)}<b>${m.n}</b><small>${(MCATS.find(x => x.id === m.cat) || {}).n} · <i class="dot" style="background:${m.c}"></i>${m.c}</small><span class="desc">${m.desc}</span>${extra}${cur ? `<em class="mark">${ICON.check} выбрано</em>` : ''}</button><label class="cmp"><input type="checkbox" data-in="cmp" data-v="${m.id}"${extra === '__' ? '' : ''} ${(m._cmp ? 'checked' : '')}> сравнить</label></div>`;
}

function leftMaterials(c) {
  const { h, S } = c, ar = c.room, fur = S.sel && S.sel.t === 'furn' ? ar && ar.furn.find(f => f.id === S.sel.id) : null;
  const T = [['facade', 'Фасад'], ['roof', 'Кровля'], ['frame', 'Рамы'], ['floor', 'Пол комнаты'], ['floorall', 'Пол везде'], ['wall', 'Стены комнаты'], ['furn', 'Мебель'], ['library', 'Все образцы']];
  const tg = `<div class="opt">${T.map(([id, n]) => `<button type="button" class="chip sm" data-act="mattarget" data-v="${id}" aria-pressed="${S.matTarget === id}">${n}</button>`).join('')}</div>`;
  const ctxLine = { facade: 'Применяется ко всем наружным стенам дома.', roof: 'Применяется ко всей кровле.', frame: 'Рамы всех окон и дверей.', floor: ar ? `Пол комнаты «${roomName(ar)}».` : 'Выберите комнату на модели.', floorall: 'Пол всех комнат, кроме комнат с индивидуальным полом.', wall: ar ? `Внутренние стены комнаты «${roomName(ar)}».` : 'Выберите комнату на модели.', furn: fur ? `Отделка предмета «${FLIST[fur.key].n}».` : 'Выберите предмет мебели на модели.', library: 'Справочник: нажмите на образец, чтобы отметить его для сравнения.' }[S.matTarget];
  let body = '';
  const flt = list => list.filter(m => S.matCat === 'all' || m.cat === S.matCat);
  const cats = `<div class="opt">${[{ id: 'all', n: 'Все' }, ...MCATS].map(x => `<button type="button" class="chip sm" data-act="matcat" data-v="${x.id}" aria-pressed="${S.matCat === x.id}">${x.n}</button>`).join('')}</div>`;
  const withCmp = m => ({ ...m, _cmp: S.cmp.includes(m.id) });
  if (S.matTarget === 'facade') body = `<div class="mgrid">${FACADES.map(x => facadeCard(x, h.facade)).join('')}</div>${note(facadeById(h.facade).note)}${tintControls(h)}`;
  else if (S.matTarget === 'frame') body = frameControls(h);
  else if (S.matTarget === 'floor' || S.matTarget === 'floorall') {
    const cur = S.matTarget === 'floor' && ar ? (ar.floor || h.floor) : h.floor;
    body = `<div class="mlist">${FLOORS.map(f => `<div class="mc${cur === f.id ? ' on' : ''}"><button type="button" class="mcard big" data-act="${S.matTarget}" data-v="${f.id}" aria-pressed="${cur === f.id}"${S.matTarget === 'floor' && !ar ? ' disabled' : ''}>${matSw(f.mat, true)}<b>${f.n}</b><small>${priceTxt(f.p)}</small><span class="desc">${matById(f.mat).desc}</span>${cur === f.id ? `<em class="mark">${ICON.check} выбрано</em>` : ''}</button></div>`).join('')}</div>${note('Для пола доступны четыре варианта из расчёта: цена считается по ним.')}`;
  } else {
    let list, act, curId = null;
    if (S.matTarget === 'roof') { list = MATERIALS.filter(m => ROOF_MATS.includes(m.id)); act = 'roofmat'; curId = h.roofMat }
    else if (S.matTarget === 'wall') { list = MATERIALS.filter(m => WALL_FINISHES.includes(m.id)); act = 'wallfin'; curId = ar && ar.fin.wall }
    else if (S.matTarget === 'furn') { const fin = fur && FIN_MATS[FLIST[fur.key].fin]; list = fin ? MATERIALS.filter(m => fin.includes(m.id)) : []; act = 'furnfin'; curId = fur && fur.m }
    else { list = MATERIALS; act = null }
    list = flt(list).map(withCmp);
    if (S.matTarget === 'furn' && !fur) body = `<div class="empty">${ICON.interior}<b>Нет выбранной мебели</b><span>Щёлкните по предмету на модели. Для предметов без отделки (раковина, холодильник) материал не меняется.</span></div>`;
    else if (S.matTarget === 'furn' && !list.length) body = note('У этого предмета нет сменной отделки.');
    else body = `<div class="mlist">${list.map(m => matCard(m, curId === m.id, act)).join('')}</div>`;
    body = (S.matTarget !== 'furn' || fur ? cats : '') + body;
  }
  const cmp = S.cmp.length ? `<div class="opt">${btn('cmp', `Сравнить (${S.cmp.length})`, { icon: 'compare', cls: 'primary', dis: S.cmp.length < 2 })}${btn('cmpclear', 'Сбросить')}</div>` : '';
  return sec('Применить к', tg + note(ctxLine)) + sec('Библиотека', body + cmp, `${MATERIALS.length} образцов`);
}

function leftOverview(c) {
  const { S } = c;
  return sec('Окружение', `<div class="opt">${btn('env', 'Природа и небо', { icon: 'sun', pressed: S.env, cls: 'tog' })}${btn('shadows', 'Мягкие тени', { pressed: S.shadows, cls: 'tog' })}${btn('autorot', 'Автовращение', { pressed: S.autoRotate, cls: 'tog' })}</div>
    <div class="lbl">Время суток</div>${seg('time', [{ id: 'morning', n: 'Утро' }, { id: 'day', n: 'День' }, { id: 'evening', n: 'Вечер' }], S.time)}${note('Режим обзора только для просмотра: объекты не выбираются и не перемещаются, поэтому ничего нельзя сдвинуть случайно.')}`)
    + sec('Материалы и снимок', `<div class="opt">${btn('shot', 'Снимок PNG', { icon: 'shot', cls: 'primary' })}${btn('summary', 'Сводка проекта', { icon: 'doc' })}</div>${note('Снимок сохраняется файлом на ваше устройство. Дизайнер получает проект как конфигурацию, а не картинку.')}`);
}

/* ---------- правая панель: свойства ---------- */
export function renderProps(c) {
  const { S, h } = c, s = S.sel;
  if (!s) return propsNone(c);
  const room = s.roomId != null ? h.rooms.find(r => r.id === s.roomId) : s.t === 'room' ? h.rooms.find(r => r.id === s.id) : null;
  if (s.t === 'room' && room) return propsRoom(c, room);
  if (s.t === 'roof') return sec('Кровля', roofControls(h));
  if (s.t === 'wall' && room) return propsWall(c, room, s.side);
  if (s.t === 'open' && room) return propsOpen(c, room, room.open.find(o => o.id === s.id));
  if (s.t === 'furn' && room) return propsFurn(c, room, room.furn.find(f => f.id === s.id));
  if (s.t === 'extra') return propsExtra(c, h.extras.find(e => e.id === s.id));
  return propsNone(c);
}

function propsNone(c) {
  const { h, S } = c, tips = {
    exterior: 'Щёлкните по стене, окну, двери, крыше или ступеням, чтобы изменить их.',
    plan: 'Щёлкните по комнате, чтобы изменить размер, поворот или положение. Тяните комнату мышью.',
    interior: 'Щёлкните по комнате или предмету мебели. Предметы можно перетаскивать по полу.',
    materials: 'Щёлкните по поверхности на модели: фасад, кровля, пол, стена или мебель — материал выберется слева.',
    overview: 'Вращайте дом мышью, приближайте колесом. Настройки света — слева.'
  };
  return sec('Ничего не выбрано', `<div class="empty">${ICON.move}<b>${h.rooms.length ? 'Выберите объект' : 'Проект пуст'}</b><span>${h.rooms.length ? tips[S.mode] : 'Перейдите в «Планировку» и добавьте комнату.'}</span></div>`);
}

function propsRoom(c, r) {
  const { h } = c, T = TYPES[r.type], nb = neighbors(h, r), open = isOpen(r);
  const fl = FLOORS.find(f => f.id === (r.floor || h.floor));
  const f = c.S.mode === 'plan' ? '' : '';
  return sec(`${T.n}`, `<p class="pnl-lead">${r.w}×${r.d} м · <b>${r.w * r.d} м²</b></p>
    <div class="fld"><label for="in-room.type">Тип</label><select id="in-room.type" data-in="room.type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${k === r.type ? ' selected' : ''}>${t.n}</option>`).join('')}</select></div>
    ${stepper('room.w', r.w, 1, GW, 1, 'Ширина', 'м')}${stepper('room.d', r.d, 1, GD, 1, 'Длина', 'м')}
    <div class="fld"><label for="in-room.a">Площадь, м²</label><input id="in-room.a" type="number" data-in="room.a" value="${r.w * r.d}" min="1" max="${MAX_AREA_INPUT}" inputmode="numeric"><small>Введите площадь: длина подберётся по сетке (до ${MAX_AREA_INPUT} м²).</small></div>`, 'Размеры')
    + sec('Положение', `<div class="padgrid"><span></span>${btn('nudge', '↑', { attrs: 'aria-label="Сдвинуть на север" data-dx="0" data-dz="-1"', cls: 'icon' })}<span></span>
      ${btn('nudge', '←', { attrs: 'aria-label="Сдвинуть на запад" data-dx="-1" data-dz="0"', cls: 'icon' })}<span class="pos">${r.x}, ${r.z}</span>${btn('nudge', '→', { attrs: 'aria-label="Сдвинуть на восток" data-dx="1" data-dz="0"', cls: 'icon' })}
      <span></span>${btn('nudge', '↓', { attrs: 'aria-label="Сдвинуть на юг" data-dx="0" data-dz="1"', cls: 'icon' })}<span></span></div>
      <div class="opt">${btn('rotate', 'Повернуть', { icon: 'rotate' })}${btn('dup', 'Дублировать', { icon: 'copy' })}${btn('resetpos', 'Сбросить положение', { icon: 'reset' })}${btn('del', 'Удалить', { icon: 'trash', cls: 'danger' })}</div>
      ${note(`Отступ от западной границы участка ${r.x} м, от северной ${r.z} м. Шаг перемещения 1 м.${nb.length ? ` Соседи: ${nb.map(n => roomName(n)).join(', ')}.` : ' Комната стоит отдельно.'}`)}`)
    + (open ? sec('Терраса', note('У террасы нет стен, потолка и окон. Расчёт — по строке «Терраса: основа и настил».')) : sec('Отделка', `<div class="kv"><span>Пол</span><b>${fl.n}</b></div><div class="kv"><span>Стены внутри</span><b>${matById(r.fin.wall).n}</b></div><div class="kv"><span>Окон и дверей</span><b>${r.open.length}</b></div><div class="kv"><span>Мебели</span><b>${r.furn.length}</b></div><div class="opt">${btn('mode', 'Изменить материалы', { v: 'materials' })}${btn('mode', 'Обставить', { v: 'interior' })}</div>`));
}

function propsWall(c, r, side) {
  const info = sideInfo(c.h, r, side), ops = r.open.filter(o => o.s === side);
  const shared = info.shared.reduce((a, [x, y]) => a + (y - x), 0), exp = info.exposed.reduce((a, [x, y]) => a + (y - x), 0);
  const adds = Object.entries(OPENING_KINDS).map(([k, K]) => { const p = findOpeningPos(c.h, r, side, k); return btn('addopen', K.n, { v: k, icon: 'plus', dis: p == null, title: p == null ? 'На этой стене нет свободного места для такого проёма' : '' }) }).join('');
  return sec(`${SIDES[side]} стена`, `<p class="pnl-lead">Комната «${roomName(r)}» · длина ${m1(info.len)} м</p>
    <div class="kv"><span>Наружная часть</span><b>${m1(exp)} м</b></div><div class="kv"><span>Общая с соседней комнатой</span><b>${m1(shared)} м</b></div>
    ${isOpen(r) ? note('У террасы нет стен.', 'warn') : exp < 0.5 + OPEN_MARGIN * 2 ? note('Эта стена внутренняя: окна и двери ставятся только на наружные стены.', 'warn') : ''}`)
    + sec('Окна и двери', `${ops.length ? `<div class="list">${ops.map(o => `<button type="button" class="row-b" data-act="selopen" data-v="${o.id}"><b>${OPENING_KINDS[o.k].n}</b><small>${o.w}×${o.h} м${openingProblem(c.h, r, o) ? ' · ' + ICON.warn : ''}</small></button>`).join('')}</div>` : note('На этой стене пока нет окон и дверей.')}<div class="lbl">Добавить</div><div class="opt">${adds}</div>`);
}

function propsOpen(c, r, o) {
  if (!o) return propsNone(c);
  const K = OPENING_KINDS[o.k], prob = openingProblem(c.h, r, o), info = sideInfo(c.h, r, o.s);
  return sec(K.n, `<p class="pnl-lead">${SIDES[o.s]} стена · «${roomName(r)}»</p>
    ${prob ? note(prob, 'warn') : note('Размещение допустимо.', 'ok')}
    <div class="fld"><label for="in-open.k">Тип</label><select id="in-open.k" data-in="open.k">${Object.entries(OPENING_KINDS).map(([k, x]) => `<option value="${k}"${k === o.k ? ' selected' : ''}>${x.n}</option>`).join('')}</select></div>
    <div class="fld"><label for="in-open.p">Положение вдоль стены, м</label><input id="in-open.p" type="range" data-in="open.p" data-live="1" min="${m1(o.w / 2 + OPEN_MARGIN)}" max="${m1(Math.max(o.w / 2 + OPEN_MARGIN, info.len - o.w / 2 - OPEN_MARGIN))}" step="0.05" value="${o.p}"><div class="stepper"><button type="button" class="b icon" data-act="step" data-k="open.p" data-d="-0.1" aria-label="Левее">−</button><input type="number" data-in="open.p" value="${o.p}" step="0.05" inputmode="decimal" aria-label="Положение, м"><button type="button" class="b icon" data-act="step" data-k="open.p" data-d="0.1" aria-label="Правее">+</button></div><small>Отсчёт от левого угла стены, если смотреть снаружи.</small></div>`, 'Положение')
    + sec('Размеры', `${stepper('open.w', o.w, K.wMin, K.wMax, 0.1, 'Ширина', 'м')}${stepper('open.h', o.h, K.hMin, K.hMax, 0.1, 'Высота', 'м')}${K.door ? note('Двери стоят на уровне пола.') : stepper('open.y', o.y, K.ymin, H - 0.1 - K.hMin, 0.1, 'Высота подоконника', 'м')}
      <div class="opt">${btn('dup', 'Дублировать', { icon: 'copy' })}${btn('del', 'Удалить', { icon: 'trash', cls: 'danger' })}${btn('selwall', 'К стене', { v: o.s })}</div>`);
}

function propsExtra(c, e) {
  if (!e) return propsNone(c);
  const K = EXTRA_KINDS[e.k], prob = extraProblem(c.h, e);
  return sec(K.n, `${prob ? note(prob, 'warn') : note(K.note, 'ok')}
    ${stepper('extra.w', e.w, K.wMin, K.wMax, 1, 'Ширина', 'м')}${stepper('extra.d', e.d, K.dMin, K.dMax, 1, 'Глубина', 'м')}
    <div class="padgrid"><span></span>${btn('nudge', '↑', { attrs: 'aria-label="Сдвинуть на север" data-dx="0" data-dz="-1"', cls: 'icon' })}<span></span>${btn('nudge', '←', { attrs: 'aria-label="Сдвинуть на запад" data-dx="-1" data-dz="0"', cls: 'icon' })}<span class="pos">${e.x}, ${e.z}</span>${btn('nudge', '→', { attrs: 'aria-label="Сдвинуть на восток" data-dx="1" data-dz="0"', cls: 'icon' })}<span></span>${btn('nudge', '↓', { attrs: 'aria-label="Сдвинуть на юг" data-dx="0" data-dz="1"', cls: 'icon' })}<span></span></div>
    <div class="opt">${btn('rotate', 'Повернуть', { icon: 'rotate' })}${btn('dup', 'Дублировать', { icon: 'copy' })}${btn('del', 'Удалить', { icon: 'trash', cls: 'danger' })}</div>${note('Не входит в расчёт: уточняется при согласовании.')}`);
}

function propsFurn(c, r, f) {
  if (!f) return propsNone(c);
  const D = FLIST[f.key], fp = furnFoot(f), col = furnCollision(r, f), fin = D.fin && FIN_MATS[D.fin];
  return sec(D.n, `<p class="pnl-lead">${m1(D.w)}×${m1(D.d)}×${m1(D.h)} м · «${roomName(r)}»</p>
    ${col ? note(`Пересекается с предметом «${FLIST[col.key].n}».`, 'warn') : ''}
    <div class="kv"><span>Цена</span><b>${D.p ? fmt(D.p) : 'уточнит менеджер'}</b></div>
    ${stepper('furn.x', f.x, 0, Math.max(0, r.w - fp.w), 0.05, 'Положение X', 'м')}${stepper('furn.z', f.z, 0, Math.max(0, r.d - fp.d), 0.05, 'Положение Z', 'м')}
    <div class="opt">${btn('rotate', 'Повернуть на 90°', { icon: 'rotate' })}${btn('dup', 'Дублировать', { icon: 'copy' })}${btn('del', 'Удалить', { icon: 'trash', cls: 'danger' })}</div>`, 'Положение')
    + (fin ? sec('Отделка', `<div class="mgrid sm">${fin.map(id => `<button type="button" class="mcard" data-act="furnfin" data-v="${id}" aria-pressed="${f.m === id}">${matSw(id)}<b>${matById(id).n}</b></button>`).join('')}</div>${f.m ? btn('furnfin', 'Сбросить цвет', { v: '' }) : note('Сейчас стандартный цвет модели.')}`) : '');
}

/* ---------- итоговая панель ---------- */
export function projectNumbers(h) {
  const cfg = serializeProject(h), calc = calcProject(cfg), b = bbox(h);
  const wins = h.rooms.reduce((a, r) => a + r.open.filter(o => !OPENING_KINDS[o.k].door).length, 0), doors = h.rooms.reduce((a, r) => a + r.open.filter(o => OPENING_KINDS[o.k].door).length, 0);
  return { cfg, calc, bbox: b, wins, doors, area: totalArea(h), closed: closedArea(h), terrace: totalArea(h) - closedArea(h), unpriced: calc.furniture.unpricedQty || 0 };
}
export function renderTotal(c) {
  const { h, S } = c, n = projectNumbers(h), cl = n.calc;
  const st = S.meta.status ? `<div class="kv"><span>Статус на сервере</span><b>${PST[S.meta.status] || S.meta.status}</b></div>` : '';
  return sec('Итого', `<div class="kv"><span>Комнат</span><b>${h.rooms.length}</b></div>
    <div class="kv"><span>Общая площадь</span><b>${n.area} м²</b></div>
    ${n.terrace ? `<div class="kv"><span>из них терраса</span><b>${n.terrace} м²</b></div>` : ''}
    <div class="kv"><span>Габариты</span><b>${n.bbox ? n.bbox.w + ' × ' + n.bbox.d + ' м' : '—'}</b></div>
    <div class="kv"><span>Окон / дверей</span><b>${n.wins} / ${n.doors}</b></div>${st}
    <div class="price"><small>Модули, предварительная оценка</small><b>≈ ${fmt(cl.modules)}</b></div>
    <div class="kv sm"><span>Фундамент (ориентир по ставкам расчёта)</span><b>≈ ${fmt(cl.foundation.total)}</b></div>
    <div class="kv sm"><span>Мебель из каталога</span><b>${fmt(cl.furniture.total)}</b></div>`, 'Расчёт')
    + sec('Что это за цены', `<ul class="plain"><li><b>Подтверждённая цена</b> появляется только после согласования проекта дизайнером.</li><li>Модули — предварительная оценка по текущим ценам сайта. Фундамент и мебель дизайнер считает при согласовании.</li>${n.unpriced ? `<li>У ${n.unpriced} шт. мебели нет цены в каталоге: их стоимость уточнит менеджер.</li>` : ''}<li>Не входят в расчёт: окна и двери, ступени и навес, тип и материал кровли.</li></ul><p class="pnl-note">Цены на сайте условные (демонстрационные). ${INCLUDED}</p>`);
}

/* ---------- сводка проекта ---------- */
export function summaryHTML(c) {
  const { h, S } = c, n = projectNumbers(h), f = facadeById(h.facade), cl = n.calc, esc2 = esc;
  const roomRows = h.rooms.map(r => { const fl = FLOORS.find(x => x.id === (r.floor || h.floor)); return `<tr><td>${roomName(r)}</td><td>${r.w}×${r.d} м</td><td class="n">${r.w * r.d} м²</td><td>${isOpen(r) ? 'терраса' : fl.n}</td><td>${isOpen(r) ? '—' : matById(r.fin.wall).n}</td></tr>` }).join('');
  const opRows = h.rooms.flatMap(r => r.open.map(o => `<tr><td>${roomName(r)}</td><td>${OPENING_KINDS[o.k].n}</td><td>${SIDES[o.s]} стена</td><td>${o.w}×${o.h} м</td></tr>`)).join('');
  const fRows = cl.furniture.items.map(i => `<tr><td>${esc2(i.room)}</td><td>${esc2(i.name)} × ${i.qty}</td><td class="n">${i.unpriced ? 'цену уточнит менеджер' : fmt(i.total)}</td></tr>`).join('');
  const exRows = h.extras.map(e => `<tr><td>${EXTRA_KINDS[e.k].n}</td><td>${e.w}×${e.d} м</td></tr>`).join('');
  const title = S.meta.title || 'Проект без названия';
  return `<div class="sum">
  <h2 id="sumT">${esc2(title)}</h2>
  <p class="who">${S.meta.model && S.meta.model !== 'proj' ? 'Основа: модель «' + esc2((MODELS.find(m => m.id === S.meta.model) || {}).name || '') + '». ' : ''}Комнат: ${h.rooms.length} · площадь ${n.area} м²${n.bbox ? ' · габариты ' + n.bbox.w + '×' + n.bbox.d + ' м' : ''}${S.meta.status ? ' · статус: ' + (PST[S.meta.status] || S.meta.status) : ''}</p>
  <div class="sum-imgs"><figure><img id="sumShot" alt="Снимок 3D-модели" width="480" height="300"><figcaption>3D-вид</figcaption></figure><figure><canvas id="sumPlan" width="480" height="300" role="img" aria-label="План дома"></canvas><figcaption>План</figcaption></figure></div>
  <h3>Экстерьер</h3><div class="tw"><table class="tbl"><tbody><tr><td>Фасад</td><td>${f.n}</td></tr><tr><td>Класс расчёта наружных стен</td><td>${wallBy(h.wall).n} (${priceTxt(wallBy(h.wall).p)})</td></tr><tr><td>Кровля</td><td>${h.roof ? ROOF_TYPES.find(t => t.id === h.roofType).n + ', ' + matById(h.roofMat).n : 'не показывается'}</td></tr><tr><td>Рамы окон</td><td>${FRAMES.find(x => x.id === h.frame).n}</td></tr><tr><td>Пол по умолчанию</td><td>${FLOORS.find(x => x.id === h.floor).n}</td></tr></tbody></table></div>
  <h3>Комнаты и отделка</h3><div class="tw"><table class="tbl"><thead><tr><th>Комната</th><th>Размер</th><th class="n">Площадь</th><th>Пол</th><th>Стены внутри</th></tr></thead><tbody>${roomRows || '<tr><td colspan="5">Комнат нет</td></tr>'}</tbody></table></div>
  ${opRows ? `<h3>Окна и двери</h3><div class="tw"><table class="tbl"><thead><tr><th>Комната</th><th>Тип</th><th>Стена</th><th>Размер</th></tr></thead><tbody>${opRows}</tbody></table></div>` : ''}
  ${exRows ? `<h3>Элементы участка</h3><div class="tw"><table class="tbl"><tbody>${exRows}</tbody></table></div>` : ''}
  ${fRows ? `<h3>Мебель</h3><div class="tw"><table class="tbl"><thead><tr><th>Комната</th><th>Предмет</th><th class="n">Цена</th></tr></thead><tbody>${fRows}</tbody></table></div>` : ''}
  <h3>Стоимость</h3><div class="tw"><table class="tbl"><tbody><tr><td>Модули (предварительная оценка)</td><td class="n">≈ ${fmt(cl.modules)}</td></tr><tr><td>Фундамент (ориентир, считает менеджер при согласовании)</td><td class="n">≈ ${fmt(cl.foundation.total)}</td></tr><tr><td>Мебель из каталога</td><td class="n">${fmt(cl.furniture.total)}</td></tr></tbody></table></div>
  <p class="who">Это предварительная оценка, а не подтверждённая цена. Подтверждённая стоимость фиксируется после согласования проекта дизайнером. Окна, двери, ступени, навес, тип и материал кровли в расчёт не входят. Цены на сайте условные (демонстрационные).</p></div>`;
}

/* ---------- сравнение материалов ---------- */
export function compareHTML(ids) {
  const ms = ids.map(matById).filter(Boolean);
  const row = (n, f) => `<tr><th scope="row">${n}</th>${ms.map(m => `<td>${f(m)}</td>`).join('')}</tr>`;
  const use = { facade: 'фасад', wall: 'стены внутри', floor: 'пол', roof: 'кровля', frame: 'рамы', furn: 'мебель', glass: 'остекление' };
  return `<div class="tw"><table class="tbl cmp"><tbody>
  <tr><th></th>${ms.map(m => `<td>${matSw(m.id, true).replace('class="sw big"', 'class="sw huge"')}</td>`).join('')}</tr>
  ${row('Название', m => `<b>${m.n}</b>`)}${row('Категория', m => (MCATS.find(x => x.id === m.cat) || {}).n)}${row('Цвет', m => `<i class="dot" style="background:${m.c}"></i> ${m.c}`)}
  ${row('Шероховатость', m => `${Math.round(m.r * 100)}% ${m.r < .4 ? '(глянец)' : m.r < .8 ? '(полумат)' : '(мат)'}`)}${row('Металличность', m => `${Math.round(m.m * 100)}%`)}
  ${row('Где применяется', m => m.use.map(u => use[u]).filter(Boolean).join(', '))}${row('Описание', m => m.desc)}</tbody></table></div>`;
}
