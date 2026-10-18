/* Ленивая загрузка three.js: сначала vendor/three.min.js, затем CDN (как в прежней версии).
   Если библиотека недоступна, остальной сайт продолжает работать. */
export const THREEMSG = 'Не загрузился 3D-модуль (скрипт three.js недоступен в вашей сети). Остальные разделы сайта работают. Обновите страницу или попробуйте другую сеть.';
let threeP = null;
export function ensureThree() {
  if (window.THREE) return Promise.resolve(true);
  if (threeP) return threeP;
  const load = src => new Promise(res => {
    const el = document.createElement('script'); el.src = src;
    el.onload = () => res(!!window.THREE); el.onerror = () => res(false);
    document.head.appendChild(el); setTimeout(() => res(!!window.THREE), 20000);
  });
  threeP = load('vendor/three.min.js').then(ok => ok || load('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js')).then(ok => { if (!ok) threeP = null; return ok });
  return threeP;
}
