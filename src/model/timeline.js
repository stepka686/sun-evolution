// Шкала времени, глубокое время, интерполяция состояния звезды
import { DEEP_TIME_STAGES } from '../data/stages.js';
import { habitableZone } from '../physics/habitability.js';
import { T_SUN_EFF, lumFromRT, wdCoolingAgeAtTemp, wdTempAtCoolingAge } from '../physics/stellar.js';
import { S } from '../state.js';
import { lerp, lerpColor } from '../util/math.js';

export function getActiveStages() {
  if (S.isDeepTime) return S.currentDeepStages || DEEP_TIME_STAGES;
  return S.currentDynamicStages;
}

export function buildDeepTimeStages() {
  const base = S.currentDynamicStages;
  const last = base[base.length - 1];
  // Только для звёзд, оставляющих белый карлик
  if (!(last.r < 0.05 && last.r > 0.001 && last.temp > 1000)) return null;

  const tau0 = wdCoolingAgeAtTemp(last.temp);
  const fade = (c, k) => c.map(v => Math.round(v * k));
  const plan = [
    { tau: tau0, k: 1.0, name: "Остывающий белый карлик", spec: "Белый карлик • DA",
      desc: "Ядро не горит: звезда излучает запас тепла вырожденного вещества." },
    { tau: 5, k: 0.6, name: "Кристаллизация ядра", spec: "Остывающий карлик • DC",
      desc: "При T_eff ≈ 6000–5000 K ионы C/O в ядре выстраиваются в кристаллическую решётку (подтверждено Gaia, 2019). Скрытая теплота замедляет остывание." },
    { tau: 50, k: 0.3, name: "Инфракрасный карлик", spec: "Угасающий карлик",
      desc: "Такие холодные белые карлики ещё не существуют: Вселенной всего 13.8 млрд лет." },
    { tau: 1000, k: 0.12, name: "Тёмный карлик (~1 трлн лет)", spec: "Угасающий карлик",
      desc: "Звезда светит лишь в далёком инфракрасном диапазоне, видимого света почти нет." },
    { tau: 10000, k: 0.04, name: "На пути к чёрному карлику (~10 трлн лет)", spec: "Почти чёрный карлик",
      desc: "Около 350 K. До полного остывания до нескольких K нужно ~10¹⁵ лет — ни одного чёрного карлика во Вселенной пока нет." }
  ].filter((p, i) => i === 0 || p.tau > tau0 * 1.5);

  return plan.map(p => {
    const temp = Math.round(wdTempAtCoolingAge(p.tau));
    const st = { ...last };
    for (const key of Object.keys(last)) {
      if (/(Sky|Ground)$/.test(key)) st[key] = /Sky$/.test(key) ? fade(last[key], p.k) : fade(last[key], Math.max(0.3, p.k));
    }
    return {
      ...st,
      t: Number((last.t + (p.tau - tau0)).toPrecision(6)),
      temp: temp,
      l: lumFromRT(last.r, temp),
      name: p.name, desc: p.desc, spec: p.spec
    };
  });
}

export function getTimeBounds() {
  if (S.isDeepTime) {
    const ds = S.currentDeepStages || DEEP_TIME_STAGES;
    return { min: ds[0].t, max: ds[ds.length - 1].t, step: 1.0 };
  }
  const list = S.currentDynamicStages;
  const minT = list[0].t;
  const maxT = list[list.length - 1].t;
  const span = maxT - minT;
  const step = span > 50 ? 0.1 : (span > 5 ? 0.005 : (span > 0.05 ? 0.0001 : 0.000005));
  return { min: minT, max: maxT, step: step };
}

