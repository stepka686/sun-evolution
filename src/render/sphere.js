// Попиксельная сфера планеты на Canvas 2D: для каждой точки диска один раз считаются широта/долгота (с наклоном оси)
// и освещённость; в кадре добавляется только вращение и выбирается цвет из текстуры.
// Освещение: Ламберт + мягкий терминатор (рассеяние в атмосфере), зеркальный блик и френелевский отблеск океана,
// огни городов и лава — только на ночной стороне, тень Луны (полутень) на дневной.
import { TEX_H, TEX_W } from './planetTextures.js';
import { drawSphereGL } from '../gl/sphereGL.js';

const L0 = (() => { const v = [-0.92, -0.12, 0.37]; const n = Math.hypot(...v); return v.map(x => x / n); })();   // звезда слева (по умолчанию)
let geo = null;                          // { N, tilt, lat, lonBase, ndl, spec, fres, mask }
let canvas = null, cctx = null, img = null;

function buildGeometry(N, tiltDeg, L = L0) {
  const n2 = N * N;
  const g = { N, tilt: tiltDeg, lkey: L.map(v => v.toFixed(2)).join(','), v: new Float32Array(n2), u0: new Float32Array(n2), ndl: new Float32Array(n2), spec: new Float32Array(n2), fres: new Float32Array(n2), mask: new Uint8Array(n2), px: new Float32Array(n2), py: new Float32Array(n2), pz: new Float32Array(n2) };
  const ct = Math.cos(tiltDeg * Math.PI / 180), st = Math.sin(tiltDeg * Math.PI / 180);
  const Hh = [L[0], L[1], L[2] + 1]; const hn = Math.hypot(...Hh); const Hv = Hh.map(x => x / hn);
  for (let py = 0; py < N; py++) {
    const y = ((py + 0.5) / N) * 2 - 1;
    for (let px = 0; px < N; px++) {
      const x = ((px + 0.5) / N) * 2 - 1, k = py * N + px, r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2);
      g.mask[k] = r2 > 0.985 ? 2 : 1;     // 2 — край диска (сглаживание)
      // наклон оси: поворот в плоскости экрана
      const xb = x * ct + y * st, yb = -x * st + y * ct;
      const lat = Math.asin(Math.max(-1, Math.min(1, -yb)));
      g.v[k] = (0.5 - lat / Math.PI) * TEX_H;
      g.u0[k] = (Math.atan2(xb, z) / (2 * Math.PI) + 0.5) * TEX_W;
      g.ndl[k] = x * L[0] + y * L[1] + z * L[2];
      const nh = Math.max(0, x * Hv[0] + y * Hv[1] + z * Hv[2]);
      g.spec[k] = Math.pow(nh, 90) * 1.6 + Math.pow(nh, 12) * 0.12;
      g.fres[k] = Math.pow(1 - z, 4);
      g.px[k] = x; g.py[k] = y; g.pz[k] = z;
    }
  }
  return g;
}

/**
 * Рисует сферу радиуса R (CSS-пиксели) в точке (cx, cy).
 * tex — { color, ocean, lights }, clouds — Uint8Array плотности; spin, cloudSpin — поворот (доля оборота);
 * starRgb — цвет света звезды (0…1); cloudRgb — цвет облаков; nightLights — сила огней; shadow — тень Луны {x,y,z,r} в долях радиуса.
 */
