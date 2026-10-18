/* Данные и справочники конструктора.
   Ценовые константы (WALLS, FLOORS, FPRICE→FLIST.p, RATES) перенесены из прежней версии без изменений:
   на них опирается расчёт проекта и панель сотрудников. */

export const GW = 16, GD = 12, H = 2.7;          // участок 16×12 м (1 клетка = 1 м²), высота модуля 2,7 м
export const MAX_ROOMS = 40;                      // как в прежней версии (loadProject: slice(0,40))
export const MAX_FURN = 60;
export const MAX_AREA_INPUT = 144;               // верхняя граница поля «Площадь» в прежней версии (шаговые кнопки допускали до 16×12)                       // на комнату, как в прежней версии
export const GRID = 1;                            // шаг привязки комнат, м
export const FGRID = 0.05;                        // шаг привязки мебели, м

export const TYPES = {
  liv: { n: 'Гостиная', w: 5, d: 4 }, bed: { n: 'Спальня', w: 4, d: 3 },
  kit: { n: 'Кухня', w: 3, d: 3, wet: 1 }, bath: { n: 'Ванная', w: 2, d: 2, wet: 1 },
  kid: { n: 'Детская', w: 3, d: 3 }, off: { n: 'Кабинет', w: 3, d: 3 },
  hall: { n: 'Прихожая', w: 2, d: 2 }, wr: { n: 'Гардеробная', w: 2, d: 2 },
  ter: { n: 'Терраса', w: 4, d: 2, open: 1 }
};

/* Классы наружной отделки с ценой (₽/м² площади комнаты): единственное, что участвует в расчёте. */
export const WALLS = [
  { id: 'wood', n: 'Лиственница', c: '#b9834a', p: 0, t: 'wood' },
  { id: 'dark', n: 'Графит', c: '#3f484c', p: 6000, t: 'plain' },
  { id: 'stone', n: 'Светлый камень', c: '#d9d6cc', p: 9000, t: 'stone' },
  { id: 'brick', n: 'Кирпич', c: '#a4553d', p: 12000, t: 'brick' }
];
export const FLOORS = [
  { id: 'oak', n: 'Дуб', c: '#b58b57', p: 4000, mat: 'oak' },
  { id: 'tile', n: 'Плитка', c: '#cfd3d6', p: 3000, mat: 'tile-light' },
  { id: 'conc', n: 'Бетон', c: '#8d9296', p: 1500, mat: 'concrete' },
  { id: 'nut', n: 'Орех', c: '#5b4030', p: 7000, mat: 'walnut' }
];
export const RATES = { base: 62000, terrace: 30000, wet: 15000, roof: 8000, foundation: 4500, foundationOpen: 2500 };

export const PRE = {
  les: [['liv', 5, 4], ['kit', 3, 3], ['bed', 4, 3], ['bath', 2, 2], ['hall', 2, 2]],
  oz: [['liv', 6, 4], ['kit', 4, 3], ['bed', 4, 3], ['kid', 3, 3], ['bath', 3, 2], ['hall', 2, 2], ['ter', 4, 2]],
  sem: [['liv', 6, 5], ['kit', 4, 4], ['bed', 4, 4], ['kid', 4, 3], ['off', 3, 3], ['bath', 3, 2], ['hall', 3, 2], ['wr', 2, 2], ['ter', 5, 2]]
};

/* Каталог моделей: name/area/rooms/price — из прежней версии. Остальное выводится из состава PRE. */
export const MODELS = [
  { id: 'les', name: 'Лесной', area: 48, rooms: '1 спальня', bedrooms: 1, price: 2400000, w: 200, facade: 'larch-v', roofType: 'flat' },
  { id: 'oz', name: 'Озёрный', area: 72, rooms: '2 спальни', bedrooms: 2, price: 3900000, w: 260, facade: 'graphite', roofType: 'gable' },
  { id: 'sem', name: 'Семейный', area: 110, rooms: '3 спальни', bedrooms: 3, price: 5800000, w: 340, facade: 'plaster', roofType: 'gable' }
];

