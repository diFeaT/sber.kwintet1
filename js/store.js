/* Единый источник правды конструктора: проект (house) + история изменений.
   Снимки истории — JSON: проект небольшой, а откат получается точным и независимым от Three.js.
   Перетаскивание = begin() → live()… → end(): в историю попадает одна запись. */
export function createStore(initial) {
  let house = initial, past = [], future = [], tx = null, rev = 0;
  const subs = new Set(), snap = () => JSON.stringify(house);
  const emit = kind => subs.forEach(f => f(kind));
  return {
    get house() { return house },
    get rev() { return rev },
    get canUndo() { return past.length > 0 },
    get canRedo() { return future.length > 0 },
    get inTx() { return tx !== null },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
    /* обычное изменение: одна запись истории, если проект реально изменился */
    mutate(fn) {
      if (tx !== null) { fn(house); emit('live'); return true }
      const before = snap(); fn(house);
      if (snap() === before) return false;
      past.push(before); if (past.length > 120) past.shift(); future = []; rev++; emit('change'); return true;
    },
    begin() { if (tx === null) tx = snap() },
    live(fn) { fn(house); emit('live') },
    end() {
      if (tx === null) return false;
      const changed = snap() !== tx;
      if (changed) { past.push(tx); if (past.length > 120) past.shift(); future = []; rev++ }
      tx = null; if (changed) emit('change'); return changed;
    },
    cancel() { if (tx === null) return; house = JSON.parse(tx); tx = null; emit('change') },
    undo() {
      if (tx !== null) this.cancel();
      if (!past.length) return false;
      future.push(snap()); house = JSON.parse(past.pop()); rev++; emit('change'); return true;
    },
    redo() {
      if (!future.length) return false;
      past.push(snap()); house = JSON.parse(future.pop()); rev++; emit('change'); return true;
    },
    /* загрузка нового проекта: история очищается */
    reset(h) { house = h; past = []; future = []; tx = null; rev = 0; emit('reset') }
  };
}
