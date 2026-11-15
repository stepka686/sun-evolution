// Вид Галактики: Млечный Путь сверху, орбита Солнца и его колебания поперёк диска, 3D-карта ближайших звёзд.
//   • Солнце: R₀ = 8.2 кпк, V = 230 км/с ⇒ галактический год 2πR₀/V ≈ 220 млн лет (≈ 20 оборотов за жизнь Солнца)
//   • спиральный узор — волна плотности, вращается медленнее звёзд: Ω_p ≈ 24 км/с/кпк против Ω☉ ≈ 28 (Gerhard 2011)
//     ⇒ Солнце догоняет рукава и проходит сквозь них раз в ~0.4 млрд лет
//   • рукава — логарифмические спирали r = a·e^{k(θ−θᵢ)}, угол закрутки 12°, четыре рукава; бар — 27° к линии Солнце — центр
//   • вертикальные колебания: |z| до ~80 пк, период ~65 млн лет (сейчас Солнце ~20 пк над плоскостью и поднимается)
import { S } from '../state.js';
import { STAR_POS } from './skyGeometry.js';
import { STAR_CATALOG } from '../data/catalog.js';
import { drawGalaxyGL } from '../gl/galaxyGL.js';
import { ANDROMEDA_SCENARIOS, andromedaOrbit } from '../physics/andromeda.js';

const KPC_KMS_TO_RAD_GYR = 1.0227;           // 1 км/с/кпк = 1.0227 рад/млрд лет
const R0 = 8.2, V0 = 230;
const OMEGA_SUN = V0 / R0 * KPC_KMS_TO_RAD_GYR;    // ≈ 28.7 рад/млрд лет
const OMEGA_P = 24 * KPC_KMS_TO_RAD_GYR;
export const GALACTIC_YEAR = 2 * Math.PI / OMEGA_SUN;   // млрд лет
export const PITCH = 12 * Math.PI / 180, KSP = Math.tan(PITCH);
const T_NOW = 4.57, PHI_NOW = Math.PI;                 // Солнце сейчас слева от центра
export const ARM_A = 3.0, ARM_THETA0 = Math.PI - Math.log(7.0 / ARM_A) / KSP;   // рукав Стрельца проходит в 7 кпк от центра у Солнца
const ARM_NAMES = ['Стрельца — Киля', 'Наугольника', 'Щита — Центавра', 'Персея'];
const Z_AMP = 0.08, Z_PERIOD = 0.065, Z_PHASE = Math.asin(0.02 / 0.08);   // кпк, млрд лет

const TWO_PI = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Положение Солнца в Галактике (кпк) в момент t (млрд лет): угол в системе звёзд и в системе узора */
export function sunGalactic(t) {
  const dt = t - T_NOW;
  const phi = PHI_NOW - OMEGA_SUN * dt;                 // вращение по часовой стрелке (вид с северного полюса Галактики)
  const phiPattern = phi + OMEGA_P * dt;                 // угол Солнца относительно вращающегося узора
  const z = Z_AMP * Math.sin(TWO_PI * dt / Z_PERIOD + Z_PHASE);
  return { phi, phiPattern, z, orbits: Math.max(0, t) / GALACTIC_YEAR, patternAngle: -OMEGA_P * dt };
}

/** Ближайший рукав к Солнцу (в системе узора): радиальное расстояние, кпк, и имя */
export function nearestArm(phiPattern, r = R0) {
  let best = { d: Infinity, name: '' };
  for (let i = 0; i < 4; i++) {
    const th0 = ARM_THETA0 + i * Math.PI / 2;
    // все витки рукава на этом луче: θ = φ + 2πn
    for (let n = -3; n <= 3; n++) {
      const th = phiPattern + TWO_PI * n;
      const ra = ARM_A * Math.exp(KSP * (th - th0));
      if (ra < ARM_A || ra > 16) continue;
      const d = Math.abs(ra - r);
      if (d < best.d) best = { d, name: ARM_NAMES[i], r: ra };
    }
  }
  return best;
}