/* ---------- Фасады ---------- */
/* priceClass — id из WALLS: именно он сохраняется в поле wall проекта и используется в расчёте.
   Новых цен не вводим: для каждого фасада сказано, по какому существующему классу он считается. */
export const FACADES = [
  { id: 'larch-v', n: 'Лиственница, вертикаль', priceClass: 'wood', base: 'larch', dir: 'v', note: 'Вертикальная обшивка из лиственницы.' },
  { id: 'larch-h', n: 'Лиственница, горизонталь', priceClass: 'wood', base: 'larch', dir: 'h', note: 'Горизонтальная обшивка из лиственницы.' },
  { id: 'plaster', n: 'Светлая штукатурка', priceClass: 'stone', base: 'plaster-white', dir: 'v', note: 'Матовая светлая штукатурка. Считается по классу «Светлый камень».' },
  { id: 'graphite', n: 'Тёмная облицовка', priceClass: 'dark', base: 'metal-panel', dir: 'v', note: 'Современная тёмная облицовка. Считается по классу «Графит».' },
  { id: 'wood-stone', n: 'Дерево и камень', priceClass: 'stone', base: 'larch', dir: 'v', band: { mat: 'stone-nat', h: 0.9 }, note: 'Лиственница сверху, камень в нижней части стен. Считается по классу «Светлый камень».' },
  { id: 'natural', n: 'Комбинированный природный', priceClass: 'stone', base: 'larch', dir: 'h', accent: { mat: 'plaster-white', types: ['kit', 'bath', 'hall'] }, note: 'Лиственница и светлая штукатурка у кухни, ванной и прихожей. Считается по классу «Светлый камень».' },
  { id: 'brick', n: 'Кирпич', priceClass: 'brick', base: 'brick', dir: 'v', note: 'Кирпич (вариант из прежней версии конструктора).' }
];
export const facadeById = id => FACADES.find(f => f.id === id);
export const defaultFacadeFor = wall => ({ wood: 'larch-v', dark: 'graphite', stone: 'plaster', brick: 'brick' }[wall] || 'larch-v');

/* ---------- Кровля ---------- */
export const ROOF_TYPES = [
  { id: 'flat', n: 'Плоская', note: 'Плоская кровля с небольшим свесом.' },
  { id: 'mono', n: 'Односкатная', note: 'Скат над каждым модулем, высокая сторона к северу.' },
  { id: 'gable', n: 'Двускатная', note: 'Конёк над каждым модулем вдоль длинной стороны.' }
];
export const ROOF_MATS = ['metal-dark', 'zinc', 'larch', 'concrete-dark'];

/* ---------- Рамы окон ---------- */
export const FRAMES = [
  { id: 'graphite', n: 'Графит', c: '#2f3431' }, { id: 'white', n: 'Белый', c: '#ecebe5' },
  { id: 'oak', n: 'Дуб', c: '#a87850' }, { id: 'bronze', n: 'Тёмная бронза', c: '#5a4a3a' }
];

/* ---------- Окна и двери ---------- */
export const OPENING_KINDS = {
  win: { n: 'Окно', w: 1.2, h: 1.4, y: 0.9, wMin: 0.5, wMax: 3, hMin: 0.5, hMax: 1.8, ymin: 0.3, door: false },
  'win-pan': { n: 'Панорамное окно', w: 2.4, h: 2.0, y: 0.3, wMin: 1.5, wMax: 4, hMin: 1.2, hMax: 2.3, ymin: 0.1, door: false },
  'win-s': { n: 'Малое окно', w: 0.6, h: 0.6, y: 1.5, wMin: 0.4, wMax: 1.2, hMin: 0.4, hMax: 1.0, ymin: 0.8, door: false },
  door: { n: 'Входная дверь', w: 1.0, h: 2.1, y: 0, wMin: 0.8, wMax: 1.3, hMin: 1.9, hMax: 2.3, ymin: 0, door: true },
  'door-g': { n: 'Остеклённая дверь', w: 1.8, h: 2.2, y: 0, wMin: 1.0, wMax: 3.2, hMin: 1.9, hMax: 2.3, ymin: 0, door: true }
};
export const OPEN_MARGIN = 0.2;   // минимальный отступ проёма от края стены, м
export const OPEN_GAP = 0.15;     // минимальный зазор между проёмами, м
export const SIDES = { n: 'Северная', e: 'Восточная', s: 'Южная', w: 'Западная' };

