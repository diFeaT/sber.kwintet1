/* Общие мелкие утилиты. Часть функций обращается к DOM только при вызове. */
export const $ = (s, r) => (r || document).querySelector(s);
export const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
export const fmt = n => Number(n).toLocaleString('ru-RU') + ' ₽';
export const fmtM = n => Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const showMsg = (sel, t) => { const m = $(sel); m.textContent = t; m.style.display = t ? 'block' : 'none' };

let gtt;
export function gtoast(t, kind) {
  const e = $('#gToast'); if (!e) return;
  e.textContent = t; e.dataset.kind = kind || ''; e.classList.add('on');
  clearTimeout(gtt); gtt = setTimeout(() => e.classList.remove('on'), 4200);
}

/* Подтверждение в стиле сайта вместо window.confirm. Возвращает Promise<boolean>. */
export function ask(message, { ok = 'Подтвердить', cancel = 'Отмена', danger = false, title = 'Подтвердите действие' } = {}) {
  return new Promise(res => {
    const m = $('#confirmModal'); if (!m) return res(window.confirm(message));
    $('#cfT').textContent = title; $('#cfMsg').textContent = message;
    const yes = $('#cfYes'), no = $('#cfNo');
    yes.textContent = ok; no.textContent = cancel; yes.classList.toggle('danger', !!danger);
    const prev = document.activeElement;
    const done = v => { m.hidden = true; yes.onclick = no.onclick = null; m.removeEventListener('keydown', key); m.removeEventListener('click', bg); prev && prev.focus && prev.focus(); res(v) };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); done(false) } };
    const bg = e => { if (e.target === m) done(false) };
    yes.onclick = () => done(true); no.onclick = () => done(false);
    m.addEventListener('keydown', key); m.addEventListener('click', bg);
    m.hidden = false; setTimeout(() => no.focus(), 20);
  });
}
