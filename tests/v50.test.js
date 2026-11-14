// Тесты 5.0: GPU-рендер должен безопасно уступать место 2D-пути, а шейдеры — совпадать с моделью на процессоре
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getGL, glInfo } from '../src/gl/glcore.js';
import { drawSphereGL } from '../src/gl/sphereGL.js';
import { drawSkyGL } from '../src/gl/skyGL.js';
import { drawStarDiskGL } from '../src/gl/starGL.js';
import { drawGalaxyGL } from '../src/gl/galaxyGL.js';
import { S } from '../src/state.js';

describe('Запасной путь без WebGL', () => {
  test('Без браузера контекста нет — все GPU-слои возвращают false, а не падают', () => {
    assert.equal(getGL(), null);
    assert.equal(glInfo().ok, false);
    const ctx = {};
    assert.equal(drawSphereGL(ctx, 0, 0, 10, {}, null, {}), false);
    assert.equal(drawSkyGL(ctx, {}), false);
    assert.equal(drawStarDiskGL(ctx, 10, [], 0, 0, 0), false);
    assert.equal(drawGalaxyGL(ctx, 0, 0, 100, 0), false);
  });
  test('Переключатель «⚡ CPU» выключает GPU', () => {
    const prev = S.renderer;
    S.renderer = '2d';
    assert.equal(getGL(), null);
    assert.equal(glInfo().reason, 'выключен');
    S.renderer = prev;
  });
});

describe('Шейдеры повторяют модель процессора', () => {
  const sky = readFileSync(new URL('../src/gl/skyGL.js', import.meta.url), 'utf8');
  const opt = readFileSync(new URL('../src/physics/optics.js', import.meta.url), 'utf8');
  test('Небо: шейдер и эталон skyModel — одна функция Чепмена, тень планеты, озоновый слой на 25 км, ДХГ аэрозоля', () => {
    const model = readFileSync(new URL('../src/physics/skyModel.js', import.meta.url), 'utf8');
    for (const k of ['2.0 * sqrt(1.5707963 * x0) * exp(', 'r * sqrt(max(0.0, 1.0 - mu * mu)) < uR', 'uR + 25.0', 'min(vec4(0.93), g + 0.2)', 'sunT(r + 2.0 * uH, mu']) assert.ok(sky.includes(k), k);
    for (const k of ['2 * Math.sqrt(Math.PI * x0 / 2) * Math.exp(', 'r * Math.sqrt(1 - mu * mu) < P.R', 'P.R + 25', 'Math.min(0.93, g + 0.2)', 'const up = 2 * P.H']) assert.ok(model.includes(k), k);
    assert.ok(opt.includes('0.50572') && opt.includes('6.07995'));
  });
  test('Звезда: потемнение к краю Эддингтона (2 + 3μ)/5 считается в одном месте для обоих путей', () => {
    const star = readFileSync(new URL('../src/render/star.js', import.meta.url), 'utf8');
    assert.ok(star.includes('const I = (2 + 3 * mu) / 5;') && star.includes('limbStops.push'));
  });
});

import { useStar } from './helpers.js';
import { getInterpolatedState } from '../src/model/timeline.js';
import { getPlanetClimate } from '../src/physics/climate.js';
import { atmosphereOptics } from '../src/physics/optics.js';

