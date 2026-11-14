// Вертикальный разрез атмосферы: температура и давление по высоте, слои.
//   Тропосфера: T(z) = T₀ − Γz, Γ — влажноадиабатический (~0.65 сухого у влажных миров) или сухой градиент g/c_p
//   Тропопауза: «температура скин-слоя» серой атмосферы T_skin = T_e / 2^¼ (T_e — эффективная температура планеты)
//   Стратосфера: при кислороде озон поглощает УФ и греет её (у Земли до ~270 K на 50 км), без озона — почти изотермична
//   Термосфера: нагрев жёстким УФ звезды; CO₂ хорошо охлаждает (Венера и Марс — холодные термосферы)
//   Давление — из гидростатики: d ln p / dz = −μg / (R·T(z))
import { surfaceGravity } from './optics.js';
import { effectiveTemp } from './energyBalance.js';

const R_GAS = 8.314;
// молярные массы (г/моль) и удельные теплоёмкости c_p (Дж/(кг·К))
const MU = { N2: 28, O2: 32, Ar: 40, CO2: 44, CH4: 16, H2O: 18, H2: 2, He: 4, Ne: 20, SO2: 64, CO: 28, NH3: 17, SiO: 44, O2x: 32 };
const CP = { N2: 1040, O2: 918, Ar: 520, CO2: 850, CH4: 2220, H2O: 1860, H2: 14300, He: 5190, Ne: 1030, SO2: 640, CO: 1040, NH3: 2060, SiO: 800, O2x: 918 };

export function meanMolar(mix) {
  let s = 0, m = 0;
  for (const [k, v] of Object.entries(mix || {})) { s += v; m += v * (MU[k] || 29); }
  return s > 0 ? m / s : 29;
}
function meanCp(mix) {
  // c_p смеси по массе
  let mm = 0, c = 0;
  for (const [k, v] of Object.entries(mix || {})) { const w = v * (MU[k] || 29); mm += w; c += w * (CP[k] || 1000); }
  return mm > 0 ? c / mm : 1000;
}

/**
 * @param planet
 * @param climate  результат getPlanetClimate: { T, S, atmo, climate }
 * @param atmo     результат calculatePlanetAtmosphere: { pressureBar, mix }
 * @returns {{ levels: {z, T, p}[], layers: {name, z0, z1, kind}[], clouds: {name, z0, z1}[], H: number, Tskin: number, lapse: number } | null}
 */
