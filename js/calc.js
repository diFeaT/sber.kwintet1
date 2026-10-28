/* Расчёт стоимости. Формулы, ставки и структура результата перенесены из прежней версии без изменений
   (calcProject / sumCalc / calcHTML). Единственное добавление: позиции мебели без известной цены
   помечаются unpriced и не входят в сумму — их уточняет менеджер. */
import { TYPES, WALLS, FLOORS, FLIST, RATES, GW, GD } from './data.js';
import { esc, fmt, clamp } from './util.js';

export function sumCalc(c) {
  c.total = c.modules + c.foundation.total + c.furniture.total + (c.adjustments || []).reduce((s, a) => s + (+a.amount || 0), 0);
  return c;
}

export function calcProject(c, adj) {
  const wall = WALLS.find(w => w.id === c.wall) || WALLS[0], rooms = [], fm = {};
  let modules = 0, closedA = 0, openA = 0, unpricedQty = 0;
  (c.rooms || []).forEach(r => {
    const T = TYPES[r.type]; if (!T) return;
    const w = clamp(Math.round(+r.w) || T.w, 1, GW), d = clamp(Math.round(+r.d) || T.d, 1, GD), a = w * d, fl = FLOORS.find(f => f.id === (r.floor || c.floor)) || FLOORS[0];
    const raw = T.open ? [['Терраса: основа и настил', a * RATES.terrace]] : [
      ['Модуль: каркас, утепление, внутренняя отделка', a * RATES.base], ['Наружные стены: ' + wall.n, a * wall.p], ['Пол: ' + fl.n, a * fl.p],
      ['Влагозащита и подводки', T.wet ? a * RATES.wet : 0], ['Кровля', a * RATES.roof]];
    const lines = raw.filter(l => l[1]).map(l => [l[0], Math.round(l[1])]), total = lines.reduce((s, l) => s + l[1], 0);
    rooms.push({ name: T.n, w, d, area: a, lines, total }); modules += total; if (T.open) openA += a; else closedA += a;
    (r.furn || []).forEach(f => {
      const b = FLIST[f.key]; if (!b) return;
      const k = T.n + '|' + f.key; fm[k] = fm[k] || { room: T.n, name: b.n, price: b.p == null ? 0 : b.p, qty: 0 };
      if (b.p == null) fm[k].unpriced = true;
      fm[k].qty++; if (b.p == null) unpricedQty++;
    });
  });
  const items = Object.values(fm).map(i => ({ ...i, total: i.price * i.qty }));
  const c2 = sumCalc({
    v: 1, rooms, modules,
    foundation: { closedArea: closedA, openArea: openA, rate: RATES.foundation, rateOpen: RATES.foundationOpen, total: Math.round(closedA * RATES.foundation + openA * RATES.foundationOpen) },
    furniture: { items, total: items.reduce((s, i) => s + i.total, 0) },
    adjustments: (adj || []).map(a => ({ name: String(a.name || '').slice(0, 80), amount: Math.round(+a.amount || 0) })), at: new Date().toISOString()
  });
  if (unpricedQty) c2.furniture.unpricedQty = unpricedQty;
  return c2;
}

export function calcHTML(c) {
  const m = n => fmt(Math.round(n)), tr = (a, b, cls) => `<tr${cls ? ` class="${cls}"` : ''}><td>${a}</td><td class="n">${b}</td></tr>`, tw = h => `<div class="tw"><table class="tbl">${h}</table></div>`;
  let h = '<h3>Модули по комнатам</h3>';
  c.rooms.forEach(r => { h += tw(`<thead><tr><th>${esc(r.name)} · ${r.w}×${r.d} м · ${r.area} м²</th><th class="n">Сумма</th></tr></thead><tbody>${r.lines.map(l => tr(esc(l[0]), m(l[1]))).join('')}${tr('<b>Итого по комнате</b>', '<b>' + m(r.total) + '</b>')}</tbody>`) });
  const f = c.foundation;
  h += '<h3>Фундамент</h3>' + tw('<tbody>' + (f.closedArea ? tr(`Комнаты: ${f.closedArea} м² × ${m(f.rate)}`, m(f.closedArea * f.rate)) : '') + (f.openArea ? tr(`Терраса: ${f.openArea} м² × ${m(f.rateOpen)}`, m(f.openArea * f.rateOpen)) : '') + tr('<b>Итого фундамент</b>', '<b>' + m(f.total) + '</b>') + '</tbody>');
  if (c.furniture.items.length) h += '<h3>Мебель</h3>' + tw('<thead><tr><th>Позиция</th><th class="n">Сумма</th></tr></thead><tbody>' + c.furniture.items.map(i => i.unpriced ? tr(`${esc(i.room)}: ${esc(i.name)} × ${i.qty}`, 'цену уточнит менеджер') : tr(`${esc(i.room)}: ${esc(i.name)} × ${i.qty} (${m(i.price)} за шт.)`, m(i.total))).join('') + tr('<b>Итого мебель</b>', '<b>' + m(c.furniture.total) + '</b>') + '</tbody>');
  const adj = (c.adjustments || []).filter(a => a.name || a.amount), adjSum = adj.reduce((s, a) => s + (+a.amount || 0), 0);
  if (adj.length) h += '<h3>Корректировки дизайнера</h3>' + tw('<tbody>' + adj.map(a => tr(esc(a.name || 'Корректировка'), m(a.amount))).join('') + '</tbody>');
  h += '<h3>Полная стоимость</h3>' + tw('<tbody>' + tr('Модули', m(c.modules)) + tr('Фундамент', m(f.total)) + tr('Мебель', m(c.furniture.total)) + (adj.length ? tr('Корректировки', m(adjSum)) : '') + tr('<b style="font-size:1.25em">ИТОГО</b>', '<b style="font-size:1.25em">' + m(c.total) + '</b>', 'tot') + '</tbody>');
  return h;
}
