// Вид с Луны: Земля неподвижно висит над горизонтом (Луна повёрнута к ней одной стороной), меняя фазы;
// Солнце обходит небо за лунный месяц, звёзды видны и днём (атмосферы нет). Когда Земля закрывает Солнце —
// с Луны видно солнечное затмение Землёй, а вокруг чёрного диска горит кольцо закатов всей планеты:
// свет, прошедший через лимб атмосферы, — тот же, что красит Луну при лунном затмении на Земле.
import { STARS } from '../data/skyCatalog.js';
import { R_EARTH_KM, R_SUN_KM, AU_KM, moonDistanceKm } from '../physics/moon.js';
import { atmosphereOptics, blackbodyCss, blackbodyRGB, directLight } from '../physics/optics.js';
import { getPlanetClimate } from '../physics/climate.js';
import { getPlanetDistanceAU } from '../physics/orbits.js';
import { S } from '../state.js';
import { altAz, bvToTemp } from './skyGeometry.js';
import { drawPlanetBody } from './planetBody.js';
import { planetLook } from './planetLook.js';
import { eclipsedMoonColor } from './opticalFx.js';

const FOV = 28 * Math.PI / 180;          // «телеобъектив»: Земля в настоящем угловом размере (~2°) хорошо видна
const EARTH_ALT = 9 * Math.PI / 180, EARTH_AZ = Math.PI, LAT = -30 * Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// точка на сфере в θ от (alt0, az0) по направлению φ (0 — к зениту, π/2 — к востоку)
function offsetPoint(alt0, az0, theta, phi) {
  const sa = Math.sin(alt0) * Math.cos(theta) + Math.cos(alt0) * Math.sin(theta) * Math.cos(phi);
  const alt = Math.asin(Math.max(-1, Math.min(1, sa)));
  const az = az0 + Math.atan2(Math.sin(phi) * Math.sin(theta) * Math.cos(alt0), Math.cos(theta) - Math.sin(alt0) * sa);
  return { alt, az };
}

/** Геометрия месяца: тот же цикл, что у Луны в виде с Земли (Луна «притормаживает» у сизигий) */
export function lunarCycle(now, angR, sunAngR) {
  const u = (now * 0.00012 + 2.0) % (2 * Math.PI);
  let psi = u - 0.45 * Math.sin(2 * u); if (psi > Math.PI) psi -= 2 * Math.PI;    // элонгация Луны от Солнца (с Земли)
  const beta = 1.4 * (angR + sunAngR) * Math.sin(now * 2 * Math.PI / 160000);
  // с Луны: угол Земля — Солнце = π − |ψ|; фаза Земли противоположна фазе Луны
  const theta = Math.acos(Math.max(-1, Math.min(1, -Math.cos(psi) * Math.cos(beta))));
  return { u, psi, beta, theta, earthLit: (1 - Math.cos(theta)) / 2 };
}

