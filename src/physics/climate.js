// Климат и атмосферы планет, биосфера Земли.
// Состав атмосферы — вход (история геохимии и жизни), температура — выход модели энергобаланса (energyBalance.js).
import { MODERN_EARTH, earthEpochAt } from '../data/earthHistory.js';
import { getCustomExo } from '../model/exoplanets.js';
import { S } from '../state.js';
import { lerp } from '../util/math.js';
import {
  S_EARTH, THIN_CALIB, effectiveTemp, grayTemp, iceAlbedo, tauThick, tauThin, wetEquilibrium
} from './energyBalance.js';
import { fateText, getPlanetDistanceAU, getPlanetOrbit, isPlanetHitByCME, isPlanetTidallyLocked } from './orbits.js';
import { orbitAt, starStateAt } from './tides.js';

const K = 273.15;
import {
  DRY_CO2, EUROPA_HOT, EUROPA_NOW, EUROPA_THAW, FROZEN_OUT, HOT_JUPITER, KUIPER_NOW, KUIPER_THAW, NEPTUNE, SILICATE_VAPOR, STEAM,
  TITAN_HOT, TITAN_NOW, TITAN_THAW, URANUS, VENUS_EARLY, VENUS_NOW, blendMix, earthMix, marsMix, marsPressure, mixToList, normalize,
  thawFraction, vaporFraction
} from './composition.js';
const logLerp = (a, b, f) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * f);
const sstep = (a, b, x) => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// ===================== СОСТАВ АТМОСФЕР (вход модели) =====================

const isSunSystem = () => S.selectedStarMass === 1.0 && !S.isDeepTime;

// Планеты с океаном: для них считается модель Будыко — Селлерса и порог убегающего парника
function wetComposition(planet, t) {
  if (planet === 'earth') {
    if (isSunSystem()) { const e = earthEpochAt(t); return e.regime === 'wet' ? e : null; }
    return MODERN_EARTH;
  }
  const exo = getCustomExo(planet);
  if (exo && exo.type === 'ocean_world') return { regime: 'wet', pBar: 2.4, co2ppm: 80000, ch4ppm: 2, event: 'Влажная азотно-водяная атмосфера мира-океана', mix: { N2: 0.88, CO2: 0.08, Ar: 0.009, O2: 1e-5 }, vapor: true };
  if (exo && exo.type === 'super_earth') return { regime: 'wet', pBar: 3.1, co2ppm: 2000, ch4ppm: 2, event: 'Плотная атмосфера суперземли, удерживаемая высокой гравитацией', mix: { N2: 0.79, O2: 0.18, CO2: 0.002, Ar: 0.012 }, vapor: true };
  if (planet === 'venus' && isSunSystem() && t >= 0 && t < 1.4) {
    // Гипотеза раннего океана Венеры: медленное вращение даёт плотный облачный щит на дневной стороне (Way et al. 2016)
    return { regime: 'wet', pBar: 3.2, co2ppm: 650000, ch4ppm: 0, warmAlbedo: 0.5,
      event: 'Гипотетический ранний океан Венеры под облачным щитом медленно вращающейся планеты',
      mix: VENUS_EARLY };
  }
  return null;
}

// Состояние звезды и поток на планете в момент t (по треку, без визуальных пульсаций)
function fluxAt(planet, t) {
  const st = starStateAt(S.currentDynamicStages, t);
  const a = orbitAt(getPlanetOrbit(planet), t);
  return a > 0 ? { S: S_EARTH * st.l / (a * a), star: st } : null;
}

