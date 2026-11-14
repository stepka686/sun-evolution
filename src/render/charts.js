// Графики: спектр, кривые, диаграмма Г—Р
import { HR_BENCHMARKS } from '../data/catalog.js';
import { peakWavelengthText } from '../dom.js';
import { getActiveStages } from '../model/timeline.js';
import { getPlanetDistanceAU } from '../physics/orbits.js';
import { getStarColor } from './colors.js';
import { MIST_TRACKS, interpolateMistTrack } from '../model/mistTracks.js';
import { S } from '../state.js';
import { rgba } from '../util/color.js';

export function drawPlanckDiagram(ctx, w, h, currentState) {
      ctx.fillStyle = '#060912';
      ctx.fillRect(0, 0, w, h);

      if (S.spectrumMode === 'transit') {
        // Фотометрическая кривая блеска транзита (Limb-darkened Transit Light Curve)
        const curPlanetDist = getPlanetDistanceAU(S.currentPlanet, currentState);
        let planetRadiusRearth = 1.0;
        if (S.currentPlanet === 'mercury') planetRadiusRearth = 0.38;
        else if (S.currentPlanet === 'venus') planetRadiusRearth = 0.95;
        else if (S.currentPlanet === 'mars') planetRadiusRearth = 0.53;
        else if (S.currentPlanet === 'europa') planetRadiusRearth = 0.25;
        else if (S.currentPlanet === 'titan') planetRadiusRearth = 0.40;
        else if (S.currentPlanet === 'pluto') planetRadiusRearth = 0.18;

        const k = (planetRadiusRearth * 0.00915) / Math.max(0.01, currentState.r);
        const transitDepth = Math.min(0.95, k * k);
        const depthPpm = Math.round(transitDepth * 1e6);

        if (peakWavelengthText) {
          peakWavelengthText.innerText = depthPpm > 10000 ? `ΔF: ${(transitDepth * 100).toFixed(2)}%` : `ΔF: ${depthPpm} ppm`;
        }

        // Оси и сетка нормализованной светимости
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(15, 8); ctx.lineTo(w - 15, 8); // 1.000 F0
        ctx.moveTo(15, h - 10); ctx.lineTo(w - 15, h - 10);
        ctx.stroke();

        // U-образная кривая с потемнением к краю фотосферы
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        const startX = w * 0.22;
        const endX = w * 0.78;
        const dipY = Math.min(h - 14, 10 + Math.max(12, (h - 24) * Math.min(1.0, transitDepth * 25.0)));

const isTabbyActive = (S.selectedStarId === 'tabby');
        for (let x = 15; x <= w - 15; x += 3) {
          let y = 10;
          if (isTabbyActive) {
            // Аномальные несимметричные провалы кривой блеска Звезды Табби до 22%
            if (x >= startX - 25 && x <= endX + 25) {
              const nx = (x - startX) * 0.12;
              const dipNoise = Math.sin(nx * 1.5) * 0.4 + Math.sin(nx * 3.7) * 0.35 + Math.sin(nx * 7.1) * 0.25;
              const dipFrac = Math.max(0, dipNoise);
              y = 10 + (h - 26) * 0.72 * dipFrac;
            }
          } else if (x >= startX && x <= endX) {
            const phase = ((x - startX) / (endX - startX)) * 2 - 1;
            const ingress = Math.max(0, 1 - Math.pow(Math.abs(phase), 6));
            const limbEffect = 1.0 + 0.12 * (1 - phase * phase);
            y = 10 + (dipY - 10) * ingress * limbEffect;
          }
          if (x === 15) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // Миниатюра транзита: силуэт диска звезды и проходящей планеты
        const simX = (startX + ((performance.now() * 0.035) % (endX - startX + 40))) - 20;
        ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, h * 0.35, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#020617';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(Math.max(startX - 10, Math.min(endX + 10, simX)), h / 2, Math.max(2.0, h * 0.08), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#64748b';
        ctx.fillText("T1", startX - 3, h - 2);
        ctx.fillText("T4", endX - 3, h - 2);
        if (S.spectralProbeInfo && peakWavelengthText) peakWavelengthText.innerText = S.spectralProbeInfo;
        return;
      }

      if (S.spectrumMode === 'star') {

        const peakNm = 2898000 / Math.max(10, currentState.temp);
        if (peakWavelengthText) {
          peakWavelengthText.innerText = peakNm > 10000 ? `λ: ${(peakNm / 1000).toFixed(1)} мкм` : `λ: ${Math.round(peakNm)} нм`;
        }

        const minNm = 50;
        const maxNm = 2400;
        function nmToX(nm) { return ((nm - minNm) / (maxNm - minNm)) * (w - 30) + 15; }

        const uvEndX = nmToX(380);
        const visEndX = nmToX(750);

        ctx.fillStyle = 'rgba(147, 51, 234, 0.08)';
        ctx.fillRect(15, 0, Math.max(0, uvEndX - 15), h);

        const visGrad = ctx.createLinearGradient(uvEndX, 0, visEndX, 0);
        visGrad.addColorStop(0, 'rgba(59, 130, 246, 0.15)');
        visGrad.addColorStop(0.5, 'rgba(34, 197, 94, 0.15)');
        visGrad.addColorStop(1, 'rgba(239, 68, 68, 0.15)');
        ctx.fillStyle = visGrad;
        ctx.fillRect(uvEndX, 0, Math.max(0, visEndX - uvEndX), h);

        ctx.fillStyle = 'rgba(239, 68, 68, 0.05)';
        ctx.fillRect(visEndX, 0, Math.max(0, w - 15 - visEndX), h);

        ctx.beginPath();
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1.8;

        let first = true;
        for (let nm = minNm; nm <= maxNm; nm += 20) {
          const x = nmToX(nm);
          const u = nm / Math.max(1, peakNm);
          // B_λ(T) ∝ u⁻⁵ / (e^(4.965/u) − 1), u = λ/λ_max. В пике (u = 1) это 0.007027 → нормируем к 1.
          const normIntensity = (Math.pow(1 / Math.max(0.01, u), 5) / (Math.exp(Math.min(700, 4.965 / Math.max(0.01, u))) - 1)) / 0.0070270;
          const y = h - 14 - Math.min(h - 24, normIntensity * (h - 28) * 0.92);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else {
        if (peakWavelengthText) peakWavelengthText.innerText = "JWST: 0.5 - 5.0 мкм";
        ctx.font = '8px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText("Транзитная спектроскопия (ppm)", 15, 12);

        const molecules = [
          { name: 'O₃', um: 0.6, depth: (S.currentPlanet === 'earth' && currentState.t < 5.2) ? 65 : 0, color: '#6ee7b7' },
          { name: 'H₂O', um: 1.4, depth: (S.currentPlanet === 'earth' && currentState.t < 6.5) ? 140 : (S.currentPlanet === 'mars' && currentState.t >= 7.5 && currentState.t <= 9.2 ? 110 : 0), color: '#38bdf8' },
          { name: 'CH₄', um: 2.3, depth: (S.currentPlanet === 'titan' || (S.currentPlanet === 'earth' && currentState.t < 4.8)) ? 160 : 0, color: '#facc15' },
          { name: 'CO₂', um: 4.3, depth: (S.currentPlanet === 'venus' || S.currentPlanet === 'mars' || (S.currentPlanet === 'earth' && currentState.t < 8.0)) ? 220 : 0, color: '#f87171' }
        ];

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = 15; x < w - 15; x += 4) {
          const lambdaUm = 0.5 + ((x - 15) / (w - 30)) * 4.5;
          let totalAbs = 15;
          for (let m of molecules) {
            const dL = Math.abs(lambdaUm - m.um);
            totalAbs += m.depth * Math.exp(-dL * dL / 0.08);
          }
const y = h - 12 - (totalAbs / 260) * (h - 26);
          if (x === 15) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      if (S.spectralProbeInfo && peakWavelengthText) {
        peakWavelengthText.innerText = S.spectralProbeInfo;
      }
}

export function drawFraunhoferSpectrum(ctx, w, h, currentState) {
  ctx.clearRect(0, 0, w, h);
  const rainbow = ctx.createLinearGradient(0, 0, w, 0);
  rainbow.addColorStop(0.00, '#4c1d95');
  rainbow.addColorStop(0.15, '#2563eb');
  rainbow.addColorStop(0.35, '#06b6d4');
  rainbow.addColorStop(0.55, '#22c55e');
  rainbow.addColorStop(0.75, '#eab308');
  rainbow.addColorStop(0.90, '#f97316');
  rainbow.addColorStop(1.00, '#ef4444');

  ctx.fillStyle = rainbow;
  ctx.fillRect(0, 0, w, h);

  if (S.spectrumMode === 'star') {
    const minNm = 380;
    const maxNm = 750;
    function specX(nm) { return ((nm - minNm) / (maxNm - minNm)) * w; }
    const t = currentState.temp;
            let lines = [
      { name: 'Ca II', nm: 393.4, strength: t > 4000 && t < 7000 ? 0.85 : 0.25 },
      { name: 'H-beta', nm: 486.1, strength: t > 5000 && t < 14000 ? 0.85 : 0.30 },
      { name: 'Na D', nm: 589.0, strength: t < 6000 ? 0.90 : 0.20 },
      { name: 'H-alpha', nm: 656.3, strength: t > 4500 && t < 12000 ? 0.95 : 0.35 }
    ];

    // Полосы Свана углерода C2 для углеродной звезды La Superba
    if (S.selectedStarId === 'la_superba') {
      lines.push(
        { name: 'C2 Swan', nm: 473.7, strength: 0.92 },
        { name: 'C2 Swan', nm: 516.5, strength: 0.95 },
        { name: 'C2 Swan', nm: 563.5, strength: 0.90 }
      );
    }

    for (let l of lines) {
      ctx.fillStyle = rgba(0, 0, 0, l.strength * 0.85);
      ctx.fillRect(specX(l.nm) - 1, 0, 2, h);
    }

    // Белый указатель максимума излучения (λ_max) на спектральной полосе
    const peakNm = 2898000 / Math.max(10, currentState.temp);
    if (peakNm >= minNm && peakNm <= maxNm) {
      const curX = specX(peakNm);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 4;
      ctx.fillRect(curX - 1.2, 0, 2.4, h);
      ctx.shadowBlur = 0;

      // Верхняя треугольная засечка визира
      ctx.beginPath();
      ctx.moveTo(curX - 3.5, 0);
      ctx.lineTo(curX + 3.5, 0);
      ctx.lineTo(curX, 4);
      ctx.closePath();
      ctx.fill();
    } else if (peakNm < minNm) {
      // Индикатор смещения в УФ-область (стрелка влево)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(3, h / 2);
      ctx.lineTo(7, h / 2 - 3.5);
      ctx.lineTo(7, h / 2 + 3.5);
      ctx.closePath();
      ctx.fill();
    } else if (peakNm > maxNm) {
      // Индикатор смещения в ИК-область (стрелка вправо)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(w - 3, h / 2);
      ctx.lineTo(w - 7, h / 2 - 3.5);
      ctx.lineTo(w - 7, h / 2 + 3.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function drawEvolutionCurves(ctx, w, h, currentState) {
  ctx.fillStyle = '#060912';
  ctx.fillRect(0, 0, w, h);

  const list = getActiveStages();
  const minT = list[0].t;
  const maxT = list[list.length - 1].t;
  function timeToX(tVal) { return ((tVal - minT) / (maxT - minT)) * (w - 24) + 12; }

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(12, (h / 4) * i); ctx.lineTo(w - 12, (h / 4) * i); ctx.stroke();
  }

  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const x = timeToX(list[i].t);
    const logR = Math.log10(Math.max(0.01, list[i].r));
    const y = h - 8 - ((logR + 2.0) / 4.5) * (h - 16);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#facc15';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const x = timeToX(list[i].t);
    const logT = Math.log10(Math.max(50, list[i].temp));
    const y = h - 8 - ((logT - 1.7) / 2.9) * (h - 16);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.strokeStyle = '#4ade80';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const x = timeToX(list[i].t);
    const y = h - 8 - (list[i].mass / 1.05) * (h - 16);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const curX = timeToX(currentState.t);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(curX, 4); ctx.lineTo(curX, h - 4); ctx.stroke();
}

// Поле диаграммы: lg T от 4.85 (70 000 K) до 3.3 (2000 K) — горячие слева; lg L от −5.5 до 6.9
const HR_T = [3.3, 4.85], HR_L = [-5.5, 6.9];
export function getHRCoords(temp, lum, w, h, box = { l: 12, r: 12, t: 12, b: 12 }) {
  const logT = Math.log10(Math.max(1800, Math.min(70000, temp)));
  const x = box.l + (1 - (logT - HR_T[0]) / (HR_T[1] - HR_T[0])) * (w - box.l - box.r);
  const logL = Math.log10(Math.max(3e-6, Math.min(8e6, lum)));
  const y = box.t + (1 - (logL - HR_L[0]) / (HR_L[1] - HR_L[0])) * (h - box.t - box.b);
  return { x, y };
}

// Цвет участка трека по фазе эволюции (у треков MIST — фаза из модели, у ручных — по температуре и светимости)
const PHASE_COL = { '-1': '#94a3b8', 0: '#60a5fa', 2: '#f87171', 3: '#fbbf24', 4: '#c084fc', 5: '#c084fc', 6: '#34d399', 9: '#22d3ee' };
function phaseColor(s) {
  if (s.phase !== undefined && PHASE_COL[s.phase]) return PHASE_COL[s.phase];
  if (s.t < 0) return PHASE_COL[-1];
  if (s.r < 0.05) return PHASE_COL[6];
  if (s.r > 8) return s.temp < 4800 ? PHASE_COL[2] : PHASE_COL[3];
  return PHASE_COL[0];
}

// Главная последовательность нулевого возраста (ZAMS) по MIST при металличности звезды — кэш по [Fe/H]
const zamsCache = new Map();
function zamsLine(feh) {
  const k = (feh || 0).toFixed(2);
  if (zamsCache.has(k)) return zamsCache.get(k);
  const pts = [];
  for (const m of [0.1, 0.15, 0.2, 0.3, 0.45, 0.6, 0.8, 1, 1.3, 1.7, 2.2, 3, 4, 6, 9, 14, 20, 30, 50, 80, 120, 200]) {
    const tr = interpolateMistTrack(m, feh || 0);
    const z = tr.points.find(p => p.eep === MIST_TRACKS.primary.ZAMS);
    if (z) pts.push({ temp: Math.pow(10, z.logT), l: Math.pow(10, z.logL), m });
  }
  zamsCache.set(k, pts);
  return pts;
}

// «Призрачные» треки той же массы при других металличностях — кэш по массе
const ghostCache = new Map();
function ghostTracks(mass, feh) {
  const k = `${mass}|${feh}`;
  if (ghostCache.has(k)) return ghostCache.get(k);
  const out = [];
  if (mass >= 0.1 && mass <= 300) {
    for (const f of [-1.5, 0.5]) {
      if (Math.abs(f - feh) < 0.3) continue;
      const tr = interpolateMistTrack(mass, f);
      out.push({ feh: f, pts: tr.points.filter(p => p.eep >= MIST_TRACKS.primary.ZAMS).map(p => ({ temp: Math.pow(10, p.logT), l: Math.pow(10, p.logL) })) });
    }
  }
  if (ghostCache.size > 50) ghostCache.clear();
  ghostCache.set(k, out);
  return out;
}

/**
 * Диаграмма Герцшпрунга — Рассела. big = true — полноэкранный режим с осями и подписями.
 */
export function drawHRDiagram(ctx, w, h, currentState, big = false) {
  const box = big ? { l: 58, r: 20, t: 36, b: 44 } : { l: 12, r: 12, t: 12, b: 12 };
  const P = (temp, l) => getHRCoords(temp, l, w, h, box);
  ctx.fillStyle = '#060912';
  ctx.fillRect(0, 0, w, h);

  // Полосы спектральных классов (границы по T_eff: Pecaut & Mamajek 2013)
  const CLASSES = [['O', 70000, 31000], ['B', 31000, 10000], ['A', 10000, 7300], ['F', 7300, 6000], ['G', 6000, 5300], ['K', 5300, 3900], ['M', 3900, 1800]];
  ctx.save();
  ctx.font = `${big ? 12 : 8}px sans-serif`; ctx.textAlign = 'center';
  CLASSES.forEach(([name, t1, t0], i) => {
    const x1 = P(t1, 1).x, x0 = P(t0, 1).x;
    const c = getStarColor(Math.sqrt(t0 * t1));
    ctx.fillStyle = rgba(c.coreRGB[0], c.coreRGB[1], c.coreRGB[2], i % 2 ? 0.035 : 0.06);
    ctx.fillRect(x1, box.t, x0 - x1, h - box.t - box.b);
    ctx.fillStyle = rgba(c.coreRGB[0], c.coreRGB[1], c.coreRGB[2], 0.7);
    ctx.fillText(name, (x0 + x1) / 2, box.t - (big ? 10 : -9));
  });
  ctx.restore();

  // Оси (только в полноэкранном режиме)
  if (big) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.15)'; ctx.fillStyle = '#94a3b8'; ctx.font = '11px sans-serif';
    for (let lg = -4; lg <= 6; lg += 2) {
      const y = P(5772, Math.pow(10, lg)).y;
      ctx.beginPath(); ctx.moveTo(box.l, y); ctx.lineTo(w - box.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(lg === 0 ? '1' : `10${lg < 0 ? '⁻' : ''}${'⁰¹²³⁴⁵⁶⁷⁸⁹'[Math.abs(lg)]}`, box.l - 6, y + 4);
    }
    for (const T of [40000, 20000, 10000, 6000, 4000, 3000, 2000]) {
      const x = P(T, 1).x;
      ctx.beginPath(); ctx.moveTo(x, box.t); ctx.lineTo(x, h - box.b); ctx.stroke();
      ctx.textAlign = 'center'; ctx.fillText(T >= 10000 ? `${T / 1000}k` : String(T), x, h - box.b + 16);
    }
    ctx.fillText('T_eff, K', (box.l + w - box.r) / 2, h - 8);
    ctx.save(); ctx.translate(16, (box.t + h - box.b) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('L / L☉', 0, 0); ctx.restore();
    ctx.restore();
  }

  // Главная последовательность (ZAMS по MIST)
  const zams = zamsLine(S.selectedFeH);
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)'; ctx.lineWidth = big ? 8 : 4; ctx.lineCap = 'round';
  ctx.beginPath(); zams.forEach((p, i) => { const q = P(p.temp, p.l); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.stroke();
  if (big) {
    ctx.fillStyle = 'rgba(148,163,184,0.7)'; ctx.font = '10px sans-serif';
    for (const p of zams) if ([0.1, 0.3, 1, 3, 9, 30, 120].includes(p.m)) { const q = P(p.temp, p.l); ctx.fillText(`${p.m} M☉`, q.x + 8, q.y + 12); }
  }
  ctx.restore();

  // Звёзды-ориентиры
  for (const star of HR_BENCHMARKS) {
    const sc = P(star.temp, star.l);
    ctx.fillStyle = star.color;
    ctx.beginPath(); ctx.arc(sc.x, sc.y, big ? 3.5 : 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#64748b'; ctx.font = `${big ? 11 : 7}px sans-serif`;
    ctx.fillText(star.name, sc.x + 4, sc.y - 3);
  }

  // Призрачные треки при других [Fe/H] (только для звёзд на треках MIST)
  const list = getActiveStages();
  if (list.some(s => s.source === 'MIST')) {
    for (const g of ghostTracks(S.selectedStarMass, S.selectedFeH || 0)) {
      ctx.save(); ctx.setLineDash([3, 4]);
      ctx.strokeStyle = g.feh < 0 ? 'rgba(96,165,250,0.35)' : 'rgba(248,113,113,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); g.pts.forEach((p, i) => { const q = P(p.temp, p.l); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); ctx.stroke();
      if (big && g.pts.length) { const q = P(g.pts[0].temp, g.pts[0].l); ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle; ctx.font = '10px sans-serif'; ctx.fillText(`[Fe/H] ${g.feh > 0 ? '+' : ''}${g.feh}`, q.x - 70, q.y + 14); }
      ctx.restore();
    }
  }

  // Трек звезды: пройденный путь ярко и по фазам, будущее — бледно
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i], b = list[i + 1];
    if (b.noSB || a.noSB || !(a.l > 0) || !(b.l > 0)) continue;
    const pa = P(a.temp, a.l), pb = P(b.temp, b.l);
    const past = b.t <= currentState.t;
    ctx.strokeStyle = phaseColor(a);
    ctx.globalAlpha = past ? 0.95 : 0.28;
    ctx.lineWidth = (past ? 2.2 : 1.4) * (big ? 1.4 : 1);
    ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
  }
  ctx.restore();

  // Текущее положение звезды со свечением
  const cur = P(currentState.temp, currentState.l);
  const sc = getStarColor(currentState.temp);
  const glow = ctx.createRadialGradient(cur.x, cur.y, 1, cur.x, cur.y, big ? 22 : 12);
  glow.addColorStop(0, sc.corona); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cur.x, cur.y, big ? 22 : 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = sc.core; ctx.beginPath(); ctx.arc(cur.x, cur.y, big ? 6 : 4, 0, Math.PI * 2); ctx.fill();

  if (big) {
    // Легенда фаз
    const leg = [['до ГП', PHASE_COL[-1]], ['главная последовательность', PHASE_COL[0]], ['ветвь гигантов', PHASE_COL[2]], ['горение He', PHASE_COL[3]], ['AGB', PHASE_COL[5]], ['белый карлик', PHASE_COL[6]], ['Вольф — Райе', PHASE_COL[9]]];
    ctx.font = '11px sans-serif';
    // легенда — в пустом углу внизу слева (там только холодные белые карлики)
    const lx = box.l + 10, ly = h - box.b - 10 - leg.length * 16;
    leg.forEach(([t, c], i) => { ctx.fillStyle = c; ctx.fillRect(lx, ly + i * 16, 12, 3); ctx.fillStyle = '#cbd5e1'; ctx.fillText(t, lx + 18, ly + 5 + i * 16); });
    ctx.fillStyle = '#e2e8f0'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`${currentState.name}  •  T = ${Math.round(currentState.temp)} K, L = ${currentState.l >= 100 ? Math.round(currentState.l) : currentState.l.toPrecision(3)} L☉`, box.l, 20);
  }
}
