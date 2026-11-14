// Главный цикл: шаг времени, отрисовка вида и панелей
import { drawMoonView } from '../render/moonView.js';
import { drawGalaxyView } from '../render/galaxyView.js';
import { drawTelescope } from './telescope.js';
import { drawTransit } from './transit.js';
import { cinemaTick, drawCinemaCaption } from './cinema.js';
import { trackFrameTime } from './perf.js';
import { drawHrBig } from './hr.js';
import { updateFormulaPanel } from './formulas.js';
import { updateAudio } from '../audio/audio.js';
import { cCtx, curvesCanvas, hCtx, hrCanvas, mCtx, mainCanvas, pCtx, planckCanvas, playIcon, sCtx, spectrumCanvas } from '../dom.js';
import { getInterpolatedState, getTimeBounds, getTrackMarks } from '../model/timeline.js';
import { drawEvolutionCurves, drawFraunhoferSpectrum, drawHRDiagram, drawPlanckDiagram } from '../render/charts.js';
import { drawInterstellarView } from '../render/interstellar.js';
import { drawOrbitView } from '../render/orbit.js';
import { drawSpaceView } from '../render/space.js';
import { drawSurfaceView } from '../render/surface.js';
import { S } from '../state.js';
import { avoidToolbarOverlap, updateUI } from './hud.js';

export function render(now) {
  try {
    const delta = Math.min(0.1, (now - S.lastAnimTime) / 1000);
    S.lastAnimTime = now;
    cinemaTick(now);
    trackFrameTime(delta);

    if (S.isPlaying) {
      const bounds = getTimeBounds();
      let speedFactor = (bounds.max - bounds.min) * 0.08;
      // Кинематографичное slow-mo в момент вспышки сверхновой для массивных звёзд
      if (S.selectedStarMass >= 8.0 && S.selectedStarMass < 20.0) {
        const m = getTrackMarks();
        const near = m.remnant - m.end;
        if (S.currentAge >= m.end - near && S.currentAge <= m.remnant) speedFactor = near * 0.4;
      }
      if (S.isDeepTime) {
        // В глубоком времени шагаем по логарифму возраста
        const lgSpan = Math.log10(bounds.max) - Math.log10(bounds.min);
        S.currentAge = Math.pow(10, Math.log10(S.currentAge) + lgSpan * 0.08 * S.basePlaySpeed * S.speedMultiplier * delta);
      } else {
        S.currentAge += S.basePlaySpeed * S.speedMultiplier * delta * speedFactor;
      }
      const maxT = getTimeBounds().max;
      if (S.currentAge > maxT) {
        S.currentAge = maxT;
        S.isPlaying = false;
        playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      }
    }

    const state = getInterpolatedState(S.currentAge);
    updateAudio(state);

    const mRect = mainCanvas.parentElement.getBoundingClientRect();
    if (S.currentView === 'space') drawSpaceView(mCtx, mRect.width, mRect.height, state, now, delta);
    else if (S.currentView === 'orbit') drawOrbitView(mCtx, mRect.width, mRect.height, state, now);
    else if (S.currentView === 'surface') drawSurfaceView(mCtx, mRect.width, mRect.height, state, now);
    else if (S.currentView === 'moon') drawMoonView(mCtx, mRect.width, mRect.height, state, now);
    else if (S.currentView === 'galaxy') drawGalaxyView(mCtx, mRect.width, mRect.height, state, now);
    else drawInterstellarView(mCtx, mRect.width, mRect.height, state, now);
    drawCinemaCaption(mCtx, mRect.width, mRect.height);
    drawTransit(state, now);
    avoidToolbarOverlap();

    // Полная точность для плавного бега чисел у короткоживущих массивных звёзд и учёт радиуса пульсаций
    const curSignature = `${S.currentAge.toExponential(8)}_${state.r.toFixed(5)}_${S.selectedStarId}_${S.currentPlanet}_${S.currentView}_${S.cameraFocus}_${S.spectrumMode}_${S.spectralProbeInfo}_${S.tideFactor}_${S.isDeepTime}_${mRect.width}`;
    if (curSignature !== S.lastSidebarSignature || S.spectrumMode === 'transit') {
      S.lastSidebarSignature = curSignature;
      updateUI(state);
      updateFormulaPanel(state);
      drawHrBig(state);
      drawTelescope(state);
      const hRect = hrCanvas.parentElement.getBoundingClientRect();
      const pRect = planckCanvas.parentElement.getBoundingClientRect();
      const sRect = spectrumCanvas.parentElement.getBoundingClientRect();
      const cRect = curvesCanvas.parentElement.getBoundingClientRect();

      drawPlanckDiagram(pCtx, pRect.width, pRect.height, state);
      drawFraunhoferSpectrum(sCtx, sRect.width, sRect.height, state);
      drawEvolutionCurves(cCtx, cRect.width, cRect.height, state);
      drawHRDiagram(hCtx, hRect.width, hRect.height, state);
    }
  } catch (err) {
    console.error("Render error:", err);
  }

  requestAnimationFrame(render);
}
