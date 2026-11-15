// Точка входа: инициализация состояния, подписки на события, запуск цикла отрисовки
import { S } from './state.js';
// для браузерных проверок (tools/check): состояние доступно из консоли
if (typeof window !== 'undefined') window.__S = S;
import { initHud, createMilestoneButtons } from './ui/hud.js';
import { initCanvas, resizeCanvases } from './ui/canvas.js';
import { initHr, initHrFullscreen } from './ui/hr.js';
import { initTelescope } from './ui/telescope.js';
import { initControls } from './ui/controls.js';
import { initSpectrum } from './ui/spectrum.js';
import { initCatalog } from './ui/catalog.js';
import { initFormulas } from './ui/formulas.js';
import { initCinema } from './ui/cinema.js';
import { initTransit } from './ui/transit.js';
import { initExoplanetsUI } from './ui/exoplanetsUI.js';
import { initPanels } from './ui/panels.js';
import { initExpedition } from './ui/expedition.js';
import { initAudioControls } from './audio/audio.js';
import { initCamera } from './ui/camera.js';
import { loadCustomStateFromStorage } from './ui/storage.js';
import { render } from './ui/loop.js';
import { buildEvolutionStages } from './model/evolution.js';

// Начальные значения, которым нужны другие модули или DOM
  S.currentDynamicStages = buildEvolutionStages(1.0);
  S.planetBtns = document.querySelectorAll('#planetGroup .pill-item');
  S.focusBtns = document.querySelectorAll('#focusGroup .pill-item');

initHud();
createMilestoneButtons();
initCanvas();
initHr();
initHrFullscreen();
initTelescope();
initControls();
initSpectrum();
initCatalog();
initFormulas();
initCinema();
initTransit();
initExoplanetsUI();
initPanels();
initExpedition();
initAudioControls();
initCamera();
loadCustomStateFromStorage();
resizeCanvases();
requestAnimationFrame(render);
