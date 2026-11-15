// Млечный Путь и Андромеда (M31): будущее сближение, слияние — или промах.
//
// Модель — относительная орбита двух гало (как в полуаналитических расчётах van der Marel et al. 2012, ApJ 753, 9;
// Sawala et al. 2025, Nat. Astron., arXiv:2408.00064; Wu et al. 2026, arXiv:2603.22863):
//   • каждое гало — профиль NFW (M₂₀₀, c, обрезан на r₂₀₀); сила между ними — масса одного гало внутри расстояния
//     до центра другого, симметризованная, со смягчением 20 кпк (как у Sawala et al.);
//   • динамическое трение Чандрасекара: каждое тело тормозит в чужом гало; тормозит только масса внутри расстояния r,
//       a = −4πG² ln Λ · (M₃₁(<r)·ρ_MW(r) + M_MW(<r)·ρ₃₁(r)) · [erf X − 2X/√π·e^{−X²}] / v²,  X = v/(√2σ),  σ ≈ V_круг/√2;
//   • ln Λ = 1.1 подобран так, чтобы сценарий HST повторял van der Marel et al. (2012): первый перицентр через
//     3.87 (+0.42 −0.32) млрд лет, слияние через 5.86 (+1.61 −0.72) млрд лет. У нас — 4.03 и 5.92;
//   • слияние — когда центры сошлись ближе 10 кпк и относительная скорость упала ниже скорости убегания из ядра.
//
// Начальные условия (van der Marel et al. 2012, Paper II): M31 в галактоцентрических X, Y, Z = (−378.9, 612.7, −283.1) кпк
// (X — от Солнца к центру, Y — по вращению, Z — на северный полюс Галактики), радиальная скорость −109.3 км/с.
// Поперечная скорость измерена плохо — это главный источник неопределённости, поэтому три сценария:
//   HST 2012:  v⊥ = 17 км/с, M_MW + M31 = (1.0 + 1.5)·10¹² M☉ — «лобовое» столкновение, слияние наверняка;
//   Gaia 2026: v⊥ = 47 км/с (Wu et al. 2025, с поправкой систематики Gaia), (1.0 + 1.3)·10¹² — вероятность слияния ~90 %;
//   Gaia 2025: v⊥ = 76 км/с (Salomon et al. 2021, сценарий Sawala et al.), (1.0 + 1.3)·10¹² — около половины орбит
//              расходятся на ≳ 200 кпк, и слияния за 10 млрд лет нет.
// Направление поперечной скорости во всех сценариях берём из канонической модели van der Marel (упрощение: на картину неба
// влияет мало, а на время и расстояние перицентра — величина v⊥ и массы).
// Не учтены: БМО и M33 (в полных расчётах они сдвигают вероятность слияния в обе стороны), приливное обдирание гало.

export const G_KPC = 4.3009e-6;            // кпк·(км/с)²/M☉
export const KPC_PER_KMS_GYR = 1.0227;     // 1 км/с ≈ 1.0227 кпк/млрд лет
const RHO_CRIT = 136.0;                    // M☉/кпк³ (h = 0.7)
const CORE = 10;                          // кпк: тормозит гало целиком, а не точечное ядро — плотность в трении не берём ближе 10 кпк

export const M31_POS0 = [-378.9, 612.7, -283.1];        // кпк, относительно центра Галактики
export const M31_VRAD = -109.3;                          // км/с
const T_DIR = (() => { const v = [13.3, 9.08, 5.65], n = Math.hypot(...v); return v.map(x => x / n); })();

export const ANDROMEDA_SCENARIOS = {
  hst2012: { name: 'HST 2012', vt: 17, mMW: 1.0e12, m31: 1.5e12, cMW: 10, c31: 10,
    note: 'van der Marel et al. 2012: почти лобовое столкновение, слияние наверняка' },
  gaia2026: { name: 'Gaia 2026', vt: 47, mMW: 1.0e12, m31: 1.3e12, cMW: 10, c31: 15,
    note: 'Wu et al. 2026: вероятность слияния ~90 %, медиана — через 6.5 млрд лет' },
  gaia2025: { name: 'Gaia 2025', vt: 76, mMW: 1.0e12, m31: 1.3e12, cMW: 10, c31: 10,
    note: 'Sawala et al. 2025: в половине вариантов слияния за 10 млрд лет нет' }
};
export const LN_LAMBDA = 1.1;
const SOFT = 20;                          // кпк

