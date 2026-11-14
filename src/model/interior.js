// Внутреннее строение звезды по состоянию трека MIST: зоны переноса энергии, ядра и слоевые источники.
// Фаза определяется по составу в центре (X_c, Y_c, C/O) и радиусу; размеры зон — по известным соотношениям:
//   • полностью конвективные звёзды: M < 0.35 M☉ (Chabrier & Baraffe 1997)
//   • дно конвективной оболочки: r_cz/R ≈ 0.713 у Солнца (гелиосейсмология), глубже у холодных звёзд, тоньше у F-звёзд
//   • конвективное ядро у M > 1.3 M☉ (CNO-цикл сильно зависит от T — поток энергии слишком крутой для излучения)
//   • масса гелиевого ядра гиганта — из соотношения «ядро — светимость» (Refsdal & Weigert 1970): L ≈ 2.3·10⁵ M_c⁶
//   • радиус вырожденного ядра ~ радиус белого карлика той же массы: R ≈ 0.0126 R☉ · (M_c/0.6)^(−1/3)
// Сейсмология (солнцеподобные колебания, возбуждаемые конвекцией) — масштабные соотношения Kjeldsen & Bedding 1995:
//   ν_max = 3090 мкГц · (M/M☉)(R/R☉)⁻²(T/5777)^−½,   Δν = 135.1 мкГц · (M/M☉)^½ (R/R☉)^−3/2

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const T_SUN = 5777;

const C = {
  ppCore: '#fff59d', cnoCore: '#e0f2fe', rad: '#ffa726', conv: 'rgba(255, 60, 20, 0.42)', heCore: '#90a4ae',
  hShell: '#ffeb3b', heShell: '#00e676', coCore: '#546e7a', heBurn: '#fbbf24', cryst: '#bfdbfe', wdLiquid: '#93c5fd',
  envHe: 'rgba(147,197,253,0.55)', envH: 'rgba(224,242,254,0.4)'
};

/** Масса вырожденного ядра гиганта по светимости (Refsdal — Weigert), M☉ */
export const coreMassFromL = (L) => clamp(Math.pow(Math.max(1e-6, L) / 2.3e5, 1 / 6), 0.1, 0.55);
/** Радиус вырожденного ядра (как у белого карлика той же массы), R☉ */
export const degenerateRadius = (m) => 0.0126 * Math.pow(Math.max(0.05, m) / 0.6, -1 / 3);

/** Дно конвективной оболочки на главной последовательности, доля радиуса */
export function convectiveBase(Teff, M) {
  if (M < 0.35) return 0;
  return clamp(0.713 + (Teff - T_SUN) * 0.00025, 0.3, 0.97);
}

/** Солнцеподобные колебания: ν_max, Δν (мкГц) или null, если конвективной оболочки нет */
export function seismology(M, R, Teff) {
  if (!(R > 0) || Teff > 6800 || R < 0.05) return null;
  const numax = 3090 * M / (R * R) / Math.sqrt(Teff / T_SUN);
  const dnu = 135.1 * Math.sqrt(M) / Math.pow(R, 1.5);
  return { numax, dnu, periodMin: 1e6 / numax / 60 };
}

/**
 * Слои звезды от центра наружу: { name, r (доля радиуса, настоящая), color }; scale — показатель нелинейной шкалы радиуса
 * (у гигантов ядро в тысячи раз меньше звезды — без сжатия шкалы его не увидеть). Возвращает null для фаз вне модели.
 */
