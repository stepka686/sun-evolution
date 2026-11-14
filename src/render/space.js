// Вид «Космос»
import { drawAGBShells, drawComets, drawRemnantLabel, drawWDDebrisDisk } from './cosmic.js';
import { planetDotColor, planetLook } from './planetLook.js';
import { activeCMEs, getAsteroseismicData, spawnCoronalMassEjection } from '../model/activity.js';
import { getCustomExo } from '../model/exoplanets.js';
import { getEngulfTime, getPlanetDistanceAU, isPlanetHitByCME } from '../physics/orbits.js';
import { EXO_TYPE_MASS_EARTH } from '../physics/tides.js';
import { getTrackMarks } from '../model/timeline.js';
import { getStarColor } from './colors.js';
import { cometStorm, oortObjects, protoDust, spaceStars } from './particles.js';
import { drawCutawayCore, drawDetailedStarSurface, drawHydrostaticForces } from './star.js';
import { S } from '../state.js';
import { rgba } from '../util/color.js';
import { lerp } from '../util/math.js';

export function drawCometStorm(ctx, state, baseScaleAU, pitchCos, now, camZoom) {
  // Активация кометного шторма при сбросе массы (поздние гиганты или предсверхновые)
  const marks = getTrackMarks();
  const isMassLossActive = !S.isDeepTime && S.selectedStarMass >= 0.45 && state.t >= marks.massLossStart && state.t <= marks.remnant;
  if (!isMassLossActive) return;

  ctx.save();
  ctx.scale(1.0, pitchCos);
  const sunRadAU = state.r / 215.0;

  for (let c of cometStorm) {
    // Медленное падение по спирали к звезде
    const curDist = Math.max(sunRadAU * 1.05, c.distAU - ((now * 0.00008 * c.speed) % (c.distAU - sunRadAU * 0.9)));
    const curAngle = c.angle + now * 0.00025 * (c.speed / Math.max(0.5, curDist));
    const px = Math.cos(curAngle) * curDist * baseScaleAU;
    const py = Math.sin(curAngle) * curDist * baseScaleAU;

    // Вектор хвоста всегда направлен строго ОТ звезды давлением излучения
    const tailX = px + Math.cos(curAngle) * (c.tailLen / camZoom);
    const tailY = py + Math.sin(curAngle) * (c.tailLen / camZoom);

    const tailGrad = ctx.createLinearGradient(px, py, tailX, tailY);
    tailGrad.addColorStop(0, `rgba(186, 230, 253, ${c.alpha.toFixed(2)})`);
    tailGrad.addColorStop(0.3, `rgba(56, 189, 248, ${(c.alpha * 0.5).toFixed(2)})`);
    tailGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.strokeStyle = tailGrad;
    ctx.lineWidth = Math.max(1, 1.8 / camZoom);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();

    // Ядро кометы
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, c.size / camZoom, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawCustomExoplanets(ctx, state, baseScaleAU, pitchCos, now, camZoom) {
  if (S.customExoplanets.length === 0) return;
  const sunRadAU = state.r / 215.0;
  const starMass = Math.max(0.1, state.mass);

  for (let i = S.customExoplanets.length - 1; i >= 0; i--) {
    const exo = S.customExoplanets[i];
    const curAU = exo.baseDistAU * (exo.birthMass / starMass);
    const radPx = curAU * baseScaleAU;

            // Проверка гибели экзопланеты в истории системы
    let isExoDead = state.t >= getEngulfTime(exo.baseDistAU, exo.birthMass, EXO_TYPE_MASS_EARTH[exo.type] || 1);
    if (sunRadAU >= curAU * 0.95 || (S.selectedStarMass >= 20.0 && state.r < 0.001)) {
      isExoDead = true;
    }

    if (isExoDead) {
      continue;
    }


    const orbSpeed = Math.sqrt(starMass / Math.pow(Math.max(0.01, curAU), 3)) * 0.00035;
    const curAngle = exo.seedAngle + now * orbSpeed;
    const px = Math.cos(curAngle) * radPx;
    const py = Math.sin(curAngle) * radPx * pitchCos;
    const tEquil = Math.round(278.5 * Math.pow(Math.max(0.0001, state.l), 0.25) / Math.sqrt(curAU) - 273.15);

    ctx.save();
    // Орбита
    ctx.scale(1.0, pitchCos);
    ctx.strokeStyle = exo.type === 'hot_jupiter' ? 'rgba(251, 146, 60, 0.35)' : 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1 / camZoom;
    ctx.setLineDash([3 / camZoom, 5 / camZoom]);
    strokeOrbitArc(ctx, radPx);
    ctx.setLineDash([]);
    ctx.restore();

    // Газовый шлейф Горячего юпитера
    if (exo.type === 'hot_jupiter' && (curAU < 0.35 || tEquil > 800)) {
      ctx.save();
      const tailLen = (35 + Math.min(60, tEquil * 0.03)) / camZoom;
      const tailX = px + Math.cos(curAngle) * tailLen;
      const tailY = py + Math.sin(curAngle) * tailLen * pitchCos;

      const plumeGrad = ctx.createLinearGradient(px, py, tailX, tailY);
      plumeGrad.addColorStop(0, 'rgba(125, 211, 252, 0.85)');
      plumeGrad.addColorStop(0.4, 'rgba(168, 85, 247, 0.45)');
      plumeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.strokeStyle = plumeGrad;
      ctx.lineWidth = Math.max(2, 4.5 / camZoom);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
      ctx.restore();
    }

    // Тело экзопланеты
    ctx.save();
    ctx.translate(px, py);
    let pColor = '#38bdf8';
    let pR = 3.5;
    if (exo.type === 'hot_jupiter') { pColor = '#fb923c'; pR = 5.2; }
    else if (exo.type === 'ocean_world') { pColor = '#06b6d4'; pR = 3.8; }
    else if (exo.type === 'super_earth') { pColor = '#4ade80'; pR = 4.2; }
    else if (exo.type === 'chthonian') { pColor = '#f43f5e'; pR = 3.0; }

    ctx.fillStyle = pColor;
    ctx.shadowColor = pColor;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, 0, pR / camZoom, 0, Math.PI * 2);
    ctx.fill();

            // Дуга магнитосферы при попадании коронального выброса CME по экзопланете
    for (let cme of activeCMEs) {
      if (Math.abs(cme.distAU - curAU) < Math.max(0.18, curAU * 0.08)) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = Math.max(1.5, 2.5 / camZoom);
        ctx.beginPath();
        ctx.arc(0, 0, (pR + 5) / camZoom, curAngle + Math.PI - 1.1, curAngle + Math.PI + 1.1);
        ctx.stroke();
        break;
      }
    }

    ctx.font = `${(10 / camZoom).toFixed(3)}px sans-serif`;
    ctx.fillStyle = '#f1f5f9';
    ctx.shadowBlur = 0;
    ctx.fillText(`${exo.name} (${tEquil > 0 ? '+' : ''}${tEquil}°C)`, 6 / camZoom, 3 / camZoom);
    ctx.restore();

    S.planetHitboxes.push({ id: exo.id, x: px, y: py, r: Math.max(14 / camZoom, pR * 2.5 / camZoom) });
  }
}

