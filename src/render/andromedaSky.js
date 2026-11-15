// 5.4: Андромеда на ночном небе — сближение, пролёт, приливные хвосты, слияние в эллиптическую галактику.
// Физика орбиты и модель диска — physics/andromeda.js. Здесь — проекция облака пятен на небо и яркость.
//   • яркость пятна задаётся поверхностной яркостью μ (ᵐ/□″, V) и не зависит от расстояния: подлетая, Андромеда
//     растёт на небе, но не становится ярче на единицу площади. Опора: μ = 20.5 — светлые участки Млечного Пути;
//   • глаз видит только яркие части (балдж и внутренний диск), внешний диск и хвосты (μ ≳ 24) — лишь на «фото»
//     (режим «Камера» — выдержка вчетверо дольше: это всё ещё скромнее, чем на художественных картинках NASA);
//   • пятна проецируются в полной перспективе, поэтому вблизи диск правильно «обнимает» небо.
import { S } from '../state.js';
import { andromedaView, m31Basis, m31Particles, vecToGal, sunPosition } from '../physics/andromeda.js';
import { sunGalactic } from './galaxyView.js';
import { altAz, effObliquity, galToEq, skyFrame } from './skyGeometry.js';
import { airMass } from '../physics/optics.js';

const MU_REF = 20.5, A_REF = 1.0;
// яркость на экране: поток сжат степенью 0.6 (восприятие яркости глазом — закон Стивенса), иначе ядро в тысячи раз
// ярче внешнего диска и на экране остаётся только «звёздочка» балджа. Опора та же: μ = 20.5 — как светлый Млечный Путь
const GAMMA = 0.6;
const sb = (mu) => Math.pow(10, -0.4 * GAMMA * (mu - MU_REF));
const KPC_TO_LY = 3261.6;
let sprites = null, parts = null;
const basis = m31Basis();

