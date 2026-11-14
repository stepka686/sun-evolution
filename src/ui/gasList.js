// Список газов атмосферы: строки по убыванию доли, живые значения, плавная перестановка строк.
// Строки привязаны к газу (ключ), позиция задаётся translateY — при смене ранга строка «переезжает» на новое место.

const ROW_H = 19;          // высота строки, px
const TOP_N = 6;           // сколько газов показывать, остальное — «Прочие»

/** Подпись доли: проценты с двумя знаками, ниже 0.01 % — ppm (миллионные доли) */
export function formatFraction(frac) {
  const pct = frac * 100;
  if (pct >= 0.01) return `${pct >= 99.995 ? '100.00' : pct.toFixed(2)}%`;
  const ppm = frac * 1e6;
  if (ppm >= 10) return `${Math.round(ppm)} ppm`;
  if (ppm >= 0.1) return `${ppm.toFixed(1)} ppm`;
  return `${(ppm * 1000).toPrecision(2)} ppb`;
}

/** Строки для показа: топ-N + «Прочие» (сумма остальных) */
export function gasRows(gases, n = TOP_N) {
  const rows = gases.slice(0, n).map(g => ({ key: g.key, name: g.name, color: g.color, frac: g.frac }));
  const rest = gases.slice(n).reduce((s, g) => s + g.frac, 0);
  if (rest > 0) rows.push({ key: '_rest', name: 'Прочие', color: '#64748b', frac: rest });
  return rows;
}

const els = new Map();     // key → { row, label, val, fill, rank }

function makeRow(r) {
  const row = document.createElement('div');
  row.className = 'gas-row entering';
  row.innerHTML = `<span class="gas-dot"></span><span class="gas-name"></span><span class="gas-track"><span class="gas-fill"></span></span><span class="gas-val"></span>`;
  const e = { row, dot: row.children[0], label: row.children[1], fill: row.children[2].firstChild, val: row.children[3], rank: -1, text: '' };
  e.dot.style.background = r.color; e.fill.style.background = r.color;
  e.label.textContent = r.name; e.label.style.color = r.color;
  return e;
}

/** Обновить список в контейнере (вызывается каждый кадр — DOM трогается только при изменениях) */
export function renderGasList(box, gases) {
  if (!box) return;
  const rows = gasRows(gases);
  box.classList.toggle('empty', rows.length === 0);
  if (rows.length === 0) {
    for (const [k, e] of els) { e.row.remove(); els.delete(k); }
    if (box.dataset.empty !== '1') { box.dataset.empty = '1'; box.style.height = `${ROW_H}px`; box.setAttribute('data-msg', 'Газовая оболочка отсутствует'); }
    return;
  }
  box.dataset.empty = '0';
  const h = `${rows.length * ROW_H}px`;
  if (box.style.height !== h) box.style.height = h;
  const seen = new Set();
  rows.forEach((r, i) => {
    seen.add(r.key);
    let e = els.get(r.key);
    if (!e) {
      e = makeRow(r); els.set(r.key, e);
      e.row.style.transform = `translateY(${i * ROW_H}px)`;
      box.appendChild(e.row);
      requestAnimationFrame(() => e.row.classList.remove('entering'));
    }
    if (e.label.textContent !== r.name) e.label.textContent = r.name;
    if (e.rank !== i) { e.rank = i; e.row.style.transform = `translateY(${i * ROW_H}px)`; e.row.style.zIndex = String(50 - i); }
    const txt = formatFraction(r.frac);
    if (e.text !== txt) { e.text = txt; e.val.textContent = txt; }
    // ширина полоски — доля в процентах (не меньше 1.5 %, чтобы следовые газы было видно)
    const w = `${Math.max(1.5, Math.min(100, r.frac * 100)).toFixed(1)}%`;
    if (e.fill.style.width !== w) e.fill.style.width = w;
  });
  for (const [k, e] of els) {
    if (seen.has(k)) continue;
    els.delete(k);
    e.row.classList.add('leaving');
    setTimeout(() => e.row.remove(), 350);
  }
}