export function interiorLayers(state, M) {
  const R = state.r, Teff = state.temp, L = state.l;
  const Xc = state.h, Yc = state.he, CO = (state.c || 0) + (state.o || 0);
  if (!(R > 0)) return null;
  // белый карлик: вырожденный углеродно-кислородный шар; при остывании ядро кристаллизуется (Gaia, Tremblay et al. 2019)
  if (R < 0.05) {
    const f = clamp((-Math.log10(Math.max(1e-9, L)) - 2.8) / 2.2, 0, 0.92);
    const layers = [];
    if (f > 0.02) layers.push({ name: `Кристаллическое C/O ядро (${Math.round(f * 100)}% массы)`, r: Math.cbrt(f) * 0.96, color: C.cryst });
    layers.push({ name: 'Вырожденная жидкость C/O (электронный газ держит вес)', r: 0.96, color: C.wdLiquid });
    layers.push({ name: 'Гелиевая прослойка', r: 0.99, color: C.envHe });
    layers.push({ name: 'Водородная атмосфера (DA)', r: 1.0, color: C.envH });
    return { layers, scale: 1, phase: 'wd' };
  }
  // главная последовательность: в центре ещё горит водород
  if (Xc > 0.005) {
    const burn = `X_c = ${Xc.toFixed(2)}`;
    if (M < 0.35) return { phase: 'ms', scale: 1, layers: [
      { name: `Ядро: pp-цикл (${burn})`, r: 0.22, color: C.ppCore },
      { name: 'Звезда конвективна целиком: водород перемешивается до центра', r: 1.0, color: C.conv }] };
    const rcz = convectiveBase(Teff, M);
    if (M < 1.3) return { phase: 'ms', scale: 1, layers: [
      { name: `Ядро: pp-цикл (${burn})`, r: 0.25, color: C.ppCore },
      { name: 'Зона лучистого переноса (фотон идёт наружу ~10⁵ лет)', r: rcz, color: C.rad },
      { name: `Конвективная зона (с r = ${rcz.toFixed(2)} R)`, r: 1.0, color: C.conv }] };
    const rcc = clamp(0.1 + 0.05 * Math.sqrt(M - 1.3), 0.1, 0.3);
    const out = [
      { name: `Конвективное ядро: CNO-цикл (${burn})`, r: rcc, color: C.cnoCore },
      { name: 'Лучистая оболочка', r: M < 1.6 ? 0.96 : 1.0, color: '#60a5fa' }];
    if (M < 1.6) out.push({ name: 'Тонкая конвективная прослойка', r: 1.0, color: C.conv });
    return { phase: 'ms', scale: 1, layers: out };
  }
  // ядро из углерода и кислорода (после горения гелия): АВГ — два слоевых источника и тепловые импульсы
  if (CO > 0.5 && Yc < 0.3) {
    const mc = clamp(0.5 + 0.1 * Math.log10(Math.max(1, L / 3000)), 0.5, 1.1);
    const rc = degenerateRadius(mc) / R;
    return { phase: 'agb', scale: 0.33, layers: [
      { name: `Вырожденное C/O ядро ≈ ${mc.toFixed(2)} M☉`, r: rc, color: C.coCore },
      { name: 'Слой горения He → C, O (тепловые импульсы)', r: rc * 1.6, color: C.heShell },
      { name: 'Слой горения H → He', r: rc * 2.4, color: C.hShell },
      { name: 'Лучистая прослойка', r: rc * 8, color: C.rad },
      { name: 'Гигантская конвективная оболочка (вынос углерода к поверхности)', r: 1.0, color: C.conv }] };
  }
  // горение гелия в ядре (красное сгущение / горизонтальная ветвь)
  if (CO > 0.05 || (Yc < 0.95 && Xc <= 0.005 && R < 20)) {
    const rc = clamp(0.035 / R, 0.002, 0.3);
    return { phase: 'cheb', scale: 0.4, layers: [
      { name: `Конвективное ядро: горение He → C, O (C+O = ${Math.round(CO * 100)}%)`, r: rc, color: C.heBurn },
      { name: 'Гелиевая прослойка', r: rc * 2.2, color: C.heCore },
      { name: 'Слой горения H → He', r: rc * 3, color: C.hShell },
      { name: 'Лучистая зона', r: rc * 12, color: C.rad },
      { name: 'Конвективная оболочка', r: 1.0, color: C.conv }] };
  }
  // субгигант / красный гигант: инертное вырожденное гелиевое ядро и слоевой источник
  const mc = M < 2.2 ? coreMassFromL(L) : clamp(0.1 * M, 0.1, 0.8);
  const rcore = (M < 2.2 ? degenerateRadius(mc) : 0.05) / R;
  const rce = R > 3 ? clamp(rcore * 15, 0.03, 0.4) : clamp(0.713 - 0.1 * (R - 1), 0.2, 0.7);
  return { phase: 'rgb', scale: R > 3 ? 0.35 : 0.6, layers: [
    { name: `${M < 2.2 ? 'Вырожденное' : 'Инертное'} гелиевое ядро ≈ ${mc.toFixed(2)} M☉`, r: rcore, color: C.heCore },
    { name: 'Слоевой источник H → He', r: rcore * 1.5, color: C.hShell },
    { name: 'Лучистая зона', r: rce, color: C.rad },
    { name: `Конвективная оболочка${R > 3 ? ' (≈ 70% массы звезды)' : ''}`, r: 1.0, color: C.conv }] };
}
