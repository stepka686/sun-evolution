// Сценарии экспедиций
import { EXPEDITION_STEPS, MASS_008_EXPEDITION_STEPS, MASS_04_EXPEDITION_STEPS, MASS_25_EXPEDITION_STEPS, MASS_80_EXPEDITION_STEPS } from '../data/expeditions.js';
import { DEEP_TIME_STAGES } from '../data/stages.js';
import { BROWN_DWARF_LIMIT } from '../physics/stellar.js';
import { getTrackMarks } from './timeline.js';
import { S } from '../state.js';

// Автоматический тур по стадиям трека (для звёзд без собственного сценария): по шагу на каждую новую фазу
export function buildAutoExpedition(stages) {
  const steps = [];
  for (const s of stages) {
    if (s.t < 0) continue;
    if (steps.length && steps[steps.length - 1].name === s.name) continue;
    steps.push({ t: s.t, view: 'space', focus: 'sun', name: s.name, text: s.desc });
  }
  return steps.map((s, i) => ({ ...s, title: `${i + 1}. ${s.name}` }));
}

// Перевод позиции шага массивной звезды в возраст
function posToTime(pos, m) {
  if (pos === 'zams') return 0;
  if (pos === 'end') return m.end;
  if (pos === 'sn') return m.sn + 0.15 * (m.remnant - m.sn);
  if (pos === 'remnant') return m.remnant;
  const tams = m.tams ?? 0.9 * m.end;
  return tams + pos * (m.end - tams);
}

export function getExpeditionSteps() {
  if (S.isDeepTime) return buildAutoExpedition(S.currentDeepStages || DEEP_TIME_STAGES);
  const special = ['eta_carinae', 'r136a1', 'sgr1806', 'sirius_b', 'la_superba'];
  if (special.includes(S.selectedStarId)) return buildAutoExpedition(S.currentDynamicStages);
  if (S.selectedStarMass < BROWN_DWARF_LIMIT) return MASS_008_EXPEDITION_STEPS;
  const m = getTrackMarks();
  if (S.selectedStarMass < 0.45) {
    return MASS_04_EXPEDITION_STEPS.map(s => ({ ...s, t: s.f >= 1 ? m.remnant : s.f * m.end }));
  }
  if (S.selectedStarMass >= 8.0) {
    const base = S.selectedStarMass < 20.0 ? MASS_80_EXPEDITION_STEPS : MASS_25_EXPEDITION_STEPS;
    return base.map(s => ({ ...s, t: posToTime(s.pos, m) }));
  }
  if (S.selectedStarMass === 1.0) return EXPEDITION_STEPS;
  return buildAutoExpedition(S.currentDynamicStages);
}
