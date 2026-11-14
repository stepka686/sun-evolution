// Режим «Формулы»: для каждой величины на экране — формула, подстановка текущих чисел и результат.
// Всё считается теми же функциями, что и симуляция (никаких отдельных «объяснительных» копий физики),
// поэтому value каждой формулы совпадает с числом на экране — это проверяется тестами.
import { S } from '../state.js';
import { T_SUN_EFF } from '../physics/stellar.js';
import { HZ_COEFFS, habitableZone } from '../physics/habitability.js';
import { getPlanetClimate } from '../physics/climate.js';
import { S_EARTH, SIGMA, OLR_LIM, B_OLR, A_OLR_CALIBRATED, KAPPA_THICK, THIN_CALIB, greenhouseForcing, iceAlbedo, outgoingLongwave, effectiveTemp } from '../physics/energyBalance.js';
import { BASE_AU, getPlanetOrbit, getPlanetDistanceAU } from '../physics/orbits.js';
import { PLANET_MASS_EARTH, EXO_TYPE_MASS_EARTH, tidalDecayRate, starStateAt } from '../physics/tides.js';
import { FEH_GRID, MIST_TRACKS, formatFeH, metalFraction } from './mistTracks.js';
import { getCustomExo, getPlanetDisplayName } from './exoplanets.js';

export const FORMULA_TABS = [
  ['age', 'Возраст'], ['radius', 'Радиус'], ['lum', 'Светимость'], ['temp', 'Температура'],
  ['mass', 'Плотность'], ['hz', 'Зона жизни'], ['climate', 'Климат планеты'], ['orbit', 'Орбита планеты']
];

const L_SUN_W = 3.828e26;   // номинальная светимость Солнца (IAU 2015), Вт
const R_SUN_KM = 695700;    // номинальный радиус Солнца (IAU 2015), км
const WIEN_NM = 2.8978e6;   // постоянная Вина, нм·K