export function atmosphereProfile(planet, climate, atmo) {
  const p0 = atmo.pressureBar;
  if (!climate || !(p0 > 1e-4) || p0 > 500) return null;
  const mix = atmo.mix || {};
  const g = 9.81 * surfaceGravity(planet);
  const mu = meanMolar(mix) / 1000;
  const Ts = climate.T;
  const albedo = climate.atmo.albedo ?? (climate.climate === 'snowball' ? 0.6 : 0.3);
  const Te = effectiveTemp(climate.S, albedo);
  const Tskin = Math.min(Ts - 5, Te / Math.pow(2, 0.25));
  const dryLapse = g / meanCp(mix) * 1000;                       // К/км
  const wet = climate.atmo.regime === 'wet' && climate.climate !== 'snowball';
  // влажная конвекция отдаёт скрытое тепло — градиент меньше сухого; в пыли Марса и смоге Титана — тоже меньше
  const lapse = dryLapse * (wet ? 0.66 : 0.75);
  const o2 = mix.O2 || 0;
  const ozone = Math.min(1, Math.sqrt(o2 / 0.21));             // озоновый нагрев ∝ √O₂ (насыщается)
  const co2 = mix.CO2 || 0;
  const Hs = R_GAS * Tskin / (mu * g) / 1000;                     // шкала высот в верхней атмосфере, км
  const zTrop = Math.max(0.5, (Ts - Tskin) / lapse);
  // стратопауза — там, где озоновый нагрев максимален (у Земли ~50 км, ~6 шкал высот над тропопаузой)
  const hasStrat = ozone > 0.2;                                    // заметный озоновый слой — от ~1 % O₂
  const zStratTop = zTrop + (hasStrat ? 6 * Hs : 3 * Hs);
  const Tstrat = Tskin + (hasStrat ? 58 * ozone : 0);
  const zMesoTop = zStratTop + 5.4 * Hs;
  const Tmeso = Math.max(Tskin * 0.75, Tskin - 30 - 20 * ozone);
  const Ttherm = co2 > 0.5 ? Tskin + 120 : Tskin + 800 * Math.min(1, 0.4 + ozone);
  const zTop = zMesoTop + 3.5 * Hs;
  const Tat = (z) => {
    if (z <= zTrop) return Ts - lapse * z;
    if (z <= zStratTop) {
      const f = (z - zTrop) / (zStratTop - zTrop);
      return Tskin + (Tstrat - Tskin) * Math.pow(f, 1.3);
    }
    if (z <= zMesoTop) { const f = (z - zStratTop) / (zMesoTop - zStratTop); return Tstrat + (Tmeso - Tstrat) * f; }
    const f = (z - zMesoTop) / (zTop - zMesoTop);
    return Tmeso + (Ttherm - Tmeso) * (1 - Math.exp(-3 * f)) / (1 - Math.exp(-3));
  };
  const N = 120, levels = [];
  let lnp = Math.log(p0);
  for (let i = 0; i <= N; i++) {
    const z = zTop * i / N, T = Tat(z);
    levels.push({ z, T, p: Math.exp(lnp) });
    const T2 = Tat(z + zTop / N);
    lnp -= mu * g / (R_GAS * 0.5 * (T + T2)) * (zTop / N * 1000);
  }
  const pAt = (z) => { const i = Math.min(N, Math.max(0, Math.round(z / zTop * N))); return levels[i].p; };
  const zAtP = (p) => { for (const l of levels) if (l.p <= p) return l.z; return zTop; };
  const zAtT = (T, from, to) => { for (const l of levels) if (l.z >= from && l.z <= to && l.T <= T) return l.z; return null; };

  const layers = [
    { name: 'Тропосфера', z0: 0, z1: zTrop, kind: 'tropo' },
    { name: hasStrat ? 'Стратосфера' : 'Стратосфера (без озона)', z0: zTrop, z1: zStratTop, kind: 'strato' },
    { name: 'Мезосфера', z0: zStratTop, z1: zMesoTop, kind: 'meso' },
    { name: 'Термосфера', z0: zMesoTop, z1: zTop, kind: 'thermo' }
  ];
  const clouds = [];
  if (hasStrat) clouds.push({ name: 'Озоновый слой', z0: zTrop + 0.18 * (zStratTop - zTrop), z1: zTrop + 0.55 * (zStratTop - zTrop), kind: 'ozone' });
  if (planet === 'venus' && p0 > 10) clouds.push({ name: 'Облака H₂SO₄', z0: zAtP(1.5), z1: zAtP(0.03), kind: 'cloud' });
  else if (wet && Ts > 273) {
    const zf = zAtT(273, 0, zTrop) ?? 0;
    clouds.push({ name: 'Облака H₂O', z0: Math.max(0.8, zf * 0.3), z1: zTrop * 0.9, kind: 'cloud' });
  } else if (planet === 'titan') clouds.push({ name: 'Метановые облака', z0: 8, z1: Math.min(zTrop, 30), kind: 'cloud' });
  else if (planet === 'mars') clouds.push({ name: 'Облака льда CO₂', z0: zStratTop + 1.5 * Hs, z1: zStratTop + 3 * Hs, kind: 'cloud' });
  return { levels, layers, clouds, H: Hs, Tskin, lapse, zTrop, zTop, pAt, Ts, p0 };
}
