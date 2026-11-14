// Интерактивная диаграмма Герцшпрунга — Рассела
import { hrCanvas, sidebar } from '../dom.js';
import { getActiveStages, getInterpolatedState } from '../model/timeline.js';
import { drawHRDiagram, getHRCoords } from '../render/charts.js';
import { S } from '../state.js';

// Интерактивное управление временем по клику/перетаскиванию на диаграмме Герцшпрунга — Рассела
const BIG_BOX = { l: 58, r: 20, t: 36, b: 44 };
export function handleHRInteraction(clientX, clientY, canvas = hrCanvas, box = undefined) {
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const list = getActiveStages();
  const minT = list[0].t;
  const maxT = list[list.length - 1].t;

  let bestT = S.currentAge;
  let minDistanceSq = Infinity;
  const samples = 400;

  for (let i = 0; i <= samples; i++) {
    const sampleAge = minT + (i / samples) * (maxT - minT);
    const stateSample = getInterpolatedState(sampleAge);
    const p = getHRCoords(stateSample.temp, stateSample.l, rect.width, rect.height, box);
    const dSq = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
    if (dSq < minDistanceSq) {
      minDistanceSq = dSq;
      bestT = sampleAge;
    }
  }

  S.currentAge = bestT;
}

let hrTouchStartX = 0;

let hrTouchStartY = 0;

let hrTouchMoved = false;

// Подписки на события (выполнялись при загрузке страницы)
export function initHr() {
  hrCanvas.addEventListener('mousedown', (e) => {
    S.isDraggingHR = true;
    handleHRInteraction(e.clientX, e.clientY);
  });

  window.addEventListener('mousemove', (e) => {
    if (S.isDraggingHR) handleHRInteraction(e.clientX, e.clientY);
  });

  window.addEventListener('mouseup', () => { S.isDraggingHR = false; });

  hrCanvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      hrTouchMoved = false;
      hrTouchStartX = e.touches[0].clientX;
      hrTouchStartY = e.touches[0].clientY;
    }
  }, { passive: true });

  hrCanvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - hrTouchStartX);
      const dy = Math.abs(e.touches[0].clientY - hrTouchStartY);
      // Если палец сместился более чем на 7px — это прокрутка панели, отменяем выбор времени
      if (dx > 7 || dy > 7) {
        hrTouchMoved = true;
      }
    }
  }, { passive: true });

  hrCanvas.addEventListener('touchend', (e) => {
    // Время меняется только при быстром четком тапе по диаграмме без свайпа
    if (!hrTouchMoved && e.changedTouches.length === 1) {
      handleHRInteraction(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    hrTouchMoved = false;
  });

  sidebar.addEventListener('touchstart', (e) => {
    e.stopPropagation();
  }, { passive: true });
}

// ---------- Полноэкранная диаграмма ----------
let big = null, bigCtx = null, bigDrag = false;
function resizeBig() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const r = big.getBoundingClientRect();
  big.width = Math.max(10, r.width) * dpr; big.height = Math.max(10, r.height) * dpr;
  bigCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
export function drawHrBig(state) {
  if (!S.hrBigOpen || !big) return;
  const r = big.getBoundingClientRect();
  drawHRDiagram(bigCtx, r.width, r.height, state, true);
}
export function initHrFullscreen() {
  const overlay = document.getElementById('hrOverlay');
  big = document.getElementById('hrBigCanvas');
  if (!overlay || !big) return;
  bigCtx = big.getContext('2d');
  document.body.appendChild(overlay);   // у шапки свой контекст позиционирования — fixed внутри неё не растягивается на экран
  document.getElementById('hrFullBtn').addEventListener('click', () => { S.hrBigOpen = true; overlay.style.display = 'flex'; resizeBig(); S.lastSidebarSignature = ''; });
  document.getElementById('hrCloseBtn').addEventListener('click', () => { S.hrBigOpen = false; overlay.style.display = 'none'; });
  window.addEventListener('resize', () => { if (S.hrBigOpen) resizeBig(); });
  const go = (x, y) => { handleHRInteraction(x, y, big, BIG_BOX); S.isPlaying = false; };
  big.addEventListener('pointerdown', (e) => { bigDrag = true; big.setPointerCapture(e.pointerId); go(e.clientX, e.clientY); });
  big.addEventListener('pointermove', (e) => { if (bigDrag) go(e.clientX, e.clientY); });
  big.addEventListener('pointerup', () => { bigDrag = false; });
}