/* ---------- Дополнительные элементы вне комнат ---------- */
export const EXTRA_KINDS = {
  steps: { n: 'Ступени', w: 2, d: 1, wMin: 1, wMax: 6, dMin: 1, dMax: 3, free: false, note: 'Не должны пересекаться с комнатами.' },
  canopy: { n: 'Навес', w: 3, d: 2, wMin: 1, wMax: 8, dMin: 1, dMax: 5, free: true, note: 'Может находиться над террасой или входом.' }
};

/* ---------- Мебель ---------- */
/* Габариты в метрах (w × d × h). Первые 14 ключей и их размеры/цены — из прежней версии (старые проекты их используют).
   Позиции без p — новые; цена по ним не определена и уточняется менеджером (в расчёт не входят). */
export const FCATS = [
  { id: 'sofa', n: 'Диваны и кресла' }, { id: 'bed', n: 'Кровати' }, { id: 'table', n: 'Столы и стулья' },
  { id: 'storage', n: 'Шкафы и стеллажи' }, { id: 'kitchen', n: 'Кухонные модули' },
  { id: 'bath', n: 'Сантехника' }, { id: 'light', n: 'Освещение' }, { id: 'decor', n: 'Декор и техника' }
];
export const FLIST = {
  sofa: { n: 'Диван', cat: 'sofa', w: 2, d: .9, h: .8, c: '#8a6a8f', p: 65000, fin: 'textile' },
  armchair: { n: 'Кресло', cat: 'sofa', w: .8, d: .8, h: .8, c: '#b98a5a', p: 28000, fin: 'textile' },
  pouf: { n: 'Пуф', cat: 'sofa', w: .5, d: .5, h: .4, c: '#c9bfa9', fin: 'textile' },
  bed: { n: 'Кровать', cat: 'bed', w: 1.6, d: 2, h: .95, c: '#c79a9a', p: 78000, fin: 'textile' },
  'bed-single': { n: 'Кровать односпальная', cat: 'bed', w: .9, d: 2, h: .95, c: '#c79a9a', fin: 'textile' },
  nightstand: { n: 'Тумба', cat: 'bed', w: .5, d: .4, h: .5, c: '#8a7052', p: 9000, fin: 'wood' },
  table: { n: 'Стол', cat: 'table', w: 1.2, d: .8, h: .75, c: '#a97c50', p: 32000, fin: 'wood' },
  'table-dining': { n: 'Обеденный стол', cat: 'table', w: 1.8, d: .9, h: .75, c: '#a97c50', fin: 'wood' },
  'table-coffee': { n: 'Журнальный столик', cat: 'table', w: 1, d: .6, h: .4, c: '#a97c50', fin: 'wood' },
  desk: { n: 'Письменный стол', cat: 'table', w: 1.2, d: .6, h: .75, c: '#9c8158', p: 26000, fin: 'wood' },
  chair: { n: 'Стул', cat: 'table', w: .45, d: .45, h: .85, c: '#a97c50', fin: 'wood' },
  wardrobe: { n: 'Шкаф', cat: 'storage', w: 1.2, d: .6, h: 2.05, c: '#6b5843', p: 62000, fin: 'wood' },
  bookshelf: { n: 'Стеллаж', cat: 'storage', w: 1, d: .3, h: 1.9, c: '#7a5a3a', p: 24000, fin: 'wood' },
  dresser: { n: 'Комод', cat: 'storage', w: 1, d: .45, h: .85, c: '#8a7052', fin: 'wood' },
  kitchen: { n: 'Кухня', cat: 'kitchen', w: 2, d: .6, h: .9, c: '#7d9490', p: 180000, fin: 'wood' },
  'kitchen-island': { n: 'Кухонный остров', cat: 'kitchen', w: 1.6, d: .8, h: .9, c: '#7d9490', fin: 'wood' },
  fridge: { n: 'Холодильник', cat: 'kitchen', w: .7, d: .7, h: 1.8, c: '#c9d2d3', p: 85000, fin: 'none' },
  sink: { n: 'Раковина', cat: 'bath', w: .6, d: .5, h: .85, c: '#cfd8da', p: 22000, fin: 'none' },
  toilet: { n: 'Унитаз', cat: 'bath', w: .4, d: .6, h: .42, c: '#e4e9ea', p: 18000, fin: 'none' },
  bathtub: { n: 'Ванна', cat: 'bath', w: 1.7, d: .75, h: .5, c: '#dfe6e7', p: 70000, fin: 'none' },
  shower: { n: 'Душевая кабина', cat: 'bath', w: .9, d: .9, h: 2, c: '#dfe6e7', fin: 'none' },
  'lamp-floor': { n: 'Торшер', cat: 'light', w: .4, d: .4, h: 1.6, c: '#d9d2c0', fin: 'none', nocollide: true },
  'lamp-pendant': { n: 'Подвесной светильник', cat: 'light', w: .6, d: .6, h: 2.7, c: '#d9d2c0', fin: 'none', ceil: true, nocollide: true },
  plant: { n: 'Растение в кашпо', cat: 'decor', w: .5, d: .5, h: 1.1, c: '#69765b', fin: 'none' },
  rug: { n: 'Ковёр', cat: 'decor', w: 2, d: 1.4, h: .02, c: '#c9bfa9', fin: 'textile', flat: true },
  tv: { n: 'Телевизор', cat: 'decor', w: 1.2, d: .15, h: .55, c: '#2a2a2a', p: 55000, fin: 'none' }
};
/* Рекомендуемые позиции для типа комнаты (прежняя таблица ROOM_FURN; теперь только подсказка, ограничения нет) */
export const ROOM_FURN = {
  liv: ['sofa', 'armchair', 'tv', 'table', 'bookshelf'], bed: ['bed', 'wardrobe', 'nightstand', 'desk'],
  kid: ['bed', 'wardrobe', 'desk', 'bookshelf'], kit: ['kitchen', 'fridge', 'table'],
  bath: ['sink', 'toilet', 'bathtub'], off: ['desk', 'bookshelf', 'armchair'], hall: ['wardrobe'],
  wr: ['wardrobe'], ter: ['table', 'armchair']
};

