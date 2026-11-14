// Вид «Поверхность»: небо, свет и грунт считаются из физики, а не из ручных палитр.
//  • цвет неба — рэлеевское и аэрозольное рассеяние спектра звезды (physics/optics.js);
//  • размер звезды и Луны — их настоящие угловые размеры (поле зрения 70°);
//  • грунт, вода, лёд, растительность, лава и погода — из состояния климата (physics/climate.js);
//  • ночью — звёзды, Млечный Путь и планеты на правильных угловых расстояниях от звезды.
import { STAR_CATALOG } from '../data/catalog.js';
import { getCustomExo } from '../model/exoplanets.js';
import { isPlanetHitByCME, fateText, getPlanetDistanceAU, isPlanetTidallyLocked } from '../physics/orbits.js';
import { calculateBiosphere, calculatePlanetAtmosphere } from '../physics/climate.js';
import { LAMBDA_NM, adaptationLevel, angularRadius, blackbodyRGB, diffuseUnderClouds, directLight, luminance, skyRadiance, surfaceOpticsFor, toDisplay } from '../physics/optics.js';
import { drawSkyGL, drawUpperGL } from '../gl/skyGL.js';
import { LINE_SCALE, airglowBin, auroraColumns, auroraSpectrum, nlcStrength } from '../physics/upperAtmo.js';
import { cieGlarePSF } from '../physics/glare.js';
import { drawCorona } from './corona.js';
import { getAsteroseismicData } from '../model/activity.js';
import { civilization } from './planetBody.js';
import { planetLook } from './planetLook.js';
import { buildSkyParams, skySpectral, spectrumToRGB } from '../physics/skyModel.js';
import { meanMolar } from '../physics/atmoProfile.js';

const adapt = { E: 0, lvl: 0, t: 0 };   // состояние адаптации глаза между кадрами
import { R_MOON_KM, eclipseKind, moonDistanceKm } from '../physics/moon.js';
import { drawEclipsedMoon, drawHalo, drawRainbow, eclipsedMoonColor, lunarShadow } from './opticalFx.js';
import { STARS, STAR_NAMES, CONST_LINES, CONST_NAMES } from '../data/skyCatalog.js';
import { altAz, bvToTemp, dateLabel, eclToEq, effObliquity, galToEq, skyFrame, sunFromStar } from './skyGeometry.js';
import { earthDayHours, rotationHours } from '../physics/rotation.js';
import { airMass, blackbodyCss, surfaceGravity } from '../physics/optics.js';
import { S } from '../state.js';
import { rgb, rgba } from '../util/color.js';

const D2R = Math.PI / 180;
const FOV = 70 * D2R;                 // горизонтальное поле зрения
const REF_LUM = 0.45;                 // яркость неба Земли в полдень (единицы модели) — опора адаптации глаза
const AU_KM = 1.496e8, R_SUN_KM = 695700;

// Альбедо грунта (линейные RGB) и характер рельефа
const BODY = {
  mercury: { rock: [0.13, 0.12, 0.11], relief: 'craters' },
  venus: { rock: [0.14, 0.10, 0.07], relief: 'plains' },
  earth: { rock: [0.20, 0.16, 0.12], relief: 'hills' },
  mars: { rock: [0.40, 0.20, 0.10], relief: 'hills' },
  europa: { rock: [0.62, 0.56, 0.48], relief: 'ice' },
  titan: { rock: [0.10, 0.08, 0.05], relief: 'dunes' },
  pluto: { rock: [0.55, 0.40, 0.30], relief: 'ice' },
  haumea: { rock: [0.75, 0.75, 0.78], relief: 'ice' },
  makemake: { rock: [0.60, 0.36, 0.26], relief: 'ice' },
  eris: { rock: [0.85, 0.86, 0.88], relief: 'ice' },
  uranus: { rock: [0.42, 0.72, 0.78], relief: 'clouds' },
  neptune: { rock: [0.18, 0.32, 0.78], relief: 'clouds' }
};
const EXO_BODY = {
  hot_jupiter: { rock: [0.50, 0.24, 0.10], relief: 'clouds' }, ocean_world: { rock: [0.20, 0.16, 0.12], relief: 'hills' },
  super_earth: { rock: [0.20, 0.16, 0.12], relief: 'hills' }, chthonian: { rock: [0.14, 0.09, 0.07], relief: 'craters' }
};
const SNOW = [0.85, 0.88, 0.92], ICE = [0.55, 0.68, 0.80], VEG = [0.05, 0.13, 0.04], OCEAN = [0.015, 0.04, 0.07], SAND = [0.45, 0.38, 0.27];
// Звёздные величины планет (H, при r = Δ = 1 а.е.) — для видимости на небе
const SKY_PLANETS = { mercury: -0.6, venus: -4.4, earth: -4.0, mars: -1.6, jupiter: -9.4, saturn: -8.9, uranus: -7.2, neptune: -6.9 };
const PLANET_NAMES = { mercury: 'Меркурий', venus: 'Венера', earth: 'Земля', mars: 'Марс', jupiter: 'Юпитер', saturn: 'Сатурн', uranus: 'Уран', neptune: 'Нептун' };
const HOST = { europa: 'jupiter', titan: 'saturn' };
const SEED = { mercury: 0.3, venus: 2.1, earth: 4.0, mars: 5.3, jupiter: 1.2, saturn: 3.3, uranus: 0.7, neptune: 4.6, europa: 1.2, titan: 3.3, pluto: 2.6, haumea: 1.9, makemake: 5.9, eris: 0.1 };

const mix = (a, b, f) => a.map((x, i) => x + (b[i] - x) * f);
const mul = (a, b) => a.map((x, i) => x * b[i]);
const scale = (a, k) => a.map(x => x * k);
const add = (a, b) => a.map((x, i) => x + b[i]);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ---------- рельеф ----------
function ridge(x, k, relief, layer) {
  switch (relief) {
    case 'craters': return Math.sin(x * 0.004 * k + layer) * 20 + Math.abs(Math.sin(x * 0.03 + layer)) * 10;
    case 'plains': return Math.sin(x * 0.003 + layer) * 8 + Math.sin(x * 0.017) * 3;
    case 'ice': return Math.sin(x * 0.006 + layer) * 10 + (Math.sin(x * 0.07 + layer * 3) > 0.85 ? 6 : 0);
    case 'dunes': return Math.abs(Math.sin(x * 0.01 + layer)) * 14 + Math.sin(x * 0.003) * 6;
    case 'clouds': return Math.sin(x * 0.005 + layer) * 6;
    default: return Math.sin(x * 0.004 * k + layer) * 32 + Math.cos(x * 0.011 * k) * 18;
  }
}

function fillLayer(ctx, w, h, y0, amp, relief, layer, color, step = 14) {
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w + step; x += step) ctx.lineTo(x, y0 - ridge(x, 1, relief, layer) * amp);
  ctx.lineTo(w, h); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}

// Холст может быть выше окна (страница прокручивается) — горизонт ставим по видимой части
let visCache = { t: 0, v: 0 };
function visibleHeight(ctx, h) {
  const now = performance.now();
  if (now - visCache.t > 500 && typeof window !== 'undefined') {
    const r = ctx.canvas.getBoundingClientRect();
    visCache = { t: now, v: Math.max(200, Math.min(h, window.innerHeight - Math.max(0, r.top))) };
  }
  return visCache.v || h;
}

