// Эволюция орбит планет: потеря массы звездой, приливы в конвективной оболочке гиганта, поглощение,
// мгновенная потеря массы при сверхновой / коллапсе в чёрную дыру. Чистые функции, единицы СГС внутри.
//
// Уравнение для большой полуоси (круговая орбита):
//   d ln a / dt = − d ln M★/dt  −  γ_tide
//   1) потеря массы медленная (≫ орбитального периода) → адиабатический инвариант a·M★ = const;
//   2) равновесный прилив Зана (Zahn 1977) в форме Villaver & Livio (2009), Mustill & Villaver (2012):
//        γ_tide = (f / τ_c) · (M_env / M★) · q (1 + q) · (R★ / a)^8,   q = M_p / M★
//        τ_c = [ M_env · R★² / (6 L★) ]^(1/3)  — время конвективного оборота (Rasio et al. 1996, основание оболочки R_env ≈ 0)
//        f = 9/2 · min[1, (P / 2τ_c)²]  — подавление вязкости, когда вихри медленнее прилива
//   3) планета поглощена, когда a ≤ R★;
//   4) мгновенная потеря массы (взрыв, коллапс): a' = a · M' / (2M' − M) из сохранения энергии;
//      при M' < M/2 орбита становится незамкнутой — планета улетает.

const G = 6.674e-8;
const M_SUN = 1.989e33, R_SUN = 6.957e10, L_SUN = 3.828e33;
const M_EARTH = 5.972e27;
const AU = 1.496e13;
const GYR = 3.156e16;
export const R_SUN_AU = R_SUN / AU; // ≈ 1/215

// Массы планет в массах Земли (для q = M_p/M★)
export const PLANET_MASS_EARTH = {
  mercury: 0.0553, venus: 0.815, earth: 1.012 /* с Луной */, mars: 0.107,
  europa: 317.8 /* орбита Юпитера */, jupiter: 317.8, titan: 95.2 /* орбита Сатурна */, saturn: 95.2,
  uranus: 14.5, neptune: 17.1, pluto: 0.0022, haumea: 0.00067, makemake: 0.0005, eris: 0.0028
};
export const EXO_TYPE_MASS_EARTH = { hot_jupiter: 318, ocean_world: 4, super_earth: 6, chthonian: 3 };

// Масса гелиевого ядра: из модели, иначе по соотношению «ядро — светимость» на RGB (Boothroyd & Sackmann 1988: L ≈ 2.3·10⁵ M_c⁶)
export function coreMassOf(star) {
  if (star.coreMass !== undefined && star.coreMass !== null) return Math.min(star.coreMass, 0.95 * star.mass);
  return Math.min(0.95 * star.mass, Math.pow(Math.max(1e-6, star.l) / 2.3e5, 1 / 6));
}

// Доля работающей конвективной оболочки: у горячих звёзд оболочка лучистая, равновесный прилив неэффективен
function convectiveWeight(temp) { return Math.max(0, Math.min(1, (7000 - temp) / 1500)); }

// Скорость приливного сжатия орбиты γ = −(d ln a/dt)_tide, 1/млрд лет
export function tidalDecayRate(aAU, star, mpEarth, tideFactor = 1) {
  const w = convectiveWeight(star.temp);
  if (w <= 0 || aAU <= 0) return 0;
  const M = star.mass * M_SUN, R = star.r * R_SUN, L = Math.max(1e-6, star.l) * L_SUN;
  const Menv = Math.max(0, star.mass - coreMassOf(star)) * M_SUN;
  if (Menv <= 0) return 0;
  const a = aAU * AU;
  const q = (mpEarth * M_EARTH) / M;
  const tauC = Math.cbrt((Menv * R * R) / (6 * L));
  const P = 2 * Math.PI * Math.sqrt((a * a * a) / (G * (M + mpEarth * M_EARTH)));
  const f = 4.5 * Math.min(1, Math.pow(P / (2 * tauC), 2));
  const gamma = (f / tauC) * (Menv / M) * q * (1 + q) * Math.pow(R / a, 8); // 1/с
  return tideFactor * w * gamma * GYR;
}

// Состояние звезды между узлами — та же схема, что и в визуализации (lg R, lg L, T и M линейно)
const T_SUN_EFF_K = 5772;
export function starAt(s0, s1, t) {
  const span = s1.t - s0.t;
  const f = span > 0 ? Math.max(0, Math.min(1, (t - s0.t) / span)) : 0;
  const lerp = (a, b) => a + (b - a) * f;
  const c0 = coreMassOf(s0), c1 = coreMassOf(s1);
  return {
    r: Math.pow(10, lerp(Math.log10(s0.r), Math.log10(s1.r))),
    l: Math.pow(10, lerp(Math.log10(Math.max(1e-12, s0.l)), Math.log10(Math.max(1e-12, s1.l)))),
    temp: (!s0.noSB && !s1.noSB && s0.l > 0 && s1.l > 0)
      ? T_SUN_EFF_K * Math.pow(Math.pow(10, lerp(Math.log10(s0.l), Math.log10(s1.l))) / Math.pow(10, 2 * lerp(Math.log10(s0.r), Math.log10(s1.r))), 0.25)
      : lerp(s0.temp, s1.temp),
    mass: Math.max(0.1, lerp(s0.mass, s1.mass)),
    coreMass: lerp(c0, c1)
  };
}

