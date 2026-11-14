// Орбиты планет: интегрирование эволюции орбиты по треку звезды (потеря массы, приливы, поглощение, сверхновая)
import { activeCMEs } from '../model/activity.js';
import { getCustomExo } from '../model/exoplanets.js';
import { S } from '../state.js';
import { EXO_TYPE_MASS_EARTH, PLANET_MASS_EARTH, integrateOrbit, orbitAt } from './tides.js';

// Большие полуоси при рождении системы, а.е. (Европа и Титан летят вместе со своими планетами)
export const BASE_AU = {
  mercury: 0.387, venus: 0.723, earth: 1.000, mars: 1.524,
  europa: 5.204, jupiter: 5.204, titan: 9.582, saturn: 9.582,
  uranus: 19.22, neptune: 30.07, pluto: 39.48,
  haumea: 43.13, makemake: 45.79, eris: 67.78
};

// Кэш проинтегрированных орбит: считаются один раз на звезду / режим / силу приливов
const orbitCache = new Map();
export function invalidateEngulfCache() { orbitCache.clear(); }

function orbitStages() {
  return S.isDeepTime ? S.currentDynamicStages.concat(S.currentDeepStages || []) : S.currentDynamicStages;
}

export function getOrbit(baseAU, mpEarth, birthMass) {
  const key = `${baseAU}|${mpEarth}|${birthMass}|${S.tideFactor}|${S.isDeepTime ? 'deep' : 'main'}`;
  let o = orbitCache.get(key);
  if (!o) {
    o = integrateOrbit(orbitStages(), baseAU, mpEarth, { birthMass, tideFactor: S.tideFactor });
    orbitCache.set(key, o);
  }
  return o;
}

export function getPlanetOrbit(planet) {
  const exo = getCustomExo(planet);
  if (exo) return getOrbit(exo.baseDistAU, EXO_TYPE_MASS_EARTH[exo.type] || 1, exo.birthMass);
  return getOrbit(BASE_AU[planet] || 39.48, PLANET_MASS_EARTH[planet] || 0.01, S.selectedStarMass);
}

// Судьба планеты: { type: 'survived' | 'engulfed' | 'blast' | 'ejected', t }
export function getPlanetFate(planet) { return getPlanetOrbit(planet).fate; }

// Человекочитаемая причина исчезновения планеты
export function fateText(planet) {
  const f = getPlanetFate(planet);
  if (f.type === 'blast') return 'уничтожена ударной волной сверхновой';
  if (f.type === 'ejected') return 'выброшена в межзвёздное пространство';
  return 'поглощена фотосферой звезды';
}

// Для пользовательских экзопланет (совместимость с отрисовкой)
export function getEngulfTime(baseAU, birthMass, mpEarth = 1) { return getOrbit(baseAU, mpEarth, birthMass).fate.t; }

export function isPlanetHitByCME(planet, state) {
  if (activeCMEs.length === 0) return false;
  const pDist = getPlanetDistanceAU(planet, state);
  if (pDist <= 0.001) return false;
  for (let cme of activeCMEs) {
    if (Math.abs(cme.distAU - pDist) < Math.max(0.18, pDist * 0.08)) return true;
  }
  return false;
}

export function isPlanetEngulfedOrDestroyed(planet, state) {
  return state.t >= getPlanetFate(planet).t;
}

export function getPlanetDistanceAU(planet, state) {
  return orbitAt(getPlanetOrbit(planet), state.t);
}

export function isPlanetTidallyLocked(planet, t) {
  if (planet === 'mercury') return true;
  // Приливный захват от раздувания красного гиганта касается только системы 1.0 M☉
  if (S.selectedStarMass === 1.0 && !S.isDeepTime && t >= 11.5 && (planet === 'venus' || planet === 'earth' || planet === 'mars')) return true;
  return false;
}