// ---------- облако звёзд Галактики (строится один раз) ----------
let disk = null;
function buildDisk(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 34;                                   // пикселей на кпк, поле ±17 кпк
  const C = size / 2;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => { let u = 0; for (let i = 0; i < 4; i++) u += rnd(); return (u - 2) / 0.58; };
  // общий диск: экспоненциальный профиль (шкала 2.6 кпк)
  const glow = g.createRadialGradient(C, C, 0, C, C, 15 * s);
  glow.addColorStop(0, 'rgba(255,236,200,0.55)'); glow.addColorStop(0.18, 'rgba(240,215,180,0.22)'); glow.addColorStop(0.5, 'rgba(150,160,200,0.08)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const r = -2.6 * Math.log(1 - rnd() * 0.997), a = rnd() * TWO_PI;
    if (r > 16) continue;
    const x = C + Math.cos(a) * r * s, y = C + Math.sin(a) * r * s;
    g.fillStyle = r < 3 ? 'rgba(255,220,170,0.35)' : 'rgba(200,205,230,0.22)';
    g.fillRect(x, y, 1.2, 1.2);
  }
  // бар
  g.save(); g.translate(C, C); g.rotate(-27 * Math.PI / 180);
  const bar = g.createRadialGradient(0, 0, 0, 0, 0, 5 * s);
  bar.addColorStop(0, 'rgba(255,225,170,0.85)'); bar.addColorStop(1, 'rgba(255,200,140,0)');
  g.scale(1, 0.35); g.fillStyle = bar; g.beginPath(); g.arc(0, 0, 5 * s, 0, TWO_PI); g.fill();
  g.restore();
  // рукава: сначала мягкое свечение, затем молодые голубые звёзды, розовые области HII и тёмные пылевые полосы с внутренней стороны
  for (let i = 0; i < 4; i++) {
    const th0 = ARM_THETA0 + i * Math.PI / 2;
    const major = i === 0 || i === 3 ? 1 : 0.7;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let th = th0; th < th0 + 1.6 * Math.PI; th += 0.02) {
      const r = ARM_A * Math.exp(KSP * (th - th0));
      if (r > 16) break;
      const x = C + Math.cos(th) * r * s, y = C + Math.sin(th) * r * s, rad = (0.6 + r * 0.05) * s;
      const gl = g.createRadialGradient(x, y, 0, x, y, rad);
      gl.addColorStop(0, `rgba(120,150,255,${0.05 * major})`); gl.addColorStop(1, 'rgba(120,150,255,0)');
      g.fillStyle = gl; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
    }
    g.restore();
    for (let th = th0; th < th0 + 1.6 * Math.PI; th += 0.003) {
      const r = ARM_A * Math.exp(KSP * (th - th0));
      if (r > 16) break;
      const wdt = 0.3 + r * 0.025;
      for (let j = 0; j < 5; j++) {
        const rr = r + gauss() * wdt;
        const x = C + Math.cos(th) * rr * s, y = C + Math.sin(th) * rr * s;
        const hii = rnd() < 0.02 * major;
        g.fillStyle = hii ? 'rgba(255,120,170,0.85)' : `rgba(${180 + rnd() * 60 | 0},${200 + rnd() * 40 | 0},255,${0.45 * major})`;
        const sz = hii ? 2.4 : 1.4 + rnd() * 0.6;
        g.fillRect(x, y, sz, sz);
      }
      const rd = r - wdt * 1.1;
      g.fillStyle = 'rgba(6,5,10,0.16)';
      g.fillRect(C + Math.cos(th) * rd * s, C + Math.sin(th) * rd * s, 2.4, 2.4);
    }
  }
  // местный рукав (шпора Ориона) — короткий отрезок между рукавами Стрельца и Персея
  for (let th = Math.PI - 0.5; th < Math.PI + 0.35; th += 0.005) {
    const r = 8.3 + (th - Math.PI) * 1.2;
    for (let j = 0; j < 2; j++) {
      const rr = r + gauss() * 0.3;
      g.fillStyle = 'rgba(190,210,255,0.22)';
      g.fillRect(C + Math.cos(th) * rr * s, C + Math.sin(th) * rr * s, 1.2, 1.2);
    }
  }
  return { canvas: c, s, size };
}

