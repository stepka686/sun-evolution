// Небо 5.2: спектральная модель рассеяния в сферической атмосфере. Эталон на JS — по нему считаются экспозиция,
// рассеянный свет на грунте и тесты; шейдер gl/skyGL.js повторяет её для каждого пикселя.
//
// • 8 длин волн 410…690 нм вместо трёх каналов RGB: цвет собирается через кривые чувствительности глаза CIE 1931 —
//   так уходит сиреневый оттенок трёхканальной модели, и закат получает настоящие оранжево-красные переходы.
// • Атмосфера — сферический слой: луч взгляда проходит через неё по шагам, и в каждой точке считается, дошёл ли туда
//   свет звезды. Оптическая толща до звезды — функция Чепмена (приближение Шюлера, GPU Pro 3, 2012); если луч к звезде
//   упирается в планету, точка в её тени. Отсюда тень Земли на востоке после заката и розовый «пояс Венеры» над ней.
// • Многократное рассеяние — изотропная добавка (в духе Hillaire 2020): каждая точка дополнительно освещена
//   рассеянным светом выше лежащих слоёв, поэтому сумерки светятся и после захода звезды за горизонт.
// • Озон — тонкий слой на ~25 км: на длинном пути сумеречного луча он съедает оранжевый — «синий час» (Hulburt 1953).
// • Свечение верхней атмосферы (кислород 557.7 нм, ~90 км) — ярче к горизонту из-за длинного пути (ван Рейн).
import { LAMBDA_NM } from './optics.js';

export const SKY_LAMBDA = [410, 450, 490, 530, 570, 610, 650, 690];
const D_LAMBDA = 40;