// Момент наступления убегающего парника (океаны выкипают) — ищется расчётом и кэшируется
const runawayCache = new Map();
export function getRunawayOnset(planet) {
  const key = `${planet}|${S.selectedStarId}|${S.selectedStarMass}|${S.selectedFeH}|${S.tideFactor}|${S.currentDynamicStages.length}|${S.currentDynamicStages[0].t}`;
  if (runawayCache.has(key)) return runawayCache.get(key);
  const st = S.currentDynamicStages;
  const tEnd = st[st.length - 1].t;
  const t0 = Math.max(0, st[0].t);
  const isRunaway = (t) => {
    const comp = wetComposition(planet, t);
    if (!comp) return false;
    const f = fluxAt(planet, t);
    if (!f) return false;
    return wetEquilibrium(f.S, comp, { warmAlbedo: comp.warmAlbedo }).state === 'runaway';
  };
  let onset = Infinity;
  const N = 1200;
  let prevT = t0;
  for (let i = 0; i <= N; i++) {
    const t = t0 + (tEnd - t0) * i / N;
    if (isRunaway(t)) {
      let lo = prevT, hi = t;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (isRunaway(mid)) hi = mid; else lo = mid; }
      onset = hi;
      break;
    }
    prevT = t;
  }
  runawayCache.set(key, onset);
  return onset;
}

// После убегающего парника: паровая атмосфера → потеря воды (фотолиз, утечка водорода) → сухая углекислотная
function postRunawayAtmosphere(dt) {
  if (dt < 0.8) {
    const p = 15 + 205 * sstep(0, 0.5, dt);
    return { regime: 'thick', pBar: p, albedo: 0.30, label: 'steam',
      event: 'Убегающий парник: океаны выкипают в сверхплотную паровую атмосферу', mix: STEAM };
  }
  const f = Math.min(1, (dt - 0.8) / 0.3), fs = sstep(0, 1, f);
  return { regime: 'thick', pBar: lerp(220, 65, f), albedo: lerp(0.30, 0.76, f), label: f < 1 ? 'steam' : 'dry',
    event: f < 1 ? 'Фотолиз пара и утечка водорода: Земля теряет океаны' : 'Сухая венероподобная атмосфера из CO₂ (вода утрачена)',
    // вода теряется экспоненциально, CO₂ из карбонатов выходит в атмосферу
    mix: blendMix(STEAM, DRY_CO2, fs) };
}

