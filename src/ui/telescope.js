// «Земля глазами чужого телескопа» (5.1): спектр пропускания атмосферы выбранной планеты при транзите,
// найденные газы, вывод наблюдателя о жизни и — для Земли — полоса всей истории: когда инопланетный JWST
// впервые смог бы заподозрить, что здесь кто-то живёт.
import { S } from '../state.js';
import { STAR_CATALOG } from '../data/catalog.js';
import { getPlanetDisplayName } from '../model/exoplanets.js';
import { getInterpolatedState } from '../model/timeline.js';
import { calculatePlanetAtmosphere, getPlanetClimate } from '../physics/climate.js';
import { atmosphereProfile } from '../physics/atmoProfile.js';
import { SPECIES, deltaDepthPpm, detectedSpecies, spectrumFloor, transmissionSpectrum, verdict } from '../physics/transmission.js';

const R_PLANET = { mercury: 0.38, venus: 0.95, earth: 1, mars: 0.53, europa: 0.25, titan: 0.40, pluto: 0.18, eris: 0.18, haumea: 0.13, makemake: 0.11, uranus: 4.0, neptune: 3.9 };
const VCOL = { '-1': '#334155', 0: '#64748b', 1: '#f59e0b', 2: '#10b981', 3: '#22d3ee' };

/** Всё, что видит телескоп, для планеты в момент state */
export function observe(planet, state) {
  const climate = getPlanetClimate(planet, state);
  if (!climate) return null;
  const atmo = calculatePlanetAtmosphere(planet, state);
  const p0 = atmo.pressureBar;
  if (!(p0 > 1e-4) || p0 > 500) return { none: true, p0 };
  const prof = atmosphereProfile(planet, climate, atmo);
  const H = prof ? prof.H : 8;
  const floor = spectrumFloor(planet, p0, H, prof);
  const spec = transmissionSpectrum(atmo.mix, p0, H, floor);
  const seen = detectedSpecies(atmo.mix, p0, H, floor);
  return { spec, seen, verdict: verdict(seen), H, floor, p0 };
}

// полоса истории Земли: уровень вывода каждые 20 млн лет (кэш по звезде и [Fe/H])
let histKey = '', hist = null;
function earthHistory() {
  const key = `${S.selectedStarId}|${S.selectedFeH}`;
  if (key === histKey && hist) return hist;
  const out = [];
  for (let t = 0.02; t <= 6.0; t += 0.02) {
    const o = observe('earth', getInterpolatedState(t));
    out.push({ t, level: !o ? -1 : o.none ? -1 : o.verdict.level });
  }
  histKey = key; hist = out;
  return out;
}