export function drawBinarySystem(ctx, state, baseScaleAU, pitchCos, now, camZoom, delta = 0.016) {
      if (!S.isBinarySystem) return;


      const m1 = Math.max(0.1, state.mass);
      const m2 = S.binaryCompanion.mass + S.binaryCompanion.accretedMass;
      const sepAU = S.binaryCompanion.rAU;
      const orbitSpeed = Math.sqrt((m1 + m2) / Math.pow(sepAU, 3)) * 0.0006;
      const compAngle = now * orbitSpeed;

      // Расчет координат белого карлика и главной звезды относительно барицентра
      const r1AU = sepAU * (m2 / (m1 + m2));
      const r2AU = sepAU * (m1 / (m1 + m2));

      const compX = Math.cos(compAngle) * r2AU * baseScaleAU;
      const compY = Math.sin(compAngle) * r2AU * baseScaleAU * pitchCos;

      ctx.save();
      ctx.scale(1.0, pitchCos);

      // Орбитальный след компаньона
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
      ctx.lineWidth = 1 / camZoom;
      ctx.setLineDash([3 / camZoom, 6 / camZoom]);
      strokeOrbitArc(ctx, r2AU * baseScaleAU);
      ctx.setLineDash([]);
      ctx.restore();

// Если белый карлик уже взорвался сверхновой Ia
      if (S.binaryCompanion.isSupernovaIa) {
        if (S.isPlaying) S.binaryCompanion.snIaProgress += 0.48 * delta * Math.min(5, S.speedMultiplier);        const blastR = baseScaleAU * (0.8 + S.binaryCompanion.snIaProgress * 12.0);
        const flashAlpha = Math.max(0, 1.0 - S.binaryCompanion.snIaProgress * 0.45);

        if (flashAlpha > 0.01) {
          ctx.save();
          ctx.translate(compX, compY);
          ctx.scale(1.0, pitchCos);

          const snGrad = ctx.createRadialGradient(0, 0, blastR * 0.05, 0, 0, blastR);
          snGrad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha.toFixed(2)})`);
          snGrad.addColorStop(0.3, `rgba(147, 197, 253, ${(flashAlpha * 0.85).toFixed(2)})`);
          snGrad.addColorStop(0.7, `rgba(244, 63, 94, ${(flashAlpha * 0.4).toFixed(2)})`);
          snGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = snGrad;
          ctx.beginPath();
          ctx.arc(0, 0, blastR, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        return;
      }

      // Расчет размера полости Роша для главной звезды (формула Эгглтона)
      const q = m1 / m2;
      const q13 = Math.pow(q, 1 / 3);
      const q23 = Math.pow(q, 2 / 3);
      const rocheLobeAU = sepAU * (0.49 * q23 / (0.6 * q23 + Math.log(1 + q13)));
      const starRadAU = state.r / 215.0;

      // Проверка заполнения полости Роша (Roche Lobe Overflow)
      const isOverflow = (starRadAU >= rocheLobeAU * 0.82);

      if (isOverflow && !S.binaryCompanion.isSupernovaIa) {
        // Перетекание струи плазмы через внутреннюю точку Лагранжа L1 к белому карлику
        const l1Fraction = 0.58;
        const l1X = Math.cos(compAngle) * (r2AU * l1Fraction);
        const l1Y = Math.sin(compAngle) * (r2AU * l1Fraction) * pitchCos;

        ctx.save();
        const streamGrad = ctx.createLinearGradient(l1X, l1Y, compX, compY);
        streamGrad.addColorStop(0, 'rgba(251, 146, 60, 0.7)');
        streamGrad.addColorStop(0.6, 'rgba(254, 240, 138, 0.85)');
        streamGrad.addColorStop(1, 'rgba(56, 189, 248, 0.9)');

        ctx.strokeStyle = streamGrad;
        ctx.lineWidth = Math.max(1.5, 3.0 / camZoom);
        ctx.beginPath();
        ctx.moveTo(l1X, l1Y);
        // Дугообразное искривление струи силой Кориолиса
        const midX = (l1X + compX) * 0.5 + Math.sin(compAngle) * (18 / camZoom);
        const midY = (l1Y + compY) * 0.5 - Math.cos(compAngle) * (18 / camZoom) * pitchCos;
        ctx.quadraticCurveTo(midX, midY, compX, compY);
        ctx.stroke();

        // Аккреционный диск вокруг белого карлика
        const diskR = Math.max(10 / camZoom, 14);
        ctx.translate(compX, compY);
        ctx.scale(1.0, pitchCos);

        const dGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, diskR);
        dGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        dGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.7)');
        dGrad.addColorStop(0.8, 'rgba(249, 115, 22, 0.4)');
        dGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = dGrad;
        ctx.beginPath();
        ctx.arc(0, 0, diskR, 0, Math.PI * 2);
        ctx.fill();

// Горячее ударное пятно (Hot Spot) столкновения струи с диском
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-diskR * 0.65, 0, Math.max(1.8, 2.5 / camZoom), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Накопление массы по реальному времени (только когда симуляция не на паузе)
        if (S.isPlaying) {
          S.binaryCompanion.accretedMass += 0.036 * delta * Math.min(5, S.speedMultiplier);
          if (m2 >= 1.44) {
            S.binaryCompanion.isSupernovaIa = true;
            S.binaryCompanion.snIaProgress = 0.01;
          }
        }
      } else {        // Спокойный белый карлик без аккреции
        ctx.save();
        ctx.translate(compX, compY);
        ctx.fillStyle = '#e0f2fe';
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2.2, 3.2 / camZoom), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
}

export function drawSupernovaAndPulsar(ctx, state, baseScaleAU, pitchCos, now, camZoom) {
  if (S.selectedStarMass < 8.0 || S.selectedStarMass >= 20.0) return;
  // Тайминг вспышки, туманности и пульсара — от момента сверхновой в треке
  const marks = getTrackMarks();
  if (marks.sn === undefined) return;
  const span = Math.max(1e-9, marks.remnant - marks.sn);
  const tSnStart = marks.sn;
  const tSnEnd = marks.sn + 0.55 * span;
  const tNebStart = marks.sn + 0.1 * span;
  const tPulsarStart = marks.sn + 0.2 * span;

  // 1. Плавная динамика вспышки Сверхновой типа II
  if (state.t >= tSnStart && state.t <= tSnEnd) {
    const snProg = (state.t - tSnStart) / Math.max(1e-6, tSnEnd - tSnStart);
    const blastR = baseScaleAU * (1.2 + snProg * 11.0);
    // Затухание вспышки по мере рассеивания
    const flashAlpha = Math.sin(Math.min(1.0, snProg) * Math.PI);

    ctx.save();
    ctx.scale(1.0, pitchCos);
    const snGrad = ctx.createRadialGradient(0, 0, blastR * 0.08, 0, 0, blastR);
    snGrad.addColorStop(0, `rgba(255, 255, 255, ${(flashAlpha * 0.95).toFixed(3)})`);
    snGrad.addColorStop(0.35, `rgba(56, 189, 248, ${(flashAlpha * 0.75).toFixed(3)})`);
    snGrad.addColorStop(0.75, `rgba(239, 68, 68, ${(flashAlpha * 0.45).toFixed(3)})`);
    snGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = snGrad;
    ctx.beginPath();
    ctx.arc(0, 0, blastR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. Постепенное проявление волокнистой туманности и пульсара
  if (state.t >= tNebStart) {
    const nebAlpha = Math.min(1.0, (state.t - tNebStart) / (0.25 * span));
    const pulsarAlpha = Math.max(0.0, Math.min(1.0, (state.t - tPulsarStart) / (0.22 * span)));

    ctx.save();
    ctx.scale(1.0, pitchCos);

    // Синхротронное свечение волокон туманности
    const remR = baseScaleAU * 4.6;
    const synchGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, remR);
    synchGrad.addColorStop(0, `rgba(6, 182, 212, ${(nebAlpha * 0.45).toFixed(3)})`);
    synchGrad.addColorStop(0.5, `rgba(59, 130, 246, ${(nebAlpha * 0.25).toFixed(3)})`);
    synchGrad.addColorStop(0.85, `rgba(239, 68, 68, ${(nebAlpha * 0.30).toFixed(3)})`);
    synchGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = synchGrad;
    ctx.beginPath();
    ctx.arc(0, 0, remR, 0, Math.PI * 2);
    ctx.fill();

    // 3. Релятивистские вращающиеся лучи пульсара (плавно усиливаются)
    if (pulsarAlpha > 0.01) {
      const spinAngle = now * 0.012;
      const beamLen = baseScaleAU * 5.2;
      const beamSpread = 0.22;

      for (let dir = -1; dir <= 1; dir += 2) {
        const a = spinAngle + (dir === 1 ? 0 : Math.PI);
        const p1X = Math.cos(a - beamSpread) * beamLen;
        const p1Y = Math.sin(a - beamSpread) * beamLen;
        const p2X = Math.cos(a + beamSpread) * beamLen;
        const p2Y = Math.sin(a + beamSpread) * beamLen;

        const beamGrad = ctx.createRadialGradient(0, 0, 4, Math.cos(a) * beamLen * 0.5, Math.sin(a) * beamLen * 0.5, beamLen);
        beamGrad.addColorStop(0, `rgba(255, 255, 255, ${(pulsarAlpha * 0.9).toFixed(3)})`);
        beamGrad.addColorStop(0.2, `rgba(125, 211, 252, ${(pulsarAlpha * 0.6).toFixed(3)})`);
        beamGrad.addColorStop(0.8, `rgba(37, 99, 235, ${(pulsarAlpha * 0.2).toFixed(3)})`);
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(p1X, p1Y);
        ctx.lineTo(p2X, p2Y);
        ctx.closePath();
        ctx.fill();
      }

      // Компактное ядро нейтронной звезды
      ctx.fillStyle = `rgba(255, 255, 255, ${pulsarAlpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(0, 0, 3.5 / camZoom, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export function drawSpacePlanetaryNebula(ctx, state, baseScaleAU, pitchCos, now, camZoom) {
  // Туманность появляется у всех звёзд легче 8 M☉ после сброса оболочки на AGB и рассеивается до остывания карлика
  if (S.isDeepTime || S.selectedStarMass >= 8.0) return;
  let t0, t1;
  if (S.selectedStarId === 'sun') { t0 = 12.33; t1 = 12.65; }
  else {
    const m = getTrackMarks();
    if (m.remnant === undefined || m.sn !== undefined) return;
    t0 = m.agbEnd !== undefined ? m.agbEnd : m.end;
    t1 = t0 + Math.max(1e-4, 0.35 * (m.remnant - t0));
  }
  if (state.t < t0 || state.t > t1) return;
  const progress = (state.t - t0) / (t1 - t0);
  const nebAlpha = Math.sin(progress * Math.PI);
  if (nebAlpha <= 0.01) return;
  const maxR = baseScaleAU * (2.5 + progress * 7.5);
  // Ионизационная структура: горячее ядро (T > 60 000 K) ионизирует He⁺ (синий He II 468.6 нм) и O²⁺ (зелёный [O III] 500.7 нм);
  // снаружи — водород (красный Hα 656.3 нм) и [N II]. Холодное ядро (< 30 000 K) даёт только красную оболочку.
  const T = state.temp;
  const exc = Math.max(0, Math.min(1, (T - 25000) / 50000));
  ctx.save();
  ctx.scale(1.0, pitchCos);
  ctx.globalCompositeOperation = 'lighter';
  const red = ctx.createRadialGradient(0, 0, maxR * 0.5, 0, 0, maxR);
  red.addColorStop(0, 'rgba(239, 68, 68, 0)');
  red.addColorStop(0.7, `rgba(244, 63, 94, ${(0.45 * nebAlpha).toFixed(3)})`);
  red.addColorStop(0.92, `rgba(190, 70, 160, ${(0.3 * nebAlpha).toFixed(3)})`);
  red.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = red; ctx.beginPath(); ctx.arc(0, 0, maxR, 0, Math.PI * 2); ctx.fill();
  if (exc > 0.02) {
    const o3R = maxR * (0.45 + 0.25 * exc);
    const teal = ctx.createRadialGradient(0, 0, o3R * 0.1, 0, 0, o3R);
    teal.addColorStop(0, `rgba(80, 140, 255, ${(0.45 * exc * nebAlpha).toFixed(3)})`);
    teal.addColorStop(0.45, `rgba(20, 200, 170, ${(0.5 * exc * nebAlpha).toFixed(3)})`);
    teal.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = teal; ctx.beginPath(); ctx.arc(0, 0, o3R, 0, Math.PI * 2); ctx.fill();
  }
  // Волокна и «кометные узлы» на границе ионизационного фронта
  ctx.lineWidth = 2.2 / camZoom;
  ctx.strokeStyle = `rgba(250, 120, 140, ${(0.45 * nebAlpha).toFixed(3)})`;
  ctx.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const fr = maxR * (0.8 + 0.08 * Math.sin(a * 7 + now * 0.001) + 0.05 * Math.cos(a * 4));
    if (i === 0) ctx.moveTo(Math.cos(a) * fr, Math.sin(a) * fr); else ctx.lineTo(Math.cos(a) * fr, Math.sin(a) * fr);
  }
  ctx.stroke();
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4, fr = maxR * (0.55 + 0.1 * (i % 3));
    ctx.fillStyle = `rgba(255, 160, 120, ${(0.35 * nebAlpha).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(Math.cos(a) * fr, Math.sin(a) * fr, 2.2 / camZoom, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawProtostellarCloud(ctx, state, baseScaleAU, pitchCos, now, camZoom) {
  const cloudFactor = Math.max(0, Math.min(1, (0.008 - state.t) / 0.058));
  if (cloudFactor <= 0.001) return;

  ctx.save();
  const cloudR = baseScaleAU * 5.8 * (0.8 + 0.4 * cloudFactor);
  for (let layer = 0; layer < 4; layer++) {
    const rot = layer * 1.57 + now * 0.00006 * (layer % 2 === 0 ? 1 : -1);
    const cx = Math.cos(rot) * (cloudR * 0.22);
    const cy = Math.sin(rot) * (cloudR * 0.22) * pitchCos;
    const currentLayerR = cloudR * (0.7 + layer * 0.18);
    const rGrad = ctx.createRadialGradient(cx, cy, cloudR * 0.05, cx, cy, currentLayerR);

    if (layer === 0) {
      rGrad.addColorStop(0, `rgba(234, 88, 12, ${0.48 * cloudFactor})`);
      rGrad.addColorStop(0.35, `rgba(180, 83, 9, ${0.35 * cloudFactor})`);
      rGrad.addColorStop(0.7, `rgba(69, 26, 3, ${0.22 * cloudFactor})`);
      rGrad.addColorStop(1, 'rgba(0,0,0,0)');
    } else if (layer === 1) {
      rGrad.addColorStop(0, `rgba(249, 115, 22, ${0.35 * cloudFactor})`);
      rGrad.addColorStop(0.4, `rgba(120, 53, 15, ${0.28 * cloudFactor})`);
      rGrad.addColorStop(0.8, `rgba(30, 10, 5, ${0.16 * cloudFactor})`);
      rGrad.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      rGrad.addColorStop(0, `rgba(147, 51, 234, ${0.14 * cloudFactor})`);
      rGrad.addColorStop(0.5, `rgba(30, 27, 75, ${0.16 * cloudFactor})`);
      rGrad.addColorStop(1, 'rgba(0,0,0,0)');
    }

    ctx.fillStyle = rGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, currentLayerR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.scale(1.0, pitchCos);
  const diskInnerR = Math.max(6, (state.r / 215.0) * baseScaleAU * 1.15);
  const diskOuterR = baseScaleAU * 3.4 * (0.6 + 0.4 * cloudFactor);

  const diskGrad = ctx.createRadialGradient(0, 0, diskInnerR, 0, 0, diskOuterR);
  diskGrad.addColorStop(0, `rgba(255, 215, 120, ${0.8 * cloudFactor})`);
  diskGrad.addColorStop(0.18, `rgba(245, 158, 11, ${0.7 * cloudFactor})`);
  diskGrad.addColorStop(0.48, `rgba(180, 83, 9, ${0.5 * cloudFactor})`);
  diskGrad.addColorStop(0.78, `rgba(80, 30, 10, ${0.32 * cloudFactor})`);
  diskGrad.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = diskGrad;
  ctx.beginPath();
  ctx.arc(0, 0, diskOuterR, 0, Math.PI * 2);
  ctx.arc(0, 0, diskInnerR, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();

  for (let p of protoDust) {
    const currentDistPx = diskInnerR + p.dist * (diskOuterR - diskInnerR);
    const currentAngle = p.angle + now * 0.00045 * p.speed;
    const px = Math.cos(currentAngle) * currentDistPx;
    const py = Math.sin(currentAngle) * currentDistPx;
    ctx.fillStyle = `rgba(254, 215, 170, ${(p.alpha * cloudFactor).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(px, py, p.size / camZoom, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

export function drawGwOscilloscope(ctx, w, h, state, now) {
      if (!S.isGwDetector) return;

      // Параметры детектора: правый верхний угол
      const boxW = Math.min(260, w * 0.42);
      const boxH = 95;
      const boxX = w - boxW - 10;
      const boxY = 48;

      ctx.save();
      ctx.fillStyle = 'rgba(4, 9, 20, 0.9)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Сетка осциллографа
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX, boxY + boxH / 2); ctx.lineTo(boxX + boxW, boxY + boxH / 2);
      ctx.moveTo(boxX + boxW / 2, boxY); ctx.lineTo(boxX + boxW / 2, boxY + boxH);
      ctx.stroke();

      // Расчет частоты и амплитуды деформации метрики h
      let gwFreq = 0;
      let strainH = 0;
      let sourceName = "Фоновый шум Вселенной";

      if (S.isBinarySystem && !S.binaryCompanion.isSupernovaIa) {
        sourceName = "Двойная система (Белый карлик)";
        const totalM = Math.max(0.1, state.mass) + S.binaryCompanion.mass + S.binaryCompanion.accretedMass;
        const orbPeriodSec = Math.sqrt(Math.pow(S.binaryCompanion.rAU, 3) / totalM) * 3.15e7;
        gwFreq = (2.0 / Math.max(1, orbPeriodSec)) * 1e5; // Масштабированная частота для визуализации
        strainH = Math.min(28, (2.0 + S.binaryCompanion.accretedMass * 25.0));
            } else if (S.selectedStarMass >= 8.0 && S.selectedStarMass < 20.0 && state.r < 0.001) {
        sourceName = "Быстровращающийся пульсар";

        gwFreq = 4.5;
        strainH = 14.0;
} else if (S.selectedStarMass >= 20.0 && state.r < 0.001) {
        sourceName = "Горизонт событий Чёрной дыры";
        gwFreq = 8.0;
        strainH = 22.0;
      }
      // Отрисовка бегущей гравитационной волны (зеленый люминофор)
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      const midY = boxY + boxH / 2 + 10;
      for (let x = 0; x < boxW - 10; x += 2) {
        const tOffset = (now * 0.008 * (gwFreq || 0.4)) - (x * 0.08);
        const y = midY + Math.sin(tOffset) * strainH * (gwFreq ? 1.0 : 0.15);
        if (x === 0) ctx.moveTo(boxX + 5 + x, y); else ctx.lineTo(boxX + 5 + x, y);
      }
      ctx.stroke();

      // Заголовки и телеметрия детектора
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText("LIGO / GW INTERFEROMETER", boxX + 8, boxY + 14);

      ctx.font = '8px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(sourceName, boxX + 8, boxY + 26);
      ctx.fillText(gwFreq ? `f_gw: ${(gwFreq * 12).toFixed(1)} Hz | h: ${(strainH * 1.2e-21).toExponential(2)}` : "h: < 1.0e-23 (Штиль)", boxX + 8, boxY + 37);

      ctx.restore();
}

// 5.2.2: пунктирная орбита рисуется только там, где она в кадре. Пунктир по окружности в тысячи пикселей
// (орбиты Нептуна, Эриды, облака Оорта при приближении) — тысячи штрихов за кадр, почти все за краем экрана
function strokeOrbitArc(ctx, rad) {
  const t = ctx.getTransform();
  const W = ctx.canvas.width, H = ctx.canvas.height, pad = 4 * Math.max(1, Math.hypot(t.a, t.b));
  const rScr = rad * Math.max(Math.hypot(t.a, t.b), Math.hypot(t.c, t.d));
  ctx.beginPath();
  // небольшую окружность рисуем целиком — проверка дороже самого штриха
  if (rScr < Math.max(W, H)) { ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke(); return; }
  const N = 256;
  let start = -1;
  const vis = (i) => {
    const a = i / N * Math.PI * 2, x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    const X = t.a * x + t.c * y + t.e, Y = t.b * x + t.d * y + t.f;
    return X > -pad && X < W + pad && Y > -pad && Y < H + pad;
  };
  for (let i = 0; i <= N; i++) {
    const v = i < N && vis(i);
    if (v && start < 0) start = i;
    if (!v && start >= 0) {
      ctx.moveTo(Math.cos((start - 1) / N * Math.PI * 2) * rad, Math.sin((start - 1) / N * Math.PI * 2) * rad);
      ctx.arc(0, 0, rad, (start - 1) / N * Math.PI * 2, i / N * Math.PI * 2);
      start = -1;
    }
  }
  ctx.stroke();
}

// Планета в «Космосе»: размер по радиусу, цвет — по климату (океаны, лёд, облака, лава), дневная и ночная половины
const PLANET_SIZE = { mercury: 0.38, venus: 0.95, earth: 1, mars: 0.53, europa: 11.2, titan: 9.45, uranus: 4.0, neptune: 3.9, pluto: 0.19, haumea: 0.13, makemake: 0.11, eris: 0.18 };
const FIXED_DOT = { europa: [215, 170, 120], titan: [225, 200, 140] };   // Юпитер и Сатурн (на их орбитах — Европа и Титан)
function drawPlanetDisc(ctx, id, px, py, angle, state, zoom, fallback) {
  const size = PLANET_SIZE[id] || 1;
  const r = (2.0 + 1.1 * Math.log2(1 + size)) / zoom;
  const c = FIXED_DOT[id] || planetDotColor(planetLook(id, state));
  ctx.fillStyle = c ? `rgb(${c[0]},${c[1]},${c[2]})` : fallback;
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  if (r * zoom >= 3) {
    // ночная половина — от звезды прочь
    ctx.save(); ctx.fillStyle = 'rgba(0, 3, 10, 0.72)';
    ctx.beginPath(); ctx.arc(px, py, r * 1.02, angle - Math.PI / 2, angle + Math.PI / 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

export function drawSpaceView(ctx, w, h, state, now, delta = 0.016) {
     
 ctx.fillStyle = '#010308';
      ctx.fillRect(0, 0, w, h);

      // 1. Полотно Млечного Пути и межзвёздной пыли с эффектом параллакса
      const mwParallaxX = (S.camX * 0.12) % w;
      const mwParallaxY = (S.camY * 0.12) % h;
      ctx.save();
      ctx.translate(w / 2 + mwParallaxX, h / 2 + mwParallaxY);
      ctx.rotate(-0.42); // Галактический наклон

      const mwGrad = ctx.createLinearGradient(-w * 1.2, 0, w * 1.2, 0);
      mwGrad.addColorStop(0, 'rgba(2, 6, 18, 0)');
      mwGrad.addColorStop(0.30, 'rgba(30, 41, 59, 0.12)');
      mwGrad.addColorStop(0.46, 'rgba(56, 189, 248, 0.08)');
      mwGrad.addColorStop(0.50, 'rgba(147, 51, 234, 0.14)');
      mwGrad.addColorStop(0.54, 'rgba(244, 114, 182, 0.07)');
      mwGrad.addColorStop(0.70, 'rgba(30, 41, 59, 0.10)');
      mwGrad.addColorStop(1, 'rgba(2, 6, 18, 0)');
      ctx.fillStyle = mwGrad;
      ctx.fillRect(-w * 1.5, -h * 1.5, w * 3, h * 3);

      // Тёмные пылевые волокна внутри рукава Галактики
      const dustGrad = ctx.createLinearGradient(0, -25, 0, 25);
      dustGrad.addColorStop(0, 'rgba(0, 2, 8, 0)');
      dustGrad.addColorStop(0.5, 'rgba(0, 2, 6, 0.65)');
      dustGrad.addColorStop(1, 'rgba(0, 2, 8, 0)');
      ctx.fillStyle = dustGrad;
      ctx.fillRect(-w * 1.4, -25, w * 2.8, 50);
      ctx.restore();

      const baseScaleAU = (Math.min(w, h) * 0.34) / 1.524;
      const pitchCos = Math.cos((S.camPitchDeg * Math.PI) / 180);

      let focusOffsetX = 0;
      let focusOffsetY = 0;

            S.planetHitboxes = [];

      if (S.cameraFocus !== 'sun' && S.cameraFocus !== 'oort') {
        const exoFocus = getCustomExo(S.cameraFocus);
        const pDistAU = getPlanetDistanceAU(S.cameraFocus, state);
        const radPx = pDistAU * baseScaleAU;
        let angle = 0;

        if (exoFocus) {
          const starMass = Math.max(0.1, state.mass);
          const orbSpeed = Math.sqrt(starMass / Math.pow(Math.max(0.01, pDistAU), 3)) * 0.00035;
          angle = exoFocus.seedAngle + now * orbSpeed;
        } else {
          let pSpeed = 1.0;
          if (S.cameraFocus === 'mercury') pSpeed = 4.1;
          else if (S.cameraFocus === 'venus') pSpeed = 1.6;
          else if (S.cameraFocus === 'mars') pSpeed = 0.53;
          else if (S.cameraFocus === 'europa') pSpeed = 0.08;
          else if (S.cameraFocus === 'titan') pSpeed = 0.034;
          else if (S.cameraFocus === 'uranus') pSpeed = 0.012;
          else if (S.cameraFocus === 'neptune') pSpeed = 0.006;
          else if (S.cameraFocus === 'pluto') pSpeed = 0.004;
          else if (S.cameraFocus === 'haumea') pSpeed = 0.0035;
          else if (S.cameraFocus === 'makemake') pSpeed = 0.0032;
          else if (S.cameraFocus === 'eris') pSpeed = 0.0018;
          angle = now * 0.0003 * pSpeed;
        }

        focusOffsetX = -Math.cos(angle) * radPx;
        focusOffsetY = -Math.sin(angle) * radPx * pitchCos;
      }


      ctx.save();
      ctx.translate(w / 2 + S.camX + focusOffsetX * S.camZoom, h / 2 + S.camY + focusOffsetY * S.camZoom);
      ctx.scale(S.camZoom, S.camZoom);

      const maxDim = Math.max(w, h);
      const isWhiteDwarf = state.r < 0.05 && state.temp > 1000;
      const einsteinRadiusPx = isWhiteDwarf ? 28 / S.camZoom : 0;

      // 2. Дрейф звёзд Галактики с гравитационным линзированием карлика
      const driftScale = state.t * 0.08;
      for (let s of spaceStars) {
        let rawX = (s.x + s.vx * driftScale + 100) % 2 - 1;
        let rawY = (s.y + s.vy * driftScale + 100) % 2 - 1;
        let sx = rawX * maxDim * 5.0;
        let sy = rawY * maxDim * 5.0;

        if (isWhiteDwarf) {
          const dist = Math.hypot(sx, sy);
          if (dist > 2 && dist < einsteinRadiusPx * 3.5) {
            const deflection = (einsteinRadiusPx * einsteinRadiusPx) / dist;
            sx += (sx / dist) * deflection;
            sy += (sy / dist) * deflection;
          }
        }

        ctx.fillStyle = rgba(255, 255, 255, s.alpha * (0.8 + 0.2 * Math.sin(now * 0.002 + s.x * 10)));
        ctx.beginPath();
        ctx.arc(sx, sy, s.size / S.camZoom, 0, Math.PI * 2);
        ctx.fill();
      }

      if (isWhiteDwarf && S.camZoom > 0.4) {
        ctx.strokeStyle = 'rgba(147, 197, 253, 0.25)';
        ctx.lineWidth = 1.2 / S.camZoom;
        ctx.setLineDash([4 / S.camZoom, 6 / S.camZoom]);
        ctx.beginPath();
        ctx.arc(0, 0, einsteinRadiusPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      drawSpacePlanetaryNebula(ctx, state, baseScaleAU, pitchCos, now, S.camZoom);
      drawSupernovaAndPulsar(ctx, state, baseScaleAU, pitchCos, now, S.camZoom);
      drawCometStorm(ctx, state, baseScaleAU, pitchCos, now, S.camZoom);
      drawAGBShells(ctx, state, baseScaleAU, pitchCos, now, S.camZoom);
      drawWDDebrisDisk(ctx, state, baseScaleAU, pitchCos, now, S.camZoom);
      drawComets(ctx, state, baseScaleAU, pitchCos, now, S.camZoom);
    // Моделирование и отрисовка корональных выбросов массы (CME) сквозь планетную систему
      const seismicData = getAsteroseismicData(state);
      if (seismicData.isMax && now - S.lastCmeTime > 3200 && state.r > 0.05 && S.selectedStarMass < 20.0) {
        S.lastCmeTime = now;
        spawnCoronalMassEjection(state, baseScaleAU);
      }

      if (activeCMEs.length > 0) {
        ctx.save();
        ctx.scale(1.0, pitchCos);
        ctx.globalCompositeOperation = 'lighter';

        for (let i = activeCMEs.length - 1; i >= 0; i--) {
          const cme = activeCMEs[i];
          const ageSec = (now - cme.spawnTime) / 1000;
          if (S.isPlaying) cme.distAU += cme.speed * delta; // Движение сквозь систему по реальному delta time
          const curPx = cme.distAU * baseScaleAU;
          const arcSpread = cme.spread * (1.0 + ageSec * 0.25);
          const fade = Math.max(0, 1.0 - (cme.distAU / cme.maxDistAU));

          if (fade <= 0.01) {
            activeCMEs.splice(i, 1);
            continue;
          }

          const cmeGrad = ctx.createRadialGradient(0, 0, Math.max(1, curPx * 0.8), 0, 0, curPx + 15 / S.camZoom);
          cmeGrad.addColorStop(0, `rgba(${cme.color[0]}, ${cme.color[1]}, ${cme.color[2]}, 0)`);
          cmeGrad.addColorStop(0.7, `rgba(${cme.color[0]}, ${cme.color[1]}, ${cme.color[2]}, ${(cme.alpha * fade * 0.45).toFixed(3)})`);
          cmeGrad.addColorStop(1.0, `rgba(255, 255, 255, ${(cme.alpha * fade * 0.8).toFixed(3)})`);

          ctx.strokeStyle = cmeGrad;
          ctx.lineWidth = Math.max(2.5, (12 * fade) / S.camZoom);
          ctx.beginPath();
          ctx.arc(0, 0, curPx, cme.angle - arcSpread / 2, cme.angle + arcSpread / 2);
          ctx.stroke();
        }
        ctx.restore();
      }
drawBinarySystem(ctx, state, baseScaleAU, pitchCos, now, S.camZoom, delta);      drawCustomExoplanets(ctx, state, baseScaleAU, pitchCos, now, S.camZoom);
      drawGwOscilloscope(ctx, w, h, state, now);

      // Чёрная дыра
      const isBlackHole = (S.selectedStarMass >= 20.0 && state.r < 0.001);
      if (isBlackHole) {
        const bhR = Math.max(14 / S.camZoom, 18);

        // Релятивистские полярные джеты
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const jetLen = baseScaleAU * 4.8;
        for (let sign of [-1, 1]) {
          const jetGrad = ctx.createLinearGradient(0, 0, 0, sign * jetLen);
          jetGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
          jetGrad.addColorStop(0.18, 'rgba(56, 189, 248, 0.75)');
          jetGrad.addColorStop(0.65, 'rgba(147, 51, 234, 0.35)');
          jetGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = jetGrad;
          ctx.beginPath();
          ctx.moveTo(-bhR * 0.35, 0);
          ctx.lineTo(bhR * 0.35, 0);
          ctx.lineTo(bhR * 1.8, sign * jetLen);
          ctx.lineTo(-bhR * 1.8, sign * jetLen);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Аккреционный диск
        ctx.save();
        ctx.scale(1.0, pitchCos);
        ctx.globalCompositeOperation = 'lighter';
        const diskGrad = ctx.createRadialGradient(0, 0, bhR * 1.15, 0, 0, bhR * 4.2);
        diskGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        diskGrad.addColorStop(0.22, 'rgba(56, 189, 248, 0.88)');
        diskGrad.addColorStop(0.60, 'rgba(249, 115, 22, 0.55)');
        diskGrad.addColorStop(0.85, 'rgba(220, 38, 38, 0.25)');
        diskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = diskGrad;
        ctx.beginPath();
        ctx.arc(0, 0, bhR * 4.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.2, 2.8 / S.camZoom);
        ctx.beginPath();
        ctx.arc(0, 0, bhR * 1.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Горизонт событий
        ctx.save();
        ctx.scale(1.0, pitchCos);
        ctx.fillStyle = '#000000';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, bhR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Призрачный контур 1 R☉
      if (state.t >= 0.0 && (state.r > 1.8 || state.r < 0.5) && !isBlackHole) {
        const origSunPx = (1.0 / 215.0) * baseScaleAU;
        ctx.save();
        ctx.scale(1.0, pitchCos);
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.lineWidth = 1.2 / S.camZoom;
        ctx.setLineDash([3 / S.camZoom, 4 / S.camZoom]);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(2.5, origSunPx), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Гелиосфера
      if (S.isHelioVisible && !S.isDeepTime && state.t >= 0.0 && !isBlackHole) {
        let helioRadiusAU = 120.0;
        if (state.r > 20) helioRadiusAU = 650.0;
        else if (state.r < 0.05) helioRadiusAU = 12.0;

        const helioPx = helioRadiusAU * baseScaleAU * 0.12;
        ctx.save();
        ctx.scale(1.0, pitchCos);
        const helioGrad = ctx.createRadialGradient(0, 0, helioPx * 0.4, 0, 0, helioPx);
        helioGrad.addColorStop(0, 'rgba(56, 189, 248, 0.01)');
        helioGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.08)');
        helioGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
        ctx.fillStyle = helioGrad;
        ctx.beginPath();
        ctx.arc(0, 0, helioPx, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = 1 / S.camZoom;
        ctx.stroke();
        ctx.restore();
      }

      // Облако Оорта
      if (S.camZoom < 0.15 || S.cameraFocus === 'oort') {
        const oortScale = baseScaleAU * 0.003;
        const boundThresholdAU = 10000 * Math.pow(state.mass, 0.6);

        ctx.save();
        ctx.scale(1.0, pitchCos);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
        ctx.lineWidth = 1 / S.camZoom;
        ctx.setLineDash([4 / S.camZoom, 8 / S.camZoom]);
        strokeOrbitArc(ctx, 50 * baseScaleAU);
        ctx.setLineDash([]);

        ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';
        ctx.beginPath();
        ctx.arc(0, 0, boundThresholdAU * oortScale, 0, Math.PI * 2);
        ctx.stroke();

        for (let obj of oortObjects) {
          const isStripped = obj.distAU > boundThresholdAU && state.mass < 0.85;
          const rPx = obj.distAU * oortScale;
          const a = obj.angle + (isStripped ? now * 0.0001 : 0);
          const ox = Math.cos(a) * rPx;
          const oy = Math.sin(a) * rPx * (1.0 + obj.inc * 0.3);

          ctx.fillStyle = isStripped ? 'rgba(239, 68, 68, 0.6)' : 'rgba(186, 230, 253, 0.45)';
          ctx.beginPath();
          ctx.arc(ox, oy, obj.size / S.camZoom, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

            const sunRadAU = state.r / 215.0;
      const planets = [
        { id: 'mercury', name: 'Меркурий', rAU: getPlanetDistanceAU('mercury', state), color: 'rgba(180, 160, 140, 0.5)', speed: 4.1 },
        { id: 'venus', name: 'Венера', rAU: getPlanetDistanceAU('venus', state), color: 'rgba(230, 200, 140, 0.5)', speed: 1.6 },
        { id: 'earth', name: 'Земля', rAU: getPlanetDistanceAU('earth', state), color: 'rgba(100, 180, 255, 0.6)', speed: 1.0 },
        { id: 'mars', name: 'Марс', rAU: getPlanetDistanceAU('mars', state), color: 'rgba(255, 120, 90, 0.5)', speed: 0.53 },
        { id: 'europa', name: 'Юпитер', rAU: getPlanetDistanceAU('europa', state), color: 'rgba(255, 180, 120, 0.4)', speed: 0.08 },
        { id: 'titan', name: 'Сатурн (Титан)', rAU: getPlanetDistanceAU('titan', state), color: 'rgba(240, 200, 100, 0.35)', speed: 0.034 },
        { id: 'uranus', name: 'Уран', rAU: getPlanetDistanceAU('uranus', state), color: 'rgba(125, 211, 252, 0.4)', speed: 0.012 },
        { id: 'neptune', name: 'Нептун', rAU: getPlanetDistanceAU('neptune', state), color: 'rgba(59, 130, 246, 0.4)', speed: 0.006 },
        { id: 'pluto', name: 'Плутон', rAU: getPlanetDistanceAU('pluto', state), color: 'rgba(192, 132, 252, 0.4)', speed: 0.004 },
        { id: 'haumea', name: 'Хаумеа', rAU: getPlanetDistanceAU('haumea', state), color: 'rgba(224, 231, 255, 0.35)', speed: 0.0035 },
        { id: 'makemake', name: 'Макемаке', rAU: getPlanetDistanceAU('makemake', state), color: 'rgba(251, 146, 60, 0.35)', speed: 0.0032 },
        { id: 'eris', name: 'Эрида (Рассеянный диск)', rAU: getPlanetDistanceAU('eris', state), color: 'rgba(241, 245, 249, 0.3)', speed: 0.0018 }
      ];


      // Зона жизни
      if (S.isHzVisible && state.t >= 0.0 && !isBlackHole) {
        const rInPx = Math.max(1, state.hzIn * baseScaleAU);
        const rOutPx = Math.max(rInPx + 1, state.hzOut * baseScaleAU);

        if (rInPx < maxDim * 8) {
          ctx.save();
          ctx.scale(1.0, pitchCos);
          const hzGrad = ctx.createRadialGradient(0, 0, rInPx, 0, 0, rOutPx);
          hzGrad.addColorStop(0.0, 'rgba(249, 115, 22, 0.14)');
          hzGrad.addColorStop(0.28, 'rgba(34, 197, 94, 0.10)');
          hzGrad.addColorStop(0.72, 'rgba(34, 197, 94, 0.10)');
          hzGrad.addColorStop(1.0, 'rgba(56, 189, 248, 0.14)');

          ctx.fillStyle = hzGrad;
          ctx.beginPath();
          ctx.arc(0, 0, rOutPx, 0, Math.PI * 2, false);
          ctx.arc(0, 0, rInPx, 0, Math.PI * 2, true);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = 'rgba(249, 115, 22, 0.45)';
          ctx.lineWidth = 1 / S.camZoom;
          ctx.beginPath();
          ctx.arc(0, 0, rInPx, 0, Math.PI * 2);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
          ctx.lineWidth = 1 / S.camZoom;
          ctx.beginPath();
          ctx.arc(0, 0, rOutPx, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 3. Планеты и конусы теней в пространстве
      if (state.t >= 0.0) {
        for (let p of planets) {
          if (p.rAU <= 0.001) continue;
          const radPx = p.rAU * baseScaleAU;
          const isDisrupting = (p.rAU <= sunRadAU * 1.35);

          // Орбитальный след
          ctx.save();
          ctx.scale(1.0, pitchCos);
          ctx.strokeStyle = isDisrupting ? 'rgba(239, 68, 68, 0.45)' : p.color;
          ctx.lineWidth = 1 / S.camZoom;
          ctx.setLineDash([3 / S.camZoom, 5 / S.camZoom]);
          strokeOrbitArc(ctx, radPx);
          ctx.setLineDash([]);
          ctx.restore();

          const angle = now * 0.0003 * p.speed;
          const px = Math.cos(angle) * radPx;
          const py = Math.sin(angle) * radPx * pitchCos;

          // Конус тени планеты (Umbra), направленный строго от звезды в космос
          if (!isDisrupting && S.camZoom > 0.12) {
            ctx.save();
            const shadowAngle = Math.atan2(py, px);
            const shadowLen = Math.min(220 / S.camZoom, Math.max(30 / S.camZoom, radPx * 0.45));
            const shadowWidth = Math.max(2.8 / S.camZoom, 5.2 / S.camZoom);

            ctx.translate(px, py);
            ctx.rotate(shadowAngle);

            const sGrad = ctx.createLinearGradient(0, 0, shadowLen, 0);
            sGrad.addColorStop(0, 'rgba(0, 2, 8, 0.85)');
            sGrad.addColorStop(0.4, 'rgba(0, 2, 8, 0.45)');
            sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = sGrad;
            ctx.beginPath();
            ctx.moveTo(0, -shadowWidth * 0.5);
            ctx.lineTo(shadowLen, -shadowWidth * 1.6);
            ctx.lineTo(shadowLen, shadowWidth * 1.6);
            ctx.lineTo(0, shadowWidth * 0.5);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          if (isDisrupting) {
            ctx.save();
            ctx.scale(1.0, pitchCos);
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 87, 34, 0.7)';
            ctx.lineWidth = 2.5 / S.camZoom;
            ctx.arc(0, 0, radPx, angle - 0.75, angle);
            ctx.stroke();

            for (let d = 1; d <= 5; d++) {
              const dAngle = angle - d * 0.14;
              const dRad = lerp(radPx, sunRadAU * baseScaleAU, d / 6.0);
              const dx = Math.cos(dAngle) * dRad;
              const dy = Math.sin(dAngle) * dRad;
              ctx.fillStyle = d % 2 === 0 ? '#ffcc00' : '#ff3d00';
              ctx.beginPath();
              ctx.arc(dx, dy, (1.8 + Math.random() * 1.2) / S.camZoom, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();

            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle + Math.PI / 2);
            ctx.fillStyle = '#ff7043';
            ctx.beginPath();
            ctx.ellipse(0, 0, 4.5 / S.camZoom, 2.2 / S.camZoom, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else {
            drawPlanetDisc(ctx, p.id, px, py, angle, state, S.camZoom, p.color);
          }

                    // Вспышка магнитосферы (Bow Shock) при прохождении фронта CME через орбиту планеты
          if (isPlanetHitByCME(p.id, state)) {
            ctx.save();
            ctx.strokeStyle = '#38bdf8';
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 8;
            ctx.lineWidth = Math.max(1.5, 2.5 / S.camZoom);
            ctx.beginPath();
            ctx.arc(px, py, 7.5 / S.camZoom, angle + Math.PI - 1.15, angle + Math.PI + 1.15);
            ctx.stroke();
            ctx.restore();
          }

          // размер подписи постоянен на экране (раньше при приближении она раздувалась в 9·zoom раз)
          ctx.font = `${(11 / S.camZoom).toFixed(3)}px sans-serif`;
          ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
          ctx.fillText(p.name, px + 6 / S.camZoom, py + 3 / S.camZoom);

          S.planetHitboxes.push({ id: p.id, x: px, y: py, r: 14 / S.camZoom });
        }
      }
      S.planetHitboxes.push({ id: 'sun', x: 0, y: 0, r: Math.max(16 / S.camZoom, (sunRadAU * baseScaleAU)) });


      const rawStarPx = sunRadAU * baseScaleAU;
      const starPx = Math.max(3.2, rawStarPx);
      const colors = getStarColor(state.temp);

      if (state.t < 0.02 && !isBlackHole) drawProtostellarCloud(ctx, state, baseScaleAU, pitchCos, now, S.camZoom);

      ctx.save();
      if (S.isBinarySystem && !S.binaryCompanion.isSupernovaIa) {
        const m1 = Math.max(0.1, state.mass);
        const m2 = S.binaryCompanion.mass + S.binaryCompanion.accretedMass;
        const sepAU = S.binaryCompanion.rAU;
        const orbitSpeed = Math.sqrt((m1 + m2) / Math.pow(sepAU, 3)) * 0.0006;
        const compAngle = now * orbitSpeed;
        const r1Px = Math.min(starPx * 0.45, sepAU * (m2 / (m1 + m2)) * baseScaleAU * 0.18);
        ctx.translate(-Math.cos(compAngle) * r1Px, -Math.sin(compAngle) * r1Px * pitchCos);
      }
      if (!S.isCutaway) {
        if (!isBlackHole) {
          drawDetailedStarSurface(ctx, starPx, state, colors, now, S.camZoom);
        }
      } else {
        drawCutawayCore(ctx, starPx, state);
      }
      ctx.restore();

      if (S.isHydroEqVisible) drawHydrostaticForces(ctx, starPx, state, now);

      ctx.restore(); // Снятие трансформации масштаба и сдвига камеры

      // 4. Анаморфотный лазурный луч и блики оптики телескопа (Lens Flares)
      if (!isBlackHole && state.l > 0.01 && S.camZoom > 0.12) {
        const starScreenX = w / 2 + S.camX + focusOffsetX * S.camZoom;
        const starScreenY = h / 2 + S.camY + focusOffsetY * S.camZoom;

        // Если звезда находится в пределах поля зрения экрана
        if (starScreenX > -150 && starScreenX < w + 150 && starScreenY > -150 && starScreenY < h + 150) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const lumFactor = Math.min(2.5, Math.max(0.4, Math.log10(Math.max(0.1, state.l) + 1.0) * 0.7));

          // Горизонтальный анаморфотный лазурный луч (Anamorphic Streak)
          const streakW = Math.min(w * 0.9, 320 * lumFactor);
          const streakGrad = ctx.createLinearGradient(starScreenX - streakW, 0, starScreenX + streakW, 0);
          streakGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
          streakGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.12)');
          streakGrad.addColorStop(0.5, 'rgba(224, 242, 254, 0.55)');
          streakGrad.addColorStop(0.65, 'rgba(56, 189, 248, 0.12)');
          streakGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

          ctx.strokeStyle = streakGrad;
          ctx.lineWidth = Math.min(3.2, 1.4 * lumFactor);
          ctx.beginPath();
          ctx.moveTo(starScreenX - streakW, starScreenY);
          ctx.lineTo(starScreenX + streakW, starScreenY);
          ctx.stroke();

          // Оптические блики диафрагмы линз вдоль вектора к центру экрана
          const deltaX = (w * 0.5) - starScreenX;
          const deltaY = (h * 0.5) - starScreenY;
          const ghosts = [
            { pos: 0.35, r: 14 * lumFactor, color: 'rgba(56, 189, 248, 0.14)' },
            { pos: 0.65, r: 7 * lumFactor, color: 'rgba(168, 85, 247, 0.18)' },
            { pos: 0.92, r: 20 * lumFactor, color: 'rgba(59, 130, 246, 0.10)' },
            { pos: 1.35, r: 10 * lumFactor, color: 'rgba(251, 146, 60, 0.12)' },
            { pos: -0.25, r: 16 * lumFactor, color: 'rgba(56, 189, 248, 0.15)' }
          ];

          for (let g of ghosts) {
            const gx = starScreenX + deltaX * g.pos;
            const gy = starScreenY + deltaY * g.pos;
            const gGrad = ctx.createRadialGradient(gx, gy, 1, gx, gy, g.r);
            gGrad.addColorStop(0, g.color);
            gGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = gGrad;
            ctx.beginPath();
            ctx.arc(gx, gy, g.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }
  drawRemnantLabel(ctx, state, w, h);
}
