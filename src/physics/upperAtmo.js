// Верхняя атмосфера 5.3: полярные сияния и серебристые облака. Эталон на JS — шейдер gl/skyGL.js повторяет формулы.
//
// Полярное сияние — излучение линий, а не градиент. Электроны бури возбуждают атомы и молекулы на своих высотах:
//   • O(¹S) 557.7 нм — зелёная линия, максимум ~110 км, резкий нижний край (электроны глубже не проникают);
//   • O(¹D) 630.0 нм — красная, 200–300 км: время жизни уровня 110 с, ниже ~150 км его «тушат» столкновения;
//   • N₂⁺ 427.8 нм (1-я отрицательная система) — фиолетово-синяя, у нижнего края;
//   • N₂ 1PG (650–690 нм) — розово-малиновая кайма снизу в сильных сияниях (тип B).
// Профили — гауссовы полуширины снизу и сверху по данным ракетных и спутниковых измерений (Chamberlain 1961;
// Jones 1974; Kivelson & Russell 1995). Отношения: 557.7 : 427.8 ≈ 3 : 1, красная — 0.2 от зелёной (0.6 в бурю).
// Атомарный кислород верхней атмосферы — продукт фотодиссоциации O₂ и CO₂, поэтому зелёная линия есть и на Марсе
// (марсоход Perseverance увидел её в 2024 г.). В азотно-метановой атмосфере без кислорода остаются только линии N₂.
// Яркость — в рэлеях (столб). 1 R = 10¹⁰/4π фотонов·с⁻¹·м⁻²·ср⁻¹; для зелёной линии это 1.9·10⁻⁷ кд/м², так что
// сияние 10 кР — ~2·10⁻³ кд/м² (как освещённые Луной перистые облака), 100 кР — ярче неба при полной Луне.
// Перевод в единицы неба модели: π·L/E☉ (E☉ = 1.27·10⁵ лк — освещённость от Солнца у Земли; единицы сверены по
// зениту дневного неба). Спектральные каналы неба нормированы на планковский спектр, поэтому множитель для каждой
// линии свой: яркость в канале подбирается так, чтобы её светимость в модели совпала с фотометрической.
import { SKY_LAMBDA, spectrumToRGB } from './skyModel.js';

export const AURORA_LINES = [
  { id: 'O557', lambda: 557.7, peak: 110, hLow: 7, hUp: 28 },
  { id: 'O630', lambda: 630.0, peak: 230, hLow: 45, hUp: 80 },
  { id: 'N428', lambda: 427.8, peak: 106, hLow: 6, hUp: 22 },
  { id: 'N2red', lambda: 670.0, peak: 97, hLow: 4, hUp: 9 }
];
export const AIRGLOW_R = 250;
export const E_SUN_LX = 1.27e5;
const V = (l) => 1.019 * Math.exp(-285.4 * Math.pow(l / 1000 - 0.559, 2));     // CIE 1924, гауссово приближение
const lumY = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** Яркость (кд/м²) одного рэлея монохроматической линии */
export function rayleighLuminance(lambda) {
  const ePh = 6.626e-34 * 2.998e8 / (lambda * 1e-9);
  return 683 * V(lambda) * ePh * 1e10 / (4 * Math.PI);
}
/** Множитель «рэлей → значение спектрального канала» для линии, разложенной по весам w */
function binScale(lambda, w) {
  const target = Math.PI * rayleighLuminance(lambda) / E_SUN_LX;
  return target / Math.max(1e-300, lumY(spectrumToRGB(w)));
}
export const LINE_SCALE = Object.fromEntries(AURORA_LINES.map(l => [l.id, binScale(l.lambda, lineBins(l.lambda))]));
/** Свечение верхней атмосферы (250 R зелёной линии, кладётся в канал 570 нм) — значение канала для шейдера */
export function airglowBin() {
  const w = new Array(8).fill(0); w[4] = 1;
  return AIRGLOW_R * binScale(557.7, w);
}

/** Объёмная светимость линии на высоте hKm, нормированная так, что вертикальный столб = 1 (на км) */
export function lineProfile(line, hKm) {
  const s = hKm < line.peak ? line.hLow : line.hUp;
  const x = (hKm - line.peak) / s;
  return Math.exp(-x * x) / (0.886227 * (line.hLow + line.hUp));
}

