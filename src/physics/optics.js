// Оптика атмосферы для вида с поверхности: цвет звезды, рэлеевское и аэрозольное рассеяние, облака.
// Модель однократного рассеяния в плоскопараллельной атмосфере (три канала R, G, B):
//   звезда сквозь атмосферу:  I☉(λ) = F(λ)·exp(−τ(λ)·m(h☉)),  m — воздушная масса (Kasten & Young 1989)
//   яркость неба:             I(λ) = F(λ)·exp(−τ·m(h☉)/2) · [τ_R·P_R(γ) + τ_A·ω·P_A(γ)] / τ · (1 − exp(−τ·m(h)))
//   τ_R(λ) = τ_R(550 нм)·(550/λ)⁴ — закон Рэлея; P_R = ¾(1 + cos²γ); P_A — Хеньи — Гринстейн.
import { calculateBiosphere, getPlanetClimate } from './climate.js';
import { getCustomExo } from '../model/exoplanets.js';

export const LAMBDA_NM = [610, 550, 465];          // эффективные длины волн каналов R, G, B
const H = 6.626e-34, C = 2.998e8, KB = 1.381e-23;

// Цвет излучения чёрного тела так, как его видит глаз: спектр Планка свёртывается с кривыми
// чувствительности CIE 1931 (аналитическая аппроксимация Wyman, Sloan & Shirley 2013) → XYZ → линейный sRGB (D65).
// Раньше спектр брался в трёх точках (610/550/465 нм) — это давало бледно-персиковые красные карлики и голубоватое Солнце.
const gauss = (l, mu, s1, s2) => { const s = l < mu ? s1 : s2; const x = (l - mu) / s; return Math.exp(-0.5 * x * x); };
const cieX = (l) => 1.056 * gauss(l, 599.8, 37.9, 31.0) + 0.362 * gauss(l, 442.0, 16.0, 26.7) - 0.065 * gauss(l, 501.1, 20.4, 26.2);
const cieY = (l) => 0.821 * gauss(l, 568.8, 46.9, 40.5) + 0.286 * gauss(l, 530.9, 16.3, 31.1);
const cieZ = (l) => 1.217 * gauss(l, 437.0, 11.8, 36.0) + 0.681 * gauss(l, 459.0, 26.0, 13.8);
const planck = (lnm, T) => { const lm = lnm * 1e-9; return 1 / (Math.pow(lm, 5) * (Math.exp(H * C / (lm * KB * T)) - 1)); };
const bbCache = new Map();
export function blackbodyRGB(T) {
  const t = Math.round(Math.max(500, Math.min(60000, T)) / 10) * 10;
  if (bbCache.has(t)) return bbCache.get(t);
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) { const b = planck(l, t); X += b * cieX(l); Y += b * cieY(l); Z += b * cieZ(l); }
  const rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z].map(v => Math.max(0, v));
  const m = Math.max(...rgb);
  const out = rgb.map(v => v / m);
  if (bbCache.size > 5000) bbCache.clear();
  bbCache.set(t, out);
  return out;
}

/** Линейный sRGB монохроматического света длины волны λ (нм): точка спектрального локуса, приведённая в гамут */
export function spectralRGB(l) {
  const X = cieX(l), Y = cieY(l), Z = cieZ(l);
  let rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
  // спектральные цвета насыщеннее экрана: подмешиваем белый той же яркости, пока не уйдут отрицательные каналы
  const neg = Math.min(0, ...rgb);
  if (neg < 0) rgb = rgb.map(v => v - neg);
  return rgb;
}

// sRGB-цвет (0…255) для экрана: оттенок без пересвета
export const blackbodyCss = (T) => blackbodyRGB(T).map(v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));

// Воздушная масса (Kasten & Young 1989); под горизонтом — луч скользит через верхние слои
export function airMass(hRad) {
  const hd = hRad * 180 / Math.PI;
  if (hd <= -3.5) return 40;
  return Math.min(40, 1 / (Math.sin(Math.max(-0.06, hRad)) + 0.50572 * Math.pow(Math.max(0.01, hd + 6.07995), -1.6364)));
}

const rayleighTau = (tau550) => LAMBDA_NM.map(l => tau550 * Math.pow(550 / l, 4));
// Озон (полосы Шаппюи, 500–700 нм) поглощает жёлто-оранжевый свет: на длинном пути в сумерках зенит остаётся синим
const OZONE_TAU = [0.045, 0.032, 0.004];
const ozoneTau = (o, i) => (o.ozone ? OZONE_TAU[i] * o.ozone : 0);
const hg = (g, cosG) => (1 - g * g) / Math.pow(1 + g * g - 2 * g * cosG, 1.5);

