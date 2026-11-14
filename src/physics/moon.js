// Луна: удаление под действием приливов и судьба солнечных затмений.
// Прошлое — по геологическим данным (приливные ритмиты), будущее — из приливной теории:
//   da/dt ∝ a^(−11/2)  ⇒  a^(13/2) = a₀^(13/2) + (13/2)·ȧ₀·a₀^(11/2)·(t − t₀),
// где ȧ₀ = 3.83 см/год — современная скорость удаления по лазерной локации (Williams & Boggs 2016).
// Наивная экстраполяция этого закона в прошлое дала бы Луну у Земли всего ~1.5 млрд лет назад —
// «проблема временной шкалы»: в прошлом океаны рассеивали приливную энергию слабее, поэтому прошлое берём из данных.
export const R_EARTH_KM = 6371;
export const R_MOON_KM = 1737.4;
export const R_SUN_KM = 695700;
export const AU_KM = 1.496e8;
export const MOON_NOW_RE = 60.27;          // 384 400 км
export const T_NOW = 4.57;                 // возраст Солнца сегодня, млрд лет
const RATE_NOW_RE_PER_GYR = 3.83 * 1e9 / 1e5 / R_EARTH_KM;      // 3.83 см/год → R⊕ за млрд лет (≈ 6.0)

// Возраст Солнца (млрд лет) → расстояние до Луны (R⊕): ранняя аккреция, 2.45 млрд лет назад (Walker & Zahnle 1986),
// 620 млн лет назад (Williams 2000), сегодня
const PAST = [[0.03, 25], [0.2, 40], [1.0, 49], [2.12, 54.6], [3.95, 58.16], [T_NOW, MOON_NOW_RE]];

export function moonDistanceRE(t) {
  if (t <= PAST[0][0]) return PAST[0][1];
  if (t <= T_NOW) {
    let i = 0; while (i < PAST.length - 2 && PAST[i + 1][0] <= t) i++;
    const [t0, a0] = PAST[i], [t1, a1] = PAST[i + 1];
    return a0 + (a1 - a0) * (t - t0) / (t1 - t0);
  }
  const a0 = MOON_NOW_RE;
  return Math.pow(Math.pow(a0, 6.5) + 6.5 * RATE_NOW_RE_PER_GYR * Math.pow(a0, 5.5) * (t - T_NOW), 1 / 6.5);
}

export const moonDistanceKm = (t) => moonDistanceRE(t) * R_EARTH_KM;
// Угловые радиусы (рад) Луны и звезды, видимые с Земли
export const moonAngularRadius = (t) => Math.atan(R_MOON_KM / moonDistanceKm(t));
export const starAngularRadius = (rSun, distAU) => Math.atan(rSun * R_SUN_KM / (distAU * AU_KM));

export const MOON_ECC = 0.0549, EARTH_ECC = 0.0167;

/**
 * Какие солнечные затмения возможны. В среднем Луна уже сейчас чуть меньше Солнца (0.518° против 0.533°),
 * полные затмения бывают, когда Луна в перигее: возможны, пока Луна в перигее закрывает звезду даже в афелии Земли.
 */
export function eclipseKind(t, rSun, distAU) {
  const moonPeri = Math.atan(R_MOON_KM / (moonDistanceKm(t) * (1 - MOON_ECC)));
  const sunAph = starAngularRadius(rSun, distAU * (1 + EARTH_ECC));
  return moonPeri > sunAph ? 'total' : 'annular';
}
