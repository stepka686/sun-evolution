// Космические эффекты «Космоса»: кометы, пылевые оболочки AGB, диск обломков у белого карлика, подпись остатка сверхновой.
// Всё рисуется в системе координат звезды (а.е. → пиксели: baseScaleAU, наклон камеры: pitchCos).
import { S } from '../state.js';
import { getTrackMarks } from '../model/timeline.js';

// ---------- кометы ----------
// Элементы орбит (а.е.): комета Галлея, комета Энке и долгопериодическая вроде Хейла — Боппа
const COMETS = [
  { name: 'Галлея', a: 17.83, e: 0.967, w: 1.94, phase: 0.0 },
  { name: 'Энке', a: 2.22, e: 0.848, w: 3.25, phase: 0.4 },
  { name: 'долгопериодическая', a: 186, e: 0.995, w: 2.27, phase: 0.7 }
];

// Уравнение Кеплера E − e·sin E = M (метод Ньютона)
function keplerE(M, e) {
  let E = e > 0.8 ? Math.PI : M;
  for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
}

/**
 * Кометы: хвост появляется внутри «снеговой линии» — где равновесная температура выше ~150 K (водяной лёд сублимирует):
 * T = 278 K · L^¼ / √r  ⇒  r_снег ≈ 3.4·√L а.е. У красного гиганта кометы оживают в поясе Койпера.
 * Ионный хвост — прямо от звезды (его несёт солнечный ветер), пылевой — изогнут против движения.
 * При потере массы звездой орбиты расширяются (a ∝ 1/M), а комета с перигелием внутри звезды гибнет.
 */
