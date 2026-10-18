/* Процедурные текстуры (canvas) и PBR-материалы Three.js.
   Холсты кэшируются глобально (они лёгкие и нужны ещё для образцов в интерфейсе),
   а GPU-текстуры и материалы создаёт каждая сцена отдельно и освобождает через dispose(). */
import { MATERIALS, matById, FRAMES } from './data.js';

const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 };
const mk = S => { const c = document.createElement('canvas'); c.width = c.height = S; return c };
const tone = ([r, g, b], k) => `rgb(${Math.max(0, Math.min(255, r * k)) | 0},${Math.max(0, Math.min(255, g * k)) | 0},${Math.max(0, Math.min(255, b * k)) | 0})`;

function paint(def, S) {
  const c = mk(S), g = c.getContext('2d'), rnd = rng(hashStr(def.id)), hue = def.hue, TAU = Math.PI * 2;
  g.fillStyle = tone(hue, 1); g.fillRect(0, 0, S, S);
  const lum = (hue[0] + hue[1] + hue[2]) / 3, wp = lum < 110 ? .12 : .5;
  const dots = (n, a, sz) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rnd() < wp ? '255,255,255' : '0,0,0'},${rnd() * a * (lum < 110 ? .6 : 1)})`; g.fillRect(rnd() * S, rnd() * S, sz * (.5 + rnd()), sz * (.5 + rnd())) } };
  switch (def.tex) {
    case 'wood': {
      const n = 6, bw = S / n;
      for (let b = 0; b < n; b++) {
        g.fillStyle = tone(hue, .9 + rnd() * .2); g.fillRect(b * bw, 0, bw, S);
        const lines = 26;
        for (let k = 0; k < lines; k++) {
          const x0 = b * bw + 2 + rnd() * (bw - 4), amp = 1 + rnd() * 2.2, per = 1 + Math.floor(rnd() * 3), ph = rnd() * TAU;
          g.strokeStyle = `rgba(${rnd() > .3 ? '40,22,8' : '255,240,210'},${.04 + rnd() * .1})`; g.lineWidth = .6 + rnd() * 1.4;
          g.beginPath();
          for (let y = 0; y <= S; y += 8) { const x = x0 + Math.sin(y / S * TAU * per + ph) * amp; y ? g.lineTo(x, y) : g.moveTo(x, y) }
          g.stroke();
        }
        if (rnd() > .55) { const kx = b * bw + bw * (.3 + rnd() * .4), ky = rnd() * S; g.fillStyle = 'rgba(40,22,8,.28)'; g.beginPath(); g.ellipse(kx, ky, 2 + rnd() * 2, 5 + rnd() * 5, 0, 0, TAU); g.fill() }
        g.fillStyle = 'rgba(0,0,0,.42)'; g.fillRect(b * bw, 0, 1.6, S);
        g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(b * bw + 1.6, 0, 1, S);
      }
      break;
    }
    case 'ashlar': {
      const rows = 4, rh = S / rows;
      for (let r = 0; r < rows; r++) {
        const bwid = S / (r % 2 ? 2 : 2), off = r % 2 ? bwid / 2 : 0;
        for (let x = -off; x < S; x += bwid) { g.fillStyle = tone(hue, .93 + rnd() * .12); g.fillRect(x, r * rh, bwid, rh) }
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, r * rh, S, 2);
        for (let x = -off; x < S + bwid; x += bwid) g.fillRect(x, r * rh, 2, rh);
      }
      dots(2200, .07, 2); break;
    }
    case 'strata': {
      for (let y = 0; y < S; y += 2) { g.fillStyle = tone(hue, .88 + (Math.sin(y * .17) * .5 + rnd()) * .1); g.fillRect(0, y, S, 2) }
      g.strokeStyle = 'rgba(80,50,20,.18)'; for (let i = 0; i < 9; i++) { g.lineWidth = 1 + rnd(); const y = rnd() * S; g.beginPath(); g.moveTo(0, y); g.lineTo(S, y + (rnd() - .5) * 6); g.stroke() }
      dots(2600, .06, 2); break;
    }
    case 'rubble': {
      g.fillStyle = 'rgba(40,36,30,1)'; g.fillRect(0, 0, S, S);
      const rows = 6, rh = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rnd() * 30;
        while (x < S) {
          const w = 28 + rnd() * 44; g.fillStyle = tone(hue, .78 + rnd() * .4);
          const y = r * rh + 2, h = rh - 4 + (rnd() - .5) * 4;
          g.beginPath(); g.roundRect ? g.roundRect(x + 2, y, w - 4, h, 7) : g.rect(x + 2, y, w - 4, h); g.fill();
          g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 4, y + 2, w - 10, 3);
          x += w;
        }
      }
      dots(1800, .09, 2); break;
    }
    case 'plaster': dots(5200, .055, 1.6); dots(700, .04, 5); break;
    case 'concrete': {
      dots(4200, .07, 2);
      for (let i = 0; i < 150; i++) { g.fillStyle = `rgba(30,30,30,${.12 + rnd() * .2})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, .6 + rnd() * 1.4, 0, TAU); g.fill() }
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, 0, S, 1.5); g.fillRect(0, 0, 1.5, S); g.fillRect(S / 2, 0, 1.2, S);
      break;
    }
    case 'seam': {
      const n = 8, w = S / n;
      for (let i = 0; i < n; i++) {
        g.fillStyle = tone(hue, .94 + rnd() * .1); g.fillRect(i * w, 0, w, S);
        g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(i * w, 0, 2.5, S); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * w + 2.5, 0, 2, S);
      }
      dots(900, .04, 2); break;
    }
    case 'panel': {
      const n = 6, w = S / n;
      for (let i = 0; i < n; i++) { g.fillStyle = tone(hue, .95 + rnd() * .1); g.fillRect(i * w, 0, w, S); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(i * w, 0, 2.2, S); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(i * w + 2.2, 0, 1.2, S) }
      dots(700, .04, 2); break;
    }
    case 'tile': {
      const n = 4, w = S / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = tone(hue, .95 + rnd() * .08); g.fillRect(i * w, j * w, w, w) }
      g.fillStyle = 'rgba(70,64,56,.55)'; for (let i = 0; i <= n; i++) { g.fillRect(i * w - 1, 0, 2.4, S); g.fillRect(0, i * w - 1, S, 2.4) }
      dots(500, .04, 3); break;
    }
    case 'weave': {
      for (let y = 0; y < S; y += 3) { g.fillStyle = `rgba(0,0,0,${.06 + rnd() * .05})`; g.fillRect(0, y, S, 1) }
      for (let x = 0; x < S; x += 3) { g.fillStyle = `rgba(255,255,255,${.05 + rnd() * .06})`; g.fillRect(x, 0, 1, S) }
      dots(1400, .06, 1.5); break;
    }
    case 'brick': {
      const rows = 8, rh = S / rows, bw = S / 4;
      g.fillStyle = '#cfc7b6'; g.fillRect(0, 0, S, S);
      for (let r = 0; r < rows; r++) { const off = r % 2 ? bw / 2 : 0; for (let x = -off; x < S; x += bw) { g.fillStyle = tone(hue, .82 + rnd() * .3); g.fillRect(x + 1.5, r * rh + 1.5, bw - 3, rh - 3) } }
      dots(1600, .08, 2); break;
    }
    default: break;
  }
  return c;
}