// ---------- профиль NFW ----------
export function nfw(M200, c) {
  const r200 = Math.cbrt(3 * M200 / (4 * Math.PI * 200 * RHO_CRIT));
  const rs = r200 / c;
  const mc = Math.log(1 + c) - c / (1 + c);
  const rhoS = M200 / (4 * Math.PI * rs ** 3 * mc);
  return {
    M200, r200, rs,
    rho: (r) => { const x = Math.max(r, CORE) / rs; return rhoS / (x * (1 + x) ** 2); },
    // масса внутри r; за r₂₀₀ не растёт (гало обрезано)
    mass: (r) => { const x = Math.min(r, r200) / rs; return M200 * (Math.log(1 + x) - x / (1 + x)) / mc; }
  };
}

function erf(x) {   // Абрамовиц — Стиган 7.1.26, погрешность < 1.5·10⁻⁷
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/** Ускорение относительного движения (км/с за кпк/(км/с), т. е. (км/с)²/кпк) */
function accel(p, v, h1, h2, lnL) {
  const r = Math.hypot(p[0], p[1], p[2]);
  const rr = Math.max(r, 1);
  const M1 = h1.M200, M2 = h2.M200;
  // тяготение: каждое тело — точка в чужом гало NFW (симметризовано); ближе SOFT кпк — как у Sawala et al. смягчено
  const F = G_KPC * 0.5 * (M2 * h1.mass(rr) + M1 * h2.mass(rr)) * r / Math.pow(r * r + SOFT * SOFT, 1.5);
  const aG = F * (M1 + M2) / (M1 * M2);
  const a = [-aG * p[0] / rr, -aG * p[1] / rr, -aG * p[2] / rr];
  // трение
  const vv = Math.hypot(v[0], v[1], v[2]);
  if (vv > 1e-3) {
    const vc = Math.sqrt(G_KPC * (h1.mass(rr) + h2.mass(rr)) / rr);
    const sigma = Math.max(30, vc / Math.SQRT2);
    const X = vv / (Math.SQRT2 * sigma);
    const g = erf(X) - 2 * X / Math.sqrt(Math.PI) * Math.exp(-X * X);
    // тормозит только та часть гало, что внутри расстояния между центрами: внешние оболочки проходят насквозь без следа
    const df = 4 * Math.PI * G_KPC * G_KPC * lnL * (h2.mass(rr) * h1.rho(rr) + h1.mass(rr) * h2.rho(rr)) * g / (vv * vv);
    for (let k = 0; k < 3; k++) a[k] -= df * v[k] / vv;
  }
  return a;
}

const DT = 0.002;            // млрд лет — шаг интегрирования (у перицентра ~0.5 млн лет на кпк — хватает с запасом)
const T_MAX = 16, T_MIN = -6;
const cache = new Map();

/**
 * Орбита M31 относительно центра Галактики в сценарии: таблица положений через DT, от T_MIN до T_MAX млрд лет от сегодня.
 * Возвращает { at(dt) → {pos, d, vrel, merged}, tPeri, rPeri, tMerge (Infinity — нет), rMin }.
 */
export function andromedaOrbit(key = 'hst2012', lnL = LN_LAMBDA) {
  const id = key + ':' + lnL;
  if (cache.has(id)) return cache.get(id);
  const sc = typeof key === 'object' ? key : ANDROMEDA_SCENARIOS[key];
  const h1 = nfw(sc.mMW, sc.cMW), h2 = nfw(sc.m31, sc.c31);
  const r0 = Math.hypot(...M31_POS0), ur = M31_POS0.map(x => x / r0);
  const v0 = ur.map((u, k) => (M31_VRAD * u + sc.vt * T_DIR[k]) * KPC_PER_KMS_GYR);   // кпк/млрд лет
  const conv = KPC_PER_KMS_GYR * KPC_PER_KMS_GYR;                                       // (км/с)²/кпк → кпк/млрд лет²
  const run = (sign) => {
    const out = [];
    let p = M31_POS0.slice(), v = v0.map(x => x * sign), merged = false;
    const n = Math.round((sign > 0 ? T_MAX : -T_MIN) / DT);
    for (let i = 0; i <= n; i++) {
      const d = Math.hypot(p[0], p[1], p[2]);
      const vrel = Math.hypot(v[0], v[1], v[2]) / KPC_PER_KMS_GYR;
      if (sign > 0 && !merged && d < 10) {
        // убегание из ядра на ~10 кпк: √(2GM(<10)/10)
        const vesc = Math.sqrt(2 * G_KPC * (h1.mass(10) + h2.mass(10)) / 10);
        if (vrel < vesc) merged = true;
      }
      out.push(merged ? { pos: [0, 0, 0], d: 0, vrel: 0, merged } : { pos: p.slice(), d, vrel: vrel * sign, merged });
      if (merged) continue;
      // «скачок — дрейф — скачок» (leapfrog); трение зависит от скорости — берём её в начале шага
      // назад во времени идём с обращённой скоростью v' = −v: dv'/dτ = a(p, v) — подставляем настоящую скорость
      const a = accel(p, v.map(x => x * sign), h1, h2, lnL).map(x => x * conv);
      const vh = v.map((x, k) => x + 0.5 * DT * a[k]);
      p = p.map((x, k) => x + DT * vh[k]);
      const a2 = accel(p, vh.map(x => x * sign), h1, h2, lnL).map(x => x * conv);
      v = vh.map((x, k) => x + 0.5 * DT * a2[k]);
    }
    return out;
  };
  const fut = run(1), past = run(-1);
  // характерные моменты
  let tPeri = NaN, rPeri = Infinity, tMerge = Infinity, rMin = Infinity, tApo = NaN, rApo = NaN;
  for (let i = 1; i < fut.length - 1; i++) {
    const d = fut[i].d;
    if (fut[i].merged) { tMerge = i * DT; break; }
    rMin = Math.min(rMin, d);
    if (isNaN(tPeri) && d < fut[i - 1].d && d <= fut[i + 1].d) { tPeri = i * DT; rPeri = d; }
    else if (!isNaN(tPeri) && isNaN(tApo) && d > fut[i - 1].d && d >= fut[i + 1].d) { tApo = i * DT; rApo = d; }
  }
  if (isFinite(tMerge)) rMin = Math.min(rMin, 0);
  const at = (dt) => {
    if (!Number.isFinite(dt)) dt = 0;
    const arr = dt >= 0 ? fut : past;
    const x = Math.min(arr.length - 1.001, Math.abs(dt) / DT);
    const i = Math.floor(x), f = x - i;
    const A = arr[i], B = arr[i + 1];
    if (B.merged) return f > 0.5 || A.merged ? B : A;
    return { pos: A.pos.map((q, k) => q + (B.pos[k] - q) * f), d: A.d + (B.d - A.d) * f, vrel: A.vrel + (B.vrel - A.vrel) * f, merged: false };
  };
  const res = { key: sc.name ? key : 'custom', sc, at, tPeri, rPeri, tApo, rApo, tMerge, rMin, dt: DT, tMin: T_MIN, tMax: T_MAX };
  cache.set(id, res);
  return res;
}

// ---------- Андромеда на небе ----------
// Ось вращения диска M31 в галактоцентрических координатах (van der Marel et al. 2012, Paper III): наклон к лучу зрения
// получается 77°, как у настоящей M31. Радиус диска до изофоты 25ᵐ/□″ (D₂₅ = 190′) — 21.5 кпк.
export const M31_SPIN = [-0.412, -0.767, -0.492];
export const M31_R25 = 21.5;
const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return v.map(x => x / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };

/** Положение Солнца в Галактике (кпк) по углу φ и высоте z (как в виде «Галактика») */
export const sunPosition = (phi, z, R0 = 8.2) => [R0 * Math.cos(phi), R0 * Math.sin(phi), z];

/** Галактоцентрический вектор → галактические l, b (рад) — оси совпадают с гелиоцентрическими галактическими */
export function vecToGal(v) {
  const d = Math.hypot(v[0], v[1], v[2]);
  return { l: Math.atan2(v[1], v[0]), b: Math.asin(v[2] / d), d };
}

/**
 * Что видно с Солнца в момент dt (млрд лет от сегодня): направление и расстояние до M31, угловой радиус диска,
 * наклон диска к лучу зрения, фазы взаимодействия.
 *   tidal — 0…1: приливные хвосты после первого пролёта; burst — вспышка звездообразования (максимум ~через 0.3 млрд лет
 *   после перицентра, в слиянии — второй максимум); merge — 0…1: M31 растворяется в общем остатке; mw — 0…1: насколько
 *   полоса Млечного Пути уже размыта в эллиптическую галактику.
 */
export function andromedaView(dt, key, sun) {
  const o = andromedaOrbit(key);
  const s = o.at(dt);
  const rel = s.pos.map((x, k) => x - sun[k]);
  const g = vecToGal(rel);
  const los = rel.map(x => x / g.d);
  const cosI = Math.abs(dot(los, M31_SPIN));
  const sinceP = Number.isFinite(o.tPeri) ? dt - o.tPeri : -Infinity;
  const tidal = smooth(sinceP / 0.6);
  const toMerge = dt - o.tMerge;                       // > 0 — уже слились
  const burst = Math.max(sinceP > 0 ? Math.exp(-Math.pow((sinceP - 0.3) / 0.35, 2)) : 0, Math.exp(-Math.pow((toMerge + 0.1) / 0.4, 2)));
  // последние сотни миллионов лет до слияния диск M31 уже разорван: её звёзды становятся частью общего остатка
  const merge = smooth((toMerge + 0.6) / 0.6);
  const mw = Math.max(0.35 * smooth(sinceP / 0.8), smooth((toMerge + 0.3) / 1.2));
  return { ...g, dt, rel, los, cosI, inclination: Math.acos(cosI), angR: Math.atan(M31_R25 / g.d), tidal, burst, merge, mw,
    merged: s.merged, orbit: o, state: s };
}

/** Базис диска M31: e1, e2 — в плоскости диска, n — ось вращения */
export function m31Basis() {
  const n = norm(M31_SPIN);
  const e1 = norm(cross(n, [0, 0, 1]));
  return { n, e1, e2: cross(n, e1) };
}

/**
 * Модель M31 «облаком пятен» (кпк в плоскости диска): балдж — Серсик n = 2, R_e = 1 кпк, μ_e(V) = 17.5;
 * диск — экспонента, h = 5.3 кпк (Courteau et al. 2011), μ₀(V) = 21.6 плашмя, плюс «огненное кольцо» на 10 кпк
 * (там идёт звездообразование) и слабые рукава. У каждого пятна — собственная яркость μ (V, ᵐ/□″) и размер s (кпк).
 * Поверхностная яркость не зависит от расстояния: подлетая, Андромеда растёт на небе, но ярче на единицу площади не становится.
 */
export function m31Particles() {
  const out = [];
  let seed = 31;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 40; i++) {
    const R = 0.12 + 2.6 * Math.pow(rnd(), 1.6), a = rnd() * Math.PI * 2;
    const mu = 17.5 + 3.99 * (Math.sqrt(R / 1.0) - 1);
    out.push({ x: R * Math.cos(a), y: R * Math.sin(a), z: (rnd() - 0.5) * R * 1.1, s: 0.7 + 0.5 * R, mu, kind: 'bulge' });
  }
  for (let R = 2.2; R <= 19; R += 0.8 + 0.1 * R) {
    const s = 0.8 + 0.13 * R, n = Math.max(8, Math.round(2 * Math.PI * R / s));
    for (let k = 0; k < n; k++) {
      const a = (k + rnd() * 0.6) / n * Math.PI * 2;
      const Rj = R + (rnd() - 0.5) * s * 0.6;
      const arm = Math.cos(2 * (a - Math.log(Rj / 4) / Math.tan(8 * Math.PI / 180)));
      const ring = Math.exp(-Math.pow((Rj - 10) / 1.8, 2));
      const mu = 21.6 + 1.086 * Rj / 5.3 - 1.2 * ring - 0.35 * arm;
      out.push({ x: Rj * Math.cos(a), y: Rj * Math.sin(a), z: 0, s, mu, kind: ring > 0.4 && arm > 0.2 ? 'ring' : 'disk' });
    }
  }
  return out;
}