// Состав атмосферы любой планеты в момент state.t (без температуры)
function atmosphereOf(planet, state, S_flux) {
  const t = state.t;
  const exo = getCustomExo(planet);
  const strippedByGiant = state.r >= 10 && S_flux > 50 * S_EARTH;

  // Остаток (белый карлик) или глубокое время: всё замёрзло
  if ((S.isDeepTime || state.r < 0.05) && ['earth', 'venus', 'mars'].includes(planet)) {
    return { regime: 'airless', pBar: 0.0001, albedo: 0.62, event: 'Криогенное вымерзание: азот и CO₂ осели инеем на грунт',
      mix: FROZEN_OUT };
  }

  if (planet === 'earth' || (exo && (exo.type === 'ocean_world' || exo.type === 'super_earth'))) {
    const tRun = getRunawayOnset(planet);
    if (t >= tRun) {
      const run = postRunawayAtmosphere(t - tRun);
      // Гигантская фаза: ветер звезды и жёсткий УФ срывают атмосферу постепенно — по мере роста потока
      // (18 → 150 потоков современной Земли), а не в один кадр. Остаётся только пар самой породы:
      // давление насыщенного пара силикатов (в основном Na, SiO) lg p[бар] ≈ 6 − 20 000/T (Schaefer & Fegley 2009),
      // T — дневная сторона без атмосферы. При ~1200 K это ~10⁻¹¹ бар, то есть почти вакуум.
      const strip = sstep(18 * S_EARTH, 150 * S_EARTH, S_flux);
      if (strip <= 0) return run;
      const Tday = effectiveTemp(S_flux, 0.1) * Math.pow(2, 0.25);
      const pRock = Math.max(1e-9, Math.pow(10, 6 - 20000 / Tday));
      const p = logLerp(run.pBar, pRock, strip);
      const lava = Tday > 1400;
      return { ...run, regime: p > 0.5 ? 'thick' : 'airless', pBar: p, albedo: lerp(run.albedo, 0.1, strip),
        mix: blendMix(run.mix, lava ? SILICATE_VAPOR : { SiO: 0.5, CO2: 0.3, N2: 0.2 }, strip),
        // облака редеют вместе с давлением: от полного покрова при исходном давлении до нуля при 0.5 бар
        cloudScale: Math.max(0, Math.min(1, Math.log(p / 0.5) / Math.log(run.pBar / 0.5))), stripping: strip,
        event: strip < 0.95 ? (p > 0.5 ? `Звёздный ветер сдувает атмосферу: осталось ${p >= 1 ? p.toFixed(0) : p.toPrecision(2)} бар, облака редеют`
            : `Последние остатки атмосферы уходят в космос: ${p.toPrecision(2)} бар`)
          : lava ? 'Атмосфера сорвана: над лавовым океаном — тонкий пар кипящих силикатов (Na, SiO)'
          : 'Атмосфера сорвана: голая раскалённая порода, давление пара силикатов ничтожно' };
    }
    if (planet === 'earth' && isSunSystem()) {
      const e = earthEpochAt(t);
      return { ...e, regime: e.regime, albedo: e.regime === 'thick' ? 0.30 : undefined, earth: e };
    }
    return wetComposition(planet, t);
  }

  if (planet === 'venus') {
    const wet = wetComposition('venus', t);
    if (wet) return wet;
    // Океан выкипел (t ≈ 1.4 млрд лет): пар + углекислота коры, ~10 бар — та же температура, что у влажной фазы;
    // дальше пар теряется, CO₂ копится до 92 бар, облака H₂SO₄ поднимают альбедо; гигантская фаза срывает мантию ветром
    const tOut = isSunSystem() ? sstep(1.4, 2.2, t) : 1;
    let p = logLerp(10, 92, tOut);
    const strip = sstep(18, 30, state.r);
    p = logLerp(p, 4.5, strip);
    const mix = blendMix(blendMix({ CO2: 0.55, N2: 0.10, H2O: 0.35 }, VENUS_NOW, tOut), { CO2: 0.96, N2: 0.04 }, strip);
    return { regime: 'thick', pBar: p, albedo: lerp(lerp(0.5, 0.76, tOut), 0.30, strip), mix,
      event: strip > 0.5 ? 'Гидродинамический срыв углекислотной мантии звёздным суперветром'
        : tOut < 0.9 ? 'Океан Венеры выкипел: пар теряется в космос, углекислота коры копится в атмосфере'
        : 'Сверхкритическая углекислотная атмосфера с облаками серной кислоты H₂SO₄' };
  }

  if (planet === 'mars') {
    let p = isSunSystem() ? marsPressure(t) : 0.006;
    const strip = Math.max(strippedByGiant ? 1 : 0, sstep(28, 40, state.r));
    p = logLerp(p, 0.00001, strip);
    const ev = strip > 0.5 ? 'Атмосфера сдувается звёздным ветром в космос'
      : p > 0.3 && t < 3 ? 'Нойская эра Марса: плотная атмосфера CO₂, реки и озёра'
      : p > 0.3 ? 'Марс в зоне жизни: сублимация полярных шапок уплотняет атмосферу'
      : p > 0.012 ? (t < 3 ? 'Марс теряет атмосферу: без магнитного динамо солнечный ветер уносит газ' : 'Полярные шапки испаряются: давление на Марсе растёт')
      : 'Разреженная холодная пустыня после потери магнитного динамо';
    return { regime: 'thin', calib: 'mars', pBar: p, albedo: 0.25, event: ev, marsMix: true };
  }

  if (planet === 'titan') return { regime: 'thin', calib: 'titan', pBar: 1.45, albedo: 0.22, event: 'Плотная азотная атмосфера с углеводородным смогом и метановыми дождями',
    mix: TITAN_NOW };
  if (planet === 'europa') return { regime: 'icy', pBar: 0.000001, warm: 0.35, ice: 0.68, event: 'Сверхтонкая экзосфера из радиолитического кислорода над ледяным щитом',
    mix: EUROPA_NOW };
  if (['pluto', 'haumea', 'makemake', 'eris'].includes(planet)) return { regime: 'icy', pBar: 0.00001, warm: 0.30, ice: 0.58,
    event: 'Криогенная микроатмосфера в равновесии с азотным и метановым льдом', mix: KUIPER_NOW };
  if (planet === 'uranus' || planet === 'neptune') return { regime: 'airless', pBar: 1000, albedo: 0.30,
    event: 'Ледяной гигант: глубокая водородно-гелиевая оболочка с метановыми облаками', mix: planet === 'uranus' ? URANUS : NEPTUNE };
  if (exo && exo.type === 'hot_jupiter') return { regime: 'airless', pBar: 1500, albedo: 0.10,
    event: 'Горячий юпитер: раскалённая водородно-гелиевая мантия с облаками силикатов', mix: HOT_JUPITER };
  if (planet === 'mercury' || (exo && exo.type === 'chthonian')) return { regime: 'airless', pBar: 0, albedo: planet === 'mercury' ? 0.07 : 0.10,
    event: 'Безатмосферное тело: звёздный ветер беспрепятственно бомбардирует реголит', mix: {} };
  return { regime: 'airless', pBar: 0, albedo: 0.30, event: 'Безатмосферное тело: звёздный ветер беспрепятственно бомбардирует реголит', mix: {} };
}

