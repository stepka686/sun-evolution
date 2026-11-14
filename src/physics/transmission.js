// Спектр пропускания атмосферы при транзите — «Земля глазами чужого телескопа» (5.1).
// Когда планета проходит по диску звезды, свет звезды просвечивает кольцо атмосферы. На длинах волн, где какой-то газ
// поглощает, атмосфера «непрозрачна» выше, и планета кажется чуть больше. Эффективная высота (Lecavelier des Etangs 2008):
//     z(λ) = H · ln( Σ_газы X_i σ_i(λ) · p₀ · C ),   H = kT/(μg) — шкала высот
// Константу C и силы полос откалибруем по современной Земле: высоты полос взяты из модельного спектра пропускания
// Земли (Kaltenegger & Traub 2009, ApJ 698, 519). Тогда для любой другой смеси высота полосы смещается на H·ln(X/X₀)
// и H·ln(p₀/1 бар) — это и есть логарифмическая зависимость силы линии от обилия в оптически толстом режиме.
// Снизу спектр ограничен «полом»: у Земли — рефракция (лучи ниже ~12 км отклоняются мимо телескопа), у Венеры —
// облака серной кислоты (~65 км), у Титана — дымка толинов. Добавка к глубине транзита: Δδ = 2 R_p z / R★².
import { R_EARTH_KM, R_SUN_KM } from './moon.js';

// [газ, центр полосы (мкм), полуширина (мкм), высота у современной Земли (км), обилие у Земли]
const BANDS = [
  ['O3', 0.26, 0.035, 50, 1], ['O3', 0.60, 0.09, 22, 1], ['O3', 9.6, 0.35, 30, 1],
  ['O2', 0.69, 0.006, 13, 0.209], ['O2', 0.762, 0.007, 18, 0.209], ['O2', 1.27, 0.012, 14, 0.209],
  ['H2O', 0.72, 0.01, 11, 0.004], ['H2O', 0.82, 0.012, 11, 0.004], ['H2O', 0.94, 0.03, 13, 0.004], ['H2O', 1.13, 0.035, 13, 0.004],
  ['H2O', 1.38, 0.06, 16, 0.004], ['H2O', 1.87, 0.07, 17, 0.004], ['H2O', 2.7, 0.15, 20, 0.004], ['H2O', 6.3, 0.9, 22, 0.004],
  ['CO2', 1.6, 0.03, 12, 420e-6], ['CO2', 2.02, 0.04, 16, 420e-6], ['CO2', 2.75, 0.06, 22, 420e-6], ['CO2', 4.3, 0.12, 35, 420e-6], ['CO2', 15, 1.5, 30, 420e-6],
  ['CH4', 1.7, 0.04, 12, 1.9e-6], ['CH4', 2.3, 0.07, 14, 1.9e-6], ['CH4', 3.3, 0.12, 18, 1.9e-6], ['CH4', 7.7, 0.4, 18, 1.9e-6],
  ['SO2', 7.35, 0.25, 15, 1e-9], ['SO2', 8.7, 0.3, 13, 1e-9], ['CO', 2.35, 0.03, 10, 1e-7], ['CO', 4.65, 0.1, 13, 1e-7],
  ['NH3', 10.5, 0.5, 15, 1e-9]
];
const H_REF = 7.0;                        // шкала высот Земли, к которой привязаны высоты полос (км)

export const SPECIES = {
  O3: { label: 'O₃', color: '#a78bfa', bio: true }, O2: { label: 'O₂', color: '#10b981', bio: true }, H2O: { label: 'H₂O', color: '#38bdf8' },
  CO2: { label: 'CO₂', color: '#ef4444' }, CH4: { label: 'CH₄', color: '#f59e0b', bio: true }, SO2: { label: 'SO₂', color: '#eab308' },
  CO: { label: 'CO', color: '#94a3b8' }, NH3: { label: 'NH₃', color: '#2dd4bf' }
};

/**
 * Озон образуется из O₂ под ультрафиолетом. Его столб насыщается: даже при 1 % нынешнего кислорода
 * озоновый слой — около половины нынешнего (Kasting & Donahue 1980; Segura et al. 2003).
 */
export function ozoneRelative(o2frac) {
  const pal = o2frac / 0.209;
  if (pal < 1e-5) return 0;
  return Math.min(1.2, Math.pow(pal, 0.25) * Math.min(1, pal * 1e4));
}