// Ускорение свободного падения (g⊕): столб газа над поверхностью ∝ p/g
const GRAVITY = { mercury: 0.38, venus: 0.90, earth: 1, mars: 0.38, europa: 0.134, titan: 0.138, pluto: 0.063, haumea: 0.045, makemake: 0.05, eris: 0.084, uranus: 0.89, neptune: 1.14 };
const EXO_GRAVITY = { hot_jupiter: 2.5, ocean_world: 1.2, super_earth: 1.5, chthonian: 1.3 };
export function surfaceGravity(planet) {
  const exo = getCustomExo(planet);
  return exo ? (EXO_GRAVITY[exo.type] || 1) : (GRAVITY[planet] || 1);
}

/**
 * Оптические свойства атмосферы планеты в текущем состоянии климата.
 * tauR — рэлеевская толщина на 550 нм; aer — аэрозоль {tau, w: альбедо однократного рассеяния по каналам, g: асимметрия по каналам};
 * cloud — сплошная облачность {tau, w}; kind — подпись для HUD.
 */
export function atmosphereOptics(planet, climate) {
  const at = climate.atmo;
  const p = Math.max(0, at.pBar || 0);
  const g = surfaceGravity(planet);
  // Рэлей: Земля 1 бар — τ = 0.097 на 550 нм; CO₂ рассеивает в ~2.4 раза сильнее воздуха (поляризуемость)
  const co2Rich = planet === 'venus' || planet === 'mars' || at.label === 'dry';
  const tauR = 0.097 * (p / g) * (co2Rich ? 2.4 : 1);
  const o = { tauR, aer: null, cloud: null, kind: 'air' };
  // меньше миллибара — рассеивать нечему: небо чёрное (Эрида, Плутон сегодня, вымерзшие и сорванные атмосферы)
  if ((at.regime === 'airless' && p < 0.01) || (p < 1e-3 && planet !== 'uranus' && planet !== 'neptune')) { o.tauR = 0; o.kind = 'vacuum'; return o; }
  if (at.regime === 'airless' && planet !== 'uranus' && planet !== 'neptune' && p < 5) {
    // Пары испарённых силикатов (SiO, Na) над лавой под красным гигантом: жёлто-бурая мгла
    o.tauR = 0.02; o.aer = { tau: 0.8, w: [0.9, 0.7, 0.4], g: [0.6, 0.6, 0.6] }; o.kind = 'vapor'; return o;
  }
  if (planet === 'uranus' || planet === 'neptune') {
    // Метан поглощает красный — голубое небо ледяных гигантов
    o.tauR = 4; o.aer = { tau: 2, w: [0.25, 0.80, 0.95], g: [0.5, 0.5, 0.5] }; o.kind = 'methane'; return o;
  }
  // срыв атмосферы гигантом: облака редеют вместе с ней (cloudScale → 0), звезда проступает постепенно
  const cs = at.cloudScale ?? 1;
  if (at.stripping && cs < 0.03) { o.aer = { tau: 0.8 * Math.min(1, p / 0.05), w: [0.9, 0.7, 0.4], g: [0.6, 0.6, 0.6] }; o.kind = p > 0.01 ? 'vapor' : 'vacuum'; return o; }
  // тонкие облака (τ < 2.5) — уже не сплошной покров, а дымка: сквозь неё виден диск звезды
  const veil = (tau, w, kind) => {
    if (tau >= 2.5) o.cloud = { tau, w };
    else o.aer = { tau, w, g: [0.85, 0.85, 0.85] };
    o.kind = kind; return o;
  };
  if (climate.climate === 'runaway' || at.label === 'steam') return veil(25 * cs, [0.97, 0.97, 0.96], 'steam');
  if (planet === 'venus' && at.regime === 'thick') { o.cloud = { tau: 30, w: [0.99, 0.93, 0.62] }; o.kind = 'sulfuric'; return o; }
  if (at.regime === 'thick') return veil(8 * cs, [0.97, 0.90, 0.70], 'thick');
  if (planet === 'mars' || at.calib === 'mars') {
    // Пыль Марса поглощает синий (небо цвета ириски), но сильнее рассеивает его вперёд — голубой закат
    o.aer = { tau: p > 0.1 ? 0.3 : 0.5, w: [0.97, 0.80, 0.58], g: [0.62, 0.70, 0.82] }; o.kind = 'dust'; return o;
  }
  if (at.calib === 'titan' || at.calib === 'kuiper') {
    // Органическая дымка Титана (толины): оранжевое небо, звезда едва видна
    o.aer = { tau: planet === 'titan' ? 3.5 : 0.4, w: [0.96, 0.78, 0.42], g: [0.6, 0.6, 0.6] }; o.kind = 'haze'; return o;
  }
  if (at.regime === 'wet') {
    o.aer = { tau: 0.05, w: [0.95, 0.95, 0.95], g: [0.75, 0.75, 0.75] };
    o.kind = climate.climate === 'snowball' ? 'ice' : 'air';
    // озоновый слой — только при кислородной атмосфере (O₂ из истории Земли или у суперземли)
    const exo = getCustomExo(planet);
    const o2 = planet === 'earth' ? (at.o2pct ?? 21) : (exo && exo.type === 'super_earth' ? 18 : 0);
    o.ozone = Math.min(1, o2 / 10);
  }
  return o;
}