// ===================== КЛИМАТ (выход модели) =====================

/**
 * Климат планеты: температура из энергобаланса и состояние атмосферы.
 * @returns {{ T: number (K), climate: string, atmo: object, S: number } | null}  null — планеты нет на орбите
 */
export function getPlanetClimate(planet, state) {
  const a = getPlanetDistanceAU(planet, state);
  if (a <= 0.001) return null;
  const Sflux = S_EARTH * Math.max(1e-12, state.l) / (a * a);
  const atmo = atmosphereOf(planet, state, Sflux);
  let T, climate;

  if (atmo.regime === 'wet') {
    const r = wetEquilibrium(Sflux, atmo, { warmAlbedo: atmo.warmAlbedo });
    if (r.state === 'runaway') {
      // На границе (между узлами поиска) — уже паровая атмосфера
      const steam = postRunawayAtmosphere(0);
      T = grayTemp(Sflux, steam.albedo, tauThick(steam.pBar)); climate = 'runaway';
    } else { T = r.T; climate = r.state; }
  } else if (atmo.regime === 'thick') {
    T = grayTemp(Sflux, atmo.albedo, tauThick(atmo.pBar));
    climate = atmo.label === 'steam' ? 'runaway' : 'hot';
  } else if (atmo.regime === 'thin') {
    const c = THIN_CALIB[atmo.calib];
    T = grayTemp(Sflux, atmo.albedo, tauThin(atmo.pBar, c.tau0, c.p0));
    climate = 'dry';
  } else if (atmo.regime === 'icy') {
    // Ледяное тело: альбедо падает, если лёд тает, — итерируем σT⁴ = S/4·(1 − α(T))
    T = effectiveTemp(Sflux, atmo.ice);
    for (let k = 0; k < 40; k++) T = 0.5 * T + 0.5 * effectiveTemp(Sflux, iceAlbedo(T, atmo.warm, atmo.ice));
    climate = T > 258 ? 'thaw' : 'frozen';
  } else {
    T = effectiveTemp(Sflux, atmo.albedo);
    climate = 'airless';
  }
  // Вымерзание углекислотной атмосферы: если поверхность холоднее точки инея CO₂ при этом давлении,
  // газ оседает сухим льдом, пока давление не упадёт до давления насыщенного пара над льдом:
  // lg p[бар] = 6.81 − 1301.7/T (1 бар при −78.5 °C). Так холодная Венера у тусклой звезды теряет 92 бар.
  const co2Main = atmo.mix ? (atmo.mix.CO2 || 0) > 0.5 : (planet === 'venus' || planet === 'mars');
  if (co2Main && atmo.pBar > 0.001 && (atmo.regime === 'thick' || atmo.regime === 'thin')) {
    const Tfrost = 1301.7 / (6.81 - Math.log10(atmo.pBar));
    if (T < Tfrost) {
      const Tice = effectiveTemp(Sflux, 0.6);                       // иней CO₂ отражает ~60 % света
      const p2 = Math.min(atmo.pBar, Math.pow(10, 6.81 - 1301.7 / Math.max(60, Tice)));
      const collapsed = { ...atmo, regime: p2 > 0.003 ? 'thin' : 'airless', calib: 'mars', pBar: p2, albedo: 0.6,
        mix: { CO2: 0.95, N2: 0.035, Ar: 0.015 }, collapsed: true,
        event: `Атмосфера вымерзла: при ${Math.round(Tice - K)} °C углекислота оседает сухим льдом, над ним — ${p2 < 0.001 ? p2.toExponential(0) : p2.toPrecision(2)} бар` };
      const c2 = THIN_CALIB.mars;
      T = collapsed.regime === 'thin' ? grayTemp(Sflux, 0.6, tauThin(p2, c2.tau0, c2.p0)) : Tice;
      return { T: Math.max(2.75, T), climate: 'frozen', atmo: collapsed, S: Sflux };
    }
  }
  // Ниже реликтового излучения (2.7 K) тело не остынет
  T = Math.max(2.75, T);
  return { T, climate, atmo, S: Sflux };
}