export function drawMoonView(ctx, w, h, state, now) {
  if (S.selectedStarId !== 'sun' || S.isDeepTime || state.t < 0.03 || state.t >= 12.12) {
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#94a3b8'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(state.t >= 12.12 ? 'Луны больше нет: Земля и Луна поглощены Солнцем' : 'Вид с Луны доступен для Земли в Солнечной системе', w / 2, h / 2);
    ctx.textAlign = 'left';
    return;
  }
  const k = w / FOV;
  const cy = h * 0.40, cx = w / 2;
  const horizonY = cy + EARTH_ALT * k;
  const proj = (alt, az) => ({ x: cx + wrap(az - EARTH_AZ) * Math.cos(alt) * k, y: cy - (alt - EARTH_ALT) * k });

  const dKm = moonDistanceKm(state.t);
  const pDist = getPlanetDistanceAU('earth', state) || 1;
  const earthAng = Math.atan(R_EARTH_KM / dKm);
  const sunAng = Math.atan(state.r * R_SUN_KM / (pDist * AU_KM));
  const moonAng = Math.atan(1737.4 / dKm);
  const cyc = lunarCycle(now, moonAng, sunAng);

  // Солнце: восток или запад от Земли — по знаку элонгации, β — сдвиг поперёк эклиптики
  const phi = (cyc.psi >= 0 ? -1 : 1) * Math.PI / 2;
  const sun = offsetPoint(EARTH_ALT, EARTH_AZ, cyc.theta, phi + 20 * Math.PI / 180);
  // поперечный сдвиг β переносим отдельно: эклиптика наклонена на 20° к горизонту
  const sunP0 = proj(sun.alt, sun.az);
  const bx = -Math.sin(20 * Math.PI / 180) * cyc.beta * k, by = -Math.cos(20 * Math.PI / 180) * cyc.beta * k;
  const sunP = { x: sunP0.x + bx, y: sunP0.y + by };
  const sunAlt = sun.alt;
  const dayK = clamp01(Math.sin(sunAlt) * 4 + 0.15);                     // освещённость грунта

  // 1. Чёрное небо (атмосферы нет) и звёзды — видны всегда, медленно поворачиваются за лунные сутки
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const lst = cyc.u;
  const glare = sunP.x > -200 && sunP.x < w + 200 && sunAlt > -0.05;   // слепящее Солнце в кадре гасит слабые звёзды
  const magLim = glare ? 2.5 : 5.5;
  for (let i = 0; i < STARS.length; i += 4) {
    const mag = STARS[i + 2];
    if (mag > magLim) break;
    const p = altAz(STARS[i] * Math.PI / 180, STARS[i + 1] * Math.PI / 180, lst, LAT);
    if (p.alt < 0) continue;
    const s = proj(p.alt, p.az);
    if (s.x < 0 || s.x > w || s.y < 0 || s.y > horizonY) continue;
    const c = blackbodyCss(bvToTemp(STARS[i + 3]));
    const a = clamp01(1.25 - mag / 5);
    ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.6, 2.2 - mag * 0.35), 0, Math.PI * 2); ctx.fill();
  }

  // 2. Солнце: без атмосферы — белый диск с тусклой короной (видна и без затмения, если заслонить диск)
  const sunR = Math.max(2, sunAng * k), earthR = Math.max(3, earthAng * k);
  const ex = cx, ey = cy;
  const dSE = Math.hypot(sunP.x - ex, sunP.y - ey);
  let cover = 0;
  if (dSE < sunR + earthR) {
    if (dSE <= earthR - sunR) cover = 1;
    else {
      const r = earthR, rs = sunR, d = dSE;
      const a1 = r * r * Math.acos(Math.max(-1, Math.min(1, (d * d + r * r - rs * rs) / (2 * d * r))));
      const a2 = rs * rs * Math.acos(Math.max(-1, Math.min(1, (d * d + rs * rs - r * r) / (2 * d * rs))));
      const a3 = 0.5 * Math.sqrt(Math.max(0, (-d + r + rs) * (d + r - rs) * (d - r + rs) * (d + r + rs)));
      cover = Math.min(1, (a1 + a2 - a3) / (Math.PI * rs * rs));
    }
  }
  if (sunAlt > -sunAng) {
    const sc = blackbodyCss(state.temp);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const cor = ctx.createRadialGradient(sunP.x, sunP.y, sunR, sunP.x, sunP.y, sunR * (cover > 0.98 ? 6 : 3));
    cor.addColorStop(0, `rgba(235,240,255,${cover > 0.98 ? 0.55 : 0.25})`); cor.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(sunP.x, sunP.y, sunR * 6, 0, Math.PI * 2); ctx.fill();
    if (cover < 0.999) {
      const bloom = ctx.createRadialGradient(sunP.x, sunP.y, sunR, sunP.x, sunP.y, sunR * 2.2);
      bloom.addColorStop(0, `rgba(${sc[0] | 0},${sc[1] | 0},${sc[2] | 0},${0.6 * (1 - cover)})`); bloom.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(sunP.x, sunP.y, sunR * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = `rgb(${Math.min(255, sc[0] + 30) | 0},${Math.min(255, sc[1] + 30) | 0},${Math.min(255, sc[2] + 30) | 0})`;
    ctx.beginPath(); ctx.arc(sunP.x, sunP.y, sunR, 0, Math.PI * 2); ctx.fill();
  }

  // 3. Земля: настоящая текстура эпохи (континенты, облака, огни), фаза — от направления на Солнце
  const ux = sunP.x - ex, uy = sunP.y - ey, ul = Math.hypot(ux, uy) || 1;
  const st = Math.sin(cyc.theta);
  const light = [st * ux / ul, st * uy / ul, -Math.cos(cyc.theta)];
  const look = planetLook('earth', state);
  const body = drawPlanetBody(ctx, ex, ey, earthR, 'earth', look, state, now, null, light);
  // атмосфера Земли: тонкая голубая кайма на освещённой стороне; при затмении — красное кольцо закатов
  const climate = getPlanetClimate('earth', state);
  if (climate && climate.atmo.pBar > 0.01) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const lim = Math.max(1.2, earthR * 0.05);
    if (cyc.earthLit > 0.02 && !body.gl) {
      ctx.strokeStyle = `rgba(120,170,255,${0.35 * Math.sqrt(cyc.earthLit)})`; ctx.lineWidth = lim;
      const a0 = Math.atan2(uy, ux);
      ctx.beginPath(); ctx.arc(ex, ey, earthR + lim * 0.4, a0 - Math.PI / 2, a0 + Math.PI / 2); ctx.stroke();
    }
    // Солнце за Землёй: свет преломляется в атмосфере по всему лимбу — кольцо цвета T(λ)² (тот же расчёт, что у красной Луны)
    const behind = clamp01(1 - (dSE - earthR) / (sunR * 3 + earthR * 0.15));
    if (behind > 0) {
      const optics = atmosphereOptics('earth', climate);
      const col = eclipsedMoonColor(directLight([1, 1, 1], optics, 0)).map(v => 255 * Math.pow(v, 1 / 2.2));
      // кольцо: внутри диска прозрачно (ночная сторона Земли чёрная), максимум — на лимбе
      const R1 = earthR + lim * 3;
      const g = ctx.createRadialGradient(ex, ey, earthR * 0.9, ex, ey, R1);
      const f0 = (earthR - earthR * 0.9) / (R1 - earthR * 0.9);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(f0, `rgba(${col[0] | 0},${col[1] | 0},${col[2] | 0},${0.95 * behind})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, earthR + lim * 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // 4. Лунный грунт: реголит (альбедо ~0.12), освещён Солнцем или пепельным светом Земли
  const earthshine = 0.05 * cyc.earthLit;
  const lum = Math.max(dayK, earthshine * 3);
  const sr = blackbodyRGB(state.temp);
  const base = [150, 145, 138].map((v, i) => v * lum * (dayK > earthshine * 3 ? sr[i] : [0.75, 0.85, 1.0][i]));
  const rgb = (m) => `rgb(${base[0] * m | 0},${base[1] * m | 0},${base[2] * m | 0})`;
  ctx.fillStyle = rgb(0.75);
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, horizonY - 6 - 10 * Math.sin(x * 0.004 + 1.3) - 5 * Math.sin(x * 0.013));
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = rgb(1.0);
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, horizonY + 18 + 6 * Math.sin(x * 0.007));
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  // кратеры: эллипсы в перспективе, тень — со стороны Солнца
  const sunSide = Math.sign(sunP.x - cx) || 1;
  for (let i = 0; i < 14; i++) {
    const fx = ((i * 0.618 + 0.11) % 1) * w, fy = horizonY + 30 + ((i * 0.377) % 1) * (h - horizonY - 40);
    const rr = 6 + ((i * 7) % 11) * 3 * (fy - horizonY) / (h - horizonY);
    ctx.fillStyle = rgb(0.55);
    ctx.beginPath(); ctx.ellipse(fx + sunSide * rr * 0.15, fy, rr, rr * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rgb(1.25); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(fx, fy, rr, rr * 0.28, 0, sunSide > 0 ? -Math.PI / 2 : Math.PI / 2, sunSide > 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.stroke();
  }

  // 5. Подпись
  const deg = (r) => (2 * r * 180 / Math.PI);
  const lines = [
    `Земля с Луны: угловой диаметр ${deg(earthAng).toFixed(2)}° (в ${(earthAng / moonAng).toFixed(1)} раза больше Луны с Земли), освещена на ${Math.round(cyc.earthLit * 100)}%`,
    `Солнце: ${deg(sunAng).toFixed(2)}° • ${sunAlt > 0 ? 'лунный день' : 'лунная ночь'} (сутки на Луне ≈ 29.5 земных)`,
    cover > 0.995 ? 'Полное солнечное затмение Землёй — на Земле в это время полное лунное затмение'
      : cover > 0 ? `Земля закрывает ${Math.round(cover * 100)}% диска Солнца (на Земле — лунное затмение)` : 'Земля неподвижна в небе: Луна всегда обращена к ней одной стороной'
  ];
  ctx.font = '11px sans-serif';
  const bw = Math.min(w - 16, Math.max(...lines.map(l => ctx.measureText(l).width)) + 14);
  ctx.fillStyle = 'rgba(2,6,23,0.6)'; ctx.fillRect(8, h - 14 - lines.length * 15, bw, lines.length * 15 + 8);
  ctx.fillStyle = '#cbd5e1';
  lines.forEach((l, i) => ctx.fillText(l, 14, h - 6 - (lines.length - 1 - i) * 15 - 4));
}
