// Звёздная физика: Стефан — Больцман, времена жизни, белые карлики (чистые функции)

// ===================== ФИЗИЧЕСКИЕ ХЕЛПЕРЫ =====================
export const T_SUN_EFF = 5772; // K (IAU 2015)

export const BROWN_DWARF_LIMIT = 0.075; // M☉ — предел горения водорода

// Закон Стефана — Больцмана в солнечных единицах: L/L☉ = (R/R☉)² (T/T☉)⁴
export function lumFromRT(r, temp) { return r * r * Math.pow(temp / T_SUN_EFF, 4); }

export function tempFromLR(l, r) { return T_SUN_EFF * Math.pow(Math.max(1e-30, l) / Math.max(1e-30, r * r), 0.25); }

// Лог-интерполяция по таблице [[x, y], ...]
export function logInterpTable(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i], [x1, y1] = table[i + 1];
    if (x <= x1) {
      const f = (Math.log(x) - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
      return Math.exp(Math.log(y0) + f * (Math.log(y1) - Math.log(y0)));
    }
  }
  return table[table.length - 1][1];
}

// Полное время жизни красных карликов, млрд лет (аппроксимация по Laughlin, Bodenheimer & Adams 1997)
export function redDwarfLifetimeGyr(m) {
  return logInterpTable([[0.075, 12000], [0.10, 6000], [0.16, 2500], [0.25, 1000], [0.35, 400], [0.45, 130]], m);
}

// Время жизни массивных звёзд (M ≥ 8 M☉), млрд лет. Простое M^-2.5 при больших массах врёт в разы,
// т.к. L ∝ M^~1.5 у верхнего края: аппроксимация t ≈ 2.5 + 29·(M/10)^-2 млн лет (≈ 7 млн лет для 25 M☉, ≈ 3 для 100 M☉)
export function massiveLifetimeGyr(m) {
  return (2.5 + 29.0 * Math.pow(Math.max(8.0, m) / 10.0, -2.0)) / 1000.0;
}

// Соотношение начальной и конечной массы белого карлика (Cummings et al. 2018)
export function wdMassFromInitial(mi) {
  let mf;
  if (mi < 2.85) mf = 0.080 * mi + 0.489;
  else if (mi < 3.60) mf = 0.187 * mi + 0.184;
  else mf = 0.107 * mi + 0.471;
  return Math.min(1.36, mf);
}

// Радиус вырожденного карлика (формула Науэнберга, μe = 2), R☉
export function wdRadius(mwd) {
  const x = Math.min(0.995, mwd / 1.44);
  return 0.0112 * Math.pow(x, -1 / 3) * Math.sqrt(1 - Math.pow(x, 4 / 3));
}

// Приводит светимость стадии к закону Стефана — Больцмана (кроме помеченных noSB: сверхновые, ЧД, протозвёзды)
export function enforceSB(stages) {
  return stages.map(s => (s.noSB ? s : { ...s, l: Number(lumFromRT(s.r, s.temp).toPrecision(4)) }));
}

export function wdTempAtCoolingAge(tauGyr) { return 11000 * Math.pow(Math.max(1e-3, tauGyr) / 0.5, -0.35); }

export function wdCoolingAgeAtTemp(temp) { return 0.5 * Math.pow(temp / 11000, -1 / 0.35); }