// ---------- форматирование чисел ----------
const SUPS = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map(c => SUPS[c] ?? c).join('');
export function num(x, d = 3) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -2 && e < 5) return String(Number(x.toPrecision(d))).replace('-', '−');
  const m = x / Math.pow(10, e);
  return `${m.toFixed(d - 1).replace('-', '−')}×10${sup(e)}`;
}
const fixed = (x, d) => x.toFixed(d).replace('-', '−');
const signed = (x, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;

// ---------- 1. Возраст: трек звезды и подгонка по наблюдениям ----------
function ageFormula(st) {
  const steps = [];
  const sun = S.selectedStarId === 'sun';
  const mist = st.source === 'MIST' || (S.currentDynamicStages && S.currentDynamicStages.some(s => s.source === 'MIST'));
  if (sun) {
    steps.push({ label: 'Трек', eq: 'Собственный трек Солнца, откалиброванный по реальному Солнцу', sub: 'Sackmann et al. 1993; Schröder & Smith 2008. Сейчас: 4.57 млрд лет, L = 1, R = 1, T = 5772 K' });
  } else if (mist) {
    const tr = MIST_TRACKS.tracks;
    const m = Math.max(tr[0].m, Math.min(tr[tr.length - 1].m, S.selectedStarMass));
    let i = 0; while (i < tr.length - 2 && tr[i + 1].m <= m) i++;
    const m1 = tr[i].m, m2 = tr[i + 1].m;
    const wM = (Math.log10(m) - Math.log10(m1)) / (Math.log10(m2) - Math.log10(m1));
    const f = Math.max(FEH_GRID[0], Math.min(FEH_GRID[FEH_GRID.length - 1], S.selectedFeH || 0));
    let j = 0; while (j < FEH_GRID.length - 2 && FEH_GRID[j + 1] <= f) j++;
    const f1 = FEH_GRID[j], f2 = FEH_GRID[j + 1], wZ = (f - f1) / (f2 - f1);
    steps.push({ label: 'Трек MIST', eq: 'X(M, [Fe/H]) — линейная интерполяция при одинаковой фазе (EEP)', sub: 'по lg M между соседними массами сетки, затем по [Fe/H] между соседними сетками; X = lg t, lg L, lg T, lg R, состав ядра' });
    steps.push({ label: 'Вес по массе', eq: 'w<sub>M</sub> = (lg M − lg M₁) / (lg M₂ − lg M₁)', sub: `= (lg ${num(m)} − lg ${num(m1)}) / (lg ${num(m2)} − lg ${num(m1)}) = ${fixed(wM, 3)}` });
    steps.push({ label: 'Вес по металличности', eq: 'w<sub>Z</sub> = ([Fe/H] − f₁) / (f₂ − f₁)', sub: `= (${formatFeH(f)} − (${formatFeH(f1)})) / (${formatFeH(f2)} − (${formatFeH(f1)})) = ${fixed(wZ, 3)}` });
  } else {
    steps.push({ label: 'Трек', eq: 'Аналитическая модель (коричневые карлики и особые объекты)', sub: 'MIST начинается с 0.1 M☉; ниже — остывание по закону Бэрроуза' });
  }
  const fit = S.lastAgeFit;
  const star = S.currentStarObs;
  if (fit && star) {
    const dT = Math.log10(st.temp) - Math.log10(star.T), dL = Math.log10(Math.max(1e-12, st.l)) - Math.log10(star.L);
    steps.push({ label: 'Подгонка возраста', eq: 'χ² = (Δ lg T / 0.01)² + (Δ lg L / 0.05)² → min по t', sub: `наблюдения: T = ${Math.round(star.T)} K, L = ${num(star.L)} L☉; при t = ${fixed(fit.t, 2)} млрд лет χ² = ${num(fit.chi2, 2)}` + (Math.abs(st.t - fit.t) < 1e-6 ? ` (сейчас: Δlg T = ${signed(dT, 3)}, Δlg L = ${signed(dL, 3)})` : '') });
    steps.push({ label: 'Источник возраста', eq: fit.source === 'literature' ? 'Литературный возраст: в пределах Δχ² < 2.3 (1σ по двум параметрам) от минимума' : 'Минимум χ² по треку', sub: '' });
  }
  return {
    title: 'Возраст и эволюционный трек', value: st.t,
    result: `t = ${st.t < 0.01 ? num(st.t * 1000) + ' млн' : fixed(st.t, 3) + ' млрд'} лет • ${st.name}`,
    steps, note: 'Возраст отсчитывается от начала главной последовательности (ZAMS). Ползунок двигает t, а R, L, T, масса и состав берутся из трека.',
    refs: 'Choi et al. 2016; Dotter 2016 (MIST v1.2)'
  };
}

// ---------- 2–4. Закон Стефана — Больцмана в трёх видах ----------
function radiusFormula(st) {
  const r = Math.sqrt(st.l) * Math.pow(T_SUN_EFF / st.temp, 2);
  return {
    title: 'Радиус звезды', value: r,
    result: `R = ${num(r, 4)} R☉ = ${num(r * R_SUN_KM)} км = ${num(r / 215.03)} а.е.`,
    steps: [
      { label: 'Закон Стефана — Больцмана', eq: 'L = 4πR²σT⁴ ⇒ R/R☉ = √(L/L☉) · (T☉/T)²', sub: `= √${num(st.l)} · (${T_SUN_EFF} / ${Math.round(st.temp)})² = ${num(Math.sqrt(st.l))} · ${num(Math.pow(T_SUN_EFF / st.temp, 2))} = ${num(r, 4)}` },
      { label: 'В километрах', eq: 'R = (R/R☉) · 695 700 км', sub: `= ${num(r, 4)} · 695 700 = ${num(r * R_SUN_KM)} км` }
    ],
    note: 'Радиус — не независимый параметр: трек даёт L и T, а R обязан им соответствовать. Тесты проверяют это на всех стадиях для десятков масс.',
    refs: 'σ = 5.670×10⁻⁸ Вт/(м²·K⁴); T☉ = 5772 K, R☉ = 695 700 км (IAU 2015)'
  };
}

function lumFormula(st) {
  const l = st.r * st.r * Math.pow(st.temp / T_SUN_EFF, 4);
  const mbol = 4.74 - 2.5 * Math.log10(Math.max(1e-12, st.l));
  return {
    title: 'Светимость звезды', value: l,
    result: `L = ${num(l, 4)} L☉ = ${num(l * L_SUN_W)} Вт`,
    steps: [
      { label: 'Закон Стефана — Больцмана', eq: 'L = 4πR²σT⁴ ⇒ L/L☉ = (R/R☉)² · (T/T☉)⁴', sub: `= ${num(st.r, 4)}² · (${Math.round(st.temp)} / ${T_SUN_EFF})⁴ = ${num(st.r * st.r)} · ${num(Math.pow(st.temp / T_SUN_EFF, 4))} = ${num(l, 4)}` },
      { label: 'В ваттах', eq: 'L = (L/L☉) · 3.828×10²⁶ Вт', sub: `= ${num(l * L_SUN_W)} Вт` },
      { label: 'Болометрическая звёздная величина', eq: 'M<sub>bol</sub> = 4.74 − 2.5 lg(L/L☉)', sub: `= 4.74 − 2.5 · ${fixed(Math.log10(Math.max(1e-12, st.l)), 3)} = ${signed(mbol, 2)}` }
    ],
    note: 'Удвоение температуры при том же радиусе даёт рост светимости в 16 раз — отсюда огромный разброс светимостей звёзд.',
    refs: 'L☉ = 3.828×10²⁶ Вт (IAU 2015)'
  };
}

function tempFormula(st) {
  const T = T_SUN_EFF * Math.pow(st.l / (st.r * st.r), 0.25);
  return {
    title: 'Эффективная температура', value: T,
    result: `T = ${Math.round(T)} K • максимум излучения ${num(WIEN_NM / T)} нм`,
    steps: [
      { label: 'Закон Стефана — Больцмана', eq: 'T = T☉ · (L/L☉ ÷ (R/R☉)²)<sup>¼</sup>', sub: `= ${T_SUN_EFF} · (${num(st.l)} / ${num(st.r * st.r)})<sup>¼</sup> = ${Math.round(T)} K` },
      { label: 'Закон смещения Вина', eq: 'λ<sub>max</sub> = b / T, b = 2.898×10⁶ нм·K', sub: `= 2.898×10⁶ / ${Math.round(T)} = ${num(WIEN_NM / T)} нм` }
    ],
    note: 'Эффективная температура — температура абсолютно чёрного тела того же размера и светимости. По ней (и по светимости) определяется спектральный класс.',
    refs: 'Вин (1893); класс MK — по таблицам Pecaut & Mamajek 2013'
  };
}

function massFormula(st) {
  const rho = 1.408 * st.mass / Math.pow(Math.max(1e-5, st.r), 3);
  const logg = 4.438 + Math.log10(st.mass) - 2 * Math.log10(Math.max(1e-9, st.r));
  const f = S.selectedFeH || 0;
  return {
    title: 'Плотность, гравитация и металличность', value: rho,
    result: `ρ̄ = ${num(rho)} г/см³ • lg g = ${fixed(logg, 2)} • [Fe/H] = ${formatFeH(f)}`,
    steps: [
      { label: 'Средняя плотность', eq: 'ρ̄ = 3M / (4πR³) = 1.408 г/см³ · (M/M☉) / (R/R☉)³', sub: `= 1.408 · ${num(st.mass)} / ${num(st.r, 4)}³ = ${num(rho)} г/см³` },
      { label: 'Ускорение свободного падения', eq: 'lg g = 4.438 + lg(M/M☉) − 2 lg(R/R☉)  [g в см/с²]', sub: `= 4.438 + ${fixed(Math.log10(st.mass), 3)} − 2 · ${fixed(Math.log10(Math.max(1e-9, st.r)), 3)} = ${fixed(logg, 2)}` },
      { label: 'Металличность', eq: 'Z = Z☉ · 10<sup>[Fe/H]</sup>, Z☉ = 0.0142', sub: `= 0.0142 · 10<sup>${formatFeH(f)}</sup> = ${num(metalFraction(f))} — доля массы в элементах тяжелее гелия` }
    ],
    note: 'Меньше металлов — меньше непрозрачность вещества: звезда той же массы горячее, ярче и быстрее сжигает водород.',
    refs: 'Asplund et al. 2009 (Z☉); Choi et al. 2016'
  };
}

// ---------- 5. Зона жизни ----------
function hzFormula(st) {
  const Tc = Math.max(2600, Math.min(7200, st.temp));
  const Ts = Tc - 5780;
  const seff = (c) => c[0] + c[1] * Ts + c[2] * Ts * Ts + c[3] * Ts ** 3 + c[4] * Ts ** 4;
  const si = seff(HZ_COEFFS.inner), so = seff(HZ_COEFFS.outer);
  const hz = habitableZone(st.l, st.temp);
  return {
    title: 'Зона жизни (Kopparapu 2013)', value: hz,
    result: `${fixed(hz.inner, 3)} – ${fixed(hz.outer, 3)} а.е.`,
    steps: [
      { label: 'Поправка на цвет звезды', eq: 'T* = T<sub>eff</sub> − 5780 K' + (Tc !== st.temp ? ' (T ограничена 2600–7200 K — область калибровки)' : ''), sub: `= ${Math.round(Tc)} − 5780 = ${Math.round(Ts)} K` },
      { label: 'Пороговый поток', eq: 'S<sub>eff</sub> = S₀ + aT* + bT*² + cT*³ + dT*⁴', sub: `внутр. (убегающий парник): S₀ = ${HZ_COEFFS.inner[0]} → ${fixed(si, 3)} S⊕; внешн. (максимальный парник): S₀ = ${HZ_COEFFS.outer[0]} → ${fixed(so, 3)} S⊕` },
      { label: 'Расстояние', eq: 'd = √(L/L☉ ÷ S<sub>eff</sub>) а.е.', sub: `внутр. = √(${num(st.l)} / ${fixed(si, 3)}) = ${fixed(hz.inner, 3)}; внешн. = √(${num(st.l)} / ${fixed(so, 3)}) = ${fixed(hz.outer, 3)}` }
    ],
    note: 'Красный свет хуже отражается облаками и рэлеевским рассеянием, поэтому у холодных звёзд S_eff ниже. Климат конкретной планеты считается отдельно — вкладка «Климат планеты».',
    refs: 'Kopparapu et al. 2013, 2013b'
  };
}

// ---------- 6. Климат выбранной планеты ----------
function climateFormula(st) {
  const planet = S.currentPlanet || 'earth';
  const name = getPlanetDisplayName(planet);
  const c = getPlanetClimate(planet, st);
  const a = getPlanetDistanceAU(planet, st);
  if (!c || st.r / 215.0 >= a) {
    return { title: `Климат: ${name}`, value: null, result: 'Планеты на орбите нет', steps: [], note: 'Планета поглощена, уничтожена или выброшена — см. вкладку «Орбита планеты».', refs: '' };
  }
  const steps = [{ label: 'Поток излучения звезды', eq: 'S = S⊕ · (L/L☉) / (a / 1 а.е.)², S⊕ = 1361 Вт/м²', sub: `= 1361 · ${num(st.l, 4)} / ${num(a, 4)}² = ${num(c.S, 4)} Вт/м² (${num(c.S / S_EARTH)} S⊕)` }];
  const at = c.atmo;
  const K = 273.15;
  let note = '';
  if (at.regime === 'wet') {
    const warm = at.warmAlbedo ?? 0.30;
    const dF = greenhouseForcing(at);
    const pCO2 = at.co2ppm * 1e-6 * at.pBar;
    steps.push({ label: 'Парниковый форсинг', eq: 'ΔF = 5.35 ln(p<sub>CO₂</sub> / 420 мкбар) + ΔF<sub>CH₄</sub> + 6 ln(p / 1 бар)', sub: `p<sub>CO₂</sub> = ${num(at.co2ppm)} ppm · ${num(at.pBar)} бар = ${num(pCO2 * 1e6)} мкбар; CH₄ = ${num(at.ch4ppm ?? 0)} ppm ⇒ ΔF = ${signed(dF, 1)} Вт/м²` });
    if (c.climate === 'runaway') {
      const asr = (c.S / 4) * (1 - warm);
      steps.push({ label: 'Убегающий парник', eq: 'S/4 · (1 − α<sub>тёпл</sub>) ≥ 282 Вт/м² — океан не может излучить столько тепла', sub: `${num(c.S)} / 4 · (1 − ${warm}) = ${num(asr)} Вт/м² ≥ 282 ⇒ равновесия нет, океаны выкипают` });
      note = 'Предел 282 Вт/м²: насыщенный водяным паром воздух непрозрачен в ИК, и излучение уходит с фиксированной высоты, не завися от температуры поверхности (Goldblatt et al. 2013).';
    } else {
      const T = c.T, alb = iceAlbedo(T, warm), asr = (c.S / 4) * (1 - alb), olr = outgoingLongwave(T, dF);
      steps.push({ label: 'Альбедо (лёд ↔ вода)', eq: 'α(T) = 0.62 − (0.62 − α<sub>тёпл</sub>) · ½[1 + th((T − 258 K) / 12 K)]', sub: `при T = ${fixed(T, 1)} K: α = ${fixed(alb, 3)}` });
      steps.push({ label: 'Энергобаланс (Будыко — Селлерс)', eq: 'S/4 · (1 − α(T)) = OLR(T) = min<sub>мягк</sub>(A + B(T − 273 K) − ΔF, 282)', sub: `A = ${fixed(A_OLR_CALIBRATED, 1)}, B = ${B_OLR} Вт/(м²·K): поглощено ${num(asr, 4)} = излучено ${num(olr, 4)} Вт/м²` });
      note = c.climate === 'snowball'
        ? 'Устойчивого тёплого корня нет: планета в «снежке», лёд отражает 62% света и поддерживает сам себя.'
        : 'A подобрано так, чтобы современная Земля имела 15 °C; дальше модель не подгоняется. При малом потоке тёплый корень исчезает — ледово-альбедная катастрофа.';
    }
  } else if (at.regime === 'thick' || at.regime === 'thin') {
    const Te = effectiveTemp(c.S, at.albedo);
    let tau, tauSub;
    if (at.regime === 'thick') { tau = KAPPA_THICK * at.pBar * at.pBar; tauSub = `τ = κp² = ${KAPPA_THICK} · ${num(at.pBar)}² = ${num(tau)} (κ откалибрована по Венере: 92 бар → 464 °C)`; }
    else { const cal = THIN_CALIB[at.calib]; tau = cal.tau0 * Math.sqrt(at.pBar / cal.p0); tauSub = `τ = τ₀√(p/p₀) = ${cal.tau0} · √(${num(at.pBar)} / ${cal.p0}) = ${num(tau)}`; }
    steps.push({ label: 'Эффективная температура', eq: 'σT<sub>e</sub>⁴ = S/4 · (1 − α)', sub: `T<sub>e</sub> = (${num(c.S)} / 4 · (1 − ${at.albedo}) / σ)<sup>¼</sup> = ${fixed(Te, 1)} K` });
    steps.push({ label: 'Оптическая толщина', eq: at.regime === 'thick' ? 'τ ∝ p² (поглощение растёт и с количеством газа, и с давлением)' : 'τ ∝ √p (разреженная сухая атмосфера)', sub: tauSub });
    steps.push({ label: 'Серая атмосфера', eq: 'T<sub>s</sub> = T<sub>e</sub> · (1 + ¾τ)<sup>¼</sup>', sub: `= ${fixed(Te, 1)} · (1 + 0.75 · ${num(tau)})<sup>¼</sup> = ${fixed(c.T, 1)} K` });
    note = 'Серое приближение Эддингтона: атмосфера одинаково поглощает на всех длинах волн ИК.';
  } else if (at.regime === 'icy') {
    steps.push({ label: 'Ледяное тело', eq: 'σT⁴ = S/4 · (1 − α(T)), α(T): лёд ↔ талая поверхность', sub: `итерации сходятся к T = ${fixed(c.T, 1)} K, α = ${fixed(iceAlbedo(c.T, at.warm, at.ice), 3)}` });
  } else {
    const Te = effectiveTemp(c.S, at.albedo);
    steps.push({ label: 'Без атмосферы', eq: 'σT⁴ = S/4 · (1 − α)', sub: `T = (${num(c.S)} / 4 · (1 − ${at.albedo}) / σ)<sup>¼</sup> = ${fixed(Math.max(2.75, Te), 1)} K` });
    note = 'Средняя по сфере температура; ниже 2.7 K (реликтовое излучение) тело не остывает.';
  }
  return {
    title: `Климат: ${name}`, value: c.T,
    result: `T = ${fixed(c.T, 1)} K = ${signed(c.T - K, 0)} °C`,
    steps, note: note + (S.currentPlanet === 'earth' && S.selectedStarId === 'sun' ? ' Состав атмосферы Земли по эпохам — входные данные из литературы; температура — выход модели.' : ''),
    refs: 'Budyko 1969; Sellers 1969; Myhre et al. 1998 (форсинг CO₂); Goldblatt et al. 2013'
  };
}

// ---------- 7. Орбита выбранной планеты ----------
function orbitFormula(st) {
  const planet = S.currentPlanet || 'earth';
  const name = getPlanetDisplayName(planet);
  const exo = getCustomExo(planet);
  const a0 = exo ? exo.baseDistAU : (BASE_AU[planet] || 39.48);
  const mp = exo ? (EXO_TYPE_MASS_EARTH[exo.type] || 1) : (PLANET_MASS_EARTH[planet] || 0.01);
  const orbit = getPlanetOrbit(planet);
  const a = getPlanetDistanceAU(planet, st);
  const stages = S.currentDynamicStages;
  const M0 = stages.find(s => s.t >= 0)?.mass ?? stages[0].mass;
  const aAd = a0 * M0 / st.mass;
  const star = starStateAt(stages, st.t);
  const gamma = a > 0 ? tidalDecayRate(a, star, mp, S.tideFactor) : 0;
  const steps = [
    { label: 'Уравнение эволюции орбиты', eq: 'd ln a / dt = −d ln M<sub>★</sub> / dt − γ<sub>прил</sub>', sub: 'первое слагаемое — расширение при потере массы звездой, второе — приливное торможение в конвективной оболочке' },
    { label: 'Без приливов (адиабатический инвариант)', eq: 'a · M<sub>★</sub> = const ⇒ a = a₀ · M₀ / M', sub: `= ${num(a0)} · ${num(M0)} / ${num(st.mass)} = ${num(aAd, 4)} а.е.` },
    { label: 'Прилив Зана (сейчас)', eq: 'γ = (f/τ<sub>c</sub>) · (M<sub>env</sub>/M) · q(1 + q) · (R/a)⁸', sub: gamma > 0 ? `γ = ${num(gamma)} 1/млрд лет (сила приливов ×${S.tideFactor}); (R/a)⁸ = ${num(Math.pow(st.r / 215.03 / a, 8))}` : 'γ ≈ 0: у звезды нет протяжённой конвективной оболочки, или она слишком мала по сравнению с орбитой' },
    { label: 'Численное интегрирование', eq: 'a(t) — интеграл по всему треку звезды', sub: a > 0 ? `a = ${num(a, 4)} а.е. (без приливов было бы ${num(aAd, 4)})` : 'планеты больше нет на орбите' }
  ];
  const f = orbit.fate;
  const fate = f.type === 'survived' ? 'выживает' : f.type === 'engulfed' ? `поглощена звездой при t = ${fixed(f.t, 3)} млрд лет` : f.type === 'blast' ? `уничтожена сверхновой при t = ${num(f.t)} млрд лет` : `выброшена из системы при t = ${num(f.t)} млрд лет`;
  return {
    title: `Орбита: ${name}`, value: a,
    result: a > 0 ? `a = ${num(a, 4)} а.е. • судьба: ${fate}` : `Судьба: ${fate}`,
    steps,
    note: 'Множитель (R/a)⁸ делает прилив ничтожным, пока звезда маленькая, и смертельным, когда она раздувается в гигант. Если звезда разом теряет больше половины массы (сверхновая), планета становится несвязанной.',
    refs: 'Zahn 1977; Villaver & Livio 2009; Schröder & Smith 2008'
  };
}

const BUILDERS = { age: ageFormula, radius: radiusFormula, lum: lumFormula, temp: tempFormula, mass: massFormula, hz: hzFormula, climate: climateFormula, orbit: orbitFormula };

export function buildFormula(key, state) {
  const b = BUILDERS[key] || BUILDERS.lum;
  return b(state);
}

// Безопасная HTML-разметка одной формулы для панели
export function renderFormulaHTML(f) {
  const steps = f.steps.map(s => `
    <div class="fx-step">
      <div class="fx-label">${s.label}</div>
      <div class="fx-eq">${s.eq}</div>
      ${s.sub ? `<div class="fx-sub">${s.sub}</div>` : ''}
    </div>`).join('');
  return `
    <div class="fx-title">${f.title}</div>
    ${steps}
    <div class="fx-result">${f.result}</div>
    ${f.note ? `<div class="fx-note">${f.note}</div>` : ''}
    ${f.refs ? `<div class="fx-refs">${f.refs}</div>` : ''}`;
}
