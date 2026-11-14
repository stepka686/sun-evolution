// Геометрическая оптика капель и кристаллов: радуги, гало, цвет Луны в затмении.
// Углы — из закона Снеллиуса при минимуме отклонения (Декарт, 1637); дисперсия — из показателя преломления n(λ).

const D2R = Math.PI / 180;

// Показатель преломления как функция длины волны (нм).
// Вода: формула Коши, подогнанная к табличным 1.3441 (400 нм), 1.3339 (589 нм), 1.3313 (700 нм).
const water = (l) => 1.3247 + 3.3e3 / (l * l) - 3.2e7 / (l ** 4);
export const MEDIA = {
  water: { name: 'вода', n: water },
  ice: { name: 'лёд H₂O', n: (l) => water(l) - 0.0249 },                       // 1.309 на 589 нм
  methane: { name: 'жидкий метан', n: (l) => 1.2735 + 0.6 * (water(l) - 1.3339) },  // Badoz et al. 1992: ~1.27 при 111 K
  co2ice: { name: 'лёд CO₂', n: (l) => 1.405 + 0.8 * (water(l) - 1.3339) },       // Warren 1986: ~1.40
  sulfuric: { name: 'серная кислота 75 %', n: (l) => 1.430 + 1.1 * (water(l) - 1.3339) } // облака Венеры (Hansen & Hovenier 1974)
};

/**
 * Угловой радиус радуги (от антисолнечной точки), рад: k внутренних отражений в сферической капле.
 * Минимум отклонения при cos² i = (n² − 1) / (k² + 2k); D = 2(i − r) + k(π − 2r)
 */
export function bowRadius(n, k = 1) {
  const c2 = (n * n - 1) / (k * k + 2 * k);
  if (c2 >= 1) return null;
  const i = Math.acos(Math.sqrt(c2)), r = Math.asin(Math.sin(i) / n);
  const D = 2 * (i - r) + k * (Math.PI - 2 * r);
  const m = ((D % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.abs(Math.PI - m);
}

/** Радиус гало (от звезды), рад: минимум отклонения в призме с преломляющим углом A (60° — шестигранник льда) */
export function haloRadius(n, A = 60 * D2R) {
  const s = n * Math.sin(A / 2);
  return s >= 1 ? null : 2 * Math.asin(s) - A;
}

/** Ложное солнце (паргелий) на высоте h: кристаллы-пластинки, луч идёт наклонно — эффективный n' растёт */
export function parhelionOffset(n, h) {
  const c = Math.cos(h);
  const n2 = Math.sqrt(Math.max(0, n * n - Math.sin(h) ** 2)) / c;   // формула Браве
  const d = haloRadius(n2);
  if (d === null) return null;
  // d — отклонение проекции луча на горизонтальную плоскость, то есть разница азимутов звезды и паргелия
  return d;
}

export const BOW_WAVELENGTHS = [420, 450, 480, 505, 530, 555, 580, 600, 625, 650, 680];
