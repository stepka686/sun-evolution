// Тесты оптики неба, Луны и внешнего вида планет (вид с поверхности и с орбиты)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar } from './helpers.js';
import { S } from '../src/state.js';
import { getInterpolatedState } from '../src/model/timeline.js';
import { getPlanetDistanceAU } from '../src/physics/orbits.js';
import * as O from '../src/physics/optics.js';
import * as M from '../src/physics/moon.js';

const D2R = Math.PI / 180;
const scene = (star, t, planet) => {
  useStar(star); S.currentPlanet = planet;
  const st = getInterpolatedState(t, { static: true });
  const so = O.surfaceOpticsFor(planet, st);
  const F = O.blackbodyRGB(st.temp).map(x => x * so.climate.S / 1361);
  return { st, so, F, sky: (h, hs, cosG) => O.skyRadiance(F, so.optics, h, hs, cosG) };
};
const blueness = (c) => c[2] / c[0];

describe('Оптика неба', () => {
  test('Спектр звезды: Солнце почти белое, красный карлик красный, горячая звезда голубая', () => {
    const sun = O.blackbodyRGB(5772), m = O.blackbodyRGB(3000), b = O.blackbodyRGB(20000);
    assert.ok(Math.min(...sun) > 0.75 && sun[0] === 1);   // Солнце тёпло-белое (R — максимум)
    assert.ok(m[0] === 1 && m[2] < 0.4);
    assert.ok(b[2] === 1 && b[0] < 0.75);
  });

  test('Закон Рэлея: небо Земли синее, а солнце у горизонта краснеет', () => {
    const { sky, so, F } = scene('sun', 4.6, 'earth');
    assert.ok(blueness(sky(Math.PI / 2, 40 * D2R, Math.sin(40 * D2R))) > 1.5);
    const high = O.directLight(F, so.optics, 60 * D2R), low = O.directLight(F, so.optics, 2 * D2R);
    assert.ok(blueness(low) < 0.6 * blueness(high));
  });

  test('Сумерки: зенит остаётся синим, горизонт у солнца — жёлто-оранжевый (озон + длинный путь)', () => {
    const { sky } = scene('sun', 4.6, 'earth');
    const zen = sky(Math.PI / 2, -4 * D2R, Math.sin(-4 * D2R));
    const glow = sky(2 * D2R, -4 * D2R, Math.cos(6 * D2R));
    assert.ok(blueness(zen) > 1.2, `зенит ${zen}`);
    assert.ok(blueness(glow) < 1, `закат ${glow}`);
  });

  test('Марс: днём небо цвета ириски, у заходящего солнца — голубое (пыль рассеивает синий вперёд)', () => {
    const { sky, so } = scene('sun', 4.6, 'mars');
    assert.equal(so.optics.kind, 'dust');
    assert.ok(blueness(sky(Math.PI / 2, 40 * D2R, Math.sin(40 * D2R))) < 0.8);
    assert.ok(blueness(sky(3 * D2R, 2 * D2R, Math.cos(1 * D2R))) > 1);
  });

  test('Безатмосферные тела: чёрное небо днём', () => {
    const { sky, so } = scene('sun', 4.6, 'mercury');
    assert.equal(so.optics.kind, 'vacuum');
    assert.ok(Math.max(...sky(Math.PI / 2, 40 * D2R, 0.6)) === 0);
  });

  test('Венера: звезды не видно, у поверхности ~1–5% света, свет оранжевый', () => {
    const { so, F } = scene('sun', 4.6, 'venus');
    assert.equal(so.optics.kind, 'sulfuric');
    assert.ok(O.luminance(O.directLight(F, so.optics, 60 * D2R)) < 1e-6);
    const d = O.diffuseUnderClouds(F, so.optics, 60 * D2R);
    const frac = O.luminance(d) / O.luminance(F);
    assert.ok(frac > 0.005 && frac < 0.06, `${frac}`);
    assert.ok(d[0] > 3 * d[2]);
  });

  test('Поверхность из климата: океан и растительность сегодня, лёд в «снежке», пар при убегающем парнике', () => {
    assert.ok(scene('sun', 4.6, 'earth').so.surface.ocean === 1 && scene('sun', 4.6, 'earth').so.surface.vegetation > 0.5);
    assert.equal(scene('sun', 2.3, 'earth').so.surface.ice, 1);
    assert.equal(scene('sun', 6.4, 'earth').so.surface.weather, 'steam');
  });
});

describe('Луна', () => {
  test('Сегодня 60.3 R⊕; в прошлом ближе (ритмиты: 58.2 R⊕ 620 млн лет назад), в будущем дальше', () => {
    assert.ok(Math.abs(M.moonDistanceRE(4.57) - 60.27) < 0.01);
    assert.ok(Math.abs(M.moonDistanceRE(3.95) - 58.16) < 0.01);
    assert.ok(M.moonDistanceRE(2) < M.moonDistanceRE(4) && M.moonDistanceRE(6) > 60.27);
  });

  test('Скорость удаления сейчас — 3.8 см/год', () => {
    const dt = 0.001;   // млрд лет = 1 млн лет
    const rate = (M.moonDistanceKm(4.57 + dt) - M.moonDistanceKm(4.57)) * 1e5 / (dt * 1e9);
    assert.ok(Math.abs(rate - 3.83) < 0.1, `${rate} см/год`);
  });

  test('Полные затмения возможны сейчас и закончатся через 0.25–0.7 млрд лет', () => {
    useStar('sun');
    const kind = (t) => { const st = getInterpolatedState(t, { static: true }); return M.eclipseKind(t, st.r, getPlanetDistanceAU('earth', st)); };
    assert.equal(kind(4.57), 'total');
    let tEnd = null;
    for (let t = 4.57; t < 6; t += 0.01) if (kind(t) === 'annular') { tEnd = t; break; }
    assert.ok(tEnd && tEnd - 4.57 > 0.25 && tEnd - 4.57 < 0.7, `${tEnd}`);
  });
});
