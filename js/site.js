/* Главная страница: живая 3D-сцена в первом экране, каталог моделей с фильтрами, образцы материалов.
   Если WebGL или three.js недоступны, остаётся SVG-иллюстрация. */
import { MODELS, PRE, TYPES, FACADES, MATERIALS, WALLS, FLOORS } from './data.js';
import { $, $$, esc, fmt } from './util.js';
import { ensureThree } from './three-loader.js';
import { createScene, webglAvailable } from './scene.js';
import { presetHouse, totalArea } from './layout.js';
import { swatch } from './mats.js';

let hero = null, heroState = 'idle', thumbs = {}, filters = { bed: 'all', ter: false, sort: 'price' }, io = null;

/* Запасная иллюстрация (SVG), как в прежней версии, в новой палитре */
function houseSvg(m, f, roofType, terr) {
  const w = m.w, x = (460 - w) / 2, t = terr ? 110 : 0;
  const roof = roofType === 'gable' ? `<polygon points="${x - 10},170 ${x + w / 2},120 ${x + w + 10},170" fill="#343c35"/>` : `<rect x="${x - 10}" y="160" width="${w + 20}" height="12" fill="#343c35"/>`;
  const wins = [...Array(Math.max(2, Math.round(w / 90)))].map((_, i, a) => `<rect x="${x + 20 + i * ((w - 60) / Math.max(1, a.length - 1))}" y="200" width="40" height="46" fill="#cfdcdc" stroke="#343c35" stroke-width="3"/>`).join('');
  return `<svg viewBox="0 0 560 300" width="100%" role="img" aria-label="Схема дома ${esc(m.name)}"><rect x="0" y="278" width="560" height="22" fill="#69765b" opacity=".45"/>${terr ? `<rect x="${x + w}" y="262" width="${t}" height="14" fill="#a87850"/><rect x="${x + w + t - 6}" y="230" width="6" height="32" fill="#a87850"/>` : ''}<rect x="${x}" y="168" width="${w}" height="110" fill="${f}"/>${roof}${wins}<rect x="${x + w - 46}" y="214" width="30" height="64" fill="#343c35"/></svg>`;
}
const FAC_COL = { 'larch-v': '#b9834a', graphite: '#3f484c', plaster: '#d9d6cc' };

const planOf = id => PRE[id].map(a => `${TYPES[a[0]].n} ${a[1]}×${a[2]}`);
const planArea = id => PRE[id].reduce((s, a) => s + a[1] * a[2], 0);
const hasTerr = id => PRE[id].some(a => a[0] === 'ter');

function renderCatalog() {
  const list = MODELS.filter(m => (filters.bed === 'all' || String(m.bedrooms) === filters.bed) && (!filters.ter || hasTerr(m.id)))
    .sort((a, b) => filters.sort === 'area' ? a.area - b.area : a.price - b.price);
  $('#projCount').textContent = list.length === MODELS.length ? `${list.length} модели` : `Найдено: ${list.length} из ${MODELS.length}`;
  $('#projGrid').innerHTML = list.length ? list.map(m => `<article class="pcard">
    <div class="pic" data-model="${m.id}">${thumbs[m.id] ? `<img src="${thumbs[m.id]}" alt="3D-визуализация модели «${esc(m.name)}»" width="640" height="420" loading="lazy">` : houseSvg(m, FAC_COL[m.facade] || '#b9834a', m.roofType, hasTerr(m.id))}</div>
    <div class="txt"><div class="hd"><h3>${esc(m.name)}</h3><span class="price">от ${fmt(m.price)}</span></div>
    <ul class="spec"><li><b>${m.area} м²</b><span>площадь</span></li><li><b>${m.bedrooms}</b><span>${m.bedrooms === 1 ? 'спальня' : 'спальни'}</span></li><li><b>${PRE[m.id].length}</b><span>комнат</span></li><li><b>${hasTerr(m.id) ? 'есть' : 'нет'}</b><span>терраса</span></li></ul>
    <p class="plan">Состав по плану: ${planOf(m.id).join(', ')}. В конструкторе по плану ${planArea(m.id)} м².</p>
    <p class="kit">В цену входят доставка до 300 км, сборка, отделка, электрика, сантехника и кухонный блок. Фундамент считается отдельно.</p>
    <button class="btn" data-go="config" data-pick="${m.id}">Настроить этот дом</button></div></article>`).join('')
    : `<div class="empty wide"><b>Под такие условия моделей нет</b><span>Снимите один из фильтров, чтобы увидеть остальные.</span><button class="btn ghost" id="projReset">Сбросить фильтры</button></div>`;
  $$('#projFilters [data-fb]').forEach(b => b.setAttribute('aria-pressed', b.dataset.fb === filters.bed));
  $('#fTer').setAttribute('aria-pressed', filters.ter); $('#fSort').value = filters.sort;
}

