// Режим «Формулы»: панель с формулой, подстановкой текущих чисел и результатом.
// Открывается кнопкой «ƒ Формулы» или кликом по карточке величины (пока панель открыта, карточки кликабельны).
import { S } from '../state.js';
import { FORMULA_TABS, buildFormula, renderFormulaHTML } from '../model/formulas.js';

// Какие элементы интерфейса открывают какую формулу
const TARGETS = [
  ['valAge', 'age'], ['valRadius', 'radius'], ['valLum', 'lum'], ['valTemp', 'temp'], ['valMass', 'mass'], ['valHzDist', 'hz'],
  ['surfaceTempBadge', 'climate'], ['fluxBadge', 'climate'], ['planetPressureVal', 'climate'], ['hzStatusBadge', 'orbit']
];

let panel, body, tabs, btn, lastRender = 0, lastState = null;

function cardOf(id) {
  const el = document.getElementById(id);
  return el ? (el.closest('.metric-cell') || el) : null;
}

export function openFormula(key) {
  S.formulaKey = key;
  S.formulaOpen = true;
  panel.style.display = 'flex';
  document.body.classList.add('formula-mode');
  btn.classList.add('active');
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.fx === key));
  renderNow();
}

export function closeFormula() {
  S.formulaOpen = false;
  panel.style.display = 'none';
  document.body.classList.remove('formula-mode');
  btn.classList.remove('active');
}

function renderNow() {
  if (!lastState || !S.formulaOpen) return;
  try {
    body.innerHTML = renderFormulaHTML(buildFormula(S.formulaKey, lastState));
  } catch (e) {
    body.innerHTML = `<div class="fx-note">Формула недоступна для этого состояния (${e.message}).</div>`;
  }
  lastRender = performance.now();
}

// Вызывается из цикла отрисовки вместе с HUD; обновление не чаще 4 раз в секунду
export function updateFormulaPanel(state) {
  lastState = state;
  if (S.formulaOpen && performance.now() - lastRender > 250) renderNow();
}

export function initFormulas() {
  panel = document.getElementById('formulaPanel');
  body = document.getElementById('formulaBody');
  tabs = document.getElementById('formulaTabs');
  btn = document.getElementById('formulaBtn');
  if (!panel || !btn) return;
  // Панель — прямо в <body>: у шапки свой контекст позиционирования (backdrop-filter), и fixed внутри неё уезжает
  document.body.appendChild(panel);
  tabs.innerHTML = FORMULA_TABS.map(([k, t]) => `<button class="pill-item" data-fx="${k}">${t}</button>`).join('');
  tabs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => openFormula(b.dataset.fx)));
  btn.addEventListener('click', () => (S.formulaOpen ? closeFormula() : openFormula(S.formulaKey || 'lum')));
  document.getElementById('closeFormulaBtn').addEventListener('click', closeFormula);
  for (const [id, key] of TARGETS) {
    const el = cardOf(id);
    if (!el) continue;
    el.dataset.fx = key;
    el.addEventListener('click', (e) => { if (S.formulaOpen) { e.stopPropagation(); openFormula(key); } });
  }
}
