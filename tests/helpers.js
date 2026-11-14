// Общие помощники тестов: выбор звезды без DOM (то же, что делает selectStarById, но без интерфейса)
import { S } from '../src/state.js';
import { buildEvolutionStages } from '../src/model/evolution.js';
import { buildDeepTimeStages, fitAgeToObservation } from '../src/model/timeline.js';
import { invalidateEngulfCache } from '../src/physics/orbits.js';
import { STAR_CATALOG } from '../src/data/catalog.js';

export function useStar(massOrId, feh = 0) {
  const star = typeof massOrId === 'string'
    ? STAR_CATALOG.find(s => s.id === massOrId)
    : { id: `test_${massOrId}_${feh}`, mass: massOrId, feh, startAge: 0 };
  if (!star) throw new Error('Нет звезды ' + massOrId);
  S.selectedStarId = star.id;
  S.selectedStarMass = star.mass;
  S.selectedFeH = star.feh || 0;
  S.currentStarObs = star.obs || null;
  S.isDeepTime = false;
  S.currentDeepStages = null;
  S.currentDynamicStages = buildEvolutionStages(star.mass, star.id, S.selectedFeH);
  invalidateEngulfCache();
  return { star, stages: S.currentDynamicStages };
}

export function enterDeepTime() {
  const st = buildDeepTimeStages();
  if (!st) return null;
  S.currentDeepStages = st;
  S.isDeepTime = true;
  invalidateEngulfCache();
  return st;
}

// Закон Стефана — Больцмана в солнечных единицах
export const sbLum = (s) => s.r * s.r * Math.pow(s.temp / 5772, 4);

// Сетка масс от коричневых карликов до гипергигантов
export const MASS_GRID = [0.03, 0.05, 0.09, 0.12, 0.2, 0.28, 0.4, 0.5, 0.78, 1.0, 1.43, 2.06, 3.8, 5.4, 7.5, 8, 11.4, 16.5, 19, 21, 25, 60, 120];

// Возраст звезды каталога так же, как в интерфейсе: по наблюдениям (T_eff, L) с литературной подсказкой
export function catalogAge(star) {
  return star.obs ? fitAgeToObservation(star.obs.T, star.obs.L, star.startAge).t : star.startAge;
}
