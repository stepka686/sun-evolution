// Модель энергобаланса планет (0-D): поглощённый свет звезды = уходящее тепловое излучение.
// Чистые функции. Температуры в K, потоки в Вт/м².
//
// Режим 1 — «влажный» (планета с океаном и тонкой атмосферой), модель Будыко — Селлерса (Budyko 1969; Sellers 1969; North 1975):
//   ASR(T) = S/4 · (1 − α(T)),   α(T) — альбедо со льдом: 0.62 у «снежка», 0.30 у тёплой планеты (переход около −15 °C)
//   OLR(T) = softmin( A + B·(T − 273.15) − ΔF ,  OLR_lim )
//     ΔF — радиационный форсинг парниковых газов относительно современной Земли:
//          CO₂: 5.35·ln(pCO₂/pCO₂,0) (Myhre et al. 1998); CH₄: насыщающийся логарифм (≤ 20 Вт/м², Byrne & Goldblatt 2014);
//          давление азота: 6·ln(p/1 бар) (уширение линий, Goldblatt et al. 2009)
//     OLR_lim = 282 Вт/м² — предел излучения атмосферы, насыщенной водяным паром (Goldblatt et al. 2013):
//          если планета поглощает больше, равновесия нет — убегающий парник, океаны выкипают.
//   Равновесий может быть два (тёплое и «снежок»): берём тёплую ветвь, если она существует.
// Режим 2 — плотная атмосфера (p ≳ 5 бар, пар или CO₂): серая модель T_s = T_e·(1 + ¾τ)^¼, τ = κ·p²,
//   κ откалиброван по Венере (92 бар, α = 0.76, T_s = 737 K).
// Режим 3 — тонкая сухая атмосфера: та же серая модель, τ = τ₀·√(p/p₀) с калибровкой по телу (Марс, Титан).

export const SIGMA = 5.670e-8;
export const S_EARTH = 1361;            // солнечная постоянная, Вт/м²
export const OLR_LIM = 282;             // предел излучения влажной атмосферы (Goldblatt et al. 2013)
export const B_OLR = 1.8;               // Вт/(м²·K): наклон уходящего излучения с учётом водяного пара
export const CO2_REF_BAR = 420e-6;      // современный CO₂ при 1 бар
export const CH4_REF_PPM = 1.9;
export const KAPPA_THICK = 0.01674;     // бар⁻²: τ = κ·p² (калибровка по Венере)

// Альбедо со льдом: плавный переход «снежок» ↔ тёплая планета (центр −15 °C, ширина 12 K).
// Подобрано так, чтобы Земля замерзала при потоке ~6% ниже нынешнего (0-D Будыко замерзает уже при 2–3%,
// 3-D модели — при 8–10%: Voigt & Marotzke 2010).
export function iceAlbedo(T, warm = 0.30, ice = 0.62) {
  const w = (1 + Math.tanh((T - 258.15) / 12)) / 2;
  return ice - (ice - warm) * w;
}

// Парниковый форсинг относительно современной Земли, Вт/м²
export function greenhouseForcing({ co2ppm = 420, ch4ppm = CH4_REF_PPM, pBar = 1.0 }) {
  const pCO2 = Math.max(1e-7, co2ppm * 1e-6 * pBar);
  const fCO2 = 5.35 * Math.log(pCO2 / CO2_REF_BAR);
  const fCH4 = Math.min(20, 2.5 * Math.log(1 + Math.max(0, ch4ppm - CH4_REF_PPM) / 5));
  const fP = 6 * Math.log(Math.max(0.05, pBar));
  return fCO2 + fCH4 + fP;
}

// Мягкий минимум: линейный закон Будыко плавно упирается в предел излучения влажной атмосферы
function softMin(x, lim, n = 8) {
  if (x <= 0) return x;
  return Math.pow(Math.pow(x, -n) + Math.pow(lim, -n), -1 / n);
}

