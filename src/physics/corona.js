// Солнечная корона при полном затмении (5.3).
// • Радиальный профиль K+F-короны — формула Баумбаха (1937), в долях средней яркости диска:
//     I(ρ)/I☉ = 10⁻⁶·(0.0532·ρ⁻²·⁵ + 1.425·ρ⁻⁷ + 2.565·ρ⁻¹⁷), ρ — расстояние от центра в радиусах Солнца.
//   У самого лимба корона в ~10⁶ раз тусклее фотосферы — поэтому видна только при полном затмении.
// • Форма меняется с циклом активности (Людендорф 1928; Loucif & Koutchmy 1989): в минимуме корона сплюснута —
//   длинные экваториальные стримеры («крылья») и тонкие полярные щёточки; в максимуме — круглая, стримеры торчат
//   на всех широтах. Индекс сплюснутости ε = a + b на ρ = 2: ~0.25 в минимуме, ~0.02 в максимуме.
// • Протуберанцы — красные (линия Hα 656.3 нм) петли у лимба, их больше в максимуме.

export function baumbach(rho) {
  const r = Math.max(1.0, rho);
  return 1e-6 * (0.0532 * Math.pow(r, -2.5) + 1.425 * Math.pow(r, -7) + 2.565 * Math.pow(r, -17));
}

/** Индекс сплюснутости Людендорфа по уровню активности 0 (минимум) … 1 (максимум) */
export function ludendorff(activity) {
  return 0.25 - 0.23 * Math.max(0, Math.min(1, activity));
}

/** Широты стримеров (рад): в минимуме — у экватора (±10°), в максимуме — разбросаны до ±70° */
export function streamerLatitudes(activity, n = 8, seed = 1) {
  const a = Math.max(0, Math.min(1, activity));
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const f = u - Math.floor(u);
    const side = i % 2 ? 1 : -1;
    const spread = (10 + 60 * a) * Math.PI / 180;
    out.push(side * f * spread);
  }
  return out;
}

/**
 * Яркость короны в точке (ρ — в радиусах звезды, lat — гелиографическая широта направления, рад) в долях яркости диска.
 * Сплюснутость: изофоты — эллипсы с полуосями 1 и (1 − ε) к полюсу; стримеры — усиление ×3 шириной ~12°.
 */
export function coronaBrightness(rho, lat, activity, streamers = streamerLatitudes(activity)) {
  const eps = ludendorff(activity);
  const s = Math.sin(lat), c = Math.cos(lat);
  const rhoEff = rho * Math.sqrt(c * c + (s * s) / Math.pow(1 - eps, 2));
  let st = 0;
  const w = 0.11 + 0.05 * activity;
  for (const L of streamers) { const d = (lat - L) / w; st += Math.exp(-d * d); }
  // полярные щёточки — только в минимуме
  const plumes = (1 - activity) * 0.6 * Math.exp(-Math.pow((Math.abs(lat) - Math.PI / 2) / 0.25, 2));
  return baumbach(rhoEff) * (1 + 2 * Math.min(1.5, st) * Math.min(1, (rho - 1) * 2) + plumes);
}
