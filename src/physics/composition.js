// Состав атмосфер по объёму (доли 0…1) — плавно меняется со временем и с температурой.
// Земля: опорные точки истории (data/earthHistory.js) + водяной пар по Клаузиусу — Клапейрону + радиогенный аргон.
// Другие миры: состав по измерениям (Марс — Curiosity/SAM, Венера — Pioneer Venus/Venera, Титан — Гюйгенс), переходы
// между состояниями (оттепель, потеря атмосферы) — плавные, по температуре или времени.

// Подписи и цвета газов
export const GAS_INFO = {
  N2: ['N₂', '#3b82f6'], O2: ['O₂', '#10b981'], Ar: ['Ar', '#a855f7'], CO2: ['CO₂', '#ef4444'], CH4: ['CH₄', '#f59e0b'], H2O: ['H₂O', '#38bdf8'],
  H2: ['H₂', '#93c5fd'], He: ['He', '#facc15'], Ne: ['Ne', '#f472b6'], SO2: ['SO₂', '#eab308'], CO: ['CO', '#94a3b8'], NH3: ['NH₃', '#2dd4bf'],
  SiO: ['SiO/Na (пар лавы)', '#f97316'], O2x: ['O₂ (экзосфера)', '#10b981']
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Нормировка: недостающее до 100% заполняется газом-основой (fill) */
export function normalize(mix, fill = 'N2') {
  let s = 0;
  for (const [k, v] of Object.entries(mix)) if (k !== fill) s += Math.max(0, v);
  const out = { ...mix };
  if (s >= 1) { for (const k of Object.keys(out)) out[k] = Math.max(0, out[k]) / s; out[fill] = 0; }
  else out[fill] = 1 - s;
  return out;
}

/** Плавное смешивание двух составов (доли), f — от 0 до 1 */
export function blendMix(a, b, f) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = (a[k] || 0) * (1 - f) + (b[k] || 0) * f;
  return out;
}

/**
 * Водяной пар у поверхности: давление насыщенного пара по Клаузиусу — Клапейрону (6.11 гПа при 0 °C, L/R_v = 5420 K),
 * при средней влажности ~50 %; доля = e/p (не больше 30 % — дальше атмосфера становится паровой)
 */
export function vaporFraction(T, pBar) {
  const e = 6.11e-3 * Math.exp(5420 * (1 / 273.15 - 1 / Math.max(150, T)));   // бар
  return Math.min(0.3, 0.5 * e / Math.max(1e-6, pBar));
}

/** Состав атмосферы Земли по значениям эпохи (co2ppm, ch4ppm, o2pct, h2ppm, h2oPct для плотной атмосферы) */
export function earthMix(v, T, t) {
  const ar = 0.0093 * clamp01(0.15 + 0.85 * Math.max(0, t) / 4.57);           // аргон-40 копится от распада калия-40
  const mix = {
    CO2: v.co2ppm * 1e-6, CH4: (v.ch4ppm || 0) * 1e-6, O2: (v.o2pct || 0) / 100, H2: (v.h2ppm || 0) * 1e-6,
    Ar: ar, Ne: 18e-6, He: 5e-6,
    H2O: v.h2oPct !== undefined ? v.h2oPct / 100 : vaporFraction(T, v.pBar),
    SO2: v.so2ppm ? v.so2ppm * 1e-6 : 0
  };
  return normalize(mix, 'N2');
}

// ---------- Марс ----------
// Давление: нойская эра 1.25 бар → потеря атмосферы к ~3 млрд лет назад → 6 мбар; оптимум, когда раздувшееся Солнце
// испаряет полярные шапки (CO₂ и вода уходят в атмосферу)
const MARS_P = [[0, 1.25], [0.8, 1.0], [1.3, 0.05], [2.0, 0.006], [6.9, 0.006], [7.6, 0.65], [9.3, 0.65], [9.9, 0.006]];
export function marsPressure(t) {
  if (t <= MARS_P[0][0]) return MARS_P[0][1];
  for (let i = 0; i < MARS_P.length - 1; i++) {
    const [t0, p0] = MARS_P[i], [t1, p1] = MARS_P[i + 1];
    if (t <= t1) return Math.exp(Math.log(p0) + (Math.log(p1) - Math.log(p0)) * smooth(t0, t1, t));
  }
  return MARS_P[MARS_P.length - 1][1];
}
const MARS_NOW = { CO2: 0.9497, N2: 0.0259, Ar: 0.0194, O2: 0.0017, CO: 0.0008, H2O: 0.0002 };     // Franz et al. 2017 (SAM)
export function marsMix(pBar, T) {
  // в плотной влажной атмосфере больше пара и азота (меньше азота унесено)
  const wet = smooth(0.02, 0.5, pBar);
  return normalize({ ...blendMix(MARS_NOW, { N2: 0.1, Ar: 0.005, O2: 0, CO: 0.0005 }, wet), H2O: Math.min(0.03, Math.max(0.0002, vaporFraction(T, pBar) * 0.6)) }, 'CO2');
}

// ---------- Венера ----------
export const VENUS_NOW = { CO2: 0.965, N2: 0.035, SO2: 150e-6, Ar: 70e-6, H2O: 20e-6, CO: 17e-6, He: 12e-6, Ne: 7e-6 };
export const VENUS_EARLY = { CO2: 0.65, N2: 0.25, H2O: 0.10 };

// ---------- ледяные и прочие миры ----------
export const TITAN_NOW = { N2: 0.942, CH4: 0.0565, H2: 0.001, CO: 47e-6 };          // Гюйгенс (Niemann et al. 2010)
export const TITAN_THAW = { N2: 0.72, CH4: 0.18, NH3: 0.05, H2O: 0.05 };
export const TITAN_HOT = { N2: 0.60, H2O: 0.30, CH4: 0.10 };
export const KUIPER_NOW = { N2: 0.99, CH4: 0.005, CO: 0.0005 };
export const KUIPER_THAW = { N2: 0.78, CH4: 0.16, CO: 0.03, H2O: 0.03 };
export const EUROPA_NOW = { O2x: 1 };
export const EUROPA_THAW = { H2O: 0.85, O2: 0.15 };
export const EUROPA_HOT = { H2O: 0.92, O2: 0.08 };
export const URANUS = { H2: 0.825, He: 0.152, CH4: 0.023 };
export const NEPTUNE = { H2: 0.80, He: 0.19, CH4: 0.015 };
export const HOT_JUPITER = { H2: 0.85, He: 0.14, CO: 0.006, H2O: 0.004 };
export const SILICATE_VAPOR = { SiO: 0.7, CO2: 0.3 };
export const FROZEN_OUT = { N2: 0.85, Ar: 0.15 };
export const STEAM = { H2O: 0.88, N2: 0.08, CO2: 0.04 };
export const DRY_CO2 = { CO2: 0.92, N2: 0.06, SO2: 0.02 };

/**
 * Плавный переход между двумя состояниями по температуре: доля второго состояния растёт от T0 − w до T0 + w
 */
export const thawFraction = (T, T0, w = 12) => smooth(T0 - w, T0 + w, T);

/** Список газов для HUD: по убыванию доли */
export function mixToList(mix) {
  return Object.entries(mix).filter(([, v]) => v > 1e-9).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, name: (GAS_INFO[k] || [k])[0], color: (GAS_INFO[k] || [k, '#94a3b8'])[1], frac: v, pct: v * 100 }));
}
