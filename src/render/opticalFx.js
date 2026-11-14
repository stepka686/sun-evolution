// Оптические явления на небе: радуги (капли), гало и ложные солнца (кристаллы), красная Луна в затмении.
// Кольца строятся в изотропном угловом масштабе вокруг звезды или антисолнечной точки (как их видит глаз).
import { BOW_WAVELENGTHS, MEDIA, bowRadius, haloRadius, parhelionOffset } from '../physics/refraction.js';
import { spectralRGB } from '../physics/optics.js';

const TWO_PI = Math.PI * 2;

const css = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const toSrgb = (rgb) => rgb.map(v => 255 * Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055));
const LUM = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Профиль цветной полосы по углу θ: каждая длина волны даёт свой пик на угле θ(λ), размытый диском звезды (σ);
 * у гало — резкий внутренний край и хвост наружу (кристаллы ориентированы случайно, отклонение ≥ минимального).
 * Полосы рисуются кольцами, цвет — сумма спектральных вкладов, поэтому в середине радуги цвета смешиваются, как в природе.
 */
const bandCache = new Map();
function bandProfile(key, radiusAt, sigma, tail) {
  const ck = `${key}|${sigma.toFixed(4)}|${tail}`;
  if (bandCache.has(ck)) return bandCache.get(ck);
  const th = BOW_WAVELENGTHS.map(l => radiusAt(l)).filter(x => x !== null);
  if (!th.length) return null;
  const spec = BOW_WAVELENGTHS.map(l => spectralRGB(l));
  const lo = Math.min(...th) - 3 * sigma, hi = Math.max(...th) + (tail ? 4 * tail : 3 * sigma);
  const N = 70, rows = [];
  let peak = 1e-12;
  for (let i = 0; i <= N; i++) {
    const t = lo + (hi - lo) * i / N;
    const c = [0, 0, 0];
    BOW_WAVELENGTHS.forEach((l, j) => {
      const tl = radiusAt(l); if (tl === null) return;
      const d = t - tl;
      const wgt = tail && d > 0 ? Math.exp(-d / tail) : Math.exp(-0.5 * (d / sigma) ** 2);
      for (let k = 0; k < 3; k++) c[k] += spec[j][k] * wgt;
    });
    rows.push({ t, c }); peak = Math.max(peak, LUM(c));
  }
  const out = { rows: rows.map(r => ({ t: r.t, c: toSrgb(r.c.map(v => v / peak)), a: Math.min(1, LUM(r.c) / peak) })), dt: (hi - lo) / N };
  if (bandCache.size > 40) bandCache.clear();
  bandCache.set(ck, out);
  return out;
}

// кольца рисуются в изотропном масштабе вокруг центра на экране (как увидел бы глаз), обрезаются горизонтом
function drawBand(ctx, cx, cy, k, prof, alpha) {
  const lw = Math.max(1, prof.dt * k + 0.6);
  for (const r of prof.rows) {
    if (r.a < 0.02 || r.t <= 0) continue;
    ctx.strokeStyle = css(r.c, alpha * r.a); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(cx, cy, r.t * k, 0, TWO_PI); ctx.stroke();
  }
}

/**
 * Радуга: центр — антисолнечная точка (на h☉ ниже горизонта). Первичная (1 отражение, красный снаружи) и вторичная
 * (2 отражения, порядок цветов обратный), светлое небо внутри первичной и тёмная полоса Александра между ними.
 */
