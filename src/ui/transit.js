// Панель «Транзит»: выбранная планета проходит по диску звезды, рядом — кривая блеска.
//  глубина δ ≈ (Rp/R★)² с потемнением к краю (квадратичный закон, u₁ = 0.4, u₂ = 0.26 — типично для звёзд типа Солнца);
//  период P = a^1.5 / √M★ лет; длительность (центральный транзит) T ≈ (P/π)·arcsin((R★ + Rp)/a).
// У белого карлика вместо одной планеты — обломки у предела Роша: неровные глубокие провалы, как у WD 1145+017.
import { S } from '../state.js';
import { getCustomExo } from '../model/exoplanets.js';
import { getPlanetDistanceAU } from '../physics/orbits.js';
import { blackbodyCss } from '../physics/optics.js';
import { rocheLimitAU } from '../render/cosmic.js';

// Радиусы планет в R☉ (R⊕ = 0.009168 R☉); у Европы и Титана на панели — их хозяева, Юпитер и Сатурн
const R_PLANET = { mercury: 0.00350, venus: 0.00870, earth: 0.009168, mars: 0.00488, europa: 0.1005, titan: 0.0837, uranus: 0.0365, neptune: 0.0354, pluto: 0.00171, haumea: 0.0012, makemake: 0.00103, eris: 0.00167 };
const EXO_R = { hot_jupiter: 0.13, ocean_world: 0.018, super_earth: 0.016, chthonian: 0.012 };
const NAMES = { europa: 'Юпитер', titan: 'Сатурн' };
const U1 = 0.4, U2 = 0.26;
const limb = (mu) => 1 - U1 * (1 - mu) - U2 * (1 - mu) * (1 - mu);
const LIMB_NORM = 1 - U1 / 3 - U2 / 6;          // средняя яркость диска

let canvas, ctx, info, lastKey = '';

function planetRadius(planet) {
  const exo = getCustomExo(planet);
  return exo ? (EXO_R[exo.type] || 0.01) : (R_PLANET[planet] || 0.009);
}

// Потеря блеска, когда центр планеты на расстоянии z (в радиусах звезды) от центра диска; k = Rp/R★ (малая планета)
function dip(z, k) {
  if (z >= 1 + k) return 0;
  const mu = Math.sqrt(Math.max(0, 1 - Math.min(1, z) * Math.min(1, z)));
  const frac = z <= 1 - k ? 1 : Math.max(0, (1 + k - z) / (2 * k));    // частичное перекрытие у края
  return k * k * frac * limb(mu) / LIMB_NORM;
}

export function initTransit() {
  canvas = document.getElementById('transitCanvas');
  info = document.getElementById('transitInfo');
  if (canvas) ctx = canvas.getContext('2d');
}