// opts.static = true — без визуальных пульсаций (для расчётов: подбор возраста, тесты)
export function getInterpolatedState(age, opts = {}) {
      const list = getActiveStages();
      const minT = list[0].t;
      const maxT = list[list.length - 1].t;
      const clampedAge = Math.max(minT, Math.min(maxT, Number(age) || 0));
      let i = 0;
      while (i < list.length - 2 && list[i + 1].t <= clampedAge) i++;

      const s0 = list[i];
      const s1 = list[i + 1];
      const span = s1.t - s0.t;
      // В глубоком времени стадии разнесены по логарифму возраста остывания — интерполируем по log(τ)
      let factor;
      if (S.isDeepTime && span > 0) {
        const t0 = list[0].t - wdCoolingAgeAtTemp(list[0].temp); // момент рождения карлика
        const a0 = Math.log10(Math.max(1e-3, s0.t - t0)), a1 = Math.log10(Math.max(1e-3, s1.t - t0));
        const a = Math.log10(Math.max(1e-3, clampedAge - t0));
        factor = a1 > a0 ? Math.max(0, Math.min(1, (a - a0) / (a1 - a0))) : 0;
      } else {
        factor = span > 0 ? Math.max(0, Math.min(1, (clampedAge - s0.t) / span)) : 0;
      }

            const logR = lerp(Math.log10(s0.r), Math.log10(s1.r), factor);
      const logL = lerp(Math.log10(Math.max(1e-12, s0.l)), Math.log10(Math.max(1e-12, s1.l)), factor);
      const tempLin = lerp(s0.temp, s1.temp, factor);
      const sbOK = !s0.noSB && !s1.noSB && s0.l > 0 && s1.l > 0;
      // Невозмущённая температура (без пульсаций) — для зоны жизни и выбора пульсирующих звёзд
      const temp0 = sbOK ? T_SUN_EFF * Math.pow(Math.pow(10, logL - 2 * logR), 0.25) : tempLin;
      const mass = Math.max(0.1, lerp(s0.mass, s1.mass, factor));

      let pulseR = 1.0;
      let pulseL = 1.0;
      let pulseWaveActive = false;
      let pulseWavePhase = 0;

      // Окно термических пульсаций AGB берётся из ключевых моментов трека
      const marks = getTrackMarks();
      const agbStartT = marks.agbStart, agbEndT = marks.agbEnd;

      if (opts.static) {
        // без пульсаций
      } else if (!S.isDeepTime && agbStartT !== undefined && clampedAge >= agbStartT && clampedAge <= agbEndT) {
        // Моделирование 4 мощных термических импульсов гелиевого слоя
        const agbProgress = (clampedAge - agbStartT) / (agbEndT - agbStartT);
        const cycle = agbProgress * 4.0;
        const phaseInCycle = cycle - Math.floor(cycle);
        
        const pulseShape = Math.exp(-phaseInCycle * 4.5) * Math.sin(phaseInCycle * Math.PI);
        pulseR = 1.0 + pulseShape * (0.28 + agbProgress * 0.15);
        pulseL = 1.0 + pulseShape * (0.85 + agbProgress * 0.40);
        pulseWaveActive = true;
        pulseWavePhase = phaseInCycle;
      } else if (S.selectedStarId === 'polaris' || S.selectedStarId === 'mira' || (S.selectedStarMass >= 8.0 && S.selectedStarMass < 20.0 && temp0 >= 5000 && temp0 <= 7500)) {
        // Регулярные радиальные пульсации Цефеид (Каппа-механизм) и переменных типа Миры
        const cephWave = Math.sin(performance.now() * 0.0045);
        const amp = S.selectedStarId === 'mira' ? 0.22 : 0.12;
        pulseR = 1.0 + cephWave * amp;
        pulseL = 1.0 + cephWave * (amp * 1.8);
      }
      const l = Math.pow(10, logL) * pulseL;
      const r = Math.pow(10, logR) * pulseR;
      // Температура — из закона Стефана — Больцмана (между согласованными узлами это линейная интерполяция lg T);
      // у пульсирующих звёзд она растёт в максимуме блеска, как у настоящих цефеид
      const temp = sbOK ? T_SUN_EFF * Math.pow(l / (r * r), 0.25) : tempLin;


      return {
        t: clampedAge,
        r: r,
        l: l,
        temp: temp,
        mass: mass,
        h: Math.max(0, Math.min(1, lerp(s0.h, s1.h, factor))),
        he: Math.max(0, Math.min(1, lerp(s0.he, s1.he, factor))),
        c: Math.max(0, Math.min(1, lerp(s0.c, s1.c, factor))),
        o: Math.max(0, Math.min(1, lerp(s0.o, s1.o, factor))),
               spec: factor < 0.5 ? s0.spec : s1.spec,
        name: factor < 0.5 ? s0.name : s1.name,
        desc: factor < 0.5 ? s0.desc : s1.desc,
        pulseActive: pulseWaveActive,
        pulsePhase: pulseWavePhase,
        // Зона жизни считается по невозмущённой светимости (без пульсаций) и с учётом T_eff звезды
        hzIn: habitableZone(Math.pow(10, logL), temp0).inner,
        hzOut: habitableZone(Math.pow(10, logL), temp0).outer,
        mercurySky: lerpColor(s0.mercurySky, s1.mercurySky, factor),
        mercuryGround: lerpColor(s0.mercuryGround, s1.mercuryGround, factor),
        venusSky: lerpColor(s0.venusSky, s1.venusSky, factor),
        venusGround: lerpColor(s0.venusGround, s1.venusGround, factor),
        earthSky: lerpColor(s0.earthSky, s1.earthSky, factor),
        earthGround: lerpColor(s0.earthGround, s1.earthGround, factor),
        marsSky: lerpColor(s0.marsSky, s1.marsSky, factor),
        marsGround: lerpColor(s0.marsGround, s1.marsGround, factor),
        europaSky: lerpColor(s0.europaSky, s1.europaSky, factor),
        europaGround: lerpColor(s0.europaGround, s1.europaGround, factor),
        titanSky: lerpColor(s0.titanSky, s1.titanSky, factor),
        titanGround: lerpColor(s0.titanGround, s1.titanGround, factor),
        plutoSky: lerpColor(s0.plutoSky, s1.plutoSky, factor),
        plutoGround: lerpColor(s0.plutoGround, s1.plutoGround, factor)
      };
}