export function calculateSurfaceTemp(planet, state) {
  const distAU = getPlanetDistanceAU(planet, state);
  // Планета внутри фотосферы: температура фотосферы
  if (distAU <= 0.001 || state.r / 215.0 >= distAU) return { avg: Math.round(state.temp - K), locked: false };
  const c = getPlanetClimate(planet, state);
  const celsius = c.T - K;
  const locked = isPlanetTidallyLocked(planet, state.t);
  if (locked) {
    // Приливный захват: дневная сторона горячее, ночная — холоднее (перенос тепла атмосферой не моделируется)
    const thick = c.atmo.pBar > 5;
    const spread = thick ? 0.05 : 1;
    return { avg: Math.round(celsius), day: Math.round(celsius + spread * (190 + Math.min(600, state.r * 3.5))),
      night: Math.max(-270, Math.round(celsius - spread * 170)), locked: true, climate: c.climate };
  }
  return { avg: Math.round(celsius), locked: false, climate: c.climate };
}

/** Состав атмосферы (доли) с учётом рассчитанной температуры: пар, оттепели ледяных миров */
function compositionOf(planet, c, t) {
  const a = c.atmo, T = c.T;
  let mix = a.mix || {}, pressure = a.pBar, event = a.event;
  if (a.earth) mix = earthMix(a.earth, T, t);
  else if (a.marsMix) mix = marsMix(a.pBar, T);
  else if (a.vapor) mix = normalize({ ...mix, H2O: vaporFraction(T, a.pBar) }, 'N2');
  // Оттепели — плавные: доля «тёплого» состава растёт в окне ±12 °C вокруг порога
  if (planet === 'titan') {
    const f1 = thawFraction(T, K - 50), f2 = thawFraction(T, K + 100);
    mix = blendMix(blendMix(TITAN_NOW, TITAN_THAW, f1), TITAN_HOT, f2);
    pressure = logLerp(logLerp(1.45, 3.8, f1), 2.0, f2);
    if (f2 > 0.5) event = 'Титан раскалён: лёд коры испаряется, метан и азот уходят в космос';
    else if (f1 > 0.5) event = 'Оттепель на Титане: водно-аммиачный океан и испарение метановых озёр';
  }
  if (planet === 'europa') {
    const f1 = thawFraction(T, K - 20), f2 = thawFraction(T, K + 100);
    mix = blendMix(blendMix(EUROPA_NOW, EUROPA_THAW, f1), EUROPA_HOT, f2);
    pressure = logLerp(logLerp(1e-6, 0.18, f1), 0.8, f2);
    if (f2 > 0.5) event = 'Ледяной панцирь Европы выкипел: каменное ядро под паровой атмосферой';
    else if (f1 > 0.5) event = 'Таяние ледяного панциря Европы: вторичная пароводяная атмосфера';
  }
  if (['pluto', 'haumea', 'makemake', 'eris'].includes(planet)) {
    const f = thawFraction(T, K - 80);
    mix = blendMix(KUIPER_NOW, KUIPER_THAW, f);
    pressure = logLerp(1e-5, 0.42, f);
    if (f > 0.5) event = 'Оазис пояса Койпера: сублимация азотно-метановых ледников в плотную атмосферу';
  }
  // доли в сумме — ровно 1
  const sum = Object.values(mix).reduce((x, v) => x + Math.max(0, v), 0);
  if (sum > 0) mix = Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, Math.max(0, v) / sum]));
  return { mix, pressure, event };
}