export function drawComets(ctx, state, baseScaleAU, pitchCos, now, camZoom) {
  if (S.isDeepTime || state.l <= 0 || state.t < 0) return;
  const stages = S.currentDynamicStages || [];
  const M0 = (stages.find(s => s.t >= 0) || { mass: state.mass }).mass;
  const grow = M0 / Math.max(0.05, state.mass);
  const rSnow = 3.4 * Math.sqrt(state.l);
  const rStarAU = state.r / 215.03;
  ctx.save();
  for (const c of COMETS) {
    const a = c.a * grow, q = a * (1 - c.e);
    if (q < rStarAU * 1.2) continue;                     // перигелий внутри звезды: комета давно погибла
    // видимый период сжат (иначе Галлея пролетала бы раз в 76 лет); соотношение периодов сохранено качественно
    const Pvis = 26000 * Math.pow(c.a / 17.83, 0.35);
    const M = (2 * Math.PI * (now / Pvis + c.phase)) % (2 * Math.PI);
    const E = keplerE(M, c.e);
    const r = a * (1 - c.e * Math.cos(E));
    const nu = 2 * Math.atan2(Math.sqrt(1 + c.e) * Math.sin(E / 2), Math.sqrt(1 - c.e) * Math.cos(E / 2));
    const th = nu + c.w;
    const x = Math.cos(th) * r * baseScaleAU, y = Math.sin(th) * r * baseScaleAU * pitchCos;
    const ux = Math.cos(th), uy = Math.sin(th) * pitchCos;                    // направление от звезды
    const vx = -Math.sin(th), vy = Math.cos(th) * pitchCos;                   // направление движения
    const act = r < rSnow ? Math.min(1, Math.pow((rSnow - r) / rSnow, 0.6) * 1.4) : 0;
    // орбита
    ctx.strokeStyle = 'rgba(148,163,184,0.12)'; ctx.lineWidth = 0.8 / camZoom; ctx.setLineDash([2 / camZoom, 5 / camZoom]);
    ctx.beginPath();
    const b = a * Math.sqrt(1 - c.e * c.e), cxo = -a * c.e;
    for (let k = 0; k <= 96; k++) {
      const t = (k / 96) * 2 * Math.PI, ox = cxo + a * Math.cos(t), oy = b * Math.sin(t);
      const X = (ox * Math.cos(c.w) - oy * Math.sin(c.w)) * baseScaleAU, Y = (ox * Math.sin(c.w) + oy * Math.cos(c.w)) * baseScaleAU * pitchCos;
      if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (act > 0.02) {
      // длина хвоста растёт с потоком L/r²
      const tail = Math.min(8, 0.9 * Math.sqrt(state.l) / Math.max(0.05, r)) * act * baseScaleAU;
      ctx.globalCompositeOperation = 'lighter';
      const ion = ctx.createLinearGradient(x, y, x + ux * tail, y + uy * tail);
      ion.addColorStop(0, `rgba(125,180,255,${(0.55 * act).toFixed(2)})`); ion.addColorStop(1, 'rgba(125,180,255,0)');
      ctx.strokeStyle = ion; ctx.lineWidth = 1.6 / camZoom;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + ux * tail, y + uy * tail); ctx.stroke();
      const dust = ctx.createLinearGradient(x, y, x + ux * tail * 0.8, y + uy * tail * 0.8);
      dust.addColorStop(0, `rgba(255,240,200,${(0.5 * act).toFixed(2)})`); dust.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.strokeStyle = dust; ctx.lineWidth = 3.5 / camZoom;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + ux * tail * 0.4 - vx * tail * 0.15, y + uy * tail * 0.4 - vy * tail * 0.15, x + ux * tail * 0.75 - vx * tail * 0.35, y + uy * tail * 0.75 - vy * tail * 0.35);
      ctx.stroke();
      const coma = ctx.createRadialGradient(x, y, 0, x, y, (3 + 6 * act) / camZoom);
      coma.addColorStop(0, `rgba(220,240,255,${(0.8 * act).toFixed(2)})`); coma.addColorStop(1, 'rgba(220,240,255,0)');
      ctx.fillStyle = coma; ctx.beginPath(); ctx.arc(x, y, (3 + 6 * act) / camZoom, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(203,213,225,0.9)';
    ctx.beginPath(); ctx.arc(x, y, 1.2 / camZoom, 0, Math.PI * 2); ctx.fill();
    if (act > 0.3) { ctx.font = `${(10 / camZoom).toFixed(3)}px sans-serif`; ctx.fillStyle = 'rgba(186,230,253,0.7)'; ctx.fillText(`комета ${c.name}`, x + 5 / camZoom, y - 5 / camZoom); }
  }
  ctx.restore();
}

// ---------- пылевые оболочки AGB ----------
/**
 * На асимптотической ветви гигантов звезда теряет массу ветром ~15 км/с, а тепловые вспышки в гелиевом слое
 * выбрасывают оболочки раз в 10⁴–10⁵ лет: вокруг звезды — концентрические пылевые кольца (как у IRC+10216 и R Скульптора).
 */
export function drawAGBShells(ctx, state, baseScaleAU, pitchCos, now, camZoom) {
  const isAGB = state.phase === 5 || /AGB|асимптот/i.test(state.name || '');
  if (!isAGB || state.r < 50) return;
  ctx.save(); ctx.scale(1, pitchCos);
  ctx.globalCompositeOperation = 'lighter';
  const rStar = state.r / 215.03 * baseScaleAU;
  for (let i = 0; i < 6; i++) {
    const f = ((now / 9000) + i / 6) % 1;
    const R = rStar * (1.4 + f * 9);
    const a = 0.22 * (1 - f) * (i % 2 ? 0.6 : 1);
    ctx.strokeStyle = `rgba(251,191,140,${a.toFixed(3)})`; ctx.lineWidth = (2 + 6 * f) / camZoom;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

// ---------- белый карлик: диск обломков у предела Роша ----------
/**
 * Предел Роша для жидкого тела: d = 2.44·R★·(ρ★/ρ)^⅓. У красного гиганта ρ★ ничтожна и d < R★ — планеты поглощаются целиком,
 * не успев разорваться. У белого карлика (ρ ~ 10⁶ г/см³) d ≈ 1 R☉: астероиды, заброшенные внутрь, рвутся в пыльный диск —
 * так «загрязняются» тяжёлыми элементами атмосферы белых карликов (WD 1145+017).
 */
export function rocheLimitAU(state, rhoBody = 3.0) {
  const rCm = state.r * 6.957e10;
  const rho = state.mass * 1.989e33 / (4 / 3 * Math.PI * rCm * rCm * rCm);
  return 2.44 * state.r * Math.cbrt(rho / rhoBody) / 215.03;
}

export function drawWDDebrisDisk(ctx, state, baseScaleAU, pitchCos, now, camZoom) {
  if (!(state.r < 0.03 && state.mass < 1.44 && state.mass > 0.1) || S.isDeepTime && state.temp < 3000) return;
  const dR = rocheLimitAU(state);
  const Rpx = Math.max(dR * baseScaleAU, 7 / camZoom);
  ctx.save(); ctx.scale(1, pitchCos);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const ang = i * 2.39996 + now * 0.0004 * (1 + (i % 5) * 0.1);
    const rr = Rpx * (0.7 + 0.6 * ((i * 0.618) % 1));
    ctx.fillStyle = `rgba(253,230,190,${(0.25 + 0.35 * ((i * 0.37) % 1)).toFixed(2)})`;
    ctx.fillRect(Math.cos(ang) * rr, Math.sin(ang) * rr, 1.2 / camZoom, 1.2 / camZoom);
  }
  ctx.restore();
  if (camZoom > 2) {
    ctx.font = `${(10 / camZoom).toFixed(3)}px sans-serif`; ctx.fillStyle = 'rgba(253,230,190,0.7)';
    ctx.fillText(`диск обломков у предела Роша (${(dR * 215.03).toFixed(2)} R☉)`, Rpx + 4 / camZoom, -Rpx * pitchCos);
  }
}

// ---------- остаток сверхновой (подпись) ----------
/** Радиус остатка: свободный разлёт ~10 000 км/с, затем фаза Седова — Тейлора R ≈ 0.31 пк·(E₅₁/n)^⅕·t^⅖ (t в годах) */
export function remnantRadiusPc(years) {
  if (years <= 0) return 0;
  const free = 0.0102 * years;
  const sedov = 0.31 * Math.pow(years, 0.4);
  return years < 200 ? free : Math.min(free, sedov);
}

export function drawRemnantLabel(ctx, state, w, h) {
  const m = getTrackMarks();
  if (m.sn === undefined || state.t < m.sn) return;
  const years = (state.t - m.sn) * 1e9;
  if (years > 1e6) return;
  const R = remnantRadiusPc(years);
  const txt = `Остаток сверхновой: ${years < 1000 ? years.toFixed(0) : (years / 1000).toFixed(1) + ' тыс.'} лет, радиус ${R < 0.1 ? (R * 206265).toFixed(0) + ' а.е.' : R.toFixed(1) + ' пк'} (${years < 200 ? 'свободный разлёт' : 'Седов — Тейлор, R ∝ t^0.4'})`;
  ctx.save(); ctx.font = '12px sans-serif';
  const tw = ctx.measureText(txt).width;
  ctx.fillStyle = 'rgba(2,6,23,0.6)'; ctx.fillRect(w / 2 - tw / 2 - 8, h - 46, tw + 16, 22);
  ctx.fillStyle = 'rgba(186,230,253,0.95)'; ctx.textAlign = 'center'; ctx.fillText(txt, w / 2, h - 30);
  ctx.restore();
}
