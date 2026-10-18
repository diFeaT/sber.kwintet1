/* Геометрия мебели: у каждой позиции библиотеки собственная модель в реальных габаритах (метры).
   Начало координат — центр основания, лицевая сторона смотрит в +z. Шаблоны кэшируются и клонируются:
   геометрия общая, поэтому при удалении предмета освобождать ничего не нужно, а при закрытии сцены
   scene.dispose() освобождает кэш целиком. */
import { FLIST } from './data.js';

export function createFurnitureFactory(mats) {
  const T = THREE, templates = new Map(), geoms = [];
  const keep = g => { geoms.push(g); return g };

  function build(key) {
    const def = FLIST[key], { w, d, h } = def, g = new T.Group();
    const main = mats.solid('f-' + key, def.c, { r: .85 });
    const leg = mats.solid('leg', '#3a2f27', { r: .6 });
    const dark = mats.solid('fdark', '#2b2e2c', { r: .5, m: .3 });
    const metal = mats.solid('fmetal', '#2f3431', { r: .38, m: .75, env: 1 });
    const cer = mats.solid('cer', '#f2f1ec', { r: .22, env: .7 });
    const whiteWood = mats.solid('fwhite', '#e8e3d6', { r: .7 });
    const B = (sx, sy, sz, x, yb, z, mat, slot) => { const m = new T.Mesh(keep(new T.BoxGeometry(Math.max(.01, sx), Math.max(.01, sy), Math.max(.01, sz))), mat); m.position.set(x, yb + sy / 2, z); m.userData.slot = slot || 'fixed'; m.castShadow = true; m.receiveShadow = true; g.add(m); return m };
    const C = (rt, rb, hh, x, yb, z, mat, slot, seg = 18) => { const m = new T.Mesh(keep(new T.CylinderGeometry(rt, rb, hh, seg)), mat); m.position.set(x, yb + hh / 2, z); m.userData.slot = slot || 'fixed'; m.castShadow = true; m.receiveShadow = true; g.add(m); return m };
    const Sp = (r, x, y, z, mat, sx = 1, sy = 1, sz = 1, slot) => { const m = new T.Mesh(keep(new T.SphereGeometry(r, 16, 12)), mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.userData.slot = slot || 'fixed'; m.castShadow = true; g.add(m); return m };
    const legs = (hh, x0, z0, inset = .06, r = .025, mat = leg) => [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([a, b]) => C(r, r * .8, hh, a * (x0 / 2 - inset), 0, b * (z0 / 2 - inset), mat));

    switch (key) {
      case 'sofa': case 'armchair': {
        const arm = key === 'sofa' ? .16 : .13, seatH = .42;
        legs(.1, w, d, .08);
        B(w, .22, d, 0, .1, 0, main, 'main');
        const sw = (w - arm * 2) / (key === 'sofa' ? 2 : 1);
        for (let i = 0; i < (key === 'sofa' ? 2 : 1); i++) B(sw - .02, .14, d * .78, -(w - arm * 2) / 2 + sw / 2 + i * sw, seatH - .1, d * .09, main, 'main');
        B(w, h - .3, .2, 0, .3, -d / 2 + .1, main, 'main');
        for (let i = 0; i < (key === 'sofa' ? 2 : 1); i++) B(sw - .06, .38, .14, -(w - arm * 2) / 2 + sw / 2 + i * sw, .46, -d / 2 + .27, main, 'main').rotation.x = -.18;
        [-1, 1].forEach(s => B(arm, .52, d, s * (w / 2 - arm / 2), .1, 0, main, 'main'));
        break;
      }
      case 'pouf': C(.25, .25, h - .1, 0, .06, 0, main, 'main', 24); C(.22, .24, .06, 0, 0, 0, leg); Sp(.25, 0, h - .05, 0, main, 1, .22, 1, 'main'); break;
      case 'bed': case 'bed-single': {
        const single = key === 'bed-single';
        B(w + .06, .22, d + .06, 0, .1, 0, leg); legs(.1, w + .06, d + .06, .05);
        B(w - .02, .2, d - .08, 0, .32, .02, whiteWood);
        B(w - .02, .09, d * .62, 0, .5, d * .16, main, 'main');
        const pc = single ? 1 : 2, pw = (w - .2) / pc;
        for (let i = 0; i < pc; i++) B(pw - .04, .12, .38, -(w - .2) / 2 + pw / 2 + i * pw + .0, .5, -d / 2 + .3, whiteWood).rotation.x = -.12;
        B(w + .06, .95 - .1, .07, 0, .1, -d / 2 - .0, leg, 'fixed');
        break;
      }
      case 'nightstand': B(w, h - .1, d, 0, .1, 0, main, 'main'); legs(.1, w, d, .04, .015); B(w * .86, .16, .015, 0, h - .3, d / 2 + .004, whiteWood); C(.012, .012, .03, 0, h - .24, d / 2 + .02, metal).rotation.x = Math.PI / 2; break;
      case 'table': case 'table-dining': {
        B(w, .04, d, 0, h - .04, 0, main, 'main'); const lw = .06;
        [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([a, b]) => B(lw, h - .04, lw, a * (w / 2 - .1), 0, b * (d / 2 - .1), main, 'main'));
        B(w - .3, .06, .04, 0, h - .1, d / 2 - .1, main, 'main'); B(w - .3, .06, .04, 0, h - .1, -d / 2 + .1, main, 'main'); break;
      }
      case 'table-coffee': B(w, .035, d, 0, h - .035, 0, main, 'main'); B(w - .12, .02, d - .12, 0, .12, 0, main, 'main'); [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([a, b]) => B(.04, h - .035, .04, a * (w / 2 - .06), 0, b * (d / 2 - .06), leg)); break;
      case 'desk': {
        B(w, .035, d, 0, h - .035, 0, main, 'main'); B(.035, h - .035, d - .04, -w / 2 + .03, 0, 0, main, 'main');
        B(.4, h - .035, d - .04, w / 2 - .22, 0, 0, main, 'main'); [0, 1].forEach(i => B(.36, .18, .012, w / 2 - .22, .1 + i * .26, d / 2 - .015, whiteWood));
        B(w - .45, .3, .02, -.2, h - .4, -d / 2 + .05, main, 'main'); break;
      }
      case 'chair': {
        B(w, .04, d, 0, .43, 0, main, 'main'); [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([a, b]) => B(.035, .43, .035, a * (w / 2 - .035), 0, b * (d / 2 - .035), leg));
        B(w, .32, .03, 0, .53, -d / 2 + .03, main, 'main'); [-1, 1].forEach(s => B(.035, .42, .035, s * (w / 2 - .035), .43, -d / 2 + .03, leg)); break;
      }
      case 'wardrobe': {
        B(w, h - .06, d, 0, .06, 0, main, 'main'); B(w - .04, .06, d - .04, 0, 0, 0, dark);
        const n = Math.max(2, Math.round(w / .6)); for (let i = 1; i < n; i++) B(.008, h - .16, .01, -w / 2 + i * w / n, .1, d / 2 + .003, dark);
        for (let i = 0; i < n; i += 1) B(.015, .22, .02, -w / 2 + (i + .5) * w / n + (i % 2 ? -.12 : .12), h / 2 - .1, d / 2 + .02, metal);
        break;
      }
      case 'bookshelf': {
        [-1, 1].forEach(s => B(.025, h, d, s * (w / 2 - .0125), 0, 0, main, 'main')); B(w, h, .012, 0, 0, -d / 2 + .006, main, 'main');
        const sh = 5; for (let i = 0; i <= sh; i++) B(w - .05, .025, d - .01, 0, .02 + i * (h - .05) / sh, 0, main, 'main');
        const cols = ['#69765b', '#a87850', '#d5c5a5', '#38473a', '#c9bfa9']; let k = 0;
        for (let i = 0; i < sh; i++) { let x = -w / 2 + .06; const yb = .045 + i * (h - .05) / sh; while (x < w / 2 - .12) { const bw = .025 + ((k * 7) % 5) * .008, bh = .18 + ((k * 3) % 4) * .03; B(bw, Math.min(bh, (h - .05) / sh - .05), d * .7, x + bw / 2, yb, 0, mats.solid('book' + (k % 5), cols[k % 5], { r: .9 })); x += bw + .004; k++; if (k % 11 === 0) x += .18 } }
        break;
      }
      case 'dresser': B(w, h - .1, d, 0, .1, 0, main, 'main'); legs(.1, w, d, .05, .02); for (let i = 0; i < 3; i++) { B(w - .08, .21, .012, 0, .15 + i * .24, d / 2 + .004, whiteWood); B(.12, .015, .02, 0, .28 + i * .24, d / 2 + .02, metal) } break;
      case 'kitchen': {
        B(w, .08, d - .04, 0, 0, 0, dark); B(w, .72, d, 0, .08, 0, main, 'main');
        B(w + .01, .04, d + .03, 0, .8, .015, mats.solid('counter', '#d8d1bd', { r: .5 }));
        const n = Math.max(2, Math.round(w / .6)); for (let i = 1; i < n; i++) B(.008, .66, .01, -w / 2 + i * w / n, .1, d / 2 + .003, dark);
        B(.58, .006, .5, -w / 2 + w / n * .5 + .0, .842, 0, dark); // варочная панель
        B(w, .62, .35, 0, 1.45, -d / 2 + .175, main, 'main'); for (let i = 1; i < n; i++) B(.008, .58, .01, -w / 2 + i * w / n, 1.47, -d / 2 + .352, dark);
        C(.012, .012, .24, w / 2 - .3, .84, -d / 2 + .1, metal); break;
      }
      case 'kitchen-island': B(w - .1, .08, d - .1, 0, 0, 0, dark); B(w - .1, .72, d - .1, 0, .08, -.0, main, 'main'); B(w, .04, d, 0, .8, 0, mats.solid('counter', '#d8d1bd', { r: .5 })); for (let i = 1; i < 3; i++) B(.008, .66, .01, -w / 2 + .05 + i * (w - .1) / 3, .1, (d - .1) / 2 + .003, dark); break;
      case 'fridge': {
        B(w, h, d, 0, .02, 0, mats.solid('fridge', def.c, { r: .35, m: .25, env: .9 })); B(w - .02, .006, .01, 0, h * .66, d / 2 + .003, dark);
        B(.015, .5, .02, w / 2 - .07, h * .72, d / 2 + .015, metal); B(.015, .7, .02, w / 2 - .07, h * .2, d / 2 + .015, metal); break;
      }
      case 'sink': {
        B(w, .72, d, 0, .02, 0, whiteWood); B(w - .12, .04, d - .1, 0, .74, 0, cer); B(w - .22, .012, d - .2, 0, .78, .0, mats.solid('basin', '#dfe4e4', { r: .2 }));
        C(.012, .012, .2, 0, .78, -d / 2 + .08, metal); C(.01, .01, .1, 0, .96, -d / 2 + .13, metal).rotation.x = Math.PI / 2; break;
      }
      case 'toilet': {
        B(w * .9, .38, .16, 0, .0 + .38, -d / 2 + .1, cer); Sp(.2, 0, .28, d * .06, cer, 1, .85, 1.35); C(.17, .14, .36, 0, 0, d * .02, cer, 'fixed', 20);
        B(.14, .02, .05, 0, .78, -d / 2 + .09, metal); break;
      }
      case 'bathtub': {
        B(w, h, d, 0, 0, 0, cer); B(w - .16, .02, d - .16, 0, h - .001, 0, mats.solid('tubin', '#e7ecec', { r: .15 }));
        C(.015, .015, .25, -w / 2 + .1, h, 0, metal); C(.01, .01, .1, -w / 2 + .1, h + .22, .04, metal).rotation.x = Math.PI / 2; break;
      }
      case 'shower': {
        B(w, .06, d, 0, 0, 0, cer); const gl = mats.glass();
        [[0, d / 2 - .01, w, .02], [w / 2 - .01, 0, .02, d]].forEach(([x, z, sx, sz]) => { const m = new T.Mesh(keep(new T.BoxGeometry(sx, h - .08, sz)), gl); m.position.set(x, .06 + (h - .08) / 2, z); m.userData.slot = 'glass'; g.add(m) });
        B(w, .03, .03, 0, h - .03, d / 2 - .01, metal); B(.03, .03, d, w / 2 - .01, h - .03, 0, metal);
        C(.01, .01, 1.6, -w / 2 + .08, .4, -d / 2 + .06, metal); C(.08, .08, .015, -w / 2 + .16, 1.95, -d / 2 + .12, metal); break;
      }
      case 'lamp-floor': {
        C(.15, .17, .03, 0, 0, 0, metal); C(.012, .012, h - .35, 0, .03, 0, metal);
        C(.17, .2, .3, 0, h - .32, 0, mats.solid('shade', '#f1e7cf', { r: .9, emissive: '#ffd9a0', ei: .55 }), 'fixed', 22); break;
      }
      case 'lamp-pendant': {
        C(.006, .006, .6, 0, 2.76 - .6, 0, dark); Sp(.28, 0, 2.76 - .6 - .22, 0, mats.solid('pend', '#f1e7cf', { r: .8, emissive: '#ffd9a0', ei: .6 }), 1, .8, 1);
        C(.05, .05, .05, 0, 2.76 - .05, 0, metal); break;
      }
      case 'plant': {
        C(.2, .15, .32, 0, 0, 0, mats.solid('pot', '#b98a66', { r: .85 }), 'fixed', 18);
        const leaf = mats.solid('leaf', '#5f7a4f', { r: .85 }); [[0, .8, 0, .26], [.12, .6, .08, .2], [-.1, .95, -.05, .19], [.05, 1.0, .1, .15]].forEach(([x, y, z, r]) => Sp(r, x, y, z, leaf, 1, 1.2, 1)); C(.015, .02, .5, 0, .3, 0, mats.solid('stem', '#4a3b2c', { r: .9 })); break;
      }
      case 'rug': B(w, .018, d, 0, 0, 0, main, 'main'); B(w - .16, .004, d - .16, 0, .018, 0, mats.solid('rugin', '#f0eadb', { r: 1 })); B(w - .5, .004, d - .5, 0, .021, 0, main, 'main'); break;
      case 'tv': B(w, h * .8, .04, 0, h * .18, 0, mats.solid('tvs', '#101312', { r: .15, m: .3, env: 1 })); B(w * .35, .03, d * 1.6, 0, 0, d * .3, dark); B(.05, h * .2, .03, 0, .02, 0, dark); break;
      default: B(w, h, d, 0, 0, 0, main, 'main');
    }
    g.userData.size = { w, d, h };
    return g;
  }

  return {
    /* Экземпляр для сцены. fin — материал отделки (заменяет слот main). */
    make(key, finMat) {
      if (!FLIST[key]) return null;
      let tpl = templates.get(key); if (!tpl) { tpl = build(key); templates.set(key, tpl) }
      const inst = tpl.clone();
      if (finMat) inst.traverse(o => { if (o.isMesh && o.userData.slot === 'main') o.material = finMat });
      return inst;
    },
    dispose() { geoms.forEach(x => x.dispose()); geoms.length = 0; templates.clear() }
  };
}
