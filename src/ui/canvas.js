// Размеры canvas под экран и плотность пикселей
import { mainDpr, setPerfListener } from './perf.js';
import { cCtx, curvesCanvas, hCtx, hrCanvas, mCtx, mainCanvas, pCtx, planckCanvas, sCtx, spectrumCanvas } from '../dom.js';

export function resizeCanvases() {
  // панели — до DPR 2 (больше глаз не различит), главный холст — адаптивно (ui/perf.js)
  const dpr = Math.min(2, window.devicePixelRatio || 1);   // панели: DPR 3 на телефоне втрое дороже и незаметно чётче
  const mDpr = mainDpr();
  const mRect = mainCanvas.parentElement.getBoundingClientRect();
  mainCanvas.width = Math.max(10, mRect.width) * mDpr;
  mainCanvas.height = Math.max(10, mRect.height) * mDpr;
  mCtx.resetTransform();
  mCtx.scale(mDpr, mDpr);

  const hRect = hrCanvas.parentElement.getBoundingClientRect();
  hrCanvas.width = Math.max(10, hRect.width) * dpr;
  hrCanvas.height = Math.max(10, hRect.height) * dpr;
  hCtx.resetTransform();
  hCtx.scale(dpr, dpr);

  const pRect = planckCanvas.parentElement.getBoundingClientRect();
  planckCanvas.width = Math.max(10, pRect.width) * dpr;
  planckCanvas.height = Math.max(10, pRect.height) * dpr;
  pCtx.resetTransform();
  pCtx.scale(dpr, dpr);

  const sRect = spectrumCanvas.parentElement.getBoundingClientRect();
  spectrumCanvas.width = Math.max(10, sRect.width) * dpr;
  spectrumCanvas.height = Math.max(10, sRect.height) * dpr;
  sCtx.resetTransform();
  sCtx.scale(dpr, dpr);

  const cRect = curvesCanvas.parentElement.getBoundingClientRect();
  curvesCanvas.width = Math.max(10, cRect.width) * dpr;
  curvesCanvas.height = Math.max(10, cRect.height) * dpr;
  cCtx.resetTransform();
  cCtx.scale(dpr, dpr);
}

// Подписки на события (выполнялись при загрузке страницы)
export function initCanvas() {
  window.addEventListener('resize', resizeCanvases);
  setPerfListener(resizeCanvases);
}