const canvasCache = new Map();
export function textureCanvas(id, dir) {
  const def = matById(id); if (!def || !def.tex) return null;
  const k = id + (dir === 'h' ? ':h' : '');
  if (canvasCache.has(k)) return canvasCache.get(k);
  const S = (def.tex === 'rubble' || def.tex === 'brick' || def.tex === 'ashlar') ? 256 : 256;
  let c = paint(def, S);
  if (dir === 'h') { const r = mk(S), g = r.getContext('2d'); g.translate(S / 2, S / 2); g.rotate(Math.PI / 2); g.drawImage(c, -S / 2, -S / 2); c = r }
  canvasCache.set(k, c); return c;
}

const swCache = new Map();
/* Образец для интерфейса: data:URL небольшого JPEG. */
export function swatch(id, px = 96, dir) {
  const k = id + px + (dir === 'h' ? 'h' : ''); if (swCache.has(k)) return swCache.get(k);
  const def = matById(id), c = mk(px), g = c.getContext('2d');
  const src = textureCanvas(id, dir);
  if (src) g.drawImage(src, 0, 0, src.width, src.height, 0, 0, px, px); else {
    const gr = g.createLinearGradient(0, 0, px, px); gr.addColorStop(0, '#e9f3f4'); gr.addColorStop(.5, def ? def.c : '#cfe3e6'); gr.addColorStop(1, '#bcd3d6'); g.fillStyle = gr; g.fillRect(0, 0, px, px);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(px * .2, px * .9); g.lineTo(px * .7, px * .1); g.stroke();
  }
  const url = c.toDataURL('image/jpeg', .78); swCache.set(k, url); return url;
}