// Ключевые моменты текущего трека: zams, tams, rgbTip, agbStart/agbEnd, massLossStart, end (конец ядерного горения),
// sn (сверхновая), remnant (появление остатка). Для треков MIST и Солнца заданы явно, для остальных — оцениваются.
export function getTrackMarks() {
  const st = S.currentDynamicStages;
  if (st.marks) return st.marks;
  const last = st[st.length - 1];
  const iRem = st.findIndex(s => s.t > 0 && s.r < 0.05);
  const sn = st.find(s => s.l >= 1e8);
  const giant = st.find(s => s.t > 0 && s.r > 20);
  const end = iRem > 0 ? st[iRem - 1].t : last.t;
  return { zams: 0, end, remnant: last.t, sn: sn ? sn.t : undefined, massLossStart: giant ? giant.t : end };
}

export const UNIVERSE_AGE_GYR = 13.8;

// Подбор возраста звезды по наблюдаемым T_eff и L: ищем точку трека, ближайшую к звезде на диаграмме Г—Р.
// Невязка χ² с типичными ошибками σ(lg T) = 0.01 (≈2%) и σ(lg L) = 0.05 (≈12%).
// ageHint — литературный возраст: если он согласуется с наблюдениями в пределах 1σ (Δχ² < 2.3 для двух
// параметров), берём его — у красных карликов трек почти неподвижен, и сам по себе возраст не определяется.
export function fitAgeToObservation(obsT, obsL, ageHint) {
  const st = S.currentDynamicStages;
  const t0 = Math.max(0, st[0].t);
  const marks = getTrackMarks();
  const t1 = Math.min(marks.end, UNIVERSE_AGE_GYR); // остатки не рассматриваем; звезда не старше Вселенной
  const chi2 = (t) => {
    const s = getInterpolatedState(t, { static: true });
    const dT = (Math.log10(s.temp) - Math.log10(obsT)) / 0.01;
    const dL = (Math.log10(Math.max(1e-12, s.l)) - Math.log10(obsL)) / 0.05;
    return dT * dT + dL * dL;
  };
  // Перебор по узлам трека и между ними, затем уточнение золотым сечением
  const grid = [];
  for (const s of st) if (s.t >= t0 && s.t <= t1) grid.push(s.t);
  const fine = [];
  for (let i = 0; i < grid.length - 1; i++) for (let k = 0; k < 8; k++) fine.push(grid[i] + (grid[i + 1] - grid[i]) * k / 8);
  fine.push(t1);
  let best = fine[0], bestV = Infinity, bi = 0;
  fine.forEach((t, i) => { const v = chi2(t); if (v < bestV) { bestV = v; best = t; bi = i; } });
  let a = fine[Math.max(0, bi - 1)], b = fine[Math.min(fine.length - 1, bi + 1)];
  const g = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 40; it++) {
    const c = b - g * (b - a), d = a + g * (b - a);
    if (chi2(c) < chi2(d)) b = d; else a = c;
  }
  const tBest = (a + b) / 2;
  const vBest = chi2(tBest);
  const fit = vBest < bestV ? { t: tBest, chi2: vBest, source: 'fit' } : { t: best, chi2: bestV, source: 'fit' };
  if (ageHint !== undefined && ageHint >= t0 && ageHint <= t1) {
    const vHint = chi2(ageHint);
    if (vHint - fit.chi2 < 2.3) return { t: ageHint, chi2: vHint, source: 'literature' };
  }
  return fit;
}
