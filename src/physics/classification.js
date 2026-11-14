// Спектральная классификация MK
import { S } from '../state.js';

export function getMKClass(state) {

  if (!state) return "G2V";
  const r = state.r;
  const temp = state.temp;

  // 1. Компактные и релятивистские остатки
  if (S.selectedStarMass >= 20.0 && r < 0.001) return "Коллапсар • Чёрная дыра";
  if (r < 0.0001 && S.selectedStarMass >= 8.0) return "Пульсар • NS";
  if (r < 0.05 && temp > 1000) {
    // Белые карлики: спектральный подкласс 50400 / T_eff
    const sub = Math.min(9, Math.max(1, Math.round(50400 / Math.max(1000, temp))));
    if (temp > 6000) return `DA${sub}`;
    return `DC${sub}`;
  }
  if (r < 0.05 && temp <= 1000) return "Чёрный карлик";

  // 2. Спектральный буквенный класс и десятичный подкласс (O, B, A, F, G, K, M, L, T)
  let sClass = "G";
  let subDigit = 2;

  if (temp >= 30000) {
    sClass = "O";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - (temp - 30000) / 2500)));
  } else if (temp >= 10000) {
    sClass = "B";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - (temp - 10000) / 2000)));
  } else if (temp >= 7500) {
    sClass = "A";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - (temp - 7500) / 250)));
  } else if (temp >= 6000) {
    sClass = "F";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - (temp - 6000) / 150)));
  } else if (temp >= 5200) {
    sClass = "G";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - (temp - 5200) / 80)));
  } else if (temp >= 3700) {
    sClass = "K";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - (temp - 3700) / 150)));
  } else if (temp >= 2400) {
    sClass = "M";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - (temp - 2400) / 130)));
  } else if (temp >= 1300) {
    sClass = "L";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - (temp - 1300) / 110)));
  } else {
    sClass = "T";
    subDigit = Math.min(9, Math.max(0, Math.floor(9 - temp / 130)));
  }

  // 3. Класс светимости Йеркса по радиусу и гравитации
  let lumClass = "V";
  if (r >= 250) lumClass = "Ia";
  else if (r >= 90) lumClass = "Ib";
  else if (r >= 35) lumClass = "II";
  else if (r >= 7.5) lumClass = "III";
  else if (r >= 1.7) lumClass = "IV";
  else if (r >= 0.08) lumClass = "V";
  else lumClass = "VI";

  return `${sClass}${subDigit}${lumClass}`;
}