/** Пол спектра (км): ниже свет не проходит — рефракция, облака или дымка */
export function spectrumFloor(planet, p0, H, profile) {
  if (planet === 'venus' && p0 > 10) return 65;
  if (planet === 'titan') return 12 * H;
  if (p0 > 0.3) return 12 * H / H_REF;                 // рефракция в плотной атмосфере
  return 0;
}

/**
 * @param mix      доли газов (calculatePlanetAtmosphere(...).mix)
 * @param p0       давление у поверхности, бар
 * @param H        шкала высот, км
 * @returns {{ lam: number[], z: number[], floor: number, contrib: Object<string, number[]> }}
 */
export function transmissionSpectrum(mix, p0, H, floor = 0, n = 420) {
  const lam = [], z = [], contrib = {};
  const xO3 = ozoneRelative(mix.O2 || 0);
  const X = (sp) => sp === 'O3' ? xO3 : (mix[sp] || 0);
  for (const k of Object.keys(SPECIES)) contrib[k] = [];
  for (let i = 0; i < n; i++) {
    const l = 0.25 * Math.pow(20 / 0.25, i / (n - 1));    // 0.25–20 мкм, логарифмическая сетка
    lam.push(l);
    // рэлеевское рассеяние: у Земли τ = 1 на ~8 км при 0.5 мкм, растёт как λ⁻⁴
    let sum = Math.exp(8 / H_REF) * Math.pow(0.5 / l, 4) * p0;
    const per = {};
    for (const [sp, c, w, zr, xr] of BANDS) {
      const x = X(sp);
      if (x <= 0) continue;
      const wl = Math.max(w, l / 120);                     // разрешение R ≈ 120, как у спектрографа JWST/NIRSpec prism
      const g = Math.exp(-0.5 * ((l - c) / wl) ** 2);
      if (g < 1e-4) continue;
      const a = Math.exp(zr / H_REF) * (x / xr) * p0 * g;
      sum += a;
      per[sp] = (per[sp] || 0) + a;
    }
    const zz = Math.max(floor, H * Math.log(Math.max(1e-30, sum)));
    z.push(zz);
    for (const k of Object.keys(SPECIES)) contrib[k].push(per[k] ? Math.max(floor, H * Math.log(per[k])) : null);
  }
  return { lam, z, floor, contrib };
}

/** Видимые полосы: подъём над соседним континуумом больше 1.2 шкалы высот (уверенное обнаружение) */
export function detectedSpecies(mix, p0, H, floor) {
  const xO3 = ozoneRelative(mix.O2 || 0);
  const X = (sp) => sp === 'O3' ? xO3 : (mix[sp] || 0);
  const seen = {};
  for (const [sp, c, w, zr, xr] of BANDS) {
    const x = X(sp);
    if (x <= 0) continue;
    const zb = H * Math.log(Math.exp(zr / H_REF) * (x / xr) * p0 + Math.exp(8 / H_REF) * Math.pow(0.5 / c, 4) * p0);
    const zc = Math.max(floor, H * Math.log(Math.max(1e-30, Math.exp(8 / H_REF) * Math.pow(0.5 / c, 4) * p0)));
    const rise = zb - zc;
    if (rise > 1.2 * H) seen[sp] = Math.max(seen[sp] || 0, rise / H);
  }
  return seen;
}

/**
 * Вывод наблюдателя: биосигнатура — кислород/озон вместе с метаном (химическое неравновесие: O₂ и CH₄ быстро
 * уничтожают друг друга, и сосуществовать могут, только если их постоянно производит жизнь — Lovelock 1965)
 */
export function verdict(seen) {
  const ox = seen.O2 || seen.O3;
  if (ox && seen.CH4) return { level: 3, text: 'O₂/O₃ вместе с CH₄ — химическое неравновесие: сильнейший признак жизни' };
  if (ox) return { level: 2, text: 'Кислород и озон: вероятная фотосинтезирующая жизнь (но кислород бывает и небиологическим)' };
  if (seen.CH4 && seen.CO2) return { level: 1, text: 'CH₄ и CO₂ без CO: возможна анаэробная жизнь (метаногены), но не доказано' };
  if (Object.keys(seen).length) return { level: 0, text: 'Только «неживые» газы — признаков жизни не видно' };
  return { level: -1, text: 'Атмосферы не видно: ровный силуэт планеты' };
}

/** Глубина транзита, добавленная атмосферой на высоте z (млн⁻¹) */
export function deltaDepthPpm(zKm, rPlanetEarth, rStarSun) {
  const Rp = rPlanetEarth * R_EARTH_KM, Rs = rStarSun * R_SUN_KM;
  return 2 * Rp * zKm / (Rs * Rs) * 1e6;
}
