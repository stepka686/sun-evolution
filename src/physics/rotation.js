// Вращение планет: длина суток и наклон оси.
// Земля: момент импульса системы Земля — Луна сохраняется (приливы лишь перекачивают его из вращения Земли в орбиту Луны):
//   L = I⊕·ω + m☾·√(G(M⊕ + m☾)·a) = const  ⇒  ω(t) = (L − m☾·√(G(M⊕+m☾)·a(t))) / I⊕,
// где a(t) — расстояние до Луны из physics/moon.js. Получается ~22 ч 620 млн лет назад (ритмиты: 21.9 ч, Williams 2000)
// и ~19 ч 2.45 млрд лет назад. Солнечные приливы и атмосферный резонанс не учтены.
import { moonDistanceKm } from './moon.js';

const G = 6.674e-11, M_EARTH = 5.972e24, M_MOON = 7.342e22, I_EARTH = 8.034e37;
const OMEGA_NOW = 2 * Math.PI / 86164.1;            // звёздные сутки
const A_NOW_M = 384400e3;
const orbitalL = (aM) => M_MOON * Math.sqrt(G * (M_EARTH + M_MOON) * aM);
const L_TOTAL = I_EARTH * OMEGA_NOW + orbitalL(A_NOW_M);

/** Солнечные сутки Земли, часы (для Земли у Солнца; Луна существует, пока t < 12.12) */
export function earthDayHours(t) {
  const a = moonDistanceKm(Math.max(0.03, Math.min(12.1, t))) * 1e3;
  const omega = (L_TOTAL - orbitalL(a)) / I_EARTH;
  const sidereal = 2 * Math.PI / omega / 3600;
  return sidereal / (1 - sidereal / 8766);           // поправка на орбитальное движение (год ≈ 8766 ч)
}

// Наклон оси (°) и сидерический период вращения (ч; отрицательный — обратное вращение)
export const OBLIQUITY = { mercury: 0.03, venus: 177.4, earth: 23.44, mars: 25.19, europa: 0.1, titan: 0.3, pluto: 122.5, haumea: 0, makemake: 0, eris: 0, uranus: 97.8, neptune: 28.3 };
export const ROTATION_H = { mercury: 1407.6, venus: -5832.5, earth: 23.93, mars: 24.62, europa: 85.2, titan: 382.7, pluto: -153.3, haumea: 3.9, makemake: 22.8, eris: 25.9, uranus: -17.2, neptune: 16.1 };

export function rotationHours(planet, t, sunSystem = true) {
  if (planet === 'earth' && sunSystem) return earthDayHours(t);
  return ROTATION_H[planet] ?? 24;
}
