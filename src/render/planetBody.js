// Тело планеты в виде «Орбита»: текстуры из климата и карты эпохи + попиксельная сфера + вращение с реальной длиной суток.
// Текстуры перестраиваются не чаще раза в 0.3 с (при прокрутке времени), между перестройками показывается последняя.
import { S } from '../state.js';
import { blackbodyRGB } from '../physics/optics.js';
import { OBLIQUITY, rotationHours } from '../physics/rotation.js';
import { getCustomExo } from '../model/exoplanets.js';
import { buildCloudTexture, buildPlanetTexture } from './planetTextures.js';
import { drawSphere } from './sphere.js';

let cur = { key: '', tex: null, clouds: null, built: 0 };

function lookKey(planet, look, t) {
  const q = (x, s) => Math.round((x || 0) / s);
  const epoch = planet === 'earth' && S.selectedStarId === 'sun' ? Math.round(t * 400) : 0;
  return [planet, S.selectedStarId, epoch, q(look.iceLat, 0.03), q(look.vegetation, 0.1), q(look.oceanCoverage, 0.05), q(look.cloudCover, 0.05), q(look.glow, 0.1), look.frozenOcean ? 1 : 0, look.land.map(Math.round).join('.'), civilization(planet, t) ? 1 : 0].join('|');
}

// Огни городов — только в эпоху человечества (Земля у Солнца, ±100 млн лет от «сейчас» с затуханием)
export function civilization(planet, t) {
  return planet === 'earth' && S.selectedStarId === 'sun' && !S.isDeepTime && t >= 4.5 && t <= 4.7;
}

export function drawPlanetBody(ctx, cx, cy, R, planet, look, state, now, shadow, light) {
  const key = lookKey(planet, look, state.t);
  const t0 = performance.now();
  if (key !== cur.key && (!cur.tex || t0 - cur.built > 300)) {
    const real = planet === 'earth' && S.selectedStarId === 'sun';
    cur = {
      key, built: t0,
      tex: buildPlanetTexture(planet, look, state.t, { realEarth: real, cities: civilization(planet, state.t) }),
      clouds: look.cloudCover > 0.02 ? buildCloudTexture(look, planet.length) : null
    };
  }
  const exo = getCustomExo(planet);
  const hours = Math.abs(rotationHours(planet, state.t, S.selectedStarId === 'sun')) || 24;
  // Вращение показано ускоренно: 24-часовые сутки — один оборот за ~40 с; медленные миры крутятся пропорционально медленнее
  const spin = (now / 40000) * (24 / hours) * Math.sign(rotationHours(planet, state.t) || 1);
  const sr = blackbodyRGB(state.temp);
  const lightsK = civilization(planet, state.t) ? Math.max(0, 1 - Math.abs(state.t - 4.6) / 0.1) : 0;
  const gl = drawSphere(ctx, cx, cy, R, cur.tex, cur.clouds, {
    tilt: exo ? 15 : (OBLIQUITY[planet] ?? 0) % 180 > 90 ? 180 - (OBLIQUITY[planet] % 180) : (OBLIQUITY[planet] ?? 0),
    spin, cloudSpin: spin * 1.08 + now / 900000,
    starRgb: sr, cloudRgb: look.cloudRgb, nightLights: lightsK, shadow, light,
    ambient: look.glow > 0.05 ? 0.05 : 0.025,
    maxRes: S.lowQuality ? 220 : 340,
    atmoRgb: look.atmoRgb, atmoDensity: look.atmoDensity, time: now, cloudCover: look.cloudCover
  });
  return { hours, gl };
}
