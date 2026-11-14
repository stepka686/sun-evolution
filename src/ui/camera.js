// Камера вида «Космос»: панорама, зум, выбор планеты кликом
import { mainCanvas, pitchSlider, resetCamBtn, viewModeBtns } from '../dom.js';
import { getCustomExo } from '../model/exoplanets.js';
import { getInterpolatedState } from '../model/timeline.js';
import { getPlanetDistanceAU } from '../physics/orbits.js';
import { S } from '../state.js';
import { updateHUDViewLabels } from './hud.js';

let pointerDownPos = { x: 0, y: 0 };

let lastCanvasTapTime = 0;

export function handleSpaceCanvasClick(clientX, clientY, isDouble) {
  if (S.currentView !== 'space') return;
  const rect = mainCanvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;

  // Перевод экранных координат в мировые координаты холста
  const state = getInterpolatedState(S.currentAge);
  const baseScaleAU = (Math.min(rect.width, rect.height) * 0.34) / 1.524;
  const pitchCos = Math.cos((S.camPitchDeg * Math.PI) / 180);
  let focusOffsetX = 0, focusOffsetY = 0;

  if (S.cameraFocus !== 'sun' && S.cameraFocus !== 'oort') {
    const pDistAU = getPlanetDistanceAU(S.cameraFocus, state);
    const radPx = pDistAU * baseScaleAU;
    const exoFocus = getCustomExo(S.cameraFocus);
    let angle = 0;
    if (exoFocus) {
      const orbSpeed = Math.sqrt(Math.max(0.1, state.mass) / Math.pow(Math.max(0.01, pDistAU), 3)) * 0.00035;
      angle = exoFocus.seedAngle + performance.now() * orbSpeed;
    } else {
      const spMap = { mercury: 4.1, venus: 1.6, earth: 1.0, mars: 0.53, europa: 0.08, titan: 0.034, uranus: 0.012, neptune: 0.006, pluto: 0.004, haumea: 0.0035, makemake: 0.0032, eris: 0.0018 };
      angle = performance.now() * 0.0003 * (spMap[S.cameraFocus] || 1.0);
    }
    focusOffsetX = -Math.cos(angle) * radPx;
    focusOffsetY = -Math.sin(angle) * radPx * pitchCos;
  }

  const worldX = (sx - (rect.width / 2 + S.camX + focusOffsetX * S.camZoom)) / S.camZoom;
  const worldY = (sy - (rect.height / 2 + S.camY + focusOffsetY * S.camZoom)) / S.camZoom;

  for (let hb of S.planetHitboxes) {
    if (Math.hypot(worldX - hb.x, worldY - hb.y) <= hb.r) {
      if (isDouble && hb.id !== 'sun') {
        S.currentPlanet = hb.id;
        S.currentView = 'orbit';
        viewModeBtns.forEach(b => b.classList.toggle('active', b.dataset.view === 'orbit'));
        S.planetBtns.forEach(b => b.classList.toggle('active', b.dataset.planet === hb.id));
      } else {
        S.cameraFocus = hb.id;
        S.camX = 0;
        S.camY = 0;
        S.focusBtns.forEach(b => b.classList.toggle('active', b.dataset.focus === hb.id));
      }
      updateHUDViewLabels();
      break;
    }
  }
}

// Подписки на события (выполнялись при загрузке страницы)
export function initCamera() {
  resetCamBtn.addEventListener('click', () => {
    S.camX = 0;
    S.camY = 0;
    S.camZoom = 1.0;
    S.camPitchDeg = 0;
    pitchSlider.value = 0;
  });

  mainCanvas.addEventListener('wheel', (e) => {
    if (S.currentView !== 'space') return;
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.18 : 0.82;
    S.camZoom = Math.max(0.015, Math.min(30.0, S.camZoom * zoomFactor));
  }, { passive: false });

  mainCanvas.addEventListener('mousedown', (e) => {
    if (S.currentView !== 'space') return;
    S.isDragging = true;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    S.dragStartX = e.clientX - S.camX;
    S.dragStartY = e.clientY - S.camY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!S.isDragging || S.currentView !== 'space') return;
    S.camX = e.clientX - S.dragStartX;
    S.camY = e.clientY - S.dragStartY;
  });

  window.addEventListener('mouseup', (e) => {
    if (S.isDragging && S.currentView === 'space') {
      const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moveDist < 6) {
        const nowTap = performance.now();
        const isDouble = (nowTap - lastCanvasTapTime < 320);
        lastCanvasTapTime = nowTap;
        handleSpaceCanvasClick(e.clientX, e.clientY, isDouble);
      }
    }
    S.isDragging = false;
  });

  mainCanvas.addEventListener('touchstart', (e) => {
    if (S.currentView !== 'space') return;
    if (e.touches.length === 1) {
      S.isDragging = true;
      S.dragStartX = e.touches[0].clientX - S.camX;
      S.dragStartY = e.touches[0].clientY - S.camY;
    } else if (e.touches.length === 2) {
      S.isDragging = false;
      S.initialPinchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  mainCanvas.addEventListener('touchmove', (e) => {
    if (S.currentView !== 'space') return;
    if (e.touches.length === 1 && S.isDragging) {
      S.camX = e.touches[0].clientX - S.dragStartX;
      S.camY = e.touches[0].clientY - S.dragStartY;
    } else if (e.touches.length === 2 && S.initialPinchDist) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / S.initialPinchDist;
      S.camZoom = Math.max(0.015, Math.min(30.0, S.camZoom * factor));
      S.initialPinchDist = dist;
    }
  }, { passive: true });

  mainCanvas.addEventListener('touchend', () => {
    S.isDragging = false;
    S.initialPinchDist = null;
  });
}
