// Вид «Орбита»
import { getCustomExo } from '../model/exoplanets.js';
import { fateText, getPlanetDistanceAU, isPlanetHitByCME, isPlanetTidallyLocked } from '../physics/orbits.js';
import { getStarColor } from './colors.js';
import { planetLook } from './planetLook.js';
import { drawPlanetBody } from './planetBody.js';
import { moonDistanceRE, MOON_NOW_RE } from '../physics/moon.js';
import { spaceStars } from './particles.js';
import { S } from '../state.js';
import { rgb, rgba } from '../util/color.js';
import { lerp } from '../util/math.js';

export function drawOrbitAuroras(ctx, cx, cy, planetR, now, strength = 1) {
  // Аврорные овалы у магнитных полюсов: заметны только на ночной стороне (справа — от звезды прочь)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const wave = Math.sin(now * 0.003) * 0.1;
  for (const s of [-1, 1]) {
    const ox = cx + planetR * 0.32, oy = cy + s * planetR * 0.8;
    const g = ctx.createRadialGradient(ox, oy, planetR * 0.05, ox, oy, planetR * 0.32);
    g.addColorStop(0, `rgba(52, 211, 153, ${((0.35 + wave) * strength).toFixed(2)})`);
    g.addColorStop(0.6, `rgba(168, 85, 247, ${((0.15 + wave) * strength).toFixed(2)})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(ox, oy, planetR * 0.26, planetR * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Луна с фазой: освещена со стороны звезды (слева)
function drawMoonBody(ctx, m) {
  const g = ctx.createRadialGradient(m.x - m.r * 0.5, m.y - m.r * 0.15, m.r * 0.1, m.x, m.y, m.r);
  g.addColorStop(0, '#d6d3d1'); g.addColorStop(0.55, '#8b8680'); g.addColorStop(1, '#1c1b1a');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(70,70,75,0.35)';
  ctx.beginPath(); ctx.arc(m.x - m.r * 0.3, m.y - m.r * 0.2, m.r * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(m.x - m.r * 0.05, m.y + m.r * 0.25, m.r * 0.15, 0, Math.PI * 2); ctx.fill();
}

export function drawOrbitView(ctx, w, h, state, now) {
      ctx.fillStyle = '#010308';
      ctx.fillRect(0, 0, w, h);

      // 1. Процедурное свечение полосы Млечного Пути на фоне
      ctx.save();
      const mwGrad = ctx.createLinearGradient(0, h, w, 0);
      mwGrad.addColorStop(0, 'rgba(15, 23, 42, 0.0)');
      mwGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.04)');
      mwGrad.addColorStop(0.50, 'rgba(147, 51, 234, 0.06)');
      mwGrad.addColorStop(0.65, 'rgba(244, 114, 182, 0.03)');
      mwGrad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
      ctx.fillStyle = mwGrad;
      ctx.fillRect(0, 0, w, h);

      for (let s of spaceStars) {
        ctx.fillStyle = rgba(255, 255, 255, s.alpha * 0.85);
        ctx.beginPath();
        ctx.arc((s.x + 1) * 0.5 * w, (s.y + 1) * 0.5 * h, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      const cx = w * 0.5;
      const cy = h * 0.5;
      const planetR = Math.min(w, h) * 0.22;
      const pDist = getPlanetDistanceAU(S.currentPlanet, state);

      if (pDist <= 0.001) {
        ctx.fillStyle = '#0a0202';
        ctx.fillRect(0, 0, w, h);
        ctx.font = '15px sans-serif';
        ctx.fillStyle = '#f87171';
        ctx.textAlign = 'center';
        const pNames = { mercury: 'Меркурий', venus: 'Венера', earth: 'Земля', mars: 'Марс', europa: 'Европа', titan: 'Титан', pluto: 'Плутон', uranus: 'Уран', neptune: 'Нептун', haumea: 'Хаумеа', makemake: 'Макемаке', eris: 'Эрида' };
        ctx.fillText(`${pNames[S.currentPlanet] || 'Планета'} ${fateText(S.currentPlanet)}`, w / 2, h / 2);
        ctx.textAlign = 'left';
        return;
      }

      // Орбита Луны вокруг Земли (радиус — из модели приливного удаления; перед гибелью Земли Луну затягивает к Земле)
      const isEarthMoonActive = (S.currentPlanet === 'earth' && S.selectedStarId === 'sun' && state.t < 12.12 && state.t > 0.03);
      let moon = null;
      if (isEarthMoonActive) {
        const moonProgress = Math.max(0, (state.t - 11.5) / 0.62);
        const aMoon = planetR * 2.5 * moonDistanceRE(Math.max(0.03, state.t)) / MOON_NOW_RE;
        const moonOrbitR = lerp(aMoon, planetR * 1.38, Math.min(1, moonProgress));
        const ang = now * 0.0008;
        moon = { ang, orbitR: moonOrbitR, x: cx + Math.cos(ang) * moonOrbitR, y: cy + Math.sin(ang) * moonOrbitR * 0.45, r: Math.max(2.5, planetR * 0.273), front: Math.sin(ang) > 0 };
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, moonOrbitR, moonOrbitR * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (!moon.front) drawMoonBody(ctx, moon);
      }

      // Внешний вид — из климата планеты (render/planetLook.js)
      const look = planetLook(S.currentPlanet, state) || { land: [120, 110, 100], ocean: [25, 80, 170], oceanCoverage: 0, iceLat: 1, cloudCover: 0, cloudRgb: [255, 255, 255], atmoRgb: [147, 197, 253], atmoDensity: 0, glow: 0, lava: 0, frozenOcean: false, giant: false };
      const oceanCoverage = look.oceanCoverage;
      const oceanColor = look.ocean;
      const landColor = look.land;
      const atmoRgb = look.atmoRgb;
      const atmoDensity = look.atmoDensity;
      const isLocked = isPlanetTidallyLocked(S.currentPlanet, state.t);

      // Тонкие вертикальные кольца Урана

      if (S.currentPlanet === 'uranus') {
        ctx.save();
        ctx.strokeStyle = 'rgba(224, 242, 254, 0.35)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, planetR * 0.3, planetR * 1.85, 0.15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // 2–7. Тело планеты: попиксельная сфера (континенты эпохи, климат, облака, блик океана, терминатор, огни, лава)
      let shadow = null;
      if (moon && moon.front) {
        // тень Луны: луч от звезды (слева) через Луну до поверхности Земли — в долях радиуса Земли
        const mx = (moon.x - cx) / planetR, my = (moon.y - cy) / planetR, mz = Math.sin(moon.ang) * moon.orbitR * 0.89 / planetR;
        const dir = [0.92, 0.12, -0.37];
        const b2 = mx * dir[0] + my * dir[1] + mz * dir[2], c2 = mx * mx + my * my + mz * mz - 1, disc = b2 * b2 - c2;
        if (disc > 0 && mx < 0) {
          const s1 = -b2 - Math.sqrt(disc);
          if (s1 > 0) shadow = { x: mx + dir[0] * s1, y: my + dir[1] * s1, z: mz + dir[2] * s1, r: 0.55 };
        }
      }
      ctx.save();
      if (S.currentPlanet === 'haumea') { ctx.translate(cx, cy); ctx.rotate(0.3); ctx.scale(1.35, 0.72); ctx.translate(-cx, -cy); }
      const body = drawPlanetBody(ctx, cx, cy, planetR, S.currentPlanet, look, state, now, shadow);
      ctx.restore();

      // 8. Рэлеевское рассеяние света на лимбе (на GPU кайма считается в шейдере шара — здесь только для 2D-пути)
      if (atmoDensity > 0.05 && !body.gl) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        // Внешнее свечение ореола атмосферы
        const limbGlowR = planetR * 1.14;
        const limbGrad = ctx.createRadialGradient(cx, cy, planetR * 0.95, cx, cy, limbGlowR);
        limbGrad.addColorStop(0, rgba(atmoRgb[0], atmoRgb[1], atmoRgb[2], atmoDensity * 0.75));
        limbGrad.addColorStop(0.4, rgba(atmoRgb[0], atmoRgb[1], atmoRgb[2], atmoDensity * 0.35));
        limbGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = limbGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, limbGlowR, 0, Math.PI * 2);
        ctx.fill();

        // Тонкий неоновый серп на дневной кромке лимба
        const crescentGrad = ctx.createLinearGradient(cx - planetR * 1.05, cy, cx + planetR * 0.4, cy);
        crescentGrad.addColorStop(0, rgba(atmoRgb[0], atmoRgb[1], atmoRgb[2], atmoDensity * 0.95));
        crescentGrad.addColorStop(0.5, rgba(atmoRgb[0], atmoRgb[1], atmoRgb[2], atmoDensity * 0.35));
        crescentGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.strokeStyle = crescentGrad;
        ctx.lineWidth = Math.max(2.0, planetR * 0.04);
        ctx.beginPath();
        ctx.arc(cx, cy, planetR + 1.2, Math.PI * 0.55, Math.PI * 1.45);
        ctx.stroke();
        ctx.restore();
      }

      if (moon && moon.front) drawMoonBody(ctx, moon);

      // 9. Полярные сияния и реакция магнитосферы на удар CME
      const cmeHit = isPlanetHitByCME(S.currentPlanet, state);
      const hasField = (S.currentPlanet === 'earth' && state.t < 11.5) || (S.currentPlanet === 'mars' && state.t < 0.6) || S.currentPlanet === 'uranus' || S.currentPlanet === 'neptune' || (getCustomExo(S.currentPlanet) && getCustomExo(S.currentPlanet).type !== 'chthonian');
      if (atmoDensity > 0.1 && hasField && look.cloudCover < 0.9 && (cmeHit || S.isAurorasOn)) {
        drawOrbitAuroras(ctx, cx, cy, planetR, now, cmeHit ? 1 : 0.25);
        if (cmeHit) {
          drawOrbitAuroras(ctx, cx, cy, planetR * 1.04, now * 2.5, 1); // Удвоенное сияние при геомагнитном шторме
        }
      }
}