function renderMaterials() {
  const pick = ['larch', 'oak', 'ash', 'limestone', 'sandstone', 'concrete', 'plaster-white', 'tile-light', 'metal-dark', 'linen', 'stone-nat', 'walnut'];
  $('#matShow').innerHTML = pick.map(id => { const m = MATERIALS.find(x => x.id === id); return `<figure class="msw"><span style="background-image:url(${swatch(id, 160)})" role="img" aria-label="Образец: ${esc(m.n)}"></span><figcaption><b>${esc(m.n)}</b><small>${esc(m.desc)}</small></figcaption></figure>` }).join('');
}

async function makeHero() {
  if (hero || heroState !== 'idle') return; heroState = 'loading';
  const canvas = $('#heroCanvas'); if (!canvas) return;
  if (!(await ensureThree()) || !webglAvailable()) { heroState = 'failed'; return }
  try {
    hero = createScene(canvas, {});
    const view = { mode: 'overview', showRoof: true, cut: 'full', env: true, shadows: true, time: 'day', autoRotate: false, activeRoom: null, plan: false };
    // миниатюры каталога: рендер каждой модели во временном состоянии сцены
    MODELS.forEach(m => {
      try { const h = presetHouse(m.id); hero.resize(true); hero.sync(h, view); hero.cam.preset('iso', h); hero.cam.set({ th: .78, ph: 1.08 }); hero.cam.snap(); thumbs[m.id] = hero.snapshot(960, 630, 'image/jpeg') } catch (e) { console.warn('thumb', e) }
    });
    const h = presetHouse('oz'); view.autoRotate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    hero.sync(h, view); hero.cam.preset('iso', h); hero.cam.set({ th: .78, ph: 1.12, dist: 25 }); hero.cam.snap();
    hero.resize(true); $('#heroArt').classList.add('live'); heroState = 'ready';
    renderCatalog();
    io = new IntersectionObserver(es => { es.forEach(en => { if (hero && !document.body.dataset.studio) hero.setActive(en.isIntersecting) }) }, { threshold: .05 }); io.observe($('#heroArt'));
    new ResizeObserver(() => hero && hero.resize()).observe($('#heroArt'));
  } catch (e) { console.warn('hero scene failed', e); heroState = 'failed'; hero = null }
}

let inited = false;
export function initHome() {
  if (!inited) {
    inited = true;
    const m = MODELS[1];
    $('#heroFallback').innerHTML = houseSvg(m, '#3f484c', 'gable', true);
    renderCatalog(); renderMaterials();
    $('#projFilters').addEventListener('click', e => { const b = e.target.closest('[data-fb]'); if (b) { filters.bed = b.dataset.fb; renderCatalog() } });
    $('#fTer').onclick = () => { filters.ter = !filters.ter; renderCatalog() };
    $('#fSort').onchange = e => { filters.sort = e.target.value; renderCatalog() };
    $('#projGrid').addEventListener('click', e => { if (e.target.id === 'projReset') { filters = { bed: 'all', ter: false, sort: filters.sort }; renderCatalog() } });
    (window.requestIdleCallback || (f => setTimeout(f, 200)))(() => makeHero());
  } else if (hero) hero.setActive(true);
}
export function pauseHome() { if (hero) hero.setActive(false) }

/* Мобильное меню и ловушка фокуса в модальных окнах */
/* Тема: светлая по умолчанию, тёмная — по переключателю; выбор запоминается на устройстве */
function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const b = $('#themeToggle');
  if (b) { b.setAttribute('aria-pressed', String(dark)); b.setAttribute('aria-label', dark ? 'Светлая тема' : 'Тёмная тема'); b.title = dark ? 'Светлая тема' : 'Тёмная тема' }
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? '#141a16' : '#F3F0E8';
}
function initTheme() {
  let saved = null; try { saved = localStorage.getItem('kw_theme') } catch (e) { }
  applyTheme(saved === 'dark');
  const b = $('#themeToggle'); if (!b) return;
  b.onclick = () => { const dark = document.documentElement.dataset.theme !== 'dark'; applyTheme(dark); try { localStorage.setItem('kw_theme', dark ? 'dark' : 'light') } catch (e) { } };
}

function initUi() {
  initTheme();
  const t = $('#navToggle'), nav = $('#mainNav');
  t.onclick = () => { const o = nav.classList.toggle('open'); t.setAttribute('aria-expanded', o) };
  nav.addEventListener('click', e => { if (e.target.closest('button')) { nav.classList.remove('open'); t.setAttribute('aria-expanded', 'false') } });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const ms = $$('.modal:not([hidden])'), m = ms[ms.length - 1]; if (!m) return;
    const f = $$('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),select:not([disabled]),textarea:not([disabled]),a[href]', m).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!m.contains(document.activeElement)) { e.preventDefault(); first.focus() }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  });
}
initUi();