// экваториальные (α, δ, d) → галактические декартовы (J2000)
const T_EQ_GAL = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];
function eqToGalXYZ(raDeg, decDeg, d) {
  const ra = raDeg * Math.PI / 180, dec = decDeg * Math.PI / 180;
  const v = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  return T_EQ_GAL.map(row => d * (row[0] * v[0] + row[1] * v[1] + row[2] * v[2]));
}

const NEAR_IDS = ['alpha_cen_a', 'proxima', 'barnard', 'sirius_a', 'eps_eri', 'tau_ceti', 'kapteyn', 'altair', 'gliese581', 'vega', 'fomalhaut', 'trappist1', 'pollux', 'arcturus'];

function drawNearbyMap(ctx, x0, y0, W, H, now) {
  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,0.75)'; ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.fillRect(x0, y0, W, H); ctx.strokeRect(x0, y0, W, H);
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#cbd5e1';
  ctx.fillText('Окрестности Солнца (до 40 св. лет), галактические оси', x0 + 8, y0 + 14);
  const cx = x0 + W / 2, cy = y0 + H / 2 + 8, sc = Math.min(W / 2 - 30, (H / 2 - 20) / 0.85) / 42;
  const yaw = now * 0.00012, tilt = 0.55;
  const pr = (p) => {
    const x = p[0] * Math.cos(yaw) - p[1] * Math.sin(yaw), y = p[0] * Math.sin(yaw) + p[1] * Math.cos(yaw);
    return { x: cx + x * sc, y: cy + y * sc * Math.sin(tilt) - p[2] * sc * Math.cos(tilt), yb: cy + y * sc * Math.sin(tilt), depth: y };
  };
  // плоскость Галактики: кольца 10/20/30/40 св. лет
  ctx.strokeStyle = 'rgba(96,165,250,0.18)';
  for (const r of [10, 20, 30, 40]) {
    ctx.beginPath(); ctx.ellipse(cx, cy, r * sc, r * sc * Math.sin(tilt), 0, 0, TWO_PI); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(148,163,184,0.7)'; ctx.font = '8px sans-serif';
  const gc = pr([40, 0, 0]);
  ctx.fillText('→ к центру Галактики', gc.x - 30, gc.yb + 10);
  const stars = NEAR_IDS.filter(id => STAR_POS[id] && STAR_POS[id][2] <= 42).map(id => {
    const [ra, dec, d] = STAR_POS[id];
    const cat = STAR_CATALOG.find(s => s.id === id);
    return { id, name: cat ? cat.name : id, p: pr(eqToGalXYZ(ra, dec, d)), d };
  }).sort((a, b) => b.p.depth - a.p.depth);
  ctx.font = '9px sans-serif';
  const sun = pr([0, 0, 0]);
  for (const s of stars) {
    ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(s.p.x, s.p.y); ctx.lineTo(s.p.x, s.p.yb); ctx.stroke(); ctx.setLineDash([]);
    const sel = s.id === S.selectedStarId || (S.selectedStarId === 'sirius_b' && s.id === 'sirius_a');
    ctx.fillStyle = sel ? '#fbbf24' : '#e2e8f0';
    ctx.beginPath(); ctx.arc(s.p.x, s.p.y, sel ? 3.2 : 2, 0, TWO_PI); ctx.fill();
    ctx.fillStyle = sel ? '#fde68a' : 'rgba(203,213,225,0.85)';
    ctx.fillText(`${s.name.replace(/\s*\(.*\)/, '')} ${s.d < 10 ? s.d.toFixed(1) : Math.round(s.d)}`, s.p.x + 4, s.p.y - 3);
  }
  ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(sun.x, sun.y, 3.5, 0, TWO_PI); ctx.fill();
  ctx.fillText('Солнце', sun.x + 5, sun.y + 10);
  ctx.restore();
}