// ---------- главная функция ----------
export function drawSurfaceView(ctx, w, h, state, now) {
  const planet = S.currentPlanet;
  const pDistAU = getPlanetDistanceAU(planet, state);
  const so = pDistAU > 0.001 && state.r / 215.0 < pDistAU ? surfaceOpticsFor(planet, state) : null;
  if (!so) {
    ctx.fillStyle = '#0a0202'; ctx.fillRect(0, 0, w, h);
    ctx.font = '15px sans-serif'; ctx.fillStyle = '#f87171'; ctx.textAlign = 'center';
    ctx.fillText(pDistAU <= 0.001 ? `Поверхности больше нет: планета ${fateText(planet)}` : 'Планета внутри фотосферы звезды', w / 2, h / 2);
    ctx.textAlign = 'left';
    return;
  }
  const { climate, optics, surface: surface0 } = so;
  const exo = getCustomExo(planet);
  const body = exo ? (EXO_BODY[exo.type] || BODY.earth) : (BODY[planet] || BODY.earth);
  const pxPerRad = w / FOV;
  const horizonY = Math.min(h, visibleHeight(ctx, h)) * 0.70;

  // 1. Свет звезды: спектр чёрного тела × поток (в единицах солнечной постоянной)
  const F = scale(blackbodyRGB(state.temp), Math.max(1e-12, climate.S) / 1361);
  const locked = isPlanetTidallyLocked(planet, state.t);
  // Небесная сцена: день года (сезон), местное солнечное время, наклон оси планеты
  const frame = skyFrame(S.dayOfYear, S.timeOfDay, effObliquity(planet, exo), locked);
  const hs = frame.sunAlt;
  // Камера смотрит на азимут звезды; по вертикали — от горизонта до зенита (размеры дисков — в настоящем масштабе)
  const vScale = horizonY * 0.94 / (Math.PI / 2);
  const azView = frame.sunAz + (S.lookAway ? Math.PI : 0);   // «спиной к звезде» — смотрим на антисолнечную точку
  const proj = (alt, az) => { let da = az - azView; da = Math.atan2(Math.sin(da), Math.cos(da)); return { x: w / 2 + da * pxPerRad, y: horizonY - alt * vScale }; };
  const projEq = (ra, dec) => { const p = altAz(ra, dec, frame.lst, frame.lat); return { ...proj(p.alt, p.az), alt: p.alt }; };
  const sunP = proj(hs, frame.sunAz);
  const sunX = sunP.x, sunY = sunP.y;
  // Сезон на широте 50°: средняя температура широты ± годовая амплитуда (∝ sin ε; у Земли ±14 °C, максимум в конце июля).
  // Зимой снег ложится и на равнины, листва опадает, водоёмы замерзают
  let surface = surface0, Tloc = null;
  if (climate.atmo.regime === 'wet' && climate.climate === 'warm') {
    const amp = Math.min(30, 14 * Math.sin(frame.eps) / Math.sin(23.44 * D2R));
    Tloc = climate.T - 273.15 - 6 + amp * Math.sin(2 * Math.PI * (S.dayOfYear - 109) / 365.25);
    const snowS = clamp01((1.5 - Tloc) / 6);
    surface = { ...surface0, snow: Math.max(surface0.snow, snowS * 0.9), groundSnow: snowS, vegetation: surface0.vegetation * (0.45 + 0.55 * clamp01((Tloc - 2) / 12)), lakeIce: Tloc < -3,
      weather: surface0.weather === 'rain' && Tloc < 0 ? 'snow' : surface0.weather };
  }
  const sunAngR = angularRadius(state.r * R_SUN_KM, pDistAU * AU_KM);
  const sunR = Math.max(1.6, sunAngR * pxPerRad);

  // 2. Луна и затмение (Земля у Солнца)
  const moon = moonFor(planet, state, now, pDistAU, sunAngR, pxPerRad, sunX, sunY, frame, projEq);
  const sunVisibleFrac = moon ? 1 - moon.cover : 1;

  // 3. Яркости и экспозиция (глаз адаптируется к яркости сцены, но не полностью)
  const Fe = scale(F, sunVisibleFrac);
  // 5.2: эталонная спектральная модель неба (та же, что в шейдере) — для экспозиции и света неба на грунте
  const atmoNow = calculatePlanetAtmosphere(planet, state);
  const Hgas = 8.314 * Math.max(40, climate.T * 0.85) / (meanMolar(atmoNow.mix) / 1000 * 9.81 * surfaceGravity(planet)) / 1000;
  const look = planetLook(planet, state);
  const skyP = optics.kind === 'vacuum' ? null : buildSkyParams(planet, optics, { starT: state.temp, F: Fe, Hgas: Math.max(2, Math.min(80, Hgas)),
    airglow: optics.ozone ? airglowBin() : 0, cityGlow: planet === 'earth' && (look.nightLights || 0) > 0.05 ? 2.5e-6 * look.nightLights : 0 });
  const skyAt = (hh, cosG) => skyP && !optics.cloud ? skySpectral(skyP, hh, hs, cosG, 10) : skyRadiance(Fe, optics, hh, hs, cosG);
  const sky = skyAt;
  const zen = sky(Math.PI / 2, Math.sin(hs));
  const hor = sky(0.02, Math.sin(0.02) * Math.sin(hs));
  const direct = directLight(Fe, optics, hs);
  const under = diffuseUnderClouds(Fe, optics, hs);
  const ambient = under ? scale(under, 1.2) : add(scale(zen, 1.4), scale(hor, 0.6));
  const groundLight = add(scale(direct, Math.max(0, Math.sin(hs))), ambient);
  const groundLum = luminance(groundLight) * 0.3;
  // Полярное сияние: нужна магнитосфера, атмосфера и ночь (или удар выброса корональной массы). Считаем заранее —
  // глаз адаптируется и к нему: сильное сияние — самое яркое в ночном небе
  const aur = auroraState(planet, state, exo, climate, atmoNow, hs, now);
  const nlc = skyP && optics.ozone && planet === 'earth' && climate.atmo.regime === 'wet' && hs < -0.08 && hs > -0.32
    ? nlcStrength(S.dayOfYear, { civilization: civilization(planet, state.t) }) : 0;
  // горизонт под звездой: в сумерках это самая яркая часть неба (сумеречная дуга) — глаз адаптируется к ней
  const horSun = hs < 0.1 && skyP && !optics.cloud ? luminance(sky(0.03, Math.cos(0.03 - hs))) * 0.6 : 0;
  const peak = Math.max(luminance(zen), luminance(hor), horSun, groundLum, aur.on ? aur.lum : 0, 1e-12);
  // экспозиция растёт до уровня ~полнолуния; темнее — кадр гаснет через уровень адаптации lvl
  const E0 = 1.6 / Math.max(peak, 1e-6);
  const lvl0 = adaptationLevel(peak / REF_LUM);
  // глаз привыкает не мгновенно: экспозиция догоняет сцену с постоянной времени ~0.6 с (в темноте — медленнее)
  const dtA = Math.min(1, Math.max(0, (now - adapt.t) / 1000)); adapt.t = now;
  const tauA = E0 > adapt.E ? 1.2 : 0.5;
  const kA = adapt.E ? 1 - Math.exp(-dtA / tauA) : 1;
  adapt.E = adapt.E ? Math.exp(Math.log(adapt.E) + (Math.log(E0) - Math.log(adapt.E)) * kA) : E0;
  adapt.lvl = adapt.lvl ? adapt.lvl + (lvl0 - adapt.lvl) * kA : lvl0;
  if (Math.abs(Math.log(E0 / adapt.E)) > 4) { adapt.E = E0; adapt.lvl = lvl0; }   // резкий скачок (смена планеты) — сразу
  const E = adapt.E, lvl = adapt.lvl;
  // доля «ночного» зрения: от ~10⁻³ яркости дня (конец гражданских сумерек) до ~10⁻⁵ (ночь) цвета гаснут
  const nightVis = clamp01((-Math.log10(Math.max(1e-12, peak / REF_LUM)) - 3) / 2.2);
  // Однократное рассеяние на экране выглядит бледнее, чем глазу: подкрашиваем только рэлеевские небеса
  const SAT = (optics.kind === 'air' || optics.kind === 'ice') ? 1.7 : 1.1;
  const disp = (lin, sat = SAT) => toDisplay(lin, E, sat).map(v => v * lvl);
  const css = (lin, a = 1, sat = SAT) => { const c = disp(lin, sat); return a >= 1 ? rgb(c[0], c[1], c[2]) : rgba(c[0], c[1], c[2], a); };
  const zenDisp = disp(zen);
  const skyBright = luminance(zenDisp.map(v => v / 255)) ;           // 0…1 — для видимости звёзд и планет

  // 4. Небесный свод. 5.0: на GPU — попиксельно (сразу с ореолом звезды и асимметрией заката);
  //    запасной 2D-путь — вертикальный градиент (азимут 90° от звезды) плюс радиальное свечение у звезды
  const cloudT = optics.cloud ? [0, 1, 2].map(i => optics.cloud.w[i] / (1 + 0.75 * optics.cloud.tau * 0.15) * Math.exp(-0.1 * optics.tauR * Math.pow(550 / LAMBDA_NM[i], 4))) : null;
  // облака: кучевые — по погоде (ливни волнами), перистые — временами набегают (тогда же и гало)
  const wxNow = surface.weather;
  const showersK = Math.sin(now * 0.00015);
  const cumulusWx = (wxNow === 'rain' || wxNow === 'snow') ? 0.3 + 0.5 * clamp01((showersK + 0.3) / 1.2) : wxNow === 'blizzard' ? 0.95 : 0;
  // 5.3: кучевые хорошей погоды — разорванные «барашки» набегают и тают у влажных тёплых миров; сквозь просветы
  // между ними идут сумеречные лучи (тени облаков в освещённом воздухе)
  const fairCu = climate.atmo.regime === 'wet' && climate.climate === 'warm' && !optics.cloud ? 0.34 * clamp01((Math.sin(now * 0.00003 + 2.1) + 0.2) * 1.4) : 0;
  const cumulus = Math.max(cumulusWx, fairCu);
  const cirrus = planet === 'earth' && climate.atmo.regime === 'wet' ? clamp01((Math.sin(now * 0.00004 + 1.3) - 0.4) * 4) : 0;
  const ambientSky = add(scale(zen, 1.2), scale(hor, 0.4));
  const skyGL = drawSkyGL(ctx, { w, h, horizonY, vScale, pxPerRad, azView, hs, sunAz: frame.sunAz, P: skyP, overcast: !!optics.cloud, cloudT,
    E, sat: skyP ? (optics.kind === 'air' || optics.kind === 'ice' ? 1.15 : 1.0) : SAT, lvl, night: nightVis, cumulus, cirrus, time: now, ambient: ambientSky, lowQuality: S.lowQuality,
    rays: !optics.cloud && cumulus > 0.05 && cumulus < 0.9 && hs > -0.1 });
  const topElev = horizonY / vScale;
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  for (let k = 0; k <= 7; k++) {
    const f = k / 7, hh = Math.max(0.005, topElev * (1 - f));
    skyGrad.addColorStop(f, css(sky(hh, Math.sin(hh) * Math.sin(hs))));
  }
  // небо заливается на весь кадр: где рельеф опускается ниже линии горизонта, видно продолжение неба, а не прошлый кадр
  if (!skyGL) { ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, h); }

  // 5. Ночное небо: настоящие звёзды (до 5.5ᵐ), созвездия и Млечный Путь вдоль плоскости Галактики.
  //    Предельная звёздная величина зависит от яркости неба; у горизонта звёзды гаснут из-за экстинкции (~0.2ᵐ на воздушную массу)
  const starAlpha = clamp01(1 - skyBright * 5) * (optics.cloud ? 0 : 1);
  if (starAlpha > 0.02) drawNightSky(ctx, w, horizonY, now, projEq, frame, optics, starAlpha, skyBright);

  // 6. Свечение неба вокруг звезды (рассеяние вперёд), закатные цвета берутся из той же модели
  if (!skyGL && !optics.cloud && hs > -0.12 && optics.tauR + (optics.aer ? optics.aer.tau : 0) > 0.003) {
    const base = disp(sky(Math.max(0.01, hs), 0));
    const g = ctx.createRadialGradient(sunX, sunY, sunR, sunX, sunY, pxPerRad * 0.45);
    [[0, 0.5], [0.08, 2], [0.25, 5], [0.55, 12], [1, 26]].forEach(([stop, deg]) => {
      const c = disp(sky(Math.max(0.01, hs), Math.cos(deg * D2R)));
      const ex = c.map((v, i) => Math.max(0, v - base[i]));
      g.addColorStop(stop, rgba(ex[0], ex[1], ex[2], stop === 1 ? 0 : 0.45 * (1 - 0.6 * Math.max(0, Math.sin(hs)))));
    });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, horizonY + 2);
    ctx.restore();
  }

  // 7. Планеты на небе: угловое расстояние от звезды и блеск (звёздная величина) по геометрии орбит
  drawSkyPlanets(ctx, w, h, state, now, planet, pDistAU, horizonY, skyBright, optics, frame, projEq);

  // 8. Верхняя атмосфера (5.3): полярное сияние и серебристые облака — на GPU, излучение линий на своих высотах
  let upperGL = false;
  if (aur.on || nlc > 0) {
    // ПРЕУВЕЛИЧЕНИЕ (честно): сияние в 30 кР и серебристые облака по фотометрии тусклее неба при полной Луне — глаз видит
    // их слабыми и почти бесцветными. Слой верхней атмосферы показан как на фото с выдержкой в пару секунд:
    // экспозиция доходит до 10⁻⁷ (а не 10⁻⁶), уровень кадра — не ниже 0.55, сумеречное обесцвечивание — вдвое слабее
    const Eup = Math.max(E, 1.6 / Math.max(peak, 1e-7));
    upperGL = drawUpperGL(ctx, { w, h, horizonY, vScale, pxPerRad, azView, hs, sunAz: frame.sunAz, P: skyP, E: Eup, sat: 1, lvl: Math.max(lvl, 0.55), night: nightVis * 0.5, time: now, lowQuality: S.lowQuality,
      aurora: aur.on ? ['O557', 'O630', 'N428', 'N2red'].map(k => aur.cols[k] * LINE_SCALE[k]) : [0, 0, 0, 0], auroraN: aur.cme ? 60 : 420, nlc });
    if (!upperGL && aur.on) drawAurora(ctx, w, horizonY, now, aur.oxygen, aur.cme ? 1 : 0.22 * aur.fade);
  }

  // 9. Вторая звезда двойной системы
  let comp = null;
  if (S.isBinarySystem) comp = drawCompanion(ctx, w, now, state, pDistAU, sunX, sunY, horizonY, pxPerRad);

  // 10. Диск звезды: настоящий угловой размер, цвет — спектр после прохождения атмосферы, потемнение к краю
  // Рефракция: у горизонта воздух поднимает изображение звезды на ~0.6° (формула Сэмундссона, ∝ давлению и 1/T),
  // нижний край поднят сильнее верхнего — диск сплюснут. Звезда видна, когда геометрически уже зашла.
  const refrK = optics.kind === 'vacuum' ? 0 : Math.min(3, (climate.atmo.pBar || 0) / 1.013 * 283 / Math.max(50, climate.T));
  const refr = (h) => { const d = h / D2R; return d < -2 ? 0 : refrK * 1.02 / Math.tan((d + 10.3 / (d + 5.11)) * D2R) / 60 * D2R; };
  const hTop = hs + sunAngR + refr(hs + sunAngR), hBot = hs - sunAngR + refr(hs - sunAngR);
  const sunYd = horizonY - (hTop + hBot) / 2 * vScale;
  const sunRy = Math.max(1.2, (hTop - hBot) / 2 * vScale / (vScale / pxPerRad));     // сплюснутость в масштабе диска
  if (!optics.cloud && hTop > -0.002 && sunYd - sunR < horizonY + 4) {
    // Диск звезды ярче всего в кадре: показываем его цвет без пересвета (оттенок прошедшего сквозь атмосферу света),
    // иначе тонкомпрессия уводит любой диск в белое и красный карлик выглядит жёлтым
    const dc = toDisplayDirect(directLight(F, optics, Math.max(0, hs)));
    const core = rgb(dc[0], dc[1], dc[2]);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // 5.3: ореол «в глазу» — функция рассеяния точки CIE 2002 (physics/glare.js): яркость блика на угле θ
    // L = PSF(θ)·E, E — освещённость от диска. Единицы неба — π·L/E (зенит дневного неба: модель 0.16 при табличных
    // ~0.05 ср⁻¹ × π), поэтому блик = π·PSF·прямой свет. Радиус — пока блик заметен на экране (≥ 1/255)
    // Блик складывается с небом в линейной яркости, на экран идёт только прибавка: где небо и так светлое, его не видно
    const hsG = Math.max(0.01, hs);
    drawGlare(ctx, sunX, sunYd, sunR, pxPerRad, (th) => {
      const bg = optics.cloud ? [0, 0, 0] : sky(Math.min(1.5, hsG + th * D2R * 0.5), Math.cos(th * D2R));
      const a = disp(add(bg, scale(direct, Math.PI * cieGlarePSF(th)))), b = disp(bg);
      return a.map((v, i) => Math.max(0, v - b[i]));
    }, [Math.round(hs * 300), Math.round(Math.log(E) * 20), Math.round(lvl * 50), Math.round(sunVisibleFrac * 50), optics.kind].join(','));
    ctx.restore();
    // потемнение к краю заметно, только когда диск большой (на крошечном диске оно рисовало бы ободок)
    const ry = Math.min(sunR, sunRy);
    if (sunR > 14) {
      const limb = ctx.createRadialGradient(sunX, sunYd, 0, sunX, sunYd, sunR);
      limb.addColorStop(0, core); limb.addColorStop(0.7, core); limb.addColorStop(1, rgba(dc[0] * 0.8, dc[1] * 0.62, dc[2] * 0.5, 1));
      ctx.fillStyle = limb;
    } else ctx.fillStyle = core;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, horizonY); ctx.clip();
    ctx.beginPath(); ctx.ellipse(sunX, sunYd, sunR, ry, 0, 0, Math.PI * 2); ctx.fill();
    // зелёный луч: у горизонта атмосфера работает как призма — синий и зелёный образы подняты выше красного;
    // синий рассеян по пути, и последним над горизонтом остаётся зелёный край (на секунду-две)
    if (refrK > 0.3 && hBot < 0 && hTop > 0 && hTop < 0.004 && (!optics.aer || optics.aer.tau < 0.3)) {
      ctx.strokeStyle = 'rgba(120,255,150,0.85)'; ctx.lineWidth = Math.max(1.2, ry * 0.25);
      ctx.beginPath(); ctx.ellipse(sunX, sunYd, sunR, ry, 0, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    }
    ctx.restore();
    // огромный красный гигант: конвективные ячейки на диске видны невооружённым глазом
    if (sunR > 40 && state.temp < 5000) {
      ctx.save(); ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2); ctx.clip();
      // мягкие тёмные межъячеечные области (размер ячеек — как в виде из космоса, ∝ шкале высот фотосферы)
      for (let i = 0; i < 18; i++) {
        const a = i * 2.39996 + now * 0.00002, rr = sunR * Math.sqrt((i + 0.5) / 18);
        const x = sunX + Math.cos(a) * rr, y = sunY + Math.sin(a) * rr, cr = sunR * (0.16 + 0.06 * Math.sin(i * 3.7));
        const g = ctx.createRadialGradient(x, y, 0, x, y, cr);
        g.addColorStop(0, 'rgba(120,50,20,0.16)'); g.addColorStop(1, 'rgba(120,50,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, cr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  // Луна поверх звезды (затмение), корона при полном затмении
  if (moon) drawMoon(ctx, moon, disp, F, optics, sunX, sunY, sunR, horizonY, sunAngR, directLight(F, optics, Math.max(0, hs)), state);

  // 11. Крупные тела в небе спутников
  drawHostPlanet(ctx, w, h, planet, horizonY, lvl, optics);

  // 12. Метеоры при дестабилизации кометных поясов
  drawMeteors(ctx, w, horizonY, now, state, planet, optics);

  // 13. Грунт: альбедо × (прямой свет звезды + рассеянный свет неба), дымка на дальних планах — тем же цветом, что у горизонта
  const horDisp = css(hor);
  const haze = clamp01(1 - Math.exp(-((optics.tauR || 0) + (optics.aer ? optics.aer.tau : 0) + (optics.cloud ? 3 : 0)) * 6));
  const rock = surface.ice >= 1 ? mix(body.rock, ICE, 0.75) : body.rock;
  const hillAlb = mix(mix(mix(rock, VEG, surface.vegetation * 0.8), SNOW, surface.ice >= 1 ? 0.6 : 0), SNOW, (surface.groundSnow || 0) * 0.85);
  const litFar = mul(mix(hillAlb, SNOW, Math.min(1, surface.snow * 0.5)), groundLight);
  // Тепловое свечение грунта: спектр чёрного тела при T поверхности (при ~1000 K — тускло-красное)
  const glowLin = surface.glow > 0 ? scale(blackbodyRGB(climate.T), surface.glow * 0.35) : [0, 0, 0];
  const glowCss = (k) => { const c = toDisplay(glowLin, 1).map(v => v * k); return rgba(c[0], c[1], c[2], 1); };
  const groundCss = (alb, k = 1) => {
    const lit = disp(scale(mul(alb, groundLight), k));
    const gl = toDisplay(glowLin, 1);
    return rgb(lit[0] + gl[0] * 0.8, lit[1] + gl[1] * 0.8, lit[2] + gl[2] * 0.8);
  };

  // дальний план: горы с дымкой, снег на вершинах
  const farCol = disp(litFar), hc = disp(hor);
  const farMix = farCol.map((v, i) => v + (hc[i] - v) * haze * 0.85);
  const gl0 = toDisplay(glowLin, 1);
  fillLayer(ctx, w, h, horizonY, 1, body.relief, 0, rgb(farMix[0] + gl0[0] * 0.5, farMix[1] + gl0[1] * 0.5, farMix[2] + gl0[2] * 0.5), 18);
  if (surface.snow > 0.05 && surface.ice < 1 && body.relief !== 'clouds') {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 18; x += 18) ctx.lineTo(x, horizonY - ridge(x, 1, body.relief, 0));
    ctx.lineTo(w, h); ctx.closePath(); ctx.clip();
    const snowCol = disp(mul(SNOW, groundLight)).map((v, i) => v + (hc[i] - v) * haze * 0.6);
    ctx.fillStyle = rgb(snowCol[0], snowCol[1], snowCol[2]);
    ctx.fillRect(0, 0, w, horizonY - 40 + surface.snow * 55);
    ctx.restore();
  }
  // средний план: холмы (растительность — деревья)
  const midAlb = mix(hillAlb, SNOW, surface.snow * 0.35);
  fillLayer(ctx, w, h, horizonY + 10, 0.5, body.relief, 1.2, groundCss(midAlb, 0.95), 14);
  if (surface.vegetation > 0.15) drawTrees(ctx, w, horizonY, body.relief, Math.max(0.3, surface.vegetation), groundCss(mix(scale(VEG, 0.6), SNOW, (surface.groundSnow || 0) * 0.5), 0.9));

  // передний план: вода, лёд или грунт
  const foreY = horizonY + 26;
  if (surface.ocean > 0 && body.relief !== 'clouds' && !surface.lakeIce) {
    drawOcean(ctx, w, h, foreY, disp, hor, direct, sunX, sunY, hs, now, surface, OCEAN, groundLight, optics);
  } else {
    const foreAlb = surface.ice >= 1 || surface.lakeIce ? mix(ICE, SNOW, Math.max(surface.snow, surface.groundSnow || 0)) : (surface.lava > 0 ? scale(rock, 0.5) : mix(rock, SNOW, (surface.groundSnow || 0) * 0.9));
    fillLayer(ctx, w, h, foreY, 0.25, body.relief, 2.4, groundCss(foreAlb, 0.85), 10);
    if ((surface.ice >= 1 || surface.lakeIce) && body.relief !== 'clouds') drawIceCracks(ctx, w, h, foreY, groundCss(scale(ICE, 0.6), 0.8));
  }
  if (surface.lava > 0 || (exo && exo.type === 'chthonian')) drawLava(ctx, w, h, horizonY, now, Math.max(surface.lava, 0.6));
  if (surface.glow > 0.05) {
    // раскалённый грунт светится сам (без учёта освещения)
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = surface.glow * 0.35;
    ctx.fillStyle = glowCss(1); ctx.fillRect(0, horizonY, w, h - horizonY); ctx.restore();
  }

  // 14. Валуны и их тени: от звезды и (в двойной системе) от компаньона
  if (body.relief !== 'clouds' && (surface.ocean === 0 || surface.lakeIce)) {
    const directFrac = luminance(direct) * Math.max(0, Math.sin(hs)) / Math.max(1e-12, luminance(groundLight));
    drawBoulders(ctx, w, h, sunX, hs, directFrac, comp, groundCss(scale(rock, 0.7), 0.8));
  }

  // 15. Специальные детали миров
  if (planet === 'europa' && climate.climate !== 'thaw') drawGeysers(ctx, horizonY, now, w);
  if (planet === 'titan' && surface.ocean === 0) drawTitanLake(ctx, w, horizonY, disp, hor);
  if (planet === 'uranus') drawUranusRings(ctx, w, horizonY);

  // 16. Погода — из состояния климата
  drawWeather(ctx, w, h, horizonY, now, surface, optics, disp, ambient, climate, skyGL);

  // 16a. Радуги и гало: углы — из показателя преломления капель и кристаллов (см. physics/refraction.js)
  drawOpticalPhenomena(ctx, w, horizonY, now, planet, surface, optics, climate, F, hs, frame, proj, pxPerRad, sunAngR, Tloc, sunX, sunY);

  // 17. Вспышка сверхновой и луч пульсара
  if (state.l > 1e7) { ctx.fillStyle = 'rgba(224, 242, 254, 0.70)'; ctx.fillRect(0, 0, w, h); }
  if (state.r < 0.001 && S.selectedStarMass >= 8 && S.selectedStarMass < 20) drawPulsarBeam(ctx, w, horizonY, now);

  // 18. Подпись: угловые размеры и состояние неба
  drawCaption(ctx, w, h, state, sunAngR, moon, locked, optics, climate, planet, Tloc);
}

// ---------- радуги и гало ----------
// 5.2.2: радуга и гало — это десятки колец и градиентов во весь экран; на телефоне они съедали половину кадра.
// Рисуем их в отдельный холст и перерисовываем, только когда сдвинулась звезда или заметно изменилась яркость дуг
const fxRainbow = { canvas: null, key: '' }, fxHalo = { canvas: null, key: '' };
function cachedFx(ctx, c, op, o, draw) {
  const tr = ctx.getTransform();
  const W = Math.round(ctx.canvas.width), H = Math.round(ctx.canvas.height);
  const key = [W, H, tr.a.toFixed(3), tr.e | 0, tr.f | 0, o.medium, o.w | 0, o.horizonY | 0, o.sunX.toFixed(0), o.sunY.toFixed(0), o.cx.toFixed(0),
    o.sunAlt.toFixed(3), o.sunAngR.toFixed(4), o.pxPerRad.toFixed(1), Math.round(o.alpha * 40)].join('|');
  if (key !== c.key) {
    if (!c.canvas) c.canvas = document.createElement('canvas');
    if (c.canvas.width !== W || c.canvas.height !== H) { c.canvas.width = W; c.canvas.height = H; }
    const x = c.canvas.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H);
    x.setTransform(tr);
    draw(x, { ...o, alpha: Math.round(o.alpha * 40) / 40 });
    c.key = key;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = op;
  ctx.drawImage(c.canvas, 0, 0);
  ctx.restore();
}

function drawOpticalPhenomena(ctx, w, horizonY, now, planet, surface, optics, climate, F, hs, frame, proj, pxPerRad, sunAngR, Tloc, sunX, sunY) {
  // огромный диск красного гиганта (> 10°) размазывает дуги до неузнаваемости
  if (optics.cloud || hs <= 0.005 || sunAngR > 0.09) return;
  const sunLum = luminance(F);
  if (sunLum <= 0) return;
  // доля прямого света звезды у поверхности: в дымке Титана радуга бледная, призрачная
  const directFrac = luminance(directLight(F, optics, hs)) / sunLum;
  const base = { w, horizonY, pxPerRad, sunAngR, sunAlt: hs, sunX, sunY, cx: proj(-hs, frame.sunAz + Math.PI).x };
  // ливень идёт волнами (тот же ритм, что у облаков в drawWeather): радуга — в конце ливня, когда выглянула звезда
  const showers = Math.sin(now * 0.00015);
  const wx = surface.weather;
  if (wx === 'rain' || wx === 'methane') {
    const medium = wx === 'methane' ? 'methane' : 'water';
    const a = clamp01((showers + 0.1) * 3) * clamp01((0.9 - showers) * 4) * Math.min(1, Math.sqrt(directFrac) * 1.25);
    if (a > 0.02) cachedFx(ctx, fxRainbow, 'source-over', { ...base, medium, alpha: a }, drawRainbow);
  }
  // Гало — нужны кристаллы льда в воздухе: перистые облака или «алмазная пыль» в мороз (Земля),
  // кристаллы CO₂ в холодный сезон Марса (угол другой — показатель преломления льда CO₂ больше)
  const season = Math.sin(2 * Math.PI * (S.dayOfYear - 109) / 365.25);
  let halo = null;
  if (planet === 'earth' && optics.kind !== 'vacuum' && ((Tloc !== null && Tloc < 2) || climate.climate === 'snowball')) halo = 'ice';
  else if (planet === 'earth' && Math.sin(now * 0.00004 + 1.3) > 0.55) halo = 'ice';            // перистые облака набегают временами (их рисует шейдер неба)
  else if (planet === 'mars' && climate.atmo.pBar < 0.1 && season < -0.3) halo = 'co2ice';
  if (halo) {
    const a = Math.min(1, directFrac * 1.4) * (halo === 'co2ice' ? 0.7 : 1);
    if (a > 0.03) cachedFx(ctx, fxHalo, 'lighter', { ...base, medium: halo, alpha: a }, drawHalo);
  }
}

// ---------- Луна ----------
function moonFor(planet, state, now, pDistAU, sunAngR, pxPerRad, sunX, sunY, frame, projEq) {
  if (planet !== 'earth' || S.selectedStarId !== 'sun' || S.isDeepTime || state.t < 0.03 || state.t >= 12.12) return null;
  const dKm = moonDistanceKm(state.t);
  const angR = Math.atan(R_MOON_KM / dKm);
  // Элонгация Луны пробегает полный цикл за ~50 с; эклиптическая широта медленно меняется — центральные и частные затмения
  // у новолуния и полнолуния Луна «притормаживает» (в 10 раз), иначе затмение на экране длилось бы доли секунды
  const u = (now * 0.00012 + 2.0) % (2 * Math.PI);
  let psi = u - 0.45 * Math.sin(2 * u); if (psi > Math.PI) psi -= 2 * Math.PI;
  // узлы орбиты «прецессируют»: примерно каждое третье новолуние — центральное затмение
  const beta = 1.4 * (angR + sunAngR) * Math.sin(now * 2 * Math.PI / 160000);
  const eq = eclToEq(frame.lamSun + psi, beta, frame.eps);
  const p = projEq(eq.ra, eq.dec);
  const x = p.x, y = p.y;
  const r = Math.max(2, angR * pxPerRad), rs = Math.max(1.6, sunAngR * pxPerRad);
  // доля закрытого диска звезды (площадь пересечения кругов)
  const d = Math.hypot(x - sunX, y - sunY);
  let cover = 0;
  if (d < r + rs) {
    if (d <= Math.abs(r - rs)) cover = r >= rs ? 1 : (r * r) / (rs * rs);
    else {
      const a1 = r * r * Math.acos((d * d + r * r - rs * rs) / (2 * d * r)), a2 = rs * rs * Math.acos((d * d + rs * rs - r * r) / (2 * d * rs));
      const a3 = 0.5 * Math.sqrt(Math.max(0, (-d + r + rs) * (d + r - rs) * (d - r + rs) * (d + r + rs)));
      cover = (a1 + a2 - a3) / (Math.PI * rs * rs);
    }
  }
  // Тень Земли на расстоянии Луны: умбра = π☾ + π☉ − ρ☉, полутень = π☾ + π☉ + ρ☉ (+2 % — атмосфера Земли, правило Шово)
  const pM = 6371 / dKm, pS = 6371 / (pDistAU * AU_KM);
  const umbraR = 1.02 * (pM + pS - sunAngR), penR = 1.02 * (pM + pS + sunAngR);
  const sep = Math.acos(Math.max(-1, Math.min(1, -Math.cos(beta) * Math.cos(psi))));
  const sh = lunarShadow(sep, angR, umbraR, penR);
  let shadow = null;
  if (sh.penumbra > 0) {
    const aEq = eclToEq(frame.lamSun + Math.PI, 0, frame.eps), ap = projEq(aEq.ra, aEq.dec);
    const dx = ap.x - x, dy = ap.y - y, dl = Math.hypot(dx, dy) || 1;
    // направление — по проекции, расстояние — в истинном угловом масштабе (кадр растянут по вертикали иначе, чем по горизонтали)
    shadow = { dx: dx / dl * sep / angR, dy: dy / dl * sep / angR, uR: umbraR / angR, pR: penR / angR, ...sh };
  }
  return { x, y, r, psi, cover: Math.min(0.999, cover), total: cover > 0.995 && r >= rs, angR, kind: eclipseKind(state.t, state.r, pDistAU), shadow };
}

function drawMoon(ctx, m, disp, F, optics, sunX, sunY, sunR, horizonY, sunAngR, Fdir, state) {
  if (m.y - m.r > horizonY) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, ctx.canvas.width, horizonY); ctx.clip();
  // Тёмная сторона — едва подсвечена пепельным светом Земли
  ctx.fillStyle = m.cover > 0 ? 'rgb(6,6,10)' : 'rgba(40,44,56,0.35)';
  ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
  // Освещённая часть: фаза по элонгации, терминатор — эллипс
  const lit = (1 - Math.cos(m.psi)) / 2;
  if (lit > 0.01 && m.cover === 0) {
    const c = disp(scale(F, 0.12 * 0.45));
    const col = rgb(Math.max(c[0], 150), Math.max(c[1], 150), Math.max(c[2], 145));
    const dir = Math.sign(sunX - m.x) || 1;     // освещён край, обращённый к звезде
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, -Math.PI / 2, Math.PI / 2, dir < 0);
    ctx.ellipse(m.x, m.y, Math.abs(Math.cos(m.psi)) * m.r, m.r, 0, Math.PI / 2, -Math.PI / 2, (lit > 0.5) === (dir < 0));
    ctx.fill();
    // моря
    ctx.fillStyle = 'rgba(90,95,110,0.25)';
    ctx.beginPath(); ctx.arc(m.x - m.r * 0.25, m.y - m.r * 0.2, m.r * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // Лунное затмение: настоящий диск крошечный (0.5°), поэтому рядом — «лупа» с увеличенной Луной
  if (m.shadow && m.cover === 0 && m.y < horizonY) {
    const sh = { ...m.shadow, color: eclipsedMoonColor(directLight([1, 1, 1], optics.kind === 'vacuum' ? { tauR: 0.097, aer: null } : optics, 0)) };
    const c = disp(scale(F, 0.12 * 0.45));
    const col = rgb(Math.max(c[0], 150), Math.max(c[1], 150), Math.max(c[2], 145));
    drawEclipsedMoon(ctx, m.x, m.y, m.r, sh, col);
    const R = 46, W = ctx.canvas.clientWidth || ctx.canvas.width;
    const ix = Math.min(W - R - 12, Math.max(R + 12, m.x + 90)), iy = Math.max(R + 60, m.y - 80);
    ctx.save();
    ctx.strokeStyle = 'rgba(148,163,184,0.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(ix, iy); ctx.stroke();
    ctx.fillStyle = 'rgba(2,6,23,0.85)'; ctx.beginPath(); ctx.arc(ix, iy, R + 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    drawEclipsedMoon(ctx, ix, iy, R, sh, col);
    ctx.save(); ctx.font = '10px sans-serif'; ctx.fillStyle = '#cbd5e1'; ctx.textAlign = 'center';
    ctx.fillText(sh.umbra >= 0.999 ? 'Полное лунное затмение' : sh.umbra > 0 ? 'Частное лунное затмение' : 'Полутеневое затмение', ix, iy + R + 18);
    ctx.fillText(`увеличение ×${Math.round(R / m.r)}`, ix, iy + R + 30);
    ctx.restore();
  }
  // Полное затмение: солнечная корона и протуберанцы
  if (m.total && sunAngR > 0) {
    // 5.3: корона по Баумбаху, форма — по фазе цикла активности; яркость диска в единицах неба (π·L/E) — π/Ω
    const omega = Math.PI * sunAngR * sunAngR;
    const act = getAsteroseismicData(state).activityLevel ?? 0.5;
    const e0 = disp(scale(Fdir, Math.PI / omega * 1e-6));
    drawCorona(ctx, sunX, sunY, sunR, act, (k) => disp(scale(Fdir, Math.PI / omega * k)), e0.map(v => Math.round(v / 8)).join(','));
  } else if (m.total) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sunX, sunY, sunR, sunX, sunY, sunR * 4);
    g.addColorStop(0, 'rgba(240,245,255,0.9)'); g.addColorStop(0.3, 'rgba(200,215,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,80,90,0.8)';
    for (const a of [0.6, 2.4, 4.1]) { ctx.beginPath(); ctx.arc(sunX + Math.cos(a) * sunR, sunY + Math.sin(a) * sunR, Math.max(1, sunR * 0.08), 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  } else if (m.cover > 0.5 && m.r < sunR) {
    // кольцеобразное затмение: огненное кольцо
    ctx.save(); ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = Math.max(1, sunR - m.r);
    ctx.beginPath(); ctx.arc(sunX, sunY, (sunR + m.r) / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

// ---------- планеты на небе ----------
function drawSkyPlanets(ctx, w, h, state, now, observer, aObs, horizonY, skyBright, optics, frame, projEq) {
  if (optics.cloud) return;
  const limit = 6.5 - 12 * skyBright;                 // предельная звёздная величина: днём видна только Венера
  const phiObs = now * 1e-4 / Math.pow(Math.max(0.05, aObs), 1.5) + (SEED[observer] || 0);
  const ox = aObs * Math.cos(phiObs), oy = aObs * Math.sin(phiObs);
  ctx.save(); ctx.font = '10px sans-serif';
  for (const [p, H] of Object.entries(SKY_PLANETS)) {
    if (p === observer || p === HOST[observer]) continue;
    const a = getPlanetDistanceAU(p, state);
    if (a <= 0.001 || state.r / 215 >= a) continue;
    const phi = now * 1e-4 / Math.pow(a, 1.5) + SEED[p];
    const px = a * Math.cos(phi) - ox, py = a * Math.sin(phi) - oy;
    const delta = Math.hypot(px, py);
    // элонгация: угол между направлениями на звезду (−obs) и на планету; планета лежит на эклиптике
    const cosE = (-ox * px - oy * py) / (aObs * delta);
    const elong = Math.acos(Math.max(-1, Math.min(1, cosE))) * Math.sign(ox * py - oy * px || 1);
    const cosAlpha = ((px + ox) * px + (py + oy) * py) / (a * delta);   // фазовый угол (звезда — планета — наблюдатель)
    const q = Math.max(0.02, (1 + cosAlpha) / 2);
    const mag = H + 5 * Math.log10(a * delta) - 2.5 * Math.log10(q) - 2.5 * Math.log10(Math.max(1e-6, state.l)) + 0.2 * (optics.tauR > 0.01 ? 1 : 0);
    if (mag > limit) continue;
    const eq = eclToEq(frame.lamSun + elong, 0, frame.eps);
    const pos = projEq(eq.ra, eq.dec);
    if (pos.alt < 0 || pos.x < 0 || pos.x > w) continue;
    const rr = Math.max(0.8, Math.min(3.5, 2.2 - 0.35 * mag));
    ctx.fillStyle = `rgba(255,250,235,${clamp01((limit - mag) / 2).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, rr, 0, Math.PI * 2); ctx.fill();
    if (limit - mag > 1) { ctx.fillStyle = 'rgba(226,232,240,0.55)'; ctx.fillText(PLANET_NAMES[p], pos.x + 5, pos.y - 4); }
  }
  ctx.restore();
}

// ---------- ночное небо ----------
function drawNightSky(ctx, w, horizonY, now, projEq, frame, optics, starAlpha, skyBright) {
  const atm = optics.tauR > 0.01;
  const limit = 6.0 - 11 * skyBright;
  const kExt = atm ? 0.2 * Math.min(4, optics.tauR / 0.097) : 0;
  ctx.save();
  // Млечный Путь: полоса вдоль плоскости Галактики, ярче к центру (Стрелец, l = 0°)
  ctx.globalCompositeOperation = 'lighter';
  const step = S.lowQuality ? 8 : 4;
  for (let l = 0; l < 360; l += step) {
    const lr = l * D2R, eq = galToEq(lr, 0), p = projEq(eq.ra, eq.dec);
    if (p.alt < -0.1 || p.x < -150 || p.x > w + 150) continue;
    const bright = 0.35 + 0.65 * Math.pow(Math.cos(lr / 2), 4);
    const rad = (60 + 50 * bright) * (horizonY / 500);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad);
    const a = 0.06 * bright * starAlpha * (atm ? clamp01(p.alt / 0.35) : 1);
    g.addColorStop(0, `rgba(225,215,200,${a.toFixed(3)})`); g.addColorStop(1, 'rgba(225,215,200,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
  }
  // Созвездия
  if (S.showConstellations) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(147,197,253,${(0.28 * starAlpha).toFixed(2)})`; ctx.lineWidth = 0.8;
    for (const lines of Object.values(CONST_LINES)) {
      for (const line of lines) {
        ctx.beginPath(); let pen = false, prev = null;
        for (const [ra, dec] of line) {
          const p = projEq(ra * D2R, dec * D2R);
          const ok = p.alt > 0 && (!prev || Math.abs(p.x - prev.x) < w * 0.6);
          if (ok && pen) ctx.lineTo(p.x, p.y); else if (ok) { ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
          prev = p;
        }
        ctx.stroke();
      }
    }
    ctx.font = '10px sans-serif'; ctx.fillStyle = `rgba(147,197,253,${(0.55 * starAlpha).toFixed(2)})`;
    for (const [name, ra, dec] of CONST_NAMES) {
      const p = projEq(ra * D2R, dec * D2R);
      if (p.alt > 0.05 && p.x > 0 && p.x < w) ctx.fillText(name, p.x, p.y);
    }
  }
  // Звёзды: цвет по B−V (чёрное тело), размер и яркость по звёздной величине, мерцание в атмосфере
  ctx.globalCompositeOperation = 'lighter';
  const host = sunFromStar(S.selectedStarId);
  for (let i = 0; i < STARS.length; i += 4) {
    const ra = STARS[i] * D2R, dec = STARS[i + 1] * D2R;
    let mag = STARS[i + 2];
    if (host && mag < 3 && Math.abs(dec - host.hostDec) < 0.01 && Math.abs(Math.cos(ra - host.hostRa) - 1) < 1e-4) continue;   // мы у этой звезды
    const p = projEq(ra, dec);
    if (p.alt < 0 || p.x < -2 || p.x > w + 2) continue;
    if (kExt) mag += kExt * airMass(p.alt);
    if (mag > limit) continue;
    const vis = clamp01((limit - mag) / 2.5);
    const tw = atm ? 0.75 + 0.25 * Math.sin(now * 0.005 + i * 1.7) : 1;
    const c = blackbodyCss(bvToTemp(STARS[i + 3])).map(v => 160 + v * 0.37);
    const rr = Math.max(0.55, 2.3 - 0.38 * mag);
    ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(vis * starAlpha * tw).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
    if (STAR_NAMES[i / 4] && vis > 0.6 && S.showConstellations) { ctx.fillStyle = `rgba(226,232,240,${(0.6 * starAlpha).toFixed(2)})`; ctx.font = '10px sans-serif'; ctx.fillText(STAR_NAMES[i / 4], p.x + 4, p.y - 3); }
  }
  // Солнце как звезда, если мы у другой звезды каталога
  if (host) {
    const p = projEq(host.ra, host.dec);
    if (p.alt > 0 && host.mag < limit) {
      const rr = Math.max(0.8, 2.3 - 0.38 * host.mag);
      ctx.fillStyle = `rgba(255,244,234,${(clamp01((limit - host.mag) / 2.5) * starAlpha).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(253,224,71,${(0.8 * starAlpha).toFixed(2)})`; ctx.font = '11px sans-serif';
      ctx.fillText(`Солнце (${host.mag.toFixed(1)}ᵐ)`, p.x + 5, p.y - 4);
    }
  }
  ctx.restore();
}

// ---------- сияния, компаньон, хозяин-гигант, метеоры ----------
// ---------- полярное сияние ----------
function auroraState(planet, state, exo, climate, atmoNow, hs, now) {
  const cme = isPlanetHitByCME(planet, state);
  const hasField = (planet === 'earth' && state.t < 11.5) || (planet === 'mars' && state.t < 0.6) || (exo && exo.type !== 'chthonian') || planet === 'uranus' || planet === 'neptune';
  // на широте 50° полярные сияния бывают только в магнитные бури — они приходят редко и длятся недолго;
  // видны в темноте — когда звезда ниже ~10° под горизонтом
  const storm = Math.sin(now * 0.000021 + 0.7);
  const dark = clamp01((-hs - 0.17) / 0.1);
  const on = hasField && climate.atmo.pBar > 0.05 && (cme || (S.isAurorasOn && dark > 0 && storm > 0.8));
  if (!on) return { on: false };
  const o2 = planet === 'earth' ? calculateBiosphere(state.t).o2 : 0;
  const mixA = atmoNow.mix || {};
  // атомарный кислород верхней атмосферы — из O₂ и из CO₂ (зелёная линия есть и на Марсе)
  const oxygen = o2 > 1 || (mixA.O2 || 0) > 0.01 || (mixA.CO2 || 0) > 0.05;
  // буря на средних широтах — ~30 кР у северного горизонта (как в мае 2024 г.); удар выброса — ~100 кР над головой
  const fade = cme ? 1 : clamp01((storm - 0.8) * 8) * dark;
  const cols0 = auroraColumns(cme ? 1 : 0.27, { oxygen, storm: true });
  const cols = Object.fromEntries(Object.entries(cols0).map(([k, v]) => [k, v * fade]));
  // яркость для адаптации глаза: столб × ~3 (наклонный луч сквозь занавес)
  const lum = luminance(spectrumToRGB(auroraSpectrum(cols))) * 3;
  return { on: true, cme, oxygen, cols, fade, lum };
}

// ---------- блик в глазу (CIE 2002) ----------
const glareCache = { canvas: null, key: '' };
function drawGlare(ctx, x, y, sunR, pxPerRad, incAt, sceneKey) {
  const th0 = Math.max(0.1, sunR / pxPerRad * 180 / Math.PI);
  const key = [Math.round(sunR), Math.round(pxPerRad), sceneKey].join('|');
  if (key !== glareCache.key) {
    // радиус: где прибавка блика падает ниже 1/255 экрана (не больше 25°); опорные точки — по логарифму угла
    let thMax = th0 * 1.5;
    while (thMax < 25 && Math.max(...incAt(thMax)) > 1) thMax *= 1.3;
    const R = Math.max(sunR * 1.5, thMax * Math.PI / 180 * pxPerRad);
    const N = Math.max(8, Math.min(512, Math.ceil(2 * R)));
    if (!glareCache.canvas) glareCache.canvas = document.createElement('canvas');
    const c = glareCache.canvas; c.width = c.height = N;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    const r0 = Math.min(0.99, th0 / thMax);
    grad.addColorStop(0, rgb(...incAt(th0).map(v => Math.min(255, v))));
    for (let i = 0; i <= 10; i++) {
      const th = th0 * Math.pow(thMax / th0, i / 10);
      const col = i === 10 ? [0, 0, 0] : incAt(th);
      grad.addColorStop(Math.max(r0, Math.min(1, th / thMax)), rgb(Math.min(255, col[0]), Math.min(255, col[1]), Math.min(255, col[2])));
    }
    g.fillStyle = grad; g.fillRect(0, 0, N, N);
    glareCache.key = key; glareCache.N = N; glareCache.R = R;
  }
  const R = glareCache.R;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glareCache.canvas, 0, 0, glareCache.N, glareCache.N, x - R, y - R, 2 * R, 2 * R);
  ctx.restore();
}

function drawAurora(ctx, w, horizonY, now, oxygen, strength) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const wave = now * 0.0018;
  // кислород светит зелёным (557.7 нм) и красным (630 нм) на высоте, азот — синим и фиолетовым
  const low = oxygen ? [52, 211, 153] : [129, 140, 248], high = oxygen ? [239, 68, 68] : [168, 85, 247];
  // Занавеси из вертикальных лучей: резкий нижний край (зелёный, ~100 км), вверх — красное свечение (~250 км)
  for (let c = 0; c < 2; c++) {
    const y0 = horizonY * (0.35 + c * 0.17);
    const top = y0 - 140, g = ctx.createLinearGradient(0, top, 0, y0 + 30);
    g.addColorStop(0, rgba(high[0], high[1], high[2], 0)); g.addColorStop(0.45, rgba(high[0], high[1], high[2], 0.18 * strength));
    g.addColorStop(0.82, rgba(low[0], low[1], low[2], 0.55 * strength)); g.addColorStop(1, rgba(low[0], low[1], low[2], 0));
    ctx.fillStyle = g;
    for (let x = 0; x <= w; x += S.lowQuality ? 6 : 3) {
      const yb = y0 + Math.sin(x * 0.006 + wave + c * 1.5) * 26 + Math.cos(x * 0.017 - wave * 0.7) * 10;
      const ray = 0.45 + 0.55 * Math.abs(Math.sin(x * 0.11 + c * 7 + Math.sin(wave * 2 + x * 0.003) * 3));
      ctx.globalAlpha = ray;
      ctx.fillRect(x, top, 2.2, yb - top);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawCompanion(ctx, w, now, state, pDistAU, sunX, sunY, horizonY, pxPerRad) {
  const m1 = Math.max(0.1, state.mass), m2 = S.binaryCompanion.mass + S.binaryCompanion.accretedMass;
  const ang = now * Math.sqrt((m1 + m2) / Math.pow(S.binaryCompanion.rAU, 3)) * 0.0006;
  const sep = Math.atan(S.binaryCompanion.rAU / Math.max(0.3, pDistAU));
  const x = sunX + Math.cos(ang) * sep * pxPerRad, y = sunY + Math.sin(ang) * sep * pxPerRad * 0.55;
  const elev = (horizonY - y) / pxPerRad;
  if (y < horizonY + 25) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const df = Math.min(1, 1 / Math.max(0.9, pDistAU)), gr = Math.max(2, 16 * Math.pow(df, 0.7));
    const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(186,230,253,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  return { x, elev };
}

function drawHostPlanet(ctx, w, h, planet, horizonY, lvl, optics) {
  // планету-хозяйку видно сквозь атмосферу спутника, только если дымка пропускает свет: e^(−τ·m)
  const tauV = (optics.tauR || 0) + (optics.aer ? optics.aer.tau : 0) + (optics.cloud ? optics.cloud.tau : 0);
  const trans = Math.exp(-tauV * airMass(0.6));
  if (trans < 0.01) return;
  if (planet === 'europa') {
    ctx.save(); ctx.globalAlpha = Math.max(0.35, lvl) * trans;
    const x = w * 0.78, y = horizonY * 0.38, r = Math.min(w, h) * 0.16;   // Юпитер с Европы — 12° на небе
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.2, r * 0.1, x, y, r);
    g.addColorStop(0, '#fed7aa'); g.addColorStop(0.45, '#d97706'); g.addColorStop(0.75, '#78350f'); g.addColorStop(1, 'rgba(10,12,22,0.95)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.clip();
    ctx.fillStyle = 'rgba(120,53,15,0.38)';
    ctx.fillRect(x - r, y - r * 0.35, r * 2, r * 0.16); ctx.fillRect(x - r, y + r * 0.12, r * 2, r * 0.14);
    ctx.fillStyle = 'rgba(190,60,40,0.6)'; ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.3, r * 0.14, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (planet === 'titan') {
    ctx.save(); ctx.globalAlpha = Math.min(1, trans * 1.5) * Math.max(0.4, lvl);     // сквозь дымку толинов (τ ≈ 3.5) Сатурн не виден — как и на снимках «Гюйгенса»
    const x = w * 0.76, y = horizonY * 0.36, r = Math.min(w, h) * 0.11;
    ctx.strokeStyle = 'rgba(253,224,71,0.42)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(x, y, r * 2.2, r * 0.55, -0.25, 0, Math.PI * 2); ctx.stroke();
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.2, r * 0.1, x, y, r);
    g.addColorStop(0, '#fef08a'); g.addColorStop(0.6, '#ca8a04'); g.addColorStop(1, 'rgba(30,20,10,0.9)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else if (planet === 'earth' && S.selectedStarId === 'sun' && !S.isDeepTime && S.currentDynamicStages && getActiveT() >= 12.12) {
    // кольцо обломков разорванной Луны
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(226,232,240,0.38)'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.arc(w * 0.5, horizonY + h * 0.25, Math.min(w, h) * 0.72, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    ctx.strokeStyle = 'rgba(254,215,170,0.25)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
  }
}
const getActiveT = () => S.currentAge;

function drawMeteors(ctx, w, horizonY, now, state, planet, optics) {
  if (optics.cloud || !((state.r > 8 && state.r < 350) || state.t < 0.02)) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let m = 0; m < 4; m++) {
    const ph = (now * 0.0007 + m * 0.27) % 1;
    if (ph >= 0.35) continue;
    const pr = ph / 0.35;
    const x = ((m * 217) % Math.max(100, w * 0.8)) + w * 0.1 + pr * 140, y = ((m * 89) % Math.max(40, horizonY * 0.35)) + pr * 95;
    const g = ctx.createLinearGradient(x - 35, y - 24, x, y);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(186,230,253,${(1 - pr).toFixed(2)})`);
    ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 35, y - 24); ctx.lineTo(x, y); ctx.stroke();
  }
  ctx.restore();
}

// ---------- грунт: вода, лёд, лава, деревья, валуны ----------
function drawOcean(ctx, w, h, y0, disp, hor, direct, sunX, sunY, hs, now, surface, OCEAN_ALB, groundLight, optics) {
  // Вода отражает небо у горизонта (френелевское отражение при скользящем взгляде) и почти чёрна в глубину
  const reflTop = disp(scale(hor, 0.75)), deep = disp(mul(OCEAN_ALB, groundLight));
  const g = ctx.createLinearGradient(0, y0, 0, h);
  g.addColorStop(0, rgb(reflTop[0], reflTop[1], reflTop[2]));
  g.addColorStop(1, rgb(deep[0] + reflTop[0] * 0.15, deep[1] + reflTop[1] * 0.15, deep[2] + reflTop[2] * 0.15));
  ctx.fillStyle = g; ctx.fillRect(0, y0, w, h - y0);
  // береговая полоса
  const sand = disp(mul(SAND, groundLight));
  ctx.fillStyle = rgb(sand[0], sand[1], sand[2]);
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 12) ctx.lineTo(x, h - 26 - Math.sin(x * 0.01) * 8);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  // солнечная дорожка
  if (hs > 0 && !optics.cloud) {
    const dc = toDisplayDirect(direct);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let y = y0 + 2; y < h - 30; y += 4) {
      const spread = 6 + (y - y0) * 0.6 * (1 - Math.min(0.8, hs));
      const shimmer = Math.sin(y * 0.4 + now * 0.008) * 10;
      ctx.fillStyle = rgba(dc[0], dc[1], dc[2], 0.55 * (1 - (y - y0) / (h - y0)));
      ctx.fillRect(sunX - spread / 2 + shimmer, y, spread, 2);
    }
    ctx.restore();
  }
  // пар над кипящим океаном
  if (surface.steam > 0) {
    ctx.save();
    for (let i = 0; i < 14; i++) {
      const sx = (i * 97 + Math.sin(now * 0.001 + i) * 30) % w, sy = y0 + 10 - ((now * 0.04 + i * 25) % 160);
      const a = Math.max(0, 1 - (y0 + 10 - sy) / 160) * 0.3 * surface.steam;
      const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, 40);
      sg.addColorStop(0, `rgba(235,235,240,${a.toFixed(3)})`); sg.addColorStop(1, 'rgba(235,235,240,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 40, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}
const toDisplayDirect = (direct) => { const m = Math.max(...direct, 1e-12); return direct.map(v => { const x = v / m; return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055); }); };

function drawTrees(ctx, w, horizonY, relief, veg, color) {
  ctx.fillStyle = color;
  const n = Math.round(30 * veg);
  for (let i = 0; i < n; i++) {
    const x = (i * 137.5) % w, y = horizonY + 10 - ridge(x, 1, relief, 1.2) * 0.5 + 2;
    const s = 5 + (i % 4) * 2;
    ctx.beginPath(); ctx.moveTo(x, y - s * 1.8); ctx.lineTo(x - s * 0.6, y); ctx.lineTo(x + s * 0.6, y); ctx.closePath(); ctx.fill();
  }
}

function drawIceCracks(ctx, w, h, y0, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const x = (i * 211) % w;
    ctx.beginPath(); ctx.moveTo(x, y0 + 8);
    ctx.lineTo(x + 30 - (i % 3) * 25, y0 + 40); ctx.lineTo(x + 10 + (i % 2) * 40, h); ctx.stroke();
  }
  ctx.restore();
}

function drawLava(ctx, w, h, horizonY, now, k) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const pulse = 0.85 + Math.sin(now * 0.003) * 0.15;
  ctx.strokeStyle = `rgba(255,69,0,${(0.85 * pulse * k).toFixed(2)})`; ctx.shadowColor = '#ff2200'; ctx.shadowBlur = 14; ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.18, horizonY + 28); ctx.quadraticCurveTo(w * 0.35, horizonY + 65, w * 0.22, horizonY + 95); ctx.lineTo(w * 0.38, h);
  ctx.moveTo(w * 0.72, horizonY + 32); ctx.quadraticCurveTo(w * 0.58, horizonY + 70, w * 0.78, h);
  ctx.stroke(); ctx.strokeStyle = '#fff7ed'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

function drawBoulders(ctx, w, h, sunX, hs, directFrac, comp, color) {
  const rocks = [[0.27, 26, 34], [0.70, 18, 24]];
  for (const [fx, bw, bh] of rocks) {
    const x = w * fx, y = h - 34;
    // тени: длина = высота / tg(высоты звезды), направление — от источника
    const lights = [];
    if (hs > 0.01 && directFrac > 0.05) lights.push({ x: sunX, elev: hs, a: 0.5 * Math.min(1, directFrac * 1.4) });
    if (comp && comp.elev > 0.01) lights.push({ x: comp.x, elev: comp.elev, a: 0.25 });
    for (const L of lights) {
      const len = Math.min(w * 0.35, bh / Math.tan(L.elev) * 0.6);
      const dir = x >= L.x ? 1 : -1;
      ctx.fillStyle = `rgba(0,0,0,${L.a.toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(x - bw * 0.45, y + 2); ctx.lineTo(x + bw * 0.45, y + 2);
      ctx.lineTo(x + dir * len + bw * 0.3 * dir, y + 10); ctx.lineTo(x + dir * len - bw * 0.2 * dir, y + 14); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x - bw / 2, y + 4); ctx.quadraticCurveTo(x - bw * 0.55, y - bh * 0.7, x - bw * 0.1, y - bh);
    ctx.quadraticCurveTo(x + bw * 0.5, y - bh * 0.8, x + bw / 2, y + 4); ctx.closePath(); ctx.fill();
  }
}

function drawGeysers(ctx, horizonY, now, w) {
  for (const gx of [w * 0.24, w * 0.68]) {
    const ph = 65 + Math.sin(now * 0.003 + gx) * 22;
    const g = ctx.createLinearGradient(gx, horizonY + 15, gx, horizonY - ph);
    g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(0.5, 'rgba(186,230,253,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(gx - 5, horizonY + 15); ctx.lineTo(gx + 5, horizonY + 15);
    ctx.quadraticCurveTo(gx + 24, horizonY - ph * 0.7, gx + 15, horizonY - ph); ctx.quadraticCurveTo(gx, horizonY - ph - 8, gx - 15, horizonY - ph);
    ctx.quadraticCurveTo(gx - 24, horizonY - ph * 0.7, gx - 5, horizonY + 15); ctx.fill();
  }
}

function drawTitanLake(ctx, w, horizonY, disp, hor) {
  // Метановое озеро отражает оранжевое небо
  const c = disp(scale(hor, 0.4));
  const g = ctx.createLinearGradient(0, horizonY + 38, 0, horizonY + 80);
  g.addColorStop(0, rgba(c[0], c[1], c[2], 0.95)); g.addColorStop(1, 'rgba(8,10,16,0.9)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(w * 0.45, horizonY + 58, w * 0.36, 18, 0, 0, Math.PI * 2); ctx.fill();
}

function drawUranusRings(ctx, w, horizonY) {
  ctx.save(); ctx.strokeStyle = 'rgba(224,242,254,0.5)'; ctx.lineWidth = 4; ctx.shadowColor = '#bae6fd'; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(w * 0.48, 0); ctx.quadraticCurveTo(w * 0.52, horizonY * 0.5, w * 0.5, horizonY + 20); ctx.stroke();
  ctx.restore();
}

function drawPulsarBeam(ctx, w, horizonY, now) {
  const ph = Math.sin(now * 0.012);
  if (ph <= 0.82) return;
  const k = (ph - 0.82) / 0.18;
  const g = ctx.createLinearGradient(0, 0, w, horizonY);
  g.addColorStop(0, `rgba(56,189,248,${(k * 0.55).toFixed(2)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.1, horizonY); ctx.lineTo(w * 0.9, horizonY); ctx.closePath(); ctx.fill();
}

// ---------- погода ----------
function drawWeather(ctx, w, h, horizonY, now, surface, optics, disp, ambient, climate, cloudsOnGPU) {
  const wx = surface.weather;
  // облака кучевые над тёплым влажным миром; ливень идёт не всё время
  if ((wx === 'rain' || wx === 'snow') && luminance(disp(ambient).map(v => v / 255)) > 0.04) {
    const cloudC = disp(scale(ambient, 0.9));
    const showers = Math.sin(now * 0.00015) > 0.2;
    ctx.save();
    // на GPU облака — объёмный слой в шейдере неба; кружочки рисуются только в 2D-режиме
    for (let i = 0; i < (cloudsOnGPU ? 0 : 5); i++) {
      const cx = ((i * 260 + now * 0.012) % (w + 300)) - 150, cy = horizonY * (0.18 + (i % 3) * 0.1);
      ctx.fillStyle = rgba(cloudC[0], cloudC[1], cloudC[2], showers ? 0.85 : 0.6);
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(cx + k * 22 - 44, cy - Math.sin(k) * 12, 18 + (k % 2) * 10, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
    if (!showers) return;
  }
  // осадки видно, только когда на них падает свет
  if (luminance(disp(ambient).map(v => v / 255)) < 0.04 && wx !== 'ash') return;
  ctx.save();
  if (wx === 'rain' || wx === 'methane') {
    ctx.strokeStyle = wx === 'methane' ? 'rgba(251,191,36,0.22)' : 'rgba(186,230,253,0.28)'; ctx.lineWidth = 1.1;
    const n = wx === 'methane' ? 28 : 46, speed = wx === 'methane' ? 0.08 : 0.5;   // на Титане капли падают в 6 раз медленнее
    for (let i = 0; i < n; i++) {
      const x = (i * 61 + now * 0.08) % w, y = (i * 53 + now * speed) % h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + (wx === 'methane' ? 8 : 15)); ctx.stroke();
    }
  } else if (wx === 'snow' || wx === 'cryo') {
    ctx.fillStyle = 'rgba(240,248,255,0.6)';
    for (let i = 0; i < 40; i++) { const x = (i * 67 + Math.sin(now * 0.001 + i) * 18) % w, y = (i * 43 + now * 0.04) % h; ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill(); }
  } else if (wx === 'blizzard') {
    ctx.fillStyle = 'rgba(235,242,250,0.12)'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(240,248,255,0.5)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) { const x = (i * 89 + now * 0.35) % (w + 40) - 20, y = (i * 37 + now * 0.08) % h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 4); ctx.stroke(); }
  } else if (wx === 'steam') {
    const c = disp(scale(ambient, 1.1));
    ctx.fillStyle = rgba(c[0], c[1], c[2], 0.25); ctx.fillRect(0, horizonY * 0.5, w, h);
  } else if (wx === 'dust') {
    // пылевые вихри Марса
    for (let i = 0; i < 2; i++) {
      // вдали — тонкие изогнутые столбы пыли (у настоящих вихрей Марса высота до нескольких км при ширине ~100 м)
      const x = ((i * 0.55 + now * 0.000015) % 1.2 - 0.1) * w, base = horizonY + 14, H = 70 + 20 * i;
      const g = ctx.createLinearGradient(x, base, x, base - H);
      g.addColorStop(0, 'rgba(150,95,55,0.30)'); g.addColorStop(0.7, 'rgba(160,105,60,0.14)'); g.addColorStop(1, 'rgba(160,105,60,0)');
      ctx.fillStyle = g;
      const sway = Math.sin(now * 0.003 + i) * 5;
      ctx.beginPath(); ctx.moveTo(x - 1.5, base); ctx.lineTo(x + 1.5, base);
      ctx.quadraticCurveTo(x + 4 + sway * 0.5, base - H * 0.5, x + 7 + sway, base - H);
      ctx.lineTo(x - 3 + sway, base - H);
      ctx.quadraticCurveTo(x - 2 + sway * 0.5, base - H * 0.5, x - 1.5, base); ctx.closePath(); ctx.fill();
    }
  } else if (wx === 'sulfuric') {
    ctx.strokeStyle = 'rgba(253,224,71,0.14)'; ctx.lineWidth = 1;
    for (let i = 0; i < 28; i++) { const x = (i * 73 + now * 0.12) % w, y = (i * 47 + now * 0.35) % (horizonY * 0.85); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 18); ctx.stroke(); }
    if (Math.sin(now * 0.007) > 0.94) {
      const lx = (Math.floor(now * 0.01) * 193) % (w * 0.7) + w * 0.15;
      ctx.strokeStyle = '#fef08a'; ctx.shadowColor = '#facc15'; ctx.shadowBlur = 15; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx - 14, horizonY * 0.25); ctx.lineTo(lx + 10, horizonY * 0.45); ctx.lineTo(lx - 8, horizonY * 0.75); ctx.stroke();
    }
  } else if (wx === 'ash') {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 24; i++) {
      const x = (i * 83 + Math.sin(now * 0.002 + i) * 25) % w, y = h - ((now * 0.06 + i * 37) % (h * 0.65));
      ctx.fillStyle = i % 2 ? 'rgba(239,68,68,0.65)' : 'rgba(251,146,60,0.75)'; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- подпись ----------
function drawCaption(ctx, w, h, state, sunAngR, moon, locked, optics, climate, planet, Tloc) {
  const star = STAR_CATALOG.find(s => s.id === S.selectedStarId);
  const deg = (r) => (2 * r * 180 / Math.PI);
  const fmt = (d) => d >= 10 ? d.toFixed(0) + '°' : d >= 1 ? d.toFixed(1) + '°' : d >= 0.01 ? d.toFixed(2) + '°' : (d * 3600).toFixed(1) + '″';
  const lines = [`${star ? star.name : 'Звезда'}: угловой диаметр ${fmt(deg(sunAngR))} (Солнце с Земли — 0.53°)`];
  const SKY = { vacuum: 'вакуум — небо чёрное и днём', air: 'рэлеевское рассеяние', ice: 'рэлеевское рассеяние, планета подо льдом', dust: 'пыль: небо цвета ириски, закат голубой', haze: 'органическая дымка (толины)', sulfuric: 'облака серной кислоты: звезды не видно', steam: 'паровая атмосфера: сплошная облачность', thick: 'плотная облачная атмосфера', methane: 'метан поглощает красный свет', vapor: 'пары силикатов над лавой' };
  lines.push(`Небо: ${SKY[optics.kind] || optics.kind} • ${climate.atmo.pBar >= 0.01 ? climate.atmo.pBar.toPrecision(3) + ' бар' : 'p ≈ 0'}`);
  if (moon) lines.push(`Луна: ${fmt(deg(moon.angR))}, ${(moonDistanceKm(state.t) / 1000).toFixed(0)} тыс. км — ${moon.kind === 'total' ? 'полные затмения ещё возможны' : 'полных затмений больше нет, только кольцеобразные'}`);
  if (locked) lines.push('Приливный захват: звезда неподвижна на небе');
  else {
    const day = planet === 'earth' && S.selectedStarId === 'sun' ? earthDayHours(state.t) : Math.abs(rotationHours(planet, state.t, false));
    const dayStr = day > 48 ? `${(day / 24).toFixed(1)} земных суток` : `${day.toFixed(1)} ч`;
    lines.push(`${dateLabel(S.dayOfYear)}, широта 50° • сутки: ${dayStr}${Tloc !== null ? ` • местная t ≈ ${Tloc > 0 ? '+' : ''}${Tloc.toFixed(0)} °C` : ''}`);
  }
  ctx.save();
  ctx.font = '11px sans-serif';
  const lh = 15, boxH = lines.length * lh + 8, boxW = Math.min(w - 16, Math.max(...lines.map(l => ctx.measureText(l).width)) + 14);
  ctx.fillStyle = 'rgba(2,6,23,0.55)'; ctx.fillRect(8, h - boxH - 8, boxW, boxH);
  ctx.fillStyle = 'rgba(226,232,240,0.9)';
  lines.forEach((l, i) => ctx.fillText(l, 15, h - boxH - 8 + 16 + i * lh, boxW - 12));
  ctx.restore();
}
