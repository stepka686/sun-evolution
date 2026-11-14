// Тесты эволюции орбит: потеря массы, приливы Зана, поглощение, мгновенная потеря массы
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { useStar } from './helpers.js';
import { S } from '../src/state.js';
import { integrateOrbit, orbitAt, tidalDecayRate, PLANET_MASS_EARTH } from '../src/physics/tides.js';
import { getPlanetFate, getPlanetDistanceAU, invalidateEngulfCache } from '../src/physics/orbits.js';
import { getInterpolatedState } from '../src/model/timeline.js';

// Искусственный трек: звезда, медленно теряющая массу без приливов (горячая — оболочка лучистая)
const track = (pts) => pts.map(([t, m, r = 1, l = 1, temp = 9000, extra = {}]) => ({ t, mass: m, r, l, temp, ...extra }));

describe('Физика орбит (чистые функции)', () => {
  test('Медленная потеря массы: a·M = const', () => {
    const o = integrateOrbit(track([[0, 1.0], [5, 0.8], [10, 0.5]]), 1.0, 1);
    assert.ok(Math.abs(orbitAt(o, 10) - 2.0) < 1e-6, `a=${orbitAt(o, 10)}`);
    assert.ok(Math.abs(orbitAt(o, 5) - 1.25) < 1e-6);
  });

  test('Мгновенная потеря массы меньше половины: a₂ = a·M₂ / (2M₂ − M)', () => {
    const o = integrateOrbit(track([[0, 10], [1, 10], [1.1, 6, 1e-5, 1, 1e6, { noSB: true }]]), 20, 1, { blastRadiusAU: 0 });
    assert.equal(o.fate.type, 'survived');
    assert.ok(Math.abs(orbitAt(o, 1.1) - 20 * 6 / 2) < 1e-6);
  });

  test('Мгновенная потеря больше половины массы — планета улетает', () => {
    const o = integrateOrbit(track([[0, 10], [1, 10], [1.1, 4, 1e-5, 1, 1e6, { noSB: true }]]), 20, 1, { blastRadiusAU: 0 });
    assert.equal(o.fate.type, 'ejected');
  });

  test('Прилив Зана: γ ∝ (R★/a)⁸ при насыщенной вязкости', () => {
    const star = { mass: 0.8, r: 100, l: 1000, temp: 3500, coreMass: 0.4 };
    const g1 = tidalDecayRate(2.0, star, 1), g2 = tidalDecayRate(4.0, star, 1);
    // f насыщена (P ≫ τ_c) → отношение ровно 2⁸
    assert.ok(Math.abs(g1 / g2 - 256) / 256 < 1e-9, `${g1 / g2}`);
  });

  test('У горячей звезды с лучистой оболочкой равновесного прилива нет', () => {
    assert.equal(tidalDecayRate(1, { mass: 3, r: 50, l: 2000, temp: 9000, coreMass: 0.5 }, 1), 0);
  });

  test('Прилив пропорционален массе планеты: Юпитер падает быстрее Земли', () => {
    const star = { mass: 0.8, r: 100, l: 1000, temp: 3500, coreMass: 0.4 };
    assert.ok(tidalDecayRate(1.5, star, PLANET_MASS_EARTH.jupiter) > 300 * tidalDecayRate(1.5, star, 1));
  });
});

describe('Судьба планет Солнечной системы', () => {
  const fateAt = (planet, k) => { useStar('sun'); S.tideFactor = k; invalidateEngulfCache(); const f = getPlanetFate(planet); S.tideFactor = 1; invalidateEngulfCache(); return f; };

  test('Земля поглощается на RGB при любой правдоподобной силе приливов (Schröder & Smith 2008)', () => {
    for (const k of [0.3, 1, 3]) {
      const f = fateAt('earth', k);
      assert.equal(f.type, 'engulfed', `×${k}`);
      assert.ok(f.t > 12.0 && f.t < 12.2, `×${k}: t=${f.t}`);
    }
  });

  test('Перед гибелью орбита Земли успевает расшириться из-за потери массы Солнцем', () => {
    useStar('sun');
    assert.ok(getPlanetDistanceAU('earth', getInterpolatedState(12.0)) > 1.1);
  });

  test('Порядок гибели: Меркурий → Венера → Земля', () => {
    const m = fateAt('mercury', 1).t, v = fateAt('venus', 1).t, e = fateAt('earth', 1).t;
    assert.ok(m < v && v < e, `${m} ${v} ${e}`);
  });

  test('Марс на грани: выживает при стандартных приливах, гибнет при усиленных', () => {
    assert.equal(fateAt('mars', 1).type, 'survived');
    assert.equal(fateAt('mars', 3).type, 'engulfed');
  });

  test('Юпитер и внешние планеты выживают и уходят на ~1/0.54 своих орбит', () => {
    useStar('sun');
    for (const p of ['jupiter', 'saturn', 'neptune']) assert.equal(getPlanetFate(p).type, 'survived', p);
  });

  test('До начала главной последовательности планеты на исходных орбитах', () => {
    useStar(16.5);
    assert.ok(Math.abs(getPlanetDistanceAU('mercury', getInterpolatedState(-0.0001)) - 0.387) < 0.004);
  });
});

describe('Массивные звёзды', () => {
  test('Сверхновая II: близкие планеты сметены, далёкие улетают (звезда теряет > половины массы)', () => {
    const { stages } = useStar(11.4);
    assert.equal(getPlanetFate('europa').type, 'engulfed');
    assert.equal(getPlanetFate('neptune').type, 'ejected');
    const end = getInterpolatedState(stages[stages.length - 1].t);
    assert.equal(getPlanetDistanceAU('neptune', end), 0);
  });

  test('Парно-нестабильная сверхновая (R136a1): звезда разлетается целиком — близкие планеты сметены, дальние улетают', () => {
    useStar('r136a1');
    assert.equal(getPlanetFate('saturn').type, 'blast');
    assert.equal(getPlanetFate('neptune').type, 'ejected');
  });

  test('Чёрная дыра больше не «съедает» систему мгновенно: судьба определяется потерей массы', () => {
    useStar(60);
    const f = getPlanetFate('pluto');
    assert.ok(['ejected', 'survived'].includes(f.type), f.type);
  });
});
