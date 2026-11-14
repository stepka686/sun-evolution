// Отрисовка звезды, разрез недр, баланс сил
import { interiorLayers, seismology } from '../model/interior.js';
import { drawStarDiskGL } from '../gl/starGL.js';
import { hydroEqBadge } from '../dom.js';
import { getAsteroseismicData } from '../model/activity.js';
import { BROWN_DWARF_LIMIT } from '../physics/stellar.js';
import { stellarWindStream } from './particles.js';
import { getStarColor } from './colors.js';
import { S } from '../state.js';
import { rgb, rgba } from '../util/color.js';
import { lerp } from '../util/math.js';

// Гранулы: яркие поднимающиеся ячейки, тёмные межгранульные промежутки. Спрайт рисуется один раз.
let granuleSprite = null;
function getGranuleSprite() {
  if (granuleSprite) return granuleSprite;
  const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(64, 64) : Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,245,220,0.38)'); gr.addColorStop(0.6, 'rgba(255,220,170,0.14)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  granuleSprite = c;
  return c;
}
function drawGranulation(ctx, R, frac, now, rot) {
  const n = Math.max(5, Math.min(S.lowQuality ? 140 : 420, Math.round(0.9 / (frac * frac))));
  const sprite = getGranuleSprite();
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.clip();      // гранулы — только на диске
  // межгранульные промежутки — общий лёгкий затемняющий слой
  ctx.fillStyle = 'rgba(40,10,0,0.18)';
  ctx.fillRect(-R, -R, 2 * R, 2 * R);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    // равномерно по диску (золотой угол), с медленным вращением
    const rr = Math.sqrt((i + 0.5) / n), a = i * 2.39996 + rot * 0.3;
    const x = Math.cos(a) * rr * R, y = Math.sin(a) * rr * R;
    const life = 0.5 + 0.5 * Math.sin(now * 0.0006 * (1 + (i % 7) * 0.13) + i * 1.7);   // гранулы живут и гаснут
    const s = frac * R * 2.2 * (0.7 + 0.5 * life) * Math.sqrt(Math.max(0.2, 1 - rr * rr));  // у края — сжаты перспективой
    ctx.globalAlpha = 0.35 + 0.65 * life;
    ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
  }
  ctx.restore();
}