// Переход в остаток, который случается мгновенно (вспышка сверхновой, прямой коллапс в ЧД, полный разлёт звезды)
const isInstantRemnant = (s) => s.noSB === true || s.mass <= 0;
// Взрыв, ударная волна которого сметает близкие планеты: сверхновая (L ≥ 10⁸ L☉) или полный разлёт звезды
const isExplosion = (s) => s.l >= 1e8 || s.mass <= 0;

/**
 * Интегрирует орбиту планеты по треку звезды.
 * @param stages   стадии звезды (по возрастанию t, млрд лет)
 * @param a0AU     большая полуось при рождении системы (при массе звезды birthMass)
 * @param mpEarth  масса планеты, M⊕
 * @param opts     { birthMass, tideFactor, blastRadiusAU }
 * @returns { t: number[], a: number[], fate: { type: 'survived'|'engulfed'|'blast'|'ejected', t } }
 */
export function integrateOrbit(stages, a0AU, mpEarth, opts = {}) {
  const tideFactor = opts.tideFactor ?? 1;
  const blastR = opts.blastRadiusAU ?? 15;
  const birthMass = opts.birthMass ?? stages[0].mass;
  // Планеты формируются в диске за время сжатия протозвезды: интегрируем с начала главной последовательности (t = 0)
  const tStart = Math.max(0, stages[0].t);
  let k0 = 0;
  while (k0 < stages.length - 2 && stages[k0 + 1].t <= tStart) k0++;
  const startStar = starAt(stages[k0], stages[k0 + 1], tStart);
  let lnA = Math.log(a0AU * birthMass / Math.max(0.1, startStar.mass));
  const T = [tStart], A = [Math.exp(lnA)];
  const done = (type, t) => { T.push(t); A.push(0); return { t: T, a: A, fate: { type, t } }; };
  let steps = 0;

  for (let i = k0; i < stages.length - 1; i++) {
    const s0 = stages[i], s1 = stages[i + 1];
    const span = s1.t - s0.t;
    if (span <= 0 || s1.t <= tStart) continue;

    if (isInstantRemnant(s1)) {
      // Вспышка сверхновой: ударная волна и выброс сметают близкие планеты
      if (isExplosion(s1) && Math.exp(lnA) < blastR) return done('blast', s1.t);
      // Мгновенная потеря массы: момент — сама вспышка (SN) или сразу после конца горения (прямой коллапс)
      const Mb = s0.mass, Ma = Math.max(0, s1.mass);
      const tj = isExplosion(s1) ? s1.t : s0.t + span * 1e-3;
      if (Ma < Mb) {
        const denom = 2 * Ma - Mb;
        if (denom <= 0) return done('ejected', tj);
        lnA += Math.log(Ma / denom);
      }
      T.push(tj, s1.t); A.push(Math.exp(lnA), Math.exp(lnA));
      continue;
    }
    if (isInstantRemnant(s0)) { T.push(s1.t); A.push(Math.exp(lnA)); continue; } // остаток: масса постоянна

    const dMdt = (s1.mass - s0.mass) / span;
    const dlnRdt = Math.abs(Math.log(s1.r / s0.r)) / span;
    let t = Math.max(s0.t, tStart);
    let lastPushedLnA = lnA;
    while (t < s1.t && steps < 400000) {
      steps++;
      const st = starAt(s0, s1, t);
      const g = tidalDecayRate(Math.exp(lnA), st, mpEarth, tideFactor);
      const dlnMdt = dMdt / st.mass;
      let dt = s1.t - t;
      if (dlnMdt !== 0) dt = Math.min(dt, 1e-3 / Math.abs(dlnMdt));
      if (g > 0) dt = Math.min(dt, 2e-3 / g);
      if (dlnRdt > 0) dt = Math.min(dt, 0.01 / dlnRdt);
      dt = Math.max(dt, span * 1e-7);
      dt = Math.min(dt, s1.t - t);

      // Метод средней точки: адиабатическая часть точно (a·M = const), приливная — со средней точки
      const tm = t + dt / 2;
      const sm = starAt(s0, s1, tm);
      const lnAm = lnA - Math.log(sm.mass / st.mass) - g * dt / 2;
      const gm = tidalDecayRate(Math.exp(lnAm), sm, mpEarth, tideFactor);
      const s2 = starAt(s0, s1, t + dt);
      lnA = lnA - Math.log(s2.mass / st.mass) - gm * dt;
      t += dt;

      if (Math.exp(lnA) <= s2.r * R_SUN_AU) return done('engulfed', t);
      if (Math.abs(lnA - lastPushedLnA) > 0.002 || t >= s1.t) { T.push(t); A.push(Math.exp(lnA)); lastPushedLnA = lnA; }
    }
  }
  return { t: T, a: A, fate: { type: 'survived', t: Infinity } };
}

// Большая полуось в момент t по результату integrateOrbit (0 — планеты больше нет на орбите)
export function orbitAt(orbit, t) {
  if (t >= orbit.fate.t) return 0;
  const T = orbit.t, A = orbit.a;
  if (t <= T[0]) return A[0];
  let lo = 0, hi = T.length - 1;
  if (t >= T[hi]) return A[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
  const span = T[hi] - T[lo];
  if (span <= 0 || A[hi] <= 0 || A[lo] <= 0) return A[lo];
  const f = (t - T[lo]) / span;
  return Math.exp(Math.log(A[lo]) + f * (Math.log(A[hi]) - Math.log(A[lo])));
}

// Состояние звезды в момент t по списку стадий (без визуальных пульсаций)
export function starStateAt(stages, t) {
  let i = 0;
  while (i < stages.length - 2 && stages[i + 1].t <= t) i++;
  return starAt(stages[i], stages[i + 1], t);
}
