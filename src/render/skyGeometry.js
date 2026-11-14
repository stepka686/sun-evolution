// Геометрия неба для вида с поверхности: Солнце, Луна, планеты, звёзды и Млечный Путь в одной системе координат.
// Наблюдатель на широте 50°; Солнце — по дню года (склонение δ = arcsin(sin ε · sin λ☉)), звёздное время — из часового угла
// Солнца, пересчёт экваториальных координат в горизонтальные — сферическая тригонометрия. Для других планет используется
// их наклон оси ε (сезоны), а звёзды — в земной экваториальной системе (вид созвездий от этого почти не меняется).
import { OBLIQUITY } from '../physics/rotation.js';

export const OBS_LAT = 50 * Math.PI / 180;
const D2R = Math.PI / 180, TWO_PI = 2 * Math.PI;

export function effObliquity(planet, exo) {
  const o = exo ? 15 : (OBLIQUITY[planet] ?? 0);
  const m = ((o % 180) + 180) % 180;
  return (m > 90 ? 180 - m : m) * D2R;           // обратное вращение (Венера, Уран) — то же, что наклон 180° − ε
}

// Эклиптические координаты → экваториальные (ε — наклон экватора к эклиптике)
export function eclToEq(lam, beta, eps) {
  const sl = Math.sin(lam), cl = Math.cos(lam), sb = Math.sin(beta), cb = Math.cos(beta), se = Math.sin(eps), ce = Math.cos(eps);
  const ra = Math.atan2(sl * cb * ce - sb * se, cl * cb);
  const dec = Math.asin(Math.max(-1, Math.min(1, sb * ce + cb * se * sl)));
  return { ra, dec };
}

// Экваториальные → горизонтальные: высота и азимут (от севера к востоку)
export function altAz(ra, dec, lst, lat = OBS_LAT) {
  const H = lst - ra;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(H));
  return { alt, az: (az + TWO_PI) % TWO_PI };
}

/**
 * Небесная сцена момента: долгота Солнца по дню года, звёздное время по местному солнечному времени (0…24 ч).
 * locked — приливный захват: Солнце неподвижно на высоте 30° (широта подбирается под полдень).
 */
export function skyFrame(dayOfYear, timeOfDay, eps, locked) {
  const lamSun = TWO_PI * (dayOfYear - 80) / 365.25;          // ≈ 0 в день весеннего равноденствия (21 марта)
  const sun = eclToEq(lamSun, 0, eps);
  let lat = OBS_LAT, tod = timeOfDay;
  if (locked) { lat = Math.min(89.9 * D2R, 60 * D2R + sun.dec); tod = 12; }
  const lst = sun.ra + ((tod - 12) / 24) * TWO_PI;
  const s = altAz(sun.ra, sun.dec, lst, lat);
  return { lamSun, sun, lst, lat, eps, sunAlt: s.alt, sunAz: s.az };
}

// Галактика → экваториальные (J2000): северный полюс Галактики α = 192.86°, δ = 27.13°, l полюса мира = 122.93°
export function galToEq(l, b) {
  const aG = 192.85948 * D2R, dG = 27.12825 * D2R, lNCP = 122.93192 * D2R;
  const sinDec = Math.sin(b) * Math.sin(dG) + Math.cos(b) * Math.cos(dG) * Math.cos(lNCP - l);
  const dec = Math.asin(sinDec);
  const ra = aG + Math.atan2(Math.cos(b) * Math.sin(lNCP - l), Math.sin(b) * Math.cos(dG) - Math.cos(b) * Math.sin(dG) * Math.cos(lNCP - l));
  return { ra, dec };
}

// Показатель цвета B−V → эффективная температура (Ballesteros 2012)
export const bvToTemp = (bv) => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));

// Положение звёзд каталога (для вида Солнца с других звёзд): α, δ (°), расстояние (св. лет)
export const STAR_POS = {
  alpha_cen_a: [219.9, -60.83, 4.37], proxima: [217.43, -62.68, 4.24], barnard: [269.45, 4.69, 5.96], sirius_a: [101.29, -16.72, 8.6], sirius_b: [101.29, -16.72, 8.6],
  tau_ceti: [26.02, -15.94, 11.9], eps_eri: [53.23, -9.46, 10.5], vega: [279.23, 38.78, 25], altair: [297.7, 8.87, 16.7], arcturus: [213.92, 19.18, 36.7],
  betelgeuse: [88.79, 7.41, 548], polaris: [37.95, 89.26, 433], aldebaran: [68.98, 16.51, 65], pollux: [116.33, 28.03, 34], fomalhaut: [344.41, -29.62, 25],
  regulus: [152.09, 11.97, 79], spica: [201.3, -11.16, 250], rigel: [78.63, -8.2, 860], deneb: [310.36, 45.28, 2600], kapteyn: [77.92, -45.02, 12.8],
  gliese581: [229.86, -7.72, 20.5], '51_peg': [344.37, 20.77, 50.6], trappist1: [346.62, -5.04, 40.7], tabby: [301.56, 44.46, 1470], mira: [34.84, -2.98, 300],
  eta_carinae: [161.27, -59.68, 7500]
};

// Солнце, видимое с другой звезды: противоположная точка неба, m = 4.83 + 5 lg(d / 10 пк)
export function sunFromStar(id) {
  const p = STAR_POS[id];
  if (!p) return null;
  const dpc = p[2] / 3.2616;
  return { ra: ((p[0] + 180) % 360) * D2R, dec: -p[1] * D2R, mag: 4.83 + 5 * Math.log10(dpc / 10), hostRa: p[0] * D2R, hostDec: p[1] * D2R };
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export function dateLabel(doy) {
  let d = Math.max(1, Math.min(365, Math.round(doy)));
  for (let m = 0; m < 12; m++) { if (d <= MDAYS[m]) return `${d} ${MONTHS[m]}`; d -= MDAYS[m]; }
  return '31 декабря';
}