// Свет под сплошной облачностью: диффузия сквозь облака ~ 1/(1 + ¾τ(1 − g)), g ≈ 0.85; ниже облаков толстый газ
// рассеивает синий обратно вверх (на Венере τ_R ≈ 24 на 550 нм) — поэтому свет у поверхности оранжевый
function cloudTransmission(optics, i) {
  const c = optics.cloud;
  const tR = rayleighTau(optics.tauR)[i];
  return c.w[i] / (1 + 0.75 * c.tau * 0.15) * Math.exp(-0.1 * tR);
}

/** Цвет и яркость прямого света звезды у поверхности (линейные RGB, в единицах потока звезды) */
export function directLight(F, optics, hSun) {
  if (hSun < -0.02) return [0, 0, 0];
  const m = airMass(hSun);
  const tR = rayleighTau(optics.tauR);
  return F.map((f, i) => {
    let tau = tR[i] + (optics.aer ? optics.aer.tau : 0) + ozoneTau(optics, i);
    if (optics.cloud) tau += optics.cloud.tau;
    return f * Math.exp(-tau * m);
  });
}

/**
 * Яркость неба в направлении с высотой h при высоте звезды hSun и угловом расстоянии γ от неё.
 * Возвращает линейные RGB в единицах потока звезды (до экспозиции).
 */
export function skyRadiance(F, optics, h, hSun, cosGamma) {
  const tR = rayleighTau(optics.tauR);
  const mV = airMass(Math.max(0.01, h));
  // Сумерки: под горизонтом звезда ещё освещает верхние слои; к −18° свет гаснет
  const twilight = hSun >= 0 ? 1 : Math.exp(hSun / 0.06);
  const mS = airMass(Math.max(-0.06, hSun));
  if (optics.cloud) return F.map((f, i) => f * cloudTransmission(optics, i) * (Math.max(0, Math.sin(hSun)) + 0.05) * twilight * (0.85 + 0.15 * Math.sin(Math.max(0, h))));
  return F.map((f, i) => {
    const tA = optics.aer ? optics.aer.tau : 0;
    const tau = tR[i] + tA;
    if (tau <= 1e-6) return 0;
    const phase = tR[i] * 0.75 * (1 + cosGamma * cosGamma) + (optics.aer ? tA * optics.aer.w[i] * hg(optics.aer.g[i], cosGamma) : 0);
    // Однократное рассеяние в экспоненциальной атмосфере: интеграл по высоте рассеивающего слоя
    //   G = m_v/(m☉ − m_v) · (e^(−τm_v) − e^(−τm☉)); в сумерках зенит подсвечен лучами, прошедшими высоко, где воздух тонкий
    const G = Math.abs(mS - mV) < 1e-3 ? tau * mV * Math.exp(-tau * mV) : mV / (mS - mV) * (Math.exp(-tau * mV) - Math.exp(-tau * mS));
    const oz = Math.exp(-ozoneTau(optics, i) * mS);
    // Многократное рассеяние в толстой дымке: добавка изотропного света
    // (без неё горизонт в пыльной атмосфере на закате уходил бы в черноту — однократное рассеяние там занижено)
    const multi = (optics.aer ? optics.aer.w[i] : 1) * 0.3 * (1 - Math.exp(-tau * Math.min(mV, 6))) * Math.exp(-tau * mS * 0.3) * Math.min(1, tau);
    return f * twilight * oz * (phase / tau * G + multi);
  });
}

// Рассеянный свет под облаками (освещение грунта на Венере и под паром)
export function diffuseUnderClouds(F, optics, hSun) {
  if (!optics.cloud) return null;
  const twilight = hSun >= 0 ? 1 : Math.exp(hSun / 0.06);
  return F.map((f, i) => f * cloudTransmission(optics, i) * (Math.max(0, Math.sin(hSun)) + 0.05) * twilight);
}

