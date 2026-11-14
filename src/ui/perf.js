// Производительность: плотность пикселей главного холста подстраивается под скорость кадров.
// На телефоне с devicePixelRatio = 3 холст без ограничения рисует в 9 раз больше пикселей, чем при DPR = 1.
import { S } from '../state.js';

// Ступени качества: сначала упрощаем эффекты (дёшево и почти незаметно), и только потом снижаем
// плотность пикселей — и не ниже 1.5, иначе на экранах с DPR 3 картинка становится заметно пиксельной.
// 5.2.2: старт с DPR 2 — на экране телефона разница с 3 почти не видна, а пикселей в 2.25 раза меньше
const LEVELS = [
  { dpr: 2, low: false },
  { dpr: 2, low: true },
  { dpr: 1.5, low: true },
  { dpr: 1.25, low: true }
];
let level = 0, acc = 0, frames = 0, slowWin = 0, fastWin = 0;
let onChange = null;

export function mainDpr() {
  return Math.min(window.devicePixelRatio || 1, LEVELS[level].dpr);
}

export function setPerfListener(fn) { onChange = fn; }

// Окно в 1 с: если кадр две секунды подряд дольше 22 мс (< 45 к/с) — шаг вниз,
// если шесть секунд подряд быстрее 12 мс — шаг вверх
export function trackFrameTime(delta) {
  if (!(delta > 0)) return;
  acc += delta; frames++;
  if (acc < 1) return;
  const avg = acc / frames;
  S.fps = Math.round(1 / avg);
  acc = 0; frames = 0;
  if (avg > 0.022) { slowWin++; fastWin = 0; } else if (avg < 0.012) { fastWin++; slowWin = 0; } else { slowWin = 0; fastWin = 0; }
  if (slowWin >= 2 && level < LEVELS.length - 1) { level++; slowWin = 0; apply(); }
  else if (fastWin >= 6 && level > 0) { level--; fastWin = 0; apply(); }
}

function apply() {
  const dprBefore = S.mainDprApplied;
  S.lowQuality = LEVELS[level].low;
  S.mainDprApplied = mainDpr();
  if (onChange && dprBefore !== S.mainDprApplied) onChange();
}