let canvas = null, ctx = null;
let strip = null;                 // где нарисована полоса истории — по ней можно водить пальцем, двигая время

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function drawTelescope(state) {
  if (!S.telescopeOpen || !ctx) return;
  const W = canvas.clientWidth, Hh = canvas.clientHeight;
  ctx.clearRect(0, 0, W, Hh);
  ctx.fillStyle = '#060912'; ctx.fillRect(0, 0, W, Hh);
  const planet = S.currentPlanet;
  const star = STAR_CATALOG.find(s => s.id === S.selectedStarId) || { name: 'Солнце' };
  const ob = observe(planet, state);
  const showHist = planet === 'earth' && S.selectedStarId === 'sun' && !S.isDeepTime;
  const narrow = W < 600;
  const L = narrow ? 40 : 52, R = narrow ? 46 : 64, T = narrow ? 78 : 66, B = showHist ? 96 : 52;
  const pw = W - L - R, ph = Hh - T - B;
  ctx.font = `${narrow ? 11 : 13}px sans-serif`; ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'left';
  const age = state.t >= 1 ? `${state.t.toFixed(2)} млрд лет` : `${Math.round(state.t * 1000)} млн лет`;
  ctx.fillText(`${getPlanetDisplayName(planet)} на фоне звезды ${star.name} • ${age}`, 10, 20, W - 20);
  ctx.font = `${narrow ? 10 : 11}px sans-serif`; ctx.fillStyle = '#94a3b8';
  if (!narrow) ctx.fillText('Спектр пропускания: на длинах волн, где газ поглощает, атмосфера непрозрачна выше — планета кажется больше', 10, 36, W - 20);
  if (!ob || ob.none) {
    ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center';
    ctx.fillText(!ob ? 'Планеты нет' : ob.p0 > 500 ? 'Гигант: глубокая водородная оболочка — нужен отдельный расчёт' : 'Атмосферы нет: силуэт планеты одинаков на всех длинах волн', W / 2, Hh / 2);
    ctx.textAlign = 'left';
    return;
  }
  const { spec, verdict: v, floor } = ob;
  const zMax = Math.max(...spec.z) * 1.08, zMin = Math.max(0, floor - ob.H * 0.6);
  const lx = (l) => L + Math.log(l / 0.25) / Math.log(20 / 0.25) * pw;
  const zy = (z) => T + ph - (z - zMin) / (zMax - zMin) * ph;
  // пол
  ctx.fillStyle = 'rgba(100,116,139,0.18)'; ctx.fillRect(L, zy(floor), pw, T + ph - zy(floor));
  ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif';
  if (floor > 0) ctx.fillText(S.currentPlanet === 'venus' ? 'облака H₂SO₄ — глубже не видно' : S.currentPlanet === 'titan' ? 'дымка толинов' : 'рефракция: глубже лучи уходят мимо телескопа', L + 4, zy(floor) + 11);
  // вклады газов
  for (const [sp, info] of Object.entries(SPECIES)) {
    const arr = spec.contrib[sp];
    if (!arr.some(v => v !== null && v > floor + 0.3)) continue;
    ctx.fillStyle = info.color + '55';
    ctx.beginPath();
    let open = false;
    arr.forEach((zz, i) => {
      const x = lx(spec.lam[i]);
      if (zz !== null && zz > floor) { if (!open) { ctx.moveTo(x, zy(floor)); open = true; } ctx.lineTo(x, zy(Math.min(zz, spec.z[i]))); }
      else if (open) { ctx.lineTo(x, zy(floor)); ctx.closePath(); ctx.fill(); ctx.beginPath(); open = false; }
    });
    if (open) { ctx.lineTo(lx(spec.lam.at(-1)), zy(floor)); ctx.closePath(); ctx.fill(); }
  }
  // итоговый спектр
  ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 1.6; ctx.beginPath();
  spec.lam.forEach((l, i) => { const x = lx(l), y = zy(spec.z[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.stroke(); ctx.lineWidth = 1;
  // подписи найденных полос: над самым высоким пиком каждого газа
  ctx.font = `${narrow ? 10 : 11}px sans-serif`; ctx.textAlign = 'center';
  const placed = [];
  for (const sp of Object.keys(ob.seen)) {
    const arr = spec.contrib[sp];
    let bi = -1, bz = -1;
    arr.forEach((zz, i) => { if (zz !== null && zz > bz) { bz = zz; bi = i; } });
    if (bi < 0) continue;
    const x = lx(spec.lam[bi]), y = zy(spec.z[bi]) - 6;
    if (placed.some(p => Math.abs(p - x) < 26)) continue;
    placed.push(x);
    ctx.fillStyle = SPECIES[sp].color; ctx.fillText(SPECIES[sp].label, x, Math.max(T + 10, y));
  }
  // оси
  ctx.strokeStyle = 'rgba(148,163,184,0.45)'; ctx.strokeRect(L, T, pw, ph);
  ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif';
  for (const l of [0.3, 0.5, 1, 2, 3, 5, 10, 20]) { ctx.textAlign = 'center'; ctx.fillText(`${l}`, lx(l), T + ph + 12); }
  ctx.fillText('длина волны, мкм (видимый свет — слева, тепловой ИК — справа)', L + pw / 2, T + ph + 24);
  const zStep = [2, 5, 10, 20, 50, 100].find(s => (zMax - zMin) / s <= 6) || 100;
  const rp = R_PLANET[planet] || 1;
  for (let z = Math.ceil(zMin / zStep) * zStep; z <= zMax; z += zStep) {
    ctx.textAlign = 'right'; ctx.fillText(`${z}`, L - 4, zy(z) + 3);
    ctx.textAlign = 'left';
    const ppm = deltaDepthPpm(z, rp, state.r);
    ctx.fillText(ppm >= 10 ? `${ppm.toFixed(0)}` : ppm >= 0.1 ? ppm.toFixed(1) : ppm.toPrecision(1), L + pw + 4, zy(z) + 3);
  }
  ctx.save(); ctx.translate(11, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('эффективная высота, км', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(W - 8, T + ph / 2); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('добавка к глубине транзита, ppm', 0, 0); ctx.restore();
  // вывод
  ctx.textAlign = 'left'; ctx.font = `${narrow ? 11 : 12}px sans-serif`;
  ctx.fillStyle = VCOL[v.level];
  // на узком экране вывод переносится на две строки
  const vt = `Вывод телескопа: ${v.text}`;
  if (narrow && ctx.measureText(vt).width > W - 20) {
    const cut = vt.lastIndexOf(' ', Math.floor(vt.length * 0.55));
    ctx.fillText(vt.slice(0, cut), 10, T - 22); ctx.fillText(vt.slice(cut + 1), 10, T - 8);
  } else ctx.fillText(vt, 10, T - 10, W - 20);
  // полоса истории Земли
  strip = null;
  if (showHist) {
    const hy = Hh - 46, hh = 14, hx = L, hw = pw;
    strip = { x: hx, y: hy - 14, w: hw, h: hh + 28 };
    const hs = earthHistory();
    hs.forEach((p, i) => { ctx.fillStyle = VCOL[p.level]; ctx.fillRect(hx + (p.t / 6) * hw, hy, hw / hs.length + 1, hh); });
    ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2;
    const cx = hx + Math.min(1, state.t / 6) * hw;
    ctx.beginPath(); ctx.moveTo(cx, hy - 4); ctx.lineTo(cx, hy + hh + 4); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
    for (const t of [0, 1, 2, 3, 4, 4.57, 5, 6]) ctx.fillText(t === 4.57 ? 'сейчас' : `${t}`, hx + t / 6 * hw, hy + hh + 11);
    ctx.textAlign = 'left';
    const lab = 'История Земли для чужого телескопа (тяни, чтобы двигать время), млрд лет:';
    ctx.fillText(lab, hx, hy - 6);
    const legend = [[1, 'метан и CO₂'], [2, 'кислород'], [3, 'O₂ + CH₄ — жизнь']];
    let lxp = hx + (narrow ? 0 : ctx.measureText(lab).width + 24);
    const ly = narrow ? hy + hh + 24 : hy - 6;
    for (const [lv, txt] of legend) {
      ctx.fillStyle = VCOL[lv]; ctx.fillRect(lxp, ly - 7, 8, 8);
      ctx.fillStyle = '#cbd5e1'; ctx.fillText(txt, lxp + 11, ly); lxp += ctx.measureText(txt).width + 26;
    }
  }
}

export function initTelescope() {
  const overlay = document.getElementById('telescopeOverlay');
  canvas = document.getElementById('telescopeCanvas');
  if (!overlay || !canvas) return;
  ctx = canvas.getContext('2d');
  document.body.appendChild(overlay);
  const open = () => { S.telescopeOpen = true; overlay.style.display = 'flex'; resize(); S.lastSidebarSignature = ''; };
  document.getElementById('telescopeBtn').addEventListener('click', open);
  document.getElementById('telescopeCloseBtn').addEventListener('click', () => { S.telescopeOpen = false; overlay.style.display = 'none'; });
  window.addEventListener('resize', () => { if (S.telescopeOpen) { resize(); S.lastSidebarSignature = ''; } });
  // полоса истории Земли — ещё и ползунок времени (на телефоне панель закрывает основной)
  let drag = false;
  const go = (e) => {
    if (!strip) return false;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (!drag && (y < strip.y || y > strip.y + strip.h)) return false;
    S.currentAge = Math.max(0.02, Math.min(6, (x - strip.x) / strip.w * 6));
    S.isPlaying = false;
    return true;
  };
  canvas.addEventListener('pointerdown', (e) => { if (go(e)) { drag = true; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => { if (drag) go(e); });
  canvas.addEventListener('pointerup', () => { drag = false; });
}
