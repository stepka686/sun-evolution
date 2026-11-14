// Зона жизни (Kopparapu 2013) и индекс подобия Земле (ESI)
import { getCustomExo } from '../model/exoplanets.js';
import { calculateSurfaceTemp } from './climate.js';
import { getPlanetDistanceAU } from './orbits.js';
import { S } from '../state.js';
import { rgb } from '../util/color.js';
import { lerpColor } from '../util/math.js';

// Консервативная зона жизни по Kopparapu et al. (2013, с исправлением 2013b):
// S_eff = S0 + aT + bT² + cT³ + dT⁴, T = T_eff − 5780 K; d = √(L/S_eff).
// Внутренняя граница — runaway greenhouse, внешняя — maximum greenhouse. Формула калибрована для 2600–7200 K.
export const HZ_COEFFS = {
  inner: [1.0385, 1.2456e-4, 1.4612e-8, -7.6345e-12, -1.7511e-15],
  outer: [0.3507, 5.9578e-5, 1.6707e-9, -3.0058e-12, -5.1925e-16]
};

export function habitableZone(lum, teff) {
  const T = Math.max(2600, Math.min(7200, teff)) - 5780;
  const seff = (c) => c[0] + c[1] * T + c[2] * T * T + c[3] * T * T * T + c[4] * T * T * T * T;
  const L = Math.max(1e-12, lum);
  return { inner: Math.sqrt(L / seff(HZ_COEFFS.inner)), outer: Math.sqrt(L / seff(HZ_COEFFS.outer)) };
}

export function calculatePlanetESI(planet, state) {
  const distAU = getPlanetDistanceAU(planet, state);
  if (distAU <= 0.001) return { val: 0.0, color: '#ef4444' };

  const sTempObj = calculateSurfaceTemp(planet, state);
  const tempK = Math.max(2.7, sTempObj.avg + 273.15);

  // Физические параметры тел (радиус R⊕, плотность ρ⊕, 2-я космическая скорость v_esc⊕)
  const paramsMap = {
    mercury:  { r: 0.383, d: 0.984, v: 0.380 },
    venus:    { r: 0.949, d: 0.951, v: 0.926 },
    earth:    { r: 1.000, d: 1.000, v: 1.000 },
    mars:     { r: 0.532, d: 0.713, v: 0.450 },
    europa:   { r: 0.245, d: 0.546, v: 0.181 },
    titan:    { r: 0.404, d: 0.341, v: 0.236 },
    uranus:   { r: 3.981, d: 0.230, v: 1.903 },
    neptune:  { r: 3.865, d: 0.297, v: 2.100 },
    pluto:    { r: 0.186, d: 0.336, v: 0.110 },
    haumea:   { r: 0.128, d: 0.360, v: 0.080 },
    makemake: { r: 0.112, d: 0.310, v: 0.070 },
    eris:     { r: 0.182, d: 0.457, v: 0.123 }
  };

  let p = paramsMap[planet];
  if (!p) {
    const exo = getCustomExo(planet);
    if (exo) {
      if (exo.type === 'hot_jupiter') p = { r: 11.2, d: 0.24, v: 5.3 };
      else if (exo.type === 'ocean_world') p = { r: 1.45, d: 0.72, v: 1.22 };
      else if (exo.type === 'super_earth') p = { r: 1.35, d: 1.08, v: 1.40 };
      else p = { r: 0.85, d: 1.35, v: 0.98 };
    } else {
      p = paramsMap.earth;
    }
  }

  // Формула Шульце-Макуха с весовыми экспонентами (w_r=0.57, w_d=1.07, w_v=0.70, w_t=5.58)
  const termR = Math.pow(1 - Math.abs((p.r - 1.0) / (p.r + 1.0)), 0.57 / 4);
  const termD = Math.pow(1 - Math.abs((p.d - 1.0) / (p.d + 1.0)), 1.07 / 4);
  const termV = Math.pow(1 - Math.abs((p.v - 1.0) / (p.v + 1.0)), 0.70 / 4);
  const termT = Math.pow(1 - Math.abs((tempK - 288.0) / (tempK + 288.0)), 5.58 / 4);

  let esi = termR * termD * termV * termT;
  if (planet === 'earth' && S.selectedStarMass === 1.0 && Math.abs(sTempObj.avg - 15) <= 1 && !S.isDeepTime) {
    esi = 1.000;
  }
  esi = Math.max(0.0, Math.min(1.0, esi));

  // Плавный переход цвета от красного (0.0) через жёлтый (0.5) к зелёному (1.0)
  let cRGB;
  if (esi < 0.5) {
    cRGB = lerpColor([239, 68, 68], [234, 179, 8], esi / 0.5);
  } else {
    cRGB = lerpColor([234, 179, 8], [34, 197, 94], (esi - 0.5) / 0.5);
  }

  return { val: esi, color: rgb(cRGB[0], cRGB[1], cRGB[2]) };
}