export function drawSphere(ctx, cx, cy, R, tex, clouds, o) {
  // 5.0: сначала GPU; 2D-путь ниже — запасной (нет WebGL, контекст потерян или GPU выключен в настройках)
  if (drawSphereGL(ctx, cx, cy, R, tex, clouds, o)) return true;
  const dpr = ctx.getTransform ? ctx.getTransform().a : 1;
  const N = Math.max(48, Math.min(o.maxRes || 420, Math.round(2 * R * dpr)));
  // направление на звезду (o.light, координаты экрана: x вправо, y вниз, z к зрителю) — для фаз, например Земли с Луны
  const Lv = o.light ? (() => { const n = Math.hypot(...o.light) || 1; return o.light.map(x => x / n); })() : L0;
  const lkey = Lv.map(v => v.toFixed(2)).join(',');
  if (!geo || geo.N !== N || geo.tilt !== o.tilt || geo.lkey !== lkey) geo = buildGeometry(N, o.tilt, Lv);
  if (!canvas || canvas.width !== N) {
    canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
    cctx = canvas.getContext('2d'); img = cctx.createImageData(N, N);
  }
  const d = img.data, g = geo, n2 = N * N;
  const shift = (o.spin % 1) * TEX_W, cshift = (o.cloudSpin % 1) * TEX_W;
  const sr = o.starRgb, cr = o.cloudRgb, col = tex.color, oce = tex.ocean, lig = tex.lights;
  const amb = o.ambient ?? 0.03, lightsK = o.nightLights ?? 0, sh = o.shadow;
  for (let k = 0; k < n2; k++) {
    const m = g.mask[k];
    if (!m) { d[k * 4 + 3] = 0; continue; }
    const vy = g.v[k] | 0;
    let ux = (g.u0[k] + shift) | 0; ux = ((ux % TEX_W) + TEX_W) % TEX_W;
    const ti = vy * TEX_W + ux;
    let r = col[ti * 3], gg = col[ti * 3 + 1], b = col[ti * 3 + 2];
    // облака
    let cl = 0;
    if (clouds) { let cx2 = (g.u0[k] + cshift) | 0; cx2 = ((cx2 % TEX_W) + TEX_W) % TEX_W; cl = clouds[vy * TEX_W + cx2] / 255; }
    if (cl > 0) { r += (cr[0] - r) * cl; gg += (cr[1] - gg) * cl; b += (cr[2] - b) * cl; }
    // освещение: мягкий терминатор + оранжевая сумеречная полоса
    const ndl = g.ndl[k];
    let lit = ndl > 0 ? ndl : 0;
    const twi = ndl > -0.2 && ndl < 0.15 ? (1 - Math.abs(ndl) / (ndl < 0 ? 0.2 : 0.15)) * 0.5 : 0;
    lit = lit * 0.97 + amb;
    // тень Луны: полутень на дневной стороне
    if (sh && ndl > 0) {
      const dx = g.px[k] - sh.x, dy = g.py[k] - sh.y, dz = g.pz[k] - sh.z;
      const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dd < sh.r) lit *= 0.25 + 0.75 * (dd / sh.r) * (dd / sh.r);
    }
    let R0 = r * lit * sr[0], G0 = gg * lit * sr[1], B0 = b * lit * sr[2];
    if (twi > 0) { R0 += 40 * twi * sr[0]; G0 += 14 * twi * sr[1]; }
    // зеркальный блик и френелевский отблеск неба на воде (не под облаками)
    if (oce[ti] && ndl > 0) {
      const s = (g.spec[k] * 255 + g.fres[k] * 60) * (1 - cl) * Math.min(1, ndl * 3);
      R0 += s * sr[0]; G0 += s * sr[1]; B0 += s * sr[2];
    }
    // ночная сторона: огни городов, свечение лавы
    if (ndl < 0.05 && lig[ti]) {
      const nightK = Math.min(1, (0.05 - ndl) / 0.15) * (1 - cl * (tex.lava ? 0.92 : 0.7));
      const e = lig[ti] * nightK;
      if (tex.lava) { R0 += e * 1.0; G0 += e * 0.35; B0 += e * 0.05; }
      else { R0 += e * lightsK; G0 += e * 0.78 * lightsK; B0 += e * 0.4 * lightsK; }
    }
    const i4 = k * 4;
    d[i4] = R0; d[i4 + 1] = G0; d[i4 + 2] = B0; d[i4 + 3] = m === 2 ? 170 : 255;
  }
  cctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, cx - R, cy - R, 2 * R, 2 * R);
  ctx.restore();
  return false;
}