// Сжатие динамического диапазона под экран с сохранением оттенка: тон-маппинг по яркости Y, затем гамма sRGB
export function toDisplay(rgbLin, exposure, sat = 1) {
  let v = rgbLin.map(x => Math.max(0, x) * exposure);
  let Y = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  // Насыщенность в линейном пространстве (физическое однократное рассеяние на экране выглядит бледнее, чем глазу)
  if (sat !== 1 && Y > 0) { v = v.map(x => Math.max(0, Y + (x - Y) * sat)); Y = 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
  if (Y <= 1e-12) return [0, 0, 0];
  const k = (1 - Math.exp(-Y)) / Y;
  let out = v.map(x => x * k);
  const m = Math.max(...out);
  if (m > 1) out = out.map(x => x / m + (1 - 1 / m) * 0.35);   // пересвет уходит в белое, а не в другой оттенок
  return out.map(x => 255 * Math.pow(Math.min(1, x), 1 / 2.2));
}
export const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Общий уровень освещённости сцены: глаз адаптируется, но не полностью (логарифмическая шкала яркости)
export function adaptationLevel(lumRelEarthNoon) {
  // от полудня до сумерек (10⁻³) яркость кадра падает по логарифму; дальше глаз переходит на сумеречное и ночное
  // зрение и видит ещё ~4 порядка: при полной Луне (~2·10⁻⁶ полдня) снег и камни различимы, хоть и без цвета
  const x = Math.log10(Math.max(1e-12, lumRelEarthNoon));
  if (x >= -3) return Math.min(1, (x + 4.2) / 4.2);
  return Math.max(0.035, 0.2857 + (x + 3) * 0.2857 / 7);
}

// Угловой радиус тела радиуса R (км) на расстоянии d (км), рад
export const angularRadius = (rKm, dKm) => Math.atan(rKm / Math.max(1e-9, dKm));

/**
 * Что лежит на поверхности: вода, лёд, растительность, лава — из состояния климата.
 * Возвращает доли покрытия и признаки погоды.
 */
export function surfaceState(planet, climate, t) {
  const T = climate.T, at = climate.atmo, cl = climate.climate;
  const r = { ocean: 0, ice: 0, snow: 0, vegetation: 0, lava: 0, glow: 0, steam: 0, weather: 'none' };
  if (cl === 'snowball') { r.ice = 1; r.snow = 1; r.weather = 'blizzard'; return r; }
  if (at.regime === 'wet' && cl === 'warm') {
    r.ocean = 1;
    r.snow = Math.max(0, Math.min(1, (283 - T) / 25));          // снеговая линия опускается с холодом
    if (T > 333) { r.steam = Math.min(1, (T - 333) / 40); r.weather = 'steam'; }
    else if (T < 271) r.weather = 'snow';
    else r.weather = 'rain';
    if (planet === 'earth') {
      const bio = calculateBiosphere(t);
      r.vegetation = Math.max(0, Math.min(1, (bio.healthPct - 30) / 50)) * Math.max(0, Math.min(1, (318 - T) / 20)) * Math.max(0, Math.min(1, (T - 268) / 10));
    }
    return r;
  }
  if (cl === 'runaway') { r.ocean = T < 640 ? 1 : 0; r.steam = 1; r.weather = 'steam'; }
  if (planet === 'mars' && T > 273 && at.pBar >= 0.3) { r.ocean = 0.6; r.weather = 'rain'; }
  if (planet === 'titan' && T > 273) { r.ocean = 0.7; r.weather = 'rain'; }
  else if (planet === 'titan') r.weather = 'methane';
  if (planet === 'mars' && at.pBar < 0.1) r.weather = 'dust';
  if (cl === 'frozen' || (cl === 'airless' && T < 150)) r.ice = planet === 'europa' || ['pluto', 'eris', 'haumea', 'makemake'].includes(planet) ? 1 : 0;
  if (T < 113 && at.pBar > 0) r.weather = r.weather === 'none' ? 'cryo' : r.weather;
  if (planet === 'venus' && at.regime === 'thick') r.weather = 'sulfuric';
  // Раскалённая поверхность светится сама (Дрейпер: видимое свечение с ~800 K), силикаты плавятся с ~1400 K
  r.glow = Math.max(0, Math.min(1, (T - 780) / 700));
  r.lava = T > 1350 ? Math.min(1, (T - 1350) / 400) : 0;
  if (r.lava > 0) r.weather = 'ash';
  return r;
}

// Удобная обёртка: всё для кадра поверхности
export function surfaceOpticsFor(planet, state) {
  const c = getPlanetClimate(planet, state);
  if (!c) return null;
  return { climate: c, optics: atmosphereOptics(planet, c), surface: surfaceState(planet, c, state.t) };
}