describe('Срыв и вымерзание атмосфер', () => {
  test('Красный гигант сдувает атмосферу Земли постепенно: ни одного скачка давления больше чем в 3 раза за 5 млн лет', () => {
    useStar(1.0);
    let prev = null, sawPartial = false;
    for (let t = 11.4; t < 12.0; t += 0.005) {
      const c = getPlanetClimate('earth', getInterpolatedState(t));
      if (!c) break;
      const p = c.atmo.pBar;
      if (p > 1 && p < 60) sawPartial = true;
      if (prev) assert.ok(Math.abs(Math.log(p / prev)) < Math.log(3), `t=${t.toFixed(3)}: ${prev} → ${p}`);
      prev = p;
    }
    assert.ok(sawPartial, 'должна быть промежуточная стадия с частично сорванной атмосферой');
  });
  test('Облака редеют вместе с давлением — звезда проступает постепенно', () => {
    useStar(1.0);
    const taus = [11.5, 11.65, 11.72, 11.8].map(t => { const o = atmosphereOptics('earth', getPlanetClimate('earth', getInterpolatedState(t))); return o.cloud ? o.cloud.tau : o.aer && o.kind !== 'vacuum' && o.kind !== 'vapor' ? o.aer.tau : 0; });
    for (let i = 1; i < taus.length; i++) assert.ok(taus[i] <= taus[i - 1] + 1e-9, taus.join(', '));
    assert.ok(taus[0] > 5 && taus[3] === 0);
  });
  test('Без атмосферы над холодной породой (~1200 K) пар силикатов ничтожен — почти вакуум', () => {
    useStar(1.0);
    const c = getPlanetClimate('earth', getInterpolatedState(11.95));
    assert.ok(c.atmo.pBar < 1e-6, `${c.atmo.pBar}`);
  });
  test('Венера у тусклого красного карлика: 92 бар CO₂ вымерзают в сухой лёд', () => {
    useStar('trappist1');
    const c = getPlanetClimate('venus', getInterpolatedState(1));
    assert.ok(c.atmo.collapsed && c.atmo.pBar < 1e-3);
    useStar(1.0);
    const v = getPlanetClimate('venus', getInterpolatedState(4.57));
    assert.ok(!v.atmo.collapsed && Math.abs(v.atmo.pBar - 92) < 1, 'у Солнца Венера своё давление сохраняет');
    assert.ok(!getPlanetClimate('mars', getInterpolatedState(4.57)).atmo.collapsed, 'Марс сегодня теплее точки инея CO₂ при 6 мбар');
  });
});

import { pmodeSpectrum, audioCenter, epsilonOf } from '../src/audio/stellarSound.js';
import { transmissionSpectrum, detectedSpecies, verdict, ozoneRelative, deltaDepthPpm } from '../src/physics/transmission.js';
import { calculatePlanetAtmosphere } from '../src/physics/climate.js';

describe('5.1: звук звезды', () => {
  test('Солнце: радиальная мода n = 21 около 3030 мкГц, моды через Δν, ν_max звучит на 220 Гц', () => {
    const m = pmodeSpectrum(3090, 135.1);
    const r21 = m.find(x => x.n === 21 && x.l === 0);
    assert.ok(Math.abs(r21.nu - 3034) < 15, `${r21.nu}`);
    const r22 = m.find(x => x.n === 22 && x.l === 0);
    assert.ok(Math.abs(r22.nu - r21.nu - 135.1) < 1e-6);
    assert.equal(audioCenter(3090), 220);
    assert.ok(Math.abs(epsilonOf(135.1) - 1.42) < 0.05);
  });
  test('Гигант звучит басом, а соотношения частот мод сохраняются', () => {
    assert.ok(audioCenter(30) < 30);
    const m = pmodeSpectrum(30, 4.0);
    for (const x of m) assert.ok(Math.abs(x.f / audioCenter(30) - x.nu / 30) < 1e-9);
  });
});

describe('5.1: спектр Земли глазами чужого телескопа', () => {
  const look = (t) => { useStar(1.0); const a = calculatePlanetAtmosphere('earth', getInterpolatedState(t)); return detectedSpecies(a.mix, a.pressureBar, 6.3, 11); };
  test('Сегодня видны озон, CO₂ и вода; вывод — кислородная жизнь', () => {
    const s = look(4.57);
    assert.ok(s.O3 && s.CO2 && s.H2O);
    assert.equal(verdict(s).level, 2);
  });
  test('Архей: метан и CO₂ без кислорода; протерозой: O₂/O₃ вместе с CH₄', () => {
    const a = look(1.5); assert.ok(a.CH4 && a.CO2 && !a.O3 && !a.O2); assert.equal(verdict(a).level, 1);
    assert.equal(verdict(look(2.7)).level, 3);
  });
  test('Озоновый слой насыщается: при 1 % нынешнего O₂ — больше четверти нынешнего', () => {
    assert.ok(ozoneRelative(0.0021) > 0.25 && ozoneRelative(0.0021) < 0.5);
    assert.equal(ozoneRelative(0), 0);
  });
  test('Атмосфера Земли добавляет к транзиту доли ppm — нужен телескоп масштаба JWST и много транзитов', () => {
    const ppm = deltaDepthPpm(20, 1, 1);
    assert.ok(ppm > 0.3 && ppm < 1.0, `${ppm}`);
    const sp = transmissionSpectrum({ CO2: 0.95, N2: 0.05 }, 0.006, 11, 0);
    assert.ok(sp.z.length === sp.lam.length && Math.max(...sp.z) > 0);
  });
});