function drawVerticalInset(ctx, x0, y0, W, H, t) {
  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,0.75)'; ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.fillRect(x0, y0, W, H); ctx.strokeRect(x0, y0, W, H);
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#cbd5e1';
  ctx.fillText('Колебания Солнца поперёк диска (±200 млн лет)', x0 + 8, y0 + 14);
  const mid = y0 + H / 2 + 6, zs = (H / 2 - 18) / 0.1;
  // диск сбоку: тонкий слой газа и пыли (полутолщина ~0.1 кпк)
  const g = ctx.createLinearGradient(0, mid - 0.1 * zs, 0, mid + 0.1 * zs);
  g.addColorStop(0, 'rgba(96,165,250,0)'); g.addColorStop(0.5, 'rgba(96,165,250,0.18)'); g.addColorStop(1, 'rgba(96,165,250,0)');
  ctx.fillStyle = g; ctx.fillRect(x0 + 1, mid - 0.1 * zs, W - 2, 0.2 * zs);
  ctx.strokeStyle = 'rgba(148,163,184,0.35)'; ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x0 + W, mid); ctx.stroke();
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.4; ctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const tt = t - 0.2 + 0.4 * i / 120, z = sunGalactic(tt).z;
    const x = x0 + 8 + (W - 16) * i / 120, y = mid - z * zs;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const z = sunGalactic(t).z;
  ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(x0 + W / 2, mid - z * zs, 3.5, 0, TWO_PI); ctx.fill();
  ctx.fillStyle = '#94a3b8'; ctx.font = '9px sans-serif';
  ctx.fillText(`z = ${z >= 0 ? '+' : ''}${Math.round(z * 1000)} пк`, x0 + W / 2 + 6, mid - z * zs - 4);
  ctx.fillText('сейчас', x0 + W / 2 - 14, y0 + H - 4);
  ctx.restore();
}

