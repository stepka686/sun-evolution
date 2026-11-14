// Чёрная дыра Шварцшильда (5.3): траектории света и аккреционный диск. Эталон для шейдера gl/blackHoleGL.js.
// Единицы: радиус Шварцшильда r_s = 2GM/c² = 1, скорость света = 1.
//
// • Лучи света. Нулевые геодезические в плоскости движения подчиняются u'' + u = (3/2)·r_s·u² (u = 1/r).
//   Эквивалентная «ньютоновская» запись для численного счёта в 3D: x'' = −(3/2)·h²·x / r⁵, где h = |x × v| сохраняется
//   (стандартный приём для трассировки, даёт ту же орбиту фотона). Отсюда сами собой:
//     – тень: луч с прицельным параметром b < b_c = (3√3/2)·r_s ≈ 2.598 r_s падает в дыру (фотонная сфера 1.5 r_s);
//     – отклонение далёких лучей 2r_s/b (= 4GM/c²b, Эйнштейн 1915), кольцо Эйнштейна, вторичные образы диска.
// • Диск — тонкий, от последней устойчивой орбиты r_isco = 3 r_s. Температура (Shakura & Sunyaev 1973 с нулевым
//   моментом на внутреннем краю): T ∝ [r⁻³·(1 − √(r_isco/r))]^¼, максимум при r = (49/36)·r_isco.
// • Скорость вещества на орбите для статического наблюдателя v = √(M/(r − 2M)) = √(1/(2(r − 1))) — 0.5c на ISCO.
//   Сдвиг частоты g = √(1 − r_s/r) / (γ(1 − β·cosψ)) (гравитационный + доплеровский), яркость ∝ g⁴ («лучевое
//   усиление»): приближающаяся сторона диска заметно ярче и голубее удаляющейся. Поперёк (cosψ = 0) это даёт
//   точное g = √(1 − 3M/r) для круговой геодезической.

export const B_CRIT = 1.5 * Math.sqrt(3);
export const R_ISCO = 3;

/** Трассировка луча в плоскости: старт с x = −D, прицельный параметр b. Возвращает захват и угол отклонения */
export function traceRay(b, { D = 400, dt = 0.05, maxSteps = 40000 } = {}) {
  let x = -D, y = b, vx = 1, vy = 0;
  const h2 = b * b;               // h = |x × v| = b при |v| = 1
  const acc = (px, py) => { const r2 = px * px + py * py, r = Math.sqrt(r2); const k = -1.5 * h2 / (r2 * r2 * r); return [k * px, k * py]; };
  for (let i = 0; i < maxSteps; i++) {
    const r = Math.hypot(x, y);
    if (r < 1) return { captured: true, deflection: NaN };
    if (r > D * 1.05 && x * vx + y * vy > 0) break;
    // шаг меньше вблизи дыры
    const h = dt * Math.min(1, Math.max(0.02, (r - 0.8) / 4)) * (r > 30 ? r / 30 : 1);
    // RK4
    const a1 = acc(x, y);
    const x2 = x + 0.5 * h * vx, y2 = y + 0.5 * h * vy, v2x = vx + 0.5 * h * a1[0], v2y = vy + 0.5 * h * a1[1];
    const a2 = acc(x2, y2);
    const x3 = x + 0.5 * h * v2x, y3 = y + 0.5 * h * v2y, v3x = vx + 0.5 * h * a2[0], v3y = vy + 0.5 * h * a2[1];
    const a3 = acc(x3, y3);
    const x4 = x + h * v3x, y4 = y + h * v3y, v4x = vx + h * a3[0], v4y = vy + h * a3[1];
    const a4 = acc(x4, y4);
    x += h / 6 * (vx + 2 * v2x + 2 * v3x + v4x); y += h / 6 * (vy + 2 * v2y + 2 * v3y + v4y);
    vx += h / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]); vy += h / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
  }
  return { captured: false, deflection: Math.atan2(-vy, vx) };
}

/** Относительная температура диска на радиусе r (1 в максимуме) */
export function diskTemperature(r) {
  if (r <= R_ISCO) return 0;
  const f = Math.pow(r, -3) * (1 - Math.sqrt(R_ISCO / r));
  const rp = 49 / 36 * R_ISCO;
  const fmax = Math.pow(rp, -3) * (1 - Math.sqrt(R_ISCO / rp));
  return Math.pow(f / fmax, 0.25);
}

/** Скорость вещества на круговой орбите (в долях c) для статического наблюдателя */
export function orbitalBeta(r) { return Math.sqrt(1 / (2 * Math.max(1.01, r - 1))); }

/** Сдвиг частоты g = ν_набл/ν_изл; cosPsi — косинус угла между скоростью вещества и направлением на наблюдателя */
export function diskRedshift(r, cosPsi) {
  const b = orbitalBeta(r), gam = 1 / Math.sqrt(1 - b * b);
  return Math.sqrt(Math.max(0, 1 - 1 / r)) / (gam * (1 - b * cosPsi));
}
