// Окна и кнопки: нуклеосинтез, GW-детектор, двойная система, паспорт, снимок, масштабы
import { STAR_CATALOG } from '../data/catalog.js';
import { ageUnitText, binarySysBtn, closeNucleoModalBtn, closeScaleModalBtn, gwDetectorBtn, mainCanvas, nucleoBtn, nucleoModal, nucleoResultsContainer, passportBtn, scaleModal, scaleModalBtn, screenshotBtn, valAge } from '../dom.js';
import { getInterpolatedState } from '../model/timeline.js';
import { getMKClass } from '../physics/classification.js';
import { calculateSurfaceTemp } from '../physics/climate.js';
import { getPlanetDistanceAU } from '../physics/orbits.js';
import { S } from '../state.js';



// Подписки на события (выполнялись при загрузке страницы)
export function initPanels() {
  gwDetectorBtn.addEventListener('click', () => {
    S.isGwDetector = !S.isGwDetector;
    gwDetectorBtn.classList.toggle('active', S.isGwDetector);
    gwDetectorBtn.innerText = S.isGwDetector ? 'GW-детектор: Вкл' : 'GW-детектор: Выкл';
  });

  nucleoBtn.addEventListener('click', () => {
    nucleoModal.style.display = 'flex';
    const state = getInterpolatedState(S.currentAge);
  
    let yields = [];
    if (S.binaryCompanion.isSupernovaIa) {
      yields = [
        { name: "Железо-56 (Fe, детонация карлика)", earthMasses: 210000, color: "#f87171" },
        { name: "Никель и кобальт (Ni, Co)", earthMasses: 35000, color: "#fb923c" },
        { name: "Кремний и сера (Si, S)", earthMasses: 45000, color: "#facc15" }
      ];
    } else if (S.selectedStarMass >= 20.0) {
      yields = [
        { name: "Кислород-16 (O, звездный ветер)", earthMasses: Math.round(1200000 * (S.selectedStarMass / 25.0)), color: "#38bdf8" },
        { name: "Углерод-12 (C)", earthMasses: Math.round(450000 * (S.selectedStarMass / 25.0)), color: "#4ade80" },
        { name: "Золото и уран (r-процесс аккреции)", earthMasses: Math.round(85 * (S.selectedStarMass / 25.0)), color: "#eab308" },
        { name: "Захвачено в сингулярность ЧД", earthMasses: Math.round(3100000 * (S.selectedStarMass / 25.0)), color: "#64748b" }
      ];
    } else if (S.selectedStarMass >= 8.0) {
      yields = [
        { name: "Кислород-16 (O)", earthMasses: Math.round(480000 * (S.selectedStarMass / 8.0)), color: "#38bdf8" },
        { name: "Кремний и магний (Si, Mg)", earthMasses: Math.round(95000 * (S.selectedStarMass / 8.0)), color: "#a855f7" },
        { name: "Железо (Fe, сброс сверхновой)", earthMasses: Math.round(33000 * (S.selectedStarMass / 8.0)), color: "#f87171" },
        { name: "Золото и платина (r-процесс)", earthMasses: Math.round(24 * (S.selectedStarMass / 8.0)), color: "#eab308" }
      ];
          } else if (S.selectedStarMass < 0.45) {
      yields = [
        { name: "Нет выброса (вечный гравитационный плен)", earthMasses: 0, color: "#64748b" }
      ];
    } else {
      // Солнечная эволюция (1.0 M☉)
  
      yields = [
        { name: "Углерод-12 (C, AGB-суперветер)", earthMasses: 68000, color: "#4ade80" },
        { name: "Азот-14 (N)", earthMasses: 18000, color: "#a855f7" },
        { name: "Барий и свинец (s-процесс)", earthMasses: 12, color: "#eab308" }
      ];
    }
  
    nucleoResultsContainer.innerHTML = '';
    yields.forEach(item => {
      const row = document.createElement('div');
      row.style.cssText = 'background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 8px 10px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;';
      row.innerHTML = `
        <span style="font-size: 0.75rem; color: #cbd5e1; font-weight: 500;">${item.name}</span>
        <strong style="font-size: 0.8rem; color: ${item.color}; font-family: monospace;">${item.earthMasses ? item.earthMasses.toLocaleString() + " M⊕" : "0"}</strong>
      `;
      nucleoResultsContainer.appendChild(row);
    });
  });

  closeNucleoModalBtn.addEventListener('click', () => {
    nucleoModal.style.display = 'none';
  });

  binarySysBtn.addEventListener('click', () => {
    S.isBinarySystem = !S.isBinarySystem;
    binarySysBtn.classList.toggle('active', S.isBinarySystem);
    binarySysBtn.innerText = S.isBinarySystem ? 'Двойная система: Вкл' : 'Двойная система: Выкл';
    S.binaryCompanion.accretedMass = 0;
    S.binaryCompanion.isSupernovaIa = false;
    S.binaryCompanion.snIaProgress = 0;
  });

  scaleModalBtn.addEventListener('click', () => { scaleModal.style.display = 'flex'; });

  closeScaleModalBtn.addEventListener('click', () => { scaleModal.style.display = 'none'; });

  passportBtn.addEventListener('click', () => {
        try {
          const state = getInterpolatedState(S.currentAge);
          const pCanvas = document.createElement('canvas');
          pCanvas.width = 1200;
          pCanvas.height = 1040;
          const pctx = pCanvas.getContext('2d');
  
                  // Фон инфографики на всю высоту холста (1040px)
          pctx.fillStyle = '#02040a';
          pctx.fillRect(0, 0, 1200, 1040);
  
  
          // Сетка и неоновая рамка
          pctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
          pctx.lineWidth = 2;
          pctx.strokeRect(20, 20, 1160, 1000);
  
  
          // Заголовок паспорта
          pctx.fillStyle = '#38bdf8';
          pctx.font = 'bold 26px sans-serif';
          pctx.fillText("АСТРОФИЗИЧЕСКИЙ ПАСПОРТ ПЛАНЕТНОЙ СИСТЕМЫ", 50, 70);
  
          pctx.font = '15px sans-serif';
          pctx.fillStyle = '#94a3b8';
  const curStarData = STAR_CATALOG.find(s => s.id === S.selectedStarId) || { name: 'Солнце', mass: S.selectedStarMass };
          const realMK = getMKClass(state);
          pctx.fillText(`Светило: ${curStarData.name} (${curStarData.mass} M☉, класс ${realMK}) • Возраст: ${valAge.innerText} ${ageUnitText.innerText}`, 50, 105);
          // Сводка физики звезды
          pctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
          pctx.fillRect(50, 130, 1100, 100);
          pctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
          pctx.strokeRect(50, 130, 1100, 100);
  
          pctx.fillStyle = '#f8fafc';
          pctx.font = 'bold 16px sans-serif';
          pctx.fillText(`Фаза: ${state.name}`, 70, 165);
          pctx.font = '14px sans-serif';
          pctx.fillStyle = '#cbd5e1';
          pctx.fillText(`Спектральный класс: ${realMK}  |  Радиус: ${state.r.toFixed(3)} R☉  |  Температура: ${Math.round(state.temp)} K  |  Светимость: ${state.l < 0.001 ? state.l.toExponential(2) : state.l.toFixed(2)} L☉`, 70, 200);
  
          // Таблица судеб миров
          pctx.fillStyle = '#38bdf8';
          pctx.font = 'bold 18px sans-serif';
          pctx.fillText("ИТОГОВАЯ ХРОНОЛОГИЯ И СУДЬБА НЕБЕСНЫХ ТЕЛ:", 50, 275);
  
          const checkPlanets = [
            { id: 'mercury', name: 'Меркурий' },
            { id: 'venus', name: 'Венера' },
            { id: 'earth', name: 'Земля' },
            { id: 'mars', name: 'Марс' },
            { id: 'europa', name: 'Юпитер (Европа)' },
                      { id: 'titan', name: 'Сатурн (Титан)' },
            { id: 'uranus', name: 'Уран' },
            { id: 'neptune', name: 'Нептун' },
            { id: 'pluto', name: 'Плутон (Плутино)' },
            { id: 'haumea', name: 'Хаумеа (Эллипсоид)' },
            { id: 'makemake', name: 'Макемаке (Кьюбивано)' },
            { id: 'eris', name: 'Эрида (Рассеянный диск)' }
          ];
  
  
          let startY = 320;
          checkPlanets.forEach((p, idx) => {
            const dist = getPlanetDistanceAU(p.id, state);
            const sTemp = calculateSurfaceTemp(p.id, state);
            let statusText = "";
            let statusColor = "#4ade80";
  
            if (dist <= 0.001) {
              statusText = "УНИЧТОЖЕНА: Испарилась в фотосфере звезды / сметена ударной волной";
              statusColor = "#f87171";
            } else if (dist >= state.hzIn && dist <= state.hzOut) {
              statusText = `В ЗОНЕ ЖИЗНИ: T = ${sTemp.avg > 0 ? '+' : ''}${sTemp.avg}°C (Жидкая вода возможна)`;
              statusColor = "#4ade80";
            } else if (dist < state.hzIn) {
              statusText = `ПЕРЕГРЕВ: T = ${sTemp.avg > 0 ? '+' : ''}${sTemp.avg}°C (Сверхпарниковый ад/высыхание)`;
              statusColor = "#fb923c";
            } else {
              statusText = `ЗАМОРОЖЕНА: T = ${sTemp.avg}°C (Вечная мерзлота / реликт)`;
              statusColor = "#93c5fd";
            }
  
            pctx.fillStyle = '#f1f5f9';
            pctx.font = 'bold 15px sans-serif';
            pctx.fillText(`${idx + 1}. ${p.name}`, 60, startY);
  
            pctx.fillStyle = statusColor;
            pctx.font = '14px sans-serif';
            pctx.fillText(statusText, 260, startY);
  
            pctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            pctx.beginPath();
            pctx.moveTo(50, startY + 14);
            pctx.lineTo(1150, startY + 14);
            pctx.stroke();
  
            startY += 52;
          });
  
          // Нижний штамп лаборатории
          pctx.fillStyle = '#64748b';
          pctx.font = '12px monospace';
          pctx.fillText("SOLAR EVOLUTION ASTROPHYSICAL LABORATORY • v5.5 (WebGL + VOLUMETRIC CLOUDS + ANDROMEDA + BLACK HOLE LENSING)", 50, 990);
  
          const link = document.createElement('a');
                  link.download = `passport_${S.selectedStarId}_${valAge.innerText}${ageUnitText.innerText}.png`;
  
          link.href = pCanvas.toDataURL('image/png');
          link.click();
        } catch (err) {
          console.warn("Passport generator error:", err);
        }
  });

  screenshotBtn.addEventListener('click', () => {
    try {
      const link = document.createElement('a');
      link.download = `solar_evolution_${S.currentAge.toFixed(2)}_Gyr.png`;
      link.href = mainCanvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.warn("Screenshot error:", e);
    }
  });
}