/* Набор материалов одной сцены */
export function createMats(renderer) {
  const T = THREE, mats = new Map(), texs = [], clipSet = new Set();
  const aniso = Math.min(4, renderer ? renderer.capabilities.getMaxAnisotropy() : 1);
  let cut = null;

  function tex(id, dir, repeatM) {
    const src = textureCanvas(id, dir); if (!src) return null;
    const t = new T.CanvasTexture(src);
    t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding; t.anisotropy = aniso;
    const k = 1 / (repeatM || 1.2); t.repeat.set(k, k);
    texs.push(t); return t;
  }
  function applyClip(m) {
    if (!clipSet.has(m)) return;
    m.clippingPlanes = cut ? [cut] : null; m.side = cut ? T.DoubleSide : (m.userData.side || T.FrontSide); m.needsUpdate = true;
  }

  const api = {
    /* Материал поверхности по id из библиотеки. dir: 'h' — рисунок вдоль стены. */
    get(id, o = {}) {
      const dir = o.dir === 'h' ? 'h' : 'v', key = id + '|' + dir + (o.wall ? '|w' : '') + (o.tint || '');
      let m = mats.get(key); if (m) return m;
      const def = matById(id) || MATERIALS[0];
      if (def.cat === 'glass') m = api.glass();
      else {
        const map = tex(def.id, dir, def.tile);
        m = new T.MeshStandardMaterial({ color: map ? 0xffffff : def.c, map, roughness: def.r, metalness: def.m });
        if (map && ['wood', 'ashlar', 'rubble', 'brick', 'seam', 'panel', 'tile', 'weave'].includes(def.tex)) { m.bumpMap = map; m.bumpScale = def.tex === 'weave' ? .5 : 1.4 }
        m.envMapIntensity = def.m > .3 ? 1.1 : .5;
      }
      mats.set(key, m);
      if (o.wall) { m.userData.side = m.side; clipSet.add(m); applyClip(m) }
      return m;
    },
    glass() {
      let m = mats.get('~glass'); if (m) return m;
      m = new T.MeshStandardMaterial({ color: 0xcfe3e6, transparent: true, opacity: .32, roughness: .04, metalness: .15, depthWrite: false, envMapIntensity: 1.6 });
      mats.set('~glass', m); m.userData.side = m.side; clipSet.add(m); applyClip(m); return m;
    },
    frame(id) {
      const key = '~frame' + id; let m = mats.get(key); if (m) return m;
      const f = FRAMES.find(x => x.id === id) || FRAMES[0];
      m = new T.MeshStandardMaterial({ color: f.c, roughness: id === 'oak' ? .6 : .42, metalness: id === 'oak' ? 0 : .45, envMapIntensity: .8 });
      mats.set(key, m); m.userData.side = m.side; clipSet.add(m); applyClip(m); return m;
    },
    /* Однотонный материал (для мебели, земли и т. п.), кэшируется по ключу */
    solid(key, color, o = {}) {
      const k = '~s' + key + color; let m = mats.get(k); if (m) return m;
      m = new T.MeshStandardMaterial({ color, roughness: o.r == null ? .8 : o.r, metalness: o.m || 0, transparent: !!o.opacity, opacity: o.opacity == null ? 1 : o.opacity, envMapIntensity: o.env == null ? .5 : o.env });
      if (o.emissive) { m.emissive = new T.Color(o.emissive); m.emissiveIntensity = o.ei || 1 }
      mats.set(k, m); return m;
    },
    /* Срез стен: plane = THREE.Plane или null */
    setCut(plane) { cut = plane; clipSet.forEach(applyClip) },
    texture(t) { texs.push(t); return t },
    dispose() {
      mats.forEach(m => m.dispose()); texs.forEach(t => t.dispose());
      mats.clear(); texs.length = 0; clipSet.clear();
    },
    stats: () => ({ materials: mats.size, textures: texs.length })
  };
  return api;
}