function makeSprite(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let k = 0; k <= 6; k++) {
    const f = k / 6, a = Math.exp(-3.2 * f * f) * (1 - f);
    gr.addColorStop(f, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})`);
  }
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return c;
}
function ensure() {
  if (sprites) return;
  sprites = { bulge: makeSprite([255, 226, 182]), disk: makeSprite([222, 224, 236]), ring: makeSprite([205, 216, 255]),
    hii: makeSprite([255, 150, 190]), tail: makeSprite([200, 210, 240]), halo: makeSprite([255, 236, 210]) };
  parts = m31Particles();
}

/** Возраст системы → время от сегодня и положение Солнца в Галактике */
export function andromedaNow(t) {
  const dt = t - (S.presentAge ?? 4.57);
  const g = sunGalactic(4.57 + dt);
  const key = S.andromedaScenario || 'gaia2026';
  const sun = sunPosition(g.phi, g.z);
  // направление на центр Галактики: Солнце обходит его за галактический год, и центр «едет» вдоль полосы Млечного Пути
  return { ...andromedaView(dt, key, sun), lGC: Math.atan2(-sun[1], -sun[0]) };
}

/**
 * Рисует остаток-эллиптическую галактику (когда полоса Млечного Пути размыта) и саму Андромеду.
 * p: { projEq, w, h, pxPerRad, starAlpha, kExt, view, now }
 */
export function drawAndromedaSky(ctx, p) {
  const v = p.view;
  if (!v) return;
  ensure();
  const boost = S.perception === 'camera' ? 4 : 1;
  const A = A_REF * p.starAlpha * boost;
  const ext = (alt) => p.kExt ? Math.pow(10, -0.4 * p.kExt * airMass(alt)) : 1;
  const sun = v.rel.map((x, k) => v.state.pos[k] - x);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const base = ctx.getTransform();
  const proj = (dir) => { const g = vecToGal(dir), eq = galToEq(g.l, g.b); return p.projEq(eq.ra, eq.dec); };
  // J — эллипс пятна на экране: столбцы — куда уходят 1 кпк вдоль e1 и e2 диска (null — рисуем кружком)
  const blob = (sprite, dir, r, alpha, J = null) => {
    const q = proj(dir);
    if (q.alt < -0.03) return;
    let rr = r, a = alpha * ext(Math.max(0.01, q.alt));
    if (rr < 2) { a *= (rr / 2) ** 2; rr = 2; J = null; }   // меньше пикселя — тот же поток в пятне 2 пикс.
    rr = Math.min(rr, p.w * 1.5);
    if (a < 0.003 || q.x < -rr || q.x > p.w + rr || q.y < -rr || q.y > p.h + rr) return;
    ctx.globalAlpha = 1 - Math.exp(-a);   // мягкое насыщение вместо обрезки: ядро не «выгорает» в плоское пятно
    if (!J) { ctx.drawImage(sprite, q.x - rr, q.y - rr, rr * 2, rr * 2); return; }
    // аффинное преобразование поверх базового (DPR): пятно лежит в плоскости диска
    const k = J.k;
    ctx.setTransform(base.a * J.ax * k + base.c * J.ay * k, base.b * J.ax * k + base.d * J.ay * k,
      base.a * J.bx * k + base.c * J.by * k, base.b * J.bx * k + base.d * J.by * k,
      base.a * q.x + base.c * q.y + base.e, base.b * q.x + base.d * q.y + base.f);
    ctx.drawImage(sprite, -1, -1, 2, 2);
    ctx.setTransform(base);
  };

  // 1) Остаток слияния: свечение эллиптической галактики, ярче к её центру (Солнце внутри, ~8 кпк от центра).
  //    Гладко: равномерная подсветка всего неба + широкий градиент к центру остатка
  if (v.mw > 0.01) {
    const c = proj([-sun[0], -sun[1], -sun[2]]);
    const a0 = 0.18 * v.mw * A * sb(22.6), a1 = 0.35 * v.mw * A * sb(19.8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(255,236,210,${Math.min(1, a0).toFixed(3)})`; ctx.fillRect(0, 0, p.w, p.h);
    const R = 1.3 * p.pxPerRad, g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
    [[0, 1], [0.15, 0.55], [0.4, 0.2], [0.7, 0.06], [1, 0]].forEach(([f, k]) => g.addColorStop(f, `rgba(255,232,200,${Math.min(1, a1 * k).toFixed(3)})`));
    ctx.fillStyle = g; ctx.fillRect(0, 0, p.w, p.h);
  }

  // 2) Андромеда: облако пятен в перспективе
  const fade = 1 - v.merge;
  if (fade > 0.01) {
    const C = v.state.pos, { e1, e2, n } = basis;
    // экранный эллипс диска у его центра: e1 и e2 по 1 кпк (с запасом на толщину диска ~0.12 от радиуса)
    const Cs = C.map((x, k) => x - sun[k]), dC = Math.hypot(...Cs), dl = Math.min(2, 0.02 * dC);
    const P0 = proj(Cs), P1 = proj(Cs.map((x, k) => x + dl * e1[k])), P2 = proj(Cs.map((x, k) => x + dl * e2[k]));
    let J0 = { ax: (P1.x - P0.x) / dl, ay: (P1.y - P0.y) / dl, bx: (P2.x - P0.x) / dl, by: (P2.y - P0.y) / dl };
    const la = Math.hypot(J0.ax, J0.ay), lb = Math.hypot(J0.bx, J0.by);
    if (!(la > 0 && lb > 0) || Math.abs(P1.x - P0.x) > p.w / 2 || Math.abs(P2.x - P0.x) > p.w / 2) J0 = null;   // разрыв по азимуту
    else {
      // толщина: малая ось эллипса не тоньше 0.12 большой (диск — не бесконечно тонкий)
      const big = Math.max(la, lb), area = Math.abs(J0.ax * J0.by - J0.ay * J0.bx) / big;
      const need = 0.12 * big - area;
      if (need > 0) {
        const ux = la >= lb ? J0.ax / la : J0.bx / lb, uy = la >= lb ? J0.ay / la : J0.by / lb;
        if (la >= lb) { J0.bx += -uy * need; J0.by += ux * need; } else { J0.ax += -uy * need; J0.ay += ux * need; }
      }
    }
    for (const q of parts) {
      const W = [0, 1, 2].map(k => C[k] + q.x * e1[k] + q.y * e2[k] + q.z * n[k] - sun[k]);
      const d = Math.hypot(W[0], W[1], W[2]);
      // пятно шире шага сетки (×2.6), чтобы соседние сливались в гладкий диск; яркость пятна — пропорционально меньше
      const r = 3.2 * q.s / d * p.pxPerRad;
      // балдж — плотные пятна внахлёст: сильнее ослабляем, чтобы ядро светилось, а не выгорало в белый блин
      let sprite = sprites[q.kind], a = (q.kind === 'bulge' ? 0.08 : 0.3) * A * sb(q.mu) * fade;
      // вспышка звездообразования: розовые области HII в кольце и рукавах
      if (v.burst > 0.05 && q.kind === 'ring') { sprite = sprites.hii; a *= 1 + 2.5 * v.burst; }
      // балдж — сфероид: кружок; диск — эллипс в своей плоскости
      blob(sprite, W, r, a, J0 && q.kind !== 'bulge' ? { ...J0, k: 3.2 * q.s * dC / d } : null);
    }
    // 3) Приливные хвосты после первого пролёта: звёзды, сорванные в перицентре, тянутся вдоль орбиты
    if (v.tidal > 0.02) {
      const o = v.orbit, tp = o.tPeri, now = v.dt;
      // хвост начинается от края диска (f ≥ 0.2), а не из ядра — иначе пятна хвоста копятся в центре
      for (let i = 8; i <= 40; i++) {
        const f = i / 40;
        const back = o.at(tp + (now - tp) * (1 - f)).pos;                  // след позади
        for (const side of [1, -0.7]) {
          const P = C.map((c, k) => c + side * (back[k] - c) * v.tidal);
          const W = P.map((x, k) => x - sun[k]);
          const d = Math.hypot(W[0], W[1], W[2]);
          blob(sprites.tail, W, 1.4 * (4 + 6 * f) / d * p.pxPerRad, 0.5 * A * sb(23.8 + 2 * f) * fade * v.tidal * Math.min(1, (f - 0.15) * 4));
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // подпись
  if (S.showConstellations && fade > 0.3) {
    const eq = galToEq(v.l, v.b), q = p.projEq(eq.ra, eq.dec);
    if (q.alt > 0.03 && q.x > 0 && q.x < p.w) {
      const ly = v.d * KPC_TO_LY;
      const dist = ly > 1e6 ? `${(ly / 1e6).toFixed(2)} млн св. лет` : `${Math.round(ly / 1000).toLocaleString('ru')} тыс. св. лет`;
      ctx.font = '10px sans-serif'; ctx.fillStyle = `rgba(196,181,253,${(0.75 * p.starAlpha).toFixed(2)})`;
      ctx.fillText(`Андромеда (M31) • ${dist} • ${(2 * v.angR * 180 / Math.PI).toFixed(v.angR > 0.1 ? 0 : 1)}°`, q.x + 6, q.y - 6);
    }
  }
}

/** Лучшая ночь, чтобы увидеть M31 с планеты в возрасте t: день года и час, когда звезда под горизонтом, а M31 выше всего */
export function bestAndromedaNight(planet, t) {
  const v = andromedaNow(t), eq = galToEq(v.l, v.b), eps = effObliquity(planet, null);
  let best = null;
  for (let doy = 1; doy <= 365; doy += 8) for (let tod = 0; tod < 24; tod += 0.5) {
    const f = skyFrame(doy, tod, eps, false);
    if (f.sunAlt > -0.3) continue;
    const a = altAz(eq.ra, eq.dec, f.lst, f.lat).alt;
    if (a < 1.15 && (!best || a > best.alt)) best = { doy, tod, alt: a };
  }
  return best;
}
