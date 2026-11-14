// Цвет звезды по температуре и CSS-цвета
import { rgb, rgba } from '../util/color.js';
import { lerp } from '../util/math.js';
import { blackbodyCss } from '../physics/optics.js';

export const COLOR_STOPS = [
  { temp: 60,    core: [55, 10, 5],     outer: [20, 2, 0],     coronaAlpha: 0.05 },
  { temp: 1500,  core: [140, 20, 0],    outer: [70, 8, 0],     coronaAlpha: 0.12 },
  { temp: 2800,  core: [255, 45, 0],    outer: [140, 15, 0],   coronaAlpha: 0.22 },
  { temp: 3500,  core: [255, 95, 20],   outer: [190, 45, 0],   coronaAlpha: 0.28 },
  { temp: 4400,  core: [255, 150, 45],  outer: [225, 90, 10],  coronaAlpha: 0.32 },
  { temp: 5200,  core: [255, 205, 100], outer: [245, 145, 25], coronaAlpha: 0.35 },
  { temp: 5778,  core: [255, 245, 215], outer: [251, 192, 45], coronaAlpha: 0.40 },
  { temp: 7000,  core: [255, 255, 255], outer: [220, 235, 255],coronaAlpha: 0.42 },
  { temp: 12000, core: [240, 248, 255], outer: [144, 202, 249],coronaAlpha: 0.45 },
  { temp: 35000, core: [230, 242, 255], outer: [41, 121, 255],  coronaAlpha: 0.50 }
];

// Ядро диска — настоящий цвет чёрного тела (CIE 1931 → sRGB, physics/optics.js); край — более холодный слой
// (потемнение к краю). У коричневых карликов свечение ещё и тусклое. Таблица выше задаёт только силу короны.
export function getStarColor(temp) {
  const t = Math.max(60, Math.min(35000, Number(temp) || 5778));
  let i = 0;
  while (i < COLOR_STOPS.length - 2 && COLOR_STOPS[i + 1].temp <= t) i++;
  const s0 = COLOR_STOPS[i], s1 = COLOR_STOPS[i + 1];
  const coronaA = lerp(s0.coronaAlpha, s1.coronaAlpha, (t - s0.temp) / (s1.temp - s0.temp));
  const dim = t < 2000 ? Math.max(0.2, t / 2000) : 1;
  const core = blackbodyCss(Math.max(800, t)).map(v => Math.round(v * dim));
  const outer = blackbodyCss(Math.max(800, t * 0.82)).map(v => Math.round(v * dim * 0.85));
  return {
    coreRGB: core, outerRGB: outer,
    core: rgb(core[0], core[1], core[2]),
    outer: rgb(outer[0], outer[1], outer[2]),
    corona: rgba(outer[0], outer[1], outer[2], coronaA)
  };
}
