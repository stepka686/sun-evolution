// Внешний вид планеты из её климата: океаны, полярные шапки, растительность, облака, лава, цвет атмосферы.
// Используется видом «Орбита» и точками планет в «Космосе» — вместо ручных таблиц «если t < 4.8, то голубая».
import { getCustomExo } from '../model/exoplanets.js';
import { surfaceOpticsFor } from '../physics/optics.js';
import { S } from '../state.js';

// Базовые цвета грунта (sRGB) и доля суши в мире с океаном
const ROCK = {
  mercury: [110, 105, 110], venus: [175, 120, 70], earth: [140, 100, 60], mars: [180, 80, 45], europa: [215, 205, 190],
  titan: [150, 100, 45], pluto: [190, 160, 140], haumea: [215, 220, 232], makemake: [190, 105, 70], eris: [238, 242, 250],
  uranus: [150, 215, 235], neptune: [50, 105, 220]
};
const EXO_ROCK = { hot_jupiter: [200, 95, 45], ocean_world: [60, 120, 110], super_earth: [120, 105, 70], chthonian: [60, 35, 30] };
const OCEAN_SHARE = { earth: 0.71, mars: 0.35, titan: 0.6, europa: 0.9 };
const EXO_OCEAN = { ocean_world: 0.98, super_earth: 0.55 };
const GIANTS = { uranus: 1, neptune: 1 };

// Цвет атмосферы на лимбе — по типу рассеяния (physics/optics.js)
const LIMB = { air: [110, 170, 255], ice: [150, 200, 255], dust: [235, 170, 110], haze: [235, 150, 40], sulfuric: [250, 205, 90],
  steam: [235, 235, 240], thick: [240, 200, 120], methane: [150, 225, 245], vapor: [230, 140, 60] };
const CLOUD = { air: [255, 255, 255], ice: [245, 248, 255], sulfuric: [240, 210, 130], steam: [240, 238, 232], thick: [235, 205, 140], haze: [215, 145, 55], methane: [190, 235, 245], dust: [215, 160, 110], vapor: [200, 130, 70] };

const cache = new Map();

/**
 * @returns {{ land: number[], ocean: number[], oceanCoverage: number, iceLat: number, vegetation: number,
 *   cloudCover: number, cloudRgb: number[], atmoRgb: number[], atmoDensity: number, glow: number, lava: number,
 *   frozenOcean: boolean, giant: boolean, T: number, kind: string } | null}
 * iceLat — синус широты края полярной шапки (1 — шапок нет, 0 — лёд до экватора)
 */
export function planetLook(planet, state) {
  const key = `${planet}|${state.t.toFixed(5)}|${S.selectedStarId}|${S.selectedFeH}|${S.tideFactor}|${S.isDeepTime}`;
  if (cache.has(key)) return cache.get(key);
  if (cache.size > 300) cache.clear();
  const so = surfaceOpticsFor(planet, state);
  let look = null;
  if (so) {
    const { climate, optics, surface } = so;
    const exo = getCustomExo(planet);
    const T = climate.T;
    const base = (exo ? EXO_ROCK[exo.type] : ROCK[planet]) || ROCK.earth;
    const share = exo ? (EXO_OCEAN[exo.type] || 0) : (OCEAN_SHARE[planet] || 0);
    // Океан: есть, пока климат тёплый и влажный; при убегающем парнике выкипает
    let oceanCoverage = 0;
    if (surface.ocean > 0) oceanCoverage = share * surface.ocean;
    if (climate.climate === 'runaway') oceanCoverage = share * Math.max(0, Math.min(1, (640 - T) / 300));
    // Край полярной шапки: тёплая Земля (15 °C) — около 67° широты, при −10 °C лёд у 30°, в «снежке» — до экватора
    // Край льда: у миров с океаном — по средней температуре (модель Будыко); у сухих (Марс) — только полярные шапки;
    // у ледяных тел лёд и есть поверхность (накладывать его не нужно)
    const icy = ['europa', 'titan', 'pluto', 'eris', 'haumea', 'makemake'].includes(planet);
    let iceLat = 1;
    if (surface.ice >= 1 && !icy) iceLat = 0;
    else if (climate.atmo.regime === 'wet') iceLat = Math.max(0, Math.min(1, (T - 253) / 38));
    else if (!icy && T < 273 && !GIANTS[planet]) iceLat = 0.95;
    const kind = optics.kind;
    const p = climate.atmo.pBar || 0;
    const atmoDensity = kind === 'vacuum' ? 0 : Math.min(0.9, 0.12 + 0.28 * Math.log10(1 + p * 10));
    let cloudCover = 0;
    if (optics.cloud || kind === 'haze' && planet === 'titan') cloudCover = 0.97;
    else if (climate.atmo.regime === 'wet') cloudCover = climate.climate === 'snowball' ? 0.3 : 0.45;
    else if (kind === 'dust') cloudCover = 0.12;
    else if (kind === 'methane') cloudCover = 0.9;
    look = {
      land: base.map((v, i) => v * (1 - surface.vegetation * 0.6) + [45, 115, 55][i] * surface.vegetation * 0.6),
      ocean: surface.ice >= 1 ? [225, 238, 248] : (planet === 'titan' ? [25, 35, 55] : [25, 80, 170]),
      oceanCoverage, iceLat, vegetation: surface.vegetation,
      cloudCover, cloudRgb: CLOUD[kind] || [255, 255, 255],
      atmoRgb: LIMB[kind] || [147, 197, 253], atmoDensity,
      glow: surface.glow, lava: surface.lava, frozenOcean: surface.ice >= 1,
      giant: !!GIANTS[planet] || (exo && exo.type === 'hot_jupiter'), T, kind
    };
  }
  cache.set(key, look);
  return look;
}

// Цвет точки планеты в «Космосе»: то, что видно издалека (облака, лёд, океан, суша)
export function planetDotColor(look) {
  if (!look) return null;
  const mix = (a, b, f) => a.map((x, i) => x + (b[i] - x) * f);
  let c = mix(look.land, look.ocean, look.oceanCoverage);
  c = mix(c, [235, 242, 250], (1 - look.iceLat) * 0.9);
  c = mix(c, look.cloudRgb, look.cloudCover * 0.8);
  if (look.glow > 0.05) c = mix(c, [255, 90, 30], Math.min(0.8, look.glow));
  return c.map(Math.round);
}