export function drawDetailedStarSurface(ctx, starPx, state, colors, now, camZoom) {
  const isGiant = state.r > 15.0;
  const isWhiteDwarf = state.r < 0.05;
  const isYoungStar = state.t < 0.02;
  const cCore = (S.selectedStarId === 'la_superba' && state.r > 50) ? [185, 28, 28] : colors.coreRGB;
  const cOuter = (S.selectedStarId === 'la_superba' && state.r > 50) ? [120, 10, 10] : colors.outerRGB;
  const isOblate = (S.selectedStarId === 'altair' || S.selectedStarId === 'regulus' || S.selectedStarId === 'spica');
  const oblateX = isOblate ? (S.selectedStarId === 'spica' ? 1.42 : (S.selectedStarId === 'regulus' ? 1.34 : 1.25)) : 1.0;
  const oblateY = isOblate ? (S.selectedStarId === 'spica' ? 0.78 : 0.82) : 1.0;
  // 1. Потоки звёздного ветра, улетающие в космос (аддитивное наложение)
  if (!isWhiteDwarf && starPx > 4.0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let p of stellarWindStream) {
      const streamDist = starPx * (1.15 + ((p.distFactor + now * 0.0003 * p.speed) % 1.0) * (isGiant ? 2.8 : 4.5));
      const pAngle = p.angle + now * 0.00008;
      const px = Math.cos(pAngle) * streamDist * oblateX;
      const py = Math.sin(pAngle) * streamDist * oblateY;
      const fade = 1.0 - (streamDist / (starPx * (isGiant ? 3.9 : 5.6)));

      if (fade > 0.02) {
        ctx.fillStyle = rgba(cOuter[0], cOuter[1], cOuter[2], p.alpha * fade * 0.45);
        ctx.beginPath();
        ctx.arc(px, py, (p.size * Math.max(1, starPx * 0.02)) / camZoom, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // 2. Многослойный оптический блум и динамическая корона (HDR Glare)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const coronaFlicker = 1.0 + Math.sin(now * 0.0025) * 0.035;

  // Внешний мягкий туман короны
  const outerGlowR = Math.max(1, starPx * (isGiant ? 3.2 : 4.2) * coronaFlicker);
  const outerGlow = ctx.createRadialGradient(0, 0, starPx * 0.8, 0, 0, outerGlowR);
  outerGlow.addColorStop(0, rgba(cOuter[0], cOuter[1], cOuter[2], 0.35));
  outerGlow.addColorStop(0.4, rgba(cOuter[0], cOuter[1], cOuter[2], 0.12));
  outerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = outerGlow;
  ctx.beginPath();
  ctx.arc(0, 0, outerGlowR, 0, Math.PI * 2);
  ctx.fill();

  // Внутренний раскаленный ореол
  const innerGlowR = Math.max(1, starPx * 1.85);
  const innerGlow = ctx.createRadialGradient(0, 0, starPx * 0.2, 0, 0, innerGlowR);
  innerGlow.addColorStop(0, rgba(cCore[0], cCore[1], cCore[2], 0.65));
  innerGlow.addColorStop(0.5, rgba(cOuter[0], cOuter[1], cOuter[2], 0.35));
  innerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = innerGlow;
  ctx.beginPath();
  ctx.arc(0, 0, innerGlowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Ударные волны AGB-пульсаций
  if (state.pulseActive) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const shockRadius = starPx * (1.1 + state.pulsePhase * 3.4);
    const shockAlpha = Math.max(0, 1.0 - state.pulsePhase);
    ctx.strokeStyle = `rgba(251, 146, 60, ${(shockAlpha * 0.85).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, 5 / camZoom);
    ctx.beginPath();
    ctx.arc(0, 0, shockRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

        // Биполярная туманность Гомункул для Эты Киля
  if (S.selectedStarId === 'eta_carinae' && state.t >= 0.0025) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lobeR = starPx * 2.8;
    for (let sign = -1; sign <= 1; sign += 2) {
      const lobeY = sign * lobeR * 0.75;
      const homGrad = ctx.createRadialGradient(0, lobeY, 2, 0, lobeY, lobeR * 0.85);
      homGrad.addColorStop(0, 'rgba(251, 146, 60, 0.85)');
      homGrad.addColorStop(0.5, 'rgba(180, 83, 9, 0.55)');
      homGrad.addColorStop(0.85, 'rgba(120, 53, 15, 0.25)');
      homGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = homGrad;
      ctx.beginPath();
      ctx.ellipse(0, lobeY, lobeR * 0.65, lobeR * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Спиральный газопылевой шлейф и кометный хвост для Миры (ο Кита)
  if (S.selectedStarId === 'mira') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.42)';
    ctx.lineWidth = Math.max(2, 5 / camZoom);
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4.5; a += 0.12) {
      const rSpiral = starPx * (1.0 + a * 0.38);
      const rotA = a - now * 0.0018;
      const sx = Math.cos(rotA) * rSpiral;
      const sy = Math.sin(rotA) * rSpiral;
      if (a === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Ионизированный пузырь ветра Вольфа — Райе (для гипергигантов >= 20 M☉)
  if (S.selectedStarMass >= 20.0 && state.temp >= 50000 && state.r > 1.0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const wrBubbleR = starPx * 4.5;
    const wrGrad = ctx.createRadialGradient(0, 0, wrBubbleR * 0.65, 0, 0, wrBubbleR);
    wrGrad.addColorStop(0, 'rgba(56, 189, 248, 0)');
    wrGrad.addColorStop(0.8, 'rgba(56, 189, 248, 0.35)');
    wrGrad.addColorStop(0.95, 'rgba(168, 85, 247, 0.45)');
    wrGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = wrGrad;
    ctx.beginPath();
    ctx.arc(0, 0, wrBubbleR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Сверхмощная магнитосфера и гамма-вспышки Магнетара SGR 1806-20
  if (S.selectedStarId === 'sgr1806') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const magR = Math.max(28 / camZoom, starPx * 6.0);
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.75)';
    ctx.lineWidth = Math.max(1.2, 2.0 / camZoom);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + now * 0.004;
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * magR * 0.5, Math.sin(a) * magR * 0.5, magR * 0.6, magR * 0.28, a, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Периодический гамма-всплеск звездотрясения
    const burst = Math.pow(Math.max(0, Math.sin(now * 0.0025)), 14);
    if (burst > 0.1) {
      ctx.fillStyle = `rgba(233, 213, 255, ${(burst * 0.85).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(0, 0, magR * (1.5 + burst * 3.0), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 3. Тело звезды: сейсмическое дыхание недр и турбулентная кромка
  const seismic = getAsteroseismicData(state);
  const breathR = starPx * (1.0 + seismic.breathOffset);

  ctx.save();
  ctx.scale(oblateX, oblateY);

  ctx.beginPath();
  const wavePoints = 48;
  for (let i = 0; i <= wavePoints; i++) {
    const a = (i / wavePoints) * Math.PI * 2;
    const wave = (!isWhiteDwarf && breathR > 10.0) 
      ? (Math.sin(a * 7 + now * 0.003) * 0.012 + Math.cos(a * 13 - now * 0.002) * 0.008) 
      : 0;
    const curR = breathR * (1.0 + wave);
    const px = Math.cos(a) * curR;
    const py = Math.sin(a) * curR;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();

  // Потемнение к краю (серая атмосфера Эддингтона): I(μ)/I(1) = (2 + 3μ)/5, μ = cos θ = √(1 − r²);
  // к краю виден более высокий и холодный слой: T(μ) = T_eff·[¾(μ + ⅔)]^¼ — поэтому край ещё и краснее
  const limbGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(0.1, breathR));
  const special = S.selectedStarId === 'la_superba' && state.r > 50;
  const limbStops = [];
  for (const rr of [0, 0.4, 0.6, 0.75, 0.86, 0.93, 0.97, 1.0]) {
    const mu = Math.sqrt(Math.max(0, 1 - rr * rr));
    const I = (2 + 3 * mu) / 5;
    const c = special ? cCore : getStarColor(state.temp * Math.pow(0.75 * (mu + 2 / 3), 0.25)).coreRGB;
    limbGrad.addColorStop(rr, rgb(c[0] * I, c[1] * I, c[2] * I));
    limbStops.push([rr, [c[0] * I, c[1] * I, c[2] * I]]);
  }
  // 5.0: на GPU — тот же профиль плюс ячеистая грануляция в шейдере (размер ячейки — как ниже для 2D)
  const glCell = (!isWhiteDwarf && breathR >= 8) ? Math.min(0.35, 0.0015 * (state.temp / 5772) * Math.pow(state.r / Math.max(0.08, state.mass), 1.25)) : 0;
  const glDisk = drawStarDiskGL(ctx, breathR, limbStops, glCell, now, now * 0.00015);
  if (!glDisk) { ctx.fillStyle = limbGrad; ctx.fill(); }

  // Гравитационное потемнение фон Цейпеля для сплюснутых светил
  if (isOblate) {
    const vonZeipelGrad = ctx.createLinearGradient(0, -breathR, 0, breathR);
    vonZeipelGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    vonZeipelGrad.addColorStop(0.25, 'rgba(255, 255, 255, 0.05)');
    vonZeipelGrad.addColorStop(0.50, 'rgba(217, 119, 6, 0.40)');
    vonZeipelGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.05)');
    vonZeipelGrad.addColorStop(1, 'rgba(255, 255, 255, 0.45)');
    ctx.fillStyle = vonZeipelGrad;
    ctx.beginPath();
    ctx.arc(0, 0, breathR, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Кипящая конвекция и миграция пятен по закону Шпёрера (Диаграмма бабочек)
  if (breathR >= 8.0 && !isWhiteDwarf) {
    ctx.save();
    ctx.clip();

    const timeRot = now * 0.00015;
    // Грануляция: размер ячейки ~10 шкал высот фотосферы, H_p = kT/(μ m_H g) ∝ T·R²/M → доля радиуса ∝ T·R/M.
    // У Солнца гранула ~1000 км (0.15% радиуса), у Бетельгейзе — ячейки в десятки процентов радиуса (Schwarzschild 1975)
    // (у гигантов ячейки растут быстрее — турбулентное давление и низкая g: показатель 1.25 подобран по 3D-моделям Chiavassa et al. 2011)
    const cellFrac = Math.min(0.35, 0.0015 * (state.temp / 5772) * Math.pow(state.r / Math.max(0.08, state.mass), 1.25));
    const cellPx = cellFrac * breathR;
    if (glDisk && (cellPx >= 2.5 || isGiant)) {
      // грануляция уже в шейдере
    } else if (cellPx >= 2.5) {
      drawGranulation(ctx, breathR, cellFrac, now, timeRot);
    } else if (isGiant) {
      // Супергранулы конвекции красных гигантов
      const cellCount = 8;
      for (let i = 0; i < cellCount; i++) {
        const a = (i / cellCount) * Math.PI * 2 + timeRot * 0.4;
        const dist = breathR * 0.52 * (0.8 + 0.2 * Math.sin(i * 3 + now * 0.0012));
        const cx = Math.cos(a) * dist;
        const cy = Math.sin(a) * dist;
        const rCell = breathR * (0.34 + 0.06 * Math.sin(now * 0.002 + i));

        const cellGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rCell);
        cellGrad.addColorStop(0, `rgba(255, 195, 75, ${0.40 + 0.12 * Math.sin(now * 0.002 + i)})`);
        cellGrad.addColorStop(0.65, 'rgba(180, 40, 10, 0.18)');
        cellGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = cellGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, rCell, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Динамическая грануляция
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const granAlpha = 0.08 + 0.03 * Math.sin(now * 0.003);
      const granGrad = ctx.createRadialGradient(
        Math.sin(now * 0.001) * breathR * 0.2, 
        Math.cos(now * 0.001) * breathR * 0.2, 
        breathR * 0.1, 
        0, 0, breathR
      );
      granGrad.addColorStop(0, `rgba(255, 255, 255, ${granAlpha})`);
      granGrad.addColorStop(0.7, 'rgba(254, 240, 138, 0.03)');
      granGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = granGrad;
      ctx.fillRect(-breathR, -breathR, breathR * 2, breathR * 2);
      ctx.restore();

      // Дрейф солнечных пятен: от высоких широт (±35°) к экватору (±5°) по фазе цикла
      const cycleP = seismic.cyclePhase;
      const driftLat = lerp(0.55, 0.08, cycleP); // Сползание к экватору
      const spotScale = (isYoungStar ? 2.5 : 1.0) * (0.2 + 0.8 * seismic.activityLevel);

      const spotGroups = [
        { lon: 0.15, latSign: 1, baseR: 0.075 },
        { lon: 0.32, latSign: 1, baseR: 0.055 },
        { lon: -0.45, latSign: -1, baseR: 0.085 },
        { lon: -0.28, latSign: -1, baseR: 0.045 },
        { lon: 0.85, latSign: 1, baseR: 0.065 }
      ];

      const spotRot = now * 0.00022;
      for (let sp of spotGroups) {
        const curLon = sp.lon + spotRot;
        if (Math.cos(curLon) < -0.15) continue;

        const lat = sp.latSign * driftLat;
        const sx = Math.sin(curLon) * breathR * Math.cos(lat);
        const sy = Math.sin(lat) * breathR;
        const spotR = breathR * sp.baseR * spotScale;

        if (spotR > 1.2) {
          // Полутень (Penumbra)
          ctx.fillStyle = 'rgba(90, 45, 15, 0.70)';
          ctx.beginPath();
          ctx.arc(sx, sy, spotR, 0, Math.PI * 2);
          ctx.fill();

          // Тень (Umbra)
          ctx.fillStyle = 'rgba(15, 8, 4, 0.95)';
          ctx.beginPath();
          ctx.arc(sx, sy, spotR * 0.52, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Красные карлики полностью конвективны и очень активны: пятна закрывают до трети диска, в том числе у полюсов
      if (state.temp < 4000 && state.mass < 0.6 && !isGiant) {
        const mSpots = [[0.4, 0.7, 0.2], [1.6, 0.2, 0.16], [2.6, -0.45, 0.18], [3.9, 0.85, 0.14], [5.0, -0.1, 0.13], [0.9, -0.8, 0.15]];
        for (const [lon0, lat, rs] of mSpots) {
          const lon = lon0 + spotRot * 0.6;
          if (Math.cos(lon) < -0.1) continue;
          const sx = Math.sin(lon) * breathR * Math.cos(lat), sy = Math.sin(lat) * breathR;
          ctx.fillStyle = 'rgba(60, 15, 5, 0.55)';
          ctx.beginPath(); ctx.ellipse(sx, sy, breathR * rs * Math.max(0.3, Math.cos(lon)), breathR * rs, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.restore();
  }
  ctx.restore();

  // 5. Протуберанцы и магнитные плазменные петли
  if (starPx >= 8.0 && !isWhiteDwarf) {
    const isRedDwarfActive = (S.selectedStarMass < 0.45 && state.t < 25.0);
    const loopCount = isGiant ? 4 : (isRedDwarfActive ? 6 : 3);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1.4, 2.2 / camZoom);

    for (let i = 0; i < loopCount; i++) {
      const loopAngle = (i / loopCount) * Math.PI * 2 + now * 0.00018 * (i % 2 === 0 ? 1 : -1);
      const cosA = Math.cos(loopAngle);
      const sinA = Math.sin(loopAngle);
      let loopHeight = starPx * (isGiant ? 0.22 : 0.14) * (0.8 + 0.3 * Math.sin(now * 0.0025 + i * 2));

      if (isRedDwarfActive && i === 0) {
        const flarePulse = Math.pow(Math.max(0, Math.sin(now * 0.004)), 6.0);
        loopHeight += starPx * flarePulse * 2.8;
        if (flarePulse > 0.3) {
          ctx.strokeStyle = `rgba(255, 235, 175, ${(flarePulse * 0.95).toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(cosA * starPx * oblateX, sinA * starPx * oblateY);
          ctx.lineTo(cosA * (starPx + loopHeight * 1.5) * oblateX, sinA * (starPx + loopHeight * 1.5) * oblateY);
          ctx.stroke();
        }
      }

      const base1X = Math.cos(loopAngle - 0.08) * starPx * oblateX;
      const base1Y = Math.sin(loopAngle - 0.08) * starPx * oblateY;
      const base2X = Math.cos(loopAngle + 0.08) * starPx * oblateX;
      const base2Y = Math.sin(loopAngle + 0.08) * starPx * oblateY;
      const peakX = cosA * (starPx + loopHeight) * oblateX;
      const peakY = sinA * (starPx + loopHeight) * oblateY;

      ctx.strokeStyle = rgba(cOuter[0], cOuter[1], cOuter[2], 0.85);
      ctx.beginPath();
      ctx.moveTo(base1X, base1Y);
      ctx.quadraticCurveTo(peakX, peakY, base2X, base2Y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Дифракционные оптические лучи (Diffraction Spikes телескопа)
  if (camZoom > 0.12 && state.l > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const spikeLumFactor = Math.min(3.5, Math.max(0.6, Math.log10(Math.max(0.1, state.l) + 1.0) * 0.8));
    const spikeLen = Math.min(380, Math.max(starPx * 2.2, starPx * 1.2 + 45 * spikeLumFactor));
    const spikeAlpha = Math.min(0.65, Math.max(0.12, 0.42 * spikeLumFactor));

    for (let angle of [0, Math.PI / 2]) {
      const sGrad = ctx.createLinearGradient(
        -Math.cos(angle) * spikeLen, -Math.sin(angle) * spikeLen,
        Math.cos(angle) * spikeLen, Math.sin(angle) * spikeLen
      );
      sGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      sGrad.addColorStop(0.35, rgba(cOuter[0], cOuter[1], cOuter[2], spikeAlpha * 0.4));
      sGrad.addColorStop(0.5, rgba(255, 255, 255, spikeAlpha));
      sGrad.addColorStop(0.65, rgba(cOuter[0], cOuter[1], cOuter[2], spikeAlpha * 0.4));
      sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.strokeStyle = sGrad;
      ctx.lineWidth = Math.max(0.8, 1.8 / camZoom);
      ctx.beginPath();
      ctx.moveTo(-Math.cos(angle) * spikeLen, -Math.sin(angle) * spikeLen);
      ctx.lineTo(Math.cos(angle) * spikeLen, Math.sin(angle) * spikeLen);
      ctx.stroke();
    }
    ctx.restore();
  }
}

export function drawCutawayCore(ctx, starPx, state) {
      const visualR = Math.max(65 / S.camZoom, Math.min(starPx, 160 / S.camZoom));
            let layers = [];
// 1. Разрез для коричневых карликов (< 0.075 M☉)
      // 4.9: строение звёзд 0.075–8 M☉ — по составу в центре и радиусу трека MIST (model/interior.js)
      const model = (S.selectedStarMass >= BROWN_DWARF_LIMIT && S.selectedStarMass < 8.0 && state.t >= 0 && !S.isDeepTime)
        ? interiorLayers(state, S.selectedStarMass) : null;
      if (model) {
        layers = model.layers.map(l => ({ name: l.name, rPct: Math.max(0.03, Math.pow(l.r, model.scale)), color: l.color }));
      } else if (S.selectedStarMass < BROWN_DWARF_LIMIT) {
        layers = [
          { name: "Вырожденное ядро (синтез дейтерия)", rPct: 0.30, color: "#93c5fd" },
          { name: "Полностью конвективная мантия", rPct: 1.0, color: "rgba(180, 83, 9, 0.45)" }
        ];
      }
      // 2. Разрез для красных карликов (0.15 - 0.45 M☉)
      else if (S.selectedStarMass < 0.45) {
        if (state.r < 0.05) {
          layers = [{ name: "Вырожденное гелиевое ядро карлика", rPct: 1.0, color: "#93c5fd" }];
        } else {
          layers = [
            { name: "Конвективное протонное ядро", rPct: 0.35, color: "#fef08a" },
            { name: "Сплошная конвективная зона (нет лучистого переноса)", rPct: 1.0, color: "rgba(249, 115, 22, 0.45)" }
          ];
        }
      } 
      // 3. Разрез для гипергигантов и Чёрных дыр (>= 20.0 M☉)
      else if (S.selectedStarMass >= 20.0) {
        if (state.r < 0.001) {
          layers = [
            { name: "Гравитационная сингулярность (ρ → ∞)", rPct: 0.08, color: "#ffffff" },
            { name: "Горизонт событий (R_Schwarzschild)", rPct: 0.32, color: "#000000" },
            { name: "Фотонная сфера (орбиты световых лучей)", rPct: 0.52, color: "#38bdf8" },
            { name: "Релятивистский аккреционный поток", rPct: 1.0, color: "rgba(249, 115, 22, 0.5)" }
          ];
        } else if (state.r > 80.0) {
          layers = [
            { name: "Железо-никелевое ядро (предшественник ЧД)", rPct: 0.14, color: "#64748b" },
            { name: "Слой кремниевого горения (Si → Fe)", rPct: 0.24, color: "#c084fc" },
            { name: "Слой горения кислорода и неона", rPct: 0.38, color: "#f43f5e" },
            { name: "Слой углеродного горения", rPct: 0.52, color: "#22c55e" },
            { name: "Слой горения гелия", rPct: 0.68, color: "#f59e0b" },
            { name: "Слой горения водорода", rPct: 0.82, color: "#38bdf8" },
            { name: "Конвективная мантия гипергиганта", rPct: 1.0, color: "rgba(220, 38, 38, 0.4)" }
          ];
        } else {
          layers = [
            { name: "Сверхплотное конвективное ядро (CNO)", rPct: 0.42, color: "#e0f2fe" },
            { name: "Зона колоссального радиационного давления", rPct: 0.85, color: "#60a5fa" },
            { name: "Оболочка гиперветра Вольфа — Райе", rPct: 1.0, color: "rgba(147, 197, 253, 0.4)" }
          ];
        }
      } 
      // 4. Разрез для массивных звёзд (8.0 - 20.0 M☉, включая Бетельгейзе и Денеб)
      else if (S.selectedStarMass >= 8.0) {
        if (state.r < 0.001) {
          layers = [
            { name: "Сверхтекучая нейтронная сердцевина", rPct: 0.45, color: "#e0f2fe" },
            { name: "Кристаллическая кора нейтронной звезды", rPct: 1.0, color: "#38bdf8" }
          ];
        } else if (state.l > 1e7) {
          layers = [
            { name: "Коллапсирующее протонейтронное ядро", rPct: 0.18, color: "#ffffff" },
            { name: "Фронт ударной волны срыва мантии", rPct: 1.0, color: "#f97316" }
          ];
        } else if (state.r > 40.0) {
          layers = [
            { name: "Инертное железное ядро (Fe)", rPct: 0.14, color: "#94a3b8" },
            { name: "Слой горения кремния (Si → Fe)", rPct: 0.24, color: "#a855f7" },
            { name: "Слой горения кислорода (O → Si)", rPct: 0.36, color: "#ec4899" },
            { name: "Слой горения углерода (C → Ne, Mg)", rPct: 0.50, color: "#22c55e" },
            { name: "Слой горения гелия (He → C, O)", rPct: 0.66, color: "#f59e0b" },
            { name: "Слой горения водорода (H → He)", rPct: 0.82, color: "#38bdf8" },
            { name: "Раздутая конвективная оболочка", rPct: 1.0, color: "rgba(239, 68, 68, 0.35)" }
          ];
                } else {
          layers = [
            { name: "Конвективное ядро (CNO-цикл)", rPct: 0.32, color: "#e0f2fe" },
            { name: "Лучистая зона переноса энергии", rPct: 0.85, color: "#60a5fa" },
            { name: "Фотосфера мощного звездного ветра", rPct: 1.0, color: "rgba(147, 197, 253, 0.35)" }
          ];
        }
      } 
      // 5. Стандартная солнечная эволюция и промежуточные массы

      else if (S.isDeepTime || state.t >= 12.6) {
        layers = [{ name: "Кристаллический углеродно-кислородный алмаз", rPct: 1.0, color: "#90caf9" }];
      } else if (state.t < 0.0) {
        layers = [
          { name: "Коллапсирующее протоядро", rPct: 0.42, color: "#ff8f00" },
          { name: "Газопылевая протооболочка", rPct: 1.0, color: "rgba(255, 70, 20, 0.4)" }
        ];
      } else if (state.t <= 10.2) {
        layers = [
          { name: "Ядро: протон-протонный цикл (H → He)", rPct: 0.30, color: "#fff59d" },
          { name: "Зона лучистого переноса энергии", rPct: 0.70, color: "#ffa726" },
          { name: "Конвективная зона фотосферы", rPct: 1.0, color: "rgba(255, 60, 20, 0.4)" }
        ];
      } else if (state.t <= 12.22) {
        layers = [
          { name: "Вырожденное гелиевое ядро", rPct: 0.22, color: "#90a4ae" },
          { name: "Слоевой источник горения H → He", rPct: 0.32, color: "#ffeb3b" },
          { name: "Раздутая конвективная оболочка", rPct: 1.0, color: "rgba(255, 60, 20, 0.35)" }
        ];
      } else {
        layers = [
          { name: "Инертное углеродно-кислородное ядро", rPct: 0.18, color: "#546e7a" },
          { name: "Слой горения He → C, O", rPct: 0.28, color: "#00e676" },
          { name: "Слой горения H → He", rPct: 0.38, color: "#ffeb3b" },
          { name: "Пульсирующая внешняя оболочка", rPct: 1.0, color: "rgba(255, 60, 20, 0.35)" }
        ];
      }


      for (let i = layers.length - 1; i >= 0; i--) {
        const shellR = visualR * layers[i].rPct;
        ctx.fillStyle = layers[i].color;
        ctx.beginPath();
        ctx.arc(0, 0, shellR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1 / S.camZoom;
        ctx.stroke();
      }

      const labelX = visualR + 35 / S.camZoom;
      const lineGap = 22 / S.camZoom;
      const totalH = (layers.length - 1) * lineGap;
      const startY = -totalH / 2;

      ctx.font = `${Math.max(10, Math.round(11 / S.camZoom))}px sans-serif`;
      ctx.textBaseline = 'middle';

      for (let i = 0; i < layers.length; i++) {
        const y = startY + i * lineGap;
        const shellR = visualR * layers[i].rPct;
        const anchorAngle = (i - (layers.length - 1) / 2) * 0.35;
        const ax = Math.cos(anchorAngle) * shellR;
        const ay = Math.sin(anchorAngle) * shellR;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1 / S.camZoom;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(visualR + 15 / S.camZoom, y);
        ctx.lineTo(labelX - 6 / S.camZoom, y);
        ctx.stroke();

        ctx.fillStyle = layers[i].color;
        ctx.beginPath();
        ctx.arc(ax, ay, 2.5 / S.camZoom, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#f1f5f9';
        ctx.fillText(layers[i].name, labelX, y);
      }
      if (model) drawSeismology(ctx, visualR, state, model);
}

// Солнцеподобные колебания: стоячие звуковые волны (p-моды) в конвективной оболочке. Картинка — мода l = 3:
// узловые линии и «дыхание» поверхности; период на экране условный, настоящий — в подписи
function drawSeismology(ctx, visualR, state, model) {
  const q = seismology(state.mass || S.selectedStarMass, state.r, state.temp);
  const z = S.camZoom;
  ctx.save();
  ctx.font = `${Math.max(9, Math.round(10 / z))}px sans-serif`;
  ctx.textAlign = 'center'; ctx.fillStyle = '#94a3b8';
  const y0 = visualR + 22 / z;
  if (model.scale < 1) ctx.fillText('радиусы ядра и слоёв — в сжатой шкале (r^' + model.scale + '), иначе ядро гиганта не видно', 0, y0 + 30 / z);
  if (!q) { ctx.fillText('Солнцеподобных колебаний нет: нет конвективной оболочки, которая их возбуждает', 0, y0); ctx.restore(); return; }
  const per = q.periodMin < 90 ? `${q.periodMin.toFixed(1)} мин` : q.periodMin < 60 * 48 ? `${(q.periodMin / 60).toFixed(1)} ч` : `${(q.periodMin / 1440).toFixed(1)} сут`;
  const fmt = (v) => v >= 100 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toPrecision(2);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(`Колебания: ν_max = ${fmt(q.numax)} мкГц (период ${per}), Δν = ${fmt(q.dnu)} мкГц`, 0, y0);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('ν_max ∝ M R⁻² T^−½, Δν ∝ √(M/R³) — по ним астросейсмология взвешивает звёзды', 0, y0 + 15 / z);
  // мода l = 3: узловые лучи и радиальная стоячая волна во внешней конвективной зоне
  const ph = Math.sin(performance.now() * 0.004);
  const prev = model.layers[model.layers.length - 2];
  const rIn = visualR * (prev ? Math.pow(prev.r, model.scale) : 0.5);
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 6; k++) {
    const a0 = k * Math.PI / 3, sign = (k % 2 ? 1 : -1) * ph;
    for (let n = 1; n <= 3; n++) {
      const rr = rIn + (visualR - rIn) * (n - 0.5) / 3;
      ctx.strokeStyle = sign > 0 ? `rgba(56,189,248,${0.35 * Math.abs(sign)})` : `rgba(251,113,133,${0.35 * Math.abs(sign)})`;
      ctx.lineWidth = Math.max(1, (visualR - rIn) / 9);
      ctx.beginPath(); ctx.arc(0, 0, rr, a0 + 0.08, a0 + Math.PI / 3 - 0.08); ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawHydrostaticForces(ctx, starPx, state, now) {
  const radius = Math.max(18 / S.camZoom, starPx);
  const arrowCount = 8;
  let inwardScale = 1.0;
  let outwardScale = 1.0;
  let eqText = "Гидростатическое равновесие: F_грав = P_излуч";

  if (state.t < 0.0) {
    inwardScale = 1.6; outwardScale = 0.6; eqText = "Гравитационный коллапс: F_грав > P_газ";
  } else if (state.t > 10.2 && state.t < 12.35) {
    inwardScale = 0.8; outwardScale = 1.7; eqText = "Расширение оболочки: P_излуч > F_грав";
  } else if (state.t >= 12.35 && state.t < 12.6) {
    inwardScale = 0.5; outwardScale = 2.2; eqText = "Срыв мантии суперветром: P_излуч >> F_грав";
  } else if (state.r < 0.05) {
    inwardScale = 1.2; outwardScale = 1.2; eqText = "Квантовое равновесие: F_грав = P_вырожд";
  }

  hydroEqBadge.innerText = eqText;

  ctx.save();
  for (let i = 0; i < arrowCount; i++) {
    const a = (i * (Math.PI * 2 / arrowCount)) + (now * 0.0001);
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);

    const inStartR = radius + (28 / S.camZoom) * inwardScale;
    const inEndR = radius + 6 / S.camZoom;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2 / S.camZoom;
    ctx.beginPath();
    ctx.moveTo(cosA * inStartR, sinA * inStartR);
    ctx.lineTo(cosA * inEndR, sinA * inEndR);
    ctx.stroke();

    const outStartR = radius - (16 / S.camZoom);
    const outEndR = radius + (14 / S.camZoom) * outwardScale;
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2 / S.camZoom;
    ctx.beginPath();
    ctx.moveTo(cosA * outStartR, sinA * outStartR);
    ctx.lineTo(cosA * outEndR, sinA * outEndR);
    ctx.stroke();
  }
  ctx.restore();
}
