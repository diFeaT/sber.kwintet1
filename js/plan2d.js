/* 2D-чертёж плана на canvas. Используется в сводке проекта и как запасной вид, если WebGL недоступен. */
import { GW, GD, TYPES, FLIST, OPENING_KINDS, FLOORS, matById } from './data.js';
import { bbox, isOpen, furnFoot, openingProblem } from './layout.js';

const FILL = { liv: '#efe9d8', bed: '#e9eadb', kit: '#f0e6d2', bath: '#e3e9e6', kid: '#ece7d4', off: '#e8e8dc', hall: '#eee8dc', wr: '#e9e4d8', ter: '#d9c7a4' };

export function drawPlan(canvas, house, o = {}) {
  const W = canvas.width, Hh = canvas.height, g = canvas.getContext('2d'), pad = o.pad == null ? 28 : o.pad;
  g.clearRect(0, 0, W, Hh); g.fillStyle = o.bg || '#faf9f5'; g.fillRect(0, 0, W, Hh);
  const b = bbox(house) || { x0: 4, z0: 3, w: 8, d: 6 };
  const sc = Math.min((W - pad * 2) / (b.w + 1), (Hh - pad * 2) / (b.d + 1)), ox = (W - b.w * sc) / 2 - b.x0 * sc, oz = (Hh - b.d * sc) / 2 - b.z0 * sc;
  const X = x => ox + x * sc, Z = z => oz + z * sc;
  // сетка 1 м
  g.strokeStyle = 'rgba(120,110,90,.14)'; g.lineWidth = 1;
  for (let x = Math.floor(b.x0 - 1); x <= b.x0 + b.w + 1; x++) { g.beginPath(); g.moveTo(X(x), Z(b.z0 - 1)); g.lineTo(X(x), Z(b.z0 + b.d + 1)); g.stroke() }
  for (let z = Math.floor(b.z0 - 1); z <= b.z0 + b.d + 1; z++) { g.beginPath(); g.moveTo(X(b.x0 - 1), Z(z)); g.lineTo(X(b.x0 + b.w + 1), Z(z)); g.stroke() }
  const font = (px, wgt = 500) => `${wgt} ${px}px Onest, system-ui, Arial, sans-serif`;
  house.rooms.forEach(r => {
    const fl = FLOORS.find(f => f.id === (r.floor || house.floor));
    g.fillStyle = FILL[r.type] || '#eee'; g.fillRect(X(r.x), Z(r.z), r.w * sc, r.d * sc);
    if (isOpen(r)) { g.save(); g.beginPath(); g.rect(X(r.x), Z(r.z), r.w * sc, r.d * sc); g.clip(); g.strokeStyle = 'rgba(120,90,50,.25)'; for (let k = -r.d; k < r.w + r.d; k += .5) { g.beginPath(); g.moveTo(X(r.x + k), Z(r.z)); g.lineTo(X(r.x + k - r.d), Z(r.z + r.d)); g.stroke() } g.restore() }
    g.strokeStyle = isOpen(r) ? '#a87850' : '#38473a'; g.lineWidth = isOpen(r) ? 2 : 4; g.setLineDash(isOpen(r) ? [6, 4] : []);
    g.strokeRect(X(r.x), Z(r.z), r.w * sc, r.d * sc); g.setLineDash([]);
    if (o.sel && (o.sel.roomId === r.id || (o.sel.t === 'room' && o.sel.id === r.id))) { g.strokeStyle = '#e39b3b'; g.lineWidth = 3; g.strokeRect(X(r.x) - 3, Z(r.z) - 3, r.w * sc + 6, r.d * sc + 6) }
    // проёмы
    r.open.forEach(p => {
      if (openingProblem(house, r, p)) return;
      const K = OPENING_KINDS[p.k], a = p.p - p.w / 2, e = p.p + p.w / 2;
      // координата вдоль стены → клетка плана
      let x1, z1, x2, z2;
      if (p.s === 's') { x1 = r.x + a; x2 = r.x + e; z1 = z2 = r.z + r.d } else if (p.s === 'n') { x1 = r.x + r.w - e; x2 = r.x + r.w - a; z1 = z2 = r.z } else if (p.s === 'e') { z1 = r.z + r.d - e; z2 = r.z + r.d - a; x1 = x2 = r.x + r.w } else { z1 = r.z + a; z2 = r.z + e; x1 = x2 = r.x }
      g.strokeStyle = K.door ? '#a87850' : '#6fa6b8'; g.lineWidth = K.door ? 7 : 6; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke();
      g.strokeStyle = '#faf9f5'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(x1), Z(z1)); g.lineTo(X(x2), Z(z2)); g.stroke();
    });
    if (o.furn !== false) r.furn.forEach(f => {
      const fp = furnFoot(f), def = FLIST[f.key]; if (!def) return;
      g.fillStyle = def.flat ? 'rgba(160,140,110,.28)' : def.c; g.globalAlpha = def.flat ? 1 : .85;
      g.fillRect(X(r.x + f.x), Z(r.z + f.z), fp.w * sc, fp.d * sc); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(X(r.x + f.x), Z(r.z + f.z), fp.w * sc, fp.d * sc);
    });
    if (o.labels !== false) {
      g.fillStyle = '#343c35'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const fs = Math.max(10, Math.min(sc * .38, 17));
      g.font = font(fs, 700); g.fillText(TYPES[r.type].n, X(r.x + r.w / 2), Z(r.z + r.d / 2) - fs * .55);
      g.font = font(fs * .9, 500); g.fillStyle = '#62635b'; g.fillText(`${r.w}×${r.d} м · ${r.w * r.d} м²`, X(r.x + r.w / 2), Z(r.z + r.d / 2) + fs * .65);
    }
  });
  g.fillStyle = '#62635b'; g.font = font(12); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillText('С', 10, 18); g.beginPath(); g.moveTo(18, 24); g.lineTo(18, 40); g.strokeStyle = '#62635b'; g.lineWidth = 1.5; g.stroke();
  return {
    scale: sc,
    toGrid: (px, py) => ({ x: (px - ox) / sc, z: (py - oz) / sc }),
    roomAt: (px, py) => { const p = { x: (px - ox) / sc, z: (py - oz) / sc }; return house.rooms.slice().reverse().find(r => p.x >= r.x && p.x <= r.x + r.w && p.z >= r.z && p.z <= r.z + r.d) || null }
  };
}