export function drawRainbow(ctx, o) {
  const m = MEDIA[o.medium];
  const k = o.pxPerRad, cx = o.cx, cy = o.horizonY + o.sunAlt * k;
  const sig = o.sunAngR + 0.004;
  const p1 = bandProfile(o.medium + '1', (l) => bowRadius(m.n(l), 1), sig, 0);
  const p2 = bandProfile(o.medium + '2', (l) => bowRadius(m.n(l), 2), sig * 1.4, 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, o.w, o.horizonY); ctx.clip();
  // стена дождя за радугой темнее неба — на ней и видны цвета
  const rOut = bowRadius(m.n(550), 2) * k * 1.12;
  const wall = ctx.createRadialGradient(cx, cy, 0, cx, cy, rOut);
  wall.addColorStop(0, `rgba(25,32,48,${0.10 * o.alpha})`); wall.addColorStop(0.8, `rgba(25,32,48,${0.22 * o.alpha})`); wall.addColorStop(1, 'rgba(25,32,48,0)');
  ctx.fillStyle = wall; ctx.beginPath(); ctx.arc(cx, cy, rOut, 0, TWO_PI); ctx.fill();
  // светлое небо внутри первичной дуги (лучи с отклонением больше минимального), тёмная полоса Александра — между дугами
  const rIn = bowRadius(m.n(550), 1) * k;
  const g = ctx.createRadialGradient(cx, cy, rIn * 0.45, cx, cy, rIn * 0.97);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(235,240,255,${0.12 * o.alpha})`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rIn, 0, TWO_PI); ctx.fill();
  if (p1) drawBand(ctx, cx, cy, k, p1, 0.55 * o.alpha);
  if (p2) drawBand(ctx, cx, cy, k, p2, 0.2 * o.alpha);
  ctx.restore();
}

/** Гало 22° (лёд H₂O) или ~29° (лёд CO₂ на Марсе): красный край внутри, белёсый хвост наружу; ложные солнца по бокам */
export function drawHalo(ctx, o) {
  const m = MEDIA[o.medium];
  const k = o.pxPerRad;
  const prof = bandProfile(o.medium + 'h', (l) => haloRadius(m.n(l)), o.sunAngR + 0.002, 0.03);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, o.w, o.horizonY); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  // настоящее гало — бледное кольцо, заметное, только если присмотреться (яркость ~10 % фона неба)
  if (prof) drawBand(ctx, o.sunX, o.sunY, k, prof, 0.07 * o.alpha);
  // ложные солнца: кристаллы-пластинки на высоте звезды; при высоте > 60° их нет
  if (o.sunAlt < 1.0) {
    const pp = bandProfile(o.medium + 'p' + o.sunAlt.toFixed(2), (l) => parhelionOffset(m.n(l), Math.max(0, o.sunAlt)), o.sunAngR + 0.002, 0.02);
    if (pp) for (const side of [-1, 1]) for (const r of pp.rows) {
      if (r.a < 0.03 || r.t <= 0) continue;
      const x = o.sunX + side * r.t * Math.cos(o.sunAlt) * k, rr = Math.max(1.5, 0.012 * k);
      const gg = ctx.createRadialGradient(x, o.sunY, 0, x, o.sunY, rr);
      gg.addColorStop(0, css(r.c, 0.10 * o.alpha * r.a)); gg.addColorStop(1, css(r.c, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(x, o.sunY, rr, rr * 0.8, 0, 0, TWO_PI); ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Лунное затмение. Свет в тень Земли попадает только через лимб её атмосферы: луч по касательной проходит
 * две горизонтальные воздушные массы (вход и выход), поэтому пропускание — T(λ)², где T — цвет заходящей звезды
 * из той же модели рассеяния. Отсюда медно-красная Луна; после извержений (больше аэрозоля) она темнее и краснее.
 * lunarShadow — доли диска Луны в умбре и полутени; eclipsedMoonColor — нормированный цвет (линейные RGB).
 */
export function lunarShadow(sepRad, moonAngR, umbraR, penR) {
  const inU = Math.max(0, Math.min(1, (umbraR + moonAngR - sepRad) / (2 * moonAngR)));
  const inP = Math.max(0, Math.min(1, (penR + moonAngR - sepRad) / (2 * moonAngR)));
  return { umbra: inU, penumbra: inP };
}

export function eclipsedMoonColor(directAtHorizon) {
  const t2 = directAtHorizon.map(v => v * v);
  const m = Math.max(...t2, 1e-30);
  return t2.map(v => v / m);
}

/**
 * Луна в затмении: диск радиуса R с полутенью и тенью. Положение тени — в радиусах Луны (dx, dy, uR, pR).
 * В умбре — цвет света, прошедшего сквозь лимб атмосферы.
 */
export function drawEclipsedMoon(ctx, x, y, R, sh, moonColor) {
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, R, 0, TWO_PI); ctx.clip();
  ctx.fillStyle = moonColor; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  // моря
  ctx.fillStyle = 'rgba(60,64,78,0.35)';
  for (const [a, b, c] of [[-0.3, -0.25, 0.32], [0.15, -0.35, 0.22], [0.25, 0.1, 0.2], [-0.1, 0.3, 0.16]]) { ctx.beginPath(); ctx.arc(x + a * R, y + b * R, c * R, 0, TWO_PI); ctx.fill(); }
  const sx = x + sh.dx * R, sy = y + sh.dy * R;
  const pg = ctx.createRadialGradient(sx, sy, sh.uR * R, sx, sy, sh.pR * R);
  pg.addColorStop(0, 'rgba(4,4,8,0.72)'); pg.addColorStop(1, 'rgba(4,4,8,0)');
  ctx.fillStyle = pg; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  if (sh.umbra > 0) {
    const c = sh.color.map(v => 255 * Math.pow(v, 1 / 2.2));
    const ug = ctx.createRadialGradient(sx, sy, 0, sx, sy, sh.uR * R);
    // к центру тени темнее (свет прошёл через более низкие, плотные слои), к краю — светлее и рыжее
    ug.addColorStop(0, `rgb(${c[0] * 0.28 | 0},${c[1] * 0.2 | 0},${c[2] * 0.2 | 0})`);
    ug.addColorStop(0.8, `rgb(${c[0] * 0.5 | 0},${c[1] * 0.38 | 0},${c[2] * 0.34 | 0})`);
    ug.addColorStop(0.97, `rgb(${c[0] * 0.72 | 0},${c[1] * 0.6 | 0},${c[2] * 0.52 | 0})`);
    ug.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ug; ctx.beginPath(); ctx.arc(sx, sy, sh.uR * R, 0, TWO_PI); ctx.fill();
  }
  ctx.restore();
}