import { buildSkyParams, skySpectral, chapman, spectrumToRGB } from '../src/physics/skyModel.js';
import { blackbodyRGB } from '../src/physics/optics.js';

describe('5.2: спектральное небо в сферической атмосфере', () => {
  const D = Math.PI / 180;
  const earthP = () => {
    useStar(1.0);
    const o = atmosphereOptics('earth', getPlanetClimate('earth', getInterpolatedState(4.57)));
    return buildSkyParams('earth', o, { starT: 5772, F: blackbodyRGB(5772), Hgas: 8 });
  };
  test('Белый свет: спектр Солнца даёт нейтральный белый', () => {
    const P = earthP();
    const c = spectrumToRGB(P.F);
    assert.ok(Math.abs(c[0] / c[2] - 1) < 0.02 && Math.abs(c[1] / c[2] - 1) < 0.02, c.join(','));
  });
  test('Функция Чепмена: в зените — 1 вертикальная толща, у горизонта Земли ≈ 38 (как у Кастена — Янга)', () => {
    assert.ok(Math.abs(chapman(6371 / 8, 0, 1) - 1) < 0.05);
    const ch = chapman(6371 / 8, 0, 0);
    assert.ok(ch > 30 && ch < 45, `${ch}`);
  });
  test('Полдень: зенит насыщенно-синий (синего втрое больше красного), горизонт светлее и белее', () => {
    const P = earthP();
    const z = skySpectral(P, Math.PI / 2, 60 * D, Math.sin(60 * D));
    const hz = skySpectral(P, 2 * D, 60 * D, Math.cos(2 * D) * Math.cos(60 * D) + Math.sin(2 * D) * Math.sin(60 * D));
    assert.ok(z[2] / z[0] > 2.5, z.join(','));
    assert.ok(hz[1] > z[1] * 2 && hz[2] / hz[0] < z[2] / z[0]);
  });
  test('Закат: у горизонта со стороны звезды оранжевый (красного больше синего в 3+ раза)', () => {
    const P = earthP();
    const c = skySpectral(P, 2 * D, 2 * D, Math.cos(0));
    assert.ok(c[0] / c[2] > 3, c.join(','));
  });
  test('Тень Земли и пояс Венеры: после заката напротив звезды внизу синеватая тень, выше — розовая полоса', () => {
    const P = earthP();
    const at = (e) => { const h = e * D, s = -1 * D; return skySpectral(P, h, s, -Math.cos(h) * Math.cos(s) + Math.sin(h) * Math.sin(s)); };
    const low = at(1), belt = at(5), high = at(25);
    assert.ok(low[0] / low[2] < 0.6, 'тень — синеватая');
    assert.ok(belt[0] / belt[2] > 1.2, 'пояс — розовый');
    assert.ok(high[0] / high[2] < 0.7, 'выше — снова голубое небо');
  });
  test('Ночь: при звезде на 18° под горизонтом небо в 10⁵ раз темнее дневного', () => {
    const P = earthP();
    const day = skySpectral(P, Math.PI / 2, 60 * D, Math.sin(60 * D))[1];
    const night = skySpectral(P, Math.PI / 2, -18 * D, Math.sin(-18 * D))[1];
    assert.ok(night < day * 1e-5, `${night} vs ${day}`);
  });
});