// 5.4: расстояние до Андромеды по времени — три сценария (активный ярче), отметка «сейчас» и слияние
const ANDR_COL = { hst2012: '#fda4af', gaia2026: '#c4b5fd', gaia2025: '#7dd3fc' };
function drawAndromedaInset(ctx, x0, y0, W, H, t) {
  const now0 = S.presentAge ?? T_NOW, key = S.andromedaScenario || 'gaia2026';
  const t0 = Math.max(0, now0 - 4.6), t1 = now0 + 10;
  ctx.save();
  ctx.fillStyle = 'rgba(2,6,23,0.75)'; ctx.strokeStyle = 'rgba(148,163,184,0.35)';
  ctx.fillRect(x0, y0, W, H); ctx.strokeRect(x0, y0, W, H);
  const px = x0 + 30, pw = W - 38, py = y0 + 20, ph = H - 34;
  const X = (tt) => px + (tt - t0) / (t1 - t0) * pw;
  const DMAX = 1300, Y = (d) => py + ph * (1 - Math.min(d, DMAX) / DMAX);
  // сетка
  ctx.font = '9px sans-serif'; ctx.fillStyle = '#64748b'; ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  for (const d of [0, 500, 1000]) { ctx.beginPath(); ctx.moveTo(px, Y(d)); ctx.lineTo(px + pw, Y(d)); ctx.stroke(); ctx.fillText(String(d), x0 + 4, Y(d) + 3); }
  for (let k = Math.ceil(t0 / 2) * 2; k <= t1; k += 2) ctx.fillText(String(k), X(k) - 3, py + ph + 11);
  // кривые: неактивные — тонко, активная — сверху
  const keys = Object.keys(ANDROMEDA_SCENARIOS).sort((a, b) => (a === key) - (b === key));
  for (const k of keys) {
    const o = andromedaOrbit(k), on = k === key;
    ctx.strokeStyle = ANDR_COL[k]; ctx.globalAlpha = on ? 1 : 0.35; ctx.lineWidth = on ? 1.6 : 1;
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const tt = t0 + (t1 - t0) * i / 160, y = Y(o.at(tt - now0).d);
      if (i === 0) ctx.moveTo(X(tt), y); else ctx.lineTo(X(tt), y);
    }
    ctx.stroke();
    if (on && Number.isFinite(o.tMerge) && now0 + o.tMerge < t1) {
      const mx = X(now0 + o.tMerge), my = Y(0);
      ctx.beginPath(); ctx.moveTo(mx - 3, my - 3); ctx.lineTo(mx + 3, my + 3); ctx.moveTo(mx + 3, my - 3); ctx.lineTo(mx - 3, my + 3); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  // «сегодня» и текущий момент
  ctx.strokeStyle = 'rgba(148,163,184,0.5)'; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(X(now0), py); ctx.lineTo(X(now0), py + ph); ctx.stroke(); ctx.setLineDash([]);
  const cur = andromedaOrbit(key).at(t - now0);
  if (t >= t0 && t <= t1) {
    ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(X(t), Y(cur.d), 3.5, 0, TWO_PI); ctx.fill();
  }
  ctx.fillStyle = '#cbd5e1'; ctx.font = '10px sans-serif';
  ctx.fillText(`До Андромеды, кпк • ${ANDROMEDA_SCENARIOS[key].name} (v⊥ ${ANDROMEDA_SCENARIOS[key].vt} км/с)`, x0 + 8, y0 + 13);
  ctx.fillStyle = '#64748b'; ctx.font = '9px sans-serif';
  ctx.restore();
}

/** Строка сводки про Андромеду */
function andromedaLine(t) {
  const now0 = S.presentAge ?? T_NOW, key = S.andromedaScenario || 'gaia2026';
  const o = andromedaOrbit(key), s = o.at(t - now0), sc = ANDROMEDA_SCENARIOS[key];
  const ly = (d) => d * 3261.6;
  if (s.merged) return `Андромеда слилась с Галактикой (${sc.name}): вместо спирали — эллиптическая галактика`;
  const dist = ly(s.d) > 1e6 ? `${(ly(s.d) / 1e6).toFixed(2)} млн св. лет` : `${Math.round(ly(s.d) / 1000)} тыс. св. лет`;
  const left = o.tMerge - (t - now0);
  const merge = Number.isFinite(o.tMerge) && o.tMerge <= 10 ? `слияние через ${left.toFixed(1)} млрд лет` : 'слияния за 10 млрд лет нет';
  return `Андромеда: ${Math.round(s.d)} кпк (${dist}) • ${merge}`;
}

export function drawGalaxyView(ctx, w, h, state, now) {
  const t = S.isDeepTime ? state.t : S.currentAge;
  ctx.fillStyle = '#020309'; ctx.fillRect(0, 0, w, h);
  const landscape = w > h * 1.15;
  const gSize = landscape ? Math.min(h - 20, w * 0.62) : Math.min(w - 10, h * 0.55);
  const gx = landscape ? 10 + gSize / 2 : w / 2, gy = landscape ? h / 2 : 10 + gSize / 2;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const want = Math.round(gSize * dpr);
  const sun = sunGalactic(t);
  const pxk = gSize / 34;
  // узор вращается как целое (волна плотности). 5.0: на GPU — ~200 тыс. звёзд, иначе — готовая 2D-картинка
  // мягкое свечение диска и бара — общее для обоих путей
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 15 * pxk);
  glow.addColorStop(0, 'rgba(255,236,200,0.5)'); glow.addColorStop(0.15, 'rgba(240,215,180,0.18)'); glow.addColorStop(0.5, 'rgba(150,160,200,0.06)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  if (!drawGalaxyGL(ctx, gx, gy, gSize, sun.patternAngle)) {
    if (!disk || Math.abs(disk.size - want) > 64) disk = buildDisk(want);
    ctx.save(); ctx.translate(gx, gy); ctx.rotate(sun.patternAngle);
    ctx.drawImage(disk.canvas, -gSize / 2, -gSize / 2, gSize, gSize);
    ctx.restore();
  } else {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = glow; ctx.fillRect(gx - gSize / 2, gy - gSize / 2, gSize, gSize); ctx.restore();
  }
  // орбита Солнца и след за последний галактический год
  ctx.strokeStyle = 'rgba(253,224,71,0.25)'; ctx.setLineDash([4, 5]);
  ctx.beginPath(); ctx.arc(gx, gy, R0 * pxk, 0, TWO_PI); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(253,224,71,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = sunGalactic(t - 0.05 * i / 60).phi;
    const x = gx + Math.cos(a) * R0 * pxk, y = gy + Math.sin(a) * R0 * pxk;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.lineWidth = 1;
  const sx = gx + Math.cos(sun.phi) * R0 * pxk, sy = gy + Math.sin(sun.phi) * R0 * pxk;
  const pulse = 4 + Math.sin(now * 0.004) * 1.2;
  ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(sx, sy, pulse, 0, TWO_PI); ctx.fill();
  ctx.strokeStyle = 'rgba(253,224,71,0.5)'; ctx.beginPath(); ctx.arc(sx, sy, pulse + 5, 0, TWO_PI); ctx.stroke();
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#fde68a';
  ctx.fillText(S.selectedStarId === 'sun' ? 'Солнце' : 'Солнце (выбранная звезда — рядом, < 0.1 кпк)', sx + 9, sy - 7);
  ctx.fillStyle = 'rgba(203,213,225,0.7)'; ctx.font = '10px sans-serif';
  ctx.fillText('центр, бар', gx - 22, gy + 4);
  // шкала
  ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(gx - gSize / 2 + 12, gy + gSize / 2 - 12); ctx.lineTo(gx - gSize / 2 + 12 + 5 * pxk, gy + gSize / 2 - 12); ctx.stroke();
  ctx.fillStyle = '#94a3b8'; ctx.fillText('5 кпк ≈ 16 000 св. лет', gx - gSize / 2 + 12, gy + gSize / 2 - 17);

  // сводка
  const arm = nearestArm(sun.phiPattern);
  const inArm = arm.d < 0.45;
  const lines = [
    `Галактический год ≈ ${Math.round(GALACTIC_YEAR * 1000)} млн лет • V = ${V0} км/с • R = ${R0} кпк`,
    `Солнце сделало ${sun.orbits.toFixed(1)} оборота вокруг центра Галактики`,
    inArm ? `Сейчас Солнце внутри рукава ${arm.name}: чаще вспышки сверхновых рядом, гуще облака` : `Ближайший рукав — ${arm.name}, ${arm.d.toFixed(1)} кпк по радиусу`,
    `Узор рукавов отстаёт от звёзд: Солнце проходит рукав раз в ~${Math.round(2 * Math.PI / 4 / (OMEGA_SUN - OMEGA_P) * 1000)} млн лет`,
    andromedaLine(t)
  ];
  // вставки
  let ix, iy, iw, ih;
  // 5.4: третья вставка — расстояние до Андромеды
  if (landscape) { ix = gSize + 24; iw = w - ix - 10; iy = 10; ih = (h - 36 - lines.length * 15) / 3 - 6; }
  else { ix = 8; iw = w - 16; iy = gSize + 18; ih = Math.max(64, (h - iy - lines.length * 15 - 72) / 3); }
  if (iw > 160 && ih > 60) {
    drawNearbyMap(ctx, ix, iy, iw, ih, now);
    drawVerticalInset(ctx, ix, iy + ih + 8, iw, Math.min(ih, 140), t);
    drawAndromedaInset(ctx, ix, iy + ih + 8 + Math.min(ih, 140) + 8, iw, Math.min(ih, 160), t);
  }
  ctx.font = '11px sans-serif';
  const bw = Math.min(w - 16, Math.max(...lines.map(l => ctx.measureText(l).width)) + 14);
  ctx.fillStyle = 'rgba(2,6,23,0.7)'; ctx.fillRect(8, h - 14 - lines.length * 15, bw, lines.length * 15 + 8);
  ctx.fillStyle = '#cbd5e1';
  lines.forEach((l, i) => ctx.fillText(l, 14, h - 6 - (lines.length - 1 - i) * 15 - 4));
}