/* ---------- Библиотека материалов ---------- */
export const MCATS = [
  { id: 'wood', n: 'Дерево' }, { id: 'stone', n: 'Камень' }, { id: 'plaster', n: 'Штукатурка' },
  { id: 'concrete', n: 'Бетон' }, { id: 'metal', n: 'Металл' }, { id: 'glass', n: 'Стекло' },
  { id: 'tile', n: 'Плитка' }, { id: 'textile', n: 'Текстиль' }, { id: 'brick', n: 'Кирпич' }
];
/* use: поверхности, на которые материал реально можно назначить в конструкторе.
   roof — кровля, floor — пол (только четыре ценовых варианта), wall — внутренняя отделка стен комнаты,
   furn — отделка мебели, facade — входит в состав фасадов, glass — остекление. */
export const MATERIALS = [
  { id: 'larch', n: 'Лиственница', cat: 'wood', c: '#b9834a', r: .72, m: 0, tex: 'wood', tile: 1.2, hue: [185, 131, 74], desc: 'Тёплая древесина с выраженным рисунком. Устойчива к влаге, основа фасадов «Лиственницы».', use: ['facade', 'wall', 'roof', 'furn'] },
  { id: 'oak', n: 'Дуб', cat: 'wood', c: '#b58b57', r: .7, m: 0, tex: 'wood', tile: 1.2, hue: [181, 139, 87], desc: 'Золотистый дуб, плотный рисунок. Пол «Дуб» из расчёта.', use: ['floor', 'wall', 'furn'] },
  { id: 'ash', n: 'Ясень', cat: 'wood', c: '#d8c4a0', r: .7, m: 0, tex: 'wood', tile: 1.2, hue: [216, 196, 160], desc: 'Светлая древесина с мягким рисунком, визуально расширяет комнату.', use: ['wall', 'furn'] },
  { id: 'wood-light', n: 'Светлая древесина', cat: 'wood', c: '#e2d3b4', r: .72, m: 0, tex: 'wood', tile: 1.2, hue: [226, 211, 180], desc: 'Выбеленное дерево скандинавского оттенка.', use: ['wall', 'furn'] },
  { id: 'walnut', n: 'Орех', cat: 'wood', c: '#5b4030', r: .62, m: 0, tex: 'wood', tile: 1.2, hue: [91, 64, 48], desc: 'Тёмная древесина. Пол «Орех» из расчёта.', use: ['floor', 'furn', 'wall'] },
  { id: 'wood-dark', n: 'Тёмное дерево', cat: 'wood', c: '#4a3a30', r: .65, m: 0, tex: 'wood', tile: 1.2, hue: [74, 58, 48], desc: 'Термообработанная древесина глубокого цвета.', use: ['wall', 'furn'] },
  { id: 'limestone', n: 'Известняк', cat: 'stone', c: '#d8d1bd', r: .88, m: 0, tex: 'ashlar', tile: 1.6, hue: [216, 209, 189], desc: 'Светлый известняк, кладка блоками.', use: ['wall', 'facade'] },
  { id: 'sandstone', n: 'Песчаник', cat: 'stone', c: '#c9ab80', r: .9, m: 0, tex: 'strata', tile: 1.6, hue: [201, 171, 128], desc: 'Слоистый песчаник тёплого песочного цвета.', use: ['wall', 'facade'] },
  { id: 'stone-nat', n: 'Природный камень', cat: 'stone', c: '#8f8a7c', r: .92, m: 0, tex: 'rubble', tile: 1.6, hue: [143, 138, 124], desc: 'Колотый камень неправильной формы для цоколя и акцентов.', use: ['facade', 'wall'] },
  { id: 'plaster-white', n: 'Штукатурка светлая', cat: 'plaster', c: '#efece3', r: .95, m: 0, tex: 'plaster', tile: 2, hue: [239, 236, 227], desc: 'Матовая светлая штукатурка. Основной фон интерьера.', use: ['wall', 'facade'] },
  { id: 'plaster-sand', n: 'Штукатурка песочная', cat: 'plaster', c: '#d5c5a5', r: .95, m: 0, tex: 'plaster', tile: 2, hue: [213, 197, 165], desc: 'Тёплая песочная штукатурка.', use: ['wall'] },
  { id: 'plaster-moss', n: 'Штукатурка мох', cat: 'plaster', c: '#a3ab90', r: .95, m: 0, tex: 'plaster', tile: 2, hue: [163, 171, 144], desc: 'Приглушённый зелёный оттенок для спальни и кабинета.', use: ['wall'] },
  { id: 'plaster-grey', n: 'Штукатурка серая', cat: 'plaster', c: '#b9b7ae', r: .95, m: 0, tex: 'plaster', tile: 2, hue: [185, 183, 174], desc: 'Нейтральный серо-бежевый тон.', use: ['wall'] },
  { id: 'concrete', n: 'Бетон', cat: 'concrete', c: '#8d9296', r: .88, m: 0, tex: 'concrete', tile: 2, hue: [141, 146, 150], desc: 'Шлифованный бетон. Пол «Бетон» из расчёта.', use: ['floor', 'wall'] },
  { id: 'concrete-dark', n: 'Бетон тёмный', cat: 'concrete', c: '#5d6164', r: .85, m: 0, tex: 'concrete', tile: 2, hue: [93, 97, 100], desc: 'Графитовый бетон для кровли и акцентных стен.', use: ['roof', 'wall'] },
  { id: 'metal-dark', n: 'Тёмный металл', cat: 'metal', c: '#2f3431', r: .42, m: .7, tex: 'seam', tile: 1.2, hue: [47, 52, 49], desc: 'Фальцевая кровля из тёмного металла.', use: ['roof', 'frame'] },
  { id: 'metal-panel', n: 'Тёмная облицовка', cat: 'metal', c: '#3b4448', r: .5, m: .35, tex: 'panel', tile: 1.2, hue: [59, 68, 72], desc: 'Вертикальные панели тёмной облицовки фасада.', use: ['facade'] },
  { id: 'zinc', n: 'Цинк светлый', cat: 'metal', c: '#9aa09c', r: .4, m: .75, tex: 'seam', tile: 1.2, hue: [154, 160, 156], desc: 'Светлая металлическая кровля.', use: ['roof'] },
  { id: 'glass', n: 'Стекло прозрачное', cat: 'glass', c: '#cfe3e6', r: .05, m: .1, tex: null, tile: 1, hue: [207, 227, 230], desc: 'Остекление окон и дверей. Прозрачное, с отражением неба.', use: ['glass'] },
  { id: 'tile-light', n: 'Плитка светлая', cat: 'tile', c: '#cfd3d6', r: .35, m: 0, tex: 'tile', tile: 1.2, hue: [207, 211, 214], desc: 'Керамическая плитка. Пол «Плитка» из расчёта.', use: ['floor', 'wall'] },
  { id: 'tile-dark', n: 'Плитка тёмная', cat: 'tile', c: '#4a4f4d', r: .35, m: 0, tex: 'tile', tile: 1.2, hue: [74, 79, 77], desc: 'Графитовая керамическая плитка.', use: ['wall'] },
  { id: 'linen', n: 'Лён', cat: 'textile', c: '#d6ccb8', r: 1, m: 0, tex: 'weave', tile: .6, hue: [214, 204, 184], desc: 'Натуральный лён, тёплый бежевый.', use: ['furn'] },
  { id: 'wool', n: 'Шерсть серая', cat: 'textile', c: '#8d8f8b', r: 1, m: 0, tex: 'weave', tile: .6, hue: [141, 143, 139], desc: 'Плотная шерстяная ткань.', use: ['furn'] },
  { id: 'cotton-moss', n: 'Хлопок мох', cat: 'textile', c: '#7d8a6c', r: 1, m: 0, tex: 'weave', tile: .6, hue: [125, 138, 108], desc: 'Хлопок приглушённого зелёного цвета.', use: ['furn'] },
  { id: 'boucle', n: 'Букле молочное', cat: 'textile', c: '#ece6d8', r: 1, m: 0, tex: 'weave', tile: .6, hue: [236, 230, 216], desc: 'Фактурная светлая ткань.', use: ['furn'] },
  { id: 'brick', n: 'Кирпич', cat: 'brick', c: '#a4553d', r: .9, m: 0, tex: 'brick', tile: 1.5, hue: [164, 85, 61], desc: 'Кирпичная кладка (из прежней версии).', use: ['facade'] }
];
export const matById = id => MATERIALS.find(m => m.id === id);
export const INT_WALL_DEFAULT = 'plaster-white';
export const WALL_FINISHES = MATERIALS.filter(m => m.use.includes('wall')).map(m => m.id);

