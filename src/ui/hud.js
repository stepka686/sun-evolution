// HUD и панель данных: телеметрия, атмосфера, метки эпох
import { formatFeH } from '../model/mistTracks.js';
import { STAR_CATALOG } from '../data/catalog.js';
import { ageUnitText, atmoEscapeBadge, earthFateBtn, atmoGasBar, atmoGasLegend, barC, barH, barHe, barO, bioBarFill, bioCO2Val, bioEraText, bioO2Val, bioStatusBadge, camHint, cameraHudBadge, closeSidebarBtn, coPctText, esiBadge, esiMarker, esiValueText, fluxBadge, hPctText, hePctText, hudCollapseBtn, hudStack, hzStatusBadge, interstellarBadge, milestonesContainer, phaseDesc, planetAtmoTitle, planetGeoEventText, planetPressureVal, scaleBarCurrentSun, scaleValCurrentSun, sidebar, sidebarToggleBtn, spaceTiltBox, spectralBadge, subAge, subHz, subLum, subMass, subRadius, subTemp, surfaceTempBadge, surfaceTimeToolbar, timeSlider, valAge, valHzDist, valLum, valMass, valRadius, valTemp } from '../dom.js';
import { getPlanetDisplayName } from '../model/exoplanets.js';
import { getActiveStages, getTimeBounds } from '../model/timeline.js';
import { getMKClass } from '../physics/classification.js';
import { calculateAtmosphereEscapeRate, calculateBiosphere, calculateInsolationFlux, calculatePlanetAtmosphere, calculateSurfaceTemp, getPlanetClimate } from '../physics/climate.js';
import { calculatePlanetESI } from '../physics/habitability.js';
import { fateText, getPlanetDistanceAU, getPlanetFate } from '../physics/orbits.js';
import { getStarColor } from '../render/colors.js';
import { S } from '../state.js';
import { ageToSlider } from './timeControls.js';
import { renderGasList } from './gasList.js';
import { atmosphereProfile } from '../physics/atmoProfile.js';
import { drawAtmoProfile } from '../render/atmoProfileChart.js';

// Подпись возраста: миллиарды лет, а для короткоживущих звёзд — миллионы
function formatAgeLabel(t) {
  const a = Math.abs(t);
  if (a >= 100) return t.toFixed(0);
  if (a >= 1) return t.toFixed(2);
  if (a >= 0.05) return t.toFixed(3);
  if (a >= 0.001) return `${(t * 1000).toPrecision(2)} млн`;
  return `${Math.round(t * 1e6)} тыс`;
}

