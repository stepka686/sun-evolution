// Лупа режима «Камера» (5.3.1): диск звезды рядом с эталоном — Солнцем с Земли (0.53°) в одном масштабе.
// Чистые функции без DOM — их проверяют тесты.

export const SUN_FROM_EARTH = 0.2666 * Math.PI / 180;      // угловой радиус Солнца с Земли, рад (диаметр 0.533°)

/** Масштаб лупы: больший из двух дисков вписывается в maxPx; возвращает радиусы в пикселях и увеличение */
export function loupeScale(starAngR, refAngR = SUN_FROM_EARTH, maxPx = 40, pxPerRadMain = 1) {
  const big = Math.max(starAngR, refAngR, 1e-12);
  const k = maxPx / big;
  return { k, rStar: starAngR * k, rRef: refAngR * k, zoom: k / pxPerRadMain };
}

/** Угол (диаметр по радиусу в рад) — в градусах, минутах или секундах дуги */
export function fmtAngle(radiusRad) {
  const d = 2 * radiusRad * 180 / Math.PI;
  if (d >= 1) return `${d.toFixed(d < 10 ? 2 : 1)}°`;
  if (d * 60 >= 1) return `${(d * 60).toFixed(1)}′`;
  if (d * 3600 >= 0.01) return `${(d * 3600).toFixed(d * 3600 < 1 ? 2 : 1)}″`;
  return `${(d * 3600 * 1000).toPrecision(2)} мс дуги`;
}