// Константа A закона Будыко: подбирается так, чтобы современная Земля имела 15 °C
let A_OLR = null;
function olrWet(T, dF) { return softMin(A_OLR + B_OLR * (T - 273.15) - dF, OLR_LIM); }
(function calibrate() {
  const asr = (S_EARTH / 4) * (1 - iceAlbedo(288.15));
  // softMin(A + B·15) = asr  →  A + B·15 = (asr⁻⁸ − lim⁻⁸)^(−1/8)
  const lin = Math.pow(Math.pow(asr, -8) - Math.pow(OLR_LIM, -8), -1 / 8);
  A_OLR = lin - B_OLR * 15;
})();
export const A_OLR_CALIBRATED = A_OLR;
// Уходящее ИК-излучение влажной планеты, Вт/м² (для режима «Формулы» и проверок)
export function outgoingLongwave(T, dF) { return olrWet(T, dF); }

/**
 * Равновесие планеты с океаном (режим 1).
 * @returns { T, albedo, state: 'warm' | 'snowball' | 'runaway', asr }
 */
export function wetEquilibrium(S, gas, opts = {}) {
  const warm = opts.warmAlbedo ?? 0.30;
  const dF = greenhouseForcing(gas);
  const f = (T) => (S / 4) * (1 - iceAlbedo(T, warm)) - olrWet(T, dF);
  // Поглощение тёплой планеты выше предела излучения — океаны выкипают
  if ((S / 4) * (1 - warm) >= OLR_LIM) return { T: null, albedo: warm, state: 'runaway', asr: (S / 4) * (1 - warm) };
  // Ищем устойчивые корни f(T) = 0 (f убывает через ноль) от горячего края к холодному
  const Tmax = 1500, Tmin = 40, dT = 0.5;
  let prev = f(Tmax);
  for (let T = Tmax - dT; T >= Tmin; T -= dT) {
    const cur = f(T);
    if (cur > 0 && prev <= 0) {
      // корень между T и T + dT (f убывает при росте T) — уточняем бисекцией
      let lo = T, hi = T + dT;
      for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
      const Tr = (lo + hi) / 2;
      const alb = iceAlbedo(Tr, warm);
      return { T: Tr, albedo: alb, state: Tr < 263 ? 'snowball' : 'warm', asr: (S / 4) * (1 - alb) };
    }
    prev = cur;
  }
  // Устойчивого корня в диапазоне нет: планета промёрзла насквозь (поток ничтожен) — радиационное равновесие льда
  const Te = Math.pow((S / 4) * (1 - 0.62) / SIGMA, 0.25);
  return { T: Te, albedo: 0.62, state: 'snowball', asr: (S / 4) * 0.38 };
}

// Эффективная (равновесная) температура: σT_e⁴ = S/4·(1 − α)
export function effectiveTemp(S, albedo) { return Math.pow(Math.max(0, (S / 4) * (1 - albedo)) / SIGMA, 0.25); }

// Серая атмосфера: T_s = T_e·(1 + ¾τ)^¼
export function grayTemp(S, albedo, tau) { return effectiveTemp(S, albedo) * Math.pow(1 + 0.75 * Math.max(0, tau), 0.25); }

// Оптическая толщина плотной атмосферы (режим 2)
export function tauThick(pBar) { return KAPPA_THICK * pBar * pBar; }

// Оптическая толщина тонкой сухой атмосферы (режим 3): τ = τ₀·√(p/p₀)
export function tauThin(pBar, tau0, p0) { return pBar > 0 ? tau0 * Math.sqrt(pBar / p0) : 0; }

// Калибровки тонких атмосфер по сегодняшним температурам
export const THIN_CALIB = {
  mars: { tau0: 0.10, p0: 0.006 },   // T_s ≈ 214 K при T_e ≈ 210 K
  titan: { tau0: 0.71, p0: 1.45 },   // T_s ≈ 94 K при T_e ≈ 85 K
  kuiper: { tau0: 0.71, p0: 1.45 }   // азотно-метановые атмосферы карликовых планет — по аналогии с Титаном
};