const gauss = (x, m, s1, s2) => { const t = (x - m) / (x < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
const cieX = (l) => 1.056 * gauss(l, 599.8, 37.9, 31.0) + 0.362 * gauss(l, 442.0, 16.0, 26.7) - 0.065 * gauss(l, 501.1, 20.4, 26.2);
const cieY = (l) => 0.821 * gauss(l, 568.8, 46.9, 40.5) + 0.286 * gauss(l, 530.9, 16.3, 31.1);
const cieZ = (l) => 1.217 * gauss(l, 437.0, 11.8, 36.0) + 0.681 * gauss(l, 459.0, 26.0, 13.8);
const planck = (lnm, T) => { const l = lnm * 1e-9; return 1 / (Math.pow(l, 5) * (Math.exp(1.4388e-2 / (l * T)) - 1)); };
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// вклад каждой из 8 длин волн в линейный sRGB; нормировка — спектр Солнца (5772 K) даёт белый
const M_RAW = SKY_LAMBDA.map(l => {
  const X = cieX(l) * D_LAMBDA, Y = cieY(l) * D_LAMBDA, Z = cieZ(l) * D_LAMBDA;
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z];
});
const WHITE = [0, 1, 2].map(k => SKY_LAMBDA.reduce((s, l, i) => s + planck(l, 5772) * M_RAW[i][k], 0));
export const SKY_M = M_RAW.map(m => m.map((v, k) => v / WHITE[k]));

/** Спектр → линейный sRGB */
export function spectrumToRGB(L) {
  const c = [0, 0, 0];
  for (let i = 0; i < 8; i++) for (let k = 0; k < 3; k++) c[k] += L[i] * SKY_M[i][k];
  return c.map(v => Math.max(0, v));
}

const PLANET_R = { earth: 6371, venus: 6052, mars: 3390, titan: 2575, europa: 1561, pluto: 1188, eris: 1163, haumea: 800, makemake: 715, mercury: 2440, uranus: 25362, neptune: 24622 };
const interp3 = (rgb, l) => {
  // значения в каналах R/G/B заданы на LAMBDA_NM (610, 550, 465) — линейно между ними, за краями — постоянно
  const [lr, lg, lb] = LAMBDA_NM;
  if (l <= lb) return rgb[2];
  if (l <= lg) return rgb[2] + (rgb[1] - rgb[2]) * (l - lb) / (lg - lb);
  if (l <= lr) return rgb[1] + (rgb[0] - rgb[1]) * (l - lg) / (lr - lg);
  return rgb[0];
};

/**
 * Параметры неба для планеты: оптика (atmosphereOptics), шкала высот газа, звезда (T★, её RGB-поток F).
 * Возвращает всё в километрах и в 8 спектральных каналах.
 */
export function buildSkyParams(planet, optics, opts) {
  const { starT, F, Hgas = 8, cityGlow = 0, airglow = 0 } = opts;
  const R = PLANET_R[planet] || 6371;
  const tauR = SKY_LAMBDA.map(l => optics.tauR * Math.pow(550 / l, 4));
  const aer = optics.aer;
  // Ангстрём: мелкая дымка Земли — показатель 1.3, крупная пыль Марса — серая, толины Титана — ~1
  const ang = optics.kind === 'dust' ? 0 : optics.kind === 'haze' ? 1.0 : 1.3;
  const tauA = SKY_LAMBDA.map(l => aer ? aer.tau * Math.pow(550 / l, ang) : 0);
  const wA = SKY_LAMBDA.map(l => aer ? interp3(aer.w, l) : 1);
  const gA = SKY_LAMBDA.map(l => aer ? interp3(aer.g, l) : 0);
  // озон Шаппюи: максимум около 600 нм
  const oz = SKY_LAMBDA.map(l => (optics.ozone || 0) * 0.05 * Math.exp(-0.5 * ((l - 600) / 55) ** 2));
  const Ha = optics.kind === 'dust' ? Hgas : optics.kind === 'haze' ? Math.max(Hgas, 40) : 1.2;
  // спектр звезды — Планк при её температуре, яркость — как у RGB-потока F
  const B = SKY_LAMBDA.map(l => planck(l, starT));
  const yB = lum(spectrumToRGB(B)), yF = lum(F);
  const Fs = B.map(b => b * yF / Math.max(1e-30, yB));
  return { R, H: Hgas, Ha, tauR, tauA, wA, gA, oz, F: Fs, top: Math.max(10 * Hgas, 6 * Ha), cityGlow, airglow };
}

/**
 * Функция Чепмена — во сколько раз путь сквозь экспоненциальную атмосферу под зенитным углом длиннее вертикального.
 * Приближение для μ ≥ 0: Ch ≈ c / ((c − 1)μ + 1), c = √(πX/2) (точно в зените и у горизонта, Schüler 2012);
 * для луча вниз (μ < 0): Ch(X, μ) = 2·√(πx₀/2)·e^(X − x₀) − Ch(X, −μ), x₀ = X·√(1 − μ²) — путь через «перигей».
 * X = r/H (радиус точки в шкалах высот), h — высота над поверхностью в шкалах; результат уже умножен на e^(−h).
 */
export function chapman(X, h, cosZ) {
  const x = X + h;
  const up = (mu) => { const c = Math.sqrt(Math.PI * x / 2); return c / ((c - 1) * mu + 1); };
  if (cosZ >= 0) return up(cosZ) * Math.exp(-h);
  const x0 = x * Math.sqrt(1 - cosZ * cosZ);
  return (2 * Math.sqrt(Math.PI * x0 / 2) * Math.exp(Math.min(60, x - x0)) - up(-cosZ)) * Math.exp(-h);
}

const hg = (g, c) => (1 - g * g) / Math.pow(1 + g * g - 2 * g * c, 1.5);
// двухчленная ХГ: узкий дифракционный пик + широкий фон, средний косинус = g (Kattawar 1975)
export function aerosolPhase(g, c) {
  const g1 = Math.min(0.93, g + 0.2), g2 = 0.3 * g;
  const w = (g - g2) / Math.max(1e-3, g1 - g2);
  const p = w * hg(g1, c) + (1 - w) * hg(g2, c);
  return p / (1 + p / 40);           // мягкий предел — центр ореола не уходит в бесконечность
}

/**
 * Пропускание от точки (радиус r, косинус зенитного угла звезды mu) до звезды, 8 каналов; 0 — точка в тени планеты
 */
export function sunTransmittance(P, r, mu, out = new Array(8)) {
  const h = r - P.R;
  // тень планеты: луч к звезде проходит ближе к центру, чем радиус планеты
  if (mu < 0 && r * Math.sqrt(1 - mu * mu) < P.R) { out.fill(0); return out; }
  const chR = chapman(P.R / P.H, h / P.H, mu), chA = chapman(P.R / P.Ha, h / P.Ha, mu);
  // озоновый слой на 25 км — тонкая оболочка
  const rl = P.R + 25;
  let ozM = 0;
  const s = r * Math.sqrt(Math.max(0, 1 - mu * mu)) / rl;
  if (s < 1) { const cl = Math.sqrt(1 - s * s); ozM = r < rl ? 1 / cl : mu < 0 ? 2 / cl : 0; }
  for (let i = 0; i < 8; i++) out[i] = Math.exp(-(P.tauR[i] * chR + P.tauA[i] * chA + P.oz[i] * ozM));
  return out;
}

/**
 * Яркость неба (линейный sRGB, в единицах потока звезды — как у optics.skyRadiance) в направлении (высота hView)
 * при высоте звезды hSun и угловом расстоянии γ от неё (cosG). N — число шагов вдоль луча.
 */
export function skySpectral(P, hView, hSun, cosG, N = 16) {
  const r0 = P.R + 0.002;
  const muV = Math.sin(Math.max(-0.02, hView));
  // длина луча до верха атмосферы (или до грунта)
  const rTop = P.R + P.top;
  const b = r0 * muV, cTop = r0 * r0 - rTop * rTop;
  let tMax = -b + Math.sqrt(Math.max(0, b * b - cTop));
  const dGround = b * b - (r0 * r0 - P.R * P.R);
  if (muV < 0 && dGround > 0) tMax = Math.min(tMax, -b - Math.sqrt(dGround));
  const L = new Array(8).fill(0), Tv = new Array(8).fill(1), Ts = new Array(8);
  const pR = 0.75 * (1 + cosG * cosG);
  const pA = P.gA.map(g => aerosolPhase(g, cosG));
  const sinV = Math.cos(Math.max(-0.02, hView)), muS = Math.sin(hSun), sinS = Math.cos(hSun);
  let tPrev = 0;
  for (let k = 0; k < N; k++) {
    const t = tMax * Math.pow((k + 1) / N, 2);       // шаги гуще у наблюдателя, где воздух плотнее
    const tm = 0.5 * (t + tPrev), dt = t - tPrev; tPrev = t;
    // положение точки: в плоскости «вертикаль — луч взгляда»; звезда — под углом γ к лучу
    const px = tm * sinV, pz = r0 + tm * muV;
    const r = Math.hypot(px, pz);
    const h = r - P.R;
    // косинус зенитного угла звезды в этой точке: локальная вертикаль (px, pz)/r, направление на звезду
    // раскладываем: вертикальная часть muS, горизонтальная — проекция на направление взгляда (cosG − muV·muS)/sinV
    const horizS = sinV > 1e-4 ? (cosG - muV * muS) / sinV : 0;
    const mu = (px * horizS + pz * muS) / r;
    sunTransmittance(P, r, Math.max(-1, Math.min(1, mu)), Ts);
    const dR = Math.exp(-h / P.H) / P.H, dA = Math.exp(-h / P.Ha) / P.Ha;
    // многократное рассеяние: свет, рассеянный выше лежащими (ещё освещёнными) слоями — сумеречное свечение
    // освещающий свет приходит отчасти сверху, где луч звезды ещё не покраснел: смесь пропускания здесь и на 2 шкалы выше
    const up = 2 * P.H;
    const TsUp = sunTransmittance(P, r + up, Math.max(-1, Math.min(1, mu)), new Array(8));
    for (let i = 0; i < 8; i++) {
      const bR = P.tauR[i] * dR, bA = P.tauA[i] * dA;
      const tauTot = P.tauR[i] + P.tauA[i];
      const ms = 0.3 * Math.min(1, tauTot) * (P.tauR[i] + P.tauA[i] * P.wA[i]) / Math.max(1e-6, tauTot) * (0.45 * Ts[i] + 0.55 * TsUp[i]);
      const ss = Ts[i] * (bR * pR + bA * P.wA[i] * pA[i]);
      L[i] += P.F[i] * Tv[i] * (ss + (bR + bA * P.wA[i]) * ms) * dt;
      Tv[i] *= Math.exp(-(bR + bA) * dt);
    }
  }
  const c = spectrumToRGB(L);
  return c;
}