export function calculatePlanetAtmosphere(planet, state) {
  const c = getPlanetClimate(planet, state);
  if (!c) return { pressureBar: 0, event: `Планета ${fateText(planet)}`, gases: [] };
  const a = c.atmo;
  const Tc = c.T - K;
  const comp = compositionOf(planet, c, state.t);
  let event = comp.event;
  // События, следующие из рассчитанной температуры
  if (c.climate === 'snowball') event = `Земля-снежок: лёд отражает свет, и планета замерзает до экватора (T ≈ ${Math.round(Tc)} °C). ${a.event}`;
  else if (c.climate === 'warm' && Tc > 60 && (planet === 'earth')) event = 'Влажный парник: пар поднимается в стратосферу, вода начинает теряться в космос';
  const gases = comp.pressure > 0 ? mixToList(comp.mix) : [];
  return { pressureBar: Number(comp.pressure.toPrecision(3)), event, gases, mix: comp.mix, climate: c.climate, temperatureK: c.T };
}

// ===================== БИОСФЕРА ЗЕМЛИ =====================

export function calculateBiosphere(t) {
  if (S.selectedStarMass < 0.45) return { era: "Сверхустойчивая эра", statusColor: "#10b981", o2: 21.0, co2: 350, healthPct: 100, badge: "Биосфера: Процветание" };
  if (S.selectedStarMass >= 8.0) return { era: "Стерилизовано УФ", statusColor: "#ef4444", o2: 0.0, co2: 0, healthPct: 0, badge: "Биосфера: Стерильно" };
  const tRun = S.selectedStarMass === 1.0 ? getRunawayOnset('earth') : Infinity;
  if (S.isDeepTime || t >= tRun || t >= 6.4) {
    return { era: t >= tRun ? "Океаны выкипели — стерилизация" : "Полная стерилизация", statusColor: "#ef4444", o2: 0.0, co2: 0, healthPct: 0, badge: "Биосфера: Стерильно" };
  }
  // CO₂ и O₂ — из той же истории атмосферы, что и климат
  const e = earthEpochAt(t);
  const co2 = Math.round(e.co2ppm), o2 = e.o2pct;
  if (t < 0.6) return { era: "Катархей (Абиогенез)", statusColor: "#94a3b8", o2, co2, healthPct: 5, badge: "Биосфера: Протоклетки" };
  if (t < 2.1) return { era: "Анаэробный архей (Строматолиты)", statusColor: "#38bdf8", o2, co2, healthPct: 30, badge: "Биосфера: Анаэробы" };
  if (t < 2.45) return { era: "Кислородная катастрофа (Гурон)", statusColor: "#60a5fa", o2, co2, healthPct: 45, badge: "Биосфера: Кислородная революция" };
  if (t < 3.85) return { era: "Протерозой («Скучный миллиард»)", statusColor: "#34d399", o2, co2, healthPct: 65, badge: "Биосфера: Эукариоты" };
  if (t < 4.02) return { era: "Криогений", statusColor: "#93c5fd", o2, co2, healthPct: 55, badge: "Биосфера: Выживание подо льдом" };
  if (t < 4.30) return { era: "Палеозой (Карбоновые леса)", statusColor: "#10b981", o2, co2, healthPct: 100, badge: "Биосфера: Гигантизм (32% O₂)" };
  if (t <= 4.75) return { era: "Кайнозой (Процветание)", statusColor: "#10b981", o2, co2, healthPct: 100, badge: "Биосфера: Процветание" };
  if (t < 5.1) { const p = (t - 4.75) / 0.35; return { era: "Пангея Ультима (Аридизация)", statusColor: "#facc15", o2, co2, healthPct: Math.round(lerp(95, 65, p)), badge: "Биосфера: Стресс жары" }; }
  if (t < 5.5) { const p = (t - 5.1) / 0.4; return { era: "Гибель C3 и C4 растений", statusColor: "#f97316", o2, co2, healthPct: Math.round(lerp(65, 25, p)), badge: "Биосфера: Коллапс флоры" }; }
  if (t < 5.8) { const p = (t - 5.5) / 0.3; return { era: "Задыхание многоклеточных", statusColor: "#ef4444", o2, co2, healthPct: Math.round(lerp(25, 10, p)), badge: "Биосфера: Гибель фауны" }; }
  const p = Math.min(1, (t - 5.8) / 0.6);
  return { era: "Термофильные экстремофилы", statusColor: "#a855f7", o2, co2, healthPct: Math.round(lerp(10, 0, p)), badge: "Биосфера: Экстремофилы" };
}