/** Вклад монохроматической линии в 8 спектральных каналов неба (линейная интерполяция между центрами) */
export function lineBins(lambda) {
  const w = new Array(8).fill(0);
  if (lambda <= SKY_LAMBDA[0]) { w[0] = 1; return w; }
  if (lambda >= SKY_LAMBDA[7]) { w[7] = 1; return w; }
  for (let i = 0; i < 7; i++) {
    if (lambda <= SKY_LAMBDA[i + 1]) { const f = (lambda - SKY_LAMBDA[i]) / (SKY_LAMBDA[i + 1] - SKY_LAMBDA[i]); w[i] = 1 - f; w[i + 1] = f; return w; }
  }
  return w;
}

/**
 * Столбовые яркости линий (рэлеи) по силе сияния и составу.
 * strength 0…1 — от слабого сияния бури на 50° (~5 кР зелёной) до удара выброса корональной массы (~100 кР).
 */
export function auroraColumns(strength, { oxygen = true, storm = false } = {}) {
  // strength 0 — сияние, едва заметное глазом (~5 кР), 1 — сильнейшая буря (~100 кР, класс IBC III–IV)
  const g = 5e3 + 95e3 * Math.max(0, Math.min(1, strength));
  return {
    O557: oxygen ? g : 0,
    O630: oxygen ? g * (storm ? 0.6 : 0.2) : 0,
    N428: g * (oxygen ? 0.33 : 0.8),
    N2red: g * (storm ? 0.35 : 0.12) * (oxygen ? 1 : 1.6)
  };
}

/** Спектр (8 каналов, единицы неба) излучения столба высот h0…h1 при заданных столбовых яркостях — для тестов и 2D */
export function auroraSpectrum(cols, h0 = 80, h1 = 400, step = 1) {
  const L = new Array(8).fill(0);
  for (const line of AURORA_LINES) {
    const B = cols[line.id] || 0;
    if (!B) continue;
    let f = 0;
    for (let h = h0; h < h1; h += step) f += lineProfile(line, h + step / 2) * step;
    const w = lineBins(line.lambda);
    for (let i = 0; i < 8; i++) L[i] += B * LINE_SCALE[line.id] * f * w[i];
  }
  return L;
}

// Серебристые (мезосферные) облака: ледяные кристаллы ~50 нм на высоте ~83 км, у самой холодной в атмосфере
// летней мезопаузы (~130 K). Видны только в сумерках, когда звезда на 6–16° под горизонтом: наблюдатель уже в тени,
// а облака ещё освещены. На широте 50° — с конца мая по начало августа. Первое описание — 1885 г.; с ростом метана
// (окисляется до воды в мезосфере) их стало больше — в эпоху цивилизации они ярче и чаще (Thomas 1996).
// Частицы малы по сравнению с длиной волны: рассеяние почти рэлеевское (∝ λ⁻⁴), отсюда голубизна, а свет до них
// идёт по касательной сквозь озон, который съедает оранжевый, — «электрический» голубой цвет.
export const NLC_HEIGHT = 83, NLC_TAU = 2e-5;

/** Сила серебристых облаков 0…1: сезон (день года на широте 50° с.ш.) и эпоха. Только Земля с озоном и водой */
export function nlcStrength(dayOfYear, { earthLike = true, civilization = false } = {}) {
  if (!earthLike) return 0;
  // максимум около солнцестояния (день 172) с полушириной ~35 дней, вне сезона — ноль
  const d = ((dayOfYear - 172 + 182.6) % 365.25 + 365.25) % 365.25 - 182.6;
  const season = Math.exp(-0.5 * (d / 28) ** 2);
  return season < 0.05 ? 0 : season * (civilization ? 1 : 0.45);
}

/** Яркость серебристых облаков (8 каналов): свет звезды до облака Ts × τ(λ) × рэлеевская фаза / sin высоты */
export function nlcRadiance(F, Ts, cosG, sinElev, strength) {
  // фаза — в той же нормировке, что у неба в skySpectral (рэлеевская 0.75·(1 + cos²γ), без 1/4π)
  const pR = 0.75 * (1 + cosG * cosG);
  const air = 1 / Math.max(0.05, sinElev);
  return SKY_LAMBDA.map((l, i) => F[i] * Ts[i] * NLC_TAU * strength * Math.pow(550 / l, 4) * pR * air);
}