export function drawTransit(state, now) {
  if (!ctx || !canvas.offsetParent) return;          // панель скрыта (телефон) — не рисуем
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(rect.width * dpr)) { canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, w, h);
  const planet = S.currentPlanet;
  const a = getPlanetDistanceAU(planet, state);
  const Rs = state.r;
  const wd = Rs < 0.03 && state.mass < 1.44 && state.mass > 0.1;
  const k = planetRadius(planet) / Math.max(1e-6, Rs);
  const alive = a > 0.001 && Rs / 215.03 < a;
  // звезда
  const sc = blackbodyCss(state.temp);
  const R = Math.min(h * 0.32, w * 0.16), cx = w * 0.2, cy = h * 0.42;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  for (const r of [0, 0.5, 0.8, 0.95, 1]) { const I = limb(Math.sqrt(1 - r * r)); g.addColorStop(r, `rgb(${sc[0] * I | 0},${sc[1] * I | 0},${sc[2] * I | 0})`); }
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  // фаза транзита: планета пересекает диск за ~4 с, потом 2 с пауза
  const cyc = (now % 6000) / 4000;
  const zPos = (cyc * 2 - 1) * (1 + Math.min(1, k)) * 1.25;     // от −1.25 до +1.25 радиуса
  const kk = Math.min(1, k);
  if (alive && !wd) {
    ctx.fillStyle = '#05070d';
    ctx.beginPath(); ctx.arc(cx + zPos * R, cy, Math.max(1.2, kk * R), 0, Math.PI * 2); ctx.fill();
  }
  // кривая блеска
  const x0 = w * 0.42, x1 = w - 8, y0 = 12, y1 = h - 18;
  ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
  let depth = alive ? dip(0, kk) : 0;
  const curve = (z) => (wd ? debrisDip(z, now) : alive ? dip(Math.abs(z), kk) : 0);
  if (wd) depth = 0.6;
  const scaleY = (y1 - y0 - 10) / Math.max(1e-9, depth * 1.15 || 1);
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 160; i++) {
    const z = (i / 160 * 2 - 1) * 1.25 * (1 + kk);
    const yy = y0 + 4 + curve(z) * scaleY;
    const xx = x0 + 4 + (i / 160) * (x1 - x0 - 8);
    if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
  }
  ctx.stroke();
  const mx = x0 + 4 + ((zPos / (1.25 * (1 + kk)) + 1) / 2) * (x1 - x0 - 8);
  ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(mx, y0 + 4 + curve(zPos) * scaleY, 3, 0, Math.PI * 2); ctx.fill();
  if (depth > 0) { ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.fillText(wd ? 'до −60 %' : `−${depth * 1e6 >= 10000 ? (depth * 100).toFixed(2) + ' %' : (depth * 1e6).toFixed(0) + ' ppm'}`, x0 + (x1 - x0) * 0.5 - 18, y1 - 4); }
  ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif';
  ctx.fillText('блеск', x0 + 4, y0 + 2); ctx.fillText('время →', x1 - 40, y1 + 12);
  // подпись — обновляется только при изменении
  const P = alive ? Math.pow(a, 1.5) / Math.sqrt(Math.max(0.05, state.mass)) : 0;
  const T = alive ? (P * 365.25 * 24 / Math.PI) * Math.asin(Math.min(1, (Rs + planetRadius(planet)) / 215.03 / a)) : 0;
  const pname = NAMES[planet] || ({ mercury: 'Меркурий', venus: 'Венера', earth: 'Земля', mars: 'Марс', uranus: 'Уран', neptune: 'Нептун', pluto: 'Плутон', haumea: 'Хаумеа', makemake: 'Макемаке', eris: 'Эрида' }[planet] || 'Планета');
  const ppm = depth * 1e6;
  const key = `${planet}|${state.t.toFixed(3)}|${wd}`;
  if (key !== lastKey) {
    lastKey = key;
    if (wd) info.innerHTML = `Белый карлик: астероиды рвутся у предела Роша (${(rocheLimitAU(state) * 215.03).toFixed(2)} R☉) — неровные провалы до десятков процентов, как у WD 1145+017.`;
    else if (!alive) info.innerHTML = `${pname}: планеты больше нет на орбите.`;
    else info.innerHTML = `${pname}: глубина ${ppm >= 10000 ? (ppm / 1e4).toFixed(2) + ' %' : ppm.toFixed(0) + ' ppm'} (Rp/R★ = ${k.toPrecision(2)}) • длительность ${T >= 48 ? (T / 24).toFixed(1) + ' сут' : T.toFixed(1) + ' ч'} • период ${P >= 2 ? P.toFixed(1) + ' лет' : (P * 365.25).toFixed(0) + ' сут'}` +
      (k > 1 ? ' • планета больше звезды!' : ppm < 100 ? ' • такой провал видит только космический телескоп (Kepler, PLATO)' : '');
  }
}

// Обломки у белого карлика: несколько облаков разной плотности, проходящих по диску
function debrisDip(z, now) {
  let d = 0;
  for (let i = 0; i < 4; i++) {
    const c = -0.9 + i * 0.6 + 0.05 * Math.sin(now * 0.0003 + i);
    const wdt = 0.12 + 0.05 * i;
    d += (0.45 - i * 0.08) * Math.exp(-((z - c) ** 2) / (2 * wdt * wdt));
  }
  return Math.min(0.95, d);
}