// ===================== ПОТЕРЯ АТМОСФЕРЫ И ПОТОК =====================

export function calculateAtmosphereEscapeRate(planet, state) {
  if (S.isDeepTime || state.r < 0.05) return "0.0 кг/с";
  const distAU = getPlanetDistanceAU(planet, state);
  if (distAU <= 0.001) return "Атмосфера разрушена";

  const flux = Math.max(1e-6, state.l) / (distAU * distAU);
  let baseRateKg = 3.2 * Math.pow(flux, 1.7);
  // Катастрофический сдув атмосфер жестким рентгеном при супервспышках молодого карлика
  if (S.selectedStarMass < 0.45 && state.t < 25.0) baseRateKg *= 28.0;
  const exo = getCustomExo(planet);
  if (planet === 'mercury' || (exo && exo.type === 'chthonian')) return "Атмосферы нет (выжжена)";
  if (exo && exo.type === 'hot_jupiter') baseRateKg *= 85.0;
  if (exo && exo.type === 'ocean_world') baseRateKg *= 6.0;
  if (planet === 'venus') baseRateKg *= 12.0;
  if (planet === 'mars') baseRateKg *= 4.5;
  if (planet === 'titan') baseRateKg *= 2.5;
  if (isPlanetHitByCME(planet, state)) baseRateKg *= 18.5; // Всплеск утечки при ударе плазмы CME

  if (baseRateKg < 1000) return `${baseRateKg.toFixed(1)} кг/с`;
  if (baseRateKg < 1e6) return `${(baseRateKg / 1000).toFixed(1)} т/с`;
  return `${(baseRateKg / 1e6).toFixed(2)} тыс. т/с`;
}

export function calculateInsolationFlux(planet, state) {
  const distAU = getPlanetDistanceAU(planet, state);
  if (distAU <= 0.001) return "В недрах плазмы";
  const fluxWatts = (1361.0 * Math.max(1e-12, state.l)) / (distAU * distAU);
  if (fluxWatts < 1.0) return `${fluxWatts.toFixed(2)} Вт/м²`;
  if (fluxWatts < 1000) return `${Math.round(fluxWatts)} Вт/м²`;
  if (fluxWatts < 1e6) return `${(fluxWatts / 1000).toFixed(1)} кВт/м²`;
  return `${(fluxWatts / 1e6).toFixed(2)} МВт/м²`;
}