// Метки эпох: по одной на каждую новую фазу трека
export function createMilestoneButtons() {
  milestonesContainer.innerHTML = '';
  const list = getActiveStages();
  let prevName = null;
  list.forEach(s => {
    if (s.name === prevName) return;
    prevName = s.name;
    const btn = document.createElement('button');
    btn.className = 'milestone-tag';
    btn.dataset.time = s.t;
    const nameShort = s.name.split(/[:•(]/)[0].trim().slice(0, 18);
    btn.innerText = `${formatAgeLabel(s.t)}: ${nameShort}`;
    btn.addEventListener('click', () => { S.currentAge = Number(s.t); });
    milestonesContainer.appendChild(btn);
  });
  // Метки пересоздаются при смене звезды и режима — тогда же обновляем рассчитанную судьбу Земли
  updateTideButton();
}

export function updateHudVisibility() {
  if (S.currentView === 'interstellar') {
    if (esiBadge) esiBadge.style.display = 'none';
    surfaceTempBadge.style.display = 'none';
    fluxBadge.style.display = 'none';
    atmoEscapeBadge.style.display = 'none';
    hzStatusBadge.style.display = 'none';
    bioStatusBadge.style.display = 'none';
    interstellarBadge.style.display = 'inline-flex';
    camHint.style.display = 'none';
    surfaceTimeToolbar.style.display = 'none';
    spaceTiltBox.style.display = 'none';
  } else if (S.currentView === 'space') {
    if (esiBadge) esiBadge.style.display = 'inline-flex';
    surfaceTempBadge.style.display = 'inline-flex';
    fluxBadge.style.display = 'inline-flex';
    atmoEscapeBadge.style.display = (S.cameraFocus !== 'sun' && S.cameraFocus !== 'oort') ? 'inline-flex' : 'none';
    hzStatusBadge.style.display = 'inline-flex';
    bioStatusBadge.style.display = (S.cameraFocus === 'earth' || S.cameraFocus === 'sun') ? 'inline-flex' : 'none';
    interstellarBadge.style.display = 'none';
    camHint.style.display = 'block';
    surfaceTimeToolbar.style.display = 'none';
    spaceTiltBox.style.display = 'flex';
  } else {
    if (esiBadge) esiBadge.style.display = 'inline-flex';
    surfaceTempBadge.style.display = 'inline-flex';
    fluxBadge.style.display = 'inline-flex';
    atmoEscapeBadge.style.display = 'inline-flex';
    hzStatusBadge.style.display = 'inline-flex';
    bioStatusBadge.style.display = (S.currentPlanet === 'earth') ? 'inline-flex' : 'none';
    interstellarBadge.style.display = 'none';
    camHint.style.display = 'none';
    spaceTiltBox.style.display = 'none';
    surfaceTimeToolbar.style.display = (S.currentView === 'surface') ? 'flex' : 'none';
    // Автоматически сворачиваем второстепенные плашки при переходе на поверхность, чтобы не закрывать небо
    if (S.currentView === 'surface' && hudStack && !hudStack.dataset.userToggled) {
      hudStack.classList.add('collapsed');
      if (hudCollapseBtn) hudCollapseBtn.innerText = '▶';
    } else if (S.currentView === 'orbit' && hudStack && !hudStack.dataset.userToggled) {
      hudStack.classList.remove('collapsed');
      if (hudCollapseBtn) hudCollapseBtn.innerText = '▼';
    }
  }
}

// Панель телеметрии не должна залезать под панель инструментов вида (на узких экранах они встречаются):
// если прямоугольники пересекаются по горизонтали, телеметрия сдвигается ниже панели
let lastOverlapCheck = 0;
export function avoidToolbarOverlap() {
  const now = performance.now();
  if (now - lastOverlapCheck < 300 || !hudStack) return;
  lastOverlapCheck = now;
  const parent = hudStack.offsetParent;
  if (!parent) return;
  const boxes = [spaceTiltBox, surfaceTimeToolbar].filter(b => b && b.style.display !== 'none' && b.offsetParent);
  const pr = parent.getBoundingClientRect(), hr = hudStack.getBoundingClientRect();
  let top = 10;
  for (const b of boxes) {
    const r = b.getBoundingClientRect();
    if (r.left < hr.right && r.right > hr.left) top = Math.max(top, r.bottom - pr.top + 6);
  }
  const want = top > 10 ? `${Math.round(top)}px` : '';
  if (hudStack.style.top !== want) hudStack.style.top = want;
}

export function updateHUDViewLabels() {
  avoidToolbarOverlap();
  const curStar = STAR_CATALOG.find(s => s.id === S.selectedStarId) || { name: 'Солнце' };
  const pName = getPlanetDisplayName(S.currentPlanet);
  const fName = (S.cameraFocus === 'sun') ? curStar.name : getPlanetDisplayName(S.cameraFocus);

  if (S.currentView === 'space') cameraHudBadge.innerText = `Космос • ${fName}`;
  else if (S.currentView === 'orbit') cameraHudBadge.innerText = `Орбита • ${pName}`;
  else if (S.currentView === 'surface') cameraHudBadge.innerText = `Поверхность • ${pName}`;
  else if (S.currentView === 'moon') cameraHudBadge.innerText = 'Вид с Луны • Земля';
  else if (S.currentView === 'galaxy') cameraHudBadge.innerText = 'Галактика • Млечный Путь';
  else cameraHudBadge.innerText = `α Центавра • 4.37 св. г.`;

  updateHudVisibility();
}

export function updateUI(state) {
  const isShortLived = (S.selectedStarMass >= 5.0 || getTimeBounds().max < 1.0);
  if (isShortLived) {
    valAge.innerText = (state.t * 1000).toFixed(S.selectedStarMass >= 15.0 ? 2 : 1);
    ageUnitText.innerText = "млн лет";
  } else if (S.isDeepTime) {
    valAge.innerText = state.t >= 100 ? state.t.toFixed(0) : state.t.toFixed(1);
    ageUnitText.innerText = "млрд лет";
  } else {
    valAge.innerText = state.t < 0 ? state.t.toFixed(3) : state.t.toFixed(2);
    ageUnitText.innerText = "млрд лет";
  }
  // Отображение радиуса и светимости с десятитысячными долями до порога 1.0
  valRadius.innerText = state.r < 1.0 ? state.r.toFixed(4) : (state.r < 10.0 ? state.r.toFixed(3) : state.r.toFixed(1));
  valLum.innerText = state.l < 0.0001 ? state.l.toExponential(2) : (state.l < 1.0 ? state.l.toFixed(4) : (state.l >= 100 ? Math.round(state.l) : state.l.toFixed(2)));

  // Окрашивание числа температуры звезды в реальный цвет её фотосферы
  valTemp.innerText = Math.round(state.temp);
  const starCol = getStarColor(state.temp);
  valTemp.style.color = starCol.core;
  valTemp.style.textShadow = `0 0 8px ${starCol.corona}`;
  valMass.innerText = state.mass.toFixed(2);

  const isBlackHoleState = (S.selectedStarMass >= 20.0 && state.r < 0.001);
  valHzDist.innerText = isBlackHoleState ? "Неприменимо (ЧД)" : `${state.hzIn.toFixed(2)} - ${state.hzOut.toFixed(2)}`;
  spectralBadge.innerText = getMKClass(state);
  phaseDesc.innerHTML = `<strong>${state.name}</strong><br>${state.desc}`;
  timeSlider.value = ageToSlider(state.t);

  // Динамический расчёт реальных физических величин в единицах СИ (км, Ватты, г/см³, log g)
  if (subAge) subAge.innerText = state.name.split(/[:•(]/)[0].trim();
              if (subRadius) {
    const rKm = Math.round(state.r * 696340);
    subRadius.innerText = `${String(rKm).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} км`;
  }
  if (subLum) {
    const watts = state.l * 3.828e26;
    subLum.innerText = `${watts.toExponential(2)} Вт`;
  }
  if (subTemp) {
    const tempC = Math.round(state.temp - 273.15);
    subTemp.innerText = `${tempC > 0 ? '+' : ''}${String(tempC).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} °C`;
  }

  if (subMass) {
    const rho = 1.408 * (state.mass / Math.pow(Math.max(0.00001, state.r), 3));
    const rhoStr = (rho >= 1000 || rho < 0.01) ? rho.toExponential(1) : rho.toFixed(2);
    subMass.innerText = `Плотность: ${rhoStr} г/см³ • [Fe/H] ${formatFeH(S.selectedFeH || 0)}`;
  }
  if (subHz) {
    subHz.innerText = isBlackHoleState ? "Отсутствует" : `${Math.round(state.hzIn * 149.6)} - ${Math.round(state.hzOut * 149.6)} млн км`;
  }


  const bio = calculateBiosphere(state.t);
  bioEraText.innerText = bio.era;
  bioEraText.style.color = bio.statusColor;
  bioO2Val.innerText = `${bio.o2}%`;
  bioCO2Val.innerText = `${bio.co2} ppm`;
  bioBarFill.style.width = `${bio.healthPct}%`;
  bioBarFill.style.background = bio.statusColor;
  bioStatusBadge.innerText = bio.badge;
  bioStatusBadge.style.borderColor = bio.statusColor;

  // Обновление газового анализатора атмосферы для текущей планеты
  const activePlanetForAtmo = (S.currentView === 'surface' || S.currentView === 'orbit') ? S.currentPlanet : (S.cameraFocus === 'sun' || S.cameraFocus === 'oort' ? 'earth' : S.cameraFocus);
  const pTitleName = getPlanetDisplayName(activePlanetForAtmo);
  const atmoData = calculatePlanetAtmosphere(activePlanetForAtmo, state);
  if (planetAtmoTitle) planetAtmoTitle.innerText = `${pTitleName} • Атмосфера:`;
  if (planetPressureVal) {
    planetPressureVal.innerText = atmoData.pressureBar === 0 ? "0 бар (вакуум)" : (atmoData.pressureBar < 0.01 ? `${atmoData.pressureBar.toExponential(1)} бар` : `${atmoData.pressureBar} бар`);
  }
  if (planetGeoEventText) planetGeoEventText.innerText = atmoData.event;
  if (atmoGasBar) {
    // общая полоска: сегменты только для газов от 0.5 %, остальное — одним серым хвостом
    const big = atmoData.gases.filter(g => g.pct >= 0.5);
    const tail = Math.max(0, 100 - big.reduce((s, g) => s + g.pct, 0));
    const gasSig = big.map(g => `${g.key}:${g.pct.toFixed(1)}`).join('|');
    if (atmoGasBar.dataset.sig !== gasSig) {
      atmoGasBar.dataset.sig = gasSig;
      atmoGasBar.innerHTML = atmoData.gases.length === 0 ? `<div class="atmo-gas-seg" style="width: 100%; background: #1e293b;"></div>`
        : big.map(g => `<div class="atmo-gas-seg" style="width: ${g.pct.toFixed(2)}%; background: ${g.color};"></div>`).join('')
          + (tail > 0.05 ? `<div class="atmo-gas-seg" style="width: ${tail.toFixed(2)}%; background: #475569;"></div>` : '');
    }
  }
  renderGasList(atmoGasLegend, atmoData.gases);
  // разрез атмосферы (температура и давление по высоте)
  const profCanvas = document.getElementById('atmoProfileCanvas');
  if (profCanvas && profCanvas.offsetParent !== null) {
    const clim = getPlanetClimate(activePlanetForAtmo, state);
    drawAtmoProfile(profCanvas, clim ? atmosphereProfile(activePlanetForAtmo, clim, atmoData) : null, activePlanetForAtmo);
  }

  const hPct = Math.round(state.h * 100);
  const hePct = Math.round(state.he * 100);
  const cPct = Math.round(state.c * 100);
  const oPct = Math.max(0, 100 - (hPct + hePct + cPct));

  barH.style.width = `${hPct}%`;
  barHe.style.width = `${hePct}%`;
  barC.style.width = `${cPct}%`;
  barO.style.width = `${oPct}%`;

  hPctText.innerText = `H ${hPct}%`;
  hePctText.innerText = `He ${hePct}%`;
  coPctText.innerText = `C ${cPct}% | O ${oPct}%`;

        const curPlanet = (S.currentView === 'surface' || S.currentView === 'orbit') ? S.currentPlanet : (S.cameraFocus === 'sun' ? 'earth' : (S.cameraFocus === 'oort' ? 'earth' : S.cameraFocus));
  const planetName = getPlanetDisplayName(curPlanet);
  const sTempObj = calculateSurfaceTemp(curPlanet, state);
  const curPlanetDist = getPlanetDistanceAU(curPlanet, state);

  // Обновление индекса ESI и его графической шкалы
  const esiData = calculatePlanetESI(curPlanet, state);
  if (esiValueText && esiMarker) {
    esiValueText.innerText = esiData.val.toFixed(3);
    esiValueText.style.color = esiData.color;
    esiMarker.style.left = `${(esiData.val * 100).toFixed(1)}%`;
  }

  if (curPlanetDist <= 0.001) {
    surfaceTempBadge.innerText = `${planetName}: разрушена`;
  } else if (sTempObj.locked) {
    surfaceTempBadge.innerText = `${planetName}: ${sTempObj.day > 0 ? '+' : ''}${sTempObj.day}°C / ${sTempObj.night}°C`;
  } else {
    surfaceTempBadge.innerText = `${planetName}: ${sTempObj.avg > 0 ? '+' : ''}${sTempObj.avg}°C`;
  }

        // Релятивистское гравитационное замедление времени вблизи компактных остатков
  if (isBlackHoleState) {
    const rsKm = Math.round(2.95 * state.mass);
    surfaceTempBadge.innerText = `Чёрная дыра: R_s = ${rsKm} км • Замедление времени: dτ/dt → 0`;
  } else if (state.r < 0.001 && S.selectedStarMass >= 8.0 && S.selectedStarMass < 20.0) {
    surfaceTempBadge.innerText = "Пульсар: R ≈ 12 км • Замедление времени на поверхности: ≈ −19%";
  }

  fluxBadge.innerText = `Поток (${planetName}): ${calculateInsolationFlux(curPlanet, state)}`;
  atmoEscapeBadge.innerText = `Утечка (${planetName}): ${calculateAtmosphereEscapeRate(curPlanet, state)}`;

  const inHz = curPlanetDist >= state.hzIn && curPlanetDist <= state.hzOut && !isBlackHoleState && curPlanetDist > 0.001;

  if (curPlanetDist <= 0.001) {
    hzStatusBadge.className = 'hud-pill hud-collapsible';
    hzStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    hzStatusBadge.style.color = '#fca5a5';
    hzStatusBadge.innerText = `${planetName} ${fateText(S.currentPlanet)}`;
  } else if (inHz) {
    hzStatusBadge.className = 'hud-pill hud-hz-status hud-collapsible';
    hzStatusBadge.style.borderColor = 'rgba(34, 197, 94, 0.35)';
    hzStatusBadge.style.color = '#86efac';
    hzStatusBadge.innerText = `${planetName} в зоне жизни`;
  } else if (curPlanetDist < state.hzIn) {
    hzStatusBadge.className = 'hud-pill hud-collapsible';
    hzStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    hzStatusBadge.style.color = '#fca5a5';
    hzStatusBadge.innerText = `${planetName} перегрета (парниковый ад)`;
  } else {
    hzStatusBadge.className = 'hud-pill hud-collapsible';
    hzStatusBadge.style.borderColor = 'rgba(147, 197, 253, 0.4)';
    hzStatusBadge.style.color = '#bfdbfe';
    hzStatusBadge.innerText = `${planetName} заморожена (мерзлота)`;
  }

  const maxBetelgeuseR = 764.0;
  const sunBarPct = Math.max(0.4, Math.min(100, (state.r / maxBetelgeuseR) * 100));
  scaleBarCurrentSun.style.width = `${sunBarPct}%`;
  scaleValCurrentSun.innerText = `${state.r.toFixed(2)} R☉ (${(state.r * 696340).toLocaleString()} км)`;

  const tags = milestonesContainer.querySelectorAll('.milestone-tag');
  tags.forEach(tg => {
    const tt = parseFloat(tg.dataset.time);
    const isNear = S.isDeepTime ? Math.abs(Math.log10(tt / state.t)) < 0.05 : Math.abs(tt - state.t) < 0.08;
    tg.classList.toggle('active', isNear);
  });

  updateHudVisibility();
}

// Подписки на события (выполнялись при загрузке страницы)
export function initHud() {
  if (hudCollapseBtn && hudStack) {
    hudCollapseBtn.addEventListener('click', () => {
      hudStack.dataset.userToggled = "1";
      const isCollapsed = hudStack.classList.toggle('collapsed');
      hudCollapseBtn.innerText = isCollapsed ? '▶' : '▼';
    });
  }

  sidebarToggleBtn.addEventListener('click', () => {
  
  
    sidebar.classList.toggle('mobile-open');
  });

  closeSidebarBtn.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
  });
}

// Подпись кнопки приливов: сила приливов и рассчитанная судьба Земли у текущей звезды
export function updateTideButton() {
  const fate = getPlanetFate('earth');
  const k = S.tideFactor === 1 ? '×1' : (S.tideFactor === 3 ? '×3' : '×0.3');
  let outcome;
  if (fate.type === 'survived') outcome = 'Земля выживает';
  else {
    const t = fate.t >= 1 ? `${fate.t.toFixed(2)} млрд` : `${(fate.t * 1000).toPrecision(3)} млн`;
    outcome = fate.type === 'engulfed' ? `Земля поглощена (${t})` : (fate.type === 'blast' ? `Земля сметена (${t})` : `Земля выброшена (${t})`);
  }
  earthFateBtn.innerText = `Приливы ${k}: ${outcome}`;
}