/* Материалы-образцы для мебели: что допустимо по типу отделки */
export const FIN_MATS = {
  textile: MATERIALS.filter(m => m.cat === 'textile').map(m => m.id),
  wood: MATERIALS.filter(m => m.cat === 'wood').map(m => m.id)
};

export const PST = { submitted: 'На согласовании', revision: 'На доработке', approved: 'Согласован', paid: 'Оплачен' };
export const ROLE_RU = { client: 'клиент', manager: 'менеджер', designer: 'дизайнер', owner: 'владелец' };

/* Состав комплектации — дословно из текста сайта (FAQ и сноска расчёта прежней версии) */
export const INCLUDED = 'Доставка до 300 км, сборка, отделка, электрика, сантехника и кухонный блок. Фундамент считается отдельно.';

export const MODES = [
  { id: 'exterior', n: 'Экстерьер', hint: 'Фасад, кровля, окна и двери, ступени и навес.' },
  { id: 'plan', n: 'Планировка', hint: 'Комнаты: добавить, переместить, изменить размер.' },
  { id: 'interior', n: 'Интерьер', hint: 'Мебель и отделка внутри комнат.' },
  { id: 'materials', n: 'Материалы', hint: 'Библиотека материалов и применение к поверхностям.' },
  { id: 'overview', n: 'Обзор', hint: 'Дом в окружении: свет, тени, снимок.' }
];
