// Кнопки управления: воспроизведение, скорость, виды, переключатели
import { glInfo } from '../gl/glcore.js';
import { dateLabel } from '../render/skyGeometry.js';
import { auroraBtn, deepTimeBtn, earthFateBtn, hydroEqBadge, hydroEqBtn, pitchSlider, playBtn, playIcon, speedNumber, speedSlider, timeOfDaySlider, timeOfDayVal, timeSlider, toggleCutawayBtn, toggleHelioBtn, toggleHzBtn, viewModeBtns } from '../dom.js';
import { getTimeBounds } from '../model/timeline.js';
import { S } from '../state.js';
import { applyExpeditionStep } from './expedition.js';
import { createMilestoneButtons, updateTideButton, updateHUDViewLabels } from './hud.js';
import { setDeepTime, sliderToAge } from './timeControls.js';



// Подписки на события (выполнялись при загрузке страницы)
export function initControls() {
  timeSlider.addEventListener('input', (e) => { S.currentAge = sliderToAge(parseFloat(e.target.value)); });

  playBtn.addEventListener('click', () => {
    S.isPlaying = !S.isPlaying;
    if (S.isPlaying) {
      const maxT = getTimeBounds().max;
      const minT = getTimeBounds().min;
      if (S.currentAge >= maxT) S.currentAge = minT;
      playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    } else {
      playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
  });

  speedSlider.addEventListener('input', (e) => {
    S.speedMultiplier = parseFloat(e.target.value);
    speedNumber.value = S.speedMultiplier.toFixed(2);
  });

  speedNumber.addEventListener('input', (e) => {
    let val = parseFloat(e.target.value);
    if (isNaN(val) || val < 0.01) val = 0.01;
    S.speedMultiplier = val;
    speedSlider.value = Math.min(15.0, val);
  });

  pitchSlider.addEventListener('input', (e) => { S.camPitchDeg = parseFloat(e.target.value); });

  viewModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.currentView = btn.dataset.view;
      updateHUDViewLabels();
    });
  });

  S.planetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      S.planetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.currentPlanet = btn.dataset.planet;
  
      if (S.currentView === 'space' || S.currentView === 'interstellar') {
        S.currentView = 'orbit';
        viewModeBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'orbit'));
      }
      updateHUDViewLabels();
    });
  });

  S.focusBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      S.focusBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.cameraFocus = btn.dataset.focus;
  
      S.currentView = 'space';
      viewModeBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'space'));
  
      if (S.cameraFocus === 'oort') S.camZoom = 0.04;
      else if (S.camZoom < 0.15) S.camZoom = 1.0;
  
      S.planetBtns.forEach(b => b.classList.remove('active'));
      updateHUDViewLabels();
    });
  });

  const doy = document.getElementById('dayOfYearSlider'), doyVal = document.getElementById('dayOfYearVal');
  if (doy) doy.addEventListener('input', (e) => { S.dayOfYear = parseFloat(e.target.value); doyVal.innerText = dateLabel(S.dayOfYear); });
  const cbtn = document.getElementById('constellationsBtn');
  if (cbtn) cbtn.addEventListener('click', () => { S.showConstellations = !S.showConstellations; cbtn.classList.toggle('active', S.showConstellations); });
  // 5.0: переключатель рендера; если WebGL недоступен — кнопка показывает это и остаётся выключенной
  const gbtn = document.getElementById('gpuBtn');
  if (gbtn) {
    const sync = () => {
      const info = glInfo();
      gbtn.classList.toggle('active', info.ok);
      gbtn.innerText = info.ok ? '⚡ GPU' : '⚡ CPU';
      gbtn.title = info.ok ? `Рендер на видеокарте: ${info.version}${info.renderer ? ' • ' + info.renderer : ''}. Нажми — вернуть Canvas 2D` : `Рендер на процессоре (Canvas 2D): ${info.reason}. Нажми — включить GPU`;
    };
    gbtn.addEventListener('click', () => { S.renderer = S.renderer === 'gl' ? '2d' : 'gl'; sync(); });
    setTimeout(sync, 0);
    setInterval(sync, 3000);          // контекст могли потерять или вернуть — подпись следит за этим
  }
  const lbtn = document.getElementById('lookAwayBtn');
  if (lbtn) lbtn.addEventListener('click', () => { S.lookAway = !S.lookAway; lbtn.classList.toggle('active', S.lookAway); lbtn.innerText = S.lookAway ? '↻ Лицом к звезде' : '↻ Спиной к звезде'; });
  timeOfDaySlider.addEventListener('input', (e) => {
    S.timeOfDay = parseFloat(e.target.value);
    const hrs = Math.floor(S.timeOfDay);
    const mins = Math.floor((S.timeOfDay - hrs) * 60);
    timeOfDayVal.innerText = `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  });

  toggleHelioBtn.addEventListener('click', () => {
    S.isHelioVisible = !S.isHelioVisible;
    toggleHelioBtn.classList.toggle('active', S.isHelioVisible);
  });

  auroraBtn.addEventListener('click', () => {
    S.isAurorasOn = !S.isAurorasOn;
    auroraBtn.classList.toggle('active', S.isAurorasOn);
    auroraBtn.innerText = S.isAurorasOn ? 'Сияния: Вкл' : 'Сияния: Выкл';
  });

  hydroEqBtn.addEventListener('click', () => {
    S.isHydroEqVisible = !S.isHydroEqVisible;
    hydroEqBtn.classList.toggle('active', S.isHydroEqVisible);
    hydroEqBtn.innerText = S.isHydroEqVisible ? 'Баланс сил: Вкл' : 'Баланс сил: Выкл';
    hydroEqBadge.style.display = S.isHydroEqVisible ? 'inline-flex' : 'none';
  });

  // Сила приливов: теория приливного трения неточна в разы, поэтому даём перебрать ×1 → ×3 → ×0.3.
  // Судьба Земли (подпись кнопки) пересчитывается интегрированием орбиты
  earthFateBtn.addEventListener('click', () => {
    S.tideFactor = S.tideFactor === 1 ? 3 : (S.tideFactor === 3 ? 0.3 : 1);
    earthFateBtn.classList.toggle('active', S.tideFactor !== 1);
    updateTideButton();
  });

  deepTimeBtn.addEventListener('click', () => {
    setDeepTime(!S.isDeepTime);
    createMilestoneButtons();
    if (S.isExpeditionActive) applyExpeditionStep(0);
  });

  toggleHzBtn.addEventListener('click', () => {
    S.isHzVisible = !S.isHzVisible;
    toggleHzBtn.classList.toggle('active', S.isHzVisible);
  });

  toggleCutawayBtn.addEventListener('click', () => {
    S.isCutaway = !S.isCutaway;
    toggleCutawayBtn.classList.toggle('active', S.isCutaway);
  });
}
