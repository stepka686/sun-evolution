// Шкала времени, выбор звезды, глубокое время
import { STAR_CATALOG } from '../data/catalog.js';
import { starCatalogBtn, timeSlider } from '../dom.js';
import { buildEvolutionStages } from '../model/evolution.js';
import { buildDeepTimeStages, fitAgeToObservation, getTimeBounds } from '../model/timeline.js';
import { invalidateEngulfCache } from '../physics/orbits.js';
import { S } from '../state.js';
import { createMilestoneButtons, updateHUDViewLabels } from './hud.js';

export function selectStarById(starId) {
      const star = STAR_CATALOG.find(s => s.id === starId) || STAR_CATALOG.find(s => s.id === 'sun');
      S.selectedStarId = star.id;
      S.selectedStarMass = star.mass;
      S.selectedFeH = star.feh || 0;
      S.currentStarObs = star.obs || null;
      S.currentDynamicStages = buildEvolutionStages(S.selectedStarMass, star.id, S.selectedFeH);
      invalidateEngulfCache();
      // Смена звезды выключает глубокое время: у новой звезды другой остаток
      if (S.isDeepTime) setDeepTime(false, true);
      const bounds = getTimeBounds();
      applySliderBounds();

      // Возраст по наблюдениям (T_eff, L), если они есть; иначе — заданный вручную
  S.lastAgeFit = star.obs ? fitAgeToObservation(star.obs.T, star.obs.L, star.startAge) : null;
  const age0 = S.lastAgeFit ? S.lastAgeFit.t : star.startAge;
  S.presentAge = star.id === 'sun' ? 4.57 : age0;   // «сегодня» для выбранной звезды — от него отсчитывается сближение с Андромедой
  S.currentAge = Math.max(bounds.min, Math.min(bounds.max, age0));
      timeSlider.value = ageToSlider(S.currentAge);

      const starCatalogBtn = document.getElementById('starCatalogBtn');
      if (starCatalogBtn) {
        starCatalogBtn.innerText = `Звезда: ${star.name} (${star.mass} M☉${S.selectedFeH ? `, [Fe/H] ${S.selectedFeH > 0 ? '+' : '−'}${Math.abs(S.selectedFeH).toFixed(2)}` : ''}) ★`;
      }

      createMilestoneButtons();
      updateHUDViewLabels(); // подпись «Космос • <звезда>» раньше оставалась от прошлой звезды
}

// Ползунок в глубоком времени работает в логарифмической шкале: иначе ранние стадии не поймать
export function ageToSlider(t) { return S.isDeepTime ? Math.log10(Math.max(1e-6, t)) : t; }

export function sliderToAge(v) { return S.isDeepTime ? Math.pow(10, v) : v; }

export function applySliderBounds() {
  const b = getTimeBounds();
  if (S.isDeepTime) {
    timeSlider.min = String(Math.log10(b.min));
    timeSlider.max = String(Math.log10(b.max));
    timeSlider.step = "0.001";
  } else {
    timeSlider.min = String(b.min);
    timeSlider.max = String(b.max);
    timeSlider.step = String(b.step);
  }
}

export function setDeepTime(on, silent) {
  const btn = document.getElementById('deepTimeBtn');
  if (on) {
    const st = buildDeepTimeStages();
    if (!st) {
      if (btn && !silent) {
        btn.innerText = 'Глубокое время: только для белых карликов';
        setTimeout(() => { if (!S.isDeepTime) btn.innerText = 'Глубокое время'; }, 2500);
      }
      return false;
    }
    S.currentDeepStages = st;
    S.isDeepTime = true;
    S.currentAge = st[0].t;
  } else {
    S.isDeepTime = false;
    S.currentDeepStages = null;
    S.currentAge = getTimeBounds().max;
  }
  if (btn) {
    btn.classList.toggle('active', S.isDeepTime);
    btn.innerText = S.isDeepTime ? 'Глубокое время: Вкл' : 'Глубокое время';
  }
  invalidateEngulfCache();
  applySliderBounds();
  timeSlider.value = ageToSlider(S.currentAge);
  return true;
}
